import { describe, expect, it } from 'vitest';
import { auto, room, run, wall } from '../../../test/builders.js';
import { E, S, Sf, legShape, noEnds } from '../../model/__tests__/fixtures/legs.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { cloneRoom } from '../../model/roomClone.js';
import elevationReducer, { createInitialElevationState, setWallEndLegs,
  setWallEndPanel } from '../elevationSlice.js';

const target = { wallId: 'w', endpoint: 'start' };
const pair = { faces: { front: E } };
const fitted = { ...pair, fit: 'between', panel: { returns: 'both' } };
const initial = createInitialElevationState({
  settings: { ...DEFAULT_SETTINGS, runFlex: 0, shapes: [legShape()] },
  rooms: [room({ walls: [wall({ id: 'w', x2: 96, thickness: 4.5,
    endPanels: { start: { width: null }, end: null },
    runs: [run({ id: 'R', width: 36, anchors: { left: true, right: false }, ends: noEnds,
      autoCount: false, items: [auto('cabinet')] })],
  })] })],
  activeRoomId: 'room-1', activeWallId: 'w',
});
const currentWall = (state) => state.rooms[0].walls[0];

describe('SH7.6 step c wall end-leg store action', () => {
  it('anchor 1: stores the pair and syncs its run without changing selection', () => {
    const before = structuredClone(pair);
    const state = elevationReducer(initial, setWallEndLegs({ ...target, endLegs: pair }));
    expect(currentWall(state).endLegs).toEqual({ start: pair });
    expect(currentWall(state).runs[0]._wallLegs).toHaveLength(2);
    expect(currentWall(state).runs[0]._wallLegs[0]).toMatchObject({ y: Sf.y });
    expect(state.selection).toEqual(initial.selection);
    expect(currentWall(initial)).not.toHaveProperty('endLegs');
    expect(pair).toEqual(before);
  });

  it('anchor 2: stores a two-leg fit and panel as given', () => {
    const state = elevationReducer(initial, setWallEndLegs({ ...target, endLegs: pair }));
    const next = elevationReducer(state, setWallEndLegs({ ...target, endLegs: fitted }));
    expect(currentWall(next).endLegs).toEqual({ start: fitted });
  });

  it('anchor 3: drops fit and panel when a third leg is added', () => {
    const state = elevationReducer(initial, setWallEndLegs({ ...target, endLegs: fitted }));
    const endLegs = { ...fitted, faces: { ...pair.faces, back: { legs: 'front', front: S } } };
    const before = structuredClone(endLegs);
    const next = elevationReducer(state, setWallEndLegs({ ...target, endLegs }));
    expect(currentWall(next).endLegs).toEqual({ start: { faces: endLegs.faces } });
    expect(endLegs).toEqual(before);
  });

  it('anchor 4: removes the endpoint and derived legs for undefined or null', () => {
    const state = elevationReducer(initial, setWallEndLegs({ ...target, endLegs: pair }));
    for (const endLegs of [undefined, null]) {
      const next = elevationReducer(state, setWallEndLegs({ ...target, endLegs }));
      expect(currentWall(next)).not.toHaveProperty('endLegs');
      expect(currentWall(next).runs[0]).not.toHaveProperty('_wallLegs');
      expect(currentWall(next).runs[0]).not.toHaveProperty('_wallEnds');
    }
    const two = elevationReducer(state, setWallEndLegs({ ...target, endpoint: 'end', endLegs: pair }));
    const one = elevationReducer(two, setWallEndLegs(target));
    expect(currentWall(one).endLegs).toEqual({ end: pair });
  });

  it('anchor 5: refuses invalid specs, endpoints, connections and landings atomically', () => {
    const state = elevationReducer(initial, setWallEndLegs({ ...target, endLegs: fitted }));
    for (const endLegs of [
      { faces: { front: { ...E, front: { ...Sf, height: 0 } } } },
      { ...pair, fit: 'unknown' },
      { ...fitted, panel: { past: true } },
      { ...fitted, panel: { returns: 'side' } },
      { faces: { front: { legs: 'front', front: Sf, back: S } } },
      { faces: { side: E } }, { ...pair, extra: true }, { faces: [] }, false,
    ]) {
      expect(elevationReducer(state, setWallEndLegs({ ...target, endLegs }))).toBe(state);
    }
    for (const patch of [{ endpoint: 'middle' }, { wallId: 'missing' }, { roomId: 'missing' }]) {
      expect(elevationReducer(state, setWallEndLegs({ ...target, endLegs: pair, ...patch }))).toBe(state);
    }
    for (const field of ['connections', 'landings']) {
      const blocked = structuredClone(state);
      currentWall(blocked)[field] = { start: { wallId: 'other', endpoint: 'end' } };
      for (const endLegs of [pair, undefined, null]) {
        expect(elevationReducer(blocked, setWallEndLegs({ ...target, endLegs }))).toBe(blocked);
      }
    }
  });

  it('anchor 6: removing the end panel leaves the fit stored and dormant', () => {
    const state = elevationReducer(initial, setWallEndLegs({ ...target, endLegs: fitted }));
    const next = elevationReducer(state, setWallEndPanel({ ...target, panel: null }));
    expect(currentWall(next).endPanels.start).toBeNull();
    expect(currentWall(next).endLegs).toEqual({ start: fitted });
    expect(currentWall(next).runs[0]._wallLegs).toHaveLength(2);
  });

  it('anchor 7: room copies own separate endpoint, face and spec objects', () => {
    const state = elevationReducer(initial, setWallEndLegs({ ...target, endLegs: pair }));
    const source = currentWall(state).endLegs;
    const copy = cloneRoom(state.rooms[0]).walls[0].endLegs;
    expect(copy).toEqual(source);
    expect(copy).not.toBe(source);
    expect(copy.start).not.toBe(source.start);
    expect(copy.start.faces).not.toBe(source.start.faces);
    expect(copy.start.faces.front).not.toBe(source.start.faces.front);
    copy.start.faces.front.front.y = 10;
    expect(source.start.faces.front.front.y).toBe(0.5);
  });

  it('normalizes empty faces and incompatible fits before validating', () => {
    const state = elevationReducer(initial, setWallEndLegs({ ...target, endLegs: fitted }));
    const normalized = elevationReducer(state, setWallEndLegs({ ...target,
      endLegs: { ...fitted, faces: { front: { legs: 'front', front: Sf }, back: {} } } }));
    expect(currentWall(normalized).endLegs).toEqual({
      start: { faces: { front: { legs: 'front', front: Sf } } },
    });
    const noFit = elevationReducer(state, setWallEndLegs({ ...target,
      endLegs: { ...pair, panel: { returns: 'both' } } }));
    expect(currentWall(noFit).endLegs).toEqual({ start: pair });
    const split = { faces: { front: { legs: 'front', front: Sf }, back: { legs: 'back', back: S } },
      fit: 'between', panel: { returns: 'both' } };
    const acrossFaces = elevationReducer(state, setWallEndLegs({ ...target, endLegs: split }));
    expect(currentWall(acrossFaces).endLegs).toEqual({ start: split });
    for (const faces of [{}, { front: {}, back: null }]) {
      const cleared = elevationReducer(state, setWallEndLegs({ ...target, endLegs: { ...fitted, faces } }));
      expect(currentWall(cleared)).not.toHaveProperty('endLegs');
      expect(currentWall(cleared).runs[0]).not.toHaveProperty('_wallLegs');
    }
  });
});
