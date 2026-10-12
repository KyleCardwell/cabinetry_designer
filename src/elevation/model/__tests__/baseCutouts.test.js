import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bandParts } from '../bandParts.js';
import { CABINET_TYPE_IDS } from '../constants.js';
import { cornerShapes } from '../cornerParts.js';
import { toDrawingPayload } from '../drawingPayload.js';
import { runBase } from '../furnitureBase.js';
import { gridFromItems } from '../grid.js';
import { carriesMolding } from '../parts.js';
import { resolveWall, syncRoom } from '../room.js';
import { runBands } from '../runBands.js';
import { runScene } from '../runScene.js';
import { runSide } from '../runSide.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const load = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const document = normalizeElevationDocument(load('golden'));
const fb4 = load('sectionProfiles').profiles.find(({ id }) => id === 'fb4');
const cut1 = { id: 'cut1', kind: 'base_cutout', geometry: { units: 'in',
  points: { a: [0, 0], b: [1.5, 1.5] }, loops: [{ id: 'L1', closed: false,
    segs: [{ type: 'arc', from: 'a', to: 'b', center: [0, 1.5], ccw: true }] }] } };
const settings = { ...document.settings, sectionProfiles: [fb4, cut1] };
const baseRun = document.rooms[0].walls[0].runs.find(({ cabinetTypeId }) => cabinetTypeId === CABINET_TYPE_IDS.BASE);
const cutout = { id: 'k1', from: 'c1', to: 'c1' };
const TOP = [[66.8125, 0, 0], [66.8125, 3.6875, 0], [66.5, 4, 0], [29.5, 4, 0], [29.1875, 3.6875, 0]];
const OUTLINE = [[29.1875, 0, 0], ...TOP];
const SQUARE = [[29.1875, 0, 0], [33, 0, 0], [33, 1.5, 0], [63, 1.5, 0], [63, 0, 0], ...TOP];
const COVE = [[29.1875, 0, 0], [33, 0, 0.414214], [34.5, 1.5, 0],
  [61.5, 1.5, 0.414214], [63, 0, 0], ...TOP];
const line = (x1, x2, z) => ({ x1, z1: z, x2, z2: z });

function setup({ cutouts = [cutout], profile = {}, wallProfile = {}, runProps = {}, count = 1,
  using = settings, grid } = {}) {
  const stored = structuredClone(document.rooms[0]);
  stored.profile = { ...stored.profile, baseKind: 'furniture_base', furnitureBaseProfileId: 'fb4', ...profile };
  stored.walls = [{ ...stored.walls[0], x1: 0, y1: 0, x2: 120, y2: 0,
    connections: { start: null, end: null }, openings: [], joints: [], profile: wallProfile,
    endPanels: { start: null, end: null },
    runs: [{ ...structuredClone(baseRun), id: 'base', x: 30, width: 36, autoCount: false,
      anchors: {}, ends: { left: { type: 'none' }, right: { type: 'none' } },
      grid: grid ?? gridFromItems('base', Array.from({ length: count }, (_, i) => (
        { id: `c${i + 1}`, kind: 'cabinet', width: null }
      ))), baseCutouts: cutouts, ...runProps }],
  }];
  const room = syncRoom(stored, using);
  const wall = resolveWall(room, room.walls[0]);
  const run = wall.runs[0];
  const scene = runScene(room, wall, run, using);
  return { room, wall, run, scene, base: runBase(room, wall, run, using),
    band: runBands(room, wall, run, using, scene).furnitureBase,
    parts: bandParts(room, room.walls[0], 'front', using) };
}

const codes = (result) => result.base.warnings.map(({ code }) => code);

