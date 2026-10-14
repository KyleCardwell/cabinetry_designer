import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from '../doorStyles.js';
import { partDetail } from '../doorDetails.js';
import { doorProfileOffsets, partProfileLines } from '../doorProfileLines.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const [, BEAD, CROWN] = sample.profiles;
const [FIVE, SLAB, SLAB_AM] = DOOR_DESIGNS;
const line = (from, to) => ({ type: 'line', from, to });
const box = (x, z, width, height) => ({ x, z, width, height });
const profile = (id, name, kind, points, segs, closed, elevation) => ({
  id, name, kind, version: 1, archived: false, drawnPoints: { elevation },
  geometry: { units: 'in', points, loops: [{ id: 'L1', closed, segs }] },
});
const ROUND = profile('sp-round', 'Round 1/4', 'door_outside',
  { a: [0.25, 0], b: [0, -0.25], c: [0, -0.8125] },
  [{ type: 'arc', from: 'a', to: 'b', center: [0.25, -0.25], ccw: true }, line('b', 'c')], false, ['a']);
const STEP = profile('sp-step', 'Step', 'door_inside',
  { p: [-0.25, 0], q: [-0.25, -0.125], r: [0, -0.125] }, [line('p', 'q'), line('q', 'r')], false, ['p', 'q', 'r']);
const RAISED = profile('sp-raised', 'Raised 2', 'door_panel',
  { m: [-0.375, -0.5625], n: [0.125, -0.3125], o: [1.5, -0.0625], q: [2, -0.0625] },
  [line('m', 'n'), line('n', 'o'), line('o', 'q')], false, ['o', 'm', 'n']);
const AM = profile('sp-am', 'Applied 1', 'applied_molding',
  { u: [-0.25, 0], v: [0.75, 0], w: [0.75, 0.375], k: [-0.25, 0.375] },
  [line('u', 'v'), line('v', 'w'), line('w', 'k'), line('k', 'u')], true, ['v', 'u']);
const BEAD5 = { ...profile('sp-bead5', 'Flush bead 5/16', 'door_outside',
  { a: [-0.3125, 0], q: [-0.0625, 0], b: [0, 0], c: [0, -0.8125], d: [-0.3125, -0.8125] },
  [line('a', 'q'), line('q', 'b'), line('b', 'c'), line('c', 'd'), line('d', 'a')], true, ['q', 'a']),
stretch: { y: -0.25 } };
const STICK2 = { ...profile('sp-stick2', 'Stick 1/4', 'door_inside',
  { s1: [-0.25, 0], s2: [0, -0.25], s3: [0, -0.3125] },
  [line('s1', 's2'), line('s2', 's3')], false, ['s1']), stretch: { y: -0.28125 } };
const LIBRARY = [ROUND, STEP, RAISED, AM, BEAD, CROWN];
const style = ({ applied = null, ...profiles }, patch = {}) => ({
  ...DEFAULT_DOOR_STYLE, profiles: { ...DEFAULT_DOOR_STYLE.profiles, ...profiles },
  appliedMoldings: applied === null ? [] : [{ profileId: applied, offset: 0 }], ...patch,
});
const ALL = style({ outside: 'sp-round', inside: 'sp-step', panel: 'sp-raised', applied: 'sp-bead' });
const appliedPick = (pick, offset = 0, index = 0) => ({
  ...pick, index, offset, applyLine: pick.covers ? null : offset,
  minX: pick.reachOut ? -pick.reachOut : 0, maxX: pick.reachIn,
});
const ROUND_SLOT = { profileId: 'sp-round', name: 'Round 1/4', lines: [0.25], minX: 0, maxX: 0.25, reachIn: 0.25, reachOut: 0, covers: false };

