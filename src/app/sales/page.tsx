'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth-provider';
import { useRouter } from 'next/navigation';
import { Button, Input, Textarea } from '@/components/ui';
import { PageLoader } from '@/components/ui/spinner';
import type { Product, Category } from '@/lib/types';

interface CartItem {
  product_id: string;
  name: string;
  price: number;
  quantity: number;
}

export default function SalesNewOrder() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [{ data: prods }, { data: cats }] = await Promise.all([
          supabase.from('products').select('*, category:categories(*)').eq('is_active', true).order('name'),
          supabase.from('categories').select('*').order('name'),
        ]);
        setProducts(prods || []);
        setCategories(cats || []);
      } catch {
        // Tables may not exist yet
      } finally {
        setDataLoading(false);
      }
    };
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product_id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { product_id: product.id, name: product.name, price: product.price, quantity: 1 }];
    });
  };

  const updateQuantity = (productId: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((i) => i.product_id !== productId));
    } else {
      setCart((prev) =>
        prev.map((i) => (i.product_id === productId ? { ...i, quantity: qty } : i))
      );
    }
  };

  const total = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const filteredProducts = products.filter((p) => {
    const matchCat = selectedCategory === 'all' || p.category_id === selectedCategory;
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const handleSubmit = async () => {
    if (!profile || !customerName.trim() || cart.length === 0) return;
    setSaving(true);

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        salesperson_id: profile.id,
        customer_name: customerName.trim(),
        phone: phone.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
        status: 'CONFIRMED',
      })
      .select()
      .single();

    if (orderError || !order) {
      setSaving(false);
      return;
    }

    const items = cart.map((i) => ({
      order_id: order.id,
      product_id: i.product_id,
      quantity: i.quantity,
      price: i.price,
    }));

    await supabase.from('order_items').insert(items);

    // Audit
    await supabase.from('audit_logs').insert({
      user_id: profile.id,
      action: 'ORDER_CREATED',
      details: { order_id: order.id, total },
    });

    router.push('/sales/orders');
  };

  if (dataLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-5 w-32 bg-[var(--border)] rounded mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-5 h-64" />
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-5 h-48" />
        </div>
      </div>
    );
  }

  if (authLoading) return <PageLoader />;

  if (!profile) {
    return <p className="text-sm text-[var(--text-tertiary)]">Your user profile is missing. Contact admin.</p>;
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-6">New Order</h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Product selection */}
        <div className="lg:col-span-2">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-5">
            <div className="flex gap-3 mb-4">
              <Input
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1"
              />
            </div>

            {/* Category tabs */}
            <div className="flex gap-2 mb-4 flex-wrap">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  selectedCategory === 'all'
                    ? 'bg-[var(--accent)] text-[var(--accent-text)] border-[var(--accent)]'
                    : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                    selectedCategory === cat.id
                      ? 'bg-[var(--accent)] text-[var(--accent-text)] border-[var(--accent)]'
                      : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Product grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {filteredProducts.map((p) => {
                const inCart = cart.find((i) => i.product_id === p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    className={`p-3 text-left rounded-md border transition-colors ${
                      inCart
                        ? 'border-[var(--accent)] bg-[var(--bg-active)]'
                        : 'border-[var(--border)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    <p className="text-sm font-medium text-[var(--text)] truncate">{p.name}</p>
                    <p className="text-xs text-[var(--text-tertiary)] mt-0.5">₹{p.price}</p>
                    {inCart && (
                      <p className="text-[10px] text-[var(--accent)] mt-1">× {inCart.quantity}</p>
                    )}
                  </button>
                );
              })}
              {filteredProducts.length === 0 && (
                <p className="col-span-3 text-sm text-[var(--text-tertiary)] py-8 text-center">No products found</p>
              )}
            </div>
          </div>
        </div>

        {/* Right: Cart + Customer */}
        <div className="space-y-4">
          {/* Customer info */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-5 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Customer</h3>
            <Input
              label="Name"
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Customer name"
            />
            <Input
              label="Phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone number"
            />
            <Input
              label="Address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Delivery address"
            />
            <Textarea
              label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Special instructions..."
            />
          </div>

          {/* Cart */}
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)] mb-3">Order Items</h3>

            {cart.length === 0 ? (
              <p className="text-sm text-[var(--text-tertiary)] text-center py-4">No items added</p>
            ) : (
              <div className="space-y-2">
                {cart.map((item) => (
                  <div key={item.product_id} className="flex items-center justify-between py-1.5 border-b border-[var(--border)] last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[var(--text)] truncate">{item.name}</p>
                      <p className="text-xs text-[var(--text-tertiary)]">₹{item.price} each</p>
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      <button
                        onClick={() => updateQuantity(item.product_id, item.quantity - 1)}
                        className="w-6 h-6 flex items-center justify-center rounded border border-[var(--border)] text-xs hover:bg-[var(--bg-hover)]"
                      >
                        −
                      </button>
                      <span className="text-sm w-6 text-center">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.product_id, item.quantity + 1)}
                        className="w-6 h-6 flex items-center justify-center rounded border border-[var(--border)] text-xs hover:bg-[var(--bg-hover)]"
                      >
                        +
                      </button>
                    </div>
                    <p className="text-sm font-medium text-[var(--text)] ml-3 w-16 text-right">
                      ₹{(item.price * item.quantity).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {cart.length > 0 && (
              <div className="mt-4 pt-3 border-t border-[var(--border)]">
                <div className="flex justify-between">
                  <span className="text-sm font-semibold text-[var(--text)]">Total</span>
                  <span className="text-sm font-bold text-[var(--text)]">₹{total.toFixed(2)}</span>
                </div>
              </div>
            )}

            <Button
              onClick={handleSubmit}
              disabled={saving || !customerName.trim() || cart.length === 0}
              className="w-full mt-4"
            >
              {saving ? 'Creating...' : 'Create Order'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
