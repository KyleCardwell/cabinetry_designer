import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from '../constants.js';
import { cornerShapes } from '../cornerParts.js';
import { cornerAt } from '../corners.js';
import { gridFromItems } from '../grid.js';
import { resolveWall, syncRoom } from '../room.js';
import { runBands } from '../runBands.js';
import { runScene } from '../runScene.js';
import { runEndView, runSide } from '../runSide.js';
import { frontContour } from '../bandEnds.js';
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

function setup(extra = {}, using = settings) {
  const room = syncRoom({ id: 'room', name: 'End views', profile: {}, wallOrder: ['W2', 'W3', 'W4'], walls: [
    makeWall('W2', { x1: -72.875, y1: 60, x2: -72.875, y2: 0,
      connections: { start: null, end: { wallId: 'W3', endpoint: 'start' } } }),
    makeWall('W3', { x1: -72.875, y1: 0, x2: 0, y2: 0, flipped: true,
      connections: { start: { wallId: 'W2', endpoint: 'end' }, end: { wallId: 'W4', endpoint: 'start' } },
      runs: [{ id: 'tall', cabinetTypeId: 3, heightMode: 'auto', x: 42.875, width: 30, depth: 24,
        overrides: {}, anchors: { right: true }, ends: { right: { type: 'end_panel', width: null } },
        autoCount: false, grid: gridFromItems('tall', [{ id: 'box', kind: 'cabinet', width: null }]), ...extra }] }),
    makeWall('W4', { x1: 0, y1: 0, x2: 0, y2: 60,
      connections: { start: { wallId: 'W3', endpoint: 'end' }, end: null } }),
  ] }, using);
  const wall = resolveWall(room, room.walls[1]);
  const run = wall.runs[0];
  return { room, wall, run, pieces: runEndView(room, wall, run, 'right', using) };
}

describe('DM6 step a run end views', () => {
  it('anchor 1: returns the tall crown at the outside corner, x 77 5/8, facing right', () => {
    const { room, wall, run } = setup();
    expect(cornerAt(room, wall, 'right').type).toBe('outside');
    expect(run).toMatchObject({ z: 4, height: 110, depth: 24 });
    const bands = runBands(room, wall, run, settings, runScene(room, wall, run, settings));
    expect(bands.crown.ends[1]).toEqual({ type: 'return', x: 77.625, side: 72.875, facing: 1 });
    const mirrored = setup({ anchors: { left: true }, ends: {} });
    expect(runBands(mirrored.room, mirrored.wall, mirrored.run, settings,
      runScene(mirrored.room, mirrored.wall, mirrored.run, settings)).crown.ends[0])
      .toEqual({ type: 'return', x: -4.75, side: 0, facing: -1 });
  });

  it('anchor 2: fills returning neighbour moldings back to zero, keeping their front profiles', () => {
    const { room, wall, run, pieces } = setup();
    const shape = cornerShapes(room, room.walls[2], 'front', settings).find(({ runId }) => runId === run.id);
    const part = (piece) => shape.parts.find(({ id }) => id.endsWith(`:${piece}`));
    expect(part('box')).toMatchObject({ kind: 'profile', x: -24, width: 24, z: 4, height: 110 });
    expect(part('faces')).toMatchObject({ kind: 'profile', x: -24.875, width: 0.875, z: 4, height: 110 });
    expect(part('crown')).toMatchObject({ x: -29.625, width: 29.625, z: 115.5, height: 4.5 });
    expect(part('top_mold')).toMatchObject({ x: -25.125, width: 25.125, z: 114, height: 3 });
    for (const piece of pieces.filter(({ outline }) => outline)) {
      expect(outlineBounds(piece.outline)).toMatchObject({ minX: 0, maxX: piece.front });
      const side = runSide(room, wall, run, settings).find((candidate) => candidate.piece === piece.piece);
      expect(frontContour(piece.outline)).toEqual(frontContour(side.outline));
      expect(outlineBounds(part(piece.piece).outline)).toMatchObject({ minX: -piece.front, maxX: 0 });
    }
  });

  it('anchor 3: uses the nearer end panel and its scene height, including drops and extensions', () => {
    const { room, wall, run, pieces } = setup({ ends: {
      left: { type: 'none' },
      right: { type: 'end_panel', width: null, extend: { up: { to: 'by', amount: 2 } } },
    } });
    const scenePanel = runScene(room, wall, run, settings).drawnPieces.find(({ id }) => id === 'tall:right');
    expect(pieces.find(({ piece }) => piece === 'end_panel')).toEqual({
      piece: 'end_panel', back: 0, front: 24.875, z: scenePanel.z, height: scenePanel.height,
    });
    const shape = cornerShapes(room, room.walls[2], 'front', settings).find(({ runId }) => runId === run.id);
    expect(shape.parts.find(({ kind }) => kind === 'end_panel')).toMatchObject({
      x: -24.875, width: 24.875, z: scenePanel.z, height: scenePanel.height,
    });
    expect(shape.parts.find(({ kind }) => kind === 'end_panel').opaque).not.toBe(false);
    expect(runEndView(room, wall, run, 'left', settings).some(({ piece }) => piece === 'end_panel')).toBe(false);
    const other = cornerShapes(room, room.walls[0], 'front', settings).find(({ runId }) => runId === run.id);
    expect(other.kind).toBe('profile');
    expect(other.parts.some(({ kind }) => kind === 'end_panel')).toBe(false);
  });

  it('fills only returning tops, preserving nonreturning profiles, offsets and countertop pieces', () => {
    const { room, wall, run } = setup({ anchors: {}, outset: 3, ends: {} });
    const neighbour = { ...run, id: 'next', x: run.x + run.width };
    wall.runs.push(neighbour);
    expect(runEndView(room, wall, run, 'right', settings)).toEqual(runSide(room, wall, run, settings));
    const free = runEndView(room, wall, run, 'left', settings);
    expect(free.find(({ piece }) => piece === 'crown')).toMatchObject({ back: 3, front: 32.625 });
    for (const top of ['stone', 'wood']) {
      const topped = { ...run, top };
      expect(runEndView(room, wall, topped, 'left', settings).find(({ piece }) => piece === 'countertop'))
        .toMatchObject({ back: 3, z: 114, height: 1.5 });
    }
  });
});
