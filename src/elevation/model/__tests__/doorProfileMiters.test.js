import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from '../doorStyles.js';
import { partDetail } from '../doorDetails.js';
import { doorProfileOffsets, partProfileLines } from '../doorProfileLines.js';

const { profiles } = JSON.parse(readFileSync(new URL('./fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const [FIVE, SLAB, SLAB_AM] = DOOR_DESIGNS;
const rect = (width, height, x = 0, z = 0) => ({ x, z, width, height });
const segments = (values) => values.map(([x1, z1, x2, z2]) => ({ x1, z1, x2, z2 }));
const am = (offset) => ({ profileId: 'am1', offset });
function build(design, part, picks = {}, appliedMoldings = [], sizes, library = profiles) {
  const style = { ...DEFAULT_DOOR_STYLE, profiles: { ...DEFAULT_DOOR_STYLE.profiles, ...picks }, appliedMoldings };
  const offsets = doorProfileOffsets(style, design, library);
  const detail = partDetail(style, design, part, sizes, offsets.slots.outside?.reachOut ?? 0, offsets.applied);
  return { detail, fit: partProfileLines(offsets, detail, part) };
}

describe('Step 481 profile miters', () => {
  it('anchor 1: inside span runs from the opening to the outer profile edge', () => {
    expect(build(FIVE, rect(18, 30), { inside: 'in58' }).fit.miters).toEqual(segments([
      [3, 3, 2.375, 2.375], [15, 3, 15.625, 2.375],
      [15, 27, 15.625, 27.625], [3, 27, 2.375, 27.625],
    ]));
  });

  it('anchor 2: outside span runs from the inner profile edge to the outline', () => {
    expect(build(FIVE, rect(18, 30), { outside: 'out38' }).fit.miters).toEqual(segments([
      [0.375, 0.375, 0, 0], [17.625, 0.375, 18, 0],
      [17.625, 29.625, 18, 30], [0.375, 29.625, 0, 30],
    ]));
  });

  it('anchor 3: covered applied moldings draw miters in list order at their offsets', () => {
    const { fit } = build(SLAB_AM, rect(15, 15), {}, [am(1), am(2.5)]);
    expect(fit.openingsShown).toBe(false);
    expect(fit.miters).toEqual(segments([
      [2, 2, 1, 1], [13, 2, 14, 1], [13, 13, 14, 14], [2, 13, 1, 14],
      [3.5, 3.5, 2.5, 2.5], [11.5, 3.5, 12.5, 2.5],
      [11.5, 11.5, 12.5, 12.5], [3.5, 11.5, 2.5, 12.5],
    ]));
  });

  it('anchor 4: each mid-rail opening has four miters', () => {
    const { detail, fit } = build(FIVE, rect(18, 40), { inside: 'in58' }, [], {
      midRails: [{ at: 20, width: 3 }],
    });
    expect(detail.openings).toEqual([
      { x: 3, z: 3, width: 12, height: 15.5 }, { x: 3, z: 21.5, width: 12, height: 15.5 },
    ]);
    expect(fit.miters).toEqual(segments([
      [3, 3, 2.375, 2.375], [15, 3, 15.625, 2.375],
      [15, 18.5, 15.625, 19.125], [3, 18.5, 2.375, 19.125],
      [3, 21.5, 2.375, 20.875], [15, 21.5, 15.625, 20.875],
      [15, 37, 15.625, 37.625], [3, 37, 2.375, 37.625],
    ]));
  });

  it('anchor 5: plain moldings and square profiles draw no miters', () => {
    expect(build(SLAB_AM, rect(15, 15), {}, [{ profileId: null, offset: 1 }]).fit.miters).toEqual([]);
    for (const design of DOOR_DESIGNS) expect(build(design, rect(18, 30)).fit.miters).toEqual([]);
  });

  it('uses full geometry bounds, clips hidden panel spans, and deduplicates in per-opening slot order', () => {
    const inside = { ...profiles.find(({ id }) => id === 'am1'), id: 'inside', kind: 'door_inside',
      drawnPoints: { elevation: [] } };
    const panel = { ...inside, id: 'panel', kind: 'door_panel' };
    const library = [...profiles, inside, panel];
    const { fit } = build(FIVE, rect(18, 30), { outside: 'out38', inside: 'inside', panel: 'panel' },
      [am(0), am(1), am(1)], { midStiles: [{ at: 9, width: 3 }] }, library);
    expect(fit.openingsShown).toBe(false);
    // Outside first, then inside, visible panel span, and the distinct molding for each opening.
    expect(fit.miters).toEqual(segments([
      [0.375, 0.375, 0, 0], [17.625, 0.375, 18, 0],
      [17.625, 29.625, 18, 30], [0.375, 29.625, 0, 30],
      [3.75, 3.75, 2.75, 2.75], [6.75, 3.75, 7.75, 2.75],
      [6.75, 26.25, 7.75, 27.25], [3.75, 26.25, 2.75, 27.25],
      [3.75, 3.75, 3, 3], [6.75, 3.75, 7.5, 3],
      [6.75, 26.25, 7.5, 27], [3.75, 26.25, 3, 27],
      [4.75, 4.75, 3.75, 3.75], [5.75, 4.75, 6.75, 3.75],
      [5.75, 25.25, 6.75, 26.25], [4.75, 25.25, 3.75, 26.25],
      [11.25, 3.75, 10.25, 2.75], [14.25, 3.75, 15.25, 2.75],
      [14.25, 26.25, 15.25, 27.25], [11.25, 26.25, 10.25, 27.25],
      [11.25, 3.75, 10.5, 3], [14.25, 3.75, 15, 3],
      [14.25, 26.25, 15, 27], [11.25, 26.25, 10.5, 27],
      [12.25, 4.75, 11.25, 3.75], [13.25, 4.75, 14.25, 3.75],
      [13.25, 25.25, 14.25, 26.25], [12.25, 25.25, 11.25, 26.25],
    ]));
  });

  it('skips spans with invalid rectangles or negligible width and rounds translated endpoints', () => {
    expect(build(FIVE, rect(18, 30), { inside: 'in58' }, [], { stiles: { left: 0.25 } }).fit.miters).toEqual([]);
    expect(build(SLAB_AM, rect(2, 15), {}, [am(0)]).fit.miters).toEqual([]);
    expect(build(FIVE, rect(18, 30), { panel: 'am1' }).fit.miters).toEqual([]); // Wrong kind.
    const zero = { ...profiles.find(({ id }) => id === 'in58'), id: 'zero', geometry: {
      units: 'in', points: { a: [0, 0], b: [1e-6, -0.5] },
      loops: [{ id: 'L1', closed: false, segs: [{ type: 'line', from: 'a', to: 'b' }] }],
    }, drawnPoints: { elevation: [] } };
    expect(build(FIVE, rect(18, 30), { inside: 'zero' }, [], undefined, [zero]).fit.miters).toEqual([]);
    const { fit } = build(SLAB, rect(18, 30, 0.12345678, 0.23456789), { outside: 'out38' });
    expect(fit.miters).toEqual(segments([
      [0.498457, 0.609568, 0.123457, 0.234568], [17.748457, 0.609568, 18.123457, 0.234568],
      [17.748457, 29.859568, 18.123457, 30.234568], [0.498457, 29.859568, 0.123457, 30.234568],
    ]));
  });
});
