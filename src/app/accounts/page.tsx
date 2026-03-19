'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth-provider';
import { Button, Input, PageLoader } from '@/components/ui';
import { OrderStatusBadge, PaymentBadge } from '@/components/ui/badge';
import { format } from 'date-fns';
import type { Order, Invoice, PaymentMethod } from '@/lib/types';

interface AccountsOrderListItem {
  id: string;
  order_number: number;
  customer_name: string;
  status: string;
  created_at: string;
}

export default function AccountsScanBill() {
  const { profile } = useAuth();
  const supabase = createClient();
  const [orderQuery, setOrderQuery] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [allOrders, setAllOrders] = useState<AccountsOrderListItem[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Billing form
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<'fixed' | 'percent'>('fixed');
  const [vatEnabled, setVatEnabled] = useState(false);
  const [vatPercent, setVatPercent] = useState(5);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [saving, setSaving] = useState(false);

  const fetchOrder = useCallback(async (query: string) => {
    setLoading(true);
    setSearchError('');

    const trimmed = query.trim();
    const isOrderNumber = /^\d+$/.test(trimmed);

    let request = supabase
      .from('orders')
      .select('*, salesperson:profiles!salesperson_id(name), order_items(*, product:products(*)), invoices(*, payments(*))');

    if (isOrderNumber) {
      request = request.eq('order_number', Number(trimmed));
    } else {
      request = request.eq('id', trimmed);
    }

    const { data, error } = await request.maybeSingle();

    if (data) {
      setOrder(data);
      if (data.invoices?.length) {
        setInvoice(data.invoices[0]);
      } else {
        setInvoice(null);
      }
    } else {
      if (error) {
        setSearchError(error.message || 'Unable to fetch order');
      } else {
        setSearchError('No order found');
      }
      setOrder(null);
      setInvoice(null);
    }
    setLoading(false);
  }, [supabase]);

  const loadAllOrders = useCallback(async () => {
    setOrdersLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('id, order_number, customer_name, status, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    setAllOrders(data || []);
    setOrdersLoading(false);
  }, [supabase]);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setScanning(false);
  };

  const startScanner = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setScanning(true);
    } catch {
      alert('Camera access denied');
    }
  };

  // Simple QR scanning via BarcodeDetector API (Chrome/Edge)
  useEffect(() => {
    if (!scanning || !videoRef.current) return;
    let active = true;

    const detect = async () => {
      if (!active || !videoRef.current) return;
      try {
        if ('BarcodeDetector' in window) {
          const detector = new (window as unknown as { BarcodeDetector: new (opts: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector({ formats: ['qr_code'] });
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes.length > 0) {
            const val = barcodes[0].rawValue;
            setOrderQuery(val);
            fetchOrder(val);
            stopCamera();
            return;
          }
        }
      } catch { /* ignore */ }
      if (active) requestAnimationFrame(detect);
    };

    requestAnimationFrame(detect);
    return () => { active = false; };
  }, [scanning, fetchOrder]);

  useEffect(() => {
    loadAllOrders();

    const channel = supabase
      .channel('accounts-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadAllOrders())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadAllOrders, supabase]);

  const handleManualSearch = () => {
    if (orderQuery.trim()) fetchOrder(orderQuery.trim());
  };

  const subtotal = order?.order_items?.reduce((s, i) => s + i.price * i.quantity, 0) || 0;
  const discountAmount = discountType === 'percent' ? subtotal * (discount / 100) : discount;
  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const vatAmount = vatEnabled ? afterDiscount * (vatPercent / 100) : 0;
  const finalTotal = afterDiscount + vatAmount;

  const generateInvoice = async () => {
    if (!order || order.status !== 'READY' || invoice) return;
    setSaving(true);

    const { data: inv } = await supabase
      .from('invoices')
      .insert({
        order_id: order.id,
        subtotal,
        discount: discountAmount,
        vat: vatAmount,
        total: finalTotal,
        status: 'unpaid',
      })
      .select()
      .single();

    if (inv) {
      setInvoice(inv);
      await supabase.from('orders').update({ status: 'BILLED' }).eq('id', order.id);
      await supabase.from('audit_logs').insert({
        user_id: profile?.id,
        action: 'INVOICE_CREATED',
        details: { order_id: order.id, invoice_id: inv.id, total: finalTotal },
      });
      setOrder({ ...order, status: 'BILLED' });
    }
    setSaving(false);
  };

  const markPaid = async () => {
    if (!invoice || !order) return;
    setSaving(true);

    await supabase.from('payments').insert({
      invoice_id: invoice.id,
      amount_paid: invoice.total,
      payment_method: paymentMethod,
      status: 'paid',
    });

    await supabase.from('invoices').update({ status: 'paid' }).eq('id', invoice.id);
    await supabase.from('orders').update({ status: 'PAID' }).eq('id', order.id);
    await supabase.from('audit_logs').insert({
      user_id: profile?.id,
      action: 'PAYMENT_RECEIVED',
      details: { order_id: order.id, invoice_id: invoice.id, method: paymentMethod },
    });

    setInvoice({ ...invoice, status: 'paid' });
    setOrder({ ...order, status: 'PAID' });
    setSaving(false);
  };

  const cancelOrder = async () => {
    if (!order || saving || order.status === 'PAID' || order.status === 'CANCELLED') return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: 'CANCELLED' })
        .eq('id', order.id);

      if (!error) {
        await supabase.from('audit_logs').insert({
          user_id: profile?.id,
          action: 'ORDER_CANCELLED',
          details: { order_id: order.id, role: 'accounts' },
        });

        const updatedOrder = { ...order, status: 'CANCELLED' as Order['status'] };
        setOrder(updatedOrder);
        setAllOrders((prev) => prev.map((o) => (
          o.id === order.id ? { ...o, status: 'CANCELLED' } : o
        )));
      }
    } finally {
      setSaving(false);
    }
  };

  const printInvoice = async () => {
    if (!order || !invoice) return;

    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });

    const line = (y: number) => {
      doc.setDrawColor(220, 220, 220);
      doc.line(40, y, 555, y);
    };

    let y = 48;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('UTSAV', 40, y);
    doc.setFontSize(12);
    doc.text('Tax Invoice', 440, y, { align: 'right' });

    y += 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Invoice ID: ${invoice.id}`, 40, y);
    doc.text(`Date: ${format(new Date(invoice.created_at), 'dd MMM yyyy, hh:mm a')}`, 440, y, { align: 'right' });

    y += 18;
    doc.text(`Order No: ${order.order_number}`, 40, y);
    doc.text(`Order Status: ${order.status}`, 440, y, { align: 'right' });

    y += 16;
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
    line(y);
    y += 16;

    doc.setFont('helvetica', 'bold');
    doc.text('Item', 40, y);
    doc.text('Qty', 330, y, { align: 'right' });
    doc.text('Rate', 420, y, { align: 'right' });
    doc.text('Amount', 540, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');

    y += 10;
    line(y);
    y += 16;

    (order.order_items || []).forEach((item) => {
      const amount = item.price * item.quantity;
      doc.text(item.product?.name || 'Item', 40, y);
      doc.text(String(item.quantity), 330, y, { align: 'right' });
      doc.text(`INR ${Number(item.price).toFixed(2)}`, 420, y, { align: 'right' });
      doc.text(`INR ${amount.toFixed(2)}`, 540, y, { align: 'right' });
      y += 16;
    });

    y += 4;
    line(y);
    y += 18;

    const totalsX = 540;
    doc.text(`Subtotal: INR ${invoice.subtotal.toFixed(2)}`, totalsX, y, { align: 'right' });
    y += 14;
    if (invoice.discount > 0) {
      doc.text(`Discount: -INR ${invoice.discount.toFixed(2)}`, totalsX, y, { align: 'right' });
      y += 14;
    }
    if (invoice.vat > 0) {
      doc.text(`VAT: INR ${invoice.vat.toFixed(2)}`, totalsX, y, { align: 'right' });
      y += 14;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(`Total: INR ${invoice.total.toFixed(2)}`, totalsX, y, { align: 'right' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');

    y += 24;
    doc.text(`Payment Status: ${invoice.status.toUpperCase()}`, 40, y);
    y += 26;
    doc.setTextColor(120, 120, 120);
    doc.text('System generated invoice.', 40, y);

    doc.save(`invoice-${order.order_number}.pdf`);
  };

  const canGenerateInvoice = !!order && !invoice && order.status === 'READY';
  const canCancelOrder = !!order && order.status !== 'PAID' && order.status !== 'CANCELLED';

  return (
    <div>
      <h2 className="text-lg font-semibold mb-6">Scan & Bill</h2>

      {/* Scanner + Search */}
      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-5 mb-6">
        <div className="flex gap-3 mb-4">
          <Input
            placeholder="Enter Order ID or Order Number..."
            value={orderQuery}
            onChange={(e) => setOrderQuery(e.target.value)}
            className="flex-1"
          />
          <Button onClick={handleManualSearch} variant="secondary">
            Search
          </Button>
          <Button onClick={scanning ? stopCamera : startScanner}>
            {scanning ? 'Stop' : 'Scan QR'}
          </Button>
        </div>

        {scanning && (
          <div className="relative rounded-md overflow-hidden bg-black aspect-video max-w-sm mx-auto">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            <div className="absolute inset-0 border-2 border-dashed border-white/30 m-8 rounded" />
          </div>
        )}
      </div>

      {searchError && (
        <p className="text-xs text-[var(--danger)] mb-4">{searchError}</p>
      )}

      {loading && <PageLoader />}

      {/* Order details */}
      {order && !loading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Order info */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold">Order #{order.order_number}</h3>
                <p className="text-xs text-[var(--text-tertiary)]">
                  {format(new Date(order.created_at), 'dd MMM yyyy, hh:mm a')}
                </p>
              </div>
              <OrderStatusBadge status={order.status} />
            </div>

            <div className="mb-4">
              <p className="text-sm font-medium">{order.customer_name}</p>
              {order.phone && <p className="text-xs text-[var(--text-tertiary)]">{order.phone}</p>}
              {order.address && <p className="text-xs text-[var(--text-tertiary)]">{order.address}</p>}
            </div>

            <div className="space-y-1 mb-3">
              {order.order_items?.map((item) => (
                <div key={item.id} className="flex justify-between text-sm py-1 border-b border-[var(--border)] last:border-0">
                  <span>{item.product?.name || 'Item'} × {item.quantity}</span>
                  <span className="font-medium">₹{(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <p className="text-sm font-bold text-right">Subtotal: ₹{subtotal.toFixed(2)}</p>

            {canCancelOrder && (
              <div className="mt-3">
                <Button variant="secondary" size="sm" onClick={cancelOrder} disabled={saving}>
                  {saving ? 'Updating...' : 'Cancel Order'}
                </Button>
              </div>
            )}
          </div>

          {/* Billing */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-5">
            {!invoice ? (
              <>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-4">Generate Invoice</h3>

                {order.status !== 'READY' && (
                  <p className="text-xs text-[var(--danger)] mb-3">
                    Invoice can be generated only after kitchen marks this order as READY.
                  </p>
                )}

                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      label="Discount"
                      type="number"
                      min={0}
                      value={discount}
                      onChange={(e) => setDiscount(Number(e.target.value))}
                      className="flex-1"
                    />
                    <div className="flex flex-col gap-1 justify-end">
                      <div className="flex gap-1">
                        <button
                          onClick={() => setDiscountType('fixed')}
                          className={`px-2 py-2 text-xs rounded border ${discountType === 'fixed' ? 'bg-[var(--accent)] text-[var(--accent-text)]' : 'border-[var(--border)]'}`}
                        >
                          ₹
                        </button>
                        <button
                          onClick={() => setDiscountType('percent')}
                          className={`px-2 py-2 text-xs rounded border ${discountType === 'percent' ? 'bg-[var(--accent)] text-[var(--accent-text)]' : 'border-[var(--border)]'}`}
                        >
                          %
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={vatEnabled}
                        onChange={(e) => setVatEnabled(e.target.checked)}
                        className="w-4 h-4"
                      />
                      VAT
                    </label>
                    {vatEnabled && (
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={vatPercent}
                        onChange={(e) => setVatPercent(Number(e.target.value))}
                        className="w-20"
                      />
                    )}
                  </div>

                  {/* Summary */}
                  <div className="bg-[var(--bg)] rounded-md p-3 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--text-secondary)]">Subtotal</span>
                      <span>₹{subtotal.toFixed(2)}</span>
                    </div>
                    {discountAmount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--text-secondary)]">Discount</span>
                        <span className="text-[var(--danger)]">-₹{discountAmount.toFixed(2)}</span>
                      </div>
                    )}
                    {vatAmount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--text-secondary)]">VAT ({vatPercent}%)</span>
                        <span>₹{vatAmount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm font-bold pt-2 border-t border-[var(--border)]">
                      <span>Total</span>
                      <span>₹{finalTotal.toFixed(2)}</span>
                    </div>
                  </div>

                  <Button onClick={generateInvoice} disabled={saving || !canGenerateInvoice} className="w-full">
                    {saving ? 'Generating...' : 'Generate Invoice'}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-4">
                  Invoice
                  <PaymentBadge status={invoice.status} />
                </h3>

                <div className="bg-[var(--bg)] rounded-md p-3 space-y-1 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--text-secondary)]">Subtotal</span>
                    <span>₹{invoice.subtotal.toFixed(2)}</span>
                  </div>
                  {invoice.discount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--text-secondary)]">Discount</span>
                      <span className="text-[var(--danger)]">-₹{invoice.discount.toFixed(2)}</span>
                    </div>
                  )}
                  {invoice.vat > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--text-secondary)]">VAT</span>
                      <span>₹{invoice.vat.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-bold pt-2 border-t border-[var(--border)]">
                    <span>Total</span>
                    <span>₹{invoice.total.toFixed(2)}</span>
                  </div>
                </div>

                {invoice.status !== 'paid' && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-1 block">
                        Payment Method
                      </label>
                      <div className="flex gap-1 flex-wrap">
                        {(['cash', 'upi', 'card', 'bank_transfer'] as PaymentMethod[]).map((m) => (
                          <button
                            key={m}
                            onClick={() => setPaymentMethod(m)}
                            className={`px-3 py-1.5 text-xs rounded border transition-colors ${
                              paymentMethod === m
                                ? 'bg-[var(--accent)] text-[var(--accent-text)] border-[var(--accent)]'
                                : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                            }`}
                          >
                            {m.replace('_', ' ').toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>

                    <Button onClick={markPaid} disabled={saving} className="w-full">
                      {saving ? 'Processing...' : 'Mark as Paid'}
                    </Button>
                  </div>
                )}

                <Button variant="secondary" onClick={printInvoice} className="w-full mt-2">
                  Download PDF Invoice
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {!order && !loading && orderQuery && (
        <p className="text-sm text-[var(--text-tertiary)] text-center py-8">No order found</p>
      )}

      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">All Orders</h3>
          <Button size="sm" variant="secondary" onClick={loadAllOrders}>
            Refresh
          </Button>
        </div>

        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden">
          {ordersLoading ? (
            <div className="py-8"><PageLoader /></div>
          ) : (
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
                {allOrders.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => {
                      setOrderQuery(String(o.order_number));
                      fetchOrder(String(o.order_number));
                    }}
                    className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-hover)] cursor-pointer"
                  >
                    <td className="px-4 py-2.5 font-medium">{o.order_number}</td>
                    <td className="px-4 py-2.5">{o.customer_name}</td>
                    <td className="px-4 py-2.5"><OrderStatusBadge status={o.status as Order['status']} /></td>
                    <td className="px-4 py-2.5 text-right text-xs text-[var(--text-tertiary)]">
                      {format(new Date(o.created_at), 'dd MMM, hh:mm a')}
                    </td>
                  </tr>
                ))}
                {allOrders.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-[var(--text-tertiary)]">No orders found</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
