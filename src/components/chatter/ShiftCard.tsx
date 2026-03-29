import { useState, useEffect, useCallback } from 'react';
import { LogIn, LogOut, Clock, CheckCircle, XCircle } from 'lucide-react';
import { callEdgeFunction } from '../../lib/supabase';
import type { Shift } from '../../lib/types';
import { formatDate, formatTime, minutesUntil, LABELS, cn } from '../../lib/utils';
import { StatusBadge } from '../shared/StatusBadge';

interface ShiftCardProps {
  shift: Shift;
  token: string;
  onUpdate: () => void;
}

function formatCountdown(minutes: number): string {
  if (minutes <= 0) return 'עכשיו';
  if (minutes < 60) return `${minutes} ${LABELS.minutesShort}`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0
    ? `${h} ${LABELS.hoursShort} ${m} ${LABELS.minutesShort}`
    : `${h} ${LABELS.hoursShort}`;
}

function formatDurationSince(isoTimestamp: string): string {
  const start = new Date(isoTimestamp);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const totalMinutes = Math.floor(diffMs / 60000);
  if (totalMinutes < 60) return `${totalMinutes} ${LABELS.minutesShort}`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m > 0
    ? `${h} ${LABELS.hoursShort} ${m} ${LABELS.minutesShort}`
    : `${h} ${LABELS.hoursShort}`;
}

export function ShiftCard({ shift, token, onUpdate }: ShiftCardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(() =>
    minutesUntil(shift.date, shift.start_time)
  );
  const [duration, setDuration] = useState(() =>
    shift.clocked_in ? formatDurationSince(shift.clocked_in) : ''
  );

  // Update countdown every minute for scheduled shifts
  useEffect(() => {
    if (shift.status !== 'scheduled') return;
    const id = setInterval(() => {
      setCountdown(minutesUntil(shift.date, shift.start_time));
    }, 60_000);
    return () => clearInterval(id);
  }, [shift.status, shift.date, shift.start_time]);

  // Update duration every minute for active shifts
  useEffect(() => {
    if (shift.status !== 'active' || !shift.clocked_in) return;
    const id = setInterval(() => {
      setDuration(formatDurationSince(shift.clocked_in!));
    }, 60_000);
    return () => clearInterval(id);
  }, [shift.status, shift.clocked_in]);

  const handleClockIn = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await callEdgeFunction('clock-in', {
      method: 'POST',
      body: JSON.stringify({ token, shiftId: shift.id }),
    });
    setLoading(false);
    if (!result.success) {
      setError(result.error ?? 'שגיאה בכניסה למשמרת');
    } else {
      onUpdate();
    }
  }, [token, shift.id, onUpdate]);

  const handleClockOut = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await callEdgeFunction('clock-out', {
      method: 'POST',
      body: JSON.stringify({ token, shiftId: shift.id }),
    });
    setLoading(false);
    if (!result.success) {
      setError(result.error ?? 'שגיאה ביציאה מהמשמרת');
    } else {
      onUpdate();
    }
  }, [token, shift.id, onUpdate]);

  const isScheduled = shift.status === 'scheduled';
  const isActive = shift.status === 'active';
  const isCompleted = shift.status === 'completed';
  const isMissed = shift.status === 'missed';

  return (
    <div
      className={cn(
        'bg-gray-800 rounded-xl p-4 border transition-colors',
        isActive
          ? 'border-green-500/40 shadow-md shadow-green-900/20'
          : isMissed
          ? 'border-red-500/20'
          : 'border-gray-700/50 hover:border-gray-600'
      )}
    >
      {/* Top row: date + model + status */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-sm font-semibold text-white">{formatDate(shift.date)}</p>
          {shift.model && (
            <p className="text-xs text-gray-400 mt-0.5">{shift.model}</p>
          )}
        </div>
        <StatusBadge status={shift.status} />
      </div>

      {/* Time range */}
      <div className="flex items-center gap-1.5 text-gray-300 text-sm mb-3">
        <Clock size={14} className="text-gray-500 shrink-0" />
        <span>
          {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
        </span>
      </div>

      {/* Scheduled: countdown + clock-in */}
      {isScheduled && (
        <div className="space-y-3">
          <p className="text-xs text-blue-400">
            {LABELS.shiftStartsIn}{' '}
            <span className="font-semibold">{formatCountdown(countdown)}</span>
          </p>
          <button
            onClick={handleClockIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
          >
            <LogIn size={16} />
            {loading ? '...' : LABELS.clockIn}
          </button>
        </div>
      )}

      {/* Active: duration + clock-out */}
      {isActive && (
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 text-green-400 text-xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            <span>פעיל כבר {duration}</span>
          </div>
          <button
            onClick={handleClockOut}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
          >
            <LogOut size={16} />
            {loading ? '...' : LABELS.clockOut}
          </button>
        </div>
      )}

      {/* Completed */}
      {isCompleted && (
        <div className="flex items-center gap-1.5 text-gray-400 text-xs">
          <CheckCircle size={14} className="text-gray-500" />
          <span>
            {shift.clocked_in && shift.clocked_out
              ? `${formatTime(shift.clocked_in.slice(11, 16))} – ${formatTime(shift.clocked_out.slice(11, 16))}`
              : LABELS.completed}
          </span>
        </div>
      )}

      {/* Missed */}
      {isMissed && (
        <div className="flex items-center gap-1.5 text-red-400 text-xs">
          <XCircle size={14} />
          <span>{LABELS.missed}</span>
        </div>
      )}

      {/* Inline error */}
      {error && (
        <p className="mt-2 text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
