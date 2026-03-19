'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import BrandLogo from '@/components/brand-logo';
import Button from '@/components/ui/button';
import Input from '@/components/ui/input';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setError(error.message);
        return;
      }

      // Fetch role to redirect
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Login succeeded but user session was not found. Please try again.');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (!profile?.role) {
        await fetch('/api/auth/signout', { method: 'POST' }).catch(() => undefined);
        setError('Your account is missing a role profile. Please ask admin to create your profile row.');
        return;
      }

      const roleHome: Record<string, string> = {
        admin: '/admin',
        sales: '/sales',
        kitchen: '/kitchen',
        accounts: '/accounts',
      };
      // Hard navigate so middleware picks up fresh cookies
      window.location.href = roleHome[profile.role] || '/sales';
    } catch {
      setError('Unable to sign in right now. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <div className="w-full max-w-sm">
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg p-8">
          <div className="mb-8">
            <BrandLogo size="md" />
            <p className="text-xs text-[var(--text-tertiary)] mt-1">Sign in to continue</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <Input
              label="Email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
            <Input
              label="Password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />

            {error && (
              <p className="text-xs text-[var(--danger)]">{error}</p>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
