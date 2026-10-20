import { describe, expect, it, vi } from 'vitest';
import { autoInterior } from '../autoInterior.js';
import { boxConstruction } from '../boxConstruction.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { cabinetDrawerBoxes } from '../drawerBoxes.js';
import { cabinetFaces, faceArea } from '../faces.js';
import { faceOpenings } from '../frames.js';
import { gridFromItems } from '../grid.js';
import { cabinetInterior, placeInterior, resolveInterior } from '../interiors.js';
import { sectionShelves, wallInteriorData, wallShelves } from '../shelves.js';
import { BUILT_IN_SLIDES } from '../slides.js';
import * as drawerBoxesModule from '../drawerBoxes.js';
import * as interiorsModule from '../interiors.js';
import * as partsModule from '../elevationParts.js';
import * as scenesModule from '../runScene.js';
import * as rolloutsModule from '../rollouts.js';

const settings = { ...DEFAULT_SETTINGS, slides: BUILT_IN_SLIDES, drawerSlideId: 'blum-562h' };
const face = (type = 'door', extra = {}) => ({ type, size: null, ...extra });
const stack = (...children) => ({ direction: 'vertical', size: null, children });
const columns = (...children) => ({ direction: 'horizontal', size: null, children });
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
const shelves = (options) => sectionShelves(input(options));
const root = (options) => shelves(options).get('r');

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

