'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PaymentBadge } from '@/components/ui/badge';
import { PageLoader } from '@/components/ui/spinner';
import { format } from 'date-fns';
import type { Invoice } from '@/lib/types';

export default function AccountsInvoices() {
  const supabase = createClient();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'paid'>('all');

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('invoices')
        .select('*, order:orders(order_number, customer_name)')
        .order('created_at', { ascending: false });
      setInvoices(data || []);
      setLoading(false);
    };
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = filter === 'all' ? invoices : invoices.filter((i) => i.status === filter);

  if (loading) return <PageLoader />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Invoices</h2>
        <div className="flex gap-1">
          {(['all', 'unpaid', 'paid'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                filter === f
                  ? 'bg-[var(--accent)] text-[var(--accent-text)] border-[var(--accent)]'
                  : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)] text-center py-8">No invoices</p>
      ) : (
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg)]">
                <th className="text-left px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Order</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Customer</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Total</th>
                <th className="text-center px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Status</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => {
                const order = inv.order as unknown as { order_number: number; customer_name: string } | undefined;
                return (
                  <tr key={inv.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-hover)]">
                    <td className="px-4 py-3 font-medium">#{order?.order_number}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">{order?.customer_name}</td>
                    <td className="px-4 py-3 text-right font-medium">₹{inv.total.toFixed(2)}</td>
                    <td className="px-4 py-3 text-center"><PaymentBadge status={inv.status} /></td>
                    <td className="px-4 py-3 text-right text-[var(--text-tertiary)] text-xs">
                      {format(new Date(inv.created_at), 'dd MMM yyyy')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
