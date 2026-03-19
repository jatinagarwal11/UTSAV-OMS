import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

interface ReportOrder {
  id: string;
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

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const daysParam = Number(request.nextUrl.searchParams.get('days') || 30);
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 365) : 30;

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - days);
  const sinceIso = sinceDate.toISOString();

  const [ordersRes, invoicesRes, profilesRes, appSettingsRes] = await Promise.all([
    supabase
      .from('orders')
      .select('id, order_number, customer_name, created_at, status, salesperson_id, salesperson:profiles!salesperson_id(name), order_items(price, quantity), invoices(total, status, discount, vat)')
      .gte('created_at', sinceIso),
    supabase
      .from('invoices')
      .select('total, status, discount, vat, created_at')
      .gte('created_at', sinceIso),
    supabase.from('profiles').select('id, name, commission_percent').eq('role', 'sales'),
    supabase.from('app_settings').select('commission_percent').eq('id', 1).maybeSingle(),
  ]);

  if (ordersRes.error || invoicesRes.error || profilesRes.error || appSettingsRes.error) {
    return NextResponse.json(
      {
        error:
          ordersRes.error?.message ||
          invoicesRes.error?.message ||
          profilesRes.error?.message ||
          appSettingsRes.error?.message ||
          'Unable to load reports',
      },
      { status: 500 },
    );
  }

  const inv = invoicesRes.data || [];
  const ords = (ordersRes.data || []) as ReportOrder[];
  const profs = (profilesRes.data || []) as ReportProfile[];
  const defaultCommissionPercent = Number(appSettingsRes.data?.commission_percent ?? 5);

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

  return NextResponse.json({
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
