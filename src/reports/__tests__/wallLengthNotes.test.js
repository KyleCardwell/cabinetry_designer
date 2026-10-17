import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../elevation/model/constants.js';
import { gridFromItems } from '../../elevation/model/grid.js';
import { syncRoom } from '../../elevation/model/room.js';
import { shippingList } from '../shippingList.js';
import { shippingListDocument } from '../shippingListPdf.js';

const settings = { ...DEFAULT_SETTINGS, runFlex: 0.25 };
const off = { ...settings, runFlex: 0 };
const header = { job: 'Job', room: 'Kitchen', address: '', wood: '', finish: '', boxes: '' };

function island() {
  const run = (id, wallSide) => ({
    id, wallSide, cabinetTypeId: 1, x: 0, width: 90, z: 4, height: 30.5, depth: 24,
    ends: { left: { type: 'end_panel', width: null }, right: { type: 'end_panel', width: null } },
    autoCount: true, maxCabinetWidth: null, heightMode: 'manual', overrides: {},
    anchors: { left: true, right: true },
    grid: gridFromItems(id, [1, 2, 3].map((n) => ({ id: `${id}${n}`, kind: 'cabinet', width: null }))),
  });
  return {
    id: 'room', name: 'Kitchen', profile: { ...settings.defaultProfile }, wallOrder: ['I'],
    walls: [{
      id: 'I', name: '', x1: 0, y1: 0, x2: 90, y2: 0, height: 96, thickness: 0,
      connections: { start: null, end: null }, landings: { start: null, end: null },
      profile: {}, openings: [], joints: [],
      endPanels: { start: { width: null }, end: { width: null } },
      runs: [run('F', 'front'), run('K', 'back')],
    }],
  };
}

describe('RF4 step b planned wall length notes', () => {
  it('prints one Island 90 1/8 (planned 90) note across both faces on every shipping copy', () => {
    const room = syncRoom(island(), settings);
    expect(room.walls[0]._endFlex).toEqual({ start: 0.0625, end: 0.0625 });
    const before = structuredClone(room);
    const list = shippingList(room, settings);
    expect(list.wallNotes).toEqual(['Island 90 1/8 (planned 90)']);
    expect(room).toEqual(before);
    list.roomNote = 'Ship Friday';
    const pdf = shippingListDocument(list, header, ['master', 'order']);
    expect(pdf.content).toHaveLength(2);
    for (const copy of pdf.content) {
      expect(copy.table.body.at(-2)).toEqual([
        { text: 'Island 90 1/8 (planned 90)', fontSize: 9, border: [true, true, true, true], colSpan: 6 },
        {}, {}, {}, {}, {},
      ]);
      expect(copy.table.body.at(-1)[0].text).toBe('Room notes: Ship Friday');
    }
    room.walls[0].name = 'Prep Island';
    expect(shippingList(room, settings).wallNotes).toEqual(['Prep Island 90 1/8 (planned 90)']);
  });

  it('prints Peninsula 90 1/16 (planned 90) when only its free end moves', () => {
    const source = island();
    const wall = source.walls[0];
    wall.connections.start = { wallId: 'B', endpoint: 'start' };
    wall.endPanels.start = null;
    wall.runs = [wall.runs[0]];
    wall.runs[0].autoCount = false;
    wall.runs[0].ends.left.styleId = 'sheet';
    wall.runs[0].grid = gridFromItems('F', [{ id: 'cab', kind: 'cabinet', width: null }]);
    source.walls.push({ ...wall, id: 'B', x2: 0, y2: 100, thickness: 4.5,
      connections: { start: { wallId: 'I', endpoint: 'start' }, end: null }, runs: [],
      endPanels: { start: null, end: null } });
    source.wallOrder.push('B');
    const room = syncRoom(source, settings);
    expect(room.walls[0]._endFlex).toEqual({ end: 0.0625 });
    expect(shippingList(room, settings).wallNotes).toEqual(['Peninsula 90 1/16 (planned 90)']);
  });

  it('omits notes for unchanged islands, disabled flex and ordinary flexed runs', () => {
    const source = island();
    for (const run of source.walls[0].runs) run.holdWidth = true;
    const held = syncRoom(source, settings);
    expect(held.walls[0]._endFlex).toBeUndefined();
    expect(shippingList(held, settings).wallNotes).toEqual([]);
    expect(shippingList(syncRoom(island(), off), off).wallNotes).toEqual([]);
    const ordinary = island();
    ordinary.walls[0].thickness = 4.5;
    ordinary.walls[0].runs = [ordinary.walls[0].runs[0]];
    ordinary.walls[0].runs[0].anchors = { left: false, right: false };
    const room = syncRoom(ordinary, settings);
    expect(room.walls[0].runs[0].flex).toMatchObject({ left: 0.0625, right: 0.0625 });
    expect(shippingList(room, settings).wallNotes).toEqual([]);
    expect(shippingListDocument(shippingList(room, settings), header, ['master'])
      .content[0].table.body.at(-1)[3].text).toBe('Adjustable Shelves');
  });
});
