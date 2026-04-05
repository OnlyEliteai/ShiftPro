import { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Platform } from '../../lib/types';

interface AdminExportPanelProps {
  showToast: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void;
}

type ChatterRelation = { name: string } | { name: string }[] | null;

interface ShiftExportRow {
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  clocked_in: string | null;
  clocked_out: string | null;
  model: string | null;
  platform: Platform | null;
  chatters: ChatterRelation;
  shift_assignments: Array<{ model: string; platform: Platform }> | null;
}

interface SummaryExportRow {
  date: string;
  shift_type: string;
  income_onlyfans: number | null;
  income_telegram: number | null;
  income_transfers: number | null;
  income_other: number | null;
  income_total: number | null;
  availability_status: string | null;
  improvement_suggestions: string | null;
  chatters: ChatterRelation;
}

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function formatInputDate(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function getDefaultDateRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return {
    startDate: formatInputDate(start),
    endDate: formatInputDate(end),
  };
}

function getChatterName(chatters: ChatterRelation) {
  if (!chatters) return '';
  if (Array.isArray(chatters)) return chatters[0]?.name ?? '';
  return chatters.name ?? '';
}

function getShiftTypeLabel(startTime: string) {
  const hour = Number(startTime.slice(0, 2));
  return startTime.startsWith('12:00') || hour < 19 ? 'morning' : 'evening';
}

function getPlatformLabel(platform: Platform) {
  return platform === 'telegram' ? 'telegram' : 'onlyfans';
}

function escapeCSVValue(value: unknown) {
  const str = value == null ? '' : String(value);
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function exportToCSV(headers: string[], rows: Array<Array<string | number>>) {
  const csv = [
    headers.map(escapeCSVValue).join(','),
    ...rows.map((row) => row.map(escapeCSVValue).join(',')),
  ].join('\n');

  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  return url;
}

function formatFilename(prefix: string, startDate: string, endDate: string) {
  return `${prefix}_${startDate}_to_${endDate}.csv`;
}

export function AdminExportPanel({ showToast }: AdminExportPanelProps) {
  const defaults = useMemo(() => getDefaultDateRange(), []);
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [exporting, setExporting] = useState<'shifts' | 'summaries' | null>(null);

  const isInvalidRange = startDate > endDate;

  async function handleExportShifts() {
    if (isInvalidRange) {
      showToast('error', 'טווח תאריכים לא תקין');
      return;
    }

    setExporting('shifts');
    const { data, error } = await supabase
      .from('shifts')
      .select('date, start_time, end_time, status, clocked_in, clocked_out, model, platform, chatters(name), shift_assignments(model, platform)')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) {
      showToast('error', 'שגיאה בייצוא משמרות');
      setExporting(null);
      return;
    }

    const rows = ((data ?? []) as ShiftExportRow[]).map((row) => {
      const assignments = row.shift_assignments ?? [];
      const assignmentModels = Array.from(new Set(assignments.map((assignment) => assignment.model)));
      const assignmentPlatforms = Array.from(
        new Set(assignments.map((assignment) => getPlatformLabel(assignment.platform)))
      );

      const models = assignmentModels.length > 0
        ? assignmentModels.join(' | ')
        : row.model ?? '';
      const platforms = assignmentPlatforms.length > 0
        ? assignmentPlatforms.join(' | ')
        : row.platform
          ? getPlatformLabel(row.platform)
          : '';

      return [
        row.date,
        getChatterName(row.chatters),
        getShiftTypeLabel(row.start_time),
        row.start_time,
        row.end_time,
        models,
        platforms,
        row.status,
        row.clocked_in ?? '',
        row.clocked_out ?? '',
      ];
    });

    const headers = [
      'date',
      'chatter_name',
      'shift_type',
      'start_time',
      'end_time',
      'models',
      'platforms',
      'status',
      'clocked_in',
      'clocked_out',
    ];

    const csvUrl = exportToCSV(headers, rows);
    const link = document.createElement('a');
    link.href = csvUrl;
    link.download = formatFilename('shifts', startDate, endDate);
    link.click();
    URL.revokeObjectURL(csvUrl);
    showToast('success', 'ייצוא משמרות הושלם');
    setExporting(null);
  }

  async function handleExportSummaries() {
    if (isInvalidRange) {
      showToast('error', 'טווח תאריכים לא תקין');
      return;
    }

    setExporting('summaries');
    const { data, error } = await supabase
      .from('daily_summaries')
      .select('date, shift_type, income_onlyfans, income_telegram, income_transfers, income_other, income_total, availability_status, improvement_suggestions, chatters(name)')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true });

    if (error) {
      showToast('error', 'שגיאה בייצוא סיכומים');
      setExporting(null);
      return;
    }

    const rows = ((data ?? []) as SummaryExportRow[]).map((row) => [
      row.date,
      getChatterName(row.chatters),
      row.shift_type ?? '',
      Number(row.income_onlyfans ?? 0),
      Number(row.income_telegram ?? 0),
      Number(row.income_transfers ?? 0),
      Number(row.income_other ?? 0),
      Number(row.income_total ?? 0),
      row.availability_status ?? '',
      row.improvement_suggestions ?? '',
    ]);

    const headers = [
      'date',
      'chatter_name',
      'shift_type',
      'income_onlyfans',
      'income_telegram',
      'income_transfers',
      'income_other',
      'income_total',
      'availability_status',
      'notes',
    ];

    const csvUrl = exportToCSV(headers, rows);
    const link = document.createElement('a');
    link.href = csvUrl;
    link.download = formatFilename('daily_summaries', startDate, endDate);
    link.click();
    URL.revokeObjectURL(csvUrl);
    showToast('success', 'ייצוא סיכומים הושלם');
    setExporting(null);
  }

  return (
    <section className="mt-6 bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
      <div>
        <h3 className="text-lg font-bold text-white">ייצוא נתונים</h3>
        <p className="text-xs text-gray-400 mt-1">בחר טווח תאריכים וייצא CSV (Excel-ready)</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm text-gray-300">
          מתאריך
          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-gray-300">
          עד תאריך
          <input
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
          />
        </label>
      </div>

      {isInvalidRange && (
        <p className="text-xs text-red-400">טווח תאריכים לא תקין</p>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <button
          onClick={() => void handleExportShifts()}
          disabled={Boolean(exporting) || isInvalidRange}
          className="min-h-[40px] px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-medium"
        >
          {exporting === 'shifts' ? 'מייצא...' : 'ייצוא משמרות'}
        </button>
        <button
          onClick={() => void handleExportSummaries()}
          disabled={Boolean(exporting) || isInvalidRange}
          className="min-h-[40px] px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-medium"
        >
          {exporting === 'summaries' ? 'מייצא...' : 'ייצוא סיכומים'}
        </button>
      </div>
    </section>
  );
}
