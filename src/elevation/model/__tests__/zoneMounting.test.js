import { describe, expect, it } from 'vitest';
import { auto, room, run, wall } from '../../../test/builders.js';
import {
  DEFAULT_SETTINGS, BUILT_IN_SLIDES, isInteriorNode, newAccessory, pairSeam,
  removeDivider, setDividerGap, setDividerKind, setDividerPosition, splitSection, splitSinkRollouts,
} from '../index.js';
import { wallInteriorData } from '../shelves.js';

const rod = { ...newAccessory([], 'rod'), size: { width: 'section', height: 1, depth: 1 } };
const fixed = { ...newAccessory([], 'fixed'), size: { width: 8, height: 1, depth: 1 } };
const settings = { ...DEFAULT_SETTINGS, slides: BUILT_IN_SLIDES, drawerSlideId: 'blum-562h',
  accessories: [rod, fixed] };
const door = { type: 'pair_door', size: null };

function resolve(interior, { purpose, face = door, width = 36, x = 24, z = 40, zoneGap = settings.zoneGap } = {}) {
  const cabinet = { ...auto('c'), face, interior, ...(purpose ? { purpose } : {}) };
  const r = run({ width, x, z, items: [cabinet], autoCount: false,
    ends: { left: { type: 'none' }, right: { type: 'none' } } });
  const w = wall({ runs: [r] });
  const data = wallInteriorData(room({ walls: [w] }), w, 'front', { ...settings, zoneGap });
  return Object.fromEntries(Object.entries(data).map(([key, entries]) => [key, entries.get('c')]));
}

const codes = (warnings) => warnings.map(({ code }) => code);

describe('sink zone gaps (IN15e)', () => {
  it.each([
    [0, 1, 17.25, 15.5],
    [2, 1, 16.25, 14.5],
    [null, 0.5, 17, 15.25],
  ])('gap %s with setting %s leaves section width %s and roll-out width %s', (gap, zoneGap, clear, width) => {
    const tree = setDividerGap(splitSinkRollouts({}, 'r', 'r:pair'), 'r', 0, gap);
    const data = resolve(tree, { purpose: 'sink', zoneGap });
    expect(data.interiors.dividers[0]).toMatchObject({ fromLeft: 18, linked: true,
      gap: gap ?? zoneGap, gapAuto: gap === null, width: gap ?? zoneGap });
    expect(data.interiors.sections.map(({ width }) => width)).toEqual([clear, clear]);
    expect([...data.rollouts.values()].map(({ rollouts }) => rollouts[0].width)).toEqual([width, width]);
  });
});

