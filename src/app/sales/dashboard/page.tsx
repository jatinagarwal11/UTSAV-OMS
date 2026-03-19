'use client';

import { useEffect, useMemo, useState } from 'react';
import { startOfMonth } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth-provider';
import { PageLoader } from '@/components/ui/spinner';
import { PaymentBadge } from '@/components/ui/badge';
import { format } from 'date-fns';

interface SalesDashboardOrder {
  id: string;
  order_number: number;
  customer_name: string;
  status: string;
  created_at: string;
  order_items?: { price: number; quantity: number }[];
  invoices?: { total: number; status: string }[];
}

export default function SalesDashboard() {
  const { profile, loading: authLoading } = useAuth();
  const supabase = createClient();
  const [orders, setOrders] = useState<SalesDashboardOrder[]>([]);
  const [commissionPercent, setCommissionPercent] = useState(5);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!profile) {
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setError('');

      const monthStart = startOfMonth(new Date()).toISOString();
      const [ordersRes, settingsRes] = await Promise.all([
        supabase
          .from('orders')
          .select('id, order_number, customer_name, status, created_at, is_factory_order, order_items(price, quantity), invoices(total, status)')
          .eq('salesperson_id', profile.id)
          .eq('is_factory_order', false)
          .gte('created_at', monthStart)
          .order('created_at', { ascending: false }),
        supabase.from('app_settings').select('commission_percent').eq('id', 1).maybeSingle(),
      ]);

      const { data, error: queryError } = ordersRes;

      if (queryError) {
        setError(queryError.message || 'Unable to load monthly sales');
        setOrders([]);
      } else {
        setOrders((data || []) as SalesDashboardOrder[]);
      }

      const loadedCommission = Number(profile.commission_percent ?? settingsRes.data?.commission_percent ?? 5);
      if (!Number.isNaN(loadedCommission)) {
        setCommissionPercent(loadedCommission);
      }
      setLoading(false);
    };

    load();

    const channel = supabase
      .channel('sales-dashboard-month')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `salesperson_id=eq.${profile.id}` },
        () => load()
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => load())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile, supabase]);

  const metrics = useMemo(() => {
    const billed = orders.reduce((sum, order) => sum + Number(order.invoices?.[0]?.total || 0), 0);
    const paid = orders.reduce(
      (sum, order) => sum + Number(order.invoices?.[0]?.status === 'paid' ? order.invoices?.[0]?.total || 0 : 0),
      0
    );
    const estimated = orders.reduce(
      (sum, order) =>
        sum +
        (order.invoices?.[0]?.total
          ? 0
          : (order.order_items || []).reduce((itemSum, item) => itemSum + Number(item.price) * Number(item.quantity), 0)),
      0
    );

    const avgOrderValue = orders.length > 0 ? billed / orders.length : 0;
    const estimatedCommission = (paid * commissionPercent) / 100;

    const trendBuckets = [0, 0, 0, 0, 0].map((_, idx) => ({
      label: `W${idx + 1}`,
      value: 0,
    }));

    orders.forEach((order) => {
      const date = new Date(order.created_at);
      const weekIndex = Math.min(4, Math.floor((date.getDate() - 1) / 7));
      const invoiceTotal = Number(order.invoices?.[0]?.total || 0);
      const itemTotal = (order.order_items || []).reduce(
        (sum, item) => sum + Number(item.price) * Number(item.quantity),
        0
      );
      trendBuckets[weekIndex].value += invoiceTotal || itemTotal;
    });

    const trendMax = Math.max(...trendBuckets.map((b) => b.value), 1);

    return {
      billed,
      paid,
      estimated,
      totalOrders: orders.length,
      avgOrderValue,
      estimatedCommission,
      trendBuckets,
      trendMax,
    };
  }, [orders, commissionPercent]);

  if (authLoading) return <PageLoader />;
  if (loading) return <PageLoader />;

  if (!profile) {
    return <p className="text-sm text-[var(--text-tertiary)]">Your user profile is missing. Contact admin.</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">My Monthly Sales</h2>
        <p className="text-xs text-[var(--text-tertiary)]">{format(new Date(), 'MMMM yyyy')}</p>
      </div>

      {error && <p className="text-sm text-[var(--danger)] mb-4">{error}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
          <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wide">Orders</p>
          <p className="text-xl font-bold mt-1">{metrics.totalOrders}</p>
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
          <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wide">Billed</p>
          <p className="text-xl font-bold mt-1">₹{metrics.billed.toLocaleString()}</p>
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
          <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wide">Paid</p>
          <p className="text-xl font-bold mt-1">₹{metrics.paid.toLocaleString()}</p>
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
          <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wide">Unbilled Estimate</p>
          <p className="text-xl font-bold mt-1">₹{metrics.estimated.toLocaleString()}</p>
        </div>
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
          <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wide">Avg Order</p>
          <p className="text-xl font-bold mt-1">₹{metrics.avgOrderValue.toFixed(0)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
          <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wide mb-1">Estimated Commission</p>
          <p className="text-2xl font-bold">₹{metrics.estimatedCommission.toFixed(2)}</p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            Based on paid sales and {commissionPercent.toFixed(2)}% commission.
          </p>
        </div>

        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
          <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wide mb-3">Weekly Sales Trend</p>
          <div className="flex items-end gap-3 h-36">
            {metrics.trendBuckets.map((bucket) => {
              const height = Math.max(8, (bucket.value / metrics.trendMax) * 120);
              return (
                <div key={bucket.label} className="flex-1 flex flex-col items-center gap-1">
                  <div className="text-[10px] text-[var(--text-tertiary)]">₹{Math.round(bucket.value)}</div>
                  <div className="w-full bg-[var(--accent)]/20 rounded-sm overflow-hidden" style={{ height: 120 }}>
                    <div className="w-full bg-[var(--accent)]" style={{ height, marginTop: 120 - height }} />
                  </div>
                  <div className="text-[10px] text-[var(--text-secondary)]">{bucket.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <h3 className="text-sm font-semibold mb-3">This Month Orders</h3>
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--bg)]">
              <th className="text-left px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">#</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Customer</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Status</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Invoice</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Date</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const inv = order.invoices?.[0];
              const amount = inv?.total || 0;
              return (
                <tr key={order.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-hover)]">
                  <td className="px-4 py-2.5 font-medium">{order.order_number}</td>
                  <td className="px-4 py-2.5">{order.customer_name}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs bg-[var(--bg-hover)] px-2 py-0.5 rounded">{order.status}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {inv ? (
                      <div className="inline-flex items-center gap-2">
                        <span>₹{Number(amount).toFixed(2)}</span>
                        <PaymentBadge status={inv.status as 'unpaid' | 'partial' | 'paid'} />
                      </div>
                    ) : (
                      <span className="text-[var(--text-tertiary)]">Not generated</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-[var(--text-tertiary)]">
                    {format(new Date(order.created_at), 'dd MMM, hh:mm a')}
                  </td>
                </tr>
              );
            })}
            {orders.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[var(--text-tertiary)]">No orders this month</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
