import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/session';
import { cookies } from 'next/headers';

// Cafe24 API 설정
const CAFE24_CLIENT_ID = process.env.CAFE24_CLIENT_ID || 'SUeffNXsNJDK9fv5it5Ygg';
const CAFE24_CLIENT_SECRET = process.env.CAFE24_CLIENT_SECRET || '8yMByUfsICdGJQm6ziS07F';
const CAFE24_MALL_ID = process.env.CAFE24_MALL_ID || 'baruner';
const CAFE24_REDIRECT_URI = process.env.CAFE24_REDIRECT_URI || 'http://localhost:3005/api/cafe24/callback';

// 토큰 저장/불러오기
interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

const COOKIE_NAME = 'cafe24_token';

async function loadTokenFromCookie(): Promise<TokenData | null> {
  try {
    const cookieStore = await cookies();
    const tokenCookie = cookieStore.get(COOKIE_NAME);
    if (tokenCookie) {
      return JSON.parse(tokenCookie.value);
    }
  } catch (error) {
    console.error('Failed to load token from cookie:', error);
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
    console.error('Token refresh failed:', errorText);
    throw new Error('Failed to refresh token');
  }

  const data = await response.json();

  const tokenData: TokenData = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };

  return tokenData;
}

// Access Token 가져오기 (캐시 또는 갱신)
async function getAccessToken(): Promise<{ token: string; newTokenData?: TokenData }> {
  const tokenData = await loadTokenFromCookie();

  if (!tokenData) {
    throw new Error('NO_TOKEN');
  }

  // 토큰이 아직 유효한지 확인 (만료 5분 전에 갱신)
  if (tokenData.expiresAt > Date.now() + 5 * 60 * 1000) {
    return { token: tokenData.accessToken };
  }

  // 토큰 갱신
  if (tokenData.refreshToken) {
    const newToken = await refreshAccessToken(tokenData.refreshToken);
    return { token: newToken.accessToken, newTokenData: newToken };
  }

  throw new Error('NO_TOKEN');
}

// 오늘 날짜 구하기 (KST 기준)
function getTodayDateKST(): string {
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstDate = new Date(now.getTime() + kstOffset);
  return kstDate.toISOString().split('T')[0];
}

