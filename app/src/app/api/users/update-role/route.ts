import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../../lib/session';
import { updateUserRole, UserRole } from '../../../../lib/auth';

export async function POST(request: NextRequest) {
  const session = await getSession();

  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { username, role } = await request.json();

    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    // 유효한 역할인지 확인
    const validRoles: UserRole[] = ['admin', 'sales_viewer', 'user'];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    // admin 계정의 역할은 변경 불가
    if (username === 'admin') {
      return NextResponse.json({ error: 'Cannot change admin user role' }, { status: 400 });
    }

    const updatedUser = await updateUserRole(username, role);

    return NextResponse.json({
      message: 'User role updated successfully',
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        role: updatedUser.role,
        allowedBrands: updatedUser.allowedBrands,
        createdAt: updatedUser.createdAt
      }
    });

  } catch (error: unknown) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
