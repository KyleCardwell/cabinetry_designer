import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS } from '../constants.js';
import { gridFromItems } from '../grid.js';
import { partNumbers } from '../partNumbers.js';
import { roomParts } from '../parts.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const load = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const document = normalizeElevationDocument(load('golden'));
const settings = { ...document.settings, sectionProfiles: load('sectionProfiles').profiles };
const template = document.rooms[0].walls[0].runs.find(({ cabinetTypeId }) => cabinetTypeId === CABINET_TYPE_IDS.BASE);
const run = (id, ids, props = {}) => ({ ...structuredClone(template), id, x: 0, width: ids.length * 24,
  autoCount: false, anchors: {}, overrides: {}, wallSide: 'front',
  ends: { left: { type: 'none' }, right: { type: 'none' } },
  grid: gridFromItems(id, ids.map((key) => ({ id: key, kind: 'cabinet', width: null }))), ...props });
const room = (runs, props = {}) => {
  const stored = structuredClone(document.rooms[0]);
  stored.profile = { ...stored.profile, baseKind: 'furniture_base', furnitureBaseProfileId: 'fb4' };
  stored.wallOrder = ['W'];
  stored.walls = [{ ...stored.walls[0], id: 'W', x1: 0, y1: 0, x2: 120, y2: 0, flipped: false,
    connections: { start: null, end: null }, openings: [], joints: [],
    endPanels: { start: null, end: null }, runs, ...props }];
  return syncRoom(stored, settings);
};
const keys = (stored) => roomParts(stored, settings).filter(({ kind }) => kind !== 'molding').map(({ key }) => key);

const cell = (row, node) => ({ col: 0, row, colSpan: 1, rowSpan: 1, node });
const auto = (id) => ({ id, size: null, sizeMode: 'auto' });

function desk({ panels = true, topVoid = false } = {}) {
  const opening = { id: 'opening', kind: 'void' };
  const drawer = { id: 'drawer', kind: 'cabinet' };
  const middle = {
    id: 'middle', cols: [auto('middle:col')],
    rows: [{ id: 'top', size: 4, sizeMode: 'manual' }, auto('bottom')],
    cells: [cell(0, topVoid ? opening : drawer), cell(1, topVoid ? drawer : opening)],
  };
  return {
    ...structuredClone(template), id: 'R', heightMode: 'manual', autoCount: false, anchors: {}, cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 0, width: 60,
    z: 4, height: 24, depth: 24,
    ends: { left: { type: 'none' }, right: { type: 'none' } },
    grid: gridFromItems('desk', [
      { id: 'left', kind: 'cabinet', width: 18 },
      ...(panels ? [{ id: 'left-panel', kind: 'panel', width: 0.75 }] : []),
      { id: 'middle', kind: 'cabinet', width: panels ? 22.5 : 24, grid: middle },
      ...(panels ? [{ id: 'right-panel', kind: 'panel', width: 0.75 }] : []),
      { id: 'right', kind: 'cabinet', width: null },
    ]),
  };
}

describe('SPEC-50.12 step 513 furniture base numbering order', () => {
  it('places a furniture base before both cabinets of its run (anchor 1)', () => {
    const stored = room([run('A', ['a1', 'a2'])]);
    expect(keys(stored)).toEqual(['furniture_base:A', 'a1', 'a2']);
    expect(partNumbers(stored, settings).parts.slice(0, 3).map(({ key, number }) => [key, number]))
      .toEqual([['furniture_base:A', 1], ['a1', 2], ['a2', 3]]);

    const paneled = room([run('A', ['a1', 'a2'], { width: 120, anchors: { left: true, right: true }, top: 'crown' })],
      { endPanels: { start: { width: 0.75 }, end: { width: 0.75 } } });
    const parts = roomParts(paneled, settings);
    expect(keys(paneled)).toEqual(['W:endPanel:start', 'furniture_base:A', 'a1', 'a2', 'W:endPanel:end']);
    expect(parts.slice(-2).map(({ key }) => key)).toEqual(['molding:topMold', 'molding:crown']);
  });

  it('places a later run base after an earlier run without a furniture base (anchor 2)', () => {
    const stored = room([run('B', ['b1', 'b2'], { x: 48, top: 'crown' }),
      run('A', ['a1'], { overrides: { baseKind: 'toe_kick' } })]);
    expect(keys(stored)).toEqual(['a1', 'furniture_base:B', 'b1', 'b2']);
    expect(roomParts(stored, settings).slice(-3).map(({ key }) => key))
      .toEqual(['molding:toeKick', 'molding:topMold', 'molding:crown']);
  });

  it('places a joined tall and base group before the tall parts (anchor 3)', () => {
    const stored = room([run('B', ['b1', 'b2'], { x: 24 }),
      run('T', ['t1'], { cabinetTypeId: CABINET_TYPE_IDS.TALL })]);
    expect(keys(stored)).toEqual(['furniture_base:T', 't1', 'b1', 'b2']);
    expect(roomParts(stored, settings)[0]).toEqual({ key: 'furniture_base:T', kind: 'furniture_base', runIds: ['T', 'B'] });
  });

  it('places both desk base segments in x order before the run parts (anchor 4)', () => {
    expect(keys(room([desk()]))).toEqual([
      'furniture_base:R', 'furniture_base:R:2', 'left', 'left-panel', 'drawer', 'right-panel', 'right',
    ]);
  });

  it('orders split bases by the back face x rather than front coordinates', () => {
    expect(keys(room([{ ...desk(), wallSide: 'back', x: 20 }]))).toEqual([
      'furniture_base:R', 'furniture_base:R:2', 'left', 'left-panel', 'drawer', 'right-panel', 'right',
    ]);
  });
});
