import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { elevationParts } from '../elevationParts.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);
const room = (name) => syncRoom(stored(name), settings);
const partsOf = (synced, wallIndex, side = 'front') => elevationParts(synced, synced.walls[wallIndex], side, settings);
const notFaces = (parts) => parts.filter((part) => part.kind !== 'face' && part.kind !== 'shelf');
const row = ({ id, kind, x, z, width, height, back, front, coversBoxEdges }) => (
  [id, kind, x, z, width, height, back, front, coversBoxEdges]
);
const byId = (parts, id) => parts.find((part) => part.id === id);

const TALL = 'b38f2f11-5318-42f2-9d95-8b9b3d1b9087';
const BASE = 'b822e8ac-1a44-47ca-acec-ecb93caf7b8a';
const UPPER = '434f1164-3b6b-4a97-89e7-1c6438c4d95a';

describe('SPEC-41 elevation parts', () => {
  it('lists each run\'s boxes, then its fillers and panels, with their plan depths (G1 elevation A)', () => {
    const parts = notFaces(partsOf(room('G1 Euro kitchen'), 0));
    expect(parts.map(row)).toEqual([
      ['28072a7d-e691-40d1-a005-4d0ed1c9e825', 'cabinet', 0.75, 4, 28.5, 86, 0, 25, false],
      [`${TALL}:left`, 'end_panel', 0, 4, 0.75, 86, 0, 25.875, false],
      [`${TALL}:right`, 'end_panel', 29.25, 4, 0.75, 86, 0, 25.875, false],
      ['cfc9c904-3a11-43ee-a48d-88bef061b5ae', 'cabinet', 30, 4, 24, 30.5, 0, 24, false],
      ['0f652c26-5f80-4387-8a1b-1f35ada26b59', 'cabinet', 54, 4, 36, 30.5, 0, 24, false],
      ['0624c9d5-b951-4191-95f2-1562a6b32343', 'cabinet', 90, 4, 25.5, 30.5, 0, 24, false],
      ['e3bfb331-0a5d-4cf2-aaba-929c53ca8c54', 'cabinet', 115.5, 4, 25.5, 30.5, 0, 24, false],
      [`${BASE}:right`, 'filler', 141, 4, 2.125, 30.5, 24.0625, 24.875, true],
      ['ae7626bb-d1e5-4396-8b5b-a8630bfed949', 'cabinet', 109.25, 54, 22, 36, 0, 12, false],
      ['2dc1a45e-c462-4c4a-99f3-65c8b6782a2a', 'cabinet', 131.25, 54, 22, 36, 0, 12, false],
      [`${UPPER}:left`, 'end_panel', 108.5, 53.875, 0.75, 36.125, 0, 12.875, false],
      [`${UPPER}:right`, 'filler', 153.25, 53.875, 1.875, 36.125, 12.0625, 12.875, true],
    ]);
    expect(parts[0]).toEqual({
      id: '28072a7d-e691-40d1-a005-4d0ed1c9e825', kind: 'cabinet', runId: TALL,
      x: 0.75, z: 4, width: 28.5, height: 86, back: 0, front: 25, coversBoxEdges: false,
    });
  });

  it('draws a face frame with its openings as holes and puts its mitered end panels behind it (G2 elevation A)', () => {
    const parts = notFaces(partsOf(room('G2 Face frame kitchen'), 0));
    expect(parts.filter((part) => part.kind === 'frame')).toHaveLength(3);
    expect(byId(parts, 'frame:352bd8c0-79a1-4210-a428-cfe95038118f')).toEqual({
      id: 'frame:352bd8c0-79a1-4210-a428-cfe95038118f', kind: 'frame', runId: 'a42e9a57-a98f-47f0-b6b4-9076b513db6e',
      x: 50, z: 4, width: 26.5, height: 86, back: 25, front: 25.8125, coversBoxEdges: true,
      holes: [
        { x: 51.75, z: 5.75, width: 23, height: 61.25 },
        { x: 51.75, z: 69, width: 23, height: 19.25 },
      ],
    });
    // Mitered end panels sit behind the frame (front = the frame's back).
    expect(row(byId(parts, 'a42e9a57-a98f-47f0-b6b4-9076b513db6e:left')))
      .toEqual(['a42e9a57-a98f-47f0-b6b4-9076b513db6e:left', 'end_panel', 50, 4, 0.75, 86, 0, 25, false]);
    expect(row(byId(parts, '860a1197-d14f-4fc2-9499-2d44cd1d8fa3:left')))
      .toEqual(['860a1197-d14f-4fc2-9499-2d44cd1d8fa3:left', 'end_panel', 76.5, 4, 0.75, 30.5, 0, 24, false]);
    // A framed box is its narrowed box; a filler in the frame is stile, not a part.
    expect(row(byId(parts, 'b736ca24-6df8-41d5-88bc-416dbd85eab3')))
      .toEqual(['b736ca24-6df8-41d5-88bc-416dbd85eab3', 'cabinet', 77.5, 4, 34, 30.5, 0, 24, false]);
    expect(byId(parts, '860a1197-d14f-4fc2-9499-2d44cd1d8fa3:right')).toBeUndefined();
    expect(byId(parts, 'ab0981ca-8621-45ba-a924-dbe318646f67:right')).toBeUndefined();
  });

  it('T-fillers and L end panels cover box edges; a horizontal T is a T thickness off the box fronts (G4)', () => {
    const parts = notFaces(partsOf(room('G4 T-filler run'), 0));
    const run = '738c73a7-adda-40e0-bca9-a881403c1ffa';
    expect(parts.map(({ kind }) => kind)).toEqual([
      'cabinet', 'cabinet', 'cabinet', 'cabinet', 'end_panel', 'filler', 'filler', 'filler', 'filler',
    ]);
    expect(row(byId(parts, `${run}:left`))).toEqual([`${run}:left`, 'end_panel', 13, 4, 1.5, 86, 0, 24.8125, true]);
    expect(row(byId(parts, `${run}:right`))).toEqual([`${run}:right`, 'filler', 118, 4, 2, 86, 24, 24.8125, true]);
    const seam = 'tee:36718dec-9ae3-48e7-bce7-f3d95d207a1c|0e8d791b-a3a5-4fe6-8b08-a1b8e954b8ba';
    expect(row(byId(parts, seam))).toEqual([seam, 'filler', 48, 4, 1.5, 86, 24, 24.8125, true]);
    const flat = 'tee:h:87b307e7-2f67-48a7-a80e-a52d4249d55b|0e8d791b-a3a5-4fe6-8b08-a1b8e954b8ba';
    expect(row(byId(parts, flat))).toEqual([flat, 'filler', 49.5, 63.25, 33.5, 1.5, 24, 24.8125, true]);
  });

  it('a part the plan doesn\'t draw spans its run from the back to the run\'s front (G3 top panel)', () => {
    const parts = notFaces(partsOf(room('G3 Bath alcove'), 1));
    expect(row(byId(parts, 'fbe04e96-9442-4fcd-aafa-b8d49960a63d')))
      .toEqual(['fbe04e96-9442-4fcd-aafa-b8d49960a63d', 'panel', 0.75, 77.25, 70.5, 0.75, 0, 24, false]);
    expect(row(byId(parts, '5f4db696-00e1-4303-9881-23a4d8ae7a64')))
      .toEqual(['5f4db696-00e1-4303-9881-23a4d8ae7a64', 'panel', 0.75, 36, 70.5, 41.25, 0, 0.75, false]);
  });

  it('faces: a door sits a bumper off its box; an inset door is flush with its frame', () => {
    const g1 = partsOf(room('G1 Euro kitchen'), 0);
    expect(g1).toHaveLength(23);
    expect(g1.filter((part) => part.kind === 'face')).toHaveLength(11);
    expect(g1.filter((part) => part.kind === 'face').slice(0, 2).map(row)).toEqual([
      ['28072a7d-e691-40d1-a005-4d0ed1c9e825:rleft', 'face', 0.8125, 4.125, 14.125, 85.75, 25.0625, 25.875, true],
      ['28072a7d-e691-40d1-a005-4d0ed1c9e825:rright', 'face', 15.0625, 4.125, 14.125, 85.75, 25.0625, 25.875, true],
    ]);
    const g2 = partsOf(room('G2 Face frame kitchen'), 0);
    expect(g2).toHaveLength(27);
    expect(row(byId(g2, '352bd8c0-79a1-4210-a428-cfe95038118f:rleft')))
      .toEqual(['352bd8c0-79a1-4210-a428-cfe95038118f:rleft', 'face', 51.75, 5.75, 11.5, 61.25, 25, 25.8125, true]);
  });

  it('shelves: the back panel at the back of its cell, each shelf in front of it', () => {
    const top = '87b307e7-2f67-48a7-a80e-a52d4249d55b';
    const copy = structuredClone(stored('G4 T-filler run'));
    copy.walls[0].runs[0].grid.cells[1].node.cells[0].node = { id: top, kind: 'shelves', shelves: { count: 1, back: true } };
    const synced = syncRoom(copy, settings);
    const parts = partsOf(synced, 0);
    expect(parts.filter((part) => part.id.startsWith(`${top}:`)).map(row)).toEqual([
      [`${top}:back`, 'panel', 48.75, 64, 35, 26, 0, 0.75, false],
      [`${top}:shelf-1`, 'shelf', 48.75, 76.25, 35, 1.5, 0.75, 24, false],
    ]);
    expect(byId(parts, top)).toBeUndefined();
  });

  it('a chip line rides on each end panel and filler when the doors stop flush above a part (SPEC-42)', () => {
    const copy = structuredClone(stored('G6 Stacked runs'));
    copy.walls[1].runs.find(({ id }) => id.startsWith('ea4373b3')).bottom[0].doors = 'flush';
    const parts = partsOf(syncRoom(copy, settings), 1);
    const upper = 'ea4373b3-87f2-4f39-a7cc-2c829c839832';
    expect(byId(parts, `${upper}:left`).lines).toEqual([{ x1: 0, z1: 55.625, x2: 2.75, z2: 55.625 }]);
    expect(byId(parts, `${upper}:right`).lines).toEqual([{ x1: 100.25, z1: 55.625, x2: 101, z2: 55.625 }]);
    expect(partsOf(room('G6 Stacked runs'), 1).some((part) => 'lines' in part)).toBe(false);
  });
});
