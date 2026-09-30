"""효과음: 라이브러리 관리 + 어디에 넣을지 정하기."""
import os
import random
import re
import wave
from dataclasses import dataclass

import numpy as np

CATEGORIES = ("whoosh", "pop", "ding", "sparkle", "tap")
AUDIO_EXT = (".wav", ".mp3", ".m4a", ".aac", ".ogg", ".flac")

# 자막(말)에 이 단어가 나오면 해당 효과음을 넣는다
KEYWORD_SFX = [
    (r"완성|짜잔|짠|완료|다 됐|다됐", "ding"),
    (r"선물|예쁘|이쁘|반짝|귀여|영롱", "sparkle"),
    (r"^와$|^와!|대박|헐|^오$|우와", "pop"),
    (r"딸깍|톡|붙이|끼우|달아|걸어", "tap"),
]


@dataclass
class SfxCue:
    time: float       # 편집본 기준 시작 시각(초)
    category: str
    reason: str
    path: str = ""
    volume: float = 0.6


# ---------- 기본 효과음 합성 (라이브러리가 비어 있어도 바로 쓰도록) ----------
SR = 48000


def _env(n, attack, release):
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    r = np.exp(-np.maximum(t - attack, 0) / max(release, 1e-4))
    return a * r


def _synth(category: str) -> np.ndarray:
    rng = np.random.default_rng(7)
    if category == "whoosh":
        n = int(SR * 0.5)
        noise = rng.standard_normal(n)
        # 앞은 저역, 뒤로 갈수록 고역이 열리는 느낌 (이동평균 창 크기를 줄여간다)
        out = np.zeros(n)
        for k, w in enumerate(np.linspace(60, 4, 10).astype(int)):
            seg = slice(k * n // 10, (k + 1) * n // 10)
            out[seg] = np.convolve(noise, np.ones(w) / w, mode="same")[seg]
        env = np.sin(np.linspace(0, np.pi, n)) ** 2
        return out * env * 3.0
    if category == "pop":
        n = int(SR * 0.12)
        t = np.arange(n) / SR
        freq = 900 * np.exp(-t * 30) + 180
        return np.sin(2 * np.pi * np.cumsum(freq) / SR) * _env(n, 0.002, 0.03)
    if category == "ding":
        n = int(SR * 1.0)
        t = np.arange(n) / SR
        tone = np.sin(2 * np.pi * 1320 * t) + 0.4 * np.sin(2 * np.pi * 2640 * t) + 0.2 * np.sin(2 * np.pi * 3960 * t)
        return tone * _env(n, 0.003, 0.25) * 0.6
    if category == "sparkle":
        n = int(SR * 0.7)
        out = np.zeros(n)
        for k, f in enumerate([2093, 2637, 3136, 4186, 3520]):
            start = int(k * 0.08 * SR)
            m = n - start
            t = np.arange(m) / SR
            out[start:] += np.sin(2 * np.pi * f * t) * _env(m, 0.002, 0.08)
        return out * 0.4
    if category == "tap":
        n = int(SR * 0.08)
        t = np.arange(n) / SR
        click = rng.standard_normal(n) * _env(n, 0.0005, 0.006)
        body = np.sin(2 * np.pi * 220 * t) * _env(n, 0.001, 0.02)
        return click * 0.5 + body
    raise ValueError(category)


def _write_wav(path: str, data: np.ndarray) -> None:
    data = data / (np.max(np.abs(data)) + 1e-9) * 0.8
    pcm = (data * 32767).astype(np.int16)
    stereo = np.repeat(pcm[:, None], 2, axis=1)
    with wave.open(path, "wb") as f:
        f.setnchannels(2)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes(stereo.tobytes())


class SfxLibrary:
    """sfx/<카테고리>/ 폴더의 소리를 쓴다. 폴더가 비어 있으면 기본 합성음을 쓴다."""

    def __init__(self, root: str, seed: int = 0):
        self.root = root
        self.rng = random.Random(seed)
        self.files = {}
        for cat in CATEGORIES:
            folder = os.path.join(root, cat)
            found = []
            if os.path.isdir(folder):
                found = [os.path.join(folder, f) for f in sorted(os.listdir(folder))
                         if f.lower().endswith(AUDIO_EXT)]
            if not found:
                found = [self._basic(cat)]
            self.files[cat] = [os.path.abspath(p) for p in found]

    def _basic(self, cat: str) -> str:
        folder = os.path.join(self.root, "_basic")
        os.makedirs(folder, exist_ok=True)
        path = os.path.join(folder, f"{cat}.wav")
        if not os.path.exists(path):
            _write_wav(path, _synth(cat))
        return path

    def pick(self, cat: str) -> str:
        return self.rng.choice(self.files[cat])


def plan_sfx(mode: str, scene_times: list, words: list, remap, total: float,
             min_gap: float = 2.5, per_minute: int = 10) -> list:
    """편집본 기준으로 효과음 위치를 정한다.

    - 시작: sparkle 한 번
    - 화면이 크게 바뀌는 곳: whoosh (전환 직전부터 들리도록 0.2초 당김)
    - 말에 특정 단어가 나오면: ding / sparkle / pop / tap
    ASMR은 소리 자체가 콘텐츠라 효과음을 적고 작게 넣는다.
    """
    vol = 0.35 if mode == "asmr" else 0.6
    candidates = [SfxCue(0.05, "sparkle", "영상 시작", volume=vol)]

    for t in scene_times:
        mt = remap.map(t)
        if mt is not None and mt > 0.5:
            candidates.append(SfxCue(max(0.0, mt - 0.2), "whoosh", f"화면 전환({t:.1f}s)", volume=vol))

    if mode != "asmr":
        for w in words:
            if w.removed:
                continue
            for pattern, cat in KEYWORD_SFX:
                if re.search(pattern, w.norm):
                    mt = remap.map(w.start)
                    if mt is not None:
                        candidates.append(SfxCue(mt, cat, f"'{w.text}'", volume=vol))
                    break

    # 키워드 효과음을 화면 전환보다 우선, 너무 촘촘하지 않게 거른다
    priority = {"ding": 0, "sparkle": 1, "pop": 2, "tap": 3, "whoosh": 4}
    candidates.sort(key=lambda c: (priority[c.category], c.time))
    chosen = []
    budget = max(4, int(per_minute * max(total, 1) / 60))
    for c in candidates:
        if c.time >= total - 0.3:
            continue
        if all(abs(c.time - o.time) >= min_gap for o in chosen):
            chosen.append(c)
        if len(chosen) >= budget:
            break
    return sorted(chosen, key=lambda c: c.time)
