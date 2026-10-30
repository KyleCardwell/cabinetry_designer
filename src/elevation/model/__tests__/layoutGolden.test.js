import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { layoutRun } from '../faceLayouts.js';
import { resolveWall } from '../room.js';
import { roomDiagnostics, syncRoom } from '../roomSync.js';
import { moveJoint, resizeRun } from '../runJoins.js';
import { lineHeldJoints } from '../linePlacement.js';
import { attach, line } from '../../../test/builders.js';
import { moveRun } from '../runMoves.js';

const ids = vi.hoisted(() => ({ count: 0 }));
vi.mock('uuid', () => ({ v4: () => `layout-golden-${(ids.count += 1)}` }));
beforeEach(() => { ids.count = 0; });

const room8 = JSON.parse(readFileSync(new URL('./fixtures/room8.json', import.meta.url), 'utf8'));
const room10 = JSON.parse(readFileSync(new URL('./fixtures/room10.json', import.meta.url), 'utf8'));
const room10b = JSON.parse(readFileSync(new URL('./fixtures/room10b.json', import.meta.url), 'utf8'));
const settings8 = { ...DEFAULT_SETTINGS, ...room8.settingsOverrides };
const settings10 = { ...DEFAULT_SETTINGS, ...room10.settingsOverrides };
const settings10b = { ...DEFAULT_SETTINGS, ...room10b.settingsOverrides };

const WALL4 = '14154ec7-5eeb-4511-8d78-5d3da7b09418';
const WALL2 = '2641fa48-3200-43ec-8a5f-ab8e6a514e00';
const BASE8 = '8837d4ef-0f27-4ae9-aec6-2d563cadc4b3';
const HOOD8 = 'c1cb2dd4-6ec7-4d67-a1ef-1b5072bcc757';
const BASE10 = 'c25ad9b4-36e3-481c-a2b4-5b5d4857ec8e';
const LEFT_TALL10 = '5d290bf9-897b-4304-9dbe-ccef6ab1c311';
const RIGHT_TALL10 = '92ae9b3d-25e1-47e0-8cb0-23c603ad4c4e';
const PINNED10 = '91b8a850-4450-4bc3-afbe-f9c1888a5d62';
const PINNED10B = '5ea196ac-4752-42e5-bf15-608401c0c086';
const JOINT10 = 'ca73860b-9fe0-425d-90db-e27ca534cb1b';

function layoutState(stored, settings) {
  const room = syncRoom(stored, settings);
  return {
    walls: room.walls.filter((wall) => wall.runs.length).map((wall) => ({
      id: wall.id,
      name: wall.name,
      joints: wall.joints.map(({ id, x, wallSide }) => ({ id, x, wallSide })),
      openings: wall.openings.map(({ id, label, offset, offsetFrom, offsetAnchor, width }) => ({
        id, label, offset, offsetFrom, offsetAnchor, width,
      })),
      sides: Object.fromEntries(['front', 'back'].flatMap((side) => {
        const view = resolveWall(room, wall, side);
        if (!view.runs.length) return [];
        return [[side, view.runs.map((run) => {
          const { pieces, warnings, errors } = layoutRun(room, view, run, settings);
          return {
            id: run.id,
            cabinetTypeId: run.cabinetTypeId,
            x: run.x,
            width: run.width,
            anchors: run.anchors,
            flex: run.flex,
            _pinWidths: run._pinWidths,
            pieces: pieces.map(({ kind, id, role, x, width }) => ({ kind, id, role, x, width })),
            warnings: warnings.map(({ code, pieceId }) => ({ code, pieceId })),
            errors: errors.map(({ code, pieceId }) => ({ code, pieceId })),
          };
        })]];
      })),
    })),
    diagnostics: roomDiagnostics(stored, settings),
  };
}

const wallOf = (state, id) => state.walls.find((wall) => wall.id === id);
const runOf = (state, wallId, runId) => wallOf(state, wallId).sides.front.find((run) => run.id === runId);
const pieceOf = (run, id) => run.pieces.find((piece) => piece.id === id);

