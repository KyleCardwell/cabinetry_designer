import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from '../constants.js';
import { cornerShapes } from '../cornerParts.js';
import { gridFromItems } from '../grid.js';
import { resolveWall, syncRoom } from '../room.js';
import { runBands } from '../runBands.js';
import { runScene } from '../runScene.js';
import { outlineBounds } from '../sectionProfileOutline.js';

const { profiles } = JSON.parse(readFileSync(new URL('./fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const cr45 = structuredClone(profiles.find(({ id }) => id === 'cr45'));
for (const point of Object.values(cr45.geometry.points)) point[0] *= 1.5;
const settings = { ...DEFAULT_SETTINGS, runFlex: 0,
  defaultProfile: { ...DEFAULT_PROFILE, crownTop: 120, crownStackHeight: 6,
    topMoldProfileId: 'tm3', crownProfileId: 'cr45' },
  sectionProfiles: [profiles.find(({ id }) => id === 'tm3'), cr45] };

const makeWall = (id, extra) => ({ id, height: 120, thickness: 4.5, profile: {},
  openings: [], joints: [], runs: [], connections: { start: null, end: null }, ...extra });

function setup({ depth = 24, neighbor = {}, faceRun = {}, extraRuns = [], mirror = false } = {}) {
  const stored = { id: 'room', name: 'End views', profile: {}, wallOrder: ['W2', 'W3', 'W4'], walls: [
    makeWall('W2', { x1: -72.875, y1: 60, x2: -72.875, y2: 0,
      connections: { start: null, end: { wallId: 'W3', endpoint: 'start' } } }),
    makeWall('W3', { x1: -72.875, y1: 0, x2: 0, y2: 0, flipped: true,
      connections: { start: { wallId: 'W2', endpoint: 'end' }, end: { wallId: 'W4', endpoint: 'start' } },
      runs: [{ id: 'tall', cabinetTypeId: 3, heightMode: 'auto', x: 0, width: 24.875, depth: 24,
        overrides: {}, anchors: { left: true }, ends: { left: { type: 'end_panel', width: null } },
        autoCount: false, grid: gridFromItems('tall', [{ id: 'box', kind: 'cabinet', width: null }]), ...neighbor }] }),
    makeWall('W4', { x1: 0, y1: 0, x2: 0, y2: 60,
      connections: { start: { wallId: 'W3', endpoint: 'end' }, end: null },
      runs: [{ id: 'face-tall', cabinetTypeId: 3, heightMode: 'auto', x: 0, width: 36, depth,
        overrides: {}, anchors: { left: true }, ends: {}, autoCount: false,
        grid: gridFromItems('face-tall', [{ id: 'face-box', kind: 'cabinet', width: null }]), ...faceRun }, ...extraRuns] }),
  ] };
  if (mirror) {
    for (const wall of stored.walls) {
      const length = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
      wall.x1 *= -1;
      wall.x2 *= -1;
      for (const run of wall.runs) {
        run.x = length - run.x - run.width;
        run.anchors = { left: run.anchors.right, right: run.anchors.left };
        run.ends = { left: run.ends.right, right: run.ends.left };
      }
    }
  }
  const room = syncRoom(stored, settings);
  const wall = resolveWall(room, room.walls[2]);
  const run = wall.runs[0];
  const scene = runScene(room, wall, run, settings);
  return { room, wall, run, bands: runBands(room, wall, run, settings, scene),
    shapes: cornerShapes(room, wall, 'front', settings) };
}

describe('DM6 step b bands meeting neighbour end views', () => {
  it('anchor 1: runs the crown through to x -29 5/8 at the neighbour faces, dropping its crown', () => {
    const { bands, shapes } = setup();
    expect(bands.crown.ends[0]).toMatchObject({ type: 'return', x: -29.625, side: -24.875, facing: -1 });
    expect(bands.crown.x).toBe(-29.625);
    const neighbor = shapes.find(({ runId }) => runId === 'tall');
    expect(neighbor.parts.some(({ kind }) => kind === 'crown')).toBe(false);
    expect(neighbor.parts.some(({ kind }) => kind === 'profile')).toBe(true);
  });

  it('anchor 2: runs the top mold through to x -25 1/8 and drops its end-view copy', () => {
    const { bands, shapes } = setup();
    expect(bands.topMold.ends[0]).toMatchObject({ type: 'return', x: -25.125, side: -24.875, facing: -1 });
    expect(bands.topMold.x).toBe(-25.125);
    expect(shapes.find(({ runId }) => runId === 'tall').parts.some(({ kind }) => kind === 'top_mold')).toBe(false);
  });

  it('anchor 3: copes a 12 inch upper into the deeper tall crown, retaining its projected return', () => {
    const { room, wall, shapes } = setup({ faceRun: { x: 36, width: 24, anchors: {} }, extraRuns: [{
      id: 'upper', cabinetTypeId: 2, heightMode: 'auto', x: 0, width: 36, depth: 12,
      overrides: {}, anchors: { left: true }, ends: {}, autoCount: false,
      grid: gridFromItems('upper', [{ id: 'upper-box', kind: 'cabinet', width: null }]),
    }] });
    const upper = wall.runs.find(({ id }) => id === 'upper');
    expect(upper.z + upper.height).toBe(114);
    const bands = runBands(room, wall, upper, settings, runScene(room, wall, upper, settings));
    expect(bands.crown.ends[0]).toMatchObject({ type: 'cope', x: 4.75, side: 0, facing: 1 });
    const crown = shapes.find(({ runId }) => runId === 'tall').parts.find(({ kind }) => kind === 'crown');
    expect(crown).toMatchObject({ x: -29.625, width: 34.375 });
    expect(outlineBounds(crown.outline)).toMatchObject({ minX: -29.625, maxX: 4.75 });
  });

  it('anchor 4: returns a 30 inch deep tall freely at x -4 3/4 and keeps the neighbour crown', () => {
    const { bands, shapes } = setup({ depth: 30 });
    expect(bands.crown.ends[0]).toEqual({ type: 'return', x: -4.75, side: 0, facing: -1 });
    expect(shapes.find(({ runId }) => runId === 'tall').parts.some(({ kind }) => kind === 'crown')).toBe(true);
  });

  it('uses the 1/32 inch front tolerance, requiring a touching body and the same band height', () => {
    for (const depth of [24 - 1 / 32, 24 + 1 / 32]) {
      const { bands, shapes } = setup({ depth });
      expect(bands.crown.ends[0]).toMatchObject({ type: 'return', x: -29.625 });
      expect(shapes.find(({ runId }) => runId === 'tall').parts.some(({ kind }) => kind === 'crown')).toBe(false);
    }
    expect(setup({ depth: 24 - 3 / 64 }).bands.crown.ends[0].type).toBe('cope');
    expect(setup({ depth: 24 + 3 / 64 }).bands.crown.ends[0]).toEqual({ type: 'return', x: -4.75, side: 0, facing: -1 });
    for (const input of [
      { faceRun: { x: 1, anchors: {} } },
      { neighbor: { heightMode: 'manual', z: 4, height: 100, top: 'crown' } },
      { neighbor: { top: 'none' } },
    ]) {
      const { bands, run, shapes } = setup(input);
      expect(bands.crown.ends[0]).toEqual(input.neighbor ? { type: 'square', x: 0 }
        : { type: 'return', x: run.x - 4.75, side: run.x, facing: -1 });
      if (!input.neighbor || input.neighbor.top !== 'none') {
        expect(shapes.find(({ runId }) => runId === 'tall').parts.some(({ kind }) => kind === 'crown')).toBe(true);
      }
    }
  });

  it('mirrors through, cope and free returns at the right end', () => {
    const through = setup({ mirror: true });
    expect(through.bands.crown.ends[1]).toMatchObject({ type: 'return', x: 89.625, side: 84.875, facing: 1 });
    expect(outlineBounds(through.bands.crown.outline).maxX).toBe(89.625);
    expect(through.shapes.find(({ runId }) => runId === 'tall').parts.some(({ kind }) => kind === 'crown')).toBe(false);
    const cope = setup({ mirror: true, depth: 12 });
    expect(cope.bands.crown.ends[1]).toMatchObject({ type: 'cope', x: 55.25, side: 60, facing: -1 });
    const crown = cope.shapes.find(({ runId }) => runId === 'tall').parts.find(({ kind }) => kind === 'crown');
    expect(outlineBounds(crown.outline)).toMatchObject({ minX: 55.25, maxX: 89.625 });
    expect(setup({ mirror: true, depth: 30 }).bands.crown.ends[1])
      .toEqual({ type: 'return', x: 64.75, side: 60, facing: 1 });
  });
});
