import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import type { Profile, UserRole } from '@/lib/types';

const roleHome: Record<UserRole, string> = {
  admin: '/admin',
  sales: '/sales',
  kitchen: '/kitchen',
  accounts: '/accounts',
};

export function getRoleHome(role: UserRole) {
  return roleHome[role] || '/sales';
}

export async function requireRole(allowedRoles: UserRole[]) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, name, role, is_active')
    .eq('id', user.id)
    .single();

  if (!profile || !profile.is_active) {
    redirect('/api/auth/signout?redirect=/login');
  }

  const profileRole = profile.role as UserRole;
  const isAllowed = profileRole === 'admin' || allowedRoles.includes(profileRole);

  if (!isAllowed) {
    redirect(getRoleHome(profileRole));
  }

  return profile as Pick<Profile, 'id' | 'name' | 'role' | 'is_active'>;
}
