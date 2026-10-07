import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { planParts } from '../planParts.js';
import { layoutRun } from '../faceLayouts.js';
import { resolveWall, syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);
const WALL_KINDS = ['wall', 'void', 'opening', 'casing', 'recess', 'soffit', 'wall_end_panel'];
const wallThings = (room) => planParts(syncRoom(room, settings), settings)
  .filter(({ kind }) => WALL_KINDS.includes(kind));

describe('SPEC-44 the room in plan: walls and what is in them', () => {
  it('outlines each wall, cuts and cases the window, skips a wall with no thickness (G1)', () => {
    const window = '93ab97a1-ce31-4283-8240-ead92a6ae665';
    const island = '84063fed-ab0d-4a1d-ae05-ffe67decad5e';
    expect(wallThings(stored('G1 Euro kitchen'))).toEqual([
      { id: 'cb33d774-f31e-41c1-bbe4-198cbf981619:wall', kind: 'wall', points: [[-60, -84], [-60, 84], [-64.5, 88.5], [-64.5, -84]] },
      { id: `${window}:void`, kind: 'void', points: [[-60, -36], [-60, 12], [-64.5, 12], [-64.5, -36]] },
      { id: `${window}:detail`, kind: 'opening', points: [[-62.25, -36], [-62.25, 12]], closed: false },
      { id: `${window}:casing`, kind: 'casing', points: [[-60, -39], [-60, 15], [-59.25, 15], [-59.25, -39]] },
      { id: '4afd9749-bbe8-4848-8a67-a1d063bdfce8:wall', kind: 'wall', points: [[-60, 84], [60, 84], [64.5, 88.5], [-64.5, 88.5]] },
      { id: '8cf88b99-0a56-4ec4-96c2-ffdcaeef4051:wall', kind: 'wall', points: [[60, 84], [60, 57], [64.5, 57], [64.5, 88.5]] },
      { id: `${island}:endPanel:start`, kind: 'wall_end_panel', points: [[10.25, -16.75], [9.5, -16.75], [9.5, 21], [10.25, 21]], top: 34.5 },
      { id: `${island}:endPanel:end`, kind: 'wall_end_panel', points: [[101, -16.75], [100.25, -16.75], [100.25, 21], [101, 21]], top: 34.5 },
    ]);
  });

  it('fills a deep recess behind the wall and knocks its notch out; raised, its outline is dashed (G5)', () => {
    const recess = '61c07d7e-ec8b-4306-9825-9f3decfb5fa1';
    const mine = (parts) => parts.filter(({ id }) => id.startsWith(recess));
    const fill = { id: `${recess}:fill`, kind: 'wall', points: [[-82.5, 19.5], [-25.5, 19.5], [-25.5, 31.5], [-82.5, 31.5]] };
    expect(mine(wallThings(stored('G5 Recess room')))).toEqual([
      fill,
      { id: `${recess}:knockout`, kind: 'void', points: [[-78, 15], [-30, 15], [-30, 27], [-78, 27]] },
    ]);
    const raised = structuredClone(stored('G5 Recess room'));
    raised.walls[1].recesses[0].bottom = 12;
    const line = (index, points) => ({ id: `${recess}:line-${index}`, kind: 'recess', points, closed: false, dashed: true });
    expect(mine(wallThings(raised))).toEqual([
      fill,
      line(0, [[-78, 15], [-78, 27]]),
      line(1, [[-78, 27], [-30, 27]]),
      line(2, [[-30, 27], [-30, 15]]),
    ]);
  });

  it('dashes a soffit (G3)', () => {
    expect(wallThings(stored('G3 Bath alcove')).filter(({ kind }) => kind === 'soffit')).toEqual([{
      id: '5ac8edd3-2c75-476d-bc64-f80ade3f5fba', kind: 'soffit', points: [[-102, 9], [-30, 9], [-30, -5], [-102, -5]], dashed: true,
    }]);
  });
});

