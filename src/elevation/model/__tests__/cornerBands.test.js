import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runBands } from '../runBands.js';
import { resolveWall, syncRoom } from '../room.js';
import { runScene } from '../runScene.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);

/** runBands for every run on one wall face of a synced room, keyed by the first 8 characters of the run id. */
function bandsOf(room, wallIndex, side = 'front') {
  const view = resolveWall(room, room.walls[wallIndex], side);
  return Object.fromEntries(view.runs.map((run) => [
    run.id.slice(0, 8),
    runBands(room, view, run, settings, runScene(room, view, run, settings)),
  ]));
}
/** A band as [start, end]. */
const ends = (rect) => rect && [rect.x, rect.x + rect.width];

describe('SPEC-42.3 bands meet a corner return\'s bands', () => {
  it('a countertop, top mold and crown stop at the return\'s; a toe kick runs on to meet the return\'s (G1 elevation B)', () => {
    const b = bandsOf(syncRoom(stored('G1 Euro kitchen'), settings), 1);
    // The blind base: wall A's base return has a 25 5/8" countertop and a toe kick 21" out.
    expect(ends(b['4b64d096'].countertop)).toEqual([25.625, 120.75]);
    expect(ends(b['4b64d096'].toeKick)).toEqual([21, 119.75]);
    // The upper: wall A's upper return's top mold is 13 1/8" out, its crown 15 7/8".
    expect(ends(b['4a087225'].topMold)).toEqual([13.125, 120.25]);
    expect(ends(b['4a087225'].crown)).toEqual([15.875, 123]);
  });

  it('works at a right-hand corner and on a face frame run (G1 elevation A, G2)', () => {
    const a = bandsOf(syncRoom(stored('G1 Euro kitchen'), settings), 0);
    expect(ends(a.b822e8ac.countertop)).toEqual([30, 142.375]);
    expect(ends(a.b822e8ac.toeKick)).toEqual([29, 147]);
    expect(ends(a['434f1164'].topMold)).toEqual([108.25, 154.875]);
    expect(ends(a['434f1164'].crown)).toEqual([105.5, 152.125]);
    const g2 = syncRoom(stored('G2 Face frame kitchen'), settings);
    const g2a = bandsOf(g2, 0);
    expect(ends(g2a['860a1197'].countertop)).toEqual([76.5, 146.4375]);
    expect(ends(g2a['860a1197'].toeKick)).toEqual([75.5, 151]);
    // The upper's right corner has no return (the peninsula has no upper): it still stops at the wall.
    expect(ends(g2a.ab0981ca.crown)).toEqual([79.5, 172]);
    const g2b = bandsOf(g2, 1);
    expect(ends(g2b['4b49c071'].countertop)).toEqual([25.5625, 79.25]);
    expect(ends(g2b['4b49c071'].toeKick)).toEqual([21, 77.75]);
  });

  it('matches band by band: a return without that band, or with it at another height, leaves the end as before (G1)', () => {
    const copy = structuredClone(stored('G1 Euro kitchen'));
    copy.walls[0].runs.find(({ id }) => id.startsWith('434f1164')).top = 'topMold';
    copy.walls[0].runs.find(({ id }) => id.startsWith('b822e8ac')).top = 'none';
    const b = bandsOf(syncRoom(copy, settings), 1);
    // The upper return now has a top mold but no crown.
    expect(ends(b['4a087225'].topMold)).toEqual([13.125, 120.25]);
    expect(ends(b['4a087225'].crown)).toEqual([12.875, 123]);
    // The base return has no countertop, but still a toe kick.
    expect(ends(b['4b64d096'].countertop)).toEqual([24.875, 120.75]);
    expect(ends(b['4b64d096'].toeKick)).toEqual([21, 119.75]);
  });

  it('meets a wing wall\'s return the same way (G3)', () => {
    const copy = structuredClone(stored('G3 Bath alcove'));
    const base = structuredClone(copy.walls[1].runs[0]);
    copy.walls[2].runs = [{ ...base, id: 'wing-base', x: 0, width: 24, wallSide: 'front', anchors: { left: true } }];
    const host = bandsOf(syncRoom(copy, settings), 1);
    // The host base is anchored to the wing wall on its right; the wing wall's base returns there.
    expect(ends(host['02c88254'].countertop)).toEqual([0, 49.375]);
    expect(ends(host['02c88254'].toeKick)).toEqual([0, 54]);
    // The host upper has no return beside it.
    expect(ends(host.bcdd4e78.crown)).toEqual([0, 72]);
  });
});
