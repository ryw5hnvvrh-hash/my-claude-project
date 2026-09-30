"""영상 한 개를 받아 자동 편집하는 전체 흐름."""
import json
import os
from dataclasses import asdict, dataclass

from . import analyze, media, render, sfx, timeline, transcribe
from .draft import build_draft, default_draft_dir


@dataclass
class Options:
    mode: str = "auto"            # auto / talk / asmr
    model: str = "small"          # Whisper 모델 크기: tiny, base, small, medium, large-v3
    language: str = "ko"
    min_silence: float = 0.6
    padding: float = 0.15
    subtitles: bool = True
    sfx: bool = True
    sfx_dir: str = ""
    draft_dir: str = ""
    draft_name: str = ""
    out_dir: str = "output"
    preview: bool = False
    draft: bool = True            # PC 캡컷 초안 만들기 (아이패드 전용 서버에서는 끔)
    burn_subtitles: bool = True   # 완성 mp4에 자막을 입히기
    retranscribe: bool = False
    max_chars: int = 16
    on_log: object = None         # 진행 메시지를 받을 함수 (웹페이지용)


def log(msg: str) -> None:
    print(f"▶ {msg}", flush=True)


def _subtract(ranges: list, holes: list) -> list:
    """ranges에서 holes와 겹치는 부분을 뺀다."""
    out = []
    for a, b in ranges:
        pieces = [(a, b)]
        for ha, hb in holes:
            nxt = []
            for pa, pb in pieces:
                if hb <= pa or ha >= pb:
                    nxt.append((pa, pb))
                    continue
                if ha > pa:
                    nxt.append((pa, ha))
                if hb < pb:
                    nxt.append((hb, pb))
            pieces = nxt
        out += [(pa, pb) for pa, pb in pieces if pb - pa > 0.05]
    return out


def _load_or_transcribe(video: str, cache: str, opt: Options, log=log) -> transcribe.Transcript:
    if os.path.exists(cache) and not opt.retranscribe:
        log(f"저장해 둔 음성 인식 결과를 씁니다 ({os.path.basename(cache)})")
        with open(cache, encoding="utf-8") as f:
            data = json.load(f)
        return transcribe.Transcript([transcribe.Word(w["start"], w["end"], w["text"]) for w in data["words"]],
                                     data.get("language", opt.language))
    log(f"음성 인식 중... (Whisper {opt.model}, 처음엔 모델 다운로드로 시간이 걸려요)")
    tr = transcribe.transcribe(video, model_size=opt.model, language=opt.language)
    with open(cache, "w", encoding="utf-8") as f:
        json.dump({"language": tr.language,
                   "words": [{"start": w.start, "end": w.end, "text": w.text} for w in tr.words]},
                  f, ensure_ascii=False, indent=1)
    return tr


