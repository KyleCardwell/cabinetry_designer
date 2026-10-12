import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS } from '../constants.js';
import { furnitureBaseSection, runBase } from '../furnitureBase.js';
import { resolveWall, syncRoom } from '../room.js';
import { runBands } from '../runBands.js';
import { runScene } from '../runScene.js';
import { runSide } from '../runSide.js';
import { isProfileGeometry, isSectionProfileList } from '../sectionProfiles.js';
import { sectionProfileOutline } from '../sectionProfileOutline.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const load = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const document = normalizeElevationDocument(load('golden'));
const profiles = load('sectionProfiles').profiles;
const fb4cut = profiles.find(({ id }) => id === 'fb4cut');
const SECTION = [[-0.8125, 0, 0], [-0.3125, 0, 0], [0, -0.3125, 0],
  [0, -4, 0], [-0.8125, -4, 0]];
const BAND = [[29.1875, 0, 0], [66.8125, 0, 0], [66.8125, 3.6875, 0],
  [66.5, 4, 0], [29.5, 4, 0], [29.1875, 3.6875, 0]];
const line = (from, to) => ({ type: 'line', from, to });
const elevationLine = (z) => ({ x1: 29.1875, z1: z, x2: 66.8125, z2: z });
const outlineOf = (base) => sectionProfileOutline(base.picked.geometry);

function setup(profile = fb4cut, overrides = {}) {
  const settings = { ...document.settings, sectionProfiles: [profile] };
  const stored = structuredClone(document.rooms[0]);
  stored.profile = { ...stored.profile, baseKind: 'furniture_base', furnitureBaseProfileId: profile.id };
  const baseRun = stored.walls[0].runs.find(({ cabinetTypeId }) => cabinetTypeId === CABINET_TYPE_IDS.BASE);
  stored.walls = [{ ...stored.walls[0], x1: 0, y1: 0, x2: 120, y2: 0,
    connections: { start: null, end: null }, openings: [], joints: [],
    endPanels: { start: null, end: null },
    runs: [{ ...baseRun, x: 30, width: 36, overrides, anchors: {},
      ends: { left: { type: 'end_panel' }, right: { type: 'end_panel' } } }],
  }];
  const room = syncRoom(stored, settings);
  const wall = resolveWall(room, room.walls[0]);
  const run = wall.runs[0];
  return { base: runBase(room, wall, run, settings),
    band: runBands(room, wall, run, settings, runScene(room, wall, run, settings)).furnitureBases[0],
    pieces: runSide(room, wall, run, settings) };
}

