#!/usr/bin/env node

const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

// 사용자 계정 생성 도구
async function createUserAccount() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('사용법: node create-user.js <username> <password> [role] [brands]');
    console.log('예시: node create-user.js admin mypassword admin');
    console.log('예시: node create-user.js user1 password123 user "바르너 릴리이브"');
    console.log('브랜드: 바르너, 릴리이브, 보호리, 먼슬리픽, 색동서울');
    process.exit(1);
  }

  const username = args[0];
  const password = args[1];
  const role = args[2] || 'user';
  const brandsString = args[3] || '';
  
  // 브랜드 문자열을 배열로 변환
  const allowedBrands = brandsString ? brandsString.split(' ').filter(b => b.trim()) : [];

  try {
    // 비밀번호 해싱
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // 사용자 정보 생성
    const newUser = {
      id: username,
      username: username,
      password: hashedPassword,
      role: role,
      allowedBrands: role === 'admin' ? [] : allowedBrands, // admin은 빈 배열 (모든 브랜드 접근 가능)
      createdAt: new Date().toISOString()
    };

    // 기존 사용자 파일 읽기
    const usersFilePath = path.join(__dirname, 'src', 'lib', 'users.json');
    let usersData = { users: [] };
    
    if (fs.existsSync(usersFilePath)) {
      const fileContent = fs.readFileSync(usersFilePath, 'utf8');
      usersData = JSON.parse(fileContent);
    }

    // 중복 사용자 확인
    const existingUser = usersData.users.find(user => user.username === username);
    if (existingUser) {
      console.log(`❌ 사용자 '${username}'이 이미 존재합니다.`);
      process.exit(1);
    }

    // 새 사용자 추가
    usersData.users.push(newUser);

    // 파일에 저장
    fs.writeFileSync(usersFilePath, JSON.stringify(usersData, null, 2));

    console.log('✅ 사용자 계정이 성공적으로 생성되었습니다!');
    console.log(`👤 사용자명: ${username}`);
    console.log(`🔑 비밀번호: ${password}`);
    console.log(`👑 역할: ${role}`);
    if (role === 'admin') {
      console.log(`🏢 브랜드 권한: 모든 브랜드 접근 가능`);
    } else {
      console.log(`🏢 브랜드 권한: ${allowedBrands.length > 0 ? allowedBrands.join(', ') : '브랜드 권한 없음'}`);
    }
    console.log(`📅 생성일: ${newUser.createdAt}`);
    console.log(`📁 저장 위치: ${usersFilePath}`);

  } catch (error) {
    console.error('❌ 사용자 생성 중 오류 발생:', error.message);
    process.exit(1);
  }
}

// 비밀번호 변경 도구
async function changePassword() {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.log('사용법: node create-user.js --change-password <username> <new-password>');
    console.log('예시: node create-user.js --change-password admin newpassword123');
    process.exit(1);
  }

  const username = args[1];
  const newPassword = args[2];

  try {
    // 비밀번호 해싱
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // 기존 사용자 파일 읽기
    const usersFilePath = path.join(__dirname, 'src', 'lib', 'users.json');
    
    if (!fs.existsSync(usersFilePath)) {
      console.log('❌ 사용자 파일을 찾을 수 없습니다.');
      process.exit(1);
    }

    const fileContent = fs.readFileSync(usersFilePath, 'utf8');
    const usersData = JSON.parse(fileContent);

    // 사용자 찾기
    const userIndex = usersData.users.findIndex(user => user.username === username);
    if (userIndex === -1) {
      console.log(`❌ 사용자 '${username}'을 찾을 수 없습니다.`);
      process.exit(1);
    }

    // 비밀번호 업데이트
    usersData.users[userIndex].password = hashedPassword;

    // 파일에 저장
    fs.writeFileSync(usersFilePath, JSON.stringify(usersData, null, 2));

    console.log('✅ 비밀번호가 성공적으로 변경되었습니다!');
    console.log(`👤 사용자명: ${username}`);
    console.log(`🔑 새 비밀번호: ${newPassword}`);

  } catch (error) {
    console.error('❌ 비밀번호 변경 중 오류 발생:', error.message);
    process.exit(1);
  }
}

// 사용자 목록 보기
function listUsers() {
  try {
    const usersFilePath = path.join(__dirname, 'src', 'lib', 'users.json');
    
    if (!fs.existsSync(usersFilePath)) {
      console.log('❌ 사용자 파일을 찾을 수 없습니다.');
      process.exit(1);
    }

    const fileContent = fs.readFileSync(usersFilePath, 'utf8');
    const usersData = JSON.parse(fileContent);

    console.log('📋 등록된 사용자 목록:');
    console.log('='.repeat(50));
    
    usersData.users.forEach((user, index) => {
      console.log(`${index + 1}. 사용자명: ${user.username}`);
      console.log(`   역할: ${user.role}`);
      console.log(`   생성일: ${new Date(user.createdAt).toLocaleString()}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ 사용자 목록 조회 중 오류 발생:', error.message);
    process.exit(1);
  }
}

// 메인 실행
const command = process.argv[2];

if (command === '--change-password') {
  changePassword();
} else if (command === '--list') {
  listUsers();
} else {
  createUserAccount();
}
