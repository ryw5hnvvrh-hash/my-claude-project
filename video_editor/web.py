"""자동 영상 편집기 웹페이지.

    python web.py            # 이 PC 브라우저에서 열기 (http://127.0.0.1:7860)
    python web.py --share    # 휴대폰에서도 열 수 있는 임시 링크 만들기 (72시간)
"""
import argparse
import hashlib
import os
import queue
import shutil
import threading
import time

import gradio as gr

from autoedit import Options, process

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, "output")
UPLOAD_DIR = os.path.join(OUT_DIR, "uploads")

MODES = {"자동 판단": "auto", "말하는 영상": "talk", "ASMR (환경음 위주)": "asmr"}
MODELS = {"빠름 (정확도 낮음)": "base", "보통 (추천)": "small", "정확 (느림)": "medium"}


def _keep_upload(path: str) -> str:
    """업로드 파일은 임시 폴더에 있어서 곧 지워진다. 캡컷 초안이 계속 참조할 수 있게 복사해 둔다.
    같은 영상을 다시 올리면 같은 이름이 되도록 내용 해시를 붙인다(음성 인식 결과 재사용)."""
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    h = hashlib.sha1()
    size = os.path.getsize(path)
    with open(path, "rb") as f:
        h.update(f.read(1 << 20))
        f.seek(max(0, size - (1 << 20)))
        h.update(f.read(1 << 20))
    h.update(str(size).encode())
    stem, ext = os.path.splitext(os.path.basename(path))
    dest = os.path.join(UPLOAD_DIR, f"{stem}_{h.hexdigest()[:6]}{ext}")
    if not os.path.exists(dest):
        shutil.copy(path, dest)
    return dest


def run(video, mode, model, subtitles, sfx, min_silence, draft_dir):
    if not video:
        raise gr.Error("먼저 영상을 올려 주세요.")
    logs = []
    q = queue.Queue()
    result = {}

    def work():
        try:
            opt = Options(mode=MODES[mode], model=MODELS[model], subtitles=subtitles, sfx=sfx,
                          min_silence=min_silence, draft_dir=(draft_dir or "").strip(), out_dir=OUT_DIR,
                          preview=True, on_log=lambda m: q.put(m))
            result["report"] = process(_keep_upload(video), opt)
        except Exception as e:
            result["error"] = str(e)
        finally:
            q.put(None)

    threading.Thread(target=work, daemon=True).start()
    started = time.time()
    while True:
        msg = q.get()
        if msg is None:
            break
        logs.append(f"[{time.time() - started:5.0f}초] {msg}")
        yield "\n".join(logs), None, None, ""

    if "error" in result:
        logs.append(f"실패: {result['error']}")
        yield "\n".join(logs), None, None, f"### 편집 실패\n{result['error']}"
        return

    r = result["report"]
    out = os.path.dirname(r["preview"])
    files = [os.path.join(out, f) for f in ("preview.mp4", "subtitles.srt", "audio_enhanced.wav", "report.json")]
    removed = r["removed_words"]
    summary = (
        f"### 편집 완료\n"
        f"- **{r['duration_before']}초 → {r['duration_after']}초** "
        f"({'ASMR 모드' if r['mode'] == 'asmr' else '말하는 영상 모드'}, 말 비율 {r['speech_ratio']:.0%})\n"
        f"- 잘라낸 추임새·반복: {len(removed)}개"
        + (f" ({', '.join(w['text'].strip(',.…') for w in removed[:8])}{' …' if len(removed) > 8 else ''})" if removed else "")
        + f"\n- 자막 {len(r['subtitles'])}줄, 효과음 {len(r['sfx'])}개\n"
        f"- 캡컷 초안: `{r['draft']}`\n\n"
        f"PC 캡컷을 열면 초안 목록에 있어요. 안 보이면 캡컷을 껐다 켜 주세요."
    )
    yield "\n".join(logs), r["preview"], [f for f in files if os.path.exists(f)], summary


CSS = """
.gradio-container {max-width: 1080px !important; margin: auto;}
#title h1 {margin-bottom: 0;}
#title p {color: var(--body-text-color-subdued); margin-top: 4px;}
"""


def build() -> gr.Blocks:
    with gr.Blocks(title="THING THAT HIT 자동 편집기") as app:
        gr.Markdown("# THING THAT HIT 자동 편집기\n"
                    "영상을 올리면 무음·버벅임을 자르고, 자막·소리 보정·효과음을 넣어 캡컷 초안으로 만들어요.",
                    elem_id="title")
        with gr.Row():
            with gr.Column(scale=5):
                video = gr.Video(label="편집할 영상", sources=["upload"], height=420)
                mode = gr.Radio(list(MODES), value="자동 판단", label="영상 종류",
                                info="자동 판단: 말이 15% 미만이면 ASMR로 처리해요")
                with gr.Row():
                    subtitles = gr.Checkbox(value=True, label="자막 넣기")
                    sfx = gr.Checkbox(value=True, label="효과음 넣기")
                with gr.Accordion("세부 설정", open=False):
                    min_silence = gr.Slider(0.3, 2.0, value=0.6, step=0.1, label="이 초보다 긴 무음을 자르기",
                                            info="컷이 너무 빡빡하면 늘리세요")
                    model = gr.Radio(list(MODELS), value="보통 (추천)", label="자막 인식 정확도")
                    draft_dir = gr.Textbox(label="캡컷 초안 폴더 (비워두면 자동으로 찾아요)",
                                           placeholder=r"예: C:\Users\이름\AppData\Local\CapCut\User Data\Projects\com.lveditor.draft")
                go = gr.Button("자동 편집 시작", variant="primary", size="lg")
            with gr.Column(scale=5):
                summary = gr.Markdown()
                preview = gr.Video(label="편집 결과 미리보기", interactive=False, height=420)
                files = gr.File(label="내려받기 (mp4 · 자막 · 소리 · 리포트)", file_count="multiple")
                log = gr.Textbox(label="진행 상황", lines=8, max_lines=14, autoscroll=True)
        go.click(run, [video, mode, model, subtitles, sfx, min_silence, draft_dir],
                 [log, preview, files, summary], concurrency_limit=1)
    return app


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--share", action="store_true", help="휴대폰에서도 열 수 있는 임시 공개 링크 만들기")
    p.add_argument("--port", type=int, default=7860)
    args = p.parse_args()
    build().queue().launch(server_port=args.port, share=args.share, inbrowser=True,
                           theme=gr.themes.Soft(primary_hue="rose"), css=CSS,
                           allowed_paths=[OUT_DIR])
