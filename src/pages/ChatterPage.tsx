import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChatterAuth } from '../hooks/useChatterAuth';
import { ChatterLayout } from '../components/chatter/ChatterLayout';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { ToastContainer } from '../components/shared/ToastContainer';
import { LABELS, formatTime, cn, getPlatformLabel } from '../lib/utils';
import { AlertCircle, Clock3, Timer, XCircle } from 'lucide-react';
import { SUPABASE_URL, supabase, callEdgeFunction } from '../lib/supabase';
import { useToast } from '../hooks/useToast';
import type { Model, Platform, Shift, ShiftAssignment, ShiftSlot, ShiftWithChatter } from '../lib/types';
import { DailySummaryModal } from '../components/chatter/DailySummaryModal';

const ISRAEL_TIMEZONE = 'Asia/Jerusalem';
const SHIFT_SELECT_WITH_ASSIGNMENTS = '*';

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

function getMinutesUntilShiftEnd(shift: Shift) {
  const startMin = toWallClockMinutes(shift.date, shift.start_time);
  let endMin = toWallClockMinutes(shift.date, shift.end_time);
  if (endMin <= startMin) endMin += 24 * 60;
  return endMin - getCurrentIsraelWallClockMinutes();
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

function getShiftAssignments(shift: Shift): Pick<ShiftAssignment, 'model' | 'platform'>[] {
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

interface ShiftSlotAvailabilityRow {
  slot_date: string;
  slot_shift_type: string;
  total_models: number;
  total_needed: number;
  total_filled: number;
  is_full: boolean;
  occupied: number;
}

type SummaryModalSource = 'clock_out' | 'past' | 'debt';

interface ShiftWindow<T extends Shift = Shift> {
  key: string;
  first: T;
  shifts: T[];
}

function getShiftWindowKey(shift: Pick<Shift, 'chatter_id' | 'date' | 'start_time'>) {
  return `${shift.chatter_id}|${shift.date}|${formatTime(shift.start_time)}`;
}

function createShiftWindow<T extends Shift>(shifts: T[]): ShiftWindow<T> {
  const first = shifts[0];
  return {
    key: getShiftWindowKey(first),
    first,
    shifts,
  };
}

function groupShiftWindows<T extends Shift>(shifts: T[]): ShiftWindow<T>[] {
  const groups = new Map<string, T[]>();
  for (const shift of shifts) {
    const key = getShiftWindowKey(shift);
    const group = groups.get(key) ?? [];
    group.push(shift);
    groups.set(key, group);
  }
  return Array.from(groups.values()).map(createShiftWindow);
}

function getWindowStatusBadge(window: ShiftWindow) {
  const statuses = window.shifts.map((shift) => shift.status);
  const total = statuses.length;
  const completed = statuses.filter((status) => status === 'completed').length;
  const missed = statuses.filter((status) => status === 'missed').length;

  if (statuses.some((status) => status === 'active')) {
    return { label: LABELS.active, className: 'bg-emerald-500/15 text-emerald-300', subtext: '' };
  }
  if (statuses.some((status) => status === 'scheduled')) {
    return { label: LABELS.scheduled, className: 'bg-blue-500/15 text-blue-300', subtext: '' };
  }
  if (completed === total) {
    return { label: LABELS.completed, className: 'bg-emerald-500/10 text-emerald-400', subtext: '' };
  }
  if (missed === total) {
    return { label: 'פספוס', className: 'bg-red-500/15 text-red-300', subtext: '' };
  }
  if (completed > 0 && missed > 0) {
    return {
      label: LABELS.partial,
      className: 'bg-yellow-500/15 text-yellow-300',
      subtext: `${completed}/${total} הושלמו`,
    };
  }

  const fallback = getWeeklyStatusBadge(window.first);
  return { ...fallback, subtext: '' };
}

function getWindowAssignments(window: ShiftWindow): Pick<ShiftAssignment, 'model' | 'platform'>[] {
  const unique = new Map<string, Pick<ShiftAssignment, 'model' | 'platform'>>();
  for (const shift of window.shifts) {
    for (const assignment of getShiftAssignments(shift)) {
      unique.set(`${assignment.model}|${assignment.platform}`, assignment);
    }
  }
  return Array.from(unique.values());
}

function getWindowCompletedCount(window: ShiftWindow) {
  return window.shifts.filter((shift) => shift.status === 'completed').length;
}

function windowHasSummary(window: ShiftWindow, summaryShiftIds: Set<string>) {
  return window.shifts.some((shift) => summaryShiftIds.has(shift.id));
}

function ShiftWindowDetails({ window }: { window: ShiftWindow }) {
  const assignments = getWindowAssignments(window);

  return (
    <div className="space-y-2 text-sm text-gray-300">
      <p>
        <span className="text-gray-400">סוג:</span> {getShiftTypeLabel(window.first.start_time)}
      </p>
      <div className="space-y-1.5">
        <p className="text-gray-400">המודלים שלך:</p>
        {assignments.length === 0 ? (
          <p className="text-xs text-gray-500">טרם שובץ</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {assignments.map((assignment) => (
              <span
                key={`${assignment.model}-${assignment.platform}`}
                className="rounded-full border border-gray-700 bg-gray-800 px-2 py-0.5 text-xs text-gray-200"
              >
                {assignment.model} · {getPlatformLabel(assignment.platform)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ShiftWindowHeader({ window }: { window: ShiftWindow }) {
  const statusBadge = getWindowStatusBadge(window);

  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-base font-bold text-white">
          {formatHebrewDate(window.first.date)}{' '}
          <span className="font-mono text-sm text-gray-300">
            {formatTime(window.first.start_time)}–{formatTime(window.first.end_time)}
          </span>
        </p>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge.className}`}
        >
          {statusBadge.label}
        </span>
      </div>
      {statusBadge.subtext && (
        <p className="text-xs text-yellow-300">{statusBadge.subtext}</p>
      )}
    </div>
  );
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
  const [nextShiftSiblings, setNextShiftSiblings] = useState<Shift[]>([]);
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [activeShiftSiblings, setActiveShiftSiblings] = useState<Shift[]>([]);
  const [activeView, setActiveView] = useState<'my_shifts' | 'shared_board'>('my_shifts');
  const [loadingShifts, setLoadingShifts] = useState(false);
  const [loadingSharedBoard, setLoadingSharedBoard] = useState(false);
  const [actionShiftId, setActionShiftId] = useState<string | null>(null);
  const [summaryModalWindow, setSummaryModalWindow] = useState<ShiftWindow | null>(null);
  const [summaryModalSource, setSummaryModalSource] = useState<SummaryModalSource>('clock_out');
  const [models, setModels] = useState<Model[]>([]);
  const [monthlyGoal, setMonthlyGoal] = useState<number | null>(null);
  const [monthlyEarned, setMonthlyEarned] = useState(0);
  const [currentTimestamp, setCurrentTimestamp] = useState(() => Date.now());
  const [pastShifts, setPastShifts] = useState<Shift[]>([]);
  const [loadingPastShifts, setLoadingPastShifts] = useState(false);
  const [summaryShiftIds, setSummaryShiftIds] = useState<Set<string>>(new Set());
  const [debtShiftWindow, setDebtShiftWindow] = useState<ShiftWindow | null>(null);
  const [availableSlots, setAvailableSlots] = useState<GroupedAvailableSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotActionId, setSlotActionId] = useState<string | null>(null);
  const [clockInCandidates, setClockInCandidates] = useState<ShiftWindow[] | null>(null);
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
  const debtShift = debtShiftWindow?.first ?? null;
  const nextShiftWindow = nextShiftSiblings.length > 0 ? createShiftWindow(nextShiftSiblings) : null;
  const activeShiftWindow = activeShiftSiblings.length > 0 ? createShiftWindow(activeShiftSiblings) : null;
  const weeklyShiftWindows = useMemo(() => groupShiftWindows(weeklyShifts), [weeklyShifts]);
  const pastShiftWindows = useMemo(() => groupShiftWindows(pastShifts).slice(0, 10), [pastShifts]);

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

  const openSummaryModal = useCallback((window: ShiftWindow, source: SummaryModalSource) => {
    setSummaryModalWindow(window);
    setSummaryModalSource(source);
  }, []);

  const closeSummaryModal = useCallback(() => {
    setSummaryModalWindow(null);
    setSummaryModalSource('clock_out');
  }, []);

  const fetchShiftById = useCallback(
    async (shiftId: string) => {
      if (!chatter) return null;

      const { data, error: shiftError } = await supabase
        .from('shifts')
        .select(SHIFT_SELECT_WITH_ASSIGNMENTS)
        .eq('id', shiftId)
        .eq('chatter_id', chatter.id)
        .maybeSingle();

      if (shiftError || !data) return null;
      return data as Shift;
    },
    [chatter]
  );

  const fetchShiftWindowById = useCallback(
    async (shiftId: string) => {
      const shift = await fetchShiftById(shiftId);
      if (!shift || !chatter) return null;

      const { data, error: siblingsError } = await supabase
        .from('shifts')
        .select(SHIFT_SELECT_WITH_ASSIGNMENTS)
        .eq('chatter_id', chatter.id)
        .eq('date', shift.date)
        .eq('start_time', shift.start_time)
        .order('created_at', { ascending: true });

      if (siblingsError || !data || data.length === 0) return createShiftWindow([shift]);
      return createShiftWindow(data as Shift[]);
    },
    [chatter, fetchShiftById]
  );

  const fetchPastShiftsData = useCallback(async () => {
    if (!chatter) return;
    setLoadingPastShifts(true);

    const [pastRes, summariesRes] = await Promise.all([
      supabase
        .from('shifts')
        .select(SHIFT_SELECT_WITH_ASSIGNMENTS)
        .eq('chatter_id', chatter.id)
        .in('status', ['completed', 'missed'])
        .order('date', { ascending: false })
        .order('start_time', { ascending: false })
        .limit(50),
      supabase
        .from('daily_summaries')
        .select('shift_id')
        .eq('chatter_id', chatter.id),
    ]);

    if (pastRes.error || summariesRes.error) {
      showToast('error', LABELS.noConnection);
      setLoadingPastShifts(false);
      return;
    }

    const filledShiftIds = new Set(
      ((summariesRes.data ?? []) as Array<{ shift_id: string | null }>)
        .map((summary) => summary.shift_id)
        .filter((shiftId): shiftId is string => Boolean(shiftId))
    );

    setPastShifts((pastRes.data ?? []) as Shift[]);
    setSummaryShiftIds(filledShiftIds);
    setLoadingPastShifts(false);
  }, [chatter, showToast]);

  const fetchDebtShift = useCallback(async () => {
    if (!chatter) return;

    const { data: completedShifts, error: latestShiftError } = await supabase
      .from('shifts')
      .select(SHIFT_SELECT_WITH_ASSIGNMENTS)
      .eq('chatter_id', chatter.id)
      .eq('status', 'completed')
      .order('date', { ascending: false })
      .order('start_time', { ascending: false })
      .limit(25);

    if (latestShiftError) {
      showToast('error', LABELS.noConnection);
      return;
    }

    if (!completedShifts || completedShifts.length === 0) {
      setDebtShiftWindow(null);
      return;
    }

    const { data: summaries, error: summaryError } = await supabase
      .from('daily_summaries')
      .select('shift_id')
      .eq('chatter_id', chatter.id);

    if (summaryError) {
      showToast('error', LABELS.noConnection);
      return;
    }

    const summarizedIds = new Set(
      ((summaries ?? []) as Array<{ shift_id: string | null }>)
        .map((summary) => summary.shift_id)
        .filter((shiftId): shiftId is string => Boolean(shiftId))
    );
    const debtWindow =
      groupShiftWindows((completedShifts ?? []) as Shift[])
        .find((window) => !windowHasSummary(window, summarizedIds)) ?? null;

    setDebtShiftWindow(debtWindow);
  }, [chatter, showToast]);

  const fetchShiftData = useCallback(async () => {
    if (!chatter) return;
    setLoadingShifts(true);

    const yesterdayParts = getIsraelDateParts(new Date(Date.now() - 24 * 60 * 60 * 1000));
    const yesterday = toDateKey(yesterdayParts.year, yesterdayParts.month, yesterdayParts.day);
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
        .gte('date', yesterday)
        .order('date', { ascending: true })
        .order('start_time', { ascending: true }),
      supabase
        .from('shifts')
        .select(SHIFT_SELECT_WITH_ASSIGNMENTS)
        .eq('chatter_id', chatter.id)
        .eq('status', 'active')
        .order('date', { ascending: false })
        .order('start_time', { ascending: false }),
    ]);

    if (weeklyRes.error || upcomingRes.error || activeRes.error) {
      showToast('error', LABELS.noConnection);
      setLoadingShifts(false);
      return;
    }

    const weeklyData = (weeklyRes.data ?? []) as Shift[];
    const upcomingShifts = (upcomingRes.data ?? []) as Shift[];
    const nearestFutureWindow =
      groupShiftWindows(upcomingShifts)
        .filter((window) => getMinutesUntilShiftEnd(window.first) > 0)
        .sort(
          (a, b) =>
            toWallClockMinutes(a.first.date, a.first.start_time) -
            toWallClockMinutes(b.first.date, b.first.start_time),
        )[0] ?? null;
    const activeWindow = groupShiftWindows((activeRes.data ?? []) as Shift[])[0] ?? null;

    setWeeklyShifts(weeklyData);
    setNextShiftSiblings(nearestFutureWindow?.shifts ?? []);
    setActiveShift(activeWindow?.first ?? null);
    setActiveShiftSiblings(activeWindow?.shifts ?? []);
    setLoadingShifts(false);
  }, [chatter, weekRange.end, weekRange.start, showToast]);

  const fetchSharedScheduleData = useCallback(async () => {
    if (!chatter) return;
    setLoadingSharedBoard(true);

    const { data, error: sharedError } = await supabase
      .from('shifts')
      .select('*, chatters(name)')
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

    const { data: availabilityData, error: availabilityError } = await supabase.rpc(
      'get_shift_slot_availability',
      { p_from_date: today }
    );

    if (availabilityError) {
      showToast('error', LABELS.noConnection);
      setLoadingSlots(false);
      return;
    }

    const availabilityRows = (availabilityData ?? []) as ShiftSlotAvailabilityRow[];
    if (availabilityRows.length === 0) {
      setAvailableSlots([]);
      setLoadingSlots(false);
      return;
    }

    const { data: slotData, error: slotsError } = await supabase
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

    const slotRows = (slotData ?? []) as ShiftSlot[];
    const slotLookup = new Map<
      string,
      { signup_slot_id: string | null; queue_slot_id: string | null }
    >();
    for (const slot of slotRows) {
      const key = getSlotKey(slot.date, slot.shift_type);
      const current = slotLookup.get(key) ?? { signup_slot_id: null, queue_slot_id: null };

      if (!current.queue_slot_id) {
        current.queue_slot_id = slot.id;
      }
      if (slot.status === 'open' && !current.signup_slot_id) {
        current.signup_slot_id = slot.id;
      }

      slotLookup.set(key, current);
    }

    const { data: chatterShiftData, error: chatterShiftError } = await supabase
      .from('shifts')
      .select('date, start_time')
      .eq('chatter_id', chatter.id)
      .gte('date', today)
      .in('status', ['pending', 'scheduled', 'active']);

    if (chatterShiftError) {
      showToast('error', LABELS.noConnection);
      setLoadingSlots(false);
      return;
    }

    const chatterSignedUpBySlot = new Set<string>();
    for (const shift of (chatterShiftData ?? []) as Pick<Shift, 'date' | 'start_time'>[]) {
      const shiftType = getShiftTypeByStartTime(shift.start_time);
      chatterSignedUpBySlot.add(getSlotKey(shift.date, shiftType));
    }

    const groupedSlots = availabilityRows
      .map((row) => {
        if (row.slot_shift_type !== 'morning' && row.slot_shift_type !== 'evening') return null;
        const shiftType = row.slot_shift_type as ShiftSlot['shift_type'];
        const key = getSlotKey(row.slot_date, shiftType);
        const slotIds = slotLookup.get(key);

        return {
          key,
          date: row.slot_date,
          shift_type: shiftType,
          total_capacity: Math.max(0, Number(row.total_needed ?? 0)),
          occupied: Math.max(0, Number(row.occupied ?? 0)),
          is_full: Boolean(row.is_full),
          chatter_signed_up: chatterSignedUpBySlot.has(key),
          signup_slot_id: slotIds?.signup_slot_id ?? null,
          queue_slot_id: slotIds?.queue_slot_id ?? null,
        } satisfies GroupedAvailableSlot;
      })
      .filter((slot): slot is GroupedAvailableSlot => Boolean(slot))

      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || getShiftTypeOrder(a.shift_type) - getShiftTypeOrder(b.shift_type)
      );

    setAvailableSlots(groupedSlots);
    setLoadingSlots(false);
  }, [chatter, showToast]);

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
        void fetchPastShiftsData();
        void fetchDebtShift();
        void fetchSharedScheduleData();
        void fetchModels();
        void fetchMonthlyProgress();
        void fetchAvailableSlots();
      }
    });
    return () => {
      active = false;
    };
  }, [
    chatter,
    fetchShiftData,
    fetchPastShiftsData,
    fetchDebtShift,
    fetchSharedScheduleData,
    fetchModels,
    fetchMonthlyProgress,
    fetchAvailableSlots,
  ]);

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
          void fetchPastShiftsData();
          void fetchDebtShift();
          void fetchAvailableSlots();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shifts' },
        () => {
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
        () => {
          void fetchMonthlyProgress();
          void fetchPastShiftsData();
          void fetchDebtShift();
        }
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
  }, [
    chatter,
    fetchShiftData,
    fetchPastShiftsData,
    fetchDebtShift,
    fetchSharedScheduleData,
    fetchMonthlyProgress,
    fetchAvailableSlots,
  ]);

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

      const payload = await response.json().catch(
        () =>
          ({} as {
            error?: string;
            success?: boolean;
            message?: string;
            debt_shift_id?: string;
          })
      );
      if (!response.ok || payload.success === false) {
        if (payload.error === 'SUMMARY_DEBT') {
          if (payload.debt_shift_id) {
            const latestDebtWindow = await fetchShiftWindowById(payload.debt_shift_id);
            if (latestDebtWindow) {
              setDebtShiftWindow(latestDebtWindow);
              return;
            }
          }
          await fetchDebtShift();
          return;
        }

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
    if (debtShift) {
      if (debtShiftWindow) openSummaryModal(debtShiftWindow, 'debt');
      return;
    }

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
    const eligibleWindows = groupShiftWindows(shiftsToday).filter((window) => {
      const shiftMinutes = toWallClockMinutes(window.first.date, window.first.start_time);
      const diff = shiftMinutes - nowMinutes;
      return diff >= -30 && diff <= 30;
    });

    if (eligibleWindows.length === 0) {
      showToast('error', LABELS.noShiftNow);
      return;
    }

    if (eligibleWindows.length === 1) {
      await handleClockIn(eligibleWindows[0].first);
      return;
    }

    if (eligibleWindows.length === 0) {
      const nearest = groupShiftWindows(shiftsToday).reduce<ShiftWindow | null>((best, current) => {
        const currentDiff = Math.abs(
          toWallClockMinutes(current.first.date, current.first.start_time) - nowMinutes
        );
        if (!best) return current;
        const bestDiff = Math.abs(
          toWallClockMinutes(best.first.date, best.first.start_time) - nowMinutes
        );
        return currentDiff < bestDiff ? current : best;
      }, null);

      if (!nearest) {
        showToast('error', LABELS.noShiftNow);
        return;
      }

      await handleClockIn(nearest.first);
      return;
    }

    // Multiple matches — show picker
    setClockInCandidates(eligibleWindows);
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

  const showSummaryModalToast = useCallback(
    (type: 'success' | 'error' | 'warning' | 'info', message: string) => {
      const isRetroactive = summaryModalSource === 'past' || summaryModalSource === 'debt';
      if (isRetroactive && type === 'error' && message === 'שגיאה ביציאה מהמשמרת') {
        closeSummaryModal();
        showToast('success', 'הסיכום נשלח בהצלחה!');
        void fetchMonthlyProgress();
        void fetchPastShiftsData();
        void fetchDebtShift();
        return;
      }

      showToast(type, message);
    },
    [
      summaryModalSource,
      closeSummaryModal,
      showToast,
      fetchMonthlyProgress,
      fetchPastShiftsData,
      fetchDebtShift,
    ]
  );

  const weeklyStats = useMemo(() => {
    const total = weeklyShiftWindows.length;
    const completed = weeklyShiftWindows.filter((window) =>
      window.shifts.every((shift) => shift.status === 'completed')
    ).length;
    const missed = weeklyShiftWindows.filter((window) =>
      window.shifts.every((shift) => shift.status === 'missed')
    ).length;
    return { total, completed, missed };
  }, [weeklyShiftWindows]);

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

          {debtShift && (
            <section className="rounded-2xl border border-red-600/50 bg-red-900/20 p-4 space-y-3">
              <p className="text-sm font-semibold text-red-200">
                ⚠️ {LABELS.summaryDebtBanner} {formatHebrewShortDate(debtShift.date)}
              </p>
              <button
                onClick={() => debtShiftWindow && openSummaryModal(debtShiftWindow, 'debt')}
                className="w-full min-h-[44px] rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold"
              >
                {LABELS.fillSummaryNow}
              </button>
            </section>
          )}

          <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
            <h2 className="text-base font-bold text-white mb-3">{LABELS.pastShifts}</h2>
            {loadingPastShifts ? (
              <LoadingSpinner />
            ) : pastShiftWindows.length === 0 ? (
              <p className="text-sm text-gray-400">{LABELS.noPastShifts}</p>
            ) : (
              <div className="space-y-3">
                {pastShiftWindows.map((window) => {
                  const statusBadge = getWindowStatusBadge(window);
                  const hasSummary = windowHasSummary(window, summaryShiftIds);
                  const canFillSummary = !hasSummary && getWindowCompletedCount(window) > 0;
                  return (
                    <article
                      key={window.key}
                      className="rounded-2xl border border-gray-800 bg-gray-900 p-3 sm:p-4 space-y-3"
                    >
                      <ShiftWindowHeader window={window} />
                      <ShiftWindowDetails window={window} />

                      <div>
                        {statusBadge.subtext && (
                          <p className="mb-2 text-xs text-yellow-300">{statusBadge.subtext}</p>
                        )}
                        {hasSummary ? (
                          // TODO: Enable summary edit mode after real submitted summaries are available to test.
                          <span className="block text-center text-xs font-medium text-emerald-300">
                            {LABELS.summarySent}
                          </span>
                        ) : canFillSummary ? (
                          <button
                            onClick={() => openSummaryModal(window, 'past')}
                            className="w-full min-h-[48px] rounded-xl bg-[#1D9E75] hover:bg-[#188561] text-white text-sm font-semibold"
                          >
                            {LABELS.fillSummary}
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
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
          {activeShiftWindow && (
            <section className="rounded-2xl border border-emerald-700/40 bg-gray-900 p-3 sm:p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-bold text-white">משמרת פעילה עכשיו</h2>
                <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
                  <Timer size={14} />
                  פעיל כבר {activeDuration}
                </span>
              </div>
              <ShiftWindowHeader window={activeShiftWindow} />
              <ShiftWindowDetails window={activeShiftWindow} />
              <button
                onClick={() => openSummaryModal(activeShiftWindow, 'clock_out')}
                className="w-full min-h-[48px] rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold"
              >
                סיום משמרת
              </button>
            </section>
          )}

          <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-bold text-white">המשמרת הבאה</h2>
              {nextShiftWindow && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 text-blue-300 text-xs px-2 py-1">
                  <Clock3 size={13} />
                  {formatRelativeTime(getMinutesUntilShift(nextShiftWindow.first))}
                </span>
              )}
            </div>

            {nextShiftWindow ? (
              <>
                <ShiftWindowHeader window={nextShiftWindow} />
                <ShiftWindowDetails window={nextShiftWindow} />
                <button
                  onClick={handleSmartClockIn}
                  disabled={Boolean(actionShiftId) || Boolean(activeShift) || Boolean(debtShift)}
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
            ) : weeklyShiftWindows.length === 0 ? (
              <p className="text-sm text-gray-400">{LABELS.noUpcomingShifts}</p>
            ) : (
              <div className="space-y-3">
                {weeklyShiftWindows.map((window) => {
                  const isNextShift = nextShiftWindow?.key === window.key;
                  const isToday = window.first.date === getIsraelTodayDateKey();
                  const canCancel =
                    window.shifts.some((shift) => shift.status === 'scheduled') &&
                    getMinutesUntilShift(window.first) >= 240;
                  return (
                    <article
                      key={window.key}
                      className={cn(
                        'rounded-2xl border p-3 sm:p-4 space-y-3',
                        isNextShift
                          ? 'border-[#1D9E75]/50 bg-[#1D9E75]/10'
                          : isToday
                            ? 'border-blue-500/40 bg-blue-500/10'
                          : 'border-gray-800 bg-gray-800/40'
                      )}
                    >
                      <ShiftWindowHeader window={window} />
                      <ShiftWindowDetails window={window} />

                      {canCancel && (
                        <div>
                          {cancelConfirmId === window.key ? (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleCancelShift(window.first)}
                                disabled={actionShiftId === window.first.id}
                                className="flex-1 min-h-[32px] rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-medium"
                              >
                                {actionShiftId === window.first.id ? '...' : LABELS.cancelConfirm}
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
                              onClick={() => setCancelConfirmId(window.key)}
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

      {summaryModalWindow && chatter && (
        <DailySummaryModal
          shift={summaryModalWindow.first}
          windowShifts={summaryModalWindow.shifts}
          chatterId={chatter.id}
          token={chatter.token}
          models={models}
          successMessage={
            summaryModalSource === 'clock_out' ? LABELS.clockedOutSuccess : 'הסיכום נשלח בהצלחה!'
          }
          onClose={closeSummaryModal}
          onSubmitted={async () => {
            await fetchShiftData();
            await fetchMonthlyProgress();
            await fetchPastShiftsData();
            await fetchDebtShift();
          }}
          showToast={showSummaryModalToast}
        />
      )}
      {/* Smart clock-in: shift picker when multiple candidates */}
      {clockInCandidates && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 p-5 w-full max-w-sm space-y-3">
            <h3 className="text-base font-bold text-white">{LABELS.selectShift}</h3>
            {clockInCandidates.map((window) => (
              <button
                key={window.key}
                onClick={async () => {
                  setClockInCandidates(null);
                  await handleClockIn(window.first);
                }}
                className="w-full text-right rounded-xl border border-gray-700 bg-gray-800 hover:bg-gray-700 p-3 transition-colors"
              >
                <p className="text-sm font-semibold text-white">
                  {formatTime(window.first.start_time)}–{formatTime(window.first.end_time)}
                </p>
                <ShiftWindowDetails window={window} />
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
