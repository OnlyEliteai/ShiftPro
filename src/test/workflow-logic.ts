/**
 * ShiftPro n8n Workflow Logic — pure functions for testing
 *
 * These mirror the Code nodes that run inside the n8n workflow:
 *   Cron → Fetch Upcoming Shifts → Has Reminders? → Build Messages → HTTP Request (WhatsAble)
 *
 * All timezone math uses Asia/Jerusalem.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface Chatter {
  id: string;
  name: string;
  phone: string;
  token: string;
  active: boolean;
}

export interface Shift {
  id: string;
  chatter_id: string;
  date: string;        // "YYYY-MM-DD"
  start_time: string;  // "HH:MM"
  end_time: string;    // "HH:MM"
  model: string | null;
  status: 'scheduled' | 'active' | 'completed' | 'missed' | 'pending' | 'rejected';
  clocked_in: string | null;
  clocked_out: string | null;
}

export interface ReminderLogEntry {
  shift_id: string;
  reminder_type: '60min' | '15min';
  sent_at: string;
}

export interface UpcomingShift {
  shift_id: string;
  chatter_id: string;
  name: string;
  phone: string;
  date: string;
  start_time: string;
  end_time: string;
  model: string | null;
  reminder_type: '60min' | '15min';
}

export interface WhatsAppMessage {
  to: string;
  text: string;
}

export interface MissedShiftResult {
  shift_id: string;
  chatter_id: string;
  chatter_name: string;
  date: string;
  start_time: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Build a Date in Asia/Jerusalem from a date string + time string.
 * Uses Intl to get the real Israel offset, handling DST automatically.
 */
export function toIsraelDate(dateStr: string, timeStr: string): Date {
  // Build an ISO string assuming the date+time are in Israel
  // We need to figure out the correct UTC equivalent
  const naive = new Date(`${dateStr}T${timeStr}:00`);

  // Get the Israel timezone offset for this moment
  const israelStr = naive.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' });
  const israelDate = new Date(israelStr);
  const offsetMs = naive.getTime() - israelDate.getTime();

  // The actual UTC time for this Israel local time
  return new Date(naive.getTime() + offsetMs);
}

/**
 * Get "now" in Israel timezone as a Date.
 * For testing, pass a mock `now` (UTC timestamp).
 */
export function nowInIsrael(nowUtc: Date): Date {
  return nowUtc;
}

/**
 * Calculate minutes between now (UTC) and a shift start in Israel timezone.
 */
export function minutesUntilShift(
  shiftDate: string,
  shiftStartTime: string,
  nowUtc: Date,
): number {
  const shiftStartUtc = toIsraelDate(shiftDate, shiftStartTime);
  return (shiftStartUtc.getTime() - nowUtc.getTime()) / 60_000;
}

// ── Node 1: Get Upcoming Shifts (mirrors upcoming-shifts edge function) ────────

export function getUpcomingShifts(
  shifts: Shift[],
  chatters: Chatter[],
  reminderLog: ReminderLogEntry[],
  nowUtc: Date,
): UpcomingShift[] {
  const chatterMap = new Map(chatters.map(c => [c.id, c]));
  const sentSet = new Set(reminderLog.map(r => `${r.shift_id}:${r.reminder_type}`));

  const results: UpcomingShift[] = [];

  for (const shift of shifts) {
    // Only scheduled shifts from active chatters
    if (shift.status !== 'scheduled') continue;
    const chatter = chatterMap.get(shift.chatter_id);
    if (!chatter || !chatter.active) continue;

    const minutesUntil = minutesUntilShift(shift.date, shift.start_time, nowUtc);

    // 60min window: 55–65 minutes before
    if (minutesUntil >= 55 && minutesUntil <= 65) {
      const key = `${shift.id}:60min`;
      if (!sentSet.has(key)) {
        results.push({
          shift_id: shift.id,
          chatter_id: shift.chatter_id,
          name: chatter.name,
          phone: chatter.phone,
          date: shift.date,
          start_time: shift.start_time,
          end_time: shift.end_time,
          model: shift.model,
          reminder_type: '60min',
        });
      }
    }

    // 15min window: 10–20 minutes before
    if (minutesUntil >= 10 && minutesUntil <= 20) {
      const key = `${shift.id}:15min`;
      if (!sentSet.has(key)) {
        results.push({
          shift_id: shift.id,
          chatter_id: shift.chatter_id,
          name: chatter.name,
          phone: chatter.phone,
          date: shift.date,
          start_time: shift.start_time,
          end_time: shift.end_time,
          model: shift.model,
          reminder_type: '15min',
        });
      }
    }
  }

  return results;
}

