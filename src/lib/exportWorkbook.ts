import * as XLSX from 'xlsx';
import type { Platform, Shift, ShiftAssignment } from './types';
import { getStatusLabel } from './utils';
import { getMergedShiftAssignmentLabels, groupShiftBlocks } from './shiftGrouping';

export type ExportFormat = 'xlsx' | 'csv';
export type ExportScope = 'all' | 'chatter' | 'model';

type ChatterRelation = { name: string } | { name: string }[] | null;

export interface ExportShiftRow {
  id: string;
  chatter_id: string;
  date: string;
  start_time: string;
  end_time: string;
  shift_type?: 'morning' | 'evening' | null;
  status: Shift['status'];
  clocked_in: string | null;
  clocked_out: string | null;
  model: string | null;
  model_id: string | null;
  platform: Platform | null;
  chatters: ChatterRelation;
  shift_assignments?: ShiftAssignment[] | null;
}

export interface ExportDailySummaryRow {
  id: string;
  chatter_id: string;
  shift_id: string | null;
  date: string;
  shift_type: string | null;
  income_telegram: number | null;
  income_onlyfans: number | null;
  income_transfers: number | null;
  income_other: number | null;
  income_total: number | null;
  model_platform_assignments?: Array<{ model_name: string; platforms: string[] }> | null;
  availability_status: string | null;
  availability_gaps_detail: string | null;
  has_debts: boolean | null;
  debts_detail: string | null;
  has_pending_sales: boolean | null;
  pending_sales_detail: string | null;
  has_unusual_events: boolean | null;
  unusual_events_detail: string | null;
  improvement_suggestions: string | null;
  content_request: string | null;
  self_improvement_point: string | null;
  self_preservation_point: string | null;
  chatters: ChatterRelation;
}

export interface ExportWorkbookPayload {
  shifts: ExportShiftRow[];
  summaries: ExportDailySummaryRow[];
  startDate: string;
  endDate: string;
}

interface SummaryMetric {
  label: string;
  value: string | number;
  format?: 'percent';
}

interface ChatterSummaryRow {
  chatter: string;
  shifts: number;
  completed: number;
  missed: number;
  attendanceRate: number | null;
  totalIncome: number;
}

interface ShiftSheetRow {
  date: string;
  day: string;
  shiftType: string;
  chatter: string;
  status: string;
  rawStatus: Shift['status'];
  clockedIn: string;
  clockedOut: string;
  models: string;
  platforms: string;
}

interface SummarySheetRow {
  date: string;
  day: string;
  chatter: string;
  shiftType: string;
  telegram: number;
  onlyfans: number;
  transfers: number;
  other: number;
  total: number;
  availability: string;
  availabilityGaps: string;
  debts: string;
  pendingSales: string;
  unusualEvents: string;
  improvementSuggestions: string;
  contentRequest: string;
  selfImprovementPoint: string;
  selfPreservationPoint: string;
}

export interface ExportWorkbookModel {
  summary: {
    metrics: SummaryMetric[];
    chatterRows: ChatterSummaryRow[];
  };
  shiftRows: ShiftSheetRow[];
  summaryRows: SummarySheetRow[];
}

type SheetCell = XLSX.CellObject & {
  s?: Record<string, unknown>;
};

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'] as const;
const MONEY_FORMAT = '$#,##0.00';
const PERCENT_FORMAT = '0.00%';

const STATUS_FILLS: Record<Shift['status'], string> = {
  completed: 'C6EFCE',
  missed: 'FFC7CE',
  pending: 'FFEB9C',
  scheduled: 'E7E6E6',
  active: 'BDD7EE',
  rejected: 'F4CCCC',
  cancelled: 'D9D9D9',
};

const RTL_ALIGNMENT = {
  horizontal: 'right',
  vertical: 'center',
  readingOrder: 2,
};

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function parseDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function getChatterName(chatters: ChatterRelation) {
  if (!chatters) return '';
  if (Array.isArray(chatters)) return chatters[0]?.name ?? '';
  return chatters.name ?? '';
}

function asNumber(value: number | null | undefined) {
  return Number(value ?? 0);
}

