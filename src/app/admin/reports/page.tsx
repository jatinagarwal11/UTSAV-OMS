'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button, PageLoader } from '@/components/ui';
import { format } from 'date-fns';

interface SalesReport {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  paidTotal: number;
  unpaidTotal: number;
  discountsGiven: number;
  vatCollected: number;
  ordersByDate: { date: string; count: number; revenue: number }[];
  ordersBySalesperson: { name: string; count: number; revenue: number }[];
  salespersonPerformance: {
    id: string;
    name: string;
    commissionPercent: number;
    ordersCount: number;
    cancelledOrders: number;
    invoicedOrders: number;
    uninvoicedOrders: number;
    grossSales: number;
    paidSales: number;
    unpaidSales: number;
    partialSales: number;
    estimatedCommission: number;
    potentialCommission: number;
  }[];
  exportData: Record<string, unknown>[];
}

interface ReportOrder {
  order_number: number;
  customer_name: string;
  created_at: string;
  status: string;
  salesperson_id: string;
  salesperson?: { name: string } | { name: string }[] | null;
  order_items?: { price: number; quantity: number }[];
  invoices?: { total: number; status: string; discount: number; vat: number }[];
}

interface ReportProfile {
  id: string;
  name: string;
  commission_percent: number | null;
}

const getSalespersonName = (salesperson?: { name: string } | { name: string }[] | null) => {
  if (!salesperson) return 'Unknown';
  if (Array.isArray(salesperson)) {
    return salesperson[0]?.name || 'Unknown';
  }
  return salesperson.name || 'Unknown';
};

