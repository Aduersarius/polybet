/**
 * Support Attachment Download API
 * GET /api/support/attachments/[id] - Get attachment with access control
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canViewTicket } from '@/lib/support/permissions';

/**
 * GET /api/support/attachments/[id]
 * Download or view attachment (with access control)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user as any;
    const { id: attachmentId } = await params;

    // Fetch attachment with ticket info
    const attachment = await prisma.supportAttachment.findUnique({
      where: { id: attachmentId },
      include: {
        ticket: {
          select: {
            userId: true,
          },
        },
      },
    });

    if (!attachment) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }

    // Check access permissions
    const hasPermission = await canViewTicket(user, attachment.ticketId);
    if (!hasPermission) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Redirect to Vercel Blob URL (signed URL would be better for production)
    return NextResponse.redirect(attachment.url);
  } catch (error) {
    console.error('Error fetching attachment:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch attachment' },
      { status: 500 }
    );
  }
}

