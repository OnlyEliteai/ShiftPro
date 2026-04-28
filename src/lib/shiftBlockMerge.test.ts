import { describe, expect, it } from 'vitest';
import { mergeShiftBlocks } from './shiftBlockMerge';
import type { ShiftWithChatter } from './types';

function makeShift(overrides: Partial<ShiftWithChatter>): ShiftWithChatter {
  return {
    id: 'shift-1',
    chatter_id: 'chatter-1',
    date: '2026-04-28',
    start_time: '12:00:00',
    end_time: '19:00:00',
    model: null,
    platform: null,
    model_id: null,
    status: 'scheduled',
    clocked_in: null,
    clocked_out: null,
    created_at: '2026-04-28T08:00:00Z',
    updated_at: '2026-04-28T08:00:00Z',
    chatters: { name: 'נועה', phone: '0500000000' },
    shift_assignments: [],
    ...overrides,
  };
}

describe('mergeShiftBlocks', () => {
  it('keeps a single assignment as one block', () => {
    const shifts: ShiftWithChatter[] = [
      makeShift({
        model: 'Lina',
        platform: 'telegram',
      }),
    ];

    const blocks = mergeShiftBlocks(shifts);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].assignments).toEqual([{ model: 'Lina', platform: 'telegram' }]);
  });

  it('merges N assignments from rows sharing same chatter + shift id', () => {
    const shifts: ShiftWithChatter[] = [
      makeShift({
        id: 'shift-7',
        shift_assignments: [
          {
            id: 'a-1',
            shift_id: 'shift-7',
            model_id: null,
            model: 'Lina',
            platform: 'telegram',
            shift_date: '2026-04-28',
            shift_start_time: '12:00:00',
            assigned_at: '2026-04-28T08:00:00Z',
          },
        ],
      }),
      makeShift({
        id: 'shift-7',
        shift_assignments: [
          {
            id: 'a-2',
            shift_id: 'shift-7',
            model_id: null,
            model: 'Lina',
            platform: 'onlyfans',
            shift_date: '2026-04-28',
            shift_start_time: '12:00:00',
            assigned_at: '2026-04-28T08:02:00Z',
          },
          {
            id: 'a-3',
            shift_id: 'shift-7',
            model_id: null,
            model: 'Maya',
            platform: 'onlyfans',
            shift_date: '2026-04-28',
            shift_start_time: '12:00:00',
            assigned_at: '2026-04-28T08:03:00Z',
          },
        ],
      }),
    ];

    const blocks = mergeShiftBlocks(shifts);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].assignments).toEqual([
      { model: 'Lina', platform: 'onlyfans' },
      { model: 'Lina', platform: 'telegram' },
      { model: 'Maya', platform: 'onlyfans' },
    ]);
  });

  it('does not over-merge two distinct shift ids for same chatter/day', () => {
    const shifts: ShiftWithChatter[] = [
      makeShift({
        id: 'shift-morning',
        date: '2026-04-28',
        start_time: '12:00:00',
        end_time: '19:00:00',
      }),
      makeShift({
        id: 'shift-evening',
        date: '2026-04-28',
        start_time: '19:00:00',
        end_time: '02:00:00',
      }),
    ];

    const blocks = mergeShiftBlocks(shifts);
    expect(blocks).toHaveLength(2);
    expect(blocks.map((block) => block.primaryShift.id).sort()).toEqual([
      'shift-evening',
      'shift-morning',
    ]);
  });

  it('resolves mixed statuses by priority (active first)', () => {
    const shifts: ShiftWithChatter[] = [
      makeShift({ id: 'shift-9', status: 'scheduled' }),
      makeShift({ id: 'shift-9', status: 'active', clocked_in: '2026-04-28T09:00:00Z' }),
      makeShift({ id: 'shift-9', status: 'completed', clocked_out: '2026-04-28T16:00:00Z' }),
    ];

    const blocks = mergeShiftBlocks(shifts);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].status).toBe('active');
    expect(blocks[0].clockedIn).toBe(true);
    expect(blocks[0].clockedOut).toBe(true);
  });

  it('supports pending without model assignment', () => {
    const shifts: ShiftWithChatter[] = [
      makeShift({
        id: 'pending-1',
        status: 'pending',
        model: null,
        platform: null,
        shift_assignments: [],
      }),
    ];

    const blocks = mergeShiftBlocks(shifts);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].status).toBe('pending');
    expect(blocks[0].assignments).toEqual([]);
  });
});
