import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { attach, auto, line, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { layoutRun } from '../faceLayouts.js';
import { placedAt } from '../layoutLines.js';
import { resolveWall } from '../room.js';
import { roomDiagnostics, syncRoom } from '../roomSync.js';
import { pinTargetsForRun } from '../runPins.js';

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

/** The fixture with its one pinned column moved to a line (and the opening it was pinned to, if any). */
function onLine(stored, { lineValue, at, withOpening }) {
  const copy = structuredClone(stored);
  for (const w of copy.walls) {
    for (const r of w.runs ?? []) {
      for (const col of r.grid?.cols ?? []) {
        if (!col.pin) continue;
        const openingId = col.pin.openingId;
        delete col.pin;
        col.attach = attach('LL', at);
        w.lines = [line('LL', lineValue)];
        if (withOpening) w.openings.find((o) => o.id === openingId).attach = attach('LL');
      }
    }
  }
  return copy;
}

function setPin(stored, value) {
  const copy = structuredClone(stored);
  for (const w of copy.walls) for (const r of w.runs ?? []) for (const col of r.grid?.cols ?? []) {
    if (col.pin) col.pin.value = value;
  }
  return copy;
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

  it('1. Room 10: a column centred on the window by a line lays out exactly as the opening pin did', () => {
    const room10 = read('room10');
    const lined = onLine(room10, { lineValue: 92, at: 'center', withOpening: true });
    expect(positions(lined)).toEqual(positions(room10));
    const base = positions(lined)[0].runs.find((r) => r.id === 'c25ad9b4-36e3-481c-a2b4-5b5d4857ec8e');
    const column = base.pieces.find((p) => p.id === '91b8a850-4450-4bc3-afbe-f9c1888a5d62');
    expect(column.x + column.width / 2).toBeCloseTo(92, 9);
    expect(roomDiagnostics(lined, settings)).toEqual(roomDiagnostics(room10, settings));
  });

  it('2. Room 10b: a right edge on a line grows the free end like the pin (72, 90, 60)', () => {
    const room10b = read('room10b');
    const lined = onLine(room10b, { lineValue: 72, at: 'right' });
    for (const value of [72, 90, 60]) {
      expect(positions(setLine(lined, value))).toEqual(positions(setPin(room10b, value)));
    }
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
