import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { attach, auto, line, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { layoutRun } from '../faceLayouts.js';
import { placedAt } from '../layoutLines.js';
import { resolveWall } from '../room.js';
import { syncRoom } from '../roomSync.js';
import { dropWallPins, pinTargetsForRun } from '../runPins.js';
import { centerlineMarkers } from '../dimensionsCenterline.js';

// LL4 a: an attached root column is a segment target, exactly where a pin was.

const ids = vi.hoisted(() => ({ count: 0 }));
vi.mock('uuid', () => ({ v4: () => `column-lines-${(ids.count += 1)}` }));
beforeEach(() => { ids.count = 0; });

const read = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const settings = DEFAULT_SETTINGS;

/** Positions only: joints, opening offsets, run spans, pieces and warning codes. */
function positions(stored) {
  const synced = syncRoom(stored, settings);
  return synced.walls.filter((w) => w.runs.length).map((w) => {
    const view = resolveWall(synced, w, 'front');
    return {
      joints: (w.joints ?? []).map(({ id, x }) => ({ id, x })),
      openings: (w.openings ?? []).map(({ id, offset }) => ({ id, offset })),
      runs: view.runs.map((r) => {
        const { pieces, warnings, errors } = layoutRun(synced, view, r, settings);
        return {
          id: r.id,
          x: r.x,
          width: r.width,
          pinWidths: r._pinWidths,
          pieces: pieces.map(({ id, x, width }) => ({ id, x, width })),
          warnings: warnings.map(({ code, pieceId }) => ({ code, pieceId })),
          errors: errors.map(({ code }) => code),
        };
      }),
    };
  });
}

function setLine(stored, value) {
  const copy = structuredClone(stored);
  for (const w of copy.walls) for (const l of w.lines ?? []) l.value = value;
  return copy;
}

describe('LL4 a columns on layout lines', () => {
  it('placedAt reads an attachment first, then a pin', () => {
    expect(placedAt({ attach: attach('L1', 'right') })).toBe('right');
    expect(placedAt({ pin: { anchor: 'left' } })).toBe('left');
    expect(placedAt({ id: 'A' })).toBeNull();
  });

  it('1. Room 10: the column is centred on the window through line L1 (centre 92)', () => {
    const room10 = read('room10');
    const base = positions(room10)[0].runs.find((r) => r.id === 'c25ad9b4-36e3-481c-a2b4-5b5d4857ec8e');
    const column = base.pieces.find((p) => p.id === '91b8a850-4450-4bc3-afbe-f9c1888a5d62');
    expect(column).toMatchObject({ x: 77 + 11 / 32, width: 29 + 5 / 16 });
    expect(column.x + column.width / 2).toBe(92);
    expect(positions(room10)[0].openings[0].offset).toBe(74);
  });

  it('2. Room 10b: a right edge on a line grows the free end (72, 90)', () => {
    const room10b = read('room10b');
    const span = (value) => {
      const tall = positions(setLine(room10b, value))[0].runs[0];
      const column = tall.pieces.find((p) => p.id === '5ea196ac-4752-42e5-bf15-608401c0c086');
      return [tall.width, column.x + column.width];
    };
    expect(span(72)).toEqual([72 + 13 / 16, 72]);
    expect(span(90)).toEqual([90 + 13 / 16, 90]);
  });

  it('3. a back-face column targets its back line in back-face coordinates', () => {
    const r = run({
      id: 'R', wallSide: 'back', items: [auto('A'), auto('B'), auto('C')],
    });
    r.grid.cols[1].attach = attach('B1', 'left');
    const w = wall({ id: 'H', x2: 240, lines: [line('B1', 30, { wallSide: 'back' })], runs: [r] });
    const stored = room({ walls: [w] });
    const synced = syncRoom(stored, settings);
    const syncedWall = synced.walls[0];
    expect(pinTargetsForRun(syncedWall.runs[0], syncedWall, 240, settings)).toEqual({ B: 30 });
  });

  it('ignores an attachment to a line on the other face', () => {
    const r = run({ id: 'R', items: [auto('A'), auto('B')] });
    r.grid.cols[1].attach = attach('B1');
    const w = wall({ id: 'H', x2: 240, lines: [line('B1', 30, { wallSide: 'back' })], runs: [r] });
    expect(pinTargetsForRun(r, w, 240, settings)).toEqual({});
  });
});

describe('LL4 c pins out', () => {
  it('3. sync drops a wall-end pin and keeps the wall when there are none', () => {
    const r = run({ id: 'R', items: [auto('A'), auto('B')] });
    r.grid.cols[1].pin = { anchor: 'center', from: 'left', openingId: null, openingAnchor: 'center', value: 30 };
    const synced = syncRoom(room({ walls: [wall({ id: 'H', x2: 240, runs: [r] })] }), settings);
    expect(synced.walls[0].runs[0].grid.cols[1]).not.toHaveProperty('pin');
    const plain = wall({ id: 'H', x2: 240, runs: [run({ id: 'R', items: [auto('A')] })] });
    expect(dropWallPins(plain)).toBe(plain);
  });

  it('5. callouts come from the line: Room 10 on the window, 10b from the left end', () => {
    const marker = (stored, runId, pieceId) => {
      const synced = syncRoom(stored, settings);
      const view = resolveWall(synced, synced.walls.find((w) => w.runs.length), 'front');
      const r = view.runs.find((candidate) => candidate.id === runId);
      const { pieces } = layoutRun(synced, view, r, settings);
      return centerlineMarkers(r, pieces, view, view.length, settings).find((m) => m.pieceId === pieceId);
    };
    expect(marker(read('room10'), 'c25ad9b4-36e3-481c-a2b4-5b5d4857ec8e', '91b8a850-4450-4bc3-afbe-f9c1888a5d62'))
      .toMatchObject({ from: 'opening', datumX: 92, x: 92, value: 0 });
    expect(marker(read('room10b'), '5d290bf9-897b-4304-9dbe-ccef6ab1c311', '5ea196ac-4752-42e5-bf15-608401c0c086'))
      .toMatchObject({ from: 'left', datumX: 0, x: 72, value: 72 });
  });
});
