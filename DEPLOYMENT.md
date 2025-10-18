# Vercel 배포 가이드

## 🚀 배포 방법

### 1. GitHub 저장소 준비
```bash
# Git 저장소 초기화 (아직 안 했다면)
git init
git add .
git commit -m "Initial commit"

# GitHub 저장소 생성 후 연결
git remote add origin https://github.com/YOUR_USERNAME/bitelab_auto.git
git push -u origin main
```

### 2. Vercel 배포
1. [Vercel](https://vercel.com)에 로그인
2. "New Project" 클릭
3. GitHub 저장소 선택
4. 프로젝트 설정:
   - **Framework Preset**: Next.js
   - **Root Directory**: `app`
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`

### 3. 환경 변수 설정
Vercel 대시보드에서 다음 환경 변수들을 설정하세요:

#### NextAuth 설정
- `NEXTAUTH_URL`: `https://your-app.vercel.app`
- `NEXTAUTH_SECRET`: 랜덤한 시크릿 키 (아래 명령어로 생성)
```bash
openssl rand -base64 32
```

#### Cigro 로그인 정보
- `CIGRO_EMAIL`: Cigro 로그인 이메일
- `CIGRO_PASSWORD`: Cigro 로그인 비밀번호

#### Google Sheets 설정
- `GOOGLE_SHEET_NAME`: Google Sheets 스프레드시트 이름
- `GOOGLE_SHEETS_CREDENTIALS`: Google Sheets 서비스 계정 JSON (한 줄로 압축)

#### GitHub Actions 설정
- `GITHUB_TOKEN`: GitHub Personal Access Token
- `GITHUB_REPO_OWNER`: GitHub 사용자명
- `GITHUB_REPO_NAME`: 저장소 이름

### 4. GitHub Secrets 설정
GitHub 저장소의 Settings > Secrets and variables > Actions에서 다음 시크릿을 설정하세요:

- `CIGRO_EMAIL`: Cigro 로그인 이메일
- `CIGRO_PASSWORD`: Cigro 로그인 비밀번호
- `GOOGLE_SHEET_NAME`: Google Sheets 스프레드시트 이름
- `GOOGLE_SHEETS_CREDENTIALS`: Google Sheets 서비스 계정 JSON

### 5. GitHub Personal Access Token 생성
1. GitHub > Settings > Developer settings > Personal access tokens > Tokens (classic)
2. "Generate new token" 클릭
3. 권한 선택:
   - `repo` (전체 저장소 접근)
   - `workflow` (워크플로우 실행)
4. 토큰 복사하여 Vercel 환경 변수에 설정

## 🔧 시스템 아키텍처

### 웹 애플리케이션 (Vercel)
- Next.js 기반 관리자 대시보드
- 사용자 인증 (NextAuth.js)
- GitHub Actions 워크플로우 트리거

### 스크래핑 엔진 (GitHub Actions)
- Python 스크립트 실행
- Playwright를 사용한 웹 스크래핑
- Google Sheets 데이터 업로드

### 데이터 저장소
- Google Sheets: 스크래핑 결과 저장
- GitHub: 코드 및 설정 관리

## 📊 사용 방법

1. **웹 대시보드 접속**: 배포된 Vercel URL
2. **로그인**: 관리자 계정으로 로그인
3. **스크래핑 설정**: 브랜드 및 날짜 선택
4. **실행**: "Cigro 데이터 스크래핑 실행" 버튼 클릭
5. **결과 확인**: Google Sheets에서 결과 확인

## 🔍 문제 해결

### 일반적인 문제들
1. **환경 변수 누락**: Vercel과 GitHub Secrets 모두 설정했는지 확인
2. **GitHub Token 권한**: 토큰에 필요한 권한이 있는지 확인
3. **Google Sheets 권한**: 서비스 계정이 스프레드시트에 접근 권한이 있는지 확인

### 로그 확인
- **Vercel 로그**: Vercel 대시보드 > Functions 탭
- **GitHub Actions 로그**: GitHub > Actions 탭
- **Google Sheets**: 스프레드시트에서 데이터 확인

## 🎯 배포 후 확인사항

- [ ] 웹 애플리케이션이 정상적으로 로드되는가?
- [ ] 로그인이 정상적으로 작동하는가?
- [ ] GitHub Actions 워크플로우가 트리거되는가?
- [ ] 스크래핑이 정상적으로 실행되는가?
- [ ] Google Sheets에 데이터가 업로드되는가?
