import type { Platform, Shift, ShiftWithChatter } from './types';

export interface ShiftBlockAssignment {
  model: string;
  platform: Platform;
}

export interface ShiftCalendarBlock {
  key: string;
  chatterId: string;
  chatterName: string;
  date: string;
  startTime: string;
  endTime: string;
  status: Shift['status'];
  clockedIn: boolean;
  clockedOut: boolean;
  assignments: ShiftBlockAssignment[];
  primaryShift: ShiftWithChatter;
  shifts: ShiftWithChatter[];
}

const STATUS_PRIORITY: Shift['status'][] = [
  'active',
  'pending',
  'scheduled',
  'completed',
  'missed',
  'rejected',
  'cancelled',
];

function getShiftAssignments(shift: ShiftWithChatter): ShiftBlockAssignment[] {
  if (shift.shift_assignments && shift.shift_assignments.length > 0) {
    return shift.shift_assignments.map((assignment) => ({
      model: assignment.model,
      platform: assignment.platform,
    }));
  }

  if (shift.model && shift.platform) {
    return [{ model: shift.model, platform: shift.platform }];
  }

  return [];
}

function resolveStatus(shifts: ShiftWithChatter[]): Shift['status'] {
  for (const status of STATUS_PRIORITY) {
    if (shifts.some((shift) => shift.status === status)) {
      return status;
    }
  }
  return shifts[0]?.status ?? 'scheduled';
}

function getGroupKey(shift: ShiftWithChatter) {
  return `${shift.chatter_id}|${shift.id}`;
}

export function mergeShiftBlocks(shifts: ShiftWithChatter[]): ShiftCalendarBlock[] {
  const groups = new Map<string, ShiftWithChatter[]>();

  for (const shift of shifts) {
    const key = getGroupKey(shift);
    const group = groups.get(key) ?? [];
    group.push(shift);
    groups.set(key, group);
  }

  const blocks: ShiftCalendarBlock[] = [];
  for (const [key, groupShifts] of groups.entries()) {
    const primaryShift = groupShifts[0];
    const assignmentsMap = new Map<string, ShiftBlockAssignment>();

    for (const shift of groupShifts) {
      for (const assignment of getShiftAssignments(shift)) {
        assignmentsMap.set(`${assignment.model}|${assignment.platform}`, assignment);
      }
    }

    blocks.push({
      key,
      chatterId: primaryShift.chatter_id,
      chatterName: primaryShift.chatters?.name ?? '—',
      date: primaryShift.date,
      startTime: primaryShift.start_time,
      endTime: primaryShift.end_time,
      status: resolveStatus(groupShifts),
      clockedIn: groupShifts.some((shift) => Boolean(shift.clocked_in)),
      clockedOut: groupShifts.some((shift) => Boolean(shift.clocked_out)),
      assignments: Array.from(assignmentsMap.values()).sort((a, b) =>
        `${a.model}|${a.platform}`.localeCompare(`${b.model}|${b.platform}`, 'he')
      ),
      primaryShift,
      shifts: groupShifts,
    });
  }

  return blocks.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.startTime.localeCompare(b.startTime) ||
      a.chatterName.localeCompare(b.chatterName, 'he')
  );
}
