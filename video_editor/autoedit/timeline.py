"""잘라낼 구간 -> 남길 구간, 원본 시간 -> 편집본 시간 변환."""
from bisect import bisect_right


def merge(ranges: list, join_gap: float = 0.0) -> list:
    out = []
    for a, b in sorted(ranges):
        if out and a <= out[-1][1] + join_gap:
            out[-1] = (out[-1][0], max(out[-1][1], b))
        else:
            out.append((a, b))
    return out


def keep_ranges(duration: float, cuts: list, fps: float, min_keep: float = 0.25) -> list:
    """전체 길이에서 cuts를 빼고, 프레임 단위로 맞춘 남길 구간 목록."""
    frame = 1.0 / fps
    snap = lambda t: round(t / frame) * frame
    cuts = merge([(max(0.0, a), min(duration, b)) for a, b in cuts if b > a])
    keeps = []
    t = 0.0
    for a, b in cuts:
        if a - t >= min_keep:
            keeps.append((t, a))
        t = max(t, b)
    if duration - t >= min_keep:
        keeps.append((t, duration))
    snapped = []
    for a, b in keeps:
        a, b = snap(a), min(snap(b), duration)
        if b - a >= frame:
            snapped.append((a, b))
    return merge(snapped)


class Remapper:
    """원본 영상의 시각을 편집본(잘라낸 뒤) 시각으로 바꾼다."""

    def __init__(self, keeps: list):
        self.keeps = keeps
        self.starts = [a for a, _ in keeps]
        self.offsets = []
        acc = 0.0
        for a, b in keeps:
            self.offsets.append(acc)
            acc += b - a
        self.total = acc

    def map(self, t: float):
        """잘린 구간 안의 시각이면 None."""
        i = bisect_right(self.starts, t) - 1
        if i < 0:
            return None
        a, b = self.keeps[i]
        if t > b:
            return None
        return self.offsets[i] + (t - a)

    def map_range(self, a: float, b: float):
        """구간 [a, b]를 편집본 기준으로 바꾼다(중간이 잘렸으면 앞뒤를 이어 붙인 길이)."""
        ma = self.map(a)
        if ma is None:
            nxt = bisect_right(self.starts, a)
            if nxt >= len(self.keeps) or self.keeps[nxt][0] > b:
                return None
            ma = self.offsets[nxt]
        mb = self.map(b)
        if mb is None:
            i = bisect_right(self.starts, b) - 1
            if i < 0:
                return None
            mb = self.offsets[i] + (self.keeps[i][1] - self.keeps[i][0])
        return (ma, mb) if mb > ma else None
