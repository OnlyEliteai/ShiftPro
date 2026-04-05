import { useState } from 'react';
import { ChevronRight, ChevronLeft, Plus, CalendarPlus } from 'lucide-react';
import type { Shift, ShiftWithChatter } from '../../lib/types';
import { LABELS, formatTime, getWeekDates, cn } from '../../lib/utils';
import { StatusBadge } from '../shared/StatusBadge';
import { supabase } from '../../lib/supabase';

interface WeeklyGridProps {
  shifts: ShiftWithChatter[];
  weekOffset: number;
  onWeekChange: (offset: number) => void;
  onAddShift: (date: string, shiftType: 'morning' | 'evening') => void;
  onEditShift: (shift: Shift) => void;
  showToast?: (type: 'success' | 'error', message: string) => void;
}

export function WeeklyGrid({
  shifts,
  weekOffset,
  onWeekChange,
  onAddShift,
  onEditShift,
  showToast,
}: WeeklyGridProps) {
  const [generatingSlots, setGeneratingSlots] = useState(false);

  async function handleGenerateSlots() {
    setGeneratingSlots(true);
    const nextWeekDates = getWeekDates(1);
    const rows = nextWeekDates.flatMap((date) => [
      {
        date,
        shift_type: 'morning' as const,
        model: null,
        platform: null,
        max_chatters: 1,
        status: 'open' as const,
      },
      {
        date,
        shift_type: 'evening' as const,
        model: null,
        platform: null,
        max_chatters: 1,
        status: 'open' as const,
      },
    ]);

    const { data, error } = await supabase
      .from('shift_slots')
      .upsert(rows, {
        onConflict: 'date,shift_type',
        ignoreDuplicates: true,
      })
      .select('id');

    if (error) {
      showToast?.('error', error.message);
    } else {
      const createdCount = data?.length ?? 0;
      if (createdCount === 0) {
        showToast?.('success', 'כל החלונות לשבוע הזה כבר קיימים');
      } else {
        showToast?.('success', `נוצרו ${createdCount} חלונות חדשים`);
      }
    }
    setGeneratingSlots(false);
  }

  const weekDates = getWeekDates(weekOffset);
  const windows = [
    { key: 'morning' as const, label: 'בוקר', time: '12:00–19:00' },
    { key: 'evening' as const, label: 'ערב', time: '19:00–02:00' },
  ];

  const shiftsByDateAndWindow: Record<
    string,
    { morning: ShiftWithChatter[]; evening: ShiftWithChatter[] }
  > = {};
  weekDates.forEach((date) => {
    shiftsByDateAndWindow[date] = { morning: [], evening: [] };
  });

  function getWindowByStartTime(startTime: string) {
    const hour = Number(startTime.slice(0, 2));
    if (startTime.startsWith('12:00') || (hour >= 6 && hour < 19)) {
      return 'morning' as const;
    }
    return 'evening' as const;
  }

  for (const shift of shifts) {
    if (!shiftsByDateAndWindow[shift.date]) continue;
    const window = getWindowByStartTime(shift.start_time);
    shiftsByDateAndWindow[shift.date][window].push(shift);
  }

  // Format header date nicely
  function formatHeaderDate(dateStr: string) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
  }

  function formatWeekLabel() {
    const start = formatHeaderDate(weekDates[0]);
    const end = formatHeaderDate(weekDates[6]);
    return `${start} - ${end}`;
  }

  function getPlatformBadge(platform: ShiftWithChatter['platform']) {
    if (platform === 'telegram') {
      return { label: '📱 טלגרם', className: 'bg-blue-500/20 text-blue-300' };
    }
    if (platform === 'onlyfans') {
      return { label: '🔵 אונלי', className: 'bg-indigo-500/20 text-indigo-300' };
    }
    return null;
  }

  // Determine if a date is today
  function isToday(dateStr: string) {
    return dateStr === new Date().toISOString().split('T')[0];
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-white">{LABELS.schedule}</h2>
          <button
            onClick={handleGenerateSlots}
            disabled={generatingSlots}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            <CalendarPlus size={14} />
            {generatingSlots ? '...' : LABELS.generateNextWeekSlots}
          </button>
        </div>

        {/* Week navigation */}
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => onWeekChange(weekOffset - 1)}
            className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
            aria-label={LABELS.prevWeek}
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
            {LABELS.thisWeek}
          </button>
          <span className="px-2 text-gray-300 font-medium">{formatWeekLabel()}</span>

          <button
            onClick={() => onWeekChange(weekOffset + 1)}
            className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
            aria-label={LABELS.nextWeek}
          >
            <ChevronLeft size={18} />
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
        <div className="grid grid-cols-8 gap-2 min-w-[980px]">
          <div className="text-center pb-2 border-b border-gray-700" />
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

          {windows.map((window) => (
            <div key={window.key} className="contents">
              <div
                className="rounded-lg bg-gray-900/80 border border-gray-800 p-3 flex flex-col justify-center"
              >
                <p className="text-sm font-bold text-white">{window.label}</p>
                <p className="text-xs text-gray-400 mt-1">{window.time}</p>
              </div>
              {weekDates.map((date) => (
                <div
                  key={`${window.key}-${date}`}
                  className={cn(
                    'min-h-[170px] rounded-lg p-2 space-y-2 cursor-pointer transition-colors group border',
                    isToday(date)
                      ? 'bg-blue-950/20 border-blue-900/60'
                      : 'bg-gray-800/30 border-gray-800 hover:bg-gray-800/60'
                  )}
                  onClick={() => onAddShift(date, window.key)}
                >
                  {shiftsByDateAndWindow[date][window.key].map((shift) => {
                    const platformBadge = getPlatformBadge(shift.platform);
                    return (
                      <div
                        key={shift.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditShift(shift);
                        }}
                        className={cn(
                          'rounded-md p-2 cursor-pointer border border-transparent hover:border-gray-500 transition-all',
                          shift.status === 'active'
                            ? 'bg-green-900/35'
                            : shift.status === 'completed'
                              ? 'bg-blue-900/30'
                              : shift.status === 'missed'
                                ? 'bg-red-900/35'
                                : shift.status === 'scheduled'
                                  ? 'bg-gray-700/50'
                                  : shift.status === 'pending'
                                    ? 'bg-yellow-900/30'
                                    : 'bg-red-950/30'
                        )}
                      >
                        <p className="text-xs font-semibold text-white truncate mb-1">
                          {shift.chatters?.name ?? '—'}
                        </p>
                        {shift.model && (
                          <p className="text-xs text-gray-300 truncate mb-1">{shift.model}</p>
                        )}
                        {platformBadge && (
                          <span
                            className={`inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded mb-2 ${platformBadge.className}`}
                          >
                            {platformBadge.label}
                          </span>
                        )}
                        <p className="text-[11px] text-gray-400 font-mono mb-1">
                          {formatTime(shift.start_time)}–{formatTime(shift.end_time)}
                        </p>
                        <StatusBadge status={shift.status} />
                      </div>
                    );
                  })}

                  <div className="flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity py-1">
                    <Plus size={14} className="text-gray-500" />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
