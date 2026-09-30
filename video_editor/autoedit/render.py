"""SRT 저장 + ffmpeg로 확인용 mp4 만들기 (캡컷 없이 결과를 바로 볼 수 있게)."""
import os
import sys

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


def _subtitle_font():
    """자막용 한글 글꼴 (폴더, 이름). 운영체제 기본 글꼴을 쓴다."""
    if sys.platform == "win32":
        return os.path.join(os.environ.get("WINDIR", r"C:\Windows"), "Fonts"), "Malgun Gothic"
    if sys.platform == "darwin":
        return "/System/Library/Fonts", "Apple SD Gothic Neo"
    return "", "Noto Sans CJK KR"


# HDR(아이폰·아이패드 기본 촬영) 영상을 일반 화면 색으로 바꾼다. 안 하면 색이 허옇게 바래 보인다
TONEMAP = ("zscale=tin={tin}:pin=bt2020:min=bt2020nc:t=linear:npl=100,format=gbrpf32le,"
           "zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p")


def render_preview(*, video: str, enhanced_audio: str, keeps: list, sfx_cues: list,
                   srt_path: str, out_path: str, burn_subtitles: bool = True, hdr: str = "", fps: float = 30.0) -> str:
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
    if hdr:
        tin = "arib-std-b67" if hdr == "hlg" else "smpte2084"
        parts.append(f"[vcat]{TONEMAP.format(tin=tin)}[vsdr]")
        vout = "vsdr"
    if burn_subtitles and os.path.exists(srt_path) and os.path.getsize(srt_path) > 0:
        fonts_dir, font = _subtitle_font()
        style = f"FontName={font},FontSize=18,Bold=1,Outline=2,Shadow=0,MarginV=60,Alignment=2"
        fonts = f":fontsdir='{_filter_path(fonts_dir)}'" if fonts_dir and os.path.isdir(fonts_dir) else ""
        parts.append(f"[{vout}]subtitles='{_filter_path(srt_path)}'{fonts}:force_style='{style}'[vsub]")
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
                    "-map", f"[{vout}]", "-map", f"[{aout}]", "-r", f"{fps:.3f}",
                    "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out_path])
    finally:
        os.remove(graph_file)
    return out_path
