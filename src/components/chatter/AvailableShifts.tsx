import type { Shift } from '../../lib/types';
import { formatDateFull, LABELS } from '../../lib/utils';
import { ShiftCard } from './ShiftCard';
import { CalendarPlus } from 'lucide-react';

interface AvailableShiftsProps {
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

export function AvailableShifts({ shifts, token, onRefetch }: AvailableShiftsProps) {
  if (shifts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
        <CalendarPlus size={36} className="text-gray-600" />
        <p className="text-gray-400 text-sm">{LABELS.noAvailableShifts}</p>
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
                  variant="available"
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
