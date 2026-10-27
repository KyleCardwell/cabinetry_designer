import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bandParts } from '../bandParts.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';
import { topSegment, topSegmentRoom, topSegmentSettings } from './fixtures/topSegments.js';

const segmentParts = (overrides) => {
  const room = topSegmentRoom(overrides);
  return bandParts(room, room.walls[0], 'front', topSegmentSettings).filter(({ kind }) => kind === 'countertop');
};

describe('ST4 step c top segment parts', () => {
  it('anchors 1–2: draws the dropped insert and splits the main top with its outer ends unchanged', () => {
    const original = segmentParts({ topSegments: [] })[0];
    const parts = segmentParts();
    expect(parts.map(row)).toEqual([
      ['r:countertop', 'countertop', -0.75, 34.5, 30.75, 1.5, original.back, original.front, false],
      ['r:countertop:2', 'countertop', 60, 34.5, 30.75, 1.5, original.back, original.front, false],
      ['r:top-s', 'countertop', 30, 32.5, 30, 3.5, original.back, original.front, false],
    ]);
  });

  it('anchor 3: covers A–C and leaves only the end overhangs, or no main top without overhangs', () => {
    const topSegments = [{ ...topSegment, from: 'C', to: 'A' }];
    expect(segmentParts({ topSegments }).map(({ id, x, width }) => [id, x, width])).toEqual([
      ['r:countertop', -0.75, 0.75], ['r:countertop:2', 90, 0.75], ['r:top-s', 0, 90],
    ]);
    expect(segmentParts({ topSegments, topOverhang: { left: 0, right: 0 } }).map(({ id }) => id))
      .toEqual(['r:top-s']);
  });

  it('draws overlap mode identically, ignores inactive segments, and numbers remaining spans left to right', () => {
    expect(segmentParts({ topSegments: [{ ...topSegment, mode: 'overlap' }] })).toEqual(segmentParts());
    const original = segmentParts({ topSegments: [] });
    expect(segmentParts({ topSegments: [{ ...topSegment, from: 'gone' }] })).toEqual(original);
    expect(segmentParts({ top: 'none' })).toEqual([]);
    expect(segmentParts({ topSegments: [topSegment, { ...topSegment, id: 'later', from: 'A', to: 'B' }] }))
      .toEqual(segmentParts());
    expect(segmentParts({ topSegments: [
      { ...topSegment, id: 'right', from: 'C', to: 'C' },
      { ...topSegment, id: 'left', from: 'A', to: 'A' },
    ] }).map(({ id, x, width }) => [id, x, width])).toEqual([
      ['r:countertop', -0.75, 0.75], ['r:countertop:2', 30, 30], ['r:countertop:3', 90, 0.75],
      ['r:top-right', 60, 30], ['r:top-left', 0, 30],
    ]);
  });

  it('preserves curved nosing, clips its lines, and retains waterfall legs outside a full-run insert', () => {
    const room = topSegmentRoom({ top: 'wood', overrides: { nosingProfileId: 'nosing' } });
    const run = room.walls[0].runs[0];
    const using = { ...topSegmentSettings, sectionProfiles: [{
      id: 'nosing', kind: 'nosing', geometry: {
        units: 'in', points: { a: [0, 0], b: [0.25, 0], c: [0.5, -0.25], d: [0.5, -1.5], e: [0, -1.5] },
        loops: [{ id: 'loop', closed: true, segs: [
          { type: 'line', from: 'a', to: 'b' },
          { type: 'arc', from: 'b', to: 'c', center: [0.25, -0.25], ccw: false },
          { type: 'line', from: 'c', to: 'd' }, { type: 'line', from: 'd', to: 'e' },
          { type: 'line', from: 'e', to: 'a' },
        ] }],
      }, drawnPoints: { elevation: ['c'] },
    }] };
    const parts = bandParts(room, room.walls[0], 'front', using).filter(({ kind }) => kind === 'countertop');
    expect(parts[0].outline).toEqual([
      [-0.5, 34.5, 0], [30, 34.5, 0], [30, 36, 0], [-0.25, 36, 0.414214], [-0.5, 35.75, 0],
    ]);
    expect(parts[1].outline).toEqual([
      [60, 34.5, 0], [90.5, 34.5, 0], [90.5, 35.75, 0.414214], [90.25, 36, 0], [60, 36, 0],
    ]);
    expect(parts.slice(0, 2).map(({ lines }) => lines)).toEqual([
      [{ x1: -0.5, z1: 35.75, x2: 30, z2: 35.75 }],
      [{ x1: 60, z1: 35.75, x2: 90.5, z2: 35.75 }],
    ]);
    const waterfall = segmentParts({ topSegments: [{ ...topSegment, from: 'A', to: 'C' }],
      topOverhang: { left: 0, right: 0 }, waterfall: { left: {}, right: {} } });
    expect(waterfall.map(({ id, x, z, width, height }) => [id, x, z, width, height])).toEqual([
      ['r:countertop', -1.5, 0, 1.5, 36], ['r:countertop:2', 90, 0, 1.5, 36],
      ['r:top-s', 0, 32.5, 90, 3.5],
    ]);
    expect(run.topSegments).toEqual([topSegment]);
  });
});

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
// Keep these layout anchors independent of run flex (RF3).
const settings = { ...document.settings, runFlex: 0 };
const room = (name) => syncRoom(document.rooms.find((candidate) => candidate.name === name), settings);
const partsOf = (synced, wallIndex, side = 'front') => bandParts(synced, synced.walls[wallIndex], side, settings);
const row = ({ id, kind, x, z, width, height, back, front, coversBoxEdges }) => (
  [id, kind, x, z, width, height, back, front, coversBoxEdges]
);

