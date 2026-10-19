import { describe, expect, it, vi } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import {
  cabinetDrawerBoxes, cabinetDrawerBoxesFor, drawerBoxHeights, isPrefinishedMaple, isTallDrawerBox,
  wallDrawerBoxes,
  DRAWER_RULES, ruleSlide, sinkDepth, chargingDepth,
} from '../index.js';
import { boxConstruction } from '../boxConstruction.js';
import { rotDepth } from '../drawerRules.js';
import { cabinetFaces, faceArea } from '../faces.js';
import { faceOpenings } from '../frames.js';
import { gridFromItems } from '../grid.js';
import { placeInterior, resolveInterior } from '../interiors.js';
import { BUILT_IN_SLIDES } from '../slides.js';
import * as elevationPartsModule from '../elevationParts.js';
import * as runSceneModule from '../runScene.js';

describe('IN4a drawer box preset heights', () => {
  it('gives the ProBox presets by default: 2 1/4..10 1/4, then 11 1/8..22 1/8, by 1"', () => {
    const heights = drawerBoxHeights(DEFAULT_SETTINGS);
    expect(heights).toHaveLength(21);
    expect(heights.slice(0, 3)).toEqual([2.25, 3.25, 4.25]);
    expect(heights.slice(7, 11)).toEqual([9.25, 10.25, 11.125, 12.125]);
    expect(heights.at(-1)).toBe(22.125);
    expect(drawerBoxHeights(undefined)).toEqual(heights);
  });

  it('follows overrides, never passes the tallest box, and survives a bad step', () => {
    expect(drawerBoxHeights({ drawerBoxHeights: { max: 15.125 } }).at(-1)).toBe(15.125);
    expect(drawerBoxHeights({ drawerBoxHeights: { max: 8.25 } })).toEqual([2.25, 3.25, 4.25, 5.25, 6.25, 7.25, 8.25]);
    expect(drawerBoxHeights({ drawerBoxHeights: { step: 0.5, to: 4.25, max: 12.125 } }))
      .toEqual([2.25, 2.75, 3.25, 3.75, 4.25, 11.125, 11.625, 12.125]);
    expect(drawerBoxHeights({ drawerBoxHeights: { step: 0 } })).toEqual(drawerBoxHeights(DEFAULT_SETTINGS));
  });

  it('warns above 15 1/8" (the standard ROT box) only', () => {
    expect(isTallDrawerBox(15.125, DEFAULT_SETTINGS)).toBe(false);
    expect(isTallDrawerBox(16.125, DEFAULT_SETTINGS)).toBe(true);
    expect(isTallDrawerBox(16.125, { drawerBoxHeights: { warnAbove: 22.125 } })).toBe(false);
  });
});

const settings = { ...DEFAULT_SETTINGS, slides: BUILT_IN_SLIDES, drawerSlideId: 'blum-562h' };
const drawer = (size = null, drawerBox) => ({ type: 'drawer_front', size, ...(drawerBox ? { drawerBox } : {}) });
const stack = (...children) => ({ direction: 'vertical', size: null, children });
const base = () => stack(drawer(5.875), drawer(), drawer());
const euro = { top: 0.125, bottom: 0.125, left: 0.0625, right: 0.0625, horizontal: 0.125, vertical: 0.125 };
const framed = { top: 1.5, bottom: 1.5, left: 0.75, right: 0.75, horizontal: 1.5, vertical: 1.5, fit: 0 };
function input({ face = base(), width = 18, height = 30.5, depth = 24, inset = false,
  leaf: patch = {}, prefinishedMaple = false, reveals = inset ? framed : euro, x = 0, z = 0 } = {}) {
  const leaf = { id: 'cabinet', kind: 'cabinet', face, ...patch };
  const box = { x, z, width, height, depth };
  const { faces } = cabinetFaces(leaf, box, CABINET_TYPE_IDS.BASE, settings, reveals);
  const interior = placeInterior({ box, ...resolveInterior(leaf.interior, box, boxConstruction(leaf), settings) });
  return { faces, openings: faceOpenings(face, faceArea(box, reveals), reveals), reveals,
    inset, interior, leaf, settings, prefinishedMaple };
}
const sized = (options) => cabinetDrawerBoxes(input(options));
const codes = (box) => box.warnings.map(({ code }) => code);

