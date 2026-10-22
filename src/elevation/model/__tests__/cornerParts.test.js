import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cornerParts, cornerShapes } from '../cornerParts.js';
import { gridFromItems } from '../grid.js';
import { resolveWall, syncRoom } from '../room.js';
import { runEndPanelDetail } from '../doorDetails.js';
import { runScene } from '../runScene.js';
import { runEndView } from '../runSide.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);
const room = (name) => syncRoom(stored(name), settings);
const partsOf = (synced, wallIndex, side = 'front') => cornerParts(synced, synced.walls[wallIndex], side, settings);
const shapesOf = (synced, wallIndex, side = 'front') => cornerShapes(synced, synced.walls[wallIndex], side, settings);
/** A part as [last id segment, kind, x, z, width, height, back, front, opaque]. */
const row = (part) => [
  part.id.split(':').pop(), part.kind, part.x, part.z, part.width, part.height, part.back, part.front,
  part.opaque ?? true,
];

const G1_A = 'cb33d774-f31e-41c1-bbe4-198cbf981619';
const G3_HOST = '6d7021c6-5293-4d11-ae7f-47086e301920';
const G3_WING = '5ab00c5d-9ea6-4d32-9586-d266db26a4d2';

// Wall 1's free base end is 74 1/16 from Wall 2; its upper runs from z 54 to 114.
function endViewKitchen() {
  const copy = structuredClone(stored('G1 Euro kitchen'));
  const [base, upper] = copy.walls[0].runs.slice(1);
  copy.walls[0].runs = [base, upper];
  Object.assign(base, { x: 93.9375, width: 49.1875, anchors: { right: true }, autoCount: false,
    grid: gridFromItems(base.id, [{ id: 'anchor-base', kind: 'cabinet', width: null }]),
    ends: { left: { type: 'end_panel', width: null }, right: { type: 'filler', width: null } } });
  copy.profile.crownTop = 120;
  copy.elevationOptions = { [copy.walls[1].id]: { returns: 'end' } };
  return syncRoom(copy, { ...settings, runFlex: 0 });
}

