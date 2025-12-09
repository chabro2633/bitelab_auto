import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/session';

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { scriptPath, args = [], date, brands = [] } = await request.json();
    
    // 보안을 위해 허용된 스크립트만 실행 가능하도록 제한
    const allowedScripts = ['cigro_yesterday.py'];
    const scriptName = path.basename(scriptPath);
    
    if (!allowedScripts.includes(scriptName)) {
      return NextResponse.json({ error: 'Script not allowed' }, { status: 403 });
    }

    // 실제 스크립트 경로 (프로젝트 루트의 cigro_yesterday.py)
    const fullScriptPath = path.join(process.cwd(), '..', 'cigro_yesterday.py');
    
    // 구글 시트 인증 파일 경로
    const credentialsPath = path.join(process.cwd(), '..', 'google_sheet_credentials.json');
    
    // 명령어 구성
    let commandArgs = args.join(' ');
    if (date) {
      commandArgs = `--date "${date}" ${commandArgs}`;
    }
    if (brands && brands.length > 0) {
      commandArgs = `--brands ${brands.join(' ')} ${commandArgs}`;
    }
    
    const command = `python3 "${fullScriptPath}" ${commandArgs}`;
    
    // 필수 환경 변수 검증
    if (!process.env.CIGRO_EMAIL || !process.env.CIGRO_PASSWORD) {
      return NextResponse.json({
        success: false,
        error: 'CIGRO_EMAIL과 CIGRO_PASSWORD 환경변수가 설정되지 않았습니다.',
        output: '',
        suggestions: ['Vercel 환경 변수에서 CIGRO_EMAIL과 CIGRO_PASSWORD를 설정하세요.'],
      }, { status: 500 });
    }

    // 스크립트 실행 (구글 시트 인증 파일 경로를 환경변수로 전달)
    const { stdout, stderr } = await execAsync(command, {
      timeout: 120000, // 2분 타임아웃 (GitHub Actions 환경 고려)
      cwd: path.join(process.cwd(), '..'), // 프로젝트 루트에서 실행
      env: {
        ...process.env,
        GOOGLE_APPLICATION_CREDENTIALS: credentialsPath,
        PYTHONPATH: path.join(process.cwd(), '..'),
        // 환경 변수로 설정 전달 (기본값 없음)
        EMAIL: process.env.CIGRO_EMAIL,
        PASSWORD: process.env.CIGRO_PASSWORD,
        GOOGLE_SHEET_NAME: process.env.GOOGLE_SHEET_NAME || 'Cigro Sales',
      },
    });

    // 성공적인 완료인지 확인 (오류 메시지가 없고 성공 로그가 있는 경우)
    const isSuccessful = !stderr || stderr.trim() === '' || stdout.includes('스크래핑 작업이 성공적으로 완료되었습니다');
    
    // 출력 정리 - 줄 구분을 명확하게 하기 위해 정규화
    const cleanOutput = stdout
      .replace(/\r\n/g, '\n')  // Windows 줄 구분자를 Unix로 변환
      .replace(/\r/g, '\n')    // Mac 줄 구분자를 Unix로 변환
      .split('\n')
      .map(line => line.trim())
      .filter(line => line !== '')
      .join('\n');
    
    return NextResponse.json({
      success: isSuccessful,
      output: cleanOutput,
      error: isSuccessful ? '' : stderr, // 성공 시 오류 메시지 제거
      command: command
    });

  } catch (error: unknown) {
    console.error('Script execution error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const suggestions: string[] = [];
    
    // 일반적인 오류에 대한 해결 방법 제시
    if (errorMessage.includes('ModuleNotFoundError') || errorMessage.includes('No module named')) {
      suggestions.push('필수 Python 패키지가 설치되지 않았습니다. requirements.txt의 패키지들을 설치하세요.');
      suggestions.push('명령어: pip install -r requirements.txt');
    }
    
    if (errorMessage.includes('playwright') || errorMessage.includes('chromium')) {
      suggestions.push('Playwright 브라우저가 설치되지 않았습니다.');
      suggestions.push('명령어: playwright install chromium');
    }
    
    if (errorMessage.includes('google_sheet_credentials.json')) {
      suggestions.push('Google Sheets 인증 파일이 없거나 잘못되었습니다.');
      suggestions.push('google_sheet_credentials.json 파일을 확인하세요.');
    }
    
    if (errorMessage.includes('TimeoutError') || errorMessage.includes('Timeout')) {
      suggestions.push('웹사이트 로딩이 너무 오래 걸립니다.');
      suggestions.push('인터넷 연결 상태를 확인하세요.');
      suggestions.push('웹사이트 구조가 변경되었을 수 있습니다.');
    }
    
    if (suggestions.length === 0) {
      suggestions.push('스크립트 실행 중 예상치 못한 오류가 발생했습니다.');
      suggestions.push('로그를 확인하여 자세한 원인을 파악하세요.');
    }
    
    return NextResponse.json({
      success: false,
      error: errorMessage,
      output: '',
      suggestions: suggestions,
    }, { status: 500 });
  }
}
