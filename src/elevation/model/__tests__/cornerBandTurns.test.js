import { describe, expect, it } from 'vitest';
import { auto, fixed, room, run, wall } from '../../../test/builders.js';
import { bandFronts, bandParts } from '../bandParts.js';
import { cornerBandTurns } from '../cornerBands.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { cornerEnd, normalizeCornerEnd } from '../cornerEnd.js';
import { resolveWall, syncRoom } from '../room.js';

const S = { ...DEFAULT_SETTINGS, runFlex: 0 };

function anchor({ kind = 90, depthB = null, framed = false, ownerOverrides = {} } = {}) {
  const owner = run({ autoCount: false, items: [fixed('cc', 36), auto('a')],
    anchors: { left: true, right: false },
    ends: { left: normalizeCornerEnd({ corner: { kind, depthB } }), right: { type: 'none' } },
    ...ownerOverrides,
  });
  const subject = syncRoom(room({
    ...(framed ? { style: { cabinetStyleId: 14 } } : {}),
    walls: [wall({ runs: [owner],
      connections: { start: { wallId: 'wall-2', endpoint: 'end' }, end: null },
    }), wall({ id: 'wall-2', x1: 0, y1: 144, x2: 0, y2: 0, runs: [],
      connections: { start: null, end: { wallId: 'wall-1', endpoint: 'start' } },
    })],
  }), S);
  const view = resolveWall(subject, subject.walls[0], 'front');
  const syncedOwner = view.runs[0];
  return { subject, view, owner: syncedOwner, corner: cornerEnd(subject, view, syncedOwner, 'left', S) };
}

