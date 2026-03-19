'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth-provider';
import { Button, PageLoader } from '@/components/ui';
import { OrderStatusBadge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { QRCodeSVG } from 'qrcode.react';
import type { Order, OrderStatus, Recipe } from '@/lib/types';

const TABS: { label: string; status: OrderStatus }[] = [
  { label: 'Confirmed', status: 'CONFIRMED' },
  { label: 'In Production', status: 'IN_PRODUCTION' },
  { label: 'Ready', status: 'READY' },
];

export default function KitchenDashboard() {
  const { profile } = useAuth();
  const supabase = createClient();
  const [orders, setOrders] = useState<Order[]>([]);
  const [recipes, setRecipes] = useState<Record<string, Recipe>>({});
  const [batchDate, setBatchDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [dailyBatches, setDailyBatches] = useState<{ date: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<OrderStatus>('CONFIRMED');

  const getDayRange = (date: string) => {
    const start = new Date(`${date}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return {
      startIso: start.toISOString(),
      endIso: end.toISOString(),
    };
  };

  const loadOrders = async () => {
    try {
      const { data, error: queryError } = await supabase
        .from('orders')
        .select('*, salesperson:profiles!salesperson_id(name), order_items(*, product:products(*))')
        .in('status', ['CONFIRMED', 'IN_PRODUCTION', 'READY'])
        .order('created_at', { ascending: true });

      if (queryError) {
        setError('Unable to load kitchen orders.');
        setOrders([]);
      } else {
        setError(null);
        setOrders(data || []);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadRecipes = async () => {
    const { data } = await supabase.from('recipes').select('*, product:products(*)');
    const map: Record<string, Recipe> = {};
    data?.forEach((r) => { map[r.product_id] = r; });
    setRecipes(map);
  };

  const loadDailyBatches = async () => {
    const { data, error: batchDaysError } = await supabase
      .from('orders')
      .select('created_at, status')
      .order('created_at', { ascending: false })
      .limit(500);

    if (batchDaysError || !data) {
      setDailyBatches([]);
      return;
    }

    const grouped = data.reduce<Record<string, number>>((acc, row: { created_at: string; status: OrderStatus }) => {
      if (row.status === 'CANCELLED') return acc;
      const dayKey = row.created_at.slice(0, 10);
      acc[dayKey] = (acc[dayKey] || 0) + 1;
      return acc;
    }, {});

    const sorted = Object.entries(grouped)
      .sort(([a], [b]) => (a > b ? -1 : 1))
      .map(([date, count]) => ({ date, count }));

    setDailyBatches(sorted);
  };

  useEffect(() => {
    const init = async () => {
      await Promise.all([loadOrders(), loadRecipes(), loadDailyBatches()]);
    };
    init();

    const channel = supabase
      .channel('kitchen-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, async () => {
        await Promise.all([loadOrders(), loadDailyBatches()]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const updateStatus = async (orderId: string, status: OrderStatus) => {
    await supabase.from('orders').update({ status }).eq('id', orderId);
    await supabase.from('audit_logs').insert({
      user_id: profile?.id,
      action: `ORDER_${status}`,
      details: { order_id: orderId },
    });
    loadOrders();
    loadDailyBatches();
  };

  const printDayBatch = async () => {
    if (!batchDate) return;

    setBatchLoading(true);
    setBatchError(null);

    try {
      const { startIso, endIso } = getDayRange(batchDate);
      const { data, error: queryError } = await supabase
        .from('orders')
        .select('*, salesperson:profiles!salesperson_id(name), order_items(*, product:products(*))')
        .gte('created_at', startIso)
        .lt('created_at', endIso)
        .order('created_at', { ascending: true });

      if (queryError) {
        setBatchError(`Unable to generate batch PDF right now. ${queryError.message}`);
        return;
      }

      const activeOrders = (data || []).filter((row: Order) => row.status !== 'CANCELLED');

      if (activeOrders.length === 0) {
        setBatchError('No orders found for the selected date.');
        return;
      }

      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });

      const pageHeight = doc.internal.pageSize.getHeight();
      let y = 48;
      const productionDate = new Date(`${batchDate}T00:00:00`);
      productionDate.setDate(productionDate.getDate() + 1);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('UTSAV', 40, y);
      y += 14;
      doc.setFontSize(16);
      doc.text('Daily Kitchen Production Batch', 40, y);
      y += 18;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Orders Date: ${format(new Date(`${batchDate}T00:00:00`), 'dd MMM yyyy')}`, 40, y);
      y += 14;
      doc.text(`Production Date: ${format(productionDate, 'dd MMM yyyy')}`, 40, y);
      y += 14;
      doc.text(`Total Orders: ${activeOrders.length}`, 40, y);
      y += 16;

      doc.setDrawColor(210, 210, 210);
      doc.line(40, y, 555, y);
      y += 16;

      const totals = new Map<string, number>();

      activeOrders.forEach((order: Order, orderIndex: number) => {
        if (y > pageHeight - 110) {
          doc.addPage();
          y = 48;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text(`${orderIndex + 1}. #${order.order_number}  ${order.customer_name}`, 40, y);
        y += 14;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(
          `${format(new Date(order.created_at), 'hh:mm a')}  |  ${(order.salesperson as unknown as { name: string })?.name || 'Unknown Sales'}`,
          52,
          y,
        );
        y += 12;

        (order.order_items || []).forEach((item) => {
          const itemName = item.product?.name || 'Item';
          totals.set(itemName, (totals.get(itemName) || 0) + item.quantity);
          doc.text(`- ${itemName}`, 60, y);
          doc.text(`x ${item.quantity}`, 530, y, { align: 'right' });
          y += 12;
        });

        if (order.notes) {
          const noteLines = doc.splitTextToSize(`Notes: ${order.notes}`, 470);
          doc.text(noteLines, 60, y);
          y += noteLines.length * 11;
        }

        y += 8;
        doc.setDrawColor(232, 232, 232);
        doc.line(52, y, 540, y);
        y += 12;
      });

      doc.addPage();
      y = 48;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('Consolidated Item Totals', 40, y);
      y += 18;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      Array.from(totals.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([name, qty]) => {
          if (y > pageHeight - 40) {
            doc.addPage();
            y = 48;
          }
          doc.text(name, 40, y);
          doc.text(String(qty), 530, y, { align: 'right' });
          y += 14;
        });

      doc.save(`kitchen-batch-${batchDate}.pdf`);
    } catch {
      setBatchError('Unexpected error while generating batch PDF.');
    } finally {
      setBatchLoading(false);
    }
  };

  const printOrder = async (order: Order) => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });

    let y = 50;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('UTSAV', 40, y);
    y += 14;
    doc.setFontSize(16);
    doc.text(`Kitchen Order #${order.order_number}`, 40, y);

    y += 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Created: ${format(new Date(order.created_at), 'dd MMM yyyy, hh:mm a')}`, 40, y);
    y += 14;
    doc.text(`Customer: ${order.customer_name}`, 40, y);
    if (order.phone) {
      y += 14;
      doc.text(`Phone: ${order.phone}`, 40, y);
    }
    if (order.address) {
      y += 14;
      doc.text(`Address: ${order.address}`, 40, y);
    }

    y += 18;
    doc.setFont('helvetica', 'bold');
    doc.text('Items', 40, y);
    doc.text('Qty', 500, y, { align: 'right' });

    y += 10;
    doc.setDrawColor(210, 210, 210);
    doc.line(40, y, 540, y);
    y += 14;
    doc.setFont('helvetica', 'normal');

    (order.order_items || []).forEach((item) => {
      doc.text(item.product?.name || 'Item', 40, y);
      doc.text(String(item.quantity), 500, y, { align: 'right' });
      y += 14;
    });

    if (order.notes) {
      y += 10;
      doc.setFont('helvetica', 'bold');
      doc.text('Notes', 40, y);
      y += 14;
      doc.setFont('helvetica', 'normal');
      doc.text(order.notes, 40, y);
    }

    doc.save(`kitchen-order-${order.order_number}.pdf`);
  };

  const printRecipe = async (order: Order) => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });

    let y = 50;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('UTSAV', 40, y);
    y += 14;
    doc.setFontSize(16);
    doc.text(`Recipe Sheet - Order #${order.order_number}`, 40, y);
    y += 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(format(new Date(order.created_at), 'dd MMM yyyy, hh:mm a'), 40, y);

    y += 24;
    (order.order_items || []).forEach((item) => {
      if (y > 760) {
        doc.addPage();
        y = 50;
      }

      const recipe = recipes[item.product_id];
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(`${item.product?.name || 'Item'} x ${item.quantity}`, 40, y);
      y += 14;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      if (!recipe) {
        doc.text('No recipe found', 40, y);
        y += 16;
        return;
      }

      doc.text('Ingredients:', 40, y);
      y += 12;
      const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
      ingredients.forEach((ing: { name: string; quantity: string; unit: string }) => {
        doc.text(`- ${ing.quantity} ${ing.unit} ${ing.name}`, 52, y);
        y += 12;
      });

      if (recipe.steps) {
        doc.text('Steps:', 40, y);
        y += 12;
        const lines = doc.splitTextToSize(recipe.steps, 500);
        doc.text(lines, 52, y);
        y += lines.length * 12;
      }

      y += 14;
      doc.setDrawColor(220, 220, 220);
      doc.line(40, y, 540, y);
      y += 14;
    });

    doc.save(`recipe-order-${order.order_number}.pdf`);
  };

  const filtered = orders.filter((o) => o.status === activeTab);

  if (loading) return <PageLoader />;

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--danger)]">{error}</p>
        <Button variant="secondary" size="sm" onClick={loadOrders}>Retry</Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Kitchen Dashboard</h2>
        <p className="text-xs text-[var(--text-tertiary)]">{orders.length} active orders</p>
      </div>

      <div className="mb-6 p-4 border border-[var(--border)] rounded-lg bg-[var(--bg-card)] space-y-3">
        <div className="flex flex-col md:flex-row md:items-end gap-3 md:justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--text)]">Daily Kitchen Batch PDF</p>
            <p className="text-xs text-[var(--text-tertiary)]">
              Compile all orders of one day into a single chronological production sheet.
            </p>
          </div>
          <div className="flex gap-2">
            <input
              type="date"
              className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2 text-sm"
              value={batchDate}
              onChange={(e) => {
                setBatchDate(e.target.value);
                setBatchError(null);
              }}
            />
            <Button size="sm" onClick={printDayBatch} disabled={batchLoading || !batchDate}>
              {batchLoading ? 'Generating...' : 'Download Day Batch PDF'}
            </Button>
          </div>
        </div>

        {batchError && <p className="text-xs text-[var(--danger)]">{batchError}</p>}

        {dailyBatches.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {dailyBatches.slice(0, 7).map((batch) => (
              <button
                key={batch.date}
                className={`text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
                  batch.date === batchDate
                    ? 'border-[var(--accent)] bg-[var(--bg-hover)] text-[var(--text)]'
                    : 'border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text)] hover:border-[var(--text-secondary)]'
                }`}
                onClick={() => {
                  setBatchDate(batch.date);
                  setBatchError(null);
                }}
              >
                {format(new Date(`${batch.date}T00:00:00`), 'dd MMM')} · {batch.count}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-[var(--border)]">
        {TABS.map((tab) => {
          const count = orders.filter((o) => o.status === tab.status).length;
          return (
            <button
              key={tab.status}
              onClick={() => setActiveTab(tab.status)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-[1px] ${
                activeTab === tab.status
                  ? 'border-[var(--accent)] text-[var(--text)]'
                  : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span className="ml-1.5 text-[10px] bg-[var(--bg-hover)] px-1.5 py-0.5 rounded-full">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Orders */}
      {filtered.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)] text-center py-12">No orders in this status</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((order) => (
            <div key={order.id} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm font-bold text-[var(--text)]">#{order.order_number}</p>
                  <p className="text-[11px] text-[var(--text-tertiary)]">
                    {format(new Date(order.created_at), 'hh:mm a')} · {(order.salesperson as unknown as { name: string })?.name}
                  </p>
                </div>
                <OrderStatusBadge status={order.status} />
              </div>

              {/* Items */}
              <div className="space-y-1 mb-3">
                {order.order_items?.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="text-[var(--text)]">{item.product?.name || 'Item'}</span>
                    <span className="text-[var(--text-secondary)]">× {item.quantity}</span>
                  </div>
                ))}
              </div>

              {order.notes && (
                <p className="text-xs text-[var(--text-secondary)] bg-[var(--bg)] px-3 py-2 rounded mb-3">
                  {order.notes}
                </p>
              )}

              {/* QR */}
              <div className="flex justify-center mb-3">
                <QRCodeSVG value={order.id} size={64} level="M" />
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => printOrder(order)} className="flex-1">
                  Order PDF
                </Button>
                <Button variant="secondary" size="sm" onClick={() => printRecipe(order)} className="flex-1">
                  Recipe PDF
                </Button>
              </div>
              <div className="mt-2">
                {order.status === 'CONFIRMED' && (
                  <Button size="sm" onClick={() => updateStatus(order.id, 'IN_PRODUCTION')} className="w-full">
                    Start Production
                  </Button>
                )}
                {order.status === 'IN_PRODUCTION' && (
                  <Button size="sm" onClick={() => updateStatus(order.id, 'READY')} className="w-full">
                    Mark Ready
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
