import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '../../../lib/session';
import {
  getScheduleFailureLogs,
  addScheduleFailureLog,
  updateScheduleFailureLog,
  getScheduleFailureLogByRunId
} from '../../../lib/auth';

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const logs = getScheduleFailureLogs();
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
    const newLog = addScheduleFailureLog(logData);

    return NextResponse.json({
      log: newLog,
      message: 'Schedule failure log created successfully'
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
    const { logId, scheduleRunId, updates } = await request.json();

    let updatedLog;
    if (logId) {
      updatedLog = updateScheduleFailureLog(logId, updates);
    } else if (scheduleRunId) {
      const existingLog = getScheduleFailureLogByRunId(scheduleRunId);
      if (existingLog) {
        updatedLog = updateScheduleFailureLog(existingLog.id, updates);
      }
    }

    if (!updatedLog) {
      return NextResponse.json({ error: 'Log not found' }, { status: 404 });
    }

    return NextResponse.json({
      log: updatedLog,
      message: 'Schedule failure log updated successfully'
    });
  } catch (error: unknown) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
