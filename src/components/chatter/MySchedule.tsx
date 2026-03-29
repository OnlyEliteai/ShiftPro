import type { Shift } from '../../lib/types';
import { formatDateFull, LABELS } from '../../lib/utils';
import { ShiftCard } from './ShiftCard';
import { CalendarX } from 'lucide-react';

interface MyScheduleProps {
  shifts: Shift[];
  token: string;
  onRefetch: () => void;
}

function groupByDate(shifts: Shift[]): Map<string, Shift[]> {
  const map = new Map<string, Shift[]>();
  for (const shift of shifts) {
    const existing = map.get(shift.date) ?? [];
    existing.push(shift);
    map.set(shift.date, existing);
  }
  return map;
}

export function MySchedule({ shifts, token, onRefetch }: MyScheduleProps) {
  if (shifts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <CalendarX size={40} className="text-gray-600" />
        <p className="text-gray-400 text-sm">{LABELS.noUpcomingShifts}</p>
      </div>
    );
  }

  const grouped = groupByDate(shifts);
  const sortedDates = Array.from(grouped.keys()).sort();

  return (
    <div className="space-y-6">
      {sortedDates.map((date) => {
        const dayShifts = grouped.get(date)!;
        return (
          <section key={date}>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              {formatDateFull(date)}
            </h2>
            <div className="space-y-3">
              {dayShifts.map((shift) => (
                <ShiftCard
                  key={shift.id}
                  shift={shift}
                  token={token}
                  onUpdate={onRefetch}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
