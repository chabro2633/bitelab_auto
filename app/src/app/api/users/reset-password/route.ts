import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../../lib/session';
import { getUsers, saveUsers, hashPassword, DEFAULT_INITIAL_PASSWORD } from '../../../../lib/auth';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { username } = await request.json();

    if (!username) {
      return NextResponse.json({ error: '사용자명을 입력해주세요.' }, { status: 400 });
    }

    // admin 계정은 초기화 불가
    if (username === 'admin') {
      return NextResponse.json({ error: 'admin 계정의 비밀번호는 초기화할 수 없습니다.' }, { status: 400 });
    }

    const users = await getUsers();
    const userIndex = users.findIndex(u => u.username === username);

    if (userIndex === -1) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 비밀번호를 초기 비밀번호로 재설정
    const hashedPassword = await hashPassword(DEFAULT_INITIAL_PASSWORD);
    users[userIndex].password = hashedPassword;
    users[userIndex].mustChangePassword = true;

    await saveUsers(users);

    return NextResponse.json({
      success: true,
      message: `"${username}" 사용자의 비밀번호가 초기화되었습니다.`
    });
  } catch (error: unknown) {
    console.error('Password reset error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : '비밀번호 초기화 중 오류가 발생했습니다.'
    }, { status: 500 });
  }
}
