import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() contacts Supabase Auth to validate — needed in middleware  
  // to avoid stale cookie issues after sign-out/re-login
  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;

  // Public routes
  if (pathname === '/login') {
    if (user) {
      const url = request.nextUrl.clone();
      // Role is resolved by server layouts; send logged-in users to a stable entry point.
      url.pathname = '/sales';
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  if (pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = user ? '/sales' : '/login';
    return NextResponse.redirect(url);
  }

  // Protect all other routes — must be logged in
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/|.*\\..*).*)'],
};