describe('LL0 Room 8 (room8.json)', () => {
  it('as stored: holds the Wall 4 joints and the layouts on both populated walls', () => {
    const state = layoutState(structuredClone(room8), settings8);
    expect(wallOf(state, WALL4).joints).toEqual([
      { id: '7d2ce208-b56f-447a-b162-fc585bbbf5a2', x: 38, wallSide: 'front' },
      { id: 'fe1b16b5-fdf8-4840-abbf-c55164603b10', x: 97, wallSide: 'front' },
      { id: '97d7faa1-a7c5-4b71-8d7a-030d18a7b281', x: 177, wallSide: 'front' },
    ]);
    expect(state.walls.map(({ name }) => name)).toEqual(['Wall 4', 'Wall 3']);
    expect(state).toMatchSnapshot();
  });

  it('holds the base run and its 48-inch open cell', () => {
    const base = runOf(layoutState(structuredClone(room8), settings8), WALL4, BASE8);
    expect(base).toMatchObject({ x: 38, width: 197 });
    expect(pieceOf(base, 'e77c1c0c-b386-4716-bc71-0f23ec1e585c'))
      .toMatchObject({ kind: 'void', x: 112.5, width: 48 });
  });

  it('holds the hood run between its joints', () => {
    expect(runOf(layoutState(structuredClone(room8), settings8), WALL4, HOOD8))
      .toMatchObject({ x: 97, width: 80 });
  });

  it('synced twice equals once', () => {
    const once = syncRoom(structuredClone(room8), settings8);
    expect(layoutState(syncRoom(once, settings8), settings8)).toEqual(layoutState(once, settings8));
  });
});

describe('LL0 Room 10 (room10.json)', () => {
  it('as stored: holds the joints at 41 and 129', () => {
    const state = layoutState(structuredClone(room10), settings10);
    expect(wallOf(state, WALL2).joints).toEqual([
      { id: JOINT10, x: 41, wallSide: 'front' },
      { id: '82f49ba5-07c3-4230-b074-a221d60816f6', x: 129, wallSide: 'front' },
    ]);
    expect(state).toMatchSnapshot();
  });

  it('holds the base column centre on the window centre', () => {
    const state = layoutState(structuredClone(room10), settings10);
    const base = runOf(state, WALL2, BASE10);
    const column = pieceOf(base, PINNED10);
    const window = wallOf(state, WALL2).openings.find(({ label }) => label === 'W1');
    expect(base).toMatchObject({ x: 41, width: 88 });
    expect(column).toMatchObject({ x: 77 + 11 / 32, width: 29 + 5 / 16 });
    expect(window).toMatchObject({ offset: 74, width: 36 });
    expect(column.x + column.width / 2).toBe(92);
    expect(column.x + column.width / 2).toBe(window.offset + window.width / 2);
  });

  it('warns twice about base rounding and once about a wide cabinet, with no tall warnings', () => {
    const state = layoutState(structuredClone(room10), settings10);
    expect(runOf(state, WALL2, BASE10).warnings.map(({ code }) => code).sort())
      .toEqual(['wide-cabinet', 'widths-not-rounded', 'widths-not-rounded']);
    for (const id of [LEFT_TALL10, RIGHT_TALL10]) {
      expect(runOf(state, WALL2, id).warnings).toEqual([]);
    }
  });

  it('window moved: follows W1 while leaving the joints and tall runs unchanged', () => {
    const stored = structuredClone(room10);
    const before = layoutState(structuredClone(room10), settings10);
    // LL4: W1 and the column are on line L1 (fixture); moving the line moves both.
    stored.walls.find(({ id }) => id === WALL2).lines[0].value = 88;
    const state = layoutState(stored, settings10);
    const column = pieceOf(runOf(state, WALL2, BASE10), PINNED10);
    expect(column).toMatchObject({ x: 73 + 11 / 32, width: 29 + 5 / 16 });
    expect(column.x + column.width / 2).toBe(88);
    expect(wallOf(state, WALL2).joints.map(({ x }) => x)).toEqual([41, 129]);
    for (const id of [LEFT_TALL10, RIGHT_TALL10]) {
      expect(runOf(state, WALL2, id)).toEqual(runOf(before, WALL2, id));
    }
    expect(state).toMatchSnapshot();
  });

  it('joint moved: resizes the left tall and base while holding the pinned column', () => {
    const result = moveJoint(structuredClone(room10), WALL2, JOINT10, 44, settings10);
    expect(result.ok).toBe(true);
    const state = layoutState(result.room, settings10);
    expect(wallOf(state, WALL2).joints.find(({ id }) => id === JOINT10).x).toBe(44);
    expect(runOf(state, WALL2, LEFT_TALL10)).toMatchObject({ x: 0, width: 44 });
    const base = runOf(state, WALL2, BASE10);
    expect(base).toMatchObject({ x: 44, width: 85 });
    expect(pieceOf(base, PINNED10)).toMatchObject({ x: 77 + 11 / 32, width: 29 + 5 / 16 });
    expect(state).toMatchSnapshot();
  });

  it('synced twice equals once', () => {
    const once = syncRoom(structuredClone(room10), settings10);
    expect(layoutState(syncRoom(once, settings10), settings10)).toEqual(layoutState(once, settings10));
  });
});

