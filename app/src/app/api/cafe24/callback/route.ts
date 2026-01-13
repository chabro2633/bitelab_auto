import { NextRequest, NextResponse } from 'next/server';

// Cafe24 API 설정
const CAFE24_CLIENT_ID = process.env.CAFE24_CLIENT_ID || 'SUeffNXsNJDK9fv5it5Ygg';
const CAFE24_CLIENT_SECRET = process.env.CAFE24_CLIENT_SECRET || '8yMByUfsICdGJQm6ziS07F';
const CAFE24_MALL_ID = process.env.CAFE24_MALL_ID || 'baruner';
const CAFE24_REDIRECT_URI = process.env.CAFE24_REDIRECT_URI || 'https://app-bitelab.vercel.app/api/cafe24/callback';

const COOKIE_NAME = 'cafe24_token';

interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

// Authorization Code를 Access Token으로 교환
async function exchangeCodeForToken(code: string): Promise<TokenData> {
  const tokenUrl = `https://${CAFE24_MALL_ID}.cafe24api.com/api/v2/oauth/token`;

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${CAFE24_CLIENT_ID}:${CAFE24_CLIENT_SECRET}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: CAFE24_REDIRECT_URI,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Token exchange failed:', errorText);
    throw new Error(`Failed to exchange code for token: ${errorText}`);
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  // 에러 처리
  if (error) {
    console.error('OAuth error:', error, errorDescription);
    return new NextResponse(
      `
      <html>
        <head>
          <title>Cafe24 인증 실패</title>
          <style>
            body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
            .container { text-align: center; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .error { color: #dc2626; font-size: 24px; margin-bottom: 16px; }
            .message { color: #666; margin-bottom: 24px; }
            a { color: #2563eb; text-decoration: none; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error">인증 실패</div>
            <div class="message">${errorDescription || error}</div>
            <a href="/admin">관리자 페이지로 돌아가기</a>
          </div>
        </body>
      </html>
      `,
      {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }
    );
  }

  // 코드가 없으면 에러
  if (!code) {
    return new NextResponse(
      `
      <html>
        <head>
          <title>Cafe24 인증 실패</title>
          <style>
            body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
            .container { text-align: center; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .error { color: #dc2626; font-size: 24px; margin-bottom: 16px; }
            .message { color: #666; margin-bottom: 24px; }
            a { color: #2563eb; text-decoration: none; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error">인증 코드 없음</div>
            <div class="message">인증 코드를 받지 못했습니다.</div>
            <a href="/admin">관리자 페이지로 돌아가기</a>
          </div>
        </body>
      </html>
      `,
      {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }
    );
  }

  try {
    // Code를 Token으로 교환
    const tokenData = await exchangeCodeForToken(code);

    // 성공 페이지 표시 후 admin으로 리다이렉트 (쿠키에 토큰 저장)
    const response = new NextResponse(
      `
      <html>
        <head>
          <title>Cafe24 인증 성공</title>
          <meta http-equiv="refresh" content="2;url=/admin">
          <style>
            body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
            .container { text-align: center; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .success { color: #16a34a; font-size: 24px; margin-bottom: 16px; }
            .message { color: #666; margin-bottom: 24px; }
            .spinner { border: 4px solid #f3f3f3; border-top: 4px solid #16a34a; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 16px; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="spinner"></div>
            <div class="success">인증 성공!</div>
            <div class="message">Cafe24 API 연동이 완료되었습니다.<br>잠시 후 관리자 페이지로 이동합니다...</div>
          </div>
        </body>
      </html>
      `,
      {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }
    );

    // 쿠키에 토큰 저장
    response.cookies.set(COOKIE_NAME, JSON.stringify(tokenData), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 14, // 14일
      path: '/',
    });

    console.log('Token saved to cookie successfully');
    return response;

  } catch (err) {
    console.error('Token exchange error:', err);
    return new NextResponse(
      `
      <html>
        <head>
          <title>Cafe24 인증 실패</title>
          <style>
            body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
            .container { text-align: center; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .error { color: #dc2626; font-size: 24px; margin-bottom: 16px; }
            .message { color: #666; margin-bottom: 24px; }
            a { color: #2563eb; text-decoration: none; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error">토큰 교환 실패</div>
            <div class="message">${err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.'}</div>
            <a href="/admin">관리자 페이지로 돌아가기</a>
          </div>
        </body>
      </html>
      `,
      {
        status: 500,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }
    );
  }
}
