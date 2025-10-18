import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getUsers, saveUsers, hashPassword } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session || session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { username, newPassword } = await request.json();
    
    if (!username || !newPassword) {
      return NextResponse.json({ error: 'Username and new password are required' }, { status: 400 });
    }

    const users = getUsers();
    const userIndex = users.findIndex(user => user.username === username);
    
    if (userIndex === -1) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // 비밀번호 해싱
    const hashedPassword = await hashPassword(newPassword);
    
    // 비밀번호 업데이트
    users[userIndex].password = hashedPassword;
    
    // 파일에 저장
    saveUsers(users);
    
    return NextResponse.json({ 
      message: 'Password changed successfully',
      username: username 
    });
    
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
