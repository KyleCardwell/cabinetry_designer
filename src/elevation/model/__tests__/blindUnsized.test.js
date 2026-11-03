import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { blindEntries, blindPartWidths } from '../blind.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { runScene } from '../runScene.js';
import { syncRoom } from '../room.js';

const S = { ...DEFAULT_SETTINGS, cornerFillerMinWidth: 2 };

function room10bt({ shortReturn = false, blank = false } = {}) {
  const source = JSON.parse(readFileSync(new URL('./fixtures/room10bt.json', import.meta.url), 'utf8'));
  if (shortReturn) {
    source.walls[2].runs[0].height = 60;
    source.walls[2].runs[0].heightMode = 'manual';
  }
  if (blank) {
    for (const cell of source.walls[1].runs[0].grid.cells[1].node.cells) delete cell.node.blind;
  }
  const synced = syncRoom(source, S);
  return { synced, wall: synced.walls[1], run: synced.walls[1].runs[0] };
}

describe('FX7 blind panel without a blind width', () => {
  it('anchor 1: keeps the typed-width panel when the return is short', () => {
    const { synced, wall, run } = room10bt({ shortReturn: true });
    const entry = blindEntries(synced, wall, run, S).entries[0];
    expect(entry).toMatchObject({ covered: false, boxWidth: 42, panel: { x: 60.8125, width: 27.1875 } });
    expect(entry.unsized).toBeUndefined();
  });

  it('anchor 2: shows the panel with a blank width and no box extension or box warnings', () => {
    const { synced, wall, run } = room10bt({ shortReturn: true, blank: true });
    const { entries, warnings } = blindEntries(synced, wall, run, S);
    expect(entries[0]).toMatchObject({
      unsized: true, covered: false, boxWidth: 29.5, extension: 0,
      panel: { x: 60.6875, width: 27.3125 },
    });
    expect(warnings).toEqual([]);
    const widths = blindPartWidths(synced, wall, run, S);
    expect(widths.get(entries[0].pieceId)).toBe(29.5);
    expect(widths.get(`${run.id}:right`)).toBe(27.3125);
  });

  it('anchor 3: a covered blank end has no entry, so nothing changes', () => {
    const { synced, wall, run } = room10bt({ blank: true });
    expect(blindEntries(synced, wall, run, S)).toEqual({ entries: [], warnings: [] });
    expect(blindPartWidths(synced, wall, run, S).size).toBe(0);
  });

  it('anchor 4: no Blind sub-label on the blind column while the width is blank', () => {
    for (const shortReturn of [false, true]) {
      const { synced, wall, run } = room10bt({ shortReturn, blank: true });
      const scene = runScene(synced, wall, run, S);
      expect([...scene.subLabels.values()].some((label) => label.startsWith('Blind'))).toBe(false);
    }
    const { synced, wall, run } = room10bt({ shortReturn: true, blank: true });
    const scene = runScene(synced, wall, run, S);
    expect(scene.subLabels.get(`${run.id}:right`)).toBe('Panel 27 5/16"');
  });
});
