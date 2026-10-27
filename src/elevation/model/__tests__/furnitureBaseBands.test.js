import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { connectWallStops } from './helpers/wallStops.js';
import { room as buildRoom, run as buildRun, wall as buildWall } from '../../../test/builders.js';
import { bandParts } from '../bandParts.js';
import { CABINET_TYPE_IDS } from '../constants.js';
import { cornerBandEdge } from '../cornerBands.js';
import { toDrawingPayload } from '../drawingPayload.js';
import { furnitureBaseBand, runBase } from '../furnitureBase.js';
import { runItems } from '../grid.js';
import { resolveWall, syncRoom } from '../room.js';
import { runBands } from '../runBands.js';
import { runScene } from '../runScene.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const load = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const document = normalizeElevationDocument(load('golden'));
const settings = { ...document.settings, sectionProfiles: [...document.settings.sectionProfiles, ...load('sectionProfiles').profiles] };
const baseRun = document.rooms[0].walls[0].runs.find(({ cabinetTypeId }) => cabinetTypeId === CABINET_TYPE_IDS.BASE);
const OUTLINE = [[29.1875, 0, 0], [66.8125, 0, 0], [66.8125, 3.6875, 0],
  [66.5, 4, 0], [29.5, 4, 0], [29.1875, 3.6875, 0]];
const line = (x1, x2, z) => ({ x1, z1: z, x2, z2: z });

function setup({ profile = {}, runs = [{}], endPanels, wallStops = false } = {}, using = settings) {
  const stored = buildRoom(structuredClone(document.rooms[0]));
  stored.profile = { ...stored.profile, baseKind: 'furniture_base', ...profile };
  stored.walls = [buildWall({ ...stored.walls[0], x1: 0, y1: 0, x2: 120, y2: 0,
    connections: { start: null, end: null }, openings: [], joints: [],
    endPanels: endPanels ?? { start: null, end: null },
    runs: runs.map((props, i) => buildRun({ ...structuredClone(baseRun), items: runItems(structuredClone(baseRun)),
      id: `base-${i}`, x: 30, width: 36,
      anchors: {}, ends: { left: { type: 'end_panel' }, right: { type: 'end_panel' } }, ...props })),
  })];
  if (wallStops) connectWallStops(stored, stored.walls[0]);
  const room = syncRoom(stored, using);
  const wall = resolveWall(room, room.walls[0]);
  const bandsOf = (run, scene = runScene(room, wall, run, using)) => runBands(room, wall, run, using, scene);
  return { room, wall, bandsOf, bands: wall.runs.map((run) => bandsOf(run)),
    parts: bandParts(room, room.walls[0], 'front', using) };
}