describe('DM6 step d end-on returns', () => {
  it('anchor 1: draws Wall 1 base profiles at x 0…24 and 24…24 7/8, front depth 74 1/16', () => {
    const synced = endViewKitchen();
    const shape = shapesOf(synced, 1)[0];
    const part = (piece) => shape.parts.find(({ id }) => id.endsWith(`:${piece}`));
    expect(shape.kind).toBe('return');
    expect(part('box')).toMatchObject({ kind: 'profile', x: 0, width: 24, front: 74.0625 });
    expect(part('faces')).toMatchObject({ kind: 'profile', x: 24, width: 0.875, front: 74.0625 });
    expect(shape.parts.some(({ kind }) => kind === 'section')).toBe(false);
    expect(part('end_panel')).toMatchObject({ kind: 'end_panel', x: 0, width: 24.875, front: 74.0625 });
    expect(part('end_panel').opaque).not.toBe(false);
    expect(partsOf(synced, 1)).toEqual(shapesOf(synced, 1).flatMap(({ parts }) => parts));
  });

  it('anchor 2: draws Wall 1 upper box at x 0…12, z 54…114, with its free-end bands and panel', () => {
    const synced = endViewKitchen();
    const shape = shapesOf(synced, 1)[1];
    const part = (piece) => shape.parts.find(({ id }) => id.endsWith(`:${piece}`));
    expect(part('box')).toMatchObject({ kind: 'profile', x: 0, width: 12, z: 54, height: 60 });
    expect(part('top_mold').x).toBe(0);
    expect(part('crown').x).toBe(0);
    const pieces = runEndView(synced, synced.walls[0], synced.walls[0].runs[1], 'left', settings);
    for (const piece of pieces) {
      expect(part(piece.piece)).toMatchObject({ z: piece.z, height: piece.height,
        x: piece.back, width: piece.front - piece.back });
    }
    expect(part('end_panel').opaque).not.toBe(false);
  });

  it('anchor 3: switching back to Section restores every original part exactly', () => {
    const synced = room('G1 Euro kitchen');
    const before = partsOf(synced, 1);
    const key = synced.walls[1].id;
    synced.elevationOptions = { [key]: { returns: 'end' } };
    expect(partsOf(synced, 1)).not.toEqual(before);
    synced.elevationOptions[key].returns = 'section';
    expect(partsOf(synced, 1)).toEqual(before);
  });

  it('uses the combined lead setting and leaves soffit returns as sections', () => {
    const synced = room('G3 Bath alcove');
    const [lead, wall] = synced.walls;
    const before = shapesOf(synced, 0);
    const otherBefore = shapesOf(synced, 1);
    synced.combinedElevations = [{ id: 'combined', on: true, faces: [lead.id, wall.id] }];
    synced.elevationOptions = { [wall.id]: { returns: 'end' }, [lead.id]: { returns: 'section' } };
    expect(shapesOf(synced, 0)).toEqual(before);
    expect(shapesOf(synced, 1)).toEqual(otherBefore);
    synced.elevationOptions[lead.id].returns = 'end';
    const after = shapesOf(synced, 0);
    expect(after.filter(({ soffitId }) => !soffitId).flatMap(({ parts }) => parts)
      .every(({ kind }) => kind !== 'section')).toBe(true);
    expect(after.find(({ soffitId }) => soffitId)).toEqual(before.find(({ soffitId }) => soffitId));
    expect(shapesOf(synced, 1).filter(({ runId }) => runId).flatMap(({ parts }) => parts)
      .every(({ kind }) => kind !== 'section')).toBe(true);
  });

  it('draws a back-side wing return at its end away from the host corner', () => {
    const copy = structuredClone(stored('G3 Bath alcove'));
    const base = structuredClone(copy.walls[1].runs[0]);
    copy.walls[2].runs = [{ ...base, id: 'wing-base', x: 0, width: 24, wallSide: 'back',
      anchors: { right: true }, ends: { left: { type: 'end_panel', width: null } } }];
    copy.elevationOptions = { [G3_HOST]: { returns: 'end' } };
    const shapes = shapesOf(syncRoom(copy, settings), 1);
    expect(shapes.map(({ key }) => key)).toEqual([`landing:${G3_WING}:left:wing-base`]);
    expect(shapes[0].parts.find(({ id }) => id.endsWith(':box')))
      .toMatchObject({ kind: 'profile', x: 76.5, width: 21, back: 0, front: 24 });
    expect(shapes[0].parts.find(({ kind }) => kind === 'end_panel'))
      .toMatchObject({ x: 76.5, width: 21.875 });
  });
});

