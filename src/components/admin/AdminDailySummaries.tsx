import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { cn, getPlatformLabel } from '../../lib/utils';
import { formatDisplayDate, getDayName } from '../../lib/exportWorkbook';

type ChatterRelation = { name: string } | { name: string }[] | null;

interface AdminDailySummaryRow {
  id: string;
  chatter_id: string;
  shift_id: string | null;
  date: string;
  day_of_week: string | null;
  shift_type: string | null;
  model_platform_assignments: Array<{ model_name: string; platforms: string[] }> | null;
  availability_status: string | null;
  availability_gaps_detail: string | null;
  has_debts: boolean | null;
  debts_detail: string | null;
  has_pending_sales: boolean | null;
  pending_sales_detail: string | null;
  has_unusual_events: boolean | null;
  unusual_events_detail: string | null;
  income_telegram: number | null;
  income_onlyfans: number | null;
  income_transfers: number | null;
  income_other: number | null;
  income_total: number | null;
  all_deposits_verified: boolean | null;
  improvement_suggestions: string | null;
  content_request: string | null;
  self_improvement_point: string | null;
  self_preservation_point: string | null;
  created_at: string | null;
  chatters: ChatterRelation;
}

interface AdminDailySummariesProps {
  showToast: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void;
  previewMode?: boolean;
}

interface SummaryGroup {
  chatterId: string;
  chatterName: string;
  rows: AdminDailySummaryRow[];
  totalIncome: number;
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
});

const previewRows: AdminDailySummaryRow[] = [
  {
    id: 'preview-summary-noa',
    chatter_id: 'chatter-noa',
    shift_id: 'preview-shift-merged',
    date: new Date().toISOString().slice(0, 10),
    day_of_week: null,
    shift_type: 'בוקר',
    model_platform_assignments: [
      { model_name: 'Lina', platforms: ['telegram', 'onlyfans'] },
      { model_name: 'Maya', platforms: ['telegram'] },
    ],
    availability_status: 'full',
    availability_gaps_detail: null,
    has_debts: false,
    debts_detail: null,
    has_pending_sales: true,
    pending_sales_detail: 'מכירה אחת ממתינה לאישור',
    has_unusual_events: false,
    unusual_events_detail: null,
    income_telegram: 240,
    income_onlyfans: 420,
    income_transfers: 60,
    income_other: 0,
    income_total: 720,
    all_deposits_verified: true,
    improvement_suggestions: 'לרכז תסריטי פתיחה לפי מודל.',
    content_request: 'סט תמונות נוסף ל-Lina.',
    self_improvement_point: 'תגובה מהירה יותר בתחילת המשמרת.',
    self_preservation_point: 'שימור טון אישי מול לקוחות חוזרים.',
    created_at: new Date().toISOString(),
    chatters: { name: 'נועה כהן' },
  },
];

function getChatterName(chatters: ChatterRelation) {
  if (!chatters) return 'ללא שם';
  if (Array.isArray(chatters)) return chatters[0]?.name ?? 'ללא שם';
  return chatters.name ?? 'ללא שם';
}

function formatCurrency(value: number | null | undefined) {
  return currencyFormatter.format(Number(value ?? 0));
}

function formatBoolean(value: boolean | null | undefined, detail?: string | null) {
  if (value === true) return detail?.trim() ? `כן - ${detail}` : 'כן';
  if (value === false) return 'לא';
  return 'לא צוין';
}

function getAvailabilityLabel(value: string | null) {
  if (value === 'full') return 'זמינות מלאה';
  if (value === 'partial') return 'זמינות חלקית';
  if (value === 'unavailable') return 'לא זמין';
  return 'לא צוין';
}

function getAssignmentsText(assignments: AdminDailySummaryRow['model_platform_assignments']) {
  if (!assignments || assignments.length === 0) return 'ללא הקצאה';

  return assignments
    .map((assignment) => {
      const platforms = assignment.platforms
        .map((platform) =>
          platform === 'telegram' || platform === 'onlyfans' ? getPlatformLabel(platform) : platform
        )
        .join(', ');
      return `${assignment.model_name} · ${platforms}`;
    })
    .join(' | ');
}

function buildGroups(rows: AdminDailySummaryRow[]): SummaryGroup[] {
  const groups = new Map<string, SummaryGroup>();

  for (const row of rows) {
    const chatterName = getChatterName(row.chatters);
    const existing = groups.get(row.chatter_id) ?? {
      chatterId: row.chatter_id,
      chatterName,
      rows: [],
      totalIncome: 0,
    };

    existing.rows.push(row);
    existing.totalIncome += Number(row.income_total ?? 0);
    groups.set(row.chatter_id, existing);
  }

  return Array.from(groups.values()).sort((a, b) =>
    a.chatterName.localeCompare(b.chatterName, 'he')
  );
}

