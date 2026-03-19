'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button, Input, Modal, PageLoader } from '@/components/ui';
import type { Product, Category } from '@/lib/types';

export default function AdminProducts() {
  const supabase = createClient();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  // Category form
  const [catName, setCatName] = useState('');

  const load = async () => {
    const [{ data: prods }, { data: cats }] = await Promise.all([
      supabase.from('products').select('*, category:categories(*)').order('name'),
      supabase.from('categories').select('*').order('name'),
    ]);
    setProducts(prods || []);
    setCategories(cats || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openNew = () => {
    setEditing(null);
    setName('');
    setPrice('');
    setCategoryId('');
    setIsActive(true);
    setModalOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setName(p.name);
    setPrice(String(p.price));
    setCategoryId(p.category_id || '');
    setIsActive(p.is_active);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);

    const payload = {
      name: name.trim(),
      price: parseFloat(price) || 0,
      category_id: categoryId || null,
      is_active: isActive,
    };

    if (editing) {
      await supabase.from('products').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('products').insert(payload);
    }

    setSaving(false);
    setModalOpen(false);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this product?')) return;
    await supabase.from('products').delete().eq('id', id);
    load();
  };

  const handleAddCategory = async () => {
    if (!catName.trim()) return;
    await supabase.from('categories').insert({ name: catName.trim() });
    setCatName('');
    setCatModalOpen(false);
    load();
  };

  if (loading) return <PageLoader />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Products</h2>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setCatModalOpen(true)}>
            + Category
          </Button>
          <Button size="sm" onClick={openNew}>
            + Product
          </Button>
        </div>
      </div>

      {/* Categories pills */}
      {categories.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-4">
          {categories.map((cat) => (
            <span key={cat.id} className="text-xs bg-[var(--bg-hover)] px-2 py-1 rounded border border-[var(--border)]">
              {cat.name}
            </span>
          ))}
        </div>
      )}

      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--bg)]">
              <th className="text-left px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Name</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Category</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Price</th>
              <th className="text-center px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Active</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-hover)]">
                <td className="px-4 py-2.5 font-medium">{p.name}</td>
                <td className="px-4 py-2.5 text-[var(--text-secondary)]">{p.category?.name || '—'}</td>
                <td className="px-4 py-2.5 text-right">₹{p.price}</td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`text-xs ${p.is_active ? 'text-[var(--success)]' : 'text-[var(--text-tertiary)]'}`}>
                    {p.is_active ? 'Yes' : 'No'}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex gap-1 justify-end">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>Edit</Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(p.id)} className="text-[var(--danger)]">Delete</Button>
                  </div>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-[var(--text-tertiary)]">No products yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Product Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Product' : 'New Product'}>
        <div className="space-y-3">
          <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Price (₹)" type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-md"
            >
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-4 h-4" />
            Active
          </label>
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
          </Button>
        </div>
      </Modal>

      {/* Category Modal */}
      <Modal open={catModalOpen} onClose={() => setCatModalOpen(false)} title="New Category">
        <div className="space-y-3">
          <Input label="Category Name" value={catName} onChange={(e) => setCatName(e.target.value)} />
          <Button onClick={handleAddCategory} className="w-full">Create</Button>
        </div>
      </Modal>
    </div>
  );
}
