import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { runFaceLayouts } from '../faceLayouts.js';
import { resolveWall } from '../room.js';

function roomWith(run, style) {
  const wall = {
    id: 'wall-1', name: 'Wall 1', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5,
    flipped: false, connections: { start: null, end: null }, profile: {}, runs: [run], openings: [],
  };
  return {
    id: 'room-1', name: 'Room 1', profile: { ...DEFAULT_SETTINGS.defaultProfile }, walls: [wall], wallOrder: ['wall-1'],
    ...(style ? { style } : {}),
  };
}

const RUN = {
  id: 'run-1', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 24, width: 19.5, z: 4, height: 30.5, depth: 24,
  ends: { left: { type: 'end_panel', width: null }, right: { type: 'end_panel', width: null } },
  autoCount: false, maxCabinetWidth: null, items: [{ id: 'a', kind: 'cabinet', width: 18 }],
  heightMode: 'auto', overrides: {}, anchors: { left: false, right: false },
};

const STACKED = {
  id: 'run-2', cabinetTypeId: CABINET_TYPE_IDS.TALL, x: 24, width: 19.5, z: 4, height: 90, depth: 24,
  ends: { left: { type: 'end_panel', width: null }, right: { type: 'end_panel', width: null } },
  autoCount: false, maxCabinetWidth: null, heightMode: 'manual', overrides: {},
  anchors: { left: false, right: false },
  grid: {
    id: 'run-2:grid', cols: [{ id: 's:col', size: 18, sizeMode: 'manual' }],
    rows: [{ id: 'run-2:row', size: null, sizeMode: 'auto' }],
    cells: [{ col: 0, row: 0, colSpan: 1, rowSpan: 1, node: {
      id: 's', cols: [{ id: 's:c', size: null, sizeMode: 'auto' }],
      rows: [{ id: 's:r0', size: null, sizeMode: 'auto' }, { id: 's:r1', size: 30, sizeMode: 'manual' }],
      cells: [
        { col: 0, row: 0, colSpan: 1, rowSpan: 1, node: { id: 't', kind: 'cabinet' } },
        { col: 0, row: 1, colSpan: 1, rowSpan: 1, node: { id: 'b', kind: 'cabinet' } },
      ],
    } }],
  },
};

