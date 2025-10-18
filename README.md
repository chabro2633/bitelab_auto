# Cigro 데이터 스크래핑 스크립트

Cigro 웹사이트에서 판매 데이터를 자동으로 스크래핑하여 Google Sheets에 업로드하는 스크립트입니다.

## 🚀 기능

- **자동 로그인**: Cigro 웹사이트에 자동 로그인
- **데이터 스크래핑**: 어제 날짜의 판매 데이터 추출
- **브랜드별 처리**: 바르너, 릴리이버, 색동서울 브랜드 데이터 처리
- **Google Sheets 연동**: 스크래핑한 데이터를 자동으로 Google Sheets에 업로드
- **스마트 중복 처리**: 같은 날짜 데이터가 있으면 내용을 비교하여 업데이트
- **헤드리스 모드**: GUI 없이 백그라운드에서 실행

## 📋 요구사항

- Python 3.7 이상
- Google Sheets API 활성화 및 서비스 계정 키
- 인터넷 연결

## 🛠️ 설치 방법

### 자동 설치 (권장)

**macOS/Linux:**
```bash
chmod +x install.sh
./install.sh
```

**Windows:**
```cmd
install.bat
```

### 수동 설치

1. **Python 패키지 설치:**
```bash
pip install -r requirements.txt
```

2. **Playwright 브라우저 설치:**
```bash
playwright install chromium
```

3. **Google Sheets 인증 파일 설정:**
   - Google Cloud Console에서 서비스 계정 키를 다운로드
   - 파일명을 `google_sheet_credentials.json`으로 저장
   - 스크립트와 같은 디렉토리에 위치

## 🔧 설정

### 1. 로그인 정보 설정
`cigro_yesterday.py` 파일에서 다음 정보를 수정하세요:

```python
EMAIL = "your-email@example.com"  # Cigro 로그인 이메일
PASSWORD = "your-password"        # Cigro 로그인 비밀번호
```

### 2. Google Sheets 설정
```python
GOOGLE_SHEET_NAME = "Cigro Sales"  # Google Sheets 스프레드시트 이름
```

### 3. 브랜드 설정
```python
BRANDS = ["바르너","릴리이버","색동서울"]  # 스크래핑할 브랜드 목록
```

## 🚀 사용 방법

### 1. 로컬 실행

#### 명령줄에서 실행
```bash
# 어제 날짜로 실행
python3 cigro_yesterday.py

# 특정 날짜로 실행
python3 cigro_yesterday.py --date "2024-01-15"
```

#### 웹 인터페이스에서 실행
1. 웹 애플리케이션 실행: `npm run dev`
2. 브라우저에서 `http://localhost:3000` 접속
3. 로그인 후 날짜 선택 및 "Cigro 데이터 스크래핑 실행" 버튼 클릭

### 2. GitHub Actions 자동 실행 (권장)

#### 자동 스케줄링
- **매일 오전 9시 (한국시간)**에 자동 실행
- 어제 날짜의 데이터를 자동으로 스크래핑
- 완전히 자동화된 시스템

#### 수동 실행
- GitHub 저장소의 Actions 탭에서 수동 실행 가능
- 특정 날짜 지정하여 실행 가능

#### 설정 방법
자세한 설정 방법은 [GitHub Actions 설정 가이드](GITHUB_ACTIONS_SETUP.md)를 참조하세요.

## 📊 실행 결과

스크립트 실행 시 다음과 같은 정보가 출력됩니다:

```
🚀 Cigro 데이터 스크래핑 시작
🔍 의존성 확인 중...
✅ 모든 필수 패키지가 설치되어 있습니다.
✅ Playwright가 설치되어 있습니다.
✅ 모든 의존성 확인 완료
📅 추출할 날짜: 2024-01-15
🔐 기존 로그인 세션 불러오는 중...
🔍 바르너 데이터 추출 중...
📊 바르너 페이지 로딩 완료, 데이터 추출 시작...
✅ 바르너 데이터 추출 완료: 25개 행
✅ 바르너 시트에 2024-01-15 날짜 데이터 새로 추가 완료
```

## 🔒 보안 고려사항

1. **로그인 정보**: 이메일과 비밀번호를 안전하게 보관하세요
2. **Google Sheets 인증**: 서비스 계정 키 파일을 안전하게 보관하세요
3. **세션 저장**: `auth.json` 파일은 로그인 세션을 저장하므로 안전하게 보관하세요

## 🐛 문제 해결

### 일반적인 문제들

1. **의존성 오류**
   ```bash
   pip install -r requirements.txt
   playwright install chromium
   ```

2. **Google Sheets 인증 오류**
   - `google_sheet_credentials.json` 파일이 올바른 위치에 있는지 확인
   - Google Sheets API가 활성화되어 있는지 확인

3. **로그인 실패**
   - 이메일과 비밀번호가 올바른지 확인
   - 웹사이트 구조가 변경되었을 수 있음

4. **브라우저 실행 오류**
   ```bash
   playwright install chromium
   ```

### 로그 확인

스크립트는 상세한 로그를 출력하므로 오류 발생 시 로그를 확인하여 문제를 파악할 수 있습니다.

## 📁 파일 구조

```
bitelab_auto/
├── cigro_yesterday.py              # 메인 스크립트
├── requirements.txt                 # Python 패키지 목록
├── install.sh                      # macOS/Linux 설치 스크립트
├── install.bat                     # Windows 설치 스크립트
├── google_sheet_credentials.json    # Google Sheets 인증 파일
├── auth.json                       # 로그인 세션 저장 파일 (자동 생성)
└── README.md                       # 이 파일
```

## 🔄 업데이트

스크립트를 업데이트하려면:

1. 최신 버전 다운로드
2. 기존 설정 파일들 백업
3. 새 버전 설치
4. 설정 파일들 복원

## 📞 지원

문제가 발생하면 다음을 확인하세요:

1. Python 버전 (3.7 이상 필요)
2. 모든 의존성 패키지 설치 여부
3. Google Sheets 인증 파일 존재 여부
4. 인터넷 연결 상태
5. Cigro 웹사이트 접근 가능 여부

## 📝 라이선스

이 스크립트는 내부 사용을 위한 것입니다. 상업적 사용 시 관련 법규를 준수하세요.
