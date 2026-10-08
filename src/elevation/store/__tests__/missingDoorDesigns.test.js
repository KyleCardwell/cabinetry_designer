import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { missingDoorDesigns } from '../../model/doorDesigns.js';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from '../../model/doorStyles.js';
import elevationReducer, { moveMissingDoorDesign } from '../elevationSlice.js';
import { isElevationDocument, normalizeElevationDocument } from '../persistence.js';
import { auto, run, stateWithRun } from './helpers/sliceFixtures.js';

const golden = JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/golden.json', import.meta.url), 'utf8'));
const style = (id, label, designId) => ({ ...DEFAULT_DOOR_STYLE, id, label, designId });
const A = style('ds-a', 'A', 'gone');
const B = style('ds-b', 'B', 'slab');
const C = style('ds-c', 'C', 'gone');
const D = style('ds-d', 'D', 'old');

/** A room with styles A–D: A and C name 'gone', D names 'old', B is fine. The room picks A. */
function base() {
  const state = stateWithRun(run({ autoCount: false, items: [auto('c1')] }));
  state.rooms[0].doorStyles = [A, B, C, D];
  state.rooms[0].doorStyleId = 'ds-a';
  return state;
}

describe('SPEC-46.3.1 door designs a room names that the library no longer has', () => {
  it('lists each missing design once with the styles that use it, in style order', () => {
    expect(missingDoorDesigns({ doorStyles: [A, B, C, D] }, DOOR_DESIGNS)).toEqual([
      { designId: 'gone', styles: [{ styleId: 'ds-a', label: 'A' }, { styleId: 'ds-c', label: 'C' }] },
      { designId: 'old', styles: [{ styleId: 'ds-d', label: 'D' }] },
    ]);
    expect([missingDoorDesigns({ doorStyles: [B] }, DOOR_DESIGNS), missingDoorDesigns({}, DOOR_DESIGNS)]).toEqual([[], []]);
  });

  it('still loads a room whose style names a missing design (it asks when it opens)', () => {
    const document = structuredClone(golden);
    document.rooms[0].doorStyles = [A];
    document.rooms[0].doorStyleId = 'ds-a';
    const loaded = normalizeElevationDocument(document);
    expect([isElevationDocument(loaded), loaded.rooms[0].doorStyles[0].designId, loaded.rooms[0].doorStyleId])
      .toEqual([true, 'gone', 'ds-a']);
  });

  it('moves one missing design\'s styles in that room to a listed design, and nothing else', () => {
    const state = base();
    const moved = elevationReducer(state, moveMissingDoorDesign({ roomId: 'room-1', designId: 'gone', reassignTo: 'slab' }));
    expect(moved.rooms[0].doorStyles.map(({ id, designId }) => [id, designId])).toEqual([
      ['ds-a', 'slab'], ['ds-b', 'slab'], ['ds-c', 'slab'], ['ds-d', 'old'],
    ]);
    expect(moved.rooms[0].doorStyleId).toBe('ds-a');
    expect(missingDoorDesigns(moved.rooms[0], moved.settings.doorDesigns).map(({ designId }) => designId)).toEqual(['old']);
    expect([
      moveMissingDoorDesign({ roomId: 'room-x', designId: 'gone', reassignTo: 'slab' }),
      moveMissingDoorDesign({ roomId: 'room-1', designId: 'gone', reassignTo: 'gone' }),
      moveMissingDoorDesign({ roomId: 'room-1', designId: 'gone', reassignTo: 'nope' }),
      moveMissingDoorDesign({ roomId: 'room-1', designId: 'slab', reassignTo: 'five-piece-square' }),
      moveMissingDoorDesign({ roomId: 'room-1', designId: 'unused', reassignTo: 'slab' }),
    ].every((action) => elevationReducer(state, action) === state)).toBe(true);
  });
});
