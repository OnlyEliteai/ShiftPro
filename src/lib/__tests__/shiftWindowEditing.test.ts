import { describe, expect, it } from 'vitest';
import type { Model, Shift } from '../types';
import { getShiftWindowEditAssignments, getShiftWindowRows } from '../shiftWindowEditing';

const models: Model[] = [
  {
    id: 'model-lina',
    name: 'Lina',
    active: true,
    created_at: '2026-05-01T00:00:00Z',
  },
  {
    id: 'model-maya',
    name: 'Maya',
    active: true,
    created_at: '2026-05-01T00:00:00Z',
  },
];

function makeShift(overrides: Partial<Shift> = {}): Shift {
  return {
    id: 'shift-lina-tg',
    chatter_id: 'chatter-1',
    date: '2026-05-09',
    start_time: '19:00',
    end_time: '02:00',
    model: 'Lina',
    model_id: 'model-lina',
    platform: 'telegram',
    status: 'scheduled',
    clocked_in: null,
    clocked_out: null,
    created_at: '2026-05-02T10:00:00Z',
    updated_at: '2026-05-02T10:00:00Z',
    shift_assignments: null,
    ...overrides,
  };
}

describe('shiftWindowEditing', () => {
  it('finds every sibling row in the same chatter/date/time window', () => {
    const selected = makeShift({ id: 'shift-lina-tg' });
    const sibling = makeShift({
      id: 'shift-maya-of',
      model: 'Maya',
      model_id: 'model-maya',
      platform: 'onlyfans',
    });
    const otherWindow = makeShift({ id: 'other-window', start_time: '12:00', end_time: '19:00' });

    expect(getShiftWindowRows([selected, sibling, otherWindow], selected).map((shift) => shift.id))
      .toEqual(['shift-lina-tg', 'shift-maya-of']);
  });

  it('initializes edit assignments from sibling rows, not only the clicked row', () => {
    const selected = makeShift({ id: 'shift-lina-tg' });
    const sibling = makeShift({
      id: 'shift-maya-of',
      model: 'Maya',
      model_id: 'model-maya',
      platform: 'onlyfans',
    });

    expect(getShiftWindowEditAssignments([selected, sibling], selected, models)).toEqual([
      { model_id: 'model-lina', model: 'Lina', platform: 'telegram' },
      { model_id: 'model-maya', model: 'Maya', platform: 'onlyfans' },
    ]);
  });

  it('deduplicates assignment rows from the same grouped window', () => {
    const selected = makeShift({
      shift_assignments: [
        {
          id: 'assignment-1',
          shift_id: 'shift-lina-tg',
          model_id: 'model-lina',
          model: 'Lina',
          platform: 'telegram',
          shift_date: '2026-05-09',
          shift_start_time: '19:00',
          assigned_at: '2026-05-02T10:00:00Z',
        },
        {
          id: 'assignment-duplicate',
          shift_id: 'shift-lina-tg',
          model_id: 'model-lina',
          model: 'Lina',
          platform: 'telegram',
          shift_date: '2026-05-09',
          shift_start_time: '19:00',
          assigned_at: '2026-05-02T10:01:00Z',
        },
      ],
    });

    expect(getShiftWindowEditAssignments([selected], selected, models)).toEqual([
      { model_id: 'model-lina', model: 'Lina', platform: 'telegram' },
    ]);
  });
});
