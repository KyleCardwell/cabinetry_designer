import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bandParts } from '../bandParts.js';
import { cornerShapes } from '../cornerParts.js';
import { toDrawingPayload } from '../drawingPayload.js';
import { moldingProfiles } from '../moldingProfiles.js';
import { resolveProfile } from '../profile.js';
import { resolveWall, syncRoom } from '../room.js';
import { runBands } from '../runBands.js';
import { runScene } from '../runScene.js';
import { runSide } from '../runSide.js';
import { sectionProfileOutline } from '../sectionProfileOutline.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const load = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const document = normalizeElevationDocument(load('golden'));
const profiles = load('sectionProfiles').profiles;
const settings = { ...document.settings, sectionProfiles: profiles };
const picks = { topMoldProfileId: 'tm3', crownProfileId: 'cr45' };
const tm3 = profiles.find(({ id }) => id === 'tm3');
const cr45 = profiles.find(({ id }) => id === 'cr45');
const upper = document.rooms[0].walls[0].runs.find(({ id }) => id.startsWith('434f1164'));
const TOP_OUTLINE = [[13.125, 90, 0], [13.125, 90.75, 0], [13, 90.75, 0], [13, 93, 0], [11.625, 93, 0], [11.625, 90, 0]];
const CROWN_OUTLINE = [[13.125, 96, 0], [16.125, 96, 0], [16.125, 95, 0], [13.625, 92, 0], [13.625, 91.5, 0], [13.125, 91.5, 0]];

function setup(profile = picks, using = settings) {
  const stored = structuredClone(document.rooms[0]);
  stored.profile = { ...stored.profile, ...profile };
  stored.walls = [{
    ...stored.walls[0], x1: 0, y1: 0, x2: 120, y2: 0,
    connections: { start: null, end: null }, openings: [], joints: [],
    runs: [{ ...structuredClone(upper), x: 20, width: 60, anchors: {}, ends: {} }],
  }];
  const room = syncRoom(stored, using);
  const wall = resolveWall(room, room.walls[0]);
  const run = wall.runs[0];
  return {
    room, wall, run,
    bands: runBands(room, wall, run, using, runScene(room, wall, run, using)),
    parts: bandParts(room, room.walls[0], 'front', using),
    pieces: runSide(room, wall, run, using),
  };
}
const lines = (x1, x2, ...zs) => zs.map((z) => ({ x1, z1: z, x2, z2: z }));

