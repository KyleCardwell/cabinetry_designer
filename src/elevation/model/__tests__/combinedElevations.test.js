import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  autoCombinedFaces,
  combinableFaces,
  combinedLayout,
  combinedViewOf,
} from '../combinedElevations.js';
import { combinedGroups, elevationLabel, elevationLetters } from '../topology.js';
import { isRoom, normalizeElevationDocument } from '../../store/persistence.js';
import elevationReducer, { setCombinedElevation, setCombinedFace } from '../../store/elevationSlice.js';
import { stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import { toDrawingPayload } from '../drawingPayload.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { newAccessory } from '../accessories.js';
import { gridLeaves } from '../grid.js';
import { roomWith } from './helpers/showThroughRoom.js';

const wall = (id, x1, y1, x2, y2, start, end, runs = []) => ({
  id, name: '', x1, y1, x2, y2, height: 96, thickness: 4.5, flipped: false,
  runs, openings: [], recesses: [], soffits: [], connections: { start, end },
});
const to = (wallId, endpoint) => ({ wallId, endpoint });

/** A stepped wall: A, a 16" jog J, B set back 16", a jog K, then C; cabinets on A and C. */
function steppedRoom(extra = {}) {
  return {
    id: 'room-1',
    wallOrder: ['A', 'J', 'B', 'K', 'C'],
    walls: [
      wall('A', 0, 0, 100, 0, null, to('J', 'start'), [{ id: 'a' }]),
      wall('J', 100, 0, 100, 16, to('A', 'end'), to('B', 'start')),
      wall('B', 100, 16, 160, 16, to('J', 'end'), to('K', 'start')),
      wall('K', 160, 16, 160, 0, to('B', 'end'), to('C', 'start')),
      wall('C', 160, 0, 240, 0, to('K', 'end'), null, [{ id: 'c' }]),
    ],
    ...extra,
  };
}

describe('combined elevations (Kyle 2026-10-16)', () => {
  it('IN14 anchor 5: shifts whole interior lines and labels by dx 100, along with glass marks and holes', () => {
    const room = roomWith([{ id: 'a', face: { type: 'open', size: null } }]);
    const first = room.walls[0];
    const second = roomWith([{ id: 'b', face: { type: 'door', size: null, panelMaterial: 'glass' } }]).walls[0];
    Object.assign(second, { id: 'other', x1: -100, x2: 0 });
    second.runs[0].id = 'other-run';
    room.walls.push(second);
    room.wallOrder.push(second.id);
    const open = toDrawingPayload(room, DEFAULT_SETTINGS).elevations[0].interiors[0];
    expect(open.lines).toHaveLength(8);
    room.combinedElevations = [{ id: 'g', on: true, faces: [first.id, second.id] }];
    const shifted = toDrawingPayload(room, DEFAULT_SETTINGS).elevations[0].interiors[0];
    expect(shifted).toEqual({ ...open,
      lines: open.lines.map((line) => ({ ...line, x1: line.x1 + 100, x2: line.x2 + 100 })),
    });
    delete room.combinedElevations;
    const rod = { ...newAccessory([], 'FR'), name: 'Fixed rod',
      size: { width: 'section', height: 1.25, depth: 1.25 }, lengthDeduction: 0.25 };
    gridLeaves(first.runs[0].grid)[0].interior = { accessories: [{ accessoryId: 'FR', fromBottom: 20 }] };
    const settings = { ...DEFAULT_SETTINGS, accessories: [rod] };
    const original = toDrawingPayload(room, settings).elevations;
    room.combinedElevations = [{ id: 'g', on: true, faces: [first.id, second.id] }];
    const [combined] = toDrawingPayload(room, settings).elevations;
    expect(combined.faces.find(({ wallId }) => wallId === first.id).dx).toBe(100);
    expect(original[0].interiors[0].lines).toHaveLength(12);
    expect(original[0].interiors[0].labels).toHaveLength(1);
    for (const elevation of original) {
      const dx = combined.faces.find(({ wallId }) => wallId === elevation.wallId).dx;
      for (const interior of elevation.interiors) {
        expect(combined.interiors.find(({ partId }) => partId === interior.partId)).toEqual({
          partId: interior.partId,
          lines: interior.lines.map((line) => ({ ...line, x1: line.x1 + dx, x2: line.x2 + dx })),
          labels: interior.labels.map((label) => ({ ...label, x: label.x + dx })),
        });
      }
      for (const mark of elevation.glassMarks ?? []) {
        expect(combined.glassMarks.find(({ partId }) => partId === mark.partId)).toEqual({
          partId: mark.partId,
          lines: mark.lines.map((line) => ({ ...line, x1: line.x1 + dx, x2: line.x2 + dx })),
        });
      }
      for (const part of elevation.parts.filter(({ holes }) => holes)) {
        expect(combined.parts.find(({ id }) => id === part.id).holes)
          .toEqual(part.holes.map((hole) => ({ ...hole, x: hole.x + dx })));
      }
    }
    for (const source of room.walls) {
      gridLeaves(source.runs[0].grid)[0].face = { type: 'door', size: null };
    }
    const closed = toDrawingPayload(room, settings).elevations[0];
    expect(closed).not.toHaveProperty('interiors');
    expect(closed).not.toHaveProperty('glassMarks');
  });

  it('groups faces facing the same way, passing through square jogs', () => {
    const room = steppedRoom();
    expect(autoCombinedFaces(room, 'A')).toEqual(['A', 'B', 'C']);
    expect(autoCombinedFaces(room, 'B')).toEqual(['B', 'A', 'C']);
    expect(combinableFaces(room, 'A')).toEqual(['A', 'B', 'C']);
    expect(autoCombinedFaces(room, 'J')).toEqual(['J']);
  });

  it('lays each face out along the view at its depth', () => {
    expect(combinedLayout(steppedRoom(), ['A', 'B', 'C'])).toEqual({
      faces: [
        { key: 'A', wallId: 'A', side: 'front', dx: 140, depth: 0, length: 100, height: 96 },
        { key: 'B', wallId: 'B', side: 'front', dx: 80, depth: -16, length: 60, height: 96 },
        { key: 'C', wallId: 'C', side: 'front', dx: 0, depth: 0, length: 80, height: 96 },
      ],
      length: 240,
      height: 96,
    });
  });

  it('letters an elevation that is on once, at its lead, and labels every face with it', () => {
    const off = steppedRoom({ combinedElevations: [{ id: 'g', on: false, faces: ['A', 'B', 'C'] }] });
    expect([...elevationLetters(off)]).toEqual([['A', 'A'], ['C', 'B']]);
    expect(combinedViewOf(off, 'C')).toBeNull();
    const on = steppedRoom({ combinedElevations: [{ id: 'g', on: true, faces: ['C', 'B', 'A'] }] });
    expect(combinedGroups(on)).toEqual([{ id: 'g', faces: ['A', 'B', 'C'] }]);
    expect([...elevationLetters(on)]).toEqual([['A', 'A']]);
    expect(elevationLabel(on, on.walls[4])).toBe('Elevation A');
    expect(combinedViewOf(on, 'C')).toMatchObject({ id: 'g', length: 240 });
    // A face missing from the room, or claimed by an earlier group, drops out; one face left isn't a group.
    const claimed = steppedRoom({
      combinedElevations: [
        { id: 'g', on: true, faces: ['A', 'B'] },
        { id: 'h', on: true, faces: ['B', 'C', 'gone'] },
      ],
    });
    expect(combinedGroups(claimed)).toEqual([{ id: 'g', faces: ['A', 'B'] }]);
    expect([...elevationLetters(claimed)]).toEqual([['A', 'A'], ['C', 'B']]);
  });

  it('saves the switch and the checked faces, a face in one elevation at a time', () => {
    const base = stateWithRun();
    const state = { ...base, rooms: [{ ...base.rooms[0], ...steppedRoom(), id: base.rooms[0].id }] };
    const roomId = state.rooms[0].id;
    let next = elevationReducer(state, setCombinedElevation({ roomId, wallId: 'B', on: true }));
    const [group] = next.rooms[0].combinedElevations;
    expect(group).toMatchObject({ on: true, faces: ['B', 'A', 'C'] });
    next = elevationReducer(next, setCombinedFace({ roomId, wallId: 'B', face: 'C', included: false }));
    expect(next.rooms[0].combinedElevations[0].faces).toEqual(['B', 'A']);
    expect([...elevationLetters(next.rooms[0])]).toEqual([['A', 'A'], ['C', 'B']]);
    // C's own elevation takes its faces from B's, which is left empty and goes.
    next = elevationReducer(next, setCombinedElevation({ roomId, wallId: 'C', on: true }));
    expect(next.rooms[0].combinedElevations.map(({ faces }) => faces)).toEqual([['C', 'B', 'A']]);
    next = elevationReducer(next, setCombinedFace({ roomId, wallId: 'C', face: 'B', included: false }));
    // A face that doesn't face this way can't join; off keeps the checked faces for next time.
    next = elevationReducer(next, setCombinedFace({ roomId, wallId: 'C', face: 'J', included: true }));
    next = elevationReducer(next, setCombinedElevation({ roomId, wallId: 'C', on: false }));
    expect(next.rooms[0].combinedElevations).toEqual([expect.objectContaining({ on: false, faces: ['C', 'A'] })]);
  });

  it('validates the saved shape', () => {
    const golden = normalizeElevationDocument(
      JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
    ).rooms[0];
    expect(isRoom(golden)).toBe(true);
    const room = (combinedElevations) => ({ ...golden, combinedElevations });
    expect(isRoom(room([{ id: 'g', on: true, faces: ['wall-1'] }]))).toBe(true);
    expect(isRoom(room([{ id: 'g', on: 'yes', faces: [] }]))).toBe(false);
    expect(isRoom(room({}))).toBe(false);
  });
});