const TALL = 'b38f2f11-5318-42f2-9d95-8b9b3d1b9087';
const BASE = 'b822e8ac-1a44-47ca-acec-ecb93caf7b8a';
const UPPER = '434f1164-3b6b-4a97-89e7-1c6438c4d95a';

describe('SPEC-42 band parts', () => {
  it('a toe kick sits back from the boxes; a top runs past the faces (G1 elevation A)', () => {
    const parts = partsOf(room('G1 Euro kitchen'), 0);
    expect(parts.map(row)).toEqual([
      [`${TALL}:toe_kick`, 'toe_kick', 1, 0, 28, 4, 0, 22, false],
      [`${TALL}:top_mold`, 'top_mold', -0.25, 90, 30.5, 3, 0, 26.125, false],
      [`${TALL}:crown`, 'crown', -3, 91.5, 36, 4.5, 0, 28.875, false],
      [`${BASE}:toe_kick`, 'toe_kick', 29, 0, 118, 4, 0, 21, false],
      [`${BASE}:countertop`, 'countertop', 30, 34.5, 112.375, 1.5, 0, 25.625, false],
      [`${UPPER}:top_mold`, 'top_mold', 108.25, 90, 46.625, 3, 0, 13.125, false],
      [`${UPPER}:crown`, 'crown', 105.5, 91.5, 46.625, 4.5, 0, 15.875, false],
    ]);
    expect(parts[0]).toEqual({
      id: `${TALL}:toe_kick`, kind: 'toe_kick', runId: TALL,
      x: 1, z: 0, width: 28, height: 4, back: 0, front: 22, coversBoxEdges: false,
    });
  });

  it('a face frame run\'s top runs past its frame; a recess run\'s bands sit back in the recess (G2, G5)', () => {
    const g2 = partsOf(room('G2 Face frame kitchen'), 0);
    const frameRun = 'a42e9a57-a98f-47f0-b6b4-9076b513db6e';
    expect(row(g2.find(({ id }) => id === `${frameRun}:crown`)))
      .toEqual([`${frameRun}:crown`, 'crown', 47, 91.5, 32.5, 4.5, 0, 28.8125, false]);
    const recessRun = 'e9abb5dc-e72c-44c9-ac96-d3279b7752d9';
    expect(partsOf(room('G5 Recess room'), 1).filter(({ runId }) => runId === recessRun).map(row)).toEqual([
      [`${recessRun}:toe_kick`, 'toe_kick', 140, 0, 48, 4, -24, -6, false],
      [`${recessRun}:countertop`, 'countertop', 140, 34.5, 48, 1.5, -24, -1.375, false],
    ]);
  });

  it('a part below a run is flush with its boxes; an outset run\'s bands move out with it (G6)', () => {
    const parts = partsOf(room('G6 Stacked runs'), 1);
    expect(parts.map(({ kind }) => kind)).toEqual([
      'toe_kick', 'countertop', 'bottom_cap', 'top_mold', 'crown', 'toe_kick', 'countertop',
    ]);
    expect(row(parts[2])).toEqual(['c77d332c-1c0f-46ec-80a7-269fd9db569b', 'bottom_cap', 0, 54, 100.1875, 1.5, 0, 12, false]);
    const wood = '01a2a0e1-4bd1-434d-9c9b-66bc20ee7e54';
    expect(row(parts[6])).toEqual([`${wood}:countertop`, 'countertop', 127.75, 34.5, 72.25, 1.5, 8, 33.625, false]);
  });
});
