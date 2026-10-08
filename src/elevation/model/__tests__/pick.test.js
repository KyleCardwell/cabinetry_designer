import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultPick, pickStack } from '../pick.js';
import { resolveWall, syncRoom } from '../room.js';
import { runScene } from '../runScene.js';
import { WALL_SIDES } from '../wallSides.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;

function face(name, wallId = null) {
  const room = syncRoom(document.rooms.find((candidate) => candidate.name === name), settings);
  const wall = wallId
    ? room.walls.find(({ id }) => id === wallId)
    : room.walls.find(({ runs }) => runs.length > 0);
  return { room, view: resolveWall(room, wall, 'front') };
}

const summary = (stack) => stack.map(({ kind, label }) => [kind, label]);

describe('SPEC-39.1 everything under a click', () => {
  it('lists faces, parts, runs, end panels, openings, recesses and the wall, front to back', () => {
    const g6 = face('G6 Stacked runs');
    const panelRun = pickStack(g6.room, g6.view, settings, { x: 50, z: 44 });
    expect(summary(panelRun)).toEqual([
      ['piece', 'Back panel 101" × 18"'],
      ['run', 'Upper run 101"'],
      ['wall', 'Wall 2'],
    ]);
    expect(panelRun[1].selection).toEqual({ runId: 'b1ec1b4a-de2b-4a28-a694-77675f913ebd' });

    const base = pickStack(g6.room, g6.view, settings, { x: 10, z: 20 });
    expect(summary(base)).toEqual([
      ['face', 'Pair door 16 1/8" × 30 1/8"'],
      ['piece', 'Cabinet 32 1/2" × 30 1/2"'],
      ['run', 'Base run 101"'],
      ['wall', 'Wall 2'],
    ]);
    expect(base[0]).toMatchObject({
      selection: {
        runId: '677ec7a5-d97a-4cfd-8843-f960e3334ea2',
        pieceId: '4217b8dc-e0af-4e39-8f3e-efb6ec6b09c4',
      },
      facePath: 'r',
    });

    const g5 = face('G5 Recess room', '9574ded4-3b8f-470a-afad-2ea36e0ef64c');
    expect(pickStack(g5.room, g5.view, settings, { x: 60, z: 20 }).map(({ kind }) => kind))
      .toEqual(['face', 'piece', 'run', 'recess', 'wall']);
    expect(pickStack(g5.room, g5.view, settings, { x: 60, z: 70 }).map(({ selection }) => selection))
      .toEqual([{ recessId: '61c07d7e-ec8b-4306-9825-9f3decfb5fa1' }, null]);

    const kitchen = face('G1 Euro kitchen', 'cb33d774-f31e-41c1-bbe4-198cbf981619');
    expect(summary(pickStack(kitchen.room, kitchen.view, settings, { x: 72, z: 66 })))
      .toEqual([['opening', 'Window W1'], ['wall', 'Wall 1']]);
    const island = face('G1 Euro kitchen', '84063fed-ab0d-4a1d-ae05-ffe67decad5e');
    const endPanel = pickStack(island.room, island.view, settings, { x: 0.375, z: 10 });
    expect(summary(endPanel)).toEqual([['end_panel', 'Wall end panel 3/4" × 34 1/2"'], ['wall', 'Wall 4']]);
    expect(endPanel[0].selection).toEqual({ endPanel: 'end' });
  });

  it('finds every drawn part at its centre, and a click selects what it always did', () => {
    for (const stored of document.rooms) {
      const room = syncRoom(stored, settings);
      for (const wall of room.walls) {
        for (const side of WALL_SIDES) {
          const view = resolveWall(room, wall, side);
          for (const run of view.runs) {
            const scene = runScene(room, view, run, settings);
            for (const piece of scene.drawnPieces.filter(({ id }) => !scene.hiddenIds.has(id))) {
              const stack = pickStack(room, view, settings, {
                x: piece.x + piece.width / 2,
                z: piece.z + piece.height / 2,
              });
              expect(stack.some((candidate) => candidate.kind === 'piece'
                && candidate.selection.pieceId === piece.id)).toBe(true);
              expect(stack.at(-1).kind).toBe('wall');
            }
          }
        }
      }
    }
    const g6 = face('G6 Stacked runs');
    const base = pickStack(g6.room, g6.view, settings, { x: 10, z: 20 });
    expect(defaultPick(base).kind).toBe('piece');
    expect(defaultPick(base, 'face').kind).toBe('face');
    expect(defaultPick(pickStack(g6.room, g6.view, settings, { x: 150, z: 70 })).kind).toBe('wall');
  });
});
