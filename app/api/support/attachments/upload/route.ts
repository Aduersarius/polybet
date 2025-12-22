/**
 * Support Attachment Upload API
 * POST /api/support/attachments/upload - Upload file to Vercel Blob
 */

import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { rateLimitService } from '@/lib/support/rate-limit-service';

// File validation constants
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

const MIME_TYPE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
};

/**
 * POST /api/support/attachments/upload
 * Upload file to Vercel Blob storage
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user as any;

    // Check rate limit
    const rateLimit = await rateLimitService.checkAndRecord(user.id, 'attachment_upload');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: `Rate limit exceeded. Try again after ${rateLimit.resetAt.toLocaleTimeString()}` },
        { status: 429 }
      );
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const ticketId = formData.get('ticketId') as string;
    const messageId = formData.get('messageId') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!ticketId) {
      return NextResponse.json({ error: 'Ticket ID is required' }, { status: 400 });
    }

    // Verify user has access to this ticket
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      select: { userId: true },
    });

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // Check if user owns the ticket or is support agent
    const isAgent = user.supportRole === 'agent' || user.supportRole === 'admin' || user.isAdmin;
    if (ticket.userId !== user.id && !isAgent) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error: `File type not allowed. Allowed types: images, PDF, Word documents, and text files.`,
        },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is 10MB.` },
        { status: 400 }
      );
    }

    // Generate secure filename
    const timestamp = Date.now();
    const extension = MIME_TYPE_EXTENSIONS[file.type] || 'bin';
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_').substring(0, 100);
    const filename = `${timestamp}-${sanitizedName}`;

    // Upload to Vercel Blob
    const blob = await put(`support/${user.id}/${ticketId}/${filename}`, file, {
      access: 'public', // We'll control access via API
      addRandomSuffix: true,
    });

    // Save to database
    const attachment = await prisma.supportAttachment.create({
      data: {
        ticketId,
        messageId: messageId || null,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        url: blob.url,
        uploadedBy: user.id,
        isScanned: false, // Future: implement virus scanning
        scanStatus: null,
      },
    });

    return NextResponse.json(
      {
        id: attachment.id,
        fileName: attachment.fileName,
        fileSize: attachment.fileSize,
        mimeType: attachment.mimeType,
        url: attachment.url,
        uploadedAt: attachment.uploadedAt,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error uploading attachment:', error);

    if (error instanceof Error && error.message.includes('Rate limit')) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to upload file' },
      { status: 500 }
    );
  }
}

// Body size limit is handled in the route handler via MAX_FILE_SIZE constant
// No need for deprecated config export in App Router
