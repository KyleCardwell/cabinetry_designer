import { describe, expect, it, vi } from 'vitest';
import {
  autoInterior, boxConstruction, cabinetDrawerBoxes, cabinetFaces, cabinetInterior,
  CABINET_TYPE_IDS, DEFAULT_SETTINGS, placeInterior, resolveInterior, wallDrawerBoxes, wallInteriors,
} from '../index.js';
import { BUILT_IN_SLIDES } from '../slides.js';
import { faceArea } from '../faces.js';
import { faceOpenings } from '../frames.js';
import { gridFromItems } from '../grid.js';
import * as scenes from '../runScene.js';

const leaf = (type = 'door', size = null, extra = {}) => ({ type, size, ...extra });
const v = (...children) => ({ direction: 'vertical', size: null, children });
const h = (...children) => ({ direction: 'horizontal', size: null, children });
const tree = (direction, dividers, children = dividers.map(() => ({})).concat({})) => ({ direction, children, dividers });
const fixed = (seam) => ({ kind: 'fixed', seam });
const pt = (seam) => ({ kind: 'partition', seam });
const euro = { top: 0.125, bottom: 0.125, left: 0.0625, right: 0.0625, horizontal: 0.125, vertical: 0.125 };
const framed = { top: 1.5, bottom: 1.5, left: 0.75, right: 0.75, horizontal: 1.5, vertical: 1.5, fit: 0.0625, shared: 0.125 };
const settings = { ...DEFAULT_SETTINGS, slides: BUILT_IN_SLIDES, drawerSlideId: 'blum-562h' };
function resolve(faceTree, { width = 30, height = 84, interior, inset = false, reveals = inset ? framed : euro } = {}) {
  const box = { x: 24, z: 4, width, height, depth: 24 };
  const leaf = { face: faceTree, interior };
  const { faces } = cabinetFaces(leaf, box, CABINET_TYPE_IDS.BASE, settings, reveals);
  const openings = faceOpenings(faceTree, faceArea(box, reveals), reveals);
  const context = { faceTree, faces, openings, inset };
  const resolved = resolveInterior(interior, box, boxConstruction(leaf), settings, context);
  return { ...resolved, box, faces, openings, reveals, inset, leaf, settings };
}

describe('IN7 automatic interior structure', () => {
  it('anchors 1–2: shelves below doors and open faces; drawer runs merge', () => {
    const expected = tree('vertical', [fixed('r:0')]);
    expect(autoInterior(v(leaf(), leaf()), 30)).toEqual(expected);
    expect(autoInterior(v(leaf(), leaf('drawer_front'), leaf('drawer_front'), leaf('drawer_front')), 24)).toEqual(expected);
    expect(autoInterior(v(leaf('drawer_front'), leaf()), 30)).toBeNull();
    expect(autoInterior(v(leaf('open'), leaf('open')), 30)).toEqual(expected);
  });

  it('anchors 3–4: wide pair doors get partitions and stop them at a drawer stretcher', () => {
    const pair = tree('horizontal', [pt('r:pair')]);
    expect(autoInterior(leaf('pair_door'), 42)).toEqual(pair);
    expect(autoInterior(leaf('pair_door'), 36)).toBeNull();
    expect(autoInterior(v(leaf('drawer_front'), leaf('pair_door')), 42)).toEqual(
      tree('vertical', [{ kind: 'stretcher', seam: 'r:0' }], [{}, tree('horizontal', [pt('r.1:pair')])]),
    );
  });

  it('anchor 5: partitions separate wide columns without dividing pairs inside them', () => {
    expect(autoInterior(h(leaf(), leaf(), leaf()), 48)).toEqual(tree('horizontal', [pt('r:0'), pt('r:1')]));
    expect(autoInterior(h(leaf(), leaf('pair_door')), 42)).toEqual(tree('horizontal', [pt('r:0')]));
    expect(autoInterior(h(leaf(), leaf()), 30)).toBeNull();
  });

  it('anchor 5b: aligned narrow columns share shelves; a tall neighbour requires a partition', () => {
    const column = v(leaf(), leaf());
    expect(autoInterior(h(column, column), 30)).toEqual(tree('vertical', [fixed('r.0:0')]));
    expect(autoInterior(h(column, leaf()), 30)).toEqual(
      tree('horizontal', [pt('r:0')], [tree('vertical', [fixed('r.0:0')]), {}]),
    );
    expect(autoInterior(h(column, v(leaf('door', 30), leaf())), 30).direction).toBe('horizontal');
    expect(autoInterior(h(v(leaf('door', 30), leaf()), v(leaf('door', 30.0625), leaf())), 30).direction).toBe('vertical');
    expect(autoInterior(h(v(leaf('door', 30), leaf()), v(leaf('door', 30.125), leaf())), 30).direction).toBe('horizontal');
    const nested = v(v(leaf(), leaf()), leaf());
    expect(autoInterior(h(nested, nested), 30)).toEqual(tree('vertical', [fixed('r.0.0:0'), fixed('r.0:0')]));
  });

  it('anchor 6: stacked wide pair doors each get a partition terminating at the fixed shelf', () => {
    expect(autoInterior(v(leaf('pair_door'), leaf('pair_door')), 42)).toEqual(
      tree('vertical', [fixed('r:0')], [tree('horizontal', [pt('r.0:pair')]), tree('horizontal', [pt('r.1:pair')])]),
    );
  });

  it('checks the bottom edge above a seam and counts false fronts and pullouts as drawers', () => {
    for (const drawer of [leaf('drawer_front'), leaf('false_front'), leaf('door', null, { action: 'pullout' })]) {
      expect(autoInterior(v(drawer, leaf()), 30)).toBeNull();
      expect(autoInterior(v(h(leaf(), drawer), leaf()), 30)).toBeNull();
      expect(autoInterior(v(v(leaf(), drawer), leaf()), 30).dividers)
        .toEqual([{ kind: 'stretcher', seam: 'r:0' }]); // The child's shelf needs a terminating stretcher at the next seam.
    }
    const face = v(h(leaf('drawer_front'), leaf()), leaf());
    const before = structuredClone(face);
    expect(autoInterior(face, 30)).toBeNull();
    expect(face).toEqual(before);
    expect(autoInterior(v(leaf('panel'), leaf()), 30).dividers).toEqual([fixed('r:0')]);
  });
});

