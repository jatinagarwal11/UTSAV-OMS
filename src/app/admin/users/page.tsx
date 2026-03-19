'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button, Input, Modal, PageLoader } from '@/components/ui';
import type { Profile, UserRole } from '@/lib/types';

export default function AdminUsers() {
  const supabase = createClient();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  // New user form
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('sales');
  const [password, setPassword] = useState('');
  const [commissionPercent, setCommissionPercent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [updatingCommissionId, setUpdatingCommissionId] = useState<string | null>(null);

  const load = async () => {
    const { data, error: queryError } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (queryError) {
      setLoadError(queryError.message || 'Unable to load users.');
      setUsers([]);
    } else {
      setLoadError('');
      setUsers(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async () => {
    if (!email.trim() || !name.trim() || !password) return;
    setSaving(true);
    setError('');
    setSuccess('');

    const commissionValue = commissionPercent.trim() === '' ? null : Number(commissionPercent);
    if (role === 'sales' && commissionPercent.trim() !== '' && (Number.isNaN(commissionValue) || commissionValue! < 0 || commissionValue! > 100)) {
      setError('Commission must be between 0 and 100.');
      setSaving(false);
      return;
    }

    try {
      const response = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim(),
          password,
          role,
          commissionPercent: role === 'sales' ? commissionValue : null,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload?.error || 'Unable to create user.');
        setSaving(false);
        return;
      }

      setSuccess('User created successfully.');
      setModalOpen(false);
      setEmail('');
      setName('');
      setPassword('');
      setRole('sales');
      setCommissionPercent('');
      await load();
    } catch {
      setError('Unable to create user right now. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const updateUserCommission = async (user: Profile, value: string) => {
    const parsed = value.trim() === '' ? null : Number(value);
    if (value.trim() !== '' && (Number.isNaN(parsed) || parsed! < 0 || parsed! > 100)) {
      return;
    }

    setUpdatingCommissionId(user.id);
    await supabase
      .from('profiles')
      .update({ commission_percent: parsed })
      .eq('id', user.id);
    setUpdatingCommissionId(null);
    load();
  };

  const toggleActive = async (user: Profile) => {
    await supabase.from('profiles').update({ is_active: !user.is_active }).eq('id', user.id);
    load();
  };

  const roleColors: Record<UserRole, string> = {
    admin: 'bg-purple-50 text-purple-700 border-purple-200',
    sales: 'bg-blue-50 text-blue-700 border-blue-200',
    kitchen: 'bg-amber-50 text-amber-700 border-amber-200',
    accounts: 'bg-green-50 text-green-700 border-green-200',
  };

  if (loading) return <PageLoader />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Users</h2>
        <Button size="sm" onClick={() => setModalOpen(true)}>+ User</Button>
      </div>

      {loadError && (
        <div className="mb-4 p-3 border border-[var(--danger)]/30 bg-red-50 rounded-md">
          <p className="text-xs text-[var(--danger)]">{loadError}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 border border-green-200 bg-green-50 rounded-md">
          <p className="text-xs text-[var(--success)]">{success}</p>
        </div>
      )}

      <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--bg)]">
              <th className="text-left px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Name</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Email</th>
              <th className="text-center px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Role</th>
              <th className="text-center px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Commission %</th>
              <th className="text-center px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Active</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-[var(--text-secondary)] uppercase">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-hover)]">
                <td className="px-4 py-2.5 font-medium">{u.name}</td>
                <td className="px-4 py-2.5 text-[var(--text-secondary)]">{u.email}</td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded border ${roleColors[u.role]}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-center">
                  {u.role === 'sales' ? (
                    <div className="inline-flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        defaultValue={u.commission_percent ?? ''}
                        className="w-20 px-2 py-1 text-xs border border-[var(--border)] rounded"
                        onBlur={(e) => updateUserCommission(u, e.target.value)}
                      />
                      <span className="text-xs text-[var(--text-tertiary)]">%</span>
                    </div>
                  ) : (
                    <span className="text-xs text-[var(--text-tertiary)]">N/A</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <span className={`text-xs ${u.is_active ? 'text-[var(--success)]' : 'text-[var(--text-tertiary)]'}`}>
                    {u.is_active ? 'Yes' : 'No'}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Button variant="ghost" size="sm" onClick={() => toggleActive(u)}>
                    {u.is_active ? 'Deactivate' : 'Activate'}
                  </Button>
                  {updatingCommissionId === u.id && (
                    <span className="text-xs text-[var(--text-tertiary)] ml-2">Saving...</span>
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-[var(--text-tertiary)]">No users</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New User">
        <div className="space-y-3">
          <Input label="Full Name" required value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label="Password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 characters" />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full px-3 py-2 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-md"
            >
              <option value="sales">Sales</option>
              <option value="kitchen">Kitchen</option>
              <option value="accounts">Accounts</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {role === 'sales' && (
            <Input
              label="Commission % (optional)"
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={commissionPercent}
              onChange={(e) => setCommissionPercent(e.target.value)}
              placeholder="Uses global default if empty"
            />
          )}
          {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
          <Button onClick={handleCreate} disabled={saving} className="w-full">
            {saving ? 'Creating...' : 'Create User'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
