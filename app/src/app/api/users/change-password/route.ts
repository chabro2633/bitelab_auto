import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getUsers, saveUsers, hashPassword } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    // 가장 기본적인 로그 - 이게 보이지 않으면 API 라우트 자체가 실행되지 않는 것
    console.log('🚀 API ROUTE EXECUTED - PASSWORD CHANGE START');
    console.error('🚀 API ROUTE EXECUTED - PASSWORD CHANGE START (ERROR LOG)');
    
    // 세션 체크 없이 바로 테스트 응답
    return NextResponse.json({ 
      message: 'API route is working - NO SESSION CHECK',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      debug: 'This should appear if API route executes without session check'
    });
    
  } catch (error: unknown) {
    console.error('❌ Password change error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
