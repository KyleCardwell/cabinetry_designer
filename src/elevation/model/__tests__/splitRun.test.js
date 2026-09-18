import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { syncRoom } from '../room.js';
import { splitRun, syncAutoItems } from '../splitRun.js';

function auto(id) {
  return { id, kind: 'cabinet', width: null };
}

function fixed(id, width) {
  return { id, kind: 'cabinet', width };
}

function pinned(id, width, anchor = 'center', value = 0) {
  return {
    id,
    kind: 'cabinet',
    width,
    pin: {
      anchor,
      from: 'left',
      openingId: null,
      openingAnchor: 'center',
      value,
    },
  };
}

function makeRun(overrides = {}) {
  return {
    id: 'run-1',
    cabinetTypeId: CABINET_TYPE_IDS.BASE,
    x: 0,
    width: 120,
    z: DEFAULT_SETTINGS.defaultProfile.toeKickHeight,
    height: DEFAULT_SETTINGS.defaultProfile.baseBoxHeight,
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
  it('15. solves the one-pin worked example without a rounding warning', () => {
    const run = makeRun({ items: [auto('a'), pinned('b', null), auto('c'), auto('d')] });
    const result = splitRun(run, DEFAULT_SETTINGS, { pinTargets: { b: 48 } });

    expect(widths(result)).toEqual([1.5, 32, 29, 28, 28, 1.5]);
    expect(widths(result).reduce((sum, width) => sum + width, 0)).toBe(120);
    const pinnedPiece = result.pieces.find((piece) => piece.id === 'b');
    expect(pinnedPiece.x + pinnedPiece.width / 2).toBe(48);
    expect(codes(result.warnings)).not.toContain('widths-not-rounded');
  });

  it('16. resolves the same one-pin layout from the cabinet left edge', () => {
    const run = makeRun({
      items: [auto('a'), pinned('b', null, 'left'), auto('c'), auto('d')],
    });
    const result = splitRun(run, DEFAULT_SETTINGS, { pinTargets: { b: 33.5 } });

    expect(widths(result)).toEqual([1.5, 32, 29, 28, 28, 1.5]);
  });

  it('17. retains pass-one pin width and warns for wide segment cabinets', () => {
    const run = makeRun({ items: [auto('a'), auto('b'), pinned('c', null), auto('d')] });
    const result = splitRun(run, DEFAULT_SETTINGS, { pinTargets: { c: 90 } });

    expect(widths(result)).toEqual([1.5, 37, 37, 29, 14, 1.5]);
    expect(result.warnings.filter((entry) => entry.code === 'wide-cabinet'))
      .toEqual([
        expect.objectContaining({ pieceId: 'a' }),
        expect.objectContaining({ pieceId: 'b' }),
      ]);
  });

  it('18. solves a two-pin run with one interior cabinet', () => {
    const run = makeRun({
      items: [auto('a'), pinned('b', 23), auto('c'), pinned('d', 23), auto('e')],
    });
    const result = splitRun(run, DEFAULT_SETTINGS, { pinTargets: { b: 36, d: 84 } });

    expect(widths(result)).toEqual([1.5, 23, 23, 25, 23, 23, 1.5]);
    expect(result.pieces.find((piece) => piece.id === 'b').x + 11.5).toBe(36);
    expect(result.pieces.find((piece) => piece.id === 'd').x + 11.5).toBe(84);
    expect(codes(result.warnings)).not.toContain('widths-not-rounded');
  });

  it('19. concentrates an interior remainder in the chosen absorber', () => {
    const items = [
      auto('a'),
      pinned('b', 19.5),
      auto('c'),
      auto('d'),
      pinned('e', 19.5),
      auto('f'),
    ];
    const run = makeRun({ items });
    const result = splitRun(run, DEFAULT_SETTINGS, { pinTargets: { b: 30, e: 90 } });
    expect(widths(result)).toEqual([1.75, 18.5, 19.5, 20, 20.5, 19.5, 18.5, 1.75]);
    expect(result.pieces.find((piece) => piece.id === 'd').absorbed).toBe(0.5);
    expect(codes(result.warnings)).not.toContain('widths-not-rounded');

    const firstAbsorbs = splitRun({
      ...run,
      items: items.map((item) => (item.id === 'c' ? { ...item, absorb: true } : item)),
    }, DEFAULT_SETTINGS, { pinTargets: { b: 30, e: 90 } });
    expect(widths(firstAbsorbs))
      .toEqual([1.75, 18.5, 19.5, 20.5, 20, 19.5, 18.5, 1.75]);
    expect(firstAbsorbs.pieces.find((piece) => piece.id === 'c').absorbed).toBe(0.5);
  });

  it('21. grows a free run end to make an outer pin reachable', () => {
    const run = makeRun({
      items: [auto('a'), auto('b'), auto('c'), auto('d'), pinned('e', null, 'center', 112)],
      anchors: { left: false, right: false },
      heightMode: 'manual',
      overrides: {},
    });
    const wall = {
      id: 'wall',
      name: '',
      numberOverride: null,
      x1: 0,
      y1: 0,
      x2: 144,
      y2: 0,
      height: 96,
      thickness: 4.5,
      flipped: false,
      connections: { start: null, end: null },
      profile: {},
      runs: [run],
      openings: [],
    };
    const room = {
      id: 'room',
      name: 'Room',
      profile: { ...DEFAULT_SETTINGS.defaultProfile },
      wallOrder: ['wall'],
      walls: [wall],
    };
    const grown = syncRoom(room, DEFAULT_SETTINGS).walls[0].runs[0];
    const result = splitRun(grown, DEFAULT_SETTINGS, { pinTargets: { e: 112 } });

    expect(grown).toMatchObject({ x: 0, width: 125 });
    expect(widths(result)).toEqual([2.5, 24.5, 24.5, 24.5, 24.5, 23, 1.5]);
    expect(result.pieces.find((piece) => piece.id === 'e').x + 11.5).toBe(112);
    expect(codes(result.warnings)).not.toContain('pin-unreachable');
  });

  it('22. clamps a pin when its run end is unable to grow', () => {
    const run = makeRun({
      anchors: { left: false, right: true },
      items: [auto('a'), auto('b'), auto('c'), auto('d'), pinned('e', 23)],
    });
    const result = splitRun(run, DEFAULT_SETTINGS, { pinTargets: { e: 112 } });
    const piece = result.pieces.find((candidate) => candidate.id === 'e');

    expect(piece.x + piece.width / 2).toBe(107);
    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: 'pin-unreachable',
      pieceId: 'e',
      message: expect.stringMatching(/112.*107/),
    }));
  });

  it('23. clamps a short middle segment because run growth cannot widen it', () => {
    const run = makeRun({
      items: [
        auto('a'),
        pinned('b', 19.5),
        auto('c'),
        auto('d'),
        pinned('e', 19.5),
        auto('f'),
      ],
    });
    const result = splitRun(run, DEFAULT_SETTINGS, { pinTargets: { b: 30, e: 40 } });
    const later = result.pieces.find((piece) => piece.id === 'e');

    expect(later.x + later.width / 2).toBe(67.5);
    expect(result.warnings).toContainEqual(expect.objectContaining({
      code: 'pin-unreachable',
      pieceId: 'e',
      message: expect.stringMatching(/cannot widen a middle pin segment/),
    }));
  });

  it('24. errors for an unfilled gap between adjacent pins but accepts zero gap', () => {
    const run = makeRun({
      items: [auto('a'), pinned('b', 23), pinned('c', 23), auto('d')],
    });
    const gap = splitRun(run, DEFAULT_SETTINGS, { pinTargets: { b: 36, c: 84 } });
    expect(gap.errors).toContainEqual(expect.objectContaining({
      code: 'pin-gap',
      message: expect.stringMatching(/b.*c/),
    }));

    const touching = splitRun(run, DEFAULT_SETTINGS, { pinTargets: { b: 36, c: 59 } });
    expect(codes(touching.errors)).not.toContain('pin-gap');
  });

  it('25. preserves the established no-pin no-flex remainder behavior', () => {
    const run = makeRun({
      width: 61.25,
      ends: {
        left: { type: 'none', width: null },
        right: { type: 'none', width: null },
      },
      items: [auto('a'), auto('b')],
    });
    expect(widths(splitRun(run, DEFAULT_SETTINGS))).toEqual([30.625, 30.625]);
  });

  it('7. distributes extra width above unequal per-side filler minimums', () => {
    const run = makeRun({ items: [auto('a'), auto('b'), auto('c'), auto('d')] });
    const result = splitRun(run, DEFAULT_SETTINGS, {
      endMinWidths: { left: 1.5, right: 3 },
    });

    expect(widths(result)).toEqual([2.25, 28.5, 28.5, 28.5, 28.5, 3.75]);
    expect(widths(result).reduce((sum, width) => sum + width, 0)).toBe(120);
  });

  it('8. preserves the established result when both filler minimums are equal', () => {
    const run = makeRun({ items: [auto('a'), auto('b'), auto('c'), auto('d')] });
    const result = splitRun(run, DEFAULT_SETTINGS, {
      endMinWidths: { left: 1.5, right: 1.5 },
    });

    expect(widths(result)).toEqual([2, 29, 29, 29, 29, 2]);
  });

  it('9. gives one flex filler its minimum plus all distributable extra', () => {
    const run = makeRun({
      width: 96,
      ends: {
        left: { type: 'end_panel', width: null },
        right: { type: 'filler', width: null },
      },
      items: [auto('a'), auto('b'), auto('c')],
    });
    const result = splitRun(run, DEFAULT_SETTINGS, {
      endMinWidths: { left: 1.5, right: 3 },
    });

    expect(widths(result)).toEqual([0.75, 30.5, 30.5, 30.5, 3.75]);
    expect(widths(result).reduce((sum, width) => sum + width, 0)).toBe(96);
  });

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

  it('uses an explicit end-panel width instead of the default thickness', () => {
    const run = makeRun({
      width: 62,
      ends: {
        left: { type: 'end_panel', width: 2 },
        right: { type: 'none', width: null },
      },
      items: [auto('a'), auto('b')],
    });
    const result = splitRun(run, DEFAULT_SETTINGS);

    expect(widths(result)).toEqual([2, 30, 30]);
    expect(result.pieces.map((piece) => piece.x)).toEqual([0, 2, 32]);
    expect(result.errors).toEqual([]);
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
