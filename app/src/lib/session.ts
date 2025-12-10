import { cookies } from 'next/headers';
import { authenticateUser, getRolePermissions, UserRole } from './auth';

// 세션 생성
export async function createSession(
  userId: string,
  username: string,
  role: UserRole,
  allowedBrands: string[] = [],
  mustChangePassword: boolean = false
) {
  const permissions = getRolePermissions(role);
  const sessionData = {
    userId,
    username,
    role,
    allowedBrands,
    mustChangePassword,
    permissions,
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24시간
  };

  const cookieStore = await cookies();
  cookieStore.set('session', JSON.stringify(sessionData), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60, // 24시간
  });

  return sessionData;
}

// 세션 가져오기
export async function getSession() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session');
    
    if (!sessionCookie) {
      return null;
    }
    
    const sessionData = JSON.parse(sessionCookie.value);
    
    // 세션 만료 확인
    if (new Date(sessionData.expires) < new Date()) {
      await destroySession();
      return null;
    }
    
    return sessionData;
  } catch (error) {
    console.error('Session parsing error:', error);
    return null;
  }
}

// 세션 삭제
export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete('session');
}

// 로그인 API
export async function loginUser(username: string, password: string) {
  try {
    const user = await authenticateUser(username, password);
    if (user) {
      const session = await createSession(
        user.id,
        user.username,
        user.role,
        user.allowedBrands || [],
        user.mustChangePassword || false
      );
      return { success: true, user: session };
    }
    return { success: false, error: 'Invalid credentials' };
  } catch (error) {
    console.error('Login error:', error);
    return { success: false, error: 'Login failed' };
  }
}

// 세션 업데이트 (비밀번호 변경 후 mustChangePassword 플래그 제거용)
export async function updateSession(updates: Partial<{
  mustChangePassword: boolean;
}>) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('session');

    if (!sessionCookie) {
      return null;
    }

    const sessionData = JSON.parse(sessionCookie.value);
    const updatedSession = { ...sessionData, ...updates };

    cookieStore.set('session', JSON.stringify(updatedSession), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60,
    });

    return updatedSession;
  } catch (error) {
    console.error('Session update error:', error);
    return null;
  }
}
