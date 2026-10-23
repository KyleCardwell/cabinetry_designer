import { describe, expect, it } from 'vitest';
import { MAX_MID_SPLIT, isMidLayout, resolveMidLayout } from '../midLayout.js';

const AREA = { x: 3, z: 3, width: 24, height: 33 };
const WIDTHS = { rail: 3, stile: 3, over: 0, source: { rail: 'flat', stile: 'flat' } };
const rows = (children, extra = {}) => ({ split: 'rows', children, ...extra });
const cols = (children, extra = {}) => ({ split: 'cols', children, ...extra });
const panel = (path, x, z, width, height) => ({ path, x, z, width, height });
const mid = (kind, path, index, at, name, from, to, full, extra = {}) => ({
  kind, path, index, at, width: 3, source: 'flat', name, from, to, full, ...extra,
});
const resolve = (layout, widths = WIDTHS, options) => resolveMidLayout(layout, AREA, widths, options);

describe('mid layout resolver', () => {
  it('anchor 1: absent layout is one panel covering the area', () => {
    const root = panel('root', 3, 3, 24, 33);
    expect(resolve()).toEqual({ nodes: [root], panels: [root], mids: [], warnings: [] });
  });

  it('anchor 2: shares rows bottom to top around a full mid rail', () => {
    const result = resolve(rows([{}, {}]));
    const panels = [panel('root.0', 3, 3, 24, 15), panel('root.1', 3, 21, 24, 15)];
    expect(result).toEqual({
      nodes: [panel('root', 3, 3, 24, 33), ...panels], panels,
      mids: [mid('rail', 'root', 0, 19.5, 'MR1', 'LS', 'RS', true)], warnings: [],
    });
  });

  it('anchor 3: resolves nested columns and names stiles by their true x positions', () => {
    const layout = rows([cols([{}, { size: 8 }, {}]), cols([{}, {}]), {}]);
    const result = resolve(layout);
    expect(result.panels).toEqual([
      panel('root.0.0', 3, 3, 5, 9), panel('root.0.1', 11, 3, 8, 9), panel('root.0.2', 22, 3, 5, 9),
      panel('root.1.0', 3, 15, 10.5, 9), panel('root.1.1', 16.5, 15, 10.5, 9),
      panel('root.2', 3, 27, 24, 9),
    ]);
    expect(result.nodes).toEqual([
      panel('root', 3, 3, 24, 33), panel('root.0', 3, 3, 24, 9), ...result.panels.slice(0, 3),
      panel('root.1', 3, 15, 24, 9), ...result.panels.slice(3),
    ]);
    expect(result.mids).toEqual([
      mid('rail', 'root', 0, 13.5, 'MR1', 'LS', 'RS', true),
      mid('rail', 'root', 1, 25.5, 'MR2', 'LS', 'RS', true),
      mid('stile', 'root.0', 0, 9.5, 'MS1', 'BR', 'MR1', false),
      mid('stile', 'root.1', 0, 15, 'MS2', 'MR1', 'MR2', false),
      mid('stile', 'root.0', 1, 20.5, 'MS3', 'BR', 'MR1', false),
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('anchor 4: a nested rail butts into its containing stile', () => {
    const result = resolve(cols([rows([{}, {}]), {}]));
    expect(result.panels).toEqual([
      panel('root.0.0', 3, 3, 10.5, 15), panel('root.0.1', 3, 21, 10.5, 15),
      panel('root.1', 16.5, 3, 10.5, 33),
    ]);
    expect(result.mids).toEqual([
      mid('rail', 'root.0', 0, 19.5, 'MR1', 'LS', 'MS1', false),
      mid('stile', 'root', 0, 15, 'MS1', 'BR', 'TR', true),
    ]);
  });

  it('anchor 5: mirrored columns place child zero on the right', () => {
    const result = resolve(cols([{ size: 8 }, {}]), WIDTHS, { mirror: true });
    expect(result.panels).toEqual([panel('root.0', 19, 3, 8, 33), panel('root.1', 3, 3, 13, 33)]);
    expect(result.mids).toEqual([mid('stile', 'root', 0, 17.5, 'MS1', 'BR', 'TR', true)]);
  });

  it('anchor 6: a typed mid width changes sharing and has part source', () => {
    const result = resolve(rows([{}, {}], { mids: [{ width: 4 }] }));
    expect(result.panels).toEqual([panel('root.0', 3, 3, 24, 14.5), panel('root.1', 3, 21.5, 24, 14.5)]);
    expect(result.mids).toEqual([
      mid('rail', 'root', 0, 19.5, 'MR1', 'LS', 'RS', true, { width: 4, source: 'part' }),
    ]);
  });

  it('anchor 7: the last typed child gives when the node is overfull', () => {
    const result = resolve(rows([{ size: 20 }, { size: 20 }]));
    expect(result.panels).toEqual([panel('root.0', 3, 3, 24, 20), panel('root.1', 3, 26, 24, 10)]);
    expect(result.mids).toEqual([mid('rail', 'root', 0, 24.5, 'MR1', 'LS', 'RS', true)]);
    expect(result.warnings).toEqual([{ code: 'mid-layout-overfull', path: 'root' }]);
  });

  it('anchor 8: the last typed child grows when all typed sizes are underfull', () => {
    const result = resolve(rows([{ size: 10 }, { size: 10 }]));
    expect(result.panels).toEqual([panel('root.0', 3, 3, 24, 10), panel('root.1', 3, 16, 24, 20)]);
    expect(result.mids).toEqual([mid('rail', 'root', 0, 14.5, 'MR1', 'LS', 'RS', true)]);
    expect(result.warnings).toEqual([]);
  });

  it('anchor 9: molding adds overall width without changing the opening or center', () => {
    const result = resolve(cols([{}, {}]), { ...WIDTHS, stile: 3.25, over: 0.5 });
    expect(result.mids).toEqual([
      mid('stile', 'root', 0, 15, 'MS1', 'BR', 'TR', true, { width: 3.25, overall: 4.25 }),
    ]);
    expect(result.panels).toEqual([
      panel('root.0', 3, 3, 10.375, 33), panel('root.1', 16.625, 3, 10.375, 33),
    ]);
  });

  it('anchor 10: validates alternating splits, child counts, mid counts, and positive sizes', () => {
    expect(MAX_MID_SPLIT).toBe(8);
    for (const layout of [
      rows([rows([{}, {}]), {}]), rows([{}]), rows(Array.from({ length: 9 }, () => ({}))),
      rows([{}, {}], { mids: [] }), rows([{ size: 0 }, {}]),
      undefined, null, {}, [], rows([{}, {}], { size: 5 }),
      rows([{ size: NaN }, {}]), rows([{ size: Infinity }, {}]), rows([{ size: -1 }, {}]),
      rows([{}, {}], { mids: [{ width: 0 }] }), rows([{}, {}], { mids: [{ width: '3' }] }),
      rows([{}, {}], { mids: [{ at: 2 }] }), rows([{}, { children: [] }]),
      rows(new Array(2)), rows([{}, {}], { mids: new Array(1) }),
    ]) expect(isMidLayout(layout)).toBe(false);
    for (const layout of [
      rows([{}, {}]), cols([{ size: 8 }, {}]), rows(Array.from({ length: 8 }, () => ({}))),
      rows([cols([{}, {}], { size: 12 }), {}], { mids: [{ width: 4 }] }),
      cols([{}, {}, {}], { mids: [{}, { width: 2 }] }), rows([{}, {}], { mids: [{}] }),
    ]) expect(isMidLayout(layout)).toBe(true);
  });

  it('mirrors every nested column while preserving true left and right bounding members', () => {
    const layout = rows([cols([rows([{}, {}]), {}]), {}]);
    const before = structuredClone({ layout, area: AREA, widths: WIDTHS });
    const result = resolve(layout, WIDTHS, { mirror: true });
    expect(result.panels).toEqual([
      panel('root.0.0.0', 16.5, 3, 10.5, 6), panel('root.0.0.1', 16.5, 12, 10.5, 6),
      panel('root.0.1', 3, 3, 10.5, 15), panel('root.1', 3, 21, 24, 15),
    ]);
    expect(result.mids).toEqual([
      mid('rail', 'root.0.0', 0, 10.5, 'MR1', 'MS1', 'RS', false),
      mid('rail', 'root', 0, 19.5, 'MR2', 'LS', 'RS', true),
      mid('stile', 'root.0', 0, 15, 'MS1', 'BR', 'MR2', false),
    ]);
    expect({ layout, area: AREA, widths: WIDTHS }).toEqual(before);
  });

  it('breaks rail coordinate ties by x and stile ties by z', () => {
    const layout = rows([cols([rows([{}, {}]), rows([{}, {}])]), cols([{}, {}])]);
    for (const mirror of [false, true]) {
      const { mids } = resolve(layout, WIDTHS, { mirror });
      expect(mids.map(({ name, at, path, from, to }) => ({ name, at, path, from, to }))).toEqual([
        { name: 'MR1', at: 10.5, path: `root.0.${mirror ? 1 : 0}`, from: 'LS', to: 'MS1' },
        { name: 'MR2', at: 10.5, path: `root.0.${mirror ? 0 : 1}`, from: 'MS1', to: 'RS' },
        { name: 'MR3', at: 19.5, path: 'root', from: 'LS', to: 'RS' },
        { name: 'MS1', at: 15, path: 'root.0', from: 'BR', to: 'MR3' },
        { name: 'MS2', at: 15, path: 'root.1', from: 'MR3', to: 'TR' },
      ]);
    }
  });

  it('keeps mids and nodes for zero or negative children, with warnings on the owning node', () => {
    const layout = cols([rows([{ size: 30 }, {}, { size: 10 }]), {}]);
    const result = resolve(layout);
    expect(result.nodes.filter(({ path }) => path.startsWith('root.0.')).map(({ height }) => height))
      .toEqual([30, 0, -3]);
    expect(result.panels.map(({ path }) => path)).toEqual(['root.0.0', 'root.1']);
    expect(result.mids).toHaveLength(3);
    expect(result.warnings).toEqual([{ code: 'mid-layout-overfull', path: 'root.0' }]);
    const exhausted = resolve(rows([{ size: 30 }, {}]));
    expect(exhausted.panels).toEqual([panel('root.0', 3, 3, 24, 30)]);
    expect(exhausted.mids).toHaveLength(1);
    expect(exhausted.warnings).toEqual([{ code: 'mid-layout-overfull', path: 'root' }]);
    const tiny = resolve(rows([{}, {}]), { ...WIDTHS, rail: 33 - 1e-6 });
    expect(tiny.panels).toEqual([]);
    expect(tiny.warnings).toEqual([{ code: 'mid-layout-overfull', path: 'root' }]);
  });

  it('uses style defaults per kind, part overrides, and zero-width slab splits', () => {
    const layout = rows([cols([{}, {}], { mids: [{ width: 2 }] }), cols([{}, {}])]);
    const widths = { rail: 4, stile: 3.25, over: 0.5, source: { rail: 'style', stile: 'style' } };
    expect(resolve(layout, widths).mids.map(({ kind, width, source, overall }) => ({ kind, width, source, overall })))
      .toEqual([
        { kind: 'rail', width: 4, source: 'style', overall: 5 },
        { kind: 'stile', width: 2, source: 'part', overall: 3 },
        { kind: 'stile', width: 3.25, source: 'style', overall: 4.25 },
      ]);
    const slab = resolveMidLayout(rows([cols([{}, {}]), {}]), { x: 0, z: 0, width: 30, height: 39 },
      { ...WIDTHS, rail: 0, stile: 0 });
    expect(slab.panels).toEqual([
      panel('root.0.0', 0, 0, 15, 19.5), panel('root.0.1', 15, 0, 15, 19.5),
      panel('root.1', 0, 19.5, 30, 19.5),
    ]);
    expect(slab.mids.map(({ width, at }) => ({ width, at }))).toEqual([
      { width: 0, at: 19.5 }, { width: 0, at: 15 },
    ]);
    expect(slab.warnings).toEqual([]);
  });
});
