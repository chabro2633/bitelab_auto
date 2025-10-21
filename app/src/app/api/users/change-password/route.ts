import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getUsers, saveUsers, hashPassword } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    console.log('=== PASSWORD CHANGE DEBUG ===');
    console.log('Session exists:', !!session);
    console.log('Session user:', session?.user);
    console.log('Session role:', session?.user?.role);
    console.log('Session username:', session?.user?.username);
    
    if (!session) {
      console.log('❌ No session found - returning 401');
      return NextResponse.json({ error: 'Unauthorized - No session' }, { status: 401 });
    }

    const { username, newPassword } = await request.json();
    
    console.log('Request username:', username);
    console.log('Session username:', session.user.username);
    console.log('Session role:', session.user.role);
    
    // 최초 로그인 사용자는 본인 비밀번호 변경 허용
    // Admin은 모든 사용자 비밀번호 변경 허용
    const isAdmin = session.user.role === 'admin';
    const isOwnPassword = session.user.username === username;
    
    console.log('Is admin:', isAdmin);
    console.log('Is own password:', isOwnPassword);
    
    if (!isAdmin && !isOwnPassword) {
      console.log('❌ Authorization failed - not admin and not own password');
      return NextResponse.json({ error: 'Unauthorized - Cannot change other user password' }, { status: 401 });
    }
    
    if (!username || !newPassword) {
      return NextResponse.json({ error: 'Username and new password are required' }, { status: 400 });
    }

    const users = getUsers();
    const userIndex = users.findIndex(user => user.username === username);
    
    if (userIndex === -1) {
      console.log('❌ User not found:', username);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // 비밀번호 해싱
    const hashedPassword = await hashPassword(newPassword);
    
    // 비밀번호 업데이트
    users[userIndex].password = hashedPassword;
    
    // 파일에 저장
    saveUsers(users);
    
    console.log('✅ Password changed successfully for user:', username);
    
    return NextResponse.json({ 
      message: 'Password changed successfully',
      username: username 
    });
    
  } catch (error: unknown) {
    console.error('❌ Password change error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
