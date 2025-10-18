# GitHub Actions 자동 실행 설정 가이드

이 가이드는 Cigro 데이터 스크래핑 스크립트를 GitHub Actions를 통해 자동으로 실행하는 방법을 설명합니다.

## 🚀 설정 단계

### 1. GitHub 저장소 설정

1. **저장소 생성**: GitHub에 새 저장소를 생성하거나 기존 저장소를 사용
2. **코드 업로드**: 모든 파일을 GitHub 저장소에 업로드
3. **워크플로우 파일 확인**: `.github/workflows/scrape.yml` 파일이 있는지 확인

### 2. GitHub Secrets 설정

GitHub 저장소의 Settings > Secrets and variables > Actions에서 다음 시크릿을 추가하세요:

#### 필수 시크릿:
- `CIGRO_EMAIL`: Cigro 로그인 이메일
- `CIGRO_PASSWORD`: Cigro 로그인 비밀번호
- `GOOGLE_SHEETS_CREDENTIALS`: Google Sheets 서비스 계정 키 JSON 내용
- `GOOGLE_SHEET_NAME`: Google Sheets 스프레드시트 이름 (기본값: "Cigro Sales")

#### 시크릿 추가 방법:
1. GitHub 저장소 페이지에서 **Settings** 클릭
2. 왼쪽 메뉴에서 **Secrets and variables** > **Actions** 클릭
3. **New repository secret** 클릭
4. 이름과 값을 입력하고 **Add secret** 클릭

### 3. Google Sheets 서비스 계정 설정

1. **Google Cloud Console** 접속
2. **프로젝트 생성** 또는 기존 프로젝트 선택
3. **API 및 서비스** > **라이브러리**에서 Google Sheets API 활성화
4. **API 및 서비스** > **사용자 인증 정보**에서 서비스 계정 생성
5. **키** 탭에서 JSON 키 다운로드
6. JSON 파일 내용을 `GOOGLE_SHEETS_CREDENTIALS` 시크릿에 복사

### 4. Google Sheets 권한 설정

1. Google Sheets에서 스프레드시트 열기
2. **공유** 버튼 클릭
3. 서비스 계정 이메일 주소를 추가하고 **편집자** 권한 부여

## ⏰ 실행 스케줄

### 자동 실행
- **매일 오전 9시 (한국시간)**에 자동 실행
- 어제 날짜의 데이터를 자동으로 스크래핑

### 수동 실행
1. GitHub 저장소의 **Actions** 탭 클릭
2. **Cigro Data Scraping** 워크플로우 선택
3. **Run workflow** 버튼 클릭
4. 필요시 특정 날짜 입력

## 📊 실행 결과 확인

### GitHub Actions 로그
1. **Actions** 탭에서 실행 기록 확인
2. 각 실행을 클릭하여 상세 로그 확인
3. 성공/실패 상태 확인

### Google Sheets 확인
1. 설정한 Google Sheets 스프레드시트 열기
2. 각 브랜드별 시트에서 데이터 확인
3. 날짜별 데이터 업로드 상태 확인

## 🔧 문제 해결

### 일반적인 문제들

#### 1. 인증 오류
- **문제**: Google Sheets 인증 실패
- **해결**: `GOOGLE_SHEETS_CREDENTIALS` 시크릿 재확인
- **확인사항**: JSON 형식이 올바른지, 서비스 계정 권한이 있는지

#### 2. 로그인 실패
- **문제**: Cigro 웹사이트 로그인 실패
- **해결**: `CIGRO_EMAIL`, `CIGRO_PASSWORD` 시크릿 재확인
- **확인사항**: 이메일과 비밀번호가 올바른지

#### 3. 워크플로우 실행 실패
- **문제**: GitHub Actions 실행 실패
- **해결**: Actions 탭에서 오류 로그 확인
- **확인사항**: 의존성 설치, 브라우저 설정 등

### 로그 확인 방법

1. **Actions** 탭에서 실패한 워크플로우 클릭
2. **Run scraping script** 단계 클릭
3. 상세 로그에서 오류 메시지 확인
4. 필요시 로그 파일 다운로드

## 🔄 업데이트 및 유지보수

### 코드 업데이트
1. 로컬에서 코드 수정
2. GitHub에 커밋 및 푸시
3. 자동으로 새로운 워크플로우 실행

### 설정 변경
1. GitHub Secrets에서 값 수정
2. 워크플로우 파일 수정 (필요시)
3. 변경사항 커밋 및 푸시

## 📱 알림 설정

### 이메일 알림
- GitHub 저장소 설정에서 이메일 알림 활성화
- 워크플로우 실패 시 자동 알림

### Slack/Discord 연동 (선택사항)
- 웹훅을 사용하여 알림 연동 가능
- 성공/실패 상태를 실시간으로 받을 수 있음

## 🎯 장점

### 자동화
- ✅ 매일 자동으로 데이터 스크래핑
- ✅ 수동 개입 없이 실행
- ✅ 일정한 시간에 안정적으로 실행

### 안정성
- ✅ 클라우드 환경에서 실행
- ✅ 의존성 자동 설치
- ✅ 격리된 환경에서 안전하게 실행

### 모니터링
- ✅ 실행 로그 자동 저장
- ✅ 성공/실패 상태 추적
- ✅ 문제 발생 시 즉시 알림

이제 GitHub Actions를 통해 완전히 자동화된 데이터 스크래핑 시스템을 사용할 수 있습니다! 🚀
