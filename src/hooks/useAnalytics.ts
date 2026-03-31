import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

interface AttendanceRate {
  chatter_id: string;
  chatter_name: string;
  completed: number;
  missed: number;
  rate: number; // 0–100
}

interface WeeklyWorkload {
  chatter_id: string;
  chatter_name: string;
  shift_count: number;
}

interface DashboardStats {
  totalChatters: number;
  activeChatters: number;
  todayShifts: number;
  currentlyOnShift: number;
  attendanceRate: number; // overall 0–100
  missedRate: number;     // overall 0–100
}

interface UseAnalyticsReturn {
  stats: DashboardStats;
  attendanceRates: AttendanceRate[];
  weeklyWorkload: WeeklyWorkload[];
  loading: boolean;
  getAttendanceRate: (days?: number) => Promise<AttendanceRate[]>;
  getWeeklyWorkload: () => Promise<WeeklyWorkload[]>;
  refetch: () => Promise<void>;
}

const DEFAULT_STATS: DashboardStats = {
  totalChatters: 0,
  activeChatters: 0,
  todayShifts: 0,
  currentlyOnShift: 0,
  attendanceRate: 0,
  missedRate: 0,
};

export function useAnalytics(): UseAnalyticsReturn {
  const [stats, setStats] = useState<DashboardStats>(DEFAULT_STATS);
  const [attendanceRates, setAttendanceRates] = useState<AttendanceRate[]>([]);
  const [weeklyWorkload, setWeeklyWorkload] = useState<WeeklyWorkload[]>([]);
  const [loading, setLoading] = useState(true);

  const getAttendanceRate = useCallback(async (days = 30): Promise<AttendanceRate[]> => {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('shifts')
      .select('chatter_id, status, chatters(name)')
      .gte('date', sinceStr)
      .in('status', ['completed', 'missed']);

    if (error || !data) return [];

    // Group by chatter
    const map = new Map<string, { name: string; completed: number; missed: number }>();

    for (const row of data as unknown as Array<{
      chatter_id: string;
      status: string;
      chatters: { name: string } | null;
    }>) {
      const entry = map.get(row.chatter_id) ?? {
        name: row.chatters?.name ?? row.chatter_id,
        completed: 0,
        missed: 0,
      };
      if (row.status === 'completed') entry.completed += 1;
      if (row.status === 'missed')    entry.missed    += 1;
      map.set(row.chatter_id, entry);
    }

    const rates: AttendanceRate[] = Array.from(map.entries()).map(([id, v]) => {
      const total = v.completed + v.missed;
      return {
        chatter_id: id,
        chatter_name: v.name,
        completed: v.completed,
        missed: v.missed,
        rate: total > 0 ? Math.round((v.completed / total) * 100) : 0,
      };
    });

    rates.sort((a, b) => b.rate - a.rate);
    return rates;
  }, []);

  const getWeeklyWorkload = useCallback(async (): Promise<WeeklyWorkload[]> => {
    // Monday of the current week
    const now = new Date();
    const day = now.getDay(); // 0 = Sunday
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    const start = monday.toISOString().slice(0, 10);
    const end   = sunday.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('shifts')
      .select('chatter_id, chatters(name)')
      .gte('date', start)
      .lte('date', end);

    if (error || !data) return [];

    const map = new Map<string, { name: string; count: number }>();

    for (const row of data as unknown as Array<{
      chatter_id: string;
      chatters: { name: string } | null;
    }>) {
      const entry = map.get(row.chatter_id) ?? {
        name: row.chatters?.name ?? row.chatter_id,
        count: 0,
      };
      entry.count += 1;
      map.set(row.chatter_id, entry);
    }

    const workload: WeeklyWorkload[] = Array.from(map.entries()).map(([id, v]) => ({
      chatter_id: id,
      chatter_name: v.name,
      shift_count: v.count,
    }));

    workload.sort((a, b) => b.shift_count - a.shift_count);
    return workload;
  }, []);

  const fetchStats = useCallback(async (): Promise<void> => {
    const today = new Date().toISOString().slice(0, 10);
    const now   = new Date().toISOString();

    const [
      chattersRes,
      todayShiftsRes,
      activeShiftsRes,
      attendanceRes,
      workloadRes,
    ] = await Promise.all([
      supabase.from('chatters').select('id, active'),
      supabase.from('shifts').select('id').eq('date', today),
      supabase
        .from('shifts')
        .select('id')
        .eq('status', 'active')
        .lte('start_time', now.slice(11, 19))
        .gte('end_time', now.slice(11, 19)),
      getAttendanceRate(30),
      getWeeklyWorkload(),
    ]);

    const chatters = chattersRes.data ?? [];
    const totalChatters  = chatters.length;
    const activeChatters = chatters.filter((c: { active: boolean }) => c.active).length;
    const todayShifts    = todayShiftsRes.data?.length ?? 0;
    const currentlyOnShift = activeShiftsRes.data?.length ?? 0;

    // Overall attendance from the per-chatter breakdown
    const totalCompleted = attendanceRes.reduce((s, r) => s + r.completed, 0);
    const totalMissed    = attendanceRes.reduce((s, r) => s + r.missed,    0);
    const totalTracked   = totalCompleted + totalMissed;
    const attendanceRate = totalTracked > 0 ? Math.round((totalCompleted / totalTracked) * 100) : 0;
    const missedRate     = totalTracked > 0 ? Math.round((totalMissed    / totalTracked) * 100) : 0;

    setStats({
      totalChatters,
      activeChatters,
      todayShifts,
      currentlyOnShift,
      attendanceRate,
      missedRate,
    });
    setAttendanceRates(attendanceRes);
    setWeeklyWorkload(workloadRes);
  }, [getAttendanceRate, getWeeklyWorkload]);

  const refetch = useCallback(async () => {
    setLoading(true);
    await fetchStats();
    setLoading(false);
  }, [fetchStats]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) {
        void refetch();
      }
    });
    return () => {
      active = false;
    };
  }, [refetch]);

  return {
    stats,
    attendanceRates,
    weeklyWorkload,
    loading,
    getAttendanceRate,
    getWeeklyWorkload,
    refetch,
  };
}
