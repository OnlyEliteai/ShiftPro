import { useState, useEffect, useCallback } from 'react';
import { LogIn, LogOut, Clock, CheckCircle, XCircle, UserPlus } from 'lucide-react';
import { callEdgeFunction } from '../../lib/supabase';
import type { Shift } from '../../lib/types';
import { formatDate, formatTime, minutesUntil, getPlatformBadge, LABELS, cn } from '../../lib/utils';
import { StatusBadge } from '../shared/StatusBadge';

interface ShiftCardProps {
  shift: Shift;
  token: string;
  onUpdate: () => void;
  /** 'my' = chatter's own shift (default), 'available' = open shift with sign-up button */
  variant?: 'my' | 'available';
}

function formatCountdown(minutes: number): string {
  if (minutes <= 0) return LABELS.now;
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

export function ShiftCard({ shift, token, onUpdate, variant = 'my' }: ShiftCardProps) {
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
      setError(result.error ?? LABELS.clockInError);
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
      setError(result.error ?? LABELS.clockOutError);
    } else {
      onUpdate();
    }
  }, [token, shift.id, onUpdate]);

  const handleSignUp = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await callEdgeFunction('sign-up-shift', {
      method: 'POST',
      body: JSON.stringify({ token, shiftId: shift.id }),
    });
    setLoading(false);
    if (!result.success) {
      setError(result.error ?? LABELS.shiftTaken);
    } else {
      onUpdate();
    }
  }, [token, shift.id, onUpdate]);

  const isPending = shift.status === 'pending';
  const isRejected = shift.status === 'rejected';
  const isScheduled = shift.status === 'scheduled';
  const isActive = shift.status === 'active';
  const isCompleted = shift.status === 'completed';
  const isMissed = shift.status === 'missed';
  const isAvailable = variant === 'available';

  return (
    <div
      className={cn(
        'bg-gray-800 rounded-xl p-4 border transition-colors',
        isAvailable
          ? 'border-purple-500/30 hover:border-purple-400/50'
          : isActive
          ? 'border-green-500/40 shadow-md shadow-green-900/20'
          : isPending
          ? 'border-yellow-500/30'
          : isRejected
          ? 'border-red-700/30 opacity-60'
          : isMissed
          ? 'border-red-500/20'
          : 'border-gray-700/50 hover:border-gray-600'
      )}
    >
      {/* Top row: date + platform + model + status */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-white">{formatDate(shift.date)}</p>
            {shift.platform && (() => {
              const badge = getPlatformBadge(shift.platform);
              return badge.label ? (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${badge.className}`}>
                  {badge.label}
                </span>
              ) : null;
            })()}
          </div>
          {shift.model && (
            <p className="text-xs text-gray-400 mt-0.5">{shift.model}</p>
          )}
        </div>
        {!isAvailable && <StatusBadge status={shift.status} />}
        {isAvailable && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400">
            {LABELS.available}
          </span>
        )}
      </div>

      {/* Time range */}
      <div className="flex items-center gap-1.5 text-gray-300 text-sm mb-3">
        <Clock size={14} className="text-gray-500 shrink-0" />
        <span>
          {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
        </span>
      </div>

      {/* Available: sign-up button */}
      {isAvailable && (
        <button
          onClick={handleSignUp}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium min-h-[48px] py-2 px-4 rounded-lg transition-colors"
        >
          <UserPlus size={16} />
          {loading ? '...' : LABELS.signUp}
        </button>
      )}

      {/* Scheduled: countdown + clock-in (only for own shifts) */}
      {!isAvailable && isScheduled && (
        <div className="space-y-3">
          <p className="text-xs text-blue-400">
            {LABELS.shiftStartsIn}{' '}
            <span className="font-semibold">{formatCountdown(countdown)}</span>
          </p>
          <button
            onClick={handleClockIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium min-h-[48px] py-2 px-4 rounded-lg transition-colors"
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
            <span>{LABELS.activeFor} {duration}</span>
          </div>
          <button
            onClick={handleClockOut}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium min-h-[48px] py-2 px-4 rounded-lg transition-colors"
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

      {/* Pending */}
      {!isAvailable && isPending && (
        <div className="flex items-center gap-1.5 text-yellow-400 text-xs">
          <Clock size={14} className="text-yellow-500" />
          <span>{LABELS.pendingApproval}</span>
        </div>
      )}

      {/* Rejected */}
      {isRejected && (
        <div className="flex items-center gap-1.5 text-red-500 text-xs">
          <XCircle size={14} />
          <span>{LABELS.rejected}</span>
        </div>
      )}

      {/* Inline error */}
      {error && (
        <p className="mt-2 text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
