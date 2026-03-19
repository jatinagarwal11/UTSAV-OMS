'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button, Input, Textarea, Modal, PageLoader } from '@/components/ui';
import type { Recipe, Product, RecipeIngredient } from '@/lib/types';

export default function AdminRecipes() {
  const supabase = createClient();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Recipe | null>(null);

  // Form
  const [productId, setProductId] = useState('');
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([{ name: '', quantity: '', unit: '' }]);
  const [steps, setSteps] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [{ data: recs }, { data: prods }] = await Promise.all([
      supabase.from('recipes').select('*, product:products(*)').order('created_at', { ascending: false }),
      supabase.from('products').select('*').eq('is_active', true).order('name'),
    ]);
    setRecipes(recs || []);
    setProducts(prods || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openNew = () => {
    setEditing(null);
    setProductId('');
    setIngredients([{ name: '', quantity: '', unit: '' }]);
    setSteps('');
    setNotes('');
    setModalOpen(true);
  };

  const openEdit = (r: Recipe) => {
    setEditing(r);
    setProductId(r.product_id);
    setIngredients(r.ingredients.length > 0 ? r.ingredients : [{ name: '', quantity: '', unit: '' }]);
    setSteps(r.steps);
    setNotes(r.notes || '');
    setModalOpen(true);
  };

  const addIngredient = () => {
    setIngredients([...ingredients, { name: '', quantity: '', unit: '' }]);
  };

  const removeIngredient = (idx: number) => {
    setIngredients(ingredients.filter((_, i) => i !== idx));
  };

  const updateIngredient = (idx: number, field: keyof RecipeIngredient, value: string) => {
    setIngredients(ingredients.map((ing, i) => (i === idx ? { ...ing, [field]: value } : ing)));
  };

  const handleSave = async () => {
    if (!productId) return;
    setSaving(true);

    const validIngredients = ingredients.filter((i) => i.name.trim());

    const payload = {
      product_id: productId,
      ingredients: validIngredients,
      steps: steps.trim(),
      notes: notes.trim() || null,
    };

    if (editing) {
      await supabase.from('recipes').update(payload).eq('id', editing.id);
    } else {
      await supabase.from('recipes').insert(payload);
    }

    setSaving(false);
    setModalOpen(false);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this recipe?')) return;
    await supabase.from('recipes').delete().eq('id', id);
    load();
  };

  if (loading) return <PageLoader />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Recipes</h2>
        <Button size="sm" onClick={openNew}>+ Recipe</Button>
      </div>

      {recipes.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)] text-center py-8">No recipes yet</p>
      ) : (
        <div className="space-y-3">
          {recipes.map((r) => (
            <div key={r.id} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-5">
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-sm font-bold">{r.product?.name || 'Unknown Product'}</h3>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>Edit</Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(r.id)} className="text-[var(--danger)]">Delete</Button>
                </div>
              </div>

              {r.ingredients.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs text-[var(--text-tertiary)] uppercase mb-1">Ingredients</p>
                  <div className="flex flex-wrap gap-1">
                    {r.ingredients.map((ing, i) => (
                      <span key={i} className="text-xs bg-[var(--bg-hover)] px-2 py-0.5 rounded">
                        {ing.quantity} {ing.unit} {ing.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {r.steps && (
                <div>
                  <p className="text-xs text-[var(--text-tertiary)] uppercase mb-1">Steps</p>
                  <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{r.steps}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Recipe' : 'New Recipe'}>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">Product</label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-md"
              disabled={!!editing}
            >
              <option value="">Select product</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">Ingredients</label>
              <Button variant="ghost" size="sm" onClick={addIngredient}>+ Add</Button>
            </div>
            <div className="space-y-2">
              {ingredients.map((ing, idx) => (
                <div key={idx} className="flex gap-2 items-end">
                  <Input
                    placeholder="Ingredient"
                    value={ing.name}
                    onChange={(e) => updateIngredient(idx, 'name', e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    placeholder="Qty"
                    value={ing.quantity}
                    onChange={(e) => updateIngredient(idx, 'quantity', e.target.value)}
                    className="w-20"
                  />
                  <Input
                    placeholder="Unit"
                    value={ing.unit}
                    onChange={(e) => updateIngredient(idx, 'unit', e.target.value)}
                    className="w-20"
                  />
                  {ingredients.length > 1 && (
                    <button onClick={() => removeIngredient(idx)} className="text-[var(--danger)] text-sm px-1">✕</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <Textarea
            label="Steps"
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
            placeholder="Step-by-step instructions..."
          />
          <Textarea
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes..."
          />

          <Button onClick={handleSave} disabled={saving || !productId} className="w-full">
            {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
