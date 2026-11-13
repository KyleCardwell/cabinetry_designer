import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { syncRoom, flipRunsForWall } from '../room.js';
import { runLegList } from '../endLegs.js';
import { runLegs } from '../legs.js';
import { legFillPlans, legRoom } from '../legRoom.js';
import { wallEndLegList } from '../wallEndLegs.js';
import { wallEndPanels } from '../wallEndPanels.js';
import { cornerReserveParts } from '../corners.js';
import { wallSideView } from '../wallSides.js';
import { faceDrawing, toDrawingPayload } from '../drawingPayload.js';
import { roomParts } from '../parts.js';
import { partNumbers } from '../partNumbers.js';
import { auto, room, run, wall } from '../../../test/builders.js';
import { shippingList } from '../../../reports/shippingList.js';
import { E, S, Sf, legShape, noEnds } from './fixtures/legs.js';

const settings = { ...DEFAULT_SETTINGS, runFlex: 0, shapes: [legShape()] };
const R = run({ id: 'R', width: 36, anchors: { left: true, right: false }, ends: noEnds,
  autoCount: false, items: [auto('cabinet')] });
const Rb = run({ ...R, id: 'Rb', wallSide: 'back', anchors: { left: false, right: true } });
const W = wall({ id: 'w', x2: 96, thickness: 4.5, runs: [R],
  endPanels: { start: { width: null }, end: null },
  endLegs: { start: { faces: { front: { legs: 'front', front: S } } } } });

// Inspect an already-built room after its normal sync, on the run's own face.
function inspect(input, options = settings, runId = 'R') {
  const synced = syncRoom(input, options);
  const w = synced.walls[0];
  const r = w.runs.find(({ id }) => id === runId);
  return { synced, w, r, panel: wallEndPanels(synced, w, options)[0],
    legs: runLegs(synced, wallSideView(w, r.wallSide), r, options) };
}