def process(video: str, opt: Options) -> dict:
    log = opt.on_log or globals()["log"]
    video = os.path.abspath(video)
    stem = media.safe_stem(video)
    out_dir = os.path.abspath(os.path.join(opt.out_dir, stem))
    os.makedirs(out_dir, exist_ok=True)

    info = media.probe(video)
    log(f"영상 정보: {info.width}x{info.height}, {info.fps:.2f}fps, {info.duration:.1f}초")
    if not info.has_audio:
        raise ValueError("소리가 없는 영상이라 무음 컷/자막을 만들 수 없어요.")

    # 1) 음성 인식 → 말이 얼마나 있는지로 모드 결정
    tr = _load_or_transcribe(video, os.path.join(out_dir, "words.json"), opt, log)
    words = tr.words
    mode = opt.mode if opt.mode != "auto" else analyze.decide_mode(words, info.duration)
    ratio = analyze.speech_ratio(words, info.duration)
    log(f"말하는 비율 {ratio:.0%} → {'ASMR(환경음) 모드' if mode == 'asmr' else '말하는 영상 모드'}")

    # 2) 잘라낼 곳: 버벅임(추임새/반복) + 무음
    transcribe.mark_disfluencies(words)
    cuts = transcribe.disfluency_cuts(words)

    audio = media.load_audio(video)
    if mode == "asmr":
        # 환경음이 곧 콘텐츠라 '거의 완전한 무음'(-55dB 미만, 1.5초 이상)만 자른다
        silence = analyze.SilenceSettings(min_silence=1.5, padding=0.3, threshold_db=-55.0)
    else:
        silence = analyze.SilenceSettings(min_silence=opt.min_silence, padding=opt.padding)
    silences = analyze.find_silences(audio, silence)
    # 작게 말한 단어가 무음으로 잘리지 않도록 보호
    spoken = [(w.start - 0.08, w.end + 0.08) for w in words if not w.removed]
    silences = _subtract(silences, spoken)
    cuts += silences

    keeps = timeline.keep_ranges(info.duration, cuts, info.fps)
    if not keeps:
        raise ValueError("남길 구간이 없어요. --min-silence 값을 늘려 보세요.")
    remap = timeline.Remapper(keeps)
    n_filler = sum(1 for w in words if w.removed == "filler")
    n_repeat = sum(1 for w in words if w.removed == "repeat")
    log(f"무음 {len(silences)}곳, 추임새 {n_filler}개, 반복/더듬 {n_repeat}개 잘라냄 "
        f"→ {info.duration:.1f}초 → {remap.total:.1f}초")

    # 3) 소리 다듬기
    log("소리 다듬는 중 (음량 맞춤" + (", 작은 소리 키우기)" if mode == "asmr" else ", 잡음 줄이기)"))
    enhanced = media.enhance_audio(video, os.path.join(out_dir, "audio_enhanced.wav"), mode)

    # 4) 자막 (편집본 시간으로 변환)
    cues = []
    if opt.subtitles:
        for a, b, text in transcribe.build_cues(words, max_chars=opt.max_chars):
            r = remap.map_range(a, b)
            if r:
                cues.append((r[0], r[1], text))
        # 자막이 너무 빨리 사라지지 않게 다음 자막 직전까지 조금 늘린다
        for i, (a, b, text) in enumerate(cues):
            limit = cues[i + 1][0] if i + 1 < len(cues) else remap.total
            cues[i] = (a, min(max(b + 0.25, a + 0.8), limit), text)
    srt_path = render.write_srt(cues, os.path.join(out_dir, "subtitles.srt"))
    log(f"자막 {len(cues)}줄")

    # 5) 효과음
    sfx_cues = []
    if opt.sfx:
        lib = sfx.SfxLibrary(opt.sfx_dir or os.path.join(os.path.dirname(os.path.dirname(__file__)), "sfx"))
        scenes = media.detect_scene_changes(video)
        sfx_cues = sfx.plan_sfx(mode, scenes, words, remap, remap.total)
        for c in sfx_cues:
            c.path = lib.pick(c.category)
        log(f"효과음 {len(sfx_cues)}개 (화면 전환 {len(scenes)}곳 감지)")

    # 6) 캡컷 초안 (PC 캡컷용)
    draft_path = ""
    if opt.draft:
        draft_dir = opt.draft_dir or default_draft_dir() or os.path.join(os.path.abspath(opt.out_dir), "capcut_drafts")
        draft_name = opt.draft_name or f"자동편집_{stem}"
        draft_path = build_draft(draft_dir=draft_dir, name=draft_name, info=info, keeps=keeps,
                                 enhanced_audio=enhanced, cues=cues, sfx_cues=sfx_cues)
        log(f"캡컷 초안 저장: {draft_path}")

    preview_path = ""
    if opt.preview:
        log("완성 mp4 만드는 중 (자막·효과음 포함)" + (", HDR 색 보정" if info.hdr else "") + "...")
        preview_path = render.render_preview(video=video, enhanced_audio=enhanced, keeps=keeps,
                                             sfx_cues=sfx_cues, srt_path=srt_path, burn_subtitles=opt.burn_subtitles,
                                             out_path=os.path.join(out_dir, f"{stem}_편집완성.mp4"),
                                             hdr=info.hdr, fps=info.fps)
        log(f"완성 영상: {preview_path}")

    report = {
        "video": video,
        "mode": mode,
        "speech_ratio": round(ratio, 3),
        "duration_before": round(info.duration, 2),
        "duration_after": round(remap.total, 2),
        "keeps": [[round(a, 3), round(b, 3)] for a, b in keeps],
        "removed_words": [{"time": round(w.start, 2), "text": w.text, "why": w.removed} for w in words if w.removed],
        "subtitles": [{"start": round(a, 2), "end": round(b, 2), "text": t} for a, b, t in cues],
        "sfx": [{**asdict(c), "time": round(c.time, 2)} for c in sfx_cues],
        "draft": draft_path,
        "preview": preview_path,
    }
    with open(os.path.join(out_dir, "report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    return report
