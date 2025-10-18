# Bitelab Auto Admin Panel

cigro_yesterday.py 스크립트를 웹에서 실행할 수 있는 어드민 패널입니다.

## 🚀 기능

- **인증 시스템**: 지정된 사용자만 접근 가능
- **Cigro 데이터 스크래핑**: cigro_yesterday.py를 웹에서 실행하여 어제 날짜 판매 데이터 추출
- **Google Sheets 연동**: 스크래핑한 데이터를 자동으로 Google Sheets에 업로드
- **스마트 중복 처리**: 같은 날짜 데이터가 있으면 내용을 비교하여 업데이트
- **사용자 관리**: 어드민이 사용자 추가/관리 가능
- **실시간 결과**: 스크래핑 진행 상황과 결과를 실시간으로 확인

## 📋 요구사항

- Node.js 18+
- Python 3.x
- cigro_yesterday.py 파일 (프로젝트 루트에 위치)
- google_sheet_credentials.json 파일 (프로젝트 루트에 위치)
- Google Sheets API 활성화 및 서비스 계정 키

## 🛠️ 설치 및 실행

### 1. 의존성 설치
```bash
cd app
npm install
```

### 2. 환경 변수 설정
`.env.local` 파일을 생성하고 다음 내용을 추가하세요:

```env
NEXTAUTH_SECRET=your-secret-key-here-change-this-in-production
NEXTAUTH_URL=http://localhost:3000
```

**중요**: `NEXTAUTH_SECRET`는 프로덕션에서 반드시 변경하세요!

### 3. 개발 서버 실행
```bash
npm run dev
```

서버가 `http://localhost:3000`에서 실행됩니다.

## 🔐 기본 로그인 정보

- **사용자명**: `admin`
- **비밀번호**: `admin123`

**보안**: 첫 로그인 후 반드시 비밀번호를 변경하세요!

## 📁 프로젝트 구조

```
app/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts  # 인증 API
│   │   │   ├── execute-script/route.ts      # 스크립트 실행 API
│   │   │   └── users/route.ts               # 사용자 관리 API
│   │   ├── admin/page.tsx                   # 어드민 대시보드
│   │   ├── login/page.tsx                   # 로그인 페이지
│   │   └── users/page.tsx                   # 사용자 관리 페이지
│   ├── lib/
│   │   ├── auth.ts                          # 인증 유틸리티
│   │   └── users.json                       # 사용자 데이터
│   └── types/
│       └── next-auth.d.ts                   # NextAuth 타입 정의
```

## 🔧 사용법

### 1. 로그인
- `http://localhost:3000`에 접속하면 자동으로 로그인 페이지로 이동
- 기본 계정으로 로그인

### 2. 스크래핑 실행
- 어드민 대시보드에서 "Cigro 데이터 스크래핑 실행" 버튼 클릭
- 스크립트가 자동으로 어제 날짜 데이터를 추출
- 각 브랜드별로 Google Sheets에 업로드 진행 상황 확인
- 실행 결과를 실시간으로 확인

### 3. 사용자 관리 (어드민만)
- "User Management" 버튼 클릭
- 새 사용자 추가 가능
- 기존 사용자 목록 확인

## 🔒 보안 고려사항

1. **환경 변수**: `NEXTAUTH_SECRET`를 강력한 값으로 설정
2. **사용자 관리**: 불필요한 사용자 계정 삭제
3. **네트워크**: 프로덕션에서는 HTTPS 사용
4. **스크립트**: 허용된 스크립트만 실행 가능하도록 제한

## 🚀 배포

### Vercel 배포
1. GitHub에 코드 푸시
2. Vercel에서 프로젝트 연결
3. 환경 변수 설정
4. 배포 완료

### 기타 플랫폼
- Docker 지원
- 환경 변수만 설정하면 어디서든 배포 가능

## 📝 사용자 데이터 관리

사용자 정보는 `src/lib/users.json`에 저장됩니다. 이 파일을 별도 저장소에 백업하거나 GitHub에 저장하여 관리할 수 있습니다.

### 사용자 추가 방법
1. 웹 인터페이스 사용 (권장)
2. 직접 JSON 파일 수정
3. API를 통한 프로그래밍 방식 추가

## 🐛 문제 해결

### 스크립트 실행 오류
- Python 경로 확인
- cigro_yesterday.py 파일 존재 확인
- 파일 권한 확인

### 로그인 오류
- 사용자 정보 확인
- 비밀번호 해시 확인
- 세션 설정 확인

## 📞 지원

문제가 발생하면 이슈를 등록하거나 관리자에게 문의하세요.