describe('SPEC-50.5.1 step 491.1 furniture base cuts', () => {
  it('closes fb4cut to the board without changing the profile (anchor 1)', () => {
    const before = structuredClone(fb4cut);
    const { base } = setup();
    expect(outlineOf(base)).toEqual(SECTION);
    expect(base.warnings).toEqual([]);
    expect(base.picked.profile).toBe(fb4cut);
    expect(base.picked.geometry.points.b).toEqual(fb4cut.geometry.points.b);
    expect(base.picked.geometry.points.c).toEqual(fb4cut.geometry.points.c);
    expect(isProfileGeometry(base.picked.geometry)).toBe(true);
    expect(isSectionProfileList(profiles)).toBe(true);
    expect(fb4cut).toEqual(before);
  });

  it('returns the chamfer band and its drawn line (anchor 2)', () => {
    expect(setup().band).toEqual({ x: 29.1875, z: 0, width: 37.625, height: 4,
      outline: BAND, lines: [elevationLine(3.6875)] });
  });

  it('extends a cut to six inches without a height mismatch (anchor 3)', () => {
    const { base, band } = setup(fb4cut, { toeKickHeight: 6 });
    expect(band).toEqual({ x: 29.1875, z: 0, width: 37.625, height: 6,
      outline: [[29.1875, 0, 0], [66.8125, 0, 0], [66.8125, 5.6875, 0],
        [66.5, 6, 0], [29.5, 6, 0], [29.1875, 5.6875, 0]],
      lines: [elevationLine(5.6875)] });
    expect(base.warnings).toEqual([]);
  });

  it('uses the section in the furniture base side piece (anchor 4)', () => {
    expect(setup().pieces.find(({ piece }) => piece === 'furniture_base')).toEqual({
      piece: 'furniture_base', z: 0, height: 4, back: 24.875, front: 25.6875,
      outline: [[24.875, 4, 0], [25.375, 4, 0], [25.6875, 3.6875, 0],
        [25.6875, 0, 0], [24.875, 0, 0]],
    });
  });

  it('walks a reversed cut from its top end (anchor 5)', () => {
    const reversed = structuredClone(fb4cut);
    reversed.geometry.loops[0].segs = [line('c', 'b')];
    const { base } = setup(reversed);
    expect(outlineOf(base)).toEqual(SECTION);
    expect(base.warnings).toEqual([]);
    expect(reversed.geometry.loops[0].segs).toEqual([line('c', 'b')]);
  });

  it('extends a step up to the top and down to the floor, drawing q end to end (anchor 6)', () => {
    const { base, band } = setup(profiles.find(({ id }) => id === 'fbstep'));
    expect(outlineOf(base)).toEqual([[-0.8125, 0, 0], [-0.5, 0, 0], [-0.5, -0.25, 0],
      [0, -0.75, 0], [0, -4, 0], [-0.8125, -4, 0]]);
    expect(band.lines).toEqual([elevationLine(3.25)]);
    expect(base.warnings).toEqual([]);
  });

  it('rejects a cut in front of the face and falls back to the plain board (anchor 7)', () => {
    const bad = structuredClone(fb4cut);
    bad.geometry.points.c = [0.25, -0.3125];
    const { base, band } = setup(bad);
    expect(base.picked).toBeNull();
    expect(base.warnings).toEqual([{ code: 'furniture-base-cut-bad' }]);
    expect(band).toEqual({ x: 29.1875, z: 0, width: 37.625, height: 4, lines: [] });
  });

  it('uses only the first open loop and warns about extra cuts (anchor 8)', () => {
    const extra = structuredClone(fb4cut);
    Object.assign(extra.geometry.points, { p: [-0.5, -0.25], q: [0, -0.75] });
    extra.geometry.loops.push({ id: 'L2', closed: false, segs: [line('p', 'q')] });
    const { base, band } = setup(extra);
    expect(outlineOf(base)).toEqual(SECTION);
    expect(base.warnings).toEqual([{ code: 'furniture-base-extra-cuts' }]);
    expect(band.outline).toEqual(BAND);
  });

  it('keeps closed geometry unchanged, ignoring open loops even when they are bad', () => {
    const closed = structuredClone(profiles.find(({ id }) => id === 'fb4'));
    Object.assign(closed.geometry.points, { bad1: [1, 1], bad2: [2, -8] });
    closed.geometry.loops.unshift({ id: 'cut', closed: false, segs: [line('bad1', 'bad2')] });
    expect(furnitureBaseSection(closed.geometry, 0.8125, 4))
      .toEqual({ geometry: closed.geometry, warnings: [] });
    expect(furnitureBaseSection(closed.geometry, 0.8125, 4).geometry).toBe(closed.geometry);
  });

  it('stretches before closing a cut and still warns when the height cannot reach its stretch line', () => {
    const stretched = structuredClone(fb4cut);
    stretched.geometry.points.c = [0, -4];
    stretched.stretch = { y: -2 };
    const { base } = setup(stretched, { toeKickHeight: 6 });
    expect(base.picked.geometry.points.c).toEqual([0, -6]);
    expect(base.warnings).toEqual([]);
    expect(isProfileGeometry(base.picked.geometry)).toBe(true);
    const short = setup(stretched, { toeKickHeight: 2 }).base;
    expect(short.picked).toBeNull();
    expect(short.warnings).toEqual([{ code: 'furniture-base-too-short' }, { code: 'furniture-base-cut-bad' }]);
  });

  it('checks cut bounds with tolerance, including arc interiors', () => {
    for (const point of [[0, 0.000002], [0, -4.000002], [0.000002, -0.3125]]) {
      const geometry = structuredClone(fb4cut.geometry);
      geometry.points.c = point;
      expect(furnitureBaseSection(geometry, 0.8125, 4))
        .toEqual({ geometry: null, warnings: [{ code: 'furniture-base-cut-bad' }] });
    }
    for (const point of [[0, 0.0000005], [0, -4.0000005], [0.0000005, -0.3125]]) {
      const geometry = structuredClone(fb4cut.geometry);
      geometry.points.c = point;
      expect(furnitureBaseSection(geometry, 0.8125, 4).warnings).toEqual([]);
    }
    const arc = { units: 'in', points: { a: [0, -1], b: [0, -2] },
      loops: [{ id: 'arc', closed: false,
        segs: [{ type: 'arc', from: 'a', to: 'b', center: [0, -1.5], ccw: false }] }] };
    expect(furnitureBaseSection(arc, 0.8125, 4).geometry).toBeNull();
  });

  it('reverses multi-segment arcs, retains ids and avoids generated point id collisions', () => {
    const geometry = { units: 'in', points: { a: [-0.5, 0], b: [0, -0.5], c: [0, -1],
      _backTop: [-0.75, -1] }, loops: [{ id: 'round', closed: false, segs: [
      line('c', 'b'), { type: 'arc', from: 'b', to: 'a', center: [-0.5, -0.5], ccw: true },
    ] }] };
    const before = structuredClone(geometry);
    const { geometry: section, warnings } = furnitureBaseSection(geometry, 0.8125, 4);
    expect(sectionProfileOutline(section)).toEqual([[-0.8125, 0, 0], [-0.5, 0, -0.414214],
      [0, -0.5, 0], [0, -1, 0], [0, -4, 0], [-0.8125, -4, 0]]);
    expect(section.points._backTop).toEqual(geometry.points._backTop);
    expect(warnings).toEqual([]);
    expect(isProfileGeometry(section)).toBe(true);
    expect(geometry).toEqual(before);
  });

  it('uses the smaller x on a tied end, reaches behind proud, and closes a groove on the face', () => {
    const tied = { units: 'in', points: { a: [-1, -1], b: [0, -1] },
      loops: [{ id: 'tied', closed: false, segs: [line('b', 'a')] }] };
    const { geometry: section } = furnitureBaseSection(tied, 0.8125, 4);
    expect(sectionProfileOutline(section)).toEqual([[-1, 0, 0], [-1, -1, 0],
      [0, -1, 0], [0, -4, 0], [-1, -4, 0]]);
    expect(isProfileGeometry(section)).toBe(true);
    const groove = { units: 'in', points: { a: [0, -1], b: [-0.25, -1.5],
      duplicate: [-0.25, -1.5], c: [0, -2] },
    loops: [{ id: 'groove', closed: false,
      segs: [line('a', 'b'), line('b', 'duplicate'), line('duplicate', 'c')] }] };
    const grooveSection = furnitureBaseSection(groove, 0.8125, 4).geometry;
    expect(sectionProfileOutline(grooveSection))
      .toEqual([[-0.8125, 0, 0], [0, 0, 0], [0, -1, 0], [-0.25, -1.5, 0],
        [0, -2, 0], [0, -4, 0], [-0.8125, -4, 0]]);
    expect(isProfileGeometry(grooveSection)).toBe(true);
    expect(grooveSection.points.duplicate).toEqual(groove.points.duplicate);
  });
});
