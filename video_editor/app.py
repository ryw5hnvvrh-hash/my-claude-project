"""Hugging Face Spaces 진입점 — 아이패드 사파리에서 바로 쓰는 클라우드 편집기."""
import os

os.environ.setdefault("AUTOEDIT_CLOUD", "1")

from web import launch_cloud  # noqa: E402

launch_cloud()
