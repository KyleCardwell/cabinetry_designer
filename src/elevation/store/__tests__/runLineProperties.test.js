import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { attach, line, room, run, wall } from '../../../test/builders.js';
import { runItems } from '../../model/grid.js';
import elevationReducer, {
  attachRunToNewLine, centerRunOnLine, createInitialElevationState, updateLayoutLine,
} from '../elevationSlice.js';

const stored = JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/room8.json', import.meta.url), 'utf8'));
const WALL = '14154ec7-5eeb-4511-8d78-5d3da7b09418';
const BASE = '8837d4ef-0f27-4ae9-aec6-2d563cadc4b3';
const VOID = 'e77c1c0c-b386-4716-bc71-0f23ec1e585c';
const HOOD = 'c1cb2dd4-6ec7-4d67-a1ef-1b5072bcc757';

describe('LL4 f run line actions', () => {
  it('anchor 6: makes a line at 25 through a free run without moving it', () => {
    const start = createInitialElevationState(null);
    const subject = room({ walls: [wall({ runs: [run({ x: 10, width: 30 })] })] });
    const state = { ...start, rooms: [subject], activeRoomId: subject.id };
    const action = attachRunToNewLine({ wallId: 'wall-1', runId: 'run-1' });
    expect(action.payload.id).toEqual(expect.any(String));
    const next = elevationReducer(state, action);
    expect(next.rooms[0].walls[0].lines).toEqual([{ id: action.payload.id, label: 'L1', from: 'left', value: 25 }]);
    expect(next.rooms[0].walls[0].runs[0]).toMatchObject({ x: 10, width: 30, attach: attach(action.payload.id) });
    expect(subject.walls[0].lines).toBeUndefined();
  });

  it('uses the requested point and the nearer end on the run’s face', () => {
    const subject = room({ walls: [wall({ x2: 240, lines: [
      line('front', 5, { label: 'L2' }), line('back', 10, { label: 'L1', wallSide: 'back' }),
    ], runs: [run({ x: 150, width: 30, wallSide: 'back' })] })] });
    const state = { ...createInitialElevationState(null), rooms: [subject], activeRoomId: subject.id };
    const next = elevationReducer(state, attachRunToNewLine({ wallId: 'wall-1', runId: 'run-1', at: 'right', id: 'N' }));
    expect(next.rooms[0].walls[0].lines[2]).toEqual({ id: 'N', label: 'L2', wallSide: 'back', from: 'right', value: 60 });
    expect(next.rooms[0].walls[0].runs[0]).toMatchObject({ x: 150, width: 30, attach: attach('N', 'right') });
    expect(elevationReducer(state, attachRunToNewLine({ wallId: 'wall-1', runId: 'run-1', at: 'bad' }))).toBe(state);
  });

  it('anchor 1: a single action attaches the Room 8 hood and open, moves joints, and sets the message', () => {
    const state = { ...createInitialElevationState(null), rooms: [stored], activeRoomId: stored.id };
    const action = centerRunOnLine({ wallId: WALL, runId: HOOD, targetKey: `${BASE}:${VOID}` });
    expect(action.payload.lineId).toEqual(expect.any(String));
    const next = elevationReducer(state, action);
    const wall = next.rooms[0].walls.find(({ id }) => id === WALL);
    expect(wall.lines).toEqual([{ id: action.payload.lineId, label: 'L1', from: 'right', value: 98.5 }]);
    expect(wall.runs.find(({ id }) => id === HOOD)).toMatchObject({ x: 96.5, width: 80, attach: attach(action.payload.lineId) });
    expect(runItems(wall.runs.find(({ id }) => id === BASE)).find(({ id }) => id === VOID).attach).toEqual(attach(action.payload.lineId));
    expect(next.message).toBe('Centred on L1. Move L1 to move both.');
    const moved = elevationReducer(next, updateLayoutLine({ wallId: WALL, lineId: action.payload.lineId, value: 99 }));
    expect(moved.rooms[0].walls.find(({ id }) => id === WALL).runs.find(({ id }) => id === HOOD).x).toBe(96);
    expect(elevationReducer(state, centerRunOnLine({ wallId: WALL, runId: HOOD, targetKey: 'missing' }))).toBe(state);
  });
});
