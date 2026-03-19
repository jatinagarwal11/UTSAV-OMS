'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import BrandLogo from '@/components/brand-logo';
import Button from '@/components/ui/button';
import type { UserRole } from '@/lib/types';

interface NavItem {
  label: string;
  href: string;
}

const navByRole: Record<UserRole, NavItem[]> = {
  sales: [
    { label: 'Dashboard', href: '/sales/dashboard' },
    { label: 'New Order', href: '/sales' },
    { label: 'My Orders', href: '/sales/orders' },
  ],
  kitchen: [
    { label: 'Dashboard', href: '/kitchen' },
  ],
  accounts: [
    { label: 'Direct Factory Order', href: '/accounts/direct-order' },
    { label: 'Scan & Bill', href: '/accounts' },
    { label: 'Invoices', href: '/accounts/invoices' },
  ],
  admin: [
    { label: 'Dashboard', href: '/admin' },
    { label: 'Products', href: '/admin/products' },
    { label: 'Recipes', href: '/admin/recipes' },
    { label: 'Users', href: '/admin/users' },
    { label: 'Orders', href: '/admin/orders' },
    { label: 'Reports', href: '/admin/reports' },
  ],
};

const roleLabels: Record<UserRole, string> = {
  sales: 'Sales',
  kitchen: 'Kitchen',
  accounts: 'Accounts',
  admin: 'Admin',
};

interface ShellProps {
  children: React.ReactNode;
  initialRole?: UserRole;
  initialName?: string;
}

export default function Shell({ children, initialRole = 'sales', initialName = '' }: ShellProps) {
  const { profile, signOut } = useAuth();
  const pathname = usePathname();

  const role = profile?.role || initialRole;
  const displayName = profile?.name || initialName;
  const nav = navByRole[role];

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-56 bg-[var(--bg-card)] border-r border-[var(--border)] flex flex-col no-print">
        <div className="px-5 py-5 border-b border-[var(--border)]">
          <BrandLogo size="sm" />
          <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5 uppercase tracking-widest">{roleLabels[role]} Portal</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {nav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block px-3 py-2 text-sm rounded-md transition-colors ${
                  active
                    ? 'bg-[var(--accent)] text-[var(--accent-text)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-[var(--border)]">
          <>
            <p className="text-xs text-[var(--text-secondary)] truncate mb-2">{displayName}</p>
            <Button variant="ghost" size="sm" onClick={signOut} className="w-full text-left">
              Sign out
            </Button>
          </>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
