import { useState, useEffect, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Chatter, Profile } from '../lib/types';

interface ChatterAuthState {
  user: User | null;
  profile: Profile | null;
  chatter: Chatter | null;
  loading: boolean;
  error: string | null;
}

export function useChatterAuth() {
  const [state, setState] = useState<ChatterAuthState>({
    user: null,
    profile: null,
    chatter: null,
    loading: true,
    error: null,
  });

  const fetchAuthState = useCallback(async () => {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;

    if (!user) {
      setState({
        user: null,
        profile: null,
        chatter: null,
        loading: false,
        error: 'NO_AUTH',
      });
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      setState({
        user: null,
        profile: null,
        chatter: null,
        loading: false,
        error: 'NO_AUTH',
      });
      return;
    }

    if (profile.role !== 'chatter') {
      setState({
        user,
        profile: profile as Profile,
        chatter: null,
        loading: false,
        error: 'NO_CHATTER_ROLE',
      });
      return;
    }

    const { data: chatter, error: chatterError } = await supabase
      .from('chatters')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (chatterError || !chatter) {
      setState({
        user,
        profile: profile as Profile,
        chatter: null,
        loading: false,
        error: 'NO_CHATTER_PROFILE',
      });
      return;
    }

    setState({
      user,
      profile: profile as Profile,
      chatter: chatter as Chatter,
      loading: false,
      error: null,
    });
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(() => {
      if (active) {
        void fetchAuthState();
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void fetchAuthState();
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [fetchAuthState]);

  const logout = useCallback(() => {
    supabase.auth.signOut();
    setState({
      user: null,
      profile: null,
      chatter: null,
      loading: false,
      error: 'NO_AUTH',
    });
  }, []);

  return {
    user: state.user,
    profile: state.profile,
    chatter: state.chatter,
    loading: state.loading,
    error: state.error,
    refetch: fetchAuthState,
    logout,
  };
}
