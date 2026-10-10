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
const style = (profiles, patch = {}) => ({
  ...DEFAULT_DOOR_STYLE, ...patch, profiles: { outside: null, inside: null, panel: null, applied: null, ...profiles },
});
const ALL = style({ outside: 'sp-round', inside: 'sp-step', panel: 'sp-raised', applied: 'sp-bead' });
const ROUND_SLOT = { profileId: 'sp-round', name: 'Round 1/4', lines: [0.25], reachIn: 0.25, reachOut: 0, covers: false };

describe('SPEC-50 door profile offsets', () => {
  it('reads each pick\'s drawn points as offsets with its reach, and warns on bad picks and cuts past the back', () => {
    expect(doorProfileOffsets(ALL, FIVE, LIBRARY)).toEqual({
      slots: {
        outside: ROUND_SLOT,
        inside: { profileId: 'sp-step', name: 'Step', lines: [-0.25], reachIn: 0, reachOut: 0.25, covers: false },
        panel: { profileId: 'sp-raised', name: 'Raised 2', lines: [0.125, 1.5], reachIn: 2, reachOut: 0.375, covers: false },
        applied: { profileId: 'sp-bead', name: 'Half bead', lines: [0.5], reachIn: 0.5, reachOut: 0, covers: false },
      },
      warnings: [],
    });
    expect(doorProfileOffsets({ ...ALL, thickness: 0.75 }, FIVE, LIBRARY).warnings)
      .toEqual([{ code: 'door-profile-too-deep', slot: 'outside' }]);
    const broken = doorProfileOffsets(
      style({ outside: 'sp-round', inside: 'sp-crown', panel: 'gone', applied: 'sp-bead' }), FIVE, LIBRARY,
    );
    expect([Object.keys(broken.slots), broken.warnings]).toEqual([['outside', 'applied'], [
      { code: 'door-profile-missing', slot: 'inside' },
      { code: 'door-profile-missing', slot: 'panel' },
    ]]);
    expect(doorProfileOffsets(ALL, SLAB, LIBRARY)).toEqual({ slots: { outside: ROUND_SLOT }, warnings: [] });
    expect([doorProfileOffsets(DEFAULT_DOOR_STYLE, FIVE, LIBRARY), doorProfileOffsets(ALL, null, LIBRARY)])
      .toEqual([{ slots: {}, warnings: [] }, { slots: {}, warnings: [] }]);
  });

  it('keeps overhang points inside the outline and covers only with a closed loop crossing the reference', () => {
    expect(doorProfileOffsets(style({ outside: BEAD5.id }), FIVE, [BEAD5])).toEqual({
      slots: { outside: {
        profileId: BEAD5.id, name: BEAD5.name,
        lines: [-0.0625], reachIn: 0, reachOut: 0.3125, covers: false,
      } },
      warnings: [],
    });
    expect(doorProfileOffsets(style({ applied: AM.id }), FIVE, [AM]).slots.applied)
      .toEqual({ profileId: AM.id, name: AM.name, lines: [-0.25, 0.75], reachIn: 0.75, reachOut: 0.25, covers: true });
    const covers = (pick) => doorProfileOffsets(style({ applied: pick.id }), FIVE, [pick]).slots.applied.covers;
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
    expect(lines(box(0, 0, 15, 30))).toEqual({
      lines: [
        box(0.25, 0.25, 14.5, 29.5),
        box(2.75, 2.75, 9.5, 24.5),
        box(3.125, 3.125, 8.75, 23.75),
        box(4.5, 4.5, 6, 21),
        box(3.5, 3.5, 8, 23),
      ],
      warnings: [], openingsShown: true,
    });
    expect(lines(box(0, 0, 19.375, 5.875))).toEqual({
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

  it('puts slab-applied molding lines on the inset, and gives a slab or a short front only its edge lines', () => {
    const C = style({ outside: 'sp-round', inside: 'sp-step', applied: 'sp-am' }, { designId: 'slab-applied' });
    const offsets = doorProfileOffsets(C, SLAB_AM, LIBRARY);
    expect([Object.keys(offsets.slots), offsets.slots.applied.lines, offsets.warnings])
      .toEqual([['outside', 'applied'], [-0.25, 0.75], []]);
    const rect = box(0, 0, 15, 30);
    expect(partProfileLines(offsets, partDetail(C, SLAB_AM, rect), rect)).toEqual({
      lines: [box(0.25, 0.25, 14.5, 29.5), box(2.75, 2.75, 9.5, 24.5), box(3.75, 3.75, 7.5, 22.5)],
      warnings: [], openingsShown: false,
    });
    const narrow = { stiles: { left: 0.375, right: 0.375 } };
    expect(partProfileLines(offsets, partDetail(C, SLAB_AM, rect, narrow), rect).warnings).toEqual([
      { code: 'door-profile-too-wide', side: 'left' },
      { code: 'door-profile-too-wide', side: 'right' },
    ]);
    const short = box(0, 0, 15, 4.75);
    expect(partProfileLines(offsets, partDetail(C, SLAB_AM, short), short))
      .toEqual({ lines: [box(0.25, 0.25, 14.5, 4.25)], warnings: [], openingsShown: true });
    const plain = doorProfileOffsets(ALL, FIVE, LIBRARY);
    expect(partProfileLines(plain, partDetail(ALL, SLAB, rect), rect).lines).toEqual([box(0.25, 0.25, 14.5, 29.5)]);
  });
});


describe('SPEC-50.1 core and covered opening lines', () => {
  const build = (picks, rect, sizes) => {
    const S = style(picks);
    const offsets = doorProfileOffsets(S, FIVE, [BEAD5, AM]);
    const detail = partDetail(S, FIVE, rect, sizes, offsets.slots.outside?.reachOut ?? 0);
    return { detail, offsets, fit: partProfileLines(offsets, detail, rect) };
  };

  it('keeps overall size while insetting the core and hides an AM-covered opening (anchors 1 and 4)', () => {
    const rect = box(0, 0, 15, 30);
    const { detail, offsets, fit } = build({ outside: BEAD5.id, applied: AM.id }, rect);
    expect(detail.core).toEqual(box(0.3125, 0.3125, 14.375, 29.375));
    expect(detail.openings).toEqual([box(3.3125, 3.3125, 8.375, 23.375)]);
    expect(fit).toEqual({
      lines: [detail.core, box(0.25, 0.25, 14.5, 29.5),
        box(3.0625, 3.0625, 8.875, 23.875), box(4.0625, 4.0625, 6.875, 21.875)],
      openingsShown: false, warnings: [],
    });
    expect(offsets.warnings).toEqual([]);
    expect(rect).toEqual(box(0, 0, 15, 30));
    const plain = build({}, rect);
    expect(plain.detail.core).toEqual(rect);
    expect(plain.detail.openings).toEqual([box(3, 3, 9, 24)]);
    expect(plain.fit).toEqual({ lines: [], openingsShown: true, warnings: [] });
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
      const detail = partDetail(S, FIVE, rect, undefined, offsets.slots.outside?.reachOut ?? 0);
      const fit = partProfileLines(offsets, detail, rect);
      expect(fit.openingsShown).toBe(slot === 'outside');
      if (slot === 'outside') expect(fit.lines).toEqual([box(1, 1, 13, 28)]);
      const open = { ...pick, geometry: { ...pick.geometry, loops: [{ ...pick.geometry.loops[0], closed: false }] } };
      expect(partProfileLines(doorProfileOffsets(S, FIVE, [open]), detail, rect).openingsShown).toBe(true);
    }
    const S = style({ outside: ROUND.id, applied: AM.id });
    const offsets = doorProfileOffsets(S, SLAB_AM, [ROUND, AM]);
    expect(partProfileLines(offsets, partDetail(S, SLAB_AM, rect), rect)).toEqual({
      lines: [box(0.25, 0.25, 14.5, 29.5), box(2.75, 2.75, 9.5, 24.5), box(3.75, 3.75, 7.5, 22.5)],
      openingsShown: false, warnings: [],
    });
    expect(build({ applied: AM.id }, box(0, 0, 7.625, 30)).fit.warnings).toEqual([]);
    expect(build({ outside: BEAD5.id, applied: AM.id }, box(0, 0, 7.625, 30)).fit.warnings)
      .toEqual([{ code: 'door-profile-panel-too-small' }]);
  });
});