describe('SPEC-42.2 corner returns', () => {
  it('cuts the next wall\'s runs where they meet this face: box and faces hatched, bands outlined (G1 elevation B)', () => {
    const shapes = shapesOf(room('G1 Euro kitchen'), 1);
    expect(shapes.map(({ key, kind, wallId }) => [key, kind, wallId])).toEqual([
      [`left:${G1_A}:b822e8ac-1a44-47ca-acec-ecb93caf7b8a`, 'return', G1_A],
      [`left:${G1_A}:434f1164-3b6b-4a97-89e7-1c6438c4d95a`, 'return', G1_A],
    ]);
    expect(shapes[0].parts.map(row)).toEqual([
      ['toe_kick', 'toe_kick', 0, 0, 21, 4, 24.875, 138, false],
      ['box', 'section', 0, 4, 24, 30.5, 24.875, 138, true],
      ['faces', 'section', 24, 4, 0.875, 30.5, 24.875, 138, true],
      ['countertop', 'countertop', 0, 34.5, 25.625, 1.5, 24.875, 138, false],
    ]);
    expect(shapes[1].parts.map(row)).toEqual([
      ['box', 'section', 0, 54, 12, 36, 12.0625, 59.5, true],
      ['faces', 'section', 12, 54, 0.875, 36, 12.0625, 59.5, true],
      ['top_mold', 'top_mold', 12.375, 90, 0.75, 3, 12.0625, 59.5, false],
      ['crown', 'crown', 13.125, 91.5, 2.75, 4.5, 12.0625, 59.5, false],
    ]);
    expect(shapes[0].parts[1]).toEqual({
      id: `left:${G1_A}:b822e8ac-1a44-47ca-acec-ecb93caf7b8a:box`, kind: 'section',
      runId: 'b822e8ac-1a44-47ca-acec-ecb93caf7b8a',
      x: 0, z: 4, width: 24, height: 30.5, back: 24.875, front: 138, coversBoxEdges: false,
    });
  });

  it('a right-hand corner measures back from the wall end; a soffit that dies in is one section (G3)', () => {
    const shapes = shapesOf(room('G3 Bath alcove'), 0);
    expect(shapes.map(({ kind, wallId, soffitId }) => [kind, wallId, soffitId])).toEqual([
      ['return', G3_HOST, undefined],
      ['return', G3_HOST, undefined],
      ['return', G3_HOST, '5ac8edd3-2c75-476d-bc64-f80ade3f5fba'],
    ]);
    expect(partsOf(room('G3 Bath alcove'), 0).map(row)).toEqual([
      ['toe_kick', 'toe_kick', 12, 0, 18, 4, 0, 72, false],
      ['box', 'section', 9, 4, 21, 30.5, 0, 72, true],
      ['faces', 'section', 8.125, 4, 0.875, 30.5, 0, 72, true],
      ['countertop', 'countertop', 7.375, 34.5, 22.625, 1.5, 0, 72, false],
      ['box', 'section', 6, 36, 24, 42, 0, 72, true],
      ['top_mold', 'top_mold', 5.75, 78, 0.75, 3, 0, 72, false],
      ['crown', 'crown', 3, 79.5, 2.75, 4.5, 0, 72, false],
      ['5ac8edd3-2c75-476d-bc64-f80ade3f5fba', 'section', 16, 84, 14, 12, 0, 72, true],
    ]);
    expect(shapes[2].parts[0].id).toBe(`soffit:right:${G3_HOST}:5ac8edd3-2c75-476d-bc64-f80ade3f5fba`);
  });

  it('cuts a wing wall\'s run anchored into the host face, from the wing wall\'s side (G3)', () => {
    const copy = structuredClone(stored('G3 Bath alcove'));
    const base = structuredClone(copy.walls[1].runs[0]);
    copy.walls[2].runs = [{ ...base, id: 'wing-base', x: 0, width: 24, wallSide: 'back', anchors: { right: true } }];
    const shapes = shapesOf(syncRoom(copy, settings), 1);
    expect(shapes.map(({ key }) => key)).toEqual([`landing:${G3_WING}:left:wing-base`]);
    expect(shapes[0].parts.map(row)).toEqual([
      ['toe_kick', 'toe_kick', 76.5, 0, 18, 4, 0, 24, false],
      ['box', 'section', 76.5, 4, 21, 30.5, 0, 24, true],
      ['faces', 'section', 97.5, 4, 0.875, 30.5, 0, 24, true],
      ['countertop', 'countertop', 76.5, 34.5, 22.625, 1.5, 0, 24, false],
    ]);
  });
});

// Wall 2's Euro base returns into Wall 1's right corner; its right end (the free one) shown at x 143 1/8 … 168.
function rightReturnKitchen(sizes) {
  const copy = structuredClone(stored('G1 Euro kitchen'));
  copy.walls[1].runs[1].ends.right = { type: 'end_panel', width: null, ...(sizes ? { sizes } : {}) };
  copy.elevationOptions = { [copy.walls[0].id]: { returns: 'end' } };
  return syncRoom(copy, { ...settings, runFlex: 0 });
}
const endPanelOf = (shapes) => shapes.flatMap(({ parts }) => parts).find(({ kind }) => kind === 'end_panel');

