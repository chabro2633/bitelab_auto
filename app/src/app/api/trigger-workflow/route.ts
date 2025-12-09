import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/session';


export async function POST(request: NextRequest) {
  const session = await getSession();
  
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { startDate, endDate, brands = [] } = await request.json();

    // GitHub Actions 워크플로우 트리거
    const githubToken = process.env.GITHUB_TOKEN;
    const repoOwner = process.env.GITHUB_REPO_OWNER || 'chabro2633';
    const repoName = process.env.GITHUB_REPO_NAME || 'bitelab_auto';
    const workflowId = process.env.GITHUB_WORKFLOW_ID || 'scrape.yml';

    if (!githubToken) {
      return NextResponse.json({
        error: 'GitHub token not configured in environment variables'
      }, { status: 500 });
    }

    console.log('Triggering workflow for:', { startDate, endDate, brands });

    // GitHub Actions 워크플로우 실행 (워크플로우 파일명 사용)
    const workflowResponse = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/actions/workflows/${workflowId}/dispatches`,
      {
        method: 'POST',
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: {
            start_date: startDate || '',
            end_date: endDate || '',
            brands: brands.join(' ')
          }
        })
      }
    );

    console.log('Workflow response status:', workflowResponse.status);
    console.log('Workflow response headers:', Object.fromEntries(workflowResponse.headers.entries()));

    if (!workflowResponse.ok) {
      const errorText = await workflowResponse.text();
      console.error('Workflow trigger failed:', errorText);
      return NextResponse.json({ 
        error: `GitHub Actions trigger failed: ${errorText}` 
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'GitHub Actions workflow triggered successfully',
      workflowUrl: `https://github.com/${repoOwner}/${repoName}/actions`
    });

  } catch (error: unknown) {
    console.error('Workflow trigger error:', error);
    return NextResponse.json({ 
      error: `Failed to trigger workflow: ${error instanceof Error ? error.message : 'Unknown error'}` 
    }, { status: 500 });
  }
}
