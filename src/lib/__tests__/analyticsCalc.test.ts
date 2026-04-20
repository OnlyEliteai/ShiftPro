import { describe, expect, it } from 'vitest';
import {
  aggregateByModel,
  aggregateByPlatform,
  computeAttendance,
  computeAvgClockInDelay,
  computeReliability,
  goalProgress,
  monthlyIncomeTotals,
  type AnalyticsActivityRow,
  type AnalyticsShiftRow,
  type AnalyticsSummaryRow,
} from '../analyticsCalc';

describe('analyticsCalc', () => {
  it('computeAttendance handles empty arrays', () => {
    expect(computeAttendance([])).toEqual({ rate: null, completed: 0, missed: 0 });
  });

  it('computeAttendance calculates guarded percentage', () => {
    const shifts: AnalyticsShiftRow[] = [
      { chatter_id: 'c1', date: '2026-04-01', start_time: '10:00', status: 'completed', model: 'A' },
      { chatter_id: 'c2', date: '2026-04-01', start_time: '10:00', status: 'missed', model: 'B' },
      { chatter_id: 'c3', date: '2026-04-01', start_time: '10:00', status: 'scheduled', model: 'C' },
    ];
    expect(computeAttendance(shifts)).toEqual({ rate: 50, completed: 1, missed: 1 });
  });

  it('computeAvgClockInDelay returns null on no sample', () => {
    expect(computeAvgClockInDelay([], [])).toEqual({ avgSeconds: null, sampleSize: 0 });
  });

  it('computeAvgClockInDelay computes average from same-day clock_in', () => {
    const shifts: AnalyticsShiftRow[] = [
      { chatter_id: 'c1', date: '2026-04-01', start_time: '10:00', status: 'completed', model: 'A' },
      { chatter_id: 'c2', date: '2026-04-01', start_time: '11:00', status: 'completed', model: 'B' },
    ];
    const activity: AnalyticsActivityRow[] = [
      { chatter_id: 'c1', action: 'clock_in', timestamp: '2026-04-01T10:05:00' },
      { chatter_id: 'c2', action: 'clock_in', timestamp: '2026-04-01T11:10:00' },
    ];

    expect(computeAvgClockInDelay(shifts, activity)).toEqual({ avgSeconds: 450, sampleSize: 2 });
  });

  it('computeReliability returns per chatter null-safe rates', () => {
    const shifts: AnalyticsShiftRow[] = [
      { chatter_id: 'c1', date: '2026-04-01', start_time: '10:00', status: 'completed', model: 'A' },
      { chatter_id: 'c1', date: '2026-04-02', start_time: '10:00', status: 'missed', model: 'A' },
      { chatter_id: 'c2', date: '2026-04-03', start_time: '10:00', status: 'scheduled', model: 'B' },
    ];

    const rows = computeReliability(shifts).sort((a, b) => a.chatterId.localeCompare(b.chatterId));
    expect(rows).toEqual([
      { chatterId: 'c1', completed: 1, missed: 1, rejected: 0, total: 2, rate: 50 },
      { chatterId: 'c2', completed: 0, missed: 0, rejected: 0, total: 1, rate: null },
    ]);
  });

  it('aggregateByPlatform handles null numbers', () => {
    const summaries: AnalyticsSummaryRow[] = [
      {
        chatter_id: 'c1',
        date: '2026-04-01',
        income_onlyfans: 100,
        income_telegram: 50,
        income_total: 150,
      },
      {
        chatter_id: 'c2',
        date: '2026-04-02',
        income_onlyfans: null,
        income_telegram: 75,
        income_total: 75,
      },
    ];
    expect(aggregateByPlatform(summaries)).toEqual({ telegram: 125, onlyfans: 100 });
  });

  it('aggregateByModel groups by model with fallback label', () => {
    const shifts: AnalyticsShiftRow[] = [
      { chatter_id: 'c1', date: '2026-04-01', start_time: '10:00', status: 'completed', model: 'Bella' },
      { chatter_id: 'c2', date: '2026-04-01', start_time: '10:00', status: 'completed', model: 'Bella' },
      { chatter_id: 'c3', date: '2026-04-01', start_time: '10:00', status: 'completed', model: null },
    ];
    const map = aggregateByModel(shifts);
    expect(map.get('Bella')).toBe(2);
    expect(map.get('ללא מודל')).toBe(1);
  });

  it('monthlyIncomeTotals filters by YYYY-MM key', () => {
    const summaries: AnalyticsSummaryRow[] = [
      { chatter_id: 'c1', date: '2026-04-01', income_onlyfans: 0, income_telegram: 0, income_total: 100 },
      { chatter_id: 'c1', date: '2026-04-10', income_onlyfans: 0, income_telegram: 0, income_total: 50 },
      { chatter_id: 'c1', date: '2026-05-01', income_onlyfans: 0, income_telegram: 0, income_total: 300 },
    ];
    expect(monthlyIncomeTotals(summaries, '2026-04')).toBe(150);
    expect(monthlyIncomeTotals([], '2026-04')).toBe(0);
  });

  it('goalProgress handles none/on/behind/ahead', () => {
    expect(goalProgress(100, null)).toEqual({ pct: null, status: 'none' });
    expect(goalProgress(60, 100)).toEqual({ pct: 60, status: 'behind' });
    expect(goalProgress(80, 100)).toEqual({ pct: 80, status: 'on' });
    expect(goalProgress(120, 100)).toEqual({ pct: 120, status: 'ahead' });
  });
});
