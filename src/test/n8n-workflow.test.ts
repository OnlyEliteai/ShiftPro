/**
 * ShiftPro n8n Reminder Workflow — End-to-End Test Suite
 *
 * Tests the complete flow:
 *   Cron → Fetch Upcoming Shifts → Has Reminders? → Build Messages → HTTP Request (WhatsAble)
 *
 * NO actual WhatsApp messages are sent. Tests validate data flow and node outputs only.
 * DO NOT touch error handler workflow or WhatsAble API credentials.
 */
import { describe, it, expect } from 'vitest';
import {
  type Chatter,
  type Shift,
  type ReminderLogEntry,
  getUpcomingShifts,
  hasReminders,
  buildWhatsAppMessages,
  buildWhatsAbleRequest,
  detectMissedShifts,
  buildMissedShiftAdminAlert,
  deduplicateReminders,
  toIsraelDate,
} from './workflow-logic';

// ── Shared Mock Chatters ───────────────────────────────────────────────────────

const CHATTERS: Chatter[] = [
  { id: 'c1', name: 'דנה',  phone: '+972501111111', token: 'dana-token',   active: true },
  { id: 'c2', name: 'יוסי', phone: '+972502222222', token: 'yossi-token',  active: true },
  { id: 'c3', name: 'מיכל', phone: '+972503333333', token: 'michal-token', active: true },
  { id: 'c4', name: 'אלון', phone: '+972504444444', token: 'alon-token',   active: true },
];

// ── Helper: create a shift with defaults ──────────────────────────────────────

function makeShift(overrides: Partial<Shift> & { id: string; chatter_id: string }): Shift {
  return {
    date: '2026-04-02',
    start_time: '12:00',
    end_time: '19:00',
    model: 'Bella',
    status: 'scheduled',
    clocked_in: null,
    clocked_out: null,
    ...overrides,
  };
}

// ════════════════════════════════════════════════════════════════════════════════
// SCENARIO 1: Day shift reminder (12:00–19:00)
//   3 chatters scheduled for 12:00, simulated time = 11:00 (60 min before)
//   Expected: 3 WhatsApp messages, one per chatter
// ════════════════════════════════════════════════════════════════════════════════

