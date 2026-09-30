"""무음 구간 찾기, 말하는 영상 / ASMR 판별."""
from dataclasses import dataclass

import numpy as np

from .media import SAMPLE_RATE

FRAME = 0.02  # 20ms 단위로 음량을 잰다


def frame_db(audio: np.ndarray, sr: int = SAMPLE_RATE) -> np.ndarray:
    hop = int(sr * FRAME)
    n = len(audio) // hop
    if n == 0:
        return np.array([-100.0])
    frames = audio[: n * hop].reshape(n, hop)
    rms = np.sqrt(np.mean(frames ** 2, axis=1) + 1e-12)
    return 20 * np.log10(rms + 1e-12)


@dataclass
class SilenceSettings:
    min_silence: float = 0.6   # 이보다 긴 무음만 자른다
    padding: float = 0.15      # 말 앞뒤로 남겨두는 여유
    threshold_db: float = None  # None이면 영상마다 자동으로 정한다


def auto_threshold(db: np.ndarray) -> float:
    """배경 소음 수준(하위 10%)보다 10dB 큰 소리를 '소리 있음'으로 본다."""
    floor = float(np.percentile(db, 10))
    peak = float(np.percentile(db, 95))
    # 배경과 말소리 차이가 작으면 중간값으로
    return min(floor + 10.0, (floor + peak) / 2)


def find_silences(audio: np.ndarray, s: SilenceSettings, sr: int = SAMPLE_RATE) -> list:
    """(start, end) 초 단위 무음 구간 목록. padding만큼 안쪽으로 줄여서 돌려준다."""
    db = frame_db(audio, sr)
    thr = s.threshold_db if s.threshold_db is not None else auto_threshold(db)
    quiet = db < thr
    total = len(audio) / sr
    silences = []
    i = 0
    n = len(quiet)
    while i < n:
        if not quiet[i]:
            i += 1
            continue
        j = i
        while j < n and quiet[j]:
            j += 1
        start, end = i * FRAME, min(j * FRAME, total)
        if end - start >= s.min_silence:
            # 영상 맨 앞/맨 뒤 무음은 여유 없이 잘라낸다
            a = start if start <= 0 else start + s.padding
            b = end if j >= n else end - s.padding
            if b - a > 0.05:
                silences.append((a, b))
        i = j
    return silences


def speech_ratio(words: list, duration: float) -> float:
    if duration <= 0:
        return 0.0
    spoken = sum(max(0.0, w.end - w.start) for w in words)
    return spoken / duration


def decide_mode(words: list, duration: float) -> str:
    """말이 전체의 15% 미만이면 ASMR(환경음 위주) 영상으로 본다."""
    if len(words) < 5 or speech_ratio(words, duration) < 0.15:
        return "asmr"
    return "talk"
