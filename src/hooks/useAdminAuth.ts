import { useState, useEffect, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/types';

interface AdminAuthState {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
}

export function useAdminAuth() {
  const [state, setState] = useState<AdminAuthState>({
    user: null,
    profile: null,
    loading: true,
  });

  const fetchProfile = useCallback(async (userId: string): Promise<Profile | null> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !data) return null;
    return data as Profile;
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user ?? null;
      if (user) {
        const profile = await fetchProfile(user.id);
        // Only consider authenticated if profile has admin role
        if (profile?.role === 'admin') {
          setState({ user, profile, loading: false });
        } else {
          setState({ user: null, profile: null, loading: false });
        }
      } else {
        setState({ user: null, profile: null, loading: false });
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const user = session?.user ?? null;
        if (user) {
          const profile = await fetchProfile(user.id);
          if (profile?.role === 'admin') {
            setState({ user, profile, loading: false });
          } else {
            setState({ user: null, profile: null, loading: false });
          }
        } else {
          setState({ user: null, profile: null, loading: false });
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<{ error: string | null }> => {
      setState(prev => ({ ...prev, loading: true }));
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setState(prev => ({ ...prev, loading: false }));
        return { error: error.message };
      }

      // Check profile role
      const user = data.user;
      if (user) {
        const profile = await fetchProfile(user.id);
        if (!profile || profile.role !== 'admin') {
          await supabase.auth.signOut();
          setState(prev => ({ ...prev, loading: false }));
          return { error: 'אין לך הרשאות מנהל' };
        }
        setState({ user, profile, loading: false });
      }

      return { error: null };
    },
    [fetchProfile]
  );

  const signOut = useCallback(async (): Promise<void> => {
    setState(prev => ({ ...prev, loading: true }));
    await supabase.auth.signOut();
    setState({ user: null, profile: null, loading: false });
  }, []);

  return {
    user: state.user,
    profile: state.profile,
    loading: state.loading,
    signIn,
    signOut,
  };
}
