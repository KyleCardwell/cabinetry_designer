import { describe, expect, it, vi } from 'vitest';
import { boxConstruction } from '../boxConstruction.js';
import { findLeaf } from '../cellTree.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { cabinetDrawerBoxes } from '../drawerBoxes.js';
import { cabinetFaces, faceArea } from '../faces.js';
import { faceOpenings } from '../frames.js';
import { gridFromItems } from '../grid.js';
import { placeInterior, resolveInterior } from '../interiors.js';
import { sectionShelves, wallInteriorData } from '../shelves.js';
import { BUILT_IN_SLIDES } from '../slides.js';
import * as drawerBoxesModule from '../drawerBoxes.js';
import * as interiorsModule from '../interiors.js';
import * as rolloutsModule from '../rollouts.js';

import {
  MAX_ACCESSORY_QTY, MAX_SECTION_ACCESSORIES, addSectionAccessory, isInteriorNode,
  isSectionAccessories, newAccessory, removeDivider, removeSectionAccessory,
  sectionAccessories, setSectionAccessory, splitSection, wallAccessories,
} from '../index.js';

const settings = { ...DEFAULT_SETTINGS, slides: BUILT_IN_SLIDES, drawerSlideId: 'blum-562h' };
const face = (type = 'door', extra = {}) => ({ type, size: null, ...extra });
const stack = (...children) => ({ direction: 'vertical', size: null, children });
const euro = { top: 0.125, bottom: 0.125, left: 0.0625, right: 0.0625, horizontal: 0.125, vertical: 0.125 };

function input({ width = 24, height = 30.5, depth = 24, x = 0, z = 0, leaf: patch = {},
  reveals = euro, settings: effective = settings } = {}) {
  const leaf = { id: 'c', kind: 'cabinet', face: face(), ...patch };
  const box = { x, z, width, height, depth };
  const { faces } = cabinetFaces(leaf, box, CABINET_TYPE_IDS.BASE, effective, reveals);
  const openings = faceOpenings(leaf.face, faceArea(box, reveals), reveals);
  const interior = placeInterior({ box, ...resolveInterior(leaf.interior, box, boxConstruction(leaf), effective,
    { faceTree: leaf.face, faces, openings, inset: false, nosing: leaf.shelves?.nosing }) });
  const { boxes } = cabinetDrawerBoxes({ faces, openings, reveals, inset: false, interior, leaf, settings: effective });
  return { interior, faces, boxes, leaf, settings: effective };
}

function roomWith(leaves, { width = 24 * leaves.length, height = 30.5, depth = 24,
  cabinetTypeId = CABINET_TYPE_IDS.BASE } = {}) {
  const run = { id: 'run', cabinetTypeId, x: 24, width, z: 4, height, depth,
    ends: { left: { type: 'none' }, right: { type: 'none' } }, autoCount: false, maxCabinetWidth: null,
    heightMode: 'manual', overrides: {}, anchors: { left: false, right: false },
    grid: gridFromItems('run', leaves.map((leaf) => ({ kind: 'cabinet', width: null, ...leaf }))) };
  const wall = { id: 'wall', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5, flipped: false,
    connections: { start: null, end: null }, profile: {}, runs: [run], openings: [] };
  return { id: 'room', profile: { ...DEFAULT_SETTINGS.defaultProfile }, walls: [wall], wallOrder: ['wall'] };
}

const a = { accessoryId: 'a' };
const susan = { ...newAccessory([], 'a'), name: 'Lazy susan 28', wholeSection: true,
  minOpening: { width: 27, depth: 22, height: null } };
const effective = { ...settings, accessories: [susan] };
const resolve = (args) => sectionAccessories({ ...args, rollouts: rolloutsModule.sectionRollouts(args) });
const warning = { code: 'accessory-whole-section', name: 'Lazy susan 28' };
const unresolvedGeometry = { size: null, orderedLength: null, fromBottom: null, centerZ: null, rect: null };

