import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    const url = request.nextUrl;
    const hostname = request.headers.get('host') || '';

    // Define the main domain (e.g., superozono.com)
    const mainDomain = 'superozono.com';

    // Extract the subdomain
    const subdomain = hostname.includes(mainDomain)
        ? hostname.replace(`.${mainDomain}`, '')
        : null;

    // Logic to handle specific subdomains
    if (subdomain && subdomain !== 'www' && subdomain !== mainDomain) {
        // Rewrite path to /store/[subdomain] for dynamic store pages
        return NextResponse.rewrite(new URL(`/store/${subdomain}${url.pathname}`, request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api (API routes)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!api|_next/static|_next/image|favicon.ico).*)',
    ],
};