export default function AdminReports() {
  const supabase = createClient();
  const [report, setReport] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [days, setDays] = useState(30);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');

      try {
        const sinceDate = new Date();
        sinceDate.setDate(sinceDate.getDate() - days);
        const sinceIso = sinceDate.toISOString();

        const [{ data: invoices, error: invoicesError }, { data: orders, error: ordersError }, { data: profiles, error: profilesError }, { data: appSettings, error: appSettingsError }] = await Promise.all([
          supabase.from('invoices').select('total, status, discount, vat, created_at').gte('created_at', sinceIso),
          supabase
            .from('orders')
            .select('order_number, customer_name, created_at, status, salesperson_id, salesperson:profiles!salesperson_id(name), order_items(price, quantity), invoices(total, status, discount, vat)')
            .gte('created_at', sinceIso),
          supabase.from('profiles').select('id, name, commission_percent').eq('role', 'sales'),
          supabase.from('app_settings').select('commission_percent').eq('id', 1).maybeSingle(),
        ]);

        if (invoicesError || ordersError || profilesError || appSettingsError) {
          setError(
            invoicesError?.message
              || ordersError?.message
              || profilesError?.message
              || appSettingsError?.message
              || 'Unable to load reports.',
          );
          setReport(null);
        } else {
          const inv = invoices || [];
          const ords = (orders || []) as ReportOrder[];
          const profs = (profiles || []) as ReportProfile[];
          const defaultCommissionPercent = Number(appSettings?.commission_percent ?? 5);

          const paidInvoices = inv.filter((i) => i.status === 'paid');
          const unpaidInvoices = inv.filter((i) => i.status !== 'paid');

          const dateMap = new Map<string, { count: number; revenue: number }>();
          ords.forEach((o) => {
            const d = o.created_at.slice(0, 10);
            const existing = dateMap.get(d) || { count: 0, revenue: 0 };
            const orderTotal = o.order_items?.reduce((s, i) => s + Number(i.price) * Number(i.quantity), 0) || 0;
            dateMap.set(d, { count: existing.count + 1, revenue: existing.revenue + orderTotal });
          });

          const spMap = new Map<string, { name: string; count: number; revenue: number }>();
          ords.forEach((o) => {
            const spName = getSalespersonName(o.salesperson);
            const existing = spMap.get(spName) || { name: spName, count: 0, revenue: 0 };
            const orderTotal = o.order_items?.reduce((s, i) => s + Number(i.price) * Number(i.quantity), 0) || 0;
            spMap.set(spName, { name: spName, count: existing.count + 1, revenue: existing.revenue + orderTotal });
          });

          const performanceMap = new Map<string, {
            id: string;
            name: string;
            commissionPercent: number;
            ordersCount: number;
            cancelledOrders: number;
            invoicedOrders: number;
            uninvoicedOrders: number;
            grossSales: number;
            paidSales: number;
            unpaidSales: number;
            partialSales: number;
          }>();

          profs.forEach((p) => {
            performanceMap.set(p.id, {
              id: p.id,
              name: p.name,
              commissionPercent: Number(p.commission_percent ?? defaultCommissionPercent),
              ordersCount: 0,
              cancelledOrders: 0,
              invoicedOrders: 0,
              uninvoicedOrders: 0,
              grossSales: 0,
              paidSales: 0,
              unpaidSales: 0,
              partialSales: 0,
            });
          });

          ords.forEach((o) => {
            const salespersonId = o.salesperson_id || 'unknown';
            const salespersonName = getSalespersonName(o.salesperson);

            if (!performanceMap.has(salespersonId)) {
              performanceMap.set(salespersonId, {
                id: salespersonId,
                name: salespersonName,
                commissionPercent: defaultCommissionPercent,
                ordersCount: 0,
                cancelledOrders: 0,
                invoicedOrders: 0,
                uninvoicedOrders: 0,
                grossSales: 0,
                paidSales: 0,
                unpaidSales: 0,
                partialSales: 0,
              });
            }

            const bucket = performanceMap.get(salespersonId);
            if (!bucket) return;

            bucket.ordersCount += 1;
            if (o.status === 'CANCELLED') {
              bucket.cancelledOrders += 1;
              return;
            }

            const itemTotal = o.order_items?.reduce((s, i) => s + Number(i.price) * Number(i.quantity), 0) || 0;
            const invoice = o.invoices?.[0];
            const saleValue = Number(invoice?.total ?? itemTotal);

            bucket.grossSales += saleValue;

            if (!invoice) {
              bucket.uninvoicedOrders += 1;
              return;
            }

            bucket.invoicedOrders += 1;
            if (invoice.status === 'paid') {
              bucket.paidSales += saleValue;
            } else if (invoice.status === 'partial') {
              bucket.partialSales += saleValue;
            } else {
              bucket.unpaidSales += saleValue;
            }
          });

          const salespersonPerformance = Array.from(performanceMap.values())
            .map((p) => {
              const estimatedCommission = (p.paidSales * p.commissionPercent) / 100;
              const potentialCommission = ((p.paidSales + p.partialSales + p.unpaidSales) * p.commissionPercent) / 100;
              return {
                ...p,
                estimatedCommission,
                potentialCommission,
              };
            })
            .sort((a, b) => b.grossSales - a.grossSales);

          const exportData = ords.map((o) => {
            const invoice = o.invoices?.[0];
            const total = o.order_items?.reduce((s, i) => s + Number(i.price) * Number(i.quantity), 0) || 0;
            return {
              'Order #': o.order_number,
              Customer: o.customer_name,
              Salesperson: getSalespersonName(o.salesperson),
              'Items Total': total,
              Discount: invoice?.discount || 0,
              VAT: invoice?.vat || 0,
              'Final Amount': invoice?.total || total,
              'Payment Status': invoice?.status || 'no invoice',
              Status: o.status,
              Date: o.created_at,
            };
          });

          setReport({
            totalRevenue: paidInvoices.reduce((s, i) => s + Number(i.total), 0),
            totalOrders: ords.length,
            avgOrderValue:
              ords.length > 0 ? paidInvoices.reduce((s, i) => s + Number(i.total), 0) / Math.max(paidInvoices.length, 1) : 0,
            paidTotal: paidInvoices.reduce((s, i) => s + Number(i.total), 0),
            unpaidTotal: unpaidInvoices.reduce((s, i) => s + Number(i.total), 0),
            discountsGiven: inv.reduce((s, i) => s + Number(i.discount), 0),
            vatCollected: inv.reduce((s, i) => s + Number(i.vat), 0),
            ordersByDate: Array.from(dateMap.entries())
              .map(([date, d]) => ({ date, ...d }))
              .sort((a, b) => b.date.localeCompare(a.date)),
            ordersBySalesperson: Array.from(spMap.values()).sort((a, b) => b.revenue - a.revenue),
            salespersonPerformance,
            exportData,
          });
        }
      } catch {
        setError('Unable to load reports right now.');
        setReport(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [days, supabase]);

  const exportCSV = () => {
    const exportData = report?.exportData || [];
    if (exportData.length === 0) return;
    const headers = Object.keys(exportData[0]);
    const rows = exportData.map((row) =>
      headers.map((h) => {
        const val = String(row[h] ?? '');
        return val.includes(',') ? `"${val}"` : val;
      }).join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders-report-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <PageLoader />;
  if (!report) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--danger)]">{error || 'Unable to load reports.'}</p>
        <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  const summaryCards = [
    { label: 'Total Revenue', value: `₹${report.totalRevenue.toLocaleString()}` },
    { label: 'Total Orders', value: report.totalOrders },
    { label: 'Avg Order', value: `₹${report.avgOrderValue.toFixed(0)}` },
    { label: 'Paid', value: `₹${report.paidTotal.toLocaleString()}` },
    { label: 'Unpaid', value: `₹${report.unpaidTotal.toLocaleString()}` },
    { label: 'Discounts', value: `₹${report.discountsGiven.toLocaleString()}` },
    { label: 'VAT Collected', value: `₹${report.vatCollected.toLocaleString()}` },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Reports</h2>
        <div className="flex items-center gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-2.5 py-1 text-xs rounded border ${
                days === d
                  ? 'bg-[var(--accent)] text-[var(--accent-text)] border-[var(--accent)]'
                  : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              {d}d
            </button>
          ))}
          <Button variant="secondary" size="sm" onClick={exportCSV}>
            Export CSV
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-8">
        {summaryCards.map((c) => (
          <div key={c.label} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-3">
            <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide">{c.label}</p>
            <p className="text-lg font-bold text-[var(--text)] mt-0.5">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Orders by date */}
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-3">Orders by Date</h3>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {report.ordersByDate.map((d) => (
              <div key={d.date} className="flex justify-between text-sm py-1.5 border-b border-[var(--border)] last:border-0">
                <span className="text-[var(--text-secondary)]">{d.date}</span>
                <div className="flex gap-4">
                  <span className="text-[var(--text-tertiary)]">{d.count} orders</span>
                  <span className="font-medium">₹{d.revenue.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Orders by salesperson */}
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-5">
          <h3 className="text-sm font-semibold mb-3">Sales by Salesperson</h3>
          <div className="space-y-1">
            {report.ordersBySalesperson.map((sp) => (
              <div key={sp.name} className="flex justify-between text-sm py-1.5 border-b border-[var(--border)] last:border-0">
                <span className="font-medium">{sp.name}</span>
                <div className="flex gap-4">
                  <span className="text-[var(--text-tertiary)]">{sp.count} orders</span>
                  <span className="font-medium">₹{sp.revenue.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <h3 className="text-sm font-semibold">Salesperson Commission and Payment Split</h3>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            Estimated commission is calculated on paid sales only. Potential commission includes paid + partial + unpaid billed sales.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1200px]">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg)]">
                <th className="text-left px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Salesperson</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Commission %</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Orders</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Cancelled</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Uninvoiced</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Gross Sales</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Paid Split</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Partial Split</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Unpaid Split</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Estimated Comm.</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Potential Comm.</th>
              </tr>
            </thead>
            <tbody>
              {report.salespersonPerformance.map((sp) => (
                <tr key={sp.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-hover)]">
                  <td className="px-4 py-2.5 font-medium">{sp.name}</td>
                  <td className="px-4 py-2.5 text-right">{sp.commissionPercent.toFixed(2)}%</td>
                  <td className="px-4 py-2.5 text-right">{sp.ordersCount}</td>
                  <td className="px-4 py-2.5 text-right">{sp.cancelledOrders}</td>
                  <td className="px-4 py-2.5 text-right">{sp.uninvoicedOrders}</td>
                  <td className="px-4 py-2.5 text-right font-medium">₹{sp.grossSales.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right">₹{sp.paidSales.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right">₹{sp.partialSales.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right">₹{sp.unpaidSales.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right font-semibold">₹{sp.estimatedCommission.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2.5 text-right text-[var(--text-secondary)]">₹{sp.potentialCommission.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                </tr>
              ))}
              {report.salespersonPerformance.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-[var(--text-tertiary)]">No salesperson data available</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
