@echo off
echo 🚀 Cigro 스크래핑 스크립트 설치 시작
echo ==================================

REM Python 버전 확인
echo 📋 Python 버전 확인 중...
python --version

REM pip 업그레이드
echo 📦 pip 업그레이드 중...
python -m pip install --upgrade pip

REM 필수 패키지 설치
echo 📦 필수 패키지 설치 중...
python -m pip install -r requirements.txt

REM Playwright 브라우저 설치
echo 🌐 Playwright 브라우저 설치 중...
python -m playwright install chromium

REM Google Sheets 인증 파일 확인
echo 🔐 Google Sheets 인증 파일 확인 중...
if not exist "google_sheet_credentials.json" (
    echo ❌ google_sheet_credentials.json 파일이 없습니다.
    echo Google Cloud Console에서 서비스 계정 키를 다운로드하여 이 파일명으로 저장하세요.
    echo 자세한 방법은 README.md를 참조하세요.
    pause
    exit /b 1
) else (
    echo ✅ Google Sheets 인증 파일이 존재합니다.
)

echo.
echo ✅ 설치 완료!
echo 이제 다음 명령어로 스크립트를 실행할 수 있습니다:
echo python cigro_yesterday.py
pause
