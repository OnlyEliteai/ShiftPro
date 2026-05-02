import type { Model, Platform, Shift } from './types';

export interface ShiftWindowEditAssignment {
  model_id: string;
  model: string;
  platform: Platform;
}

function isSameShiftWindow(candidate: Shift, selected: Shift) {
  return (
    candidate.chatter_id === selected.chatter_id &&
    candidate.date === selected.date &&
    candidate.start_time === selected.start_time &&
    candidate.end_time === selected.end_time
  );
}

export function getShiftWindowRows(existingShifts: Shift[], selectedShift: Shift): Shift[] {
  const rows = existingShifts.filter((shift) => isSameShiftWindow(shift, selectedShift));

  if (rows.some((shift) => shift.id === selectedShift.id)) {
    return rows;
  }

  return [selectedShift, ...rows.filter((shift) => shift.id !== selectedShift.id)];
}

export function getShiftWindowEditAssignments(
  existingShifts: Shift[],
  selectedShift: Shift,
  models: Model[]
): ShiftWindowEditAssignment[] {
  const assignments: ShiftWindowEditAssignment[] = [];
  const seen = new Set<string>();
  const modelIdByName = new Map(models.map((model) => [model.name.trim().toLowerCase(), model.id]));

  for (const shift of getShiftWindowRows(existingShifts, selectedShift)) {
    if (shift.shift_assignments && shift.shift_assignments.length > 0) {
      for (const assignment of shift.shift_assignments) {
        const modelId =
          assignment.model_id ?? modelIdByName.get(assignment.model.trim().toLowerCase()) ?? '';
        if (!modelId) continue;

        const key = `${modelId}|${assignment.platform}`;
        if (seen.has(key)) continue;
        seen.add(key);
        assignments.push({
          model_id: modelId,
          model: assignment.model,
          platform: assignment.platform,
        });
      }
      continue;
    }

    if (shift.model && shift.platform) {
      const modelId = shift.model_id ?? modelIdByName.get(shift.model.trim().toLowerCase()) ?? '';
      if (!modelId) continue;

      const key = `${modelId}|${shift.platform}`;
      if (seen.has(key)) continue;
      seen.add(key);
      assignments.push({
        model_id: modelId,
        model: shift.model,
        platform: shift.platform,
      });
    }
  }

  return assignments;
}
