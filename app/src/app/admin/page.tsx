'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface ExecutionResult {
  success: boolean;
  output: string;
  error: string;
  command?: string;
  suggestions?: string[];
}

type ScriptTab = 'sales' | 'ads' | 'realtime';

export default function AdminDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ScriptTab>('sales');
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

  // Refs (must be at the top level)
  const prevStepsRef = useRef<string>('');
  const lastLogCountRef = useRef<number>(0);

  const availableBrands = ['바르너', '릴리이브', '보호리', '먼슬리픽', '색동서울'];
  const availableAdsBrands = ['바르너', '릴리이브'];  // 광고용 브랜드

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
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
      if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
      }
    };
  }, [pollingInterval, autoRefreshInterval]);

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

  // 실시간 탭으로 이동 시 한 번만 조회 (자동 반복 없음)
  const [realtimeInitialized, setRealtimeInitialized] = useState(false);
  useEffect(() => {
    if (activeTab === 'realtime' && !realtimeInitialized) {
      setRealtimeInitialized(true);
      fetchRealtimeSales();
    }
  }, [activeTab, realtimeInitialized]);

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
    if (user.role === 'sales_viewer') return tab === 'realtime';
    return tab !== 'realtime'; // user 권한은 스크래핑만
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

        // 워크플로우가 완료되면 폴링 중지 및 실패 로그 업데이트
        if (data.status === 'completed') {
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
    if (pollingInterval) return;

    // 폴링 시작 시 ref 초기화
    prevStepsRef.current = '';
    lastLogCountRef.current = 0;

    setIsPolling(true);
    // 먼저 즉시 한번 호출
    fetchWorkflowStatus();
    // 그 후 3초마다 폴링
    const interval = setInterval(fetchWorkflowStatus, 3000);
    setPollingInterval(interval);
    addConsoleLog('🔄 GitHub Actions 실시간 모니터링 시작...');
  };

  const stopPolling = () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
    setIsPolling(false);
    addConsoleLog('⏹️ GitHub Actions 상태 모니터링 중지');
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
                  onClick={() => setActiveTab('sales')}
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
                  onClick={() => setActiveTab('ads')}
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
                  onClick={() => setActiveTab('realtime')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'realtime'
                      ? 'border-green-500 text-green-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  실시간 매출 (바르너)
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
                        <li>• <strong>브랜드:</strong> 바르너, 릴리이브</li>
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
                        광고 데이터는 바르너, 릴리이브 브랜드만 지원합니다.
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

                      {/* 오늘의 TOP 5 상품 */}
                      {realtimeSales.topProducts && realtimeSales.topProducts.length > 0 && (
                        <div className="bg-white border border-gray-200 rounded-lg">
                          <div className="px-4 py-3 border-b border-gray-200">
                            <h3 className="text-sm font-medium text-gray-900">오늘의 TOP 5 상품</h3>
                          </div>
                          <div className="divide-y divide-gray-100">
                            {realtimeSales.topProducts.map((product, index) => (
                              <div key={product.name} className="px-4 py-3 hover:bg-gray-50 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
                                    index === 0 ? 'bg-yellow-400 text-yellow-900' :
                                    index === 1 ? 'bg-gray-300 text-gray-700' :
                                    index === 2 ? 'bg-orange-300 text-orange-800' :
                                    'bg-gray-100 text-gray-600'
                                  }`}>
                                    {index + 1}
                                  </div>
                                  <div className="text-sm font-medium text-gray-900 truncate max-w-[200px]" title={product.name}>
                                    {product.name}
                                  </div>
                                </div>
                                <div className="flex items-center gap-4 text-right">
                                  <div>
                                    <div className="text-xs text-gray-500">판매수량</div>
                                    <div className="text-sm font-semibold text-blue-600">{product.quantity}개</div>
                                  </div>
                                  <div>
                                    <div className="text-xs text-gray-500">매출</div>
                                    <div className="text-sm font-semibold text-green-600">{product.sales.toLocaleString()}원</div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

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
