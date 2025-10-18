import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { date, brands = [] } = await request.json();
    
    // GitHub Actions 워크플로우 트리거
    const githubToken = process.env.GITHUB_TOKEN;
    const repoOwner = process.env.GITHUB_REPO_OWNER || 'your-username';
    const repoName = process.env.GITHUB_REPO_NAME || 'bitelab_auto';
    
    if (!githubToken) {
      return NextResponse.json({ 
        error: 'GitHub token not configured' 
      }, { status: 500 });
    }

    // GitHub Actions 워크플로우 실행 (워크플로우 ID 사용)
    const workflowResponse = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/actions/workflows/198911155/dispatches`,
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
            date: date || '',
            brands: brands.join(' ')
          }
        })
      }
    );

    if (!workflowResponse.ok) {
      const errorText = await workflowResponse.text();
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
