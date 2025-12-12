import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/session';
import { kv } from '@vercel/kv';

// POST: GitHub Actions workflow 트리거
export async function POST(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchQuery, maxScroll = 15 } = await request.json();

    if (!searchQuery || typeof searchQuery !== 'string') {
      return NextResponse.json({ error: 'searchQuery is required' }, { status: 400 });
    }

    // 고유한 요청 ID 생성
    const requestId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // GitHub Actions 워크플로우 트리거
    const githubToken = process.env.GITHUB_TOKEN;
    const repoOwner = process.env.GITHUB_REPO_OWNER || 'chabro2633';
    const repoName = process.env.GITHUB_REPO_NAME || 'bitelab_auto';
    const workflowId = 'meta-ads.yml';

    if (!githubToken) {
      return NextResponse.json({
        error: 'GitHub token not configured'
      }, { status: 500 });
    }

    // 초기 상태를 KV에 저장
    await kv.set(`meta-ads:${requestId}`, {
      status: 'pending',
      requestId,
      searchQuery,
      startTime: new Date().toISOString()
    }, { ex: 3600 }); // 1시간 TTL

    // GitHub Actions 워크플로우 실행
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
            query: searchQuery,
            request_id: requestId,
            max_scroll: String(maxScroll)
          }
        })
      }
    );

    if (!workflowResponse.ok) {
      const errorText = await workflowResponse.text();
      console.error('Workflow trigger failed:', errorText);

      // 실패 상태로 업데이트
      await kv.set(`meta-ads:${requestId}`, {
        status: 'failed',
        requestId,
        searchQuery,
        error: `Workflow trigger failed: ${errorText}`
      }, { ex: 3600 });

      return NextResponse.json({
        error: `GitHub Actions trigger failed: ${errorText}`
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      requestId,
      message: 'Scraping started',
      workflowUrl: `https://github.com/${repoOwner}/${repoName}/actions`
    });

  } catch (error) {
    console.error('Meta Ads API error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// GET: 결과 조회 (Vercel KV에서)
export async function GET(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const requestId = searchParams.get('requestId');

  if (!requestId) {
    return NextResponse.json({ error: 'requestId is required' }, { status: 400 });
  }

  try {
    const result = await kv.get(`meta-ads:${requestId}`);

    if (!result) {
      return NextResponse.json({
        status: 'not_found',
        message: 'Result not found or expired'
      });
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error('Meta Ads GET error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
