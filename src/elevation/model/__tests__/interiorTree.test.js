import { describe, expect, it } from 'vitest';
import {
  BACK_PANEL_THICKNESS, DADO_BACK_SETBACK, INTERIOR_DIVIDERS, INTERIOR_DIVIDER_LABELS,
  MAX_FACE_SPLIT, STRETCHER_DEPTH, clearSplit, equalizeDividers, getInteriorNode,
  interiorOutline, isInteriorNode, isStoredInterior, removeDivider, setDividerDepth,
  setDividerBanding, setDividerKind, setDividerPosition, splitSection,
  SHELF_NOSINGS, setSectionShelves, setSectionFlag,
  MAX_ROLLOUTS, ROLLOUT_LAYOUTS, isRollouts, setSectionRollouts, setRolloutItem,
  addSectionAccessory, isAccessoryItems, isFaceNode, isSectionAccessories, setFaceDrawerBox, setSectionAccessory,
} from '../index.js';

it('IN13a a anchors 5–6: validates section-only placement and preserves it through edits and splits', () => {
  const item = { accessoryId: 'a', fromBottom: 40 };
  expect(isSectionAccessories([item])).toBe(true);
  expect(isAccessoryItems([item], { placed: true })).toBe(true);
  expect(isAccessoryItems([item])).toBe(false);
  expect(isFaceNode({ type: 'drawer_front', size: null, drawerBox: { accessories: [item] } })).toBe(false);
  const front = { type: 'drawer_front', size: null, drawerBox: { accessories: [{ accessoryId: 'a' }] } };
  expect(isFaceNode(front)).toBe(true);
  expect(setFaceDrawerBox(front, 'r', { accessories: [item] })).toBe(front);
  const start = { accessories: [{ accessoryId: 'a' }] };
  const placed = setSectionAccessory(start, 'r', 0, { fromBottom: 40 });
  expect(placed.accessories).toEqual([item]);
  expect(start.accessories).toEqual([{ accessoryId: 'a' }]);
  expect(isInteriorNode(placed)).toBe(true);
  expect(setSectionAccessory(placed, 'r', 0, { fromBottom: null })).toEqual(start);
  expect(addSectionAccessory(placed, 'r', 'a').accessories).toEqual([{ ...item, qty: 2 }]);
  for (const fromBottom of [0, -1, Infinity, NaN, '40', undefined, null]) {
    expect(isSectionAccessories([{ ...item, fromBottom }])).toBe(false);
    if (fromBottom !== null) expect(setSectionAccessory(placed, 'r', 0, { fromBottom })).toBe(placed);
  }
  const split = splitSection(placed, 'r', 'vertical', 2);
  expect(split.children[0].accessories).toEqual([item]);
  expect(split.children[0].accessories[0]).not.toBe(placed.accessories[0]);
  expect(split.children[1]).not.toHaveProperty('accessories');
  expect(removeDivider(split, 'r', 0)).toEqual(placed);
  split.children[1].accessories = [{ ...item, fromBottom: 60 }];
  expect(removeDivider(split, 'r', 0).accessories).toEqual([{ ...item, qty: 2 }]);
});

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

