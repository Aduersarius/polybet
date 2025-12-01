import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    // Admin route protection is handled at the page/API level
    // Edge middleware can't verify Better Auth sessions properly
    return NextResponse.next();
}

export const config = {
    matcher: ['/admin/:path*'],
};