describe('LL0 Room 10b (room10b.json)', () => {
  it('as stored: ends the pinned column at 72 and puts the end panel after it', () => {
    const state = layoutState(structuredClone(room10b), settings10b);
    const run = runOf(state, WALL2, LEFT_TALL10);
    const column = pieceOf(run, PINNED10B);
    expect(run).toMatchObject({ x: 0, width: 72 + 13 / 16 });
    expect(column).toMatchObject({ x: 42, width: 30 });
    expect(column.x + column.width).toBe(72);
    expect(run.pieces.at(-1)).toMatchObject({ kind: 'end_panel', x: 72, width: 13 / 16 });
    expect(state).toMatchSnapshot();
  });

  it('pin out: grows the free end and warns about the first cabinet width', () => {
    const stored = structuredClone(room10b);
    stored.walls.find(({ id }) => id === WALL2).lines[0].value = 90; // LL4: the pin is now line L1
    const state = layoutState(stored, settings10b);
    const laidOut = runOf(state, WALL2, LEFT_TALL10);
    expect(laidOut).toMatchObject({ x: 0, width: 90 + 13 / 16 });
    expect(pieceOf(laidOut, PINNED10B)).toMatchObject({ x: 60, width: 30 });
    expect(laidOut.pieces.at(-1)).toMatchObject({ kind: 'end_panel', x: 90, width: 13 / 16 });
    expect(laidOut.warnings).toContainEqual({
      code: 'wide-cabinet', pieceId: '0e14e4ca-d2a8-4817-87eb-34e22fbb100a',
    });
    expect(state).toMatchSnapshot();
  });

  it('pin in: shrinks the free end exactly and fills the run', () => {
    const stored = structuredClone(room10b);
    stored.walls.find(({ id }) => id === WALL2).lines[0].value = 60; // LL4: the pin is now line L1
    const state = layoutState(stored, settings10b);
    const laidOut = runOf(state, WALL2, LEFT_TALL10);
    expect(laidOut).toMatchObject({ x: 0, width: 60 + 13 / 16 });
    expect(pieceOf(laidOut, PINNED10B)).toMatchObject({ x: 30, width: 30 });
    expect(laidOut.pieces[0]).toMatchObject({ kind: 'filler', width: 1.5 });
    expect(laidOut.pieces[1]).toMatchObject({ kind: 'cabinet', width: 28.5 });
    // LL4 d anchor's dimensions match, but its ⚠ differs: 28.5 exceeds the default 9-inch minimum.
    expect(28.5).toBeGreaterThan(settings10b.minCabinetWidth);
    expect(laidOut.warnings).toEqual([]);
    expect(laidOut.errors).toEqual([]);
    expect(laidOut.pieces.at(-1)).toMatchObject({ kind: 'end_panel', x: 60, width: 13 / 16 });
    const piecesEnd = Math.max(...laidOut.pieces.map(({ x, width }) => x + width));
    expect(piecesEnd).toBe(60 + 13 / 16);
    expect(laidOut.x + laidOut.width - piecesEnd).toBe(0);
    expect(state).toMatchSnapshot();
  });

  it('move anchored run: refuses the move and leaves the room unchanged', () => {
    const stored = structuredClone(room10b);
    const before = structuredClone(stored);
    const result = moveRun(stored, WALL2, LEFT_TALL10, 5, settings10b);
    expect(result).toMatchObject({ ok: false, reason: 'anchored' });
    expect(result.room).toEqual(before);
    expect(stored).toEqual(before);
    const state = layoutState(result.room, settings10b);
    expect(state).toEqual(layoutState(before, settings10b));
    expect(state).toMatchSnapshot();
  });

  it('synced twice equals once', () => {
    const once = syncRoom(structuredClone(room10b), settings10b);
    expect(layoutState(syncRoom(once, settings10b), settings10b)).toEqual(layoutState(once, settings10b));
  });
});


const OPEN8 = 'e77c1c0c-b386-4716-bc71-0f23ec1e585c';
const LEFT_UPPER8 = 'c3b5d002-c0bc-421b-8d22-6bbd5ee060b6';
const RIGHT_UPPER8 = 'd63bd233-b318-473d-a13b-23c3a2b83b49';
const HOOD_LEFT8 = 'fe1b16b5-fdf8-4840-abbf-c55164603b10';
const HOOD_RIGHT8 = '97d7faa1-a7c5-4b71-8d7a-030d18a7b281';
const BASE_LEFT8 = '7d2ce208-b56f-447a-b162-fc585bbbf5a2';

