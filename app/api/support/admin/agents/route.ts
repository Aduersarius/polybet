/**
 * Support Agent Management API
 * GET /api/support/admin/agents - List support agents
 * POST /api/support/admin/agents - Promote user to agent
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canManageAgents } from '@/lib/support/permissions';

/**
 * GET /api/support/admin/agents
 * List all support agents
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user as any;

    if (!canManageAgents(user)) {
      return NextResponse.json(
        { error: 'Only admins can manage agents' },
        { status: 403 }
      );
    }

    // Get all agents
    const agents = await prisma.user.findMany({
      where: {
        supportRole: {
          in: ['agent', 'admin'],
        },
      },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        avatarUrl: true,
        supportRole: true,
        _count: {
          select: {
            ticketsAssigned: {
              where: {
                status: {
                  in: ['open', 'pending'],
                },
              },
            },
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    return NextResponse.json(agents);
  } catch (error) {
    console.error('Error fetching agents:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch agents' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/support/admin/agents
 * Promote a user to support agent or admin
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user as any;

    if (!canManageAgents(user)) {
      return NextResponse.json(
        { error: 'Only admins can manage agents' },
        { status: 403 }
      );
    }

    const body = await request.json();

    if (!body.userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    if (!body.role || !['agent', 'admin', null].includes(body.role)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be "agent", "admin", or null to remove role' },
        { status: 400 }
      );
    }

    // Update user's support role
    const updatedUser = await prisma.user.update({
      where: { id: body.userId },
      data: { supportRole: body.role },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        supportRole: true,
      },
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error('Error updating agent role:', error);

    if (error instanceof Error && error.message.includes('Record to update not found')) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update agent role' },
      { status: 500 }
    );
  }
}