describe('CC7 step a corner band turns', () => {
  const point = (actual, expected) => actual.forEach((value, index) => {
    expect(Math.abs(value - expected[index])).toBeLessThan(1e-3);
  });

  it('anchor 1: turns an E90 countertop at the two fronts', () => {
    const { corner } = anchor();
    expect(cornerBandTurns(corner, 'countertop', 25.625)).toEqual({
      frontA: 25.625, frontB: 25.625, a: [25.625, 25.625], b: [25.625, 25.625],
    });
  });

  it('anchor 2: transfers countertop projection and toe kick setback to the shallower E90 leg', () => {
    const { corner } = anchor({ depthB: 15 });
    const top = cornerBandTurns(corner, 'countertop', 25.625);
    const toe = cornerBandTurns(corner, 'toeKick', 21);
    expect(top).toEqual({ frontA: 25.625, frontB: 16.625, a: [16.625, 25.625], b: [16.625, 25.625] });
    expect(toe).toEqual({ frontA: 21, frontB: 12, a: [12, 21], b: [12, 21] });
  });

  it('anchor 3: offsets the E45 countertop from the door face', () => {
    const { corner } = anchor({ kind: 45 });
    const turn = cornerBandTurns(corner, 'countertop', 25.625);
    expect(turn).toMatchObject({ frontA: 25.625, frontB: 25.625 });
    point(turn.a, [36.3732, 25.625]);
    point(turn.b, [25.625, 36.3732]);
  });

  it('anchor 4: sets the E45 toe kick back from the box diagonal', () => {
    const { corner } = anchor({ kind: 45 });
    const turn = cornerBandTurns(corner, 'toeKick', 21);
    expect(turn).toMatchObject({ frontA: 21, frontB: 21 });
    point(turn.a, [34.0074, 21]);
    point(turn.b, [21, 34.0074]);
  });

  it('anchor 5: uses the F45 frame diagonal and framed door face independently', () => {
    const { corner } = anchor({ kind: 45, framed: true });
    const top = cornerBandTurns(corner, 'countertop', 25.5625);
    const toe = cornerBandTurns(corner, 'toeKick', 21);
    expect(top.frontB).toBe(25.5625);
    expect(toe.frontB).toBe(21);
    point(top.a, [36.6472, 25.5625]);
    point(top.b, [25.5625, 36.6472]);
    point(toe.a, [34.7574, 21]);
    point(toe.b, [21, 34.7574]);
  });

  it('anchor 6: intersects the unequal-depth E45u bands at each leg front', () => {
    const { corner } = anchor({ kind: 45, depthB: 15 });
    const top = cornerBandTurns(corner, 'countertop', 25.625);
    const toe = cornerBandTurns(corner, 'toeKick', 21);
    expect(top.frontB).toBe(16.625);
    expect(toe.frontB).toBe(12);
    point(top.a, [36.2069, 25.625]);
    point(top.b, [16.625, 36.5038]);
    point(toe.a, [34.4726, 21]);
    point(toe.b, [12, 33.4848]);
    for (const kind of ['furnitureBase', 'topMold', 'crown']) {
      expect(cornerBandTurns(corner, kind, 25.625)).toEqual(top);
    }
  });

  it('anchor 7: extracts E90 fronts and preserves the complete original bandParts output', () => {
    const { subject, view, owner } = anchor();
    expect(bandFronts(subject, view, owner, S)).toEqual({
      toeKick: 21, furnitureBase: null, countertop: 25.625, topMold: null, crown: null,
    });
    expect(bandParts(subject, view, 'front', S)).toEqual([
      { id: 'run-1:toe_kick', kind: 'toe_kick', runId: 'run-1', x: 0, z: 0,
        width: 119.75, height: 4, back: 0, front: 21, coversBoxEdges: false },
      { id: 'run-1:countertop', kind: 'countertop', runId: 'run-1', x: 0, z: 34.5,
        width: 120.75, height: 1.5, back: 0, front: 25.625, coversBoxEdges: false },
    ]);
  });

  it('keeps offsets distinct when the return leg has different face thickness', () => {
    const { corner } = anchor({ kind: 45, depthB: 15 });
    const changed = { ...corner, offsetB: corner.offsetB + 0.5 };
    for (const kind of ['countertop', 'furnitureBase', 'topMold', 'crown']) {
      expect(cornerBandTurns(changed, kind, 25.625).frontB).toBe(17.125);
    }
    expect(cornerBandTurns(changed, 'toeKick', 21)).toEqual(cornerBandTurns(corner, 'toeKick', 21));
  });

  it('extracts furniture base, molding and wood nosing fronts with run offsets and overrides', () => {
    const { subject, view, owner } = anchor({ ownerOverrides: {
      outset: 2, top: 'crown', overrides: { baseKind: 'furniture_base', furnitureBaseProud: 1.25 },
    } });
    // Missing profile records still draw the plain molding bands, using the existing fallback projections.
    const using = { ...subject, profile: { topMoldProfileId: 'missing', crownProfileId: 'missing' } };
    expect(bandFronts(using, view, owner, S)).toEqual({
      toeKick: null, furnitureBase: 28.125, countertop: null, topMold: 27.125, crown: 29.875,
    });
    for (const part of bandParts(using, view, 'front', S)) {
      expect(part.front).toBe({ furniture_base: 28.125, top_mold: 27.125, crown: 29.875 }[part.kind]);
    }
    const wood = { ...owner, top: 'wood', topOverhang: { front: 1.25 },
      overrides: { toeKickHeight: 0, nosingProfileId: 'nosing' } };
    const settings = { ...S, sectionProfiles: [{ id: 'nosing', kind: 'nosing',
      geometry: { units: 'in', points: { a: [0, 0], b: [0.5, 0], c: [0.5, -1.5], d: [0, -1.5] },
        loops: [{ id: 'loop', closed: true, segs: [
          { type: 'line', from: 'a', to: 'b' }, { type: 'line', from: 'b', to: 'c' },
          { type: 'line', from: 'c', to: 'd' }, { type: 'line', from: 'd', to: 'a' },
        ] }] }, drawnPoints: { elevation: [] },
    }] };
    expect(bandFronts(subject, view, wood, settings)).toEqual({
      toeKick: null, furnitureBase: null, countertop: 28.625, topMold: null, crown: null,
    });
  });
});
