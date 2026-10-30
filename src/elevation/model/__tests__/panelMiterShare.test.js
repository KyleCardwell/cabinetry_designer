import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { attach, auto, fixed, line, room, run, wall } from '../../../test/builders.js';
import { setGridCellKind, setGridTrackSize } from '../cellTree.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { resolveWall, syncRoom } from '../room.js';
import { runScene } from '../runScene.js';
import { splitRun } from '../splitRun.js';
import { toRoomDocument } from '../../store/persistence.js';

const BACK = 'c3e90115-6035-4641-b50b-a0b5ba4079dc';
const LEFT = 'a23ef60a-20d0-4490-9598-768dcfd2c75d';
const RIGHT = 'e5806f5c-00bc-43f1-aab0-110d1f1f3ddd';
const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };
const backRun = (source) => source.walls.flatMap(({ runs }) => runs).find(({ id }) => id === BACK);
const rows = (pieces) => pieces.filter(({ kind }) => kind === 'panel').map(({ id, x, width }) => [id, x, width]);

function room9b(edit = () => {}) {
  const source = JSON.parse(readFileSync(new URL('./fixtures/room9b.json', import.meta.url), 'utf8'));
  const sourceWall = source.walls.find(({ runs }) => runs.some(({ id }) => id === BACK));
  edit(backRun(source), sourceWall);
  const using = { ...settings, ...source.settingsOverrides };
  const synced = syncRoom(source, using);
  const view = resolveWall(synced, synced.walls.find(({ id }) => id === sourceWall.id), 'back');
  const back = backRun(synced);
  return { synced, back, using, scene: runScene(synced, view, back, using) };
}