describe('IN5 step b drawer box sizing', () => {
  it('anchor 1: clips Euro spaces to the box and matches equal fronts down', () => {
    const args = input();
    const before = structuredClone(args);
    const { boxes, warnings } = cabinetDrawerBoxes(args);
    expect(boxes.map(({ frontHeight }) => frontHeight)).toEqual([5.875, 12.0625, 12.0625]);
    expect(boxes[0]).toMatchObject({ space: { x: 0.75, z: 24.4375, width: 16.5, height: 5.3125 },
      available: 4.5, height: 4.25, heightAuto: 4.25, heightSource: 'auto', z: 25 });
    expect(boxes[1]).toMatchObject({ available: 11.375, heightAuto: 11.125, height: 10.25, heightSource: 'matched' });
    expect(boxes[2]).toMatchObject({ space: { z: 0.75, height: 11.5 }, height: 10.25, heightSource: 'auto' });
    boxes.forEach((box) => expect(box).toMatchObject({ width: 16, depth: 21, depthAuto: 21,
      interiorDepth: 23, x: 1, slideId: 'blum-562h', source: 'room', maple: false }));
    expect(warnings).toEqual([]);
    expect(args).toEqual(before);
  });

  it('anchor 2: matches the two 8-inch fronts and gives back the absent bottom', () => {
    const face = stack(drawer(), drawer(8), drawer(8));
    const { boxes } = sized({ face });
    expect(boxes.map(({ height }) => height)).toEqual([12.125, 6.25, 6.25]);
    expect(boxes[0].frontHeight).toBe(14);
    expect(boxes[1]).toMatchObject({ heightAuto: 7.25, heightSource: 'matched' });
    expect(boxes[2].space).toMatchObject({ z: 0.75, height: 7.4375 });
    expect(sized({ face, leaf: { box: { bottom: 'none' } } }).boxes.map(({ height }) => height))
      .toEqual([12.125, 7.25, 7.25]);
  });

  it('anchor 3: uses frame openings and never adds maple clearance to face frame boxes', () => {
    for (const prefinishedMaple of [false, true]) {
      const { boxes } = sized({ face: stack(drawer(5), drawer(), drawer()), inset: true, prefinishedMaple });
      expect(boxes.map(({ space }) => space.z)).toEqual([24, 12.75, 1.5]);
      expect(boxes.map(({ space }) => space.height)).toEqual([5, 9.75, 9.75]);
      expect(boxes.map(({ height }) => height)).toEqual([3.25, 8.25, 8.25]);
      boxes.forEach((box) => expect(box).toMatchObject({ width: 16, maple: false }));
    }
  });

  it('anchor 4: sizes from cabinet and box slides and warns on a missing cabinet pick', () => {
    const leaf = { drawerSlideId: 'accuride-3832' };
    const cabinet = sized({ leaf }).boxes;
    cabinet.forEach((box) => expect(box).toMatchObject({ width: 15.5, depth: 22, source: 'cabinet' }));
    expect(cabinet.map(({ height }) => height)).toEqual([4.25, 10.25, 10.25]);
    const face = base();
    face.children[0].drawerBox = { slideId: 'blum-562h' };
    const mixed = sized({ leaf, face }).boxes;
    expect(mixed[0]).toMatchObject({ width: 16, depth: 21, source: 'box' });
    expect(mixed[1]).toMatchObject({ width: 15.5, depth: 22, source: 'cabinet' });
    const missing = sized({ leaf: { drawerSlideId: 'gone' } });
    expect(missing.boxes.map(({ height, width, depth }) => [height, width, depth]))
      .toEqual([[4.25, 16, 21], [10.25, 16, 21], [10.25, 16, 21]]);
    expect(missing.warnings).toEqual(missing.boxes.map(({ path }) => ({
      code: 'slide-missing', level: 'cabinet', slideId: 'gone', path,
    })));
  });

  it('anchor 5: keeps typed heights, matches auto twins, and warns for excess and tall boxes', () => {
    const face = base();
    face.children[2].drawerBox = { height: 9.25 };
    const boxes = sized({ face }).boxes;
    expect(boxes[2]).toMatchObject({ height: 9.25, heightSource: 'manual', heightAuto: 10.25 });
    expect(boxes[1]).toMatchObject({ height: 9.25, heightSource: 'matched' });
    // The middle box (9 1/4) tops out at 22 1/16, so the top box may drop to 22 7/8 (1/4 + 9/16 clear);
    // its ceiling is 29 1/2 (the box top's underside less 1/4): 6 5/8 at most.
    for (const [height, z, expected] of [[3.625, 25, []], [5.25, 24.25, []], [6.25, 23.25, []],
      [7.25, 22.875, ['drawer-height-too-tall']], [16.125, 22.875, ['drawer-height-too-tall', 'drawer-box-tall']]]) {
      face.children[0].drawerBox = { height };
      const top = sized({ face }).boxes[0];
      expect(top).toMatchObject({ height, heightSource: 'manual', z, maxHeight: 6.625 });
      expect(codes(top)).toEqual(expected);
    }
  });

  it('anchor 6: keeps typed depth and chooses only nominal lengths that fit the interior', () => {
    for (const [depth, warnings] of [[18, []], [24, ['drawer-too-deep']]]) {
      const face = base();
      face.children[2].drawerBox = { depth };
      const bottom = sized({ face }).boxes[2];
      expect(bottom).toMatchObject({ depth, depthAuto: 21 });
      expect(codes(bottom)).toEqual(warnings);
    }
    for (const [slideId, expected, short] of [['blum-562h', 9, null], ['accuride-3832', 10, 8]]) {
      const upper = sized({ width: 30, height: 30, depth: 12, face: drawer(null, { slideId }) }).boxes[0];
      expect(upper).toMatchObject({ interiorDepth: 11, depth: expected });
      const shallow = sized({ depth: 8, face: drawer(), leaf: { drawerSlideId: slideId, box: { back: 'none' } } }).boxes[0];
      expect(shallow).toMatchObject({ interiorDepth: 8, depth: short, depthAuto: short });
      expect(codes(shallow)).toEqual(short === null ? ['no-slide-length', 'drawer-box-tall'] : ['drawer-box-tall']);
    }
  });

  it('anchor 7: uses partition sections and warns for side-by-side drawers without a partition', () => {
    const face = { direction: 'horizontal', size: null, children: [drawer(), drawer()] };
    const interior = { direction: 'horizontal', children: [{}, {}], dividers: [{ kind: 'double_partition' }] };
    const divided = sized({ width: 36, face, leaf: { interior } });
    expect(divided.boxes.map(({ space }) => [space.x, space.width])).toEqual([[0.75, 16.5], [18.75, 16.5]]);
    expect(divided.boxes.map(({ x, width }) => [x, width])).toEqual([[1, 16], [19, 16]]);
    expect(divided.warnings).toEqual(divided.boxes.map(({ path }) => ({ code: 'drawer-box-tall', path })));
    const shared = sized({ width: 36, face });
    shared.boxes.forEach((box) => {
      expect(box).toMatchObject({ width: 34, space: { width: 34.5 } });
      expect(codes(box)).toEqual(['drawers-share-section', 'drawer-box-tall']);
    });
  });

  it('anchor 8: recognizes prefinished maple and centres the extra sixteenth', () => {
    expect(['Prefinished Maple', 'pre-finished maple ply', 'Maple', ''].map(isPrefinishedMaple))
      .toEqual([true, true, false, false]);
    expect(isPrefinishedMaple(null)).toBe(false);
    sized({ prefinishedMaple: true }).boxes.forEach((box) => expect(box)
      .toMatchObject({ width: 16.0625, x: 0.96875, maple: true }));
    const args = input();
    args.settings = { ...settings, slides: [{ ...BUILT_IN_SLIDES[0], sideClearance: 0.253 }] };
    expect(cabinetDrawerBoxes(args).boxes[0].width).toBe(16);
  });

  it('anchor 9: leaves a front with no fitting preset unsized', () => {
    const { boxes } = sized({ face: stack(drawer(5.875), drawer(2.5), drawer()) });
    expect(boxes[1]).toMatchObject({ space: { height: 2.625 }, available: 1.8125,
      height: null, heightAuto: null, heightSource: 'auto' });
    expect(codes(boxes[1])).toEqual(['drawer-too-short']);
  });

  it('handles shared frame openings, section bounds, rounded matching and differing typed twins', () => {
    const face = { ...stack(drawer(), drawer()), noRail: [0] };
    const args = input({ face, inset: true, reveals: { ...framed, fit: 0.0625, shared: 0.125 } });
    expect(args.openings).toHaveLength(1);
    const shared = cabinetDrawerBoxes(args);
    expect(shared.boxes[0].space.height).toBe(args.faces[0].height + 0.125);
    expect(shared.boxes[1].space.height).toBe(args.faces[1].height + 0.125);
    const outside = input();
    outside.faces[0].z = 100;
    outside.faces.push({ ...outside.faces[1], path: 'door', type: 'door', action: 'pullout' },
      { ...outside.faces[1], path: 'false', type: 'false_front' },
      { ...outside.faces[1], path: 'panel', type: 'panel' },
      { ...outside.faces[1], path: 'open', type: 'open' });
    expect(cabinetDrawerBoxes(outside).boxes).toHaveLength(2);
    expect(cabinetDrawerBoxes(outside).warnings).toEqual([{ code: 'drawer-outside-box', path: 'r.0' }]);
    const shelf = { direction: 'vertical', children: [{}, {}], dividers: [{ kind: 'stretcher', at: 25 }] };
    expect(sized({ leaf: { interior: shelf } }).boxes[0].space).toMatchObject({ z: 25.375, height: 4.375 });
    const twins = input({ face: stack(drawer(8, { height: 3.625 }), drawer(8, { height: 4.25 }), drawer()) });
    twins.faces[1].height += 0.001;
    twins.faces[2].height = 8;
    const differing = cabinetDrawerBoxes(twins).boxes;
    expect(differing.map(({ height }) => height)).toEqual([3.625, 4.25, 3.625]);
    differing.forEach((box) => expect(codes(box)).toContain('drawer-heights-differ'));
    const tiny = input({ face: drawer(null, { height: 1 }), height: 3.5 });
    expect(cabinetDrawerBoxes(tiny).boxes[0]).toMatchObject({ height: 1, heightAuto: null, heightSource: 'manual' });
    expect(cabinetDrawerBoxes(tiny).warnings).toEqual([]);
  });

  it('wraps multiple cabinets with shared passes, effective material, own style and wall coordinates', () => {
    const leaves = [
      { id: 'a', kind: 'cabinet', face: base() },
      { id: 'b', kind: 'cabinet', face: base(), style: { cabinetStyleId: 14 } },
      { id: 'c', kind: 'cabinet', face: { type: 'door', size: null } },
    ];
    const run = {
      id: 'run', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 24, width: 54, z: 4, height: 30.5, depth: 24,
      ends: { left: { type: 'none' }, right: { type: 'none' } },
      autoCount: false, maxCabinetWidth: null, heightMode: 'manual', overrides: {},
      anchors: { left: false, right: false }, grid: gridFromItems('run', leaves.map((leaf) => ({ ...leaf, width: null }))),
    };
    const wall = { id: 'wall', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5,
      flipped: false, connections: { start: null, end: null }, profile: {}, runs: [run], openings: [] };
    const room = { id: 'room', profile: { ...DEFAULT_SETTINGS.defaultProfile }, walls: [wall], wallOrder: ['wall'],
      reportParts: { a: { boxes: 'Maple' } } };
    const effective = { ...settings, report: { ...settings.report, boxMaterial: 'Prefinished Maple' } };
    const before = structuredClone(room);
    const partsSpy = vi.spyOn(elevationPartsModule, 'elevationParts');
    const sceneSpy = vi.spyOn(runSceneModule, 'runScene');
    let result;
    try {
      result = wallDrawerBoxes(room, wall, 'front', effective);
      expect(partsSpy).toHaveBeenCalledTimes(1);
      // One scene pass for elevationParts and one for face layouts, shared by all cabinets.
      expect(sceneSpy).toHaveBeenCalledTimes(2);
    } finally {
      partsSpy.mockRestore();
      sceneSpy.mockRestore();
    }
    expect([...result.keys()]).toEqual(['a', 'b']);
    expect(result.get('a')).toMatchObject({ runId: 'run', boxes: [{ x: 25, z: 28.875, width: 16, maple: false }, {}, {}] });
    expect(result.get('b').boxes[0].maple).toBe(false);
    delete room.reportParts.a;
    expect(cabinetDrawerBoxesFor(room, wall, 'front', effective, 'a').boxes[0])
      .toMatchObject({ x: 24.96875, width: 16.0625, maple: true });
    for (const id of ['c', 'missing']) expect(cabinetDrawerBoxesFor(room, wall, 'front', effective, id)).toBeNull();
    expect(wallDrawerBoxes(room, wall, 'back', effective).size).toBe(0);
    expect(before.reportParts.a.boxes).toBe('Maple');
    expect({ ...room, reportParts: before.reportParts }).toEqual(before);
  });
});

