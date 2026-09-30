"""ffmpeg / mediainfo 헬퍼."""
import os
import re
import shutil
import subprocess
from dataclasses import dataclass

import numpy as np

SAMPLE_RATE = 16000  # 분석용 샘플레이트


def ffmpeg_exe() -> str:
    """시스템 ffmpeg가 있으면 그걸, 없으면 imageio-ffmpeg에 포함된 바이너리를 쓴다."""
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        raise RuntimeError("ffmpeg를 찾을 수 없어요. `pip install imageio-ffmpeg` 또는 ffmpeg를 설치해 주세요.")


def run_ffmpeg(args, capture=False) -> subprocess.CompletedProcess:
    cmd = [ffmpeg_exe(), "-hide_banner", "-y", *args]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode != 0:
        raise RuntimeError("ffmpeg 실패:\n" + proc.stderr.decode("utf-8", "replace")[-2000:])
    return proc


@dataclass
class VideoInfo:
    path: str
    width: int
    height: int
    fps: float
    duration: float  # 초
    has_audio: bool
    hdr: str = ""  # "hlg" / "pq" / "" — 아이폰·아이패드 기본 촬영은 HDR(HLG)인 경우가 많다


def probe(path: str) -> VideoInfo:
    import pymediainfo
    info = pymediainfo.MediaInfo.parse(path)
    if not info.video_tracks:
        raise ValueError(f"영상 트랙이 없는 파일이에요: {path}")
    v = info.video_tracks[0]
    width, height = int(v.width), int(v.height)
    # 폰으로 세로 촬영한 영상은 회전 메타데이터로 저장되는 경우가 많다
    rotation = float(v.rotation or 0)
    if int(rotation) % 180 == 90:
        width, height = height, width
    fps = float(v.frame_rate or 30)
    duration = float(v.duration or 0) / 1000.0
    transfer = str(v.transfer_characteristics or "").upper()
    hdr = "hlg" if "HLG" in transfer or "B67" in transfer else "pq" if "PQ" in transfer or "2084" in transfer else ""
    return VideoInfo(path, width, height, fps, duration, bool(info.audio_tracks), hdr)


def load_audio(path: str, sr: int = SAMPLE_RATE) -> np.ndarray:
    """영상에서 모노 float32 오디오를 뽑는다."""
    proc = run_ffmpeg(["-i", path, "-vn", "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"])
    return np.frombuffer(proc.stdout, dtype=np.float32).copy()


def extract_wav(path: str, out_path: str, sr: int = SAMPLE_RATE) -> str:
    run_ffmpeg(["-i", path, "-vn", "-ac", "1", "-ar", str(sr), "-c:a", "pcm_s16le", out_path])
    return out_path


def detect_scene_changes(path: str, threshold: float = 0.35) -> list:
    """화면이 크게 바뀌는 시점(초) 목록."""
    proc = run_ffmpeg([
        "-i", path, "-an",
        "-vf", f"scale=320:-2,select='gt(scene,{threshold})',showinfo",
        "-f", "null", "-",
    ])
    log = proc.stderr.decode("utf-8", "replace")
    return [float(t) for t in re.findall(r"pts_time:([0-9.]+)", log)]


def enhance_audio(src: str, out_path: str, mode: str) -> str:
    """소리를 잘 들리게 다듬은 48kHz 스테레오 wav를 만든다.

    - asmr: 작은 소리를 끌어올리는 dynaudnorm 위주. 잡음 제거는 약하게(환경음이 곧 콘텐츠라서).
    - talk: 저역 잡음 제거 + 노이즈 감소 + 컴프레서로 목소리를 또렷하게.
    둘 다 마지막에 loudnorm으로 SNS 기준 음량(-14~-16 LUFS)에 맞춘다.
    """
    if mode == "asmr":
        chain = ("highpass=f=40,"
                 "dynaudnorm=f=200:g=15:p=0.9:m=20,"
                 "acompressor=threshold=-28dB:ratio=2.5:attack=10:release=200,"
                 "loudnorm=I=-16:TP=-1.5:LRA=11")
    else:
        chain = ("highpass=f=80,"
                 "afftdn=nf=-25,"
                 "acompressor=threshold=-22dB:ratio=3:attack=5:release=120,"
                 "loudnorm=I=-14:TP=-1.5:LRA=9")
    run_ffmpeg(["-i", src, "-vn", "-af", chain, "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", out_path])
    return out_path


def safe_stem(path: str) -> str:
    stem = os.path.splitext(os.path.basename(path))[0]
    return re.sub(r"[^\w가-힣\-]+", "_", stem).strip("_") or "video"