describe('IN8 section shelf and flag data', () => {
  const group = (children, direction = 'vertical') => ({
    direction, children,
    dividers: Array.from({ length: children.length - 1 }, () => ({
      kind: direction === 'vertical' ? 'fixed' : 'partition',
    })),
  });

  it('anchor 1: validates section picks, count boundaries and group restrictions', () => {
    expect(SHELF_NOSINGS).toEqual(['none', 'hardwood', 'folded']);
    expect(isInteriorNode({ shelves: { count: 0 }, lineBore: true })).toBe(true);
    expect(isInteriorNode({ ...group([{}, {}]), shelves: {} })).toBe(false);
    expect(isInteriorNode({ shelves: { nosing: 'oak' } })).toBe(false);
    for (const nosing of SHELF_NOSINGS) {
      expect(isInteriorNode(group([{ shelves: { count: 20, glass: false, nosing }, hinges: false }, {}])))
        .toBe(true);
    }
    for (const shelves of [
      {}, null, [], { unknown: true }, { glass: 1 }, { glass: null }, { nosing: undefined },
      ...[-1, 21, 1.5, NaN, Infinity, '3', null, undefined].map((count) => ({ count })),
    ]) expect(isInteriorNode({ shelves })).toBe(false);
    for (const key of ['hinges', 'lineBore']) {
      for (const value of [null, undefined, 0, 'false']) expect(isInteriorNode({ [key]: value })).toBe(false);
      expect(isInteriorNode({ ...group([{}, {}]), [key]: false })).toBe(false);
    }
  });

  it('anchor 2: patches and resets shelves without retaining empty objects or dropping explicit defaults', () => {
    const picked = deepFreeze(setSectionShelves({}, 'r', { count: 3 }));
    expect(picked).toEqual({ shelves: { count: 3 } });
    expect(setSectionShelves(picked, 'r', { count: null })).toEqual({});
    const tree = deepFreeze(group([picked, { hinges: false }]));
    const edited = setSectionShelves(tree, 'r.0', { count: 0, glass: false, nosing: 'none' });
    expect(edited.children[0]).toEqual({ shelves: { count: 0, glass: false, nosing: 'none' } });
    expect(edited.children[1]).toBe(tree.children[1]);
    expect(setSectionShelves(edited, 'r.0', { glass: null }).children[0])
      .toEqual({ shelves: { count: 0, nosing: 'none' } });
    for (const patch of [null, [], { count: 21 }, { count: -1 }, { count: 2.5 }, { count: '3' },
      { glass: undefined }, { nosing: 'oak' }, { count: 4, glass: 0 }, { unknown: null }]) {
      expect(setSectionShelves(tree, 'r.0', patch)).toBe(tree);
    }
    for (const path of ['r', 'bad', 'r.8']) expect(setSectionShelves(tree, path, { count: 1 })).toBe(tree);
  });

  it('sets and clears boolean flags only on sections, preserving shelves and the other flag', () => {
    const tree = deepFreeze(group([{ shelves: { count: 2 }, hinges: false }, {}]));
    for (const value of [true, false]) {
      const picked = deepFreeze(setSectionFlag(tree, 'r.0', 'lineBore', value));
      expect(picked.children[0]).toEqual({ shelves: { count: 2 }, hinges: false, lineBore: value });
      expect(setSectionFlag(picked, 'r.0', 'lineBore', null)).toEqual(tree);
      expect(setSectionFlag(picked, 'r.0', 'hinges', null).children[0])
        .toEqual({ shelves: { count: 2 }, lineBore: value });
    }
    expect(setSectionFlag({}, 'r', 'hinges', false)).toEqual({ hinges: false });
    expect(setSectionFlag({ hinges: true }, 'r', 'hinges', null)).toEqual({});
    for (const value of [undefined, 0, 'false']) expect(setSectionFlag(tree, 'r.0', 'hinges', value)).toBe(tree);
    for (const path of ['r', 'bad', 'r.8']) expect(setSectionFlag(tree, path, 'hinges', true)).toBe(tree);
    expect(setSectionFlag(tree, 'r.0', 'unknown', null)).toBe(tree);
  });

  it('anchor 3: copies picks to independent split children and resets count, including flattened splits', () => {
    const section = deepFreeze({ shelves: { count: 2, glass: true }, hinges: false });
    const expected = { shelves: { glass: true }, hinges: false };
    const split = splitSection(section, 'r', 'vertical', 2);
    expect(split.children).toEqual([expected, expected]);
    expect(split.children[0]).not.toBe(split.children[1]);
    expect(split.children[0].shelves).not.toBe(split.children[1].shelves);
    const full = deepFreeze({ shelves: { count: 0, glass: false, nosing: 'folded' }, hinges: true, lineBore: false });
    for (const direction of ['vertical', 'horizontal']) {
      const result = splitSection(group([{}, full, {}]), 'r.1', direction, 2);
      const children = direction === 'vertical' ? result.children.slice(1, 3) : result.children[1].children;
      expect(children).toEqual(Array(2).fill({ shelves: { glass: false, nosing: 'folded' }, hinges: true, lineBore: false }));
      expect(isInteriorNode(result)).toBe(true);
    }
    expect(splitSection({ shelves: { count: 1 } }, 'r', 'vertical', 2).children).toEqual([{}, {}]);
  });

  it('anchor 4: merges customized leaves using first-section picks without count', () => {
    const first = { shelves: { nosing: 'hardwood', count: 1 } };
    const second = { lineBore: false };
    const two = deepFreeze(group([first, second]));
    expect(removeDivider(two, 'r', 0)).toEqual({ shelves: { nosing: 'hardwood' } });
    const three = deepFreeze(group([{}, { ...first, hinges: false, lineBore: true }, second], 'horizontal'));
    const merged = removeDivider(three, 'r', 1);
    expect(merged.children).toEqual([{}, { shelves: { nosing: 'hardwood' }, hinges: false, lineBore: true }]);
    expect(merged.dividers).toEqual([three.dividers[0]]);
    expect(removeDivider(group([{}, second]), 'r', 0)).toEqual({});
    expect(removeDivider(group([{ shelves: { count: 3 } }, second]), 'r', 0)).toEqual({});
    expect(removeDivider(group([two, {}]), 'r.0', 0).children[0]).toEqual({ shelves: { nosing: 'hardwood' } });
    expect(removeDivider(group([two, {}]), 'r', 0)).toEqual(group([two, {}]));
  });
});

