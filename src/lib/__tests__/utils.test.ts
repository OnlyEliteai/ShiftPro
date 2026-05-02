import { describe, expect, it } from 'vitest';
import { LABELS, formatDateNumeric, getHebrewWeekdayLabel, getWeekDates } from '../utils';

describe('date utilities', () => {
  const israelSundayAfterMidnight = new Date('2026-05-03T00:30:00+03:00');

  it('builds the current Israel week without shifting Sunday back to Saturday', () => {
    expect(getWeekDates(0, israelSundayAfterMidnight)).toEqual([
      '2026-05-03',
      '2026-05-04',
      '2026-05-05',
      '2026-05-06',
      '2026-05-07',
      '2026-05-08',
      '2026-05-09',
    ]);
  });

  it('builds the next Israel week from the same local base date', () => {
    expect(getWeekDates(1, israelSundayAfterMidnight)).toEqual([
      '2026-05-10',
      '2026-05-11',
      '2026-05-12',
      '2026-05-13',
      '2026-05-14',
      '2026-05-15',
      '2026-05-16',
    ]);
  });

  it('derives Hebrew weekday labels from the actual date key', () => {
    expect(getHebrewWeekdayLabel('2026-05-03')).toBe(LABELS.days[0]);
    expect(getHebrewWeekdayLabel('2026-05-09')).toBe(LABELS.days[6]);
  });

  it('formats date-only keys as numeric day and month without timezone shifts', () => {
    expect(formatDateNumeric('2026-05-09')).toBe('9.5');
  });
});
