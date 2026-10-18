import { describe, expect, it } from 'vitest';
import {
  BACK_PANEL_THICKNESS, DADO_BACK_SETBACK, INTERIOR_DIVIDERS, INTERIOR_DIVIDER_LABELS,
  MAX_FACE_SPLIT, STRETCHER_DEPTH, isInteriorNode, isStoredInterior,
} from '../index.js';

describe('IN2 stored interior tree', () => {
  const vertical = () => ({
    direction: 'vertical', children: [{}, {}], dividers: [{ kind: 'fixed', at: 36 }],
  });

  it('accepts sections and recursive groups, storing only groups (anchors 1 and 3)', () => {
    expect(isInteriorNode({})).toBe(true);
    expect(isStoredInterior({})).toBe(false);
    expect(isStoredInterior(vertical())).toBe(true);
    expect(isStoredInterior({
      direction: 'horizontal', children: [vertical(), {}],
      dividers: [{ kind: 'double_partition', at: 12, from: 'right', depth: 10 }],
    })).toBe(true);
    for (const [direction, kinds] of Object.entries(INTERIOR_DIVIDERS)) {
      for (const kind of kinds) {
        expect(isStoredInterior({ direction, children: [{}, {}], dividers: [{ kind }] })).toBe(true);
        expect(INTERIOR_DIVIDER_LABELS[kind]).toBeTypeOf('string');
      }
    }
    expect([STRETCHER_DEPTH, DADO_BACK_SETBACK, BACK_PANEL_THICKNESS]).toEqual([4, 0.75, 0.25]);
    expect(isStoredInterior({
      direction: 'vertical', children: Array.from({ length: MAX_FACE_SPLIT }, () => ({})),
      dividers: Array.from({ length: MAX_FACE_SPLIT - 1 }, () => ({ kind: 'fixed' })),
    })).toBe(true);
    // Positions/depths remain as typed; geometric warnings belong to later steps.
    expect(isStoredInterior({
      direction: 'vertical', children: [{}, {}, {}],
      dividers: [{ kind: 'fixed', at: 1000, depth: 1000 }, { kind: 'stretcher', at: 1 }],
    })).toBe(true);
  });

  it('rejects wrong families, seams, fields and nonpositive dimensions (anchor 2)', () => {
    for (const node of [null, [], 1, 'section', new Date(), { fill: 'shelves' }]) {
      expect(isInteriorNode(node)).toBe(false);
      expect(isStoredInterior(node)).toBe(false);
    }
    for (const dividers of [
      [{ kind: 'partition' }], [], [{ kind: 'fixed', from: 'right', at: 3 }],
      [{ kind: 'unknown' }], [null], [{}], [{ kind: 'fixed', extra: true }],
      ...[0, -1, Infinity, NaN, '12', null, undefined].flatMap((value) => [
        [{ kind: 'fixed', at: value }], [{ kind: 'fixed', depth: value }],
      ]),
    ]) expect(isStoredInterior({ ...vertical(), dividers })).toBe(false);
    for (const patch of [
      { direction: 'diagonal' }, { children: [{}] }, { children: [{}, null] },
      { children: [vertical(), { unknown: true }] }, { children: Array(2) },
      { dividers: Array(1) }, { extra: true }, { dividers: undefined },
      { children: Array.from({ length: MAX_FACE_SPLIT + 1 }, () => ({})),
        dividers: Array.from({ length: MAX_FACE_SPLIT }, () => ({ kind: 'fixed' })) },
    ]) expect(isStoredInterior({ ...vertical(), ...patch })).toBe(false);
    for (const divider of [
      { kind: 'fixed' }, { kind: 'partition', from: 'right' },
      { kind: 'partition', at: 12, from: 'left' }, { kind: 'partition', at: 12, from: null },
    ]) {
      expect(isStoredInterior({ direction: 'horizontal', children: [{}, {}], dividers: [divider] })).toBe(false);
    }
  });
});
