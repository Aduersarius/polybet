import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
const publicPaths = ['/auth/login', '/auth/register', '/api/auth'];
const authPaths = ['/auth/login', '/auth/register'];

export async function middleware(request: NextRequest) {
    const { pathname, origin } = request.nextUrl;

    // Skip middleware for public paths
    if (publicPaths.some(path => pathname.startsWith(path))) {
        // If user is logged in and tries to access auth pages, redirect to home
        if (authPaths.some(path => pathname.startsWith(path))) {
            try {
                const response = await fetch(`${origin}/api/auth/get-session`, {
                    headers: {
                        cookie: request.headers.get('cookie') || '',
                    },
                });
                const session = await response.json();

                if (session) {
                    return NextResponse.redirect(new URL('/', request.url));
                }
            } catch (e) {
                // Ignore error, just continue
            }
        }
        return NextResponse.next();
    }

    // Check for protected routes
    let session = null;
    try {
        const response = await fetch(`${origin}/api/auth/get-session`, {
            headers: {
                cookie: request.headers.get('cookie') || '',
            },
        });
        session = await response.json();
    } catch (e) {
        console.error('Middleware session check failed', e);
    }

    // If no session, redirect to login
    if (!session) {
        const loginUrl = new URL('/auth/login', request.url);
        loginUrl.searchParams.set('callbackUrl', pathname);
        return NextResponse.redirect(loginUrl);
    }

    // Check for admin routes
    if (pathname.startsWith('/admin')) {
        if (!session.user?.isAdmin) {
            return NextResponse.redirect(new URL('/', request.url));
        }
    }

    // Continue with the request
    return NextResponse.next();
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|api/auth).*)',
    ],
};
