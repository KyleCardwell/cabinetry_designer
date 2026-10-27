import { beforeEach, describe, expect, it } from 'vitest';
import { auto, fixed, room, run, wall } from '../../../test/builders.js';
import { cellPieces } from '../cells.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
import { returnExtents, returnFaceWarnings } from '../index.js';
import { resolveWall, roomDiagnostics, syncRoom } from '../room.js';
import { runSide } from '../runSide.js';

const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };
const warning = (pieceId = 'B') => ({
  code: 'return-covers-face', pieceId,
  message: 'The desk run on Wall 2 · Desk covers this door or drawer front.',
});
let stored;
let host;
let desk;

beforeEach(() => {
  host = run({ id: 'T', cabinetTypeId: CABINET_TYPE_IDS.TALL, width: 95, height: 90,
    autoCount: false, top: 'none',
    ends: { left: { type: 'none' }, right: { type: 'none' } },
    items: [
      { ...fixed('A', 35.125), face: { type: 'open', size: null } },
      { ...fixed('B', 24.875), face: { type: 'pair_door', size: null } },
      { ...fixed('C', 35), face: { type: 'open', size: null } },
    ],
  });
  desk = run({ id: 'R', width: 48, height: 24.5, top: 'wood', autoCount: false,
    anchors: { left: true, right: false }, items: [auto('desk-column')],
  });
  desk.grid.cells[0].node = {
    id: 'desk-column', cols: [{ id: 'desk-col', size: null, sizeMode: 'auto' }],
    rows: [{ id: 'drawers', size: 4, sizeMode: 'manual' }, { id: 'void', size: null, sizeMode: 'auto' }],
    cells: [
      { col: 0, row: 0, colSpan: 1, rowSpan: 1,
        node: { id: 'desk-drawer', kind: 'cabinet', face: { type: 'drawer_front', size: null } } },
      { col: 0, row: 1, colSpan: 1, rowSpan: 1, node: { id: 'desk-void', kind: 'void' } },
    ],
  };
  stored = room({ walls: [wall({ id: 'H', x2: 120, runs: [host] }), wall({
    id: 'W', name: 'Desk', x1: 60, y1: 0, x2: 60, y2: 72, thickness: 0,
    landings: { start: { wallId: 'H', side: 'front', ref: 'left', to: 'near', offset: 60 }, end: null },
    runs: [desk],
  })] });
});

function resolved() {
  const synced = syncRoom(stored, settings);
  const view = resolveWall(synced, synced.walls[0], 'front');
  return { synced, view, run: view.runs[0] };
}

function warnings() {
  const { synced, view, run } = resolved();
  return returnFaceWarnings(synced, view, run, settings);
}

