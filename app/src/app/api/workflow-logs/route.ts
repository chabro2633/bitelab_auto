import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get('runId');
    const jobId = searchParams.get('jobId');
    
    if (!runId || !jobId) {
      return NextResponse.json({ 
        error: 'runId and jobId are required' 
      }, { status: 400 });
    }

    const githubToken = process.env.GITHUB_TOKEN;
    const repoOwner = 'chabro2633';
    const repoName = 'bitelab_auto';
    
    if (!githubToken) {
      return NextResponse.json({ 
        error: 'GitHub token not configured' 
      }, { status: 500 });
    }

    // 작업 로그 다운로드 URL 가져오기
    const logsResponse = await fetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/actions/jobs/${jobId}/logs`,
      {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
        }
      }
    );

    if (!logsResponse.ok) {
      const errorText = await logsResponse.text();
      return NextResponse.json({ 
        error: `Failed to fetch job logs: ${errorText}` 
      }, { status: 500 });
    }

    const logsText = await logsResponse.text();
    
    // 로그를 파싱하여 구조화된 형태로 변환
    const logLines = logsText.split('\n').filter(line => line.trim() !== '');
    const parsedLogs = logLines.map((line, index) => {
      // GitHub Actions 로그 형식 파싱
      const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)/);
      const levelMatch = line.match(/^##\[(debug|warning|error|notice|group|endgroup)\]/);
      
      let level = 'info';
      let message = line;
      let timestamp = new Date().toISOString();
      
      if (timestampMatch) {
        timestamp = timestampMatch[1];
        message = line.substring(timestampMatch[0].length).trim();
      }
      
      if (levelMatch) {
        level = levelMatch[1];
        message = line.substring(levelMatch[0].length).trim();
      }
      
      // 특별한 메시지 패턴 감지
      if (message.includes('✅') || message.includes('SUCCESS')) {
        level = 'success';
      } else if (message.includes('❌') || message.includes('ERROR') || message.includes('FAILED')) {
        level = 'error';
      } else if (message.includes('⚠️') || message.includes('WARNING')) {
        level = 'warning';
      } else if (message.includes('🚀') || message.includes('Starting')) {
        level = 'info';
      }
      
      return {
        id: index,
        timestamp,
        level,
        message: message || line,
        raw: line
      };
    });

    return NextResponse.json({
      logs: parsedLogs,
      totalLines: logLines.length
    });

  } catch (error: unknown) {
    console.error('Workflow logs error:', error);
    return NextResponse.json({ 
      error: `Failed to get workflow logs: ${error instanceof Error ? error.message : 'Unknown error'}` 
    }, { status: 500 });
  }
}
