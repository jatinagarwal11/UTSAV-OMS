'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/lib/types';
import type { User } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const loadProfile = async (userId: string) => {
    try {
      const profilePromise = supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      // Never block the UI indefinitely if profile fetch is slow.
      const { data } = await Promise.race([
        profilePromise,
        new Promise<{ data: null }>((resolve) => setTimeout(() => resolve({ data: null }), 6000)),
      ]);
      setProfile(data ?? null);
    } catch {
      setProfile(null);
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        // getSession() reads from cookie — instant, no network call
        const { data: { session } } = await supabase.auth.getSession();
        const u = session?.user ?? null;
        setUser(u);
        if (!u) {
          setProfile(null);
          return;
        }

        // Load profile in background; do not block app boot.
        loadProfile(u.id);
      } catch {
        setUser(null);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        try {
          setUser(session?.user ?? null);
          if (session?.user) {
            loadProfile(session.user.id);
          } else {
            setProfile(null);
          }
        } catch {
          setUser(null);
          setProfile(null);
        } finally {
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = async () => {
    // Attempt both sign-outs, but never block forever on network.
    await Promise.race([
      Promise.all([
        supabase.auth.signOut().catch(() => undefined),
        fetch('/api/auth/signout', { method: 'POST' }).catch(() => undefined),
      ]),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
    setUser(null);
    setProfile(null);
    // Hard redirect to clear all state
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