describe('SCENARIO 1: Day shift 60min reminder — 3 chatters at 12:00', () => {
  const shifts: Shift[] = [
    makeShift({ id: 's1', chatter_id: 'c1', date: '2026-04-02', start_time: '12:00', end_time: '19:00', model: 'Bella' }),
    makeShift({ id: 's2', chatter_id: 'c2', date: '2026-04-02', start_time: '12:00', end_time: '19:00', model: 'Sophie' }),
    makeShift({ id: 's3', chatter_id: 'c3', date: '2026-04-02', start_time: '12:00', end_time: '19:00', model: 'Mia' }),
  ];

  // 11:00 Israel = 60 min before 12:00 Israel
  const nowUtc = toIsraelDate('2026-04-02', '11:00');

  it('upcoming-shifts returns 3 items with reminder_type=60min', () => {
    const upcoming = getUpcomingShifts(shifts, CHATTERS, [], nowUtc);
    expect(upcoming).toHaveLength(3);
    expect(upcoming.every(u => u.reminder_type === '60min')).toBe(true);
  });

  it('Has Reminders? = true', () => {
    const upcoming = getUpcomingShifts(shifts, CHATTERS, [], nowUtc);
    expect(hasReminders(upcoming)).toBe(true);
  });

  it('builds 3 WhatsApp messages with correct Hebrew format', () => {
    const upcoming = getUpcomingShifts(shifts, CHATTERS, [], nowUtc);
    const messages = buildWhatsAppMessages(upcoming);

    expect(messages).toHaveLength(3);

    // Verify message for דנה
    const danaMsg = messages.find(m => m.to === '+972501111111')!;
    expect(danaMsg).toBeDefined();
    expect(danaMsg.text).toBe('היי דנה! תזכורת: יש לך משמרת בעוד שעה (12:00). מודל: Bella');

    // Verify message for יוסי
    const yossiMsg = messages.find(m => m.to === '+972502222222')!;
    expect(yossiMsg).toBeDefined();
    expect(yossiMsg.text).toBe('היי יוסי! תזכורת: יש לך משמרת בעוד שעה (12:00). מודל: Sophie');

    // Verify message for מיכל
    const michalMsg = messages.find(m => m.to === '+972503333333')!;
    expect(michalMsg).toBeDefined();
    expect(michalMsg.text).toBe('היי מיכל! תזכורת: יש לך משמרת בעוד שעה (12:00). מודל: Mia');
  });

  it('builds correct WhatsAble API request bodies', () => {
    const upcoming = getUpcomingShifts(shifts, CHATTERS, [], nowUtc);
    const messages = buildWhatsAppMessages(upcoming);

    for (const msg of messages) {
      const req = buildWhatsAbleRequest(msg);
      expect(req.url).toBe('https://dashboard.whatsable.app/api/whatsapp/messages/v2.0.0/send');
      expect(req.method).toBe('POST');
      expect(req.headers['Content-Type']).toBe('application/json');
      expect(req.headers['Authorization']).toBe('<API_KEY>');

      const body = JSON.parse(req.body);
      expect(body.to).toMatch(/^\+972/);
      expect(body.text).toContain('תזכורת');
    }
  });

  it('PASS/FAIL: exactly 3 HTTP requests, each to a different phone', () => {
    const upcoming = getUpcomingShifts(shifts, CHATTERS, [], nowUtc);
    const messages = buildWhatsAppMessages(upcoming);
    const phones = messages.map(m => m.to);

    expect(phones).toHaveLength(3);
    expect(new Set(phones).size).toBe(3); // all unique
    expect(phones).toContain('+972501111111');
    expect(phones).toContain('+972502222222');
    expect(phones).toContain('+972503333333');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// SCENARIO 2: Night shift 15min reminder (19:00–02:00)
//   4 chatters scheduled for 19:00, simulated time = 18:45 (15 min before)
//   Expected: 4 WhatsApp messages
// ════════════════════════════════════════════════════════════════════════════════

describe('SCENARIO 2: Night shift 15min reminder — 4 chatters at 19:00', () => {
  const shifts: Shift[] = [
    makeShift({ id: 's1', chatter_id: 'c1', date: '2026-04-02', start_time: '19:00', end_time: '02:00', model: 'Bella' }),
    makeShift({ id: 's2', chatter_id: 'c2', date: '2026-04-02', start_time: '19:00', end_time: '02:00', model: 'Sophie' }),
    makeShift({ id: 's3', chatter_id: 'c3', date: '2026-04-02', start_time: '19:00', end_time: '02:00', model: 'Mia' }),
    makeShift({ id: 's4', chatter_id: 'c4', date: '2026-04-02', start_time: '19:00', end_time: '02:00', model: 'Luna' }),
  ];

  // 18:45 Israel = 15 min before 19:00
  const nowUtc = toIsraelDate('2026-04-02', '18:45');

  it('upcoming-shifts returns 4 items with reminder_type=15min', () => {
    const upcoming = getUpcomingShifts(shifts, CHATTERS, [], nowUtc);
    expect(upcoming).toHaveLength(4);
    expect(upcoming.every(u => u.reminder_type === '15min')).toBe(true);
  });

  it('builds 4 messages with 15min format', () => {
    const upcoming = getUpcomingShifts(shifts, CHATTERS, [], nowUtc);
    const messages = buildWhatsAppMessages(upcoming);

    expect(messages).toHaveLength(4);

    const danaMsg = messages.find(m => m.to === '+972501111111')!;
    expect(danaMsg.text).toBe('דנה, המשמרת שלך מתחילה בעוד 15 דקות! (19:00) — תעלה למערכת ותסמן שעלית.');

    const alonMsg = messages.find(m => m.to === '+972504444444')!;
    expect(alonMsg.text).toBe('אלון, המשמרת שלך מתחילה בעוד 15 דקות! (19:00) — תעלה למערכת ותסמן שעלית.');
  });

  it('PASS/FAIL: 4 unique WhatsAble API requests', () => {
    const upcoming = getUpcomingShifts(shifts, CHATTERS, [], nowUtc);
    const messages = buildWhatsAppMessages(upcoming);
    const phones = messages.map(m => m.to);

    expect(phones).toHaveLength(4);
    expect(new Set(phones).size).toBe(4);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// SCENARIO 3: Mixed shifts — only STARTING shifts get reminders
//   2 chatters ending day shift at 19:00 + 3 chatters starting night shift at 19:00
//   Only the 3 starting should get reminders
// ════════════════════════════════════════════════════════════════════════════════

describe('SCENARIO 3: Mixed shifts — only starting shifts get reminders', () => {
  const shifts: Shift[] = [
    // 2 ENDING shifts (started at 12:00, ending at 19:00) — status is "active"
    makeShift({ id: 's-end-1', chatter_id: 'c1', date: '2026-04-02', start_time: '12:00', end_time: '19:00', status: 'active', clocked_in: '2026-04-02T12:02:00+03:00' }),
    makeShift({ id: 's-end-2', chatter_id: 'c2', date: '2026-04-02', start_time: '12:00', end_time: '19:00', status: 'active', clocked_in: '2026-04-02T12:01:00+03:00' }),

    // 3 STARTING shifts (19:00–02:00) — status is "scheduled"
    makeShift({ id: 's-start-1', chatter_id: 'c2', date: '2026-04-02', start_time: '19:00', end_time: '02:00', model: 'Sophie' }),
    makeShift({ id: 's-start-2', chatter_id: 'c3', date: '2026-04-02', start_time: '19:00', end_time: '02:00', model: 'Mia' }),
    makeShift({ id: 's-start-3', chatter_id: 'c4', date: '2026-04-02', start_time: '19:00', end_time: '02:00', model: 'Luna' }),
  ];

  // 18:00 Israel = 60 min before 19:00
  const nowUtc = toIsraelDate('2026-04-02', '18:00');

  it('returns only 3 starting shifts, ignores 2 ending (active) shifts', () => {
    const upcoming = getUpcomingShifts(shifts, CHATTERS, [], nowUtc);
    expect(upcoming).toHaveLength(3);

    const ids = upcoming.map(u => u.shift_id);
    expect(ids).toContain('s-start-1');
    expect(ids).toContain('s-start-2');
    expect(ids).toContain('s-start-3');
    expect(ids).not.toContain('s-end-1');
    expect(ids).not.toContain('s-end-2');
  });

  it('ending chatters (active status) get zero messages', () => {
    const upcoming = getUpcomingShifts(shifts, CHATTERS, [], nowUtc);
    const endingShiftIds = upcoming.filter(u =>
      u.shift_id === 's-end-1' || u.shift_id === 's-end-2'
    );
    expect(endingShiftIds).toHaveLength(0);
  });

  it('PASS/FAIL: exactly 3 messages built', () => {
    const upcoming = getUpcomingShifts(shifts, CHATTERS, [], nowUtc);
    const messages = buildWhatsAppMessages(upcoming);
    expect(messages).toHaveLength(3);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// SCENARIO 4: Deduplication — second run sends nothing
//   Run 1: sends 60min reminder, logs it
//   Run 2: same shifts, same window — reminder_log prevents re-send
// ════════════════════════════════════════════════════════════════════════════════

describe('SCENARIO 4: Deduplication — second run sends nothing', () => {
  const shifts: Shift[] = [
    makeShift({ id: 's1', chatter_id: 'c1', date: '2026-04-02', start_time: '12:00', end_time: '19:00', model: 'Bella' }),
    makeShift({ id: 's2', chatter_id: 'c2', date: '2026-04-02', start_time: '12:00', end_time: '19:00', model: 'Sophie' }),
  ];

  const nowUtc = toIsraelDate('2026-04-02', '11:00');

  it('RUN 1: returns 2 reminders', () => {
    const upcoming = getUpcomingShifts(shifts, CHATTERS, [], nowUtc);
    expect(upcoming).toHaveLength(2);
    expect(upcoming.every(u => u.reminder_type === '60min')).toBe(true);
  });

  it('RUN 2: returns 0 reminders (already in reminder_log)', () => {
    // Simulate that Run 1 logged the reminders
    const reminderLog: ReminderLogEntry[] = [
      { shift_id: 's1', reminder_type: '60min', sent_at: '2026-04-02T08:01:00Z' },
      { shift_id: 's2', reminder_type: '60min', sent_at: '2026-04-02T08:01:00Z' },
    ];

    const upcoming = getUpcomingShifts(shifts, CHATTERS, reminderLog, nowUtc);
    expect(upcoming).toHaveLength(0);
  });

  it('Has Reminders? = false on second run', () => {
    const reminderLog: ReminderLogEntry[] = [
      { shift_id: 's1', reminder_type: '60min', sent_at: '2026-04-02T08:01:00Z' },
      { shift_id: 's2', reminder_type: '60min', sent_at: '2026-04-02T08:01:00Z' },
    ];

    const upcoming = getUpcomingShifts(shifts, CHATTERS, reminderLog, nowUtc);
    expect(hasReminders(upcoming)).toBe(false);
  });

  it('deduplicateReminders helper: ON CONFLICT DO NOTHING', () => {
    const existingLog: ReminderLogEntry[] = [
      { shift_id: 's1', reminder_type: '60min', sent_at: '2026-04-02T08:01:00Z' },
    ];

    // Try to insert same s1:60min + new s2:60min
    const newEntries = [
      { shift_id: 's1', reminder_type: '60min' as const },
      { shift_id: 's2', reminder_type: '60min' as const },
    ];

    const added = deduplicateReminders(existingLog, newEntries);
    expect(added).toHaveLength(1); // only s2 is new
    expect(added[0].shift_id).toBe('s2');
  });

  it('PASS/FAIL: 60min sent once → 15min still sends later', () => {
    // Both 60min reminders already logged
    const reminderLog: ReminderLogEntry[] = [
      { shift_id: 's1', reminder_type: '60min', sent_at: '2026-04-02T08:01:00Z' },
      { shift_id: 's2', reminder_type: '60min', sent_at: '2026-04-02T08:01:00Z' },
    ];

    // Now it's 15 min before — both shifts should get 15min reminders
    const nowUtc15 = toIsraelDate('2026-04-02', '11:45');
    const upcoming = getUpcomingShifts(shifts, CHATTERS, reminderLog, nowUtc15);

    expect(upcoming).toHaveLength(2);
    expect(upcoming.every(u => u.reminder_type === '15min')).toBe(true);
    // 60min already sent → not re-sent
    const has60 = upcoming.some(u => u.reminder_type === '60min');
    expect(has60).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// SCENARIO 5: No upcoming shifts
//   All shifts are either completed, missed, or start > 65 min from now
//   Expected: workflow exits at "Has Reminders?" with no messages sent
// ════════════════════════════════════════════════════════════════════════════════

describe('SCENARIO 5: No upcoming shifts — workflow exits early', () => {
  const shifts: Shift[] = [
    // Completed shift
    makeShift({ id: 's1', chatter_id: 'c1', status: 'completed', clocked_in: '2026-04-02T08:00:00Z', clocked_out: '2026-04-02T15:00:00Z' }),
    // Missed shift
    makeShift({ id: 's2', chatter_id: 'c2', status: 'missed' }),
    // Far future shift (starts in 3 hours)
    makeShift({ id: 's3', chatter_id: 'c3', date: '2026-04-02', start_time: '15:00', end_time: '22:00' }),
    // Past shift that already started
    makeShift({ id: 's4', chatter_id: 'c4', date: '2026-04-02', start_time: '09:00', end_time: '16:00', status: 'active', clocked_in: '2026-04-02T09:01:00+03:00' }),
  ];

  // 12:00 Israel — no shifts in 55–65 or 10–20 min windows
  const nowUtc = toIsraelDate('2026-04-02', '12:00');

  it('upcoming-shifts returns empty array', () => {
    const upcoming = getUpcomingShifts(shifts, CHATTERS, [], nowUtc);
    expect(upcoming).toHaveLength(0);
  });

  it('Has Reminders? = false', () => {
    const upcoming = getUpcomingShifts(shifts, CHATTERS, [], nowUtc);
    expect(hasReminders(upcoming)).toBe(false);
  });

  it('PASS/FAIL: zero messages built, zero API calls', () => {
    const upcoming = getUpcomingShifts(shifts, CHATTERS, [], nowUtc);
    const messages = buildWhatsAppMessages(upcoming);
    expect(messages).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// SCENARIO 6: Missed shift detection
//   דנה scheduled for 12:00, current time 12:30, no clock-in
//   Expected: status → "missed", admin alert via WhatsApp
// ════════════════════════════════════════════════════════════════════════════════

describe('SCENARIO 6: Missed shift detection', () => {
  const shifts: Shift[] = [
    // דנה: scheduled for 12:00, never clocked in
    makeShift({ id: 's1', chatter_id: 'c1', date: '2026-04-02', start_time: '12:00', end_time: '19:00', model: 'Bella' }),
    // יוסי: also scheduled for 12:00, but clocked in → status = active
    makeShift({ id: 's2', chatter_id: 'c2', date: '2026-04-02', start_time: '12:00', end_time: '19:00', status: 'active', clocked_in: '2026-04-02T12:03:00+03:00' }),
    // מיכל: scheduled for 13:00 → not missed yet at 12:30
    makeShift({ id: 's3', chatter_id: 'c3', date: '2026-04-02', start_time: '13:00', end_time: '20:00' }),
  ];

  // 12:30 Israel = 30 min past 12:00 start (> 15 min grace)
  const nowUtc = toIsraelDate('2026-04-02', '12:30');

  it('detects 1 missed shift (דנה), ignores active (יוסי) and future (מיכל)', () => {
    const missed = detectMissedShifts(shifts, CHATTERS, nowUtc);
    expect(missed).toHaveLength(1);
    expect(missed[0].chatter_name).toBe('דנה');
    expect(missed[0].shift_id).toBe('s1');
    expect(missed[0].start_time).toBe('12:00');
  });

  it('does NOT flag shift within grace period', () => {
    // At 12:10, only 10 min past start → within 15 min grace
    const nowGrace = toIsraelDate('2026-04-02', '12:10');
    const missed = detectMissedShifts(shifts, CHATTERS, nowGrace);
    expect(missed).toHaveLength(0);
  });

  it('builds admin WhatsApp alert with missed chatter info', () => {
    const missed = detectMissedShifts(shifts, CHATTERS, nowUtc);
    const alert = buildMissedShiftAdminAlert(missed);

    expect(alert.text).toContain('⚠️ משמרות שלא התחילו:');
    expect(alert.text).toContain('דנה — 12:00');
    expect(alert.text).not.toContain('יוסי');
    expect(alert.text).not.toContain('מיכל');
  });

  it('admin alert WhatsAble request is correct', () => {
    const missed = detectMissedShifts(shifts, CHATTERS, nowUtc);
    const alert = buildMissedShiftAdminAlert(missed);
    const req = buildWhatsAbleRequest(alert);

    const body = JSON.parse(req.body);
    expect(body.to).toMatch(/^\+972/);
    expect(body.text).toContain('משמרות שלא התחילו');
  });

  it('PASS/FAIL criteria', () => {
    const missed = detectMissedShifts(shifts, CHATTERS, nowUtc);

    // Exactly 1 missed
    expect(missed).toHaveLength(1);
    // shift s1 flagged
    expect(missed[0].shift_id).toBe('s1');
    // Active shift s2 not flagged
    expect(missed.find(m => m.shift_id === 's2')).toBeUndefined();
    // Future shift s3 not flagged
    expect(missed.find(m => m.shift_id === 's3')).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// SCENARIO 7: Midnight crossing — night shift already active
//   Chatter scheduled 19:00–02:00, current time 01:00 (shift active)
//   Expected: NO reminder (shift already started)
// ════════════════════════════════════════════════════════════════════════════════

describe('SCENARIO 7: Midnight crossing — no reminder for active night shift', () => {
  const shifts: Shift[] = [
    // Night shift 19:00→02:00, clocked in at 19:05, status=active
    makeShift({
      id: 's1',
      chatter_id: 'c1',
      date: '2026-04-02',
      start_time: '19:00',
      end_time: '02:00',
      model: 'Bella',
      status: 'active',
      clocked_in: '2026-04-02T19:05:00+03:00',
    }),
  ];

  // 01:00 Israel on April 3 (during the active shift)
  const nowUtc = toIsraelDate('2026-04-03', '01:00');

  it('no reminders for active shift', () => {
    const upcoming = getUpcomingShifts(shifts, CHATTERS, [], nowUtc);
    expect(upcoming).toHaveLength(0);
  });

  it('not flagged as missed (status is active, not scheduled)', () => {
    const missed = detectMissedShifts(shifts, CHATTERS, nowUtc);
    expect(missed).toHaveLength(0);
  });

  it('PASS/FAIL: zero messages, zero alerts', () => {
    const upcoming = getUpcomingShifts(shifts, CHATTERS, [], nowUtc);
    const messages = buildWhatsAppMessages(upcoming);
    expect(messages).toHaveLength(0);

    const missed = detectMissedShifts(shifts, CHATTERS, nowUtc);
    expect(missed).toHaveLength(0);
  });
});

// Also test: scheduled night shift that hasn't started yet should get reminder
describe('SCENARIO 7b: Night shift about to start — should get reminder', () => {
  const shifts: Shift[] = [
    makeShift({
      id: 's1',
      chatter_id: 'c1',
      date: '2026-04-02',
      start_time: '19:00',
      end_time: '02:00',
      model: 'Bella',
      status: 'scheduled',
    }),
  ];

  // 18:00 Israel = 60 min before 19:00
  const nowUtc = toIsraelDate('2026-04-02', '18:00');

  it('returns 60min reminder for upcoming night shift', () => {
    const upcoming = getUpcomingShifts(shifts, CHATTERS, [], nowUtc);
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].reminder_type).toBe('60min');
    expect(upcoming[0].name).toBe('דנה');
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// SCENARIO 8: Israel timezone DST
//   Verify time math uses Asia/Jerusalem, not UTC
// ════════════════════════════════════════════════════════════════════════════════

describe('SCENARIO 8: Israel timezone DST handling', () => {
  it('toIsraelDate correctly handles IDT (UTC+3, summer)', () => {
    // April 2 2026 is in IDT (UTC+3)
    const israelNoon = toIsraelDate('2026-04-02', '12:00');
    // 12:00 Israel IDT = 09:00 UTC
    expect(israelNoon.getUTCHours()).toBe(9);
  });

  it('toIsraelDate correctly handles IST (UTC+2, winter)', () => {
    // January 15 2026 is in IST (UTC+2)
    const israelNoon = toIsraelDate('2026-01-15', '12:00');
    // 12:00 Israel IST = 10:00 UTC
    expect(israelNoon.getUTCHours()).toBe(10);
  });

  it('60min window works correctly in IDT', () => {
    const shifts: Shift[] = [
      makeShift({ id: 's1', chatter_id: 'c1', date: '2026-04-02', start_time: '12:00', model: 'Bella' }),
    ];

    // 11:00 Israel IDT = 08:00 UTC → 60 min before 12:00 Israel
    const nowUtc = toIsraelDate('2026-04-02', '11:00');
    const upcoming = getUpcomingShifts(shifts, CHATTERS, [], nowUtc);
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].reminder_type).toBe('60min');
  });

  it('60min window works correctly in IST (winter)', () => {
    const shifts: Shift[] = [
      makeShift({ id: 's1', chatter_id: 'c1', date: '2026-01-15', start_time: '12:00', model: 'Bella' }),
    ];

    // 11:00 Israel IST = 09:00 UTC → 60 min before 12:00 Israel
    const nowUtc = toIsraelDate('2026-01-15', '11:00');
    const upcoming = getUpcomingShifts(shifts, CHATTERS, [], nowUtc);
    expect(upcoming).toHaveLength(1);
  });

  it('DST spring-forward: shift at 03:00 on transition day', () => {
    // Israel springs forward March 27 2026: 02:00 → 03:00
    // Shift at 03:00 means there's only 1 real hour between 01:00 and 03:00
    const shifts: Shift[] = [
      makeShift({ id: 's1', chatter_id: 'c1', date: '2026-03-27', start_time: '03:00', model: 'Bella' }),
    ];

    // 01:00 IST (UTC+2) on March 27 → 23:00 UTC March 26
    // 03:00 IDT (UTC+3) on March 27 → 00:00 UTC March 27
    // Diff = 60 real minutes (because 02:00-03:00 doesn't exist)
    const nowUtc = toIsraelDate('2026-03-27', '01:00');
    const upcoming = getUpcomingShifts(shifts, CHATTERS, [], nowUtc);

    // Should still trigger 60min reminder (60 real minutes apart)
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].reminder_type).toBe('60min');
  });

  it('all time comparisons use Israel local time, never raw UTC', () => {
    // A shift at 12:00 Israel on April 2 (IDT, UTC+3) = 09:00 UTC
    // If we incorrectly used UTC, "11:00 UTC" would be "60 min before 12:00 UTC"
    // but "11:00 UTC" is actually "14:00 Israel" — 2 hours AFTER the shift
    const shifts: Shift[] = [
      makeShift({ id: 's1', chatter_id: 'c1', date: '2026-04-02', start_time: '12:00', model: 'Bella' }),
    ];

    // Pass raw UTC 11:00 — this is 14:00 Israel, shift already passed
    const badNow = new Date('2026-04-02T11:00:00Z');
    const upcoming = getUpcomingShifts(shifts, CHATTERS, [], badNow);

    // Should NOT match any window (shift was at 09:00 UTC, now is 11:00 UTC = 2h after)
    expect(upcoming).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// BONUS: Full end-to-end data flow trace
// ════════════════════════════════════════════════════════════════════════════════

describe('E2E: Full workflow data flow trace', () => {
  it('traces complete happy path: cron → fetch → filter → build → request', () => {
    // Step 0: Mock data (what Supabase returns)
    const shifts: Shift[] = [
      makeShift({ id: 's1', chatter_id: 'c1', date: '2026-04-02', start_time: '12:00', end_time: '19:00', model: 'Bella' }),
    ];
    const reminderLog: ReminderLogEntry[] = [];
    const nowUtc = toIsraelDate('2026-04-02', '11:02'); // 58 min before

    // Step 1: Fetch Upcoming Shifts (edge function / Code node)
    const upcoming = getUpcomingShifts(shifts, CHATTERS, reminderLog, nowUtc);
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0]).toMatchObject({
      shift_id: 's1',
      name: 'דנה',
      phone: '+972501111111',
      reminder_type: '60min',
      model: 'Bella',
    });

    // Step 2: Has Reminders? (If node)
    expect(hasReminders(upcoming)).toBe(true);

    // Step 3: Build WhatsApp Messages (Code node)
    const messages = buildWhatsAppMessages(upcoming);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({
      to: '+972501111111',
      text: 'היי דנה! תזכורת: יש לך משמרת בעוד שעה (12:00). מודל: Bella',
    });

    // Step 4: HTTP Request to WhatsAble API
    const request = buildWhatsAbleRequest(messages[0]);
    expect(request).toEqual({
      url: 'https://dashboard.whatsable.app/api/whatsapp/messages/v2.0.0/send',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: '<API_KEY>',
      },
      body: JSON.stringify({
        to: '+972501111111',
        text: 'היי דנה! תזכורת: יש לך משמרת בעוד שעה (12:00). מודל: Bella',
      }),
    });

    // Step 5: Log reminder (dedup for next run)
    const logged = deduplicateReminders(reminderLog, [
      { shift_id: 's1', reminder_type: '60min' },
    ]);
    expect(logged).toHaveLength(1);

    // Step 6: Re-run — should get 0 results now
    const upcoming2 = getUpcomingShifts(shifts, CHATTERS, logged, nowUtc);
    expect(upcoming2).toHaveLength(0);
  });
});
