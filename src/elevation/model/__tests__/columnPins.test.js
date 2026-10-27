import { describe, expect, it } from 'vitest';
import { auto, pin, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { runItems } from '../grid.js';
import { syncRoom } from '../room.js';
import { runScene } from '../runScene.js';
import { isRoom } from '../../store/persistence.js';
import { stackedColumn } from './fixtures/pinnedColumn.js';

const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };

describe('DR3a stacked column pins', () => {
  it.each([
    ['anchor 1: no pin', null, 40, 40, 80, 40],
    ['anchor 2: center at 50', pin(50), 30, 30, 70, 50],
    ['anchor 3: left at 20', pin(20, { anchor: 'left' }), 20, 20, 60, 60],
  ])('%s', (_label, columnPin, bx, aWidth, cx, cWidth) => {
    const source = run({
      autoCount: false, style: { cabinetStyleId: 13 },
      ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
      items: [auto('A'), { ...auto('B'), grid: structuredClone(stackedColumn), pin: columnPin }, auto('C')],
    });
    const synced = syncRoom(room({ walls: [wall({ length: 120, x2: 120, runs: [source] })] }), settings);
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
    expect(runItems(currentRun)[1].pin).toEqual(columnPin);
    expect(currentRun.grid.cols[1].pin).toEqual(columnPin);
    expect(isRoom(synced)).toBe(true);
  });
});