describe('IN6 step b drawer rules', () => {
  it('anchor 1: changes only tall shallow fronts to Accuride and retains IN5 heights', () => {
    const { boxes, warnings } = sized({ depth: 12 });
    expect(boxes[0]).toMatchObject({ slideId: 'blum-562h', depth: 9, width: 16, slideRule: null });
    for (const box of boxes.slice(1)) expect(box).toMatchObject({ slideId: 'accuride-3832',
      source: 'rule', slideRule: 'DRW-002', depth: 10, width: 15.5 });
    expect(boxes.map(({ height }) => height)).toEqual([4.25, 10.25, 10.25]);
    expect(warnings).toEqual([]);
  });

  it('anchor 2: respects box picks, side mounts, the 15-inch threshold and typed depth', () => {
    const face = base();
    face.children[2].drawerBox = { slideId: 'blum-562h' };
    expect(sized({ depth: 12, face }).boxes[2]).toMatchObject({ slideId: 'blum-562h',
      source: 'box', depth: 9, slideRule: null });
    sized({ depth: 12, leaf: { drawerSlideId: 'accuride-4034' } }).boxes.forEach((box) => {
      expect(box).toMatchObject({ slideId: 'accuride-4034', source: 'cabinet', slideRule: null });
    });
    sized({ depth: 16 }).boxes.forEach((box) => expect(box).toMatchObject({ slideId: 'blum-562h',
      source: 'room', depth: 15, slideRule: null }));
    face.children[2].drawerBox = { depth: 14 };
    expect(sized({ face }).boxes[2]).toMatchObject({ slideId: 'accuride-3832', source: 'rule',
      slideRule: 'DRW-002', depth: 14, depthSource: 'manual', depthRule: null, width: 15.5, slideLength: 14 });
  });

  it('anchor 3: sizes file fronts by their front dimensions, with manual height taking precedence', () => {
    const face = stack(drawer(5.875), drawer());
    const leaf = { purpose: 'file' };
    const { boxes } = sized({ face, leaf });
    expect(boxes[0]).toMatchObject({ slideId: 'blum-562h', height: 4.25, width: 16, depth: 21 });
    expect(boxes[1]).toMatchObject({ frontHeight: 24.25, slideId: 'accuride-3832', source: 'rule',
      slideRule: 'DRW-003', height: 10.25, heightSource: 'rule', heightRule: 'DRW-003',
      width: 15.5, depth: 22, z: 1.3125, clips: null });
    const wide = sized({ face, leaf, width: 30 }).boxes;
    expect(wide[0].width).toBe(28);
    expect(wide[1]).toMatchObject({ slideId: 'accuride-4034', frontHeight: 24.25,
      width: 27.5, depth: 22, slideRule: 'DRW-003' });
    const ordinary = sized({ face }).boxes[1];
    expect(ordinary).toMatchObject({ slideId: 'blum-562h', height: 22.125, slideRule: null, heightRule: null });
    expect(codes(ordinary)).toEqual(['drawer-box-tall']);
    expect(sized({ leaf }).boxes.map(({ height, width, depth }) => [height, width, depth]))
      .toEqual([[4.25, 16, 21], [10.25, 16, 21], [10.25, 16, 21]]);
    expect(sized({ face, leaf: { ...leaf, drawerSlideId: 'accuride-4034' } }).boxes[1])
      .toMatchObject({ slideId: 'accuride-3832', source: 'rule', slideRule: 'DRW-003' });
    face.children[1].drawerBox = { height: 9.25, slideId: 'blum-562h' };
    expect(sized({ face, leaf }).boxes[1]).toMatchObject({ height: 9.25, heightSource: 'manual',
      heightRule: null, slideId: 'blum-562h', slideRule: null });
  });

  it('anchor 4: reduces sink depth from the standard length and retains notes on manual depths', () => {
    const leaf = { purpose: 'sink', box: { top: 'spreaders' } };
    const sink = sized({ leaf });
    expect(sink.notes).toEqual([{ rule: 'DRW-006', text: 'notch drw around plumbing' }]);
    expect(sink.boxes.map(({ height }) => height)).toEqual(sized({ leaf: { box: leaf.box } }).boxes.map(({ height }) => height));
    for (const drawerSlideId of ['blum-562h', 'accuride-3832']) {
      sized({ leaf: { ...leaf, drawerSlideId } }).boxes.forEach((box) => expect(box).toMatchObject({
        depth: 18, depthSource: 'rule', depthRule: 'DRW-006', notes: ['notch drw around plumbing'],
      }));
    }
    const face = base();
    face.children[2].drawerBox = { depth: 20 };
    expect(sized({ face, leaf }).boxes[2]).toMatchObject({ depth: 20, depthSource: 'manual',
      depthRule: null, notes: ['notch drw around plumbing'] });
    const outside = input({ leaf });
    outside.faces.forEach((front) => { front.z = 100; });
    expect(cabinetDrawerBoxes(outside).notes).toEqual([]);
  });

  it('anchor 5: reserves charging clearance and warns when a typed depth consumes it', () => {
    const face = base();
    face.children[0].drawerBox = { charging: true };
    const blum = sized({ face });
    expect(blum.boxes[0]).toMatchObject({ slideId: 'blum-562h', charging: true,
      depth: 21, depthSource: 'rule', depthRule: 'DRW-008', slideRule: null });
    expect(blum.warnings).toEqual([]);
    const leaf = { drawerSlideId: 'accuride-3832' };
    const side = sized({ face, leaf });
    expect(side.boxes[0]).toMatchObject({ depth: 20, depthSource: 'rule', depthRule: 'DRW-008' });
    expect(side.boxes.slice(1).map(({ depth }) => depth)).toEqual([22, 22]);
    face.children[0].drawerBox.depth = 22;
    const typed = sized({ face, leaf });
    expect(typed.boxes[0]).toMatchObject({ depth: 22, depthSource: 'manual', depthRule: null });
    expect(typed.warnings).toEqual([{ code: 'charging-clearance', path: 'r.0' }]);
  });

  it('anchor 6: selects clips by cabinet style and notes stabilizers only above 36-inch fronts', () => {
    sized().boxes.forEach((box) => expect(box.clips).toBe('standard'));
    sized({ face: stack(drawer(5), drawer(), drawer()), inset: true }).boxes
      .forEach((box) => expect(box.clips).toBe('adjustable'));
    sized({ leaf: { drawerSlideId: 'accuride-3832' } }).boxes.forEach((box) => expect(box.clips).toBeNull());
    expect(sized({ width: 42 }).notes).toEqual([{ rule: 'BOX-007', text: 'drawer stabilizers' }]);
    expect(sized({ width: 36 }).notes).toEqual([]);
    expect(sized({ width: 42, leaf: { purpose: 'sink' } }).notes).toEqual([
      { rule: 'DRW-006', text: 'notch drw around plumbing' }, { rule: 'BOX-007', text: 'drawer stabilizers' },
    ]);
  });

  it('exposes pure reusable rules with strict slide thresholds and no rules for pull-out boxes', () => {
    const baseRule = { kind: 'drawer', purpose: 'file', front: { height: 13, width: 24 },
      inheritedSlide: BUILT_IN_SLIDES[0], depth: 14 };
    expect(DRAWER_RULES.fileHeight).toBe(10.25);
    expect(ruleSlide(baseRule)).toEqual({ slideId: 'accuride-3832', rule: 'DRW-003' });
    expect(ruleSlide({ ...baseRule, front: { height: 13, width: 24.001 } }))
      .toEqual({ slideId: 'accuride-4034', rule: 'DRW-003' });
    expect(ruleSlide({ ...baseRule, front: { height: 12.999, width: 30 }, depth: 15 })).toBeNull();
    expect(ruleSlide({ ...baseRule, purpose: null, front: { height: 5.875, width: 18 } })).toBeNull();
    expect(ruleSlide({ ...baseRule, purpose: null, front: { height: 5.876, width: 18 } }))
      .toEqual({ slideId: 'accuride-3832', rule: 'DRW-002' });
    expect(ruleSlide({ ...baseRule, purpose: null, depth: null })).toBeNull();
    for (const kind of ['rot', 'hamper']) expect(ruleSlide({ ...baseRule, kind })).toBeNull();
    expect(sinkDepth(BUILT_IN_SLIDES[1], 22)).toBe(18);
    expect(chargingDepth(BUILT_IN_SLIDES[1], 23)).toBe(20);
    expect(sinkDepth(BUILT_IN_SLIDES[0], null)).toBeNull();
  });

  it('falls through missing rule slides with a rule-level warning and no resolved slideRule', () => {
    const args = input({ depth: 12 });
    args.settings = { ...settings, slides: [BUILT_IN_SLIDES[0]] };
    const result = cabinetDrawerBoxes(args);
    result.boxes.slice(1).forEach((box) => expect(box).toMatchObject({ slideId: 'blum-562h',
      source: 'room', slideRule: null, depth: 9, width: 16 }));
    expect(result.warnings).toEqual(['r.1', 'r.2'].map((path) => ({ path,
      code: 'slide-missing', level: 'rule', slideId: 'accuride-3832' })));
    const file = input({ face: stack(drawer(5.875), drawer()), depth: 12,
      leaf: { purpose: 'file', drawerSlideId: 'accuride-4034' } });
    file.settings = { ...settings, slides: [BUILT_IN_SLIDES[0], BUILT_IN_SLIDES[2]] };
    expect(cabinetDrawerBoxes(file).boxes[1]).toMatchObject({ source: 'cabinet', slideRule: null,
      heightSource: 'rule', heightRule: 'DRW-003' });
    file.leaf.face.children[1].drawerBox = { slideId: 'missing-box-pick' };
    const picked = cabinetDrawerBoxes(file).boxes[1];
    expect(picked).toMatchObject({ source: 'cabinet', slideRule: null });
    expect(picked.warnings).toEqual([{ code: 'slide-missing', level: 'box', slideId: 'missing-box-pick' }]);
  });

  it('treats file rule heights as fixed matching picks, lowering auto twins but never rule twins', () => {
    const args = input({ face: stack(drawer(), drawer()), height: 50, leaf: { purpose: 'file' } });
    // Matching is based on rounded front height; one front sits just below the file threshold.
    args.faces[0].height = 13;
    args.faces[1].height = 12.999;
    const result = cabinetDrawerBoxes(args).boxes;
    expect(result[0]).toMatchObject({ height: 10.25, heightSource: 'rule', heightRule: 'DRW-003' });
    expect(result[1]).toMatchObject({ height: 10.25, heightSource: 'matched', heightRule: null });
    args.leaf.face.children[1].drawerBox = { height: 6.25 };
    const fixed = cabinetDrawerBoxes(args).boxes;
    expect(fixed[0]).toMatchObject({ height: 10.25, heightSource: 'rule' });
    expect(fixed[1]).toMatchObject({ height: 6.25, heightSource: 'manual' });
    fixed.forEach((box) => expect(codes(box)).toContain('drawer-heights-differ'));
  });

  it('combines sink and charging depths before slide selection and handles unsized and deep boxes', () => {
    const face = base();
    face.children[1].drawerBox = { charging: true };
    const args = input({ face, depth: 18, leaf: { purpose: 'sink' } });
    const before = structuredClone(args);
    const middle = cabinetDrawerBoxes(args).boxes[1];
    expect(middle).toMatchObject({ slideId: 'accuride-3832', slideRule: 'DRW-002',
      depth: 12, depthRule: 'DRW-006', slideLength: 12, charging: true });
    expect(args).toEqual(before);
    expect(sized({ face, depth: 17 }).boxes[1]).toMatchObject({ slideId: 'accuride-3832',
      slideRule: 'DRW-002', depth: 14, depthRule: 'DRW-008' });
    const shallow = sized({ face, depth: 10, leaf: { purpose: 'sink' } }).boxes[1];
    expect(shallow).toMatchObject({ depth: null, slideLength: null, depthRule: 'DRW-006' });
    expect(codes(shallow)).toContain('no-slide-length');
    face.children[1].drawerBox.depth = 24;
    const deep = sized({ face, leaf: { purpose: 'sink' } }).boxes[1];
    expect(codes(deep)).toEqual(['drawer-too-deep', 'charging-clearance']);
    expect(deep).toMatchObject({ depthSource: 'manual', depthRule: null, slideLength: 24 });
    expect(sized({ face: { type: 'door', action: 'pullout' }, leaf: { purpose: 'trash' } }).boxes[0])
      .toMatchObject({ kind: 'rot', slideRule: null });
  });
});

