import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { doorDrawing } from '../../model/doorDetails.js';
import elevationReducer, { setRoomDoorDrawing } from '../elevationSlice.js';
import { isElevationDocument, normalizeElevationDocument, toElevationDocument } from '../persistence.js';
import { auto, run, stateWithRun } from './helpers/sliceFixtures.js';

const golden = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/golden.json', import.meta.url), 'utf8')),
);
const apply = (state, ...actions) => actions.reduce(elevationReducer, state);
const withFirstRoom = (patch) => ({ ...golden, rooms: [{ ...golden.rooms[0], ...patch }, ...golden.rooms.slice(1)] });

describe('SPEC-46.2 door details on or off, style tags', () => {
  it('draws door details and hides style tags unless the room says otherwise', () => {
    expect([doorDrawing({}), doorDrawing(null), doorDrawing({ doorDetails: false, doorStyleTags: true })]).toEqual([
      { details: true, tags: false },
      { details: true, tags: false },
      { details: false, tags: true },
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
});
