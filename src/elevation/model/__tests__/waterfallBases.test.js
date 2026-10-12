import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS } from '../constants.js';
import { furnitureBaseGroups } from '../furnitureBaseGroups.js';
import { resolveWall, syncRoom } from '../room.js';
import { runBandEnds, runBands } from '../runBands.js';
import { runScene } from '../runScene.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const load = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const document = normalizeElevationDocument(load('golden'));
const settings = { ...document.settings, sectionProfiles: load('sectionProfiles').profiles };
const template = document.rooms[0].walls[0].runs.find(({ cabinetTypeId }) => cabinetTypeId === CABINET_TYPE_IDS.BASE);

function setup(props = {}, profile = {}) {
  const stored = structuredClone(document.rooms[0]);
  stored.profile = { ...stored.profile, baseKind: 'toe_kick', furnitureBaseProfileId: null,
    furnitureBaseProud: 0.8125, ...profile };
  stored.walls = [{ ...stored.walls[0], x1: 0, y1: 0, x2: 120, y2: 0, profile: {},
    connections: { start: null, end: null }, openings: [], joints: [],
    endPanels: { start: null, end: null },
    runs: [{ ...structuredClone(template), id: 'base', x: 30, width: 36, depth: 24,
      top: 'stone', anchors: {}, overrides: {},
      ends: { left: { type: 'none' }, right: { type: 'none' } },
      waterfall: { left: {} }, ...props }],
  }];
  stored.wallOrder = [stored.walls[0].id];
  const room = syncRoom(stored, settings);
  const wall = resolveWall(room, room.walls[0]);
  const run = wall.runs[0];
  const scene = runScene(room, wall, run, settings);
  return { bands: runBands(room, wall, run, settings, scene),
    ends: (kind) => runBandEnds(room, wall, run, settings, scene, kind, 0, 4),
    groups: furnitureBaseGroups(room, settings) };
}

const furniture = { baseKind: 'furniture_base' };
const anchors = [
  { name: 'touching toe kick (anchor 1)', props: {}, kind: 'toeKick', x: 30, width: 35.75 },
  { name: 'toe kick with a gap (anchor 2)', props: { topOverhang: { left: 12 } },
    kind: 'toeKick', x: 30.25, width: 35.5 },
  { name: 'toe kick bridging a gap (anchor 3)',
    props: { topOverhang: { left: 12 }, waterfall: { left: { baseToLeg: true } } },
    kind: 'toeKick', x: 18, width: 47.75 },
  { name: 'touching furniture base without scribe (anchor 4)', props: {}, profile: furniture,
    kind: 'furnitureBase', x: 30, width: 36.8125 },
  { name: 'furniture base with a gap (anchor 5)', props: { topOverhang: { left: 12 } },
    profile: furniture, kind: 'furnitureBase', x: 29.1875, width: 37.625 },
];

describe('SPEC-50.10 step 506 bases at waterfall ends', () => {
  it.each(anchors)('$name', ({ props, profile, kind, x, width }) => {
    const result = setup(props, profile);
    expect(result.bands[kind]).toMatchObject({ x, width });
    if (kind === 'furnitureBase') {
      // orderedWidth equal to width proves neither exposed end adds a scribe.
      expect(result.groups).toHaveLength(1);
      expect(result.groups[0]).toMatchObject({ width, orderedWidth: width,
        steps: [{ wallId: document.rooms[0].walls[0].id, side: 'front', x1: x, x2: 66.8125, depth: 25.6875 }] });
    }
  });

  it('retains the toe kick end-panel setback only for a touching leg', () => {
    const ends = { left: { type: 'end_panel' }, right: { type: 'none' } };
    for (const baseToLeg of [false, true]) {
      expect(setup({ ends, waterfall: { left: { baseToLeg } } }).bands.toeKick)
        .toMatchObject({ x: 31, width: 34.75 });
    }
    expect(setup({ ends, topOverhang: { left: 12 } }).bands.toeKick)
      .toMatchObject({ x: 31, width: 34.75 });
    expect(setup({ ends, topOverhang: { left: 12 }, waterfall: { left: { baseToLeg: true } } }).bands.toeKick)
      .toMatchObject({ x: 18, width: 47.75 });
    expect(setup({ ends }, furniture).bands.furnitureBase).toMatchObject({ x: 30, width: 36.8125 });
  });

  it('mirrors both legs and squares profiled furniture bases without ordered-width scribe', () => {
    for (const top of ['stone', 'wood']) {
      for (const kind of ['toeKick', 'furnitureBase']) {
        const profile = kind === 'furnitureBase' ? { ...furniture, furnitureBaseProfileId: 'fb4' } : {};
        const right = setup({ top, waterfall: { right: { baseToLeg: true } }, topOverhang: { right: 12 } }, profile);
        expect(right.ends(kind)[1]).toEqual({ type: 'square', x: 78 });
        const both = setup({ top, waterfall: { left: {}, right: { baseToLeg: true } },
          topOverhang: { right: 12 } }, profile);
        expect(both.bands[kind]).toMatchObject({ x: 30, width: 48 });
        if (kind === 'furnitureBase') {
          expect(both.bands.furnitureBase.outline).toEqual([[30, 0, 0], [78, 0, 0], [78, 4, 0], [30, 4, 0]]);
          expect(both.bands.furnitureBase.lines).toEqual([{ x1: 30, z1: 3.6875, x2: 78, z2: 3.6875 }]);
          expect(both.groups[0]).toMatchObject({ width: 48, orderedWidth: 48 });
        }
      }
    }
  });

  it('preserves blocked-end scribe and ignores non-countertop waterfall picks', () => {
    for (const props of [{ anchors: { left: { to: 'wall' } } }, { top: 'crown' }, { top: 'none' }]) {
      for (const profile of [{}, furniture]) {
        const picked = setup({ ...props, topOverhang: { left: 12 }, waterfall: { left: { baseToLeg: true } } }, profile);
        const unpicked = setup({ ...props, topOverhang: { left: 12 }, waterfall: undefined }, profile);
        expect(picked).toMatchObject({ bands: unpicked.bands, groups: unpicked.groups });
        if (props.anchors && profile === furniture) {
          expect(picked.groups[0]).toMatchObject({ width: 36.8125, orderedWidth: 37.3125 });
        }
      }
    }
  });
});
