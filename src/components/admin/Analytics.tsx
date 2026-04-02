import { useState, useEffect, useCallback, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { LABELS } from '../../lib/utils';
import { LoadingSpinner } from '../shared/LoadingSpinner';

const COLORS = ['#3b82f6', '#22c55e', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
const ISRAEL_TIMEZONE = 'Asia/Jerusalem';
const TRACKED_STATUSES = ['scheduled', 'completed', 'missed', 'active'] as const;

interface AttendanceData {
  name: string;
  rate: number;
  completed: number;
  scheduled: number;
  missed: number;
  total: number;
}

interface WeeklyData {
  dayLabel: string;
  fullDateLabel: string;
  scheduled: number;
  completed: number;
  missed: number;
}

interface ModelData {
  model: string;
  count: number;
}

interface ShiftAnalyticsRow {
  chatter_id: string;
  status: string;
  date: string;
  model: string | null;
  chatters: { name: string }[] | { name: string } | null;
}

function getIsraelDateParts(date: Date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ISRAEL_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');

  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
  };
}

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function toDateKey(year: number, month: number, day: number) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function getIsraelWeekStartDateKey() {
  const now = getIsraelDateParts();
  const todayUtc = new Date(Date.UTC(now.year, now.month - 1, now.day, 12, 0, 0));
  const dayOfWeek = todayUtc.getUTCDay();
  const weekStart = new Date(todayUtc);
  weekStart.setUTCDate(todayUtc.getUTCDate() - dayOfWeek);
  return toDateKey(
    weekStart.getUTCFullYear(),
    weekStart.getUTCMonth() + 1,
    weekStart.getUTCDate()
  );
}

function getFiveWeekDateRange() {
  const currentWeekStartKey = getIsraelWeekStartDateKey();
  const currentWeekStart = parseDateKey(currentWeekStartKey);

  const start = new Date(currentWeekStart);
  start.setUTCDate(currentWeekStart.getUTCDate() - 28);

  const end = new Date(currentWeekStart);
  end.setUTCDate(currentWeekStart.getUTCDate() + 6);

  const dateKeys: string[] = [];
  const pointer = new Date(start);
  while (pointer <= end) {
    dateKeys.push(
      toDateKey(
        pointer.getUTCFullYear(),
        pointer.getUTCMonth() + 1,
        pointer.getUTCDate()
      )
    );
    pointer.setUTCDate(pointer.getUTCDate() + 1);
  }

  return {
    start: toDateKey(start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate()),
    end: toDateKey(end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate()),
    dateKeys,
  };
}

function formatTrendDayLabel(dateKey: string) {
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: ISRAEL_TIMEZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
  }).format(parseDateKey(dateKey));
}

function formatTrendFullDateLabel(dateKey: string) {
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: ISRAEL_TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).format(parseDateKey(dateKey));
}

function getStatusBucket(status: string): 'scheduled' | 'completed' | 'missed' {
  if (status === 'completed') return 'completed';
  if (status === 'missed') return 'missed';
  return 'scheduled';
}

