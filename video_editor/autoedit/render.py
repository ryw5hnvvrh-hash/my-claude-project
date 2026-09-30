"""SRT 저장 + ffmpeg로 확인용 mp4 만들기 (캡컷 없이 결과를 바로 볼 수 있게)."""
import os

from .media import run_ffmpeg


def _ts(t: float) -> str:
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def write_srt(cues: list, path: str) -> str:
    with open(path, "w", encoding="utf-8") as f:
        for i, (a, b, text) in enumerate(cues, 1):
            f.write(f"{i}\n{_ts(a)} --> {_ts(b)}\n{text}\n\n")
    return path


def _filter_path(path: str) -> str:
    # subtitles 필터 안에서는 \ 와 : 를 이스케이프해야 한다 (윈도우 경로 대응)
    return os.path.abspath(path).replace("\\", "/").replace(":", r"\:").replace("'", r"\'")


def render_preview(*, video: str, enhanced_audio: str, keeps: list, sfx_cues: list,
                   srt_path: str, out_path: str, burn_subtitles: bool = True) -> str:
    inputs = ["-i", video, "-i", enhanced_audio]
    for c in sfx_cues:
        inputs += ["-i", c.path]

    parts = []
    for i, (a, b) in enumerate(keeps):
        parts.append(f"[0:v]trim=start={a:.3f}:end={b:.3f},setpts=PTS-STARTPTS[v{i}]")
        parts.append(f"[1:a]atrim=start={a:.3f}:end={b:.3f},asetpts=PTS-STARTPTS[a{i}]")
    n = len(keeps)
    parts.append("".join(f"[v{i}][a{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=1[vcat][acat]")

    vout = "vcat"
    if burn_subtitles and os.path.exists(srt_path) and os.path.getsize(srt_path) > 0:
        style = "FontSize=18,Bold=1,Outline=2,Shadow=0,MarginV=60,Alignment=2"
        parts.append(f"[vcat]subtitles='{_filter_path(srt_path)}':force_style='{style}'[vsub]")
        vout = "vsub"

    aout = "acat"
    if sfx_cues:
        mix = ["[acat]"]
        for k, c in enumerate(sfx_cues):
            ms = int(c.time * 1000)
            parts.append(f"[{k + 2}:a]aformat=sample_rates=48000:channel_layouts=stereo,"
                         f"volume={c.volume},adelay={ms}|{ms}[s{k}]")
            mix.append(f"[s{k}]")
        parts.append("".join(mix) + f"amix=inputs={len(mix)}:duration=first:normalize=0[amix]")
        aout = "amix"

    graph = ";".join(parts)
    graph_file = out_path + ".filter.txt"
    with open(graph_file, "w", encoding="utf-8") as f:
        f.write(graph)
    try:
        run_ffmpeg([*inputs, "-filter_complex_script", graph_file,
                    "-map", f"[{vout}]", "-map", f"[{aout}]",
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out_path])
    finally:
        os.remove(graph_file)
    return out_path
