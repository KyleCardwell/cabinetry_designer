import { describe, expect, it } from 'vitest';
import { attach, auto, line, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { runItems } from '../grid.js';
import { syncRoom } from '../room.js';
import { runScene } from '../runScene.js';
import { isRoom } from '../../store/persistence.js';
import { stackedColumn } from './fixtures/pinnedColumn.js';

const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };

// LL4: wall-end pins became layout lines; same positions.
describe('DR3a stacked columns on a layout line', () => {
  it.each([
    ['anchor 1: no line', null, 40, 40, 80, 40],
    ['anchor 2: center at 50', [50, 'center'], 30, 30, 70, 50],
    ['anchor 3: left at 20', [20, 'left'], 20, 20, 60, 60],
  ])('%s', (_label, onLine, bx, aWidth, cx, cWidth) => {
    const columnAttach = onLine ? attach('P', onLine[1]) : undefined;
    const source = run({
      autoCount: false, style: { cabinetStyleId: 13 },
      ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
      items: [auto('A'), { ...auto('B'), grid: structuredClone(stackedColumn), attach: columnAttach }, auto('C')],
    });
    const lines = onLine ? [line('P', onLine[0])] : [];
    const synced = syncRoom(room({ walls: [wall({ length: 120, x2: 120, lines, runs: [source] })] }), settings);
    const currentWall = synced.walls[0];
    const currentRun = currentWall.runs[0];
    const scene = runScene(synced, currentWall, currentRun, settings);
    expect(scene.result.pieces.map(({ id, x, width }) => ({ id, x, width }))).toEqual([
      { id: 'A', x: 0, width: aWidth },
      { id: 'B', x: bx, width: 40 },
      { id: 'C', x: cx, width: cWidth },
    ]);
    for (const id of ['B-top', 'B-bottom']) {
      expect(scene.cells.pieces.find((piece) => piece.id === id)).toMatchObject({ x: bx, width: 40, columnId: 'B' });
    }
    expect(scene.cells.pieces.find(({ id }) => id === 'B-top').height).toBe(6);
    expect(scene.result.errors).toEqual([]);
    expect(scene.result.warnings.some(({ code }) => code === 'pin-unreachable')).toBe(false);
    expect(runItems(currentRun)[1].attach).toEqual(columnAttach);
    expect(currentRun.grid.cols[1].attach).toEqual(columnAttach);
    expect(isRoom(synced)).toBe(true);
  });
});
