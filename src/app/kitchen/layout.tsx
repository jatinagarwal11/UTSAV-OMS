import Shell from '@/components/shell';
import { requireRole } from '@/lib/auth/guards';

export default async function KitchenLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(['kitchen']);
  return <Shell initialRole={profile.role} initialName={profile.name}>{children}</Shell>;
}
