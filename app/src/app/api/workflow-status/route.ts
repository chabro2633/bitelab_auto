import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../lib/auth-config';

export async function GET() {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const githubToken = process.env.GITHUB_TOKEN;
    const repoOwner = 'chabro2633';
    const repoName = 'bitelab_auto';
    
    if (!githubToken) {
      return NextResponse.json({ 
        error: 'GitHub token not configured' 
      }, { status: 500 });
    }

    // 최근 워크플로우 실행 목록 가져오기
    const runsResponse = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/actions/workflows/198911155/runs?per_page=1`,
      {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
        }
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
        message: 'No workflow runs found'
      });
    }

    const latestRun = runsData.workflow_runs[0];
    
    // 워크플로우 실행 상태 정보
    const runInfo = {
      id: latestRun.id,
      status: latestRun.status, // queued, in_progress, completed
      conclusion: latestRun.conclusion, // success, failure, cancelled, etc.
      created_at: latestRun.created_at,
      updated_at: latestRun.updated_at,
      html_url: latestRun.html_url,
      jobs_url: latestRun.jobs_url
    };

    // 워크플로우가 실행 중이거나 완료된 경우 작업 로그 가져오기
    let jobs = [];
    if (latestRun.status === 'in_progress' || latestRun.status === 'completed') {
      const jobsResponse = await fetch(
        `https://api.github.com/repos/${repoOwner}/${repoName}/actions/runs/${latestRun.id}/jobs`,
        {
          headers: {
            'Authorization': `token ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
          }
        }
      );

      if (jobsResponse.ok) {
        const jobsData = await jobsResponse.json();
        jobs = jobsData.jobs.map((job: { id: string; name: string; status: string; conclusion?: string; started_at?: string; completed_at?: string; steps: Array<{ name: string; status: string; conclusion?: string; number: number; started_at?: string; completed_at?: string }> }) => ({
          id: job.id,
          name: job.name,
          status: job.status,
          conclusion: job.conclusion,
          started_at: job.started_at,
          completed_at: job.completed_at,
          steps: job.steps.map((step: { name: string; status: string; conclusion?: string; number: number; started_at?: string; completed_at?: string }) => ({
            name: step.name,
            status: step.status,
            conclusion: step.conclusion,
            number: step.number,
            started_at: step.started_at,
            completed_at: step.completed_at
          }))
        }));
      }
    }

    return NextResponse.json({
      run: runInfo,
      jobs: jobs,
      status: latestRun.status,
      conclusion: latestRun.conclusion
    });

  } catch (error: unknown) {
    console.error('Workflow status error:', error);
    return NextResponse.json({ 
      error: `Failed to get workflow status: ${error instanceof Error ? error.message : 'Unknown error'}` 
    }, { status: 500 });
  }
}
