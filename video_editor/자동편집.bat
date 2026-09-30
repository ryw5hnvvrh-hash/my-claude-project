@echo off
chcp 65001 >nul
cd /d "%~dp0"
if "%~1"=="" (
  echo 편집할 영상 파일을 이 아이콘 위로 끌어다 놓으세요.
  pause
  exit /b
)
python run.py %* --preview
pause
