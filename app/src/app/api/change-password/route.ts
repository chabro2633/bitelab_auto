import { NextRequest, NextResponse } from 'next/server';
import { getSession, updateSession } from '../../../lib/session';
import { changePassword, verifyPassword, getUsers } from '../../../lib/auth';

export async function POST(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { currentPassword, newPassword } = await request.json();

    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json(
        { error: '새 비밀번호는 최소 6자 이상이어야 합니다.' },
        { status: 400 }
      );
    }

    // 현재 사용자 정보 가져오기
    const users = await getUsers();
    const user = users.find(u => u.username === session.username);

    if (!user) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 최초 비밀번호 변경이 아닌 경우, 현재 비밀번호 확인 필요
    if (!user.mustChangePassword) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: '현재 비밀번호를 입력해주세요.' },
          { status: 400 }
        );
      }

      const isValid = await verifyPassword(currentPassword, user.password);
      if (!isValid) {
        return NextResponse.json(
          { error: '현재 비밀번호가 일치하지 않습니다.' },
          { status: 400 }
        );
      }
    }

    // 비밀번호 변경
    await changePassword(session.username, newPassword);

    // 세션에서 mustChangePassword 플래그 제거
    await updateSession({ mustChangePassword: false });

    return NextResponse.json({
      success: true,
      message: '비밀번호가 성공적으로 변경되었습니다.',
    });
  } catch (error: unknown) {
    console.error('Password change error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '비밀번호 변경 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
