'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button, Modal, PageLoader } from '@/components/ui';
import { OrderStatusBadge, PaymentBadge } from '@/components/ui/badge';
import { format } from 'date-fns';
import type { Order, OrderStatus } from '@/lib/types';

export default function AdminOrders() {
  const supabase = createClient();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'ALL'>('ALL');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState('');

  const loadOrders = async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, salesperson:profiles!salesperson_id(name), order_items(*, product:products(*))')
      .order('created_at', { ascending: false });
    setOrders(data || []);
    setLoading(false);
  };

  useEffect(() => {
    loadOrders();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cancelOrder = async (order: Order) => {
    if (cancelling || order.status === 'PAID' || order.status === 'CANCELLED') return;

    setCancelling(true);
    setActionError('');
    try {
      const { data, error } = await supabase
        .from('orders')
        .update({ status: 'CANCELLED' })
        .eq('id', order.id)
        .select('id')
        .maybeSingle();

      if (error || !data) {
        setActionError(error?.message || 'Unable to cancel this order.');
        return;
      }

      await supabase.from('audit_logs').insert({
        action: 'ORDER_CANCELLED',
        details: { order_id: order.id, role: 'admin' },
      });

      const refreshed = await supabase
        .from('orders')
        .select('*, salesperson:profiles!salesperson_id(name), order_items(*, product:products(*)), invoices(*, payments(*))')
        .eq('id', order.id)
        .single();

      if (refreshed.data) {
        setSelectedOrder(refreshed.data);
      }

      await loadOrders();
    } finally {
      setCancelling(false);
    }
  };

  const openOrderDetails = async (orderId: string) => {
    const { data } = await supabase
      .from('orders')
      .select('*, salesperson:profiles!salesperson_id(name), order_items(*, product:products(*)), invoices(*, payments(*))')
      .eq('id', orderId)
      .single();

    if (data) {
      setSelectedOrder(data);
      setDetailsOpen(true);
    }
  };

  const filtered = statusFilter === 'ALL' ? orders : orders.filter((o) => o.status === statusFilter);

  const statuses: (OrderStatus | 'ALL')[] = ['ALL', 'CONFIRMED', 'IN_PRODUCTION', 'READY', 'BILLED', 'PAID', 'CANCELLED'];

  if (loading) return <PageLoader />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">All Orders</h2>
        <p className="text-xs text-[var(--text-tertiary)]">{filtered.length} orders</p>
      </div>

      {actionError && (
        <p className="text-xs text-[var(--danger)] mb-3">{actionError}</p>
      )}

      <div className="flex gap-1 flex-wrap mb-4">
        {statuses.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              statusFilter === s
                ? 'bg-[var(--accent)] text-[var(--accent-text)] border-[var(--accent)]'
                : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            {s === 'ALL' ? 'All' : s.replace('_', ' ')}
          </button>
        ))}
      </div>

      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--bg)]">
              <th className="text-left px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">#</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Customer</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Salesperson</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Items</th>
              <th className="text-center px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Status</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Date</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => (
              <tr
                key={o.id}
                className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-hover)] cursor-pointer"
                onClick={() => openOrderDetails(o.id)}
              >
                <td className="px-4 py-2.5 font-medium">{o.order_number}</td>
                <td className="px-4 py-2.5">{o.customer_name}</td>
                <td className="px-4 py-2.5 text-[var(--text-secondary)]">
                  {(o.salesperson as unknown as { name: string })?.name || '—'}
                </td>
                <td className="px-4 py-2.5 text-[var(--text-secondary)]">
                  {o.order_items?.length || 0} items
                </td>
                <td className="px-4 py-2.5 text-center">
                  <OrderStatusBadge status={o.status} />
                </td>
                <td className="px-4 py-2.5 text-right text-xs text-[var(--text-tertiary)]">
                  {format(new Date(o.created_at), 'dd MMM, hh:mm a')}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-[var(--text-tertiary)]">No orders</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={detailsOpen}
        onClose={() => {
          setDetailsOpen(false);
          setSelectedOrder(null);
        }}
        title={selectedOrder ? `Order #${selectedOrder.order_number}` : 'Order Details'}
      >
        {!selectedOrder ? (
          <p className="text-sm text-[var(--text-tertiary)]">Loading details...</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium">{selectedOrder.customer_name}</p>
                <p className="text-xs text-[var(--text-tertiary)]">
                  {format(new Date(selectedOrder.created_at), 'dd MMM yyyy, hh:mm a')}
                </p>
              </div>
              <OrderStatusBadge status={selectedOrder.status} />
            </div>

            <div className="space-y-1">
              {selectedOrder.order_items?.map((item) => (
                <div key={item.id} className="flex justify-between text-sm py-1 border-b border-[var(--border)] last:border-0">
                  <span>{item.product?.name || 'Item'} x {item.quantity}</span>
                  <span>₹{(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="text-xs text-[var(--text-secondary)] space-y-1">
              <p>Phone: {selectedOrder.phone || 'N/A'}</p>
              <p>Address: {selectedOrder.address || 'N/A'}</p>
              <p>Salesperson: {(selectedOrder.salesperson as unknown as { name: string })?.name || 'N/A'}</p>
            </div>

            {selectedOrder.invoices?.[0] && (
              <div className="pt-2 border-t border-[var(--border)]">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Invoice</p>
                  <PaymentBadge status={selectedOrder.invoices[0].status} />
                </div>
                <p className="text-sm mt-2">Total: ₹{selectedOrder.invoices[0].total.toFixed(2)}</p>
              </div>
            )}

            {selectedOrder.status !== 'PAID' && selectedOrder.status !== 'CANCELLED' && (
              <div className="pt-2 border-t border-[var(--border)]">
                <Button variant="secondary" size="sm" onClick={() => cancelOrder(selectedOrder)} disabled={cancelling}>
                  {cancelling ? 'Cancelling...' : 'Cancel Order'}
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
