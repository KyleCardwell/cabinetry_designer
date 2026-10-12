import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS } from '../constants.js';
import { cornerBandEdge, lazyCornerShapes } from '../cornerBands.js';
import { cornerShapes } from '../cornerParts.js';
import { resolveWall, syncRoom } from '../room.js';
import { runBands } from '../runBands.js';
import { runScene } from '../runScene.js';
import { runSide } from '../runSide.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const load = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const document = normalizeElevationDocument(load('golden'));
const settings = { ...document.settings, sectionProfiles: load('sectionProfiles').profiles };
const baseRun = document.rooms[0].walls[0].runs.find(({ cabinetTypeId }) => cabinetTypeId === CABINET_TYPE_IDS.BASE);
const OUTLINE = [[24.875, 4, 0], [25.375, 4, 0], [25.6875, 3.6875, 0],
  [25.6875, 0, 0], [24.875, 0, 0]];

function setup({ profile = {}, overrides = {}, corner = false } = {}, using = settings) {
  const stored = structuredClone(document.rooms[0]);
  stored.profile = { ...stored.profile, baseKind: 'furniture_base', ...profile };
  const wall = { ...stored.walls[1], x1: 0, y1: 0, x2: 120, y2: 0,
    connections: { start: null, end: null }, openings: [], joints: [],
    endPanels: { start: null, end: null },
    runs: [{ ...structuredClone(baseRun), id: 'base', x: 30, width: 36, overrides,
      anchors: corner ? { left: true } : {},
      ends: { left: { type: 'end_panel' }, right: { type: 'end_panel' } } }],
  };
  stored.walls = [wall];
  if (corner) {
    const neighbor = { ...document.rooms[0].walls[0], x1: 0, y1: 120, x2: 0, y2: 0,
      connections: { start: null, end: { wallId: wall.id, endpoint: 'start' } },
      openings: [], joints: [], endPanels: { start: null, end: null },
      runs: [{ ...structuredClone(baseRun), id: 'neighbor', x: 84, width: 36,
        anchors: { right: true }, ends: {} }],
    };
    wall.connections.start = { wallId: neighbor.id, endpoint: 'end' };
    stored.walls.push(neighbor);
  }
  const room = syncRoom(stored, using);
  const view = resolveWall(room, room.walls[0]);
  const run = view.runs[0];
  return { room, wall: view, run, pieces: runSide(room, view, run, using) };
}

describe('SPEC-50.5 step 489 furniture base side shapes', () => {
  it('replaces the toe kick with a plain rectangle from the faces to the proud front (anchor 1)', () => {
    const { pieces } = setup();
    expect(pieces[0]).toEqual({ piece: 'furniture_base', z: 0, height: 4, back: 24.875, front: 25.6875 });
    expect(pieces.some(({ piece }) => piece === 'toe_kick')).toBe(false);
  });

  it('places the fb4 closed outline down from the base top (anchor 2)', () => {
    const { pieces } = setup({ profile: { furnitureBaseProfileId: 'fb4' } });
    expect(pieces[0]).toEqual({ piece: 'furniture_base', z: 0, height: 4,
      back: 24.875, front: 25.6875, outline: OUTLINE });
    expect(pieces.some(({ piece }) => piece === 'toe_kick')).toBe(false);
  });

  it('copes on the actual left inside-corner return from cornerShapes (anchor 3)', () => {
    const { room, wall, run } = setup({ profile: { furnitureBaseProfileId: 'fb4' }, corner: true });
    const shapes = cornerShapes(room, wall, 'front', settings);
    const returned = shapes.find(({ kind, runId }) => kind === 'return' && runId === 'neighbor');
    expect(returned.parts.find(({ kind }) => kind === 'furniture_base'))
      .toMatchObject({ z: 0, height: 4, x: 24.875, width: 0.8125, outline: OUTLINE });
    expect(returned.parts.some(({ kind }) => kind === 'toe_kick')).toBe(false);
    expect(cornerBandEdge(lazyCornerShapes(room, wall, settings), run, 'left', 'furnitureBase', 0, 4))
      .toEqual({ type: 'cope', x: 25.6875, outline: OUTLINE });
    const band = runBands(room, wall, run, settings, runScene(room, wall, run, settings)).furnitureBases[0];
    expect(band.outline[0]).toEqual([25.6875, 0, 0]);
    expect(band.outline.slice(-2)).toEqual([[25.375, 4, 0], [25.6875, 3.6875, 0]]);
  });

  it('preserves the existing toe kick side pieces (anchor 4)', () => {
    expect(setup({ overrides: { baseKind: 'toe_kick' } }).pieces).toEqual([
      { piece: 'toe_kick', z: 0, height: 4, back: 0, front: 21 },
      { piece: 'box', z: 4, height: 30.5, back: 0, front: 24 },
      { piece: 'faces', z: 4, height: 30.5, back: 24, front: 24.875 },
      { piece: 'countertop', z: 34.5, height: 1.5, back: 0, front: 25.625 },
    ]);
  });

  it('uses stretched geometry and resolved proud, retaining drawn bounds on a height mismatch', () => {
    const profile = { furnitureBaseProfileId: 'fb4' };
    const overrides = { toeKickHeight: 6, furnitureBaseProud: 1 };
    expect(setup({ profile, overrides }).pieces[0]).toEqual({
      piece: 'furniture_base', z: 0, height: 6, back: 25.0625, front: 25.875,
      outline: [[25.0625, 6, 0], [25.5625, 6, 0], [25.875, 5.6875, 0], [25.875, 0, 0], [25.0625, 0, 0]],
    });
    const fixed = structuredClone(settings.sectionProfiles.find(({ id }) => id === 'fb4'));
    delete fixed.stretch;
    expect(setup({ profile, overrides }, { ...settings, sectionProfiles: [fixed] }).pieces[0])
      .toMatchObject({ z: 2, height: 4, outline: [[25.0625, 6, 0], [25.5625, 6, 0],
        [25.875, 5.6875, 0], [25.875, 2, 0], [25.0625, 2, 0]] });
  });

  it('carries the base outline through mirrored corner returns and connected-wall side views', () => {
    for (const [roomIndex, wallIndex, sideView] of [[2, 0, false], [1, 0, true]]) {
      const stored = structuredClone(document.rooms[roomIndex]);
      stored.profile = { ...stored.profile, baseKind: 'furniture_base', furnitureBaseProfileId: 'fb4' };
      const room = syncRoom(stored, settings);
      const wall = resolveWall(room, room.walls[wallIndex]);
      const shape = cornerShapes(room, wall, 'front', settings)
        .find(({ kind, parts }) => kind === (sideView ? 'profile' : 'return')
          && parts.some(({ kind }) => kind === 'furniture_base'));
      expect(shape).toBeDefined();
      const sourceWall = resolveWall(room, room.walls.find(({ id }) => id === shape.wallId), sideView ? 'back' : 'front');
      const sourceRun = sourceWall.runs.find(({ id }) => id === shape.runId);
      const piece = runSide(room, sourceWall, sourceRun, settings).find(({ piece }) => piece === 'furniture_base');
      expect(shape.parts.find(({ kind }) => kind === 'furniture_base').outline)
        .toEqual(piece.outline.map(([depth, z, bulge]) => [sideView ? 172 + depth : wall.length - depth,
          z, sideView ? bulge : -bulge || 0]));
    }
  });
});
