import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bandParts } from '../bandParts.js';
import { CABINET_TYPE_IDS } from '../constants.js';
import { cornerShapes } from '../cornerParts.js';
import { toDrawingPayload } from '../drawingPayload.js';
import { moldingProfiles } from '../moldingProfiles.js';
import { woodTopSection } from '../nosing.js';
import { resolveProfile } from '../profile.js';
import { resolveWall, syncRoom } from '../room.js';
import { runBands } from '../runBands.js';
import { runScene } from '../runScene.js';
import { runSide } from '../runSide.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(JSON.parse(readFileSync(
  new URL('./fixtures/golden.json', import.meta.url), 'utf8',
)));
const nz1 = {
  id: 'nz1', name: 'Chamfer nosing', kind: 'nosing',
  geometry: {
    units: 'in', points: { a: [0, 0], b: [0.25, 0], c: [0.5, -0.25], d: [0.5, -1.5], e: [0, -1.5] },
    loops: [{ id: 'L1', closed: true, segs: ['a', 'b', 'c', 'd', 'e'].map((from, i, ids) => ({
      type: 'line', from, to: ids[(i + 1) % ids.length],
    })) }],
  },
  drawnPoints: { elevation: ['c'] },
};
const settings = { ...document.settings, sectionProfiles: [nz1] };
const base = document.rooms[0].walls[0].runs.find(({ cabinetTypeId }) => cabinetTypeId === CABINET_TYPE_IDS.BASE);
const OUTLINE = [[29.5, 34.5, 0], [66.5, 34.5, 0], [66.5, 35.75, 0],
  [66.25, 36, 0], [29.75, 36, 0], [29.5, 35.75, 0]];
const THIN_OUTLINE = [[29.5, 33.75, 0], [66.5, 33.75, 0], [66.5, 35, 0],
  [66.25, 35.25, 0], [29.75, 35.25, 0], [29.5, 35, 0]];
const line = (x1, x2, z) => ({ x1, z1: z, x2, z2: z });

function setup({ profile = {}, wallProfile = {}, runs = [{}], endPanels } = {}, using = settings) {
  const stored = structuredClone(document.rooms[0]);
  stored.profile = { ...stored.profile, nosingProfileId: 'nz1', ...profile };
  stored.walls = [{ ...stored.walls[0], x1: 0, y1: 0, x2: 120, y2: 0,
    profile: wallProfile, connections: { start: null, end: null }, openings: [], joints: [], lines: [],
    endPanels: endPanels ?? { start: null, end: null },
    runs: runs.map((props, i) => ({ ...structuredClone(base), id: `base-${i}`, x: 30, width: 36,
      top: 'wood', anchors: {}, ends: { left: { type: 'none' }, right: { type: 'none' } }, ...props })),
  }];
  const room = syncRoom(stored, using);
  const wall = resolveWall(room, room.walls[0]);
  return { room, wall,
    bands: wall.runs.map((run) => runBands(room, wall, run, using, runScene(room, wall, run, using))),
    parts: bandParts(room, room.walls[0], 'front', using),
    sides: wall.runs.map((run) => runSide(room, wall, run, using).find(({ piece }) => piece === 'countertop')),
  };
}

