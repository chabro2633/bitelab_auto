import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getUsers, saveUsers, hashPassword } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    // 가장 기본적인 로그 - 이게 보이지 않으면 API 라우트 자체가 실행되지 않는 것
    console.log('🚀 API ROUTE EXECUTED - PASSWORD CHANGE START');
    console.error('🚀 API ROUTE EXECUTED - PASSWORD CHANGE START (ERROR LOG)');
    
    // 즉시 응답으로 테스트
    return NextResponse.json({ 
      message: 'API route is working',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      debug: 'This should appear if API route executes'
    });
    
    // Vercel에서도 로그가 보이도록 강제 출력
    console.log('=== PASSWORD CHANGE REQUEST START ===');
    console.error('=== PASSWORD CHANGE REQUEST START (ERROR LOG) ===');
    
    // NextAuth 세션 가져오기
    const session = await getServerSession(authOptions);
    
    console.log('Session exists:', !!session);
    console.error('Session exists (ERROR LOG):', !!session);
    console.log('Session user:', JSON.stringify(session?.user, null, 2));
    console.error('Session user (ERROR LOG):', JSON.stringify(session?.user, null, 2));
    
    if (!session) {
      console.log('❌ No session found - returning 401');
      console.error('❌ No session found - returning 401 (ERROR LOG)');
      return NextResponse.json({ 
        error: 'Unauthorized - No session',
        debug: {
          sessionExists: false,
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV
        }
      }, { status: 401 });
    }

    const body = await request.json();
    console.log('Request body:', JSON.stringify(body, null, 2));
    console.error('Request body (ERROR LOG):', JSON.stringify(body, null, 2));
    
    const { username, newPassword } = body;
    
    console.log('Request username:', username);
    console.error('Request username (ERROR LOG):', username);
    console.log('Session username:', session.user.username);
    console.error('Session username (ERROR LOG):', session.user.username);
    console.log('Session role:', session.user.role);
    console.error('Session role (ERROR LOG):', session.user.role);
    console.log('Session isFirstLogin:', session.user.isFirstLogin);
    console.error('Session isFirstLogin (ERROR LOG):', session.user.isFirstLogin);
    
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
      console.error('❌ Authorization failed (ERROR LOG)');
      return NextResponse.json({ 
        error: 'Unauthorized - Cannot change other user password',
        debug: {
          sessionExists: true,
          isAdmin,
          isOwnPassword,
          isFirstLogin,
          sessionUser: session.user,
          requestUsername: username,
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV
        }
      }, { status: 401 });
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