describe('FX5 mitered auto panel sharing', () => {
  it('anchor 1: shares Room 9b Wall 4 including the left miter, with the last auto taking the remainder', () => {
    const { synced, back, using, scene } = room9b();
    expect(back._panelMiters).toEqual({ left: 0.8125, right: 0 });
    expect(rows(scene.drawnPieces)).toEqual([[LEFT, 0, 30.125], [RIGHT, 30.125, 30.0625]]);
    expect(rows(scene.result.pieces)).toEqual([[LEFT, 0.8125, 29.3125], [RIGHT, 30.125, 30.0625]]);
    expect(syncRoom(synced, using)).toEqual(synced);
  });

  it('anchor 2: keeps a typed right panel at 20 and gives the left auto the remaining drawn span', () => {
    const { scene } = room9b((back) => {
      back.grid = setGridTrackSize(back.grid, back.grid.cols[1].id, 20);
    });
    expect(rows(scene.drawnPieces)).toEqual([[LEFT, 0, 40.1875], [RIGHT, 40.1875, 20]]);
  });

  it('anchor 3: keeps the left typed in-run width at 30 and adds its miter only when drawn', () => {
    const { scene } = room9b((back) => {
      back.grid = setGridTrackSize(back.grid, back.grid.cols[0].id, 30);
    });
    expect(rows(scene.drawnPieces)).toEqual([[LEFT, 0, 30.8125], [RIGHT, 30.8125, 29.375]]);
    expect(scene.result.pieces.find(({ id }) => id === LEFT).width).toBe(30);
  });

  it('anchor 4: a butt wall end panel leaves the original in-run sharing', () => {
    const { back, scene } = room9b((back, sourceWall) => {
      sourceWall.endPanels.end.frame = 'butt';
    });
    expect(back).not.toHaveProperty('_panelMiters');
    expect(rows(scene.drawnPieces)).toEqual([[LEFT, 0.8125, 29.6875], [RIGHT, 30.5, 29.6875]]);
  });

  it('anchor 5: preserves the island fixture without a wall end panel', () => {
    const wood = { top: 'wood', autoCount: false,
      ends: { left: { type: 'none' }, right: { type: 'none' } } };
    const source = room({ walls: [wall({ id: 'island', x2: 96, thickness: 0, runs: [
      run({ ...wood, id: 'front', width: 96, items: [auto('cabinet')] }),
      run({ ...wood, id: 'back', width: 96, depth: 0.75, wallSide: 'back',
        items: [{ ...auto('back-panel'), kind: 'panel', depth: 0.75, align: 'back' }] }),
    ] })] });
    const synced = syncRoom(source, settings);
    const view = resolveWall(synced, synced.walls[0], 'back');
    expect(view.runs[0]).not.toHaveProperty('_panelMiters');
    expect(rows(runScene(synced, view, view.runs[0], settings).drawnPieces))
      .toEqual([['back-panel', 0, 96]]);
    expect(synced.walls[0].runs.map(({ x, width, depth }) => [x, width, depth]))
      .toEqual([[0, 96, 24], [0, 96, 0.75]]);
  });

  it('shares both end miters, including when one auto item touches both ends', () => {
    for (const count of [1, 2]) {
      const source = room({ walls: [wall({ x2: 61.5, thickness: 0,
        endPanels: { start: { width: 0.75, frame: 'miter' }, end: { width: 0.75, frame: 'miter' } },
        runs: [run({ x: 0.75, width: 60, autoCount: false, anchors: { left: true, right: true },
          ends: { left: { type: 'none' }, right: { type: 'none' } },
          items: Array.from({ length: count }, (_, i) => ({ ...auto(`p${i}`), kind: 'panel', depth: 0.75 })),
        })],
      })] });
      const synced = syncRoom(source, settings);
      const view = resolveWall(synced, synced.walls[0], 'front');
      expect(view.runs[0]._panelMiters).toEqual({ left: 0.75, right: 0.75 });
      expect(rows(runScene(synced, view, view.runs[0], settings).drawnPieces))
        .toEqual(count === 1 ? [['p0', 0, 61.5]] : [['p0', 0, 30.75], ['p1', 30.75, 30.75]]);
    }
  });

  it('strips derived miters from saved rooms and removes stale miters after a butt or cabinet edit', () => {
    const { synced, using } = room9b();
    expect(backRun(toRoomDocument(synced))).not.toHaveProperty('_panelMiters');
    const butted = structuredClone(synced);
    butted.walls.find(({ runs }) => runs.some(({ id }) => id === BACK)).endPanels.end.frame = 'butt';
    expect(backRun(syncRoom(butted, using))).not.toHaveProperty('_panelMiters');
    const cabinets = structuredClone(synced);
    backRun(cabinets).grid = setGridCellKind(backRun(cabinets).grid, LEFT, 'cabinet');
    expect(backRun(syncRoom(cabinets, using))).not.toHaveProperty('_panelMiters');
    expect(synced.walls.flatMap(({ runs }) => runs).filter(({ id }) => id !== BACK)
      .every((candidate) => !Object.hasOwn(candidate, '_panelMiters'))).toBe(true);
  });

  it('uses only the real outer miter on each pinned end segment', () => {
    // A nested panel grid is a pinnable root item while every leaf remains a panel.
    const nested = run({ id: 'pinned', items: [{ ...auto('nested-panel'), kind: 'panel', depth: 0.75 }] }).grid;
    const source = run({ x: 0.8125, width: 120, autoCount: false, anchors: { left: true, right: true },
      ends: { left: { type: 'none' }, right: { type: 'none' } },
      items: [
        { ...auto('p0'), kind: 'panel', depth: 0.75 },
        { ...auto('p1'), kind: 'panel', depth: 0.75 },
        { ...fixed('pinned', 24), grid: nested, attach: attach('P') },
        { ...auto('p2'), kind: 'panel', depth: 0.75 },
        { ...auto('p3'), kind: 'panel', depth: 0.75 },
      ],
    });
    const synced = syncRoom(room({ walls: [wall({ x2: 121.625, thickness: 0, lines: [line('P', 60.8125)],
      endPanels: { start: { width: 0.8125, frame: 'miter' }, end: { width: 0.8125, frame: 'miter' } },
      runs: [source],
    })] }), settings);
    const view = resolveWall(synced, synced.walls[0], 'front');
    const back = view.runs[0];
    expect(back._panelMiters).toEqual({ left: 0.8125, right: 0.8125 });
    const result = splitRun(back, settings, { pinTargets: { [nested.id]: 60.8125 } });
    expect(result.errors).toEqual([]);
    expect(rows(result.pieces)).toEqual([
      ['p0', 0.8125, 23.625], ['p1', 24.4375, 24.375], ['p2', 72.8125, 24.4375], ['p3', 97.25, 23.5625],
    ]);
    expect(result.pieces.find(({ id }) => id === nested.id)).toMatchObject({ x: 48.8125, width: 24 });
    expect(rows(runScene(synced, view, back, settings).drawnPieces)).toEqual([
      ['p0', 0, 24.4375], ['p1', 24.4375, 24.375], ['nested-panel', 48.8125, 24],
      ['p2', 72.8125, 24.4375], ['p3', 97.25, 24.375],
    ]);
  });
});
