import { createServerSupabase } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

function clearSupabaseCookies(response: NextResponse, request: NextRequest) {
  const cookieNames = request.cookies.getAll().map((c) => c.name);
  cookieNames
    .filter((name) => name.startsWith('sb-'))
    .forEach((name) => response.cookies.delete(name));
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();

  const response = NextResponse.json({ ok: true });
  clearSupabaseCookies(response, request);

  return response;
}

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();

  const redirectTo = request.nextUrl.searchParams.get('redirect') || '/login';
  const response = NextResponse.redirect(new URL(redirectTo, request.url));
  clearSupabaseCookies(response, request);

  return response;
}
