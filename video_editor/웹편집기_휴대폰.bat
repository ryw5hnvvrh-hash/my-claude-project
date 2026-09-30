@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 휴대폰용 임시 링크를 만드는 중이에요. 아래 "public URL" 주소를 휴대폰에서 여세요.
echo 링크를 아는 사람은 누구나 쓸 수 있으니 다른 사람에게 공유하지 마세요.
python web.py --share
pause