describe('IN7 effective interior resolution', () => {
  it('anchor 7: auto shelves follow resolved doors and rebuild when a front is resized', () => {
    const face = v(leaf(), leaf());
    expect(resolve(face).dividers[0]).toMatchObject({ fromBottom: 42, seam: 'r:0', linked: true, auto: true });
    face.children[0].size = 30;
    const resized = resolve(face);
    expect(resized.dividers[0].fromBottom).toBe(53.8125);
    expect(resized.faces[0].z - resized.box.z).toBe(53.875);
    expect(resized.faces[1].z + resized.faces[1].height - resized.box.z).toBe(53.75);
  });

  it('anchor 8: pair and multi-column partitions use wall coordinates minus the box origin', () => {
    expect(resolve(leaf('pair_door'), { width: 42 }).dividers[0].fromLeft).toBe(21);
    expect(resolve(h(leaf(), leaf(), leaf()), { width: 48 }).dividers.map((d) => d.fromLeft)).toEqual([16, 32]);
  });

  it('anchor 9: fixed and double fixed tops sit flush with the rail top', () => {
    const face = v(leaf(), leaf());
    for (const [kind, expected] of [['fixed', 42.375], ['double_fixed', 42]]) {
      const result = resolve(face, { inset: true, interior: tree('vertical', [{ kind, seam: 'r:0' }]) });
      expect(result.openings[0].z - result.box.z).toBe(42.75);
      expect(result.dividers[0].fromBottom).toBe(expected);
    }
    const noRail = { ...face, noRail: [0] };
    expect(resolve(noRail, { inset: true }).dividers[0].fromBottom).toBe(42);
    expect(resolve(noRail, { inset: true, interior: tree('vertical', [{ kind: 'stretcher', seam: 'r:0' }]) })
      .dividers[0].fromBottom).toBe(42);
  });

  it('anchor 10: a seam-centred stretcher fits the exact Blum preset at both top reveals', () => {
    const face = v(leaf('drawer_front', 5.875), leaf('pair_door'));
    for (const [top, available, height] of [[0.25, 4.25, 4.25], [0.125, 4.125, 3.25]]) {
      const result = resolve(face, { width: 42, height: 30.5, reveals: { ...euro, top } });
      const interior = placeInterior(result);
      const drawer = cabinetDrawerBoxes({ ...result, interior }).boxes[0];
      expect(result.dividers[0]).toMatchObject({ kind: 'stretcher', depth: 4, linked: true });
      expect(result.dividers[0].fromBottom).toBe((result.faces[0].z + result.faces[1].z + result.faces[1].height) / 2 - result.box.z);
      expect(drawer.available).toBe(available);
      expect(drawer.height).toBe(height);
    }
  });

  it('anchor 11: missing seams equalize and warn, including wrong directions, indices and pairs', () => {
    const interior = tree('vertical', [fixed('r:0')]);
    const result = resolve(leaf(), { interior });
    expect(result.dividers[0]).toMatchObject({ fromBottom: 42, linked: false, auto: true });
    expect(result.warnings).toEqual([{ code: 'divider-seam-missing', path: 'r', index: 0 }]);
    for (const face of [h(leaf(), leaf()), v(leaf(), leaf())]) {
      expect(resolve(face, { interior: tree('vertical', [fixed('r:9')]) }).warnings)
        .toContainEqual({ code: 'divider-seam-missing', path: 'r', index: 0 });
    }
    expect(resolve(h(leaf(), leaf()), { interior }).dividers[0].linked).toBe(false);
    expect(resolve(leaf(), { interior: tree('horizontal', [pt('r:pair')]) }).warnings)
      .toContainEqual({ code: 'divider-seam-missing', path: 'r', index: 0 });
  });

  it('anchor 12: fixed banding follows construction style unless explicitly stored', () => {
    const face = v(leaf(), leaf());
    expect(resolve(face).dividers[0]).toMatchObject({ banding: true, bandingSource: 'auto' });
    expect(resolve(face, { inset: true }).dividers[0]).toMatchObject({ banding: false, bandingSource: 'auto' });
    for (const banding of [true, false]) {
      const interior = tree('vertical', [{ ...fixed('r:0'), banding }]);
      for (const inset of [true, false]) {
        expect(resolve(face, { inset, interior }).dividers[0]).toMatchObject({ banding, bandingSource: 'manual' });
      }
    }
    expect(resolve(leaf('pair_door'), { width: 42 }).dividers[0]).toMatchObject({ banding: null, bandingSource: null });
    expect(resolve(v(leaf('drawer_front'), leaf('pair_door')), { width: 42 }).dividers[0].banding).toBeNull();
  });

  it('anchor 13: manual empty trees warn only when the automatic faces would need a partition', () => {
    const result = resolve(leaf('pair_door'), { width: 42, interior: {} });
    expect(result).toMatchObject({ tree: {}, auto: false, dividers: [], warnings: [{ code: 'wide-no-partition' }] });
    expect(resolve(leaf(), { width: 42, interior: {} }).warnings).toEqual([]);
    expect(resolve(leaf('pair_door'), { width: 42 }).warnings).toEqual([]);
    expect(resolve(leaf('pair_door'), { width: 42, interior: tree('horizontal', [{ kind: 'double_partition' }]) }).warnings).toEqual([]);
  });

  it('typed positions override links; relinking and equal neighbours use the seam as a fixed boundary', () => {
    const face = v(leaf('door', 30), leaf());
    const interior = tree('vertical', [fixed('r:0'), { kind: 'fixed' }]);
    const result = resolve(face, { interior });
    expect(result.dividers[0]).toMatchObject({ linked: true, fromBottom: 53.8125 });
    expect(result.sections[1].height).toBe(result.sections[2].height);
    const typed = { ...interior, dividers: [{ ...fixed('r:0'), at: 60, depth: 8 }, { kind: 'fixed' }] };
    expect(resolve(face, { interior: typed }).dividers[0]).toMatchObject({ linked: false, auto: false, fromBottom: 60, seam: 'r:0', depth: 8 });
    face.children[0].type = 'drawer_front';
    expect(resolve(face, { interior }).dividers[0]).toMatchObject({ linked: true, fromBottom: 53.8125 });
    const old = resolveInterior(interior, result.box, boxConstruction({}), settings);
    expect(old).toMatchObject({ tree: interior, auto: false, warnings: [] });
    expect(old.dividers[0].linked).toBe(false);
    expect(resolveInterior(undefined, result.box, boxConstruction({}), settings)).toMatchObject({ tree: null, auto: false, dividers: [] });
  });

  it('manual trees retain their dividers when faces gain or lose seams', () => {
    const interior = tree('vertical', [fixed('r:0')]);
    const before = structuredClone(interior);
    expect(resolve(v(leaf(), leaf(), leaf()), { interior }).dividers).toHaveLength(1);
    expect(resolve(leaf(), { interior }).dividers).toHaveLength(1);
    expect(interior).toEqual(before);
  });

  it('cabinet and wall wrappers share effective trees, styles and per-run face layouts with drawers', () => {
    const run = {
      id: 'run', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 24, width: 84, z: 4, height: 30.5, depth: 24,
      ends: { left: { type: 'none' }, right: { type: 'none' } },
      autoCount: false, maxCabinetWidth: null, heightMode: 'manual', overrides: {},
      anchors: { left: false, right: false },
      grid: gridFromItems('run', [
        { id: 'a', kind: 'cabinet', width: null },
        { id: 'b', kind: 'cabinet', width: null, face: v(leaf('drawer_front', 5.875), leaf('pair_door')) },
      ]),
    };
    const wall = { id: 'wall', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5,
      flipped: false, connections: { start: null, end: null }, profile: {}, runs: [run], openings: [] };
    const room = { id: 'room', profile: { ...DEFAULT_SETTINGS.defaultProfile }, walls: [wall], wallOrder: ['wall'] };
    const resolved = wallInteriors(room, wall, 'front', settings);
    expect(resolved).toHaveLength(2);
    expect(resolved[0]).toMatchObject({ auto: true, tree: tree('horizontal', [pt('r:pair')]) });
    for (const entry of resolved) {
      expect(entry).toEqual({ itemId: entry.itemId, runId: run.id,
        ...placeInterior(cabinetInterior(room, wall, 'front', settings, entry.itemId)) });
    }
    const spy = vi.spyOn(scenes, 'runScene');
    try {
      expect(wallDrawerBoxes(room, wall, 'front', settings).get('b').boxes[0].height).toBe(4.25);
      expect(spy).toHaveBeenCalledTimes(2); // elevation parts plus one face-layout pass
    } finally {
      spy.mockRestore();
    }
  });
});
