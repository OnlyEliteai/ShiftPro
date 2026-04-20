import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type ChatterJoin = { name: string } | { name: string }[] | null;

export interface AnalyticsShiftRow {
  id: string;
  chatter_id: string;
  date: string;
  start_time: string;
  end_time: string;
  shift_type: 'morning' | 'evening' | null;
  model: string | null;
  platform: 'telegram' | 'onlyfans' | null;
  status: 'pending' | 'scheduled' | 'active' | 'completed' | 'missed' | 'rejected' | 'cancelled';
  clocked_in: string | null;
  clocked_out: string | null;
  chatters: ChatterJoin;
}

export interface AnalyticsSummaryRow {
  id: string;
  chatter_id: string;
  date: string;
  shift_type: 'morning' | 'evening' | null;
  income_onlyfans: number | null;
  income_telegram: number | null;
  income_transfers: number | null;
  income_other: number | null;
  income_total: number | null;
  availability_status: string | null;
  improvement_suggestions: string | null;
  chatters: ChatterJoin;
}

export interface MonthlyGoalRow {
  id: string;
  chatter_id: string;
  month: string;
  target_income: number | null;
  currency: string | null;
  created_at: string;
}

export interface AnalyticsChatterRow {
  id: string;
  name: string;
  active: boolean;
}

export interface AnalyticsActivityRow {
  id: string;
  chatter_id: string;
  action: string;
  timestamp: string;
}

export interface AnalyticsDateRange {
  startDate: string;
  endDate: string;
}

interface AnalyticsDataState {
  shifts: AnalyticsShiftRow[];
  summaries: AnalyticsSummaryRow[];
  goals: MonthlyGoalRow[];
  chatters: AnalyticsChatterRow[];
  activity: AnalyticsActivityRow[];
  activeNow: number;
}

const EMPTY_DATA: AnalyticsDataState = {
  shifts: [],
  summaries: [],
  goals: [],
  chatters: [],
  activity: [],
  activeNow: 0,
};

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthBounds(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start: toDateOnly(start), end: toDateOnly(end) };
}

function minDate(a: string, b: string) {
  return a < b ? a : b;
}

function maxDate(a: string, b: string) {
  return a > b ? a : b;
}

export function useAnalyticsData(range: AnalyticsDateRange) {
  const [data, setData] = useState<AnalyticsDataState>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const refetchDebounceRef = useRef<number | null>(null);
  const pollingRef = useRef<number | null>(null);
  const requestSeqRef = useRef(0);

  const rangeKey = useMemo(() => `${range.startDate}__${range.endDate}`, [range.startDate, range.endDate]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current != null) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const fetchAll = useCallback(
    async (mode: 'initial' | 'refetch' = 'refetch') => {
      const requestId = requestSeqRef.current + 1;
      requestSeqRef.current = requestId;

      if (mode === 'initial') {
        setLoading(true);
      }

      const now = new Date();
      const thisMonth = monthBounds(now);
      const summaryStart = minDate(range.startDate, thisMonth.start);
      const summaryEnd = maxDate(range.endDate, thisMonth.end);

      const [shiftsRes, summariesRes, goalsRes, chattersRes, activityRes, activeRes] = await Promise.all([
        supabase
          .from('shifts')
          .select('id, chatter_id, date, start_time, end_time, shift_type, model, platform, status, clocked_in, clocked_out, chatters(name)')
          .gte('date', range.startDate)
          .lte('date', range.endDate),
        supabase
          .from('daily_summaries')
          .select('id, chatter_id, date, shift_type, income_onlyfans, income_telegram, income_transfers, income_other, income_total, availability_status, improvement_suggestions, chatters(name)')
          .gte('date', summaryStart)
          .lte('date', summaryEnd),
        supabase
          .from('monthly_goals')
          .select('id, chatter_id, month, target_income, currency, created_at'),
        supabase
          .from('chatters')
          .select('id, name, active')
          .eq('active', true),
        supabase
          .from('activity_log')
          .select('id, chatter_id, action, timestamp')
          .eq('action', 'clock_in')
          .gte('timestamp', `${range.startDate}T00:00:00`)
          .lte('timestamp', `${range.endDate}T23:59:59`),
        supabase.from('shifts').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      ]);

      if (requestId !== requestSeqRef.current) {
        return;
      }

      const firstError =
        shiftsRes.error ??
        summariesRes.error ??
        goalsRes.error ??
        chattersRes.error ??
        activityRes.error ??
        activeRes.error;

      if (firstError) {
        setError(firstError.message);
        if (mode === 'initial') setLoading(false);
        return;
      }

      setData({
        shifts: (shiftsRes.data ?? []) as AnalyticsShiftRow[],
        summaries: (summariesRes.data ?? []) as AnalyticsSummaryRow[],
        goals: (goalsRes.data ?? []) as MonthlyGoalRow[],
        chatters: (chattersRes.data ?? []) as AnalyticsChatterRow[],
        activity: (activityRes.data ?? []) as AnalyticsActivityRow[],
        activeNow: activeRes.count ?? 0,
      });
      setError(null);
      setLoading(false);
    },
    [range.endDate, range.startDate]
  );

  const refetch = useCallback(async () => {
    await fetchAll('refetch');
  }, [fetchAll]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) {
        void fetchAll('initial');
      }
    });
    return () => {
      active = false;
    };
  }, [fetchAll, rangeKey]);

  useEffect(() => {
    const startPolling = () => {
      if (pollingRef.current != null) return;
      pollingRef.current = window.setInterval(() => {
        void refetch();
      }, 60_000);
    };

    const debouncedRefetch = () => {
      if (refetchDebounceRef.current != null) {
        window.clearTimeout(refetchDebounceRef.current);
      }
      refetchDebounceRef.current = window.setTimeout(() => {
        void refetch();
      }, 300);
    };

    const channel = supabase
      .channel('analytics-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, debouncedRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_summaries' }, debouncedRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monthly_goals' }, debouncedRefetch)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsLive(true);
          stopPolling();
          return;
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setIsLive(false);
          startPolling();
        }
      });

    channelRef.current = channel;

    return () => {
      if (refetchDebounceRef.current != null) {
        window.clearTimeout(refetchDebounceRef.current);
      }
      stopPolling();
      setIsLive(false);
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [refetch, stopPolling]);

  return {
    ...data,
    loading,
    error,
    isLive,
    refetch,
  };
}
