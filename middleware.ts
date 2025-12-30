import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { setAffiliateCookie } from './lib/affiliate-cookies';

export async function middleware(request: NextRequest) {
    const { pathname, origin } = request.nextUrl;

    // Affiliate tracking: Check for ?ref= parameter in URL (do this early for all requests)
    const refCode = request.nextUrl.searchParams.get('ref');
    const utmParams = {
        utmSource: request.nextUrl.searchParams.get('utm_source'),
        utmMedium: request.nextUrl.searchParams.get('utm_medium'),
        utmCampaign: request.nextUrl.searchParams.get('utm_campaign'),
        utmTerm: request.nextUrl.searchParams.get('utm_term'),
        utmContent: request.nextUrl.searchParams.get('utm_content'),
    };

    // Helper function to add affiliate cookies to a response
    const addAffiliateCookies = (resp: NextResponse) => {
        if (refCode) {
            const cookieValue = setAffiliateCookie(refCode);
            resp.headers.set('Set-Cookie', cookieValue);

            if (Object.values(utmParams).some(v => v)) {
                const utmCookie = `affiliate_utm=${encodeURIComponent(JSON.stringify(utmParams))}; expires=${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString()}; path=/; SameSite=Lax; Secure`;
                resp.headers.append('Set-Cookie', utmCookie);
            }
        }
        return resp;
    };

    const response = NextResponse.next();

    // Paths requiring authentication
    const protectedPaths = ['/settings', '/profile', '/admin'];

    // Redirect legacy auth pages to modal flow
    if (pathname === '/auth/login') {
        const url = new URL('/', request.url);
        url.searchParams.set('auth', 'login');
        return addAffiliateCookies(NextResponse.redirect(url));
    }
    if (pathname === '/auth/register') {
        const url = new URL('/', request.url);
        url.searchParams.set('auth', 'signup');
        return addAffiliateCookies(NextResponse.redirect(url));
    }

    // Enforce auth on protected paths
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
            console.error('middleware session check failed', e);
        }

        if (!session) {
            const url = new URL('/', request.url);
            url.searchParams.set('auth', 'login');
            url.searchParams.set('callbackUrl', pathname);
            return addAffiliateCookies(NextResponse.redirect(url));
        }

        // Admin check
        if (pathname.startsWith('/admin') && !session.user?.isAdmin) {
            return addAffiliateCookies(NextResponse.redirect(new URL('/', request.url)));
        }
    }

    // Add affiliate cookies to the response
    return addAffiliateCookies(response);
}

export const config = {
    matcher: [
        // Match all paths except static files and auth/telegram APIs
        '/((?!_next/static|_next/image|favicon.ico|api/auth|api/telegram|api/health).*)',
    ],
};
