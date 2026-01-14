import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/session';

// Slack Webhook URL (별도 채널용)
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL_HOURLY || process.env.SLACK_WEBHOOK_URL;

// KST 타임존
function getKSTDate(): Date {
  const now = new Date();
  const kstOffset = 9 * 60 * 60 * 1000;
  return new Date(now.getTime() + kstOffset);
}

function formatNumber(num: number): string {
  return num.toLocaleString('ko-KR');
}

function calculateChange(today: number, yesterday: number): { text: string; type: 'up' | 'down' | 'same' } {
  if (yesterday === 0) {
    if (today > 0) return { text: 'NEW', type: 'up' };
    return { text: '-', type: 'same' };
  }

  const changePercent = Math.round(((today - yesterday) / yesterday) * 100);
  if (changePercent > 0) {
    return { text: `+${changePercent}%`, type: 'up' };
  } else if (changePercent < 0) {
    return { text: `${changePercent}%`, type: 'down' };
  }
  return { text: '0%', type: 'same' };
}

interface HourlySalesData {
  hour: number;
  sales: number;
  orders: number;
}

interface SalesData {
  hourlySales?: HourlySalesData[];
  yesterdayHourlySales?: HourlySalesData[];
  stats?: {
    totalSales?: number;
  };
}

function buildSlackMessage(data: SalesData) {
  const nowKST = getKSTDate();
  const currentHour = nowKST.getUTCHours();

  const hourlySales = data.hourlySales || [];
  const yesterdayHourly = data.yesterdayHourlySales || [];

  // 어제 데이터를 맵으로 변환
  const yesterdayMap: Record<number, HourlySalesData> = {};
  for (const h of yesterdayHourly) {
    yesterdayMap[h.hour] = h;
  }

  // 현재까지 누적 매출 계산
  const todayTotal = hourlySales
    .filter(h => h.hour <= currentHour)
    .reduce((sum, h) => sum + h.sales, 0);
  const yesterdayTotal = yesterdayHourly
    .filter(h => h.hour <= currentHour)
    .reduce((sum, h) => sum + h.sales, 0);

  // 증감 계산
  const diff = todayTotal - yesterdayTotal;
  const change = calculateChange(todayTotal, yesterdayTotal);

  // 증감 이모지
  let changeEmoji = ':heavy_minus_sign:';
  let diffText = '0원';
  if (change.type === 'up') {
    changeEmoji = ':chart_with_upwards_trend:';
    diffText = `+${formatNumber(diff)}원`;
  } else if (change.type === 'down') {
    changeEmoji = ':chart_with_downwards_trend:';
    diffText = `${formatNumber(diff)}원`;
  }

  // 최근 3시간 매출 (현재 시간 포함)
  const recentHours: Array<{
    hour: number;
    today: number;
    yesterday: number;
    change: string;
    emoji: string;
  }> = [];

  for (let hour = Math.max(0, currentHour - 2); hour <= currentHour; hour++) {
    const todayData = hourlySales.find(h => h.hour === hour) || { sales: 0, orders: 0 };
    const yesterdayData = yesterdayMap[hour] || { sales: 0, orders: 0 };

    const hourChange = calculateChange(todayData.sales, yesterdayData.sales);
    let hourEmoji = ':heavy_minus_sign:';
    if (hourChange.type === 'up') hourEmoji = ':arrow_up:';
    else if (hourChange.type === 'down') hourEmoji = ':arrow_down:';

    recentHours.push({
      hour,
      today: todayData.sales,
      yesterday: yesterdayData.sales,
      change: hourChange.text,
      emoji: hourEmoji,
    });
  }

  // 최근 시간대 텍스트 구성
  let recentText = '';
  for (const h of recentHours) {
    recentText += `• ${String(h.hour).padStart(2, '0')}시: *${formatNumber(h.today)}원* (어제 ${formatNumber(h.yesterday)}원) ${h.emoji} ${h.change}\n`;
  }

  const dateStr = `${nowKST.getUTCFullYear()}-${String(nowKST.getUTCMonth() + 1).padStart(2, '0')}-${String(nowKST.getUTCDate()).padStart(2, '0')} ${String(nowKST.getUTCHours()).padStart(2, '0')}:${String(nowKST.getUTCMinutes()).padStart(2, '0')}:${String(nowKST.getUTCSeconds()).padStart(2, '0')}`;

  // Slack Block Kit 메시지
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `:bar_chart: 바르너 실시간 매출 현황 (${currentHour}시 기준)`,
        emoji: true,
      },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*:moneybag: 현재까지 매출*\n\n오늘: *${formatNumber(todayTotal)}원*\n어제 같은시간: ${formatNumber(yesterdayTotal)}원\n\n${changeEmoji} 차이: *${diffText}* (${change.text})`,
      },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*:alarm_clock: 최근 시간대 매출*\n\n${recentText}`,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `:clock1: ${dateStr} KST (수동 발송)`,
        },
      ],
    },
  ];

  return { blocks };
}

async function sendSlackMessage(payload: object): Promise<boolean> {
  if (!SLACK_WEBHOOK_URL) {
    console.error('SLACK_WEBHOOK_URL is not configured');
    return false;
  }

  const response = await fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  return response.ok;
}

export async function POST() {
  // 세션 체크 (admin만 가능)
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  try {
    // 1. Cafe24 API에서 매출 데이터 조회
    const baseUrl = 'https://app-bitelab.vercel.app';
    const apiKey = process.env.CAFE24_API_KEY || '';

    console.log('[Slack Send] Calling Cafe24 API:', { baseUrl, hasApiKey: !!apiKey });

    const cafe24Response = await fetch(`${baseUrl}/api/cafe24`, {
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
    });

    console.log('[Slack Send] Cafe24 response status:', cafe24Response.status);

    if (!cafe24Response.ok) {
      const errorText = await cafe24Response.text();
      return NextResponse.json(
        { error: `Failed to fetch sales data: ${errorText}` },
        { status: 500 }
      );
    }

    const salesData = await cafe24Response.json();

    if (!salesData.success) {
      // needsAuth인 경우 더 명확한 메시지 제공
      if (salesData.needsAuth) {
        return NextResponse.json(
          { error: 'Cafe24 토큰이 KV에 저장되지 않았습니다. 어드민 페이지에서 Cafe24 재인증을 진행해주세요.' },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { error: salesData.error || 'Failed to fetch sales data' },
        { status: 500 }
      );
    }

    // 2. Slack 메시지 구성
    const message = buildSlackMessage(salesData);

    // 3. Slack 전송
    const success = await sendSlackMessage(message);

    if (success) {
      return NextResponse.json({
        success: true,
        message: 'Slack 알림이 전송되었습니다.',
      });
    } else {
      return NextResponse.json(
        { error: 'Failed to send Slack message' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Slack send error:', error);
    return NextResponse.json(
      { error: `Failed to send Slack notification: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
