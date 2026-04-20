export interface AnalyticsShiftRow {
  chatter_id: string;
  date: string;
  start_time: string;
  status: string;
  model: string | null;
}

export interface AnalyticsActivityRow {
  chatter_id: string;
  action: string;
  timestamp: string;
}

export interface AnalyticsSummaryRow {
  chatter_id: string;
  date: string;
  income_onlyfans: number | null;
  income_telegram: number | null;
  income_total: number | null;
}

export interface AttendanceResult {
  rate: number | null;
  completed: number;
  missed: number;
}

export interface AvgDelayResult {
  avgSeconds: number | null;
  sampleSize: number;
}

export interface ReliabilityRow {
  chatterId: string;
  completed: number;
  missed: number;
  rejected: number;
  total: number;
  rate: number | null;
}

export interface GoalProgressResult {
  pct: number | null;
  status: 'on' | 'behind' | 'ahead' | 'none';
}

function toNumber(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function roundToOne(value: number): number {
  return Math.round(value * 10) / 10;
}

export function computeAttendance(shifts: AnalyticsShiftRow[]): AttendanceResult {
  let completed = 0;
  let missed = 0;

  for (const shift of shifts) {
    if (shift.status === 'completed') completed += 1;
    if (shift.status === 'missed') missed += 1;
  }

  const denominator = completed + missed;
  return {
    completed,
    missed,
    rate: denominator > 0 ? roundToOne((completed / denominator) * 100) : null,
  };
}

function toShiftStartMs(date: string, startTime: string): number | null {
  const parsed = Date.parse(`${date}T${startTime}`);
  return Number.isFinite(parsed) ? parsed : null;
}

export function computeAvgClockInDelay(
  shifts: AnalyticsShiftRow[],
  activity: AnalyticsActivityRow[]
): AvgDelayResult {
  const firstClockInByDay = new Map<string, number>();

  for (const row of activity) {
    if (row.action !== 'clock_in') continue;
    const day = row.timestamp.slice(0, 10);
    const key = `${row.chatter_id}|${day}`;
    const ts = Date.parse(row.timestamp);
    if (!Number.isFinite(ts)) continue;
    const prev = firstClockInByDay.get(key);
    if (prev == null || ts < prev) {
      firstClockInByDay.set(key, ts);
    }
  }

  let totalSeconds = 0;
  let sampleSize = 0;

  for (const shift of shifts) {
    const key = `${shift.chatter_id}|${shift.date}`;
    const activityTs = firstClockInByDay.get(key);
    if (activityTs == null) continue;

    const startMs = toShiftStartMs(shift.date, shift.start_time);
    if (startMs == null) continue;

    totalSeconds += Math.round((activityTs - startMs) / 1000);
    sampleSize += 1;
  }

  return {
    avgSeconds: sampleSize > 0 ? Math.round(totalSeconds / sampleSize) : null,
    sampleSize,
  };
}

export function computeReliability(shifts: AnalyticsShiftRow[]): ReliabilityRow[] {
  const map = new Map<string, ReliabilityRow>();

  for (const shift of shifts) {
    const existing = map.get(shift.chatter_id) ?? {
      chatterId: shift.chatter_id,
      completed: 0,
      missed: 0,
      rejected: 0,
      total: 0,
      rate: null,
    };

    existing.total += 1;
    if (shift.status === 'completed') existing.completed += 1;
    if (shift.status === 'missed') existing.missed += 1;
    if (shift.status === 'rejected') existing.rejected += 1;
    map.set(shift.chatter_id, existing);
  }

  const rows = Array.from(map.values());
  for (const row of rows) {
    const denominator = row.completed + row.missed;
    row.rate = denominator > 0 ? roundToOne((row.completed / denominator) * 100) : null;
  }
  return rows;
}

export function aggregateByPlatform(summaries: AnalyticsSummaryRow[]): {
  telegram: number;
  onlyfans: number;
} {
  let telegram = 0;
  let onlyfans = 0;

  for (const summary of summaries) {
    telegram += toNumber(summary.income_telegram);
    onlyfans += toNumber(summary.income_onlyfans);
  }

  return { telegram, onlyfans };
}

export function aggregateByModel(shifts: AnalyticsShiftRow[]): Map<string, number> {
  const output = new Map<string, number>();
  for (const shift of shifts) {
    const name = (shift.model ?? '').trim() || 'ללא מודל';
    output.set(name, (output.get(name) ?? 0) + 1);
  }
  return output;
}

export function monthlyIncomeTotals(summaries: AnalyticsSummaryRow[], month: string): number {
  let total = 0;
  for (const summary of summaries) {
    if (!summary.date.startsWith(month)) continue;
    total += toNumber(summary.income_total);
  }
  return total;
}

export function goalProgress(income: number, goal: number | null | undefined): GoalProgressResult {
  if (goal == null || goal <= 0) {
    return { pct: null, status: 'none' };
  }

  const pct = roundToOne((income / goal) * 100);
  if (pct >= 100) {
    return { pct, status: 'ahead' };
  }
  if (pct >= 70) {
    return { pct, status: 'on' };
  }
  return { pct, status: 'behind' };
}
