import { useState, useEffect, useCallback } from 'react';
import { SUPABASE_URL } from '../lib/supabase';
import type { Chatter, ShiftWithChatter } from '../lib/types';

interface ChatterAuthState {
  chatter: Pick<Chatter, 'id' | 'name'> | null;
  shifts: ShiftWithChatter[];
  loading: boolean;
  error: string | null;
}

export function useChatterAuth() {
  const [state, setState] = useState<ChatterAuthState>({
    chatter: null,
    shifts: [],
    loading: true,
    error: null,
  });

  // Read token once from the URL — it never changes during the page lifecycle
  const token = new URLSearchParams(window.location.search).get('token') ?? '';

  // Strip token from URL to prevent referrer leakage
  if (token) {
    const url = new URL(window.location.href);
    url.searchParams.delete('token');
    window.history.replaceState({}, '', url.toString());
  }

  const fetchData = useCallback(async () => {
    if (!token) {
      setState({ chatter: null, shifts: [], loading: false, error: 'Missing token' });
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/chatter-view?token=${encodeURIComponent(token)}`
      );
      const json = await res.json();

      if (!res.ok || json.success === false) {
        setState({
          chatter: null,
          shifts: [],
          loading: false,
          error: json.error ?? 'Authentication failed',
        });
        return;
      }

      const payload = json.data ?? json;
      setState({
        chatter: { id: payload.chatter.id, name: payload.chatter.name },
        shifts: payload.shifts ?? [],
        loading: false,
        error: null,
      });
    } catch {
      setState({
        chatter: null,
        shifts: [],
        loading: false,
        error: 'Unable to connect to server. Please try again.',
      });
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    chatter: state.chatter,
    shifts: state.shifts,
    loading: state.loading,
    error: state.error,
    refetch: fetchData,
  };
}
