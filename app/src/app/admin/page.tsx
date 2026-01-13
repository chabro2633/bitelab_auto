'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

interface ExecutionResult {
  success: boolean;
  output: string;
  error: string;
  command?: string;
  suggestions?: string[];
}

type ScriptTab = 'sales' | 'ads' | 'realtime' | 'period-sales' | 'meta-ads';

// Suspense로 감싸는 wrapper 컴포넌트
export default function AdminDashboardWrapper() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    }>
      <AdminDashboard />
    </Suspense>
  );
}

function AdminDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL 파라미터에서 탭 읽기
  const validTabs: ScriptTab[] = ['sales', 'ads', 'realtime', 'period-sales', 'meta-ads'];
  const tabParam = searchParams.get('tab') as ScriptTab | null;
  const initialTab = tabParam && validTabs.includes(tabParam) ? tabParam : 'sales';

  const [activeTab, setActiveTab] = useState<ScriptTab>(initialTab);

  // 탭 변경 시 URL 업데이트
  const handleTabChange = (tab: ScriptTab) => {
    setActiveTab(tab);
    router.push(`/admin?tab=${tab}`, { scroll: false });
  };
  const [user, setUser] = useState<{
    userId: string;
    username: string;
    role: string;
    mustChangePassword?: boolean;
    permissions?: {
      canViewSales: boolean;
      canRunScraping: boolean;
      canManageUsers: boolean;
      canViewLogs: boolean;
      canManageSchedule: boolean;
    };
  } | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [showConsole, setShowConsole] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [userAllowedBrands, setUserAllowedBrands] = useState<string[]>([]);
  const [workflowStatus, setWorkflowStatus] = useState<{
    run: { id: string; status: string; conclusion?: string; created_at: string; updated_at: string; html_url: string };
    jobs: Array<{ id: string; name: string; status: string; conclusion?: string; steps: Array<{ name: string; status: string; conclusion?: string; number: number }> }>;
    status: string;
    conclusion?: string;
  } | null>(null);
  const [, setWorkflowLogs] = useState<Array<{ id: number; timestamp: string; level: string; message: string; raw: string }>>([]);
  const [isPolling, setIsPolling] = useState(false);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [executionLogs, setExecutionLogs] = useState<Array<{
    id: string;
    userId: string;
    username: string;
    executionType: 'manual' | 'scheduled' | 'api';
    brands: string[];
    date?: string;
    status: 'success' | 'failed' | 'running';
    startTime: string;
    endTime?: string;
    errorMessage?: string;
    workflowUrl?: string;
  }>>([]);
  const [showExecutionLogs, setShowExecutionLogs] = useState(false);
  const [scheduleStatus, setScheduleStatus] = useState<{
    scheduleStatus: 'pending' | 'running' | 'success' | 'failed' | 'waiting';
    statusMessage: string;
    scheduledTime: string;
    todayScheduledRun?: {
      id: string;
      status: string;
      conclusion: string;
      created_at: string;
      html_url: string;
    } | null;
  } | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [scheduleFailureLogs, setScheduleFailureLogs] = useState<Array<{
    id: string;
    scheduleRunId: string;
    scheduleRunUrl: string;
    failedAt: string;
    responseStatus: 'pending' | 'responded' | 'response_failed' | 'ignored';
    respondedAt?: string;
    respondedBy?: string;
    retryRunId?: string;
    retryRunUrl?: string;
    retryStatus?: 'success' | 'failed' | 'running';
    retryErrorMessage?: string;
    notes?: string;
  }>>([]);
  const [showFailureLogs, setShowFailureLogs] = useState(false);

  // 광고 탭용 state
  const [adsStartDate, setAdsStartDate] = useState('');
  const [adsEndDate, setAdsEndDate] = useState('');
  const [selectedAdsBrands, setSelectedAdsBrands] = useState<string[]>([]);

  // 실시간 매출 탭용 state
  const [realtimeSales, setRealtimeSales] = useState<{
    success: boolean;
    date: string;
    brandName: string;
    stats: {
      totalSales: number;
      totalOrders: number;
      validOrders: number;
      totalItems: number;
      averageOrderValue: number;
      pendingAmount: number;
      pendingOrders: number;
      cancelRefundAmount: number;
      cancelRefundOrders: number;
    };
    orderStatus: Array<{ status: string; label: string; count: number }>;
    topProducts: Array<{ name: string; quantity: number; sales: number }>;
    yesterdayTopProducts?: Array<{ name: string; quantity: number; sales: number }>;
    hourlySales: Array<{ hour: number; sales: number; orders: number }>;
    yesterdayHourlySales?: Array<{ hour: number; sales: number; orders: number }>;
    yesterdayStats?: { totalSales: number; totalOrders: number };
    recentOrders: Array<{
      orderId: string;
      orderDate: string;
      status: string;
      amount: number;
      productName: string;
      itemCount: number;
    }>;
    lastUpdated: string;
  } | null>(null);
  const [realtimeLoading, setRealtimeLoading] = useState(false);
  const [realtimeError, setRealtimeError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<NodeJS.Timeout | null>(null);
  const [cafe24NeedsAuth, setCafe24NeedsAuth] = useState(false);
  const [cafe24AuthUrl, setCafe24AuthUrl] = useState<string | null>(null);
  const [slackSending, setSlackSending] = useState(false);
  const [slackSendResult, setSlackSendResult] = useState<{ success: boolean; message: string } | null>(null);

  // 기간별 매출 탭용 state
  const [periodSalesStartDate, setPeriodSalesStartDate] = useState('');
  const [periodSalesEndDate, setPeriodSalesEndDate] = useState('');
  const [periodSales, setPeriodSales] = useState<{
    success: boolean;
    startDate: string;
    endDate: string;
    brandName: string;
    stats: {
      totalSales: number;
      totalOrders: number;
      validOrders: number;
      totalItems: number;
      averageOrderValue: number;
      pendingAmount: number;
      pendingOrders: number;
      cancelRefundAmount: number;
      cancelRefundOrders: number;
    };
    orderStatus: Array<{ status: string; label: string; count: number }>;
    topProducts: Array<{ name: string; quantity: number; sales: number }>;
    dailySales?: Array<{ date: string; sales: number; orders: number }>;
    recentOrders: Array<{
      orderId: string;
      orderDate: string;
      status: string;
      amount: number;
      productName: string;
      itemCount: number;
    }>;
    lastUpdated: string;
  } | null>(null);
  const [periodSalesLoading, setPeriodSalesLoading] = useState(false);
  const [periodSalesError, setPeriodSalesError] = useState<string | null>(null);

  // 기간 비교용 state
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [comparePeriodSales, setComparePeriodSales] = useState<{
    success: boolean;
    startDate: string;
    endDate: string;
    stats: {
      totalSales: number;
      totalOrders: number;
      validOrders: number;
      averageOrderValue: number;
    };
    topProducts: Array<{ name: string; quantity: number; sales: number }>;
    dailySales?: Array<{ date: string; sales: number; orders: number }>;
  } | null>(null);

  // Meta Ads 탭용 state
  const [metaAdsQuery, setMetaAdsQuery] = useState('');
  const [metaAdsLoading, setMetaAdsLoading] = useState(false);
  const [metaAdsError, setMetaAdsError] = useState<string | null>(null);
  const [metaAdsResults, setMetaAdsResults] = useState<{
    success: boolean;
    searchQuery: string;
    totalItems: number;
    items: Array<{ url: string; type: 'image' | 'video'; width?: number; height?: number }>;
  } | null>(null);

  // Refs (must be at the top level)
  const prevStepsRef = useRef<string>('');
  const lastLogCountRef = useRef<number>(0);
  const workflowCompletedRef = useRef<boolean>(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const availableBrands = ['바르너', '릴리이브', '보호리', '먼슬리픽', '색동서울'];
  const availableAdsBrands = ['바르너', '색동서울', '보호리', '먼슬리픽', '릴리이브'];  // 광고용 브랜드

  // 세션 확인
  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await fetch('/api/session');
        const data = await response.json();
        
        if (data.authenticated) {
          setUser(data.user);
          setUserAllowedBrands(data.user.role === 'admin' ? availableBrands : data.user.allowedBrands || []);

          // 비밀번호 변경 필요 여부 확인
          if (data.user.mustChangePassword) {
            setShowPasswordModal(true);
          }

          // sales_viewer는 실시간 매출 탭만 접근 가능
          if (data.user.role === 'sales_viewer') {
            setActiveTab('realtime');
            router.replace('/admin?tab=realtime', { scroll: false });
          }
        } else {
          router.push('/login');
        }
      } catch (error) {
        console.error('Session check error:', error);
        router.push('/login');
      } finally {
        setIsLoading(false);
      }
    };

    checkSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // 콘솔 로그가 추가될 때마다 자동 스크롤
  useEffect(() => {
    if (showConsole && consoleLogs.length > 0) {
      const consoleElement = document.querySelector('.console-container');
      if (consoleElement) {
        consoleElement.scrollTop = consoleElement.scrollHeight;
      }
    }
  }, [consoleLogs, showConsole]);

  // 컴포넌트 언마운트 시 폴링 중지
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
      }
    };
  }, [autoRefreshInterval]);

  // 컴포넌트 마운트 시 실행 로그 가져오기
  useEffect(() => {
    if (user) {
      fetchExecutionLogs();
      fetchScheduleStatus();
      fetchScheduleFailureLogs();
    }
  }, [user]);

  // 스케줄 상태 가져오기
  const fetchScheduleStatus = async () => {
    try {
      setScheduleLoading(true);
      const response = await fetch('/api/schedule-status');
      const data = await response.json();
      console.log('Schedule status response:', response.status, data);
      if (response.ok) {
        setScheduleStatus(data);
      } else {
        console.error('Schedule status error:', data.error);
        // 에러가 있어도 기본 상태 표시
        setScheduleStatus({
          scheduleStatus: 'pending',
          statusMessage: data.error || '스케줄 상태를 가져올 수 없습니다',
          scheduledTime: new Date().toISOString(),
          todayScheduledRun: null
        });
      }
    } catch (error) {
      console.error('Failed to fetch schedule status:', error);
      setScheduleStatus({
        scheduleStatus: 'pending',
        statusMessage: '스케줄 상태를 가져올 수 없습니다',
        scheduledTime: new Date().toISOString(),
        todayScheduledRun: null
      });
    } finally {
      setScheduleLoading(false);
    }
  };

  // 스케줄 실패 로그 가져오기 및 진행중 상태 업데이트
  const fetchScheduleFailureLogs = async () => {
    try {
      const response = await fetch('/api/schedule-failure-logs');
      if (response.ok) {
        const data = await response.json();
        const logs = data.logs || [];
        setScheduleFailureLogs(logs);

        // "진행중" 상태인 로그가 있으면 실제 워크플로우 상태 확인
        const runningLogs = logs.filter((log: { retryStatus?: string }) => log.retryStatus === 'running');
        if (runningLogs.length > 0) {
          checkAndUpdateRunningLogs(runningLogs);
        }
      }
    } catch (error) {
      console.error('Failed to fetch schedule failure logs:', error);
    }
  };

  // 진행중인 로그의 실제 상태 확인 및 업데이트
  const checkAndUpdateRunningLogs = async (runningLogs: Array<{ id: string; retryRunId?: string }>) => {
    try {
      const statusResponse = await fetch('/api/workflow-status');
      if (!statusResponse.ok) return;

      const statusData = await statusResponse.json();

      for (const log of runningLogs) {
        // 최신 워크플로우가 완료되었는지 확인
        if (statusData.status === 'completed' && statusData.run) {
          const conclusion = statusData.conclusion;
          await fetch('/api/schedule-failure-logs', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              logId: log.id,
              updates: {
                retryStatus: conclusion === 'success' ? 'success' : 'failed',
                retryRunId: statusData.run.id,
                retryRunUrl: statusData.run.html_url,
                retryErrorMessage: conclusion !== 'success' ? `워크플로우 실패: ${conclusion}` : undefined
              }
            })
          });
        }
      }

      // 업데이트 후 다시 로그 가져오기
      const refreshResponse = await fetch('/api/schedule-failure-logs');
      if (refreshResponse.ok) {
        const refreshData = await refreshResponse.json();
        setScheduleFailureLogs(refreshData.logs || []);
      }
    } catch (error) {
      console.error('Failed to check running logs:', error);
    }
  };

  // 스케줄 실패 재시도
  const handleRetrySchedule = async () => {
    if (!scheduleStatus?.todayScheduledRun || isRetrying) return;

    setIsRetrying(true);
    const failedRun = scheduleStatus.todayScheduledRun;

    try {
      // 1. 실패 로그 기록 (대응 시작)
      await fetch('/api/schedule-failure-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduleRunId: failedRun.id,
          scheduleRunUrl: failedRun.html_url,
          failedAt: failedRun.created_at,
          responseStatus: 'pending'
        })
      });

      addConsoleLog('🔄 스케줄 실패 재시도 시작...');
      addConsoleLog(`📋 원본 실패 워크플로우: ${failedRun.id}`);

      // 2. 워크플로우 재실행 트리거
      const response = await fetch('/api/trigger-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brands: undefined, // 모든 브랜드
          isRetry: true,
          originalRunId: failedRun.id
        })
      });

      const data = await response.json();

      if (response.ok) {
        addConsoleLog('✅ 재시도 워크플로우가 트리거되었습니다');

        // 3. 실패 로그 업데이트 (대응 완료)
        await fetch('/api/schedule-failure-logs', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scheduleRunId: failedRun.id,
            updates: {
              responseStatus: 'responded',
              respondedAt: new Date().toISOString(),
              respondedBy: user?.username,
              retryRunId: data.runId || 'triggered',
              retryStatus: 'running'
            }
          })
        });

        // 폴링 시작
        setShowConsole(true);
        startPolling();

        // 스케줄 상태 새로고침
        setTimeout(() => {
          fetchScheduleStatus();
          fetchScheduleFailureLogs();
        }, 3000);
      } else {
        throw new Error(data.error || '재시도 실패');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
      addConsoleLog(`❌ 재시도 실패: ${errorMessage}`);

      // 실패 로그 업데이트 (대응 실패)
      await fetch('/api/schedule-failure-logs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduleRunId: failedRun.id,
          updates: {
            responseStatus: 'response_failed',
            respondedAt: new Date().toISOString(),
            respondedBy: user?.username,
            retryErrorMessage: errorMessage
          }
        })
      });

      fetchScheduleFailureLogs();
    } finally {
      setIsRetrying(false);
    }
  };

  // 실패 로그 상태 업데이트 (무시 처리)
  const handleIgnoreFailure = async (logId: string) => {
    try {
      await fetch('/api/schedule-failure-logs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logId,
          updates: {
            responseStatus: 'ignored',
            respondedAt: new Date().toISOString(),
            respondedBy: user?.username,
            notes: '수동으로 무시 처리됨'
          }
        })
      });
      fetchScheduleFailureLogs();
    } catch (error) {
      console.error('Failed to ignore failure:', error);
    }
  };

  // 실시간 매출 데이터 가져오기
  const fetchRealtimeSales = async () => {
    console.log('[Cafe24] 실시간 매출 데이터 조회 시작...');
    setRealtimeLoading(true);
    setRealtimeError(null);
    setCafe24NeedsAuth(false);
    try {
      console.log('[Cafe24] API 호출 중: /api/cafe24');
      const response = await fetch('/api/cafe24');
      console.log('[Cafe24] API 응답 상태:', response.status, response.statusText);
      const data = await response.json();
      console.log('[Cafe24] API 응답 데이터:', data);

      if (data.success) {
        console.log('[Cafe24] ✅ 매출 데이터 조회 성공:', {
          date: data.date,
          totalSales: data.stats?.totalSales,
          totalOrders: data.stats?.totalOrders
        });
        setRealtimeSales(data);
        setCafe24NeedsAuth(false);
      } else if (data.needsAuth) {
        console.log('[Cafe24] ⚠️ 인증 필요:', data.authUrl);
        setCafe24NeedsAuth(true);
        setCafe24AuthUrl(data.authUrl);
        setRealtimeError(data.error || 'Cafe24 인증이 필요합니다');
      } else {
        console.log('[Cafe24] ❌ 데이터 조회 실패:', data.error);
        setRealtimeError(data.error || '데이터를 가져올 수 없습니다');
      }
    } catch (error) {
      console.error('[Cafe24] ❌ 네트워크 오류:', error);
      setRealtimeError('네트워크 오류가 발생했습니다');
    } finally {
      console.log('[Cafe24] 조회 완료');
      setRealtimeLoading(false);
    }
  };

  // Slack으로 매출 알림 수동 발송 (admin만 가능)
  const sendSlackNotification = async () => {
    if (!user || user.role !== 'admin') {
      setSlackSendResult({ success: false, message: '관리자만 사용할 수 있습니다' });
      return;
    }

    setSlackSending(true);
    setSlackSendResult(null);

    try {
      const response = await fetch('/api/slack/send-hourly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSlackSendResult({ success: true, message: data.message || 'Slack 알림이 전송되었습니다' });
      } else {
        setSlackSendResult({ success: false, message: data.error || 'Slack 전송에 실패했습니다' });
      }
    } catch (error) {
      console.error('Slack 전송 오류:', error);
      setSlackSendResult({ success: false, message: '네트워크 오류가 발생했습니다' });
    } finally {
      setSlackSending(false);
      // 5초 후 결과 메시지 숨기기
      setTimeout(() => setSlackSendResult(null), 5000);
    }
  };

  // 실시간 탭으로 이동 시 한 번만 조회 (자동 반복 없음)
  const [realtimeInitialized, setRealtimeInitialized] = useState(false);
  useEffect(() => {
    if (activeTab === 'realtime' && !realtimeInitialized) {
      setRealtimeInitialized(true);
      fetchRealtimeSales();
    }
  }, [activeTab, realtimeInitialized]);

  // 기간별 매출 데이터 가져오기 (10일씩 나눠서 순차 조회)
  const fetchPeriodSales = async () => {
    if (!periodSalesStartDate || !periodSalesEndDate) {
      setPeriodSalesError('시작일과 종료일을 선택해주세요');
      return;
    }

    const startDate = new Date(periodSalesStartDate);
    const endDate = new Date(periodSalesEndDate);

    // 날짜 유효성 검사
    if (startDate > endDate) {
      setPeriodSalesError('시작일이 종료일보다 늦을 수 없습니다');
      return;
    }

    // 기간 제한: 31일 이하
    const periodDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (periodDays > 31) {
      setPeriodSalesError('조회 기간은 31일 이하로 설정해주세요');
      return;
    }

    setPeriodSalesLoading(true);
    setPeriodSalesError(null);
    setComparePeriodSales(null);

    // 날짜 포맷 함수
    const formatDate = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // 10일씩 기간 분할
    const chunkDays = 10;
    const dateRanges: Array<{ start: string; end: string }> = [];
    let currentStart = new Date(startDate);

    while (currentStart <= endDate) {
      const chunkEnd = new Date(currentStart);
      chunkEnd.setDate(chunkEnd.getDate() + chunkDays - 1);
      const actualEnd = chunkEnd > endDate ? endDate : chunkEnd;

      dateRanges.push({
        start: formatDate(currentStart),
        end: formatDate(actualEnd)
      });

      currentStart = new Date(actualEnd);
      currentStart.setDate(currentStart.getDate() + 1);
    }

    console.log('[PeriodSales] 기간 분할:', dateRanges.length, '개 구간');

    try {
      // 각 구간 순차 조회 및 데이터 합치기
      const dailySalesMap = new Map<string, { sales: number; orders: number }>();
      let totalCancelledSales = 0;
      let totalCancelledOrders = 0;
      let totalPendingOrders = 0;
      let lastSuccessData: Record<string, unknown> | null = null;

      for (let i = 0; i < dateRanges.length; i++) {
        const range = dateRanges[i];
        console.log(`[PeriodSales] ${i + 1}/${dateRanges.length} 조회 중: ${range.start} ~ ${range.end}`);

        try {
          const response = await fetch(`/api/cafe24?startDate=${range.start}&endDate=${range.end}`);
          const data = await response.json();

          if (data.needsAuth) {
            setCafe24NeedsAuth(true);
            setCafe24AuthUrl(data.authUrl);
            setPeriodSalesError(data.error || 'Cafe24 인증이 필요합니다');
            setPeriodSalesLoading(false);
            return;
          }

          if (data.success) {
            lastSuccessData = data;
            data.dailySales?.forEach((day: { date: string; sales: number; orders: number }) => {
              const existing = dailySalesMap.get(day.date);
              if (existing) {
                // 기존 값에 추가 (중복 방지)
                dailySalesMap.set(day.date, {
                  sales: Math.max(existing.sales, day.sales),
                  orders: Math.max(existing.orders, day.orders)
                });
              } else {
                dailySalesMap.set(day.date, { sales: day.sales, orders: day.orders });
              }
            });
            totalCancelledSales += data.cancelledSales || 0;
            totalCancelledOrders += data.cancelledOrders || 0;
            totalPendingOrders += data.pendingOrders || 0;
            console.log(`[PeriodSales] ${range.start}~${range.end}: ${data.dailySales?.length || 0}일 데이터`);
          }
        } catch (rangeError) {
          console.error(`[PeriodSales] ${range.start}~${range.end} 조회 실패:`, rangeError);
        }
      }

      // 최종 데이터 정리
      const finalDailySales = Array.from(dailySalesMap.entries())
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const totalSales = finalDailySales.reduce((sum, day) => sum + day.sales, 0);
      const totalOrders = finalDailySales.reduce((sum, day) => sum + day.orders, 0);

      console.log('[PeriodSales] 최종 결과 - 일수:', finalDailySales.length, '총 매출:', totalSales.toLocaleString());

      const finalData = {
        success: true,
        startDate: periodSalesStartDate,
        endDate: periodSalesEndDate,
        lastUpdated: new Date().toISOString(),
        dailySales: finalDailySales,
        totalSales,
        totalOrders,
        cancelledSales: totalCancelledSales,
        cancelledOrders: totalCancelledOrders,
        pendingOrders: totalPendingOrders,
        ...(lastSuccessData || {})
      };

      setPeriodSales(finalData);

      // 비교 기능이 활성화되어 있으면 이전 동일 기간 데이터도 가져오기
      if (compareEnabled) {
        const compareEndDate = new Date(startDate);
        compareEndDate.setDate(compareEndDate.getDate() - 1);
        const compareStartDate = new Date(compareEndDate);
        compareStartDate.setDate(compareStartDate.getDate() - periodDays + 1);

        const compareStartStr = formatDate(compareStartDate);
        const compareEndStr = formatDate(compareEndDate);

        const compareResponse = await fetch(`/api/cafe24?startDate=${compareStartStr}&endDate=${compareEndStr}`);
        const compareData = await compareResponse.json();

        if (compareData.success) {
          setComparePeriodSales(compareData);
        }
      }
    } catch (error) {
      console.error('기간별 매출 조회 오류:', error);
      setPeriodSalesError('네트워크 오류가 발생했습니다');
    } finally {
      setPeriodSalesLoading(false);
    }
  };

  // 자동 새로고침 토글
  const toggleAutoRefresh = () => {
    if (autoRefresh) {
      if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        setAutoRefreshInterval(null);
      }
      setAutoRefresh(false);
    } else {
      setAutoRefresh(true);
      const interval = setInterval(() => {
        fetchRealtimeSales();
      }, 60000); // 1분마다 새로고침
      setAutoRefreshInterval(interval);
    }
  };

  // 로그아웃 함수
  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // 비밀번호 변경 처리
  const handlePasswordChange = async () => {
    setPasswordError('');
    setPasswordSuccess(false);

    if (newPassword.length < 6) {
      setPasswordError('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('비밀번호가 일치하지 않습니다.');
      return;
    }

    try {
      const response = await fetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });

      const data = await response.json();

      if (data.success) {
        setPasswordSuccess(true);
        setUser(prev => prev ? { ...prev, mustChangePassword: false } : null);
        setTimeout(() => {
          setShowPasswordModal(false);
          setNewPassword('');
          setConfirmPassword('');
          setPasswordSuccess(false);
        }, 1500);
      } else {
        setPasswordError(data.error || '비밀번호 변경에 실패했습니다.');
      }
    } catch (error) {
      console.error('Password change error:', error);
      setPasswordError('비밀번호 변경 중 오류가 발생했습니다.');
    }
  };

  // 권한 확인 헬퍼 함수
  const canAccessTab = (tab: ScriptTab): boolean => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    // sales_viewer는 실시간 매출과 기간별 매출 탭 모두 접근 가능
    if (user.role === 'sales_viewer') return tab === 'realtime' || tab === 'period-sales';
    // user 권한은 스크래핑 + meta-ads
    return tab !== 'realtime' && tab !== 'period-sales';
  };

  // Meta Ads 검색 함수 (GitHub Actions 트리거 + 폴링)
  const fetchMetaAds = async () => {
    if (!metaAdsQuery.trim()) {
      setMetaAdsError('검색어를 입력해주세요.');
      return;
    }

    setMetaAdsLoading(true);
    setMetaAdsError(null);
    setMetaAdsResults(null);

    try {
      // 1. GitHub Actions workflow 트리거
      const triggerResponse = await fetch('/api/meta-ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ searchQuery: metaAdsQuery, maxScroll: 15 })
      });

      const triggerData = await triggerResponse.json();

      if (!triggerResponse.ok || !triggerData.success) {
        setMetaAdsError(triggerData.error || '스크래핑 시작에 실패했습니다.');
        setMetaAdsLoading(false);
        return;
      }

      const { requestId } = triggerData;

      // 2. 폴링으로 결과 대기 (최대 3분, 5초 간격)
      const maxAttempts = 36;
      let attempts = 0;

      const pollResults = async (): Promise<void> => {
        attempts++;

        try {
          const resultResponse = await fetch(`/api/meta-ads?requestId=${requestId}`);
          const resultData = await resultResponse.json();

          if (resultData.success === true) {
            // 스크래핑 완료
            setMetaAdsResults(resultData);
            setMetaAdsLoading(false);
            return;
          } else if (resultData.success === false && resultData.error) {
            // 스크래핑 실패
            setMetaAdsError(resultData.error);
            setMetaAdsLoading(false);
            return;
          } else if (resultData.status === 'pending' || resultData.status === 'not_found') {
            // 아직 진행 중
            if (attempts >= maxAttempts) {
              setMetaAdsError('시간 초과: 스크래핑이 너무 오래 걸립니다. 잠시 후 다시 시도해주세요.');
              setMetaAdsLoading(false);
              return;
            }
            // 5초 후 다시 폴링
            setTimeout(pollResults, 5000);
          } else {
            setMetaAdsError('알 수 없는 상태입니다.');
            setMetaAdsLoading(false);
          }
        } catch {
          if (attempts >= maxAttempts) {
            setMetaAdsError('결과 조회 중 오류가 발생했습니다.');
            setMetaAdsLoading(false);
            return;
          }
          setTimeout(pollResults, 5000);
        }
      };

      // 10초 후 첫 폴링 시작 (workflow 시작 시간 고려)
      setTimeout(pollResults, 10000);

    } catch (error) {
      console.error('Meta Ads fetch error:', error);
      setMetaAdsError('광고 검색 중 오류가 발생했습니다.');
      setMetaAdsLoading(false);
    }
  };

  // 로딩 중이면 로딩 화면 표시
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  // 사용자가 없으면 아무것도 렌더링하지 않음 (리다이렉트 중)
  if (!user) {
    return null;
  }

  const handleBrandToggle = (brand: string) => {
    setSelectedBrands(prev => 
      prev.includes(brand) 
        ? prev.filter(b => b !== brand)
        : [...prev, brand]
    );
  };

  const handleSelectAllBrands = () => {
    setSelectedBrands(userAllowedBrands);
  };

  const handleDeselectAllBrands = () => {
    setSelectedBrands([]);
  };

  const addConsoleLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}`;
    setConsoleLogs(prev => [...prev, logEntry]);
  };

  const clearConsole = () => {
    setConsoleLogs([]);
    setWorkflowLogs([]);
  };

  const fetchWorkflowStatus = async () => {
    try {
      const response = await fetch('/api/workflow-status');
      if (response.ok) {
        const data = await response.json();
        setWorkflowStatus(data);

        // Steps 상태 변화 감지 및 로깅
        if (data.jobs && data.jobs.length > 0) {
          const job = data.jobs[0];
          const currentStepsState = JSON.stringify(job.steps?.map((s: { name: string; status: string; conclusion?: string }) => ({
            name: s.name,
            status: s.status,
            conclusion: s.conclusion
          })));

          if (currentStepsState !== prevStepsRef.current) {
            // 새로운 step 상태 로깅
            job.steps?.forEach((step: { name: string; status: string; conclusion?: string; number: number }) => {
              const prevSteps = prevStepsRef.current ? JSON.parse(prevStepsRef.current) : [];
              const prevStep = prevSteps.find((s: { name: string }) => s.name === step.name);

              if (!prevStep || prevStep.status !== step.status || prevStep.conclusion !== step.conclusion) {
                if (step.status === 'in_progress') {
                  addConsoleLog(`🔄 [Step ${step.number}] ${step.name} 실행 중...`);
                } else if (step.status === 'completed') {
                  const emoji = step.conclusion === 'success' ? '✅' : step.conclusion === 'skipped' ? '⏭️' : '❌';
                  addConsoleLog(`${emoji} [Step ${step.number}] ${step.name} ${step.conclusion === 'success' ? '완료' : step.conclusion === 'skipped' ? '스킵' : '실패'}`);
                }
              }
            });
            prevStepsRef.current = currentStepsState;
          }

          // 실행 중인 작업의 로그 가져오기
          if (job.status === 'in_progress' || job.status === 'completed') {
            await fetchWorkflowLogs(data.run.id, job.id);
          }
        }

        // 워크플로우가 완료되면 폴링 중지 및 실패 로그 업데이트 (한 번만 처리)
        if (data.status === 'completed' && !workflowCompletedRef.current) {
          workflowCompletedRef.current = true;
          stopPolling();
          const emoji = data.conclusion === 'success' ? '🎉' : '❌';
          addConsoleLog(`${emoji} 워크플로우 완료: ${data.conclusion === 'success' ? '성공!' : '실패'}`);

          // 스케줄 상태 및 실패 로그 새로고침
          fetchScheduleStatus();
          fetchScheduleFailureLogs();

          // 실패 로그의 retryStatus 업데이트
          updateRetryStatus(data.run.id, data.conclusion === 'success' ? 'success' : 'failed');
        }
      }
    } catch (error) {
      console.error('Failed to fetch workflow status:', error);
    }
  };

  // 재시도 상태 업데이트 함수
  const updateRetryStatus = async (runId: string, status: 'success' | 'failed') => {
    try {
      // retryRunId가 일치하는 로그 찾기
      const logToUpdate = scheduleFailureLogs.find(log =>
        log.retryRunId === runId || log.retryRunId === 'triggered'
      );

      if (logToUpdate) {
        await fetch('/api/schedule-failure-logs', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            logId: logToUpdate.id,
            updates: {
              retryStatus: status,
              retryErrorMessage: status === 'failed' ? '워크플로우 실행 실패' : undefined
            }
          })
        });
        fetchScheduleFailureLogs();
      }
    } catch (error) {
      console.error('Failed to update retry status:', error);
    }
  };

  const fetchWorkflowLogs = async (runId: string, jobId: string) => {
    try {
      const response = await fetch(`/api/workflow-logs?runId=${runId}&jobId=${jobId}`);
      if (response.ok) {
        const data = await response.json();
        setWorkflowLogs(data.logs);

        // 새로운 로그만 콘솔에 추가 (중요한 로그만 필터링)
        if (data.logs.length > lastLogCountRef.current) {
          const newLogs = data.logs.slice(lastLogCountRef.current);
          newLogs.forEach((log: { id: number; timestamp: string; level: string; message: string; raw: string }) => {
            // 중요한 로그만 표시 (스크래핑 관련 메시지)
            const message = log.message;
            if (
              message.includes('스크래핑') ||
              message.includes('브랜드') ||
              message.includes('데이터') ||
              message.includes('업로드') ||
              message.includes('Google Sheets') ||
              message.includes('✅') ||
              message.includes('❌') ||
              message.includes('⚠️') ||
              message.includes('🚀') ||
              message.includes('📅') ||
              message.includes('📋') ||
              message.includes('🔍') ||
              message.includes('성공') ||
              message.includes('실패') ||
              message.includes('완료') ||
              message.includes('ERROR') ||
              message.includes('error')
            ) {
              const emoji = log.level === 'success' ? '✅' :
                           log.level === 'error' ? '❌' :
                           log.level === 'warning' ? '⚠️' : '📝';
              addConsoleLog(`${emoji} ${message}`);
            }
          });
          lastLogCountRef.current = data.logs.length;
        }
      }
    } catch (error) {
      console.error('Failed to fetch workflow logs:', error);
    }
  };

  const startPolling = () => {
    if (pollingIntervalRef.current) return;

    // 폴링 시작 시 ref 초기화
    prevStepsRef.current = '';
    lastLogCountRef.current = 0;
    workflowCompletedRef.current = false;

    setIsPolling(true);
    // 먼저 즉시 한번 호출
    fetchWorkflowStatus();
    // 그 후 3초마다 폴링
    const interval = setInterval(fetchWorkflowStatus, 3000);
    pollingIntervalRef.current = interval;
    setPollingInterval(interval);
    addConsoleLog('🔄 GitHub Actions 실시간 모니터링 시작...');
  };

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
      setPollingInterval(null);
      setIsPolling(false);
      addConsoleLog('⏹️ GitHub Actions 상태 모니터링 중지');
    }
  };

  const fetchExecutionLogs = async () => {
    try {
      const response = await fetch('/api/execution-logs');
      if (response.ok) {
        const data = await response.json();
        setExecutionLogs(data.logs);
      }
    } catch (error) {
      console.error('Failed to fetch execution logs:', error);
    }
  };


  const abortScript = () => {
    if (abortController) {
      abortController.abort();
      addConsoleLog('🛑 스크래핑 중단 요청됨...');
      setIsExecuting(false);
      setAbortController(null);
    }
  };

  const executeScript = async () => {
    setIsExecuting(true);
    setResult(null);
    setShowConsole(true);
    clearConsole();

    // AbortController 생성
    const controller = new AbortController();
    setAbortController(controller);

    addConsoleLog('🚀 Cigro 데이터 스크래핑 시작');
    addConsoleLog(`📋 선택된 브랜드: ${selectedBrands.length > 0 ? selectedBrands.join(', ') : '모든 브랜드'}`);

    // 날짜 범위 표시
    if (startDate && endDate) {
      addConsoleLog(`📅 스크래핑 기간: ${startDate} ~ ${endDate}`);
    } else if (startDate) {
      addConsoleLog(`📅 스크래핑 날짜: ${startDate}`);
    } else {
      addConsoleLog(`📅 스크래핑 날짜: 어제 날짜`);
    }

    try {
      addConsoleLog('📡 GitHub Actions 워크플로우 트리거 중...');

      const response = await fetch('/api/trigger-workflow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          brands: selectedBrands.length > 0 ? selectedBrands : undefined,
        }),
        signal: controller.signal,
      });

      addConsoleLog('📥 서버 응답 수신 중...');
      const data = await response.json();
      
            if (data.success) {
              addConsoleLog('✅ GitHub Actions 워크플로우가 성공적으로 트리거되었습니다!');
              addConsoleLog(`🔗 워크플로우 상태 확인: ${data.workflowUrl}`);
              addConsoleLog('⏳ 스크래핑이 백그라운드에서 실행 중입니다. 완료까지 몇 분 소요될 수 있습니다.');
              addConsoleLog('📊 결과는 Google Sheets에서 확인할 수 있습니다.');
              
              // 워크플로우 상태 모니터링 시작
              setTimeout(() => {
                startPolling();
              }, 2000); // 2초 후 폴링 시작
            } else {
              addConsoleLog(`❌ 워크플로우 트리거 실패: ${data.error}`);
            }
      
      setResult({
        success: data.success,
        output: data.success ? 'GitHub Actions 워크플로우가 트리거되었습니다.' : data.error,
        error: data.success ? '' : data.error,
      });
      
    } catch (error: unknown) {
      if ((error as Error).name === 'AbortError') {
        addConsoleLog('🛑 스크래핑이 중단되었습니다.');
      } else {
        addConsoleLog(`❌ 네트워크 오류: ${error}`);
        setResult({
          success: false,
          output: '',
          error: 'Failed to trigger workflow',
        });
      }
    } finally {
      setIsExecuting(false);
      setAbortController(null);
    }
  };

  const handleLogoutClick = () => {
    handleLogout();
  };

  // 광고 탭 - 브랜드 선택 핸들러
  const handleAdsBrandToggle = (brand: string) => {
    setSelectedAdsBrands(prev =>
      prev.includes(brand)
        ? prev.filter(b => b !== brand)
        : [...prev, brand]
    );
  };

  const handleSelectAllAdsBrands = () => {
    setSelectedAdsBrands(availableAdsBrands);
  };

  const handleDeselectAllAdsBrands = () => {
    setSelectedAdsBrands([]);
  };

  // 광고 스크립트 실행
  const executeAdsScript = async () => {
    setIsExecuting(true);
    setResult(null);
    setShowConsole(true);
    clearConsole();

    const controller = new AbortController();
    setAbortController(controller);

    addConsoleLog('🚀 Cigro 광고 데이터 스크래핑 시작');
    addConsoleLog(`📋 선택된 브랜드: ${selectedAdsBrands.length > 0 ? selectedAdsBrands.join(', ') : '모든 브랜드'}`);

    if (adsStartDate && adsEndDate) {
      addConsoleLog(`📅 스크래핑 기간: ${adsStartDate} ~ ${adsEndDate}`);
    } else if (adsStartDate) {
      addConsoleLog(`📅 스크래핑 날짜: ${adsStartDate}`);
    } else {
      addConsoleLog(`📅 스크래핑 날짜: 어제 날짜`);
    }

    try {
      addConsoleLog('📡 GitHub Actions 워크플로우 트리거 중...');

      const response = await fetch('/api/trigger-workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptType: 'ads',
          startDate: adsStartDate || undefined,
          endDate: adsEndDate || undefined,
          brands: selectedAdsBrands.length > 0 ? selectedAdsBrands : undefined,
        }),
        signal: controller.signal,
      });

      addConsoleLog('📥 서버 응답 수신 중...');
      const data = await response.json();

      if (data.success) {
        addConsoleLog('✅ 광고 스크래핑 워크플로우가 트리거되었습니다!');
        addConsoleLog(`🔗 워크플로우 상태 확인: ${data.workflowUrl}`);
        addConsoleLog('⏳ 스크래핑이 백그라운드에서 실행 중입니다.');
        setTimeout(() => startPolling(), 2000);
      } else {
        addConsoleLog(`❌ 워크플로우 트리거 실패: ${data.error}`);
      }

      setResult({
        success: data.success,
        output: data.success ? '광고 스크래핑 워크플로우가 트리거되었습니다.' : data.error,
        error: data.success ? '' : data.error,
      });
    } catch (error: unknown) {
      if ((error as Error).name === 'AbortError') {
        addConsoleLog('🛑 스크래핑이 중단되었습니다.');
      } else {
        addConsoleLog(`❌ 네트워크 오류: ${error}`);
        setResult({ success: false, output: '', error: 'Failed to trigger workflow' });
      }
    } finally {
      setIsExecuting(false);
      setAbortController(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
              <p className="text-sm text-gray-600">Welcome, {user.username}</p>
            </div>
            <div className="flex gap-2">
              {user.role === 'admin' && (
                <button
                  onClick={() => router.push('/users')}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                >
                  User Management
                </button>
              )}
              <button
                onClick={handleLogoutClick}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Schedule Status Banner */}
        <div className="px-4 mb-4 sm:px-0">
          {scheduleLoading ? (
            <div className="bg-gray-100 border border-gray-200 rounded-lg p-4 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-1/3"></div>
            </div>
          ) : scheduleStatus ? (
            <div className={`rounded-lg p-4 border ${
              scheduleStatus.scheduleStatus === 'success'
                ? 'bg-green-50 border-green-200'
                : scheduleStatus.scheduleStatus === 'failed'
                ? 'bg-red-50 border-red-200'
                : scheduleStatus.scheduleStatus === 'running'
                ? 'bg-blue-50 border-blue-200'
                : scheduleStatus.scheduleStatus === 'waiting'
                ? 'bg-yellow-50 border-yellow-200'
                : 'bg-gray-50 border-gray-200'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">
                    {scheduleStatus.scheduleStatus === 'success' && '✅'}
                    {scheduleStatus.scheduleStatus === 'failed' && '❌'}
                    {scheduleStatus.scheduleStatus === 'running' && '🔄'}
                    {scheduleStatus.scheduleStatus === 'waiting' && '⏰'}
                    {scheduleStatus.scheduleStatus === 'pending' && '⚠️'}
                  </span>
                  <div>
                    <div className={`font-medium ${
                      scheduleStatus.scheduleStatus === 'success'
                        ? 'text-green-800'
                        : scheduleStatus.scheduleStatus === 'failed'
                        ? 'text-red-800'
                        : scheduleStatus.scheduleStatus === 'running'
                        ? 'text-blue-800'
                        : scheduleStatus.scheduleStatus === 'waiting'
                        ? 'text-yellow-800'
                        : 'text-gray-800'
                    }`}>
                      오늘의 자동 스크래핑 상태
                    </div>
                    <div className={`text-sm ${
                      scheduleStatus.scheduleStatus === 'success'
                        ? 'text-green-600'
                        : scheduleStatus.scheduleStatus === 'failed'
                        ? 'text-red-600'
                        : scheduleStatus.scheduleStatus === 'running'
                        ? 'text-blue-600'
                        : scheduleStatus.scheduleStatus === 'waiting'
                        ? 'text-yellow-600'
                        : 'text-gray-600'
                    }`}>
                      {scheduleStatus.statusMessage}
                    </div>
                    {scheduleStatus.todayScheduledRun && (
                      <div className="text-xs text-gray-500 mt-1">
                        실행 시간: {new Date(scheduleStatus.todayScheduledRun.created_at).toLocaleString('ko-KR')}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* 실패 시 재실행 버튼 */}
                  {scheduleStatus.scheduleStatus === 'failed' && scheduleStatus.todayScheduledRun && (
                    <button
                      onClick={handleRetrySchedule}
                      disabled={isRetrying}
                      className="text-sm px-3 py-1 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      {isRetrying ? (
                        <>
                          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          재시도 중...
                        </>
                      ) : (
                        <>🔄 재실행</>
                      )}
                    </button>
                  )}
                  {scheduleStatus.todayScheduledRun && (
                    <a
                      href={scheduleStatus.todayScheduledRun.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`text-sm px-3 py-1 rounded-md ${
                        scheduleStatus.scheduleStatus === 'success'
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : scheduleStatus.scheduleStatus === 'failed'
                          ? 'bg-red-100 text-red-700 hover:bg-red-200'
                          : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                      }`}
                    >
                      상세 보기
                    </a>
                  )}
                  {/* 스케줄 대응 로그 보기 버튼 */}
                  {scheduleFailureLogs.length > 0 && (() => {
                    // 로그 상태에 따른 버튼 텍스트 결정
                    const hasRunning = scheduleFailureLogs.some(log => log.retryStatus === 'running');
                    const hasSuccess = scheduleFailureLogs.some(log => log.retryStatus === 'success');
                    const hasFailed = scheduleFailureLogs.some(log => log.retryStatus === 'failed' || log.responseStatus === 'response_failed');

                    let buttonText = '📋 대응 로그';
                    let buttonClass = 'bg-gray-100 text-gray-700 hover:bg-gray-200';

                    if (hasRunning) {
                      buttonText = '🔄 진행중';
                      buttonClass = 'bg-blue-100 text-blue-700 hover:bg-blue-200';
                    } else if (hasSuccess && !hasFailed) {
                      buttonText = '✅ 성공 로그';
                      buttonClass = 'bg-green-100 text-green-700 hover:bg-green-200';
                    } else if (hasFailed && !hasSuccess) {
                      buttonText = '❌ 실패 로그';
                      buttonClass = 'bg-red-100 text-red-700 hover:bg-red-200';
                    } else if (hasSuccess && hasFailed) {
                      buttonText = '📋 대응 로그';
                      buttonClass = 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200';
                    }

                    return (
                      <button
                        onClick={() => setShowFailureLogs(!showFailureLogs)}
                        className={`text-sm px-3 py-1 rounded-md ${buttonClass}`}
                      >
                        {buttonText} ({scheduleFailureLogs.length})
                      </button>
                    );
                  })()}
                  <button
                    onClick={fetchScheduleStatus}
                    className="text-gray-500 hover:text-gray-700 p-1"
                    title="새로고침"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* 스케줄 대응 로그 목록 */}
              {showFailureLogs && scheduleFailureLogs.length > 0 && (() => {
                // 섹션 제목 결정
                const hasRunning = scheduleFailureLogs.some(log => log.retryStatus === 'running');
                const hasSuccess = scheduleFailureLogs.some(log => log.retryStatus === 'success');
                const hasFailed = scheduleFailureLogs.some(log => log.retryStatus === 'failed' || log.responseStatus === 'response_failed');

                let sectionTitle = '스케줄 대응 로그';
                if (hasRunning) {
                  sectionTitle = '스케줄 대응 진행중';
                } else if (hasSuccess && !hasFailed) {
                  sectionTitle = '스케줄 대응 성공 로그';
                } else if (hasFailed && !hasSuccess) {
                  sectionTitle = '스케줄 대응 실패 로그';
                }

                return (
                <div className="mt-4 border-t pt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">{sectionTitle}</h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {scheduleFailureLogs.map((log) => (
                      <div key={log.id} className="bg-gray-50 rounded p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              log.responseStatus === 'responded' ? 'bg-green-100 text-green-700' :
                              log.responseStatus === 'response_failed' ? 'bg-red-100 text-red-700' :
                              log.responseStatus === 'ignored' ? 'bg-gray-100 text-gray-700' :
                              'bg-yellow-100 text-yellow-700'
                            }`}>
                              {log.responseStatus === 'responded' ? '대응 완료' :
                               log.responseStatus === 'response_failed' ? '대응 실패' :
                               log.responseStatus === 'ignored' ? '무시됨' : '대응 대기'}
                            </span>
                            {log.retryStatus && (
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                log.retryStatus === 'success' ? 'bg-green-100 text-green-700' :
                                log.retryStatus === 'failed' ? 'bg-red-100 text-red-700' :
                                'bg-blue-100 text-blue-700'
                              }`}>
                                재시도: {log.retryStatus === 'success' ? '성공' : log.retryStatus === 'failed' ? '실패' : '진행중'}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {log.responseStatus === 'pending' && (
                              <button
                                onClick={() => handleIgnoreFailure(log.id)}
                                className="text-xs text-gray-500 hover:text-gray-700"
                              >
                                무시
                              </button>
                            )}
                            <a
                              href={log.scheduleRunUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:text-blue-800"
                            >
                              원본 보기
                            </a>
                            {log.retryRunUrl && (
                              <a
                                href={log.retryRunUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:text-blue-800"
                              >
                                재시도 보기
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          실패 시간: {new Date(log.failedAt).toLocaleString('ko-KR')}
                          {log.respondedAt && ` | 대응 시간: ${new Date(log.respondedAt).toLocaleString('ko-KR')}`}
                          {log.respondedBy && ` | 대응자: ${log.respondedBy}`}
                        </div>
                        {log.retryErrorMessage && (
                          <div className="mt-1 text-xs text-red-600">
                            오류: {log.retryErrorMessage}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                );
              })()}
            </div>
          ) : null}
        </div>

        {/* 탭 네비게이션 */}
        <div className="px-4 sm:px-0 mb-4">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              {canAccessTab('sales') && (
                <button
                  onClick={() => handleTabChange('sales')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'sales'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  판매 데이터 스크래핑
                </button>
              )}
              {canAccessTab('ads') && (
                <button
                  onClick={() => handleTabChange('ads')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'ads'
                      ? 'border-orange-500 text-orange-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  광고 데이터 스크래핑
                </button>
              )}
              {canAccessTab('realtime') && (
                <button
                  onClick={() => handleTabChange('realtime')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'realtime'
                      ? 'border-green-500 text-green-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  실시간 매출 (바르너)
                </button>
              )}
              {canAccessTab('period-sales') && (
                <button
                  onClick={() => handleTabChange('period-sales')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'period-sales'
                      ? 'border-purple-500 text-purple-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  기간별 매출 (바르너)
                </button>
              )}
              {canAccessTab('meta-ads') && (
                <button
                  onClick={() => handleTabChange('meta-ads')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'meta-ads'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Meta 광고 검색
                </button>
              )}
            </nav>
          </div>
        </div>

        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              {/* 판매 데이터 탭 */}
              {activeTab === 'sales' && (
                <>
                  <h2 className="text-lg font-medium text-gray-900 mb-4">
                    판매 데이터 스크래핑
                  </h2>

                  <div className="space-y-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                      <h3 className="text-sm font-medium text-blue-800 mb-2">스크립트 정보</h3>
                      <ul className="text-sm text-blue-700 space-y-1">
                        <li>• <strong>기능:</strong> Cigro 웹사이트에서 어제 날짜의 판매 데이터를 스크래핑</li>
                        <li>• <strong>브랜드:</strong> 바르너, 릴리이브, 보호리, 먼슬리픽, 색동서울</li>
                        <li>• <strong>저장소:</strong> Google Sheets (Cigro Sales 스프레드시트)</li>
                        <li>• <strong>중복 처리:</strong> 같은 날짜 데이터가 있으면 내용을 비교하여 업데이트</li>
                      </ul>
                    </div>

                {/* 브랜드 선택 섹션 */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    브랜드 선택 (선택사항)
                    {user.role !== 'admin' && (
                      <span className="text-sm text-gray-500 ml-2">
                        (권한이 있는 브랜드만 표시됩니다)
                      </span>
                    )}
                  </label>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <button
                      type="button"
                      onClick={handleSelectAllBrands}
                      className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors"
                    >
                      전체 선택
                    </button>
                    <button
                      type="button"
                      onClick={handleDeselectAllBrands}
                      className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
                    >
                      전체 해제
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {userAllowedBrands.map((brand) => (
                      <label key={brand} className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedBrands.includes(brand)}
                          onChange={() => handleBrandToggle(brand)}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-gray-700">{brand}</span>
                      </label>
                    ))}
                    {userAllowedBrands.length === 0 && (
                      <div className="col-span-full text-center text-gray-500 py-4">
                        접근 가능한 브랜드가 없습니다. 관리자에게 문의하세요.
                      </div>
                    )}
                  </div>
                        <p className="mt-2 text-xs text-gray-500">
                          {user.role === 'admin' 
                            ? '기본적으로 모든 브랜드가 선택되어 있습니다. 원하지 않는 브랜드는 체크를 해제하세요.'
                            : '권한이 있는 브랜드만 선택할 수 있습니다.'
                          }
                        </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="start-date" className="block text-sm font-medium text-gray-700">
                      시작 날짜 (선택사항)
                    </label>
                    <input
                      type="date"
                      id="start-date"
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      비워두면 어제 날짜로 자동 실행됩니다.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="end-date" className="block text-sm font-medium text-gray-700">
                      종료 날짜 (선택사항)
                    </label>
                    <input
                      type="date"
                      id="end-date"
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
                      value={endDate}
                      min={startDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      disabled={!startDate}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      {startDate ? '범위 스크래핑 시 종료 날짜를 선택하세요.' : '시작 날짜를 먼저 선택하세요.'}
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={executeScript}
                    disabled={isExecuting}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-md text-sm font-medium flex items-center gap-2"
                  >
                    {isExecuting ? (
                      <>
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                        </svg>
                        스크래핑 중...
                      </>
                    ) : (
                      <>
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        Cigro 데이터 스크래핑 실행
                      </>
                    )}
                  </button>
                  
                  <button
                    onClick={() => setShowConsole(!showConsole)}
                    className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-3 rounded-md text-sm font-medium flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {showConsole ? '콘솔 숨기기' : '콘솔 보기'}
                  </button>
                  
                  <button
                    onClick={() => {
                      setShowExecutionLogs(!showExecutionLogs);
                      if (!showExecutionLogs) {
                        fetchExecutionLogs();
                      }
                    }}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-3 rounded-md text-sm font-medium flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    {showExecutionLogs ? '실행 로그 숨기기' : '실행 로그 보기'}
                  </button>
                  
                  {isExecuting && (
                    <button
                      onClick={abortScript}
                      className="bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded-md text-sm font-medium flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      스크래핑 중단
                    </button>
                  )}
                  
                  {showConsole && (
                    <button
                      onClick={clearConsole}
                      className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-3 rounded-md text-sm font-medium flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      콘솔 지우기
                    </button>
                  )}
                </div>
              </div>

              {/* 실시간 콘솔창 */}
              {showConsole && (
                <div className="mt-6">
                  <div className="console-container bg-black text-green-400 font-mono text-sm rounded-lg p-4 h-96 overflow-y-auto border border-gray-600">
                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-700">
                      <span className="text-green-300 font-semibold">📟 실시간 콘솔</span>
                      <div className="flex items-center gap-2">
                        {isPolling && (
                          <span className="text-blue-400 text-xs animate-pulse">
                            🔄 모니터링 중
                          </span>
                        )}
                        <span className="text-gray-400 text-xs">
                          {consoleLogs.length}개 로그
                        </span>
                      </div>
                    </div>
                    
                    {/* GitHub Actions 상태 표시 */}
                    {workflowStatus && (
                      <div className="mb-3 p-2 bg-gray-800 rounded border border-gray-600">
                        <div className="text-yellow-400 text-xs font-semibold mb-1">
                          🚀 GitHub Actions 상태
                        </div>
                        <div className="text-xs space-y-1">
                          <div>
                            상태: <span className={`font-semibold ${
                              workflowStatus.status === 'completed' && workflowStatus.conclusion === 'success' ? 'text-green-400' :
                              workflowStatus.status === 'completed' && workflowStatus.conclusion !== 'success' ? 'text-red-400' :
                              workflowStatus.status === 'in_progress' ? 'text-blue-400' :
                              'text-yellow-400'
                            }`}>
                              {workflowStatus.status === 'completed' ? 
                                (workflowStatus.conclusion === 'success' ? '✅ 완료 (성공)' : '❌ 완료 (실패)') :
                                workflowStatus.status === 'in_progress' ? '🔄 실행 중' :
                                workflowStatus.status === 'queued' ? '⏳ 대기 중' :
                                workflowStatus.status
                              }
                            </span>
                          </div>
                          {workflowStatus.run && (
                            <div>
                              실행 ID: <span className="text-gray-300">{workflowStatus.run.id}</span>
                            </div>
                          )}
                          {workflowStatus.jobs && workflowStatus.jobs.length > 0 && (
                            <>
                              <div>
                                작업: <span className="text-gray-300">{workflowStatus.jobs[0].name}</span>
                              </div>
                              {/* Steps 진행 상태 */}
                              {workflowStatus.jobs[0].steps && workflowStatus.jobs[0].steps.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-gray-700">
                                  <div className="text-yellow-400 text-xs font-semibold mb-1">📋 Steps 진행 상태</div>
                                  <div className="space-y-0.5 max-h-32 overflow-y-auto">
                                    {workflowStatus.jobs[0].steps.map((step: { name: string; status: string; conclusion?: string; number: number }) => {
                                      let stepIcon = '⏳';
                                      let stepColor = 'text-gray-500';
                                      if (step.status === 'completed') {
                                        if (step.conclusion === 'success') {
                                          stepIcon = '✅';
                                          stepColor = 'text-green-400';
                                        } else if (step.conclusion === 'skipped') {
                                          stepIcon = '⏭️';
                                          stepColor = 'text-gray-400';
                                        } else {
                                          stepIcon = '❌';
                                          stepColor = 'text-red-400';
                                        }
                                      } else if (step.status === 'in_progress') {
                                        stepIcon = '🔄';
                                        stepColor = 'text-blue-400 animate-pulse';
                                      }
                                      return (
                                        <div key={step.number} className={`text-xs ${stepColor}`}>
                                          {stepIcon} {step.name}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )}
                    
                    <div className="space-y-1">
                      {consoleLogs.length === 0 ? (
                        <div className="text-gray-500 italic">
                          콘솔이 비어있습니다. 스크래핑을 실행하면 로그가 표시됩니다.
                        </div>
                      ) : (
                        consoleLogs.map((log, index) => {
                          let logColor = 'text-gray-300';
                          if (log.includes('✅') || log.includes('🎉')) {
                            logColor = 'text-green-400';
                          } else if (log.includes('❌')) {
                            logColor = 'text-red-400';
                          } else if (log.includes('⚠️')) {
                            logColor = 'text-yellow-400';
                          } else if (log.includes('📡') || log.includes('📥') || log.includes('🔄') || log.includes('[Step')) {
                            logColor = 'text-blue-400';
                          } else if (log.includes('🚀') || log.includes('📅') || log.includes('📋')) {
                            logColor = 'text-cyan-400';
                          }
                          
                          return (
                            <div key={index} className={`${logColor} leading-relaxed`}>
                              {log}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* 실행 로그 */}
              {showExecutionLogs && (
                <div className="mt-6">
                  <div className="bg-white rounded-lg shadow border border-gray-200">
                    <div className="px-4 py-3 border-b border-gray-200">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-medium text-gray-900">📊 실행 로그</h3>
                        <span className="text-sm text-gray-500">
                          총 {executionLogs.length}개 실행 기록
                        </span>
                      </div>
                    </div>
                    
                    <div className="p-4">
                      {executionLogs.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                          <p className="mt-2">아직 실행 기록이 없습니다.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {executionLogs.map((log) => (
                            <div key={log.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                      log.status === 'success' ? 'bg-green-100 text-green-800' :
                                      log.status === 'failed' ? 'bg-red-100 text-red-800' :
                                      'bg-yellow-100 text-yellow-800'
                                    }`}>
                                      {log.status === 'success' ? '✅ 성공' :
                                       log.status === 'failed' ? '❌ 실패' :
                                       '🔄 실행 중'}
                                    </span>
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                      log.executionType === 'manual' ? 'bg-blue-100 text-blue-800' :
                                      log.executionType === 'scheduled' ? 'bg-purple-100 text-purple-800' :
                                      'bg-gray-100 text-gray-800'
                                    }`}>
                                      {log.executionType === 'manual' ? '👤 수동 실행' :
                                       log.executionType === 'scheduled' ? '⏰ 자동 실행' :
                                       '🔗 API 실행'}
                                    </span>
                                  </div>
                                  
                                  <div className="text-sm text-gray-900 mb-1">
                                    <strong>{log.username}</strong>님이 실행
                                  </div>
                                  
                                  <div className="text-sm text-gray-600 mb-2">
                                    브랜드: {log.brands.length > 0 ? log.brands.join(', ') : '모든 브랜드'}
                                    {log.date && ` | 날짜: ${log.date}`}
                                  </div>
                                  
                                  <div className="text-xs text-gray-500">
                                    시작: {new Date(log.startTime).toLocaleString('ko-KR')}
                                    {log.endTime && ` | 완료: ${new Date(log.endTime).toLocaleString('ko-KR')}`}
                                  </div>
                                  
                                  {log.errorMessage && (
                                    <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded">
                                      오류: {log.errorMessage}
                                    </div>
                                  )}
                                  
                                  {log.workflowUrl && (
                                    <div className="mt-2">
                                      <a 
                                        href={log.workflowUrl} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:text-blue-800 text-sm underline"
                                      >
                                        🔗 GitHub Actions에서 보기
                                      </a>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Results */}
              {result && (
                <div className="mt-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Execution Results</h3>
                  
                  <div className="space-y-4">
                    {/* Status */}
                    <div className={`p-3 rounded-md ${
                      result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                    }`}>
                      <div className={`text-sm font-medium ${
                        result.success ? 'text-green-800' : 'text-red-800'
                      }`}>
                        Status: {result.success ? 'Success' : 'Failed'}
                      </div>
                    </div>

                    {/* Command */}
                    {result.command && (
                      <div className="bg-gray-50 p-3 rounded-md">
                        <div className="text-sm font-medium text-gray-700 mb-1">Command:</div>
                        <code className="text-sm text-gray-900 bg-white p-2 rounded border block">
                          {result.command}
                        </code>
                      </div>
                    )}

                    {/* Output */}
                    {result.output && (
                      <div className="bg-gray-50 p-3 rounded-md">
                        <div className="text-sm font-medium text-gray-700 mb-1">실행 결과:</div>
                        <pre className="text-sm text-gray-900 bg-white p-2 rounded border overflow-auto max-h-64 whitespace-pre-wrap">
                          {result.output}
                        </pre>
                      </div>
                    )}

                    {/* Error */}
                    {result.error && (
                      <div className="bg-red-50 p-3 rounded-md">
                        <div className="text-sm font-medium text-red-700 mb-1">오류 메시지:</div>
                        <pre className="text-sm text-red-900 bg-white p-2 rounded border overflow-auto max-h-64 whitespace-pre-wrap">
                          {result.error}
                        </pre>
                        <div className="mt-2 text-xs text-red-600">
                          💡 <strong>문제 해결 방법:</strong>
                          <ul className="mt-1 ml-4 list-disc">
                            {result.suggestions && result.suggestions.length > 0 ? (
                              result.suggestions.map((suggestion, index) => (
                                <li key={index}>{suggestion}</li>
                              ))
                            ) : (
                              <>
                                <li>웹사이트 구조가 변경되었을 수 있습니다</li>
                                <li>로그인 정보가 올바른지 확인해주세요</li>
                                <li>인터넷 연결 상태를 확인해주세요</li>
                                <li>Google Sheets 인증 파일이 올바른지 확인해주세요</li>
                              </>
                            )}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* 광고 데이터 탭 */}
              {activeTab === 'ads' && (
                <>
                  <h2 className="text-lg font-medium text-gray-900 mb-4">
                    광고 데이터 스크래핑
                  </h2>

                  <div className="space-y-4">
                    <div className="bg-orange-50 border border-orange-200 rounded-md p-4">
                      <h3 className="text-sm font-medium text-orange-800 mb-2">스크립트 정보</h3>
                      <ul className="text-sm text-orange-700 space-y-1">
                        <li>• <strong>기능:</strong> Cigro 웹사이트에서 어제 날짜의 광고 데이터를 스크래핑</li>
                        <li>• <strong>브랜드:</strong> 바르너, 색동서울, 보호리, 먼슬리픽, 릴리이브</li>
                        <li>• <strong>저장소:</strong> Google Sheets (브랜드명_광고 시트)</li>
                        <li>• <strong>중복 처리:</strong> 같은 날짜 데이터가 있으면 내용을 비교하여 업데이트</li>
                      </ul>
                    </div>

                    {/* 광고 브랜드 선택 */}
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 mb-3">
                        브랜드 선택 (선택사항)
                      </label>
                      <div className="flex flex-wrap gap-2 mb-3">
                        <button
                          type="button"
                          onClick={handleSelectAllAdsBrands}
                          className="px-3 py-1 text-xs bg-orange-100 text-orange-700 rounded-md hover:bg-orange-200"
                        >
                          전체 선택
                        </button>
                        <button
                          type="button"
                          onClick={handleDeselectAllAdsBrands}
                          className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                        >
                          전체 해제
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {availableAdsBrands.map((brand) => (
                          <label key={brand} className="flex items-center space-x-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedAdsBrands.includes(brand)}
                              onChange={() => handleAdsBrandToggle(brand)}
                              className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                            />
                            <span className="text-sm text-gray-700">{brand}</span>
                          </label>
                        ))}
                      </div>
                      <p className="mt-2 text-xs text-gray-500">
                        비워두면 어제 날짜로 자동 실행됩니다.
                      </p>
                    </div>

                    {/* 날짜 선택 */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label htmlFor="ads-start-date" className="block text-sm font-medium text-gray-700">
                          시작 날짜 (선택사항)
                        </label>
                        <input
                          type="date"
                          id="ads-start-date"
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 sm:text-sm text-gray-900"
                          value={adsStartDate}
                          onChange={(e) => setAdsStartDate(e.target.value)}
                        />
                        <p className="mt-1 text-xs text-gray-500">비워두면 어제 날짜로 자동 실행됩니다.</p>
                      </div>
                      <div>
                        <label htmlFor="ads-end-date" className="block text-sm font-medium text-gray-700">
                          종료 날짜 (선택사항)
                        </label>
                        <input
                          type="date"
                          id="ads-end-date"
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 sm:text-sm text-gray-900"
                          value={adsEndDate}
                          min={adsStartDate}
                          onChange={(e) => setAdsEndDate(e.target.value)}
                          disabled={!adsStartDate}
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          {adsStartDate ? '범위 스크래핑 시 종료 날짜를 선택하세요.' : '시작 날짜를 먼저 선택하세요.'}
                        </p>
                      </div>
                    </div>

                    {/* 실행 버튼 */}
                    <div className="flex gap-3">
                      <button
                        onClick={executeAdsScript}
                        disabled={isExecuting}
                        className="bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-md text-sm font-medium flex items-center gap-2"
                      >
                        {isExecuting ? (
                          <>
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                            </svg>
                            스크래핑 중...
                          </>
                        ) : (
                          <>
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                            광고 데이터 스크래핑 실행
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => setShowConsole(!showConsole)}
                        className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-3 rounded-md text-sm font-medium"
                      >
                        {showConsole ? '콘솔 숨기기' : '콘솔 보기'}
                      </button>
                      {isExecuting && (
                        <button
                          onClick={abortScript}
                          className="bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded-md text-sm font-medium"
                        >
                          스크래핑 중단
                        </button>
                      )}
                    </div>

                    {/* 콘솔 */}
                    {showConsole && (
                      <div className="mt-4 bg-gray-900 rounded-lg p-4 font-mono text-sm h-64 overflow-y-auto">
                        <div className="text-green-400 mb-2">$ 광고 스크래핑 콘솔</div>
                        <div className="space-y-1">
                          {consoleLogs.length === 0 ? (
                            <div className="text-gray-500 italic">콘솔이 비어있습니다.</div>
                          ) : (
                            consoleLogs.map((log, index) => {
                              let logColor = 'text-gray-300';
                              if (log.includes('✅') || log.includes('🎉')) logColor = 'text-green-400';
                              else if (log.includes('❌')) logColor = 'text-red-400';
                              else if (log.includes('⚠️')) logColor = 'text-yellow-400';
                              else if (log.includes('📡') || log.includes('🔄')) logColor = 'text-blue-400';
                              return <div key={index} className={logColor}>{log}</div>;
                            })
                          )}
                        </div>
                      </div>
                    )}

                    {/* 결과 */}
                    {result && (
                      <div className={`mt-4 p-4 rounded-md ${result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                        <div className={`text-sm font-medium ${result.success ? 'text-green-800' : 'text-red-800'}`}>
                          {result.success ? '✅ 성공' : '❌ 실패'}
                        </div>
                        {result.output && <p className="mt-1 text-sm text-gray-700">{result.output}</p>}
                        {result.error && <p className="mt-1 text-sm text-red-700">{result.error}</p>}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* 실시간 매출 탭 */}
              {activeTab === 'realtime' && (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-medium text-gray-900">
                      바르너 실시간 매출 현황
                    </h2>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={toggleAutoRefresh}
                        className={`px-3 py-1 text-xs rounded-md ${
                          autoRefresh
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {autoRefresh ? '🔄 자동 새로고침 ON' : '자동 새로고침 OFF'}
                      </button>
                      <button
                        onClick={fetchRealtimeSales}
                        disabled={realtimeLoading}
                        className="px-3 py-1 text-xs bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                      >
                        {realtimeLoading ? '로딩 중...' : '새로고침'}
                      </button>
                      {user?.role === 'admin' && (
                        <button
                          onClick={sendSlackNotification}
                          disabled={slackSending || realtimeLoading}
                          className="px-3 py-1 text-xs bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1"
                        >
                          {slackSending ? (
                            <>
                              <span className="animate-spin">⏳</span>
                              전송 중...
                            </>
                          ) : (
                            <>
                              <span>📤</span>
                              Slack 전송
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Slack 전송 결과 메시지 */}
                  {slackSendResult && (
                    <div className={`mb-4 p-3 rounded-md text-sm ${
                      slackSendResult.success
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : 'bg-red-50 text-red-700 border border-red-200'
                    }`}>
                      {slackSendResult.success ? '✅' : '❌'} {slackSendResult.message}
                    </div>
                  )}

                  {/* Cafe24 인증 필요 */}
                  {cafe24NeedsAuth && cafe24AuthUrl && (
                    <div className="mb-4 p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-start gap-4">
                        <div className="text-3xl">🔐</div>
                        <div className="flex-1">
                          <div className="text-lg font-medium text-yellow-800 mb-2">Cafe24 인증이 필요합니다</div>
                          <div className="text-sm text-yellow-700 mb-4">
                            실시간 매출 데이터를 조회하려면 Cafe24 쇼핑몰 관리자 권한으로 인증해야 합니다.
                            아래 버튼을 클릭하여 Cafe24에 로그인하고 앱 권한을 승인해주세요.
                          </div>
                          <a
                            href={cafe24AuthUrl}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                            </svg>
                            Cafe24 로그인하여 인증하기
                          </a>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 에러 메시지 (인증 필요가 아닌 경우) */}
                  {realtimeError && !cafe24NeedsAuth && (
                    <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
                      <div className="text-sm text-red-800">❌ {realtimeError}</div>
                      <div className="mt-2 text-xs text-red-600">
                        Cafe24 API 연동에 문제가 있을 수 있습니다. 앱 권한을 확인해주세요.
                      </div>
                    </div>
                  )}

                  {/* 로딩 상태 */}
                  {realtimeLoading && !realtimeSales && (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                      <span className="ml-2 text-gray-600">매출 데이터를 불러오는 중...</span>
                    </div>
                  )}

                  {/* 매출 데이터 */}
                  {realtimeSales && (
                    <div className="space-y-6">
                      {/* 마지막 업데이트 시간 */}
                      <div className="text-sm text-gray-500 text-right">
                        마지막 업데이트: {new Date(realtimeSales.lastUpdated).toLocaleString('ko-KR')}
                        {autoRefresh && <span className="ml-2 text-green-600">(1분마다 자동 새로고침)</span>}
                      </div>

                      {/* 주요 지표 카드 */}
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {/* 확정 매출 (입금확인 이상, 취소/환불 제외) */}
                        <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg p-4">
                          <div className="text-sm text-green-600 font-medium">확정 매출</div>
                          <div className="text-2xl font-bold text-green-800">
                            {realtimeSales.stats.totalSales.toLocaleString()}원
                          </div>
                          <div className="text-xs text-green-600 mt-1">
                            {realtimeSales.stats.validOrders || 0}건 (입금확인 이상)
                          </div>
                          {realtimeSales.yesterdayStats && (
                            <div className="text-xs mt-2 pt-2 border-t border-green-200">
                              <span className="text-gray-500">어제: {realtimeSales.yesterdayStats.totalSales.toLocaleString()}원</span>
                              {(() => {
                                const today = realtimeSales.stats.totalSales;
                                const yesterday = realtimeSales.yesterdayStats?.totalSales || 0;
                                if (yesterday === 0) return today > 0 ? <span className="ml-2 text-green-600 font-medium">▲ NEW</span> : null;
                                const changePercent = Math.round(((today - yesterday) / yesterday) * 100);
                                return (
                                  <span className={`ml-2 font-medium ${changePercent >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                    {changePercent >= 0 ? '▲' : '▼'} {Math.abs(changePercent)}%
                                  </span>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                        {/* 입금대기 */}
                        <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 border border-yellow-200 rounded-lg p-4">
                          <div className="text-sm text-yellow-600 font-medium">입금대기</div>
                          <div className="text-2xl font-bold text-yellow-800">
                            {(realtimeSales.stats.pendingAmount || 0).toLocaleString()}원
                          </div>
                          <div className="text-xs text-yellow-600 mt-1">
                            {realtimeSales.stats.pendingOrders || 0}건
                          </div>
                        </div>
                        {/* 취소/환불 */}
                        <div className="bg-gradient-to-br from-red-50 to-red-100 border border-red-200 rounded-lg p-4">
                          <div className="text-sm text-red-600 font-medium">취소/환불</div>
                          <div className="text-2xl font-bold text-red-800">
                            {(realtimeSales.stats.cancelRefundAmount || 0).toLocaleString()}원
                          </div>
                          <div className="text-xs text-red-600 mt-1">
                            {realtimeSales.stats.cancelRefundOrders || 0}건
                          </div>
                        </div>
                      </div>

                      {/* 추가 지표 */}
                      <div className="grid grid-cols-3 gap-4">
                        <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-4">
                          <div className="text-sm text-blue-600 font-medium">총 주문 수</div>
                          <div className="text-2xl font-bold text-blue-800">
                            {realtimeSales.stats.totalOrders}건
                          </div>
                          {realtimeSales.yesterdayStats && (
                            <div className="text-xs mt-1 text-gray-500">
                              어제: {realtimeSales.yesterdayStats.totalOrders}건
                              {(() => {
                                const today = realtimeSales.stats.totalOrders;
                                const yesterday = realtimeSales.yesterdayStats?.totalOrders || 0;
                                if (yesterday === 0) return today > 0 ? <span className="ml-1 text-blue-600">▲</span> : null;
                                const changePercent = Math.round(((today - yesterday) / yesterday) * 100);
                                return (
                                  <span className={`ml-1 ${changePercent >= 0 ? 'text-blue-600' : 'text-red-500'}`}>
                                    {changePercent >= 0 ? '▲' : '▼'}{Math.abs(changePercent)}%
                                  </span>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                        <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-lg p-4">
                          <div className="text-sm text-purple-600 font-medium">총 상품 수</div>
                          <div className="text-2xl font-bold text-purple-800">
                            {realtimeSales.stats.totalItems}개
                          </div>
                        </div>
                        <div className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 rounded-lg p-4">
                          <div className="text-sm text-orange-600 font-medium">평균 주문금액</div>
                          <div className="text-2xl font-bold text-orange-800">
                            {realtimeSales.stats.averageOrderValue.toLocaleString()}원
                          </div>
                        </div>
                      </div>

                      {/* 주문 상태별 현황 */}
                      {realtimeSales.orderStatus.length > 0 && (
                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                          <h3 className="text-sm font-medium text-gray-900 mb-3">주문 상태별 현황</h3>
                          <div className="flex flex-wrap gap-2">
                            {realtimeSales.orderStatus.map((status) => (
                              <div
                                key={status.status}
                                className="px-3 py-1 bg-gray-100 rounded-full text-sm"
                              >
                                <span className="text-gray-700">{status.label}</span>
                                <span className="ml-1 font-semibold text-gray-900">{status.count}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 시간별 매출 현황 */}
                      {realtimeSales.hourlySales && realtimeSales.hourlySales.length > 0 && (
                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                          <h3 className="text-sm font-medium text-gray-900 mb-4">
                            시간별 매출 현황
                            {realtimeSales.yesterdayHourlySales && (
                              <span className="ml-2 text-xs font-normal text-gray-500">(어제 대비)</span>
                            )}
                          </h3>
                          {/* 헤더 */}
                          <div className="flex items-center gap-2 mb-2 text-xs text-gray-500 border-b pb-2">
                            <div className="w-12 text-right">시간</div>
                            <div className="flex-1">오늘</div>
                            <div className="w-20 text-right">오늘 매출</div>
                            {realtimeSales.yesterdayHourlySales && (
                              <>
                                <div className="w-20 text-right">어제 매출</div>
                                <div className="w-16 text-right">증감</div>
                              </>
                            )}
                            <div className="w-10 text-right">주문</div>
                          </div>
                          <div className="space-y-1">
                            {/* 매출 바 차트 */}
                            {(() => {
                              const maxSales = Math.max(...realtimeSales.hourlySales.map(h => h.sales), 1);
                              const currentHour = new Date().getHours();
                              const yesterdayMap = new Map(
                                realtimeSales.yesterdayHourlySales?.map(h => [h.hour, h]) || []
                              );
                              return realtimeSales.hourlySales.map((hourData) => {
                                const percentage = (hourData.sales / maxSales) * 100;
                                const isCurrentHour = hourData.hour === currentHour;
                                const isFutureHour = hourData.hour > currentHour;
                                const yesterdayData = yesterdayMap.get(hourData.hour);
                                const yesterdaySales = yesterdayData?.sales || 0;

                                // 증감률 계산
                                let changePercent = 0;
                                let changeType: 'up' | 'down' | 'same' = 'same';
                                if (yesterdaySales > 0 && hourData.sales > 0) {
                                  changePercent = Math.round(((hourData.sales - yesterdaySales) / yesterdaySales) * 100);
                                  changeType = changePercent > 0 ? 'up' : changePercent < 0 ? 'down' : 'same';
                                } else if (hourData.sales > 0 && yesterdaySales === 0) {
                                  changeType = 'up';
                                } else if (hourData.sales === 0 && yesterdaySales > 0) {
                                  changeType = 'down';
                                }

                                return (
                                  <div key={hourData.hour} className={`flex items-center gap-2 py-1 ${isFutureHour ? 'opacity-40' : ''}`}>
                                    <div className={`w-12 text-xs text-right ${isCurrentHour ? 'font-bold text-blue-600' : 'text-gray-500'}`}>
                                      {String(hourData.hour).padStart(2, '0')}시
                                    </div>
                                    <div className="flex-1 h-5 bg-gray-100 rounded-sm overflow-hidden">
                                      <div
                                        className={`h-full transition-all duration-300 ${isCurrentHour ? 'bg-blue-500' : 'bg-green-400'}`}
                                        style={{ width: `${percentage}%` }}
                                      />
                                    </div>
                                    <div className={`w-20 text-xs text-right ${isCurrentHour ? 'font-bold text-blue-600' : 'text-gray-700'}`}>
                                      {hourData.sales > 0 ? `${hourData.sales.toLocaleString()}` : '-'}
                                    </div>
                                    {realtimeSales.yesterdayHourlySales && (
                                      <>
                                        <div className="w-20 text-xs text-right text-gray-400">
                                          {yesterdaySales > 0 ? `${yesterdaySales.toLocaleString()}` : '-'}
                                        </div>
                                        <div className={`w-16 text-xs text-right font-medium ${
                                          changeType === 'up' ? 'text-green-600' :
                                          changeType === 'down' ? 'text-red-500' :
                                          'text-gray-400'
                                        }`}>
                                          {isFutureHour ? '-' :
                                           hourData.sales === 0 && yesterdaySales === 0 ? '-' :
                                           changeType === 'up' ? `▲${changePercent > 0 ? changePercent + '%' : 'NEW'}` :
                                           changeType === 'down' ? `▼${Math.abs(changePercent)}%` :
                                           '-'}
                                        </div>
                                      </>
                                    )}
                                    <div className={`w-10 text-xs text-right ${isCurrentHour ? 'font-bold text-blue-600' : 'text-gray-500'}`}>
                                      {hourData.orders > 0 ? `${hourData.orders}` : '-'}
                                    </div>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                          {/* 요약 정보 */}
                          <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-3 gap-4 text-center">
                            <div>
                              <div className="text-xs text-gray-500">최고 매출 시간대</div>
                              <div className="text-sm font-semibold text-green-600">
                                {(() => {
                                  const maxHour = realtimeSales.hourlySales.reduce((max, curr) =>
                                    curr.sales > max.sales ? curr : max, realtimeSales.hourlySales[0]);
                                  return maxHour.sales > 0 ? `${String(maxHour.hour).padStart(2, '0')}시` : '-';
                                })()}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500">총 주문 시간대</div>
                              <div className="text-sm font-semibold text-blue-600">
                                {realtimeSales.hourlySales.filter(h => h.orders > 0).length}개 시간대
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-500">시간당 평균 매출</div>
                              <div className="text-sm font-semibold text-purple-600">
                                {(() => {
                                  const hoursWithSales = realtimeSales.hourlySales.filter(h => h.sales > 0);
                                  if (hoursWithSales.length === 0) return '-';
                                  const avgSales = Math.round(hoursWithSales.reduce((sum, h) => sum + h.sales, 0) / hoursWithSales.length);
                                  return `${avgSales.toLocaleString()}원`;
                                })()}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 현재 시간까지 매출 비교 */}
                      {realtimeSales.yesterdayHourlySales && (
                        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 border border-indigo-200 rounded-lg p-4">
                          <h3 className="text-sm font-medium text-indigo-800 mb-3">
                            현재 시간까지 매출 비교 ({String(new Date().getHours()).padStart(2, '0')}시 기준)
                          </h3>
                          {(() => {
                            const currentHour = new Date().getHours();
                            const todayUntilNow = realtimeSales.hourlySales
                              .filter(h => h.hour <= currentHour)
                              .reduce((sum, h) => sum + h.sales, 0);
                            const yesterdayUntilNow = realtimeSales.yesterdayHourlySales
                              ?.filter(h => h.hour <= currentHour)
                              .reduce((sum, h) => sum + h.sales, 0) || 0;
                            const diff = todayUntilNow - yesterdayUntilNow;
                            const changePercent = yesterdayUntilNow > 0
                              ? Math.round((diff / yesterdayUntilNow) * 100)
                              : todayUntilNow > 0 ? 100 : 0;

                            return (
                              <div className="grid grid-cols-3 gap-4 text-center">
                                <div>
                                  <div className="text-xs text-indigo-600">오늘</div>
                                  <div className="text-lg font-bold text-indigo-800">
                                    {todayUntilNow.toLocaleString()}원
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs text-gray-500">어제 같은 시간</div>
                                  <div className="text-lg font-bold text-gray-600">
                                    {yesterdayUntilNow.toLocaleString()}원
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs text-gray-500">차이</div>
                                  <div className={`text-lg font-bold ${diff >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                    {diff >= 0 ? '+' : ''}{diff.toLocaleString()}원
                                    <span className="text-sm ml-1">
                                      ({diff >= 0 ? '▲' : '▼'}{Math.abs(changePercent)}%)
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      {/* TOP 5 상품 - 오늘/어제 비교 */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* 오늘의 TOP 5 상품 */}
                        {realtimeSales.topProducts && realtimeSales.topProducts.length > 0 && (
                          <div className="bg-white border border-gray-200 rounded-lg">
                            <div className="px-4 py-3 border-b border-gray-200 bg-green-50">
                              <h3 className="text-sm font-medium text-green-800">오늘의 TOP 5 상품</h3>
                            </div>
                            <div className="divide-y divide-gray-100">
                              {realtimeSales.topProducts.map((product, index) => (
                                <div key={product.name} className="px-4 py-2 hover:bg-gray-50 flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                      index === 0 ? 'bg-yellow-400 text-yellow-900' :
                                      index === 1 ? 'bg-gray-300 text-gray-700' :
                                      index === 2 ? 'bg-orange-300 text-orange-800' :
                                      'bg-gray-100 text-gray-600'
                                    }`}>
                                      {index + 1}
                                    </div>
                                    <div className="text-xs font-medium text-gray-900 truncate max-w-[120px]" title={product.name}>
                                      {product.name}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3 text-right">
                                    <div className="text-xs text-blue-600 font-semibold">{product.quantity}개</div>
                                    <div className="text-xs text-green-600 font-semibold w-20">{product.sales.toLocaleString()}원</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 어제의 TOP 5 상품 */}
                        {realtimeSales.yesterdayTopProducts && realtimeSales.yesterdayTopProducts.length > 0 && (
                          <div className="bg-white border border-gray-200 rounded-lg">
                            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                              <h3 className="text-sm font-medium text-gray-700">어제의 TOP 5 상품</h3>
                            </div>
                            <div className="divide-y divide-gray-100">
                              {realtimeSales.yesterdayTopProducts.map((product, index) => (
                                <div key={product.name} className="px-4 py-2 hover:bg-gray-50 flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                      index === 0 ? 'bg-yellow-200 text-yellow-800' :
                                      index === 1 ? 'bg-gray-200 text-gray-600' :
                                      index === 2 ? 'bg-orange-200 text-orange-700' :
                                      'bg-gray-100 text-gray-500'
                                    }`}>
                                      {index + 1}
                                    </div>
                                    <div className="text-xs font-medium text-gray-700 truncate max-w-[120px]" title={product.name}>
                                      {product.name}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3 text-right">
                                    <div className="text-xs text-gray-500 font-semibold">{product.quantity}개</div>
                                    <div className="text-xs text-gray-500 font-semibold w-20">{product.sales.toLocaleString()}원</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 최근 주문 목록 */}
                      {realtimeSales.recentOrders.length > 0 && (
                        <div className="bg-white border border-gray-200 rounded-lg">
                          <div className="px-4 py-3 border-b border-gray-200">
                            <h3 className="text-sm font-medium text-gray-900">최근 주문 (최대 10건)</h3>
                          </div>
                          <div className="divide-y divide-gray-100">
                            {realtimeSales.recentOrders.map((order) => (
                              <div key={order.orderId} className="px-4 py-3 hover:bg-gray-50">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="text-sm font-medium text-gray-900">
                                      {order.productName}
                                      {order.itemCount > 1 && (
                                        <span className="text-gray-500"> 외 {order.itemCount - 1}개</span>
                                      )}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      주문번호: {order.orderId} | {new Date(order.orderDate).toLocaleString('ko-KR')}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-sm font-semibold text-gray-900">
                                      {order.amount.toLocaleString()}원
                                    </div>
                                    <div className={`text-xs px-2 py-0.5 rounded-full inline-block ${
                                      order.status?.includes('완료') ? 'bg-green-100 text-green-700' :
                                      order.status?.includes('배송') ? 'bg-blue-100 text-blue-700' :
                                      order.status?.includes('준비') ? 'bg-yellow-100 text-yellow-700' :
                                      'bg-gray-100 text-gray-700'
                                    }`}>
                                      {order.status || '상태 없음'}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 데이터 없음 */}
                      {realtimeSales.recentOrders.length === 0 && (
                        <div className="text-center py-8 text-gray-500">
                          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                          <p className="mt-2">오늘 주문이 아직 없습니다.</p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* 기간별 매출 탭 */}
              {activeTab === 'period-sales' && (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-medium text-gray-900">
                      바르너 기간별 매출 조회
                    </h2>
                  </div>

                  {/* 날짜 범위 선택 */}
                  <div className="mb-6 p-4 bg-purple-50 rounded-lg">
                    <div className="flex flex-wrap gap-4 items-end">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">시작일</label>
                        <input
                          type="date"
                          value={periodSalesStartDate}
                          onChange={(e) => setPeriodSalesStartDate(e.target.value)}
                          className="px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500 text-gray-900"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">종료일</label>
                        <input
                          type="date"
                          value={periodSalesEndDate}
                          onChange={(e) => setPeriodSalesEndDate(e.target.value)}
                          className="px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500 text-gray-900"
                        />
                      </div>
                      <button
                        onClick={fetchPeriodSales}
                        disabled={periodSalesLoading || !periodSalesStartDate || !periodSalesEndDate}
                        className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {periodSalesLoading ? '조회 중...' : '조회'}
                      </button>
                    </div>
                    {/* 비교 토글 */}
                    <div className="mt-3 flex items-center gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={compareEnabled}
                          onChange={(e) => setCompareEnabled(e.target.checked)}
                          className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                        />
                        <span className="text-sm text-gray-700">이전 기간과 비교</span>
                      </label>
                      {compareEnabled && periodSalesStartDate && periodSalesEndDate && (
                        <span className="text-xs text-gray-500">
                          (비교 기간: {(() => {
                            const startDate = new Date(periodSalesStartDate);
                            const endDate = new Date(periodSalesEndDate);
                            const periodDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                            const compareEndDate = new Date(startDate);
                            compareEndDate.setDate(compareEndDate.getDate() - 1);
                            const compareStartDate = new Date(compareEndDate);
                            compareStartDate.setDate(compareStartDate.getDate() - periodDays + 1);
                            return `${compareStartDate.toISOString().split('T')[0]} ~ ${compareEndDate.toISOString().split('T')[0]}`;
                          })()})
                        </span>
                      )}
                    </div>
                    {/* 빠른 선택 버튼 */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          const today = new Date();
                          // 로컬 시간대 기준으로 YYYY-MM-DD 포맷
                          const formatDate = (d: Date) => {
                            const year = d.getFullYear();
                            const month = String(d.getMonth() + 1).padStart(2, '0');
                            const day = String(d.getDate()).padStart(2, '0');
                            return `${year}-${month}-${day}`;
                          };
                          // 이번 주 월요일 찾기 (월요일 = 1)
                          const dayOfWeek = today.getDay();
                          const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
                          const startOfWeek = new Date(today);
                          startOfWeek.setDate(today.getDate() + diffToMonday);
                          // 이번 주 일요일 (월요일 + 6일)
                          const endOfWeek = new Date(startOfWeek);
                          endOfWeek.setDate(startOfWeek.getDate() + 6);
                          setPeriodSalesStartDate(formatDate(startOfWeek));
                          setPeriodSalesEndDate(formatDate(endOfWeek));
                        }}
                        className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                      >
                        이번 주
                      </button>
                      <button
                        onClick={() => {
                          const today = new Date();
                          // 로컬 시간대 기준으로 YYYY-MM-DD 포맷
                          const formatDate = (d: Date) => {
                            const year = d.getFullYear();
                            const month = String(d.getMonth() + 1).padStart(2, '0');
                            const day = String(d.getDate()).padStart(2, '0');
                            return `${year}-${month}-${day}`;
                          };
                          // 지난 주 월요일 찾기
                          const dayOfWeek = today.getDay();
                          const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
                          const thisMonday = new Date(today);
                          thisMonday.setDate(today.getDate() + diffToMonday);
                          const lastMonday = new Date(thisMonday);
                          lastMonday.setDate(thisMonday.getDate() - 7);
                          const lastSunday = new Date(lastMonday);
                          lastSunday.setDate(lastMonday.getDate() + 6);
                          setPeriodSalesStartDate(formatDate(lastMonday));
                          setPeriodSalesEndDate(formatDate(lastSunday));
                        }}
                        className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                      >
                        지난 주
                      </button>
                      <button
                        onClick={() => {
                          const today = new Date();
                          const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                          const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                          // 로컬 시간대 기준으로 YYYY-MM-DD 포맷
                          const formatDate = (d: Date) => {
                            const year = d.getFullYear();
                            const month = String(d.getMonth() + 1).padStart(2, '0');
                            const day = String(d.getDate()).padStart(2, '0');
                            return `${year}-${month}-${day}`;
                          };
                          setPeriodSalesStartDate(formatDate(startOfMonth));
                          setPeriodSalesEndDate(formatDate(endOfMonth));
                        }}
                        className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                      >
                        이번 달
                      </button>
                      <button
                        onClick={() => {
                          const today = new Date();
                          const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                          const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
                          // 로컬 시간대 기준으로 YYYY-MM-DD 포맷
                          const formatDate = (d: Date) => {
                            const year = d.getFullYear();
                            const month = String(d.getMonth() + 1).padStart(2, '0');
                            const day = String(d.getDate()).padStart(2, '0');
                            return `${year}-${month}-${day}`;
                          };
                          setPeriodSalesStartDate(formatDate(startOfLastMonth));
                          setPeriodSalesEndDate(formatDate(endOfLastMonth));
                        }}
                        className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                      >
                        지난 달
                      </button>
                      <button
                        onClick={() => {
                          const today = new Date();
                          // 로컬 시간대 기준으로 YYYY-MM-DD 포맷
                          const formatDate = (d: Date) => {
                            const year = d.getFullYear();
                            const month = String(d.getMonth() + 1).padStart(2, '0');
                            const day = String(d.getDate()).padStart(2, '0');
                            return `${year}-${month}-${day}`;
                          };
                          const lastWeek = new Date(today);
                          lastWeek.setDate(today.getDate() - 6);
                          setPeriodSalesStartDate(formatDate(lastWeek));
                          setPeriodSalesEndDate(formatDate(today));
                        }}
                        className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                      >
                        최근 7일
                      </button>
                      <button
                        onClick={() => {
                          const today = new Date();
                          // 로컬 시간대 기준으로 YYYY-MM-DD 포맷
                          const formatDate = (d: Date) => {
                            const year = d.getFullYear();
                            const month = String(d.getMonth() + 1).padStart(2, '0');
                            const day = String(d.getDate()).padStart(2, '0');
                            return `${year}-${month}-${day}`;
                          };
                          const last30Days = new Date(today);
                          last30Days.setDate(today.getDate() - 29);
                          setPeriodSalesStartDate(formatDate(last30Days));
                          setPeriodSalesEndDate(formatDate(today));
                        }}
                        className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                      >
                        최근 30일
                      </button>
                    </div>
                  </div>

                  {/* Cafe24 인증 필요 */}
                  {cafe24NeedsAuth && cafe24AuthUrl && (
                    <div className="mb-4 p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-start gap-4">
                        <div className="text-3xl">🔐</div>
                        <div className="flex-1">
                          <div className="text-lg font-medium text-yellow-800 mb-2">Cafe24 인증이 필요합니다</div>
                          <div className="text-sm text-yellow-700 mb-4">
                            매출 데이터를 조회하려면 Cafe24 쇼핑몰 관리자 권한으로 인증해야 합니다.
                          </div>
                          <a
                            href={cafe24AuthUrl}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                          >
                            Cafe24 로그인하여 인증하기
                          </a>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 에러 메시지 */}
                  {periodSalesError && !cafe24NeedsAuth && (
                    <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                      {periodSalesError}
                    </div>
                  )}

                  {/* 로딩 */}
                  {periodSalesLoading && (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                      <span className="ml-2 text-gray-600">데이터 조회 중...</span>
                    </div>
                  )}

                  {/* 기간별 매출 결과 */}
                  {periodSales && !periodSalesLoading && (
                    <div className="space-y-6">
                      {/* 조회 기간 표시 */}
                      <div className="text-sm text-gray-500 mb-4">
                        조회 기간: {periodSales.startDate} ~ {periodSales.endDate}
                        <span className="ml-2 text-xs text-gray-400">
                          (마지막 업데이트: {new Date(periodSales.lastUpdated).toLocaleString('ko-KR')})
                        </span>
                      </div>

                      {/* 매출 요약 카드 */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* 확정 매출 */}
                        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg p-4 text-white">
                          <div className="text-sm opacity-80">확정 매출 (부가세 제외)</div>
                          <div className="text-2xl font-bold mt-1">
                            {periodSales.stats.totalSales.toLocaleString()}원
                          </div>
                          <div className="text-xs mt-2 opacity-70">
                            {periodSales.stats.validOrders}건 | 평균 {periodSales.stats.averageOrderValue.toLocaleString()}원
                          </div>
                          {comparePeriodSales && (
                            <div className="mt-2 pt-2 border-t border-white/30">
                              <div className="text-xs opacity-70">이전 기간: {comparePeriodSales.stats.totalSales.toLocaleString()}원</div>
                              {(() => {
                                const diff = periodSales.stats.totalSales - comparePeriodSales.stats.totalSales;
                                const percent = comparePeriodSales.stats.totalSales > 0
                                  ? ((diff / comparePeriodSales.stats.totalSales) * 100).toFixed(1)
                                  : 0;
                                return (
                                  <div className={`text-sm font-medium ${diff >= 0 ? 'text-green-200' : 'text-red-200'}`}>
                                    {diff >= 0 ? '▲' : '▼'} {Math.abs(diff).toLocaleString()}원 ({diff >= 0 ? '+' : ''}{percent}%)
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </div>

                        {/* 입금대기 */}
                        <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-lg p-4 text-white">
                          <div className="text-sm opacity-80">입금대기</div>
                          <div className="text-2xl font-bold mt-1">
                            {periodSales.stats.pendingAmount.toLocaleString()}원
                          </div>
                          <div className="text-xs mt-2 opacity-70">
                            {periodSales.stats.pendingOrders}건
                          </div>
                        </div>

                        {/* 취소/환불 */}
                        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-lg p-4 text-white">
                          <div className="text-sm opacity-80">취소/환불</div>
                          <div className="text-2xl font-bold mt-1">
                            {periodSales.stats.cancelRefundAmount.toLocaleString()}원
                          </div>
                          <div className="text-xs mt-2 opacity-70">
                            {periodSales.stats.cancelRefundOrders}건
                          </div>
                        </div>
                      </div>

                      {/* 기간 비교 요약 */}
                      {comparePeriodSales && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <h3 className="text-md font-semibold text-blue-800 mb-3">
                            기간 비교 ({comparePeriodSales.startDate} ~ {comparePeriodSales.endDate} vs 현재)
                          </h3>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <div className="text-gray-500">매출 변화</div>
                              {(() => {
                                const diff = periodSales.stats.totalSales - comparePeriodSales.stats.totalSales;
                                const percent = comparePeriodSales.stats.totalSales > 0
                                  ? ((diff / comparePeriodSales.stats.totalSales) * 100).toFixed(1)
                                  : 0;
                                return (
                                  <div className={`font-bold ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {diff >= 0 ? '+' : ''}{diff.toLocaleString()}원 ({diff >= 0 ? '+' : ''}{percent}%)
                                  </div>
                                );
                              })()}
                            </div>
                            <div>
                              <div className="text-gray-500">주문수 변화</div>
                              {(() => {
                                const diff = periodSales.stats.validOrders - comparePeriodSales.stats.validOrders;
                                const percent = comparePeriodSales.stats.validOrders > 0
                                  ? ((diff / comparePeriodSales.stats.validOrders) * 100).toFixed(1)
                                  : 0;
                                return (
                                  <div className={`font-bold ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {diff >= 0 ? '+' : ''}{diff}건 ({diff >= 0 ? '+' : ''}{percent}%)
                                  </div>
                                );
                              })()}
                            </div>
                            <div>
                              <div className="text-gray-500">평균 주문액 변화</div>
                              {(() => {
                                const diff = periodSales.stats.averageOrderValue - comparePeriodSales.stats.averageOrderValue;
                                const percent = comparePeriodSales.stats.averageOrderValue > 0
                                  ? ((diff / comparePeriodSales.stats.averageOrderValue) * 100).toFixed(1)
                                  : 0;
                                return (
                                  <div className={`font-bold ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {diff >= 0 ? '+' : ''}{diff.toLocaleString()}원 ({diff >= 0 ? '+' : ''}{percent}%)
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 일자별 매출 */}
                      {periodSales && periodSalesStartDate && periodSalesEndDate && (
                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                          <h3 className="text-md font-semibold text-gray-800 mb-4">일자별 매출</h3>
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">날짜</th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">요일</th>
                                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">매출</th>
                                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">전일 대비</th>
                                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">주문수</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {(() => {
                                  // 선택된 기간의 모든 날짜 생성
                                  const allDates: string[] = [];
                                  const start = new Date(periodSalesStartDate);
                                  const end = new Date(periodSalesEndDate);
                                  const today = new Date();
                                  today.setHours(0, 0, 0, 0);

                                  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                                    allDates.push(d.toISOString().split('T')[0]);
                                  }

                                  // dailySales 데이터를 날짜별로 맵핑
                                  const salesMap = new Map<string, { sales: number; orders: number }>();
                                  periodSales.dailySales?.forEach(day => {
                                    salesMap.set(day.date, { sales: day.sales, orders: day.orders });
                                  });

                                  return allDates.map((dateStr, index) => {
                                    const date = new Date(dateStr);
                                    const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
                                    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                                    const isFuture = date > today;
                                    const dayData = salesMap.get(dateStr);
                                    const prevDateStr = index > 0 ? allDates[index - 1] : null;
                                    const prevDayData = prevDateStr ? salesMap.get(prevDateStr) : null;

                                    const sales = dayData?.sales ?? null;
                                    const orders = dayData?.orders ?? null;
                                    const diff = sales !== null && prevDayData ? sales - prevDayData.sales : null;
                                    const diffPercent = diff !== null && prevDayData && prevDayData.sales > 0
                                      ? ((diff / prevDayData.sales) * 100).toFixed(1)
                                      : null;

                                    return (
                                      <tr key={dateStr} className={`hover:bg-gray-50 ${isWeekend ? 'bg-blue-50/30' : ''} ${isFuture ? 'opacity-50' : ''}`}>
                                        <td className="px-4 py-2 text-sm text-gray-900">{dateStr}</td>
                                        <td className={`px-4 py-2 text-sm ${isWeekend ? 'text-blue-600 font-medium' : 'text-gray-500'}`}>{dayOfWeek}</td>
                                        <td className="px-4 py-2 text-sm text-gray-900 text-right font-medium">
                                          {sales !== null ? `${sales.toLocaleString()}원` : <span className="text-gray-400">-</span>}
                                        </td>
                                        <td className="px-4 py-2 text-sm text-right">
                                          {diff !== null ? (
                                            <span className={diff >= 0 ? 'text-green-600' : 'text-red-600'}>
                                              {diff >= 0 ? '▲' : '▼'} {Math.abs(diff).toLocaleString()}원
                                              <span className="text-xs ml-1">({diff >= 0 ? '+' : ''}{diffPercent}%)</span>
                                            </span>
                                          ) : (
                                            <span className="text-gray-400">-</span>
                                          )}
                                        </td>
                                        <td className="px-4 py-2 text-sm text-gray-500 text-right">
                                          {orders !== null ? `${orders}건` : <span className="text-gray-400">-</span>}
                                        </td>
                                      </tr>
                                    );
                                  });
                                })()}
                              </tbody>
                              <tfoot className="bg-gray-100">
                                <tr>
                                  <td className="px-4 py-2 text-sm font-bold text-gray-900" colSpan={2}>합계</td>
                                  <td className="px-4 py-2 text-sm font-bold text-gray-900 text-right">
                                    {(periodSales.dailySales?.reduce((sum, d) => sum + d.sales, 0) || 0).toLocaleString()}원
                                  </td>
                                  <td className="px-4 py-2 text-sm text-gray-500 text-right">
                                    {periodSales.dailySales && periodSales.dailySales.length > 0
                                      ? `평균 ${Math.round(periodSales.dailySales.reduce((sum, d) => sum + d.sales, 0) / periodSales.dailySales.length).toLocaleString()}원`
                                      : '-'}
                                  </td>
                                  <td className="px-4 py-2 text-sm font-bold text-gray-500 text-right">
                                    {(periodSales.dailySales?.reduce((sum, d) => sum + d.orders, 0) || 0)}건
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* 요일별 평균 매출 (월~일 순서) */}
                      {periodSales.dailySales && periodSales.dailySales.length > 1 && (
                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                          <h3 className="text-md font-semibold text-gray-800 mb-4">
                            요일별 평균 매출
                            {comparePeriodSales && <span className="text-xs text-gray-500 ml-2">(이전 기간 동일 요일 대비)</span>}
                          </h3>
                          <div className="grid grid-cols-7 gap-2">
                            {/* 월~일 순서: JS의 getDay()는 0=일, 1=월, ..., 6=토 */}
                            {[
                              { name: '월', jsDay: 1 },
                              { name: '화', jsDay: 2 },
                              { name: '수', jsDay: 3 },
                              { name: '목', jsDay: 4 },
                              { name: '금', jsDay: 5 },
                              { name: '토', jsDay: 6 },
                              { name: '일', jsDay: 0 },
                            ].map(({ name: dayName, jsDay }) => {
                              const dayData = periodSales.dailySales?.filter(d => new Date(d.date).getDay() === jsDay) || [];
                              const totalSales = dayData.reduce((sum, d) => sum + d.sales, 0);
                              const avgSales = dayData.length > 0 ? Math.round(totalSales / dayData.length) : 0;
                              const avgOrders = dayData.length > 0
                                ? Math.round(dayData.reduce((sum, d) => sum + d.orders, 0) / dayData.length)
                                : 0;
                              const isWeekend = jsDay === 0 || jsDay === 6;

                              // 이전 기간의 동일 요일 데이터와 비교
                              let prevDayData: typeof dayData = [];
                              let prevAvgSales = 0;
                              let diffFromPrev = 0;
                              let diffPercentFromPrev = '0';

                              if (comparePeriodSales?.dailySales) {
                                prevDayData = comparePeriodSales.dailySales.filter(d => new Date(d.date).getDay() === jsDay);
                                prevAvgSales = prevDayData.length > 0
                                  ? Math.round(prevDayData.reduce((sum, d) => sum + d.sales, 0) / prevDayData.length)
                                  : 0;
                                diffFromPrev = avgSales - prevAvgSales;
                                diffPercentFromPrev = prevAvgSales > 0 ? ((diffFromPrev / prevAvgSales) * 100).toFixed(1) : '0';
                              }

                              // 전체 평균 대비 (비교 기간 없을 때 사용)
                              const allDaysAvg = periodSales.dailySales ?
                                Math.round(periodSales.dailySales.reduce((sum, d) => sum + d.sales, 0) / periodSales.dailySales.length) : 0;
                              const diffFromAvg = avgSales - allDaysAvg;
                              const diffPercent = allDaysAvg > 0 ? ((diffFromAvg / allDaysAvg) * 100).toFixed(1) : '0';

                              return (
                                <div
                                  key={jsDay}
                                  className={`p-3 rounded-lg text-center ${
                                    isWeekend ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 border border-gray-200'
                                  }`}
                                >
                                  <div className={`text-sm font-bold ${isWeekend ? 'text-blue-600' : 'text-gray-700'}`}>
                                    {dayName}
                                  </div>
                                  <div className="text-lg font-bold text-gray-900 mt-1">
                                    {dayData.length > 0 ? avgSales.toLocaleString() : '-'}
                                  </div>
                                  <div className="text-xs text-gray-500">원/일</div>
                                  {dayData.length > 0 && (
                                    <>
                                      <div className="text-xs text-gray-500 mt-1">{avgOrders}건/일</div>
                                      {comparePeriodSales && prevDayData.length > 0 ? (
                                        <div className={`text-xs mt-1 ${diffFromPrev >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                          {diffFromPrev >= 0 ? '+' : ''}{diffPercentFromPrev}%
                                        </div>
                                      ) : (
                                        <div className={`text-xs mt-1 ${diffFromAvg >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                          {diffFromAvg >= 0 ? '+' : ''}{diffPercent}%
                                        </div>
                                      )}
                                    </>
                                  )}
                                  <div className="text-xs text-gray-400 mt-1">({dayData.length}일)</div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* TOP 5 상품 */}
                      {periodSales.topProducts && periodSales.topProducts.length > 0 && (
                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                          <h3 className="text-md font-semibold text-gray-800 mb-4">TOP 5 상품 (부가세 제외)</h3>
                          <div className="space-y-3">
                            {periodSales.topProducts.map((product, index) => {
                              // 이전 기간의 같은 상품 찾기
                              const prevProduct = comparePeriodSales?.topProducts?.find(p => p.name === product.name);
                              const prevRank = prevProduct ? comparePeriodSales?.topProducts?.findIndex(p => p.name === product.name) : -1;
                              const salesDiff = prevProduct ? product.sales - prevProduct.sales : null;

                              return (
                                <div key={index} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                                  <div className="flex items-center gap-3">
                                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                      index === 0 ? 'bg-yellow-400 text-white' :
                                      index === 1 ? 'bg-gray-300 text-gray-700' :
                                      index === 2 ? 'bg-orange-400 text-white' :
                                      'bg-gray-100 text-gray-600'
                                    }`}>
                                      {index + 1}
                                    </span>
                                    <div>
                                      <span className="text-sm text-gray-800 truncate max-w-xs block">{product.name}</span>
                                      {comparePeriodSales && prevRank !== undefined && prevRank >= 0 && (
                                        <span className={`text-xs ${prevRank > index ? 'text-green-600' : prevRank < index ? 'text-red-600' : 'text-gray-400'}`}>
                                          {prevRank > index ? `▲${prevRank - index}` : prevRank < index ? `▼${index - prevRank}` : '―'} (이전 {prevRank + 1}위)
                                        </span>
                                      )}
                                      {comparePeriodSales && prevRank === -1 && (
                                        <span className="text-xs text-blue-600">NEW</span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-sm font-medium text-gray-900">{product.sales.toLocaleString()}원</div>
                                    <div className="text-xs text-gray-500">{product.quantity}개 판매</div>
                                    {salesDiff !== null && (
                                      <div className={`text-xs ${salesDiff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {salesDiff >= 0 ? '+' : ''}{salesDiff.toLocaleString()}원
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* 주문 상태별 현황 */}
                      {periodSales.orderStatus && periodSales.orderStatus.length > 0 && (
                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                          <h3 className="text-md font-semibold text-gray-800 mb-4">주문 상태별 현황</h3>
                          <div className="flex flex-wrap gap-2">
                            {periodSales.orderStatus.map((status, index) => (
                              <span key={index} className={`px-3 py-1 rounded-full text-sm ${
                                status.label?.includes('완료') ? 'bg-green-100 text-green-700' :
                                status.label?.includes('배송') ? 'bg-blue-100 text-blue-700' :
                                status.label?.includes('준비') ? 'bg-yellow-100 text-yellow-700' :
                                status.label?.includes('취소') || status.label?.includes('환불') ? 'bg-red-100 text-red-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                {status.label}: {status.count}건
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 최근 주문 목록 */}
                      {periodSales.recentOrders && periodSales.recentOrders.length > 0 && (
                        <div className="bg-white border border-gray-200 rounded-lg p-4">
                          <h3 className="text-md font-semibold text-gray-800 mb-4">최근 주문 (상위 10건)</h3>
                          <div className="space-y-2">
                            {periodSales.recentOrders.map((order, index) => (
                              <div key={index} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                                <div className="flex-1">
                                  <div className="text-sm text-gray-900 truncate max-w-xs">{order.productName}</div>
                                  <div className="text-xs text-gray-500">
                                    {order.orderId} | {new Date(order.orderDate).toLocaleString('ko-KR')}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-sm font-medium text-gray-900">{order.amount.toLocaleString()}원</div>
                                  <div className={`text-xs px-2 py-0.5 rounded-full inline-block ${
                                    order.status?.includes('완료') ? 'bg-green-100 text-green-700' :
                                    order.status?.includes('배송') ? 'bg-blue-100 text-blue-700' :
                                    order.status?.includes('준비') ? 'bg-yellow-100 text-yellow-700' :
                                    'bg-gray-100 text-gray-700'
                                  }`}>
                                    {order.status || '상태 없음'}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 데이터 없음 */}
                      {periodSales.recentOrders.length === 0 && (
                        <div className="text-center py-8 text-gray-500">
                          <p className="mt-2">선택한 기간에 주문이 없습니다.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 조회 전 안내 */}
                  {!periodSales && !periodSalesLoading && !periodSalesError && (
                    <div className="text-center py-12 text-gray-500">
                      <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <p>조회할 기간을 선택하고 &apos;조회&apos; 버튼을 클릭하세요.</p>
                    </div>
                  )}
                </>
              )}

              {/* Meta 광고 검색 탭 */}
              {activeTab === 'meta-ads' && (
                <>
                  <div className="mb-6">
                    <h2 className="text-lg font-medium text-gray-900 mb-4">Meta 광고 라이브러리 검색</h2>
                    <p className="text-sm text-gray-500 mb-4">
                      Facebook/Instagram 광고 라이브러리에서 키워드로 광고를 검색합니다.
                    </p>

                    <div className="flex gap-3">
                      <input
                        type="text"
                        value={metaAdsQuery}
                        onChange={(e) => setMetaAdsQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !metaAdsLoading && fetchMetaAds()}
                        placeholder="검색어 입력 (예: 바르너, skincare, 화장품)"
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-500 bg-white"
                      />
                      <button
                        onClick={fetchMetaAds}
                        disabled={metaAdsLoading || !metaAdsQuery.trim()}
                        className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                          metaAdsLoading || !metaAdsQuery.trim()
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                      >
                        {metaAdsLoading ? (
                          <span className="flex items-center gap-2">
                            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            검색 중...
                          </span>
                        ) : '검색'}
                      </button>
                      {metaAdsQuery.trim() && (
                        <a
                          href={`https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=KR&q=${encodeURIComponent(metaAdsQuery)}&search_type=keyword_unordered`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2 rounded-lg font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors flex items-center gap-1"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                          직접 보기
                        </a>
                      )}
                    </div>
                  </div>

                  {/* 에러 메시지 */}
                  {metaAdsError && (
                    <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-start gap-3">
                        <svg className="h-5 w-5 text-yellow-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <div>
                          <p className="text-yellow-800 font-medium">서버에서 직접 스크래핑이 제한됩니다</p>
                          <p className="text-yellow-700 text-sm mt-1">
                            아래 &quot;직접 보기&quot; 버튼을 클릭하여 Meta 광고 라이브러리에서 직접 확인하세요.
                          </p>
                          {metaAdsQuery.trim() && (
                            <a
                              href={`https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=KR&q=${encodeURIComponent(metaAdsQuery)}&search_type=keyword_unordered`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                              Meta 광고 라이브러리에서 &quot;{metaAdsQuery}&quot; 검색하기
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 로딩 중 */}
                  {metaAdsLoading && (
                    <div className="text-center py-12">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                      <p className="mt-4 text-gray-700 font-medium">GitHub Actions에서 스크래핑 중...</p>
                      <p className="mt-2 text-gray-500 text-sm">1~2분 정도 소요됩니다. 잠시만 기다려주세요.</p>
                      <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-400">
                        <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                        실시간 데이터 수집 중
                      </div>
                    </div>
                  )}

                  {/* 검색 결과 */}
                  {metaAdsResults && !metaAdsLoading && (
                    <div>
                      <div className="mb-4 flex items-center justify-between">
                        <div className="text-sm text-gray-600">
                          <span className="font-medium">&quot;{metaAdsResults.searchQuery}&quot;</span> 검색 결과: {metaAdsResults.totalItems}개 미디어
                        </div>
                        <div className="flex gap-2">
                          <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded">
                            이미지: {metaAdsResults.items.filter(i => i.type === 'image').length}
                          </span>
                          <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded">
                            영상: {metaAdsResults.items.filter(i => i.type === 'video').length}
                          </span>
                        </div>
                      </div>

                      {metaAdsResults.items.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                          <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <p>검색 결과가 없습니다. 다른 키워드로 시도해보세요.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                          {metaAdsResults.items.map((item, index) => (
                            <div key={index} className="relative group border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                              {item.type === 'image' ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={item.url}
                                  alt={`Ad ${index + 1}`}
                                  className="w-full h-48 object-cover"
                                  loading="lazy"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23ccc"%3E%3Cpath d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/%3E%3C/svg%3E';
                                  }}
                                />
                              ) : (
                                <video
                                  src={item.url}
                                  className="w-full h-48 object-cover"
                                  controls
                                  preload="metadata"
                                />
                              )}
                              <div className="absolute top-2 right-2">
                                <span className={`text-xs px-2 py-1 rounded-full ${
                                  item.type === 'image' ? 'bg-blue-500 text-white' : 'bg-purple-500 text-white'
                                }`}>
                                  {item.type === 'image' ? '이미지' : '영상'}
                                </span>
                              </div>
                              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-opacity flex items-center justify-center opacity-0 group-hover:opacity-100">
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-3 py-1 bg-white text-gray-800 rounded-lg text-sm font-medium hover:bg-gray-100"
                                >
                                  원본 보기
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 검색 전 안내 */}
                  {!metaAdsResults && !metaAdsLoading && !metaAdsError && (
                    <div className="text-center py-12 text-gray-500">
                      <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <p>검색어를 입력하고 검색 버튼을 클릭하세요.</p>
                      <p className="text-xs mt-2 text-gray-400">예: 브랜드명, 제품명, 카테고리 등</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* 비밀번호 변경 모달 */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                {user?.mustChangePassword ? '비밀번호 변경 필요' : '비밀번호 변경'}
              </h3>
              {user?.mustChangePassword && (
                <p className="text-sm text-yellow-600 bg-yellow-50 p-3 rounded-md mb-4">
                  초기 비밀번호를 사용 중입니다. 보안을 위해 새 비밀번호로 변경해주세요.
                </p>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    새 비밀번호
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="6자 이상 입력"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    비밀번호 확인
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="비밀번호 다시 입력"
                  />
                </div>

                {passwordError && (
                  <p className="text-sm text-red-600">{passwordError}</p>
                )}
                {passwordSuccess && (
                  <p className="text-sm text-green-600">비밀번호가 변경되었습니다!</p>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={handlePasswordChange}
                    className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
                  >
                    변경하기
                  </button>
                  {!user?.mustChangePassword && (
                    <button
                      onClick={() => {
                        setShowPasswordModal(false);
                        setNewPassword('');
                        setConfirmPassword('');
                        setPasswordError('');
                      }}
                      className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400"
                    >
                      취소
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
