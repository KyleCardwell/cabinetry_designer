import { describe, expect, it } from 'vitest';
import { auto, room, run, wall } from '../../../test/builders.js';
import { boxConstruction } from '../boxConstruction.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS, INTERIOR_DIVIDERS, INTERIOR_DIVIDER_LABELS } from '../constants.js';
import { cabinetDrawerBoxes } from '../drawerBoxes.js';
import { cabinetFaces } from '../faces.js';
import {
  isStoredInterior, setDividerBanding, setDividerDepth, setDividerKind, setDividerPosition, splitSection,
} from '../interiorTree.js';
import { placeInterior, resolveInterior } from '../interiors.js';
import { shelfZone } from '../shelves.js';
import { wallShowThrough } from '../showThrough.js';
import { BUILT_IN_SLIDES } from '../slides.js';

const box = { x: 30, z: 4, width: 24, height: 34.5, depth: 24 };
const construction = boxConstruction({ box: { top: 'between', bottom: 'between' } });
const settings = { ...DEFAULT_SETTINGS, slides: BUILT_IN_SLIDES, drawerSlideId: 'blum-562h' };
const resolve = (tree, dimensions = box, context) => resolveInterior(tree, dimensions, construction, settings, context);
const zones = (direction = 'vertical', count = 2) => splitSection({}, 'r', direction, count, 'zone');

