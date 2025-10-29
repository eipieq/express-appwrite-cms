import { NextRequest, NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
    // Appwrite sets session cookies as "appwrite-session" or "a_session_<projectId>"
    const session =
        request.cookies.get('appwrite-session') ??
        request.cookies.getAll().find((cookie) => cookie.name.startsWith('a_session_'));
    
    // define protected routes
    const protectedRoutes = ['/dashboard', '/products'];
    const authRoutes = ['/login', '/register'];
    
    const isProtectedRoute = protectedRoutes.some(route => 
        request.nextUrl.pathname.startsWith(route)
    );
    
    const isAuthRoute = authRoutes.some(route => 
        request.nextUrl.pathname.startsWith(route)
    );

    // always send visitors arriving at "/" to the appropriate page
    if (request.nextUrl.pathname === '/') {
        const destination = session ? '/dashboard' : '/login';
        return NextResponse.redirect(new URL(destination, request.url));
    }

    // if no session and trying to access protected route
    if (!session && isProtectedRoute) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // if has session and trying to access auth routes, redirect to dashboard
    if (session && isAuthRoute) {
        return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
