import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { ShiftWithChatter } from '../lib/types';
import type { RealtimeChannel } from '@supabase/supabase-js';

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
      .select('*, chatters(name, phone)')
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
          .select('*, chatters(name, phone)')
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
          .catch(console.error);
        return;
      }

      if (eventType === 'UPDATE') {
        supabase
          .from('shifts')
          .select('*, chatters(name, phone)')
          .eq('id', (newRow as { id: string }).id)
          .single()
          .then(({ data }) => {
            if (data) {
              setShifts(prev =>
                prev.map(s => (s.id === data.id ? (data as ShiftWithChatter) : s))
              );
            }
          })
          .catch(console.error);
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
    const MAX_RETRIES = 5;
    const BASE_DELAY_MS = 3000;

    const subscribe = () => {
      const channel = supabase
        .channel('shifts-realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'shifts' },
          handleChange
        )
        .subscribe((status) => {
          if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            if (retryCountRef.current < MAX_RETRIES) {
              const delay = BASE_DELAY_MS * Math.pow(2, retryCountRef.current);
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
  }, [handleChange]);

  // Initial load
  useEffect(() => {
    fetchShifts();
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
