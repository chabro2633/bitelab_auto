import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getUsers, saveUsers, hashPassword } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    console.log('Session data:', {
      exists: !!session,
      user: session?.user,
      role: session?.user?.role,
      username: session?.user?.username
    });
    
    if (!session) {
      console.log('No session found');
      return NextResponse.json({ error: 'Unauthorized - No session' }, { status: 401 });
    }

    const { username, newPassword } = await request.json();
    
    console.log('Request data:', {
      requestedUsername: username,
      sessionUsername: session.user.username,
      sessionRole: session.user.role
    });
    
    // admin이거나 본인의 비밀번호를 변경하는 경우만 허용
    if (session.user.role !== 'admin' && session.user.username !== username) {
      console.log('Authorization failed:', {
        sessionRole: session.user.role,
        sessionUsername: session.user.username,
        requestedUsername: username
      });
      return NextResponse.json({ error: 'Unauthorized - Cannot change other user password' }, { status: 401 });
    }
    
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
    
    console.log('Password changed successfully for user:', username);
    
    return NextResponse.json({ 
      message: 'Password changed successfully',
      username: username 
    });
    
  } catch (error: unknown) {
    console.error('Password change error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