describe('IN15b zone divider model', () => {
  it('appends Zone to both families, validates its stored picks and keeps the default split kinds', () => {
    expect(INTERIOR_DIVIDER_LABELS.zone).toBe('Zone');
    for (const direction of ['vertical', 'horizontal']) {
      expect(INTERIOR_DIVIDERS[direction].at(-1)).toBe('zone');
      expect(splitSection({}, 'r', direction, 2).dividers[0].kind)
        .toBe(direction === 'vertical' ? 'fixed' : 'partition');
      let tree = setDividerPosition(zones(direction), 'r', 0, 12, direction === 'horizontal' ? 'right' : undefined);
      tree = setDividerDepth(tree, 'r', 0, 100);
      expect(isStoredInterior(tree)).toBe(true);
      expect(setDividerBanding(tree, 'r', 0, true)).toBe(tree);
      expect(isStoredInterior({ ...tree, dividers: [{ ...tree.dividers[0], banding: false }] })).toBe(false);
      const before = structuredClone(tree);
      expect(resolve(tree).dividers[0]).toMatchObject({ depth: null, depthAuto: true, banding: null });
      expect(resolve(tree).warnings).not.toContainEqual({ code: 'divider-too-deep', path: 'r', index: 0 });
      expect(tree).toEqual(before);
      expect(setDividerDepth(tree, 'r', 0, null).dividers[0]).not.toHaveProperty('depth');
    }
  });

  it('anchor 1: auto up/down zone is at 17 1/4 with two 16 1/2 sections', () => {
    const result = resolve(zones());
    expect(result.dividers[0]).toMatchObject({ fromBottom: 17.25, z: 17.25, height: 0, dimFrom: 'bottom' });
    expect(result.sections.map(({ height }) => height)).toEqual([16.5, 16.5]);
    expect(result.physicalSections).toEqual([
      { key: 'r.0', x: 0.75, z: 0.75, width: 22.5, height: 33, depth: 23, members: ['r.0', 'r.1'] },
    ]);
    expect(result.sections.map(({ physical }) => physical)).toEqual(['r.0', 'r.0']);
  });

  it('anchor 2: changing to a fixed shelf keeps the centre and gives two 16 1/8 sections', () => {
    const tree = setDividerKind(zones(), 'r', 0, 'fixed');
    const result = resolve(tree);
    expect(result.dividers[0].fromBottom).toBe(17.25);
    expect(result.sections.map(({ height }) => height)).toEqual([16.125, 16.125]);
    expect(result.physicalSections.map(({ members }) => members)).toEqual([['r.0'], ['r.1']]);
  });

  it('anchor 3: a zone typed at 30 3/4 leaves 30 below and 3 above', () => {
    const result = resolve(setDividerPosition(zones(), 'r', 0, 30.75));
    expect(result.dividers[0]).toMatchObject({ fromBottom: 30.75, auto: false });
    expect(result.sections.map(({ height }) => height)).toEqual([3, 30]);
  });

  it('anchor 4: joins A and B across their zone, keeping C beyond a real shelf separate', () => {
    const tree = setDividerKind(zones('vertical', 3), 'r', 1, 'fixed');
    const result = resolve(tree);
    expect(result.physicalSections).toEqual([
      { key: 'r.0', x: 0.75, z: 12.25, width: 22.5, height: 21.5, depth: 23, members: ['r.0', 'r.1'] },
      { key: 'r.2', x: 0.75, z: 0.75, width: 22.5, height: 10.75, depth: 23, members: ['r.2'] },
    ]);
    expect(result.sections.map(({ physical }) => physical)).toEqual(['r.0', 'r.0', 'r.2']);
  });

  it('anchor 5: a sibling with a real partition resolves independently', () => {
    const tree = splitSection(zones(), 'r.1', 'horizontal', 2, 'partition');
    const result = resolve(tree);
    expect(result.physicalSections.map(({ key, members }) => ({ key, members }))).toEqual([
      { key: 'r.0', members: ['r.0'] },
      { key: 'r.1.0', members: ['r.1.0'] },
      { key: 'r.1.1', members: ['r.1.1'] },
    ]);
    expect(result.sections.map(({ path, physical }) => [path, physical]))
      .toEqual([['r.0', 'r.0'], ['r.1.0', 'r.1.0'], ['r.1.1', 'r.1.1']]);
    expect(result.dividers[1]).toMatchObject({ z: 0.75, height: 16.5 });
  });

  it('joins nested zone-only subtrees in outline order and places physical rectangles in wall coordinates', () => {
    let tree = splitSection(zones(), 'r.0', 'horizontal', 2, 'zone');
    tree = splitSection(tree, 'r.1', 'horizontal', 2, 'zone');
    const result = resolve(tree);
    expect(result.physicalSections).toEqual([
      { key: 'r.0.0', ...result.rect, depth: 23, members: ['r.0.0', 'r.0.1', 'r.1.0', 'r.1.1'] },
    ]);
    expect(result.sections.every(({ physical }) => physical === 'r.0.0')).toBe(true);
    const before = structuredClone(result);
    expect(placeInterior({ box, ...result }).physicalSections).toEqual([
      { ...result.physicalSections[0], x: 30.75, z: 4.75 },
    ]);
    expect(result).toEqual(before);
    const realTree = splitSection(tree, 'r.1.0', 'vertical', 2, 'fixed');
    expect(resolve(realTree).physicalSections.map(({ members }) => members))
      .toEqual([['r.0.0', 'r.0.1'], ['r.1.0.0'], ['r.1.0.1'], ['r.1.1']]);
  });

  it('anchor 6: drawer space crosses the zone and is bounded by its physical section', () => {
    const leaf = { ...auto('cabinet'), face: { type: 'drawer_front', size: null } };
    const reveals = { top: 0.125, bottom: 0.125, left: 0.0625, right: 0.0625, horizontal: 0.125, vertical: 0.125 };
    const { faces } = cabinetFaces(leaf, box, CABINET_TYPE_IDS.BASE, settings, reveals);
    const input = { faces, reveals, inset: false, leaf, settings };
    const interior = placeInterior({ box, ...resolve(zones()) });
    const actual = cabinetDrawerBoxes({ ...input, interior }).boxes[0];
    const unsplit = cabinetDrawerBoxes({ ...input, interior: placeInterior({ box, ...resolve({}) }) }).boxes[0];
    expect(actual).toEqual(unsplit);
    expect(actual.space).toEqual({ x: 30.75, z: 4.75, width: 22.5, height: 33 });
    expect(actual.space.z).toBeLessThan(4 + 17.25);
    expect(actual.space.z + actual.space.height).toBeGreaterThan(4 + 17.25);
  });

  it('clips drawers into every overlapping zone even when the space centre is in another zone', () => {
    const { sections } = resolve(zones());
    const boxes = [{ space: { x: 0.75, z: 10, width: 22.5, height: 10 } }];
    expect(shelfZone(sections[0], boxes)).toEqual({ z: 20, height: 13.75 });
    expect(shelfZone(sections[1], boxes)).toEqual({ z: 0.75, height: 9.25 });
    const columns = resolve(zones('horizontal'));
    expect(shelfZone(columns.sections[1], boxes)).toEqual({ z: 20, height: 13.75 });
    const outside = [{ space: { x: 23.25, z: 0.75, width: 10, height: 33 } }];
    expect(shelfZone(sections[0], outside)).toEqual({ z: 17.25, height: 16.5 });
  });

  it('keeps typed centres and depth through kind changes, removes banding and measures horizontal zones from either side', () => {
    for (const direction of ['vertical', 'horizontal']) {
      const kind = direction === 'vertical' ? 'fixed' : 'partition';
      let tree = setDividerPosition(zones(direction), 'r', 0, 8, direction === 'horizontal' ? 'right' : undefined);
      tree = setDividerDepth(setDividerKind(tree, 'r', 0, kind), 'r', 0, 10);
      if (direction === 'vertical') tree = setDividerBanding(tree, 'r', 0, false);
      const before = structuredClone(tree);
      const zoneTree = setDividerKind(tree, 'r', 0, 'zone');
      expect(zoneTree.dividers[0]).not.toHaveProperty('banding');
      expect(zoneTree.dividers[0]).toMatchObject({ at: 8, depth: 10 });
      expect(isStoredInterior(zoneTree)).toBe(true);
      const dimension = direction === 'vertical' ? 'fromBottom' : 'fromRight';
      expect(resolve(zoneTree).dividers[0][dimension]).toBe(8);
      expect(resolve(setDividerKind(zoneTree, 'r', 0, kind)).dividers[0]).toMatchObject({ [dimension]: 8, depth: 10 });
      expect(tree).toEqual(before);
    }
    expect(resolve(zones('horizontal')).dividers[0]).toMatchObject({ fromLeft: 12, width: 0, dimFrom: 'left' });
  });

  it('links zones to face seams without counting them as partitions or generating them automatically', () => {
    const dimensions = { ...box, width: 48 };
    const context = { faceTree: { type: 'pair_door', size: null }, faces: [
      { path: 'r', half: 'left', x: 30.125, z: 4.125, width: 23.75, height: 34.25 },
      { path: 'r', half: 'right', x: 54.125, z: 4.125, width: 23.75, height: 34.25 },
    ] };
    const tree = { ...zones('horizontal'), dividers: [{ kind: 'zone', seam: 'r:pair' }] };
    expect(isStoredInterior(tree)).toBe(true);
    const result = resolve(tree, dimensions, context);
    expect(result.dividers[0]).toMatchObject({ fromLeft: 24, linked: true, seam: 'r:pair', width: 0 });
    expect(result.warnings).toContainEqual({ code: 'wide-no-partition' });
    expect(resolve(undefined, dimensions, context).dividers.map(({ kind }) => kind)).toEqual(['partition']);
  });

  it('omits zone lines from show-through while retaining real dividers', () => {
    const tree = setDividerKind(zones('vertical', 3), 'r', 1, 'fixed');
    const cabinetRun = run({ width: 24, height: 34.5, autoCount: false,
      ends: { left: { type: 'none' }, right: { type: 'none' } },
      items: [{ ...auto('cabinet'), face: { type: 'open', size: null }, interior: tree }] });
    const cabinetWall = wall({ runs: [cabinetRun] });
    const built = room({ walls: [cabinetWall] });
    const items = wallShowThrough(built, cabinetWall, 'front', settings).get('cabinet').items;
    expect(items.filter(({ kind }) => kind === 'divider').map(({ key }) => key)).toEqual(['divider:r:1']);
  });
});