export function Analytics() {
  const [attendance, setAttendance] = useState<AttendanceData[]>([]);
  const [weeklyTrend, setWeeklyTrend] = useState<WeeklyData[]>([]);
  const [modelCoverage, setModelCoverage] = useState<ModelData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 639px)').matches);
  const refreshTimeoutRef = useRef<number | null>(null);

  const fetchAnalytics = useCallback(async (mode: 'initial' | 'refresh' = 'refresh') => {
    if (mode === 'initial') {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysDateKey = thirtyDaysAgo.toISOString().split('T')[0];
      const trendRange = getFiveWeekDateRange();
      const queryStartDate = thirtyDaysDateKey < trendRange.start ? thirtyDaysDateKey : trendRange.start;

      const { data: shifts, error: shiftsError } = await supabase
        .from('shifts')
        .select('chatter_id, status, date, model, chatters(name)')
        .gte('date', queryStartDate)
        .in('status', [...TRACKED_STATUSES]);

      if (shiftsError) {
        setAttendance([]);
        setWeeklyTrend([]);
        setModelCoverage([]);
        return;
      }

      const shiftRows = (shifts ?? []) as unknown as ShiftAnalyticsRow[];
      const attendanceRows = shiftRows.filter((row) => row.date >= thirtyDaysDateKey);
      const trendRows = shiftRows.filter(
        (row) => row.date >= trendRange.start && row.date <= trendRange.end
      );

      const chatterMap = new Map<string, AttendanceData>();
      for (const row of attendanceRows) {
        const key = row.chatter_id;
        const chatterName = Array.isArray(row.chatters)
          ? row.chatters[0]?.name
          : row.chatters?.name;

        if (!chatterMap.has(key)) {
          chatterMap.set(key, {
            name: chatterName || 'לא ידוע',
            rate: 0,
            completed: 0,
            scheduled: 0,
            missed: 0,
            total: 0,
          });
        }

        const entry = chatterMap.get(key)!;
        const bucket = getStatusBucket(row.status);
        if (bucket === 'completed') entry.completed += 1;
        else if (bucket === 'missed') entry.missed += 1;
        else entry.scheduled += 1;
      }

      const attendanceData = Array.from(chatterMap.values()).map((item) => {
        const total = item.completed + item.scheduled + item.missed;
        return {
          ...item,
          total,
          rate: total > 0 ? Math.round((item.completed / total) * 100) : 0,
        };
      });
      attendanceData.sort((a, b) => (b.total - a.total) || (b.rate - a.rate));
      setAttendance(attendanceData);

      const trendMap = new Map<string, WeeklyData>();
      for (const dayKey of trendRange.dateKeys) {
        trendMap.set(dayKey, {
          dayLabel: formatTrendDayLabel(dayKey),
          fullDateLabel: formatTrendFullDateLabel(dayKey),
          scheduled: 0,
          completed: 0,
          missed: 0,
        });
      }

      for (const row of trendRows) {
        const entry = trendMap.get(row.date);
        if (!entry) continue;
        const bucket = getStatusBucket(row.status);
        entry[bucket] += 1;
      }

      setWeeklyTrend(trendRange.dateKeys.map((dayKey) => trendMap.get(dayKey)!));

      const modelMap = new Map<string, number>();
      for (const row of attendanceRows) {
        const modelName = row.model || LABELS.noModel;
        modelMap.set(modelName, (modelMap.get(modelName) || 0) + 1);
      }
      const modelData = Array.from(modelMap.entries()).map(([model, count]) => ({ model, count }));
      modelData.sort((a, b) => b.count - a.count);
      setModelCoverage(modelData);
    } finally {
      if (mode === 'initial') {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchAnalytics('initial');
  }, [fetchAnalytics]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 639px)');
    const update = () => setIsMobile(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => {
      mediaQuery.removeEventListener('change', update);
    };
  }, []);

  useEffect(() => {
    const scheduleRefetch = () => {
      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current);
      }
      refreshTimeoutRef.current = window.setTimeout(() => {
        refreshTimeoutRef.current = null;
        void fetchAnalytics('refresh');
      }, 500);
    };

    const channel = supabase
      .channel('analytics-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, scheduleRefetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_summaries' }, scheduleRefetch)
      .subscribe();

    return () => {
      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current);
      }
      void supabase.removeChannel(channel);
    };
  }, [fetchAnalytics]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4 sm:space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold">{LABELS.analytics}</h2>
        <button
          onClick={() => { void fetchAnalytics('refresh'); }}
          disabled={refreshing}
          className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-700 rounded-lg hover:bg-gray-600 disabled:opacity-60 disabled:cursor-not-allowed text-xs sm:text-sm"
        >
          <RefreshCw size={14} />
          {LABELS.refresh}
        </button>
      </div>

      <div className="bg-gray-800 rounded-xl p-4 sm:p-6">
        <h3 className="text-lg font-semibold mb-4">{LABELS.attendanceByChatter} לפי צ׳אטר (30 יום)</h3>
        {attendance.length > 0 ? (
          <div className="w-full overflow-x-auto sm:overflow-visible">
            <div className="min-w-[600px] sm:min-w-0 h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={attendance} margin={{ top: 8, right: 8, left: 0, bottom: isMobile ? 70 : 28 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#9ca3af', fontSize: isMobile ? 10 : 12 }}
                    angle={isMobile ? -45 : 0}
                    textAnchor={isMobile ? 'end' : 'middle'}
                    height={isMobile ? 60 : 28}
                    interval={0}
                  />
                  <YAxis domain={[0, 100]} tick={{ fill: '#9ca3af', fontSize: isMobile ? 10 : 12 }} unit="%" />
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: 8, color: '#fff' }} />
                  <Bar dataKey="rate" fill="#3b82f6" radius={[4, 4, 0, 0]} name="אחוז נוכחות" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <p className="text-gray-400 text-center py-8">{LABELS.noDataYet}</p>
        )}
      </div>

      <div className="bg-gray-800 rounded-xl p-4 sm:p-6">
        <h3 className="text-lg font-semibold mb-4">{LABELS.weeklyTrend}</h3>
        {weeklyTrend.length > 0 ? (
          <div className="w-full overflow-x-auto sm:overflow-visible">
            <div className="min-w-[600px] sm:min-w-0 h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyTrend} margin={{ top: 8, right: 8, left: 0, bottom: isMobile ? 72 : 32 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="dayLabel"
                    tick={{ fill: '#9ca3af', fontSize: isMobile ? 10 : 12 }}
                    angle={isMobile ? -45 : 0}
                    textAnchor={isMobile ? 'end' : 'middle'}
                    height={isMobile ? 60 : 28}
                    interval={isMobile ? 2 : 0}
                  />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: isMobile ? 10 : 12 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: 8, color: '#fff' }}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDateLabel ?? ''}
                  />
                  <Bar stackId="shifts" dataKey="scheduled" fill="#3b82f6" name="מתוכננות" />
                  <Bar stackId="shifts" dataKey="completed" fill="#22c55e" name="הושלמו" />
                  <Bar stackId="shifts" dataKey="missed" fill="#ef4444" name="פספוסים" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <p className="text-gray-400 text-center py-8">{LABELS.noDataYet}</p>
        )}
      </div>

      <div className="bg-gray-800 rounded-xl p-4 sm:p-6">
        <h3 className="text-lg font-semibold mb-4">{LABELS.modelCoverage}</h3>
        {modelCoverage.length > 0 ? (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
            <div className="w-full sm:w-1/2 aspect-square min-h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={modelCoverage} dataKey="count" nameKey="model" cx="50%" cy="50%" outerRadius={isMobile ? 100 : 92}>
                    {modelCoverage.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: 8, color: '#fff' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full sm:w-1/2 space-y-2 sm:text-right">
              {modelCoverage.map((m, i) => (
                <div key={m.model} className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span>{m.model}: {m.count} {LABELS.shifts}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-gray-400 text-center py-8">{LABELS.noDataYet}</p>
        )}
      </div>
    </div>
  );
}
