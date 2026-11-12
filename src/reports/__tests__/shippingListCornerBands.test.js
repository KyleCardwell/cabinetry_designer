import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { auto, fixed, room, run, wall } from '../../test/builders.js';
import { CABINET_TYPE_IDS } from '../../elevation/model/constants.js';
import { normalizeCornerEnd } from '../../elevation/model/cornerEnd.js';
import { cornerLegBands } from '../../elevation/model/cornerLegBands.js';
import { frontDepth, runBackOffset } from '../../elevation/model/corners.js';
import { moldingPast, moldingProfiles } from '../../elevation/model/moldingProfiles.js';
import { resolveProfile } from '../../elevation/model/profile.js';
import { resolveWall, syncRoom } from '../../elevation/model/room.js';
import { runBands } from '../../elevation/model/runBands.js';
import { runScene } from '../../elevation/model/runScene.js';
import { normalizeElevationDocument } from '../../elevation/store/persistence.js';
import { linealFeet, shippingList, shippingMoldings } from '../shippingList.js';

const golden = normalizeElevationDocument(JSON.parse(readFileSync(
  new URL('../../elevation/model/__tests__/fixtures/golden.json', import.meta.url), 'utf8',
)));
const settings = { ...golden.settings, runFlex: 0 };
let owner, ownerWall, returnWall, subject;

beforeEach(() => {
  owner = run({ cabinetTypeId: CABINET_TYPE_IDS.UPPER, z: 54, height: 30, depth: 12, top: 'crown',
    autoCount: false, items: [fixed('cc', 24), auto('a')], anchors: { left: true, right: false },
    ends: { left: normalizeCornerEnd({ corner: { kind: 90, legB: 24 } }), right: { type: 'none' } },
  });
  ownerWall = wall({ runs: [owner],
    connections: { start: { wallId: 'wall-2', endpoint: 'end' }, end: null },
  });
  returnWall = wall({ id: 'wall-2', x1: 0, y1: 144, x2: 0, y2: 0, runs: [],
    connections: { start: null, end: { wallId: 'wall-1', endpoint: 'start' } },
  });
  subject = room({ profile: structuredClone(golden.rooms[0].profile), walls: [ownerWall, returnWall] });
});

// The pre-CC7 calculation: only ordinary run bands and their existing end returns.
function runFootage(synced, kind) {
  return synced.walls.reduce((total, stored) => total + ['front', 'back'].reduce((sum, side) => {
    const view = resolveWall(synced, stored, side);
    return sum + view.runs.reduce((length, resolved) => {
      const bands = runBands(synced, view, resolved, settings, runScene(synced, view, resolved, settings));
      if (kind === 'toeKick') return length + bands.toeKicks.reduce((n, band) => n + band.width, 0);
      const band = bands[kind];
      if (!band) return length;
      const moldings = moldingProfiles(resolveProfile(settings, synced, view), settings, resolved);
      return length + band.width + band.ends.filter(({ type }) => type === 'return').length
        * (frontDepth(resolved, settings) - runBackOffset(resolved) + moldingPast(moldings, kind, settings));
    }, 0);
  }, 0), 0);
}

describe('corner leg molding footage', () => {
  it.each([true, false])('adds free leg footage when a corner end is %s (CC7)', (hasCorner) => {
    if (!hasCorner) owner.ends.left = { type: 'none' };
    const synced = syncRoom(subject, settings);
    const ownerView = resolveWall(synced, synced.walls[0]);
    expect(moldingProfiles(resolveProfile(settings, synced, ownerView), settings, ownerView.runs[0]).crown)
      .toBeTruthy();
    const legs = cornerLegBands(synced, resolveWall(synced, synced.walls[1]), settings);
    expect(legs.some(({ kind }) => kind === 'crown')).toBe(hasCorner);
    for (const [kind, partKind] of [['crown', 'crown'], ['topMold', 'top_mold']]) {
      const leg = legs.find(({ kind }) => kind === partKind);
      const added = hasCorner ? leg.width + leg.front - leg.back : 0;
      const measured = shippingMoldings(synced, settings)[kind].measured;
      expect(measured - runFootage(synced, kind)).toBeCloseTo(added, 8);
      expect(shippingList(synced, settings).rows.find(({ key }) => key === `molding:${kind}`).size)
        .toBe(`Lineal Feet: ${linealFeet(measured)}`);
    }
  });
});
