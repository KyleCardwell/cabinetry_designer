import { describe, expect, it, vi } from 'vitest';
import { boxConstruction } from '../boxConstruction.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { cabinetDrawerBoxes } from '../drawerBoxes.js';
import { cabinetFaces, faceArea } from '../faces.js';
import { faceOpenings } from '../frames.js';
import { gridFromItems } from '../grid.js';
import { sectionRollouts, wallRollouts, sectionShelves, wallShelves } from '../index.js';
import { placeInterior, resolveInterior } from '../interiors.js';
import { BUILT_IN_SLIDES } from '../slides.js';
import * as drawerBoxesModule from '../drawerBoxes.js';
import * as interiorsModule from '../interiors.js';
import * as partsModule from '../elevationParts.js';
import * as scenesModule from '../runScene.js';

const settings = { ...DEFAULT_SETTINGS, slides: BUILT_IN_SLIDES, drawerSlideId: 'blum-562h' };
const face = (type = 'door', extra = {}) => ({ type, size: null, ...(type === 'door' ? { hinge: 'left' } : {}), ...extra });
const stack = (...children) => ({ direction: 'vertical', size: null, children });
const euro = { top: 0.125, bottom: 0.125, left: 0.0625, right: 0.0625, horizontal: 0.125, vertical: 0.125 };

function input({ width = 24, height = 30.5, depth = 24, x = 0, z = 0, rollouts = { count: 1 },
  leaf: patch = {}, reveals = euro, settings: effective = settings, inset = false, prefinishedMaple = false } = {}) {
  const leaf = { id: 'c', kind: 'cabinet', face: face(), interior: { rollouts }, ...patch };
  const box = { x, z, width, height, depth };
  const { faces } = cabinetFaces(leaf, box, CABINET_TYPE_IDS.BASE, effective, reveals);
  const openings = faceOpenings(leaf.face, faceArea(box, reveals), reveals);
  const interior = placeInterior({ box, ...resolveInterior(leaf.interior, box, boxConstruction(leaf), effective,
    { faceTree: leaf.face, faces, openings, inset }) });
  const { boxes } = cabinetDrawerBoxes({ faces, openings, reveals, inset, interior, leaf, settings: effective });
  return { interior, faces, boxes, leaf, settings: effective, inset, prefinishedMaple };
}

const root = (options) => sectionRollouts(input(options)).get('r');
const codes = (entry) => entry.warnings.map(({ code }) => code);
const shelves = (args) => sectionShelves({ ...args, rollouts: sectionRollouts(args) }).get('r');

describe('IN4c usable roll-out depth and cabinet back notches', () => {
  it('anchor 6: sizes from usable depth, preserves overrides and aggregates the notch warning', () => {
    const args = input();
    args.interior.sections[0].depth = 21.5;
    expect(sectionRollouts(args).get('r').rollouts[0])
      .toMatchObject({ depth: 18, slideLength: 18, interiorDepth: 21.5, notch: null });
    args.interior.tree.rollouts.items = [{ depth: 21, slideId: 'blum-562h' }];
    const entry = sectionRollouts(args).get('r');
    expect(entry.rollouts[0]).toMatchObject({ depth: 21, depthSource: 'manual', slideLength: 21,
      notch: 0.25, source: 'box', warnings: [{ code: 'slide-notch', notch: 0.25, backClearance: 0.75 }] });
    expect(entry.warnings).toEqual([{ code: 'slide-notch', notch: 0.25, backClearance: 0.75, index: 0 }]);
    args.interior.tree.rollouts.items[0].depth = 24;
    expect(codes(sectionRollouts(args).get('r'))).toEqual(['rollout-too-deep', 'slide-notch']);
  });

  it('uses usable depth for sink roll-outs and leaves unsized roll-outs without a notch', () => {
    const args = input({ leaf: { purpose: 'sink' } });
    args.interior.sections[0].depth = 21.5;
    expect(sectionRollouts(args).get('r').rollouts[0])
      .toMatchObject({ depth: 15, depthRule: 'DRW-006', notch: null });
    args.interior.sections[0].depth = 7;
    expect(sectionRollouts(args).get('r').rollouts[0])
      .toMatchObject({ depth: null, slideLength: null, notch: null });
  });
});