describe('SPEC-50.8 step 499 wood top nosing', () => {
  it('places the band, stops its line on both returns and sends its outline/front (anchor 1)', () => {
    const { room, wall, bands: [bands], parts } = setup();
    expect(wall.runs[0]).toMatchObject({ depth: 24, z: 4, height: 30.5 });
    expect(bands.countertop).toEqual({ x: 29.5, z: 34.5, width: 37, height: 1.5,
      outline: OUTLINE, lines: [line(29.5, 66.5, 35.75)] });
    const part = parts.find(({ kind }) => kind === 'countertop');
    expect(part).toMatchObject({ outline: OUTLINE, back: 0, front: 25.375, lines: bands.countertop.lines });
    expect(toDrawingPayload(room, settings).elevations[0].parts).toContainEqual(part);
  });

  it('hangs below a thinner core while retaining the nosing height (anchor 2)', () => {
    const { bands: [bands] } = setup({ runs: [{ overrides: { countertopThickness: 0.75 } }] });
    expect(bands.top).toEqual({ kind: 'wood', height: 0.75 });
    expect(bands.countertop).toEqual({ x: 29.5, z: 33.75, width: 37, height: 1.5,
      outline: THIN_OUTLINE, lines: [line(29.5, 66.5, 35)] });
  });

  it('joins the side core to the nosing and removes straight-through points (anchor 3)', () => {
    expect(setup().sides[0]).toEqual({ piece: 'countertop', z: 34.5, height: 1.5, back: 0, front: 25.375,
      outline: [[0, 34.5, 0], [25.375, 34.5, 0], [25.375, 35.75, 0], [25.125, 36, 0], [0, 36, 0]],
    });
  });

  it('keeps the step below the core in the thin top side section (anchor 4)', () => {
    expect(setup({ runs: [{ overrides: { countertopThickness: 0.75 } }] }).sides[0]).toEqual({
      piece: 'countertop', z: 33.75, height: 1.5, back: 0, front: 25.375,
      outline: [[0, 34.5, 0], [24.875, 34.5, 0], [24.875, 33.75, 0], [25.375, 33.75, 0],
        [25.375, 35, 0], [25.125, 35.25, 0], [0, 35.25, 0]],
    });
  });

  it('retains today’s rectangles for unpicked wood and picked stone (anchor 5)', () => {
    for (const props of [{ profile: { nosingProfileId: null } }, { runs: [{ top: 'stone' }] }]) {
      const { bands: [bands], parts, sides } = setup(props);
      expect(bands.countertop).toEqual({ x: 29.25, z: 34.5, width: 37.5, height: 1.5 });
      expect(parts.find(({ kind }) => kind === 'countertop')).toMatchObject({ front: 25.625 });
      expect(parts.find(({ kind }) => kind === 'countertop')).not.toHaveProperty('outline');
      expect(sides[0]).toEqual({ piece: 'countertop', z: 34.5, height: 1.5, back: 0, front: 25.625 });
    }
  });

  it('copes the shallower wood top onto the deeper return contour (anchor 6)', () => {
    const { bands: [deep, shallow] } = setup({ runs: [{}, { x: 66, depth: 21 }] });
    expect(deep.countertop.outline).toEqual(OUTLINE);
    expect(shallow.countertop.outline).toEqual([[66.5, 34.5, 0], [102.5, 34.5, 0],
      [102.5, 35.75, 0], [102.25, 36, 0], [66.25, 36, 0], [66.5, 35.75, 0]]);
    expect(shallow.countertop.lines).toEqual([line(66.5, 102.5, 35.75)]);
    // The cope belongs to the deeper run, including a different projection or a plain stone return.
    const different = setup({ runs: [{}, { x: 66, depth: 21, overrides: { nosingProfileId: 'wide' } }] },
      { ...settings, sectionProfiles: [nz1, { ...nz1, id: 'wide', geometry: { ...nz1.geometry,
        points: Object.fromEntries(Object.entries(nz1.geometry.points).map(([id, [x, y]]) => [id, [2 * x, y]])),
      } }] });
    expect(different.bands[1].countertop.outline.slice(-2)).toEqual([[66.25, 36, 0], [66.5, 35.75, 0]]);
    const stone = setup({ runs: [{ top: 'stone' }, { x: 66, depth: 21 }] });
    expect(stone.bands[1].countertop.outline[0]).toEqual([66.75, 34.5, 0]);
    expect(stone.bands[1].countertop.outline.at(-1)).toEqual([66.75, 36, 0]);
  });

  it('inherits the pick through team, room and wall, with undefined inheritance and explicit run clearing', () => {
    for (const props of [
      { profile: { nosingProfileId: undefined } },
      { profile: { nosingProfileId: null }, wallProfile: { nosingProfileId: 'nz1' } },
      { profile: { nosingProfileId: null }, runs: [{ overrides: { nosingProfileId: 'nz1' } }] },
      { runs: [{ overrides: { nosingProfileId: undefined } }] },
    ]) {
      const using = { ...settings, defaultProfile: { ...settings.defaultProfile, nosingProfileId: 'nz1' } };
      expect(setup(props, using).bands[0].countertop.outline).toEqual(OUTLINE);
    }
    const { room, wall, bands, sides } = setup({ runs: [{ overrides: { nosingProfileId: null } }] });
    expect(bands[0].countertop).not.toHaveProperty('outline');
    expect(sides[0]).not.toHaveProperty('outline');
    expect(moldingProfiles(resolveProfile(settings, room, wall), settings, wall.runs[0]).nosing).toBeNull();
  });

  it('warns on missing, wrong-kind and open picks and uses a plain top', () => {
    const open = structuredClone(nz1);
    open.geometry.loops[0].closed = false;
    open.geometry.loops[0].segs.pop();
    for (const [id, using, code] of [
      ['missing', settings, 'molding-profile-missing'],
      ['nz1', { ...settings, sectionProfiles: [{ ...nz1, kind: 'crown' }] }, 'molding-profile-missing'],
      ['nz1', { ...settings, sectionProfiles: [open] }, 'molding-profile-open'],
    ]) {
      const { room, wall, bands, parts, sides } = setup({ runs: [{ overrides: { nosingProfileId: id } }] }, using);
      expect(moldingProfiles(resolveProfile(using, room, wall), using, wall.runs[0]).warnings)
        .toContainEqual({ code, slot: 'nosing' });
      expect(bands[0].countertop).toEqual({ x: 29.25, z: 34.5, width: 37.5, height: 1.5 });
      expect(parts.find(({ kind }) => kind === 'countertop').front).toBe(25.625);
      expect(sides[0]).not.toHaveProperty('outline');
    }
  });

  it('squares wall ends and equal-depth joins, returns over wall panels, and deduplicates level lines', () => {
    const changed = structuredClone(nz1);
    changed.geometry.points.nearC = [0.5, -0.2500005];
    changed.drawnPoints.elevation = ['a', 'b', 'c', 'd', 'e', 'nearC'];
    const using = { ...settings, sectionProfiles: [changed] };
    const { bands } = setup({ runs: [{ anchors: { left: { to: 'wall' } } }, { x: 66 }] }, using);
    expect(bands[0].countertop.outline).toEqual([[30, 34.5, 0], [66, 34.5, 0], [66, 36, 0], [30, 36, 0]]);
    expect(bands[0].countertop.lines).toEqual([line(30, 66, 35.75)]);
    const panels = setup({ runs: [{ x: 0, anchors: { left: true } }],
      endPanels: { start: { depth: 24, thickness: 0.75, z: 0, height: 34.5 }, end: null } });
    expect(panels.bands[0].countertop.outline[0]).toEqual([-0.5, 34.5, 0]);
  });

  it('retains arcs in the front contour and mirrored ends and uses the largest closed loop', () => {
    const curved = structuredClone(nz1);
    curved.geometry.loops[0].segs[1] = { type: 'arc', from: 'b', to: 'c', center: [0.25, -0.25], ccw: false };
    curved.geometry.points.cut = [100, 100];
    curved.geometry.points.s = [0.1, 0];
    curved.geometry.points.t = [0, -0.1];
    curved.geometry.loops.unshift({ id: 'small', closed: true, segs: [
      { type: 'line', from: 'a', to: 's' }, { type: 'line', from: 's', to: 't' },
      { type: 'line', from: 't', to: 'a' },
    ] });
    curved.geometry.loops.push({ id: 'cut', closed: false, segs: [{ type: 'line', from: 'a', to: 'cut' }] });
    const before = structuredClone(curved);
    const section = woodTopSection({ profile: curved, geometry: curved.geometry }, 1.5, -25.625);
    expect(section.outline).toEqual([[-25.625, -1.5, 0], [0.5, -1.5, 0],
      [0.5, -0.25, 0.414214], [0.25, 0, 0], [-25.625, 0, 0]]);
    const { bands: [bands], sides } = setup({}, { ...settings, sectionProfiles: [curved] });
    expect(bands.countertop.outline).toEqual([[29.5, 34.5, 0], [66.5, 34.5, 0], [66.5, 35.75, 0.414214],
      [66.25, 36, 0], [29.75, 36, 0.414214], [29.5, 35.75, 0]]);
    expect(sides[0].outline).toEqual([[0, 34.5, 0], [25.375, 34.5, 0],
      [25.375, 35.75, 0.414214], [25.125, 36, 0], [0, 36, 0]]);
    expect(sides[0].front).toBe(25.375);
    expect(curved).toEqual(before);
  });

  it('places a thicker core at the run back and keeps typed overhangs with a nosing', () => {
    const using = { ...settings, bandDepths: { ...settings.bandDepths, countertopOverhang: 1 } };
    const { bands: [bands], parts, sides } = setup({ runs: [{ outset: 8,
      topOverhang: { front: 1, left: 1, right: 1 }, overrides: { countertopThickness: 2 } }] }, using);
    expect(bands.countertop).toMatchObject({ x: 28.5, z: 34.5, width: 39, height: 2,
      lines: [line(28.5, 67.5, 36.25)] });
    expect(parts.find(({ kind }) => kind === 'countertop')).toMatchObject({ back: 8, front: 34.375 });
    expect(sides[0]).toEqual({ piece: 'countertop', z: 34.5, height: 2, back: 8, front: 34.375,
      outline: [[8, 34.5, 0], [33.875, 34.5, 0], [33.875, 35, 0], [34.375, 35, 0],
        [34.375, 36.25, 0], [34.125, 36.5, 0], [8, 36.5, 0]],
    });
  });

  it('copes on inside-corner return outlines and carries them through the payload', () => {
    const stored = structuredClone(document.rooms[0]);
    stored.profile = { ...stored.profile, nosingProfileId: 'nz1' };
    for (const wall of stored.walls) {
      for (const run of wall.runs) {
        if (run.cabinetTypeId === CABINET_TYPE_IDS.BASE) run.top = 'wood';
      }
    }
    const room = syncRoom(stored, settings);
    const view = resolveWall(room, room.walls[1]);
    const run = view.runs.find(({ cabinetTypeId }) => cabinetTypeId === CABINET_TYPE_IDS.BASE);
    const bands = runBands(room, view, run, settings, runScene(room, view, run, settings));
    const returned = cornerShapes(room, room.walls[1], 'front', settings)
      .find(({ kind, key, parts }) => kind === 'return' && key.startsWith('left:')
        && parts.some(({ kind }) => kind === 'countertop'));
    const part = returned.parts.find(({ kind }) => kind === 'countertop');
    expect(part.outline).toEqual([[0, 34.5, 0], [25.375, 34.5, 0],
      [25.375, 35.75, 0], [25.125, 36, 0], [0, 36, 0]]);
    expect(bands.countertop.outline[0]).toEqual([25.375, 34.5, 0]);
    expect(bands.countertop.outline.slice(-2)).toEqual([[25.125, 36, 0], [25.375, 35.75, 0]]);
    expect(bands.countertop.lines[0].x1).toBe(25.375);
    expect(toDrawingPayload(room, settings).elevations.find(({ wallId }) => wallId === view.id).parts)
      .toContainEqual(part);
  });
});