describe('DR4 return covers face warnings', () => {
  it('anchor 1: leaves an open cabinet with a 26 inch bottom reveal clear', () => {
    host.grid.cells[1].node.face = { type: 'open', size: null };
    host.grid.cells[1].node.reveals = { bottom: 26 };
    const { synced, view } = resolved();
    expect(returnExtents(synced, view, settings)).toEqual([
      { wallId: 'W', runId: 'R', left: 35.125, right: 60 },
    ]);
    const returnView = resolveWall(synced, synced.walls[1]);
    const returning = returnView.runs[0];
    expect(cellPieces(returning, layoutRun(synced, returnView, returning, settings)).pieces
      .find(({ role }) => role === 'end-left')).toMatchObject({ z: 24.5, height: 4 });
    expect(runSide(synced, returnView, returning, settings).find(({ piece }) => piece === 'countertop'))
      .toMatchObject({ z: 28.5, height: 1.5 });
    expect(warnings()).toEqual([]);
  });

  it.each([
    ['anchor 2: door ending at the desk bottom', 20.5, 'door', []],
    ['anchor 3: drawer front extending into the desk', 24, 'drawer_front', [warning('lower')]],
  ])('%s', (_name, height, type, expected) => {
    host.grid.cells[1].node = {
      id: 'B', cols: [{ id: 'col', size: null, sizeMode: 'auto' }],
      rows: [{ id: 'upper', size: null, sizeMode: 'auto' }, { id: 'lower', size: height, sizeMode: 'manual' }],
      cells: [
        { col: 0, row: 0, colSpan: 1, rowSpan: 1,
          node: { id: 'upper', kind: 'cabinet', face: { type: 'open', size: null } } },
        { col: 0, row: 1, colSpan: 1, rowSpan: 1,
          node: { id: 'lower', kind: 'cabinet', face: { type, size: null } } },
      ],
    };
    const { synced, view, run } = resolved();
    expect(cellPieces(run, layoutRun(synced, view, run, settings)).pieces.find(({ id }) => id === 'lower'))
      .toMatchObject({ z: 4, height });
    expect(warnings()).toEqual(expected);
  });

  it('anchor 4: warns once on a full-height pair-door cabinet and adds it to diagnostics', () => {
    const before = structuredClone(stored);
    expect(warnings()).toEqual([warning()]);
    expect(roomDiagnostics(stored, settings).T.warnings.filter(({ code }) => code === 'return-covers-face'))
      .toEqual([warning()]);
    expect(roomDiagnostics(stored, settings).T.errors).toEqual([]);
    expect(stored).toEqual(before);
  });

  it('anchor 5: still warns once when the return filler is full height', () => {
    desk.ends.left.height = 'full';
    expect(warnings()).toEqual([warning()]);
    // The full-height end itself covers a door below the drawer bank.
    host.grid.cells[1].node.face = { type: 'door', size: null };
    host.grid.cols[1].top = { value: 70, source: 'manual' };
    expect(warnings()).toEqual([warning()]);
    desk.ends.left.height = 'cabinets';
    expect(warnings()).toEqual([]);
  });

  it('anchor 6: leaves doors on only the adjacent x 60–95 column clear', () => {
    host.grid.cells[1].node.face = { type: 'open', size: null };
    host.grid.cells[2].node.face = { type: 'pair_door', size: null };
    expect(warnings()).toEqual([]);
  });

  it('uses the top band and requires more than 1/64 inch overlap in both directions', () => {
    const item = host.grid.cells[1].node;
    item.face = { type: 'door', size: null };
    const { synced, view, run } = resolved();
    const face = runFaceLayouts(synced, view, run, settings).get('B').faces[0];
    // Translate the resolved face bottom into the top band alone, including its real reveal.
    host.z += 29 - face.z;
    expect(warnings()).toEqual([warning()]);
    host.z += 1 - 1 / 64;
    expect(warnings()).toEqual([]);
    host.z -= 1 / 64;
    expect(warnings()).toEqual([warning()]);
    host.z = 4;
    // Test sub-sixteenth x overlaps directly; syncRoom rounds run placement to sixteenths.
    run.x = 60 - face.x - 1 / 64;
    expect(returnFaceWarnings(synced, view, run, settings)).toEqual([]);
    run.x -= 1 / 64;
    expect(returnFaceWarnings(synced, view, run, settings)).toEqual([warning()]);
  });

  it('checks every door action but ignores false fronts, panels and open faces', () => {
    for (const action of ['swing', 'flipper', 'pocket', 'sliding', 'pullout']) {
      host.grid.cells[1].node.face = { type: 'door', action, size: null };
      expect(warnings(), action).toEqual([warning()]);
    }
    for (const type of ['false_front', 'panel', 'open']) {
      host.grid.cells[1].node.face = { type, size: null };
      expect(warnings(), type).toEqual([]);
    }
  });

  it('uses only the host-end column after steps and ignores voids and other columns', () => {
    desk.top = 'none';
    desk.ends = { left: { type: 'none' }, right: { type: 'none' } };
    desk.grid.cols.push({ id: 'other-col', size: null, sizeMode: 'auto' });
    desk.grid.cells.push({ col: 1, row: 0, colSpan: 1, rowSpan: 1,
      node: { ...auto('other-column'), bottom: { value: 0, source: 'manual' } } });
    host.height = 16;
    expect(warnings()).toEqual([]);
    desk.grid.cols[0].bottom = { value: 5, source: 'manual' };
    desk.grid.cols[0].top = { value: 2, source: 'manual' };
    host.height = 90;
    const { synced, view, run } = resolved();
    const face = runFaceLayouts(synced, view, run, settings).get('B').faces[0];
    host.z += 27 - face.z;
    expect(warnings()).toEqual([]);
    host.z -= 1;
    expect(warnings()).toEqual([warning()]);
  });

  it('finds a return whose right end is anchored into the host', () => {
    Object.assign(stored.walls[1], {
      y1: 72, y2: 0,
      landings: { start: null, end: stored.walls[1].landings.start },
    });
    desk.x = 24;
    desk.anchors = { left: false, right: true };
    host.grid.cols[0].size = 60;
    host.width = 119.875;
    expect(warnings()).toEqual([warning()]);
    const returning = stored.walls[1].runs[0];
    returning.top = 'none';
    returning.ends.right.height = 'full';
    host.grid.cols[1].top = { value: 70, source: 'manual' };
    expect(warnings()).toEqual([warning()]);
    returning.ends.right.height = 'cabinets';
    expect(warnings()).toEqual([]);
  });

  it('excludes unanchored returns, opposite host faces and connected-corner walls', () => {
    desk.anchors.left = false;
    expect(warnings()).toEqual([]);
    desk.anchors.left = true;
    host.wallSide = 'back';
    expect(roomDiagnostics(stored, settings).T.warnings.filter(({ code }) => code === 'return-covers-face'))
      .toEqual([]);
    delete host.wallSide;
    stored.walls[0].connections.end = { wallId: 'W', endpoint: 'start' };
    Object.assign(stored.walls[1], {
      x1: 120, x2: 120, landings: { start: null, end: null },
      connections: { start: { wallId: 'H', endpoint: 'end' }, end: null },
    });
    expect(warnings()).toEqual([]);
  });
});
