import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { auto, fixed, room, run, wall } from '../../../test/builders.js';
import { shippingList } from '../../../reports/shippingList.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { resolveWall, syncRoom } from '../../model/room.js';
import { runScene } from '../../model/runScene.js';
import { teeFillers } from '../../model/tees.js';
import PieceProperties from '../properties/PieceProperties.jsx';

vi.mock('react', async (original) => ({ ...await original(), useMemo: (fn) => fn() }));
vi.mock('react-redux', () => ({ useDispatch: () => vi.fn() }));

const stored = JSON.parse(readFileSync(new URL('../../model/__tests__/fixtures/room10bt.json', import.meta.url), 'utf8'));
const anchors = [
  ['Kyle settings', { cornerFillerMinWidth: 2 }, 2.3125, 0.8125, 1.5625],
  ['defaults', {}, 1.8125, 0.3125, 1.0625],
];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : tree && typeof tree === 'object' ? text(tree.props?.children)
    : typeof tree === 'string' ? tree : '';

function context(r, settings, wallName) {
  const w = resolveWall(r, wallName ? r.walls.find(({ name }) => name === wallName) : r.walls[0]);
  const currentRun = w.runs[0];
  const scene = runScene(r, w, currentRun, settings);
  return { room: r, wall: w, run: currentRun, settings, scene,
    ...teeFillers(r, currentRun, scene.cells, settings) };
}

function expectEndNote(ctx, side, expected) {
  const tee = ctx.tees.find((candidate) => candidate.end === side);
  expect(ctx.notes.get(tee.id)[0]).toBe(expected);
  const row = shippingList(ctx.room, ctx.settings).rows.find(({ key }) => key === tee.id);
  expect(row.notes.filter((note) => note.startsWith('T-shape'))).toEqual([expected]);
  const piece = ctx.scene.drawnPieces.find(({ id }) => id === tee.id);
  const tree = PieceProperties({ ...ctx, layout: ctx.scene.result, cells: ctx.scene.cells,
    selectionContext: { piece, side, tee } });
  expect(text(tree)).toContain(expected);
}

describe('FX10 off-centre T notes', () => {
  it.each(anchors)('anchors 1–3: Room 10 BT notes with %s', (_label, overrides) => {
    const settings = { ...DEFAULT_SETTINGS, ...stored.settingsOverrides, ...overrides };
    const ctx = context(syncRoom(structuredClone(stored), settings), settings, 'Wall 2');
    expectEndNote(ctx, 'left', 'T-shape - 3/4" right offset');
    const seam = ctx.tees.find((tee) => !tee.end && tee.orientation === 'vertical');
    expect(seam).toMatchObject({ width: 1.5 });
    expect(ctx.notes.get(seam.id)[0]).toBe('T-shape');
    expect(shippingList(ctx.room, settings).rows.find(({ key }) => key === seam.id).notes)
      .toEqual(['T-shape']);
  });

  // The current Room 10 fixture resolves 1/16" wider than the spec's geometry.
  // Exercise the hand-checked geometry too, without changing those anchor values.
  it.each(anchors)('anchors 1–2: the supplied geometry with %s', (_label, overrides, width, start, end) => {
    const settings = { ...DEFAULT_SETTINGS, ...overrides };
    const r = room({ walls: [wall({ runs: [run({ width: 40, autoCount: false,
      items: [auto('cabinet')], tFiller: 'seams',
      ends: { left: { type: 'filler', width: end }, right: { type: 'none' } },
    })] })] });
    const ctx = context(r, settings);
    expect(ctx.tees.find(({ end }) => end === 'left')).toMatchObject({ x: 0, width, ret: { start, end } });
    expectEndNote(ctx, 'left', 'T-shape - 3/4" right offset');
  });

  it('anchor 3: a seam at 30 13/16 inches remains centred', () => {
    const r = room({ walls: [wall({ runs: [run({ width: 61.5625, autoCount: false,
      items: [fixed('left', 30), fixed('right', 30)], tFiller: 'seams',
      ends: { left: { type: 'filler', width: 1.5625 }, right: { type: 'none' } },
    })] })] });
    const ctx = context(r, DEFAULT_SETTINGS);
    const seam = ctx.tees.find((tee) => !tee.end);
    expect(seam).toMatchObject({ x: 30.8125, width: 1.5 });
    expect(ctx.notes.get(seam.id)[0]).toBe('T-shape');
  });

  it('anchor 4: a right end names the flat over the cabinet on the left', () => {
    const r = room({ walls: [wall({ runs: [run({ width: 40, autoCount: false,
      items: [auto('cabinet')], tFiller: 'seams',
      ends: { left: { type: 'none' }, right: { type: 'filler', width: 3 } },
    })] })] });
    expectEndNote(context(r, DEFAULT_SETTINGS), 'right', 'T-shape - 3/4" left offset');
  });

  it.each([
    [1.5, 'T-shape'],
    [1.5 + 1 / 64, 'T-shape'],
    [1.5 + 1 / 32, 'T-shape - 3/4" right offset'],
  ])('uses the strict 1/64-inch centring tolerance for filler width %s', (width, expected) => {
    const r = room({ walls: [wall({ runs: [run({ width: 40, autoCount: false,
      items: [auto('cabinet')], tFiller: 'seams',
      ends: { left: { type: 'filler', width }, right: { type: 'none' } },
    })] })] });
    expectEndNote(context(r, DEFAULT_SETTINGS), 'left', expected);
  });

  it('formats the actual flat from the box edge when the cover differs', () => {
    const settings = { ...DEFAULT_SETTINGS, teeCover: 0.5 };
    const r = room({ walls: [wall({ runs: [run({ autoCount: false,
      items: [auto('cabinet')], tFiller: 'seams',
      ends: { left: { type: 'none' }, right: { type: 'filler', width: 3 } },
    })] })] });
    expectEndNote(context(r, settings), 'right', 'T-shape - 1/2" left offset');
  });

  it('leaves horizontal Ts and return-up notes unchanged and emits the shape only once', () => {
    const settings = { ...DEFAULT_SETTINGS };
    const r = syncRoom(structuredClone(stored), settings);
    const ctx = context(r, settings, 'Wall 2');
    const horizontal = ctx.tees.filter(({ orientation }) => orientation === 'horizontal');
    expect(horizontal.length).toBeGreaterThan(0);
    for (const tee of horizontal) expect(ctx.notes.get(tee.id)[0]).toBe('T-shape');

    const upperRoom = room({ walls: [wall({ runs: [run({ width: 40, autoCount: false,
      cabinetTypeId: 2, z: 54, depth: 12, items: [auto('cabinet')], tFiller: 'seams',
      ends: { left: { type: 'filler', width: 3 }, right: { type: 'none' } },
    })] })], reportParts: { 'run-1:left': { note: 'last' } } });
    const upper = context(upperRoom, settings);
    expectEndNote(upper, 'left', 'T-shape - 3/4" right offset');
    expect(shippingList(upperRoom, settings).rows.find(({ key }) => key === 'run-1:left').notes)
      .toEqual(['T-shape - 3/4" right offset', 'return up 1/8"', 'last']);
  });
});
