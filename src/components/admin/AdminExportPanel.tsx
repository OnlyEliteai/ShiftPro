import { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Chatter, Model } from '../../lib/types';
import { toCsv, triggerDownload } from '../../lib/exportCsv';
import {
  buildExportWorkbookModel,
  createShiftWorkbookBlob,
  getCurrentWeekDateRange,
  getExportFilename,
  type ExportDailySummaryRow,
  type ExportFormat,
  type ExportScope,
  type ExportShiftRow,
} from '../../lib/exportWorkbook';

interface AdminExportPanelProps {
  showToast: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void;
  chatters?: Chatter[];
  models?: Model[];
  variant?: 'section' | 'button';
}

function getAssignmentModelIds(row: ExportShiftRow) {
  const ids = new Set<string>();
  if (row.model_id) ids.add(row.model_id);
  for (const assignment of row.shift_assignments ?? []) {
    if (assignment.model_id) ids.add(assignment.model_id);
  }
  return ids;
}

function getAssignmentModelNames(row: ExportShiftRow) {
  const names = new Set<string>();
  if (row.model) names.add(row.model.trim().toLowerCase());
  for (const assignment of row.shift_assignments ?? []) {
    names.add(assignment.model.trim().toLowerCase());
  }
  return names;
}

function rowMatchesModel(row: ExportShiftRow, model: Model | undefined) {
  if (!model) return false;
  return (
    getAssignmentModelIds(row).has(model.id) ||
    getAssignmentModelNames(row).has(model.name.trim().toLowerCase())
  );
}

function summaryMatchesModel(row: ExportDailySummaryRow, model: Model | undefined) {
  if (!model) return false;
  const modelName = model.name.trim().toLowerCase();
  return (row.model_platform_assignments ?? []).some(
    (assignment) => assignment.model_name.trim().toLowerCase() === modelName
  );
}

