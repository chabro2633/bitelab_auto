import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../../lib/session';
import { cookies } from 'next/headers';
import { kv } from '@vercel/kv';

// Cafe24 API 설정
const CAFE24_CLIENT_ID = process.env.CAFE24_CLIENT_ID || 'SUeffNXsNJDK9fv5it5Ygg';
const CAFE24_CLIENT_SECRET = process.env.CAFE24_CLIENT_SECRET || '8yMByUfsICdGJQm6ziS07F';
const CAFE24_MALL_ID = process.env.CAFE24_MALL_ID || 'baruner';

// Cafe24 Data API Base URL (광고 효과 분석용)
const CAFE24_DATA_API_URL = 'https://ca-api.cafe24data.com';

// 토큰 관련 설정
interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

const COOKIE_NAME = 'cafe24_token';
const KV_TOKEN_KEY = 'cafe24_token_baruner';

// Vercel KV에서 토큰 로드
async function loadTokenFromKV(): Promise<TokenData | null> {
  try {
    const token = await kv.get<TokenData>(KV_TOKEN_KEY);
    if (token) {
      return token;
    }
  } catch (error) {
    console.error('[AdEffect] Failed to load token from KV:', error);
  }
  return null;
}

// Vercel KV에 토큰 저장
async function saveTokenToKV(token: TokenData): Promise<void> {
  try {
    await kv.set(KV_TOKEN_KEY, token);
  } catch (error) {
    console.error('[AdEffect] Failed to save token to KV:', error);
  }
}

async function loadToken(): Promise<TokenData | null> {
  // 1. 쿠키에서 토큰 확인
  try {
    const cookieStore = await cookies();
    const tokenCookie = cookieStore.get(COOKIE_NAME);
    if (tokenCookie) {
      const parsed = JSON.parse(tokenCookie.value);
      if (parsed.accessToken && parsed.refreshToken) {
        return parsed;
      }
    }
  } catch (error) {
    console.error('[AdEffect] Failed to load token from cookie:', error);
  }

  // 2. KV에서 토큰 확인
  const kvToken = await loadTokenFromKV();
  if (kvToken) {
    return kvToken;
  }

  // 3. 환경변수 fallback
  const envToken = process.env.CAFE24_REFRESH_TOKEN;
  if (envToken) {
    return {
      accessToken: '',
      refreshToken: envToken,
      expiresAt: 0,
    };
  }

  return null;
}

// Access Token 갱신
async function refreshAccessToken(refreshToken: string): Promise<TokenData> {
  const tokenUrl = `https://${CAFE24_MALL_ID}.cafe24api.com/api/v2/oauth/token`;

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${CAFE24_CLIENT_ID}:${CAFE24_CLIENT_SECRET}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (errorText.includes('invalid_grant')) {
      throw new Error('TOKEN_EXPIRED');
    }
    throw new Error(`Failed to refresh token: ${response.status}`);
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };
}

// Access Token 가져오기
async function getAccessToken(): Promise<{ token: string; newTokenData?: TokenData }> {
  const tokenData = await loadToken();

  if (!tokenData) {
    throw new Error('NO_TOKEN');
  }

  // 토큰이 유효한지 확인 (만료 5분 전에 갱신)
  if (tokenData.expiresAt > Date.now() + 5 * 60 * 1000) {
    return { token: tokenData.accessToken };
  }

  // 토큰 갱신
  if (tokenData.refreshToken) {
    const newToken = await refreshAccessToken(tokenData.refreshToken);
    await saveTokenToKV(newToken);
    return { token: newToken.accessToken, newTokenData: newToken };
  }

  throw new Error('NO_TOKEN');
}

// Ad Effect 데이터 응답 인터페이스
interface AdEffectItem {
  ad: string;
  keyword: string;
  visit_count: number;
  visit_rate: number;
  purchase_count: number;
  purchase_rate: number;
  order_amount: number;
  order_amount_per_visitor: number;
  order_amount_per_buyer: number;
}

interface AdEffectResponse {
  resource: AdEffectItem | AdEffectItem[];
}