describe('IN12b step d section accessories', () => {
  it('anchor 1: accepts only 1–12 unique references with implicit one or quantity 1–20 (SH3 a)', () => {
    expect(MAX_SECTION_ACCESSORIES).toBe(12);
    expect(MAX_ACCESSORY_QTY).toBe(20);
    expect(isInteriorNode({ accessories: [a] })).toBe(true);
    expect(isSectionAccessories([{ ...a, qty: 20 }])).toBe(true);
    expect(isSectionAccessories([{ ...a, qty: 1 }])).toBe(true);
    const entries = Array.from({ length: 12 }, (_, i) => ({ accessoryId: String(i) }));
    expect(isSectionAccessories(entries)).toBe(true);
    for (const invalid of [[], [{ ...a, qty: 0 }], [{ ...a, qty: 21 }], [...entries, { accessoryId: '13' }],
      [a, a], [{ accessoryId: '' }], [{ qty: 2 }], [{ ...a, qty: null }], [{ ...a, qty: 2.5 }],
      [{ ...a, extra: true }], [{ ...a, [Symbol('extra')]: true }], Array(1), [null], null, {}]) {
      expect(isSectionAccessories(invalid)).toBe(false);
      expect(isInteriorNode({ accessories: invalid })).toBe(false);
    }
    expect(isInteriorNode({ ...splitSection({}, 'r', 'vertical', 2), accessories: [a] })).toBe(false);
  });

  it('anchor 2: adds, increments, resets and removes without mutating, with limits and invalid no-ops', () => {
    const once = addSectionAccessory(undefined, 'r', 'a');
    const twice = addSectionAccessory(once, 'r', 'a');
    expect(twice).toEqual({ accessories: [{ accessoryId: 'a', qty: 2 }] });
    expect(once).toEqual({ accessories: [a] });
    const reset = setSectionAccessory(twice, 'r', 0, { qty: null });
    expect(reset).toEqual({ accessories: [a] });
    expect(setSectionAccessory(twice, 'r', 0, { qty: 1 })).toEqual(reset);
    expect(removeSectionAccessory(reset, 'r', 0)).toEqual({});
    const full = { accessories: Array.from({ length: 12 }, (_, i) => ({ accessoryId: String(i), qty: 20 })) };
    expect(addSectionAccessory(full, 'r', 'extra')).toBe(full);
    expect(addSectionAccessory(full, 'r', '0')).toEqual(full);
    for (const patch of [null, { qty: 0 }, { qty: 21 }, { qty: 2.1 }, { qty: undefined },
      { accessoryId: '' }, { accessoryId: null }, { other: 1 }, { [Symbol('bad')]: 1 }]) {
      expect(setSectionAccessory(twice, 'r', 0, patch)).toBe(twice);
    }
    for (const path of ['bad', 'r.0', null]) {
      expect(addSectionAccessory(twice, path, 'b')).toBe(twice);
      expect(setSectionAccessory(twice, path, 0, { qty: 3 })).toBe(twice);
      expect(removeSectionAccessory(twice, path, 0)).toBe(twice);
    }
    for (const index of [-1, 1, 0.5, null]) {
      expect(setSectionAccessory(twice, 'r', index, { qty: 3 })).toBe(twice);
      expect(removeSectionAccessory(twice, 'r', index)).toBe(twice);
    }
    expect(addSectionAccessory(twice, 'r', '')).toBe(twice);
    const nested = splitSection({}, 'r', 'horizontal', 2);
    expect(addSectionAccessory(nested, 'r', 'a')).toBe(nested);
    const edited = addSectionAccessory(nested, 'r.1', 'a');
    expect(edited.children).toEqual([{}, { accessories: [a] }]);
    expect(nested.children).toEqual([{}, {}]);
    expect(removeSectionAccessory(edited, 'r.1', 0)).toEqual(nested);
  });

  it('anchor 3: changing an id merges into the existing item in its stored position and caps quantity', () => {
    const tree = { accessories: [a, { accessoryId: 'b', qty: 3 }] };
    expect(setSectionAccessory(tree, 'r', 1, { accessoryId: 'a' }))
      .toEqual({ accessories: [{ accessoryId: 'a', qty: 4 }] });
    const ordered = { accessories: [a, { accessoryId: 'b' }, { accessoryId: 'c', qty: 19 }] };
    expect(setSectionAccessory(ordered, 'r', 0, { accessoryId: 'c', qty: 3 }))
      .toEqual({ accessories: [{ accessoryId: 'b' }, { accessoryId: 'c', qty: 20 }] });
    expect(tree.accessories).toEqual([a, { accessoryId: 'b', qty: 3 }]);
  });

  it('anchor 4: only the first split child keeps accessories; merging preserves order and sums quantities', () => {
    const tree = { accessories: [a], hinges: false };
    for (const direction of ['vertical', 'horizontal']) {
      const split = splitSection(tree, 'r', direction, 2);
      expect(split.children).toEqual([{ accessories: [a], hinges: false }, { hinges: false }]);
      const sameDirection = splitSection(split, 'r.0', direction, 2);
      expect(sameDirection.children.map((child) => child.accessories)).toEqual([[a], undefined, undefined]);
      const nested = splitSection(split, 'r.0', direction === 'vertical' ? 'horizontal' : 'vertical', 2);
      expect(nested.children[0].children.map((child) => child.accessories)).toEqual([[a], undefined]);
      split.children[1].accessories = [{ accessoryId: 'a', qty: 2 }, { accessoryId: 'b' }];
      expect(removeDivider(split, 'r', 0)).toEqual({ hinges: false,
        accessories: [{ accessoryId: 'a', qty: 3 }, { accessoryId: 'b' }] });
      split.children[0].accessories[0].qty = 20;
      expect(removeDivider(split, 'r', 0).accessories[0].qty).toBe(20);
      expect(tree).toEqual({ accessories: [a], hinges: false });
    }
    const split = splitSection({}, 'r', 'vertical', 2);
    split.children[1].accessories = [a];
    expect(removeDivider(split, 'r', 0)).toEqual({ accessories: [a] });
    split.children[0].accessories = Array.from({ length: 12 }, (_, i) => ({ accessoryId: String(i) }));
    // Do not discard either section's contents when merging would exceed storage capacity.
    expect(removeDivider(split, 'r', 0)).toBe(split);
  });

  it('anchor 5: checks clear opening width and suppresses auto shelves and line bore even when too small', () => {
    const args = input({ leaf: { interior: { accessories: [a] } }, settings: effective });
    const before = structuredClone(args);
    const entry = resolve(args).get('r');
    expect(entry.items).toEqual([{ index: 0, accessoryId: 'a', accessory: susan, qty: 1,
      ...unresolvedGeometry, size: { width: null, height: null, depth: null },
      warnings: [{ code: 'accessory-too-small', sizes: [{ dim: 'width', needs: 27, has: 22.5 }] }] }]);
    expect(entry.whole).toBe(entry.items[0]);
    expect(entry.warnings).toEqual([]);
    expect(sectionShelves(args).get('r').count).toBe(1);
    expect(sectionShelves({ ...args, accessories: resolve(args) }).get('r'))
      .toMatchObject({ count: 0, countSource: 'auto', lineBore: false });
    expect(args).toEqual(before);
  });

  it('anchor 6: fitting whole-section accessories warn alongside roll-outs, manual shelves or other counted items', () => {
    const fitting = { ...effective, accessories: [{ ...susan, minOpening: { width: 21, depth: 22, height: null } },
      newAccessory([], 'b')] };
    const base = input({ leaf: { interior: { accessories: [a] } }, settings: fitting });
    expect(resolve(base).get('r')).toMatchObject({ items: [{ warnings: [] }], warnings: [] });
    for (const extra of [{ rollouts: { count: 2 } }, { shelves: { count: 2 } },
      { accessories: [a, { accessoryId: 'b' }] }]) {
      const args = input({ leaf: { interior: { accessories: [a], ...extra } }, settings: fitting });
      const rollouts = rolloutsModule.sectionRollouts(args);
      const before = structuredClone(rollouts);
      const accessories = sectionAccessories({ ...args, rollouts });
      expect(accessories.get('r').warnings).toEqual([warning]);
      expect(sectionShelves({ ...args, rollouts, accessories }).get('r').count)
        .toBe(extra.shelves ? 2 : 0);
      expect(rollouts).toEqual(before);
    }
    const manualFlags = input({ leaf: { interior: { accessories: [a], shelves: { count: 0 }, lineBore: true } }, settings: fitting });
    expect(resolve(manualFlags).get('r').warnings).toEqual([]);
    expect(sectionShelves({ ...manualFlags, accessories: resolve(manualFlags) }).get('r').lineBore).toBe(true);
  });

  it('IN13b anchor 8: warns when shoe shelves share a section with a whole-section accessory', () => {
    for (const shoe of [0, 1]) {
      const args = input({ leaf: { interior: { accessories: [a], shelves: { shoe } } }, settings: effective });
      expect(resolve(args).get('r').warnings).toEqual(shoe > 0 ? [warning] : []);
    }
  });

  it('anchor 7: missing and drawer-box accessories remain visible with warnings and do not affect shelves', () => {
    const misplaced = { ...newAccessory([], 'box'), attachesTo: 'drawer_box',
      minOpening: { width: 100, depth: 100, height: 100 } };
    const args = input({ leaf: { interior: { accessories: [{ accessoryId: 'gone-id' }, { accessoryId: 'box', qty: 2 }] } },
      settings: { ...settings, accessories: [misplaced] } });
    const accessories = resolve(args);
    expect(accessories.get('r')).toEqual({ whole: null, warnings: [], lineBoreRow: false, items: [
      { index: 0, accessoryId: 'gone-id', accessory: null, qty: 1, ...unresolvedGeometry,
        warnings: [{ code: 'accessory-missing' }] },
      { index: 1, accessoryId: 'box', accessory: misplaced, qty: 2, ...unresolvedGeometry,
        warnings: [{ code: 'accessory-wrong-place' }] },
    ] });
    expect(sectionShelves({ ...args, accessories })).toEqual(sectionShelves(args));
    expect(sectionShelves({ ...args, accessories }).get('r').count).toBe(1);
    expect(sectionAccessories({ ...args, settings: undefined }).get('r').items.every(({ accessory }) => accessory === null)).toBe(true);
  });

  it('checks depth and drawer-clear height with tolerance, using the first counted whole accessory', () => {
    const args = input({ x: 24, z: 40, leaf: { face: stack(face('drawer_front', { size: 5.875 }), face()),
      interior: { accessories: [{ accessoryId: 'a', qty: 2 }, { accessoryId: 'b' }] } },
      reveals: { ...euro, top: 0.25 }, settings: { ...effective, accessories: [
        { ...susan, minOpening: { width: 22.5 + 5e-10, depth: 24, height: 24 } },
        { ...susan, id: 'b', name: 'Second whole' },
      ] } });
    const entry = resolve(args).get('r');
    expect(entry.items[0].warnings).toEqual([{ code: 'accessory-too-small', sizes: [
      { dim: 'depth', needs: 24, has: 23 }, { dim: 'height', needs: 24, has: 23.5625 },
    ] }]);
    expect(entry.whole).toBe(entry.items[0]);
    expect(entry.warnings).toEqual([warning]);
  });

  it('anchor 8: absent accessories preserve every existing interior pass and shelf result on both wall faces', () => {
    const room = roomWith([{ id: 'c', face: face() }, { id: 'd', face: face(), interior: { rollouts: { count: 1 } } }]);
    const wall = room.walls[0];
    const before = structuredClone(room);
    for (const side of ['front', 'back']) {
      const data = wallInteriorData(room, wall, side, settings);
      const interiors = interiorsModule.wallInteriors(room, wall, side, settings);
      const boxes = drawerBoxesModule.wallDrawerBoxes(room, wall, side, settings);
      const rollouts = rolloutsModule.wallRollouts(room, wall, side, settings);
      expect(data.interiors).toEqual(new Map(interiors.map((interior) => [interior.itemId, interior])));
      expect(data.boxes).toEqual(boxes);
      expect(data.rollouts).toEqual(rollouts);
      expect([...data.accessories.values()].every((entries) => entries.size === 0)).toBe(true);
      for (const interior of interiors) {
        expect(data.shelves.get(interior.itemId)).toEqual(sectionShelves({ interior,
          faces: cabinetFaces({ face: face() }, { x: interior.box.x, z: interior.box.z, width: 24, height: 30.5, depth: 24 },
            CABINET_TYPE_IDS.BASE, settings, euro).faces,
          boxes: boxes.get(interior.itemId)?.boxes ?? [], rollouts: rollouts.get(interior.itemId), leaf: {}, settings }));
      }
    }
    expect(room).toEqual(before);
  });

  it('shares a single wall pass and resolves nested sections on either face at wall coordinates', () => {
    const tree = addSectionAccessory(splitSection({}, 'r', 'horizontal', 2), 'r.1', 'a');
    const room = roomWith([{ id: 'c', face: face(), interior: tree }]);
    const wall = room.walls[0];
    const before = structuredClone(room);
    const spies = [vi.spyOn(interiorsModule, 'wallInteriors'), vi.spyOn(drawerBoxesModule, 'wallDrawerBoxes'),
      vi.spyOn(rolloutsModule, 'wallRollouts')];
    let data;
    try {
      data = wallInteriorData(room, wall, 'front', effective);
      expect(spies.map((spy) => spy.mock.calls.length)).toEqual([1, 1, 1]);
    } finally { spies.forEach((spy) => spy.mockRestore()); }
    expect([...data.accessories.get('c').keys()]).toEqual(['r.1']);
    expect(data.shelves.get('c').get('r.0').count).toBe(1);
    expect(data.shelves.get('c').get('r.1').count).toBe(0);
    expect(wallAccessories(room, wall, 'front', effective)).toEqual(data.accessories);
    expect(wallAccessories(room, wall, 'back', effective).size).toBe(0);
    expect(room).toEqual(before);
    wall.runs[0].wallSide = 'back';
    expect(wallInteriorData(room, wall, 'back', effective).accessories).toEqual(data.accessories);
  });
});

