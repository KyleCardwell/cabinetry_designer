import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { doorDrawing } from '../../model/doorDetails.js';
import elevationReducer, { setRoomDoorDrawing } from '../elevationSlice.js';
import { isElevationDocument, isRoom, normalizeElevationDocument, toElevationDocument } from '../persistence.js';
import { auto, run, stateWithRun } from './helpers/sliceFixtures.js';

const golden = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/golden.json', import.meta.url), 'utf8')),
);
const apply = (state, ...actions) => actions.reduce(elevationReducer, state);
const withFirstRoom = (patch) => ({ ...golden, rooms: [{ ...golden.rooms[0], ...patch }, ...golden.rooms.slice(1)] });

describe('SPEC-46.2 door details on or off, style tags', () => {
  it('draws door details and hides style tags unless the room says otherwise', () => {
    expect([doorDrawing({}), doorDrawing(null), doorDrawing({ doorDetails: false, doorStyleTags: true })]).toEqual([
      { details: true, tags: false, swings: false },
      { details: true, tags: false, swings: false },
      { details: false, tags: true, swings: false },
    ]);
  });

  it('stores only the choices that differ from the default', () => {
    const state = stateWithRun(run({ items: [auto('c1')] }));
    const off = apply(state, setRoomDoorDrawing({ doorDetails: false, doorStyleTags: true }));
    expect([off.rooms[0].doorDetails, off.rooms[0].doorStyleTags]).toEqual([false, true]);
    const back = apply(off, setRoomDoorDrawing({ doorDetails: true }), setRoomDoorDrawing({ doorStyleTags: false }));
    expect(['doorDetails' in back.rooms[0], 'doorStyleTags' in back.rooms[0]]).toEqual([false, false]);
    expect([
      setRoomDoorDrawing({ doorDetails: 'no' }),
      setRoomDoorDrawing({ doorDetails: false, doorStyleTags: 1 }),
      setRoomDoorDrawing({ roomId: 'gone', doorDetails: false }),
    ].map((action) => apply(state, action) === state)).toEqual([true, true, true]);
  });

  it('saves and validates the choices', () => {
    const saved = withFirstRoom({ doorDetails: false, doorStyleTags: true });
    expect(isElevationDocument(saved)).toBe(true);
    expect(toElevationDocument(saved).rooms[0]).toMatchObject({ doorDetails: false, doorStyleTags: true });
    expect([withFirstRoom({ doorDetails: 'off' }), withFirstRoom({ doorStyleTags: 1 })].map(isElevationDocument))
      .toEqual([false, false]);
  });

  it('HP2 anchor 7: stores swing marks only when on, rejects invalid choices, and saves the boolean', () => {
    const state = golden;
    const roomId = state.rooms[0].id;
    const on = apply(state, setRoomDoorDrawing({ roomId, swingMarks: true }));
    expect(on.rooms[0].swingMarks).toBe(true);
    expect(doorDrawing(on.rooms[0]).swings).toBe(true);
    expect(isElevationDocument(on)).toBe(true);
    expect(toElevationDocument(on).rooms[0].swingMarks).toBe(true);
    const off = apply(on, setRoomDoorDrawing({ roomId, swingMarks: false }));
    expect(Object.hasOwn(off.rooms[0], 'swingMarks')).toBe(false);
    expect(doorDrawing(off.rooms[0]).swings).toBe(false);
    expect(apply(on, setRoomDoorDrawing({ roomId, swingMarks: 'yes' }))).toBe(on);
    expect(apply(on, setRoomDoorDrawing({ roomId, swingMarks: 'yes', doorDetails: false }))).toBe(on);
    expect(apply(on, setRoomDoorDrawing({ roomId: 'gone', swingMarks: false }))).toBe(on);
    for (const swingMarks of [true, false, undefined]) {
      expect(isRoom({ ...state.rooms[0], swingMarks })).toBe(true);
      expect(doorDrawing({ doorDetails: false, swingMarks }).swings).toBe(swingMarks === true);
    }
    for (const swingMarks of ['yes', null, 1]) {
      expect(isRoom({ ...state.rooms[0], swingMarks })).toBe(false);
      expect(doorDrawing({ swingMarks }).swings).toBe(false);
    }
    expect(isRoom(state.rooms[0])).toBe(true);
  });
});
