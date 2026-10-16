import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { DEFAULT_DOOR_STYLE } from '../doorStyles.js';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
import { gridFromItems } from '../grid.js';
import { fillerAtBoxFace, planRunPieces } from '../planPieces.js';
import { resolveWall } from '../room.js';

const cabinet = (id, width, face) => ({ id, kind: 'cabinet', width, ...(face ? { face } : {}) });
const open = (id, width) => cabinet(id, width, { type: 'open' });
const middleItems = (right) => [
  cabinet('doors', 9), open('left', 8), { id: 'f', kind: 'filler', width: 3 }, right,
];

function planOf({ items = [cabinet('c', 27)], run: overrides = {}, settings = DEFAULT_SETTINGS,
  room: roomOverrides = {} } = {}) {
  const run = {
    id: 'r', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 0, width: 30, z: 4, height: 30.5, depth: 24,
    ends: { left: { type: 'filler', width: 3 }, right: { type: 'none', width: null } },
    autoCount: false, heightMode: 'manual', overrides: {}, anchors: { left: false, right: false },
    grid: gridFromItems('r', items), ...overrides,
  };
  const wall = {
    id: 'w', x1: 0, y1: 0, x2: 120, y2: 0, height: 108, thickness: 4.5,
    flipped: false, connections: { start: null, end: null }, profile: {}, runs: [run], openings: [],
  };
  const room = {
    id: 'room', profile: { ...settings.defaultProfile }, walls: [wall], wallOrder: ['w'],
    ...roomOverrides,
  };
  const view = resolveWall(room, wall);
  const layout = layoutRun(room, view, run, settings);
  return planRunPieces(room, view, run, settings, layout, runFaceLayouts(room, view, run, settings, layout));
}

function expectFiller(plan, key, face, ret) {
  const filler = plan.faces.find((piece) => piece.key === key);
  expect([filler.back, filler.front]).toEqual(face);
  const returns = plan.returns.filter((piece) => piece.key.startsWith(`${key}:`));
  expect(returns.length).toBeGreaterThan(0);
  for (const piece of returns) expect([piece.back, piece.front]).toEqual(ret);
}

describe('FL1 step b filler face lines and return tongues', () => {
  it('uses the run face line with independent filler thickness (P2, P3, P10)', () => {
    expectFiller(planOf({ run: { _doorThickness: 1 } }), 'r:left',
      [24.25, 25.0625], [21.875, 24.375]);
    const mdf = { ...DEFAULT_DOOR_STYLE, id: 'mdf', designId: 'slab-mdf', thickness: 0.75 };
    expectFiller(planOf({ run: { _doorThickness: 0.75 }, room: { doorStyles: [mdf], doorStyleId: 'mdf' } }),
      'r:left', [24.0625, 24.8125], [21.6875, 24.1875]);
    expectFiller(planOf({ settings: { ...DEFAULT_SETTINGS, fillerThickness: 0.75 } }),
      'r:left', [24.125, 24.875], [21.75, 24.25]);
  });

  it('puts a filler between two open cabinets at the box fronts despite other doors (P4)', () => {
    const plan = planOf({
      items: middleItems(open('right', 10)),
      run: { ends: { left: { type: 'none' }, right: { type: 'none' } } },
    });
    expectFiller(plan, 'f', [23.1875, 24], [20.8125, 23.3125]);
    expect(plan.returns.map(({ start, end }) => [start, end])).toEqual([[17, 17.75], [19.25, 20]]);
  });

  it('keeps the face line beside an open cabinet and a door cabinet (P5)', () => {
    expectFiller(planOf({
      items: middleItems(cabinet('right', 10)),
      run: { ends: { left: { type: 'none' }, right: { type: 'none' } } },
    }), 'f', [24.0625, 24.875], [21.6875, 24.1875]);
  });

  it('shifts the assembled filler once by the outset and honors the tongue setting (P9)', () => {
    expectFiller(planOf({ run: { outset: 2 } }), 'r:left',
      [26.0625, 26.875], [23.6875, 26.1875]);
    expectFiller(planOf({ settings: { ...DEFAULT_SETTINGS, fillerReturnTongue: 0.25 } }), 'r:left',
      [24.0625, 24.875], [21.8125, 24.3125]);
    expect(planOf({ run: { endFiller: { left: { returnDepth: 0 } } } }).returns).toEqual([]);
  });

  it('requires a touching cabinet with vertical overlap and no non-open resolved faces', () => {
    const filler = { x: 10, z: 10, width: 3, height: 10 };
    const left = { id: 'left', kind: 'cabinet', x: 0, z: 10, width: 10, height: 10 };
    const right = { ...left, id: 'right', x: 13 };
    const layouts = new Map([['left', { faces: [{ type: 'open' }] }]]);
    const atBox = (pieces) => fillerAtBoxFace(pieces, layouts, filler);
    expect(atBox([])).toBe(false);
    expect(atBox([{ ...left, kind: 'shelves' }])).toBe(false);
    expect(atBox([left, right])).toBe(true); // Missing layouts have no resolved faces.
    layouts.set('right', { faces: [] });
    expect(atBox([right])).toBe(true);
    layouts.set('right', { faces: [{ type: 'open' }, { type: 'drawer_front' }] });
    expect(atBox([left, right])).toBe(false);
    expect(atBox([{ ...left, x: 0.5e-6 }])).toBe(true);
    expect(atBox([{ ...left, x: -2e-6 }])).toBe(false);
    expect(atBox([{ ...left, z: 0 }])).toBe(false);
    expect(atBox([{ ...left, z: 0.5e-6 }])).toBe(false);
    expect(atBox([{ ...left, z: 2e-6 }])).toBe(true);
    expect(atBox([left, { ...right, z: 20 }])).toBe(true);
  });

  it('checks the touching nested cells, including doors below an open top cell', () => {
    const stack = {
      id: 'stack', cols: [{ id: 'col', size: null, sizeMode: 'auto' }],
      rows: [0, 1].map((row) => ({ id: `row${row}`, size: null, sizeMode: 'auto' })),
      cells: [open('top', null), cabinet('bottom', null)].map((node, row) => ({
        col: 0, row, colSpan: 1, rowSpan: 1, node,
      })),
    };
    const items = [{ id: 'column', kind: 'cabinet', width: 14, grid: stack }, cabinet('other', 13)];
    expectFiller(planOf({ items }), 'r:left', [24.0625, 24.875], [21.6875, 24.1875]);
    stack.cells[1].node.face = { type: 'open' };
    expectFiller(planOf({ items }), 'r:left', [23.1875, 24], [20.8125, 23.3125]);
  });
});
