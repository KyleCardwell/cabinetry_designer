import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { stackChain, verticalChains } from '../dimensions.js';
import { elevationDimensions } from '../elevationDimensions.js';
import { gridFromItems, updateRootItem } from '../grid.js';

const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };
const manual = (value) => ({ value, source: 'manual' });
const segment = (kind, start, end) => ({ kind, start, end });
const plain = [segment('toe-kick', 0, 4), segment('box', 4, 34.5), segment('countertop', 34.5, 36)];

function fixture(columnId, offsets, inset = false) {
  const run = {
    id: 'r', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 0, width: 90, z: 4, height: 30.5, depth: 24,
    top: 'stone', style: { cabinetStyleId: inset ? 14 : 13 }, seamGap: 0,
    ends: { left: { type: 'none' }, right: { type: 'none' } },
    autoCount: false, maxCabinetWidth: null, heightMode: 'manual', overrides: {},
    anchors: { left: false, right: false },
    grid: gridFromItems('r', ['A', 'B', 'C'].map((id) => ({
      id, kind: 'cabinet', width: inset ? null : 30, face: { type: 'door' },
      ...(id === columnId ? offsets : {}),
    }))),
  };
  const wall = { id: 'w', x1: 0, y1: 0, x2: 120, y2: 0, height: 96, thickness: 4.5,
    flipped: false, connections: { start: null, end: null }, profile: {}, runs: [run], openings: [] };
  return { run, wall, room: { id: 'room', profile: {}, walls: [wall], wallOrder: ['w'] } };
}

function chain({ room, wall, run }, edge = 'left', stacked = false) {
  const upper = { ...run, id: 'upper', cabinetTypeId: CABINET_TYPE_IDS.UPPER, z: 54, height: 30,
    top: 'none', grid: gridFromItems('upper', [{ id: 'upper-box', kind: 'cabinet', width: null }]) };
  const inner = stacked
    ? stackChain(room, wall, [run, upper], settings, edge).inner
    : verticalChains(room, wall, { lowerRun: run, upperRun: null }, settings, edge).inner;
  return inner.filter(({ end }) => end <= 36);
}

describe('ST6 step a stepped edge chains', () => {
  it('anchor 1: separates A top 2 from the box below the unchanged countertop', () => {
    const expected = [plain[0], segment('box', 4, 32.5), segment('step', 32.5, 34.5), plain[2]];
    const f = fixture('A', { top: manual(2) });
    expect(chain(f)).toEqual(expected);
    expect(chain(f, 'left', true)).toEqual(expected);
    expect(chain(f, 'right')).toEqual(plain);
    expect(chain(fixture('C', { top: manual(2) }), 'right')).toEqual(expected);
    const step = elevationDimensions(f.room, f.wall, 'front', settings)
      .find(({ row, kind }) => row === 'left.inner' && kind === 'step');
    expect(step).toMatchObject({ orientation: 'vertical', start: 32.5, end: 34.5, text: '2' });
  });

  it('anchor 2: separates A bottom 3 from the unchanged toe kick', () => {
    const expected = [plain[0], segment('step', 4, 7), segment('box', 7, 34.5), plain[2]];
    const f = fixture('A', { bottom: manual(3) });
    expect(chain(f)).toEqual(expected);
    expect(chain(f, 'left', true)).toEqual(expected);
    expect(chain(fixture('C', { bottom: manual(3) }), 'right')).toEqual(expected);
  });

  it('anchor 3: leaves both edge chains unchanged when only B top is dropped', () => {
    const f = fixture('B', { top: manual(2) });
    for (const edge of ['left', 'right']) expect(chain(f, edge)).toEqual(plain);
    for (const edge of ['left', 'right']) {
      expect(chain(fixture('B', { top: manual(2) }, true), edge))
        .toEqual(chain(fixture(undefined, undefined, true), edge));
    }
  });

  it('anchor 4: ends the plain inset edge stack at 32.5 and labels its notch as a step', () => {
    const expected = [plain[0], segment('frame', 4, 5.5), segment('frame-opening', 5.5, 31),
      segment('frame', 31, 32.5), segment('step', 32.5, 34.5), plain[2]];
    expect(chain(fixture('A', { top: manual(2) }, true))).toEqual(expected);
    expect(chain(fixture('C', { top: manual(2) }, true), 'right')).toEqual(expected);
    expect(chain(fixture('A', { top: manual(2) }, true), 'left', true)).toEqual(expected);
  });

  it('combines offsets and ignores rejected offsets using the resolved box bounds', () => {
    expect(chain(fixture('A', { top: manual(2), bottom: manual(3) }))).toEqual([
      plain[0], segment('step', 4, 7), segment('box', 7, 32.5), segment('step', 32.5, 34.5), plain[2],
    ]);
    expect(chain(fixture('A', { top: manual(29.75) }))).toEqual(plain);
    expect(chain(fixture('A', { bottom: manual(3) }, true))).toEqual([
      plain[0], segment('step', 4, 7), segment('frame', 7, 8.5),
      segment('frame-opening', 8.5, 33), segment('frame', 33, 34.5), plain[2],
    ]);
  });

  it('preserves horizontal T-fillers inside a stepped nested edge column', () => {
    const f = fixture('A', { top: manual(2), bottom: manual(3) });
    f.run.tFiller = 'all';
    f.run.grid.cells[0].node = {
      id: 'A',
      cols: [{ id: 'A:c', size: null, sizeMode: 'auto' }],
      rows: [{ id: 'A:t', size: 6, sizeMode: 'manual' }, { id: 'A:b', size: null, sizeMode: 'auto' }],
      cells: ['A-top', 'A-bottom'].map((id, row) => ({
        col: 0, row, colSpan: 1, rowSpan: 1, node: { id, kind: 'cabinet', face: { type: 'door' } },
      })),
    };
    expect(chain(f)).toEqual([
      plain[0], segment('step', 4, 7), segment('box', 7, 25.75),
      segment('t-filler', 25.75, 27.25), segment('box', 27.25, 32.5),
      segment('step', 32.5, 34.5), plain[2],
    ]);
    f.run.grid = updateRootItem(f.run.grid, 'A', { top: undefined, bottom: undefined });
    expect(chain(f).some(({ kind }) => kind === 'step')).toBe(false);
  });

  it('keeps an upper frame drop below its stepped edge stack', () => {
    const f = fixture('A', { top: manual(2), bottom: manual(3) }, true);
    Object.assign(f.run, { cabinetTypeId: CABINET_TYPE_IDS.UPPER, z: 54, height: 30, top: 'none' });
    expect(verticalChains(f.room, f.wall, { lowerRun: null, upperRun: f.run }, settings).inner).toEqual([
      segment('open', 0, 53.25), segment('step', 53.25, 56.25), segment('frame', 56.25, 57.75),
      segment('frame-opening', 57.75, 80.5), segment('frame', 80.5, 82),
      segment('step', 82, 84), segment('open', 84, 96),
    ]);
  });
});
