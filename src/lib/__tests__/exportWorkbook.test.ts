import { describe, expect, it } from 'vitest';
import type { ExportDailySummaryRow, ExportShiftRow } from '../exportWorkbook';
import {
  buildExportWorkbookModel,
  createShiftWorkbookBuffer,
  formatDisplayDate,
  getCurrentWeekDateRange,
  getExportFilename,
} from '../exportWorkbook';

const shifts: ExportShiftRow[] = [
  {
    id: 'shift-1',
    chatter_id: 'chatter-1',
    date: '2026-04-26',
    start_time: '12:00',
    end_time: '19:00',
    shift_type: 'morning',
    status: 'completed',
    clocked_in: '2026-04-26T12:01:00Z',
    clocked_out: '2026-04-26T19:03:00Z',
    model: 'Lina',
    model_id: 'model-1',
    platform: 'telegram',
    chatters: { name: 'נועה' },
    shift_assignments: [
      {
        id: 'assignment-1',
        shift_id: 'shift-1',
        model_id: 'model-1',
        model: 'Lina',
        platform: 'telegram',
        shift_date: '2026-04-26',
        shift_start_time: '12:00',
        assigned_at: '2026-04-25T10:00:00Z',
      },
      {
        id: 'assignment-2',
        shift_id: 'shift-1',
        model_id: 'model-2',
        model: 'Maya',
        platform: 'onlyfans',
        shift_date: '2026-04-26',
        shift_start_time: '12:00',
        assigned_at: '2026-04-25T10:00:00Z',
      },
    ],
  },
  {
    id: 'shift-2',
    chatter_id: 'chatter-1',
    date: '2026-04-27',
    start_time: '19:00',
    end_time: '02:00',
    shift_type: 'evening',
    status: 'missed',
    clocked_in: null,
    clocked_out: null,
    model: null,
    model_id: null,
    platform: null,
    chatters: { name: 'נועה' },
    shift_assignments: [],
  },
];

const summaries: ExportDailySummaryRow[] = [
  {
    id: 'summary-1',
    chatter_id: 'chatter-1',
    shift_id: 'shift-1',
    date: '2026-04-26',
    shift_type: 'בוקר',
    income_telegram: 100,
    income_onlyfans: 200,
    income_transfers: 50,
    income_other: 25,
    income_total: 375,
    availability_status: 'full',
    availability_gaps_detail: null,
    has_debts: false,
    debts_detail: null,
    has_pending_sales: true,
    pending_sales_detail: 'עסקה פתוחה',
    has_unusual_events: false,
    unusual_events_detail: null,
    improvement_suggestions: 'לשפר פתיחים',
    content_request: 'סט חדש',
    self_improvement_point: 'מהירות תגובה',
    self_preservation_point: 'שימור יחס אישי',
    chatters: { name: 'נועה' },
  },
];

describe('exportWorkbook', () => {
  it('formats dates as DD/MM/YYYY and returns Sunday-Saturday week range', () => {
    expect(formatDisplayDate('2026-04-26')).toBe('26/04/2026');
    expect(getCurrentWeekDateRange(new Date('2026-04-28T12:00:00'))).toEqual({
      startDate: '2026-04-26',
      endDate: '2026-05-02',
    });
  });

  it('uses the required ShiftPro XLSX filename', () => {
    expect(getExportFilename('xlsx', '2026-04-26', '2026-05-02')).toBe(
      'shiftpro_2026-04-26_to_2026-05-02.xlsx'
    );
  });

  it('builds readable RTL sheet models with numeric currency and percent values', () => {
    const model = buildExportWorkbookModel({
      shifts,
      summaries,
      startDate: '2026-04-26',
      endDate: '2026-05-02',
    });

    expect(model.summary.metrics[0]).toEqual({ label: 'סך משמרות', value: 2 });
    expect(model.summary.metrics.find((row) => row.label === 'נוכחות')?.value).toBe(0.5);
    expect(model.summary.chatterRows[0].totalIncome).toBe(375);
    expect(model.shiftRows[0].date).toBe('26/04/2026');
    expect(model.shiftRows[0].day).toBe('ראשון');
    expect(model.shiftRows[0].models).toBe('Lina · טלגרם\nMaya · אונליפאנס');
    expect(model.shiftRows[1].models).toBe('ללא הקצאה');
    expect(model.summaryRows[0].total).toBe(375);
  });

  it('exports one row per chatter window with grouped model platforms', () => {
    const duplicateWindowShifts: ExportShiftRow[] = [
      {
        id: 'shift-tamar-telegram',
        chatter_id: 'chatter-ziv',
        date: '2026-04-26',
        start_time: '12:00',
        end_time: '19:00',
        shift_type: 'morning',
        status: 'scheduled',
        clocked_in: null,
        clocked_out: null,
        model: 'תמר',
        model_id: 'model-tamar',
        platform: 'telegram',
        chatters: { name: 'זיו' },
        shift_assignments: [],
      },
      {
        id: 'shift-tamar-onlyfans',
        chatter_id: 'chatter-ziv',
        date: '2026-04-26',
        start_time: '12:00',
        end_time: '19:00',
        shift_type: 'morning',
        status: 'scheduled',
        clocked_in: null,
        clocked_out: null,
        model: 'תמר',
        model_id: 'model-tamar',
        platform: 'onlyfans',
        chatters: { name: 'זיו' },
        shift_assignments: [],
      },
      {
        id: 'shift-dana-telegram',
        chatter_id: 'chatter-ziv',
        date: '2026-04-26',
        start_time: '12:00',
        end_time: '19:00',
        shift_type: 'morning',
        status: 'scheduled',
        clocked_in: null,
        clocked_out: null,
        model: 'דנה',
        model_id: 'model-dana',
        platform: 'telegram',
        chatters: { name: 'זיו' },
        shift_assignments: [],
      },
    ];

    const model = buildExportWorkbookModel({
      shifts: duplicateWindowShifts,
      summaries: [],
      startDate: '2026-04-26',
      endDate: '2026-05-02',
    });

    expect(model.summary.metrics[0]).toEqual({ label: 'סך משמרות', value: 1 });
    expect(model.summary.chatterRows[0].shifts).toBe(1);
    expect(model.shiftRows).toHaveLength(1);
    expect(model.shiftRows[0].chatter).toBe('זיו');
    expect(model.shiftRows[0].models).toBe('תמר · טלגרם, אונליפאנס\nדנה · טלגרם');
    expect(model.shiftRows[0].platforms).toBe('טלגרם, אונליפאנס');
  });

  it('derives shift type from start time when the database row has no shift_type column', () => {
    const rowWithoutShiftType = { ...shifts[0] };
    delete rowWithoutShiftType.shift_type;
    const model = buildExportWorkbookModel({
      shifts: [rowWithoutShiftType],
      summaries: [],
      startDate: '2026-04-26',
      endDate: '2026-05-02',
    });

    expect(model.shiftRows[0].shiftType).toBe('בוקר');
  });

  it('creates an XLSX buffer without throwing', () => {
    const buffer = createShiftWorkbookBuffer({
      shifts,
      summaries,
      startDate: '2026-04-26',
      endDate: '2026-05-02',
    });

    expect(buffer.byteLength).toBeGreaterThan(0);
  });
});
