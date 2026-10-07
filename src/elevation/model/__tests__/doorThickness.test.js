import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { frontDepth } from '../corners.js';
import { DEFAULT_DOOR_STYLE } from '../doorStyles.js';
import { runDoorThickness } from '../doorStyleResolve.js';
import { elevationParts } from '../elevationParts.js';
import { resolveWall, syncRoom } from '../room.js';
import { runScene } from '../runScene.js';
import { planRunPieces } from '../planPieces.js';
import { normalizeElevationDocument, toElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);

const THICK = { ...DEFAULT_DOOR_STYLE, id: 'ds-thick', label: 'A', thickness: 1 };
const THIN = { ...DEFAULT_DOOR_STYLE, id: 'ds-thin', label: 'B', thickness: 0.75 };
const BASE = 'b822e8ac-1a44-47ca-acec-ecb93caf7b8a';
const CAB_24 = 'cfc9c904-3a11-43ee-a48d-88bef061b5ae';
const CAB_36 = '0f652c26-5f80-4387-8a1b-1f35ada26b59';
const FF_BASE = '860a1197-d14f-4fc2-9499-2d44cd1d8fa3';

const runOf = (room, id) => room.walls.flatMap((wall) => wall.runs).find((run) => run.id === id);
const leafOf = (run, id) => run.grid.cells.map((cell) => cell.node).find((node) => node.id === id);

/** A golden room with THICK and THIN listed, after `edit` picks where they're used, synced. */
function styled(edit, name = 'G1 Euro kitchen', s = settings) {
  const room = structuredClone(stored(name));
  room.doorStyles = [THICK, THIN];
  edit(room);
  return syncRoom(room, s);
}
const baseFront = (room, s = settings) => frontDepth(runOf(room, BASE), s);

describe('SPEC-46 a run\'s front plane follows its thickest face (P11)', () => {
  it('leaves a room with no styles as it was (G1)', () => {
    const room = syncRoom(stored('G1 Euro kitchen'), settings);
    expect('_doorThickness' in runOf(room, BASE)).toBe(false);
    expect(baseFront(room)).toBe(24.875);
  });

  it('moves the front of a run whose style is thicker', () => {
    const room = styled((r) => { runOf(r, BASE).doorStyleId = 'ds-thick'; });
    expect(runOf(room, BASE)._doorThickness).toBe(1);
    expect(baseFront(room)).toBe(25.0625);
    expect(runDoorThickness(room, room.walls[0], runOf(room, BASE), settings)).toBe(1);
  });

  it('takes the thickest face when only one cabinet is thicker', () => {
    const room = styled((r) => { leafOf(runOf(r, BASE), CAB_24).doorStyleId = 'ds-thick'; });
    expect(runOf(room, BASE)._doorThickness).toBe(1);
    expect(baseFront(room)).toBe(25.0625);
  });

  it('brings the front in when every face is thinner', () => {
    const room = styled((r) => { r.doorStyleId = 'ds-thin'; });
    expect(runOf(room, BASE)._doorThickness).toBe(0.75);
    expect(baseFront(room)).toBe(24.8125);
  });

  it('applies a drawer-front style only to drawer fronts', () => {
    const doors = styled((r) => { r.drawerFrontStyleId = 'ds-thick'; });
    expect('_doorThickness' in runOf(doors, BASE)).toBe(false);
    expect(baseFront(doors)).toBe(24.875);
    const drawers = styled((r) => {
      r.drawerFrontStyleId = 'ds-thick';
      leafOf(runOf(r, BASE), CAB_24).face = {
        direction: 'vertical', size: null, children: [{ type: 'drawer_front', size: 6 }, { type: 'drawer_front', size: null }],
      };
    });
    expect(runOf(drawers, BASE)._doorThickness).toBe(1);
    expect(baseFront(drawers)).toBe(25.0625);
  });

  it('still takes the team default thickness from settings.doorThickness', () => {
    const thick = { ...settings, doorThickness: 1 };
    const plain = syncRoom(stored('G1 Euro kitchen'), thick);
    expect('_doorThickness' in runOf(plain, BASE)).toBe(false);
    expect(baseFront(plain, thick)).toBe(25.0625);
    const same = styled((r) => { runOf(r, BASE).doorStyleId = 'ds-thick'; }, 'G1 Euro kitchen', thick);
    expect('_doorThickness' in runOf(same, BASE)).toBe(false);
  });

  it('keeps a face frame run\'s front at the frame (G2)', () => {
    const room = styled((r) => { runOf(r, FF_BASE).doorStyleId = 'ds-thick'; }, 'G2 Face frame kitchen');
    expect('_doorThickness' in runOf(room, FF_BASE)).toBe(false);
    expect(frontDepth(runOf(room, FF_BASE), settings)).toBe(24.8125);
  });

  it('brings fillers out to the new front plane (G1 elevation A)', () => {
    const room = styled((r) => { leafOf(runOf(r, BASE), CAB_36).doorStyleId = 'ds-thick'; });
    const filler = elevationParts(room, room.walls[0], 'front', settings).find((part) => part.id === `${BASE}:right`);
    expect([filler.back, filler.front]).toEqual([24.0625, 25.0625]);
  });

  it('never saves _doorThickness', () => {
    const room = styled((r) => { runOf(r, BASE).doorStyleId = 'ds-thick'; });
    const saved = toElevationDocument({ ...document, rooms: [room] });
    expect('_doorThickness' in runOf(saved.rooms[0], BASE)).toBe(false);
    expect(runOf(saved.rooms[0], BASE).doorStyleId).toBe('ds-thick');
  });
});

