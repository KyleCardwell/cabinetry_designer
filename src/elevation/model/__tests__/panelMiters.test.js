import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { planRunPieces } from '../planPieces.js';
import { resolveWall, syncRoom } from '../room.js';
import { runScene } from '../runScene.js';
import { wallEndPanelPolygon, wallEndPanelSpans, wallEndPanels } from '../wallEndPanels.js';
import { wallParts } from '../wallParts.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);
const BACK = '2c8ab1e3-3bad-4a28-bb80-24ee4df20b81';
const PANEL = 'ec0ad482-c6b9-4d8a-9d94-4e785ade9129';
const PENINSULA = '64da569f-6c94-408d-809a-37c6e1f9755f';

const asDrawn = () => syncRoom(stored('G2 Face frame kitchen'), settings);
function flush(frame) {
  const copy = structuredClone(stored('G2 Face frame kitchen'));
  copy.walls[1].runs.find(({ id }) => id === BACK).depth = 0.75;
  if (frame) copy.walls[1].endPanels.end = { width: null, frame };
  return syncRoom(copy, settings);
}
const row = ({ id, kind, x, z, width, height, back, front }) => [id, kind, x, z, width, height, back, front];
const spansOf = (room, side) => wallEndPanelSpans(
  resolveWall(room, room.walls[1], side), wallEndPanels(room, room.walls[1], settings)[0],
);
function backPanelPlan(room) {
  const view = resolveWall(room, room.walls[1], 'back');
  const run = view.runs[0];
  const scene = runScene(room, view, run, settings);
  return planRunPieces(room, view, run, settings, scene.result, scene.faceLayouts).faces;
}

describe('SPEC-43 a back panel mitered into a wall end panel', () => {
  it('cuts the end panel\'s inside corner by the back panel\'s thickness in plan', () => {
    const room = flush();
    expect(wallEndPanelPolygon(room, room.walls[1], wallEndPanels(room, room.walls[1], settings)[0])).toEqual([
      { x: 86, y: 62.6875 }, { x: 86.75, y: 63.5 }, { x: 61.1875, y: 63.5 }, { x: 62, y: 62.6875 },
    ]);
    // A typed butt keeps the back corner square at the panel's derived 3/4" depth.
    const drawn = flush('butt');
    expect(wallEndPanelPolygon(drawn, drawn.walls[1], wallEndPanels(drawn, drawn.walls[1], settings)[0])).toEqual([
      { x: 86.75, y: 62.6875 }, { x: 86.75, y: 63.5 }, { x: 61.1875, y: 63.5 }, { x: 61.1875, y: 62.6875 },
    ]);
  });

  it('runs the back panel over the end panel to the outside corner in plan, cut at 45°', () => {
    expect(backPanelPlan(flush())).toEqual([{
      key: PANEL, kind: 'panel', start: 0, end: 78.5, back: 0, front: 0.75,
      polygon: [[0, 0.75], [78.5, 0.75], [78.5, 0], [0.8125, 0]],
    }]);
    expect(backPanelPlan(flush('butt'))).toEqual([{
      key: PANEL, kind: 'panel', start: 0.8125, end: 78.5, back: 0, front: 0.75,
    }]);
  });

  it('puts the end panel behind the back panel in elevation and shows only what it leaves', () => {
    const room = flush();
    expect(wallParts(room, room.walls[1], 'back', settings).map(row)).toEqual([
      [`${PENINSULA}:endPanel:end`, 'wall_end_panel', 0, 0, 0.8125, 34.5, -24.8125, 0],
    ]);
    expect(wallParts(room, room.walls[1], 'front', settings).map(row)).toEqual([
      [`${PENINSULA}:endPanel:end`, 'wall_end_panel', 77.6875, 0, 0.8125, 34.5, -0.75, 24],
    ]);
    expect(spansOf(room, 'back')).toEqual([{ z: 0, height: 4 }]);
    expect(spansOf(room, 'front')).toEqual([{ z: 0, height: 4 }]);
    const butted = flush('butt');
    expect(wallParts(butted, butted.walls[1], 'back', settings).map(row)[0][7]).toBe(0.75);
    // FX5: the synced back run is flush and mitered; a typed butt shows the whole end panel.
    expect(spansOf(asDrawn(), 'back')).toEqual([{ z: 0, height: 4 }]);
    expect(spansOf(butted, 'back')).toEqual([{ z: 0, height: 34.5 }]);
  });
});
