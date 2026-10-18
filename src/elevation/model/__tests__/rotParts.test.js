import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { elevationPartNumbers } from '../elevationPartNumbers.js';
import { gridFromItems } from '../grid.js';
import { partNumbers, wallBadgeGroups } from '../partNumbers.js';
import { roomParts } from '../parts.js';
import { resolveWall } from '../room.js';

const settings = DEFAULT_SETTINGS;
const door = (action = 'pullout') => ({ type: 'door', size: null, action });
const group = (direction, ...children) => ({ direction, size: null, children });
const drawers = () => group('vertical', ...Array.from({ length: 3 }, () => ({ type: 'drawer_front', size: null })));

function fixture({ face = door(), purpose = 'trash', aFace = drawers(), wallSide = 'front', height = 30.5 } = {}) {
  const run = {
    id: 'run', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 0, width: 72, z: 4, height, depth: 24,
    heightMode: 'manual', autoCount: false, overrides: {}, anchors: {}, wallSide,
    ends: { left: { type: 'none' }, right: { type: 'none' } },
    grid: gridFromItems('run', [
      { id: 'A', kind: 'cabinet', width: null, face: aFace },
      { id: 'T', kind: 'cabinet', width: null, face, ...(purpose ? { purpose } : {}) },
      { id: 'B', kind: 'cabinet', width: null, face: door('swing') },
    ]),
  };
  return {
    id: 'room', profile: { ...settings.defaultProfile }, wallOrder: ['wall'],
    walls: [{
      id: 'wall', x1: 0, y1: 0, x2: 96, y2: 0, height: 96, thickness: 4.5,
      flipped: false, connections: { start: null, end: null }, profile: {},
      runs: [run], openings: [], joints: [], endPanels: { start: null, end: null },
    }],
  };
}

const numbered = (room) => partNumbers(room, settings).parts
  .filter(({ kind }) => kind !== 'molding').map(({ key, number }) => [key, number]);

describe('IN6 step e ROT and trash lid parts', () => {
  it('anchor 1: numbers a ROT and lid immediately after the trash cabinet', () => {
    const room = fixture();
    expect(numbered(room)).toEqual([['A', 1], ['T', 2], ['T:rot:r', 3], ['T:lid:r', 4], ['B', 5]]);
    expect(roomParts(room, settings).filter(({ cabinetId }) => cabinetId === 'T')).toEqual([
      { key: 'T:rot:r', kind: 'rot', cabinetId: 'T', facePath: 'r', wallId: 'wall', side: 'front',
        runId: 'run', pieceId: null, molding: null, x: null, z: null, width: null, height: null, source: 'face' },
      { key: 'T:lid:r', kind: 'trash_lid', cabinetId: 'T', facePath: 'r', wallId: 'wall', side: 'front',
        runId: 'run', pieceId: null, molding: null, x: null, z: null, width: null, height: null, source: 'face' },
    ]);
  });

  it('anchor 2: interleaves ROT and lid pairs for side-by-side pull-outs', () => {
    const room = fixture({ face: group('horizontal', door(), door()) });
    expect(numbered(room)).toEqual([
      ['A', 1], ['T', 2], ['T:rot:r.0', 3], ['T:lid:r.0', 4],
      ['T:rot:r.1', 5], ['T:lid:r.1', 6], ['B', 7],
    ]);
  });

  it('anchor 3: requires trash purpose as well as a pull-out door', () => {
    expect(numbered(fixture({ purpose: null, aFace: door() }))).toEqual([['A', 1], ['T', 2], ['B', 3]]);
    expect(numbered(fixture({ purpose: 'hamper' }))).toEqual([['A', 1], ['T', 2], ['B', 3]]);
    expect(numbered(fixture({ face: group('horizontal', door('swing'), drawers()) })))
      .toEqual([['A', 1], ['T', 2], ['B', 3]]);
    const legacy = fixture();
    const run = legacy.walls[0].runs[0];
    run.items = ['A', 'T', 'B'].map((id) => ({ id, kind: 'cabinet', width: null }));
    delete run.grid;
    expect(numbered(legacy)).toEqual([['A', 1], ['T', 2], ['B', 3]]);
  });

  it('anchor 4: reserves overrides without introducing canvas or DXF badges', () => {
    const room = fixture();
    const view = resolveWall(room, room.walls[0], 'front');
    const groups = wallBadgeGroups(room, view, settings);
    const badges = elevationPartNumbers(room, room.walls[0], 'front', settings);
    room.partNumberOverrides = { 'T:rot:r': 40 };
    room.reportParts = { 'T:rot:r': { name: 'Custom ROT' }, 'T:lid:r': { name: 'Custom lid' } };
    const result = partNumbers(room, settings);
    expect(numbered(room)).toEqual([['A', 1], ['T', 2], ['T:rot:r', 40], ['T:lid:r', 3], ['B', 4]]);
    expect(result.overrideKeys).toEqual(new Set(['T:rot:r']));
    expect(result.warnings).toEqual([]);
    expect(wallBadgeGroups(room, view, settings)).toEqual(groups);
    const after = elevationPartNumbers(room, room.walls[0], 'front', settings);
    expect(after.map(({ key }) => key)).toEqual(badges.map(({ key }) => key));
    expect(after.filter(({ key }) => key !== 'B' && !key.startsWith('molding:')))
      .toEqual(badges.filter(({ key }) => key !== 'B' && !key.startsWith('molding:')));
    expect(groups.flatMap(({ pieces }) => pieces.map(({ id }) => id)))
      .not.toEqual(expect.arrayContaining(['T:rot:r', 'T:lid:r']));

    room.partNumberOverrides = { 'T:rot:r': 4 };
    expect(numbered(room)).toEqual([['A', 1], ['T', 2], ['T:rot:r', 4], ['T:lid:r', 3], ['B', 5]]);
  });

  it('walks nested stored faces in tree order even when too short to size a box, on the back face', () => {
    const room = fixture({ wallSide: 'back', height: 1,
      face: group('vertical', door('swing'), group('horizontal', door(), door())) });
    const before = structuredClone(room);
    const parts = roomParts(room, settings).filter(({ cabinetId }) => cabinetId === 'T');
    expect(parts.map(({ key }) => key)).toEqual([
      'T:rot:r.1.0', 'T:lid:r.1.0', 'T:rot:r.1.1', 'T:lid:r.1.1',
    ]);
    parts.forEach((part) => expect(part).toMatchObject({
      wallId: 'wall', side: 'back', runId: 'run', cabinetId: 'T', pieceId: null,
      x: null, z: null, width: null, height: null,
    }));
    expect(room).toEqual(before);
  });
});
