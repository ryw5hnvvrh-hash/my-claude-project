"""pyCapCut으로 캡컷 초안(draft) 만들기."""
import os

import pycapcut as cc
from pycapcut import SEC

US = lambda t: int(round(t * SEC))  # 초 -> 마이크로초


def default_draft_dir() -> str:
    """캡컷 PC 기본 초안 폴더(윈도우/맥). 없으면 빈 문자열."""
    candidates = [
        os.path.join(os.environ.get("LOCALAPPDATA", ""), "CapCut", "User Data", "Projects", "com.lveditor.draft"),
        os.path.expanduser("~/Movies/CapCut/User Data/Projects/com.lveditor.draft"),
    ]
    for path in candidates:
        if os.path.isdir(path):
            return path
    return ""


def build_draft(*, draft_dir: str, name: str, info, keeps: list, enhanced_audio: str,
                cues: list, sfx_cues: list, subtitle_size: float = 7.0) -> str:
    os.makedirs(draft_dir, exist_ok=True)
    folder = cc.DraftFolder(draft_dir)
    fps = int(round(info.fps)) or 30
    script = folder.create_draft(name, info.width, info.height, fps=fps, allow_replace=True)

    script.add_track(cc.TrackType.video, "main")
    script.add_track(cc.TrackType.audio, "voice")
    script.add_track(cc.TrackType.audio, "sfx1", relative_index=1)
    script.add_track(cc.TrackType.audio, "sfx2", relative_index=2)
    script.add_track(cc.TrackType.text, "subtitle")

    video_mat = cc.VideoMaterial(info.path)
    audio_mat = cc.AudioMaterial(enhanced_audio)

    # 1) 남길 구간만 이어 붙인다. 원본 소리는 끄고, 다듬은 소리를 따로 깐다
    t = 0
    for a, b in keeps:
        src = cc.Timerange(US(a), min(US(b), video_mat.duration) - US(a))
        if src.duration <= 0:
            continue
        script.add_segment(cc.VideoSegment(video_mat, cc.Timerange(t, src.duration),
                                           source_timerange=src, volume=0.0), "main")
        asrc = cc.Timerange(src.start, min(src.duration, audio_mat.duration - src.start))
        if asrc.duration > 0:
            script.add_segment(cc.AudioSegment(audio_mat, cc.Timerange(t, asrc.duration),
                                               source_timerange=asrc), "voice")
        t += src.duration
    total = t

    # 2) 자막: 흰 글씨 + 검은 테두리, 화면 아래쪽
    style = cc.TextStyle(size=subtitle_size, bold=True, align=1, auto_wrapping=True, max_line_width=0.8)
    border = cc.TextBorder(color=(0.0, 0.0, 0.0), width=50.0)
    pos = cc.ClipSettings(transform_y=-0.72)
    for start, end, text in cues:
        s, e = US(start), min(US(end), total)
        if e - s < US(0.1):
            continue
        script.add_segment(cc.TextSegment(text, cc.Timerange(s, e - s), style=style,
                                          border=border, clip_settings=pos), "subtitle")

    # 3) 효과음: 겹치면 두 번째 트랙으로
    last_end = {"sfx1": -1, "sfx2": -1}
    for c in sfx_cues:
        mat = cc.AudioMaterial(c.path)
        start = US(c.time)
        dur = min(mat.duration, total - start)
        if dur <= US(0.03):
            continue
        track = "sfx1" if start >= last_end["sfx1"] else "sfx2"
        if start < last_end[track]:
            continue
        script.add_segment(cc.AudioSegment(mat, cc.Timerange(start, dur), volume=c.volume), track)
        last_end[track] = start + dur

    script.save()
    return os.path.join(draft_dir, name)