describe('IN9 roll-out data', () => {
  const group = (children, direction = 'vertical') => ({
    direction, children,
    dividers: Array.from({ length: children.length - 1 }, () => ({
      kind: direction === 'vertical' ? 'fixed' : 'partition',
    })),
  });
  const section = deepFreeze({
    rollouts: { count: 2, items: [{ at: 1 }, { height: 6 }] }, shelves: { glass: true },
  });

  it('anchor 1: validates roll-outs only on sections, including count and layout boundaries', () => {
    expect(ROLLOUT_LAYOUTS).toEqual(['stack', 'pair']);
    expect(MAX_ROLLOUTS).toBe(8);
    expect(isInteriorNode({ rollouts: { count: 2, items: [{}, { at: 10, slideId: 'accuride-3832' }] } }))
      .toBe(true);
    expect(isInteriorNode({ rollouts: { count: 1, items: [{}, {}] } })).toBe(false);
    expect(isInteriorNode({ rollouts: { count: 2, layout: 'side' } })).toBe(false);
    expect(isInteriorNode({ rollouts: { count: 0 } })).toBe(false);
    for (const layout of ROLLOUT_LAYOUTS) {
      // Geometry decides whether a pair is usable, so count 1 remains valid stored data.
      expect(isRollouts({ count: 1, layout })).toBe(true);
      expect(isStoredInterior(group([{ rollouts: { count: 8, layout, items: [{ height: 1000, depth: 1000, at: 0 }] } }, {}])))
        .toBe(true);
    }
    expect(isRollouts({ count: 2, items: [] })).toBe(true);
    expect(isInteriorNode({ ...group([{}, {}]), rollouts: { count: 2 } })).toBe(false);
  });

  it('rejects malformed objects, unknown fields, sparse items and invalid item dimensions', () => {
    for (const value of [
      null, [], new Date(), {}, { items: [] }, { count: 1, extra: true },
      { count: 1, [Symbol('extra')]: true }, Object.create({ count: 1 }),
      ...[0, -1, 9, 1.5, NaN, Infinity, '2', null, undefined].map((count) => ({ count })),
      ...[null, undefined, '', 1].map((layout) => ({ count: 2, layout })),
      ...[null, undefined, {}, [null], [undefined], Array(1), [{ extra: 1 }],
        [{ [Symbol('extra')]: 1 }], [new Date()], [Object.create({ height: 6 })]]
        .map((items) => ({ count: 2, items })),
      ...['height', 'depth', 'at'].flatMap((key) =>
        [-1, NaN, Infinity, -Infinity, '6', null, undefined, ...(key === 'at' ? [] : [0])]
          .map((value) => ({ count: 1, items: [{ [key]: value }] }))),
      ...['', null, undefined, 1].map((slideId) => ({ count: 1, items: [{ slideId }] })),
    ]) {
      expect(isRollouts(value)).toBe(false);
      expect(isStoredInterior({ rollouts: value })).toBe(false);
    }
  });

  it('anchor 2: pads automatic items and removes trailing empty items after a reset', () => {
    const added = deepFreeze(setSectionRollouts({}, 'r', { count: 2 }));
    expect(added).toEqual({ rollouts: { count: 2 } });
    const typed = deepFreeze(setRolloutItem(added, 'r', 1, { height: 6 }));
    expect(typed).toEqual({ rollouts: { count: 2, items: [{}, { height: 6 }] } });
    expect(setRolloutItem(typed, 'r', 1, { height: null })).toEqual(added);
    const picks = deepFreeze(setRolloutItem(typed, 'r', 0, { at: 0, depth: 18, slideId: 'x' }));
    expect(setRolloutItem(picks, 'r', 0, { depth: null }).rollouts.items)
      .toEqual([{ at: 0, slideId: 'x' }, { height: 6 }]);
    expect(setRolloutItem(picks, 'r', 0, { at: null, depth: null, slideId: null })).toEqual(typed);
  });

  it('anchor 3: truncates items when lowering count, removes roll-outs and resets layout', () => {
    const three = deepFreeze({ rollouts: { count: 3, items: [{}, {}, { depth: 18 }] } });
    const two = deepFreeze(setSectionRollouts(three, 'r', { count: 2 }));
    expect(two).toEqual({ rollouts: { count: 2 } });
    expect(setSectionRollouts(two, 'r', { count: 0 })).toEqual({});
    expect(setSectionRollouts(two, 'r', { count: null })).toEqual({});
    const pair = deepFreeze(setSectionRollouts(three, 'r', { layout: 'pair' }));
    expect(pair.rollouts).toEqual({ ...three.rollouts, layout: 'pair' });
    expect(setSectionRollouts(pair, 'r', { layout: null })).toEqual(three);
    expect(setSectionRollouts(pair, 'r', { count: 8, layout: 'stack' }).rollouts)
      .toEqual({ count: 8, layout: 'stack', items: three.rollouts.items });
  });

  it('ignores invalid patches, invalid indices, group paths and sections without roll-outs', () => {
    const tree = deepFreeze(group([section, {}]));
    for (const patch of [null, [], { extra: null }, { items: [] }, { count: 2, layout: 'side' },
      { count: -1 }, { count: 9 }, { count: 1.5 }, { count: '2' }, { count: NaN },
      { count: Infinity }, { count: undefined }, { layout: undefined }, { layout: 1 },
      { [Symbol('extra')]: true }]) {
      expect(setSectionRollouts(tree, 'r.0', patch)).toBe(tree);
    }
    for (const patch of [null, [], { unknown: null }, { count: 1 }, { height: 0 }, { depth: -1 },
      { at: -1 }, { at: Infinity }, { height: NaN }, { height: '6' }, { height: undefined },
      { slideId: '' }, { slideId: 1 }, { height: 6, depth: 0 }, { [Symbol('extra')]: null }]) {
      expect(setRolloutItem(tree, 'r.0', 0, patch)).toBe(tree);
    }
    for (const index of [-1, 2, 0.5, '0', NaN, Infinity, null, undefined]) {
      expect(setRolloutItem(tree, 'r.0', index, { height: 6 })).toBe(tree);
    }
    for (const path of ['r', 'r.8', 'bad', null]) {
      expect(setSectionRollouts(tree, path, { count: 2 })).toBe(tree);
      expect(setRolloutItem(tree, path, 0, { height: 6 })).toBe(tree);
    }
    expect(setRolloutItem(tree, 'r.1', 0, { height: 6 })).toBe(tree);
    expect(setSectionRollouts(tree, 'r.1', { layout: 'pair' })).toBe(tree);
    for (const absent of [null, undefined]) {
      expect(setSectionRollouts(absent, 'r', { count: 1 })).toEqual({ rollouts: { count: 1 } });
      expect(setRolloutItem(absent, 'r', 0, { height: 6 })).toEqual({});
    }
  });

  it('edits nested leaves immutably while preserving other section picks and item overrides', () => {
    const leaf = { ...section, hinges: false, lineBore: true };
    const tree = deepFreeze(group([{}, group([leaf, {}], 'horizontal')]));
    const edited = setRolloutItem(tree, 'r.1.0', 1, { depth: 21, slideId: 'x' });
    expect(edited.children[1].children[0]).toEqual({
      ...leaf, rollouts: { count: 2, items: [{ at: 1 }, { height: 6, depth: 21, slideId: 'x' }] },
    });
    expect(edited.children[0]).toBe(tree.children[0]);
    expect(edited.children[1].children[1]).toBe(tree.children[1].children[1]);
    expect(edited.children[1].children[0].rollouts.items[0]).toBe(leaf.rollouts.items[0]);
    expect(setSectionRollouts(tree, 'r.1.0', { count: null }).children[1].children[0])
      .toEqual({ shelves: { glass: true }, hinges: false, lineBore: true });
    expect(isStoredInterior(edited)).toBe(true);
  });

  it('anchor 4: vertical splits retain roll-outs only in the bottom section and clear positions', () => {
    const result = splitSection(section, 'r', 'vertical', 2);
    expect(result.children).toEqual([
      { shelves: { glass: true } },
      { shelves: { glass: true }, rollouts: { count: 2, items: [{}, { height: 6 }] } },
    ]);
    expect(result.children[1].rollouts.items[1]).not.toBe(section.rollouts.items[1]);
    expect(isStoredInterior(result)).toBe(true);
  });

  it('anchor 5: horizontal splits remove roll-outs from every new section', () => {
    expect(splitSection(section, 'r', 'horizontal', 2).children)
      .toEqual([{ shelves: { glass: true } }, { shelves: { glass: true } }]);
  });

  it('anchor 6: merges prefer first-section roll-outs, falling back to second and clearing positions', () => {
    expect(removeDivider(group([{}, { rollouts: { count: 1, items: [{ at: 3 }] } }]), 'r', 0))
      .toEqual({ rollouts: { count: 1 } });
    const first = { shelves: { count: 2, glass: false }, hinges: false, lineBore: true };
    const second = { ...section, hinges: true };
    for (const direction of ['vertical', 'horizontal']) {
      expect(removeDivider(group([first, second], direction), 'r', 0)).toEqual({
        shelves: { glass: false }, hinges: false, lineBore: true,
        rollouts: { count: 2, items: [{}, { height: 6 }] },
      });
      expect(removeDivider(group([second, { rollouts: { count: 1 } }], direction), 'r', 0))
        .toEqual({ shelves: { glass: true }, hinges: true, rollouts: { count: 2, items: [{}, { height: 6 }] } });
    }
  });

  it('carries roll-outs through flattened splits and nested multi-section merges without changing neighbors', () => {
    for (const direction of ['vertical', 'horizontal']) {
      const tree = deepFreeze(group([{}, section, {}], direction));
      const result = splitSection(tree, 'r.1', direction, 3);
      expect(result.children.map(({ rollouts }) => rollouts)).toEqual(direction === 'vertical'
        ? [undefined, undefined, undefined, { count: 2, items: [{}, { height: 6 }] }, undefined]
        : Array(5).fill(undefined));
      expect(result.children[0]).toBe(tree.children[0]);
      expect(result.children[4]).toBe(tree.children[2]);
      const merged = removeDivider(deepFreeze(group([tree, {}])), 'r.0', 0);
      expect(merged.children[0].children).toEqual([
        { rollouts: { count: 2, items: [{}, { height: 6 }] } }, {},
      ]);
      expect(merged.children[0].dividers).toEqual([tree.dividers[1]]);
      expect(isStoredInterior(merged)).toBe(true);
    }
  });
});
