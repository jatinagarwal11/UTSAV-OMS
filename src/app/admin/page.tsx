'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Modal, PageLoader } from '@/components/ui';
import { OrderStatusBadge, PaymentBadge } from '@/components/ui/badge';
import { format } from 'date-fns';
import type { Order } from '@/lib/types';

interface Stats {
  totalOrders: number;
  totalRevenue: number;
  pendingOrders: number;
  todayOrders: number;
  unpaidInvoices: number;
  readyToBill: number;
  inProduction: number;
  avgTicketSize: number;
  paidToday: number;
  activeStaff: number;
}

export default function AdminDashboard() {
  const supabase = createClient();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentOrders, setRecentOrders] = useState<{ id: string; order_number: number; customer_name: string; status: string; created_at: string }[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    const load = async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [ordersRes, invoicesRes, todayRes, recentRes, activeStaffRes] = await Promise.all([
        supabase.from('orders').select('id, status, created_at', { count: 'exact' }),
        supabase.from('invoices').select('total, status, created_at'),
        supabase.from('orders').select('id', { count: 'exact' }).gte('created_at', today.toISOString()),
        supabase.from('orders').select('id, order_number, customer_name, status, created_at').order('created_at', { ascending: false }).limit(10),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_active', true),
      ]);

      const orders = ordersRes.data || [];
      const invoices = invoicesRes.data || [];
      const paidInvoices = invoices.filter(i => i.status === 'paid');
      const paidToday = paidInvoices
        .filter(i => new Date(i.created_at) >= today)
        .reduce((s, i) => s + Number(i.total), 0);
      const avgTicketSize = paidInvoices.length
        ? paidInvoices.reduce((s, i) => s + Number(i.total), 0) / paidInvoices.length
        : 0;

      setStats({
        totalOrders: ordersRes.count || 0,
        totalRevenue: paidInvoices.reduce((s, i) => s + Number(i.total), 0),
        pendingOrders: orders.filter(o => !['PAID', 'BILLED'].includes(o.status)).length,
        todayOrders: todayRes.count || 0,
        unpaidInvoices: invoices.filter(i => i.status !== 'paid').length,
        readyToBill: orders.filter(o => o.status === 'READY').length,
        inProduction: orders.filter(o => o.status === 'IN_PRODUCTION').length,
        avgTicketSize,
        paidToday,
        activeStaff: activeStaffRes.count || 0,
      });

      setRecentOrders(recentRes.data || []);
      setLoading(false);
    };
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <PageLoader />;

  const cards = [
    { label: 'Total Orders', value: stats?.totalOrders || 0 },
    { label: 'Today', value: stats?.todayOrders || 0 },
    { label: 'Revenue', value: `₹${(stats?.totalRevenue || 0).toLocaleString()}` },
    { label: 'Revenue Today', value: `₹${(stats?.paidToday || 0).toLocaleString()}` },
    { label: 'Avg Ticket', value: `₹${(stats?.avgTicketSize || 0).toFixed(2)}` },
    { label: 'Ready To Bill', value: stats?.readyToBill || 0 },
    { label: 'In Production', value: stats?.inProduction || 0 },
    { label: 'Pending', value: stats?.pendingOrders || 0 },
    { label: 'Unpaid Invoices', value: stats?.unpaidInvoices || 0 },
    { label: 'Active Staff', value: stats?.activeStaff || 0 },
  ];

  return (
    <div>
      <h2 className="text-lg font-semibold mb-6">Dashboard</h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        {cards.map((c) => (
          <div key={c.label} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-4">
            <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wide">{c.label}</p>
            <p className="text-xl font-bold text-[var(--text)] mt-1">{c.value}</p>
          </div>
        ))}
      </div>

      <h3 className="text-sm font-semibold mb-3">Recent Orders</h3>
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--bg)]">
              <th className="text-left px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">#</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Customer</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Status</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Date</th>
            </tr>
          </thead>
          <tbody>
            {recentOrders.map((o, idx) => (
              <tr
                key={idx}
                className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-hover)] cursor-pointer"
                onClick={() => openOrderDetails(o.id)}
              >
                <td className="px-4 py-2.5 font-medium">{o.order_number}</td>
                <td className="px-4 py-2.5 text-[var(--text-secondary)]">{o.customer_name}</td>
                <td className="px-4 py-2.5">
                  <span className="text-xs bg-[var(--bg-hover)] px-2 py-0.5 rounded">{o.status}</span>
                </td>
                <td className="px-4 py-2.5 text-right text-xs text-[var(--text-tertiary)]">
                  {format(new Date(o.created_at), 'dd MMM, hh:mm a')}
                </td>
              </tr>
            ))}
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
          </div>
        )}
      </Modal>
    </div>
  );
}
