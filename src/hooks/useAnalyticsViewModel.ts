import { useMemo } from 'react';
import type {
  AnalyticsActivityRow,
  AnalyticsChatterRow,
  AnalyticsShiftRow,
  AnalyticsSummaryRow,
  MonthlyGoalRow,
} from './useAnalyticsData';
import {
  aggregateByModel,
  aggregateByPlatform,
  computeAttendance,
  computeAvgClockInDelay,
  computeReliability,
  goalProgress,
  monthlyIncomeTotals,
} from '../lib/analyticsCalc';

interface UseAnalyticsViewModelParams {
  shifts: AnalyticsShiftRow[];
  summaries: AnalyticsSummaryRow[];
  goals: MonthlyGoalRow[];
  chatters: AnalyticsChatterRow[];
  activity: AnalyticsActivityRow[];
  startDate: string;
  endDate: string;
  goalMonth: string;
}

function startOfWeek(date: Date): Date {
  const output = new Date(date);
  output.setDate(date.getDate() - date.getDay());
  return output;
}

function toWeekKey(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00`);
  const weekStartDate = startOfWeek(date);
  const day = String(weekStartDate.getDate()).padStart(2, '0');
  const month = String(weekStartDate.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

function toMonthInput(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
}

function getChatterName(chatter: { name: string } | { name: string }[] | null): string {
  if (!chatter) return 'לא ידוע';
  if (Array.isArray(chatter)) return chatter[0]?.name ?? 'לא ידוע';
  return chatter.name ?? 'לא ידוע';
}

export function useAnalyticsViewModel({
  shifts,
  summaries,
  goals,
  chatters,
  activity,
  startDate,
  endDate,
  goalMonth,
}: UseAnalyticsViewModelParams) {
  const rangeShifts = useMemo(
    () => shifts.filter((item) => item.date >= startDate && item.date <= endDate),
    [endDate, shifts, startDate]
  );

  const rangeSummaries = useMemo(
    () => summaries.filter((item) => item.date >= startDate && item.date <= endDate),
    [endDate, startDate, summaries]
  );

  const attendanceKpi = useMemo(() => computeAttendance(rangeShifts), [rangeShifts]);
  const avgDelayKpi = useMemo(() => computeAvgClockInDelay(rangeShifts, activity), [rangeShifts, activity]);

  const currentMonth = toMonthInput();
  const currentIncome = useMemo(() => monthlyIncomeTotals(summaries, currentMonth), [summaries, currentMonth]);
  const currentGoalTotal = useMemo(
    () =>
      goals
        .filter((item) => item.month.slice(0, 7) === currentMonth)
        .reduce((sum, item) => sum + Number(item.target_income ?? 0), 0),
    [goals, currentMonth]
  );
  const monthlyGoalKpi = useMemo(
    () => goalProgress(currentIncome, currentGoalTotal > 0 ? currentGoalTotal : null),
    [currentIncome, currentGoalTotal]
  );

  const weeklyTrend = useMemo(() => {
    const bucket = new Map<string, { label: string; completed: number; missed: number }>();
    for (const shift of rangeShifts) {
      const label = toWeekKey(shift.date);
      const entry = bucket.get(label) ?? { label, completed: 0, missed: 0 };
      if (shift.status === 'completed') entry.completed += 1;
      if (shift.status === 'missed') entry.missed += 1;
      bucket.set(label, entry);
    }
    return Array.from(bucket.values());
  }, [rangeShifts]);

  const platformSplit = useMemo(() => {
    const totals = aggregateByPlatform(
      rangeSummaries.map((item) => ({
        chatter_id: item.chatter_id,
        date: item.date,
        income_onlyfans: item.income_onlyfans,
        income_telegram: item.income_telegram,
        income_total: item.income_total,
      }))
    );

    return [
      { name: 'Telegram', value: totals.telegram },
      { name: 'OnlyFans', value: totals.onlyfans },
    ];
  }, [rangeSummaries]);

  const chatterRows = useMemo(() => {
    const chatterNameMap = new Map(chatters.map((item) => [item.id, item.name]));
    const reliability = computeReliability(
      rangeShifts.map((item) => ({
        chatter_id: item.chatter_id,
        date: item.date,
        start_time: item.start_time,
        status: item.status,
        model: item.model,
      }))
    );

    return reliability
      .map((row) => {
        const chatterShifts = rangeShifts.filter((item) => item.chatter_id === row.chatterId);
        const chatterActivity = activity.filter((item) => item.chatter_id === row.chatterId);
        const delay = computeAvgClockInDelay(
          chatterShifts.map((item) => ({
            chatter_id: item.chatter_id,
            date: item.date,
            start_time: item.start_time,
            status: item.status,
            model: item.model,
          })),
          chatterActivity
        );

        const monthIncome = monthlyIncomeTotals(
          summaries
            .filter((item) => item.chatter_id === row.chatterId)
            .map((item) => ({
              chatter_id: item.chatter_id,
              date: item.date,
              income_onlyfans: item.income_onlyfans,
              income_telegram: item.income_telegram,
              income_total: item.income_total,
            })),
          goalMonth
        );

        const chatterGoal = goals.find(
          (item) => item.chatter_id === row.chatterId && item.month.slice(0, 7) === goalMonth
        );
        const monthGoal = Number(chatterGoal?.target_income ?? 0);

        return {
          chatterId: row.chatterId,
          name: chatterNameMap.get(row.chatterId) ?? getChatterName(chatterShifts[0]?.chatters ?? null),
          rate: row.rate,
          totalShifts: row.total,
          completed: row.completed,
          missed: row.missed,
          rejected: row.rejected,
          avgDelayMinutes: delay.avgSeconds == null ? null : delay.avgSeconds / 60,
          incomeThisMonth: monthIncome,
          goalPct: goalProgress(monthIncome, monthGoal > 0 ? monthGoal : null).pct,
        };
      })
      .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1));
  }, [chatters, rangeShifts, activity, summaries, goalMonth, goals]);

  const weeklyPlatform = useMemo(() => {
    const map = new Map<string, { label: string; telegram: number; onlyfans: number }>();
    for (const summary of rangeSummaries) {
      const key = toWeekKey(summary.date);
      const entry = map.get(key) ?? { label: key, telegram: 0, onlyfans: 0 };
      entry.telegram += Number(summary.income_telegram ?? 0);
      entry.onlyfans += Number(summary.income_onlyfans ?? 0);
      map.set(key, entry);
    }
    return Array.from(map.values());
  }, [rangeSummaries]);

  const modelCoverageRows = useMemo(() => {
    const map = aggregateByModel(
      rangeShifts.map((item) => ({
        chatter_id: item.chatter_id,
        date: item.date,
        start_time: item.start_time,
        status: item.status,
        model: item.model,
      }))
    );
    return Array.from(map.entries()).map(([model, shiftsCount]) => ({ model, shifts: shiftsCount }));
  }, [rangeShifts]);

  const goalRows = useMemo(() => {
    const byChatterIncome = new Map<string, number>();
    for (const summary of summaries) {
      if (!summary.date.startsWith(goalMonth)) continue;
      byChatterIncome.set(
        summary.chatter_id,
        (byChatterIncome.get(summary.chatter_id) ?? 0) + Number(summary.income_total ?? 0)
      );
    }

    const latestGoals = new Map<string, number>();
    const selectedGoals = goals
      .filter((item) => item.month.slice(0, 7) === goalMonth)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

    for (const item of selectedGoals) {
      if (!latestGoals.has(item.chatter_id)) {
        latestGoals.set(item.chatter_id, Number(item.target_income ?? 0));
      }
    }

    return chatters.map((chatter) => {
      const achieved = byChatterIncome.get(chatter.id) ?? 0;
      const goal = latestGoals.get(chatter.id) ?? null;
      return {
        chatterId: chatter.id,
        name: chatter.name,
        goal,
        achieved,
        pct: goalProgress(achieved, goal).pct,
      };
    });
  }, [chatters, goalMonth, goals, summaries]);

  return {
    attendanceKpi,
    avgDelayKpi,
    currentGoalTotal,
    monthlyGoalKpi,
    weeklyTrend,
    platformSplit,
    chatterRows,
    weeklyPlatform,
    modelCoverageRows,
    goalRows,
  };
}
