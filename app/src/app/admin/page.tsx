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

export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<{ userId: string; username: string; role: string } | null>(null);
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
    jobs: Array<{ id: string; name: string; status: string; conclusion?: string; steps: Array<{ name: string; status: string; conclusion?: string }> }>;
    status: string;
    conclusion?: string;
  } | null>(null);
  const [workflowLogs, setWorkflowLogs] = useState<Array<{ id: number; timestamp: string; level: string; message: string; raw: string }>>([]);
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

  const availableBrands = ['바르너', '릴리이브', '보호리', '먼슬리픽', '색동서울'];

  // 세션 확인
  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await fetch('/api/session');
        const data = await response.json();
        
        if (data.authenticated) {
          setUser(data.user);
          setUserAllowedBrands(data.user.role === 'admin' ? availableBrands : data.user.allowedBrands || []);
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
    };
  }, [pollingInterval]);

  // 컴포넌트 마운트 시 실행 로그 가져오기
  useEffect(() => {
    if (user) {
      fetchExecutionLogs();
      fetchScheduleStatus();
    }
  }, [user]);

  // 스케줄 상태 가져오기
  const fetchScheduleStatus = async () => {
    try {
      setScheduleLoading(true);
      const response = await fetch('/api/schedule-status');
      if (response.ok) {
        const data = await response.json();
        setScheduleStatus(data);
      }
    } catch (error) {
      console.error('Failed to fetch schedule status:', error);
    } finally {
      setScheduleLoading(false);
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

  const prevStepsRef = useRef<string>('');
  const lastLogCountRef = useRef<number>(0);

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

        // 워크플로우가 완료되면 폴링 중지
        if (data.status === 'completed') {
          stopPolling();
          const emoji = data.conclusion === 'success' ? '🎉' : '❌';
          addConsoleLog(`${emoji} 워크플로우 완료: ${data.conclusion === 'success' ? '성공!' : '실패'}`);
        }
      }
    } catch (error) {
      console.error('Failed to fetch workflow status:', error);
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
            </div>
          ) : null}
        </div>

        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Python Script Execution
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
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
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
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
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
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
