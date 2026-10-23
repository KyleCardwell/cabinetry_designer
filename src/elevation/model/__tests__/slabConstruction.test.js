import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from '../doorStyles.js';
import { frontStackWarnings, partSizes } from '../doorSizes.js';
import { partDetail } from '../doorDetails.js';
import { doorProfileOffsets, partProfileLines } from '../doorProfileLines.js';
import { doorSection, doorSectionDimensions } from '../doorSection.js';
import { partSizeRows } from '../doorStyleEdits.js';

const [FIVE, HARDWOOD, MDF] = DOOR_DESIGNS;
const { profiles } = JSON.parse(readFileSync(new URL('./fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const box = (x, z, width, height) => ({ x, z, width, height });
const rect = box(0, 0, 15, 15);
const routedWarning = { code: 'door-profile-routed-on-mdf', slot: 'outside' };

function build(design, { outside = null, appliedMoldings = [], thickness = 0.8125 } = {}, part = rect, library = profiles) {
  const style = { ...DEFAULT_DOOR_STYLE, designId: design.id, thickness,
    profiles: { ...DEFAULT_DOOR_STYLE.profiles, outside }, appliedMoldings };
  const offsets = doorProfileOffsets(style, design, library);
  const detail = partDetail(style, design, part, undefined, offsets.slots.outside?.reachOut ?? 0, offsets.applied);
  return { style, offsets, detail, fit: partProfileLines(offsets, detail, part),
    section: doorSection(style, design, library) };
}

describe('528 one slab construction with two cores', () => {
  it('anchor 2: draws hardwood moldings with the same lines and four miters as MDF', () => {
    const picks = { appliedMoldings: [{ profileId: 'am1', offset: 2 }] };
    const hardwood = build(HARDWOOD, picks);
    expect(hardwood.fit).toMatchObject({ lines: [box(2, 2, 11, 11), box(3, 3, 9, 9)], warnings: [], openingsShown: false });
    expect(hardwood.fit.miters).toHaveLength(4);
    expect(hardwood.fit).toEqual(build(MDF, picks).fit);
    expect(hardwood.section).toEqual(build(MDF, picks).section);
  });

  it('anchor 3: retains slab regions without moldings and draws a plain outline', () => {
    expect(partSizes(DEFAULT_DOOR_STYLE, HARDWOOD, rect)).toEqual({
      construction: 'slab', slab: 'design', molding: true, designId: 'slab',
      midRails: [], midStiles: [], panels: [{ path: 'root', x: 0, z: 0, width: 15, height: 15 }], layoutWarnings: [], opening: { width: 15, height: 15 },
    });
    expect(build(HARDWOOD).fit).toEqual({ lines: [], miters: [], warnings: [], openingsShown: false });
  });

  it('anchor 4: reports a short five-piece drawer front as hardwood and excludes it from stacking warnings', () => {
    const part = box(0, 0, 24, 4.5);
    const short = build(FIVE, { appliedMoldings: [{ profileId: 'am1', offset: 0 }] }, part);
    const sizes = partSizes(short.style, FIVE, part);
    expect(sizes).toEqual({ construction: 'slab', slab: 'rule', molding: false, designId: 'slab' });
    expect(short.detail).toMatchObject(sizes);
    expect(short.style.thickness).toBe(0.8125);
    expect(short.fit).toMatchObject({ lines: [], miters: [], warnings: [] });
    expect(frontStackWarnings([
      { ...part, z: 8.125, path: 'short', sizes },
      { ...part, height: 8, path: 'lower', sizes: partSizes(DEFAULT_DOOR_STYLE, HARDWOOD, { width: 24, height: 8 }) },
    ])).toEqual([]);
    expect(partSizes(short.style, MDF, part)).toEqual({ construction: 'slab', slab: 'design', molding: false, designId: 'slab-mdf' });
  });

  it('anchor 5: skips a routed MDF outside edge without shrinking the core or making a section cut', () => {
    const picks = { outside: 'out38', thickness: 0.75 };
    const mdf = build(MDF, picks);
    expect(mdf.offsets.warnings).toEqual([routedWarning]);
    expect(mdf.offsets.slots).not.toHaveProperty('outside');
    expect(mdf.detail.core).toEqual(rect);
    expect(mdf.fit.lines).toEqual([]);
    expect(mdf.section).toMatchObject({ placed: [], cuts: [], skipped: ['outside'] });
    expect(doorSectionDimensions(mdf.style, MDF, profiles)).toEqual({
      left: [{ label: 'thickness', from: -0.75, to: 0, value: 0.75 }], below: [], above: [],
    });
    const hardwood = build(HARDWOOD, { outside: picks.outside });
    expect(hardwood.offsets.warnings).toEqual([]);
    expect(hardwood.fit.lines).toEqual([box(0.375, 0.375, 14.25, 14.25)]);
    expect(hardwood.section.skipped).toEqual([]);
    expect(hardwood.section.cuts).toHaveLength(1);
    expect(build(HARDWOOD, picks).offsets.warnings).toEqual([{ code: 'door-profile-too-deep', slot: 'outside' }]);
  });

  it('anchor 6: draws a closed MDF outside bead exactly as it does on hardwood', () => {
    const picks = { outside: 'bead5', thickness: 0.75 };
    const mdf = build(MDF, picks);
    const hardwood = build(HARDWOOD, picks);
    expect(mdf.offsets.warnings).toEqual([]);
    expect(mdf.detail.core).toEqual(box(0.3125, 0.3125, 14.375, 14.375));
    expect(mdf.fit.lines).toEqual([box(0.3125, 0.3125, 14.375, 14.375), box(0.25, 0.25, 14.5, 14.5)]);
    expect(mdf.fit).toEqual(hardwood.fit);
    expect(mdf.section).toEqual(hardwood.section);
    expect(mdf.section).toMatchObject({ cuts: [], skipped: [] });
    expect(mdf.section.placed[0].geometry.points.c).toEqual([0, -0.75]);
  });

  it('rejects an MDF outside profile if any loop is open, while allowing the same profile on five-piece', () => {
    const closed = profiles.find(({ id }) => id === 'bead5');
    const open = profiles.find(({ id }) => id === 'out38');
    const mixed = { ...closed, id: 'mixed', geometry: { ...closed.geometry,
      points: { ...closed.geometry.points, ...Object.fromEntries(Object.entries(open.geometry.points).map(([id, point]) => [`cut-${id}`, point])) },
      loops: [closed.geometry.loops[0], { ...open.geometry.loops[0], id: 'cut', segs: open.geometry.loops[0].segs.map((segment) => ({
        ...segment, from: `cut-${segment.from}`, to: `cut-${segment.to}`,
      })) }],
    } };
    const mdf = build(MDF, { outside: 'mixed', thickness: 0.75 }, rect, [mixed]);
    expect(mdf.offsets.warnings).toEqual([routedWarning]);
    expect(mdf.detail.core).toEqual(rect);
    expect(mdf.section).toMatchObject({ placed: [], cuts: [], skipped: ['outside'] });
    expect(build(FIVE, { outside: 'mixed', thickness: 0.75 }, rect, [mixed]).offsets.warnings).toEqual([]);
  });

  it('uses core height for the slab cutoff while retaining the slab design and outside edge', () => {
    const part = box(0, 0, 24, 5);
    for (const design of [HARDWOOD, MDF]) {
      const result = build(design, { outside: 'bead5', thickness: 0.75,
        appliedMoldings: [{ profileId: 'am1', offset: 2 }] }, part);
      expect(result.detail).toMatchObject({ construction: 'slab', slab: 'design', molding: false, designId: design.id, openings: [] });
      expect(result.fit.lines).toEqual([box(0.3125, 0.3125, 23.375, 4.375), box(0.25, 0.25, 23.5, 4.5)]);
      expect(result.fit.warnings).toEqual([]);
      expect(partSizeRows(result.style, design, part, 0.3125, result.offsets.applied))
        .toMatchObject({ title: 'Slab', rows: [], midRails: [], midStiles: [], opening: null });
    }
  });
});
