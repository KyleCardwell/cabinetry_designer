import { expect, it } from 'vitest';
import { room, run, wall } from '../../../test/builders.js';
import elevationReducer, { clearSelection, createInitialElevationState, setSelection } from '../elevationSlice.js';

it('selects only a valid corner owner, preserves the active face and clears other selection (CC4)', () => {
  const owner = run({ wallSide: 'back' });
  const initial = {
    ...createInitialElevationState(null),
    rooms: [room({ walls: [wall({ runs: [owner] }), wall({ id: 'wall-2' })] })],
    activeRoomId: 'room-1', activeWallId: 'wall-2', activeWallSide: 'front', view: 'elevation',
    selection: { wallId: 'wall-2', runId: 'old-run', pieceId: 'old-piece' },
    facePath: 'r', interiorPath: 'r', interiorDivider: 0,
  };
  const cornerOf = { wallId: 'wall-1', runId: owner.id, side: 'left' };
  const selected = elevationReducer(initial, setSelection({ cornerOf }));
  expect(selected.selection).toEqual({
    wallId: 'wall-2', runId: null, pieceId: null, openingId: null, recessId: null, soffitId: null, cornerOf,
  });
  expect(selected).toMatchObject({
    activeWallId: 'wall-2', activeWallSide: 'front', facePath: null, interiorPath: null, interiorDivider: null,
  });
  expect(elevationReducer(selected, setSelection({ runId: owner.id })).selection)
    .not.toHaveProperty('cornerOf');
  for (const payload of [
    {}, { cornerOf: { ...cornerOf, side: 'top' } },
    { cornerOf: { ...cornerOf, wallId: 1 } }, { cornerOf: { ...cornerOf, runId: 1 } },
    ...['runId', 'pieceId', 'openingId', 'recessId', 'soffitId', 'lineId', 'roomLineId']
      .map((key) => ({ cornerOf, [key]: 'other' })),
    { cornerOf, endPanel: 'start' },
  ]) {
    expect(elevationReducer(selected, setSelection(payload)).selection).not.toHaveProperty('cornerOf');
  }
  expect(elevationReducer(selected, setSelection({ cornerOf: { ...cornerOf, side: 'right' } }))
    .selection.cornerOf.side).toBe('right');
  expect(elevationReducer(selected, clearSelection()).selection).toEqual({
    wallId: 'wall-2', runId: null, pieceId: null, openingId: null, recessId: null, soffitId: null,
  });
});
