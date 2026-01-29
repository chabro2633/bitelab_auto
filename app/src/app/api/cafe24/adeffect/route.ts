import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../../lib/session';
import { cookies } from 'next/headers';
import { kv } from '@vercel/kv';

// Cafe24 API 설정
const CAFE24_CLIENT_ID = process.env.CAFE24_CLIENT_ID || 'SUeffNXsNJDK9fv5it5Ygg';
const CAFE24_CLIENT_SECRET = process.env.CAFE24_CLIENT_SECRET || '8yMByUfsICdGJQm6ziS07F';
const CAFE24_MALL_ID = process.env.CAFE24_MALL_ID || 'baruner';

// Cafe24 Data API Base URL
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
    console.error('[ProductConversion] Failed to load token from KV:', error);
  }
  return null;
}

// Vercel KV에 토큰 저장
async function saveTokenToKV(token: TokenData): Promise<void> {
  try {
    await kv.set(KV_TOKEN_KEY, token);
  } catch (error) {
    console.error('[ProductConversion] Failed to save token to KV:', error);
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
    console.error('[ProductConversion] Failed to load token from cookie:', error);
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

// Products View 응답 인터페이스
interface ProductViewItem {
  product_no: number;
  product_name: string;
  count: number; // 상품 상세 페이지 조회수
}

interface ProductViewResponse {
  resource: ProductViewItem | ProductViewItem[];
}

// Products Sales 응답 인터페이스
interface ProductSalesItem {
  product_no: number;
  product_name: string;
  order_count: number;       // 주문 건수
  order_product_count: number; // 판매 수량
  order_amount: number;      // 매출액
}

interface ProductSalesResponse {
  resource: ProductSalesItem | ProductSalesItem[];
}

// 제품별 전환율 데이터
interface ProductConversionItem {
  product_no: number;
  product_name: string;
  view_count: number;        // 조회수
  order_count: number;       // 주문 건수
  order_product_count: number; // 판매 수량
  order_amount: number;      // 매출액
  conversion_rate: number;   // 전환율 (order_count / view_count * 100)
}

// Products View 데이터 조회
async function fetchProductsView(
  accessToken: string,
  startDate: string,
  endDate: string,
  limit: number = 1000
): Promise<ProductViewItem[]> {
  const url = new URL(`${CAFE24_DATA_API_URL}/products/view`);
  url.searchParams.set('mall_id', CAFE24_MALL_ID);
  url.searchParams.set('start_date', startDate);
  url.searchParams.set('end_date', endDate);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('sort', 'count');
  url.searchParams.set('order', 'desc');

  console.log('[ProductConversion] Fetching Products View:', url.toString());
  console.log('[ProductConversion] Token prefix:', accessToken?.substring(0, 20) + '...');

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  const responseText = await response.text();
  console.log('[ProductConversion] Products View Response:', response.status, responseText.substring(0, 500));

  if (!response.ok) {
    console.error('[ProductConversion] Products View API Error:', response.status, responseText);
    throw new Error(`Products View API Error: ${response.status} - ${responseText}`);
  }

  let data: ProductViewResponse;
  try {
    data = JSON.parse(responseText);
  } catch {
    console.error('[ProductConversion] Failed to parse Products View response');
    return [];
  }

  console.log('[ProductConversion] Products View data count:', Array.isArray(data.resource) ? data.resource.length : (data.resource ? 1 : 0));

  if (Array.isArray(data.resource)) {
    return data.resource;
  } else if (data.resource) {
    return [data.resource];
  }

  return [];
}

// Products Sales 데이터 조회
async function fetchProductsSales(
  accessToken: string,
  startDate: string,
  endDate: string,
  limit: number = 1000
): Promise<ProductSalesItem[]> {
  const url = new URL(`${CAFE24_DATA_API_URL}/products/sales`);
  url.searchParams.set('mall_id', CAFE24_MALL_ID);
  url.searchParams.set('start_date', startDate);
  url.searchParams.set('end_date', endDate);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('sort', 'order_amount');
  url.searchParams.set('order', 'desc');

  console.log('[ProductConversion] Fetching Products Sales:', url.toString());

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  const responseText = await response.text();
  console.log('[ProductConversion] Products Sales Response:', response.status, responseText.substring(0, 500));

  if (!response.ok) {
    console.error('[ProductConversion] Products Sales API Error:', response.status, responseText);
    throw new Error(`Products Sales API Error: ${response.status} - ${responseText}`);
  }

  let data: ProductSalesResponse;
  try {
    data = JSON.parse(responseText);
  } catch {
    console.error('[ProductConversion] Failed to parse Products Sales response');
    return [];
  }

  console.log('[ProductConversion] Products Sales data count:', Array.isArray(data.resource) ? data.resource.length : (data.resource ? 1 : 0));

  if (Array.isArray(data.resource)) {
    return data.resource;
  } else if (data.resource) {
    return [data.resource];
  }

  return [];
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
  const sortBy = searchParams.get('sort') as 'view_count' | 'order_count' | 'order_amount' | 'conversion_rate' | null;
  const order = searchParams.get('order') as 'asc' | 'desc' | null;
  const debug = searchParams.get('debug') === 'true';

  try {
    // Access Token 가져오기
    const { token, newTokenData } = await getAccessToken();
    console.log('[ProductConversion] Got access token, length:', token?.length || 0);

    // Products View와 Products Sales 데이터 병렬 조회
    const [viewData, salesData] = await Promise.all([
      fetchProductsView(token, startDate, endDate),
      fetchProductsSales(token, startDate, endDate),
    ]);

    console.log('[ProductConversion] View data count:', viewData.length);
    console.log('[ProductConversion] Sales data count:', salesData.length);

    // 디버그 모드면 raw 데이터 반환
    if (debug) {
      return NextResponse.json({
        debug: true,
        startDate,
        endDate,
        tokenLength: token?.length || 0,
        viewData: viewData.slice(0, 5), // 처음 5개만
        salesData: salesData.slice(0, 5), // 처음 5개만
        viewDataCount: viewData.length,
        salesDataCount: salesData.length,
      });
    }

    // 조회수 맵 생성 (product_no -> view_count)
    const viewMap = new Map<number, ProductViewItem>();
    for (const item of viewData) {
      viewMap.set(item.product_no, item);
    }

    // 판매 맵 생성 (product_no -> sales data)
    const salesMap = new Map<number, ProductSalesItem>();
    for (const item of salesData) {
      salesMap.set(item.product_no, item);
    }

    // 모든 제품 번호 수집
    const allProductNos = new Set<number>([
      ...viewData.map(v => v.product_no),
      ...salesData.map(s => s.product_no),
    ]);

    // 전환율 데이터 생성
    const conversionData: ProductConversionItem[] = [];

    for (const productNo of allProductNos) {
      const viewItem = viewMap.get(productNo);
      const salesItem = salesMap.get(productNo);

      const viewCount = viewItem?.count || 0;
      const orderCount = salesItem?.order_count || 0;
      const orderProductCount = salesItem?.order_product_count || 0;
      const orderAmount = salesItem?.order_amount || 0;
      const productName = viewItem?.product_name || salesItem?.product_name || `Product ${productNo}`;

      // 전환율 계산 (조회수가 0이면 0%)
      const conversionRate = viewCount > 0 ? (orderCount / viewCount) * 100 : 0;

      conversionData.push({
        product_no: productNo,
        product_name: productName,
        view_count: viewCount,
        order_count: orderCount,
        order_product_count: orderProductCount,
        order_amount: orderAmount,
        conversion_rate: conversionRate,
      });
    }

    // 정렬
    const sortField = sortBy || 'order_amount';
    const sortOrder = order || 'desc';

    conversionData.sort((a, b) => {
      const aVal = a[sortField] || 0;
      const bVal = b[sortField] || 0;
      return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
    });

    // 요약 계산
    const summary = {
      totalViews: conversionData.reduce((sum, item) => sum + item.view_count, 0),
      totalOrders: conversionData.reduce((sum, item) => sum + item.order_count, 0),
      totalProductsSold: conversionData.reduce((sum, item) => sum + item.order_product_count, 0),
      totalRevenue: conversionData.reduce((sum, item) => sum + item.order_amount, 0),
      avgConversionRate: 0,
    };

    // 평균 전환율 계산
    if (summary.totalViews > 0) {
      summary.avgConversionRate = (summary.totalOrders / summary.totalViews) * 100;
    }

    // 응답 생성
    const responseData = {
      success: true,
      startDate,
      endDate,
      mallId: CAFE24_MALL_ID,
      data: conversionData,
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
    console.error('[ProductConversion] Error:', error);

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
