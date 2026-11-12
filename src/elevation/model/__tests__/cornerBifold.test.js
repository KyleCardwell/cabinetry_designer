import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { shippingList } from '../../../reports/shippingList.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { cornerBifold, cornerLegBFaceTree } from '../cornerBifold.js';
import { cornerLegBDetails, cornerReturnLegs } from '../cornerLegs.js';
import { effectiveSettings } from '../effectiveSettings.js';
import { runPulls } from '../pullLayouts.js';
import { syncRoom } from '../room.js';
import { runScene } from '../runScene.js';

describe('bi-fold hinge and pulls', () => {
  it.each([
    { name: 'base hinged left', column: 'b0505231', side: 'right', returnWall: 'Wall 4',
      face: { type: 'door', hinge: 'left' }, note: 'bi-fold doors hl', hinge: 'left', hingedLeg: 'A', a: 0, b: 1 },
    { name: 'base with both pulls', column: 'b0505231', side: 'right', returnWall: 'Wall 4',
      face: { type: 'door', hinge: 'left' }, pulls: 'both', note: 'bi-fold doors hl', hinge: 'left', hingedLeg: 'A', a: 1, b: 1 },
    { name: 'upper hinged left', column: 'a72f41f6', side: 'left', returnWall: 'Wall 2',
      face: { type: 'door', hinge: 'left' }, note: 'bi-fold doors hl', hinge: 'left', hingedLeg: 'B', a: 1, b: 0 },
    { name: 'base without a hinge', column: 'b0505231', side: 'right', returnWall: 'Wall 4',
      face: { type: 'door' }, note: 'bi-fold doors hinge?', hinge: null, hingedLeg: null, a: 0, b: 0 },
    { name: 'base with a panel return', column: 'b0505231', side: 'right', returnWall: 'Wall 4',
      face: { type: 'door', hinge: 'left' }, legBFace: 'panel', note: 'hl', a: 1, b: 0 },
  ])('resolves hinges, pulls and shipping notes for $name (CC9.1)', (anchor) => {
    const source = JSON.parse(readFileSync(new URL('./fixtures/room8cc.json', import.meta.url), 'utf8'));
    const storedWall = source.walls.find(({ name }) => name === 'Wall 3');
    for (const run of storedWall.runs) {
      for (const end of Object.values(run.ends ?? {})) if (end?.type === 'corner') end.corner.kind = 90;
    }
    const storedRun = storedWall.runs.find((run) => run.grid.cells.some(({ node }) => node.id.startsWith(anchor.column)));
    const item = storedRun.grid.cells.find(({ node }) => node.id.startsWith(anchor.column)).node;
    item.face = anchor.face;
    if (anchor.pulls) storedRun.ends[anchor.side].corner.pulls = anchor.pulls;
    if (anchor.legBFace) storedRun.ends[anchor.side].corner.legBFace = anchor.legBFace;
    const settings = effectiveSettings({ settings: { ...DEFAULT_SETTINGS } }, source);
    const room = syncRoom(source, settings);
    const wall = room.walls.find(({ name }) => name === 'Wall 3');
    const run = wall.runs.find(({ id }) => id === storedRun.id);
    const returnWall = room.walls.find(({ name }) => name === anchor.returnWall);
    const scene = runScene(room, wall, run, settings);
    const entry = scene.faceLayouts.get(item.id);
    const bifold = cornerBifold(run, anchor.side, item.face);
    const leg = cornerReturnLegs(room, returnWall, settings).find(({ columnId }) => columnId === item.id);
    const row = shippingList(room, settings).rows.find(({ key }) => key === item.id);
    expect(row.notes).toContain(anchor.note);
    expect(row.notes.filter((note) => /bi-fold|^h[lr]$/.test(note))).toEqual([anchor.note]);
    if (anchor.legBFace === 'panel') {
      expect(bifold).toBeNull();
      expect(leg.faceLayout.faces[0].type).toBe('panel');
    } else {
      expect(bifold).toEqual({ hinge: anchor.hinge, hingedLeg: anchor.hingedLeg, pulls: anchor.pulls ?? 'one' });
      expect(entry.faces[0].hinge ?? null).toBe(anchor.hinge);
      expect(leg.faceLayout.faces[0].hinge ?? null).toBe(anchor.hinge);
      const explicitB = { ...run, ends: { ...run.ends,
        [anchor.side]: { ...run.ends[anchor.side], corner: { ...run.ends[anchor.side].corner, legBFace: 'door' } },
      } };
      expect(cornerLegBFaceTree(explicitB, anchor.side, item.face).hinge ?? null).toBe(anchor.hinge);
    }
    const pullsA = runPulls(room, wall, run, settings, scene);
    const columnPullsA = pullsA.pulls.filter(({ pieceId }) => pieceId === item.id);
    expect(columnPullsA).toHaveLength(anchor.a);
    expect(leg.pulls).toHaveLength(anchor.b);
    for (const [pulls, face] of [[columnPullsA, entry.faces[0]], [leg.pulls, leg.faceLayout.faces[0]]]) {
      for (const pull of pulls) expect(pull.centers[0].x).toBeGreaterThan(face.x + face.width / 2);
    }
    if (anchor.hinge === null) {
      expect(pullsA.warnings).toContainEqual({ code: 'pull-needs-hinge', pieceId: item.id, path: 'r' });
      const detailsB = cornerLegBDetails(room, wall, run, settings, item.id, entry);
      expect(runPulls(room, wall, detailsB.run, settings, detailsB.scene, detailsB.doorDetails).warnings)
        .toContainEqual({ code: 'pull-needs-hinge', pieceId: item.id, path: 'r' });
    }
  });
});
