import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChatterAuth } from '../hooks/useChatterAuth';
import { ChatterLayout } from '../components/chatter/ChatterLayout';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { ToastContainer } from '../components/shared/ToastContainer';
import { LABELS, formatTime, cn } from '../lib/utils';
import { AlertCircle, Clock3, Timer, XCircle } from 'lucide-react';
import { SUPABASE_URL, supabase, callEdgeFunction } from '../lib/supabase';
import { useToast } from '../hooks/useToast';
import type { Model, Platform, Shift, ShiftAssignment, ShiftSlot, ShiftWithChatter } from '../lib/types';
import { DailySummaryModal } from '../components/chatter/DailySummaryModal';

const ISRAEL_TIMEZONE = 'Asia/Jerusalem';
const SHIFT_SELECT_WITH_ASSIGNMENTS = `
  *,
  shift_assignments(id, shift_id, model_id, model, platform, shift_date, shift_start_time, assigned_at)
`;

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

function getWeekDatesFromStart(startDate: string) {
  const [year, month, day] = startDate.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, day));
  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(start);
    current.setUTCDate(start.getUTCDate() + index);
    return toDateKey(
      current.getUTCFullYear(),
      current.getUTCMonth() + 1,
      current.getUTCDate()
    );
  });
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

function getPlatformLabel(platform: Platform) {
  return platform === 'telegram' ? 'טלגרם' : 'אונליפאנס';
}

function getShiftAssignments(shift: Shift): Pick<ShiftAssignment, 'model' | 'platform'>[] {
  if (shift.shift_assignments && shift.shift_assignments.length > 0) {
    return shift.shift_assignments.map((assignment) => ({
      model: assignment.model,
      platform: assignment.platform,
    }));
  }

  if (shift.model && shift.platform) {
    return [{ model: shift.model, platform: shift.platform }];
  }

  return [];
}

function formatAssignmentsSummary(shift: Shift) {
  const assignments = getShiftAssignments(shift);
  if (assignments.length === 0) return '';

  const byPlatform = new Map<Platform, string[]>();
  for (const assignment of assignments) {
    const list = byPlatform.get(assignment.platform) ?? [];
    list.push(assignment.model);
    byPlatform.set(assignment.platform, list);
  }

  return Array.from(byPlatform.entries())
    .map(([platform, models]) => `${models.join(', ')} (${getPlatformLabel(platform)})`)
    .join(' • ');
}

function getSlotTypeLabel(shiftType: ShiftSlot['shift_type']) {
  return shiftType === 'morning' ? 'בוקר' : 'ערב';
}

function getSlotTimeWindow(shiftType: ShiftSlot['shift_type']) {
  if (shiftType === 'morning') {
    return { start: '12:00', end: '19:00' };
  }
  return { start: '19:00', end: '02:00' };
}

function getShiftTypeByStartTime(startTime: string): ShiftSlot['shift_type'] {
  if (startTime.startsWith('12:00')) return 'morning';
  if (startTime.startsWith('19:00')) return 'evening';
  return Number(startTime.slice(0, 2)) < 19 ? 'morning' : 'evening';
}

function getSlotKey(
  date: string,
  shiftType: ShiftSlot['shift_type']
) {
  return `${date}|${shiftType}`;
}

interface GroupedAvailableSlot {
  key: string;
  date: string;
  shift_type: ShiftSlot['shift_type'];
  total_capacity: number;
  occupied: number;
  is_full: boolean;
  chatter_signed_up: boolean;
  signup_slot_id: string | null;
  queue_slot_id: string | null;
}

interface OnlineChatter {
  chatter_id: string;
  name: string;
}

function getShiftTypeOrder(shiftType: ShiftSlot['shift_type']) {
  return shiftType === 'morning' ? 0 : 1;
}

function mapClockInErrorMessage(status: number, rawMessage?: string) {
  const tooEarlyMessage = 'עוד מוקדם מדי — אפשר לסמן כניסה עד 30 דקות לפני תחילת המשמרת';
  const tooLateMessage = 'המשמרת כבר עברה — פנה למנהל';
  const alreadyClockedInMessage = 'כבר סימנת כניסה למשמרת הזו';

  const normalized = (rawMessage ?? '').toLowerCase();
  if (
    normalized.includes('מוקדם') ||
    normalized.includes('too early') ||
    normalized.includes('before')
  ) {
    return tooEarlyMessage;
  }
  if (
    normalized.includes('עברה') ||
    normalized.includes('too late') ||
    normalized.includes('passed') ||
    normalized.includes('after')
  ) {
    return tooLateMessage;
  }
  if (
    normalized.includes('כבר') ||
    normalized.includes('already') ||
    normalized.includes('not in scheduled') ||
    normalized.includes('active')
  ) {
    return alreadyClockedInMessage;
  }

  if ((status === 400 || status === 403) && rawMessage) {
    return rawMessage;
  }

  return LABELS.clockInError;
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

function formatHebrewShortDate(dateString: string) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return new Intl.DateTimeFormat('he-IL', {
    timeZone: ISRAEL_TIMEZONE,
    day: 'numeric',
    month: 'numeric',
  }).format(date);
}