// ── Node 2: Has Reminders? (If node) ──────────────────────────────────────────

export function hasReminders(upcoming: UpcomingShift[]): boolean {
  return upcoming.length > 0;
}

// ── Node 3: Build WhatsApp Messages (Code node) ──────────────────────────────

export function buildWhatsAppMessages(upcoming: UpcomingShift[]): WhatsAppMessage[] {
  return upcoming.map(shift => {
    const time = shift.start_time.slice(0, 5); // "HH:MM"
    let text: string;

    if (shift.reminder_type === '60min') {
      text = `היי ${shift.name}! תזכורת: יש לך משמרת בעוד שעה (${time}). מודל: ${shift.model ?? 'לא צוין'}`;
    } else {
      text = `${shift.name}, המשמרת שלך מתחילה בעוד 15 דקות! (${time}) — תעלה למערכת ותסמן שעלית.`;
    }

    return { to: shift.phone, text };
  });
}

// ── Node 4: Build WhatsAble API Request body ─────────────────────────────────

export function buildWhatsAbleRequest(msg: WhatsAppMessage): {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
} {
  return {
    url: 'https://dashboard.whatsable.app/api/whatsapp/messages/v2.0.0/send',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: '<API_KEY>',
    },
    body: JSON.stringify({ to: msg.to, text: msg.text }),
  };
}

// ── Missed Shift Detection (Workflow 2) ──────────────────────────────────────

const MISSED_GRACE_MINUTES = 15;

export function detectMissedShifts(
  shifts: Shift[],
  chatters: Chatter[],
  nowUtc: Date,
): MissedShiftResult[] {
  const chatterMap = new Map(chatters.map(c => [c.id, c]));
  const results: MissedShiftResult[] = [];

  for (const shift of shifts) {
    if (shift.status !== 'scheduled') continue;
    const chatter = chatterMap.get(shift.chatter_id);
    if (!chatter) continue;

    const minutesUntil = minutesUntilShift(shift.date, shift.start_time, nowUtc);

    // Shift start + grace period has passed (minutesUntil is negative and > grace)
    if (minutesUntil < -MISSED_GRACE_MINUTES) {
      results.push({
        shift_id: shift.id,
        chatter_id: shift.chatter_id,
        chatter_name: chatter.name,
        date: shift.date,
        start_time: shift.start_time,
      });
    }
  }

  return results;
}

export function buildMissedShiftAdminAlert(missed: MissedShiftResult[]): WhatsAppMessage {
  const lines = missed.map(m => `${m.chatter_name} — ${m.start_time}`);
  return {
    to: '+972500000000', // admin number
    text: `⚠️ משמרות שלא התחילו:\n${lines.join('\n')}`,
  };
}

// ── Deduplication helper (mirrors log-reminder ON CONFLICT DO NOTHING) ───────

export function deduplicateReminders(
  existingLog: ReminderLogEntry[],
  newEntries: { shift_id: string; reminder_type: '60min' | '15min' }[],
): ReminderLogEntry[] {
  const sentSet = new Set(existingLog.map(r => `${r.shift_id}:${r.reminder_type}`));
  const added: ReminderLogEntry[] = [];

  for (const entry of newEntries) {
    const key = `${entry.shift_id}:${entry.reminder_type}`;
    if (!sentSet.has(key)) {
      sentSet.add(key);
      added.push({
        shift_id: entry.shift_id,
        reminder_type: entry.reminder_type,
        sent_at: new Date().toISOString(),
      });
    }
  }

  return added;
}
