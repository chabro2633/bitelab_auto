import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/session';

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const githubToken = process.env.GITHUB_TOKEN;
    const repoOwner = process.env.GITHUB_REPO_OWNER || 'chabro2633';
    const repoName = process.env.GITHUB_REPO_NAME || 'bitelab_auto';
    const workflowId = process.env.GITHUB_WORKFLOW_ID || 'scrape.yml';

    if (!githubToken) {
      return NextResponse.json({
        error: 'GitHub token not configured'
      }, { status: 500 });
    }

    // 오늘 날짜 (한국시간 기준)
    const now = new Date();
    const koreaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const todayStart = new Date(koreaTime);
    todayStart.setHours(0, 0, 0, 0);

    // 오늘의 스케줄 실행 시간 (오전 7:20 KST)
    const scheduledTime = new Date(koreaTime);
    scheduledTime.setHours(7, 20, 0, 0);

    // 최근 워크플로우 실행 목록 가져오기 (오늘 날짜 기준으로 필터링)
    const runsResponse = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/actions/workflows/${workflowId}/runs?per_page=10`,
      {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
        },
        cache: 'no-store'
      }
    );

    if (!runsResponse.ok) {
      const errorText = await runsResponse.text();
      return NextResponse.json({
        error: `Failed to fetch workflow runs: ${errorText}`
      }, { status: 500 });
    }

    const runsData = await runsResponse.json();

    if (!runsData.workflow_runs || runsData.workflow_runs.length === 0) {
      return NextResponse.json({
        status: 'no_runs',
        message: '실행 기록이 없습니다',
        todayScheduled: false,
        scheduledTime: scheduledTime.toISOString()
      });
    }

    // 오늘의 스케줄(schedule) 실행 찾기
    const todayScheduledRun = runsData.workflow_runs.find((run: {
      event: string;
      created_at: string;
      status: string;
      conclusion: string | null;
    }) => {
      const runDate = new Date(run.created_at);
      const runKoreaTime = new Date(runDate.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
      const runDateOnly = new Date(runKoreaTime);
      runDateOnly.setHours(0, 0, 0, 0);

      return run.event === 'schedule' && runDateOnly.getTime() === todayStart.getTime();
    });

    // 오늘의 모든 실행 (수동 포함) 찾기
    const todayRuns = runsData.workflow_runs.filter((run: {
      created_at: string;
    }) => {
      const runDate = new Date(run.created_at);
      const runKoreaTime = new Date(runDate.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
      const runDateOnly = new Date(runKoreaTime);
      runDateOnly.setHours(0, 0, 0, 0);

      return runDateOnly.getTime() === todayStart.getTime();
    });

    // 현재 시간이 스케줄 시간 이전인지 확인
    const isBeforeSchedule = koreaTime < scheduledTime;

    let scheduleStatus: 'pending' | 'running' | 'success' | 'failed' | 'waiting';
    let statusMessage: string;

    if (todayScheduledRun) {
      // 오늘 스케줄 실행이 있는 경우
      if (todayScheduledRun.status === 'completed') {
        if (todayScheduledRun.conclusion === 'success') {
          scheduleStatus = 'success';
          statusMessage = '오늘 아침 자동 스크래핑이 성공적으로 완료되었습니다';
        } else {
          scheduleStatus = 'failed';
          statusMessage = `오늘 아침 자동 스크래핑이 실패했습니다 (${todayScheduledRun.conclusion})`;
        }
      } else if (todayScheduledRun.status === 'in_progress') {
        scheduleStatus = 'running';
        statusMessage = '자동 스크래핑이 실행 중입니다...';
      } else {
        scheduleStatus = 'pending';
        statusMessage = '자동 스크래핑이 대기 중입니다';
      }
    } else if (isBeforeSchedule) {
      scheduleStatus = 'waiting';
      statusMessage = `오전 7시 20분에 자동 스크래핑이 예정되어 있습니다`;
    } else {
      scheduleStatus = 'pending';
      statusMessage = '오늘 자동 스크래핑이 아직 실행되지 않았습니다';
    }

    return NextResponse.json({
      scheduleStatus,
      statusMessage,
      scheduledTime: scheduledTime.toISOString(),
      currentTime: koreaTime.toISOString(),
      isBeforeSchedule,
      todayScheduledRun: todayScheduledRun ? {
        id: todayScheduledRun.id,
        status: todayScheduledRun.status,
        conclusion: todayScheduledRun.conclusion,
        created_at: todayScheduledRun.created_at,
        html_url: todayScheduledRun.html_url
      } : null,
      todayRunsCount: todayRuns.length,
      latestRun: runsData.workflow_runs[0] ? {
        id: runsData.workflow_runs[0].id,
        event: runsData.workflow_runs[0].event,
        status: runsData.workflow_runs[0].status,
        conclusion: runsData.workflow_runs[0].conclusion,
        created_at: runsData.workflow_runs[0].created_at,
        html_url: runsData.workflow_runs[0].html_url
      } : null
    });

  } catch (error: unknown) {
    console.error('Schedule status error:', error);
    return NextResponse.json({
      error: `Failed to get schedule status: ${error instanceof Error ? error.message : 'Unknown error'}`
    }, { status: 500 });
  }
}
