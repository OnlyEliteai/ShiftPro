import { useState, useEffect, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AdminAuthState {
  user: User | null;
  loading: boolean;
}

export function useAdminAuth() {
  const [state, setState] = useState<AdminAuthState>({
    user: null,
    loading: true,
  });

  useEffect(() => {
    // Resolve the initial session before listening to changes
    supabase.auth.getUser().then(({ data }) => {
      setState({ user: data.user ?? null, loading: false });
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setState({ user: session?.user ?? null, loading: false });
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(
    async (email: string, password: string): Promise<{ error: string | null }> => {
      setState(prev => ({ ...prev, loading: true }));
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setState(prev => ({ ...prev, loading: false }));
        return { error: error.message };
      }
      // user will be set via onAuthStateChange
      return { error: null };
    },
    []
  );

  const signOut = useCallback(async (): Promise<void> => {
    setState(prev => ({ ...prev, loading: true }));
    await supabase.auth.signOut();
    // user will be cleared via onAuthStateChange
  }, []);

  return {
    user: state.user,
    loading: state.loading,
    signIn,
    signOut,
  };
}