function yesNo(value: boolean | null | undefined, detail: string | null | undefined) {
  if (value === true) return detail?.trim() ? `כן - ${detail}` : 'כן';
  if (value === false) return 'לא';
  return '';
}

function formatTimestampTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 5);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function getShiftTypeLabel(shift: Pick<ExportShiftRow, 'shift_type' | 'start_time'>) {
  if (shift.shift_type === 'morning') return 'בוקר';
  if (shift.shift_type === 'evening') return 'ערב';
  return shift.start_time.startsWith('19:00') ? 'ערב' : 'בוקר';
}

function getPlatformsText(assignments: string[]) {
  const platforms = new Set<string>();
  for (const label of assignments) {
    const parts = label.split(' · ');
    if (parts[1]) platforms.add(parts[1]);
  }
  return Array.from(platforms).join(', ');
}

export function formatDisplayDate(date: string) {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

export function getDayName(date: string) {
  return DAY_NAMES[parseDate(date).getUTCDay()];
}

export function getCurrentWeekDateRange(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return {
    startDate: toDateKey(start),
    endDate: toDateKey(end),
  };
}

export function getExportFilename(format: ExportFormat, startDate: string, endDate: string) {
  return `shiftpro_${startDate}_to_${endDate}.${format}`;
}

export function buildExportWorkbookModel({
  shifts,
  summaries,
}: ExportWorkbookPayload): ExportWorkbookModel {
  const totalShifts = shifts.length;
  const completed = shifts.filter((shift) => shift.status === 'completed').length;
  const missed = shifts.filter((shift) => shift.status === 'missed').length;
  const pending = shifts.filter((shift) => shift.status === 'pending').length;
  const attendedTotal = completed + missed;
  const attendanceRate = attendedTotal > 0 ? completed / attendedTotal : 0;

  const incomeByChatter = new Map<string, number>();
  for (const summary of summaries) {
    incomeByChatter.set(
      summary.chatter_id,
      (incomeByChatter.get(summary.chatter_id) ?? 0) + asNumber(summary.income_total)
    );
  }

  const chatterMap = new Map<string, ChatterSummaryRow>();
  for (const shift of shifts) {
    const row = chatterMap.get(shift.chatter_id) ?? {
      chatter: getChatterName(shift.chatters),
      shifts: 0,
      completed: 0,
      missed: 0,
      attendanceRate: null,
      totalIncome: 0,
    };
    row.shifts += 1;
    if (shift.status === 'completed') row.completed += 1;
    if (shift.status === 'missed') row.missed += 1;
    row.totalIncome = incomeByChatter.get(shift.chatter_id) ?? 0;
    const tracked = row.completed + row.missed;
    row.attendanceRate = tracked > 0 ? row.completed / tracked : null;
    chatterMap.set(shift.chatter_id, row);
  }

  const shiftRows = shifts.map((shift) => {
    const [block] = groupShiftBlocks([shift]);
    const assignmentLabels = getMergedShiftAssignmentLabels(block);
    return {
      date: formatDisplayDate(shift.date),
      day: getDayName(shift.date),
      shiftType: getShiftTypeLabel(shift),
      chatter: getChatterName(shift.chatters),
      status: getStatusLabel(shift.status),
      rawStatus: shift.status,
      clockedIn: formatTimestampTime(shift.clocked_in),
      clockedOut: formatTimestampTime(shift.clocked_out),
      models: assignmentLabels.join(', '),
      platforms: getPlatformsText(assignmentLabels),
    };
  });

  const summaryRows = summaries.map((summary) => ({
    date: formatDisplayDate(summary.date),
    day: getDayName(summary.date),
    chatter: getChatterName(summary.chatters),
    shiftType: summary.shift_type ?? '',
    telegram: asNumber(summary.income_telegram),
    onlyfans: asNumber(summary.income_onlyfans),
    transfers: asNumber(summary.income_transfers),
    other: asNumber(summary.income_other),
    total: asNumber(summary.income_total),
    availability: summary.availability_status ?? '',
    availabilityGaps: summary.availability_gaps_detail ?? '',
    debts: yesNo(summary.has_debts, summary.debts_detail),
    pendingSales: yesNo(summary.has_pending_sales, summary.pending_sales_detail),
    unusualEvents: yesNo(summary.has_unusual_events, summary.unusual_events_detail),
    improvementSuggestions: summary.improvement_suggestions ?? '',
    contentRequest: summary.content_request ?? '',
    selfImprovementPoint: summary.self_improvement_point ?? '',
    selfPreservationPoint: summary.self_preservation_point ?? '',
  }));

  return {
    summary: {
      metrics: [
        { label: 'סך משמרות', value: totalShifts },
        { label: 'הושלמו', value: completed },
        { label: 'לא הגיע', value: missed },
        { label: 'ממתינות', value: pending },
        { label: 'נוכחות', value: attendanceRate, format: 'percent' },
      ],
      chatterRows: Array.from(chatterMap.values()).sort((a, b) =>
        a.chatter.localeCompare(b.chatter, 'he')
      ),
    },
    shiftRows,
    summaryRows,
  };
}

function toRows(headers: string[], rows: Array<Array<string | number | null>>) {
  return [headers, ...rows];
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getColumnWidths(rows: Array<Array<string | number | null>>) {
  const count = Math.max(...rows.map((row) => row.length));
  return Array.from({ length: count }, (_, index) => {
    const maxLength = rows.reduce((max, row) => {
      const value = row[index];
      return Math.max(max, value == null ? 0 : String(value).length);
    }, 0);
    return { wch: clamp(maxLength + 3, 8, 40) };
  });
}

function styleCell(ws: XLSX.WorkSheet, row: number, column: number, style: Record<string, unknown>) {
  const address = XLSX.utils.encode_cell({ r: row, c: column });
  const cell = ws[address] as SheetCell | undefined;
  if (!cell) return;
  cell.s = { ...(cell.s ?? {}), ...style };
}

function applyBaseSheetFormatting(
  ws: XLSX.WorkSheet,
  rows: Array<Array<string | number | null>>,
  headerRows: number[] = [0]
) {
  ws['!views'] = [{ RTL: true }];
  ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
  ws['!cols'] = getColumnWidths(rows);

  for (const address of Object.keys(ws)) {
    if (address.startsWith('!')) continue;
    const cell = ws[address] as SheetCell;
    cell.s = {
      ...(cell.s ?? {}),
      alignment: RTL_ALIGNMENT,
    };
  }

  for (const row of headerRows) {
    for (let column = 0; column < (rows[row]?.length ?? 0); column += 1) {
      styleCell(ws, row, column, {
        font: { bold: true },
        alignment: RTL_ALIGNMENT,
        fill: { fgColor: { rgb: 'E7E6E6' } },
      });
    }
  }
}

function buildSummarySheet(model: ExportWorkbookModel) {
  const metricRows = model.summary.metrics.map((metric) => [metric.label, metric.value]);
  const chatterHeader = ['צ׳אטר', 'משמרות', 'הושלמו', 'לא הגיע', 'נוכחות', 'סך הכנסות'];
  const chatterRows = model.summary.chatterRows.map((row) => [
    row.chatter,
    row.shifts,
    row.completed,
    row.missed,
    row.attendanceRate,
    row.totalIncome,
  ]);
  const rows = toRows(['מדד', 'ערך'], metricRows);
  rows.push([]);
  const chatterHeaderRow = rows.length;
  rows.push(chatterHeader);
  rows.push(...chatterRows);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  applyBaseSheetFormatting(ws, rows, [0, chatterHeaderRow]);

  model.summary.metrics.forEach((metric, index) => {
    const row = index + 1;
    if (metric.format === 'percent') {
      const cell = ws[XLSX.utils.encode_cell({ r: row, c: 1 })] as SheetCell | undefined;
      if (cell) cell.z = PERCENT_FORMAT;
    }
  });

  for (let row = chatterHeaderRow + 1; row < rows.length; row += 1) {
    const attendanceCell = ws[XLSX.utils.encode_cell({ r: row, c: 4 })] as SheetCell | undefined;
    if (attendanceCell) attendanceCell.z = PERCENT_FORMAT;
    const incomeCell = ws[XLSX.utils.encode_cell({ r: row, c: 5 })] as SheetCell | undefined;
    if (incomeCell) incomeCell.z = MONEY_FORMAT;
  }

  return ws;
}

function buildShiftsSheet(model: ExportWorkbookModel) {
  const headers = [
    'תאריך',
    'יום',
    'סוג משמרת',
    'צ׳אטר',
    'סטטוס',
    'שעת כניסה',
    'שעת יציאה',
    'מודלים',
    'פלטפורמות',
  ];
  const rows = toRows(
    headers,
    model.shiftRows.map((row) => [
      row.date,
      row.day,
      row.shiftType,
      row.chatter,
      row.status,
      row.clockedIn,
      row.clockedOut,
      row.models,
      row.platforms,
    ])
  );
  const ws = XLSX.utils.aoa_to_sheet(rows);
  applyBaseSheetFormatting(ws, rows);

  model.shiftRows.forEach((row, index) => {
    styleCell(ws, index + 1, 4, {
      fill: { fgColor: { rgb: STATUS_FILLS[row.rawStatus] } },
      alignment: RTL_ALIGNMENT,
    });
  });

  return ws;
}

function buildDailySummariesSheet(model: ExportWorkbookModel) {
  const headers = [
    'תאריך',
    'יום',
    'צ׳אטר',
    'סוג משמרת',
    'הכנסה טלגרם',
    'הכנסה OF',
    'העברות',
    'אחר',
    'סך הכל',
    'זמינות',
    'פערי זמינות',
    'חובות',
    'מכירות פתוחות',
    'אירועים חריגים',
    'הצעות לשיפור',
    'בקשת תוכן',
    'נקודת שיפור',
    'נקודת שימור',
  ];
  const rows = toRows(
    headers,
    model.summaryRows.map((row) => [
      row.date,
      row.day,
      row.chatter,
      row.shiftType,
      row.telegram,
      row.onlyfans,
      row.transfers,
      row.other,
      row.total,
      row.availability,
      row.availabilityGaps,
      row.debts,
      row.pendingSales,
      row.unusualEvents,
      row.improvementSuggestions,
      row.contentRequest,
      row.selfImprovementPoint,
      row.selfPreservationPoint,
    ])
  );
  const ws = XLSX.utils.aoa_to_sheet(rows);
  applyBaseSheetFormatting(ws, rows);

  for (let row = 1; row < rows.length; row += 1) {
    for (let column = 4; column <= 8; column += 1) {
      const cell = ws[XLSX.utils.encode_cell({ r: row, c: column })] as SheetCell | undefined;
      if (cell) cell.z = MONEY_FORMAT;
    }
  }

  return ws;
}

export function createShiftWorkbookBuffer(payload: ExportWorkbookPayload) {
  const model = buildExportWorkbookModel(payload);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, buildSummarySheet(model), 'סיכום');
  XLSX.utils.book_append_sheet(workbook, buildShiftsSheet(model), 'משמרות');
  XLSX.utils.book_append_sheet(workbook, buildDailySummariesSheet(model), 'סיכומי יום');
  return XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
    cellStyles: true,
  }) as ArrayBuffer;
}

function createBlob(buffer: ArrayBuffer) {
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export async function createShiftWorkbookBlob(payload: ExportWorkbookPayload, useWorker: boolean) {
  if (useWorker && typeof Worker !== 'undefined') {
    const worker = new Worker(new URL('./exportWorkbook.worker.ts', import.meta.url), {
      type: 'module',
    });

    return new Promise<Blob>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<{ buffer?: ArrayBuffer; error?: string }>) => {
        worker.terminate();
        if (event.data.error) {
          reject(new Error(event.data.error));
          return;
        }
        resolve(createBlob(event.data.buffer ?? new ArrayBuffer(0)));
      };
      worker.onerror = (event) => {
        worker.terminate();
        reject(new Error(event.message));
      };
      worker.postMessage(payload);
    });
  }

  return createBlob(createShiftWorkbookBuffer(payload));
}
