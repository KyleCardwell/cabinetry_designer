import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE } from '../doorStyles.js';
import { elevationParts } from '../elevationParts.js';
import { layoutRun } from '../faceLayouts.js';
import { pickOptions } from '../doorStyleEdits.js';
import { runScene } from '../runScene.js';
import { isJoinedEnd, runEndThickness } from '../panelThickness.js';
import { syncRoom } from '../room.js';
import { wallEndPanels } from '../wallEndPanels.js';
import { isElevationDocument, normalizeElevationDocument, toElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
// Keep these layout anchors independent of run flex (RF3).
const settings = { ...document.settings, runFlex: 0 };
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
function styled(name, edit, s = settings) {
  const room = structuredClone(stored(name));
  room.doorStyles = [P, T];
  edit(room);
  return syncRoom(room, s);
}

describe('SPEC-46.1.1 end panels at their style\'s thickness', () => {
  it('uses team doors for a free end and sheet for a joined end (G1 tall)', () => {
    const room = syncRoom(stored('G1 Euro kitchen'), settings);
    const tall = runOf(room, G1_TALL);
    expect([isJoinedEnd(tall, 'left'), isJoinedEnd(tall, 'right'), tall._endThickness]).toEqual([false, true, { right: 0.75 }]);
    expect(pieces(room, G1_TALL)).toEqual([
      [`${G1_TALL}:left`, 0, 0.8125], [G1_CAB, 0.8125, 28.4375], [`${G1_TALL}:right`, 29.25, 0.75],
    ]);
  });

  it('makes the free end panel the room\'s Panels style; the joined one stays sheet slab', () => {
    const room = styled('G1 Euro kitchen', (r) => { r.panelStyleId = 'ds-p'; });
    expect(runOf(room, G1_TALL)._endThickness).toEqual({ right: 0.75 });
    expect(pieces(room, G1_TALL)).toEqual([
      [`${G1_TALL}:left`, 0, 0.8125], [G1_CAB, 0.8125, 28.4375], [`${G1_TALL}:right`, 29.25, 0.75],
    ]);
  });

  it('follows the doors when no panel style is picked', () => {
    const room = styled('G1 Euro kitchen', (r) => { r.doorStyleId = 'ds-t'; });
    expect([runOf(room, G1_TALL)._endThickness, runOf(room, G1_TALL)._doorThickness]).toEqual([{ left: 1, right: 0.75 }, 1]);
    expect(widths(room, G1_TALL)).toEqual([1, 28.25, 0.75]);
  });

  it('keeps a typed width and the team default style; an end\'s own style beats the sheet default', () => {
    const typed = styled('G1 Euro kitchen', (r) => {
      r.panelStyleId = 'ds-p';
      runOf(r, G1_TALL).ends.left.width = 0.75;
    });
    expect(widths(typed, G1_TALL)).toEqual([0.75, 28.5, 0.75]);
    const team = styled('G1 Euro kitchen', (r) => { r.doorStyleId = 'ds-t'; r.panelStyleId = 'default'; });
    expect(runOf(team, G1_TALL)._endThickness).toEqual({ right: 0.75 });
    const own = styled('G1 Euro kitchen', (r) => {
      runOf(r, G1_TALL).ends.left.styleId = 'ds-t';
      runOf(r, G1_TALL).ends.right.styleId = 'ds-p';
    });
    expect([runOf(own, G1_TALL)._endThickness, widths(own, G1_TALL)])
      .toEqual([{ left: 1 }, [1, 28.1875, 0.8125]]);
  });

  it('uses 13/16" for free ends and stores only a joined left end at 3/4"', () => {
    const source = structuredClone(stored('G1 Euro kitchen'));
    const wall = wallOf(source, G1_TALL);
    const run = runOf(source, G1_TALL);
    // Follow anchors identify joined ends without requiring a joint on another wall.
    const leader = wall.runs.find((candidate) => candidate.id !== run.id);
    run.anchors = { left: { to: 'follow', runId: leader.id, side: 'right', offset: 0 }, right: false };
    const room = syncRoom(source, settings);
    const synced = runOf(room, G1_TALL);
    expect(runEndThickness(room, wallOf(room, G1_TALL), synced, settings)).toEqual({ left: 0.75, right: 0.8125 });
    expect(synced._endThickness).toEqual({ left: 0.75 });
    run.anchors.left = false;
    const free = syncRoom(source, settings);
    expect(runEndThickness(free, wallOf(free, G1_TALL), runOf(free, G1_TALL), settings).right).toBe(0.8125);
    expect(runOf(free, G1_TALL)).not.toHaveProperty('_endThickness');
    const library = { ...settings, teamDoorStyle: { ...settings.teamDoorStyle, thickness: 0.875 } };
    const custom = syncRoom(source, library);
    expect(runEndThickness(custom, wallOf(custom, G1_TALL), runOf(custom, G1_TALL), library).right).toBe(0.875);
    expect(runOf(custom, G1_TALL)).not.toHaveProperty('_endThickness');
    expect(widths(custom, G1_TALL, library)).toEqual([0.875, 28.25, 0.875]);
    source.doorStyles = [T];
    source.doorStyleId = 'ds-t';
    const styled = syncRoom(source, settings);
    expect(runEndThickness(styled, wallOf(styled, G1_TALL), runOf(styled, G1_TALL), settings).right).toBe(1);
    expect(runOf(styled, G1_TALL)._endThickness.right).toBe(1);
  });

  it('widens a beaded face frame\'s end stiles by the extra 1/16" (G2 tall)', () => {
    const room = styled('G2 Face frame kitchen', (r) => {
      r.panelStyleId = 'ds-p';
      runOf(r, G2_TALL).ends.right.styleId = 'ds-p';
    });
    expect(runOf(room, G2_TALL)).not.toHaveProperty('_endThickness');
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
      .toEqual([undefined, [0.8125]]);
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

  it('labels inherited and team default panels with the team door thickness', () => {
    const room = { doorStyles: [] };
    const pick = pickOptions(room, settings, 'panel', [{ level: 'room', node: room }]);
    expect(pick.inherit.text).toBe('Same as doors (Std · 5PC · 13/16")');
    expect(pick.options[0].text).toBe('Team default (Std · 5PC · 13/16")');
  });

  it('prunes old room panel thickness settings on load without carrying values over', () => {
    const old = structuredClone(document);
    old.rooms[0].settingsOverrides = { endPanelThickness: 1, sheetThickness: 0.875 };
    old.rooms[1].settingsOverrides = { endPanelThickness: 1 };
    const loaded = normalizeElevationDocument(old);
    expect(loaded.rooms[0].settingsOverrides).toEqual({ sheetThickness: 0.875 });
    expect(loaded.rooms[1]).not.toHaveProperty('settingsOverrides');
    expect(loaded.settings.teamDoorStyle.thickness).toBe(0.8125);
    expect(loaded.schemaVersion).toBe(old.schemaVersion);
    expect(isElevationDocument(loaded)).toBe(true);
  });

  it('gives an unpicked free panel a 1 9/16" face frame end stile', () => {
    const source = structuredClone(stored('G2 Face frame kitchen'));
    source.style.cabinetStyleId = 14;
    const room = syncRoom(source, settings);
    const wall = wallOf(room, G2_TALL);
    const run = runOf(room, G2_TALL);
    const scene = runScene(room, wall, run, settings);
    const region = scene.frames.regions[0];
    const { openings } = scene.faceLayouts.get(region.cabinetIds[0]);
    expect(runEndThickness(room, wall, run, settings).left).toBe(0.8125);
    expect(openings[0].x - region.x).toBe(1.5625);
  });
});