function formatDateInput(value: string) {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function parseDateInput(value: string) {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;

  const [, day, month, year] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00`);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== Number(year) ||
    date.getMonth() + 1 !== Number(month) ||
    date.getDate() !== Number(day)
  ) {
    return null;
  }

  return `${year}-${month}-${day}`;
}

export function AdminExportPanel({
  showToast,
  chatters = [],
  models = [],
  variant = 'section',
}: AdminExportPanelProps) {
  const defaults = useMemo(() => getCurrentWeekDateRange(), []);
  const [open, setOpen] = useState(false);
  const [startDateInput, setStartDateInput] = useState(formatDateInput(defaults.startDate));
  const [endDateInput, setEndDateInput] = useState(formatDateInput(defaults.endDate));
  const [format, setFormat] = useState<ExportFormat>('xlsx');
  const [scope, setScope] = useState<ExportScope>('all');
  const [selectedChatterId, setSelectedChatterId] = useState('');
  const [selectedModelId, setSelectedModelId] = useState('');
  const [loading, setLoading] = useState(false);

  const startDate = parseDateInput(startDateInput);
  const endDate = parseDateInput(endDateInput);
  const invalidDateInput = !startDate || !endDate;
  const invalidRange = invalidDateInput || startDate > endDate;
  const selectedModel = models.find((model) => model.id === selectedModelId);

  const fetchExportRows = async (rangeStart: string, rangeEnd: string): Promise<{
    shifts: ExportShiftRow[];
    summaries: ExportDailySummaryRow[];
  } | null> => {
    const { data, error } = await supabase
      .from('shifts')
      .select('id, chatter_id, date, start_time, end_time, shift_type, status, clocked_in, clocked_out, model, model_id, platform, chatters(name), shift_assignments(id, shift_id, model_id, model, platform, shift_date, shift_start_time, assigned_at)')
      .gte('date', rangeStart)
      .lte('date', rangeEnd)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) {
      showToast('error', 'שגיאה בייצוא משמרות');
      return null;
    }

    const { data: summaryData, error: summaryError } = await supabase
      .from('daily_summaries')
      .select('id, chatter_id, shift_id, date, shift_type, model_platform_assignments, income_onlyfans, income_telegram, income_transfers, income_other, income_total, availability_status, availability_gaps_detail, has_debts, debts_detail, has_pending_sales, pending_sales_detail, has_unusual_events, unusual_events_detail, improvement_suggestions, content_request, self_improvement_point, self_preservation_point, chatters(name)')
      .gte('date', rangeStart)
      .lte('date', rangeEnd)
      .order('date', { ascending: true });

    if (summaryError) {
      showToast('error', 'שגיאה בייצוא סיכומים');
      return null;
    }

    let shifts = (data ?? []) as unknown as ExportShiftRow[];
    let summaries = (summaryData ?? []) as unknown as ExportDailySummaryRow[];

    if (scope === 'chatter') {
      shifts = shifts.filter((row) => row.chatter_id === selectedChatterId);
      summaries = summaries.filter((row) => row.chatter_id === selectedChatterId);
    }

    if (scope === 'model') {
      shifts = shifts.filter((row) => rowMatchesModel(row, selectedModel));
      summaries = summaries.filter((row) => summaryMatchesModel(row, selectedModel));
    }

    return { shifts, summaries };
  };

  const handleExport = async () => {
    if (!startDate || !endDate) {
      showToast('error', 'יש להזין תאריך בפורמט DD/MM/YYYY');
      return;
    }

    if (invalidRange) {
      showToast('error', 'טווח תאריכים לא תקין');
      return;
    }

    if (scope === 'chatter' && !selectedChatterId) {
      showToast('warning', 'בחר צ׳אטר לייצוא');
      return;
    }

    if (scope === 'model' && !selectedModelId) {
      showToast('warning', 'בחר מודל לייצוא');
      return;
    }

    setLoading(true);
    const rows = await fetchExportRows(startDate, endDate);
    if (!rows) {
      setLoading(false);
      return;
    }

    try {
      if (format === 'csv') {
        const workbookModel = buildExportWorkbookModel({
          ...rows,
          startDate,
          endDate,
        });
        const csvRows = workbookModel.shiftRows.map((row) => [
          row.date,
          row.day,
          row.shiftType,
          row.chatter,
          row.status,
          row.clockedIn,
          row.clockedOut,
          row.models,
          row.platforms,
        ]);
        const blob = toCsv(
          ['תאריך', 'יום', 'סוג משמרת', 'צ׳אטר', 'סטטוס', 'שעת כניסה', 'שעת יציאה', 'מודלים', 'פלטפורמות'],
          csvRows
        );
        triggerDownload(blob, getExportFilename('csv', startDate, endDate));
      } else {
        const useWorker = rows.shifts.length + rows.summaries.length > 500;
        const blob = await createShiftWorkbookBlob(
          {
            ...rows,
            startDate,
            endDate,
          },
          useWorker
        );
        triggerDownload(blob, getExportFilename('xlsx', startDate, endDate));
      }

      showToast('success', 'ייצוא משמרות הושלם');
      setOpen(false);
    } catch {
      showToast('error', 'שגיאה ביצירת הקובץ');
    } finally {
      setLoading(false);
    }
  };

  const triggerButton = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      disabled={loading}
      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
    >
      {loading ? 'מייצא...' : 'ייצוא משמרות'}
    </button>
  );

  return (
    <>
      {variant === 'section' ? (
        <section className="mt-6 rounded-xl border border-gray-800 bg-gray-900 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-white">ייצוא נתונים</h3>
              <p className="text-xs text-gray-400 mt-1">
                קובץ XLSX קריא בעברית, עם CSV כגיבוי
              </p>
            </div>
            {triggerButton}
          </div>
        </section>
      ) : (
        triggerButton
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          dir="rtl"
        >
          <div className="w-full max-w-xl rounded-xl border border-gray-700 bg-gray-900 p-4 space-y-4 text-right">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-lg font-semibold text-white">ייצוא משמרות</h4>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm text-gray-300"
              >
                סגור
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm text-gray-300">
                מתאריך
                <input
                  type="text"
                  inputMode="numeric"
                  value={startDateInput}
                  onChange={(event) => setStartDateInput(event.target.value)}
                  placeholder="DD/MM/YYYY"
                  className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-left text-white"
                  dir="ltr"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-gray-300">
                עד תאריך
                <input
                  type="text"
                  inputMode="numeric"
                  value={endDateInput}
                  onChange={(event) => setEndDateInput(event.target.value)}
                  placeholder="DD/MM/YYYY"
                  className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-left text-white"
                  dir="ltr"
                />
              </label>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-gray-300">פורמט</p>
              <div className="grid grid-cols-2 gap-2">
                {(['xlsx', 'csv'] as const).map((option) => (
                  <label
                    key={option}
                    className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white"
                  >
                    <input
                      type="radio"
                      checked={format === option}
                      onChange={() => setFormat(option)}
                    />
                    <span>{option.toUpperCase()}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-gray-300">היקף</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { value: 'all', label: 'כל המשמרות' },
                  { value: 'chatter', label: 'לפי צ׳אטר' },
                  { value: 'model', label: 'לפי מודל' },
                ].map((option) => (
                  <label
                    key={option.value}
                    className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white"
                  >
                    <input
                      type="radio"
                      checked={scope === option.value}
                      onChange={() => setScope(option.value as ExportScope)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {scope === 'chatter' && (
              <label className="flex flex-col gap-1 text-sm text-gray-300">
                צ׳אטר
                <select
                  value={selectedChatterId}
                  onChange={(event) => setSelectedChatterId(event.target.value)}
                  className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white"
                >
                  <option value="">בחר צ׳אטר</option>
                  {chatters.map((chatter) => (
                    <option key={chatter.id} value={chatter.id}>
                      {chatter.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {scope === 'model' && (
              <label className="flex flex-col gap-1 text-sm text-gray-300">
                מודל
                <select
                  value={selectedModelId}
                  onChange={(event) => setSelectedModelId(event.target.value)}
                  className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white"
                >
                  <option value="">בחר מודל</option>
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {invalidDateInput && (
              <p className="text-xs text-red-400">יש להזין תאריך בפורמט DD/MM/YYYY</p>
            )}
            {!invalidDateInput && invalidRange && (
              <p className="text-xs text-red-400">טווח תאריכים לא תקין</p>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  void handleExport();
                }}
                disabled={loading || invalidRange}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-60"
              >
                {loading ? 'מייצא...' : 'ייצוא'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
