import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE } from '../doorStyles.js';
import { elevationParts } from '../elevationParts.js';
import { layoutRun } from '../faceLayouts.js';
import { isJoinedEnd } from '../panelThickness.js';
import { syncRoom } from '../room.js';
import { wallEndPanels } from '../wallEndPanels.js';
import { normalizeElevationDocument, toElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);

const P = { ...DEFAULT_DOOR_STYLE, id: 'ds-p', label: 'P' };
const T = { ...DEFAULT_DOOR_STYLE, id: 'ds-t', label: 'T', thickness: 1 };
const G1_TALL = 'b38f2f11-5318-42f2-9d95-8b9b3d1b9087';
const G1_CAB = '28072a7d-e691-40d1-a005-4d0ed1c9e825';
const G2_TALL = 'a42e9a57-a98f-47f0-b6b4-9076b513db6e';
const G2_CAB = '34fe234e-6748-40a7-87f1-fcdfa88a707d';
const G2_FRAME_CAB = '352bd8c0-79a1-4210-a428-cfe95038118f';
const G2_PANEL_WALL = '64da569f-6c94-408d-809a-37c6e1f9755f';
const G2_PANEL_RUN = '4b49c071-463c-461e-b750-005d3fe8bec7';

const wallOf = (room, runId) => room.walls.find((wall) => wall.runs.some((run) => run.id === runId));
const runOf = (room, runId) => wallOf(room, runId).runs.find((run) => run.id === runId);
const pieces = (room, runId, s = settings) => layoutRun(room, wallOf(room, runId), runOf(room, runId), s).pieces
  .map(({ id, x, width }) => [id, x, width]);
const widths = (room, runId, s) => pieces(room, runId, s).map(([, , width]) => width);

/** A golden room with P (13/16") and T (1") listed, after `edit` picks where they're used, synced. */
function styled(name, edit) {
  const room = structuredClone(stored(name));
  room.doorStyles = [P, T];
  edit(room);
  return syncRoom(room, settings);
}

