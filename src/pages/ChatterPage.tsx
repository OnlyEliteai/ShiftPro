import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChatterAuth } from '../hooks/useChatterAuth';
import { ChatterLayout } from '../components/chatter/ChatterLayout';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { ToastContainer } from '../components/shared/ToastContainer';
import { LABELS, formatTime, cn } from '../lib/utils';
import { AlertCircle, Clock3, Timer } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../hooks/useToast';
import type { Model, Shift } from '../lib/types';
import { DailySummaryModal } from '../components/chatter/DailySummaryModal';

const ISRAEL_TIMEZONE = 'Asia/Jerusalem';

interface IsraelDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function getIsraelDateParts(date: Date = new Date()): IsraelDateParts {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ISRAEL_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');

  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  };
}

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function toDateKey(year: number, month: number, day: number) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function getIsraelTodayDateKey() {
  const today = getIsraelDateParts();
  return toDateKey(today.year, today.month, today.day);
}

function getIsraelWeekRange() {
  const today = getIsraelDateParts();
  const todayUtc = new Date(Date.UTC(today.year, today.month - 1, today.day));
  const dayOfWeek = todayUtc.getUTCDay();
  const weekStart = new Date(todayUtc);
  weekStart.setUTCDate(todayUtc.getUTCDate() - dayOfWeek);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);

  return {
    start: toDateKey(
      weekStart.getUTCFullYear(),
      weekStart.getUTCMonth() + 1,
      weekStart.getUTCDate()
    ),
    end: toDateKey(
      weekEnd.getUTCFullYear(),
      weekEnd.getUTCMonth() + 1,
      weekEnd.getUTCDate()
    ),
  };
}

function getIsraelMonthRange() {
  const now = getIsraelDateParts();
  const start = `${now.year}-${pad2(now.month)}-01`;
  const nextYear = now.month === 12 ? now.year + 1 : now.year;
  const nextMonth = now.month === 12 ? 1 : now.month + 1;
  const endExclusive = `${nextYear}-${pad2(nextMonth)}-01`;
  return { start, endExclusive };
}

function toWallClockMinutes(date: string, time: string) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day, hour, minute, 0) / 60_000);
}

function getCurrentIsraelWallClockMinutes() {
  const now = getIsraelDateParts();
  return Math.floor(
    Date.UTC(now.year, now.month - 1, now.day, now.hour, now.minute, now.second) / 60_000
  );
}

function getMinutesUntilShift(shift: Shift) {
  return toWallClockMinutes(shift.date, shift.start_time) - getCurrentIsraelWallClockMinutes();
}

function formatRelativeTime(minutes: number) {
  if (minutes <= 0) return 'עכשיו';
  if (minutes < 60) return `בעוד ${minutes} דק׳`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) return `בעוד ${hours} שע׳`;
  return `בעוד ${hours} שע׳ ${remainingMinutes} דק׳`;
}

function formatElapsedDuration(isoTimestamp: string, nowMs: number) {
  const start = new Date(isoTimestamp);
  const diffMs = Math.max(0, nowMs - start.getTime());
  const totalMinutes = Math.floor(diffMs / 60_000);
  if (totalMinutes < 60) return `${totalMinutes} דק׳`;
  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  if (remainingMinutes === 0) return `${hours} שע׳`;
  return `${hours} שע׳ ${remainingMinutes} דק׳`;
}

function getShiftTypeLabel(startTime: string) {
  const hour = Number(startTime.slice(0, 2));
  return hour < 19 ? 'בוקר' : 'ערב';
}

function getPlatformLabel(platform: Shift['platform']) {
  if (platform === 'telegram') return 'טלגרם';
  if (platform === 'onlyfans') return 'אונליפאנס';
  return 'לא צוין';
}

function formatHebrewDate(dateString: string) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: ISRAEL_TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'numeric',
  }).format(date);
}

function formatHebrewCurrentDate() {
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: ISRAEL_TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}

function getWeeklyStatusBadge(shift: Shift) {
  const isToday = shift.date === getIsraelTodayDateKey();
  if (shift.status === 'pending') {
    return { label: 'ממתין לאישור', className: 'bg-yellow-500/15 text-yellow-300' };
  }
  if (shift.status === 'rejected') {
    return { label: 'נדחה', className: 'bg-red-500/15 text-red-300 line-through' };
  }
  if (shift.status === 'completed') {
    return { label: 'הושלם', className: 'bg-emerald-500/15 text-emerald-300' };
  }
  if (shift.status === 'missed') {
    return { label: 'פספוס', className: 'bg-red-500/15 text-red-300' };
  }
  if (isToday) {
    return { label: 'היום', className: 'bg-blue-500/15 text-blue-300' };
  }
  if (shift.status === 'active') {
    return { label: 'פעיל', className: 'bg-emerald-500/15 text-emerald-300' };
  }
  return { label: 'מתוכנן', className: 'bg-gray-500/15 text-gray-300' };
}

