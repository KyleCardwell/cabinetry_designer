import { describe, expect, it, vi } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import {
  cabinetDrawerBoxes, cabinetDrawerBoxesFor, drawerBoxHeights, isPrefinishedMaple, isTallDrawerBox,
  wallDrawerBoxes,
} from '../index.js';
import { boxConstruction } from '../boxConstruction.js';
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
    for (const [height, expected] of [[3.625, []], [5.25, ['drawer-height-too-tall']],
      [16.125, ['drawer-height-too-tall', 'drawer-box-tall']]]) {
      face.children[0].drawerBox = { height };
      const top = sized({ face }).boxes[0];
      expect(top).toMatchObject({ height, heightSource: 'manual' });
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
      const upper = sized({ width: 30, height: 30, depth: 12, face: drawer(), leaf: { drawerSlideId: slideId } }).boxes[0];
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