describe('SPEC-50 door profile offsets', () => {
  it('reads each pick\'s drawn points as offsets with its reach, and warns on bad picks and cuts past the back', () => {
    expect(doorProfileOffsets(ALL, FIVE, LIBRARY)).toEqual({
      slots: {
        outside: ROUND_SLOT,
        inside: { profileId: 'sp-step', name: 'Step', lines: [-0.25], minX: -0.25, maxX: 0, reachIn: 0, reachOut: 0.25, covers: false },
        panel: { profileId: 'sp-raised', name: 'Raised 2', lines: [0.125, 1.5], minX: -0.375, maxX: 2, reachIn: 2, reachOut: 0.375, covers: false },
      },
      applied: [appliedPick({ profileId: 'sp-bead', name: 'Half bead', lines: [0.5], reachIn: 0.5, reachOut: 0, covers: false })],
      warnings: [],
    });
    expect(doorProfileOffsets({ ...ALL, thickness: 0.75 }, FIVE, LIBRARY).warnings)
      .toEqual([{ code: 'door-profile-too-deep', slot: 'outside' }]);
    const broken = doorProfileOffsets(
      style({ outside: 'sp-round', inside: 'sp-crown', panel: 'gone', applied: 'sp-bead' }), FIVE, LIBRARY,
    );
    expect([Object.keys(broken.slots), broken.warnings]).toEqual([['outside'], [
      { code: 'door-profile-missing', slot: 'inside' },
      { code: 'door-profile-missing', slot: 'panel' },
    ]]);
    expect(doorProfileOffsets({ ...ALL, appliedMoldings: [] }, SLAB, LIBRARY)).toEqual({ slots: { outside: ROUND_SLOT }, applied: [], warnings: [] });
    expect([doorProfileOffsets(DEFAULT_DOOR_STYLE, FIVE, LIBRARY), doorProfileOffsets(ALL, null, LIBRARY)])
      .toEqual([{ slots: {}, applied: [], warnings: [] }, { slots: {}, applied: [], warnings: [] }]);
  });

  it('keeps overhang points inside the outline and covers only with a closed loop crossing the reference', () => {
    expect(doorProfileOffsets(style({ outside: BEAD5.id }), FIVE, [BEAD5])).toEqual({
      slots: { outside: {
        profileId: BEAD5.id, name: BEAD5.name,
        lines: [-0.0625], minX: -0.3125, maxX: 0, reachIn: 0, reachOut: 0.3125, covers: false,
      } },
      applied: [], warnings: [],
    });
    expect(doorProfileOffsets(style({ applied: AM.id }), FIVE, [AM]).applied[0])
      .toEqual(appliedPick({ profileId: AM.id, name: AM.name, lines: [-0.25, 0.75], reachIn: 0.75, reachOut: 0.25, covers: true }));
    const covers = (pick) => doorProfileOffsets(style({ applied: pick.id }), FIVE, [pick]).applied[0].covers;
    expect(covers({ ...AM, geometry: { ...AM.geometry, loops: [{ ...AM.geometry.loops[0], closed: false }] } })).toBe(false);
    const separate = { ...AM, geometry: {
      ...AM.geometry,
      points: { a: [-1, 0], b: [-0.5, 0], c: [-0.5, 0.5], d: [-1, 0.5],
        e: [0.5, 0], f: [1, 0], g: [1, 0.5], h: [0.5, 0.5] },
      loops: [
        { id: 'left', closed: true, segs: [line('a', 'b'), line('b', 'c'), line('c', 'd'), line('d', 'a')] },
        { id: 'right', closed: true, segs: [line('e', 'f'), line('f', 'g'), line('g', 'h'), line('h', 'e')] },
      ],
    } };
    expect(covers(separate)).toBe(false);
    const arc = profile('arc', 'Crossing arc', 'applied_molding', { a: [0.25, 0.5], b: [0.25, -0.5] },
      [{ type: 'arc', from: 'a', to: 'b', center: [0.25, 0], ccw: true }, line('b', 'a')], true, []);
    expect(covers(arc)).toBe(true);
    const touching = { ...AM, geometry: { ...AM.geometry, points: { ...AM.geometry.points, u: [-1e-6, 0], k: [-1e-6, 0.375] } } };
    expect(covers(touching)).toBe(false);
  });

  it('warns too-thin at the slot target and never too-deep for stretching picks, in slot order', () => {
    const picks = style({ inside: STICK2.id });
    expect(doorProfileOffsets({ ...picks, thickness: 0.75 }, FIVE, [STICK2]).warnings)
      .toEqual([{ code: 'door-profile-too-thin', slot: 'inside' }]);
    expect(doorProfileOffsets({ ...picks, thickness: 1 }, FIVE, [STICK2]).warnings).toEqual([]);
    const library = ['outside', 'panel', 'applied'].map((slot) => ({
      ...BEAD5, id: slot, kind: { outside: 'door_outside', panel: 'door_panel', applied: 'applied_molding' }[slot],
      geometry: { ...BEAD5.geometry, loops: [{ ...BEAD5.geometry.loops[0], closed: false, segs: BEAD5.geometry.loops[0].segs.slice(0, -1) }] },
      stretch: { y: -0.6 },
    }));
    const all = style({ outside: 'outside', inside: STICK2.id, panel: 'panel', applied: 'applied' });
    expect(doorProfileOffsets({ ...all, thickness: 0.6, panel: { thickness: 0.5 } }, FIVE, [...library, STICK2]).warnings)
      .toEqual(['outside', 'inside', 'panel', 'applied'].map((slot) => ({ code: 'door-profile-too-thin', slot })));
    expect(doorProfileOffsets({ ...all, thickness: 0.75 }, FIVE, library).warnings)
      .toEqual([{ code: 'door-profile-missing', slot: 'inside' }]);
    expect(doorProfileOffsets(style({ outside: 'outside' }, { thickness: 0.6 + 1e-6 }), SLAB, library).warnings)
      .toEqual([{ code: 'door-profile-too-thin', slot: 'outside' }]);
    expect(doorProfileOffsets(style({ outside: 'outside' }, { thickness: 0.6 + 2e-6 }), SLAB, library).warnings).toEqual([]);
  });

  it('draws each offset as a rectangle from its edge, drops what doesn\'t fit, and checks the frame and the panel', () => {
    const offsets = doorProfileOffsets(ALL, FIVE, LIBRARY);
    const lines = (rect, sizes) => partProfileLines(offsets, partDetail(ALL, FIVE, rect, sizes), rect);
    expect(lines(box(0, 0, 15, 30))).toMatchObject({
      lines: [
        box(0.25, 0.25, 14.5, 29.5),
        box(2.75, 2.75, 9.5, 24.5),
        box(3.125, 3.125, 8.75, 23.75),
        box(4.5, 4.5, 6, 21),
        box(3.5, 3.5, 8, 23),
      ],
      warnings: [], openingsShown: true,
    });
    expect(lines(box(0, 0, 19.375, 5.875))).toMatchObject({
      lines: [
        box(0.25, 0.25, 18.875, 5.375),
        box(2.75, 1.625, 13.875, 2.625),
        box(3.125, 2, 13.125, 1.875),
        box(3.5, 2.375, 12.375, 1.125),
      ],
      warnings: [{ code: 'door-profile-panel-too-small' }], openingsShown: true,
    });
    expect(lines(box(0, 0, 15, 30), { stiles: { left: 0.375 }, midRails: [{ at: 15, width: 0.375 }] }).warnings).toEqual([
      { code: 'door-profile-too-wide', side: 'left' },
      { code: 'door-profile-too-wide', side: 'mid' },
    ]);
  });

  it('puts slab-mdf molding lines on the door edge, and gives a slab or a short front only its edge lines', () => {
    const C = style({ outside: 'sp-round', inside: 'sp-step', applied: 'sp-am' }, { designId: 'slab-mdf' });
    const offsets = doorProfileOffsets(C, SLAB, LIBRARY);
    expect([Object.keys(offsets.slots), offsets.applied[0].lines, offsets.warnings])
      .toEqual([['outside'], [0, 1], []]);
    const rect = box(0, 0, 15, 30);
    expect(partProfileLines(offsets, partDetail(C, SLAB, rect, undefined, 0, offsets.applied), rect)).toMatchObject({
      lines: [box(0.25, 0.25, 14.5, 29.5), box(1, 1, 13, 28)],
      warnings: [{ code: 'door-profile-too-wide', side: 'molding', index: 0 }], openingsShown: false,
    });
    const narrow = { stiles: { left: 0.375, right: 0.375 } };
    expect(partProfileLines(offsets, partDetail(C, SLAB, rect, narrow, 0, offsets.applied), rect).warnings).toEqual([
      { code: 'door-profile-too-wide', side: 'molding', index: 0 },
    ]);
    const short = box(0, 0, 15, 4.75);
    expect(partProfileLines(offsets, partDetail(C, SLAB, short, undefined, 0, offsets.applied), short))
      .toMatchObject({ lines: [box(0.25, 0.25, 14.5, 4.25)], warnings: [], openingsShown: false });
    const plain = doorProfileOffsets({ ...ALL, appliedMoldings: [] }, SLAB, LIBRARY);
    expect(partProfileLines(plain, partDetail(ALL, SLAB, rect), rect).lines).toEqual([box(0.25, 0.25, 14.5, 29.5)]);
  });
});