describe('runFaceLayouts', () => {
  it('49. captured single door, then the room switched to inset', () => {
    const room = roomWith(RUN);
    const wall = resolveWall(room, room.walls[0]);
    const euro = runFaceLayouts(room, wall, RUN, DEFAULT_SETTINGS).get('a');
    expect(euro.style.cabinetStyleId).toBe(13);
    expect(euro.reveals.sources.left).toBe('rule:captured-single');
    expect(euro.faces).toEqual([{ path: 'r', type: 'door', x: 24.84375, z: 4.125, width: 17.8125, height: 30.125 }]);

    const insetRoom = roomWith(RUN, { cabinetStyleId: 14 });
    const inset = runFaceLayouts(insetRoom, resolveWall(insetRoom, insetRoom.walls[0]), RUN, DEFAULT_SETTINGS).get('a');
    expect(inset.faces).toEqual([{ path: 'r', type: 'door', x: 25.5, z: 5.5, width: 16.5, height: 27.5 }]);
  });

  it('50. stacked cells get seam reveals, European and inset', () => {
    const room = roomWith(STACKED);
    const wall = resolveWall(room, room.walls[0]);
    const euro = runFaceLayouts(room, wall, STACKED, DEFAULT_SETTINGS);
    const b = euro.get('b');
    expect(b.reveals.sources.top).toBe('rule:stacked-seam');
    expect(b.reveals.sources.left).toBe('rule:captured-single');
    expect(b.faces).toEqual([{ path: 'r', type: 'door', x: 24.84375, z: 4.125, width: 17.8125, height: 29.75 }]);
    const t = euro.get('t');
    expect(t.reveals.values.bottom).toBe(0);
    expect(t.faces).toEqual([{ path: 'r', type: 'door', x: 24.84375, z: 34, width: 17.8125, height: 59.875 }]);
    expect(euro.has('s')).toBe(false);

    const insetRoom = roomWith(STACKED, { cabinetStyleId: 14 });
    const inset = runFaceLayouts(insetRoom, resolveWall(insetRoom, insetRoom.walls[0]), STACKED, DEFAULT_SETTINGS);
    expect(inset.get('b').faces).toEqual([{ path: 'r', type: 'door', x: 25.5, z: 5.5, width: 16.5, height: 27.75 }]);
    expect(inset.get('t').faces).toEqual([{ path: 'r', type: 'door', x: 25.5, z: 34.75, width: 16.5, height: 57.75 }]);
  });

  it('51. a cabinet between panel cells is captured', () => {
    const panel = (id) => ({ id, kind: 'panel' });
    const cell = (col, row, node) => ({ col, row, colSpan: 1, rowSpan: 1, node });
    const WRAPPED = {
      ...RUN, id: 'run-3', width: 18, items: undefined,
      ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
      grid: {
        id: 'run-3:grid', cols: [{ id: 'w:col', size: 18, sizeMode: 'manual' }],
        rows: [{ id: 'run-3:row', size: null, sizeMode: 'auto' }],
        cells: [cell(0, 0, {
          id: 'w',
          cols: [{ id: 'w:l', size: 0.75, sizeMode: 'manual' }, { id: 'w:m', size: null, sizeMode: 'auto' },
            { id: 'w:r', size: 0.75, sizeMode: 'manual' }],
          rows: [{ id: 'w:row', size: null, sizeMode: 'auto' }],
          cells: [
            cell(0, 0, panel('L')),
            cell(1, 0, {
              id: 'm', cols: [{ id: 'm:c', size: null, sizeMode: 'auto' }],
              rows: [{ id: 'm:t', size: 0.75, sizeMode: 'manual' }, { id: 'm:b', size: null, sizeMode: 'auto' }],
              cells: [cell(0, 0, panel('T')), cell(0, 1, { id: 'c', kind: 'cabinet' })],
            }),
            cell(2, 0, panel('R')),
          ],
        })],
      },
    };
    const room = roomWith(WRAPPED);
    const layouts = runFaceLayouts(room, resolveWall(room, room.walls[0]), WRAPPED, DEFAULT_SETTINGS);
    expect([...layouts.keys()]).toEqual(['c']);
    const c = layouts.get('c');
    expect(c.reveals.sources.left).toBe('rule:captured-single');
    expect(c.reveals.sources.right).toBe('rule:captured-single');
    expect(c.faces).toEqual([{ path: 'r', type: 'door', x: 24.84375, z: 4.125, width: 16.3125, height: 29.375 }]);
  });

  it('52. top-level side panels capture a cabinet; a back panel does not', () => {
    const PANELS = {
      ...RUN, id: 'run-4',
      ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
      items: [
        { id: 'L', kind: 'panel', width: 0.75 },
        { id: 'a', kind: 'cabinet', width: 18 },
        { id: 'R', kind: 'panel', width: 0.75 },
      ],
    };
    const room = roomWith(PANELS);
    const a = runFaceLayouts(room, resolveWall(room, room.walls[0]), PANELS, DEFAULT_SETTINGS).get('a');
    expect(a.reveals.sources.left).toBe('rule:captured-single');
    expect(a.reveals.sources.right).toBe('rule:captured-single');
    expect(a.faces).toEqual([{ path: 'r', type: 'door', x: 24.84375, z: 4.125, width: 17.8125, height: 30.125 }]);

    const BACK = { ...PANELS, items: [PANELS.items[0], PANELS.items[1], { id: 'R', kind: 'panel', width: 0.75, depth: 0.5 }] };
    const backRoom = roomWith(BACK);
    const b = runFaceLayouts(backRoom, resolveWall(backRoom, backRoom.walls[0]), BACK, DEFAULT_SETTINGS).get('a');
    expect(b.reveals.sources.left).toBe('style');
    expect(b.reveals.sources.right).toBe('style');
  });

  const COVER = {
    ...RUN, id: 'run-5',
    ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
    items: [
      { id: 'L', kind: 'panel', width: 0.75, doors: 'cover' },
      { id: 'a', kind: 'cabinet', width: 18 },
      { id: 'R', kind: 'panel', width: 0.75 },
    ],
  };
  const layoutOf = (run) => {
    const room = roomWith(run);
    return runFaceLayouts(room, resolveWall(room, room.walls[0]), run, DEFAULT_SETTINGS).get('a');
  };

  it('53. a covered side panel pulls the door over it and sets the hinge the other way', () => {
    const a = layoutOf(COVER);
    expect(a.reveals.values.left).toBe(-0.6875);
    expect(a.reveals.sources.left).toBe('rule:covered-panel');
    expect(a.reveals.sources.right).toBe('style');
    expect(a.faces).toEqual([{
      path: 'r', type: 'door', x: 24.0625, z: 4.125, width: 18.625, height: 30.125,
      hinge: 'right', hingeRule: true,
    }]);
    expect(a.warnings).toEqual([]);
  });

  it('54. warns for a pair door or a hinge on the covered side', () => {
    const withFace = (face) => ({ ...COVER, items: [COVER.items[0], { ...COVER.items[1], face }, COVER.items[2]] });
    const pair = layoutOf(withFace({ type: 'pair_door', size: null }));
    expect(pair.reveals.sources.left).toBe('style');
    expect(pair.warnings).toContainEqual({ code: 'pair-door-covers-panel', path: 'r' });
    const hinged = layoutOf(withFace({ type: 'door', size: null, hinge: 'left' }));
    expect(hinged.faces).toEqual([{
      path: 'r', type: 'door', x: 24.0625, z: 4.125, width: 18.625, height: 30.125, hinge: 'left',
    }]);
    expect(hinged.warnings).toEqual([{ code: 'hinge-on-covered-side', path: 'r' }]);
  });
});