describe('SPEC-46 each face at its own thickness: backs line up, fronts move', () => {
  const G1_BASE_FACES = [
    `${CAB_24}:r`, `${CAB_36}:rleft`, `${CAB_36}:rright`,
    '0624c9d5-b951-4191-95f2-1562a6b32343:rleft', '0624c9d5-b951-4191-95f2-1562a6b32343:rright',
    'e3bfb331-0a5d-4cf2-aaba-929c53ca8c54:rleft', 'e3bfb331-0a5d-4cf2-aaba-929c53ca8c54:rright',
  ];
  const faces = (room, runId) => elevationParts(room, room.walls[0], 'front', settings)
    .filter((part) => part.kind === 'face' && part.runId === runId)
    .map(({ id, back, front }) => [id, back, front]);
  const fillerFront = (room) => elevationParts(room, room.walls[0], 'front', settings)
    .find((part) => part.id === `${BASE}:right`).front;

  it('draws every face of a thicker run 1" thick off the same back (G1)', () => {
    const room = styled((r) => { runOf(r, BASE).doorStyleId = 'ds-thick'; });
    expect(faces(room, BASE)).toEqual(G1_BASE_FACES.map((id) => [id, 24.0625, 25.0625]));
  });

  it('draws only the thicker cabinet\'s face out front; the filler follows the thickest', () => {
    const room = styled((r) => { leafOf(runOf(r, BASE), CAB_24).doorStyleId = 'ds-thick'; });
    expect(faces(room, BASE)).toEqual(G1_BASE_FACES.map((id) => [id, 24.0625, id === `${CAB_24}:r` ? 25.0625 : 24.875]));
    expect(fillerFront(room)).toBe(25.0625);
  });

  it('lets one face pick a thinner style; the run\'s front stays at the thickest', () => {
    const room = styled((r) => {
      leafOf(runOf(r, BASE), CAB_36).face = { type: 'pair_door', size: null, styleId: 'ds-thin' };
    });
    expect(faces(room, BASE)).toEqual(G1_BASE_FACES.map((id) => [id, 24.0625, id.startsWith(CAB_36) ? 24.8125 : 24.875]));
    expect(fillerFront(room)).toBe(24.875);
  });

  it('sinks a thicker inset door into the frame: face flush with the frame, back deeper (G2)', () => {
    const room = styled((r) => { runOf(r, FF_BASE).doorStyleId = 'ds-thick'; }, 'G2 Face frame kitchen');
    expect(faces(room, FF_BASE)).toEqual([
      'b736ca24-6df8-41d5-88bc-416dbd85eab3:rleft', 'b736ca24-6df8-41d5-88bc-416dbd85eab3:rright',
      '50803545-180e-4af0-b612-1a8922d48d09:rleft', '50803545-180e-4af0-b612-1a8922d48d09:rright',
    ].map((id) => [id, 23.8125, 24.8125]));
    const frame = elevationParts(room, room.walls[0], 'front', settings)
      .find((part) => part.id === 'frame:b736ca24-6df8-41d5-88bc-416dbd85eab3');
    expect([frame.back, frame.front]).toEqual([24, 24.8125]);
  });

  it('draws plan faces at their own thickness too (G1)', () => {
    const room = styled((r) => { leafOf(runOf(r, BASE), CAB_24).doorStyleId = 'ds-thick'; });
    const view = resolveWall(room, room.walls[0], 'front');
    const run = view.runs.find((candidate) => candidate.id === BASE);
    const scene = runScene(room, view, run, settings);
    const plan = planRunPieces(room, view, run, settings, scene.result, scene.faceLayouts);
    const at = (key) => plan.faces.find((entry) => entry.key === key);
    expect([at(`${CAB_24}:r`).back, at(`${CAB_24}:r`).front]).toEqual([24.0625, 25.0625]);
    expect([at(`${CAB_36}:rleft`).back, at(`${CAB_36}:rleft`).front]).toEqual([24.0625, 24.875]);
    expect(at(`${BASE}:right`).front).toBe(25.0625);
  });
});
