import { describe, expect, it } from 'vitest';
import { attach, line, room, roomLine, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { wallFrame } from '../../model/geometry.js';
import { syncRoom } from '../../model/roomSync.js';
import elevationReducer, {
  createInitialElevationState, moveWallGroup, setWallAttachment, setWallLength, updateRoomLine,
} from '../elevationSlice.js';

const roomI = syncRoom(room({
  walls: [
    wall({ id: 'wall-1', x1: 0, y1: 0, x2: 240, y2: 0 }),
    wall({ id: 'wall-2', x1: 180, y1: 96, x2: 60, y2: 96, runs: [run({
      id: 'sink', x: 0, width: 36,
      ends: { left: { type: 'none' }, right: { type: 'none' } }, attach: attach('R1'),
    })] }),
    wall({ id: 'wall-3', x1: 300, y1: 0, x2: 300, y2: 120 }),
  ],
  roomLines: [roomLine('R1', { from: 'right', value: 120 })],
}), DEFAULT_SETTINGS);
const initial = {
  ...createInitialElevationState(null), rooms: [roomI], activeRoomId: roomI.id,
  activeWallId: 'wall-1', activeWallSide: 'back',
  selection: { wallId: 'wall-2', runId: 'sink' },
};
const reduce = (state, ...actions) => actions.reduce(elevationReducer, state);
const held = reduce(initial,
  updateRoomLine({ roomLineId: 'R1', value: 110 }),
  setWallAttachment({ wallId: 'wall-2', attach: attach('R1') }));

describe('group moves and wall attachments in the store (LL8)', () => {
  it('moves along the front frame and re-places the sink on R1', () => {
    expect(wallFrame(roomI, roomI.walls[1])).toMatchObject({ r: { x: -1, y: 0 }, n: { x: 0, y: -1 } });
    const state = reduce({ ...initial, message: 'old' }, moveWallGroup({ wallId: 'wall-2', along: 10 }));
    expect(state.rooms[0].walls[1]).toMatchObject({ x1: 170, y1: 96, x2: 50, y2: 96, runs: [{ x: 32 }] });
    expect(state.rooms[0].roomLines).toEqual(roomI.roomLines);
    expect(state.message).toBeNull();
    expect(roomI.walls[1]).toMatchObject({ x1: 180, x2: 60, runs: [{ x: 42 }] });
  });

  it('moves across toward W1 and keeps the sink face position', () => {
    const state = reduce(initial, moveWallGroup({ wallId: 'wall-2', across: 6 }));
    expect(state.rooms[0].walls[1]).toMatchObject({ x1: 180, y1: 90, x2: 60, y2: 90, runs: [{ x: 42 }] });
  });

  it('carries an unattached run without compensation', () => {
    const subject = syncRoom({ ...roomI, walls: roomI.walls.map((entry) => entry.id === 'wall-2'
      ? { ...entry, runs: [run({ x: 10, width: 36,
        ends: { left: { type: 'none' }, right: { type: 'none' } } })] } : entry) }, DEFAULT_SETTINGS);
    const state = reduce({ ...initial, rooms: [subject] }, moveWallGroup({ wallId: 'wall-2', along: 10 }));
    expect(state.rooms[0].walls[1]).toMatchObject({ x1: 170, x2: 50, runs: [{ x: 10 }] });
  });

  it('re-references R2 and reports its new reference wall', () => {
    const subject = syncRoom({ ...roomI,
      roomLines: [...roomI.roomLines, roomLine('R2', { wallId: 'wall-2', value: 5 })],
    }, DEFAULT_SETTINGS);
    const state = reduce({ ...initial, rooms: [subject] }, moveWallGroup({ wallId: 'wall-2', along: 10 }));
    expect(state.rooms[0].roomLines[1]).toEqual(roomLine('R2', { value: 175 }));
    expect(state.message).toBe('R2 is now measured from Wall 1.');
  });

  it('attaches the island, refuses along moves atomically and permits across moves', () => {
    expect(held.rooms[0].walls[1]).toMatchObject({ x1: 190, y1: 96, x2: 70, y2: 96, attach: attach('R1') });
    const refused = reduce(held, moveWallGroup({ wallId: 'wall-2', along: 10 }));
    expect(refused.rooms).toBe(held.rooms);
    expect(refused).toEqual({ ...held, message: 'Wall 2 is attached to line R1: move the line, or detach.' });
    const across = reduce(refused, moveWallGroup({ wallId: 'wall-2', across: 6 }));
    expect(across.rooms[0].walls[1]).toMatchObject({ x1: 190, y1: 90, x2: 70, y2: 90, runs: [{ x: 42 }] });
    expect(across.message).toBeNull();
  });

  it('follows an edited room line with the sink still centred', () => {
    const state = reduce(held, updateRoomLine({ roomLineId: 'R1', value: 100 }));
    expect(state.rooms[0].walls[1]).toMatchObject({ x1: 200, y1: 96, x2: 80, y2: 96, runs: [{ x: 42 }] });
  });

  it('grows a held wall around its centre', () => {
    const state = reduce(held, setWallLength({ wallId: 'wall-2', length: 132, growEnd: 'right' }));
    expect(state.rooms[0].walls[1]).toMatchObject({ x1: 196, y1: 96, x2: 64, y2: 96, runs: [{ x: 48 }] });
  });

  it('rejects non-square attachments, whole-room moves and invalid distances', () => {
    expect(reduce(initial, setWallAttachment({ wallId: 'wall-3', attach: attach('R1') }))).toBe(initial);
    const subject = room({ walls: [wall()] });
    const whole = { ...initial, rooms: [subject], activeRoomId: subject.id };
    const refused = reduce(whole, moveWallGroup({ wallId: 'wall-1', along: 10 }));
    expect(refused.rooms).toBe(whole.rooms);
    expect(refused).toEqual({ ...whole,
      message: "Every wall is joined to Wall 1, so there's nothing to move it against.",
    });
    for (const key of ['along', 'across']) {
      for (const value of ['x', null, NaN, Infinity, -Infinity]) {
        expect(reduce(initial, moveWallGroup({ wallId: 'wall-2', [key]: value }))).toBe(initial);
      }
    }
  });

  it('detaches without changing the island position', () => {
    const state = reduce(held, setWallAttachment({ wallId: 'wall-2', attach: null }));
    expect(state.rooms[0].walls[1]).not.toHaveProperty('attach');
    expect(state.rooms[0].walls[1]).toMatchObject({ x1: 190, y1: 96, x2: 70, y2: 96 });
    expect(state.rooms[0].walls[1].runs).toEqual(held.rooms[0].walls[1].runs);
  });

  it('keeps selection and active face, honours room ids, and uses both signed front axes', () => {
    const other = room({ id: 'other', walls: [wall()] });
    const start = { ...initial, rooms: [roomI, other], activeRoomId: 'other' };
    for (const action of [
      moveWallGroup({ roomId: roomI.id, wallId: 'wall-2', along: -10, across: -6 }),
      setWallAttachment({ roomId: roomI.id, wallId: 'wall-2', attach: attach('R1', 'center', 7) }),
    ]) {
      const state = reduce(start, action);
      expect(state.selection).toBe(start.selection);
      expect(state.activeWallId).toBe(start.activeWallId);
      expect(state.activeWallSide).toBe('back');
      expect(state.activeRoomId).toBe('other');
      expect(state.rooms[1]).toBe(other);
      expect(state.rooms[0].walls[1].x1).not.toBe(180);
    }
    const moved = reduce(start, moveWallGroup({ roomId: roomI.id, wallId: 'wall-2', along: -10, across: -6 }));
    expect(moved.rooms[0].walls[1]).toMatchObject({ x1: 190, y1: 102, x2: 70, y2: 102 });
    const offset = reduce(initial, setWallAttachment({ wallId: 'wall-2', attach: attach('R1', 'center', 7) }));
    expect(offset.rooms[0].walls[1]).toMatchObject({ x1: 173, x2: 53 });
    expect(reduce(initial, moveWallGroup({ wallId: 'wall-2' })).rooms[0]).toEqual(roomI);
    for (const payload of [{ roomId: 'gone' }, { wallId: 'gone' }]) {
      expect(reduce(initial, moveWallGroup({ wallId: 'wall-2', along: 10, ...payload }))).toBe(initial);
      expect(reduce(initial, setWallAttachment({ wallId: 'wall-2', attach: attach('R1'), ...payload }))).toBe(initial);
    }
  });

  it('refuses an off-wall room line without changing any room data', () => {
    const subject = syncRoom(room({ walls: roomI.walls.slice(1),
      roomLines: [roomLine('R2', { wallId: 'wall-2', value: 5 })],
    }), DEFAULT_SETTINGS);
    const start = { ...initial, rooms: [subject] };
    const state = reduce(start, moveWallGroup({ wallId: 'wall-2', along: 10 }));
    expect(state).toEqual({ ...start,
      message: 'R2 would end up past the end of every wall it can be measured from: move R2 first.',
    });
    expect(state.rooms).toBe(start.rooms);
  });

  it('rejects invalid attachment shapes, face lines, own-group lines and attachment chains', () => {
    const subject = { ...roomI, walls: roomI.walls.map((entry, index) => index === 1
      ? { ...entry, lines: [line('local', 60)] } : entry) };
    const start = { ...initial, rooms: [subject] };
    for (const value of [undefined, false, [], {}, { ...attach('R1'), extra: true },
      attach('R1', 'top'), attach('R1', 'center', Infinity), attach('local'), attach('gone')]) {
      expect(reduce(start, setWallAttachment({ wallId: 'wall-2', attach: value }))).toBe(start);
    }
    expect(reduce(initial, setWallAttachment({ wallId: 'wall-1', attach: attach('R1') }))).toBe(initial);
    const withR2 = { ...held, rooms: [{ ...held.rooms[0],
      walls: [...held.rooms[0].walls, wall({ id: 'wall-4', x1: 180, y1: 160, x2: 60, y2: 160 })],
      roomLines: [...held.rooms[0].roomLines, roomLine('R2', { wallId: 'wall-2', value: 60 })],
    }] };
    expect(reduce(withR2, setWallAttachment({ wallId: 'wall-4', attach: attach('R2') }))).toBe(withR2);
  });

  it('moves the whole connected group and enforces one attachment per group', () => {
    const subject = syncRoom({ ...roomI, walls: roomI.walls.map((entry, index) => index === 1
      ? { ...entry, connections: { start: null, end: { wallId: 'wall-5', endpoint: 'start' } } } : entry).concat(
      wall({ id: 'wall-5', x1: 60, y1: 96, x2: 60, y2: 150,
        connections: { start: { wallId: 'wall-2', endpoint: 'end' }, end: null } }),
    ) }, DEFAULT_SETTINGS);
    const start = { ...initial, rooms: [subject] };
    // Joining W5 flips W2's front frame; across -6 still gives the fixture's plan delta (0, -6).
    expect(wallFrame(subject, subject.walls[1])).toMatchObject({ r: { x: 1, y: 0 }, n: { x: 0, y: 1 } });
    const state = reduce(start, moveWallGroup({ wallId: 'wall-2', across: -6 }));
    expect(state.rooms[0].walls[1]).toMatchObject({ x1: 180, y1: 90, x2: 60, y2: 90 });
    expect(state.rooms[0].walls[3]).toMatchObject({ x1: 60, y1: 90, x2: 60, y2: 144 });
    const attached = reduce(start, setWallAttachment({ wallId: 'wall-2', attach: attach('R1') }));
    const refused = reduce(attached, moveWallGroup({ wallId: 'wall-5', across: 10 }));
    expect(refused.rooms).toBe(attached.rooms);
    // With W5 joined, topology numbers the held W2 as Wall 3.
    expect(refused.message).toBe('Wall 3 is attached to line R1: move the line, or detach.');
    expect(reduce(attached, setWallAttachment({ wallId: 'wall-5', attach: attach('R1') }))).toBe(attached);
  });

  it('keeps both new actions covered by read-only and issued-version guards', () => {
    for (const state of [{ ...initial, cloud: { room: { readOnly: true } } }, { ...initial, source: 'version' }]) {
      for (const action of [moveWallGroup({ wallId: 'wall-2', along: 10 }),
        setWallAttachment({ wallId: 'wall-2', attach: attach('R1') })]) {
        expect(reduce(state, action)).toBe(state);
      }
    }
  });
});
