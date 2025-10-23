import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';
import { markFirstLoginComplete, getUsers } from '../../../../lib/auth';

export async function POST(request: NextRequest) {
  console.log('🚀 FIRST LOGIN COMPLETE API START');
  
  const session = await getServerSession(authOptions);
  console.log('🔐 Session exists:', !!session);
  console.log('👤 Session user:', JSON.stringify(session?.user, null, 2));

  if (!session) {
    console.log('❌ No session found - returning 401');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('📝 Marking first login complete for user:', session.user.id);
    await markFirstLoginComplete(session.user.id);
    console.log('✅ First login completed successfully');

    // 업데이트된 사용자 정보 확인
    const users = await getUsers();
    const updatedUser = users.find(u => u.id === session.user.id);
    console.log('🔄 Updated user data:', JSON.stringify(updatedUser, null, 2));

    return NextResponse.json({
      message: 'First login completed successfully',
      user: updatedUser
    });

  } catch (error: unknown) {
    console.error('❌ First login complete error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}
