import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { resolveWall, syncRoom } from '../room.js';
import { runBands } from '../runBands.js';
import { runScene } from '../runScene.js';

// Room 8 Wall 2: a tall whose bottom cell is open (fridge space), joined on the right to a base.
const stored = JSON.parse(readFileSync(new URL('./fixtures/openBottomTall.json', import.meta.url), 'utf8'));
const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };

function baseToeKick(room) {
  const synced = syncRoom(room, settings);
  const view = resolveWall(synced, synced.walls[1], 'front');
  const run = view.runs.find(({ id }) => id.startsWith('ccaa9395'));
  return runBands(synced, view, run, settings, runScene(synced, view, run, settings)).toeKicks;
}

describe('toe kick beside an open-bottom tall', () => {
  it('stops at the tall\'s end panel when the panel runs to the floor', () => {
    const [toeKick] = baseToeKick(stored);
    expect(toeKick.x).toBeCloseTo(40.75);
  });

  it('ends as a free end when the tall\'s end panel stops at the box', () => {
    const room = structuredClone(stored);
    delete room.walls[1].runs[0].ends.right.extend;
    const [toeKick] = baseToeKick(room);
    expect(toeKick.x).toBeGreaterThan(40.75);
  });
});
