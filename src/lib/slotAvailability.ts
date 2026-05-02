import type { ShiftSlot } from './types';

export interface GroupedAvailableSlot {
  key: string;
  date: string;
  shift_type: ShiftSlot['shift_type'];
  total_capacity: number;
  occupied: number;
  is_full: boolean;
  chatter_signed_up: boolean;
  signup_slot_id: string | null;
  queue_slot_id: string | null;
}

export interface ShiftSlotAvailabilityRow {
  slot_date: string;
  slot_shift_type: string;
  total_models: number;
  total_needed: number;
  total_filled: number;
  is_full: boolean;
  occupied: number;
}

export interface SlotShiftRow {
  date: string;
  start_time: string;
}

interface BuildGroupedAvailableSlotsInput {
  availabilityRows: ShiftSlotAvailabilityRow[];
  slotRows: ShiftSlot[];
  chatterShiftRows: SlotShiftRow[];
  occupancyRows: SlotShiftRow[];
}

interface SlotLookupEntry {
  signup_slot_id: string | null;
  queue_slot_id: string | null;
  total_capacity: number;
}

export function getSlotTypeLabel(shiftType: ShiftSlot['shift_type']) {
  return shiftType === 'morning' ? 'בוקר' : 'ערב';
}

export function getSlotTimeWindow(shiftType: ShiftSlot['shift_type']) {
  if (shiftType === 'morning') {
    return { start: '12:00', end: '19:00' };
  }
  return { start: '19:00', end: '02:00' };
}

export function getShiftTypeByStartTime(startTime: string): ShiftSlot['shift_type'] {
  if (startTime.startsWith('12:00')) return 'morning';
  if (startTime.startsWith('19:00')) return 'evening';
  return Number(startTime.slice(0, 2)) < 19 ? 'morning' : 'evening';
}

export function getSlotKey(date: string, shiftType: ShiftSlot['shift_type']) {
  return `${date}|${shiftType}`;
}

export function getShiftTypeOrder(shiftType: ShiftSlot['shift_type']) {
  return shiftType === 'morning' ? 0 : 1;
}

function buildSlotLookup(slotRows: ShiftSlot[]) {
  const lookup = new Map<string, SlotLookupEntry>();

  for (const slot of slotRows) {
    const key = getSlotKey(slot.date, slot.shift_type);
    const current = lookup.get(key) ?? {
      signup_slot_id: null,
      queue_slot_id: null,
      total_capacity: 0,
    };

    current.total_capacity += Math.max(0, Number(slot.max_chatters ?? 0));
    if (!current.queue_slot_id) {
      current.queue_slot_id = slot.id;
    }
    if (slot.status === 'open' && !current.signup_slot_id) {
      current.signup_slot_id = slot.id;
    }

    lookup.set(key, current);
  }

  return lookup;
}

function buildShiftCountBySlot(rows: SlotShiftRow[]) {
  const countBySlot = new Map<string, number>();

  for (const row of rows) {
    const key = getSlotKey(row.date, getShiftTypeByStartTime(row.start_time));
    countBySlot.set(key, (countBySlot.get(key) ?? 0) + 1);
  }

  return countBySlot;
}

function buildSignedUpSlots(rows: SlotShiftRow[]) {
  const signedUp = new Set<string>();

  for (const row of rows) {
    signedUp.add(getSlotKey(row.date, getShiftTypeByStartTime(row.start_time)));
  }

  return signedUp;
}

function normalizeAvailabilityShiftType(value: string): ShiftSlot['shift_type'] | null {
  if (value === 'morning' || value === 'evening') return value;
  return null;
}

export function buildGroupedAvailableSlots({
  availabilityRows,
  slotRows,
  chatterShiftRows,
  occupancyRows,
}: BuildGroupedAvailableSlotsInput): GroupedAvailableSlot[] {
  const slotLookup = buildSlotLookup(slotRows);
  const occupiedBySlot = buildShiftCountBySlot(occupancyRows);
  const chatterSignedUpBySlot = buildSignedUpSlots(chatterShiftRows);
  const groupedSlots = new Map<string, GroupedAvailableSlot>();

  for (const row of availabilityRows) {
    const shiftType = normalizeAvailabilityShiftType(row.slot_shift_type);
    if (!shiftType) continue;

    const key = getSlotKey(row.slot_date, shiftType);
    const slotIds = slotLookup.get(key);
    const totalCapacity = Math.max(0, Number(row.total_needed ?? slotIds?.total_capacity ?? 0));
    const occupied = Math.max(0, Number(row.occupied ?? occupiedBySlot.get(key) ?? 0));

    groupedSlots.set(key, {
      key,
      date: row.slot_date,
      shift_type: shiftType,
      total_capacity: totalCapacity,
      occupied,
      is_full:
        Boolean(row.is_full) ||
        (totalCapacity > 0 && occupied >= totalCapacity) ||
        (!slotIds?.signup_slot_id && Boolean(slotIds?.queue_slot_id)),
      chatter_signed_up: chatterSignedUpBySlot.has(key),
      signup_slot_id: slotIds?.signup_slot_id ?? null,
      queue_slot_id: slotIds?.queue_slot_id ?? null,
    });
  }

  for (const [key, slotIds] of slotLookup) {
    if (groupedSlots.has(key)) continue;

    const [date, shiftTypeValue] = key.split('|');
    const shiftType = normalizeAvailabilityShiftType(shiftTypeValue);
    if (!shiftType) continue;

    const occupied = occupiedBySlot.get(key) ?? 0;
    groupedSlots.set(key, {
      key,
      date,
      shift_type: shiftType,
      total_capacity: slotIds.total_capacity,
      occupied,
      is_full:
        (slotIds.total_capacity > 0 && occupied >= slotIds.total_capacity) ||
        !slotIds.signup_slot_id,
      chatter_signed_up: chatterSignedUpBySlot.has(key),
      signup_slot_id: slotIds.signup_slot_id,
      queue_slot_id: slotIds.queue_slot_id,
    });
  }

  return Array.from(groupedSlots.values()).sort(
    (a, b) =>
      a.date.localeCompare(b.date) || getShiftTypeOrder(a.shift_type) - getShiftTypeOrder(b.shift_type)
  );
}
