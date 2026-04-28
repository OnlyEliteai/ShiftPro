import type { Platform, Shift, ShiftAssignment } from './types';
import { getPlatformLabel } from './utils';

type ShiftLike = Pick<
  Shift,
  | 'id'
  | 'chatter_id'
  | 'model'
  | 'model_id'
  | 'platform'
  | 'status'
  | 'shift_assignments'
>;

export interface MergedShiftAssignment {
  id: string | null;
  model_id: string | null;
  model: string;
  platform: Platform;
}

export interface MergedShiftBlock<T extends ShiftLike = Shift> {
  shiftId: string;
  key: string;
  shift: T;
  shifts: T[];
  assignments: MergedShiftAssignment[];
  chatterId: string;
  status: Shift['status'];
}

export interface MergedShiftAssignmentGroup {
  key: string;
  model_id: string | null;
  model: string;
  platforms: Platform[];
  platformLabels: string[];
}

function getShiftAssignments(shift: ShiftLike): MergedShiftAssignment[] {
  if (shift.shift_assignments && shift.shift_assignments.length > 0) {
    return shift.shift_assignments.map((assignment: ShiftAssignment) => ({
      id: assignment.id,
      model_id: assignment.model_id,
      model: assignment.model,
      platform: assignment.platform,
    }));
  }

  if (shift.model && shift.platform) {
    return [
      {
        id: null,
        model_id: shift.model_id,
        model: shift.model,
        platform: shift.platform,
      },
    ];
  }

  return [];
}

function makeAssignmentKey(assignment: MergedShiftAssignment) {
  return `${assignment.model_id ?? assignment.model.trim().toLowerCase()}|${assignment.platform}`;
}

function mergeAssignments(shifts: ShiftLike[]) {
  const assignments: MergedShiftAssignment[] = [];
  const seen = new Set<string>();

  for (const shift of shifts) {
    for (const assignment of getShiftAssignments(shift)) {
      const key = makeAssignmentKey(assignment);
      if (seen.has(key)) continue;
      seen.add(key);
      assignments.push(assignment);
    }
  }

  return assignments;
}

export function groupShiftBlocks<T extends ShiftLike>(shifts: T[]): MergedShiftBlock<T>[] {
  const groups = new Map<string, T[]>();

  for (const shift of shifts) {
    const group = groups.get(shift.id) ?? [];
    group.push(shift);
    groups.set(shift.id, group);
  }

  return Array.from(groups.entries()).map(([shiftId, group]) => {
    const first = group[0];
    return {
      shiftId,
      key: shiftId,
      shift: first,
      shifts: group,
      assignments: mergeAssignments(group),
      chatterId: first.chatter_id,
      status: first.status,
    };
  });
}

export function groupMergedShiftAssignments(
  assignments: MergedShiftAssignment[]
): MergedShiftAssignmentGroup[] {
  const groups = new Map<string, MergedShiftAssignmentGroup>();

  for (const assignment of assignments) {
    const key = assignment.model_id ?? assignment.model.trim().toLowerCase();
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        key,
        model_id: assignment.model_id,
        model: assignment.model,
        platforms: [assignment.platform],
        platformLabels: [getPlatformLabel(assignment.platform)],
      });
      continue;
    }

    if (!existing.platforms.includes(assignment.platform)) {
      existing.platforms.push(assignment.platform);
      existing.platformLabels.push(getPlatformLabel(assignment.platform));
    }
  }

  return Array.from(groups.values());
}

export function getMergedShiftAssignmentGroups(
  block: Pick<MergedShiftBlock, 'assignments'>
) {
  return groupMergedShiftAssignments(block.assignments);
}

export function getMergedShiftAssignmentLabels(block: Pick<MergedShiftBlock, 'assignments'>) {
  if (block.assignments.length === 0) return ['ללא הקצאה'];

  return getMergedShiftAssignmentGroups(block).map(
    (group) => `${group.model} · ${group.platformLabels.join(', ')}`
  );
}
