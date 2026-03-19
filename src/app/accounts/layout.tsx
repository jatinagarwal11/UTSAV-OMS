import Shell from '@/components/shell';
import { requireRole } from '@/lib/auth/guards';

export default async function AccountsLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(['accounts']);
  return <Shell initialRole={profile.role} initialName={profile.name}>{children}</Shell>;
}
