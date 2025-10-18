# 사용자 계정 관리 가이드

## 🔐 로그인 가능한 계정 정보 생성 및 관리

### 📋 현재 등록된 사용자
```
1. 사용자명: admin
   역할: admin
   생성일: 1/1/2024, 9:00:00 AM

2. 사용자명: testuser
   역할: user
   생성일: 10/18/2025, 2:18:40 PM
```

## 🛠️ 계정 관리 방법

### 1. 명령줄 도구 사용 (권장)

#### 새 사용자 생성
```bash
cd /Users/chahyeongtae/Documents/GitHub/bitelab_auto/app
node create-user.js <사용자명> <비밀번호> [역할]
```

**예시:**
```bash
# 일반 사용자 생성
node create-user.js john password123 user

# 관리자 생성
node create-user.js admin2 secretpass admin

# 역할을 지정하지 않으면 기본적으로 'user'로 설정
node create-user.js alice mypassword
```

#### 비밀번호 변경
```bash
node create-user.js --change-password <사용자명> <새비밀번호>
```

**예시:**
```bash
node create-user.js --change-password admin newpassword123
```

#### 사용자 목록 확인
```bash
node create-user.js --list
```

### 2. 웹 인터페이스 사용

1. **웹 페이지 접속**: `http://localhost:3001`
2. **관리자 로그인**: admin 계정으로 로그인
3. **사용자 관리 페이지**: "사용자 관리" 버튼 클릭
4. **계정 생성**: "Add User" 버튼 클릭
5. **비밀번호 변경**: "Change Password" 버튼 클릭

## 🔒 보안 기능

### 비밀번호 해싱
- 모든 비밀번호는 `bcryptjs`로 해싱되어 저장
- 해시 강도: 10 rounds
- 원본 비밀번호는 저장되지 않음

### 역할 기반 접근 제어
- **admin**: 모든 기능 접근 가능
- **user**: 제한된 기능만 접근 가능

### 인증 보안
- NextAuth.js를 사용한 안전한 세션 관리
- CSRF 보호
- 세션 만료 처리

## 📊 사용자 역할별 권한

### Admin (관리자)
- ✅ 모든 사용자 계정 관리
- ✅ 스크래핑 실행 및 모니터링
- ✅ 시스템 설정 변경
- ✅ 로그 확인

### User (일반 사용자)
- ✅ 스크래핑 실행 및 모니터링
- ✅ 자신의 계정 정보 확인
- ❌ 다른 사용자 계정 관리 불가
- ❌ 시스템 설정 변경 불가

## 🚀 빠른 시작

### 기본 관리자 계정으로 시작
```bash
# 기본 admin 계정 (이미 존재)
사용자명: admin
비밀번호: admin123  # 실제 비밀번호는 해싱되어 저장됨
```

### 새 관리자 계정 생성
```bash
node create-user.js superadmin mypassword123 admin
```

### 일반 사용자 계정 생성
```bash
node create-user.js employee1 password123 user
node create-user.js employee2 password123 user
```

## 🔧 문제 해결

### 로그인 실패 시
1. 사용자명과 비밀번호 확인
2. 사용자 목록에서 계정 존재 여부 확인: `node create-user.js --list`
3. 비밀번호 재설정: `node create-user.js --change-password <사용자명> <새비밀번호>`

### 권한 문제 시
1. 사용자 역할 확인
2. 관리자 권한이 필요한 작업인지 확인
3. 필요시 역할 변경 (웹 인터페이스 또는 직접 JSON 파일 수정)

### 계정 삭제 (고급)
```bash
# 직접 JSON 파일 편집 (주의: 백업 권장)
# app/src/lib/users.json 파일에서 해당 사용자 객체 제거
```

## 📝 사용자 데이터 구조

```json
{
  "users": [
    {
      "id": "사용자명",
      "username": "사용자명",
      "password": "해싱된비밀번호",
      "role": "admin|user",
      "createdAt": "생성일시"
    }
  ]
}
```

## 🎯 모범 사례

1. **강력한 비밀번호 사용**: 최소 8자 이상, 특수문자 포함
2. **정기적인 비밀번호 변경**: 보안을 위해 주기적으로 변경
3. **최소 권한 원칙**: 필요한 최소한의 권한만 부여
4. **계정 모니터링**: 정기적으로 사용자 목록 확인
5. **백업**: 사용자 데이터 정기적으로 백업

## 🔄 자동화 스크립트

### 여러 사용자 일괄 생성
```bash
#!/bin/bash
# create-multiple-users.sh

users=("user1:password1:user" "user2:password2:user" "admin2:adminpass:admin")

for user_info in "${users[@]}"; do
    IFS=':' read -r username password role <<< "$user_info"
    node create-user.js "$username" "$password" "$role"
done
```

이제 **완전한 사용자 계정 관리 시스템**이 준비되었습니다! 🎯