describe('SPEC-46.1.1 end panels at their style\'s thickness', () => {
  it('leaves a room with no styles as it was (G1 tall: free left end, joined right end, 3/4" panels)', () => {
    const room = syncRoom(stored('G1 Euro kitchen'), settings);
    const tall = runOf(room, G1_TALL);
    expect([isJoinedEnd(tall, 'left'), isJoinedEnd(tall, 'right'), '_endThickness' in tall]).toEqual([false, true, false]);
    expect(pieces(room, G1_TALL)).toEqual([
      [`${G1_TALL}:left`, 0, 0.75], [G1_CAB, 0.75, 28.5], [`${G1_TALL}:right`, 29.25, 0.75],
    ]);
  });

  it('makes the free end panel the room\'s Panels style; the joined one stays sheet slab', () => {
    const room = styled('G1 Euro kitchen', (r) => { r.panelStyleId = 'ds-p'; });
    expect(runOf(room, G1_TALL)._endThickness).toEqual({ left: 0.8125 });
    expect(pieces(room, G1_TALL)).toEqual([
      [`${G1_TALL}:left`, 0, 0.8125], [G1_CAB, 0.8125, 28.4375], [`${G1_TALL}:right`, 29.25, 0.75],
    ]);
  });

  it('follows the doors when no panel style is picked', () => {
    const room = styled('G1 Euro kitchen', (r) => { r.doorStyleId = 'ds-t'; });
    expect([runOf(room, G1_TALL)._endThickness, runOf(room, G1_TALL)._doorThickness]).toEqual([{ left: 1 }, 1]);
    expect(widths(room, G1_TALL)).toEqual([1, 28.25, 0.75]);
  });

  it('keeps a typed width and the setting for the team default; an end\'s own style beats the sheet default', () => {
    const typed = styled('G1 Euro kitchen', (r) => {
      r.panelStyleId = 'ds-p';
      runOf(r, G1_TALL).ends.left.width = 0.75;
    });
    expect(widths(typed, G1_TALL)).toEqual([0.75, 28.5, 0.75]);
    const team = styled('G1 Euro kitchen', (r) => { r.doorStyleId = 'ds-t'; r.panelStyleId = 'default'; });
    expect('_endThickness' in runOf(team, G1_TALL)).toBe(false);
    const own = styled('G1 Euro kitchen', (r) => {
      runOf(r, G1_TALL).ends.left.styleId = 'ds-t';
      runOf(r, G1_TALL).ends.right.styleId = 'ds-p';
    });
    expect([runOf(own, G1_TALL)._endThickness, widths(own, G1_TALL)])
      .toEqual([{ left: 1, right: 0.8125 }, [1, 28.1875, 0.8125]]);
  });

  it('keeps a joined end 3/4" sheet slab when End panel thickness is set to 13/16"', () => {
    const s = { ...settings, endPanelThickness: 0.8125 };
    const room = syncRoom(stored('G1 Euro kitchen'), s);
    expect(runOf(room, G1_TALL)._endThickness).toEqual({ right: 0.75 });
    expect(widths(room, G1_TALL, s)).toEqual([0.8125, 28.4375, 0.75]);
  });

  it('widens a beaded face frame\'s end stiles by the extra 1/16" (G2 tall)', () => {
    const room = styled('G2 Face frame kitchen', (r) => {
      r.panelStyleId = 'ds-p';
      runOf(r, G2_TALL).ends.right.styleId = 'ds-p';
    });
    expect(runOf(room, G2_TALL)._endThickness).toEqual({ left: 0.8125, right: 0.8125 });
    expect(pieces(room, G2_TALL)).toEqual([
      [`${G2_TALL}:left`, 50, 0.8125], [G2_CAB, 51.0625, 24.375], [`${G2_TALL}:right`, 75.6875, 0.8125],
    ]);
    const parts = elevationParts(room, wallOf(room, G2_TALL), 'front', settings);
    const at = (id) => parts.find((part) => part.id === id);
    expect([at(`frame:${G2_FRAME_CAB}`).x, at(`frame:${G2_FRAME_CAB}`).width]).toEqual([50, 26.5]);
    expect([at(`${G2_FRAME_CAB}:rleft`).x, at(`${G2_FRAME_CAB}:rleft`).width, at(`${G2_FRAME_CAB}:rright`).x])
      .toEqual([51.8125, 11.4375, 63.25]);
  });

  it('makes a wall end panel its style\'s thickness, and the mitered frame sees it (G2)', () => {
    const room = styled('G2 Face frame kitchen', (r) => { r.panelStyleId = 'ds-p'; });
    const wall = room.walls.find((candidate) => candidate.id === G2_PANEL_WALL);
    expect([wall._endPanelThickness, wallEndPanels(room, wall, settings).map(({ width }) => width)])
      .toEqual([{ end: 0.8125 }, [0.8125]]);
    expect(runOf(room, G2_PANEL_RUN)._frame.wallPanels.right.width).toBe(0.8125);
    const typed = styled('G2 Face frame kitchen', (r) => {
      r.panelStyleId = 'ds-p';
      r.walls.find((candidate) => candidate.id === G2_PANEL_WALL).endPanels.end.width = 0.75;
    });
    const typedWall = typed.walls.find((candidate) => candidate.id === G2_PANEL_WALL);
    expect(wallEndPanels(typed, typedWall, settings).map(({ width }) => width)).toEqual([0.75]);
  });

  it('never saves the derived thicknesses', () => {
    const room = styled('G2 Face frame kitchen', (r) => { r.panelStyleId = 'ds-p'; });
    const saved = toElevationDocument({ ...document, rooms: [room] }).rooms[0];
    expect('_endThickness' in runOf(saved, G2_TALL)).toBe(false);
    expect('_endPanelThickness' in saved.walls.find((wall) => wall.id === G2_PANEL_WALL)).toBe(false);
    expect(saved.panelStyleId).toBe('ds-p');
  });
});
