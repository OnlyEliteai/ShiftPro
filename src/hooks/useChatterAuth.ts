import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, SUPABASE_URL } from '../lib/supabase';
import type { Shift, ChatterSession } from '../lib/types';

const SESSION_KEY = 'shiftpro-chatter-session';
const SESSION_MAX_AGE = 12 * 60 * 60 * 1000; // 12 hours

interface ChatterAuthState {
  chatter: { id: string; name: string } | null;
  shifts: Shift[];
  availableShifts: Shift[];
  loading: boolean;
  error: string | null;
}

function getStoredSession(): ChatterSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session: ChatterSession = JSON.parse(raw);
    if (Date.now() - session.loggedInAt > SESSION_MAX_AGE) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function saveSession(session: ChatterSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function useChatterAuth() {
  const [state, setState] = useState<ChatterAuthState>({
    chatter: null,
    shifts: [],
    availableShifts: [],
    loading: true,
    error: null,
  });

  // Read token from URL (one-time)
  const tokenRef = useRef(
    new URLSearchParams(window.location.search).get('token') ?? ''
  );

  // Resolve the token: URL token > localStorage session
  const resolvedTokenRef = useRef('');

  useEffect(() => {
    const urlToken = tokenRef.current;
    const stored = getStoredSession();

    if (urlToken) {
      // URL token takes priority — save to localStorage and strip from URL
      resolvedTokenRef.current = urlToken;
      // We'll save the full session after we fetch data and confirm the token is valid
      const url = new URL(window.location.href);
      url.searchParams.delete('token');
      window.history.replaceState({}, '', url.toString());
    } else if (stored) {
      resolvedTokenRef.current = stored.token;
    }
  }, []);

  const fetchData = useCallback(async () => {
    const token = resolvedTokenRef.current;
    if (!token) {
      setState({ chatter: null, shifts: [], availableShifts: [], loading: false, error: 'NO_AUTH' });
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/chatter-view?token=${encodeURIComponent(token)}`
      );
      const json = await res.json();

      if (!res.ok || json.success === false) {
        clearSession();
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
      const chatter = { id: payload.chatter.id, name: payload.chatter.name };

      // Save/refresh session in localStorage
      saveSession({
        chatterId: chatter.id,
        chatterName: chatter.name,
        token,
        loggedInAt: Date.now(),
      });

      setState({
        chatter,
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
  }, []);

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
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [state.chatter, fetchData]);

  const logout = useCallback(() => {
    clearSession();
    resolvedTokenRef.current = '';
    setState({ chatter: null, shifts: [], availableShifts: [], loading: false, error: 'NO_AUTH' });
  }, []);

  const token = resolvedTokenRef.current;

  return {
    chatter: state.chatter,
    shifts: state.shifts,
    availableShifts: state.availableShifts,
    loading: state.loading,
    error: state.error,
    token,
    refetch: fetchData,
    logout,
  };
}