describe('IN13a step c accessory size, ordered length and position', () => {
  const rod = { ...newAccessory([], 'FR'), name: 'Fixed rod',
    size: { width: 'section', height: 1.25, depth: 1.25 }, lengthDeduction: 0.25,
    effects: [{ kind: 'line_bore_row' }] };
  const hook = { ...newAccessory([], 'HK'), name: 'Robe hook', size: { width: 3, height: 2, depth: 3 } };
  const tray = { ...newAccessory([], 'TR'), name: 'Tray' };
  const cup = { ...newAccessory([], 'CU'), attachesTo: 'drawer_box', size: { width: 2, height: 3, depth: 4 } };
  const big = { ...rod, id: 'BIG', lengthDeduction: 30 };
  const library = { ...settings, accessories: [rod, hook, tray, cup, big] };

  function closet(items, effective = library, extra = {}) {
    const room = roomWith([{ id: 'c', face: face(), interior: { ...extra, accessories: items } }],
      { height: 84, cabinetTypeId: CABINET_TYPE_IDS.TALL });
    const before = structuredClone({ room, effective });
    const data = wallInteriorData(room, room.walls[0], 'front', effective);
    const section = data.interiors.get('c').sections[0];
    expect(section).toMatchObject({ width: 22.5, depth: 23 });
    expect({ room, effective }).toEqual(before);
    return { room, data, section, entry: data.accessories.get('c').get('r') };
  }

  it('anchor 1: resolves a section-width rod and ordered length without placing it', () => {
    const { entry } = closet([{ accessoryId: 'FR' }]);
    expect(entry).toEqual({ whole: null, warnings: [], lineBoreRow: true, items: [
      { index: 0, accessoryId: 'FR', accessory: rod, qty: 1, warnings: [],
        size: { width: 22.5, height: 1.25, depth: 1.25 }, orderedLength: 22.25,
        fromBottom: null, centerZ: null, rect: null },
    ] });
  });

  it('anchors 2–3: places rods and hooks at wall coordinates without changing shelves or roll-outs', () => {
    for (const [id, fromBottom, offsetX, offsetZ, width, height] of [
      ['FR', 40, 0, 39.375, 22.5, 1.25], ['HK', 60, 9.75, 59, 3, 2],
    ]) {
      const before = closet([{ accessoryId: id, qty: 3 }], library, { rollouts: { count: 1 } });
      const { data, section, entry } = closet([{ accessoryId: id, qty: 3, fromBottom }], library,
        { rollouts: { count: 1 } });
      expect(entry.items[0]).toMatchObject({ qty: 3, fromBottom, centerZ: section.z + fromBottom,
        rect: { x: section.x + offsetX, z: section.z + offsetZ, width, height }, warnings: [] });
      expect(entry.lineBoreRow).toBe(id === 'FR');
      expect(data.shelves).toEqual(before.data.shelves);
      expect(data.rollouts).toEqual(before.data.rollouts);
      expect(data.boxes).toEqual(before.data.boxes);
    }
  });

  it('anchor 4: retains the rectangle when its top extends outside the section', () => {
    const { section } = closet([{ accessoryId: 'HK' }]);
    const { entry } = closet([{ accessoryId: 'HK', fromBottom: section.height - 0.5 }]);
    expect(entry.items[0].warnings).toEqual([{ code: 'accessory-outside', sectionHeight: section.height }]);
    expect(entry.items[0].rect).toEqual({ x: section.x + 9.75,
      z: section.z + section.height - 1.5, width: 3, height: 2 });
  });

  it('anchor 5: resolves a placed unsized tray centre without a rectangle', () => {
    const { section, entry } = closet([{ accessoryId: 'TR', fromBottom: 30 }]);
    expect(entry.items[0]).toMatchObject({ size: { width: null, height: null, depth: null },
      orderedLength: null, fromBottom: 30, centerZ: section.z + 30, rect: null, warnings: [] });
    expect(entry.lineBoreRow).toBe(false);
  });

  it('anchor 6: warns and clears a nonpositive ordered length', () => {
    const { entry } = closet([{ accessoryId: 'BIG' }]);
    expect(entry.items[0]).toMatchObject({ orderedLength: null,
      warnings: [{ code: 'accessory-length', deduction: 30, has: 22.5 }] });
    expect(entry.lineBoreRow).toBe(true);
  });

  it('anchor 7: missing and wrong-place picks have null geometry even when placed or sized', () => {
    const { entry } = closet([{ accessoryId: 'gone', fromBottom: 30 }, { accessoryId: 'CU', fromBottom: 100 }]);
    expect(entry).toEqual({ whole: null, warnings: [], lineBoreRow: false, items: [
      { index: 0, accessoryId: 'gone', accessory: null, qty: 1, ...unresolvedGeometry,
        warnings: [{ code: 'accessory-missing' }] },
      { index: 1, accessoryId: 'CU', accessory: cup, qty: 1, ...unresolvedGeometry,
        warnings: [{ code: 'accessory-wrong-place' }] },
    ] });
  });

  it('anchor 8: unsized, unplaced picks preserve shelf results and add only null geometry and a false flag', () => {
    const { room, data, entry } = closet([{ accessoryId: 'TR' }]);
    expect(entry).toEqual({ whole: null, warnings: [], lineBoreRow: false, items: [
      { index: 0, accessoryId: 'TR', accessory: tray, qty: 1, warnings: [],
        ...unresolvedGeometry, size: { width: null, height: null, depth: null } },
    ] });
    delete findLeaf(room.walls[0].runs[0].grid, 'c').interior.accessories;
    expect(data.shelves).toEqual(wallInteriorData(room, room.walls[0], 'front', library).shelves);
  });

  it('checks centre and rectangle bounds and ordered-length tolerance, allowing unknown depth', () => {
    const { section } = closet([{ accessoryId: 'TR' }]);
    for (const [size, fromBottom, outside] of [
      [{ width: 3, height: 2, depth: null }, 0.5, true],
      [{ width: 23, height: 2, depth: null }, 30, true],
      [{ width: 22.5 + 1e-9, height: 2, depth: null }, 30, false],
      [{ width: 3, height: 2, depth: null }, 1 - 5e-10, false],
      [{ width: 3, height: 2, depth: null }, section.height - 1 + 5e-10, false],
      [{ width: null, height: 2, depth: 3 }, section.height + 1, true],
      [{ width: 3, height: null, depth: 3 }, section.height + 5e-10, false],
    ]) {
      const custom = { ...hook, size };
      const { entry } = closet([{ accessoryId: 'HK', fromBottom }], { ...library, accessories: [custom] });
      expect(entry.items[0].warnings).toEqual(outside
        ? [{ code: 'accessory-outside', sectionHeight: section.height }] : []);
      expect(entry.items[0].rect !== null).toBe(size.width !== null && size.height !== null);
    }
    for (const length of [0, 5e-10, 2e-9, 22.5]) {
      const deduction = 22.5 - length;
      const { entry } = closet([{ accessoryId: 'FR' }],
        { ...library, accessories: [{ ...rod, lengthDeduction: deduction }] });
      expect(entry.items[0].orderedLength).toBe(length <= 1e-9 ? null : 22.5 - deduction);
      expect(entry.items[0].warnings).toEqual(length <= 1e-9
        ? [{ code: 'accessory-length', deduction, has: 22.5 }] : []);
    }
  });
});
