import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/auth-config';
import { updateUserBrands } from '../../../../lib/auth';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { username, allowedBrands } = await request.json();

    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    if (!Array.isArray(allowedBrands)) {
      return NextResponse.json({ error: 'Allowed brands must be an array' }, { status: 400 });
    }

    const updatedUser = await updateUserBrands(username, allowedBrands);

    return NextResponse.json({
      message: 'Brand permissions updated successfully',
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        role: updatedUser.role,
        allowedBrands: updatedUser.allowedBrands,
        createdAt: updatedUser.createdAt
      }
    });

  } catch (error: unknown) {
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}
