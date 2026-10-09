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
const LIBRARY = [ROUND, STEP, RAISED, AM, BEAD, CROWN];
const style = (profiles, patch = {}) => ({
  ...DEFAULT_DOOR_STYLE, ...patch, profiles: { outside: null, inside: null, panel: null, applied: null, ...profiles },
});
const ALL = style({ outside: 'sp-round', inside: 'sp-step', panel: 'sp-raised', applied: 'sp-bead' });
const ROUND_SLOT = { profileId: 'sp-round', name: 'Round 1/4', lines: [0.25], reachIn: 0.25, reachOut: 0 };

describe('SPEC-50 door profile offsets', () => {
  it('reads each pick\'s drawn points as offsets with its reach, and warns on bad picks and cuts past the back', () => {
    expect(doorProfileOffsets(ALL, FIVE, LIBRARY)).toEqual({
      slots: {
        outside: ROUND_SLOT,
        inside: { profileId: 'sp-step', name: 'Step', lines: [-0.25], reachIn: 0, reachOut: 0.25 },
        panel: { profileId: 'sp-raised', name: 'Raised 2', lines: [0.125, 1.5], reachIn: 2, reachOut: 0.375 },
        applied: { profileId: 'sp-bead', name: 'Half bead', lines: [0.5], reachIn: 0.5, reachOut: 0 },
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
      warnings: [],
    });
    expect(lines(box(0, 0, 19.375, 5.875))).toEqual({
      lines: [
        box(0.25, 0.25, 18.875, 5.375),
        box(2.75, 1.625, 13.875, 2.625),
        box(3.125, 2, 13.125, 1.875),
        box(3.5, 2.375, 12.375, 1.125),
      ],
      warnings: [{ code: 'door-profile-panel-too-small' }],
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
      warnings: [],
    });
    const narrow = { stiles: { left: 0.375, right: 0.375 } };
    expect(partProfileLines(offsets, partDetail(C, SLAB_AM, rect, narrow), rect).warnings).toEqual([
      { code: 'door-profile-too-wide', side: 'left' },
      { code: 'door-profile-too-wide', side: 'right' },
    ]);
    const short = box(0, 0, 15, 4.75);
    expect(partProfileLines(offsets, partDetail(C, SLAB_AM, short), short))
      .toEqual({ lines: [box(0.25, 0.25, 14.5, 4.25)], warnings: [] });
    const plain = doorProfileOffsets(ALL, FIVE, LIBRARY);
    expect(partProfileLines(plain, partDetail(ALL, SLAB, rect), rect).lines).toEqual([box(0.25, 0.25, 14.5, 29.5)]);
  });
});
