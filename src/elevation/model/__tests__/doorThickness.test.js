import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { frontDepth } from '../corners.js';
import { DEFAULT_DOOR_STYLE } from '../doorStyles.js';
import { runDoorThickness } from '../doorStyleResolve.js';
import { elevationParts } from '../elevationParts.js';
import { syncRoom } from '../room.js';
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
