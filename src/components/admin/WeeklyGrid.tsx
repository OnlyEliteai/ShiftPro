import { ChevronRight, ChevronLeft, Plus } from 'lucide-react';
import type { Chatter, Shift, ShiftWithChatter } from '../../lib/types';
import { LABELS, formatTime, getWeekDates, cn } from '../../lib/utils';
import { StatusBadge } from '../shared/StatusBadge';

interface WeeklyGridProps {
  shifts: ShiftWithChatter[];
  chatters: Chatter[];
  weekOffset: number;
  onWeekChange: (offset: number) => void;
  onAddShift: (date: string) => void;
  onEditShift: (shift: Shift) => void;
}

export function WeeklyGrid({
  shifts,
  chatters: _chatters,
  weekOffset,
  onWeekChange,
  onAddShift,
  onEditShift,
}: WeeklyGridProps) {
  const weekDates = getWeekDates(weekOffset);

  // Map shifts by date
  const shiftsByDate: Record<string, ShiftWithChatter[]> = {};
  weekDates.forEach((date) => {
    shiftsByDate[date] = shifts.filter((s) => s.date === date);
  });

  // Format header date nicely
  function formatHeaderDate(dateStr: string) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
  }

  // Determine if a date is today
  function isToday(dateStr: string) {
    return dateStr === new Date().toISOString().split('T')[0];
  }

  return (
    <div className="p-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">{LABELS.schedule}</h2>

        {/* Week navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onWeekChange(weekOffset - 1)}
            className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
            aria-label="שבוע קודם"
          >
            <ChevronRight size={18} />
          </button>

          <button
            onClick={() => onWeekChange(0)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              weekOffset === 0
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
            )}
          >
            השבוע
          </button>

          <button
            onClick={() => onWeekChange(weekOffset + 1)}
            className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
            aria-label="שבוע הבא"
          >
            <ChevronLeft size={18} />
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-2">
        {/* Day headers */}
        {weekDates.map((date, i) => (
          <div
            key={date}
            className={cn(
              'text-center pb-2 border-b',
              isToday(date) ? 'border-blue-500' : 'border-gray-700'
            )}
          >
            <p
              className={cn(
                'text-xs font-semibold mb-1',
                isToday(date) ? 'text-blue-400' : 'text-gray-400'
              )}
            >
              {LABELS.days[i]}
            </p>
            <p
              className={cn(
                'text-sm font-bold',
                isToday(date) ? 'text-blue-300' : 'text-gray-300'
              )}
            >
              {formatHeaderDate(date)}
            </p>
          </div>
        ))}

        {/* Shift columns */}
        {weekDates.map((date) => (
          <div
            key={date}
            className={cn(
              'min-h-[160px] rounded-lg p-1.5 space-y-1.5 cursor-pointer transition-colors group',
              isToday(date) ? 'bg-blue-950/30' : 'bg-gray-800/30 hover:bg-gray-800/60'
            )}
            onClick={() => onAddShift(date)}
          >
            {/* Shifts in this day */}
            {shiftsByDate[date].map((shift) => (
              <div
                key={shift.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onEditShift(shift);
                }}
                className={cn(
                  'rounded-md p-2 cursor-pointer border border-transparent hover:border-gray-500 transition-all',
                  shift.status === 'active'
                    ? 'bg-green-900/40'
                    : shift.status === 'missed'
                    ? 'bg-red-900/40'
                    : shift.status === 'completed'
                    ? 'bg-gray-700/60'
                    : 'bg-blue-900/40'
                )}
              >
                {/* Chatter name + active indicator */}
                <div className="flex items-center gap-1 mb-1">
                  {shift.status === 'active' && (
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                    </span>
                  )}
                  <p className="text-xs font-semibold text-white truncate leading-none">
                    {shift.chatters?.name ?? '—'}
                  </p>
                </div>

                {/* Time */}
                <p className="text-xs text-gray-300 font-mono mb-1">
                  {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
                </p>

                {/* Model */}
                {shift.model && (
                  <p className="text-xs text-gray-400 truncate mb-1">{shift.model}</p>
                )}

                {/* Status badge */}
                <StatusBadge status={shift.status} />
              </div>
            ))}

            {/* Add shift hint on hover (only when no shifts or as last element) */}
            <div className="flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity py-1">
              <Plus size={14} className="text-gray-500" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
