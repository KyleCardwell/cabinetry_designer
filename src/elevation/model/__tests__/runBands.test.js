import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bandDepths, runBands } from '../runBands.js';
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
  it('runs a band past a free end by its projection and stops it at a wall or a joined run (G1 elevation A)', () => {
    const bands = bandsOf(syncRoom(stored('G1 Euro kitchen'), settings), 0);
    // The tall: wall on the left; joined on the right to a lower base, so its top returns there.
    expect(bands.b38f2f11).toEqual({
      top: { kind: 'crown', height: 6 },
      toeKick: { x: 0, z: 0, width: 29, height: 4 },
      countertop: null,
      topMold: { x: 0, z: 90, width: 30.25, height: 3 },
      crown: { x: 0, z: 91.5, width: 33, height: 4.5 },
      bottomParts: [],
      chipLines: [],
    });
    // The base: joined to the taller tall on the left, wall on the right.
    expect(bands.b822e8ac.toeKick).toEqual({ x: 29, z: 0, width: 114.125, height: 4 });
    expect(bands.b822e8ac.countertop).toEqual({ x: 30, z: 34.5, width: 113.125, height: 1.5 });
    // The upper: free on the left (end panel), wall on the right.
    expect(span(bands['434f1164'].topMold)).toEqual([108.25, 46.875]);
    expect(span(bands['434f1164'].crown)).toEqual([105.5, 49.625]);
  });

  it('runs a top past a wall end panel; a toe kick stops at the run (G1 island, G2 peninsula)', () => {
    const g1 = syncRoom(stored('G1 Euro kitchen'), settings);
    for (const side of ['front', 'back']) {
      const [island] = Object.values(bandsOf(g1, 3, side));
      expect(span(island.toeKick)).toEqual([0.75, 90]);
      expect(span(island.countertop)).toEqual([-0.75, 93]);
    }
    const g2 = syncRoom(stored('G2 Face frame kitchen'), settings);
    expect(span(bandsOf(g2, 1)['4b49c071'].countertop))
      .toEqual([24.8125, 54.4375]);
    expect(span(bandsOf(g2, 1, 'back')['2c8ab1e3'].countertop)).toEqual([-0.75, 79.25]);
  });

  it('a side of the recess a run sits in closes its ends; a free end with a filler or end panel does not (G5, G6)', () => {
    const g5 = bandsOf(syncRoom(stored('G5 Recess room'), settings), 1);
    expect(span(g5['1549b66c'].countertop)).toEqual([43, 37]);
    expect(span(g5.e9abb5dc.countertop)).toEqual([140, 48]);
    expect(span(g5.e9abb5dc.toeKick)).toEqual([140, 48]);
    const g6 = bandsOf(syncRoom(stored('G6 Stacked runs'), settings), 1);
    expect(span(g6['677ec7a5'].toeKick)).toEqual([0, 100]);
    expect(span(g6['677ec7a5'].countertop)).toEqual([0, 101.75]);
    expect(span(g6['01a2a0e1'].countertop)).toEqual([127.75, 72.25]);
    expect(span(g6.ea4373b3.crown)).toEqual([0, 104]);
  });

  it('reads the shop\'s band depths from settings over the defaults', () => {
    expect(bandDepths(settings)).toEqual({
      toeKickSetback: 3,
      toeKickEndPanelSetback: 1,
      toeKickSideSetback: 0.25,
      countertopOverhang: 0.75,
      topMoldProjection: 0.25,
      crownProjection: 3,
    });
    const wider = { ...settings, bandDepths: { countertopOverhang: 1 } };
    expect(bandDepths(wider).toeKickSetback).toBe(3);
    const g6 = bandsOf(syncRoom(stored('G6 Stacked runs'), wider), 1, 'front', wider);
    expect(span(g6['677ec7a5'].countertop)).toEqual([0, 102]);
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

  it('SPEC-42.1 the deeper of two touching runs returns its band; the shallower meets it there', () => {
    // G2: the 25" tall and the 12" upper share a crown height, so the tall's crown and top mold return
    // past its right side and the upper's start where they stop.
    const g2 = bandsOf(syncRoom(stored('G2 Face frame kitchen'), settings), 0);
    expect(span(g2.a42e9a57.crown)).toEqual([47, 32.5]);
    expect(span(g2.ab0981ca.crown)).toEqual([79.5, 92.5]);
    expect(span(g2.a42e9a57.topMold)).toEqual([49.75, 27]);
    expect(span(g2.ab0981ca.topMold)).toEqual([76.75, 95.25]);
    // G5: the face run is deeper than the recess run it touches; the countertop returns into the recess.
    const g5 = bandsOf(syncRoom(stored('G5 Recess room'), settings), 1);
    expect(span(g5['98b55b5e'].countertop)).toEqual([0, 43]);
    expect(span(g5['1549b66c'].countertop)).toEqual([43, 37]);
  });

  it('SPEC-42.1 a toe kick stops 1" from an end panel and 1/4" from a cabinet side; a shallower toe kick runs on to the deeper one', () => {
    const g1 = syncRoom(stored('G1 Euro kitchen'), settings);
    const a = bandsOf(g1, 0);
    // The tall (deeper) stops 1" short of its right end panel; the base's toe kick runs on to meet it.
    expect(span(a.b38f2f11.toeKick)).toEqual([0, 29]);
    expect(span(a.b822e8ac.toeKick)).toEqual([29, 114.125]);
    // G1 B: a free filler end, 1/4" short.
    expect(span(bandsOf(g1, 1)['4b64d096'].toeKick)).toEqual([24.875, 94.875]);
    const g2 = bandsOf(syncRoom(stored('G2 Face frame kitchen'), settings), 0);
    expect(span(g2.a42e9a57.toeKick)).toEqual([51, 24.5]);
    expect(span(g2['860a1197'].toeKick)).toEqual([75.5, 71.6875]);
  });
});
