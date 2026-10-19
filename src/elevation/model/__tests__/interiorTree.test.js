import { describe, expect, it } from 'vitest';
import {
  BACK_PANEL_THICKNESS, DADO_BACK_SETBACK, INTERIOR_DIVIDERS, INTERIOR_DIVIDER_LABELS,
  MAX_FACE_SPLIT, STRETCHER_DEPTH, clearSplit, equalizeDividers, getInteriorNode,
  interiorOutline, isInteriorNode, isStoredInterior, removeDivider, setDividerDepth,
  setDividerBanding, setDividerKind, setDividerPosition, splitSection,
} from '../index.js';

describe('IN2 stored interior tree', () => {
  const vertical = () => ({
    direction: 'vertical', children: [{}, {}], dividers: [{ kind: 'fixed', at: 36 }],
  });

  it('accepts stored sections and recursive groups (anchors 1 and 3)', () => {
    expect(isInteriorNode({})).toBe(true);
    expect(isStoredInterior({})).toBe(true);
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

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe('IN7 divider data', () => {
  const group = (divider, direction = 'vertical') => deepFreeze({
    direction, children: [{}, {}], dividers: [divider],
  });

  it('anchor 1: accepts seam links, typed linked positions and shelf banding', () => {
    for (const divider of [
      { kind: 'fixed', seam: 'r:0' },
      { kind: 'fixed', seam: 'r.1:2', at: 30 },
      { kind: 'double_fixed', banding: false },
      { kind: 'fixed', seam: 'r.1.2:10', banding: true },
    ]) expect(isStoredInterior(group(divider))).toBe(true);
    expect(isStoredInterior(group({ kind: 'partition', seam: 'r.0:2' }, 'horizontal'))).toBe(true);
  });

  it('anchor 2: restricts pair seams and banding and rejects malformed fields', () => {
    expect(isStoredInterior(group({ kind: 'fixed', seam: 'r:pair' }))).toBe(false);
    expect(isStoredInterior(group({ kind: 'partition', seam: 'r:pair' }, 'horizontal'))).toBe(true);
    for (const kind of ['partition', 'double_partition', 'stretcher']) {
      const direction = kind === 'stretcher' ? 'vertical' : 'horizontal';
      for (const banding of [true, false]) expect(isStoredInterior(group({ kind, banding }, direction))).toBe(false);
    }
    for (const seam of ['x', 'r:', 'r:0:1', 'r.-1:0', 'r:pairx', 'r:0\n', 0, null, undefined]) {
      expect(isStoredInterior(group({ kind: 'fixed', seam }))).toBe(false);
    }
    for (const banding of [0, 'false', null, undefined]) {
      expect(isStoredInterior(group({ kind: 'fixed', banding }))).toBe(false);
    }
  });

  it('anchor 5: keeps seam links through position, depth and equalize edits', () => {
    const linked = group({ kind: 'fixed', seam: 'r:0' });
    const positioned = setDividerPosition(linked, 'r', 0, 30);
    expect(positioned.dividers[0]).toEqual({ kind: 'fixed', seam: 'r:0', at: 30 });
    expect(setDividerPosition(positioned, 'r', 0, null)).toEqual(linked);
    expect(equalizeDividers(positioned, 'r')).toEqual(linked);
    expect(setDividerDepth(linked, 'r', 0, 10).dividers[0]).toEqual({ kind: 'fixed', seam: 'r:0', depth: 10 });
    const pair = group({ kind: 'partition', seam: 'r:pair' }, 'horizontal');
    const right = setDividerPosition(pair, 'r', 0, 12, 'right');
    expect(setDividerPosition(right, 'r', 0, null)).toEqual(pair);
    expect(equalizeDividers(right, 'r')).toEqual(pair);
  });

  it('anchor 6: drops banding for stretchers and preserves links and other overrides', () => {
    expect(setDividerKind(group({ kind: 'fixed', banding: false }), 'r', 0, 'stretcher').dividers[0])
      .toEqual({ kind: 'stretcher' });
    const linked = group({ kind: 'fixed', seam: 'r:0', banding: true, at: 30, depth: 10 });
    expect(setDividerKind(linked, 'r', 0, 'double_fixed').dividers[0])
      .toEqual({ ...linked.dividers[0], kind: 'double_fixed' });
    expect(setDividerKind(linked, 'r', 0, 'stretcher').dividers[0])
      .toEqual({ kind: 'stretcher', seam: 'r:0', at: 30, depth: 10 });
  });

  it('sets explicit shelf banding picks and resets them without losing other fields', () => {
    for (const kind of ['fixed', 'double_fixed']) {
      const tree = group({ kind, seam: 'r:0', at: 30, depth: 10 });
      for (const value of [true, false]) {
        const picked = deepFreeze(setDividerBanding(tree, 'r', 0, value));
        expect(picked.dividers[0]).toEqual({ ...tree.dividers[0], banding: value });
        expect(setDividerBanding(picked, 'r', 0, value)).toBe(picked);
        expect(setDividerBanding(picked, 'r', 0, null)).toEqual(tree);
      }
      expect(setDividerBanding(tree, 'r', 0, null)).toBe(tree);
      for (const value of [undefined, 0, 'false']) expect(setDividerBanding(tree, 'r', 0, value)).toBe(tree);
      expect(setDividerBanding(tree, 'r.2', 0, true)).toBe(tree);
      expect(setDividerBanding(tree, 'r', 1, true)).toBe(tree);
      const nested = deepFreeze({ ...tree, children: [tree, {}] });
      expect(setDividerBanding(nested, 'r.0', 0, false).children[0].dividers[0].banding).toBe(false);
    }
    for (const [kind, direction] of [['stretcher', 'vertical'], ['partition', 'horizontal'], ['double_partition', 'horizontal']]) {
      const tree = group({ kind }, direction);
      for (const value of [true, false, null]) expect(setDividerBanding(tree, 'r', 0, value)).toBe(tree);
    }
  });

  it('anchor 3: returns stored empty sections when collapsing or editing an absent tree', () => {
    const tree = group({ kind: 'fixed' });
    expect(removeDivider(tree, 'r', 0)).toEqual({});
    expect(clearSplit(tree, 'r')).toEqual({});
    expect(isStoredInterior({})).toBe(true);
    for (const absent of [null, undefined]) {
      for (const result of [
        splitSection(absent, 'bad', 'vertical', 2), removeDivider(absent, 'r', 0),
        clearSplit(absent, 'r'), equalizeDividers(absent, 'r'),
        setDividerPosition(absent, 'r', 0, null), setDividerPosition(absent, 'r', 0, -1),
        setDividerKind(absent, 'r', 0, 'fixed'), setDividerDepth(absent, 'r', 0, null),
        setDividerDepth(absent, 'r', 0, -1), setDividerBanding(absent, 'r', 0, true),
        setDividerBanding(absent, 'r', 0, 'invalid'),
      ]) expect(result).toEqual({});
    }
  });
});

describe('IN2 interior tree edits', () => {
  const two = deepFreeze({
    direction: 'vertical', children: [{}, {}], dividers: [{ kind: 'fixed' }],
  });
  const nested = deepFreeze({
    ...two,
    children: [{ direction: 'horizontal', children: [{}, {}], dividers: [{ kind: 'partition' }] }, {}],
  });

  it('looks up nodes and lists the implicit root and nested sections in pre-order', () => {
    for (const absent of [null, undefined]) {
      expect(getInteriorNode(absent, 'r')).toEqual({});
      expect(getInteriorNode(absent, 'r.0')).toBeNull();
      expect(interiorOutline(absent)).toEqual([{ path: 'r', depth: 0, node: {} }]);
    }
    const rows = interiorOutline(nested);
    expect(rows.map(({ path, depth }) => [path, depth])).toEqual([
      ['r', 0], ['r.0', 1], ['r.0.0', 2], ['r.0.1', 2], ['r.1', 1],
    ]);
    for (const row of rows) expect(getInteriorNode(nested, row.path)).toBe(row.node);
    for (const path of ['r.2', 'r.1.0', 'x', '', 'r.', 'r.-1', 'r.0.5', 'r.01', null]) {
      expect(getInteriorNode(nested, path)).toBeNull();
    }
  });

  it('anchors 1 and 2: splits an absent root and nests a perpendicular split', () => {
    for (const absent of [null, undefined]) expect(splitSection(absent, 'r', 'vertical', 2)).toEqual(two);
    expect(splitSection(two, 'r.0', 'horizontal', 2)).toEqual(nested);
    const deep = splitSection(nested, 'r.0.1', 'vertical', 2, 'stretcher');
    expect(getInteriorNode(deep, 'r.0.1')).toEqual({
      direction: 'vertical', children: [{}, {}], dividers: [{ kind: 'stretcher' }],
    });
    expect(isStoredInterior(deep)).toBe(true);
  });

  it('anchor 3: flattens same-direction splits and preserves existing seams on both sides', () => {
    const manual = deepFreeze({ ...two, dividers: [{ kind: 'fixed', at: 36 }] });
    expect(splitSection(manual, 'r.1', 'vertical', 3, 'stretcher')).toEqual({
      direction: 'vertical', children: [{}, {}, {}, {}],
      dividers: [{ kind: 'fixed', at: 36 }, { kind: 'stretcher' }, { kind: 'stretcher' }],
    });
    const three = deepFreeze({
      direction: 'vertical', children: [{}, {}, {}],
      dividers: [{ kind: 'fixed', at: 36 }, { kind: 'double_fixed', at: 12, depth: 10 }],
    });
    for (const index of [0, 1, 2]) {
      const result = splitSection(three, `r.${index}`, 'vertical', 2, 'stretcher');
      expect(result.children).toEqual([{}, {}, {}, {}]);
      expect(result.dividers).toEqual([
        ...three.dividers.slice(0, index), { kind: 'stretcher' }, ...three.dividers.slice(index),
      ]);
      expect(isStoredInterior(result)).toBe(true);
    }
  });

  it('anchors 4 and 5: removes only seams between sections and collapses the last split', () => {
    expect(removeDivider(nested, 'r', 0)).toBe(nested);
    expect(removeDivider(nested, 'r.0', 0)).toEqual(two);
    expect(removeDivider(two, 'r', 0)).toEqual({});
    const three = deepFreeze({
      direction: 'vertical', children: [{}, {}, {}],
      dividers: [{ kind: 'fixed', at: 36 }, { kind: 'stretcher', depth: 5 }],
    });
    expect(removeDivider(three, 'r', 0)).toEqual({ ...two, dividers: [{ kind: 'stretcher', depth: 5 }] });
    expect(removeDivider(three, 'r', 1)).toEqual({ ...two, dividers: [{ kind: 'fixed', at: 36 }] });
    const groupOnRight = deepFreeze({ ...nested, children: [...nested.children].reverse() });
    expect(removeDivider(groupOnRight, 'r', 0)).toBe(groupOnRight);
  });

  it('anchor 6: positions partitions from either side, rejects shelf origins and clears auto positions', () => {
    const right = deepFreeze(setDividerPosition(nested, 'r.0', 0, 12, 'right'));
    expect(right.children[0].dividers[0]).toEqual({ kind: 'partition', at: 12, from: 'right' });
    expect(setDividerPosition(right, 'r', 0, 30, 'right')).toBe(right);
    expect(setDividerPosition(right, 'r.0', 0, 12, 'right')).toBe(right);
    expect(setDividerPosition(right, 'r.0', 0, 12, 'left').children[0].dividers[0])
      .toEqual({ kind: 'partition', at: 12 });
    expect(setDividerPosition(right, 'r.0', 0, 12).children[0].dividers[0])
      .toEqual({ kind: 'partition', at: 12 });
    expect(setDividerPosition(right, 'r.0', 0, null)).toEqual(nested);
    const depth = deepFreeze(setDividerDepth(right, 'r.0', 0, 1000));
    expect(setDividerPosition(depth, 'r.0', 0, null).children[0].dividers[0])
      .toEqual({ kind: 'partition', depth: 1000 });
    expect(setDividerPosition(two, 'r', 0, 30).dividers[0]).toEqual({ kind: 'fixed', at: 30 });
    const manual = setDividerPosition(splitSection(null, 'r', 'vertical', 3), 'r', 0, 1);
    expect(setDividerPosition(manual, 'r', 1, 1000).dividers)
      .toEqual([{ kind: 'fixed', at: 1 }, { kind: 'fixed', at: 1000 }]);
    for (const at of [0, -1, NaN, Infinity, '12', undefined]) {
      expect(setDividerPosition(right, 'r.0', 0, at)).toBe(right);
    }
    for (const from of ['top', null, '']) expect(setDividerPosition(right, 'r.0', 0, 12, from)).toBe(right);
    expect(setDividerPosition(two, 'r', 0, 30, 'left')).toBe(two);
  });

  it('anchor 7: changes kind only within its family and keeps position and depth', () => {
    expect(setDividerKind(two, 'r', 0, 'partition')).toBe(two);
    expect(setDividerKind(two, 'r', 0, 'double_fixed').dividers[0]).toEqual({ kind: 'double_fixed' });
    expect(setDividerKind(two, 'r', 0, 'fixed')).toBe(two);
    const right = deepFreeze({
      direction: 'horizontal', children: [{}, {}],
      dividers: [{ kind: 'partition', at: 12, from: 'right', depth: 10 }],
    });
    expect(setDividerKind(right, 'r', 0, 'double_partition').dividers[0])
      .toEqual({ kind: 'double_partition', at: 12, from: 'right', depth: 10 });
    for (const kind of ['stretcher', 'fixed', null, 'unknown']) expect(setDividerKind(right, 'r', 0, kind)).toBe(right);
    const manual = deepFreeze({ ...two, dividers: [{ kind: 'fixed', at: 30, depth: 20 }] });
    expect(setDividerKind(manual, 'r', 0, 'stretcher').dividers[0])
      .toEqual({ kind: 'stretcher', at: 30, depth: 20 });
  });

  it('sets and clears depth without changing other fields or clamping large depths', () => {
    const manual = deepFreeze(setDividerPosition(nested, 'r.0', 0, 12, 'right'));
    const result = deepFreeze(setDividerDepth(manual, 'r.0', 0, 1000));
    expect(result.children[0].dividers[0]).toEqual({ kind: 'partition', at: 12, from: 'right', depth: 1000 });
    expect(setDividerDepth(result, 'r.0', 0, 1000)).toBe(result);
    expect(setDividerDepth(result, 'r.0', 0, null)).toEqual(manual);
    expect(setDividerDepth(two, 'r', 0, null)).toBe(two);
    for (const depth of [0, -1, NaN, Infinity, '12', undefined]) {
      expect(setDividerDepth(result, 'r.0', 0, depth)).toBe(result);
    }
  });

  it('equalizes only the selected group and clears nested or root splits', () => {
    const manual = deepFreeze({
      direction: 'horizontal', children: [nested, {}, {}],
      dividers: [{ kind: 'partition', at: 12, from: 'right', depth: 10 }, { kind: 'double_partition', at: 20 }],
    });
    const equal = deepFreeze(equalizeDividers(manual, 'r'));
    expect(equal).toEqual({ ...manual, dividers: [{ kind: 'partition', depth: 10 }, { kind: 'double_partition' }] });
    expect(equal.children[0]).toEqual(nested);
    expect(equalizeDividers(equal, 'r')).toBe(equal);
    expect(clearSplit(nested, 'r.0')).toEqual(two);
    expect(clearSplit(manual, 'r.0')).toEqual({ ...manual, children: [{}, {}, {}] });
    expect(clearSplit(manual, 'r')).toEqual({});
    expect(clearSplit(two, 'r.0')).toBe(two);
  });

  it('keeps invalid edits unchanged and limits groups to 2–8 children', () => {
    expect(splitSection(null, 'r', 'vertical', 1)).toEqual(two);
    expect(splitSection(null, 'r', 'vertical', 2.6).children).toHaveLength(3);
    const eight = deepFreeze(splitSection(null, 'r', 'horizontal', 100));
    expect(eight.children).toHaveLength(MAX_FACE_SPLIT);
    expect(isStoredInterior(eight)).toBe(true);
    expect(splitSection(eight, 'r.0', 'horizontal', 2)).toBe(eight);
    expect(splitSection(two, 'r.0', 'vertical', 7).children).toHaveLength(MAX_FACE_SPLIT);
    expect(splitSection(two, 'r', 'vertical', 2)).toBe(two);
    expect(splitSection(two, 'r.0', 'diagonal', 2)).toBe(two);
    expect(splitSection(two, 'r.0', 'vertical', NaN)).toBe(two);
    expect(splitSection(two, 'r.0', 'vertical', 2, 'partition')).toBe(two);
    for (const path of ['r.9', 'r.0.0', 'bad', null]) {
      expect(splitSection(two, path, 'vertical', 2)).toBe(two);
      expect(clearSplit(two, path)).toBe(two);
      expect(equalizeDividers(two, path)).toBe(two);
    }
    for (const tree of [two, null, undefined]) {
      for (const path of ['r', 'r.0', 'r.9']) {
        for (const index of [-1, 0, 1, 0.5, '0', NaN]) {
          if (tree === two && path === 'r' && index === 0) continue;
          for (const result of [
            removeDivider(tree, path, index), setDividerKind(tree, path, index, 'stretcher'),
            setDividerPosition(tree, path, index, 12), setDividerDepth(tree, path, index, 10),
          ]) {
            if (tree) expect(result).toBe(tree);
            else expect(result).toEqual({});
          }
        }
      }
    }
    for (const tree of [null, undefined]) {
      expect(clearSplit(tree, 'r')).toEqual({});
      expect(equalizeDividers(tree, 'r')).toEqual({});
    }
  });
});
