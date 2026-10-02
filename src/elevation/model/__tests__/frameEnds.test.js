import { describe, expect, it } from 'vitest';
import { cellPieces } from '../cells.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { horizontalChains } from '../dimensions.js';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
import { frameRegions } from '../frames.js';
import { gridFromItems } from '../grid.js';
import { planRunPieces } from '../planPieces.js';
import { resolveWall, syncRoom } from '../room.js';
import { wallEndPanelFramed, wallEndPanelPolygon, wallEndPanelSpans, wallEndPanels } from '../wallEndPanels.js';
import { wallSideView } from '../wallSides.js';

const S = DEFAULT_SETTINGS;
const INSET = { cabinetStyleId: 14 };
const PANEL = { type: 'end_panel', width: null };

const islandRun = (id, wallSide, overrides = {}) => ({
  id, cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 0, width: 96, z: 4, height: 30.5, depth: 24,
  ends: { left: PANEL, right: PANEL }, autoCount: false, maxCabinetWidth: null,
  heightMode: 'manual', overrides: {}, anchors: { left: true, right: true }, wallSide,
  grid: gridFromItems(id, [{ id: `${id}a`, kind: 'cabinet', width: null }, { id: `${id}b`, kind: 'cabinet', width: null }]),
  ...overrides,
});

/** SPEC-36.2 ISL: a 96" island (a 0" wall), a 24" inset base each side, a wall end panel at its start. */
function island({ front = {}, back = {}, panel = { width: null }, style = INSET } = {}) {
  return syncRoom({
    id: 'room', name: 'Room', profile: { ...S.defaultProfile }, wallOrder: ['I'],
    ...(style ? { style } : {}),
    walls: [{
      id: 'I', name: '', numberOverride: null, elevationForced: false,
      x1: 0, y1: 0, x2: 96, y2: 0, height: 96, thickness: 0, flipped: false,
      connections: { start: null, end: null }, profile: {}, openings: [], joints: [],
      runs: [islandRun('F', 'front', front), islandRun('K', 'back', back)],
      endPanels: { start: panel, end: null }, landings: { start: null, end: null }, soffits: [],
    }],
  }, S);
}

const runOf = (room, id) => room.walls[0].runs.find((run) => run.id === id);

function frontFrames(room) {
  const wall = resolveWall(room, wallSideView(room.walls[0], 'front'));
  const run = runOf(room, 'F');
  const layout = layoutRun(room, wall, run, S);
  return {
    wall,
    run,
    layout,
    frames: frameRegions(room, run, cellPieces(run, layout), S),
    faces: runFaceLayouts(room, wall, run, S, layout),
  };
}

describe('SPEC-36.2 wall end panels in a face frame', () => {
  it('covers a flush wall end panel: the frame runs over it and the box keeps its side', () => {
    const room = island();
    expect(runOf(room, 'F')._frame).toEqual({
      thickness: 0.8125, drop: 0, bead: 0, wallPanels: { left: { width: 0.75, top: 34.5, join: 'miter' }, right: null },
    });
    expect(runOf(room, 'K')._frame.wallPanels).toEqual({
      left: null, right: { width: 0.75, top: 34.5, join: 'miter' },
    });
    expect('_frame' in runOf(island({ style: null }), 'F')).toBe(false);

    const { frames, faces } = frontFrames(room);
    expect(frames.regions).toEqual([{
      id: 'frame:Fa', x: 0, z: 4, width: 96, height: 30.5, cabinetIds: ['Fa', 'Fb'], fillerIds: [],
      panelIds: ['F:right'], wallPanels: [{ side: 'left', x: 0, width: 0.75 }],
    }]);
    expect(frames.freeSides.get('Fa')).toEqual({ left: false, right: false });
    expect([faces.get('Fa').box.x, faces.get('Fa').box.width]).toEqual([1, 47]);
    expect(faces.get('Fa').openings).toEqual([{ path: 'r', x: 1.75, z: 5.5, width: 45.5, height: 27.5 }]);
  });

  it('lets the frame die into a taller panel, or as the panel says', () => {
    const taller = island({ back: { height: 36 } });
    expect(runOf(taller, 'F')._frame.wallPanels.left).toEqual({ width: 0.75, top: 40, join: 'butt' });
    expect(runOf(taller, 'K')._frame.wallPanels.right).toEqual({ width: 0.75, top: 40, join: 'miter' });
    const { frames, faces } = frontFrames(taller);
    expect(frames.regions[0]).toMatchObject({ x: 0.75, width: 95.25 });
    expect('wallPanels' in frames.regions[0]).toBe(false);
    expect([faces.get('Fa').box.x, faces.get('Fa').box.width]).toEqual([1.875, 46.5]);

    expect(runOf(island({ panel: { width: null, frame: 'butt' } }), 'F')._frame.wallPanels.left.join)
      .toBe('butt');
    expect(runOf(island({ back: { height: 36 }, panel: { width: null, frame: 'miter' } }), 'F')
      ._frame.wallPanels.left.join).toBe('miter');
  });
});