// 주문 데이터 가져오기
async function fetchOrders(accessToken: string, startDate: string, endDate: string) {
  const apiUrl = `https://${CAFE24_MALL_ID}.cafe24api.com/api/v2/admin/orders`;

  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
    order_status: 'N00,N10,N20,N21,N22,N30,N40',
    limit: '100',
    embed: 'items',
  });

  const response = await fetch(`${apiUrl}?${params}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Cafe24-Api-Version': '2025-06-01',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Orders API failed:', errorText);
    throw new Error(`Failed to fetch orders: ${errorText}`);
  }

  return response.json();
}

// 취소/환불 상태 코드
const CANCEL_REFUND_STATUSES = ['C00', 'C10', 'C34', 'R00', 'R10', 'R12', 'E00', 'E10', 'E12'];
// 입금대기 상태
const PENDING_PAYMENT_STATUSES = ['N00'];

// 주문이 유효한 매출인지 확인 (입금확인 이상, 취소/환불 제외)
function isValidSalesOrder(orderStatus: string): boolean {
  // 입금대기(N00)는 제외
  if (PENDING_PAYMENT_STATUSES.includes(orderStatus)) return false;
  // 취소/환불 상태는 제외
  if (CANCEL_REFUND_STATUSES.includes(orderStatus)) return false;
  return true;
}

// 주문 통계 계산
function calculateOrderStats(orders: Array<{
  order_id: string;
  order_date: string;
  payment_amount: string;
  payment_method: string[];
  actual_order_amount?: { payment_amount: string };
  items?: Array<{ product_name: string; quantity: number; product_price: string; order_status: string }>;
}>) {
  let totalAmount = 0;  // 유효 매출 (입금확인 이상, 취소/환불 제외)
  let totalOrders = 0;  // 전체 주문 수
  let validOrders = 0;  // 유효 주문 수
  let totalItems = 0;
  let pendingAmount = 0;  // 입금대기 금액
  let pendingOrders = 0;  // 입금대기 주문 수
  let cancelRefundAmount = 0;  // 취소/환불 금액
  let cancelRefundOrders = 0;  // 취소/환불 주문 수
  const orderStatusCount: Record<string, number> = {};
  const paymentMethodCount: Record<string, number> = {};

  for (const order of orders) {
    totalOrders++;
    const paymentAmount = parseFloat(order.payment_amount || order.actual_order_amount?.payment_amount || '0');
    const amount = Math.round(paymentAmount);

    // 결제 방법 집계
    const paymentMethod = order.payment_method?.[0] || 'unknown';
    paymentMethodCount[paymentMethod] = (paymentMethodCount[paymentMethod] || 0) + 1;

    // 주문 내 첫 번째 아이템의 상태로 주문 상태 판단
    const primaryStatus = order.items?.[0]?.order_status || 'unknown';

    // 상태별 집계
    if (PENDING_PAYMENT_STATUSES.includes(primaryStatus)) {
      pendingAmount += amount;
      pendingOrders++;
    } else if (CANCEL_REFUND_STATUSES.includes(primaryStatus)) {
      cancelRefundAmount += amount;
      cancelRefundOrders++;
    } else {
      // 유효 매출 (입금확인 이상)
      totalAmount += amount;
      validOrders++;
    }

    if (order.items) {
      for (const item of order.items) {
        totalItems += item.quantity || 1;
        const status = item.order_status || 'unknown';
        orderStatusCount[status] = (orderStatusCount[status] || 0) + 1;
      }
    }
  }

  return {
    totalAmount,  // 유효 매출만
    totalOrders,  // 전체 주문 수
    validOrders,  // 유효 주문 수
    totalItems,
    averageOrderValue: validOrders > 0 ? Math.round(totalAmount / validOrders) : 0,
    pendingAmount,  // 입금대기 금액
    pendingOrders,  // 입금대기 주문 수
    cancelRefundAmount,  // 취소/환불 금액
    cancelRefundOrders,  // 취소/환불 주문 수
    orderStatusCount,
    paymentMethodCount,
  };
}

// 탑 상품 계산 (매출/판매수량 기준)
function calculateTopProducts(orders: Array<{
  items?: Array<{
    product_name: string;
    quantity: number;
    product_price: string;
    order_status: string;
  }>;
}>, limit: number = 5) {
  const productStats: Record<string, { name: string; quantity: number; sales: number }> = {};

  for (const order of orders) {
    if (order.items) {
      for (const item of order.items) {
        // 취소/환불 상품은 제외
        if (CANCEL_REFUND_STATUSES.includes(item.order_status)) continue;
        // 입금대기 상품도 제외
        if (PENDING_PAYMENT_STATUSES.includes(item.order_status)) continue;

        const name = item.product_name || '상품명 없음';
        const quantity = item.quantity || 1;
        const price = parseFloat(item.product_price || '0');
        const sales = Math.round(price * quantity);

        if (!productStats[name]) {
          productStats[name] = { name, quantity: 0, sales: 0 };
        }
        productStats[name].quantity += quantity;
        productStats[name].sales += sales;
      }
    }
  }

  // 매출 기준으로 정렬하고 상위 N개 반환
  return Object.values(productStats)
    .sort((a, b) => b.sales - a.sales)
    .slice(0, limit);
}

// 주문 상태 한글 변환
function getOrderStatusLabel(status: string): string {
  const statusMap: Record<string, string> = {
    'N00': '입금대기',
    'N10': '입금확인',
    'N20': '배송준비중',
    'N21': '배송대기',
    'N22': '배송보류',
    'N30': '배송중',
    'N40': '배송완료',
    'N50': '구매확정',
    'C00': '취소신청',
    'C10': '취소접수',
    'C34': '취소완료',
    'R00': '반품신청',
    'R10': '반품접수',
    'R12': '반품완료',
    'E00': '교환신청',
    'E10': '교환접수',
    'E12': '교환완료',
  };
  return statusMap[status] || status;
}

// OAuth 인증 URL 생성
function getAuthUrl(): string {
  // Cafe24 scope: 주문 데이터만 필요하므로 최소한의 권한만 요청
  const scope = 'mall.read_order mall.read_product mall.read_store';

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CAFE24_CLIENT_ID,
    redirect_uri: CAFE24_REDIRECT_URI,
    scope: scope,
    state: 'cafe24_auth',
  });

  return `https://${CAFE24_MALL_ID}.cafe24api.com/api/v2/oauth/authorize?${params}`;
}