describe('wall end placement and room (SH7.6)', () => {

  it('places a named wall leg at the end line and reserves it once', () => {
    const input = room({ walls: [W] });
    const before = structuredClone(input);
    const { synced, r, panel, legs } = inspect(input);
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ name: 'Left end front-face front leg',
      bounds: { x: 0, width: 3.5, z: 0, height: 34.5 }, front: 24.875, back: 21.375 });
    expect(legRoom(r, settings)).toEqual({ left: 0, right: 0 });
    expect(panel.front.x).toBe(3.5);
    expect(r.x).toBe(4.3125);
    expect(syncRoom(synced, settings)).toEqual(synced);
    expect(input).toEqual(before);
  });

  it('places both depth edges with their default mirrors', () => {
    const { r, panel, legs } = inspect(room({ walls: [wall({ ...W,
      endLegs: { start: { faces: { front: E } } } })] }));
    expect(legs[0]).toMatchObject({ front: 25.375, back: 21.875, leg: { mirror: true } });
    expect(legs[1]).toMatchObject({ front: 3.5, back: 0, leg: { mirror: true, mirrorDepth: true } });
    expect(panel.front.x).toBe(3.5);
    expect(r.x).toBe(4.3125);
  });

  it('proud x reduces the reserve and moves the panel out', () => {
    const { r, panel, legs } = inspect(room({ walls: [wall({ ...W,
      endLegs: { start: { faces: { front: { legs: 'front', front: { ...S, x: 1 } } } } } })] }));
    expect(legs[0].bounds.x).toBe(-1);
    expect(panel.front.x).toBe(2.5);
    expect(r.x).toBe(3.3125);
  });

  it('without a panel each face reserves only its own legs', () => {
    const { synced, w, r, panel } = inspect(room({ walls: [wall({ ...W, runs: [R, Rb],
      endPanels: { start: null, end: null } })] }));
    expect(r.x).toBe(3.5);
    expect(panel).toBeUndefined();
    const back = w.runs[1];
    expect(back.x).toBe(60);
    expect(cornerReserveParts(synced, w, 'right', back, settings).total).toBe(0);
  });

  it('back-only legs move the panel and both faces together', () => {
    const input = room({ walls: [wall({ ...W, runs: [R, Rb],
      endLegs: { start: { faces: { back: { legs: 'front', front: S } } } } })] });
    const { w, r, panel } = inspect(input);
    const back = inspect(input, settings, 'Rb');
    expect(back.legs[0]).toMatchObject({ bounds: { x: 92.5 }, name: 'Left end back-face front leg' });
    expect(panel.back.x).toBe(91.6875);
    expect(r.x).toBe(4.3125);
    expect(w.runs[1].x).toBe(55.6875);
    expect(r._wallEnds).toEqual({ left: true });
    expect(w.runs[1]._wallEnds).toEqual({ right: true });
    expect(r).not.toHaveProperty('_wallLegs');
  });

  it.each([{ ...S, takesRoom: false }, { ...S, y: 5 }])(
    'places nontaking legs without reserving room (%j)', (spec) => {
      const { r, panel, legs } = inspect(room({ walls: [wall({ ...W,
        endLegs: { start: { faces: { front: { legs: 'front', front: spec } } } } })] }));
      expect(r.x).toBe(0.8125);
      expect(panel.front.x).toBe(0);
      expect(legs).toHaveLength(1);
      if (spec.y === 5) expect(legs[0]).toMatchObject({ front: 29.875, back: 26.375 });
    },
  );

  it('wall ownership suppresses run-end legs and restores them when removed', () => {
    const own = run({ ...R, endLegs: { left: { legs: 'front', front: Sf } } });
    const { synced, r } = inspect(room({ walls: [wall({ ...W, runs: [own] })] }));
    expect(runLegList(r).map(({ id }) => id)).toEqual(['w:wallleg:start-front-front']);
    expect(r._wallEnds).toEqual({ left: true });
    expect(r.x).toBe(4.3125);
    const without = inspect(room({ ...synced,
      walls: [wall({ ...synced.walls[0], endLegs: undefined })] }));
    expect(runLegList(without.r).map(({ id }) => id)).toEqual(['R:endleg:left-front']);
    expect(without.r).not.toHaveProperty('_wallEnds');
    expect(without.r).not.toHaveProperty('_wallLegs');
  });

  it('uses the flexed end line independently of run x', () => {
    const source = room({ walls: [wall({ ...W, _endFlex: { start: 1 },
      runs: [run({ ...R, x: 3.3125 })] })] });
    const w = source.walls[0];
    const r = { ...w.runs[0], _wallLegs: wallEndLegList(source, w, settings).map(({ leg }) => leg) };
    expect(runLegs(source, w, r, settings)[0].bounds.x).toBe(-1);
    expect(wallEndPanels(source, w, settings)[0].front.x).toBe(2.5);
  });

  it('moves run, panel and wall leg together when sync computes flex', () => {
    const input = room({ walls: [wall({ ...W, x2: 90,
      endPanels: { start: { width: null }, end: { width: null } },
      runs: [run({ ...R, autoCount: true, anchors: { left: true, right: true } })] })] });
    const drawn = inspect(input);
    const options = { ...settings, runFlex: 1 };
    const flexed = inspect(input, options);
    const move = flexed.w._endFlex?.start ?? 0;
    expect(move).toBeGreaterThan(0);
    expect(flexed.r.x).toBe(drawn.r.x - move);
    expect(flexed.panel.front.x).toBe(3.5 - move);
    expect(flexed.legs[0].bounds.x).toBe(-move);
    expect(syncRoom(flexed.synced, options)).toEqual(flexed.synced);
  });

  it('connecting or landing a previously active end clears derived legs', () => {
    const active = inspect(room({ walls: [W] })).synced;
    for (const field of ['connections', 'landings']) {
      const linked = wall({ ...active.walls[0], [field]: { start: { wallId: 'other', endpoint: 'end' } } });
      const { r, legs } = inspect(room({ ...active, walls: [linked] }));
      const baseline = inspect(room({ walls: [wall({ ...linked, endLegs: undefined })] }));
      expect(legs).toHaveLength(0);
      expect(r).not.toHaveProperty('_wallLegs');
      expect(r).not.toHaveProperty('_wallEnds');
      expect(r.x).toBe(baseline.r.x);
    }
  });

  it('flipping keeps stored endpoint data and ids at the same wall end', () => {
    const source = wall({ ...W, endLegs: { start: { faces: { front: E } } } });
    const flipped = flipRunsForWall(source);
    expect(flipped.endLegs).toEqual(source.endLegs);
    const before = inspect(room({ walls: [source] }));
    const after = inspect(room({ walls: [flipped] }));
    expect(after.legs.map(({ leg }) => leg.id)).toEqual(before.legs.map(({ leg }) => leg.id));
    expect(after.legs[0].bounds.x).toBe(92.5);
    expect(after.panel.front.x).toBe(91.6875);
    expect(after.legs.map(({ front, back }) => [front, back]))
      .toEqual(before.legs.map(({ front, back }) => [front, back]));
  });

  it('honors typed clearance and missing shapes, and leaves wall legs out of run fills', () => {
    const { r } = inspect(room({ walls: [wall({ ...W,
      runs: [run({ ...R, cornerClearance: { left: 2 } })] })] }));
    expect(r.x).toBe(2);
    expect(legRoom(r, settings)).toEqual({ left: 0, right: 0 });
    expect(legFillPlans({ ...r, _wallLegs: r._wallLegs.map((leg) => ({ ...leg, fill: { type: 'panel' } })) }, settings))
      .toEqual([]);
    const missing = inspect(room({ walls: [W] }), { ...settings, shapes: [] });
    expect(missing.r.x).toBe(0.8125);
    expect(missing.panel.front.x).toBe(0);
    expect(missing.legs.warnings).toEqual([{ code: 'leg-shape-missing',
      name: 'Left end front-face front leg', legId: 'w:wallleg:start-front-front' }]);
  });

  it('carries wall legs into drawing, plan, parts, part numbers and shipping', () => {
    const { synced, w } = inspect(room({ walls: [W] }));
    const id = 'w:wallleg:start-front-front';
    const drawing = faceDrawing(synced, w, 'front', settings);
    expect(drawing.parts.find((part) => part.id === id)).toMatchObject({ kind: 'leg', x: 0, width: 3.5 });
    const payload = toDrawingPayload(synced, settings);
    expect(payload.plan.shapes.find((shape) => shape.id === id)).toMatchObject({ kind: 'leg', top: 34.5 });
    expect(payload.elevations[0].parts.find((part) => part.id === id)).toMatchObject({ kind: 'leg', x: 0 });
    expect(roomParts(synced, settings).find((part) => part.key === id)).toMatchObject({ kind: 'leg', x: 0 });
    const number = partNumbers(synced, settings).byKey.get(id);
    expect(number).toBeDefined();
    expect(shippingList(synced, settings).rows.find((row) => row.key === id))
      .toMatchObject({ kind: 'leg', number, description: 'Leg', size: '3 1/2 x 34 1/2 x 3 1/2' });
  });
});
