import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../../lib/session';
import { inviteUser, UserRole } from '../../../../lib/auth';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { username, role = 'sales_viewer', allowedBrands = [] } = await request.json();

    if (!username) {
      return NextResponse.json({ error: '사용자명을 입력해주세요.' }, { status: 400 });
    }

    // 유효한 role인지 확인
    const validRoles: UserRole[] = ['admin', 'sales_viewer', 'user'];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: '유효하지 않은 권한입니다.' }, { status: 400 });
    }

    const newUser = await inviteUser(username, role, allowedBrands);

    // 비밀번호 제외하고 반환
    const { password: _, ...safeUser } = newUser;

    return NextResponse.json({
      user: safeUser,
      message: `사용자 "${username}"이(가) 성공적으로 초대되었습니다.`
    }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : '사용자 초대 중 오류가 발생했습니다.'
    }, { status: 400 });
  }
}
