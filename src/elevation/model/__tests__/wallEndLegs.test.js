import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { isWallEndLegs, wallLegRun, wallEndLegList } from '../index.js';
import { cloneRoom } from '../roomClone.js';
import { flipRunsForWall } from '../room.js';
import { wallSideView } from '../wallSides.js';
import { isRoom } from '../../store/documentValidation.js';
import { ELEVATION_SCHEMA_VERSION, roomFromDocument, toRoomDocument } from '../../store/persistence.js';
import { room, run, wall } from '../../../test/builders.js';

const S = { shapeId: 'leg', height: 'full', x: 0, y: 0 };
const Sf = { ...S, y: 0.5 };
const E = { legs: 'both', front: Sf, back: S };
const R = run({ id: 'R', width: 36, anchors: { left: true, right: false },
  ends: { left: { type: 'none' }, right: { type: 'none' } } });
const Rb = run({ ...R, id: 'Rb', wallSide: 'back', anchors: { left: false, right: true } });
const W = wall({ id: 'w', x2: 96, thickness: 4.5, runs: [R],
  endPanels: { start: { width: null }, end: null },
  endLegs: { start: { faces: { front: E } } } });

describe('SH7.6 step a wall end legs data', () => {
  it('anchor 1: derives the front-face pair with ids, coordinates and handedness', () => {
    const before = structuredClone(W);
    const legs = wallEndLegList(room({ walls: [W] }), W);
    expect([...legs]).toEqual([
      { runId: 'R', leg: { id: 'w:wallleg:start-front-front', ...Sf,
        from: 'left', yFrom: 'front', mirror: true,
        wall: { endpoint: 'start', face: 'front', edge: 'front', endX: 0 } } },
      { runId: 'R', leg: { id: 'w:wallleg:start-front-back', ...S,
        from: 'left', yFrom: 'back', mirror: true, mirrorDepth: true,
        wall: { endpoint: 'start', face: 'front', edge: 'back', endX: 0 } } },
    ]);
    expect(legs.warnings).toEqual([]);
    expect(W).toEqual(before);
  });

  it('anchor 2: the back face sees start at its right, without a mirror key', () => {
    const w = wall({ ...W, runs: [R, Rb],
      endLegs: { start: { faces: { back: { legs: 'front', front: S } } } } });
    expect([...wallEndLegList(room({ walls: [w] }), w)]).toEqual([
      { runId: 'Rb', leg: { id: 'w:wallleg:start-back-front', ...S,
        from: 'right', yFrom: 'front',
        wall: { endpoint: 'start', face: 'back', edge: 'front', endX: 96 } } },
    ]);
  });

  it('anchor 3: flex moves the end line on both faces, including side views', () => {
    const w = wall({ ...W, _endFlex: { start: 1 }, runs: [R, Rb],
      endLegs: { start: { faces: { front: E, back: E } } } });
    const source = room({ walls: [w] });
    expect(wallEndLegList(source, w).map(({ leg }) => leg.wall.endX)).toEqual([-1, -1, 97, 97]);
    expect(wallEndLegList(source, wallSideView(w, 'back'))).toEqual(wallEndLegList(source, w));
  });

  it('anchor 4: dormant endpoints are silent; each missing-run leg has a named warning', () => {
    for (const field of ['connections', 'landings']) {
      const w = wall({ ...W, [field]: { start: { wallId: 'other', endpoint: 'end' } } });
      const result = wallEndLegList(room({ walls: [w] }), w);
      expect([...result]).toEqual([]);
      expect(result.warnings).toEqual([]);
    }
    const w = wall({ ...W, runs: [run({ ...R, anchors: { left: false, right: false } }), Rb] });
    const result = wallEndLegList(room({ walls: [w] }), w);
    expect([...result]).toEqual([]);
    expect(result.warnings).toEqual(['front', 'back'].map((edge) => ({
      code: 'wall-leg-no-run', legId: `w:wallleg:start-front-${edge}`,
      name: `Left end front-face ${edge} leg`,
    })));
  });

  it('anchor 5: validates endpoint and face keys and exact spec presence', () => {
    expect(isWallEndLegs(W.endLegs)).toBe(true);
    for (const value of [{}, { start: { faces: {} } }, { middle: W.endLegs.start },
      { start: { faces: { front: { legs: 'front', front: Sf, back: S } } } }]) {
      expect(isWallEndLegs(value)).toBe(false);
    }
  });

  it('anchor 6: between requires exactly two legs across all faces', () => {
    for (const [faces, valid] of [
      [{ front: E }, true], [{ front: { legs: 'front', front: Sf } }, false],
      [{ front: E, back: { legs: 'front', front: S } }, false],
      [{ front: { legs: 'front', front: Sf }, back: { legs: 'front', front: S } }, true],
    ]) expect(isWallEndLegs({ start: { faces, fit: 'between' } })).toBe(valid);
  });

  it('anchor 7: panel settings need fit and reject past and unpaired returnDepth', () => {
    const end = { faces: { front: E }, fit: 'between' };
    expect(isWallEndLegs({ start: { ...end, panel: { returns: 'both', returnDepth: 4 } } })).toBe(true);
    for (const value of [
      { faces: end.faces, panel: { returns: 'both', returnDepth: 4 } },
      { ...end, panel: { returnDepth: 4 } }, { ...end, panel: { past: true } },
    ]) expect(isWallEndLegs({ start: value })).toBe(false);
  });

  it('anchor 8: rejects placement keys, fills, zero heights and conflicting shapes', () => {
    for (const changes of [{ from: 'left' }, { fill: { type: 'panel' } },
      { height: 0 }, { square: {} }]) {
      expect(isWallEndLegs({ start: { faces: { front: { legs: 'front', front: { ...Sf, ...changes } } } } }))
        .toBe(false);
    }
  });

  it('anchor 9: room validation accepts wall end legs, rejects empty data and permits omission', () => {
    expect(isRoom(room({ walls: [W], wallOrder: ['w'] }))).toBe(true);
    expect(isRoom(room({ walls: [wall({ ...W, endLegs: {} })], wallOrder: ['w'] }))).toBe(false);
    expect(isRoom(room({ walls: [wall()], wallOrder: ['wall-1'] }))).toBe(true);
  });

  it('rejects nonplain, unknown and malformed endpoint, face, panel and spec values', () => {
    for (const value of [null, [], new Date(), { start: null },
      { start: { faces: { side: E } } }, { start: { faces: { front: E }, extra: true } },
      { start: { faces: { front: { ...E, fit: 'between' } } } },
      { start: { faces: { front: { legs: 'back' } } } },
      { start: { faces: { front: E }, fit: 'behind' } },
      { start: { faces: { front: E }, fit: 'between', panel: { type: 'panel' } } },
      { start: { faces: { front: E }, fit: 'between', panel: { inset: -1 } } },
      { start: { faces: { front: E }, fit: 'between', panel: { past: false } } },
    ]) expect(isWallEndLegs(value)).toBe(false);
    expect(isWallEndLegs({ end: { faces: { back: { legs: 'back', back: {
      square: {}, height: 12, x: -1, y: 2, sitsOn: 'base', takesRoom: false,
    } } } } })).toBe(true);
  });

  it('chooses Base before Tall before others, then front depth and stable list order', () => {
    const tall = run({ ...R, id: 'tall', cabinetTypeId: CABINET_TYPE_IDS.TALL, depth: 40 });
    const upper = run({ ...R, id: 'upper', cabinetTypeId: CABINET_TYPE_IDS.UPPER, depth: 50 });
    const deeper = run({ ...R, id: 'deeper', _plane: { offset: 2 } });
    const tied = run({ ...deeper, id: 'tied' });
    for (const [runs, expected] of [
      [[upper, tall, R], R], [[upper, tall], tall], [[upper], upper],
      [[R, deeper, tied], deeper], [[Rb], null],
    ]) {
      const w = wall({ ...W, runs });
      expect(wallLegRun(room({ walls: [w] }), w, 'start', 'front')).toBe(expected);
    }
  });

  it('orders endpoints, faces and edges and toggles mirrors without false keys', () => {
    const toggled = { ...S, mirror: true, mirrorDepth: true };
    const end = { faces: { back: E, front: { ...E, front: toggled } } };
    const w = wall({ ...W, runs: [run({ ...R, anchors: { left: true, right: true } }),
      run({ ...Rb, anchors: { left: true, right: true } })], endLegs: { end, start: end } });
    const legs = wallEndLegList(room({ walls: [w] }), w);
    expect(legs.map(({ leg }) => leg.id)).toEqual(['start', 'end'].flatMap((endpoint) =>
      ['front', 'back'].flatMap((face) => ['front', 'back'].map((edge) =>
        `w:wallleg:${endpoint}-${face}-${edge}`))));
    expect(legs[0].leg).not.toHaveProperty('mirror');
    expect(legs[0].leg.mirrorDepth).toBe(true);
    expect(legs[4].leg.mirror).toBe(true);
    expect(legs[4].leg.wall.endX).toBe(96);
    expect(legs[6].leg.wall.endX).toBe(0);
  });

  it('deep clones stored wall legs and omits derived run fields', () => {
    const endLegs = { start: { faces: { front: { ...E, front: { square: { w: 3, d: 4 },
      height: 'full', x: 0, y: 0 } } }, fit: 'between', panel: { returns: 'both', returnDepth: 4 } } };
    const w = wall({ ...W, endLegs, runs: [run({ ...R, _wallLegs: [{ id: 'derived' }], _wallEnds: { left: true } })] });
    const copy = cloneRoom(room({ walls: [w] })).walls[0];
    expect(copy.endLegs).toEqual(endLegs);
    copy.endLegs.start.faces.front.front.square.w = 10;
    copy.endLegs.start.faces.front.back.y = 10;
    copy.endLegs.start.panel.returnDepth = 10;
    expect(endLegs.start.faces.front.front.square.w).toBe(3);
    expect(endLegs.start.faces.front.back.y).toBe(0);
    expect(endLegs.start.panel.returnDepth).toBe(4);
    expect(copy.runs[0]).not.toHaveProperty('_wallLegs');
    expect(copy.runs[0]).not.toHaveProperty('_wallEnds');
    expect(cloneRoom(room({ walls: [wall()] })).walls[0]).not.toHaveProperty('endLegs');
  });

  it('round-trips stored wall legs while stripping derived run fields on save', () => {
    const w = wall({ ...W, runs: [run({ ...R, _wallLegs: [{ id: 'derived' }], _wallEnds: { left: true } })] });
    const saved = toRoomDocument(room({ walls: [w], wallOrder: ['w'] }));
    expect(saved.walls[0].endLegs).toEqual(W.endLegs);
    expect(saved.walls[0].runs[0]).not.toHaveProperty('_wallLegs');
    expect(saved.walls[0].runs[0]).not.toHaveProperty('_wallEnds');
    const loaded = roomFromDocument(JSON.parse(JSON.stringify(saved)), ELEVATION_SCHEMA_VERSION, DEFAULT_SETTINGS);
    expect(loaded.ok).toBe(true);
    expect(loaded.room.walls[0].endLegs).toEqual(W.endLegs);
    expect(w.runs[0]._wallEnds).toEqual({ left: true });
  });

  it('leaves endpoint-owned legs and panels unchanged when flipping wall runs', () => {
    const flipped = flipRunsForWall(W);
    expect(flipped.endLegs).toEqual(W.endLegs);
    expect(flipped.endPanels).toEqual(W.endPanels);
    const legs = wallEndLegList(room({ walls: [flipped] }), flipped);
    expect(legs).toHaveLength(2);
    expect(legs[0].leg.from).toBe('right');
    expect(legs[0].leg).not.toHaveProperty('mirror');
  });
});