describe('DM8 step a end panel detail on end views', () => {
  it('anchor 1: the panel frame at true size, 3" stiles and rails, x from the front on a right end', () => {
    const synced = rightReturnKitchen();
    const wall = resolveWall(synced, synced.walls[1]);
    const run = wall.runs[1];
    expect(runEndPanelDetail(synced, wall, run, 'right', settings)).toMatchObject({
      width: 24.875, z: 4, height: 30.5, openings: [{ x: 3, z: 7, width: 18.875, height: 24.5 }],
    });
    expect(runEndPanelDetail(synced, wall, run, 'left', settings)).toBeNull();
  });

  it('anchor 2: a right-corner return places the opening at x 146 1/8 … 165, front on the left', () => {
    const panel = endPanelOf(shapesOf(rightReturnKitchen(), 0));
    expect(panel).toMatchObject({ x: 143.125, width: 24.875, z: 4, height: 30.5 });
    expect(panel.doorDetail).toEqual({
      openings: [{ x: 146.125, z: 7, width: 18.875, height: 24.5 }], profileLines: [], miters: [],
    });
  });

  it('anchor 3: a 4" left stile on a right end panel is the front stile', () => {
    const panel = endPanelOf(shapesOf(rightReturnKitchen({ stiles: { left: 4 } }), 0));
    expect(panel.doorDetail.openings).toEqual([{ x: 147.125, z: 7, width: 17.875, height: 24.5 }]);
  });

  it('anchor 4: a 4" left stile on a left end panel is the back stile, against x 0', () => {
    const copy = structuredClone(endViewKitchen());
    copy.walls[0].runs[0].ends.left.sizes = { stiles: { left: 4 } };
    const synced = syncRoom(copy, { ...settings, runFlex: 0 });
    const panel = shapesOf(synced, 1)[0].parts.find(({ kind }) => kind === 'end_panel');
    expect(panel.doorDetail.openings).toEqual([{ x: 4, z: 7, width: 17.875, height: 24.5 }]);
  });

  it('anchor 5: a mid rail 18" up on center splits the opening', () => {
    const panel = endPanelOf(shapesOf(rightReturnKitchen({ midRails: [{ at: 18, width: 3 }] }), 0));
    expect(panel.doorDetail.openings).toEqual([
      { x: 146.125, z: 7, width: 18.875, height: 13.5 },
      { x: 146.125, z: 23.5, width: 18.875, height: 8 },
    ]);
  });

  it('anchor 7: no detail on a section return or a joined (sheet) end', () => {
    const synced = rightReturnKitchen();
    synced.elevationOptions[synced.walls[0].id].returns = 'section';
    expect(shapesOf(synced, 0).flatMap(({ parts }) => parts).some(({ doorDetail }) => doorDetail)).toBe(false);
    const wall = resolveWall(synced, synced.walls[1]);
    const run = wall.runs[1];
    const joined = { ...run, anchors: { ...run.anchors, right: { to: 'follow', runId: 'other', side: 'left' } } };
    expect(runEndPanelDetail(synced, wall, joined, 'right', settings, runScene(synced, wall, run, settings)))
      .toBeNull();
  });
});

describe('DM8 step a payload stays valid', () => {
  it('keeps doorDetail off the payload parts', async () => {
    const { toDrawingPayload } = await import('../drawingPayload.js');
    const payload = toDrawingPayload(rightReturnKitchen(), settings);
    const parts = payload.elevations.flatMap(({ parts: list }) => list);
    expect(parts.some((part) => part.kind === 'end_panel' && part.id.includes(':end_panel'))).toBe(true);
    expect(parts.some((part) => 'doorDetail' in part)).toBe(false);
  });
});