describe('IN6 step c ROT and hamper boxes', () => {
  const pullout = (size = null, drawerBox) => ({ type: 'door', action: 'pullout', size,
    ...(drawerBox ? { drawerBox } : {}) });
  const trash = (options = {}) => sized({ face: stack(drawer(5.875), pullout()),
    leaf: { purpose: 'trash' }, ...options });

  it('anchor 1: sizes the standard trash ROT independently of its top drawer', () => {
    const args = input({ face: stack(drawer(5.875), pullout()), leaf: { purpose: 'trash' } });
    const before = structuredClone(args);
    const { boxes, warnings } = cabinetDrawerBoxes(args);
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toMatchObject({ kind: 'drawer', height: 4.25, width: 16, depth: 21 });
    expect(boxes[1]).toMatchObject({ kind: 'rot', height: 15.125, heightSource: 'rule', heightRule: 'DRW-009',
      width: 16, depth: 22, depthSource: 'rule', depthRule: 'DRW-009', slideLength: 21,
      notes: ['bottom up 1 3/4"'], x: 1, z: 1.3125, clips: 'standard', charging: false, slideRule: null });
    expect(warnings).toEqual([]);
    expect(args).toEqual(before);
  });

  it('anchor 2: follows every ROT depth row using box dimensions, including exact boundaries', () => {
    for (const [width, expected] of [[15, 13], [24, 22], [30, 28]]) {
      expect(trash({ width }).boxes[1]).toMatchObject({ width: expected, depth: 21, notes: [] });
    }
    expect(trash({ depth: 25 }).boxes[1]).toMatchObject({ depth: 22, interiorDepth: 24,
      depthSource: 'rule', notes: ['bottom up 1 3/4"'] });
    expect(trash({ depth: 26 }).boxes[1]).toMatchObject({ depth: 24, slideLength: 24, notes: [] });
    const shallow = trash({ depth: 21 }).boxes[1];
    expect(shallow).toMatchObject({ depth: 18, depthSource: 'auto', depthRule: null, notes: [], slideRule: null });
    expect(codes(shallow)).toEqual(['rot-size-unlisted']);
    for (const width of [15, 17.999, 18, 23.999, 24, 30]) {
      expect(rotDepth(width, 23.999)).toBeNull();
      for (const depth of [24, 25, 25.999]) {
        expect(rotDepth(width, depth)).toEqual(width >= 18 && width < 24
          ? { depth: 22, note: 'bottom up 1 3/4"' } : { depth: 21, note: null });
      }
      expect(rotDepth(width, 26)).toEqual({ depth: 24, note: null });
    }
    // A rule depth, just like a typed depth, must fit the actual clear interior.
    const args = input({ face: pullout(), leaf: { purpose: 'trash' } });
    args.interior.sections[0].depth = 21;
    expect(codes(cabinetDrawerBoxes(args).boxes[0])).toContain('drawer-too-deep');
  });

  it('anchor 3: keeps ROT overrides and falls back to a shorter preset or an unsized box', () => {
    expect(trash({ face: stack(drawer(5.875), pullout(null, { depth: 21 })) }).boxes[1])
      .toMatchObject({ depth: 21, depthSource: 'manual', depthRule: null, notes: [] });
    expect(trash({ face: stack(drawer(5.875), pullout(null, { height: 12.125 })) }).boxes[1])
      .toMatchObject({ height: 12.125, heightSource: 'manual', heightRule: null });
    const short = trash({ face: stack(drawer(5.875), drawer(9), pullout()) }).boxes[2];
    expect(short).toMatchObject({ space: { z: 0.75, height: 14.5625 }, available: 13.75,
      height: 13.125, heightSource: 'rule', heightRule: 'DRW-009' });
    expect(codes(short)).toEqual(['rot-short']);
    const tiny = trash({ face: pullout(), height: 3.5 }).boxes[0];
    expect(tiny.height).toBeNull();
    expect(codes(tiny)).toEqual(['rot-short', 'drawer-too-short']);
    expect(codes(trash({ face: pullout(null, { height: 1 }), height: 3.5 }).boxes[0]))
      .not.toContain('rot-short');
  });

  it('anchor 4: places hampers at the top and checks both footprint orientations', () => {
    const options = { face: pullout(), leaf: { purpose: 'hamper' }, width: 24 };
    const hamper = sized(options).boxes[0];
    expect(hamper).toMatchObject({ kind: 'hamper', height: 6.25, heightSource: 'rule', heightRule: 'DRW-010',
      z: 23.25, width: 22, depth: 21, depthSource: 'auto', clearBelow: 22.5, warnings: [] });
    expect(codes(sized({ ...options, width: 18 }).boxes[0])).toEqual(['hamper-too-small']);
    expect(codes(sized({ ...options, width: 18, depth: 25 }).boxes[0])).toEqual([]);
    const manual = sized({ ...options, face: pullout(null, { height: 12.125, depth: 15 }) }).boxes[0];
    expect(manual).toMatchObject({ heightSource: 'manual', heightRule: null, depthSource: 'manual',
      z: 17.375, clearBelow: 16.625, warnings: [] });
  });

  it('anchor 5: warns for low hamper clearance and ignores other pull-out purposes and actions', () => {
    const low = sized({ width: 24, face: stack(drawer(5.875), drawer(9), pullout()),
      leaf: { purpose: 'hamper' } });
    expect(low.boxes[2]).toMatchObject({ z: 8.8125, clearBelow: 8.0625 });
    expect(codes(low.boxes[2])).toEqual(['hamper-clear-below']);
    expect(low.warnings).toContainEqual({ code: 'hamper-clear-below', path: 'r.2' });
    for (const purpose of [undefined, 'file', 'sink']) {
      expect(sized({ face: pullout(), leaf: { purpose } })).toEqual({ boxes: [], warnings: [], notes: [] });
    }
    for (const action of [undefined, 'swing', 'sliding']) {
      expect(sized({ face: { type: 'door', action, size: null }, leaf: { purpose: 'trash' } }).boxes).toEqual([]);
    }
    // A typed hamper too tall for its space still uses the existing drop-lower pass.
    const tall = sized({ width: 24, face: stack(pullout(null, { height: 25 }), drawer(5.875)),
      leaf: { purpose: 'hamper' } }).boxes[0];
    expect(tall.z).toBeGreaterThanOrEqual(0.75 + tall.slide.minBelow);
    expect(codes(tall)).toContain('drawer-height-too-tall');
  });

  it('excludes ROT and hamper boxes from matching and slide rules while retaining inherited slides and clips', () => {
    for (const [purpose, height] of [['trash', 15.125], ['hamper', 6.25]]) {
      const args = input({ face: stack(drawer(), pullout()), leaf: { purpose }, height: 50 });
      args.faces[1].height = args.faces[0].height;
      expect(cabinetDrawerBoxes(args).boxes.map(({ height }) => height)).toEqual([22.125, height]);
      args.leaf.face.children[1].drawerBox = { height: 4.25 };
      expect(cabinetDrawerBoxes(args).boxes.map(({ height }) => height)).toEqual([22.125, 4.25]);
      args.leaf.face.children[0].drawerBox = { height: 3.25 };
      const boxes = cabinetDrawerBoxes(args).boxes;
      expect(boxes.map(({ height }) => height)).toEqual([3.25, 4.25]);
      expect(boxes.flatMap(codes)).not.toContain('drawer-heights-differ');
      const shallow = sized({ face: pullout(), depth: 12, leaf: { purpose } }).boxes[0];
      expect(shallow).toMatchObject({ slideId: 'blum-562h', slideRule: null });
      expect(sized({ face: pullout(), inset: true, leaf: { purpose } }).boxes[0].clips).toBe('adjustable');
      expect(sized({ face: pullout(null, { slideId: 'accuride-3832' }), leaf: { purpose } }).boxes[0])
        .toMatchObject({ slideId: 'accuride-3832', source: 'box', slideRule: null, clips: null });
    }
  });

  it('anchor 5: retains cabinets with only ROT or hamper boxes in wall order and coordinates', () => {
    const leaves = ['trash', 'hamper', undefined].map((purpose, index) => ({ id: `c${index}`, kind: 'cabinet',
      purpose, face: pullout(), width: null }));
    const run = { id: 'run', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 24, width: 54, z: 4, height: 30.5, depth: 24,
      ends: { left: { type: 'none' }, right: { type: 'none' } }, autoCount: false, maxCabinetWidth: null,
      heightMode: 'manual', overrides: {}, anchors: { left: false, right: false }, grid: gridFromItems('run', leaves) };
    const wall = { id: 'wall', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5, flipped: false,
      connections: { start: null, end: null }, profile: {}, runs: [run], openings: [] };
    const room = { id: 'room', profile: { ...DEFAULT_SETTINGS.defaultProfile }, walls: [wall], wallOrder: ['wall'] };
    const result = wallDrawerBoxes(room, wall, 'front', settings);
    expect([...result.keys()]).toEqual(['c0', 'c1']);
    expect(result.get('c0')).toMatchObject({ runId: 'run', boxes: [{ kind: 'rot', x: 25, z: 5.3125 }] });
    expect(result.get('c0').boxes).toHaveLength(1);
    expect(result.get('c1')).toMatchObject({ boxes: [{ kind: 'hamper', x: 43, z: 27.25, clearBelow: 22.5 }] });
  });
});

describe('IN7.1 drawer box vertical adjustment', () => {
  it('lets a typed box up to 1/8 too tall fit (setting), never changing auto heights', () => {
    const face = base();
    face.children[2].drawerBox = { height: 9.25 };
    // The top box tops out at 6 5/8 (anchor 5).
    for (const [height, adjustment, expected] of [[6.6875, 0.0625, []], [6.75, 0.125, []],
      [6.8125, 0, ['drawer-height-too-tall']]]) {
      face.children[0].drawerBox = { height };
      const top = sized({ face }).boxes[0];
      expect(top.adjustment).toBeCloseTo(adjustment, 9);
      expect(codes(top)).toEqual(expected);
    }
    face.children[0].drawerBox = { height: 6.75 };
    const strict = cabinetDrawerBoxes({ ...input({ face }), settings: { ...settings, drawerBoxAdjustment: 0 } });
    expect(codes(strict.boxes[0])).toEqual(['drawer-height-too-tall']);
    expect(sized().boxes.map(({ height, adjustment }) => [height, adjustment])).toEqual([[4.25, 0], [10.25, 0], [10.25, 0]]);
  });
});