describe('SPEC-50.5 step 488 furniture base bands', () => {
  it('returns a plain board with the specified depth and no outline (anchor 1)', () => {
    const { bands: [bands], parts } = setup();
    expect(bands.toeKicks).toEqual([]);
    expect(bands.furnitureBases[0]).toEqual({ x: 29.1875, z: 0, width: 37.625, height: 4, lines: [] });
    expect(parts.find(({ kind }) => kind === 'furniture_base')).toEqual({
      id: 'base-0:furniture_base', kind: 'furniture_base', runId: 'base-0',
      x: 29.1875, z: 0, width: 37.625, height: 4, back: 0, front: 25.6875, coversBoxEdges: false,
    });
  });

  it('places fb4 at its top, returning both ends and stopping its line on them (anchor 2)', () => {
    const { room, bands: [bands], parts } = setup({ profile: { furnitureBaseProfileId: 'fb4' } });
    expect(bands.furnitureBases[0]).toEqual({ x: 29.1875, z: 0, width: 37.625, height: 4,
      outline: OUTLINE, lines: [line(29.1875, 66.8125, 3.6875)] });
    const part = parts.find(({ kind }) => kind === 'furniture_base');
    expect(part).toMatchObject({ outline: OUTLINE, lines: bands.furnitureBases[0].lines, front: 25.6875 });
    expect(toDrawingPayload(room, settings).elevations[0].parts).toContainEqual(part);
  });

  it('stretches down to six inches while raising the band top and box together (anchor 3)', () => {
    const { wall, bands: [bands] } = setup({ profile: { furnitureBaseProfileId: 'fb4' },
      runs: [{ overrides: { toeKickHeight: 6 } }] });
    expect(bands.furnitureBases[0].outline).toEqual([[29.1875, 0, 0], [66.8125, 0, 0],
      [66.8125, 5.6875, 0], [66.5, 6, 0], [29.5, 6, 0], [29.1875, 5.6875, 0]]);
    expect(bands.furnitureBases[0].height).toBe(6);
    expect(bands.furnitureBases[0].lines).toEqual([line(29.1875, 66.8125, 5.6875)]);
    expect(wall.runs[0].z).toBe(6);
  });

  it('places a one-inch proud base without changing its profile (anchor 4)', () => {
    const { bands: [bands], parts } = setup({ profile: { furnitureBaseProfileId: 'fb4', furnitureBaseProud: 1 } });
    expect(bands.furnitureBases[0].outline).toEqual([[29, 0, 0], [67, 0, 0], [67, 3.6875, 0],
      [66.6875, 4, 0], [29.3125, 4, 0], [29, 3.6875, 0]]);
    expect(parts.find(({ kind }) => kind === 'furniture_base').front).toBe(25.875);
  });

  it('returns the deeper base and copes the shallower onto its contour (anchor 5)', () => {
    const { bands: [deep, shallow] } = setup({ profile: { furnitureBaseProfileId: 'fb4' },
      runs: [{}, { x: 66, depth: 21 }] });
    expect(deep.furnitureBases[0].outline).toEqual(OUTLINE);
    expect(shallow.furnitureBases[0].outline).toEqual([[66.8125, 0, 0], [102.8125, 0, 0],
      [102.8125, 3.6875, 0], [102.5, 4, 0], [66.5, 4, 0], [66.8125, 3.6875, 0]]);
    expect(shallow.furnitureBases[0].lines).toEqual([line(66.8125, 102.8125, 3.6875)]);
  });

  it('squares both a furniture base and its touching toe kick at the shared side (anchor 6)', () => {
    const { bands: [deep, shallow] } = setup({ profile: { furnitureBaseProfileId: 'fb4' },
      runs: [{}, { x: 66, depth: 21, overrides: { baseKind: 'toe_kick' }, ends: {} }] });
    expect(deep.furnitureBases[0].outline).toEqual([[29.1875, 0, 0], [66, 0, 0], [66, 4, 0],
      [29.5, 4, 0], [29.1875, 3.6875, 0]]);
    expect(deep.furnitureBases[0].lines).toEqual([line(29.1875, 66, 3.6875)]);
    expect(shallow.toeKicks[0]).toEqual({ x: 66, z: 0, width: 35.75, height: 4 });
    expect(shallow.furnitureBases).toEqual([]);
  });

  it('keeps furnitureBase null throughout the golden rooms and preserves their payloads (anchor 7)', () => {
    for (const stored of document.rooms) {
      const room = syncRoom(stored, settings);
      for (const wall of room.walls) {
        for (const side of ['front', 'back']) {
          const view = resolveWall(room, wall, side);
          for (const run of view.runs) {
            expect(runBands(room, view, run, settings, runScene(room, view, run, settings)).furnitureBases).toEqual([]);
          }
        }
      }
      expect(toDrawingPayload(room, settings)).toEqual(toDrawingPayload(syncRoom(stored, document.settings), document.settings));
    }
  });

  it('matches base heights independently of box tops and squares unequal-height neighbors', () => {
    const profile = { furnitureBaseProfileId: 'fb4' };
    const tall = { x: 66, depth: 21, cabinetTypeId: CABINET_TYPE_IDS.TALL };
    expect(setup({ profile, runs: [{}, tall] }).bands[0].furnitureBases[0].outline).toEqual(OUTLINE);
    const unequal = setup({ profile, runs: [{}, { ...tall, overrides: { toeKickHeight: 6 } }] }).bands;
    expect(unequal[0].furnitureBases[0].outline.slice(1, 3)).toEqual([[66, 0, 0], [66, 4, 0]]);
    expect(unequal[1].furnitureBases[0].outline[0]).toEqual([66, 0, 0]);
    expect(unequal[1].furnitureBases[0].outline.at(-1)).toEqual([66, 6, 0]);
    expect(setup({ profile, runs: [{}, { x: 66 }] }).bands[0].furnitureBases[0].outline.slice(1, 3))
      .toEqual([[66, 0, 0], [66, 4, 0]]);
  });

  it('squares wall and blind ends and returns at recess sides and over an anchored wall end panel', () => {
    const { room, wall, bandsOf } = setup({ profile: { furnitureBaseProfileId: 'fb4' }, wallStops: true });
    const run = wall.runs[0];
    for (const anchor of [true, { to: 'wall', wallId: 'wall' }]) {
      const band = bandsOf({ ...run, _plane: { recessId: 'recess' }, anchors: { right: anchor } }).furnitureBases[0];
      expect(band.outline.slice(1, 3)).toEqual([[66, 0, 0], [66, 4, 0]]);
    }
    const recessed = bandsOf({ ...run, _plane: { recessId: 'recess' },
      anchors: { right: { to: 'recess', recessId: 'recess' } } }).furnitureBases[0];
    expect(recessed.outline.slice(1, 4)).toEqual([[66.8125, 0, 0], [66.8125, 3.6875, 0], [66.5, 4, 0]]);
    const scene = runScene(room, wall, run, settings);
    scene.panelBySide.right = { x: 66, width: 54 };
    expect(bandsOf(run, scene).furnitureBases[0].outline.slice(1, 3)).toEqual([[120, 0, 0], [120, 4, 0]]);
    const paneled = setup({ profile: { furnitureBaseProfileId: 'fb4' },
      endPanels: { start: null, end: { width: 0.75 } } });
    expect(paneled.bandsOf({ ...paneled.wall.runs[0], anchors: { right: true } }).furnitureBases[0].outline.slice(1, 4))
      .toEqual([[120.8125, 0, 0], [120.8125, 3.6875, 0], [120.5, 4, 0]]);
  });

  it('matches corner return furniture bases by kind, bottom and height on inside and wing walls', () => {
    const outline = [[24.875, 4, 0], [25.375, 4, 0], [25.6875, 3.6875, 0],
      [25.6875, 0, 0], [24.875, 0, 0]];
    const part = { kind: 'furniture_base', x: 24.875, z: 0, width: 0.8125, height: 4, outline };
    const shapes = () => [{ kind: 'return', key: 'left:base', parts: [part] },
      { kind: 'return', key: 'landing:wing:right:base', parts: [{ ...part, x: 94.3125 }] }];
    const run = { anchors: { left: true, right: { to: 'wall', wallId: 'wing' } } };
    expect(cornerBandEdge(shapes, run, 'left', 'furnitureBase', 0, 4))
      .toEqual({ type: 'cope', x: 25.6875, outline });
    const base = runBase({ profile: { baseKind: 'furniture_base', furnitureBaseProfileId: 'fb4' } }, {}, baseRun, settings);
    const band = furnitureBaseBand(base, [cornerBandEdge(shapes, run, 'left', 'furnitureBase', 0, 4),
      { type: 'return', x: 66.8125, side: 66, facing: 1 }]);
    expect(band.outline).toEqual([[25.6875, 0, 0], ...OUTLINE.slice(1, 4),
      [25.375, 4, 0], [25.6875, 3.6875, 0]]);
    expect(band.lines).toEqual([line(25.6875, 66.8125, 3.6875)]);
    expect(cornerBandEdge(shapes, run, 'right', 'furnitureBase', 0, 4).x).toBe(94.3125);
    expect(cornerBandEdge(shapes, run, 'left', 'furnitureBase', 0, 6)).toBeNull();
    expect(cornerBandEdge(shapes, run, 'left', 'furnitureBase', 1, 4)).toBeNull();
    expect(cornerBandEdge(() => [{ kind: 'return', key: 'left:base', parts: [{ ...part, kind: 'toe_kick' }] }],
      run, 'left', 'furnitureBase', 0, 4)).toBeNull();
  });

  it('copes on the neighbor profile and proud, including mirrored ends and positive profile projection', () => {
    const projecting = structuredClone(settings.sectionProfiles.find(({ id }) => id === 'fb4'));
    projecting.id = 'projecting';
    for (const point of Object.values(projecting.geometry.points)) point[0] += 0.25;
    const using = { ...settings, sectionProfiles: [...settings.sectionProfiles, projecting] };
    const profile = { furnitureBaseProfileId: 'fb4' };
    const deeper = { x: 66, depth: 27, overrides: { furnitureBaseProfileId: 'projecting', furnitureBaseProud: 1 } };
    const { bands: [shallow, deep], parts } = setup({ profile, runs: [{}, deeper] }, using);
    expect(shallow.furnitureBases[0].outline.slice(1, 4))
      .toEqual([[64.75, 0, 0], [64.75, 3.6875, 0], [65.0625, 4, 0]]);
    expect(shallow.furnitureBases[0].lines).toEqual([line(29.1875, 64.75, 3.6875)]);
    expect(deep.furnitureBases[0].x).toBe(64.75);
    expect(parts.find(({ runId, kind }) => runId === 'base-1' && kind === 'furniture_base').front).toBe(29.125);
    const plain = setup({ profile, runs: [{}, { ...deeper, overrides: { furnitureBaseProfileId: null, furnitureBaseProud: 1 } }] });
    expect(plain.bands[0].furnitureBases[0].outline.slice(1, 3)).toEqual([[65, 0, 0], [65, 4, 0]]);
  });

  it('skips band-edge lines, deduplicates heights, falls back for missing picks and closes open cuts', () => {
    const changed = structuredClone(settings.sectionProfiles.find(({ id }) => id === 'fb4'));
    delete changed.stretch;
    Object.assign(changed.geometry.points, { nearTop: [0, -0.0000005], nearBottom: [0, -3.9999995],
      nearC: [0, -0.3125005] });
    changed.drawnPoints.elevation = ['a', 'c', 'd', 'nearTop', 'nearBottom', 'nearC'];
    const using = { ...settings, sectionProfiles: [changed] };
    const profile = { furnitureBaseProfileId: 'fb4' };
    expect(setup({ profile }, using).bands[0].furnitureBases[0].lines).toEqual([line(29.1875, 66.8125, 3.6875)]);
    expect(setup({ profile: { furnitureBaseProfileId: 'missing' } }).bands[0].furnitureBases[0])
      .toEqual(setup().bands[0].furnitureBases[0]);
    changed.geometry.loops[0].closed = false;
    changed.geometry.loops[0].segs.pop();
    expect(setup({ profile }, using).bands[0].furnitureBases[0].outline)
      .toEqual(OUTLINE);
  });
});