describe('SPEC-50.1 core and covered opening lines', () => {
  const build = (picks, rect, sizes) => {
    const S = style(picks);
    const offsets = doorProfileOffsets(S, FIVE, [BEAD5, AM]);
    const detail = partDetail(S, FIVE, rect, sizes, offsets.slots.outside?.reachOut ?? 0, offsets.applied);
    return { detail, offsets, fit: partProfileLines(offsets, detail, rect) };
  };

  it('keeps overall size while insetting the core and hides an AM-covered opening (anchors 1 and 4)', () => {
    const rect = box(0, 0, 15, 30);
    const { detail, offsets, fit } = build({ outside: BEAD5.id, applied: AM.id }, rect);
    expect(detail.core).toEqual(box(0.3125, 0.3125, 14.375, 29.375));
    expect(detail.openings).toEqual([box(3.3125, 3.3125, 8.375, 23.375)]);
    expect(fit).toMatchObject({
      lines: [detail.core, box(0.25, 0.25, 14.5, 29.5),
        box(3.0625, 3.0625, 8.875, 23.875), box(4.0625, 4.0625, 6.875, 21.875)],
      openingsShown: false, warnings: [],
    });
    expect(offsets.warnings).toEqual([]);
    expect(rect).toEqual(box(0, 0, 15, 30));
    const plain = build({}, rect);
    expect(plain.detail.core).toEqual(rect);
    expect(plain.detail.openings).toEqual([box(3, 3, 9, 24)]);
    expect(plain.fit).toMatchObject({ lines: [], openingsShown: true, warnings: [] });
  });

  it('uses core height for the slab rule and short rails, and core origins for mids (anchors 2 and 3)', () => {
    const short = build({ outside: BEAD5.id }, box(0, 0, 15, 5));
    expect(short.detail.core.height).toBe(4.375);
    expect(short.detail.construction).toBe('slab');
    expect(short.detail.openings).toEqual([]);
    expect(short.fit.lines).toEqual([box(0.3125, 0.3125, 14.375, 4.375), box(0.25, 0.25, 14.5, 4.5)]);
    const taller = build({ outside: BEAD5.id }, box(0, 0, 15, 8.5));
    expect(taller.detail.core.height).toBe(7.875);
    expect(taller.detail.sizes.rails).toEqual({ top: 2.875, bottom: 2.875 });
    expect(taller.detail.openings).toEqual([box(3.3125, 3.1875, 8.375, 2.125)]);
    expect(taller.fit.openingsShown).toBe(true);
    expect(short.fit.warnings.concat(taller.fit.warnings)).toEqual([]);
    const mids = build({ outside: BEAD5.id }, box(10, 20, 30, 40), {
      midRails: [{ at: 20, width: 2 }], midStiles: [{ at: 15, width: 2 }],
    });
    expect(mids.detail.openings).toEqual([
      box(13.3125, 23.3125, 11, 16), box(26.3125, 23.3125, 10.375, 16),
      box(13.3125, 41.3125, 11, 15.375), box(26.3125, 41.3125, 10.375, 15.375),
    ]);
  });

  it('hides only references covered by a relevant closed pick and checks fit on the smaller opening (anchor 5)', () => {
    const rect = box(0, 0, 15, 30);
    for (const slot of ['inside', 'panel', 'applied', 'outside']) {
      const pick = { ...AM, kind: { inside: 'door_inside', panel: 'door_panel', applied: 'applied_molding', outside: 'door_outside' }[slot] };
      const S = style({ [slot]: pick.id });
      const offsets = doorProfileOffsets(S, FIVE, [pick]);
      const detail = partDetail(S, FIVE, rect, undefined, offsets.slots.outside?.reachOut ?? 0, offsets.applied);
      const fit = partProfileLines(offsets, detail, rect);
      expect(fit.openingsShown).toBe(slot === 'outside');
      if (slot === 'outside') expect(fit.lines).toEqual([box(1, 1, 13, 28)]);
      const open = { ...pick, geometry: { ...pick.geometry, loops: [{ ...pick.geometry.loops[0], closed: false }] } };
      expect(partProfileLines(doorProfileOffsets(S, FIVE, [open]), detail, rect).openingsShown).toBe(true);
    }
    const S = style({ outside: ROUND.id, applied: AM.id });
    const offsets = doorProfileOffsets(S, SLAB, [ROUND, AM]);
    expect(partProfileLines(offsets, partDetail(S, SLAB, rect, undefined, 0, offsets.applied), rect)).toMatchObject({
      lines: [box(0.25, 0.25, 14.5, 29.5), box(1, 1, 13, 28)],
      openingsShown: false, warnings: [{ code: 'door-profile-too-wide', side: 'molding', index: 0 }],
    });
    expect(build({ applied: AM.id }, box(0, 0, 7.625, 30)).fit.warnings).toEqual([]);
    expect(build({ outside: BEAD5.id, applied: AM.id }, box(0, 0, 7.625, 30)).fit.warnings)
      .toEqual([{ code: 'applied-molding-no-room', index: 0 }]);
  });
});