// Ad Effect 데이터 조회
async function fetchAdEffectData(
  accessToken: string,
  startDate: string,
  endDate: string,
  options?: {
    deviceType?: 'pc' | 'mobile' | 'total';
    limit?: number;
    offset?: number;
    sort?: 'ad' | 'keyword' | 'visit_count' | 'purchase_count';
    order?: 'asc' | 'desc';
  }
): Promise<AdEffectItem[]> {
  const url = new URL(`${CAFE24_DATA_API_URL}/adeffect/addetails`);
  url.searchParams.set('mall_id', CAFE24_MALL_ID);
  url.searchParams.set('start_date', startDate);
  url.searchParams.set('end_date', endDate);
  url.searchParams.set('limit', String(options?.limit || 1000));

  if (options?.offset) {
    url.searchParams.set('offset', String(options.offset));
  }
  if (options?.deviceType) {
    url.searchParams.set('device_type', options.deviceType);
  }
  if (options?.sort) {
    url.searchParams.set('sort', options.sort);
  }
  if (options?.order) {
    url.searchParams.set('order', options.order);
  }

  console.log('[AdEffect] Fetching:', url.toString());

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[AdEffect] API Error:', response.status, errorText);
    throw new Error(`Ad Effect API Error: ${response.status} - ${errorText}`);
  }

  const data: AdEffectResponse = await response.json();

  // resource가 배열이 아닌 경우 배열로 변환
  if (Array.isArray(data.resource)) {
    return data.resource;
  } else if (data.resource) {
    return [data.resource];
  }

  return [];
}

// KST 기준 오늘 날짜
function getTodayDateKST(): string {
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstDate = new Date(now.getTime() + kstOffset);
  return kstDate.toISOString().split('T')[0];
}

// KST 기준 어제 날짜
function getYesterdayDateKST(): string {
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstDate = new Date(now.getTime() + kstOffset - 24 * 60 * 60 * 1000);
  return kstDate.toISOString().split('T')[0];
}

export async function GET(request: NextRequest) {
  // 세션 체크
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const startDate = searchParams.get('startDate') || getYesterdayDateKST();
  const endDate = searchParams.get('endDate') || startDate;
  const deviceType = searchParams.get('deviceType') as 'pc' | 'mobile' | 'total' | null;
  const sort = searchParams.get('sort') as 'ad' | 'keyword' | 'visit_count' | 'purchase_count' | null;
  const order = searchParams.get('order') as 'asc' | 'desc' | null;

  try {
    // Access Token 가져오기
    const { token, newTokenData } = await getAccessToken();

    // Ad Effect 데이터 조회
    const adEffectData = await fetchAdEffectData(token, startDate, endDate, {
      deviceType: deviceType || undefined,
      sort: sort || 'purchase_count',
      order: order || 'desc',
      limit: 1000,
    });

    // 요약 계산
    const summary = {
      totalVisits: adEffectData.reduce((sum, item) => sum + (item.visit_count || 0), 0),
      totalPurchases: adEffectData.reduce((sum, item) => sum + (item.purchase_count || 0), 0),
      totalRevenue: adEffectData.reduce((sum, item) => sum + (item.order_amount || 0), 0),
      avgConversionRate: 0,
    };

    // 평균 전환율 계산
    if (summary.totalVisits > 0) {
      summary.avgConversionRate = (summary.totalPurchases / summary.totalVisits) * 100;
    }

    // 응답 생성
    const responseData = {
      success: true,
      startDate,
      endDate,
      mallId: CAFE24_MALL_ID,
      data: adEffectData,
      summary,
      lastUpdated: new Date().toISOString(),
    };

    // 새 토큰이 있으면 쿠키에 저장
    const response = NextResponse.json(responseData);
    if (newTokenData) {
      const cookieStore = await cookies();
      cookieStore.set(COOKIE_NAME, JSON.stringify(newTokenData), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 14, // 14일
      });
    }

    return response;
  } catch (error) {
    console.error('[AdEffect] Error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage === 'NO_TOKEN' || errorMessage === 'TOKEN_EXPIRED') {
      return NextResponse.json({
        success: false,
        error: 'Cafe24 인증이 필요합니다.',
        needsAuth: true,
      }, { status: 401 });
    }

    return NextResponse.json({
      success: false,
      error: errorMessage,
    }, { status: 500 });
  }
}