export function AdminDailySummaries({
  showToast,
  previewMode = false,
}: AdminDailySummariesProps) {
  const [rows, setRows] = useState<AdminDailySummaryRow[]>(previewMode ? previewRows : []);
  const [loading, setLoading] = useState(!previewMode);

  const fetchSummaries = useCallback(async () => {
    if (previewMode) {
      setRows(previewRows);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('daily_summaries')
      .select(
        'id, chatter_id, shift_id, date, day_of_week, shift_type, model_platform_assignments, availability_status, availability_gaps_detail, has_debts, debts_detail, has_pending_sales, pending_sales_detail, has_unusual_events, unusual_events_detail, income_telegram, income_onlyfans, income_transfers, income_other, income_total, all_deposits_verified, improvement_suggestions, content_request, self_improvement_point, self_preservation_point, created_at, chatters(name)'
      )
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      showToast('error', 'שגיאה בטעינת סיכומי היום');
      setLoading(false);
      return;
    }

    setRows((data ?? []) as unknown as AdminDailySummaryRow[]);
    setLoading(false);
  }, [previewMode, showToast]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) void fetchSummaries();
    });
    return () => {
      active = false;
    };
  }, [fetchSummaries]);

  const groups = useMemo(() => buildGroups(rows), [rows]);
  const totalIncome = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.income_total ?? 0), 0),
    [rows]
  );

  return (
    <div className="p-4 sm:p-6" dir="rtl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">סיכומי יום</h2>
          <p className="mt-1 text-sm text-gray-400">
            כל הסיכומים מקובצים לפי שם מלא של הצ׳אטר
          </p>
        </div>
        <button
          type="button"
          onClick={() => void fetchSummaries()}
          disabled={loading}
          className="inline-flex min-h-[38px] items-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-gray-100 hover:bg-gray-700 disabled:opacity-60"
        >
          <RefreshCw size={16} className={cn(loading && 'animate-spin')} />
          רענן
        </button>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-400">סיכומים</p>
          <p className="mt-1 text-2xl font-bold text-white">{rows.length}</p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-400">צ׳אטרים</p>
          <p className="mt-1 text-2xl font-bold text-white">{groups.length}</p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-400">סך הכנסה</p>
          <p className="mt-1 text-2xl font-bold text-white" dir="ltr">
            {formatCurrency(totalIncome)}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center text-gray-300">
          טוען סיכומים...
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center text-gray-300">
          אין סיכומי יום להצגה
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <section
              key={group.chatterId}
              className="rounded-lg border border-gray-800 bg-gray-900 p-4"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold leading-6 text-white">{group.chatterName}</h3>
                  <p className="mt-1 text-xs text-gray-400">
                    {group.rows.length} סיכומים · {formatCurrency(group.totalIncome)}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {group.rows.map((row) => (
                  <details
                    key={row.id}
                    className="rounded-lg border border-gray-800 bg-gray-950/40 p-3 text-sm"
                  >
                    <summary className="cursor-pointer list-none">
                      <div className="grid gap-3 md:grid-cols-[120px_80px_1fr_120px] md:items-center">
                        <div>
                          <p className="font-bold text-white">{formatDisplayDate(row.date)}</p>
                          <p className="text-xs text-gray-400">
                            {row.day_of_week || getDayName(row.date)}
                          </p>
                        </div>
                        <span className="rounded-full bg-gray-800 px-2 py-1 text-center text-xs text-gray-200">
                          {row.shift_type || 'לא צוין'}
                        </span>
                        <p className="min-w-0 text-gray-200">{getAssignmentsText(row.model_platform_assignments)}</p>
                        <p className="text-left font-mono font-bold text-white" dir="ltr">
                          {formatCurrency(row.income_total)}
                        </p>
                      </div>
                    </summary>

                    <div className="mt-3 grid gap-3 border-t border-gray-800 pt-3 lg:grid-cols-2">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <span className="text-gray-400">טלגרם</span>
                        <span className="text-left font-mono text-gray-100" dir="ltr">
                          {formatCurrency(row.income_telegram)}
                        </span>
                        <span className="text-gray-400">אונליפאנס</span>
                        <span className="text-left font-mono text-gray-100" dir="ltr">
                          {formatCurrency(row.income_onlyfans)}
                        </span>
                        <span className="text-gray-400">העברות</span>
                        <span className="text-left font-mono text-gray-100" dir="ltr">
                          {formatCurrency(row.income_transfers)}
                        </span>
                        <span className="text-gray-400">אחר</span>
                        <span className="text-left font-mono text-gray-100" dir="ltr">
                          {formatCurrency(row.income_other)}
                        </span>
                      </div>

                      <div className="space-y-1 text-xs text-gray-200">
                        <p>
                          <span className="text-gray-400">זמינות: </span>
                          {getAvailabilityLabel(row.availability_status)}
                          {row.availability_gaps_detail ? ` · ${row.availability_gaps_detail}` : ''}
                        </p>
                        <p>
                          <span className="text-gray-400">חובות: </span>
                          {formatBoolean(row.has_debts, row.debts_detail)}
                        </p>
                        <p>
                          <span className="text-gray-400">מכירות פתוחות: </span>
                          {formatBoolean(row.has_pending_sales, row.pending_sales_detail)}
                        </p>
                        <p>
                          <span className="text-gray-400">אירועים חריגים: </span>
                          {formatBoolean(row.has_unusual_events, row.unusual_events_detail)}
                        </p>
                        <p>
                          <span className="text-gray-400">הפקדות אומתו: </span>
                          {formatBoolean(row.all_deposits_verified)}
                        </p>
                      </div>

                      <div className="space-y-2 text-xs text-gray-200 lg:col-span-2">
                        <p>
                          <span className="text-gray-400">הצעות לשיפור: </span>
                          {row.improvement_suggestions || 'לא צוין'}
                        </p>
                        <p>
                          <span className="text-gray-400">בקשת תוכן: </span>
                          {row.content_request || 'לא צוין'}
                        </p>
                        <p>
                          <span className="text-gray-400">נקודת שיפור: </span>
                          {row.self_improvement_point || 'לא צוין'}
                        </p>
                        <p>
                          <span className="text-gray-400">נקודת שימור: </span>
                          {row.self_preservation_point || 'לא צוין'}
                        </p>
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
