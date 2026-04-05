import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { ShiftWithChatter } from '../lib/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

const SHIFT_SELECT_WITH_ASSIGNMENTS = `
  *,
  chatters(name, phone),
  shift_assignments(id, shift_id, model_id, model, platform, shift_date, shift_start_time, assigned_at)
`;

interface UseShiftsReturn {
  shifts: ShiftWithChatter[];
  loading: boolean;
  fetchShifts: (startDate?: string, endDate?: string) => Promise<void>;
  createShift: (data: Partial<ShiftWithChatter>) => Promise<{ error: string | null }>;
  updateShift: (id: string, data: Partial<ShiftWithChatter>) => Promise<{ error: string | null }>;
  deleteShift: (id: string) => Promise<{ error: string | null }>;
}

export function useShifts(): UseShiftsReturn {
  const [shifts, setShifts] = useState<ShiftWithChatter[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const retryCountRef = useRef(0);
  // Keep a stable reference to the latest date range so the realtime handler
  // can re-fetch with the same filters without stale closures.
  const dateRangeRef = useRef<{ start?: string; end?: string }>({});

  const fetchShifts = useCallback(async (startDate?: string, endDate?: string) => {
    setLoading(true);
    dateRangeRef.current = { start: startDate, end: endDate };

    let query = supabase
      .from('shifts')
      .select(SHIFT_SELECT_WITH_ASSIGNMENTS)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (startDate) query = query.gte('date', startDate);
    if (endDate)   query = query.lte('date', endDate);

    const { data, error } = await query;

    if (!error && data) {
      setShifts(data as ShiftWithChatter[]);
    }
    setLoading(false);
  }, []);

  // Handle a single realtime change without re-fetching the whole list.
  const handleChange = useCallback(
    (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
      const { eventType, new: newRow, old: oldRow } = payload;

      if (eventType === 'INSERT') {
        // Fetch just this shift so we get the joined chatter data
        supabase
          .from('shifts')
          .select(SHIFT_SELECT_WITH_ASSIGNMENTS)
          .eq('id', (newRow as { id: string }).id)
          .single()
          .then(({ data }) => {
            if (data) {
              setShifts(prev => {
                // Avoid duplicates
                if (prev.some(s => s.id === data.id)) return prev;
                return [...prev, data as ShiftWithChatter].sort((a, b) =>
                  a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time)
                );
              });
            }
          })
          // Realtime handlers are not user-initiated; logging is sufficient.
          .then(undefined, console.error);
        return;
      }

      if (eventType === 'UPDATE') {
        supabase
          .from('shifts')
          .select(SHIFT_SELECT_WITH_ASSIGNMENTS)
          .eq('id', (newRow as { id: string }).id)
          .single()
          .then(({ data }) => {
            if (data) {
              setShifts(prev =>
                prev.map(s => (s.id === data.id ? (data as ShiftWithChatter) : s))
              );
            }
          })
          // Realtime handlers are not user-initiated; logging is sufficient.
          .then(undefined, console.error);
        return;
      }

      if (eventType === 'DELETE') {
        setShifts(prev => prev.filter(s => s.id !== (oldRow as { id: string }).id));
      }
    },
    []
  );

  // Subscribe to realtime changes with auto-reconnect
  useEffect(() => {
    const MAX_RETRIES = 10;
    const BASE_DELAY_MS = 3000;
    const MAX_DELAY_MS = 60_000; // 1 minute cap on backoff

    const subscribe = () => {
      const channel = supabase
        .channel('shifts-realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'shifts' },
          handleChange
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'shift_assignments' },
          () => {
            const { start, end } = dateRangeRef.current;
            void fetchShifts(start, end);
          }
        )
        .subscribe((status) => {
          if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            if (retryCountRef.current < MAX_RETRIES) {
              const delay = Math.min(
                BASE_DELAY_MS * Math.pow(2, retryCountRef.current),
                MAX_DELAY_MS
              );
              retryCountRef.current += 1;
              setTimeout(subscribe, delay);
            }
          } else if (status === 'SUBSCRIBED') {
            // Reset retry counter on successful connection
            retryCountRef.current = 0;
          }
        });

      channelRef.current = channel;
    };

    subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [handleChange, fetchShifts]);

  // Initial load
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) {
        void fetchShifts();
      }
    });
    return () => {
      active = false;
    };
  }, [fetchShifts]);

  const createShift = useCallback(
    async (data: Partial<ShiftWithChatter>): Promise<{ error: string | null }> => {
      const { error } = await supabase.from('shifts').insert(data);
      return { error: error?.message ?? null };
    },
    []
  );

  const updateShift = useCallback(
    async (id: string, data: Partial<ShiftWithChatter>): Promise<{ error: string | null }> => {
      const { error } = await supabase.from('shifts').update(data).eq('id', id);
      return { error: error?.message ?? null };
    },
    []
  );

  const deleteShift = useCallback(
    async (id: string): Promise<{ error: string | null }> => {
      const { error } = await supabase.from('shifts').delete().eq('id', id);
      return { error: error?.message ?? null };
    },
    []
  );

  return { shifts, loading, fetchShifts, createShift, updateShift, deleteShift };
}
