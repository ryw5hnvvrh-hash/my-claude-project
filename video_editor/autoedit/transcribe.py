"""음성 인식(Whisper) + 버벅임(추임새·반복) 찾기 + 자막 만들기."""
import re
from dataclasses import dataclass, field

# 확실한 추임새: 어디서 나와도 자른다
SURE_FILLERS = {"음", "어", "엄", "으", "흠", "음음", "어어", "으음", "어음", "음..", "어.."}
# 뜻이 있을 수도 있는 말: 뒤에 잠깐 멈춤이 있을 때만 추임새로 본다 ("그... 이거", "아... 맞다")
SOFT_FILLERS = {"아", "에", "그", "저", "그니까", "약간"}
SOFT_PAUSE = 0.3

# 조용한 구간에서 Whisper가 자주 지어내는 문장(한국어 방송 자막 학습 흔적)
HALLUCINATIONS = [
    "시청해주셔서 감사합니다", "시청해 주셔서 감사합니다", "구독과 좋아요", "구독 좋아요",
    "MBC 뉴스", "KBS 뉴스", "SBS 뉴스", "자막 제공", "자막 by", "한글자막", "다음 영상에서 만나요",
]

# Whisper가 추임새를 지우지 않고 받아 적도록 유도하는 힌트
INITIAL_PROMPT = "음, 어, 그러니까 이거는 음 제가 직접 만든 거예요."


@dataclass
class Word:
    start: float
    end: float
    text: str
    removed: str = ""  # 잘린 이유: "filler" / "repeat" / ""

    @property
    def norm(self) -> str:
        return normalize(self.text)


@dataclass
class Transcript:
    words: list = field(default_factory=list)
    language: str = "ko"


def normalize(text: str) -> str:
    return re.sub(r"[\s,.?!…~\-·'\"]+", "", text).lower()


def transcribe(path: str, model_size: str = "small", language: str = "ko", device: str = "auto") -> Transcript:
    from faster_whisper import WhisperModel

    compute = "int8" if device in ("auto", "cpu") else "float16"
    model = WhisperModel(model_size, device=device, compute_type=compute)
    segments, info = model.transcribe(
        path,
        language=language,
        word_timestamps=True,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 400},
        initial_prompt=INITIAL_PROMPT,
        condition_on_previous_text=False,
    )
    words = []
    for seg in segments:
        if seg.no_speech_prob > 0.6 and seg.avg_logprob < -1.0:
            continue
        if any(h.replace(" ", "") in seg.text.replace(" ", "") for h in HALLUCINATIONS):
            continue
        for w in seg.words or []:
            if w.word.strip():
                words.append(Word(float(w.start), float(w.end), w.word.strip()))
    return Transcript(words, info.language)


def mark_disfluencies(words: list) -> None:
    """추임새와 말 반복(버벅임)에 removed 표시를 한다."""
    n = len(words)
    for i, w in enumerate(words):
        nxt = words[i + 1] if i + 1 < n else None
        gap_after = (nxt.start - w.end) if nxt else 1.0
        if w.norm in SURE_FILLERS:
            w.removed = "filler"
        elif w.norm in SOFT_FILLERS and gap_after >= SOFT_PAUSE:
            w.removed = "filler"

    kept = [w for w in words if not w.removed]
    # 같은 말 반복: "이거 이거", "이거 진짜 이거 진짜" -> 앞쪽을 자른다
    for size in (3, 2, 1):
        i = 0
        while i + 2 * size <= len(kept):
            a = kept[i:i + size]
            b = kept[i + size:i + 2 * size]
            if all(not x.removed for x in a + b) and [x.norm for x in a] == [x.norm for x in b] and a[0].norm:
                for x in a:
                    x.removed = "repeat"
                i += size
            else:
                i += 1
    # 말 더듬기: "그, 그러니까" / "이-이거" -> 짧은 앞말이 뒷말의 시작과 같으면 자른다
    kept = [w for w in words if not w.removed]
    for a, b in zip(kept, kept[1:]):
        if 0 < len(a.norm) <= 2 and len(b.norm) > len(a.norm) and b.norm.startswith(a.norm):
            stuttered = a.text.rstrip()[-1:] in ",-…." or (b.start - a.end) >= 0.15
            if stuttered:
                a.removed = "repeat"


def disfluency_cuts(words: list) -> list:
    """잘라낼 (start, end) 구간. 추임새 뒤의 짧은 틈도 같이 없앤다."""
    cuts = []
    for i, w in enumerate(words):
        if not w.removed:
            continue
        end = w.end
        nxt = words[i + 1] if i + 1 < len(words) else None
        if nxt and 0 <= nxt.start - w.end < 1.0:
            end = nxt.start - 0.03
        cuts.append((max(0.0, w.start - 0.02), max(end, w.end)))
    return cuts


def build_cues(words: list, max_chars: int = 16, max_gap: float = 0.6, max_dur: float = 3.5) -> list:
    """남긴 단어들을 자막 한 줄씩 묶는다. (start, end, text) — 원본 영상 기준 시간."""
    cues = []
    line = []

    def flush():
        if line:
            text = " ".join(w.text for w in line)
            text = re.sub(r"[.,]+$", "", text).strip()
            text = re.sub(r"\s*,\s*", " ", text)
            if text:
                cues.append((line[0].start, line[-1].end, text))
            line.clear()

    for w in words:
        if w.removed:
            continue
        if line:
            cur_len = len(" ".join(x.text for x in line))
            if (cur_len + 1 + len(w.text) > max_chars
                    or w.start - line[-1].end > max_gap
                    or w.end - line[0].start > max_dur
                    or line[-1].text[-1:] in ".?!"):
                flush()
        line.append(w)
    flush()
    return cues
