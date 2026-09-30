"""영상을 넣으면 무음·버벅임 컷, 자막, 소리 보정, 효과음까지 넣은 캡컷 초안을 만든다.

사용 예:
    python run.py 영상.mp4
    python run.py 영상1.mp4 영상2.mov --preview
    python run.py asmr.mp4 --mode asmr --no-subtitles
"""
import argparse
import sys

from autoedit import Options, process


def main() -> int:
    # 윈도우 콘솔(cp949)에서 특수문자 때문에 멈추지 않도록
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(errors="replace")
        except AttributeError:
            pass
    p = argparse.ArgumentParser(description="THING THAT HIT 자동 영상 편집기 (pyCapCut)")
    p.add_argument("videos", nargs="+", help="편집할 영상 파일(여러 개 가능)")
    p.add_argument("--mode", choices=["auto", "talk", "asmr"], default="auto",
                   help="auto: 말 비율로 자동 판단 / talk: 말하는 영상 / asmr: 환경음 위주 영상")
    p.add_argument("--model", default="small",
                   help="Whisper 모델 (tiny, base, small, medium, large-v3). 클수록 정확하지만 느려요")
    p.add_argument("--language", default="ko")
    p.add_argument("--min-silence", type=float, default=0.6, help="이 초보다 긴 무음을 자른다 (기본 0.6)")
    p.add_argument("--padding", type=float, default=0.15, help="말 앞뒤로 남길 여유 초 (기본 0.15)")
    p.add_argument("--max-chars", type=int, default=16, help="자막 한 줄 최대 글자 수 (기본 16)")
    p.add_argument("--no-subtitles", action="store_true", help="자막을 넣지 않는다")
    p.add_argument("--no-sfx", action="store_true", help="효과음을 넣지 않는다")
    p.add_argument("--sfx-dir", default="", help="효과음 폴더 (기본: sfx/)")
    p.add_argument("--draft-dir", default="", help="캡컷 초안 폴더 (기본: 자동 탐색, 없으면 output/capcut_drafts)")
    p.add_argument("--name", default="", help="캡컷 초안 이름 (영상 1개일 때)")
    p.add_argument("--out", default="output", help="자막·리포트 등을 저장할 폴더")
    p.add_argument("--preview", action="store_true", help="확인용 mp4도 만든다")
    p.add_argument("--retranscribe", action="store_true", help="저장된 음성 인식 결과를 무시하고 다시 인식")
    args = p.parse_args()

    failed = 0
    for video in args.videos:
        print(f"\n===== {video} =====")
        opt = Options(mode=args.mode, model=args.model, language=args.language,
                      min_silence=args.min_silence, padding=args.padding, max_chars=args.max_chars,
                      subtitles=not args.no_subtitles, sfx=not args.no_sfx, sfx_dir=args.sfx_dir,
                      draft_dir=args.draft_dir, draft_name=args.name if len(args.videos) == 1 else "",
                      out_dir=args.out, preview=args.preview, retranscribe=args.retranscribe)
        try:
            r = process(video, opt)
            print(f"✔ 완료: {r['duration_before']}초 → {r['duration_after']}초, "
                  f"자막 {len(r['subtitles'])}줄, 효과음 {len(r['sfx'])}개")
        except Exception as e:  # 여러 영상 중 하나가 실패해도 나머지는 계속
            failed += 1
            print(f"✘ 실패: {e}", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
