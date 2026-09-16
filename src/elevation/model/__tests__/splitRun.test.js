import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { splitRun, syncAutoItems } from '../splitRun.js';

function auto(id) {
  return { id, kind: 'cabinet', width: null };
}

function fixed(id, width) {
  return { id, kind: 'cabinet', width };
}

function makeRun(overrides = {}) {
  return {
    id: 'run-1',
    cabinetTypeId: CABINET_TYPE_IDS.BASE,
    x: 0,
    width: 120,
    z: DEFAULT_SETTINGS.toeKickHeight,
    height: DEFAULT_SETTINGS.baseBoxHeight,
    depth: DEFAULT_SETTINGS.baseDepth,
    ends: {
      left: { type: 'filler', width: null },
      right: { type: 'filler', width: null },
    },
    autoCount: false,
    maxCabinetWidth: null,
    items: [],
    ...overrides,
  };
}

function widths(result) {
  return result.pieces.map((piece) => piece.width);
}

function codes(entries) {
  return entries.map((entry) => entry.code);
}

describe('splitRun', () => {
  it('splits a 120-inch run into four rounded cabinets and two flex fillers', () => {
    const run = makeRun({ items: [auto('a'), auto('b'), auto('c'), auto('d')] });
    const result = splitRun(run, DEFAULT_SETTINGS);

    expect(widths(result)).toEqual([2, 29, 29, 29, 29, 2]);
    expect(result.warnings).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('positions an end panel, three cabinets, and a right flex filler', () => {
    const initial = makeRun({
      width: 96,
      autoCount: true,
      ends: {
        left: { type: 'end_panel', width: null },
        right: { type: 'filler', width: null },
      },
    });
    const result = splitRun(syncAutoItems(initial, DEFAULT_SETTINGS), DEFAULT_SETTINGS);

    expect(widths(result)).toEqual([0.75, 31, 31, 31, 2.25]);
    expect(result.pieces.map((piece) => piece.x)).toEqual([0, 0.75, 31.75, 62.75, 93.75]);
  });

  it('warns for both wide autos alongside a fixed cabinet', () => {
    const run = makeRun({
      items: [auto('auto-left'), fixed('fixed', 36), auto('auto-right')],
    });
    const result = splitRun(run, DEFAULT_SETTINGS);

    expect(widths(result)).toEqual([1.5, 40.5, 36, 40.5, 1.5]);
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: 'wide-cabinet', pieceId: 'auto-left' }),
      expect.objectContaining({ code: 'wide-cabinet', pieceId: 'auto-right' }),
    ]);
  });

  it('uses the auto-count synchronized item after a fixed cabinet', () => {
    const run = makeRun({
      autoCount: true,
      items: [auto('auto-left'), fixed('fixed', 36), auto('auto-right')],
    });
    const synced = syncAutoItems(run, DEFAULT_SETTINGS);
    const result = splitRun(synced, DEFAULT_SETTINGS);

    expect(synced.items).toHaveLength(4);
    expect(widths(result)).toEqual([1.5, 27, 36, 27, 27, 1.5]);
  });

  it('honors fixed three-inch fillers', () => {
    const run = makeRun({
      width: 60,
      ends: {
        left: { type: 'filler', width: 3 },
        right: { type: 'filler', width: 3 },
      },
      items: [auto('a'), auto('b')],
    });
    const result = splitRun(run, DEFAULT_SETTINGS);

    expect(widths(result)).toEqual([3, 27, 27, 3]);
    expect(result.warnings).toEqual([]);
  });

  it('splits 61 inches evenly without flex fillers', () => {
    const run = makeRun({
      width: 61,
      ends: {
        left: { type: 'none', width: null },
        right: { type: 'none', width: null },
      },
      items: [auto('a'), auto('b')],
    });
    const result = splitRun(run, DEFAULT_SETTINGS);

    expect(widths(result)).toEqual([30.5, 30.5]);
    expect(result.warnings).toEqual([]);
  });

  it('warns when no-flex auto widths are not cabinet-rounding multiples', () => {
    const run = makeRun({
      width: 61.25,
      ends: {
        left: { type: 'none', width: null },
        right: { type: 'none', width: null },
      },
      items: [auto('a'), auto('b')],
    });
    const result = splitRun(run, DEFAULT_SETTINGS);

    expect(widths(result)).toEqual([30.625, 30.625]);
    expect(codes(result.warnings)).toContain('widths-not-rounded');
  });

  it('reports an over-constrained run and still returns its fixed pieces', () => {
    const run = makeRun({ width: 30, items: [fixed('fixed', 36)] });
    const result = splitRun(run, DEFAULT_SETTINGS);

    expect(codes(result.errors)).toEqual(['over-constrained']);
    expect(widths(result)).toEqual([0, 36, 0]);
  });

  it('assigns exact sixteenth-inch fillers for a 100 1/8-inch run', () => {
    const initial = makeRun({ width: 100.125, autoCount: true });
    const result = splitRun(syncAutoItems(initial, DEFAULT_SETTINGS), DEFAULT_SETTINGS);

    expect(widths(result)).toEqual([2.0625, 32, 32, 32, 2.0625]);
  });

  it('preserves the fill and max-width invariants across the required range', () => {
    for (let eighths = 30 * 8; eighths <= 240 * 8; eighths += 1) {
      const width = eighths / 8;
      const initial = makeRun({ width, autoCount: true });
      const result = splitRun(syncAutoItems(initial, DEFAULT_SETTINGS), DEFAULT_SETTINGS);
      const total = result.pieces.reduce((sum, piece) => sum + piece.width, 0);
      const cabinets = result.pieces.filter((piece) => piece.kind === 'cabinet');
      const fillers = result.pieces.filter((piece) => piece.kind === 'filler');

      expect(result.errors, `errors at run width ${width}`).toEqual([]);
      expect(total, `sum at run width ${width}`).toBeCloseTo(width, 6);
      expect(cabinets.every((piece) => piece.width <= 36), `cabinet max at ${width}`).toBe(true);
      expect(fillers.every((piece) => piece.width >= 1.5), `filler min at ${width}`).toBe(true);
    }
  });

  it('reports does-not-fill when fixed pieces leave unused space without flex or autos', () => {
    const run = makeRun({
      width: 40,
      ends: {
        left: { type: 'none', width: null },
        right: { type: 'none', width: null },
      },
      items: [fixed('fixed', 36)],
    });

    expect(codes(splitRun(run, DEFAULT_SETTINGS).errors)).toEqual(['does-not-fill']);
  });

  it('gives a lone right flex filler the fractional remainder', () => {
    const run = makeRun({
      width: 40.1,
      ends: {
        left: { type: 'none', width: null },
        right: { type: 'filler', width: null },
      },
      items: [auto('a')],
    });
    const result = splitRun(run, DEFAULT_SETTINGS);
    const total = result.pieces.reduce((sum, piece) => sum + piece.width, 0);

    expect(total).toBeCloseTo(40.1, 10);
  });
});

describe('syncAutoItems', () => {
  it('creates four auto cabinets for a 120-inch run', () => {
    const run = makeRun({ autoCount: true });
    const synced = syncAutoItems(run, DEFAULT_SETTINGS);

    expect(synced.items).toHaveLength(4);
    expect(synced.items.every((item) => item.kind === 'cabinet' && item.width === null)).toBe(true);
  });

  it('returns an auto-count-disabled run unchanged', () => {
    const run = makeRun({ items: [auto('a')] });
    expect(syncAutoItems(run, DEFAULT_SETTINGS)).toBe(run);
  });

  it('removes only auto cabinets from the end while preserving fixed items and fillers', () => {
    const interiorFiller = { id: 'filler', kind: 'filler', width: 3 };
    const run = makeRun({
      width: 30,
      autoCount: true,
      items: [auto('a'), fixed('fixed', 12), interiorFiller, auto('b')],
    });
    const synced = syncAutoItems(run, DEFAULT_SETTINGS);

    expect(synced.items).toEqual([auto('a'), fixed('fixed', 12), interiorFiller]);
  });
});
