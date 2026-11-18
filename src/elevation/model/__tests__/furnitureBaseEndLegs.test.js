import { expect, it } from 'vitest';
import { fixed, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { resolveWall, syncRoom } from '../room.js';
import { freeEdge, runBands } from '../runBands.js';
import { runScene } from '../runScene.js';

it('returns the furniture base at the end panel beside floor end legs (GC6.3)', () => {
  const settings = DEFAULT_SETTINGS;
  for (const [sitsOn, expectedEnd] of [[undefined, 98.3125], ['base', 100.8125]]) {
    const spec = { square: { w: 2.5, d: 2.5 }, height: 'full', x: 0, y: 0,
      ...(sitsOn ? { sitsOn } : {}) };
    const synced = syncRoom(room({
      profile: { baseKind: 'furniture_base', furnitureBaseProud: 0.8125 },
      walls: [wall({ runs: [run({
        width: 100, autoCount: false, items: [fixed('cabinet', 95.875)],
        ends: { left: { type: 'end_panel' }, right: { type: 'end_panel' } },
        endLegs: { right: { legs: 'both', front: spec, back: { ...spec } } },
      })] })],
    }), settings);
    const view = resolveWall(synced, synced.walls[0]);
    const resolved = view.runs[0];
    const scene = runScene(synced, view, resolved, settings);
    const panel = scene.result.pieces.find(({ role }) => role === 'end-right');
    expect(panel.x + panel.width).toBe(97.5);
    expect(freeEdge(synced, view, resolved, 'right', 'furnitureBase', settings)).toBe(expectedEnd);
    const band = runBands(synced, view, resolved, settings, scene).furnitureBases[0];
    expect(band.x + band.width).toBe(expectedEnd);
  }
});
