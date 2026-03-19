'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth-provider';
import Button from '@/components/ui/button';
import { OrderStatusBadge, PaymentBadge } from '@/components/ui/badge';
import { PageLoader } from '@/components/ui/spinner';
import { format } from 'date-fns';
import type { Order } from '@/lib/types';

export default function SalesOrders() {
  const { profile, loading: authLoading } = useAuth();
  const supabase = createClient();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const loadOrders = async () => {
    if (!profile) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*, product:products(*)), invoices(*)')
      .eq('salesperson_id', profile.id)
      .order('created_at', { ascending: false });
    setOrders(data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (!profile) {
      setLoading(false);
      return;
    }

    loadOrders();

    // Realtime updates
    const channel = supabase
      .channel('sales-orders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `salesperson_id=eq.${profile.id}` },
        () => loadOrders()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps

  const cancelOrder = async (order: Order) => {
    if (!profile || cancellingOrderId) return;

    setCancellingOrderId(order.id);
    setActionError('');
    try {
      const response = await fetch('/api/orders/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderId: order.id }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setActionError(payload?.error || 'Unable to cancel this order.');
        return;
      }
      await loadOrders();
    } finally {
      setCancellingOrderId(null);
    }
  };

  if (authLoading) return <PageLoader />;
  if (loading) return <PageLoader />;

  if (!profile) {
    return <p className="text-sm text-[var(--text-tertiary)]">Your user profile is missing. Contact admin.</p>;
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-6">My Orders</h2>

      {actionError && (
        <p className="text-xs text-[var(--danger)] mb-3">{actionError}</p>
      )}

      {orders.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)]">No orders yet.</p>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const itemTotal = order.order_items?.reduce((s, i) => s + i.price * i.quantity, 0) || 0;
            const invoice = order.invoices?.[0];
            const canCancel = order.status === 'DRAFT' || order.status === 'CONFIRMED';
            return (
              <div
                key={order.id}
                className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-[var(--text)]">#{order.order_number}</p>
                    <p className="text-xs text-[var(--text-tertiary)]">
                      {format(new Date(order.created_at), 'dd MMM yyyy, hh:mm a')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <OrderStatusBadge status={order.status} />
                    {invoice && <PaymentBadge status={invoice.status} />}
                  </div>
                </div>

                <div className="mb-2">
                  <p className="text-sm text-[var(--text)]">{order.customer_name}</p>
                  {order.phone && <p className="text-xs text-[var(--text-tertiary)]">{order.phone}</p>}
                </div>

                <div className="flex flex-wrap gap-1 mb-2">
                  {order.order_items?.map((item) => (
                    <span key={item.id} className="text-xs bg-[var(--bg-hover)] px-2 py-0.5 rounded">
                      {item.product?.name || 'Item'} × {item.quantity}
                    </span>
                  ))}
                </div>

                <p className="text-sm font-medium text-[var(--text)]">₹{itemTotal.toFixed(2)}</p>

                {canCancel && (
                  <div className="mt-3">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => cancelOrder(order)}
                      disabled={cancellingOrderId === order.id}
                    >
                      {cancellingOrderId === order.id ? 'Cancelling...' : 'Cancel Order'}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
