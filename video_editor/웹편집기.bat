@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 편집기 웹페이지를 여는 중이에요. 이 창은 닫지 마세요.
python web.py
pause
