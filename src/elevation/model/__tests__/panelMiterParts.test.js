import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { elevationParts } from '../elevationParts.js';
import { roomParts } from '../parts.js';
import { resolveWall, syncRoom } from '../room.js';
import { runScene } from '../runScene.js';
import { wallEndPanelFramed, wallEndPanels } from '../wallEndPanels.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);
const BACK = '2c8ab1e3-3bad-4a28-bb80-24ee4df20b81';
const PANEL = 'ec0ad482-c6b9-4d8a-9d94-4e785ade9129';

function flush(frame) {
  const copy = structuredClone(stored('G2 Face frame kitchen'));
  copy.walls[1].runs.find(({ id }) => id === BACK).depth = 0.75;
  if (frame) copy.walls[1].endPanels.end = { width: null, frame };
  return syncRoom(copy, settings);
}
const row = ({ id, kind, x, z, width, height, back, front }) => [id, kind, x, z, width, height, back, front];

describe('SPEC-43 a mitered back panel in elevation and the parts list', () => {
  it('draws the back panel to the outside corner on the canvas and in the DXF', () => {
    const room = flush();
    const view = resolveWall(room, room.walls[1], 'back');
    expect(runScene(room, view, view.runs[0], settings).drawnPieces
      .map(({ id, kind, x, z, width, height }) => [id, kind, x, z, width, height]))
      .toEqual([[PANEL, 'panel', 0, 4, 78.5, 30.5]]);
    expect(elevationParts(room, room.walls[1], 'back', settings).map(row))
      .toEqual([[PANEL, 'panel', 0, 4, 78.5, 30.5, 0, 0.75]]);
    const butted = flush('butt');
    expect(elevationParts(butted, butted.walls[1], 'back', settings).map(row))
      .toEqual([[PANEL, 'panel', 0.75, 4, 77.75, 30.5, 0, 0.75]]);
  });

  it('orders the back panel longer by the end panel it runs over', () => {
    const part = roomParts(flush(), settings).find(({ key }) => key === PANEL);
    expect([part.x, part.width, part.height]).toEqual([0, 78.5, 30.5]);
    const butted = roomParts(flush('butt'), settings).find(({ key }) => key === PANEL);
    expect([butted.x, butted.width]).toEqual([0.75, 77.75]);
  });

  it('offers the joint choice beside a back panel run as well as a face frame', () => {
    const room = flush();
    expect(wallEndPanelFramed(room.walls[1], wallEndPanels(room, room.walls[1], settings)[0])).toBe(true);
    const g1 = syncRoom(stored('G1 Euro kitchen'), settings);
    expect(wallEndPanels(g1, g1.walls[3], settings)
      .map((panel) => wallEndPanelFramed(g1.walls[3], panel))).toEqual([false, false]);
  });
});
