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

/** runBands for every run on one wall face, keyed by the first 8 characters of the run id. */
function bandsOf(room, wallIndex, side = 'front', using = settings) {
  const view = resolveWall(room, room.walls[wallIndex], side);
  return Object.fromEntries(view.runs.map((run) => [
    run.id.slice(0, 8),
    runBands(room, view, run, using, runScene(room, view, run, using)),
  ]));
}
const span = (rect) => rect && [rect.x, rect.width];

describe('SPEC-42 run bands', () => {
  it('gives each run the toe kick, top and moldings the canvas draws today (G1 elevation A)', () => {
    const bands = bandsOf(syncRoom(stored('G1 Euro kitchen'), settings), 0);
    expect(bands.b38f2f11).toEqual({
      top: { kind: 'crown', height: 6 },
      toeKick: { x: 3, z: 0, width: 24, height: 4 },
      countertop: null,
      topMold: { x: 0, z: 90, width: 30, height: 3 },
      crown: { x: 0, z: 91.5, width: 30, height: 4.5 },
      bottomParts: [],
      chipLines: [],
    });
    expect(bands.b822e8ac.toeKick).toEqual({ x: 33, z: 0, width: 107.125, height: 4 });
    expect(bands.b822e8ac.countertop).toEqual({ x: 29, z: 34.5, width: 115.125, height: 1.5 });
    expect([bands.b822e8ac.topMold, bands.b822e8ac.crown]).toEqual([null, null]);
    expect(bands['434f1164'].toeKick).toBeNull();
    expect(span(bands['434f1164'].topMold)).toEqual([108.5, 46.625]);
    expect(span(bands['434f1164'].crown)).toEqual([108.5, 46.625]);
  });

  it('lists the parts below a run; a run held between two others gets no bands (G6)', () => {
    const bands = bandsOf(syncRoom(stored('G6 Stacked runs'), settings), 1);
    expect(bands.ea4373b3.bottomParts).toEqual([{
      id: 'c77d332c-1c0f-46ec-80a7-269fd9db569b', kind: 'bottom_cap', doors: 'visible',
      x: 0, z: 52.5, width: 100.25, height: 1.5,
    }]);
    expect(bands.b1ec1b4a).toEqual({
      top: { kind: 'none', height: 0 },
      toeKick: null,
      countertop: null,
      topMold: null,
      crown: null,
      bottomParts: [],
      chipLines: [],
    });
    expect(bands['01a2a0e1'].top).toEqual({ kind: 'wood', height: 1.5 });
    expect(span(bands['01a2a0e1'].countertop)).toEqual([127.5, 73.5]);
  });

  it('puts a chip line on each end panel and filler when the doors stop flush above a part', () => {
    const copy = structuredClone(stored('G6 Stacked runs'));
    copy.walls[1].runs.find(({ id }) => id.startsWith('ea4373b3')).bottom[0].doors = 'flush';
    const bands = bandsOf(syncRoom(copy, settings), 1);
    expect(bands.ea4373b3.chipLines).toEqual([
      { pieceId: 'ea4373b3-87f2-4f39-a7cc-2c829c839832:left', x1: 0, x2: 2.75, z: 54.125 },
      { pieceId: 'ea4373b3-87f2-4f39-a7cc-2c829c839832:right', x1: 100.25, x2: 101, z: 54.125 },
    ]);
    // Flush doors: the part runs under the end panels.
    expect(span(bands.ea4373b3.bottomParts[0])).toEqual([0, 101]);
  });
});
