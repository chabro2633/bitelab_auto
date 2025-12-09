import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/session';

import { getExecutionLogs, addExecutionLog, updateExecutionLog } from '../../../lib/auth';

export async function GET(_request: NextRequest) {
  const session = await getSession();
  
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const logs = getExecutionLogs();
    
    return NextResponse.json({ logs });
  } catch (error: unknown) {
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const logData = await request.json();
    const newLog = addExecutionLog(logData);
    
    return NextResponse.json({ 
      logId: newLog.id,
      message: 'Execution log created successfully' 
    });
  } catch (error: unknown) {
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const session = await getSession();
  
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { logId, updates } = await request.json();
    updateExecutionLog(logId, updates);
    
    return NextResponse.json({ 
      message: 'Execution log updated successfully' 
    });
  } catch (error: unknown) {
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}
