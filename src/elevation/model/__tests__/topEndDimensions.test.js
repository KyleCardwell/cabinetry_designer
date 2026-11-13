import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { horizontalChains } from '../dimensions.js';
import { syncRoom } from '../room.js';
import { wallSideView } from '../wallSides.js';

function roomWith(runOverrides) {
  const run = {
    id: 'R', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 30, width: 36, z: 4, height: 30.5, depth: 24,
    heightMode: 'manual', autoCount: true, maxCabinetWidth: null, items: [], overrides: { countertopThickness: 1.5 },
    ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
    anchors: { left: false, right: false }, wallSide: 'front', top: 'stone', ...runOverrides,
  };
  const room = syncRoom({
    id: 'S', name: 'S', profile: { ...DEFAULT_SETTINGS.defaultProfile }, wallOrder: ['A'],
    walls: [{
      id: 'A', name: '', numberOverride: null, elevationForced: false, x1: 0, y1: 0, x2: 120, y2: 0,
      height: 96, thickness: 4.5, flipped: false, connections: { start: null, end: null }, profile: {},
      openings: [], joints: [], runs: [run], endPanels: { start: null, end: null },
      landings: { start: null, end: null }, soffits: [],
    }],
  }, DEFAULT_SETTINGS);
  return { room, wall: wallSideView(room.walls[0], 'front') };
}

const outer = (overrides) => {
  const { room, wall } = roomWith(overrides);
  return horizontalChains(room, wall, 'lower', DEFAULT_SETTINGS).outer
    .map(({ start, end, kind }) => [start, end, kind]);
};

describe('top end dimensions (waterfall legs and non-standard side overhangs)', () => {
  it('measures a touching waterfall leg on the overall row', () => {
    expect(outer({ waterfall: { left: {} } })).toEqual([
      [0, 28.5, 'open'], [28.5, 30, 'waterfall'], [30, 66, 'run'], [66, 120, 'open'],
    ]);
  });

  it('measures the leg and the seating overhang holding it off the run', () => {
    expect(outer({ waterfall: { left: {}, right: {} }, topOverhang: { left: 12 } })).toEqual([
      [0, 16.5, 'open'], [16.5, 18, 'waterfall'], [18, 30, 'overhang'], [30, 66, 'run'],
      [66, 67.5, 'waterfall'], [67.5, 120, 'open'],
    ]);
  });

  it('measures a typed side overhang only when it differs from the default', () => {
    expect(outer({ topOverhang: { right: 10 } })).toEqual([
      [0, 30, 'open'], [30, 66, 'run'], [66, 76, 'overhang'], [76, 120, 'open'],
    ]);
    expect(outer({ topOverhang: { right: 0.75 } })).toEqual([
      [0, 30, 'open'], [30, 66, 'run'], [66, 120, 'open'],
    ]);
    expect(outer({ top: 'crown', topOverhang: { right: 10 } })).toEqual([
      [0, 30, 'open'], [30, 66, 'run'], [66, 120, 'open'],
    ]);
  });

  it('keeps the piece row clear of the leg', () => {
    const { room, wall } = roomWith({ waterfall: { left: {} }, topOverhang: { left: 12 } });
    const { inner } = horizontalChains(room, wall, 'lower', DEFAULT_SETTINGS);
    expect(inner[0]).toMatchObject({ start: 30, kind: 'piece' });
    expect(inner.some(({ start, end }) => start < 30 - 1e-6 && end > 16.5 + 1e-6)).toBe(false);
  });
});
