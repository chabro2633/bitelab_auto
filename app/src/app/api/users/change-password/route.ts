import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getUsers, saveUsers, hashPassword } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    console.log('=== PASSWORD CHANGE REQUEST START ===');
    
    // NextAuth 세션 가져오기
    const session = await getServerSession(authOptions);
    
    console.log('Session exists:', !!session);
    console.log('Session user:', JSON.stringify(session?.user, null, 2));
    
    if (!session) {
      console.log('❌ No session found - returning 401');
      return NextResponse.json({ error: 'Unauthorized - No session' }, { status: 401 });
    }

    const body = await request.json();
    console.log('Request body:', JSON.stringify(body, null, 2));
    
    const { username, newPassword } = body;
    
    console.log('Request username:', username);
    console.log('Session username:', session.user.username);
    console.log('Session role:', session.user.role);
    console.log('Session isFirstLogin:', session.user.isFirstLogin);
    
    // 최초 로그인 사용자는 본인 비밀번호 변경 허용
    // Admin은 모든 사용자 비밀번호 변경 허용
    const isAdmin = session.user.role === 'admin';
    const isOwnPassword = session.user.username === username;
    const isFirstLogin = session.user.isFirstLogin === true;
    
    console.log('Authorization checks:');
    console.log('- Is admin:', isAdmin);
    console.log('- Is own password:', isOwnPassword);
    console.log('- Is first login:', isFirstLogin);
    
    // 최초 로그인 사용자이거나 admin이거나 본인 비밀번호인 경우 허용
    if (!isAdmin && !isOwnPassword && !isFirstLogin) {
      console.log('❌ Authorization failed - not admin, not own password, not first login');
      return NextResponse.json({ error: 'Unauthorized - Cannot change other user password' }, { status: 401 });
    }
    
    if (!username || !newPassword) {
      console.log('❌ Missing username or password');
      return NextResponse.json({ error: 'Username and new password are required' }, { status: 400 });
    }

    console.log('Getting users from storage...');
    const users = await getUsers();
    console.log('Total users found:', users.length);
    console.log('User list:', users.map(u => ({ username: u.username, role: u.role })));
    
    const userIndex = users.findIndex(user => user.username === username);
    console.log('User index:', userIndex);
    
    if (userIndex === -1) {
      console.log('❌ User not found:', username);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    console.log('Hashing new password...');
    // 비밀번호 해싱
    const hashedPassword = await hashPassword(newPassword);
    
    console.log('Updating user password...');
    // 비밀번호 업데이트
    users[userIndex].password = hashedPassword;
    
    console.log('Saving users to storage...');
    // 저장
    await saveUsers(users);
    
    console.log('✅ Password changed successfully for user:', username);
    
    return NextResponse.json({ 
      message: 'Password changed successfully',
      username: username 
    });
    
  } catch (error: unknown) {
    console.error('❌ Password change error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