describe('Step 480 applied moldings at their offsets', () => {
  const moldingLibrary = sample.profiles.filter(({ id }) => ['am1', 'am2', 'out38'].includes(id));
  const am = (offset) => ({ profileId: 'am1', offset });
  const build = (design, rect, appliedMoldings, sizes, outside = null) => {
    const S = style({ outside }, { appliedMoldings });
    const offsets = doorProfileOffsets(S, design, moldingLibrary);
    const detail = partDetail(S, design, rect, sizes, offsets.slots.outside?.reachOut ?? 0, offsets.applied);
    return { offsets, detail, fit: partProfileLines(offsets, detail, rect) };
  };

  it.each([
    [1, FIVE, box(0, 0, 18, 30), [am(0)], null, false,
      [box(2.75, 2.75, 12.5, 24.5), box(3.75, 3.75, 10.5, 22.5)], []],
    [6, FIVE, box(0, 0, 18, 30), [am(-0.5)], 'out38', true,
      [box(0.375, 0.375, 17.25, 29.25), box(2.25, 2.25, 13.5, 25.5), box(3.25, 3.25, 11.5, 23.5)], []],
  ])('anchor %i', (number, design, rect, appliedMoldings, outside, openingsShown, lines, warnings) => {
    const result = build(design, rect, appliedMoldings, undefined, outside);
    expect(result.offsets.warnings).toEqual([]);
    expect(result.fit).toMatchObject({ lines, warnings, openingsShown });
    if (number === 6) expect(result.offsets.applied[0]).toMatchObject({ reachOut: 0.75, applyLine: null });
  });

  it.each([
    [1, box(0, 0, 15, 15), [am(2)], null, undefined,
      [box(2, 2, 11, 11), box(3, 3, 9, 9)], [], [2]],
    [2, box(0, 0, 15, 15), [{ profileId: 'am2', offset: 2 }], null, undefined,
      [box(2, 2, 11, 11), box(2.75, 2.75, 9.5, 9.5)], [], [2]],
    [3, box(0, 0, 15, 15), [am(1), am(2.5)], null, undefined,
      [box(1, 1, 13, 13), box(2, 2, 11, 11), box(2.5, 2.5, 10, 10), box(3.5, 3.5, 8, 8)], [], [1, 2.5]],
    [4, box(0, 0, 15, 15), [{ profileId: null, offset: 1 }], null, undefined,
      [box(1, 1, 13, 13)], [], [1]],
    [5, box(0, 0, 15, 15), [], null, undefined, [], [], []],
    [6, box(0, 0, 24, 6), [am(2)], null, undefined,
      [box(0.9375, 0.9375, 22.125, 4.125), box(1.9375, 1.9375, 20.125, 2.125)], [], [0.9375]],
    [7, box(0, 0, 24, 5), [am(0.5)], null, undefined,
      [box(0.4375, 0.4375, 23.125, 4.125), box(1.4375, 1.4375, 21.125, 2.125)], [], [0.4375]],
    [8, box(0, 0, 24, 5), [am(0.25), am(1.5)], null, undefined,
      [box(1, 1, 22, 3), box(1.25, 1.25, 21.5, 2.5), box(2.25, 2.25, 19.5, 0.5)],
      [{ code: 'door-profile-panel-too-small' }], [0, 1.25]],
    [9, box(0, 0, 24, 4.5), [am(2)], null, undefined, [], [], null],
    [10, box(0, 0, 15, 30), [am(1)], null, { midRails: [{ at: 15, width: 9 }] },
      [box(1, 1, 13, 13), box(2, 2, 11, 11), box(1, 16, 13, 13), box(2, 17, 11, 11)], [], [1]],
    [11, box(0, 0, 15, 15), [am(0.25)], 'out38', undefined,
      [box(0.375, 0.375, 14.25, 14.25), box(0.25, 0.25, 14.5, 14.5), box(1.25, 1.25, 12.5, 12.5)],
      [{ code: 'door-profile-too-wide', side: 'molding', index: 0 }], [0.25]],
  ])('494.3 anchor %i', (number, rect, picks, outside, sizes, lines, warnings, shifted) => {
    // §1 forbids routed outside picks on MDF; preserve case 11's drawing on hardwood.
    const result = build(number === 11 ? SLAB : SLAB_AM, rect, picks, sizes, outside);
    expect(result.offsets.warnings).toEqual([]);
    expect(result.fit).toMatchObject({ lines, warnings, openingsShown: false });
    if (shifted) expect(result.detail.moldings).toEqual(shifted.map((offset, index) => ({
      index, offset, typed: picks[index].offset, shifted: offset !== picks[index].offset,
    })));
    if (number === 1) expect(result.fit.miters).toEqual([
      { x1: 3, z1: 3, x2: 2, z2: 2 }, { x1: 12, z1: 3, x2: 13, z2: 2 },
      { x1: 12, z1: 12, x2: 13, z2: 13 }, { x1: 3, z1: 12, x2: 2, z2: 13 },
    ]);
    if ([4, 5, 9].includes(number)) expect(result.fit.miters).toEqual([]);
    if (number === 5) expect(result.detail.sizes.opening).toEqual({ width: 15, height: 15 });
    if (number === 6) expect(result.detail.sizes).toMatchObject({ shift: 1.0625, opening: { width: 20.125, height: 2.125 } });
    if (number === 8) expect(result.detail.sizes.shift).toBe(0.25);
    if (number === 9) expect(result.detail).toMatchObject({ construction: 'slab', slab: 'design', molding: false, designId: 'slab-mdf' });
    if (number === 11) {
      const mdf = build(SLAB_AM, rect, picks, sizes, outside);
      expect(mdf.offsets.warnings).toEqual([{ code: 'door-profile-routed-on-mdf', slot: 'outside' }]);
      expect(mdf.detail.core).toEqual(rect);
      expect(mdf.fit).toMatchObject({
        lines: [box(0.25, 0.25, 14.5, 14.5), box(1.25, 1.25, 12.5, 12.5)], warnings: [],
      });
      expect(mdf.fit.miters).toHaveLength(4);
    }
    if (number === 10) {
      expect(result.detail.openings).toEqual([box(0, 0, 15, 15), box(0, 15, 15, 15)]);
      expect(result.fit.miters).toHaveLength(8);
    }
  });

  it('normalizes all loops after stretching, retains drawn zero points, and always includes both edges', () => {
    const multi = { ...AM, stretch: { y: -0.25 }, drawnPoints: { elevation: ['a', 'b', 'e', 'f', 'a'] },
      geometry: { units: 'in',
        points: { a: [-1, 0], b: [-0.5, 0], c: [-0.5, -0.5], d: [-1, -0.5],
          e: [0, 0], f: [1, 0], g: [1, -0.5], h: [0, -0.5] },
        loops: [
          { id: 'left', closed: true, segs: [line('a', 'b'), line('b', 'c'), line('c', 'd'), line('d', 'a')] },
          { id: 'right', closed: true, segs: [line('e', 'f'), line('f', 'g'), line('g', 'h'), line('h', 'e')] },
        ],
      },
    };
    const S = style({}, { appliedMoldings: [{ profileId: AM.id, offset: 2 }] });
    expect(doorProfileOffsets(S, SLAB_AM, [multi]).applied[0])
      .toMatchObject({ offset: 2, width: 2, lines: [0, 0.5, 1, 2], applyLine: null });
    expect(doorProfileOffsets(S, SLAB_AM, [{ ...multi, drawnPoints: { elevation: [] } }]).applied[0].lines)
      .toEqual([0, 2]);
  });

  it('uses the smallest door-edge region and the configured minPanel, ignoring mid widths and outside reach', () => {
    const S = style({ outside: BEAD5.id }, { mid: { extra: 8 },
      shortFace: { ...DEFAULT_DOOR_STYLE.shortFace, minPanel: 1 },
      appliedMoldings: [{ profileId: 'am2', offset: 1 }],
    });
    const rect = box(10, 20, 12, 6);
    const offsets = doorProfileOffsets(S, SLAB_AM, [...moldingLibrary, BEAD5]);
    const detail = partDetail(S, SLAB_AM, rect, {
      midRails: [{ at: 3, width: 8 }],
      midStiles: [{ at: 12 }, { at: 6, width: 9 }, { at: 0 }, { at: 6 }],
    }, 0.3125, offsets.applied);
    expect(detail.core).toEqual(box(10.3125, 20.3125, 11.375, 5.375));
    expect(detail.openings).toEqual([
      box(10, 20, 6, 3), box(16, 20, 6, 3), box(10, 23, 6, 3), box(16, 23, 6, 3),
    ]);
    expect(detail.moldings).toEqual([{ index: 0, offset: 0.25, typed: 1, shifted: true }]);
    expect(detail.sizes).toMatchObject({ shift: 0.75, opening: { width: 10, height: 4 } });
    const fit = partProfileLines(offsets, detail, rect);
    expect(fit.warnings).toEqual([]);
    expect(fit.lines).toContainEqual(box(10.25, 20.25, 5.5, 2.5));
    expect(fit.lines).toContainEqual(box(11, 21, 4, 1));
    expect(fit.miters).toHaveLength(20); // Four outside miters plus four per region.
  });

  it('omits moldings with no inner room, preserves narrow empty slabs, and checks overlap after shifting', () => {
    expect(build(SLAB_AM, box(0, 0, 2, 15), [am(0)]).fit).toMatchObject({
      lines: [], miters: [], openingsShown: false,
      warnings: [{ code: 'applied-molding-no-room', index: 0 }],
    });
    const empty = build(SLAB_AM, box(0, 0, 1, 15), []);
    expect(empty.detail.sizes).toMatchObject({ shift: 0, opening: { width: 1, height: 15 } });
    expect(build(SLAB_AM, box(0, 0, 15, 15), [{ profileId: null, offset: 0 }]).fit)
      .toMatchObject({ lines: [], miters: [], warnings: [], openingsShown: false });
    expect(build(SLAB, box(0, 0, 24, 5), [am(0.25), am(1.5)], undefined, 'out38').fit.warnings)
      .toEqual([{ code: 'door-profile-too-wide', side: 'molding', index: 0 }, { code: 'door-profile-panel-too-small' }]);
  });

  it('keeps entry indices, skips missing or wrong-kind picks, and shifts profile lines and reaches', () => {
    const S = style({}, { appliedMoldings: [
      am(1.5), { profileId: 'gone', offset: 2 },
      { profileId: 'out38', offset: -1 }, { profileId: null, offset: -0.5 },
    ] });
    expect(doorProfileOffsets(S, FIVE, moldingLibrary)).toEqual({
      slots: {},
      applied: [
        { index: 0, profileId: 'am1', name: 'Applied 1', offset: 1.5,
          lines: [1.25, 2.25], applyLine: null, minX: -0.25, maxX: 0.75,
          reachIn: 2.25, reachOut: 0, covers: true },
        { index: 3, profileId: null, name: null, offset: -0.5,
          lines: [], applyLine: -0.5, minX: 0, maxX: 0, reachIn: 0, reachOut: 0.5, covers: false },
      ],
      warnings: [
        { code: 'door-profile-missing', slot: 'applied', index: 1 },
        { code: 'door-profile-missing', slot: 'applied', index: 2 },
      ],
    });
    expect(doorProfileOffsets(S, SLAB, moldingLibrary).applied).toEqual(doorProfileOffsets(S, SLAB_AM, moldingLibrary).applied);
  });

  it('draws uncovered apply lines once, leaves an offset five-piece opening visible, and follows final sizes', () => {
    const rect = box(10, 20, 18, 30);
    const result = build(FIVE, rect, [am(1)]);
    expect(result.fit.openingsShown).toBe(true);
    expect(result.fit.lines).toEqual([box(13.75, 23.75, 10.5, 22.5), box(14.75, 24.75, 8.5, 20.5)]);
    expect(build(FIVE, rect, [{ profileId: null, offset: 0 }]).fit)
      .toMatchObject({ lines: [], warnings: [], openingsShown: true });
    const plain = build(SLAB_AM, box(0, 0, 15, 7.875), [
      { profileId: null, offset: 1 }, { profileId: null, offset: 1 },
    ], { stiles: { left: 2, right: 4 } });
    expect(plain.fit).toMatchObject({ lines: [box(1, 1, 13, 5.875)], warnings: [], openingsShown: false });
    const open = { ...AM, geometry: { ...AM.geometry, loops: [{ ...AM.geometry.loops[0], closed: false }] } };
    const S = style({}, { appliedMoldings: [{ profileId: AM.id, offset: 1 }] });
    const offsets = doorProfileOffsets(S, SLAB_AM, [open]);
    expect(partProfileLines(offsets, partDetail(S, SLAB_AM, rect, undefined, 0, offsets.applied), rect).lines)
      .toEqual([box(11, 21, 16, 28), box(12, 22, 14, 26)]);
  });

  it('uses later moldings in side and mid fit checks and omits a molding from the whole part if one opening has no room', () => {
    const rect = box(0, 0, 18, 30);
    const result = build(FIVE, rect, [am(0), am(-1)], {
      stiles: { left: 1 }, midRails: [{ at: 15, width: 2 }],
    });
    expect(result.fit.warnings).toEqual([
      { code: 'door-profile-too-wide', side: 'left' }, { code: 'door-profile-too-wide', side: 'mid' },
    ]);
    const split = build(FIVE, rect, [am(0), am(1)], { midStiles: [{ at: 6, width: 2 }] });
    expect(split.fit.warnings).toEqual([{ code: 'applied-molding-no-room', index: 1 }]);
    expect(split.fit.lines).toEqual([
      box(2.75, 2.75, 2.5, 24.5), box(3.75, 3.75, 0.5, 22.5),
      box(6.75, 2.75, 8.5, 24.5), box(7.75, 3.75, 6.5, 22.5),
    ]);
    expect(build(FIVE, box(0, 0, 6, 30), [am(0)]).fit)
      .toMatchObject({ lines: [], warnings: [{ code: 'applied-molding-no-room', index: 0 }], openingsShown: true });
    expect(build(SLAB_AM, box(0, 0, 15, 15), [{ profileId: null, offset: 4.5 }]).fit)
      .toMatchObject({ lines: [box(4.5, 4.5, 6, 6)], warnings: [], openingsShown: false });
  });
});