function room8OnLine(value = 99) {
  const stored = structuredClone(room8);
  const wall = stored.walls.find(({ id }) => id === WALL4);
  wall.lines = [line('L1', value, { from: 'right' })];
  wall.runs.find(({ id }) => id === HOOD8).attach = attach('L1');
  const base = wall.runs.find(({ id }) => id === BASE8);
  base.autoCount = false;
  base.grid.cols.find(({ id }) => id === `${OPEN8}:col`).attach = attach('L1');
  return stored;
}

describe('LL4 Room 8 + L1 run and open column', () => {
  it.each([
    [99, 112, 96, 80, 58, 59],
    [100, 111, 95, 80, 57, 60],
    [41, 170, 154, 80, 116, 1],
  ])('line %s from right: holds the hood width and places the open column', (value, openX, hoodX, hoodWidth, leftWidth, rightWidth) => {
    const stored = room8OnLine(value);
    const state = layoutState(stored, settings8);
    expect(pieceOf(runOf(state, WALL4, BASE8), OPEN8)).toMatchObject({ x: openX, width: 48 });
    expect(runOf(state, WALL4, BASE8)).toMatchObject({ x: 38, width: 197 });
    expect(runOf(state, WALL4, HOOD8)).toMatchObject({ x: hoodX, width: hoodWidth });
    expect(runOf(state, WALL4, LEFT_UPPER8)).toMatchObject({ x: 38, width: leftWidth });
    expect(runOf(state, WALL4, RIGHT_UPPER8)).toMatchObject({ x: hoodX + hoodWidth, width: rightWidth });
    expect(wallOf(state, WALL4).joints.map(({ id, x }) => [id, x]))
      .toEqual([[BASE_LEFT8, 38], [HOOD_LEFT8, hoodX], [HOOD_RIGHT8, hoodX + hoodWidth]]);
    if (value === 41) {
      expect(state.diagnostics[RIGHT_UPPER8].warnings).toContainEqual({
        code: 'line-squeeze', message: 'Below minimum width because of line L1.',
      });
      expect(state.diagnostics[BASE8].warnings).toContainEqual({
        code: 'line-squeeze', pieceId: OPEN8,
        message: 'Cabinets beside it are below minimum width because of line L1.',
      });
      expect(state.diagnostics[BASE8].warnings.map(({ code, pieceId }) => [code, pieceId])).toEqual([
        ['line-squeeze', OPEN8],
        ['widths-not-rounded', 'db21d6ce-f4e6-482c-858a-40e9e2f6be7e'],
        ['wide-cabinet', 'db21d6ce-f4e6-482c-858a-40e9e2f6be7e'],
        ['wide-cabinet', '11bcf05a-a149-425a-97c2-2a609de36341'],
        ['narrow-cabinet', 'abc17c3d-0af2-4782-98f9-20df208e3fe5'],
        ['narrow-cabinet', '6957a96c-8332-4a9d-8eb0-02228eb79556'],
      ]);
      expect(state.diagnostics[RIGHT_UPPER8].errors.map(({ code }) => code))
        .toEqual(['over-constrained', 'anchor-too-narrow']);
    }
    const once = syncRoom(stored, settings8);
    expect(syncRoom(once, settings8)).toEqual(once);
    expect(state).toMatchSnapshot();
  });

  it('resizes the hood left to 81 and restores its centre to 136', () => {
    const result = resizeRun(room8OnLine(), WALL4, HOOD8, 81, 'left', settings8);
    expect(result.ok).toBe(true);
    const state = layoutState(result.room, settings8);
    expect(runOf(state, WALL4, HOOD8)).toMatchObject({ x: 95.5, width: 81 });
    expect(runOf(state, WALL4, LEFT_UPPER8)).toMatchObject({ x: 38, width: 57.5 });
    expect(runOf(state, WALL4, RIGHT_UPPER8)).toMatchObject({ x: 176.5, width: 58.5 });
    const once = syncRoom(result.room, settings8);
    expect(syncRoom(once, settings8)).toEqual(once);
    expect(state).toMatchSnapshot();
  });

  it('holds only the hood joints structurally, before or after placement', () => {
    const stored = room8OnLine();
    const expected = new Map([HOOD_LEFT8, HOOD_RIGHT8].map((id) => [id, { lineId: 'L1', runId: HOOD8 }]));
    expect(lineHeldJoints(stored.walls.find(({ id }) => id === WALL4))).toEqual(expected);
    expect(lineHeldJoints(syncRoom(stored, settings8).walls.find(({ id }) => id === WALL4))).toEqual(expected);
  });
});
