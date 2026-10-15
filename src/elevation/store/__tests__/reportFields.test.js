import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import elevationReducer, {
  addRoom, createInitialElevationState, renameRoom, setReportPartField, setRoomReportNote,
} from '../elevationSlice.js';
import {
  isRoom, normalizeElevationDocument, roomFromDocument, toElevationDocument, toRoomDocument,
} from '../persistence.js';

const golden = JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/golden.json', import.meta.url), 'utf8'));
const savedDocument = () => normalizeElevationDocument(structuredClone(golden));
const initialState = () => createInitialElevationState(null);
const setField = (state, field, value, extra = {}) => elevationReducer(state,
  setReportPartField({ key: 'c1', field, value, ...extra }));

describe('RP2 step a room report fields', () => {
  it('trims a cabinet name, removes a blank name, and preserves sibling fields (anchors 1–2)', () => {
    let state = setField(initialState(), 'name', '  Microwave Cabinet ');
    expect(state.rooms[0].reportParts.c1).toEqual({ name: 'Microwave Cabinet' });
    state = setField(state, 'name', '  ');
    expect(state.rooms[0].reportParts).not.toHaveProperty('c1');
    state = setField(state, 'name', 'Cabinet');
    state = setField(state, 'boxes', '  MAPLE PLY  ');
    state = setField(state, 'note', '  Ship Fri  ');
    state = setField(state, 'name', null);
    expect(state.rooms[0].reportParts.c1).toEqual({ boxes: 'MAPLE PLY', note: 'Ship Fri' });
    state = setField(state, 'boxes', false);
    expect(state.rooms[0].reportParts.c1).toEqual({ note: 'Ship Fri' });
  });

  it('stores shopBuilt only as true and removes cleared fields and empty entries (anchor 3)', () => {
    for (const value of [false, null, '  ']) {
      let state = setField(initialState(), 'shopBuilt', true);
      expect(state.rooms[0].reportParts.c1).toEqual({ shopBuilt: true });
      state = setField(state, 'shopBuilt', value);
      expect(state.rooms[0].reportParts).not.toHaveProperty('c1');
    }
    let state = setField(initialState(), 'note', 'x');
    state = setField(state, 'shopBuilt', true);
    state = setField(state, 'shopBuilt', false);
    expect(state.rooms[0].reportParts.c1).toEqual({ note: 'x' });
  });

  it('caps trimmed name, boxes and note text at 60, 120 and 200 characters (anchor 4)', () => {
    for (const [field, limit] of [['name', 60], ['boxes', 120], ['note', 200]]) {
      const state = setField(initialState(), field, `  ${'x'.repeat(250)}  `);
      expect(state.rooms[0].reportParts.c1).toEqual({ [field]: 'x'.repeat(limit) });
      expect(isRoom(state.rooms[0])).toBe(true);
    }
  });

  it('ignores unknown fields, invalid inputs, keys and rooms and targets the requested room (anchor 5)', () => {
    const state = setField(initialState(), 'note', 'Keep');
    for (const [field, value, extra] of [
      ['color', 'red'], ['constructor', 'red'], ['name', 7], ['note', {}],
      ['shopBuilt', 'true'], ['shopBuilt', 1], ['note', 'x', { key: '' }],
      ['note', 'x', { key: null }], ['note', 'x', { roomId: 'missing' }],
    ]) expect(setField(state, field, value, extra)).toBe(state);
    let next = elevationReducer(state, addRoom({ name: 'Other' }));
    next = setField(next, 'note', 'First only', { roomId: state.activeRoomId });
    expect(next.rooms[0].reportParts.c1.note).toBe('First only');
    expect(next.rooms[1].reportParts).toEqual({});
  });

  it('rejects malformed report parts and room notes (anchor 6)', () => {
    const room = savedDocument().rooms[0];
    for (const reportParts of [
      { a: { note: 7 } }, { a: { shopBuilt: false } }, { a: {} }, null, [],
      { a: null }, { a: [] }, { a: { color: 'red' } }, { a: { note: '' } },
      { a: { note: ' x ' } }, { a: { shopBuilt: null } },
      ...[['name', 60], ['boxes', 120], ['note', 200]].map(([field, limit]) => (
        { a: { [field]: 'x'.repeat(limit + 1) } }
      )),
    ]) expect(isRoom({ ...room, reportParts })).toBe(false);
    for (const reportNote of [null, false, 7, {}, ' x ', 'x'.repeat(401)]) {
      expect(isRoom({ ...room, reportNote })).toBe(false);
    }
  });

  it('accepts optional and populated report data and retains it through sync and saving (anchor 7)', () => {
    const document = savedDocument();
    const room = document.rooms[0];
    delete room.reportParts;
    expect(isRoom({ ...room, reportNote: 'Ship Fri' })).toBe(true);
    for (const reportParts of [{}, { a: { boxes: 'MAPLE PLY', note: 'x' } },
      { a: { name: 'Cabinet', shopBuilt: true, note: 'x' }, removedPart: { note: 'Keep' } }]) {
      Object.assign(room, { reportParts, reportNote: 'Ship Fri' });
      expect(isRoom(room)).toBe(true);
      const normalized = normalizeElevationDocument(document);
      expect(normalized.rooms[0]).toEqual(room);
      let state = createInitialElevationState(normalized);
      state = elevationReducer(state, renameRoom({ roomId: room.id, name: 'Renamed' }));
      const serialized = JSON.parse(JSON.stringify(toElevationDocument(state)));
      const loaded = normalizeElevationDocument(serialized).rooms[0];
      const copied = roomFromDocument(toRoomDocument(loaded), document.schemaVersion, document.settings);
      expect(copied.ok).toBe(true);
      expect(copied.room).toMatchObject({ reportParts, reportNote: 'Ship Fri' });
    }
  });

  it('adds only the report defaults to old rooms and initializes new rooms (anchor 8)', () => {
    const document = savedDocument();
    for (const room of document.rooms) {
      delete room.reportParts;
      delete room.reportNote;
    }
    const original = structuredClone(document);
    expect(normalizeElevationDocument(document)).toEqual({
      ...document,
      rooms: document.rooms.map((room) => ({ ...room, reportParts: {}, reportNote: '' })),
    });
    expect(document).toEqual(original);
    let state = initialState();
    expect(state.rooms[0]).toMatchObject({ reportParts: {}, reportNote: '' });
    state = elevationReducer(state, addRoom({ name: 'New room' }));
    expect(state.rooms[1]).toMatchObject({ reportParts: {}, reportNote: '' });
  });

  it('trims and caps room notes at 400 characters and clears blanks', () => {
    let state = initialState();
    state = elevationReducer(state, setRoomReportNote({ value: '  Ship Fri  ' }));
    expect(state.rooms[0].reportNote).toBe('Ship Fri');
    state = elevationReducer(state, setRoomReportNote({ value: `  ${'x'.repeat(450)}  ` }));
    expect(state.rooms[0].reportNote).toBe('x'.repeat(400));
    for (const value of [7, {}, undefined]) {
      expect(elevationReducer(state, setRoomReportNote({ value }))).toBe(state);
    }
    expect(elevationReducer(state, setRoomReportNote({ roomId: 'missing', value: 'x' }))).toBe(state);
    for (const value of ['  ', null, false]) {
      const cleared = elevationReducer(state, setRoomReportNote({ value }));
      expect(cleared.rooms[0].reportNote).toBe('');
    }
    state = elevationReducer(state, addRoom({ name: 'Other' }));
    state = elevationReducer(state, setRoomReportNote({ roomId: state.rooms[0].id, value: 'First' }));
    expect(state.rooms[0].reportNote).toBe('First');
    expect(state.rooms[1].reportNote).toBe('');
  });
});
