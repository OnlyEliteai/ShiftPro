import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { useAnalyticsData } from '../../hooks/useAnalyticsData';
import { useAnalyticsViewModel } from '../../hooks/useAnalyticsViewModel';
import { OverviewTab } from './analytics/OverviewTab';
import { ChattersTab } from './analytics/ChattersTab';
import { PlatformsTab } from './analytics/PlatformsTab';
import { GoalsTab } from './analytics/GoalsTab';

type AnalyticsTabKey = 'overview' | 'chatters' | 'platforms' | 'goals';
type RangePreset = 'today' | 'week' | 'month' | '3months' | 'custom';

const TABS: Array<{ key: AnalyticsTabKey; label: string }> = [
  { key: 'overview', label: 'סקירה' },
  { key: 'chatters', label: 'צ׳אטרים' },
  { key: 'platforms', label: 'פלטפורמות' },
  { key: 'goals', label: 'יעדים' },
];

const PRESETS: Array<{ key: RangePreset; label: string }> = [
  { key: 'today', label: 'היום' },
  { key: 'week', label: 'שבוע' },
  { key: 'month', label: 'חודש' },
  { key: '3months', label: '3 חודשים' },
  { key: 'custom', label: 'טווח מותאם' },
];

function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfWeek(date: Date): Date {
  const output = new Date(date);
  output.setDate(date.getDate() - date.getDay());
  return output;
}

function endOfWeek(date: Date): Date {
  const output = startOfWeek(date);
  output.setDate(output.getDate() + 6);
  return output;
}

function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthEnd(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function toMonthInput(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
}

function presetRange(preset: RangePreset, customStart: string, customEnd: string) {
  const now = new Date();

  if (preset === 'custom') return { startDate: customStart, endDate: customEnd };
  if (preset === 'today') {
    const today = toDateOnly(now);
    return { startDate: today, endDate: today };
  }
  if (preset === 'week') {
    return { startDate: toDateOnly(startOfWeek(now)), endDate: toDateOnly(endOfWeek(now)) };
  }
  if (preset === 'month') {
    return { startDate: toDateOnly(monthStart(now)), endDate: toDateOnly(monthEnd(now)) };
  }

  const start = monthStart(new Date(now.getFullYear(), now.getMonth() - 2, 1));
  return { startDate: toDateOnly(start), endDate: toDateOnly(monthEnd(now)) };
}

export function Analytics() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [preset, setPreset] = useState<RangePreset>('month');
  const [customStart, setCustomStart] = useState(() => toDateOnly(monthStart(new Date())));
  const [customEnd, setCustomEnd] = useState(() => toDateOnly(monthEnd(new Date())));
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 639px)').matches);
  const [goalMonth, setGoalMonth] = useState(() => toMonthInput());

  const tabFromUrl = searchParams.get('tab');
  const activeTab: AnalyticsTabKey = TABS.some((tab) => tab.key === tabFromUrl)
    ? (tabFromUrl as AnalyticsTabKey)
    : 'overview';

  const range = useMemo(() => presetRange(preset, customStart, customEnd), [preset, customStart, customEnd]);
  const { shifts, summaries, goals, chatters, activity, activeNow, loading, error, refetch, isLive } = useAnalyticsData(range);

  const {
    attendanceKpi,
    avgDelayKpi,
    currentGoalTotal,
    monthlyGoalKpi,
    weeklyTrend,
    platformSplit,
    chatterRows,
    weeklyPlatform,
    modelCoverageRows,
    goalRows,
  } = useAnalyticsViewModel({
    shifts,
    summaries,
    goals,
    chatters,
    activity,
    startDate: range.startDate,
    endDate: range.endDate,
    goalMonth,
  });

  useEffect(() => {
    const query = window.matchMedia('(max-width: 639px)');
    const listener = () => setIsMobile(query.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);

  const setTab = (tab: AnalyticsTabKey) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    setSearchParams(next, { replace: true });
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="w-full max-w-6xl mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-white">אנליטיקס</h2>
        <div className="flex items-center gap-2">
          {isLive && (
            <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2 py-1 text-xs text-green-300">● חי</span>
          )}
          <button
            type="button"
            onClick={() => {
              void refetch();
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-100"
          >
            <RefreshCw size={14} />
            רענן
          </button>
        </div>
      </div>

      <div className="sticky top-0 z-20 rounded-xl border border-gray-800 bg-gray-900/95 p-3 backdrop-blur sm:static sm:bg-gray-900">
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setPreset(item.key)}
              className={`rounded-full px-3 py-1 text-xs sm:text-sm ${preset === item.key ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300'}`}
            >
              {item.label}
            </button>
          ))}

          {preset === 'custom' && (
            <div className="ms-auto flex flex-wrap items-center gap-2">
              <input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} className="rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-white" />
              <input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} className="rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-white" />
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto sm:flex-wrap">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setTab(tab.key)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${activeTab === tab.key ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          שגיאה בטעינת נתונים. נסה שוב
          <button
            type="button"
            onClick={() => {
              void refetch();
            }}
            className="ms-3 underline"
          >
            נסה שוב
          </button>
        </div>
      )}

      {activeTab === 'overview' && (
        <OverviewTab
          isMobile={isMobile}
          weeklyTrend={weeklyTrend}
          platformSplit={platformSplit}
          kpi={{
            attendanceRate: attendanceKpi.rate,
            avgDelayMinutes: avgDelayKpi.avgSeconds == null ? null : avgDelayKpi.avgSeconds / 60,
            activeNow,
            goalProgressPct: monthlyGoalKpi.pct == null ? null : Math.min(monthlyGoalKpi.pct, 999),
            hasGoal: currentGoalTotal > 0,
          }}
        />
      )}

      {activeTab === 'chatters' && <ChattersTab rows={chatterRows} isMobile={isMobile} />}
      {activeTab === 'platforms' && <PlatformsTab weeklyPlatform={weeklyPlatform} modelCoverage={modelCoverageRows} isMobile={isMobile} />}
      {activeTab === 'goals' && <GoalsTab month={goalMonth} onMonthChange={setGoalMonth} rows={goalRows} />}
    </div>
  );
}
