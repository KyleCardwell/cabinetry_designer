import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { setGridBlind } from '../grid.js';
import { resolveWall, syncRoom } from '../room.js';
import { waterfallEnds } from '../runBands.js';
import { runScene } from '../runScene.js';
import { topOverhangs } from '../topOverhang.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const settings = DEFAULT_SETTINGS;
const room = { profile: {} };
const run = {
  id: 'base', cabinetTypeId: CABINET_TYPE_IDS.BASE,
  x: 30, width: 36, depth: 24, z: 4, height: 30.5, style: 'euro',
  ends: { left: { type: 'none' }, right: { type: 'none' } },
  anchors: { left: false, right: false },
  top: 'stone', overrides: { countertopThickness: 1.5 }, waterfall: { left: {} },
};
const wall = { profile: {}, runs: [run] };

describe('SPEC-50.10 step 504 effective waterfall ends', () => {
  it('enables a free stone end with zero default side overhang (anchor 1), retaining typed overhangs', () => {
    expect(waterfallEnds(room, wall, run, settings))
      .toEqual({ left: { baseToLeg: false }, right: null, warnings: [] });
    expect(topOverhangs(room, wall, run, settings))
      .toEqual({ front: 0.75, back: 0, left: 0, right: 0.75 });
    const both = { ...run, top: 'wood', waterfall: { left: {}, right: { baseToLeg: true } },
      topOverhang: { left: 2, front: 1, back: 0.5 } };
    expect(waterfallEnds(room, wall, both, settings))
      .toEqual({ left: { baseToLeg: false }, right: { baseToLeg: true }, warnings: [] });
    expect(topOverhangs(room, wall, both, settings))
      .toEqual({ front: 1, back: 0.5, left: 2, right: 0 });
    expect(waterfallEnds(room, wall, { ...run, top: undefined }, settings).left)
      .toEqual({ baseToLeg: false });
    const paneled = { ...run, ends: { ...run.ends, left: { type: 'end_panel' } } };
    expect(waterfallEnds(room, wall, paneled, settings).left).toEqual({ baseToLeg: false });
  });

  it('ignores a wall-anchored pick (anchor 2), recesses, corners, and touching runs with a side warning', () => {
    for (const side of ['left', 'right']) {
      const picked = { ...run, waterfall: { [side]: {} } };
      const blocked = { left: null, right: null,
        warnings: [{ code: 'waterfall-end-blocked', runId: run.id, side }] };
      // FX4 b: `true` at an open wall end is free now (openWallEnd.test.js covers it).
      for (const anchor of [{ to: 'wall' }, { to: 'recess', recessId: 'r1' }]) {
        const anchored = { ...picked, anchors: { ...run.anchors, [side]: anchor } };
        expect(waterfallEnds(room, wall, anchored, settings)).toEqual(blocked);
        expect(topOverhangs(room, wall, anchored, settings)[side]).toBe(0.75);
      }
      for (const [height, depth, top] of [[30.5, 24, 'stone'], [80, 24, 'crown'], [20, 12, 'wood'], [30.5, 30, 'stone']]) {
        const neighbor = { ...run, id: 'neighbor', height, depth, top,
          x: side === 'left' ? 0 : 66, width: 30 };
        expect(waterfallEnds(room, { ...wall, runs: [picked, neighbor] }, picked, settings))
          .toEqual(blocked);
        // A gap, or no overlap in height, leaves this countertop's end free.
        for (const separate of [{ ...neighbor, x: neighbor.x + (side === 'left' ? -1 : 1) },
          { ...neighbor, z: 40 }]) {
          expect(waterfallEnds(room, { ...wall, runs: [picked, separate] }, picked, settings)[side])
            .toEqual({ baseToLeg: false });
        }
      }
    }
    // A blind panel can close the band even without a blocking anchor on this run.
    const document = normalizeElevationDocument(JSON.parse(readFileSync(
      new URL('./fixtures/golden.json', import.meta.url), 'utf8',
    )));
    const kitchen = syncRoom(document.rooms.find((candidate) => candidate.name === 'G1 Euro kitchen'), document.settings);
    const view = resolveWall(kitchen, kitchen.walls[0], 'front');
    const blind = view.runs.find((candidate) => candidate.id.startsWith('b822e8ac'));
    blind.anchors = { left: false, right: false };
    blind.ends.right = { type: 'blind', width: 3 };
    blind.grid = setGridBlind(blind.grid, 'right', 36);
    blind.waterfall = { right: {} };
    view.runs = [blind];
    kitchen.walls[1].runs.find((candidate) => candidate.cabinetTypeId === CABINET_TYPE_IDS.BASE).height = 20;
    expect(runScene(kitchen, view, blind, document.settings).panelBySide.right).not.toBeNull();
    expect(waterfallEnds(kitchen, view, blind, document.settings)).toEqual({ left: null, right: null,
      warnings: [{ code: 'waterfall-end-blocked', runId: blind.id, side: 'right' }] });
    expect(topOverhangs(kitchen, view, blind, document.settings).right).toBe(0.75);
  });

  it('ignores waterfalls without warnings for crown (anchor 3) and other non-countertops', () => {
    for (const top of ['crown', 'topMold', 'none']) {
      expect(waterfallEnds(room, wall, { ...run, top, anchors: { left: true } }, settings))
        .toEqual({ left: null, right: null, warnings: [] });
      expect(topOverhangs(room, wall, { ...run, top }, settings).left).toBe(0.75);
    }
    expect(waterfallEnds(room, wall, { ...run, waterfall: undefined }, settings))
      .toEqual({ left: null, right: null, warnings: [] });
  });
});
