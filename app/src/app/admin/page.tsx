'use client';

import { useState } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

interface ExecutionResult {
  success: boolean;
  output: string;
  error: string;
  command?: string;
  suggestions?: string[];
}

export default function AdminDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [scriptArgs, setScriptArgs] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedBrands, setSelectedBrands] = useState<string[]>(['바르너', '릴리이브', '보호리', '먼슬리픽', '색동서울']);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [showConsole, setShowConsole] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  
  const availableBrands = ['바르너', '릴리이브', '보호리', '먼슬리픽', '색동서울'];

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  // 콘솔 로그가 추가될 때마다 자동 스크롤
  useEffect(() => {
    if (showConsole && consoleLogs.length > 0) {
      const consoleElement = document.querySelector('.console-container');
      if (consoleElement) {
        consoleElement.scrollTop = consoleElement.scrollHeight;
      }
    }
  }, [consoleLogs, showConsole]);

  const handleBrandToggle = (brand: string) => {
    setSelectedBrands(prev => 
      prev.includes(brand) 
        ? prev.filter(b => b !== brand)
        : [...prev, brand]
    );
  };

  const handleSelectAllBrands = () => {
    setSelectedBrands(availableBrands);
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
    addConsoleLog(`📅 스크래핑 날짜: ${selectedDate || '어제 날짜'}`);

    try {
      addConsoleLog('📡 GitHub Actions 워크플로우 트리거 중...');
      
      const response = await fetch('/api/trigger-workflow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date: selectedDate || undefined,
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

  const handleLogout = () => {
    signOut({ callbackUrl: '/login' });
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
              <p className="text-sm text-gray-600">Welcome, {session.user.username}</p>
            </div>
            <div className="flex gap-2">
              {session.user.role === 'admin' && (
                <button
                  onClick={() => router.push('/users')}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                >
                  User Management
                </button>
              )}
              <button
                onClick={handleLogout}
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
                    {availableBrands.map((brand) => (
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
                  </div>
                        <p className="mt-2 text-xs text-gray-500">
                          기본적으로 모든 브랜드가 선택되어 있습니다. 원하지 않는 브랜드는 체크를 해제하세요.
                        </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="selected-date" className="block text-sm font-medium text-gray-700">
                      스크래핑 날짜 (선택사항)
                    </label>
                    <input
                      type="date"
                      id="selected-date"
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      비워두면 어제 날짜로 자동 실행됩니다.
                    </p>
                  </div>
                  
                  <div>
                    <label htmlFor="script-args" className="block text-sm font-medium text-gray-700">
                      Script Arguments (optional)
                    </label>
                    <input
                      type="text"
                      id="script-args"
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      placeholder="Enter arguments separated by spaces"
                      value={scriptArgs}
                      onChange={(e) => setScriptArgs(e.target.value)}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      추가 명령줄 인수가 필요한 경우 입력하세요.
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
                      <span className="text-gray-400 text-xs">
                        {consoleLogs.length}개 로그
                      </span>
                    </div>
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
                          } else if (log.includes('📡') || log.includes('📥')) {
                            logColor = 'text-blue-400';
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
