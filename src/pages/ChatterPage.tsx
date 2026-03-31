import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChatterAuth } from '../hooks/useChatterAuth';
import { ChatterLayout } from '../components/chatter/ChatterLayout';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { ToastContainer } from '../components/shared/ToastContainer';
import { LABELS, getWeekDates, formatTime, cn } from '../lib/utils';
import { AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../hooks/useToast';
import type { Model, Shift } from '../lib/types';
import { StatusBadge } from '../components/shared/StatusBadge';
import { DailySummaryModal } from '../components/chatter/DailySummaryModal';

export function ChatterPage() {
  const navigate = useNavigate();
  const { profile, chatter, loading, error, logout } = useChatterAuth();
  const { toasts, showToast, dismissToast } = useToast();
  const [weekOffset, setWeekOffset] = useState(0);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loadingShifts, setLoadingShifts] = useState(false);
  const [actionShiftId, setActionShiftId] = useState<string | null>(null);
  const [clockOutShift, setClockOutShift] = useState<Shift | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [monthlyGoal, setMonthlyGoal] = useState<number | null>(null);
  const [monthlyEarned, setMonthlyEarned] = useState(0);

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);

  const fetchShifts = useCallback(async () => {
    if (!chatter) return;
    setLoadingShifts(true);
    const { data, error: fetchError } = await supabase
      .from('shifts')
      .select('*')
      .eq('chatter_id', chatter.id)
      .gte('date', weekDates[0])
      .lte('date', weekDates[6])
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (fetchError) {
      showToast('error', LABELS.noConnection);
      setLoadingShifts(false);
      return;
    }
    setShifts((data ?? []) as Shift[]);
    setLoadingShifts(false);
  }, [chatter, weekDates, showToast]);

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
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const monthStartStr = monthStart.toISOString().slice(0, 10);
    const nextMonthStr = nextMonth.toISOString().slice(0, 10);

    const { data: goalData, error: goalError } = await supabase
      .from('monthly_goals')
      .select('goal_amount')
      .eq('chatter_id', chatter.id)
      .eq('month', monthStartStr)
      .maybeSingle();

    if (goalError) {
      showToast('error', LABELS.noConnection);
      return;
    }

    const { data: incomes, error: incomesError } = await supabase
      .from('daily_summaries')
      .select('income_total')
      .eq('chatter_id', chatter.id)
      .gte('date', monthStartStr)
      .lt('date', nextMonthStr);

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
    if (!chatter) return;
    let active = true;
    Promise.resolve().then(() => {
      if (active) {
        void fetchShifts();
        void fetchModels();
        void fetchMonthlyProgress();
      }
    });
    return () => {
      active = false;
    };
  }, [chatter, fetchShifts, fetchModels, fetchMonthlyProgress]);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  function classifyShiftWindow(startTime: string) {
    const hour = Number(startTime.slice(0, 2));
    if (startTime.startsWith('12:00') || (hour >= 6 && hour < 19)) {
      return 'morning' as const;
    }
    return 'evening' as const;
  }

  function shiftDateTime(date: string, time: string) {
    return new Date(`${date}T${time}:00`);
  }

  function shiftEndDateTime(shift: Shift) {
    const start = shiftDateTime(shift.date, shift.start_time);
    const end = shiftDateTime(shift.date, shift.end_time);
    if (end.getTime() <= start.getTime()) {
      end.setDate(end.getDate() + 1);
    }
    return end;
  }

  function canClockIn(shift: Shift) {
    if (shift.status !== 'scheduled') return false;
    const now = new Date();
    const start = shiftDateTime(shift.date, shift.start_time);
    const end = shiftEndDateTime(shift);
    const diffMs = start.getTime() - now.getTime();
    const within15Before = diffMs <= 15 * 60 * 1000;
    return within15Before && now.getTime() <= end.getTime();
  }

  async function handleClockIn(shift: Shift) {
    if (!chatter) return;
    setActionShiftId(shift.id);
    const nowIso = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('shifts')
      .update({ status: 'active', clocked_in: nowIso })
      .eq('id', shift.id);

    if (updateError) {
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
    await fetchShifts();
  }

  const shiftsByDateAndWindow: Record<string, { morning: Shift[]; evening: Shift[] }> = {};
  weekDates.forEach((date) => {
    shiftsByDateAndWindow[date] = { morning: [], evening: [] };
  });
  shifts.forEach((shift) => {
    const day = shiftsByDateAndWindow[shift.date];
    if (!day) return;
    const window = classifyShiftWindow(shift.start_time);
    day[window].push(shift);
  });

  function formatHeaderDate(dateStr: string) {
    const d = new Date(`${dateStr}T00:00:00`);
    return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
  }

  function formatWeekLabel() {
    return `${formatHeaderDate(weekDates[0])} - ${formatHeaderDate(weekDates[6])}`;
  }

  function platformLabel(platform: Shift['platform']) {
    if (platform === 'telegram') return '📱 טלגרם';
    if (platform === 'onlyfans') return '🔵 אונלי';
    return '';
  }

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
      <ChatterLayout
        chatterName={profile?.display_name ?? chatter?.name ?? ''}
        onLogout={handleLogout}
      >
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-white">
            שלום, {profile?.display_name ?? chatter?.name ?? ''}
          </h2>

          <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            {monthlyGoal === null ? (
              <p className="text-sm text-gray-300">לא הוגדר יעד לחודש זה</p>
            ) : (
              <>
                <p className="text-sm text-gray-200">
                  יעד חודשי: ₪{monthlyEarned} / ₪{monthlyGoal}
                </p>
                <div className="mt-2 h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500"
                    style={{
                      width: `${Math.min(
                        100,
                        monthlyGoal > 0 ? (monthlyEarned / monthlyGoal) * 100 : 0
                      )}%`,
                    }}
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex items-center justify-between">
            <button
              onClick={() => setWeekOffset((prev) => prev - 1)}
              className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300"
            >
              <ChevronRight size={18} />
            </button>
            <div className="text-sm text-gray-300">{formatWeekLabel()}</div>
            <button
              onClick={() => setWeekOffset((prev) => prev + 1)}
              className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300"
            >
              <ChevronLeft size={18} />
            </button>
          </div>

          {loadingShifts ? (
            <LoadingSpinner />
          ) : (
            <div className="overflow-x-auto -mx-4 px-4">
              <div className="grid grid-cols-8 gap-2 min-w-[980px]">
                <div className="text-center pb-2 border-b border-gray-700" />
                {weekDates.map((date, i) => (
                  <div key={date} className="text-center pb-2 border-b border-gray-700">
                    <p className="text-xs font-semibold mb-1 text-gray-400">{LABELS.days[i]}</p>
                    <p className="text-sm font-bold text-gray-300">{formatHeaderDate(date)}</p>
                  </div>
                ))}

                {[
                  { key: 'morning' as const, label: 'בוקר', time: '12:00–19:00' },
                  { key: 'evening' as const, label: 'ערב', time: '19:00–02:00' },
                ].map((window) => (
                  <div key={window.key} className="contents">
                    <div className="rounded-lg bg-gray-900/80 border border-gray-800 p-3">
                      <p className="text-sm font-bold text-white">{window.label}</p>
                      <p className="text-xs text-gray-400 mt-1">{window.time}</p>
                    </div>

                    {weekDates.map((date) => (
                      <div
                        key={`${window.key}-${date}`}
                        className="min-h-[170px] rounded-lg p-2 space-y-2 border bg-gray-800/30 border-gray-800"
                      >
                        {shiftsByDateAndWindow[date][window.key].map((shift) => (
                          <div
                            key={shift.id}
                            className={cn(
                              'rounded-md p-2 border',
                              shift.status === 'active'
                                ? 'bg-green-900/35 border-green-900/60'
                                : shift.status === 'completed'
                                  ? 'bg-blue-900/25 border-blue-900/60'
                                  : shift.status === 'missed'
                                    ? 'bg-red-900/30 border-red-900/60'
                                    : 'bg-gray-700/40 border-gray-700'
                            )}
                          >
                            {shift.model && (
                              <p className="text-xs font-semibold text-white truncate mb-1">
                                {shift.model}
                              </p>
                            )}
                            {platformLabel(shift.platform) && (
                              <p className="text-[11px] text-gray-300 mb-1">
                                {platformLabel(shift.platform)}
                              </p>
                            )}
                            <p className="text-[11px] text-gray-400 font-mono mb-2">
                              {formatTime(shift.start_time)}–{formatTime(shift.end_time)}
                            </p>
                            <StatusBadge status={shift.status} />

                            {canClockIn(shift) && (
                              <button
                                onClick={() => handleClockIn(shift)}
                                disabled={actionShiftId === shift.id}
                                className="w-full mt-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-xs font-medium rounded-md py-1.5"
                              >
                                כניסה למשמרת
                              </button>
                            )}

                            {shift.status === 'active' && (
                              <button
                                onClick={() => setClockOutShift(shift)}
                                disabled={actionShiftId === shift.id}
                                className="w-full mt-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-medium rounded-md py-1.5"
                              >
                                יציאה ממשמרת
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </ChatterLayout>

      {clockOutShift && chatter && (
        <DailySummaryModal
          shift={clockOutShift}
          chatterId={chatter.id}
          models={models}
          onClose={() => setClockOutShift(null)}
          onSubmitted={async () => {
            await fetchShifts();
            await fetchMonthlyProgress();
          }}
          showToast={showToast}
        />
      )}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