describe('SPEC-50.6 step 493 base cutouts', () => {
  it('inserts the automatic square notch into fb4 (anchor 1) and supplies an outline for a plain base', () => {
    const result = setup();
    expect(result.band.outline).toEqual(SQUARE);
    expect(result.base.cutouts).toEqual([{ id: 'k1', x0: 33, x1: 63, h: 1.5,
      chain: [[33, 0, 0], [33, 1.5, 0], [63, 1.5, 0], [63, 0, 0]] }]);
    expect(codes(result)).toEqual([]);
    const plain = setup({ profile: { furnitureBaseProfileId: null } });
    expect(plain.band.outline).toEqual([...SQUARE.slice(0, 6),
      [66.8125, 4, 0], [29.1875, 4, 0]]);
    expect(setup({ cutouts: [], profile: { furnitureBaseProfileId: null } }).band.outline).toBeUndefined();
  });

  it('preserves both positive quarter-arc bulges in the mirrored cove (anchor 2)', () => {
    const result = setup({ cutouts: [{ ...cutout, profileId: 'cut1' }] });
    expect(result.band.outline).toEqual(COVE);
    const part = result.parts.find(({ kind }) => kind === 'furniture_base');
    expect(part).toMatchObject({ outline: COVE, front: 25.6875 });
    expect(toDrawingPayload(result.room, settings).elevations[0].parts).toContainEqual(part);
  });

  it('centres a typed 24-inch square notch (anchor 3)', () => {
    expect(setup({ cutouts: [{ ...cutout, width: 24 }] }).band.outline)
      .toEqual([[29.1875, 0, 0], [36, 0, 0], [36, 1.5, 0], [60, 1.5, 0], [60, 0, 0], ...TOP]);
  });

  it('spans two bottom cabinets in either endpoint order (anchor 4)', () => {
    for (const refs of [{ from: 'c1', to: 'c2' }, { from: 'c2', to: 'c1' }]) {
      expect(setup({ count: 2, cutouts: [{ ...cutout, ...refs }] }).band.outline).toEqual(SQUARE);
    }
  });

  it('skips a two-inch cove with its warning (anchor 5) and accepts exactly touching far ends', () => {
    const result = setup({ cutouts: [{ ...cutout, profileId: 'cut1', width: 2 }] });
    expect(result.band.outline).toEqual(OUTLINE);
    expect(codes(result)).toEqual(['base-cutout-too-narrow']);
    expect(setup({ cutouts: [{ ...cutout, profileId: 'cut1', width: 3 }] }).base.cutouts[0].chain)
      .toEqual([[46.5, 0, 0.414214], [48, 1.5, 0.414214], [49.5, 0, 0]]);
  });

  it('skips square notches at or above the band height (anchor 6)', () => {
    for (const baseCutoutHeight of [4.5, 4]) {
      const result = setup({ using: { ...settings, baseCutoutHeight } });
      expect(result.band.outline).toEqual(OUTLINE);
      expect(codes(result)).toEqual(['base-cutout-too-tall']);
    }
  });

  it('splits the one-inch drawn line and retains the higher line (anchor 7)', () => {
    const changed = structuredClone(fb4);
    changed.geometry.points.g = [0, -3];
    changed.geometry.loops[0].segs.splice(2, 1,
      { type: 'line', from: 'c', to: 'g' }, { type: 'line', from: 'g', to: 'd' });
    changed.drawnPoints.elevation = ['c', 'g'];
    expect(setup({ using: { ...settings, sectionProfiles: [changed, cut1] } }).band.lines)
      .toEqual([line(29.1875, 66.8125, 3.6875), line(29.1875, 33, 1), line(63, 66.8125, 1)]);
  });

  it('draws no cutout on a toe kick or absent base and joins profile warnings (anchor 8)', () => {
    const result = setup({ profile: { baseKind: 'toe_kick' } });
    expect(result.band).toBeNull();
    expect(result.base.cutouts).toEqual([]);
    expect(codes(result)).toEqual(['base-cutout-no-base']);
    expect(codes(setup({ runProps: { overrides: { toeKickHeight: 0 } } }))).toEqual(['base-cutout-no-base']);
    expect(codes(setup({ profile: { furnitureBaseProfileId: 'missing' },
      cutouts: [{ ...cutout, profileId: 'cut1', width: 2 }] })))
      .toEqual(['molding-profile-missing', 'base-cutout-too-narrow']);
  });

  it('uses inherited profiles and allows a cutout to explicitly select square or cove', () => {
    const using = { ...settings, defaultProfile: { ...settings.defaultProfile, baseCutoutProfileId: 'cut1' } };
    expect(setup({ using }).band.outline).toEqual(COVE);
    expect(setup({ using, profile: { baseCutoutProfileId: null } }).band.outline).toEqual(SQUARE);
    expect(setup({ profile: { baseCutoutProfileId: 'cut1' } }).band.outline).toEqual(COVE);
    expect(setup({ profile: { baseCutoutProfileId: 'cut1' }, wallProfile: { baseCutoutProfileId: null } }).band.outline).toEqual(SQUARE);
    expect(setup({ using, cutouts: [{ ...cutout, profileId: null }] }).band.outline).toEqual(SQUARE);
    expect(setup({ wallProfile: { baseCutoutProfileId: null }, cutouts: [{ ...cutout, profileId: 'cut1' }] }).band.outline).toEqual(COVE);
    expect(setup({ using: { ...settings, baseCutoutFoot: 6 } }).base.cutouts[0]).toMatchObject({ x0: 36, x1: 60 });
  });

  it('falls back to square for invalid profile endpoints, closed loops, negative coordinates and arc extrema', () => {
    const invalid = [];
    for (const mutate of [
      (p) => { p.geometry.loops[0].closed = true; },
      (p) => { p.geometry.points.a = [0.5, 0]; },
      (p) => { p.geometry.points.b = [-1.5, 1.5]; },
      (p) => { p.geometry.points.a = [0, -0.5]; },
      (p) => { p.geometry.loops[0].segs[0].ccw = false; },
      (p) => {
        p.geometry.points.c = [2, 1];
        p.geometry.loops[0].segs.push({ type: 'line', from: 'b', to: 'c' });
      },
    ]) {
      const changed = structuredClone(cut1);
      mutate(changed);
      invalid.push(changed);
    }
    for (const changed of [...invalid, { ...cut1, kind: 'crown' }, { ...cut1, id: 'other' }]) {
      const result = setup({ using: { ...settings, sectionProfiles: [fb4, changed] },
        cutouts: [{ ...cutout, profileId: 'cut1' }] });
      expect(result.band.outline).toEqual(SQUARE);
      expect(codes(result)).toEqual(['base-cutout-profile-bad']);
    }
    const reversed = structuredClone(cut1);
    reversed.geometry.loops[0].segs[0] = { type: 'arc', from: 'b', to: 'a', center: [0, 1.5], ccw: false };
    expect(setup({ using: { ...settings, sectionProfiles: [fb4, reversed] },
      cutouts: [{ ...cutout, profileId: 'cut1' }] }).band.outline).toEqual(COVE);
  });

  it('ignores orphaned ids and cabinets above the bottom row', () => {
    const stack = { id: 'column', cols: [{ id: 'col', size: null }],
      rows: [{ id: 'top', size: null }, { id: 'bottom', size: null }], cells: [
        { col: 0, row: 0, colSpan: 1, rowSpan: 1, node: { id: 'upper', kind: 'cabinet' } },
        { col: 0, row: 1, colSpan: 1, rowSpan: 1, node: { id: 'c1', kind: 'cabinet' } },
      ] };
    const grid = gridFromItems('base', [{ id: 'column', kind: 'cabinet', width: null, grid: stack }]);
    for (const to of ['missing', 'upper']) {
      const result = setup({ grid, cutouts: [{ ...cutout, to }] });
      expect(result.band.outline).toEqual(OUTLINE);
      expect(codes(result)).toEqual(['base-cutout-orphaned']);
    }
    expect(setup({ grid }).band.outline).toEqual(SQUARE);
  });

  it('inserts cutouts in x order, skips overlaps and checks the actual floor ends', () => {
    const first = { ...cutout, width: 8 };
    const second = { ...first, id: 'k2', from: 'c2', to: 'c2' };
    const result = setup({ count: 2, cutouts: [second, first, { ...first, id: 'overlap' }] });
    expect(result.base.cutouts.map(({ id }) => id)).toEqual(['k1', 'k2']);
    expect(result.band.outline).toEqual([[29.1875, 0, 0], [35, 0, 0], [35, 1.5, 0],
      [43, 1.5, 0], [43, 0, 0], [53, 0, 0], [53, 1.5, 0], [61, 1.5, 0], [61, 0, 0], ...TOP]);
    expect(codes(result)).toEqual(['base-cutout-overlap']);
    expect(codes(setup({ cutouts: [{ ...cutout, width: 38 }] }))).toEqual(['base-cutout-overlap']);
    expect(codes(setup({ cutouts: [{ ...cutout, width: 37 }],
      runProps: { anchors: { left: { to: 'wall', wallId: 'other' } } } }))).toEqual(['base-cutout-overlap']);
    const flush = setup({ cutouts: [{ ...cutout, width: 37.625 }] });
    expect(codes(flush)).toEqual([]);
    expect(flush.band.outline.slice(0, 4)).toEqual([[29.1875, 0, 0], [29.1875, 1.5, 0],
      [66.8125, 1.5, 0], [66.8125, 0, 0]]);
  });

  it('splits lines at the flattened arc and at the top of the cutout', () => {
    const changed = structuredClone(fb4);
    changed.geometry.points.g = [0, -3];
    changed.geometry.points.h = [0, -2.5];
    changed.drawnPoints.elevation = ['g', 'h', 'c'];
    const result = setup({ using: { ...settings, sectionProfiles: [changed, cut1] },
      cutouts: [{ ...cutout, profileId: 'cut1' }] });
    const [left, right, topLeft, topRight, whole] = result.band.lines;
    expect(left.x1).toBe(29.1875);
    expect(left.x2).toBeCloseTo(33 + Math.sqrt(2), 2);
    expect(right.x1).toBeCloseTo(63 - Math.sqrt(2), 2);
    expect(right.x2).toBe(66.8125);
    expect([topLeft, topRight, whole]).toEqual([
      line(29.1875, 34.5, 1.5), line(61.5, 66.8125, 1.5), line(29.1875, 66.8125, 3.6875),
    ]);
  });

  it('keeps side sections, depths and part-kind selection unchanged', () => {
    const withCutout = setup();
    const plain = setup({ cutouts: [] });
    expect(runSide(withCutout.room, withCutout.wall, withCutout.run, settings))
      .toEqual(runSide(plain.room, plain.wall, plain.run, settings));
    expect(withCutout.parts.find(({ kind }) => kind === 'furniture_base').front)
      .toBe(plain.parts.find(({ kind }) => kind === 'furniture_base').front);
    expect(carriesMolding(withCutout.wall, withCutout.run, withCutout.room.profile, 'toeKick')).toBe(false);
  });

  it('preserves connected-wall corner sections and plan geometry when their runs have cutouts', () => {
    const stored = structuredClone(document.rooms[2]);
    stored.profile = { ...stored.profile, baseKind: 'furniture_base', furnitureBaseProfileId: 'fb4' };
    const plain = syncRoom(stored, settings);
    const cut = structuredClone(plain);
    for (const wall of cut.walls) {
      const view = resolveWall(cut, wall);
      for (const run of wall.runs) {
        if (run.cabinetTypeId !== CABINET_TYPE_IDS.BASE) continue;
        const resolved = view.runs.find(({ id }) => id === run.id);
        const cabinets = runScene(cut, view, resolved, settings).cells.pieces
          .filter(({ kind, z }) => kind === 'cabinet' && Math.abs(z - resolved.z) < 1e-6);
        if (cabinets.length) run.baseCutouts = [{ id: 'cut', from: cabinets[0].id, to: cabinets.at(-1).id }];
      }
    }
    let drawn = 0;
    for (const wall of cut.walls) {
      const original = plain.walls.find(({ id }) => id === wall.id);
      expect(cornerShapes(cut, wall, 'front', settings)).toEqual(cornerShapes(plain, original, 'front', settings));
      const view = resolveWall(cut, wall);
      for (const run of view.runs) {
        const base = runBase(cut, view, run, settings);
        if (!base.cutouts?.length) continue;
        drawn += base.cutouts.length;
        expect(runBands(cut, view, run, settings, runScene(cut, view, run, settings)).furnitureBase.outline
          .some(([, z]) => z === 1.5)).toBe(true);
      }
    }
    expect(drawn).toBeGreaterThan(0);
    expect(toDrawingPayload(cut, settings).plan).toEqual(toDrawingPayload(plain, settings).plan);
  });

});