function getWeeklyStatusBadge(shift: Shift) {
  const isToday = shift.date === getIsraelTodayDateKey();
  if (shift.status === 'pending') {
    return { label: 'ממתין לאישור', className: 'bg-yellow-500/15 text-yellow-300' };
  }
  if (shift.status === 'rejected') {
    return { label: 'נדחה', className: 'bg-red-500/15 text-red-300 line-through' };
  }
  if (shift.status === 'cancelled') {
    return { label: 'בוטל', className: 'bg-gray-500/15 text-gray-400 line-through' };
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

function getSharedBoardStatusBadge(status: Shift['status']) {
  if (status === 'active') {
    return { label: LABELS.active, className: 'bg-emerald-500/15 text-emerald-300' };
  }
  if (status === 'completed') {
    return { label: LABELS.completed, className: 'bg-blue-500/15 text-blue-300' };
  }
  return { label: LABELS.scheduled, className: 'bg-gray-500/15 text-gray-300' };
}

export function ChatterPage() {
  const navigate = useNavigate();
  const { profile, chatter, loading, error, logout } = useChatterAuth();
  const { toasts, showToast, dismissToast } = useToast();
  const [weeklyShifts, setWeeklyShifts] = useState<Shift[]>([]);
  const [sharedWeekShifts, setSharedWeekShifts] = useState<ShiftWithChatter[]>([]);
  const [nextShift, setNextShift] = useState<Shift | null>(null);
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [activeView, setActiveView] = useState<'my_shifts' | 'shared_board'>('my_shifts');
  const [loadingShifts, setLoadingShifts] = useState(false);
  const [loadingSharedBoard, setLoadingSharedBoard] = useState(false);
  const [actionShiftId, setActionShiftId] = useState<string | null>(null);
  const [clockOutShift, setClockOutShift] = useState<Shift | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [monthlyGoal, setMonthlyGoal] = useState<number | null>(null);
  const [monthlyEarned, setMonthlyEarned] = useState(0);
  const [currentTimestamp, setCurrentTimestamp] = useState(() => Date.now());
  const [availableSlots, setAvailableSlots] = useState<GroupedAvailableSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [onlineChatters, setOnlineChatters] = useState<OnlineChatter[]>([]);
  const [loadingOnlineChatters, setLoadingOnlineChatters] = useState(false);
  const [slotActionId, setSlotActionId] = useState<string | null>(null);
  const [clockInCandidates, setClockInCandidates] = useState<Shift[] | null>(null);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const weekRange = useMemo(() => getIsraelWeekRange(), []);
  const weekDates = useMemo(() => getWeekDatesFromStart(weekRange.start), [weekRange.start]);
  const currentDateLabel = useMemo(() => formatHebrewCurrentDate(), []);
  const displayName = profile?.display_name ?? chatter?.name ?? '';
  const avatarLetter = (displayName.trim().charAt(0) || 'צ').toUpperCase();
  const activeDuration =
    activeShift?.clocked_in
      ? formatElapsedDuration(activeShift.clocked_in, currentTimestamp)
      : '';

  const sharedShiftsByDateAndWindow = useMemo(() => {
    const grouped: Record<string, { morning: ShiftWithChatter[]; evening: ShiftWithChatter[] }> = {};
    weekDates.forEach((date) => {
      grouped[date] = { morning: [], evening: [] };
    });

    for (const shift of sharedWeekShifts) {
      if (!grouped[shift.date]) continue;
      const shiftType = getShiftTypeByStartTime(shift.start_time);
      grouped[shift.date][shiftType].push(shift);
    }

    return grouped;
  }, [sharedWeekShifts, weekDates]);

  const fetchShiftData = useCallback(async () => {
    if (!chatter) return;
    setLoadingShifts(true);

    const today = getIsraelTodayDateKey();
    const [weeklyRes, upcomingRes, activeRes] = await Promise.all([
      supabase
        .from('shifts')
        .select(SHIFT_SELECT_WITH_ASSIGNMENTS)
        .eq('chatter_id', chatter.id)
        .gte('date', weekRange.start)
        .lte('date', weekRange.end)
        .order('date', { ascending: true })
        .order('start_time', { ascending: true }),
      supabase
        .from('shifts')
        .select(SHIFT_SELECT_WITH_ASSIGNMENTS)
        .eq('chatter_id', chatter.id)
        .eq('status', 'scheduled')
        .gte('date', today)
        .order('date', { ascending: true })
        .order('start_time', { ascending: true }),
      supabase
        .from('shifts')
        .select(SHIFT_SELECT_WITH_ASSIGNMENTS)
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

  const fetchSharedScheduleData = useCallback(async () => {
    if (!chatter) return;
    setLoadingSharedBoard(true);

    const { data, error: sharedError } = await supabase
      .from('shifts')
      .select('*, chatters(name), shift_assignments(model, platform)')
      .in('date', weekDates)
      .in('status', ['scheduled', 'active', 'completed'])
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (sharedError) {
      showToast('error', LABELS.noConnection);
      setLoadingSharedBoard(false);
      return;
    }

    setSharedWeekShifts((data ?? []) as ShiftWithChatter[]);
    setLoadingSharedBoard(false);
  }, [chatter, showToast, weekDates]);

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

  const fetchAvailableSlots = useCallback(async () => {
    if (!chatter) return;
    setLoadingSlots(true);
    const today = getIsraelTodayDateKey();

    const { data, error: slotsError } = await supabase
      .from('shift_slots')
      .select('*')
      .gte('date', today)
      .in('status', ['open', 'full'])
      .order('date', { ascending: true })
      .order('shift_type', { ascending: true })
      .order('created_at', { ascending: true });

    if (slotsError) {
      showToast('error', LABELS.noConnection);
      setLoadingSlots(false);
      return;
    }

    const slotRows = (data ?? []) as ShiftSlot[];
    if (slotRows.length === 0) {
      setAvailableSlots([]);
      setLoadingSlots(false);
      return;
    }

    const seen = new Set<string>();
    const uniqueSlotRows = slotRows.filter((slot) => {
      const key = `${slot.date}-${slot.shift_type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const { data: occupancyData, error: occupancyError } = await supabase
      .from('shifts')
      .select('chatter_id, date, start_time, status')
      .gte('date', today)
      .in('status', ['pending', 'scheduled', 'active']);

    if (occupancyError) {
      showToast('error', LABELS.noConnection);
      setLoadingSlots(false);
      return;
    }

    const grouped = new Map<string, GroupedAvailableSlot>();
    for (const slot of uniqueSlotRows) {
      const key = getSlotKey(slot.date, slot.shift_type);
      grouped.set(key, {
        key,
        date: slot.date,
        shift_type: slot.shift_type,
        total_capacity: Math.max(1, Number(slot.max_chatters ?? 1)),
        occupied: 0,
        is_full: false,
        chatter_signed_up: false,
        signup_slot_id: slot.status === 'open' ? slot.id : null,
        queue_slot_id: slot.id,
      });
    }

    for (const shift of (occupancyData ?? []) as Pick<Shift, 'chatter_id' | 'date' | 'start_time'>[]) {
      const shiftType = getShiftTypeByStartTime(shift.start_time);
      const key = getSlotKey(shift.date, shiftType);
      const target = grouped.get(key);
      if (!target) continue;

      target.occupied += 1;
      if (shift.chatter_id === chatter.id) {
        target.chatter_signed_up = true;
      }
    }

    const groupedSlots = Array.from(grouped.values())
      .map((slotGroup) => ({
        ...slotGroup,
        is_full: slotGroup.occupied >= slotGroup.total_capacity,
      }))
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || getShiftTypeOrder(a.shift_type) - getShiftTypeOrder(b.shift_type)
      );

    setAvailableSlots(groupedSlots);
    setLoadingSlots(false);
  }, [chatter, showToast]);

  const fetchOnlineChatters = useCallback(async () => {
    setLoadingOnlineChatters(true);
    const today = getIsraelTodayDateKey();

    const { data, error: onlineError } = await supabase
      .from('shifts')
      .select('chatter_id, chatters(name)')
      .eq('date', today)
      .eq('status', 'active');

    if (onlineError) {
      showToast('error', LABELS.noConnection);
      setLoadingOnlineChatters(false);
      return;
    }

    const unique = new Map<string, OnlineChatter>();
    for (const row of (data ?? []) as Array<{
      chatter_id: string;
      chatters: { name?: string } | Array<{ name?: string }> | null;
    }>) {
      const chatterName = Array.isArray(row.chatters)
        ? row.chatters[0]?.name
        : row.chatters?.name;
      if (!row.chatter_id || !chatterName) continue;
      unique.set(row.chatter_id, { chatter_id: row.chatter_id, name: chatterName });
    }

    const sorted = Array.from(unique.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'he-IL')
    );
    setOnlineChatters(sorted);
    setLoadingOnlineChatters(false);
  }, [showToast]);

  async function signUpToSlotInternal(slotGroup: GroupedAvailableSlot, chatterId: string) {
    const timeWindow = getSlotTimeWindow(slotGroup.shift_type);
    const { error: insertError } = await supabase.from('shifts').insert({
      chatter_id: chatterId,
      date: slotGroup.date,
      start_time: timeWindow.start,
      end_time: timeWindow.end,
      model: null,
      platform: null,
      status: 'pending',
    });

    if (insertError) {
      return insertError.message || LABELS.serverError;
    }

    await supabase.from('activity_log').insert({
      chatter_id: chatterId,
      action: 'sign_up',
      metadata: { slot_id: slotGroup.signup_slot_id, slot_group: slotGroup.key },
    });

    return null;
  }

  async function handleSignUpToSlot(slotGroup: GroupedAvailableSlot) {
    if (!chatter) return;
    const latestGroup = availableSlots.find((slot) => slot.key === slotGroup.key) ?? slotGroup;
    if (latestGroup.chatter_signed_up) {
      showToast('info', 'כבר נרשמת למשמרת זו');
      return;
    }
    if (latestGroup.is_full || !latestGroup.signup_slot_id) {
      showToast('error', LABELS.shiftTaken);
      return;
    }

    setSlotActionId(latestGroup.key);
    const signUpError = await signUpToSlotInternal(latestGroup, chatter.id);

    if (signUpError) {
      showToast('error', signUpError);
      setSlotActionId(null);
      return;
    }

    showToast('success', LABELS.signedUp);
    setSlotActionId(null);
    await fetchShiftData();
    await fetchAvailableSlots();
  }

  async function handleDoubleShiftSignUp(date: string, slots: GroupedAvailableSlot[]) {
    if (!chatter) return;

    const morning = slots.find((slot) => slot.shift_type === 'morning');
    const evening = slots.find((slot) => slot.shift_type === 'evening');
    if (!morning || !evening) {
      showToast('error', LABELS.serverError);
      return;
    }

    const latestMorning = availableSlots.find((slot) => slot.key === morning.key) ?? morning;
    const latestEvening = availableSlots.find((slot) => slot.key === evening.key) ?? evening;
    if (latestMorning.chatter_signed_up || latestEvening.chatter_signed_up) {
      showToast('info', 'כבר נרשמת לאחת מהמשמרות ביום הזה');
      return;
    }
    if (
      latestMorning.is_full ||
      latestEvening.is_full ||
      !latestMorning.signup_slot_id ||
      !latestEvening.signup_slot_id
    ) {
      showToast('error', 'לא ניתן להירשם למשמרת כפולה כרגע');
      return;
    }

    const doubleActionKey = `double|${date}`;
    setSlotActionId(doubleActionKey);

    const morningError = await signUpToSlotInternal(latestMorning, chatter.id);
    if (morningError) {
      showToast('error', morningError);
      setSlotActionId(null);
      await fetchShiftData();
      await fetchAvailableSlots();
      return;
    }

    const eveningError = await signUpToSlotInternal(latestEvening, chatter.id);
    if (eveningError) {
      showToast('error', `נרשמת רק לבוקר. שגיאה בערב: ${eveningError}`);
      setSlotActionId(null);
      await fetchShiftData();
      await fetchAvailableSlots();
      return;
    }

    showToast('success', 'נרשמת למשמרת כפולה בהצלחה');
    setSlotActionId(null);
    await fetchShiftData();
    await fetchAvailableSlots();
  }

  async function handleJoinQueue(slotGroup: GroupedAvailableSlot) {
    if (!slotGroup.queue_slot_id) {
      showToast('error', LABELS.serverError);
      return;
    }

    setSlotActionId(slotGroup.key);
    const { data, error: queueError } = await supabase.rpc('join_shift_queue_for_slot', {
      p_slot_id: slotGroup.queue_slot_id,
    });

    if (queueError) {
      showToast('error', queueError.message || LABELS.serverError);
      setSlotActionId(null);
      return;
    }

    const queueResult = data as { alreadyQueued?: boolean; position?: number } | null;
    if (queueResult?.alreadyQueued) {
      showToast(
        'info',
        queueResult.position
          ? `${LABELS.inQueue} (${LABELS.queuePosition} ${queueResult.position})`
          : LABELS.inQueue
      );
    } else {
      showToast(
        'success',
        queueResult?.position
          ? `${LABELS.joinedQueue} (${LABELS.queuePosition} ${queueResult.position})`
          : LABELS.joinedQueue
      );
    }

    setSlotActionId(null);
    await fetchAvailableSlots();
  }

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
        void fetchSharedScheduleData();
        void fetchModels();
        void fetchMonthlyProgress();
        void fetchAvailableSlots();
        void fetchOnlineChatters();
      }
    });
    return () => {
      active = false;
    };
  }, [chatter, fetchShiftData, fetchSharedScheduleData, fetchModels, fetchMonthlyProgress, fetchAvailableSlots, fetchOnlineChatters]);

  // Realtime: re-fetch when this chatter's shifts, goals, or summaries change
  useEffect(() => {
    if (!chatter) return;

    const channel = supabase
      .channel(`chatter-realtime-${chatter.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shifts', filter: `chatter_id=eq.${chatter.id}` },
        () => {
          void fetchShiftData();
          void fetchAvailableSlots();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shifts' },
        () => {
          void fetchSharedScheduleData();
          void fetchOnlineChatters();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shift_assignments' },
        () => {
          void fetchShiftData();
          void fetchSharedScheduleData();
        }
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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shift_slots' },
        () => { void fetchAvailableSlots(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatter, fetchShiftData, fetchSharedScheduleData, fetchMonthlyProgress, fetchAvailableSlots, fetchOnlineChatters]);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  async function handleClockIn(shift: Shift) {
    if (!chatter) return;
    setActionShiftId(shift.id);
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/clock-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: chatter.token, shiftId: shift.id }),
      });

      const payload = await response.json().catch(() => ({} as { error?: string; success?: boolean }));
      if (!response.ok || payload.success === false) {
        showToast('error', mapClockInErrorMessage(response.status, payload.error));
        return;
      }

      showToast('success', LABELS.clockedInSuccess);
      await fetchShiftData();
    } catch {
      showToast('error', LABELS.noConnection);
    } finally {
      setActionShiftId(null);
    }
  }

  async function handleSmartClockIn() {
    if (!chatter) return;
    const today = getIsraelTodayDateKey();
    const nowMinutes = getCurrentIsraelWallClockMinutes();

    const { data: todayShifts } = await supabase
      .from('shifts')
      .select(SHIFT_SELECT_WITH_ASSIGNMENTS)
      .eq('chatter_id', chatter.id)
      .eq('date', today)
      .eq('status', 'scheduled')
      .order('start_time', { ascending: true });

    const shiftsToday = (todayShifts ?? []) as Shift[];
    if (shiftsToday.length === 0) {
      showToast('error', LABELS.noShiftNow);
      return;
    }

    // Find shifts within -30 to +30 minutes of now
    const eligible = shiftsToday.filter((s) => {
      const shiftMinutes = toWallClockMinutes(s.date, s.start_time);
      const diff = shiftMinutes - nowMinutes;
      return diff >= -30 && diff <= 30;
    });

    if (eligible.length === 0) {
      showToast('error', LABELS.noShiftNow);
      return;
    }

    if (eligible.length === 1) {
      await handleClockIn(eligible[0] as Shift);
      return;
    }

    if (eligible.length === 0) {
      const nearest = shiftsToday.reduce<Shift | null>((best, current) => {
        const currentDiff = Math.abs(toWallClockMinutes(current.date, current.start_time) - nowMinutes);
        if (!best) return current;
        const bestDiff = Math.abs(toWallClockMinutes(best.date, best.start_time) - nowMinutes);
        return currentDiff < bestDiff ? current : best;
      }, null);

      if (!nearest) {
        showToast('error', LABELS.noShiftNow);
        return;
      }

      await handleClockIn(nearest);
      return;
    }

    // Multiple matches — show picker
    setClockInCandidates(eligible as Shift[]);
  }

  async function handleCancelShift(shift: Shift) {
    if (!chatter) return;

    const minutesUntil = getMinutesUntilShift(shift);
    if (minutesUntil < 240) {
      showToast('error', LABELS.cannotCancelLessThan4Hours);
      return;
    }

    setActionShiftId(shift.id);
    const { error: updateError } = await supabase
      .from('shifts')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', shift.id)
      .eq('chatter_id', chatter.id)
      .eq('status', 'scheduled');

    if (updateError) {
      showToast('error', LABELS.serverError);
      setActionShiftId(null);
      return;
    }

    await supabase.from('activity_log').insert({
      shift_id: shift.id,
      chatter_id: chatter.id,
      action: 'cancel',
    });

    // Try to promote next person in queue
    await callEdgeFunction('promote-queue', {
      method: 'POST',
      body: JSON.stringify({ shiftId: shift.id }),
    });

    showToast('success', LABELS.shiftCancelled);
    setCancelConfirmId(null);
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
  const availableSlotsByDate = useMemo(() => {
    const grouped = new Map<string, GroupedAvailableSlot[]>();
    for (const slot of availableSlots) {
      const entry = grouped.get(slot.date) ?? [];
      entry.push(slot);
      grouped.set(slot.date, entry);
    }
    return grouped;
  }, [availableSlots]);

  const sharedWindows = useMemo(
    () => [
      { key: 'morning' as const, label: 'בוקר', time: '12:00–19:00' },
      { key: 'evening' as const, label: 'ערב', time: '19:00–02:00' },
    ],
    []
  );

  const getShiftChatterName = useCallback((shift: ShiftWithChatter) => {
    return shift.chatters?.name ?? LABELS.unknown;
  }, []);

  const getSharedWindowNames = useCallback(
    (shift: ShiftWithChatter) => {
      const names = sharedWeekShifts
        .filter(
          (candidate) =>
            candidate.id !== shift.id &&
            candidate.date === shift.date &&
            candidate.start_time === shift.start_time &&
            candidate.end_time === shift.end_time
        )
        .map((candidate) => getShiftChatterName(candidate))
        .filter((name) => Boolean(name));

      return Array.from(new Set(names));
    },
    [getShiftChatterName, sharedWeekShifts]
  );

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

          <section className="rounded-2xl border border-emerald-700/30 bg-gray-900 p-4">
            <h2 className="text-base font-bold text-white mb-3">אונליין עכשיו</h2>
            {loadingOnlineChatters ? (
              <LoadingSpinner />
            ) : onlineChatters.length === 0 ? (
              <p className="text-sm text-gray-400">אף אחד לא אונליין כרגע</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {onlineChatters.map((onlineChatter) => (
                  <div
                    key={onlineChatter.chatter_id}
                    className="inline-flex items-center gap-2 rounded-full border border-gray-700 bg-gray-800/70 px-3 py-1.5"
                  >
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    </span>
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-300">
                      {(onlineChatter.name.trim().charAt(0) || 'צ').toUpperCase()}
                    </span>
                    <span className="text-xs text-gray-100">{onlineChatter.name}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-gray-800 bg-gray-900 p-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setActiveView('my_shifts')}
                className={cn(
                  'min-h-[40px] rounded-xl text-sm font-medium transition-colors',
                  activeView === 'my_shifts'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                )}
              >
                המשמרות שלי
              </button>
              <button
                onClick={() => setActiveView('shared_board')}
                className={cn(
                  'min-h-[40px] rounded-xl text-sm font-medium transition-colors',
                  activeView === 'shared_board'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                )}
              >
                לוח משמרות
              </button>
            </div>
          </section>

          {activeView === 'my_shifts' ? (
            <>
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
                  {formatAssignmentsSummary(activeShift)
                    ? `המודלים שלך: ${formatAssignmentsSummary(activeShift)}`
                    : 'טרם שובץ מודל למשמרת הזו'}{' '}
                  • סוג: {getShiftTypeLabel(activeShift.start_time)}
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
                    {formatAssignmentsSummary(nextShift)
                      ? `המודלים שלך: ${formatAssignmentsSummary(nextShift)}`
                      : 'טרם שובץ מודל למשמרת הזו'}{' '}
                    • סוג: {getShiftTypeLabel(nextShift.start_time)}
                  </p>
                </div>
                <button
                  onClick={handleSmartClockIn}
                  disabled={Boolean(actionShiftId) || Boolean(activeShift)}
                  className="w-full min-h-[48px] rounded-xl bg-[#1D9E75] hover:bg-[#188561] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold"
                >
                  {actionShiftId ? LABELS.connecting : LABELS.clockIn}
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
                  ${monthlyEarned.toLocaleString('he-IL')} מתוך $
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

                      <div className="text-xs text-gray-300 flex items-center gap-2 flex-wrap">
                        <span>סוג: {getShiftTypeLabel(shift.start_time)}</span>
                        {!formatAssignmentsSummary(shift) ? (
                          <span className="text-gray-500">טרם שובץ</span>
                        ) : (
                          <span>המודלים שלך: {formatAssignmentsSummary(shift)}</span>
                        )}
                      </div>

                      {shift.status === 'scheduled' && getMinutesUntilShift(shift) >= 240 && (
                        <div className="mt-2">
                          {cancelConfirmId === shift.id ? (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleCancelShift(shift)}
                                disabled={actionShiftId === shift.id}
                                className="flex-1 min-h-[32px] rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-medium"
                              >
                                {actionShiftId === shift.id ? '...' : LABELS.cancelConfirm}
                              </button>
                              <button
                                onClick={() => setCancelConfirmId(null)}
                                className="flex-1 min-h-[32px] rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-medium"
                              >
                                {LABELS.cancel}
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setCancelConfirmId(shift.id)}
                              className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
                            >
                              <XCircle size={12} />
                              {LABELS.cancelShift}
                            </button>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
            <h2 className="text-base font-bold text-white mb-3">משמרות זמינות</h2>
            {loadingSlots ? (
              <LoadingSpinner />
            ) : availableSlotsByDate.size === 0 ? (
              <p className="text-sm text-gray-400">{LABELS.noAvailableShifts}</p>
            ) : (
              <div className="space-y-4">
                {Array.from(availableSlotsByDate.entries()).map(([date, slots]) => (
                  <div key={date} className="space-y-2">
                    <p className="text-sm font-semibold text-gray-200">{formatHebrewDate(date)}</p>
                    {slots.map((slotGroup) => {
                      const isSigned = slotGroup.chatter_signed_up;
                      const isFull = slotGroup.is_full;
                      const isActing = slotActionId === slotGroup.key;
                      const timeWindow = getSlotTimeWindow(slotGroup.shift_type);

                      return (
                        <article
                          key={slotGroup.key}
                          className="rounded-xl border border-gray-800 bg-gray-800/40 p-3"
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                              <p className="text-sm font-semibold text-white">
                                {getSlotTypeLabel(slotGroup.shift_type)} {timeWindow.start}-{timeWindow.end}
                              </p>
                            </div>
                            {isSigned ? (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-300">
                                נרשמת
                              </span>
                            ) : isFull ? (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-300">
                                מלא
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/20 text-blue-300">
                                פנוי
                              </span>
                            )}
                          </div>

                          {isSigned ? null : isFull ? (
                            <button
                              onClick={() => void handleJoinQueue(slotGroup)}
                              disabled={isActing}
                              className="w-full min-h-[40px] rounded-lg bg-yellow-600 hover:bg-yellow-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium"
                            >
                              {isActing ? '...' : LABELS.joinQueue}
                            </button>
                          ) : (
                            <button
                              onClick={() => void handleSignUpToSlot(slotGroup)}
                              disabled={isActing}
                              className="w-full min-h-[40px] rounded-lg bg-[#1D9E75] hover:bg-[#188561] disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium"
                            >
                              {isActing ? '...' : 'הירשם'}
                            </button>
                          )}
                        </article>
                      );
                    })}
                    {slots.length >= 2 && (() => {
                      const morningSlot = slots.find((slot) => slot.shift_type === 'morning');
                      const eveningSlot = slots.find((slot) => slot.shift_type === 'evening');
                      if (!morningSlot || !eveningSlot) return null;

                      const isActingDouble = slotActionId === `double|${date}`;
                      const hasAnySigned = morningSlot.chatter_signed_up || eveningSlot.chatter_signed_up;
                      const hasAnyFull = morningSlot.is_full || eveningSlot.is_full;
                      const canSignDouble =
                        !hasAnySigned &&
                        !hasAnyFull &&
                        Boolean(morningSlot.signup_slot_id) &&
                        Boolean(eveningSlot.signup_slot_id);

                      return (
                        <article className="rounded-xl border border-purple-500/40 bg-gradient-to-r from-purple-900/30 via-violet-900/25 to-fuchsia-900/30 p-3">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div>
                              <p className="text-sm font-semibold text-white">משמרת כפולה</p>
                              <p className="text-xs text-purple-200/90">12:00-19:00 + 19:00-02:00</p>
                            </div>
                            {hasAnySigned ? (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-300">
                                כבר נרשמת
                              </span>
                            ) : hasAnyFull ? (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-300">
                                לא זמין
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-200">
                                פנוי
                              </span>
                            )}
                          </div>

                          <button
                            onClick={() => void handleDoubleShiftSignUp(date, slots)}
                            disabled={isActingDouble || !canSignDouble}
                            className="w-full min-h-[40px] rounded-lg bg-gradient-to-r from-purple-600 to-fuchsia-600 hover:from-purple-500 hover:to-fuchsia-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium"
                          >
                            {isActingDouble ? '...' : 'הירשם למשמרת כפולה'}
                          </button>
                        </article>
                      );
                    })()}
                  </div>
                ))}
              </div>
            )}
          </section>
            </>
          ) : (
            <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-bold text-white">לוח משמרות</h2>
                <span className="text-xs text-gray-400">
                  {weekRange.start} - {weekRange.end}
                </span>
              </div>

              {loadingSharedBoard ? (
                <LoadingSpinner />
              ) : sharedWeekShifts.length === 0 ? (
                <p className="text-sm text-gray-400">אין משמרות להצגה השבוע</p>
              ) : (
                <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
                  <div className="grid grid-cols-8 gap-2 min-w-[980px]">
                    <div className="text-center pb-2 border-b border-gray-700" />
                    {weekDates.map((date, index) => (
                      <div key={date} className="text-center pb-2 border-b border-gray-700">
                        <p className="text-xs font-semibold mb-1 text-gray-400">
                          {LABELS.days[index]}
                        </p>
                        <p className="text-sm font-bold text-gray-300">{formatHebrewShortDate(date)}</p>
                      </div>
                    ))}

                    {sharedWindows.map((window) => (
                      <div key={window.key} className="contents">
                        <div className="rounded-lg bg-gray-900/80 border border-gray-800 p-3 flex flex-col justify-center">
                          <p className="text-sm font-bold text-white">{window.label}</p>
                          <p className="text-xs text-gray-400 mt-1">{window.time}</p>
                        </div>

                        {weekDates.map((date) => (
                          <div
                            key={`${window.key}-${date}`}
                            className="min-h-[170px] rounded-lg p-2 space-y-2 border bg-gray-800/30 border-gray-800"
                          >
                            {sharedShiftsByDateAndWindow[date][window.key].map((shift) => {
                              const isOwnShift = shift.chatter_id === chatter?.id;
                              const statusBadge = getSharedBoardStatusBadge(shift.status);
                              const assignmentsSummary = formatAssignmentsSummary(shift);
                              const withYouNames = getSharedWindowNames(shift);

                              return (
                                <article
                                  key={shift.id}
                                  className={cn(
                                    'rounded-md p-2 border',
                                    isOwnShift
                                      ? 'border-blue-500/60 bg-blue-900/20'
                                      : 'border-transparent bg-gray-800/60'
                                  )}
                                >
                                  <div className="flex items-start justify-between gap-2 mb-1">
                                    <p className="text-xs font-semibold text-white truncate">
                                      {getShiftChatterName(shift)}
                                    </p>
                                    {isOwnShift && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">
                                        המשמרת שלך
                                      </span>
                                    )}
                                  </div>

                                  <p className="text-[11px] text-gray-300 truncate mb-1">
                                    {assignmentsSummary || 'טרם שובץ מודל'}
                                  </p>

                                  {withYouNames.length > 0 && (
                                    <p className="text-[11px] text-gray-400 truncate mb-1">
                                      {isOwnShift ? 'איתך במשמרת' : 'באותו חלון'}: {withYouNames.join(', ')}
                                    </p>
                                  )}

                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-[11px] text-gray-400 font-mono">
                                      {formatTime(shift.start_time)}–{formatTime(shift.end_time)}
                                    </p>
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${statusBadge.className}`}>
                                      {statusBadge.label}
                                    </span>
                                  </div>
                                </article>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
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
            await fetchShiftData();
            await fetchMonthlyProgress();
          }}
          showToast={showToast}
        />
      )}
      {/* Smart clock-in: shift picker when multiple candidates */}
      {clockInCandidates && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 p-5 w-full max-w-sm space-y-3">
            <h3 className="text-base font-bold text-white">{LABELS.selectShift}</h3>
            {clockInCandidates.map(shift => (
              <button
                key={shift.id}
                onClick={async () => {
                  setClockInCandidates(null);
                  await handleClockIn(shift);
                }}
                className="w-full text-right rounded-xl border border-gray-700 bg-gray-800 hover:bg-gray-700 p-3 transition-colors"
              >
                <p className="text-sm font-semibold text-white">
                  {formatTime(shift.start_time)}–{formatTime(shift.end_time)}
                </p>
                <p className="text-xs text-gray-400">
                  {formatAssignmentsSummary(shift) || 'טרם שובץ'} • {getShiftTypeLabel(shift.start_time)}
                </p>
              </button>
            ))}
            <button
              onClick={() => setClockInCandidates(null)}
              className="w-full min-h-[40px] rounded-xl bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm"
            >
              {LABELS.cancel}
            </button>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
