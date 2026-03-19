import { createClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { UserRole } from '@/lib/types';

interface CreateUserPayload {
  email?: string;
  name?: string;
  password?: string;
  role?: UserRole;
  commissionPercent?: number | null;
}

const allowedRoles: UserRole[] = ['admin', 'sales', 'kitchen', 'accounts'];

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: authData } = await supabase.auth.getUser();
  const requester = authData.user;

  if (!requester) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', requester.id)
    .maybeSingle();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const payload = (await request.json()) as CreateUserPayload;
  const email = payload.email?.trim() || '';
  const name = payload.name?.trim() || '';
  const password = payload.password || '';
  const role = payload.role;
  const commissionPercent = payload.commissionPercent ?? null;

  if (!email || !name || !password || !role || !allowedRoles.includes(role)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  if (role === 'sales' && commissionPercent !== null && (Number.isNaN(commissionPercent) || commissionPercent < 0 || commissionPercent > 100)) {
    return NextResponse.json({ error: 'Commission must be between 0 and 100' }, { status: 400 });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!serviceRoleKey || !supabaseUrl) {
    return NextResponse.json(
      { error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL' },
      { status: 500 },
    );
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name,
      role,
    },
  });

  if (createError || !created.user) {
    return NextResponse.json({ error: createError?.message || 'Unable to create auth user' }, { status: 400 });
  }

  const { error: profileError } = await adminClient
    .from('profiles')
    .upsert({
      id: created.user.id,
      name,
      email,
      role,
      commission_percent: role === 'sales' ? commissionPercent : null,
      is_active: true,
    });

  if (profileError) {
    return NextResponse.json({ error: profileError.message || 'User created but profile row failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, userId: created.user.id });
}