describe('SPEC-50.2 step 471 molding placement', () => {
  it('keeps unpicked bands, parts, side rectangles and corners unchanged (anchor 1)', () => {
    const { room, wall, bands, parts, pieces } = setup({});
    expect(bands).toEqual({
      top: { kind: 'crown', height: 6 }, toeKicks: [], furnitureBases: [], countertop: null,
      topMold: { x: 19.75, z: 90, width: 60.5, height: 3, lines: [] },
      crown: { x: 17, z: 91.5, width: 66, height: 4.5, lines: [] },
      bottomParts: [], chipLines: [],
    });
    expect(parts).toEqual([
      { id: `${upper.id}:top_mold`, kind: 'top_mold', runId: upper.id,
        x: 19.75, z: 90, width: 60.5, height: 3, back: 0, front: 13.125, coversBoxEdges: false },
      { id: `${upper.id}:crown`, kind: 'crown', runId: upper.id,
        x: 17, z: 91.5, width: 66, height: 4.5, back: 0, front: 15.875, coversBoxEdges: false },
    ]);
    expect(pieces).toEqual([
      { piece: 'box', z: 54, height: 36, back: 0, front: 12 },
      { piece: 'faces', z: 54, height: 36, back: 12, front: 12.875 },
      { piece: 'top_mold', z: 90, height: 1.5, back: 0, front: 13.125 },
      { piece: 'crown', z: 91.5, height: 4.5, back: 0, front: 15.875 },
    ]);
    expect(cornerShapes(room, wall, 'front', settings)).toEqual([]);
  });

  it('places picked lines, front depths and whole side outlines (anchors 2 and 5)', () => {
    const { bands, parts, pieces } = setup();
    expect(bands.topMold).toEqual({ x: 19.75, z: 90, width: 60.5, height: 3, lines: lines(19.75, 80.25, 90.75),
      outline: [[19.75, 90, 0], [80.25, 90, 0], [80.25, 90.75, 0], [80.125, 90.75, 0],
        [80.125, 93, 0], [19.875, 93, 0], [19.875, 90.75, 0], [19.75, 90.75, 0]],
    });
    expect(bands.crown).toEqual({ x: 16.75, z: 91.5, width: 66.5, height: 4.5,
      lines: [...lines(16.75, 83.25, 95), ...lines(19.25, 80.75, 92)],
      outline: [[19.25, 91.5, 0], [80.75, 91.5, 0], [80.75, 92, 0], [83.25, 95, 0],
        [83.25, 96, 0], [16.75, 96, 0], [16.75, 95, 0], [19.25, 92, 0]],
    });
    expect(parts.map(({ front, lines }) => ({ front, lines }))).toEqual([
      { front: 13.125, lines: bands.topMold.lines }, { front: 16.125, lines: bands.crown.lines },
    ]);
    expect(pieces.slice(2)).toEqual([
      { piece: 'top_mold', z: 90, height: 3, back: 11.625, front: 13.125, outline: TOP_OUTLINE },
      { piece: 'crown', z: 91.5, height: 4.5, back: 13.125, front: 16.125, outline: CROWN_OUTLINE },
    ]);
  });

  it('stretches an eight-inch top mold from the lower box top (anchor 3)', () => {
    const { run, bands, pieces } = setup({ ...picks, crownStackHeight: 11, topMoldHeight: 8 });
    expect(run.z + run.height).toBe(85);
    expect(bands.topMold).toMatchObject({ z: 85, height: 8, lines: lines(19.75, 80.25, 85.75) });
    expect(bands.crown).toMatchObject({ z: 91.5, height: 4.5 });
    expect(pieces[2].outline).toEqual(TOP_OUTLINE.map(([x, z, bulge]) => [x, z < 93 ? z - 5 : z, bulge]));
    expect(pieces[3].outline).toEqual(CROWN_OUTLINE);
  });

  it('returns by the resolved overhang and profile projection, keeping plain crown at three inches (anchor 4)', () => {
    for (const overhang of [0.25, 0]) {
      const { bands, parts } = setup({ ...picks, topMoldOverhang: overhang });
      expect(20 - bands.topMold.x).toBe(overhang);
      expect(20 - bands.crown.x).toBe(3 + overhang);
      expect(parts.map(({ front }) => front)).toEqual([12.875 + overhang, 15.875 + overhang]);
      const plain = setup({ ...picks, crownProfileId: null, topMoldOverhang: overhang });
      expect(20 - plain.bands.crown.x).toBe(3);
      expect(plain.parts[1].front).toBe(15.875);
    }
  });

  it('keeps arcs in both directions, selects the largest closed loop and ignores open cuts', () => {
    const bead = profiles.find(({ id }) => id === 'sp-bead');
    for (const ccw of [false, true]) {
      const geometry = structuredClone(bead.geometry);
      geometry.loops[0].segs[0].ccw = ccw;
      const outline = sectionProfileOutline(geometry);
      expect(outline).toEqual([[0, 0, ccw ? 1 : -1], [0.5, 0, 0]]);
    }
    const geometry = structuredClone(tm3.geometry);
    Object.assign(geometry.points, { s: [0, 0], t: [0.1, 0], u: [0, 0.1], cut: [100, 100] });
    geometry.loops.unshift({ id: 'small', closed: true, segs: [
      { type: 'line', from: 's', to: 't' }, { type: 'line', from: 't', to: 'u' }, { type: 'line', from: 'u', to: 's' },
    ] });
    geometry.loops.push({ id: 'cut', closed: false, segs: [{ type: 'line', from: 's', to: 'cut' }] });
    expect(sectionProfileOutline(geometry)).toEqual(Object.values(tm3.geometry.points).map(([x, y]) => [x, y, 0]));
  });

  it('deduplicates lines, skips band edges, uses fixed heights and falls back for open or missing profiles', () => {
    const changed = structuredClone(tm3);
    Object.assign(changed.geometry.points, { nearB: [0, 0.7500005], nearA: [0, 0.0000005], nearF: [0, 2.9999995] });
    changed.drawnPoints.elevation = ['a', 'b', 'e', 'f', 'd', 'nearB', 'nearA', 'nearF'];
    const using = { ...settings, sectionProfiles: [changed, cr45] };
    expect(setup(picks, using).bands.topMold.lines).toEqual(lines(19.75, 80.25, 90.75));
    const fixed = structuredClone(changed);
    delete fixed.stretch;
    const fixedCase = setup({ ...picks, topMoldHeight: 8 }, { ...using, sectionProfiles: [fixed, cr45] });
    expect(fixedCase.bands.topMold.height).toBe(3);
    expect(fixedCase.pieces[2].outline).toEqual(TOP_OUTLINE);
    const short = setup({ ...picks, topMoldHeight: 1 });
    expect(short.pieces[2].outline).toEqual(TOP_OUTLINE);
    expect(moldingProfiles(resolveProfile(settings, short.room, short.wall), settings).warnings)
      .toContainEqual({ code: 'top-mold-too-short' });
    const open = structuredClone(tm3);
    open.geometry.loops[0].closed = false;
    open.geometry.loops[0].segs.pop();
    const openSettings = { ...settings, sectionProfiles: [open, cr45] };
    const openCase = setup(picks, openSettings);
    expect(openCase.pieces[2]).toEqual({ piece: 'top_mold', z: 90, height: 3, back: 0, front: 13.125 });
    expect(openCase.bands.topMold.outline).toEqual([[19.75, 90, 0], [80.25, 90, 0], [80.25, 93, 0], [19.75, 93, 0]]);
    expect(moldingProfiles(resolveProfile(openSettings, openCase.room, openCase.wall), openSettings).warnings)
      .toContainEqual({ code: 'molding-profile-open', slot: 'top_mold' });
    expect(setup({ topMoldProfileId: 'missing', crownProfileId: 'tm3' }).pieces).toEqual(setup({}).pieces);
  });

  it('maps return and side-view outlines into elevation and carries lines and outlines in the payload', () => {
    const stored = structuredClone(document.rooms[0]);
    stored.profile = { ...stored.profile, ...picks };
    const room = syncRoom(stored, settings);
    const shapes = cornerShapes(room, room.walls[1], 'front', settings);
    const moldings = shapes.flatMap(({ parts }) => parts).filter(({ outline }) => outline);
    expect(moldings.map(({ outline }) => outline)).toEqual([TOP_OUTLINE, CROWN_OUTLINE]);
    const payload = toDrawingPayload(room, settings);
    const elevation = payload.elevations.find(({ wallId }) => wallId === room.walls[1].id);
    for (const part of moldings) expect(elevation.parts).toContainEqual(part);
    expect(payload.elevations.flatMap(({ parts }) => parts).some(({ lines }) => lines?.length)).toBe(true);
    const unpickedRoom = syncRoom(document.rooms[0], settings);
    expect(payload.plan).toEqual(toDrawingPayload(unpickedRoom, settings).plan);

    const g3 = structuredClone(document.rooms[2]);
    g3.profile = { ...g3.profile, ...picks };
    const alcove = syncRoom(g3, settings);
    const neighbor = resolveWall(alcove, alcove.walls[1]);
    const rightReturns = cornerShapes(alcove, alcove.walls[0], 'front', settings);
    const target = resolveWall(alcove, alcove.walls[0]);
    for (const shape of rightReturns.filter(({ runId }) => runId)) {
      const run = neighbor.runs.find(({ id }) => id === shape.runId);
      for (const piece of runSide(alcove, neighbor, run, settings).filter(({ outline }) => outline)) {
        expect(shape.parts.find(({ kind }) => kind === piece.piece).outline)
          .toEqual(piece.outline.map(([depth, z, bulge]) => [target.length - depth, z, -bulge || 0]));
      }
    }

    const g2 = structuredClone(document.rooms[1]);
    g2.profile = { ...g2.profile, ...picks };
    const run = g2.walls[1].runs.find(({ wallSide }) => wallSide === 'back');
    run.top = 'crown';
    const synced = syncRoom(g2, settings);
    const side = resolveWall(synced, synced.walls[1], 'back');
    const source = runSide(synced, side, side.runs.find(({ id }) => id === run.id), settings);
    const profile = cornerShapes(synced, synced.walls[0], 'front', settings).find(({ kind }) => kind === 'profile');
    for (const piece of source.filter(({ outline }) => outline)) {
      const part = profile.parts.find(({ kind }) => kind === piece.piece);
      expect(part.outline).toEqual(piece.outline.map(([depth, z, bulge]) => [172 + depth, z, bulge]));
    }
  });
  it('keeps arc bulges through side placement, mirrored returns, side profiles and payloads', () => {
    const bead = profiles.find(({ id }) => id === 'sp-bead');
    const curved = { ...cr45, geometry: bead.geometry, drawnPoints: { elevation: [] } };
    const using = { ...settings, sectionProfiles: [tm3, curved] };
    const { pieces } = setup(picks, using);
    expect(pieces.find(({ piece }) => piece === 'crown').outline)
      .toEqual([[13.125, 96, -1], [13.625, 96, 0]]);
    expect(pieces.find(({ piece }) => piece === 'crown').height).toBeCloseTo(0.25);
    for (const [roomIndex, wallIndex, expected] of [[0, 1, -1], [2, 0, 1]]) {
      const stored = structuredClone(document.rooms[roomIndex]);
      stored.profile = { ...stored.profile, ...picks };
      const room = syncRoom(stored, using);
      const wall = room.walls[wallIndex];
      wall.elevationForced = true;
      const crowns = cornerShapes(room, wall, 'front', using).flatMap(({ parts }) => parts)
        .filter(({ kind, outline }) => kind === 'crown' && outline);
      expect(crowns.length).toBeGreaterThan(0);
      const elevation = toDrawingPayload(room, using).elevations.find(({ wallId }) => wallId === wall.id);
      for (const crown of crowns) {
        expect(crown.outline.map(([, , bulge]) => bulge)).toEqual([expected, 0]);
        expect(elevation.parts).toContainEqual(crown);
      }
    }
    const stored = structuredClone(document.rooms[1]);
    stored.profile = { ...stored.profile, ...picks };
    const run = stored.walls[1].runs.find(({ wallSide }) => wallSide === 'back');
    run.top = 'crown';
    const room = syncRoom(stored, using);
    const crown = cornerShapes(room, room.walls[0], 'front', using)
      .find(({ kind }) => kind === 'profile').parts.find(({ kind }) => kind === 'crown');
    expect(crown.outline).toEqual([[196.25, 40.5, -1], [196.75, 40.5, 0]]);
  });

});
