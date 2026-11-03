import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { auto, room, run, wall } from '../../../test/builders.js';
import { cellPieces } from '../cells.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { layoutRun } from '../faceLayouts.js';
import { syncRoom } from '../room.js';
import { endCoverOn, runTFiller } from '../styles.js';
import { teeFillers } from '../tees.js';
import { isRoom } from '../../store/documentValidation.js';
import elevationReducer, {
  createInitialElevationState, setRoomTFiller, setWallTFiller, setRunTFiller,
} from '../../store/elevationSlice.js';
import { ELEVATION_SCHEMA_VERSION, roomFromDocument, toRoomDocument } from '../../store/persistence.js';

const S = { ...DEFAULT_SETTINGS, cornerFillerMinWidth: 2 };
const source = room({ walls: [wall({ runs: [run({
  width: 60, autoCount: false, items: [auto('A'), auto('B')],
})] })] });

function teesOf(current) {
  const host = current.walls[0];
  const candidate = host.runs[0];
  return teeFillers(current, candidate, cellPieces(candidate, layoutRun(current, host, candidate, S)), S);
}

describe('FX8 a T-filler inheritance', () => {
  it.each([
    [1, undefined, undefined, undefined, undefined],
    [2, 'all', undefined, undefined, 'all'],
    [3, 'all', 'seams', undefined, 'seams'],
    [4, 'all', undefined, 'none', undefined],
    [5, undefined, undefined, 'seams', 'seams'],
  ])('anchor %i: resolves room %s / wall %s / run %s', (_anchor, roomValue, wallValue, runValue, expected) => {
    const input = structuredClone(source);
    if (roomValue !== undefined) input.tFiller = roomValue;
    if (wallValue !== undefined) input.walls[0].tFiller = wallValue;
    if (runValue !== undefined) input.walls[0].runs[0].tFiller = runValue;
    const current = syncRoom(input, S);
    const candidate = current.walls[0].runs[0];
    expect(candidate._tFiller).toBe(expected);
    expect(Object.hasOwn(candidate, '_tFiller')).toBe(expected !== undefined);
    const result = teesOf(current);
    if (expected === undefined) expect(result.tees).toEqual([]);
    else expect(result.tees.some(({ orientation }) => orientation === 'vertical')).toBe(true);
    if (expected === 'seams') expect(result.tees.some(({ orientation }) => orientation === 'horizontal')).toBe(false);
    if (_anchor === 2) {
      const explicit = structuredClone(source);
      explicit.walls[0].runs[0].tFiller = 'all';
      expect(result).toEqual(teesOf(syncRoom(explicit, S)));
    }
    expect(syncRoom(current, S)).toEqual(current);
  });

  it('anchor 6: saves the room choice, omits the derived value and rebuilds it on load', () => {
    const current = syncRoom({ ...source, tFiller: 'all' }, S);
    const saved = toRoomDocument(current);
    expect(saved.tFiller).toBe('all');
    expect(saved.walls[0].runs[0]).not.toHaveProperty('_tFiller');
    const loaded = roomFromDocument(saved, ELEVATION_SCHEMA_VERSION, S);
    expect(loaded.ok).toBe(true);
    expect(syncRoom(loaded.room, S).walls[0].runs[0]._tFiller).toBe('all');
  });

  it('anchor 7: inherits before the Room 10 BT blind credit and run flex are laid out', () => {
    const input = JSON.parse(readFileSync(new URL('./fixtures/room10bt.json', import.meta.url), 'utf8'));
    delete input.walls[1].runs[0].tFiller;
    input.tFiller = 'all';
    const current = syncRoom(input, S);
    const host = current.walls[1];
    expect(layoutRun(current, host, host.runs[0], S).pieces.map(({ x, width }) => [x, width]))
      .toEqual([[0, 1.625], [1.625, 30], [31.625, 29.25], [60.875, 2.3125]]);
    for (const candidate of current.walls.flatMap(({ runs }) => runs)) expect(candidate._tFiller).toBe('all');
    expect(syncRoom(current, S)).toEqual(current);
  });

  it.each(['room', 'wall', 'run'])('anchor 8: validates all choices at the %s level', (level) => {
    for (const value of [undefined, 'none', 'seams', 'all', true, 'every', null]) {
      const input = structuredClone(source);
      input.wallOrder = ['wall-1'];
      const target = level === 'room' ? input : level === 'wall' ? input.walls[0] : input.walls[0].runs[0];
      if (value !== undefined) target.tFiller = value;
      expect(isRoom(input), `${level}: ${value}`).toBe([undefined, 'none', 'seams', 'all'].includes(value));
    }
  });

  it('keeps the unsynced fallback and lets end choices override explicit none', () => {
    for (const [value, expected] of [[undefined, null], ['none', null], ['seams', 'seams'], ['all', 'all']]) {
      expect(runTFiller({ tFiller: value })).toBe(expected);
      expect(endCoverOn({ tFiller: value }, 'left')).toBe(Boolean(expected));
    }
    expect(runTFiller({ _tFiller: 'seams', tFiller: 'all' })).toBe('seams');
    expect(endCoverOn({ tFiller: 'none', endFiller: { left: { tFiller: true } } }, 'left')).toBe(true);
  });

  it('inherits horizontal seams and preserves leaf overrides when the run says none', () => {
    const input = structuredClone(source);
    input.tFiller = 'all';
    input.walls[0].runs[0].grid.cells[0].node = {
      id: 'stack', cols: [{ id: 'col', size: null, sizeMode: 'auto' }],
      rows: [{ id: 'top', size: null, sizeMode: 'auto' }, { id: 'bottom', size: null, sizeMode: 'auto' }],
      cells: [
        { col: 0, row: 0, colSpan: 1, rowSpan: 1, node: auto('top') },
        { col: 0, row: 1, colSpan: 1, rowSpan: 1, node: auto('bottom') },
      ],
    };
    expect(teesOf(syncRoom(input, S)).tees.some(({ orientation }) => orientation === 'horizontal')).toBe(true);
    input.walls[0].tFiller = 'seams';
    expect(teesOf(syncRoom(input, S)).tees.some(({ orientation }) => orientation === 'horizontal')).toBe(false);
    input.walls[0].runs[0].tFiller = 'none';
    input.walls[0].runs[0].grid.cells[0].node.cells[0].node.tFiller = { bottom: true };
    expect(teesOf(syncRoom(input, S)).tees.some(({ orientation }) => orientation === 'horizontal')).toBe(true);
  });

  it('re-syncs each setter, clears stale derived values, and restores inheritance on null', () => {
    let state = { ...createInitialElevationState(null), rooms: [syncRoom(source, S)], activeRoomId: source.id };
    const payload = { roomId: source.id, wallId: 'wall-1', runId: 'run-1' };
    const steps = [
      [setRoomTFiller, 'all', 'all'],
      [setWallTFiller, 'seams', 'seams'],
      [setRunTFiller, 'none', undefined],
      [setRunTFiller, null, 'seams'],
      [setWallTFiller, 'none', undefined],
      [setWallTFiller, null, 'all'],
      [setRoomTFiller, 'none', undefined],
      [setRoomTFiller, null, undefined],
    ];
    for (const [action, value, expected] of steps) {
      state = elevationReducer(state, action({ ...payload, value }));
      expect(state.rooms[0].walls[0].runs[0]._tFiller).toBe(expected);
      expect(Object.hasOwn(state.rooms[0].walls[0].runs[0], '_tFiller')).toBe(expected !== undefined);
    }
    expect(state.rooms[0]).not.toHaveProperty('tFiller');
    expect(state.rooms[0].walls[0]).not.toHaveProperty('tFiller');
    expect(state.rooms[0].walls[0].runs[0]).not.toHaveProperty('tFiller');
    for (const action of [setRoomTFiller, setWallTFiller, setRunTFiller]) {
      for (const value of [true, 'every']) expect(elevationReducer(state, action({ ...payload, value }))).toEqual(state);
      expect(elevationReducer(state, action({ ...payload, roomId: 'missing', value: 'all' }))).toEqual(state);
    }
  });
});
