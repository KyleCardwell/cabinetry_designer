import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultPick, pickStack } from '../pick.js';
import { CABINET_TYPE_IDS } from '../constants.js';
import { findLeaf } from '../cellTree.js';
import { wallInteriors } from '../interiors.js';
import { resolveWall, syncRoom } from '../room.js';
import { runScene } from '../runScene.js';
import { WALL_SIDES } from '../wallSides.js';
import { normalizeElevationDocument } from '../../store/persistence.js';
import { run, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';

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

function interiorFixture(interior = { direction: 'vertical', children: [{}, {}], dividers: [{ kind: 'fixed' }] }) {
  const state = stateWithRun(run({
    cabinetTypeId: CABINET_TYPE_IDS.TALL, x: 10, z: 0, width: 24, height: 84, depth: 24,
    autoCount: false, ends: { left: { type: 'none' }, right: { type: 'none' } },
    items: [{ id: 'cabinet', kind: 'cabinet', width: 24, face: { type: 'door' }, interior }],
  }));
  const settings = { ...state.settings, runFlex: 0 };
  const room = syncRoom(state.rooms[0], settings);
  const wall = resolveWall(room, room.walls[0], 'front');
  const [entry] = wallInteriors(room, wall.sideSource, 'front', settings);
  return { room, wall, settings, entry };
}

describe('IN3 doors-off picking', () => {
  it('anchor 1: puts the shelf before the piece, while the first click still selects the cabinet', () => {
    const { room, wall, settings, entry: { box } } = interiorFixture();
    expect(box).toMatchObject({ width: 24, height: 84, depth: 24 });
    const stack = pickStack(room, wall, settings, { x: box.x + 12, z: box.z + 42 }, { doorsOff: true });
    expect(stack.map(({ kind }) => kind)).toEqual(['divider', 'piece', 'run', 'wall']);
    expect(stack[0]).toMatchObject({
      key: 'divider:run-1:cabinet:r:0', label: 'Fixed shelf oc 42',
      selection: { runId: 'run-1', pieceId: 'cabinet' }, facePath: null,
      interior: { path: 'r', divider: 0 },
    });
    expect(stack.slice(1).every(({ interior }) => interior === null)).toBe(true);
    expect(defaultPick(stack)).toBe(stack[1]);
    expect(defaultPick(stack, 'interior')).toBe(stack[0]);
    expect(defaultPick([stack[0]])).toBeNull();
  });

  it('anchors 2 and 3: picks the clear lower section only with doors off and retains the normal face stack', () => {
    const { room, wall, settings, entry: { box } } = interiorFixture();
    const point = { x: box.x + 12, z: box.z + 20 };
    const stack = pickStack(room, wall, settings, point, { doorsOff: true });
    expect(stack.map(({ kind }) => kind)).toEqual(['section', 'piece', 'run', 'wall']);
    expect(stack[0]).toMatchObject({
      key: 'section:run-1:cabinet:r.1', label: 'Section 22 1/2 × 40 7/8',
      interior: { path: 'r.1', divider: null }, facePath: null,
    });
    expect(defaultPick(stack)).toBe(stack[1]);
    expect(defaultPick(stack, 'interior')).toBe(stack[0]);
    const normal = pickStack(room, wall, settings, point, { doorsOff: false });
    expect(normal.map(({ kind }) => kind)).toEqual(['face', 'piece', 'run', 'wall']);
    expect(normal).toEqual(pickStack(room, wall, settings, point));
    expect(normal.every(({ interior }) => interior === null)).toBe(true);
  });

  it('labels partition sides, follows the active back face, and excludes clipped blind interiors', () => {
    for (const [kind, from, label] of [
      ['partition', 'left', 'Partition oc 8 from left'],
      ['double_partition', 'right', 'Double partition oc 8 from right'],
    ]) {
      const { room, wall, settings, entry } = interiorFixture({
        direction: 'horizontal', children: [{}, {}], dividers: [{ kind, at: 8, from }],
      });
      const divider = entry.dividers[0];
      const stack = pickStack(room, wall, settings, {
        x: divider.x + divider.width / 2, z: divider.z + 10,
      }, { doorsOff: true });
      expect(stack[0].label).toBe(label);
      expect(stack[0].interior).toEqual({ path: 'r', divider: 0 });
      const back = resolveWall(room, room.walls[0], 'back');
      expect(pickStack(room, back, settings, { x: 10, z: 20 }, { doorsOff: true })
        .some(({ interior }) => interior)).toBe(false);
      room.walls[0].runs[0].wallSide = 'back';
      const rear = resolveWall(room, room.walls[0], 'back');
      const [rearEntry] = wallInteriors(room, room.walls[0], 'back', settings);
      expect(pickStack(room, rear, settings, {
        x: rearEntry.box.x + 12, z: rearEntry.box.z + 20,
      }, { doorsOff: true })[0].kind).toBe('section');
    }

    const id = 'c38ca5a0-197f-4885-a084-d33ec4eafcff';
    const stored = document.rooms.find((room) => room.walls.some((wall) => (
      wall.runs.some((run) => findLeaf(run.grid, id))
    )));
    const room = syncRoom(stored, settings);
    const wall = resolveWall(room, room.walls.find((wall) => wall.runs.some((run) => findLeaf(run.grid, id))), 'front');
    const entry = wallInteriors(room, wall.sideSource, 'front', settings).find(({ itemId }) => itemId === id);
    const scene = runScene(room, wall, wall.runs.find(({ id }) => id === entry.runId), settings);
    const piece = scene.drawnPieces.find((piece) => piece.id === id);
    const section = entry.sections[0];
    // This cabinet's full box extends left of its drawn piece into the hidden blind portion.
    expect(section.x).toBeLessThan(piece.x);
    const point = { x: (section.x + piece.x) / 2, z: section.z + section.height / 2 };
    expect(pickStack(room, wall, settings, point, { doorsOff: true })
      .some(({ selection, interior }) => selection?.pieceId === id && interior)).toBe(false);
  });
});

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
    expect(summary(endPanel)).toEqual([['end_panel', "Wall end panel 13/16\" × 34 1/2\""], ['wall', 'Wall 4']]);
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
