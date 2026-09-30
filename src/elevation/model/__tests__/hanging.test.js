import { describe, expect, it } from 'vitest';
import { cellPieces } from '../cells.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
import { frameRegions } from '../frames.js';
import { gridFromItems } from '../grid.js';
import { resolveWall, syncRoom } from '../room.js';
import { panelDrop } from '../styles.js';

const S = DEFAULT_SETTINGS;
const NONE = { type: 'none', width: null };

/** SPEC-36.3: a 48" run at x 24, auto height, two auto cabinets, on a 144" wall. */
function build(style, overrides = {}, type = CABINET_TYPE_IDS.BASE) {
  const run = {
    id: 'r', cabinetTypeId: type, x: 24, width: 48, z: 4, height: 30.5, depth: 24,
    ends: { left: NONE, right: NONE }, autoCount: false, maxCabinetWidth: null,
    heightMode: 'auto', overrides: {}, anchors: { left: false, right: false },
    grid: gridFromItems('r', [{ id: 'a', kind: 'cabinet', width: null }, { id: 'b', kind: 'cabinet', width: null }]),
    ...overrides,
  };
  const wall = {
    id: 'wall-1', name: 'Wall 1', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5,
    flipped: false, connections: { start: null, end: null }, profile: {}, runs: [run], openings: [],
    joints: [], endPanels: { start: null, end: null }, landings: { start: null, end: null }, soffits: [],
  };
  const room = syncRoom({
    id: 'room-1', name: 'Room 1', profile: { ...S.defaultProfile }, walls: [wall], wallOrder: ['wall-1'],
    ...(style ? { style } : {}),
  }, S);
  const synced = room.walls[0].runs[0];
  const resolved = resolveWall(room, room.walls[0]);
  const layout = layoutRun(room, resolved, synced, S);
  const region = frameRegions(room, synced, cellPieces(synced, layout), S).regions[0] ?? null;
  const faces = runFaceLayouts(room, resolved, synced, S, layout).get('a');
  return {
    run: synced,
    region,
    reveals: faces.reveals,
    face: faces.faces[0],
    drop: panelDrop(synced, { cabinetStyleId: style ? style.cabinetStyleId : 13 }, S),
  };
}

const INSET = { cabinetStyleId: 14 };

describe('SPEC-36.3 hanging base', () => {
  it('raises the box by the drop and shortens it, leaving the frame where a base\'s is', () => {
    const plain = build(INSET);
    expect([plain.run.z, plain.run.height, plain.run._frame.drop]).toEqual([4, 30.5, 0]);
    expect([plain.region.z, plain.region.height]).toEqual([4, 30.5]);

    const hanging = build(INSET, { hanging: true });
    expect([hanging.run.z, hanging.run.height]).toEqual([4.75, 29.75]);
    expect(hanging.run._frame).toEqual({ thickness: 0.8125, drop: 0.75 });
    expect([hanging.region.z, hanging.region.height]).toEqual([4, 30.5]);
    expect([hanging.face.z, hanging.face.height]).toEqual([5.5, 27.5]);
  });

  it('gives the box an upper\'s bottom reveal, beaded too, and drops the end pieces', () => {
    const hanging = build(INSET, { hanging: true });
    expect(hanging.reveals.values).toMatchObject({ top: 1.5, bottom: 0.75 });
    expect(hanging.reveals.sources.bottom).toBe('rule:hanging');
    expect(hanging.drop).toBe(0.75);

    const beaded = build({ cabinetStyleId: 15 }, { hanging: true });
    expect(beaded.reveals.values).toMatchObject({ top: 1.75, bottom: 1 });
    expect([beaded.region.z, beaded.region.height]).toEqual([4, 30.5]);
    expect([beaded.face.z, beaded.face.height]).toEqual([5.75, 27]);
  });

  it('leaves European runs, uppers and talls as they were', () => {
    const euro = build(null, { hanging: true });
    expect([euro.run.z, euro.run.height, euro.run._frame]).toEqual([4, 30.5, undefined]);
    expect(euro.reveals.values.bottom).toBe(0.125);
    expect(euro.reveals.sources.bottom).toBe('style');
    expect(euro.drop).toBe(0);

    const upper = build(INSET, {}, CABINET_TYPE_IDS.UPPER);
    expect([upper.run.z, upper.run.height, upper.run._frame.drop]).toEqual([54.75, 35.25, 0.75]);
    expect([upper.region.z, upper.region.height]).toEqual([54, 36]);
    expect(upper.reveals.values.bottom).toBe(0.75);
    expect(upper.reveals.sources.bottom).toBe('style');

    const tall = build(INSET, { hanging: true }, CABINET_TYPE_IDS.TALL);
    expect([tall.run.z, tall.run.height, tall.run._frame.drop]).toEqual([4, 86, 0]);
  });
});
