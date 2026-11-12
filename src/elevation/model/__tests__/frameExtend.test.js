import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { shippingList } from '../../../reports/shippingList.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { effectiveSettings } from '../effectiveSettings.js';
import { frameMembers, frameRegions, regionOpenings } from '../frames.js';
import { syncRoom } from '../room.js';
import { runScene } from '../runScene.js';

describe('extended face frame ends', () => {
  it.each([
    ['both stiles reach the floor', 'both'],
    ['only the left stile reaches the floor', 'left'],
    ['shipping uses the full extended height', 'shipping'],
    ['the notched frame covers the extended span without a rectangle warning', 'warning'],
  ])('%s (CC9.1)', (_, check) => {
    const source = JSON.parse(readFileSync(new URL('./fixtures/room8cc.json', import.meta.url), 'utf8'));
    source.style = { cabinetStyleId: 14 };
    const sourceWall = source.walls.find(({ name }) => name === 'Wall 2');
    const sourceRun = sourceWall.runs.find(({ id }) => id.startsWith('4254454f-'));
    if (check === 'left') delete sourceRun.ends.right.extend;
    const settings = effectiveSettings({ settings: { ...DEFAULT_SETTINGS } }, source);
    const room = syncRoom(source, settings);
    const wall = room.walls.find(({ id }) => id === sourceWall.id);
    const run = wall.runs.find(({ id }) => id === sourceRun.id);
    const scene = runScene(room, wall, run, settings);
    const region = scene.frames.regions.find(({ id }) => id.startsWith('frame:def96f42-'));
    if (check === 'both' || check === 'left') {
      expect(region).toMatchObject({ x: 0, z: 0, width: 40.75, height: 102 });
      expect(region.notches).toEqual([
        { edge: 'bottom', x: 4.75, z: 0, width: check === 'left' ? 36 : 34.5, height: 72 },
      ]);
      const members = frameMembers(region, regionOpenings(region, scene.faceLayouts));
      if (check === 'both') {
        expect(members).toEqual([
          { kind: 'stile', x: 0, z: 0, width: 4.75, height: 102 },
          { kind: 'stile', x: 39.25, z: 0, width: 1.5, height: 102 },
          { kind: 'rail', x: 4.75, z: 72, width: 34.5, height: 1.5 },
          { kind: 'rail', x: 4.75, z: 100.5, width: 34.5, height: 1.5 },
        ]);
        expect(frameRegions(room, run, scene.cells, settings).regions.find(({ id }) => id === region.id))
          .toEqual(region);
      } else {
        // The existing notch-to-edge cut makes the short right member a mullion between the rails.
        expect(members).toEqual([
          { kind: 'stile', x: 0, z: 0, width: 4.75, height: 102 },
          { kind: 'rail', x: 4.75, z: 72, width: 36, height: 1.5 },
          { kind: 'rail', x: 4.75, z: 100.5, width: 36, height: 1.5 },
          { kind: 'mullion', x: 39.25, z: 73.5, width: 1.5, height: 27 },
        ]);
      }
    } else if (check === 'shipping') {
      const row = shippingList(room, settings).rows.find(({ key }) => key === region.id);
      expect(row.size).toBe('40 3/4 x 102 x 13/16');
      expect(row.notes.some((note) => note.includes('4 3/4" left stile'))).toBe(true);
    } else {
      expect(scene.frames.warnings.filter(({ code }) => code === 'frame-not-rectangle')).toEqual([]);
    }
  });
});
