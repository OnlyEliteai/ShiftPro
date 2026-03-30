import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, SUPABASE_URL } from '../lib/supabase';
import type { Chatter, Shift } from '../lib/types';

interface ChatterAuthState {
  chatter: Pick<Chatter, 'id' | 'name'> | null;
  shifts: Shift[];
  availableShifts: Shift[];
  loading: boolean;
  error: string | null;
}

export function useChatterAuth() {
  const [state, setState] = useState<ChatterAuthState>({
    chatter: null,
    shifts: [],
    availableShifts: [],
    loading: true,
    error: null,
  });

  // Read token once from the URL — it never changes during the page lifecycle
  const tokenRef = useRef(
    new URLSearchParams(window.location.search).get('token') ?? ''
  );
  const token = tokenRef.current;

  // Strip token from URL to prevent referrer leakage (run once)
  useEffect(() => {
    if (token) {
      const url = new URL(window.location.href);
      url.searchParams.delete('token');
      window.history.replaceState({}, '', url.toString());
    }
  }, [token]);

  const fetchData = useCallback(async () => {
    if (!token) {
      setState({ chatter: null, shifts: [], availableShifts: [], loading: false, error: 'Missing token' });
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
          availableShifts: [],
          loading: false,
          error: json.error ?? 'Authentication failed',
        });
        return;
      }

      const payload = json.data ?? json;
      setState({
        chatter: { id: payload.chatter.id, name: payload.chatter.name },
        shifts: payload.shifts ?? [],
        availableShifts: payload.available_shifts ?? [],
        loading: false,
        error: null,
      });
    } catch {
      setState({
        chatter: null,
        shifts: [],
        availableShifts: [],
        loading: false,
        error: 'Unable to connect to server. Please try again.',
      });
    }
  }, [token]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Realtime subscription on shifts table
  useEffect(() => {
    if (!state.chatter) return;

    const channel = supabase
      .channel('chatter-shifts-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shifts' },
        () => {
          // Refetch all data when any shift changes — keeps both
          // my_shifts and available_shifts in sync
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [state.chatter, fetchData]);

  return {
    chatter: state.chatter,
    shifts: state.shifts,
    availableShifts: state.availableShifts,
    loading: state.loading,
    error: state.error,
    token,
    refetch: fetchData,
  };
}
