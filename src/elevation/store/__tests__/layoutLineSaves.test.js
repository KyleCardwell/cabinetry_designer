import { describe, expect, it } from 'vitest';
import { attach, auto, opening, pin, room, run, wall } from '../../../test/builders.js';
import { runItems } from '../../model/grid.js';
import elevationReducer, {
  addLayoutLine,
  createInitialElevationState,
  deleteLayoutLine,
  setAttachment,
  updateLayoutLine,
} from '../elevationSlice.js';
import {
  isElevationDocument,
  roomFromDocument,
  toElevationDocument,
  toRoomDocument,
} from '../persistence.js';

const at = { roomId: 'room-1', wallId: 'H' };

function initial() {
  const front = run({ id: 'run-1', x: 70, width: 90, autoCount: false,
    items: [auto('A'), auto('B'), { id: 'C', kind: 'void', width: null }] });
  front.grid.cols[1].pin = pin(40);
  const back = run({ id: 'run-2', wallSide: 'back', x: 10, width: 40, autoCount: false, items: [auto('D')] });
  const window = opening({ id: 'W', kind: 'window', label: 'W1', sillZ: 40, height: 40, offset: 180, casing: null });
  return {
    ...createInitialElevationState(null), activeRoomId: 'room-1', activeWallId: 'H',
    rooms: [room({ walls: [wall({ id: 'H', x2: 240, openings: [window], runs: [front, back] })] })],
  };
}

const reduce = (state, ...actions) => actions.reduce(elevationReducer, state);
const wallOf = (state) => state.rooms[0].walls[0];
const spans = (state) => wallOf(state).runs.map((r) => [r.x, r.width, runItems(r).map((item) => item.width)]);

function withLines() {
  return reduce(initial(),
    addLayoutLine({ ...at, id: 'L1', from: 'right', value: 99 }),
    addLayoutLine({ ...at, id: 'B1', from: 'left', value: 30, wallSide: 'back' }),
    addLayoutLine({ ...at, id: 'L2', from: 'left', value: 50 }));
}

function withAttachments() {
  return reduce(withLines(),
    setAttachment({ ...at, target: { kind: 'run', runId: 'run-1' }, attach: attach('L1') }),
    setAttachment({ ...at, target: { kind: 'column', runId: 'run-1', itemId: 'A' }, attach: attach('L1', 'center', -3) }),
    setAttachment({ ...at, target: { kind: 'column', runId: 'run-1', itemId: 'C' }, attach: attach('L1', 'left') }),
    setAttachment({ ...at, target: { kind: 'opening', openingId: 'W' }, attach: attach('B1') }));
}

describe('LL2 layout line actions', () => {
  it('adds lines with per-face labels', () => {
    const lines = wallOf(withLines()).lines;
    expect(lines).toEqual([
      { id: 'L1', label: 'L1', from: 'right', value: 99 },
      { id: 'B1', label: 'L1', wallSide: 'back', from: 'left', value: 30 },
      { id: 'L2', label: 'L2', from: 'left', value: 50 },
    ]);
    expect(lines[0]).not.toHaveProperty('wallSide');
    const generated = reduce(initial(), addLayoutLine({ ...at, from: 'left', value: 1 }));
    expect(typeof wallOf(generated).lines[0].id).toBe('string');
  });

  it('ignores bad lines', () => {
    const start = initial();
    expect(reduce(start, addLayoutLine({ ...at, from: 'left', value: -1 }))).toBe(start);
    expect(reduce(start, addLayoutLine({ ...at, from: 'center', value: 5 }))).toBe(start);
  });

  it('updates a line, keeping its position when switching ends', () => {
    let state = reduce(withLines(), updateLayoutLine({ ...at, lineId: 'L1', from: 'left' }));
    expect(wallOf(state).lines[0]).toMatchObject({ from: 'left', value: 141 });
    state = reduce(state, updateLayoutLine({ ...at, lineId: 'L1', value: 100, label: ' Sink CL ' }));
    expect(wallOf(state).lines[0]).toMatchObject({ value: 100, label: 'Sink CL' });
    state = reduce(state, updateLayoutLine({ ...at, lineId: 'L1', label: '   ' }));
    expect(wallOf(state).lines[0].label).toBe('Sink CL');
  });

  it('stores attachments without moving anything', () => {
    const before = withLines();
    const state = withAttachments();
    const w = wallOf(state);
    expect(w.runs[0].attach).toEqual(attach('L1'));
    expect(w.runs[0].grid.cols[0].attach).toEqual(attach('L1', 'center', -3));
    expect(w.runs[0].grid.cols[2].attach).toEqual(attach('L1', 'left'));
    expect(w.openings[0].attach).toEqual(attach('B1'));
    expect(spans(state)).toEqual(spans(before));
    expect(w.openings[0].offset).toBe(wallOf(before).openings[0].offset);
  });

  it('refuses attachments that break the rules', () => {
    const start = withLines();
    for (const action of [
      setAttachment({ ...at, target: { kind: 'column', runId: 'run-1', itemId: 'B' }, attach: attach('L1') }),
      setAttachment({ ...at, target: { kind: 'run', runId: 'run-2' }, attach: attach('L1') }),
      setAttachment({ ...at, target: { kind: 'run', runId: 'run-1' }, attach: attach('gone') }),
      setAttachment({ ...at, target: { kind: 'opening', openingId: 'W' }, attach: attach('gone') }),
      setAttachment({ ...at, target: { kind: 'run', runId: 'run-1' }, attach: { lineId: 'L1', at: 'middle', offset: 0 } }),
    ]) {
      expect(reduce(start, action)).toBe(start);
    }
  });

  it('detaches with null', () => {
    const state = reduce(withAttachments(),
      setAttachment({ ...at, target: { kind: 'column', runId: 'run-1', itemId: 'A' }, attach: null }),
      setAttachment({ ...at, target: { kind: 'run', runId: 'run-1' }, attach: null }));
    expect('attach' in wallOf(state).runs[0].grid.cols[0]).toBe(false);
    expect('attach' in wallOf(state).runs[0]).toBe(false);
  });

  it('deleting a line removes everything attached to it', () => {
    const state = reduce(withAttachments(), deleteLayoutLine({ ...at, lineId: 'L1' }));
    const w = wallOf(state);
    expect(w.lines.map((line) => line.id)).toEqual(['B1', 'L2']);
    expect('attach' in w.runs[0]).toBe(false);
    expect(w.runs[0].grid.cols.some((col) => 'attach' in col)).toBe(false);
    expect(w.openings[0].attach).toEqual(attach('B1'));
  });
});

describe('LL2 saves', () => {
  it('saves and loads lines and attachments', () => {
    const state = withAttachments();
    expect(isElevationDocument(toElevationDocument(state))).toBe(true);
    const stored = JSON.parse(JSON.stringify(toRoomDocument(state.rooms[0])));
    const loaded = roomFromDocument(stored, 4, state.settings);
    expect(loaded.ok).toBe(true);
    const [a, b] = [wallOf(state), loaded.room.walls[0]];
    expect(b.lines).toEqual(a.lines);
    expect(b.openings[0].attach).toEqual(a.openings[0].attach);
    expect(b.runs[0].attach).toEqual(a.runs[0].attach);
    expect(b.runs[0].grid.cols.map((col) => col.attach)).toEqual(a.runs[0].grid.cols.map((col) => col.attach));
    expect(runItems(b.runs[0]).map((item) => item.attach)).toEqual(b.runs[0].grid.cols.map((col) => col.attach));
  });
});