describe('IN8 shelves and section flags', () => {
  it('IN10 anchor 8: shares resolved interior data and preserves shelf Maps on either face', () => {
    for (const cabinetStyleId of [13, 14]) {
      const room = roomWith([
        { id: 'a', face: stack(face('drawer_front', { size: 5.875 }), face()),
          interior: { rollouts: { count: 1 } } },
        { id: 'b', face: face('pair_door') },
      ], { width: 84 });
      room.style = { cabinetStyleId };
      const wall = room.walls[0];
      const back = structuredClone(wall.runs[0]);
      back.id = 'back';
      back.wallSide = 'back';
      back.grid = gridFromItems('back', [{ id: 'c', kind: 'cabinet', width: null, face: face() }]);
      wall.runs.push(back);
      const before = structuredClone(room);
      for (const side of ['front', 'back']) {
        const expected = wallShelves(room, wall, side, settings);
        const spies = [vi.spyOn(interiorsModule, 'wallInteriors'),
          vi.spyOn(drawerBoxesModule, 'wallDrawerBoxes'), vi.spyOn(rolloutsModule, 'wallRollouts')];
        try {
          const data = wallInteriorData(room, wall, side, settings);
          expect(spies.map((spy) => spy.mock.calls.length)).toEqual([1, 1, 1]);
          expect(data.interiors).toEqual(new Map(spies[0].mock.results[0].value
            .map((interior) => [interior.itemId, interior])));
          expect(data.boxes).toBe(spies[1].mock.results[0].value);
          expect(data.rollouts).toBe(spies[2].mock.results[0].value);
          expect(data.shelves).toEqual(expected);
          expect([...data.shelves.keys()]).toEqual(side === 'front' ? ['a', 'b'] : ['c']);
        } finally {
          spies.forEach((spy) => spy.mockRestore());
        }
      }
      expect(room).toEqual(before);
    }
  });

  it('anchor 1: sizes one base shelf from the clear section and enables both flags', () => {
    const args = input();
    expect(args.interior.sections).toEqual([{ path: 'r', x: 0.75, z: 0.75, width: 22.5, height: 29, depth: 23 }]);
    const before = structuredClone(args);
    expect(sectionShelves(args).get('r')).toMatchObject({ count: 1, countSource: 'auto',
      zone: { z: 0.75, height: 29 }, width: 22.375, depth: 22.875, orderedDepth: 22.875, thickness: 0.75,
      glass: false, glassSource: 'auto', nosing: null, nosingSource: 'auto', banding: true,
      hinges: true, hingesSource: 'auto', lineBore: true, lineBoreSource: 'auto', warnings: [] });
    expect(args).toEqual(before);
  });

  it('IN8.2: deducts shelf clearance on both sides of a 30-inch section', () => {
    const args = input({ width: 31.5, settings: { ...settings, shelfWidthClearance: 0.25 } });
    expect(args.interior.sections[0].width).toBe(30);
    expect(sectionShelves(args).get('r').width).toBe(29.5);
  });

  it('anchor 2: leaves a 23 9/16 shelf zone below the top drawer space', () => {
    const args = input({ leaf: { face: stack(face('drawer_front', { size: 5.875 }), face()) },
      reveals: { ...euro, top: 0.25 } });
    expect(args.interior.dividers).toEqual([]);
    expect(args.boxes[0].space.z).toBe(24.3125);
    // One shelf leaves 11 13/32 each side, over the 11" default minimum (Kyle 2026-10-19).
    expect(sectionShelves(args).get('r')).toMatchObject({ count: 1, zone: { z: 0.75, height: 23.5625 } });
  });

  it('anchor 3: three drawer fronts have no shelves, hinge plates or line bore', () => {
    expect(root({ width: 18, leaf: { face: stack(face('drawer_front'), face('drawer_front'), face('drawer_front')) } }))
      .toMatchObject({ count: 0, hinges: false, lineBore: false, positions: [], warnings: [] });
  });

  it('anchor 4: sizes an upper pair-door shelf using its 28 1/2 clear height and 11 depth', () => {
    expect(root({ width: 30, height: 30, depth: 12, leaf: { face: face('pair_door') } }))
      .toMatchObject({ zone: { z: 0.75, height: 28.5 }, count: 1, width: 28.375, depth: 10.875 });
  });

  it('anchor 5: wide pairs partition unless cabinet nosing supplies the full-width shelf', () => {
    const plain = input({ width: 42, leaf: { face: face('pair_door') } });
    expect(plain.interior.dividers).toMatchObject([{ kind: 'partition', seam: 'r:pair' }]);
    expect(plain.interior.sections.map(({ width }) => width)).toEqual([19.875, 19.875]);
    expect([...sectionShelves(plain).values()]).toMatchObject([
      { count: 1, width: 19.75 }, { count: 1, width: 19.75 },
    ]);
    for (const nosing of ['hardwood', 'folded']) {
      const args = input({ width: 42, leaf: { face: face('pair_door'), shelves: { nosing } } });
      expect(args.interior.dividers).toEqual([]);
      expect(args.interior.warnings).toEqual([]);
      expect(args.interior.sections[0].width).toBe(40.5);
      expect(sectionShelves(args).get('r')).toMatchObject({ width: 40.375, depth: 22.875,
        orderedDepth: nosing === 'hardwood' ? 22.0625 : 24.875, banding: false, nosingSource: 'cabinet',
        nosing: { kind: nosing, length: 40.375, height: 1.5, thickness: 0.8125 } });
    }
    expect(input({ width: 42, leaf: { face: face('pair_door'), shelves: { nosing: 'none' } } })
      .interior.dividers).toHaveLength(1);
  });

  it('anchor 6: a sink pair keeps hinge plates with no shelves or line bore', () => {
    expect(root({ width: 36, leaf: { purpose: 'sink', face: face('pair_door') } }))
      .toMatchObject({ count: 0, hinges: true, lineBore: false });
    for (const purpose of ['cooktop', 'oven']) expect(root({ leaf: { purpose } }).count).toBe(0);
  });

  it('anchor 7: a face frame base uses the raised deck and a 28 1/4 shelf zone', () => {
    const room = roomWith([{ id: 'c', face: face(), style: { cabinetStyleId: 14 } }]);
    const resolved = wallShelves(room, room.walls[0], 'front', settings).get('c').get('r');
    expect(resolved).toMatchObject({ zone: { z: 5.5, height: 28.25 }, count: 1 });
    expect(resolved.zone.z - 4).toBe(1.5);
    expect(resolved.zone.z + resolved.zone.height - 4).toBe(29.75);
  });

  it('IN8.2: auto count keeps at least the minimum clear between shelves', () => {
    // 11" minimum. Clear zone → count: base 29 → 1, tall top 78 9/16 → 5 (not 6), upper 76 1/2 → 5, upper 57 → 3 (not 4).
    const count = (height) => sectionShelves({ ...input(), interior: { ...input().interior,
      sections: input().interior.sections.map((section) => ({ ...section, height })) } }).get('r');
    expect([29, 78.5625, 76.5, 57, 34.5, 34.49].map((height) => count(height).count)).toEqual([1, 5, 5, 3, 2, 1]);
    expect(count(78.5625).positions[0] - count(78.5625).zone.z).toBeCloseTo(12.46875, 9);
  });

  it('anchor 8: spaces typed shelves with equal clear gaps and warns below three inches', () => {
    const three = root({ leaf: { interior: { shelves: { count: 3 } } } });
    expect(three).toMatchObject({ count: 3, countSource: 'manual', warnings: [],
      positions: [7.4375, 14.875, 22.3125] });
    expect(three.positions[0] - three.zone.z).toBe(6.6875);
    expect(three.gap).toBe(6.6875);
    expect(root({ leaf: { interior: { shelves: { count: 0 } } } }).gap).toBeNull();
    const eight = root({ leaf: { interior: { shelves: { count: 8 } } } });
    expect(eight.count).toBe(8);
    expect(eight.positions[0] - eight.zone.z).toBeCloseTo(23 / 9, 9);
    expect(eight.warnings).toEqual([{ code: 'shelves-crowded' }]);
  });

  it('uses shelf faces and hinged doors independently, including all hinge directions', () => {
    for (const type of ['door', 'pair_door']) {
      for (const action of [undefined, 'pocket', 'sliding', 'flipper', 'pullout']) {
        if (type === 'pair_door' && action === 'pullout') continue;
        const resolved = root({ leaf: { face: face(type, action ? { action } : {}) } });
        expect(resolved.count).toBe([undefined, 'pocket', 'sliding'].includes(action) ? 1 : 0);
        expect(resolved.hinges).toBe(action === undefined);
        expect(resolved.lineBore).toBe(resolved.count > 0);
      }
    }
    for (const hinge of ['left', 'right', 'top', 'bottom']) {
      expect(root({ leaf: { face: face('door', { hinge }) } }).hinges).toBe(['left', 'right'].includes(hinge));
    }
    expect(root({ leaf: { face: face('open') } })).toMatchObject({ count: 1, hinges: false });
    for (const type of ['panel', 'false_front']) {
      expect(root({ leaf: { face: face(type) } })).toMatchObject({ count: 0, hinges: false });
    }
    const args = input({ x: 24, z: 40 });
    const section = args.interior.sections[0];
    for (const axis of ['x', 'z']) {
      const size = axis === 'x' ? 'width' : 'height';
      for (const overlap of [0.25, 0.3125]) {
        const covering = { ...args.faces[0], [axis]: section[axis] + section[size] - overlap };
        expect(sectionShelves({ ...args, faces: [covering] }).get('r'))
          .toMatchObject({ count: overlap > 0.25 ? 1 : 0, hinges: overlap > 0.25 });
      }
    }
  });

  it('unions all box spaces by centre ownership and chooses the tallest uncovered band', () => {
    const args = input({ x: 24, z: 40 });
    const box = (kind, z, height, x = 24.75) => ({ kind, space: { x, z, width: 22.5, height } });
    const boxes = [box('hamper', 59, 20), box('drawer', 47, 4), box('rot', 49, 4),
      box('drawer', 42, 20, 50)]; // The last box belongs to another section horizontally.
    const resolved = sectionShelves({ ...args, boxes }).get('r');
    expect(resolved.zone).toEqual({ z: 40.75, height: 6.25 });
    expect(sectionShelves({ ...args, boxes: [...boxes].reverse() }).get('r').zone).toEqual(resolved.zone);
    expect(sectionShelves({ ...args, boxes: [box('drawer', 40.75, 29)] }).get('r').zone)
      .toEqual({ z: 40.75, height: 0 });
    const divided = input({ leaf: { interior: { direction: 'vertical', children: [{}, {}],
      dividers: [{ kind: 'fixed', at: 15 }] } } });
    const regions = sectionShelves({ ...divided, boxes: [box('drawer', 20, 4, 0.75)] });
    expect(regions.get('r.0').zone).toEqual({ z: 24, height: 5.75 });
    expect(regions.get('r.1').zone).toEqual({ z: 0.75, height: 13.875 });
  });

  it('honors typed counts and flags, even when they equal auto or no shelf face covers', () => {
    expect(root({ leaf: { interior: { shelves: { count: 0 }, hinges: false, lineBore: true } } }))
      .toMatchObject({ count: 0, countSource: 'manual', hinges: false, hingesSource: 'manual',
        lineBore: true, lineBoreSource: 'manual', positions: [], warnings: [] });
    expect(root({ leaf: { purpose: 'sink', face: face('panel'),
      interior: { shelves: { count: 1 }, hinges: true, lineBore: false } } }))
      .toMatchObject({ count: 1, countSource: 'manual', hinges: true, hingesSource: 'manual',
        lineBore: false, lineBoreSource: 'manual' });
    expect(root({ leaf: { interior: { shelves: { count: 1 }, hinges: true, lineBore: true } } }))
      .toMatchObject({ countSource: 'manual', hingesSource: 'manual', lineBoreSource: 'manual' });
  });

  it('inherits material picks, applies settings and ignores nosing on glass', () => {
    const effective = { ...settings, shelfSpacing: 10, shelfWidthClearance: 0.125, shelfSetback: 0.25,
      glassShelfThickness: 0.375, sheetThickness: 0.5, shelfNosingHeight: 2,
      shelfNosingThickness: 1, foldedNosingExtra: 3 };
    const hardwood = root({ settings: effective, leaf: { shelves: { nosing: 'hardwood' } } });
    expect(hardwood)
      .toMatchObject({ count: 1, width: 22.75, depth: 22.75, thickness: 0.5, orderedDepth: 21.75,
        nosing: { height: 2, thickness: 1 }, nosingSource: 'cabinet' });
    expect(hardwood.positions[0] - hardwood.zone.z).toBe(13.75); // (29 1/2 - 10) / (10 + 2) = 1.6
    expect(root({ settings: effective, leaf: { shelves: { nosing: 'folded' } } }).orderedDepth).toBe(25.75);
    const glass = root({ settings: effective, leaf: { shelves: { glass: true, nosing: 'hardwood' } } });
    expect(glass).toMatchObject({ glass: true, glassSource: 'cabinet', thickness: 0.375,
      nosing: null, orderedDepth: 22.75, banding: null });
    expect(glass.positions[0] - glass.zone.z).toBeCloseTo((30.5 - 1 - 0.375) / 2, 9);
    expect(root({ leaf: { shelves: { glass: true, nosing: 'hardwood' },
      interior: { shelves: { glass: false, nosing: 'folded' } } } }))
      .toMatchObject({ glass: false, glassSource: 'manual', nosingSource: 'manual',
        nosing: { kind: 'folded' }, orderedDepth: 24.875 });
    const plain = root({ leaf: { shelves: { nosing: 'hardwood', glass: true },
      interior: { shelves: { nosing: 'none', glass: false } } } });
    expect(plain).toMatchObject({ glass: false, glassSource: 'manual', nosing: null,
      nosingSource: 'manual', banding: true });
    expect(root({ leaf: { interior: { shelves: { glass: true, nosing: 'folded' } } } }))
      .toMatchObject({ glass: true, glassSource: 'manual', thickness: 0.25, nosing: null,
        nosingSource: 'manual', orderedDepth: 22.875 });
    expect(sectionShelves({ ...input(), settings: undefined }).get('r'))
      .toMatchObject({ count: 1, thickness: 0.75 });
  });

  it('suppresses only wide-rule partitions and preserves stored trees and section-level nosing', () => {
    const doorColumn = columns(stack(face(), face()), face());
    for (const nosing of ['hardwood', 'folded']) {
      expect(autoInterior(doorColumn, 42, { nosing }).dividers).toEqual([{ kind: 'partition', seam: 'r:0' }]);
    }
    const args = input({ width: 42, leaf: { face: face('pair_door') } });
    const stored = structuredClone(args.interior.tree);
    stored.children[0].shelves = { nosing: 'hardwood' };
    const retained = input({ width: 42, leaf: { face: face('pair_door'), interior: stored,
      shelves: { nosing: 'folded' } } });
    expect(retained.interior.tree).toEqual(stored);
    expect(retained.interior.dividers).toEqual(args.interior.dividers);
    expect(input({ width: 42, leaf: { face: face('pair_door'), interior: stored } }).interior.dividers)
      .toEqual(args.interior.dividers);
    expect(input({ width: 42, leaf: { face: face('pair_door'), interior: {} } }).interior.warnings)
      .toEqual([{ code: 'wide-no-partition' }]);
    expect(input({ width: 42, leaf: { face: face('pair_door'), interior: {}, shelves: { nosing: 'hardwood' } } })
      .interior.warnings).toEqual([]);
  });

  it('resolves all cabinets with one interiors and drawer pass, shared layouts and wall coordinates', () => {
    const room = roomWith([
      { id: 'a', face: stack(face('drawer_front', { size: 5.875 }), face()) },
      { id: 'b', face: face('pair_door'), shelves: { nosing: 'hardwood' } },
      { id: 'c', face: face('panel') },
    ], { width: 126 });
    const wall = room.walls[0];
    const second = structuredClone(wall.runs[0]);
    second.id = 'run2';
    second.x = 0;
    second.width = 24;
    second.z = 54;
    second.height = 30;
    second.depth = 12;
    second.cabinetTypeId = CABINET_TYPE_IDS.UPPER;
    second.grid = gridFromItems(second.id, [{ id: 'd', kind: 'cabinet', width: null, face: face() }]);
    wall.runs.push(second);
    const before = structuredClone(room);
    const spies = [vi.spyOn(interiorsModule, 'wallInteriors'), vi.spyOn(drawerBoxesModule, 'wallDrawerBoxes'),
      vi.spyOn(partsModule, 'elevationParts'), vi.spyOn(scenesModule, 'runScene')];
    let result;
    try {
      result = wallShelves(room, wall, 'front', settings);
      expect(spies.map((spy) => spy.mock.calls.length)).toEqual([1, 1, 1, 4]);
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
    expect([...result.keys()]).toEqual(['a', 'b', 'c', 'd']);
    expect(result.get('a').get('r')).toMatchObject({ count: 1, zone: { z: 4.75, height: 23.5625 } });
    expect(result.get('b').get('r')).toMatchObject({ width: 40.375, nosing: { kind: 'hardwood' } });
    expect(result.get('c').get('r')).toMatchObject({ count: 0, hinges: false });
    expect(result.get('d').get('r')).toMatchObject({ count: 1, zone: { z: 54.75, height: 28.5 } });
    expect(cabinetInterior(room, wall, 'front', settings, 'b').dividers).toEqual([]);
    expect(room).toEqual(before);
    expect(wallShelves(room, wall, 'back', settings).size).toBe(0);
    wall.runs.forEach((run) => { run.wallSide = 'back'; });
    expect([...wallShelves(room, wall, 'back', settings).keys()]).toEqual(['a', 'b', 'c', 'd']);
  });
});
