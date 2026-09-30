@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 편집기를 켜는 중이에요. 편집하는 동안 이 창은 닫지 마세요.
echo 처음 켤 때 "Windows 보안 경고" 창이 뜨면 [허용]을 눌러 주세요.
python web.py
pause
