import { describe, expect, it } from 'vitest';
import type { ShiftSlot } from '../types';
import { buildGroupedAvailableSlots } from '../slotAvailability';

function makeSlot(overrides: Partial<ShiftSlot> = {}): ShiftSlot {
  return {
    id: 'slot-saturday-evening',
    date: '2026-05-09',
    shift_type: 'evening',
    model: null,
    platform: null,
    max_chatters: 1,
    status: 'open',
    created_at: '2026-05-02T10:00:00Z',
    ...overrides,
  };
}

describe('slotAvailability', () => {
  it('keeps an existing Saturday evening slot visible when the RPC omits it', () => {
    const slots = buildGroupedAvailableSlots({
      availabilityRows: [],
      slotRows: [makeSlot()],
      chatterShiftRows: [],
      occupancyRows: [],
    });

    expect(slots).toEqual([
      {
        key: '2026-05-09|evening',
        date: '2026-05-09',
        shift_type: 'evening',
        total_capacity: 1,
        occupied: 0,
        is_full: false,
        chatter_signed_up: false,
        signup_slot_id: 'slot-saturday-evening',
        queue_slot_id: 'slot-saturday-evening',
      },
    ]);
  });

  it('uses live shift occupancy for fallback slots', () => {
    const slots = buildGroupedAvailableSlots({
      availabilityRows: [],
      slotRows: [makeSlot({ max_chatters: 2 })],
      chatterShiftRows: [],
      occupancyRows: [
        { date: '2026-05-09', start_time: '19:00' },
        { date: '2026-05-09', start_time: '19:00' },
      ],
    });

    expect(slots[0].occupied).toBe(2);
    expect(slots[0].is_full).toBe(true);
    expect(slots[0].signup_slot_id).toBe('slot-saturday-evening');
  });

  it('marks a chatter as signed up when they already have a pending row in the slot', () => {
    const slots = buildGroupedAvailableSlots({
      availabilityRows: [],
      slotRows: [makeSlot()],
      chatterShiftRows: [{ date: '2026-05-09', start_time: '19:00' }],
      occupancyRows: [],
    });

    expect(slots[0].chatter_signed_up).toBe(true);
  });
});
