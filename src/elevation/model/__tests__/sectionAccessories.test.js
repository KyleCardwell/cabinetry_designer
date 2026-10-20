import { describe, expect, it, vi } from 'vitest';
import { boxConstruction } from '../boxConstruction.js';
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

describe('IN12b step d section accessories', () => {
  it('anchor 1: accepts only 1–12 unique references with implicit one or quantity 2–20', () => {
    expect(MAX_SECTION_ACCESSORIES).toBe(12);
    expect(MAX_ACCESSORY_QTY).toBe(20);
    expect(isInteriorNode({ accessories: [a] })).toBe(true);
    expect(isSectionAccessories([{ ...a, qty: 20 }])).toBe(true);
    const entries = Array.from({ length: 12 }, (_, i) => ({ accessoryId: String(i) }));
    expect(isSectionAccessories(entries)).toBe(true);
    for (const invalid of [[], [{ ...a, qty: 1 }], [{ ...a, qty: 21 }], [...entries, { accessoryId: '13' }],
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

  it('anchor 7: missing and drawer-box accessories remain visible with warnings and do not affect shelves', () => {
    const misplaced = { ...newAccessory([], 'box'), attachesTo: 'drawer_box',
      minOpening: { width: 100, depth: 100, height: 100 } };
    const args = input({ leaf: { interior: { accessories: [{ accessoryId: 'gone-id' }, { accessoryId: 'box', qty: 2 }] } },
      settings: { ...settings, accessories: [misplaced] } });
    const accessories = resolve(args);
    expect(accessories.get('r')).toEqual({ whole: null, warnings: [], items: [
      { index: 0, accessoryId: 'gone-id', accessory: null, qty: 1, warnings: [{ code: 'accessory-missing' }] },
      { index: 1, accessoryId: 'box', accessory: misplaced, qty: 2, warnings: [{ code: 'accessory-wrong-place' }] },
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
