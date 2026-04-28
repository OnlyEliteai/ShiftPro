import { describe, expect, it } from 'vitest';
import type { ShiftWithChatter } from '../types';
import {
  groupChatterWindowBlocks,
  getMergedShiftAssignmentGroups,
  getMergedShiftAssignmentLabels,
  groupShiftBlocks,
} from '../shiftGrouping';

function makeShift(overrides: Partial<ShiftWithChatter> = {}): ShiftWithChatter {
  return {
    id: 'shift-1',
    chatter_id: 'chatter-1',
    date: '2026-04-26',
    start_time: '12:00',
    end_time: '19:00',
    model: 'Lina',
    model_id: 'model-1',
    platform: 'telegram',
    status: 'scheduled',
    clocked_in: null,
    clocked_out: null,
    created_at: '2026-04-25T10:00:00Z',
    updated_at: '2026-04-25T10:00:00Z',
    chatters: { name: 'נועה', phone: '0500000000' },
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
    ],
    ...overrides,
  };
}

describe('shiftGrouping', () => {
  it('keeps a single assignment as one merged block', () => {
    const blocks = groupShiftBlocks([makeShift()]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].shiftId).toBe('shift-1');
    expect(blocks[0].assignments).toHaveLength(1);
    expect(getMergedShiftAssignmentLabels(blocks[0])).toEqual(['Lina · טלגרם']);
  });

  it('merges multiple assignment rows for the same shift_id into one block', () => {
    const shift = makeShift({
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
    });

    const duplicateRow = makeShift({
      model: 'Maya',
      model_id: 'model-2',
      platform: 'onlyfans',
      shift_assignments: null,
    });

    const blocks = groupShiftBlocks([shift, duplicateRow]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].shifts).toHaveLength(2);
    expect(getMergedShiftAssignmentLabels(blocks[0])).toEqual([
      'Lina · טלגרם',
      'Maya · אונליפאנס',
    ]);
  });

  it('groups the same model across two platforms into one assignment group', () => {
    const shift = makeShift({
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
          model_id: 'model-1',
          model: 'Lina',
          platform: 'onlyfans',
          shift_date: '2026-04-26',
          shift_start_time: '12:00',
          assigned_at: '2026-04-25T10:00:00Z',
        },
      ],
    });

    const [block] = groupShiftBlocks([shift]);

    expect(getMergedShiftAssignmentGroups(block)).toEqual([
      {
        key: 'model-1',
        model_id: 'model-1',
        model: 'Lina',
        platforms: ['telegram', 'onlyfans'],
        platformLabels: ['טלגרם', 'אונליפאנס'],
      },
    ]);
    expect(getMergedShiftAssignmentLabels(block)).toEqual(['Lina · טלגרם, אונליפאנס']);
  });

  it('does not merge two distinct shift_ids in the same chatter window', () => {
    const blocks = groupShiftBlocks([
      makeShift({ id: 'shift-1' }),
      makeShift({ id: 'shift-2' }),
    ]);

    expect(blocks.map((block) => block.shiftId)).toEqual(['shift-1', 'shift-2']);
  });

  it('uses the first shift status as the single source of truth for duplicate rows', () => {
    const blocks = groupShiftBlocks([
      makeShift({ id: 'shift-1', status: 'scheduled' }),
      makeShift({ id: 'shift-1', status: 'missed' }),
    ]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].status).toBe('scheduled');
  });

  it('renders a Hebrew fallback chip for pending shifts without assignments', () => {
    const blocks = groupShiftBlocks([
      makeShift({
        status: 'pending',
        model: null,
        model_id: null,
        platform: null,
        shift_assignments: [],
      }),
    ]);

    expect(getMergedShiftAssignmentLabels(blocks[0])).toEqual(['ללא הקצאה']);
  });

  it('can merge multiple shift_ids for the same chatter window in the shared chatter board', () => {
    const blocks = groupChatterWindowBlocks([
      makeShift({
        id: 'shift-ziv-lina',
        model: 'Lina',
        model_id: 'model-1',
        platform: 'telegram',
        shift_assignments: null,
      }),
      makeShift({
        id: 'shift-ziv-maya',
        model: 'Maya',
        model_id: 'model-2',
        platform: 'onlyfans',
        shift_assignments: null,
      }),
    ]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].shifts.map((shift) => shift.id)).toEqual([
      'shift-ziv-lina',
      'shift-ziv-maya',
    ]);
    expect(getMergedShiftAssignmentLabels(blocks[0])).toEqual([
      'Lina · טלגרם',
      'Maya · אונליפאנס',
    ]);
  });

  it('does not merge two chatters in the same shared board window', () => {
    const blocks = groupChatterWindowBlocks([
      makeShift({ id: 'shift-ziv', chatter_id: 'chatter-ziv' }),
      makeShift({ id: 'shift-dan', chatter_id: 'chatter-dan' }),
    ]);

    expect(blocks).toHaveLength(2);
    expect(blocks.map((block) => block.chatterId)).toEqual(['chatter-ziv', 'chatter-dan']);
  });

  it('keeps morning and evening as distinct shared board blocks for one chatter', () => {
    const blocks = groupChatterWindowBlocks([
      makeShift({ id: 'shift-morning', start_time: '12:00', end_time: '19:00' }),
      makeShift({ id: 'shift-evening', start_time: '19:00', end_time: '02:00' }),
    ]);

    expect(blocks).toHaveLength(2);
    expect(blocks.map((block) => block.key)).toEqual([
      'chatter-1|2026-04-26|12:00|19:00',
      'chatter-1|2026-04-26|19:00|02:00',
    ]);
  });

  it('uses the most urgent status on shared board chatter-window blocks', () => {
    const blocks = groupChatterWindowBlocks([
      makeShift({ id: 'shift-scheduled', status: 'scheduled' }),
      makeShift({ id: 'shift-active', status: 'active' }),
    ]);

    expect(blocks[0].status).toBe('active');
  });
});