describe('SPEC-36.2 a mitered wall end panel in plan, chain and elevation', () => {
  it('miters the frame strip and the panel, and runs the chain over the panel', () => {
    const room = island();
    const { wall, run, layout, faces } = frontFrames(room);
    const plan = planRunPieces(room, wall, run, S, layout, faces);
    expect(plan.boxes.map(({ key, start, end }) => [key, start, end])).toEqual([['Fa', 1, 48], ['Fb', 48, 95]]);
    expect(plan.faces.find(({ kind }) => kind === 'frame')).toEqual({
      key: 'frame:Fa', kind: 'frame', start: 0, end: 96, back: 24, front: 24.8125,
      polygon: [[0, 24.8125], [96, 24.8125], [95.25, 24], [0.75, 24]],
    });
    const [panel] = wallEndPanels(room, room.walls[0], S);
    expect(wallEndPanelPolygon(room, room.walls[0], panel)).toEqual([
      { x: 0, y: -24.8125 }, { x: 0.75, y: -24 }, { x: 0.75, y: 24 }, { x: 0, y: 24.8125 },
    ]);
    expect(horizontalChains(room, wall, 'lower', S).inner).toEqual([
      { start: 0, end: 1.75, kind: 'frame', runId: 'F' },
      { start: 1.75, end: 47.25, kind: 'frame-opening', runId: 'F', pieceId: 'Fa' },
      { start: 47.25, end: 48.75, kind: 'frame', runId: 'F' },
      { start: 48.75, end: 94.25, kind: 'frame-opening', runId: 'F', pieceId: 'Fb' },
      { start: 94.25, end: 96, kind: 'frame', runId: 'F' },
    ]);
  });

  it('shows only the part of the panel the frame doesn\'t cover', () => {
    const room = island();
    const [panel] = wallEndPanels(room, room.walls[0], S);
    expect(wallEndPanelSpans(wallSideView(room.walls[0], 'front'), panel)).toEqual([{ z: 0, height: 4 }]);

    const taller = island({ back: { height: 36 } });
    const [tall] = wallEndPanels(taller, taller.walls[0], S);
    expect(wallEndPanelSpans(wallSideView(taller.walls[0], 'front'), tall)).toEqual([{ z: 0, height: 40 }]);
    expect(wallEndPanelSpans(wallSideView(taller.walls[0], 'back'), tall)).toEqual([{ z: 0, height: 4 }]);
  });
});

describe('SPEC-36.2.1 which wall end panels meet a frame', () => {
  it('says a panel meets a frame only beside a face frame run', () => {
    const inset = island();
    const [framed] = wallEndPanels(inset, inset.walls[0], S);
    expect(wallEndPanelFramed(inset.walls[0], framed)).toBe(true);
    const euro = island({ style: null });
    const [plain] = wallEndPanels(euro, euro.walls[0], S);
    expect(wallEndPanelFramed(euro.walls[0], plain)).toBe(false);
  });
});