export async function GET(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action');

  // OAuth 인증 시작
  if (action === 'auth') {
    const authUrl = getAuthUrl();
    return NextResponse.json({ authUrl, needsAuth: true });
  }

  // 인증 상태 확인
  if (action === 'status') {
    const tokenData = await loadTokenFromCookie();
    return NextResponse.json({
      authenticated: !!tokenData && tokenData.expiresAt > Date.now(),
      authUrl: getAuthUrl(),
    });
  }

  try {
    // 날짜 범위 지원: startDate, endDate 또는 단일 date
    const startDate = searchParams.get('startDate') || searchParams.get('date') || getTodayDateKST();
    const endDate = searchParams.get('endDate') || searchParams.get('date') || getTodayDateKST();

    // Access Token 가져오기
    let accessToken: string;
    let newTokenData: TokenData | undefined;
    try {
      const result = await getAccessToken();
      accessToken = result.token;
      newTokenData = result.newTokenData;
    } catch (error) {
      if (error instanceof Error && error.message === 'NO_TOKEN') {
        return NextResponse.json({
          success: false,
          needsAuth: true,
          authUrl: getAuthUrl(),
          error: 'Cafe24 인증이 필요합니다. 아래 버튼을 클릭하여 인증해주세요.',
        });
      }
      throw error;
    }

    // 주문 데이터 가져오기 (기간별)
    const ordersData = await fetchOrders(accessToken, startDate, endDate);
    const orders = ordersData.orders || [];

    // 통계 계산
    const stats = calculateOrderStats(orders);

    // 탑 5 상품 계산
    const topProducts = calculateTopProducts(orders, 5);

    // 주문 상태 라벨 변환
    const orderStatusWithLabels = Object.entries(stats.orderStatusCount).map(([status, count]) => ({
      status,
      label: getOrderStatusLabel(status),
      count,
    }));

    // 최근 주문 목록 (최신 10개)
    const recentOrders = orders.slice(0, 10).map((order: {
      order_id: string;
      order_date: string;
      payment_amount: string;
      actual_order_amount?: { payment_amount: string };
      items?: Array<{ product_name: string; order_status: string }>;
    }) => ({
      orderId: order.order_id,
      orderDate: order.order_date,
      status: getOrderStatusLabel(order.items?.[0]?.order_status || 'unknown'),
      amount: Math.round(parseFloat(order.payment_amount || order.actual_order_amount?.payment_amount || '0')),
      productName: order.items?.[0]?.product_name || '상품정보 없음',
      itemCount: order.items?.length || 0,
    }));

    const response = NextResponse.json({
      success: true,
      startDate,
      endDate,
      mallId: CAFE24_MALL_ID,
      brandName: '바르너',
      stats: {
        totalSales: stats.totalAmount,  // 유효 매출 (입금확인 이상, 취소/환불 제외)
        totalOrders: stats.totalOrders,  // 전체 주문 수
        validOrders: stats.validOrders,  // 유효 주문 수
        totalItems: stats.totalItems,
        averageOrderValue: stats.averageOrderValue,
        // 입금대기
        pendingAmount: stats.pendingAmount,
        pendingOrders: stats.pendingOrders,
        // 취소/환불
        cancelRefundAmount: stats.cancelRefundAmount,
        cancelRefundOrders: stats.cancelRefundOrders,
      },
      orderStatus: orderStatusWithLabels,
      paymentMethods: stats.paymentMethodCount,
      topProducts,
      recentOrders,
      lastUpdated: new Date().toISOString(),
    });

    // 토큰이 갱신되었으면 쿠키 업데이트
    if (newTokenData) {
      response.cookies.set(COOKIE_NAME, JSON.stringify(newTokenData), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 14, // 14일
      });
    }

    return response;

  } catch (error: unknown) {
    console.error('Cafe24 API error:', error);
    return NextResponse.json({
      error: `Failed to fetch sales data: ${error instanceof Error ? error.message : 'Unknown error'}`,
      success: false,
    }, { status: 500 });
  }
}
