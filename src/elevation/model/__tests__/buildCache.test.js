import { expect, it } from 'vitest';
import { auto, room, run, wall } from '../../../test/builders.js';
import { withBuildCache } from '../buildCache.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { resolveWall } from '../room.js';
import { syncRoom } from '../roomSync.js';
import { runScene } from '../runScene.js';
import { roomParts } from '../parts.js';
import { woodTopGroups } from '../woodTopGroups.js';

it.each([
  ['shares a scene within a build', 'hit'],
  ['rebuilds scenes for a copied run or synced room', 'miss'],
  ['builds separate scenes outside a build', 'uncached'],
  ['caches room items by room and settings', roomParts],
  ['caches wood top groups by room and settings', woodTopGroups],
])('%s (GC2)', (_name, mode) => {
  const settings = { ...DEFAULT_SETTINGS };
  const source = syncRoom(room({ walls: [wall({ runs: [run({ items: [auto('cabinet')] })] })] }), settings);
  if (typeof mode === 'function') {
    withBuildCache(() => {
      const first = mode(source, settings);
      expect(mode(source, settings)).toBe(first);
      expect(mode(syncRoom(source, settings), settings)).not.toBe(first);
      expect(mode(source, { ...settings })).not.toBe(first);
    });
    expect(mode(source, settings)).not.toBe(mode(source, settings));
    return;
  }
  const stored = source.walls[0];
  const subject = stored.runs[0];
  const check = () => {
    const first = runScene(source, resolveWall(source, stored, 'front'), subject, settings);
    const second = runScene(source, resolveWall(source, stored, 'front'), subject, settings);
    if (mode === 'hit' || mode === 'miss') expect(second).toBe(first);
    else expect(second).not.toBe(first);
    if (mode === 'miss') {
      expect(runScene(source, resolveWall(source, stored, 'front'), { ...subject }, settings)).not.toBe(first);
      const synced = syncRoom(source, settings);
      expect(runScene(synced, resolveWall(synced, synced.walls[0], 'front'), synced.walls[0].runs[0], settings))
        .not.toBe(first);
    }
  };
  if (mode === 'uncached') check();
  else withBuildCache(check);
});
