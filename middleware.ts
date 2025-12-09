import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
const publicPaths = ['/auth/login', '/auth/register', '/api/auth'];
const authPaths = ['/auth/login', '/auth/register'];

export async function middleware(request: NextRequest) {
    const { pathname, origin } = request.nextUrl;

    // Define paths that REQUIRE authentication
    const protectedPaths = ['/settings', '/profile', '/admin'];

    // Redirect legacy auth pages to home with modal param
    if (pathname === '/auth/login') {
        const url = new URL('/', request.url);
        url.searchParams.set('auth', 'login');
        return NextResponse.redirect(url);
    }
    if (pathname === '/auth/register') {
        const url = new URL('/', request.url);
        url.searchParams.set('auth', 'signup');
        return NextResponse.redirect(url);
    }

    // Check if the current path is protected
    const isProtected = protectedPaths.some(path => pathname.startsWith(path));

    if (isProtected) {
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

        if (!session) {
            const url = new URL('/', request.url);
            url.searchParams.set('auth', 'login');
            url.searchParams.set('callbackUrl', pathname);
            return NextResponse.redirect(url);
        }

        // Admin check
        if (pathname.startsWith('/admin') && !session.user?.isAdmin) {
            return NextResponse.redirect(new URL('/', request.url));
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|api/auth).*)',
    ],
};
