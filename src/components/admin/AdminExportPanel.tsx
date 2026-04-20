import { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Platform } from '../../lib/types';
import { toCsv, triggerDownload } from '../../lib/exportCsv';

interface AdminExportPanelProps {
  showToast: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void;
}

type ChatterRelation = { name: string } | { name: string }[] | null;

interface ShiftExportRow {
  date: string;
  start_time: string;
  end_time: string;
  shift_type: 'morning' | 'evening' | null;
  status: string;
  clocked_in: string | null;
  clocked_out: string | null;
  model: string | null;
  platform: Platform | null;
  chatters: ChatterRelation;
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

interface CachedRange<T> {
  startDate: string;
  endDate: string;
  rows: T[];
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function formatInputDate(date: Date): string {
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

function getChatterName(chatters: ChatterRelation): string {
  if (!chatters) return '';
  if (Array.isArray(chatters)) return chatters[0]?.name ?? '';
  return chatters.name ?? '';
}

function withinRange(itemDate: string, startDate: string, endDate: string) {
  return itemDate >= startDate && itemDate <= endDate;
}

function canUseCache<T>(cache: CachedRange<T> | null, startDate: string, endDate: string) {
  if (!cache) return false;
  return startDate >= cache.startDate && endDate <= cache.endDate;
}

function filename(prefix: string, startDate: string, endDate: string) {
  return `${prefix}_${startDate}_to_${endDate}.csv`;
}

export function AdminExportPanel({ showToast }: AdminExportPanelProps) {
  const defaults = useMemo(() => getDefaultDateRange(), []);
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [loading, setLoading] = useState<'shifts' | 'summaries' | null>(null);
  const [shiftCache, setShiftCache] = useState<CachedRange<ShiftExportRow> | null>(null);
  const [summaryCache, setSummaryCache] = useState<CachedRange<SummaryExportRow> | null>(null);

  const invalidRange = startDate > endDate;

  const fetchShiftRows = async (): Promise<ShiftExportRow[] | null> => {
    if (shiftCache && canUseCache(shiftCache, startDate, endDate)) {
      return shiftCache.rows.filter((row) => withinRange(row.date, startDate, endDate));
    }

    const { data, error } = await supabase
      .from('shifts')
      .select('date, start_time, end_time, shift_type, status, clocked_in, clocked_out, model, platform, chatters(name)')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) {
      showToast('error', 'שגיאה בייצוא משמרות');
      return null;
    }

    const rows = (data ?? []) as ShiftExportRow[];
    setShiftCache({ startDate, endDate, rows });
    return rows;
  };

  const fetchSummaryRows = async (): Promise<SummaryExportRow[] | null> => {
    if (summaryCache && canUseCache(summaryCache, startDate, endDate)) {
      return summaryCache.rows.filter((row) => withinRange(row.date, startDate, endDate));
    }

    const { data, error } = await supabase
      .from('daily_summaries')
      .select('date, shift_type, income_onlyfans, income_telegram, income_transfers, income_other, income_total, availability_status, improvement_suggestions, chatters(name)')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true });

    if (error) {
      showToast('error', 'שגיאה בייצוא סיכומים');
      return null;
    }

    const rows = (data ?? []) as SummaryExportRow[];
    setSummaryCache({ startDate, endDate, rows });
    return rows;
  };

  const exportShifts = async () => {
    if (invalidRange) {
      showToast('error', 'טווח תאריכים לא תקין');
      return;
    }

    setLoading('shifts');
    const rows = await fetchShiftRows();
    if (!rows) {
      setLoading(null);
      return;
    }

    const csvRows = rows.map((row) => [
      row.date,
      getChatterName(row.chatters),
      row.shift_type ?? '',
      row.start_time,
      row.end_time,
      row.model ?? '',
      row.platform ?? '',
      row.status,
      row.clocked_in ?? '',
      row.clocked_out ?? '',
    ]);

    const blob = toCsv(
      ['תאריך', 'שם צ׳אטר', 'סוג משמרת', 'שעת התחלה', 'שעת סיום', 'מודל', 'פלטפורמה', 'סטטוס', 'כניסה בפועל', 'יציאה בפועל'],
      csvRows
    );

    triggerDownload(blob, filename('shifts', startDate, endDate));
    showToast('success', 'ייצוא משמרות הושלם');
    setLoading(null);
  };

  const exportSummaries = async () => {
    if (invalidRange) {
      showToast('error', 'טווח תאריכים לא תקין');
      return;
    }

    setLoading('summaries');
    const rows = await fetchSummaryRows();
    if (!rows) {
      setLoading(null);
      return;
    }

    const csvRows = rows.map((row) => [
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

    const blob = toCsv(
      ['תאריך', 'שם צ׳אטר', 'סוג משמרת', 'OnlyFans', 'Telegram', 'העברות', 'אחר', 'סה״כ', 'סטטוס זמינות', 'הערות'],
      csvRows
    );

    triggerDownload(blob, filename('summaries', startDate, endDate));
    showToast('success', 'ייצוא סיכומים הושלם');
    setLoading(null);
  };

  return (
    <section className="mt-6 rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-white">ייצוא נתונים</h3>
          <p className="text-xs text-gray-400 mt-1">קובצי CSV עם תאימות Excel מלאה</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          ייצוא נתונים
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-xl rounded-xl border border-gray-700 bg-gray-900 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-lg font-semibold text-white">ייצוא נתונים</h4>
              <button type="button" onClick={() => setOpen(false)} className="text-sm text-gray-300">סגור</button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm text-gray-300">
                מתאריך
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-gray-300">
                עד תאריך
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white"
                />
              </label>
            </div>

            {invalidRange && <p className="text-xs text-red-400">טווח תאריכים לא תקין</p>}

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => {
                  void exportShifts();
                }}
                disabled={loading !== null || invalidRange}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
              >
                {loading === 'shifts' ? 'מייצא...' : 'ייצוא משמרות'}
              </button>

              <button
                type="button"
                onClick={() => {
                  void exportSummaries();
                }}
                disabled={loading !== null || invalidRange}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-60"
              >
                {loading === 'summaries' ? 'מייצא...' : 'ייצוא סיכומים'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