function roomWith(leaves, { width = 24 * leaves.length } = {}) {
  const run = { id: 'run', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 24, width, z: 4, height: 30.5, depth: 24,
    ends: { left: { type: 'none' }, right: { type: 'none' } }, autoCount: false, maxCabinetWidth: null,
    heightMode: 'manual', overrides: {}, anchors: { left: false, right: false },
    grid: gridFromItems('run', leaves.map((leaf) => ({ kind: 'cabinet', width: null, face: face(),
      interior: { rollouts: { count: 1 } }, ...leaf }))) };
  const wall = { id: 'wall', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5, flipped: false,
    connections: { start: null, end: null }, profile: {}, runs: [run], openings: [] };
  return { id: 'room', profile: { ...DEFAULT_SETTINGS.defaultProfile }, walls: [wall], wallOrder: ['wall'] };
}

describe('IN9 step b section roll-outs and shelves above them', () => {
  it('anchor 1: sizes one left-hinged base roll-out and leaves one auto shelf above its space', () => {
    const args = input();
    const before = structuredClone(args);
    expect(args.interior.sections).toEqual([{ path: 'r', x: 0.75, z: 0.75, width: 22.5, height: 29, depth: 23 }]);
    const entry = sectionRollouts(args).get('r');
    expect(entry).toMatchObject({ layout: 'stack', layoutSource: 'auto', zone: { z: 0.75, height: 29 },
      top: 5.8125, warnings: [] });
    expect(entry.rollouts).toMatchObject([{ index: 0, side: null, slideId: 'blum-562h', source: 'room',
      height: 4.25, heightSource: 'auto', width: 20.75, depth: 21, depthAuto: 21, depthSource: 'auto', depthRule: null,
      slideLength: 21, interiorDepth: 23, spacers: { left: 1.25, right: 0 }, maple: false, clips: 'standard',
      x: 2.25, z: 1.3125, at: 0.5625, zSource: 'auto', column: { x: 0.75, width: 22.5 },
      space: { z: 0.75, height: 5.0625 }, warnings: [] }]);
    expect(shelves(args)).toMatchObject({ zone: { z: 5.8125, height: 23.9375 }, count: 1, gap: 11.59375,
      positions: [17.40625], lineBore: true, hinges: true });
    expect(args).toEqual(before);
  });

  it('anchor 2: spaces two auto roll-outs with 9 31/32 gaps and removes auto shelves and line bore', () => {
    const args = input({ rollouts: { count: 2 } });
    const entry = sectionRollouts(args).get('r');
    expect(entry.rollouts.map(({ at }) => at)).toEqual([0.5625, 14.78125]);
    expect(entry.rollouts[1].z - entry.rollouts[0].z - 4.25).toBe(9.96875);
    expect(shelves(args)).toMatchObject({ zone: { height: 9.71875 }, count: 0, lineBore: false, hinges: true });
  });

  it('anchor 3: resolves cabinet and individual slides without drawer slide rules', () => {
    const leaf = { drawerSlideId: 'accuride-3832' };
    expect(root({ leaf }).rollouts[0]).toMatchObject({ width: 20.25, depth: 22, source: 'cabinet', clips: null });
    expect(root({ leaf, rollouts: { count: 1, items: [{ slideId: 'blum-562h' }] } }).rollouts[0])
      .toMatchObject({ width: 20.75, depth: 21, source: 'box', clips: 'standard' });
    expect(root({ width: 42, depth: 12, leaf: { purpose: 'file' } }).rollouts[0])
      .toMatchObject({ slideId: 'blum-562h', source: 'room', height: 4.25, depth: 9 });
  });

  it('anchor 4: auto-pairs a sink at its wall-coordinate seam with outer spacers and sink depth', () => {
    const args = input({ width: 36, x: 24, z: 40, leaf: { purpose: 'sink', face: face('pair_door') },
      rollouts: { count: 2 } });
    const entry = sectionRollouts(args).get('r');
    expect(entry).toMatchObject({ layout: 'pair', layoutSource: 'auto', warnings: [] });
    expect(entry.rollouts.map(({ side, column, spacers, width, depth, at, depthSource, depthRule }) =>
      ({ side, column, spacers, width, depth, at, depthSource, depthRule }))).toEqual([
      { side: 'left', column: { x: 24.75, width: 17.25 }, spacers: { left: 1.25, right: 0 },
        width: 15.5, depth: 18, at: 0.5625, depthSource: 'rule', depthRule: 'DRW-006' },
      { side: 'right', column: { x: 42, width: 17.25 }, spacers: { left: 0, right: 1.25 },
        width: 15.5, depth: 18, at: 0.5625, depthSource: 'rule', depthRule: 'DRW-006' },
    ]);
    expect(entry.rollouts[1].x - entry.rollouts[0].x - 15.5).toBe(0.5);
    expect(shelves(args)).toMatchObject({ count: 0, hinges: true });
  });

  it('anchor 5: uses a full-width stack for one sink roll-out or a stored stack layout', () => {
    const options = { width: 36, leaf: { purpose: 'sink', face: face('pair_door') } };
    const one = root(options);
    expect(one).toMatchObject({ layout: 'stack', layoutSource: 'auto' });
    expect(one.rollouts[0]).toMatchObject({ width: 31.5, depth: 18, at: 0.5625, spacers: { left: 1.25, right: 1.25 } });
    const two = root({ ...options, rollouts: { count: 2, layout: 'stack' } });
    expect(two).toMatchObject({ layout: 'stack', layoutSource: 'manual' });
    expect(two.rollouts.map(({ width, at }) => [width, at])).toEqual([[31.5, 0.5625], [31.5, 14.78125]]);
  });

  it('anchor 6: spaces auto runs on either side of a typed section-relative position', () => {
    const entry = root({ z: 40, rollouts: { count: 3, items: [{}, { at: 10 }, {}] } });
    expect(entry.rollouts.map(({ at }) => at)).toEqual([0.5625, 10, 19.5]);
    expect(entry.rollouts.map(({ zSource }) => zSource)).toEqual(['auto', 'manual', 'auto']);
    expect(entry.warnings).toEqual([]);
  });

  it('anchor 7: warns when slide spaces overlap in a stack', () => {
    const entry = root({ rollouts: { count: 2, items: [{}, { at: 3 }] } });
    expect(entry.rollouts.map(({ space }) => space)).toEqual([
      { z: 0.75, height: 5.0625 }, { z: 3.1875, height: 5.0625 },
    ]);
    expect(codes(entry)).toContain('rollouts-overlap');
    expect(entry.rollouts.every((rollout) => codes(rollout).includes('rollouts-overlap'))).toBe(true);
  });

  it('anchor 8: uses the same 23 9/16 clear zone below a drawer as shelves', () => {
    const args = input({ leaf: { face: stack(face('drawer_front', { size: 5.875 }), face()) },
      reveals: { ...euro, top: 0.25 }, rollouts: { count: 2 } });
    const entry = sectionRollouts(args).get('r');
    expect(args.interior.dividers).toEqual([]);
    expect(entry.zone).toEqual({ z: 0.75, height: 23.5625 });
    expect(entry.rollouts.map(({ at }) => at)).toEqual([0.5625, 12.0625]);
    expect(entry.rollouts[1].z - entry.rollouts[0].z - 4.25).toBe(7.25);
  });

  it('anchor 9: uses right-only spacers and standard clips in a raised-deck face frame base', () => {
    const room = roomWith([{ id: 'c', face: face('door', { hinge: 'right' }), style: { cabinetStyleId: 14 } }]);
    const entry = wallRollouts(room, room.walls[0], 'front', settings).get('c').get('r');
    expect(entry.zone).toEqual({ z: 5.5, height: 28.25 });
    expect(entry.rollouts[0]).toMatchObject({ width: 20.75, spacers: { left: 0, right: 1.25 },
      clips: 'standard', at: 0.5625, z: 6.0625 });
  });

  it('anchor 10: shares room and per-cabinet maple material lookup and excludes face frames', () => {
    const room = roomWith([{ id: 'c' }]);
    const wall = room.walls[0];
    const plain = wallRollouts(room, wall, 'front', settings).get('c').get('r').rollouts[0];
    const effective = { ...settings, report: { ...settings.report, boxMaterial: 'Pre-finished Maple' } };
    const maple = wallRollouts(room, wall, 'front', effective).get('c').get('r').rollouts[0];
    expect(maple).toMatchObject({ width: 20.8125, maple: true, x: plain.x - 0.03125 });
    room.reportParts = { c: { boxes: 'Walnut' } };
    expect(wallRollouts(room, wall, 'front', effective).get('c').get('r').rollouts[0].maple).toBe(false);
    room.reportParts.c.boxes = 'Pre-finished Maple';
    expect(wallRollouts(room, wall, 'front', settings).get('c').get('r').rollouts[0].maple).toBe(true);
    const framed = roomWith([{ id: 'c', style: { cabinetStyleId: 14 } }]);
    expect(wallRollouts(framed, framed.walls[0], 'front', effective).get('c').get('r').rollouts[0])
      .toMatchObject({ maple: false, width: 20.75, clips: 'standard' });
  });

  it('anchor 11: uses both spacers and warns when a covering door has no resolved hinge', () => {
    const entry = root({ leaf: { face: face('door', { hinge: undefined }) } });
    expect(entry.rollouts[0]).toMatchObject({ width: 19.5, spacers: { left: 1.25, right: 1.25 } });
    expect(codes(entry)).toContain('rollout-hinge-unknown');
  });

  it('anchor 12: falls back from a stored pair without a pair door or exactly two boxes', () => {
    for (const options of [
      { rollouts: { count: 2, layout: 'pair' } },
      { leaf: { face: face('pair_door') }, rollouts: { count: 1, layout: 'pair' } },
    ]) {
      expect(root(options)).toMatchObject({ layout: 'stack', layoutSource: 'manual',
        warnings: expect.arrayContaining([{ code: 'rollout-pair-invalid' }]) });
    }
  });

  it('anchor 13: keeps typed depth and height and warns on depth beyond the interior and tall boxes', () => {
    const deep = root({ rollouts: { count: 1, items: [{ depth: 24 }] } });
    expect(deep.rollouts[0]).toMatchObject({ depth: 24, depthAuto: 21, depthSource: 'manual',
      depthRule: null, slideLength: 24 });
    expect(codes(deep)).toContain('rollout-too-deep');
    const tall = root({ rollouts: { count: 1, items: [{ height: 16 }] } });
    expect(tall.rollouts[0]).toMatchObject({ height: 16, heightSource: 'manual' });
    expect(codes(tall)).toContain('drawer-box-tall');
  });

  it('never adds roll-outs automatically and resolves only picked sections without mutating inputs', () => {
    for (const purpose of [undefined, 'sink', 'file', 'trash', 'hamper']) {
      expect(sectionRollouts(input({ rollouts: undefined, leaf: { purpose, interior: {} } })).size).toBe(0);
    }
    const args = input({ z: 40, leaf: { interior: { direction: 'vertical',
      children: [{ rollouts: { count: 1, items: [{ at: 2 }] } }, {}], dividers: [{ kind: 'fixed', at: 15 }] } } });
    const before = structuredClone(args);
    const entries = sectionRollouts(args);
    expect([...entries.keys()]).toEqual(['r.0']);
    const section = args.interior.sections.find(({ path }) => path === 'r.0');
    expect(entries.get('r.0').rollouts[0]).toMatchObject({ z: section.z + 2, at: 2 });
    expect(args).toEqual(before);
    const unchanged = sectionShelves(input({ leaf: { interior: {} } }));
    expect(sectionShelves({ ...input({ leaf: { interior: {} } }), rollouts: new Map() })).toEqual(unchanged);
  });

  it('honors manual pair layout, a shifted seam, separate slides and typed pair positions without overlaps', () => {
    const args = input({ width: 36, x: 24, z: 40, leaf: { face: face('pair_door') },
      rollouts: { count: 2, layout: 'pair', items: [{ at: 2 }, { slideId: 'accuride-3832' }] } });
    args.faces[0].width -= 2;
    args.faces[1].x -= 2;
    args.faces[1].width += 2;
    const entry = sectionRollouts(args).get('r');
    expect(entry).toMatchObject({ layout: 'pair', layoutSource: 'manual', warnings: [] });
    expect(entry.rollouts[0]).toMatchObject({ at: 2, zSource: 'manual', column: { x: 24.75, width: 15.25 } });
    expect(entry.rollouts[1]).toMatchObject({ at: 0.5625, zSource: 'auto', width: 17,
      clips: null, column: { x: 40, width: 19.25 } });
    expect(entry.top).toBe(entry.rollouts[0].z + 4.25 + 0.25);
  });

  it('uses only nearby side hinge edges for spacers and leaves actions and horizontal hinges clear', () => {
    for (const extra of [{ hinge: 'top' }, { hinge: 'bottom' },
      ...['pocket', 'sliding', 'flipper', 'pullout'].map((action) => ({ action }))]) {
      expect(root({ leaf: { face: face('door', extra) } }).rollouts[0])
        .toMatchObject({ spacers: { left: 0, right: 0 }, width: 22, warnings: [] });
    }
    const args = input();
    args.faces[0].x += 3;
    expect(sectionRollouts(args).get('r').rollouts[0].spacers).toEqual({ left: 0, right: 0 });
    args.faces[0].x = args.interior.sections[0].x - 2;
    expect(sectionRollouts(args).get('r').rollouts[0].spacers).toEqual({ left: 1.25, right: 0 });
  });

  it('falls through missing slide picks and warns on no fitting length, narrow widths and spaces outside the zone', () => {
    const missing = root({ leaf: { drawerSlideId: 'gone-cabinet' },
      rollouts: { count: 1, items: [{ slideId: 'gone-item', at: 0 }] } });
    expect(missing.rollouts[0]).toMatchObject({ slideId: 'blum-562h', source: 'room', at: 0 });
    expect(missing.rollouts[0].warnings).toEqual([
      { code: 'slide-missing', level: 'box', slideId: 'gone-item' },
      { code: 'slide-missing', level: 'cabinet', slideId: 'gone-cabinet' }, { code: 'rollout-outside' },
    ]);
    const shallow = root({ depth: 8 });
    expect(shallow.rollouts[0]).toMatchObject({ depth: null, depthAuto: null, slideLength: null });
    expect(codes(shallow)).toContain('no-slide-length');
    expect(codes(root({ width: 3 }))).toContain('rollout-too-narrow');
    expect(codes(root({ rollouts: { count: 1, items: [{ at: 28 }] } }))).toContain('rollout-outside');
  });

  it('spaces multiple autos between typed boxes and warns when a run has negative gaps', () => {
    const entry = root({ rollouts: { count: 5, items: [{ at: 1 }, {}, {}, { at: 20 }, {}] } });
    expect(entry.rollouts.map(({ at }) => at)).toEqual([1, 7.333333333333334, 13.666666666666668, 20, 24.5]);
    const crowded = root({ rollouts: { count: 8 } });
    expect(codes(crowded)).toContain('rollouts-dont-fit');
    expect(codes(crowded)).toContain('rollouts-overlap');
    const custom = { ...settings, rolloutHeight: 3, rolloutSpacer: 1,
      slides: [{ ...BUILT_IN_SLIDES[0], minBelow: 1 }] };
    expect(root({ settings: custom }).rollouts[0]).toMatchObject({ height: 3, at: 1, width: 21 });
    expect(sectionRollouts({ ...input(), settings: undefined }).get('r').rollouts[0])
      .toMatchObject({ height: 4.25, slideId: 'blum-562h', at: 0.5625, spacers: { left: 1.25, right: 0 } });
  });

  it('uses the highest space top for typed shelf counts and clamps exhausted shelf zones to zero height', () => {
    const args = input({ leaf: { interior: { rollouts: { count: 2 }, shelves: { count: 1 } } } });
    expect(shelves(args)).toMatchObject({ count: 1, countSource: 'manual', zone: { height: 9.71875 },
      gap: 4.484375, lineBore: true });
    const outside = input({ rollouts: { count: 1, items: [{ at: 28 }] } });
    expect(shelves(outside)).toMatchObject({ count: 0, zone: { z: 33.25, height: 0 }, lineBore: false });
  });

  it('shares one interiors and drawer pass for wall roll-outs and shelves on either wall face', () => {
    const room = roomWith([{ id: 'a', interior: { rollouts: { count: 2 } },
      face: stack(face('drawer_front', { size: 5.875 }), face()) }, { id: 'b', interior: {} }]);
    const wall = room.walls[0];
    const second = structuredClone(wall.runs[0]);
    second.id = 'run2';
    second.x = 0;
    second.z = 40;
    second.width = 24;
    second.grid = gridFromItems('run2', [{ id: 'c', kind: 'cabinet', width: null, face: face(),
      interior: { rollouts: { count: 1 } } }]);
    wall.runs.push(second);
    const before = structuredClone(room);
    for (const resolve of [wallRollouts, wallShelves]) {
      const spies = [vi.spyOn(interiorsModule, 'wallInteriors'), vi.spyOn(drawerBoxesModule, 'wallDrawerBoxes'),
        vi.spyOn(partsModule, 'elevationParts'), vi.spyOn(scenesModule, 'runScene')];
      let result;
      try {
        result = resolve(room, wall, 'front', settings);
        expect(spies.map((spy) => spy.mock.calls.length)).toEqual([1, 1, 1, 4]);
      } finally {
        spies.forEach((spy) => spy.mockRestore());
      }
      expect([...result.keys()]).toEqual(['a', 'b', 'c']);
      if (resolve === wallRollouts) {
        expect(result.get('a').get('r')).toMatchObject({ zone: { z: 4.75, height: 23.5625 } });
        expect(result.get('b').size).toBe(0);
        expect(result.get('c').get('r').rollouts[0]).toMatchObject({ x: 2.25, z: 41.3125 });
      } else {
        expect(result.get('a').get('r')).toMatchObject({ count: 0, lineBore: false });
        expect(result.get('b').get('r')).toMatchObject({ count: 1, zone: { z: 4.75, height: 29 } });
        expect(result.get('c').get('r')).toMatchObject({ count: 1, zone: { z: 45.8125, height: 23.9375 } });
      }
      expect(resolve(room, wall, 'back', settings).size).toBe(0);
    }
    expect(room).toEqual(before);
    wall.runs.forEach((run) => { run.wallSide = 'back'; });
    expect([...wallRollouts(room, wall, 'back', settings).keys()]).toEqual(['a', 'b', 'c']);
  });
});
