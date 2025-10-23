import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/session';

export async function GET() {
  try {
    const session = await getSession();
    
    if (session) {
      return NextResponse.json({ 
        authenticated: true, 
        user: session 
      });
    } else {
      return NextResponse.json({ 
        authenticated: false 
      });
    }
  } catch (error) {
    console.error('Session API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