describe('SPEC-50.9 step 502 resolved top overhangs', () => {
  it('uses independent typed stone overhangs, including a real zero (anchor 3)', () => {
    const { bands: [bands], parts, sides: [side] } = setup({
      runs: [{ top: 'stone', topOverhang: { front: 1, left: 12, right: 0 } }],
    });
    expect(bands.countertop).toEqual({ x: 18, width: 48, z: 34.5, height: 1.5 });
    expect(parts.find(({ kind }) => kind === 'countertop')).toMatchObject({ back: 0, front: 25.875 });
    expect(side).toEqual({ piece: 'countertop', z: 34.5, height: 1.5, back: 0, front: 25.875 });
  });

  it('places the wood core and nosing using all four typed overhangs (anchor 4)', () => {
    const { bands: [bands], parts, sides: [side] } = setup({
      runs: [{ topOverhang: { front: 0.25, back: 1, left: 0.5, right: 0.5 } }],
    });
    const outline = [[29, 34.5, 0], [67, 34.5, 0], [67, 35.75, 0],
      [66.75, 36, 0], [29.25, 36, 0], [29, 35.75, 0]];
    expect(bands.countertop).toEqual({ x: 29, width: 38, z: 34.5, height: 1.5,
      outline, lines: [line(29, 67, 35.75)] });
    expect(parts.find(({ kind }) => kind === 'countertop')).toMatchObject({ back: -1, front: 25.625, outline });
    expect(side).toEqual({ piece: 'countertop', z: 34.5, height: 1.5, back: -1, front: 25.625,
      outline: [[-1, 34.5, 0], [25.625, 34.5, 0], [25.625, 35.75, 0], [25.375, 36, 0], [-1, 36, 0]],
    });
  });

  it('copes onto the source run’s side overhang in both join directions', () => {
    const { bands: [deep, shallow] } = setup({ runs: [
      { topOverhang: { left: 2, right: 1 } },
      { x: 66, depth: 21, topOverhang: { left: 8, right: 3 } },
    ] });
    expect(deep.countertop.outline).toEqual([[27.5, 34.5, 0], [67.5, 34.5, 0],
      [67.5, 35.75, 0], [67.25, 36, 0], [27.75, 36, 0], [27.5, 35.75, 0]]);
    expect(shallow.countertop.outline).toEqual([[67.5, 34.5, 0], [105.5, 34.5, 0],
      [105.5, 35.75, 0], [105.25, 36, 0], [67.25, 36, 0], [67.5, 35.75, 0]]);
    const reversed = setup({ runs: [
      { depth: 21, topOverhang: { left: 3, right: 8 } },
      { x: 66, topOverhang: { left: 2, right: 1 } },
    ] });
    expect(reversed.bands[0].countertop.outline).toEqual([[26.5, 34.5, 0], [63.5, 34.5, 0],
      [63.5, 35.75, 0], [63.75, 36, 0], [26.75, 36, 0], [26.5, 35.75, 0]]);
  });

  it('keeps typed zeros when the nosing is cleared or the top changes to stone', () => {
    for (const props of [{}, { overrides: { nosingProfileId: null } }, { top: 'stone' }]) {
      const { bands: [bands], parts, sides: [side] } = setup({
        runs: [{ topOverhang: { front: 0, left: 0, right: 0 }, ...props }],
      });
      const projection = props.top || props.overrides ? 0 : 0.5;
      expect(bands.countertop).toMatchObject({ x: 30 - projection, width: 36 + 2 * projection });
      expect(parts.find(({ kind }) => kind === 'countertop')).toMatchObject({ back: 0, front: 24.875 + projection });
      expect(side).toMatchObject({ back: 0, front: 24.875 + projection });
    }
  });

  it('moves only the top back relative to an outset, even at an anchored wall end', () => {
    for (const top of ['wood', 'stone']) {
      const { parts, sides: [side], wall, room } = setup({ runs: [{ top, outset: 8,
        anchors: { left: { to: 'wall' } }, topOverhang: { back: 2 } }] });
      expect(parts.find(({ kind }) => kind === 'countertop')).toMatchObject({ back: 6 });
      expect(parts.find(({ kind }) => kind === 'toe_kick')).toMatchObject({ back: 8 });
      expect(side.back).toBe(6);
      if (top === 'wood') expect(side.outline[0]).toEqual([6, 34.5, 0]);
      expect(runSide(room, wall, wall.runs[0], settings).find(({ piece }) => piece === 'box').back).toBe(8);
    }
  });

  it('applies side values past wall panels while leaving square stops unchanged', () => {
    const topOverhang = { left: 12, right: 8 };
    const panels = setup({ runs: [{ x: 0, anchors: { left: true }, topOverhang }],
      endPanels: { start: { depth: 24, thickness: 0.75, z: 0, height: 34.5 }, end: null } });
    expect(panels.bands[0].countertop.outline[0]).toEqual([-12.5, 34.5, 0]);
    for (const runs of [
      [{ anchors: { left: { to: 'wall' } }, topOverhang }, { x: 66, topOverhang }],
      [{ x: 0, width: 30, height: 86 }, { topOverhang }, { x: 66, height: 86 }],
    ]) {
      const { bands } = setup({ runs });
      const band = bands[runs.length === 2 ? 0 : 1].countertop;
      expect(band.outline).toEqual([[30, 34.5, 0], [66, 34.5, 0], [66, 36, 0], [30, 36, 0]]);
      expect(band.lines).toEqual([line(30, 66, 35.75)]);
    }
  });
});