describe('zones and mounting (IN15d)', () => {
  it('splits a Euro sink at the linked pair seam into two 15 inch roll-outs with the default zone gap without warnings', () => {
    const tree = splitSinkRollouts({}, 'r', 'r:pair');
    expect(tree).toEqual({ direction: 'horizontal', dividers: [{ kind: 'zone', seam: 'r:pair' }],
      children: [{ rollouts: { count: 1 } }, { rollouts: { count: 1 } }] });
    expect(isInteriorNode(tree)).toBe(true);
    const data = resolve(tree, { purpose: 'sink' });
    expect(data.interiors.dividers[0]).toMatchObject({ fromLeft: 18, seam: 'r:pair', linked: true, gap: 1, gapAuto: true, width: 1 });
    expect(data.interiors.sections.map(({ x, width }) => [x - 24, width]))
      .toEqual([[0.75, 16.75], [18.5, 16.75]]);
    expect(data.interiors.physicalSections[0]).toMatchObject({ x: 24.75, width: 34.5 });
    expect(data.interiors.sections.map(({ edges }) => edges)).toEqual([
      { left: 'box', right: 'zone', top: 'box', bottom: 'box' },
      { left: 'zone', right: 'box', top: 'box', bottom: 'box' },
    ]);
    expect([...data.rollouts.values()].map(({ rollouts, warnings }) => ({ width: rollouts[0].width,
      count: rollouts.length, warnings }))).toEqual([
      { width: 15, count: 1, warnings: [] }, { width: 15, count: 1, warnings: [] },
    ]);
    expect(data.interiors.warnings).toEqual([]);
    for (const entry of data.rollouts.values()) {
      expect(entry).not.toHaveProperty('layout');
      expect(entry.rollouts[0]).not.toHaveProperty('side');
    }
  });

  it('converting the linked zone to a partition gives two 15 1/8 roll-outs without warnings', () => {
    const tree = setDividerKind(setDividerGap(splitSinkRollouts({}, 'r', 'r:pair'), 'r', 0, 2),
      'r', 0, 'partition');
    expect(tree.dividers[0]).not.toHaveProperty('gap');
    const data = resolve(tree, { purpose: 'sink' });
    expect([...data.rollouts.values()].map(({ rollouts, warnings }) => [rollouts[0].width, warnings]))
      .toEqual([[15.125, []], [15.125, []]]);
    expect(data.interiors.sections[0].edges.right).toBe('divider');
    expect(data.interiors.sections[1].edges.left).toBe('divider');
  });

  it('only the upper automatic roll-out warns in a non-sink side zone', () => {
    const tree = splitSection({}, 'r', 'horizontal', 2, 'zone');
    tree.children[0].rollouts = { count: 2 };
    const data = resolve(tree);
    const entry = data.rollouts.get('r.0');
    expect(entry.rollouts.map(({ warnings }) => codes(warnings))).toEqual([[], ['rollout-no-side']]);
    expect(entry.warnings).toEqual([{ code: 'rollout-no-side', index: 1 }]);
    for (const changed of [setDividerKind(tree, 'r', 0, 'partition'), removeDivider(tree, 'r', 0)]) {
      const cleared = resolve(changed);
      for (const entry of cleared.rollouts.values()) expect(entry.warnings).toEqual([]);
    }
  });

  it('Bottom 6 moves a single roll-out off its Auto bottom and warns', () => {
    const tree = splitSection({}, 'r', 'horizontal', 2, 'zone');
    tree.children[0].rollouts = { count: 1, bottom: 6 };
    const entry = resolve(tree).rollouts.get('r.0');
    expect(entry.rollouts[0].at).toBe(6);
    expect(codes(entry.rollouts[0].warnings)).toEqual(['rollout-no-side']);
  });

  it('Auto shelves in a side zone warn; partitions and deleting the zone clear the warning', () => {
    const tree = splitSection({}, 'r', 'horizontal', 2, 'zone');
    const data = resolve(tree);
    expect(data.shelves.get('r.0').count).toBeGreaterThan(0);
    expect(codes(data.shelves.get('r.0').warnings)).toEqual(['shelves-no-side']);
    for (const changed of [setDividerKind(tree, 'r', 0, 'partition'), removeDivider(tree, 'r', 0)]) {
      for (const entry of resolve(changed).shelves.values()) expect(entry.warnings).toEqual([]);
    }
  });

  it('up/down zones alone cause no mounting warnings for roll-outs, shelves or rods', () => {
    const tree = splitSection({}, 'r', 'vertical', 2, 'zone');
    for (const child of tree.children) {
      child.rollouts = { count: 1 };
      child.shelves = { count: 1, shoe: 1 };
      child.accessories = [{ accessoryId: 'rod' }];
    }
    const data = resolve(tree);
    expect(data.interiors.sections.map(({ edges }) => edges)).toEqual([
      { left: 'box', right: 'box', top: 'box', bottom: 'zone' },
      { left: 'box', right: 'box', top: 'zone', bottom: 'box' },
    ]);
    for (const entry of data.rollouts.values()) expect(codes(entry.warnings)).not.toContain('rollout-no-side');
    for (const entry of data.shelves.values()) expect(codes(entry.warnings)).not.toContain('shelves-no-side');
    for (const entry of data.accessories.values()) {
      for (const item of entry.items) expect(codes(item.warnings)).not.toContain('accessory-no-side');
    }
  });

  it('copies all first-item picks to both zones, preserving neighbors in a flattened nested split', () => {
    const tree = splitSection({}, 'r', 'horizontal', 2, 'partition');
    tree.children[0] = { rollouts: { count: 2, bottom: 6, top: 2,
      items: [{ at: 1, height: 5, depth: 15, slideId: 'accuride-3832' }, { height: 8 }] } };
    const before = structuredClone(tree);
    const result = splitSinkRollouts(tree, 'r.0', 'r.0:pair');
    expect(tree).toEqual(before);
    expect(result.children.slice(0, 2)).toEqual(Array(2).fill({ rollouts: { count: 1,
      items: [{ at: 1, height: 5, depth: 15, slideId: 'accuride-3832' }] } }));
    expect(result.children[0].rollouts.items[0]).not.toBe(result.children[1].rollouts.items[0]);
    expect(result.children[2]).toBe(tree.children[1]);
    expect(result.dividers).toEqual([{ kind: 'zone', seam: 'r.0:pair' }, { kind: 'partition' }]);
    expect(isInteriorNode(result)).toBe(true);
    for (const [path, seam] of [['r', 'r:pair'], ['r.9', 'r:pair'], ['r.0', null], ['r.0', 'r:0']]) {
      expect(splitSinkRollouts(tree, path, seam)).toBe(tree);
    }
  });

  it('follows a changed pair seam and allows manual moves and partition conversion', () => {
    const tree = splitSinkRollouts({}, 'r', 'r.1:pair');
    const face = { direction: 'horizontal', size: null,
      children: [{ type: 'door', size: 10, hinge: 'left' }, door] };
    const first = resolve(tree, { face });
    const moved = resolve(tree, { face: { ...face, children: [{ ...face.children[0], size: 14 }, door] } });
    expect(moved.interiors.dividers[0].fromLeft - first.interiors.dividers[0].fromLeft).toBe(2);
    const manual = resolve(setDividerPosition(tree, 'r', 0, 16), { face });
    expect(manual.interiors.dividers[0]).toMatchObject({ fromLeft: 16, linked: false });
    expect(pairSeam([{ type: 'pair_door', path: 'r', half: 'left', x: 2, width: 10 },
      { type: 'pair_door', path: 'r', half: 'right', x: 12.125, width: 10 }])).toBe(12.0625);
    expect(pairSeam([])).toBeNull();
  });

  it('warns for shoe shelves and section-width accessories only, and clears them with a partition or deletion', () => {
    const tree = splitSection({}, 'r', 'horizontal', 2, 'zone');
    tree.children[0] = { shelves: { count: 0, shoe: 1 },
      accessories: [{ accessoryId: 'rod' }, { accessoryId: 'fixed' }] };
    const data = resolve(tree);
    expect(codes(data.shelves.get('r.0').warnings)).toEqual(['shelves-no-side']);
    expect(data.accessories.get('r.0').items.map(({ warnings }) => codes(warnings)))
      .toEqual([['accessory-no-side'], []]);
    for (const changed of [setDividerKind(tree, 'r', 0, 'partition'), removeDivider(tree, 'r', 0)]) {
      const cleared = resolve(changed);
      for (const entry of cleared.accessories.values()) {
        for (const item of entry.items) expect(item.warnings).toEqual([]);
      }
      for (const entry of cleared.shelves.values()) expect(entry.warnings).toEqual([]);
    }
  });

  it('uses the actual lowest roll-out and requires a supported bottom in nested side zones', () => {
    const tree = splitSection({}, 'r', 'horizontal', 2, 'zone');
    tree.children[0].rollouts = { count: 2, items: [{ at: 12 }, { at: 0.5625 }] };
    expect(resolve(tree).rollouts.get('r.0').rollouts.map(({ warnings }) => codes(warnings)))
      .toEqual([['rollout-no-side'], []]);
    const nested = splitSection(tree, 'r.0', 'vertical', 2, 'zone');
    nested.children[0].children[0].rollouts = { count: 1 };
    const data = resolve(nested);
    expect(data.interiors.sections[0].edges).toEqual({ left: 'box', right: 'zone', top: 'box', bottom: 'zone' });
    expect(codes(data.rollouts.get('r.0.0').warnings)).toContain('rollout-no-side');
    expect(data.interiors.sections[1].edges).toEqual({ left: 'box', right: 'zone', top: 'zone', bottom: 'box' });
    const supported = resolve(setDividerKind(nested, 'r.0', 0, 'fixed'));
    expect(supported.interiors.sections[0].edges.bottom).toBe('divider');
    expect(codes(supported.rollouts.get('r.0.0').warnings)).not.toContain('rollout-no-side');
  });
});