export function ChatterPage() {
  const navigate = useNavigate();
  const { profile, chatter, loading, error, logout } = useChatterAuth();
  const { toasts, showToast, dismissToast } = useToast();
  const [weeklyShifts, setWeeklyShifts] = useState<Shift[]>([]);
  const [nextShift, setNextShift] = useState<Shift | null>(null);
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [loadingShifts, setLoadingShifts] = useState(false);
  const [actionShiftId, setActionShiftId] = useState<string | null>(null);
  const [clockOutShift, setClockOutShift] = useState<Shift | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [monthlyGoal, setMonthlyGoal] = useState<number | null>(null);
  const [monthlyEarned, setMonthlyEarned] = useState(0);
  const [currentTimestamp, setCurrentTimestamp] = useState(() => Date.now());
  const weekRange = useMemo(() => getIsraelWeekRange(), []);
  const currentDateLabel = useMemo(() => formatHebrewCurrentDate(), []);
  const displayName = profile?.display_name ?? chatter?.name ?? '';
  const avatarLetter = (displayName.trim().charAt(0) || 'צ').toUpperCase();
  const activeDuration =
    activeShift?.clocked_in
      ? formatElapsedDuration(activeShift.clocked_in, currentTimestamp)
      : '';

  const fetchShiftData = useCallback(async () => {
    if (!chatter) return;
    setLoadingShifts(true);

    const today = getIsraelTodayDateKey();
    const [weeklyRes, upcomingRes, activeRes] = await Promise.all([
      supabase
        .from('shifts')
        .select('*')
        .eq('chatter_id', chatter.id)
        .gte('date', weekRange.start)
        .lte('date', weekRange.end)
        .order('date', { ascending: true })
        .order('start_time', { ascending: true }),
      supabase
        .from('shifts')
        .select('*')
        .eq('chatter_id', chatter.id)
        .eq('status', 'scheduled')
        .gte('date', today)
        .order('date', { ascending: true })
        .order('start_time', { ascending: true }),
      supabase
        .from('shifts')
        .select('*')
        .eq('chatter_id', chatter.id)
        .eq('status', 'active')
        .order('date', { ascending: false })
        .order('start_time', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (weeklyRes.error || upcomingRes.error || activeRes.error) {
      showToast('error', LABELS.noConnection);
      setLoadingShifts(false);
      return;
    }

    const weeklyData = (weeklyRes.data ?? []) as Shift[];
    const upcomingShifts = (upcomingRes.data ?? []) as Shift[];
    const nearestFutureShift =
      upcomingShifts.find((shift) => getMinutesUntilShift(shift) >= 0) ?? null;

    setWeeklyShifts(weeklyData);
    setNextShift(nearestFutureShift);
    setActiveShift((activeRes.data as Shift | null) ?? null);
    setLoadingShifts(false);
  }, [chatter, weekRange.end, weekRange.start, showToast]);

  const fetchModels = useCallback(async () => {
    const { data, error: modelsError } = await supabase
      .from('models')
      .select('*')
      .eq('active', true)
      .order('name', { ascending: true });

    if (modelsError) {
      showToast('error', LABELS.noConnection);
      return;
    }
    setModels((data ?? []) as Model[]);
  }, [showToast]);

  const fetchMonthlyProgress = useCallback(async () => {
    if (!chatter) return;
    const monthRange = getIsraelMonthRange();

    const { data: goalData, error: goalError } = await supabase
      .from('monthly_goals')
      .select('goal_amount')
      .eq('chatter_id', chatter.id)
      .eq('month', monthRange.start)
      .maybeSingle();

    if (goalError) {
      showToast('error', LABELS.noConnection);
      return;
    }

    const { data: incomes, error: incomesError } = await supabase
      .from('daily_summaries')
      .select('income_total')
      .eq('chatter_id', chatter.id)
      .gte('date', monthRange.start)
      .lt('date', monthRange.endExclusive);

    if (incomesError) {
      showToast('error', LABELS.noConnection);
      return;
    }

    const earned = (incomes ?? []).reduce(
      (sum, row) => sum + Number(row.income_total ?? 0),
      0
    );
    setMonthlyEarned(earned);
    setMonthlyGoal(goalData ? Number(goalData.goal_amount ?? 0) : null);
  }, [chatter, showToast]);

  useEffect(() => {
    if (!loading && error === 'NO_AUTH') {
      navigate('/login', { replace: true });
    }
  }, [loading, error, navigate]);

  useEffect(() => {
    if (!activeShift?.clocked_in) return;
    const intervalId = window.setInterval(() => {
      setCurrentTimestamp(Date.now());
    }, 60_000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeShift?.clocked_in]);

  useEffect(() => {
    if (!chatter) return;
    let active = true;
    Promise.resolve().then(() => {
      if (active) {
        void fetchShiftData();
        void fetchModels();
        void fetchMonthlyProgress();
      }
    });
    return () => {
      active = false;
    };
  }, [chatter, fetchShiftData, fetchModels, fetchMonthlyProgress]);

  // Realtime: re-fetch when this chatter's shifts, goals, or summaries change
  useEffect(() => {
    if (!chatter) return;

    const channel = supabase
      .channel(`chatter-realtime-${chatter.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shifts', filter: `chatter_id=eq.${chatter.id}` },
        () => { void fetchShiftData(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'monthly_goals', filter: `chatter_id=eq.${chatter.id}` },
        () => { void fetchMonthlyProgress(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_summaries', filter: `chatter_id=eq.${chatter.id}` },
        () => { void fetchMonthlyProgress(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatter, fetchShiftData, fetchMonthlyProgress]);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  async function handleClockIn(shift: Shift) {
    if (!chatter) return;
    setActionShiftId(shift.id);
    const nowIso = new Date().toISOString();

    const { data: updatedShift, error: updateError } = await supabase
      .from('shifts')
      .update({ status: 'active', clocked_in: nowIso })
      .eq('id', shift.id)
      .eq('chatter_id', chatter.id)
      .eq('status', 'scheduled')
      .select('id')
      .maybeSingle();

    if (updateError || !updatedShift) {
      showToast('error', LABELS.clockInError);
      setActionShiftId(null);
      return;
    }

    const { error: activityError } = await supabase.from('activity_log').insert({
      shift_id: shift.id,
      chatter_id: chatter.id,
      action: 'clock_in',
    });

    if (activityError) {
      showToast('error', LABELS.noConnection);
      setActionShiftId(null);
      return;
    }

    showToast('success', LABELS.clockedInSuccess);
    setActionShiftId(null);
    await fetchShiftData();
  }

  const weeklyStats = useMemo(() => {
    const total = weeklyShifts.length;
    const completed = weeklyShifts.filter((shift) => shift.status === 'completed').length;
    const missed = weeklyShifts.filter((shift) => shift.status === 'missed').length;
    return { total, completed, missed };
  }, [weeklyShifts]);

  const monthlyProgressPercent =
    monthlyGoal && monthlyGoal > 0 ? Math.min(100, (monthlyEarned / monthlyGoal) * 100) : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (error === 'NO_AUTH') {
    // Will redirect via useEffect above
    return null;
  }

  if (error && error !== 'NO_AUTH') {
    return (
      <div
        className="min-h-screen bg-gray-950 flex items-center justify-center px-4"
      >
        <div className="max-w-sm w-full text-center space-y-3">
          <AlertCircle size={40} className="text-red-500 mx-auto" />
          <p className="text-red-400 text-sm">
            {error === 'NO_CHATTER_ROLE'
              ? LABELS.noPermission
              : LABELS.cannotVerifyLink}
          </p>
          <button
            onClick={() => navigate('/login', { replace: true })}
            className="text-blue-400 hover:text-blue-300 text-sm underline"
          >
            {LABELS.backToLogin}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <ChatterLayout onLogout={handleLogout}>
        <div className="space-y-4">
          <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4 flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-[#1D9E75]/20 border border-[#1D9E75]/40 flex items-center justify-center text-lg font-bold text-[#1D9E75]">
              {avatarLetter}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-400">{currentDateLabel}</p>
              <h1 className="text-xl font-bold text-white truncate">היי {displayName}!</h1>
            </div>
          </section>

          {activeShift && (
            <section className="rounded-2xl border border-emerald-700/40 bg-emerald-900/20 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-bold text-white">משמרת פעילה עכשיו</h2>
                <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
                  <Timer size={14} />
                  פעיל כבר {activeDuration}
                </span>
              </div>
              <div className="text-sm text-gray-200 space-y-1">
                <p>{formatHebrewDate(activeShift.date)}</p>
                <p className="font-mono text-gray-300">
                  {formatTime(activeShift.start_time)}–{formatTime(activeShift.end_time)}
                </p>
                <p className="text-gray-300">
                  מודל: {activeShift.model ?? LABELS.modelNotFound} • פלטפורמה:{' '}
                  {getPlatformLabel(activeShift.platform)} • סוג: {getShiftTypeLabel(activeShift.start_time)}
                </p>
              </div>
              <button
                onClick={() => setClockOutShift(activeShift)}
                className="w-full min-h-[48px] rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold"
              >
                סיום משמרת
              </button>
            </section>
          )}

          <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-bold text-white">המשמרת הבאה</h2>
              {nextShift && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 text-blue-300 text-xs px-2 py-1">
                  <Clock3 size={13} />
                  {formatRelativeTime(getMinutesUntilShift(nextShift))}
                </span>
              )}
            </div>

            {nextShift ? (
              <>
                <div className="text-sm text-gray-200 space-y-1">
                  <p>{formatHebrewDate(nextShift.date)}</p>
                  <p className="font-mono text-gray-300">
                    {formatTime(nextShift.start_time)}–{formatTime(nextShift.end_time)}
                  </p>
                  <p className="text-gray-300">
                    מודל: {nextShift.model ?? LABELS.modelNotFound} • פלטפורמה:{' '}
                    {getPlatformLabel(nextShift.platform)} • סוג: {getShiftTypeLabel(nextShift.start_time)}
                  </p>
                </div>
                <button
                  onClick={() => handleClockIn(nextShift)}
                  disabled={actionShiftId === nextShift.id || Boolean(activeShift)}
                  className="w-full min-h-[48px] rounded-xl bg-[#1D9E75] hover:bg-[#188561] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold"
                >
                  {actionShiftId === nextShift.id ? LABELS.connecting : LABELS.clockIn}
                </button>
              </>
            ) : (
              <p className="text-sm text-gray-400">{LABELS.noUpcomingShifts}</p>
            )}
          </section>

          <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
            <h2 className="text-base font-bold text-white mb-2">יעד חודשי</h2>
            {monthlyGoal === null ? (
              <p className="text-sm text-gray-300">לא הוגדר יעד חודשי</p>
            ) : (
              <>
                <p className="text-sm text-gray-200 mb-1">
                  ₪{monthlyEarned.toLocaleString('he-IL')} מתוך ₪
                  {monthlyGoal.toLocaleString('he-IL')}
                </p>
                <p className="text-xs text-gray-400 mb-2">
                  {Math.round(monthlyProgressPercent)}% מהיעד
                </p>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full"
                    style={{ width: `${monthlyProgressPercent}%`, backgroundColor: '#1D9E75' }}
                  />
                </div>
              </>
            )}
          </section>

          <section className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-3 text-center">
              <p className="text-xs text-gray-400">השבוע</p>
              <p className="text-lg font-bold text-white">{weeklyStats.total}</p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-3 text-center">
              <p className="text-xs text-gray-400">הושלמו</p>
              <p className="text-lg font-bold text-emerald-400">{weeklyStats.completed}</p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-3 text-center">
              <p className="text-xs text-gray-400">לא הגיע</p>
              <p className="text-lg font-bold text-red-400">{weeklyStats.missed}</p>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-white">משמרות השבוע</h2>
              <span className="text-xs text-gray-400">
                {weekRange.start} - {weekRange.end}
              </span>
            </div>

            {loadingShifts ? (
              <LoadingSpinner />
            ) : weeklyShifts.length === 0 ? (
              <p className="text-sm text-gray-400">{LABELS.noUpcomingShifts}</p>
            ) : (
              <div className="space-y-2">
                {weeklyShifts.map((shift) => {
                  const isNextShift = nextShift?.id === shift.id;
                  const isToday = shift.date === getIsraelTodayDateKey();
                  const badge = getWeeklyStatusBadge(shift);
                  return (
                    <article
                      key={shift.id}
                      className={cn(
                        'rounded-xl border p-3',
                        isNextShift
                          ? 'border-[#1D9E75]/50 bg-[#1D9E75]/10'
                          : isToday
                            ? 'border-blue-500/40 bg-blue-500/10'
                          : 'border-gray-800 bg-gray-800/40'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div>
                          <p className="text-sm font-semibold text-white">{formatHebrewDate(shift.date)}</p>
                          <p className="text-xs text-gray-400 font-mono">
                            {formatTime(shift.start_time)}–{formatTime(shift.end_time)}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </div>

                      <div className="text-xs text-gray-300">
                        מודל: {shift.model ?? LABELS.modelNotFound} • פלטפורמה:{' '}
                        {getPlatformLabel(shift.platform)} • סוג: {getShiftTypeLabel(shift.start_time)}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </ChatterLayout>

      {clockOutShift && chatter && (
        <DailySummaryModal
          shift={clockOutShift}
          chatterId={chatter.id}
          models={models}
          onClose={() => setClockOutShift(null)}
          onSubmitted={async () => {
            await fetchShiftData();
            await fetchMonthlyProgress();
          }}
          showToast={showToast}
        />
      )}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
