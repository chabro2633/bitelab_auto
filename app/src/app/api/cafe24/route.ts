import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/session';
import { cookies } from 'next/headers';

// Cafe24 API 설정
const CAFE24_CLIENT_ID = process.env.CAFE24_CLIENT_ID || 'SUeffNXsNJDK9fv5it5Ygg';
const CAFE24_CLIENT_SECRET = process.env.CAFE24_CLIENT_SECRET || '8yMByUfsICdGJQm6ziS07F';
const CAFE24_MALL_ID = process.env.CAFE24_MALL_ID || 'baruner';
const CAFE24_REDIRECT_URI = process.env.CAFE24_REDIRECT_URI || 'https://app-bitelab.vercel.app/api/cafe24/callback';

// 토큰 저장/불러오기
interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

const COOKIE_NAME = 'cafe24_token';

async function loadTokenFromCookie(): Promise<TokenData | null> {
  // 1. 먼저 쿠키에서 토큰 확인 (브라우저 세션용 - 우선)
  try {
    const cookieStore = await cookies();
    const tokenCookie = cookieStore.get(COOKIE_NAME);
    console.log('[Cafe24] Cookie check:', tokenCookie ? 'found' : 'not found');
    if (tokenCookie) {
      const parsed = JSON.parse(tokenCookie.value);
      console.log('[Cafe24] Parsed cookie:', { hasAccess: !!parsed.accessToken, hasRefresh: !!parsed.refreshToken, expiresAt: parsed.expiresAt });
      // 쿠키 토큰이 유효하면 사용
      if (parsed.accessToken && parsed.refreshToken) {
        return parsed;
      }
    }
  } catch (error) {
    console.error('[Cafe24] Failed to load token from cookie:', error);
  }

  // 2. 환경변수에서 토큰 확인 (GitHub Actions용 - fallback)
  const envToken = process.env.CAFE24_REFRESH_TOKEN;
  if (envToken) {
    console.log('Using CAFE24_REFRESH_TOKEN from environment variable');
    return {
      accessToken: '', // 빈 값 - refresh로 갱신됨
      refreshToken: envToken,
      expiresAt: 0, // 만료됨 - refresh 필요
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
    console.error('Token refresh failed:', response.status, errorText);
    // invalid_grant 에러는 refresh token이 만료되었음을 의미 - 재인증 필요
    if (errorText.includes('invalid_grant')) {
      throw new Error('TOKEN_EXPIRED');
    }
    throw new Error(`Failed to refresh token: ${response.status} - ${errorText}`);
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

// 어제 날짜 구하기 (KST 기준)
function getYesterdayDateKST(): string {
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstDate = new Date(now.getTime() + kstOffset);
  kstDate.setDate(kstDate.getDate() - 1);
  return kstDate.toISOString().split('T')[0];
}

// 단일 페이지 주문 가져오기
async function fetchOrderPage(accessToken: string, startDate: string, endDate: string, offset: number, limit: number) {
  const apiUrl = `https://${CAFE24_MALL_ID}.cafe24api.com/api/v2/admin/orders`;
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
    order_status: 'N00,N10,N20,N21,N22,N30,N40,N50',
    limit: String(limit),
    offset: String(offset),
    embed: 'items',
  });

  const response = await fetch(`${apiUrl}?${params}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Cafe24-Api-Version': '2024-06-01',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Cafe24] Orders API failed:', response.status, errorText);
    throw new Error(`Failed to fetch orders: ${errorText}`);
  }

  const data = await response.json();
  console.log(`[Cafe24] fetchOrderPage: offset=${offset}, returned ${data.orders?.length || 0} orders`);
  return data.orders || [];
}

// 단일 기간 주문 데이터 가져오기 (페이지네이션)
async function fetchOrdersForPeriod(accessToken: string, startDate: string, endDate: string) {
  const limit = 100;
  const allOrders: Array<Record<string, unknown>> = [];
  let currentOffset = 0;
  let hasMore = true;

  while (hasMore) {
    // 병렬로 10페이지씩 가져오기 (1000건씩)
    const parallelBatch = 10;
    const offsets = Array.from({ length: parallelBatch }, (_, i) => currentOffset + i * limit);

    const pagePromises = offsets.map(offset =>
      fetchOrderPage(accessToken, startDate, endDate, offset, limit).catch((err) => {
        console.error(`[Cafe24] Failed to fetch page at offset ${offset}:`, err);
        return [];
      })
    );

    const pages = await Promise.all(pagePromises);

    let fetchedInBatch = 0;
    let lastPageFull = true;

    for (const page of pages) {
      if (page.length > 0) {
        allOrders.push(...page);
        fetchedInBatch += page.length;
      }
      if (page.length < limit) {
        lastPageFull = false;
        break;
      }
    }

    currentOffset += parallelBatch * limit;

    if (!lastPageFull || fetchedInBatch === 0) {
      hasMore = false;
    }
  }

  return allOrders;
}

// 주문 데이터 가져오기 (기간 분할 + 병렬 처리로 최적화)
async function fetchOrders(accessToken: string, startDate: string, endDate: string) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  console.log(`[Cafe24] Fetching orders for period ${startDate} ~ ${endDate} (${diffDays} days)`);

  // 기간이 5일 이하면 단일 요청
  if (diffDays <= 5) {
    const orders = await fetchOrdersForPeriod(accessToken, startDate, endDate);
    console.log(`[Cafe24] Total orders fetched: ${orders.length}`);
    return { orders };
  }

  // 기간을 3일 단위로 분할하여 병렬 요청
  const chunkDays = 3;
  const dateRanges: Array<{ start: string; end: string }> = [];

  let currentStart = new Date(start);
  while (currentStart <= end) {
    const chunkEnd = new Date(currentStart);
    chunkEnd.setDate(chunkEnd.getDate() + chunkDays - 1);

    // 종료일이 전체 종료일을 넘지 않도록
    const actualEnd = chunkEnd > end ? end : chunkEnd;

    const formatDate = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    dateRanges.push({
      start: formatDate(currentStart),
      end: formatDate(actualEnd)
    });

    currentStart = new Date(actualEnd);
    currentStart.setDate(currentStart.getDate() + 1);
  }

  console.log(`[Cafe24] Split into ${dateRanges.length} date ranges`);

  // 3개씩 배치로 병렬 요청 (API rate limit 회피하면서 속도 확보)
  const allOrders: Array<Record<string, unknown>> = [];
  const batchSize = 3;

  for (let i = 0; i < dateRanges.length; i += batchSize) {
    const batch = dateRanges.slice(i, i + batchSize);
    console.log(`[Cafe24] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(dateRanges.length / batchSize)}`);

    const batchPromises = batch.map(range =>
      fetchOrdersForPeriod(accessToken, range.start, range.end).catch((err) => {
        console.error(`[Cafe24] Failed to fetch orders for ${range.start} ~ ${range.end}:`, err);
        return [];
      })
    );

    const batchResults = await Promise.all(batchPromises);
    for (const orders of batchResults) {
      allOrders.push(...orders);
    }
    console.log(`[Cafe24] Batch complete, total orders so far: ${allOrders.length}`);
  }

  // 디버그 로그
  if (allOrders.length > 0) {
    const firstOrder = allOrders[0];
    console.log('[Cafe24 Debug] First order:', {
      order_id: firstOrder.order_id,
      payment_amount: firstOrder.payment_amount,
      actual_order_amount: firstOrder.actual_order_amount,
    });
  }

  console.log(`[Cafe24] Total orders fetched: ${allOrders.length} for period ${startDate} ~ ${endDate}`);
  return { orders: allOrders };
}

// 취소/환불 상태 코드
const CANCEL_REFUND_STATUSES = ['C00', 'C10', 'C34', 'R00', 'R10', 'R12', 'E00', 'E10', 'E12'];
// 입금대기 상태
const PENDING_PAYMENT_STATUSES = ['N00'];

// 주문에서 실제 결제 금액 계산 (네이버페이 적립금 등 포함)
function getOrderTotalAmount(order: Record<string, unknown>): number {
  // 우선순위: actual_order_amount.payment_amount > payment_amount > 상품금액 합계

  // 1. actual_order_amount가 있으면 그 안의 payment_amount 사용
  const actualOrderAmount = order.actual_order_amount as Record<string, string> | undefined;
  if (actualOrderAmount?.payment_amount) {
    return Math.round(parseFloat(actualOrderAmount.payment_amount));
  }

  // 2. 루트 레벨의 payment_amount
  if (order.payment_amount) {
    return Math.round(parseFloat(String(order.payment_amount)));
  }

  // 3. total_order_amount (상품 총액)
  if (order.total_order_amount) {
    return Math.round(parseFloat(String(order.total_order_amount)));
  }

  // 4. order_price_amount (주문 금액)
  if (order.order_price_amount) {
    const orderPrice = Math.round(parseFloat(String(order.order_price_amount)));
    // 적립금, 쿠폰 할인 등 차감 내역이 있으면 빼기
    const pointsUsed = Math.round(parseFloat(String(order.points_used || '0')));
    const creditsUsed = Math.round(parseFloat(String(order.credits_used || '0')));
    const couponDiscount = Math.round(parseFloat(String(order.coupon_discount_price || '0')));
    return orderPrice - pointsUsed - creditsUsed - couponDiscount;
  }

  return 0;
}

// 부가세 제외 금액 계산 (VAT 10% 제외)
function excludeVAT(amount: number): number {
  return Math.round(amount / 1.1);
}

// 주문 통계 계산
function calculateOrderStats(orders: Array<Record<string, unknown>>) {
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
    const amount = getOrderTotalAmount(order);

    // 결제 방법 집계
    const paymentMethodArr = order.payment_method as string[] | undefined;
    const paymentMethod = paymentMethodArr?.[0] || 'unknown';
    paymentMethodCount[paymentMethod] = (paymentMethodCount[paymentMethod] || 0) + 1;

    // 주문 내 첫 번째 아이템의 상태로 주문 상태 판단
    const items = order.items as Array<{ order_status?: string; quantity?: number }> | undefined;
    const primaryStatus = items?.[0]?.order_status || 'unknown';

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

    if (items) {
      for (const item of items) {
        totalItems += item.quantity || 1;
        const status = item.order_status || 'unknown';
        orderStatusCount[status] = (orderStatusCount[status] || 0) + 1;
      }
    }
  }

  // 부가세 제외 금액 계산
  const totalAmountExVAT = excludeVAT(totalAmount);
  const pendingAmountExVAT = excludeVAT(pendingAmount);
  const cancelRefundAmountExVAT = excludeVAT(cancelRefundAmount);

  return {
    totalAmount: totalAmountExVAT,  // 유효 매출 (부가세 제외)
    totalOrders,  // 전체 주문 수
    validOrders,  // 유효 주문 수
    totalItems,
    averageOrderValue: validOrders > 0 ? Math.round(totalAmountExVAT / validOrders) : 0,
    pendingAmount: pendingAmountExVAT,  // 입금대기 금액 (부가세 제외)
    pendingOrders,  // 입금대기 주문 수
    cancelRefundAmount: cancelRefundAmountExVAT,  // 취소/환불 금액 (부가세 제외)
    cancelRefundOrders,  // 취소/환불 주문 수
    orderStatusCount,
    paymentMethodCount,
  };
}

// 탑 상품 계산 (매출/판매수량 기준)
function calculateTopProducts(orders: Array<Record<string, unknown>>, limit: number = 5) {
  const productStats: Record<string, { name: string; quantity: number; sales: number }> = {};

  for (const order of orders) {
    const items = order.items as Array<{
      order_status?: string;
      product_name?: string;
      quantity?: number;
      product_price?: string;
    }> | undefined;

    if (items) {
      for (const item of items) {
        // 취소/환불 상품은 제외
        if (CANCEL_REFUND_STATUSES.includes(item.order_status || '')) continue;
        // 입금대기 상품도 제외
        if (PENDING_PAYMENT_STATUSES.includes(item.order_status || '')) continue;

        const name = item.product_name || '상품명 없음';
        const quantity = item.quantity || 1;
        const price = parseFloat(item.product_price || '0');
        const sales = excludeVAT(Math.round(price * quantity));  // 부가세 제외

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

// 일자별 매출 계산
function calculateDailySales(orders: Array<Record<string, unknown>>) {
  const dailyStats: Record<string, { date: string; sales: number; orders: number }> = {};

  for (const order of orders) {
    // 주문 날짜 추출 (YYYY-MM-DD)
    const orderDate = String(order.order_date || '').split('T')[0];
    if (!orderDate) continue;

    // 주문 내 첫 번째 아이템의 상태로 주문 상태 판단
    const items = order.items as Array<{ order_status?: string }> | undefined;
    const primaryStatus = items?.[0]?.order_status || '';

    // 입금대기, 취소/환불은 제외
    if (PENDING_PAYMENT_STATUSES.includes(primaryStatus)) continue;
    if (CANCEL_REFUND_STATUSES.includes(primaryStatus)) continue;

    const amount = excludeVAT(getOrderTotalAmount(order));  // 부가세 제외

    if (!dailyStats[orderDate]) {
      dailyStats[orderDate] = { date: orderDate, sales: 0, orders: 0 };
    }
    dailyStats[orderDate].sales += amount;
    dailyStats[orderDate].orders += 1;
  }

  // 날짜순 정렬 (오래된순 - ASC)
  return Object.values(dailyStats).sort((a, b) => a.date.localeCompare(b.date));
}

// 시간별 매출 계산 (0~23시)
function calculateHourlySales(orders: Array<Record<string, unknown>>) {
  // 0~23시까지 초기화
  const hourlyStats: Record<number, { hour: number; sales: number; orders: number }> = {};
  for (let i = 0; i < 24; i++) {
    hourlyStats[i] = { hour: i, sales: 0, orders: 0 };
  }

  for (const order of orders) {
    // 주문 시간 추출
    const orderDateStr = String(order.order_date || '');
    if (!orderDateStr) continue;

    // 주문 내 첫 번째 아이템의 상태로 주문 상태 판단
    const items = order.items as Array<{ order_status?: string }> | undefined;
    const primaryStatus = items?.[0]?.order_status || '';

    // 입금대기, 취소/환불은 제외
    if (PENDING_PAYMENT_STATUSES.includes(primaryStatus)) continue;
    if (CANCEL_REFUND_STATUSES.includes(primaryStatus)) continue;

    // 시간 추출 (KST 기준)
    const orderDate = new Date(orderDateStr);
    // UTC+9 적용
    const kstHour = (orderDate.getUTCHours() + 9) % 24;

    const amount = excludeVAT(getOrderTotalAmount(order));  // 부가세 제외

    hourlyStats[kstHour].sales += amount;
    hourlyStats[kstHour].orders += 1;
  }

  // 0시부터 23시까지 순서대로 반환
  return Object.values(hourlyStats).sort((a, b) => a.hour - b.hour);
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
  // API Key 인증 체크 (GitHub Actions에서 호출 시 사용)
  const apiKey = request.headers.get('X-API-Key');
  const validApiKey = process.env.CAFE24_API_KEY;
  const isApiKeyAuth = apiKey && validApiKey && apiKey === validApiKey;

  // API Key 인증이 아닌 경우 세션 체크
  if (!isApiKeyAuth) {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
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
      if (error instanceof Error && (error.message === 'NO_TOKEN' || error.message === 'TOKEN_EXPIRED')) {
        return NextResponse.json({
          success: false,
          needsAuth: true,
          authUrl: getAuthUrl(),
          error: error.message === 'TOKEN_EXPIRED'
            ? 'Cafe24 인증이 만료되었습니다. 아래 버튼을 클릭하여 다시 인증해주세요.'
            : 'Cafe24 인증이 필요합니다. 아래 버튼을 클릭하여 인증해주세요.',
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

    // 일자별 매출 계산
    const dailySales = calculateDailySales(orders);

    // 시간별 매출 계산
    const hourlySales = calculateHourlySales(orders);

    // 어제 데이터 조회 (오늘 날짜 조회인 경우에만)
    let yesterdayHourlySales: Array<{ hour: number; sales: number; orders: number }> | undefined;
    let yesterdayStats: { totalSales: number; totalOrders: number } | undefined;

    // 어제 TOP5 상품
    let yesterdayTopProducts: Array<{ name: string; quantity: number; sales: number }> | undefined;

    const todayDate = getTodayDateKST();
    if (startDate === todayDate && endDate === todayDate) {
      const yesterdayDate = getYesterdayDateKST();
      try {
        const yesterdayOrdersData = await fetchOrders(accessToken, yesterdayDate, yesterdayDate);
        const yesterdayOrders = yesterdayOrdersData.orders || [];
        const yesterdayStatsCalc = calculateOrderStats(yesterdayOrders);
        yesterdayHourlySales = calculateHourlySales(yesterdayOrders);
        yesterdayTopProducts = calculateTopProducts(yesterdayOrders, 5);
        yesterdayStats = {
          totalSales: yesterdayStatsCalc.totalAmount,
          totalOrders: yesterdayStatsCalc.totalOrders,
        };
      } catch (error) {
        console.error('Failed to fetch yesterday data:', error);
      }
    }

    // 주문 상태 라벨 변환
    const orderStatusWithLabels = Object.entries(stats.orderStatusCount).map(([status, count]) => ({
      status,
      label: getOrderStatusLabel(status),
      count,
    }));

    // 최근 주문 목록 (최신 10개)
    const recentOrders = orders.slice(0, 10).map((order: Record<string, unknown>) => {
      const items = order.items as Array<{ product_name: string; order_status: string }> | undefined;
      const actualOrderAmount = order.actual_order_amount as { payment_amount: string } | undefined;
      const rawAmount = Math.round(parseFloat(String(order.payment_amount || actualOrderAmount?.payment_amount || '0')));
      return {
        orderId: String(order.order_id || ''),
        orderDate: String(order.order_date || ''),
        status: getOrderStatusLabel(items?.[0]?.order_status || 'unknown'),
        amount: excludeVAT(rawAmount),  // 부가세 제외
        productName: items?.[0]?.product_name || '상품정보 없음',
        itemCount: items?.length || 0,
      };
    });

    // 디버그 로그
    console.log(`[Cafe24] API Response: ${startDate}~${endDate}, orders=${orders.length}, totalSales=${stats.totalAmount}`);

    const response = NextResponse.json({
      success: true,
      startDate,
      endDate,
      mallId: CAFE24_MALL_ID,
      brandName: '바르너',
      // 디버그 정보 (임시)
      debug: {
        totalOrdersFromAPI: orders.length,
        queryDate: { startDate, endDate },
        hasToken: !!accessToken,
        tokenLength: accessToken?.length || 0,
      },
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
      yesterdayTopProducts,
      dailySales,
      hourlySales,
      recentOrders,
      yesterdayHourlySales,
      yesterdayStats,
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
