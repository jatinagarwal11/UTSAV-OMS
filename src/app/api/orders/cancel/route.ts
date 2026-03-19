import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase/server';

interface CancelPayload {
  orderId?: string;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.role) {
    return NextResponse.json({ error: 'User profile not found' }, { status: 403 });
  }

  const payload = (await request.json()) as CancelPayload;
  const orderId = payload.orderId;

  if (!orderId) {
    return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!serviceRoleKey || !supabaseUrl) {
    return NextResponse.json({ error: 'Server missing Supabase service configuration' }, { status: 500 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  if (profile.role === 'sales') {
    const { data: ownOrder } = await adminClient
      .from('orders')
      .select('id, status, salesperson_id')
      .eq('id', orderId)
      .eq('salesperson_id', user.id)
      .in('status', ['DRAFT', 'CONFIRMED'])
      .maybeSingle();

    if (!ownOrder) {
      return NextResponse.json(
        { error: 'Sales can only cancel their own DRAFT/CONFIRMED orders.' },
        { status: 403 },
      );
    }
  } else if (profile.role === 'accounts') {
    const { data: targetOrder } = await adminClient
      .from('orders')
      .select('id, status')
      .eq('id', orderId)
      .in('status', ['CONFIRMED', 'IN_PRODUCTION', 'READY', 'BILLED'])
      .maybeSingle();

    if (!targetOrder) {
      return NextResponse.json({ error: 'Accounts cannot cancel this order status.' }, { status: 403 });
    }
  } else if (profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: updatedOrder, error: updateError } = await adminClient
    .from('orders')
    .update({ status: 'CANCELLED' })
    .eq('id', orderId)
    .select('id, status')
    .maybeSingle();

  if (updateError || !updatedOrder) {
    return NextResponse.json({ error: updateError?.message || 'Unable to cancel this order.' }, { status: 400 });
  }

  await adminClient.from('audit_logs').insert({
    user_id: user.id,
    action: 'ORDER_CANCELLED',
    details: { order_id: orderId, role: profile.role, source: 'api/orders/cancel' },
  });

  return NextResponse.json({ ok: true, orderId: updatedOrder.id, status: updatedOrder.status });
}