describe('SPEC-44 the room in plan: runs', () => {
  it('draws a run\'s boxes, faces and end panels as the plan view does (G1 tall)', () => {
    const run = 'b38f2f11-5318-42f2-9d95-8b9b3d1b9087';
    const box = '28072a7d-e691-40d1-a005-4d0ed1c9e825';
    const parts = planParts(syncRoom(stored('G1 Euro kitchen'), settings), settings);
    expect(parts.filter(({ runId }) => runId === run)).toEqual([
      { id: box, kind: 'cabinet', points: [[-60, -83.25], [-60, -54.75], [-35, -54.75], [-35, -83.25]], runId: run, top: 90 },
      { id: `${run}:left`, kind: 'end_panel', points: [[-60, -84], [-60, -83.25], [-34.125, -83.25], [-34.125, -84]], runId: run, top: 90 },
      { id: `${box}:rleft`, kind: 'face', points: [[-34.9375, -83.1875], [-34.9375, -69.0625], [-34.125, -69.0625], [-34.125, -83.1875]], runId: run, top: 90 },
      { id: `${box}:rright`, kind: 'face', points: [[-34.9375, -68.9375], [-34.9375, -54.8125], [-34.125, -54.8125], [-34.125, -68.9375]], runId: run, top: 90 },
      { id: `${run}:right`, kind: 'end_panel', points: [[-60, -54.75], [-60, -54], [-34.125, -54], [-34.125, -54.75]], runId: run, top: 90 },
    ]);
  });

  it('gives every part of an upper run its top, dashing none (G1 wall 1 upper)', () => {
    const run = '434f1164-3b6b-4a97-89e7-1c6438c4d95a';
    const parts = planParts(syncRoom(stored('G1 Euro kitchen'), settings), settings)
      .filter(({ runId }) => runId === run);
    expect(parts.map(({ id, kind, top, dashed }) => [id.replace(run, 'run'), kind, top, dashed])).toEqual([
      ['ae7626bb-d1e5-4396-8b5b-a8630bfed949', 'cabinet', 90, undefined],
      ['2dc1a45e-c462-4c4a-99f3-65c8b6782a2a', 'cabinet', 90, undefined],
      ['run:left', 'end_panel', 90, undefined],
      ['ae7626bb-d1e5-4396-8b5b-a8630bfed949:r', 'face', 90, undefined],
      ['2dc1a45e-c462-4c4a-99f3-65c8b6782a2a:r', 'face', 90, undefined],
      ['run:right', 'filler', 90, undefined],
      ['run:right:left', 'filler', 90, undefined],
    ]);
    expect(parts.at(-1).points).toEqual([[-50.4375, 69.25], [-50.4375, 70], [-47.9375, 70], [-47.9375, 69.25]]);
  });

  it('gives each stacked box its own top, so the higher one hides the lower (G4)', () => {
    const run = '738c73a7-adda-40e0-bca9-a881403c1ffa';
    const parts = planParts(syncRoom(stored('G4 T-filler run'), settings), settings)
      .filter(({ runId, kind }) => runId === run && kind === 'cabinet');
    expect(parts.map(({ id, top }) => [id, top])).toEqual([
      ['36718dec-9ae3-48e7-bce7-f3d95d207a1c', 90],
      ['0e8d791b-a3a5-4fe6-8b08-a1b8e954b8ba', 64],
      ['87b307e7-2f67-48a7-a80e-a52d4249d55b', 90],
      ['6ae1c6d6-ec28-40d7-aee3-f3b0898ed2fb', 90],
    ]);
  });

  it('covers every golden room: frames, panels, T-fillers and stacks; only the soffit is dashed', () => {
    const counts = Object.fromEntries(document.rooms.map((room) => {
      const parts = planParts(syncRoom(room, settings), settings);
      const kinds = {};
      for (const { kind } of parts) kinds[kind] = (kinds[kind] ?? 0) + 1;
      return [room.name, [parts.length, parts.filter(({ runId }) => runId).length, parts.filter(({ dashed }) => dashed).length,
        parts.filter(({ top }) => top !== undefined).length, kinds]];
    }));
    expect(counts).toEqual({
      'G1 Euro kitchen': [76, 68, 0, 70, { wall: 3, void: 1, opening: 1, casing: 1, wall_end_panel: 2, cabinet: 19, end_panel: 3, face: 35, filler: 11 }],
      'G2 Face frame kitchen': [22, 17, 0, 18, { wall: 1, void: 1, opening: 1, casing: 1, wall_end_panel: 1, cabinet: 9, end_panel: 3, frame: 4, panel: 1 }],
      'G3 Bath alcove': [18, 14, 1, 14, { wall: 3, soffit: 1, cabinet: 3, filler: 4, face: 4, end_panel: 2, panel: 1 }],
      'G4 T-filler run': [20, 18, 0, 18, { wall: 2, cabinet: 4, end_panel: 2, face: 6, filler: 6 }],
      'G5 Recess room': [27, 20, 0, 20, { wall: 5, void: 2, cabinet: 6, filler: 6, face: 6, end_panel: 2 }],
      'G6 Stacked runs': [37, 34, 0, 34, { wall: 3, cabinet: 8, filler: 6, face: 16, end_panel: 3, panel: 1 }],
    });
  });
});

describe('SPEC-44.2 plan runs lay out as the elevation does', () => {
  it('keeps a pinned cabinet on its pin: G1 wall 1 base, 36" centred on the window', () => {
    const synced = syncRoom(stored('G1 Euro kitchen'), settings);
    const run = 'b822e8ac-1a44-47ca-acec-ecb93caf7b8a';
    const boxes = planParts(synced, settings).filter(({ runId, kind }) => runId === run && kind === 'cabinet');
    const spans = boxes.map(({ points }) => [points[0][1], points[1][1]]);
    expect(spans).toEqual([[-54, -30], [-30, 6], [6, 31.5], [31.5, 57]]);
    // The 36" box is centred on the window (jamb -36 to 12 in plan).
    expect((spans[1][0] + spans[1][1]) / 2).toBe(-12);
    const view = resolveWall(synced, synced.walls[0], 'front');
    const layout = layoutRun(synced, view, view.runs.find(({ id }) => id === run), settings);
    expect(layout.pieces.filter(({ kind }) => kind === 'cabinet').map(({ width }) => width))
      .toEqual(spans.map(([start, end]) => end - start));
  });
});
