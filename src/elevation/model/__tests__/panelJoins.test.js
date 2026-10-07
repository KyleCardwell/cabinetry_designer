import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { miteredSpan, panelRunFace, panelRunMiters, wallEndPanels } from '../wallEndPanels.js';
import { resolveWall, syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);
const BACK = '2c8ab1e3-3bad-4a28-bb80-24ee4df20b81';

/** G2 as drawn: the peninsula's back run is 24" deep with a 3/4" panel against the cabinet backs. */
const asDrawn = () => syncRoom(stored('G2 Face frame kitchen'), settings);

/** G2 with the back panel run as deep as its panel, so the panel's face is the end panel's back face. */
function flush(frame) {
  const copy = structuredClone(stored('G2 Face frame kitchen'));
  copy.walls[1].runs.find(({ id }) => id === BACK).depth = 0.75;
  if (frame) copy.walls[1].endPanels.end = { width: null, frame };
  return syncRoom(copy, settings);
}

describe('SPEC-43 a wall end panel meets a back panel run', () => {
  it('finds a panel-only run\'s outer panel face and that panel\'s thickness', () => {
    expect(asDrawn().walls[1].runs.map(panelRunFace)).toEqual([null, { front: 0.75, thickness: 0.75 }]);
    expect(panelRunFace(flush().walls[1].runs[1])).toEqual({ front: 0.75, thickness: 0.75 });
  });

  it('miters when the panel\'s face is the end panel\'s depth, else butts; the panel\'s joint choice overrides', () => {
    const room = asDrawn();
    const [drawn] = wallEndPanels(room, room.walls[1], settings);
    expect(drawn.back.panelRun).toEqual({ runId: BACK, thickness: 0.75, join: 'butt' });
    expect('panelRun' in drawn.front).toBe(false);

    const mitered = flush();
    const [panel] = wallEndPanels(mitered, mitered.walls[1], settings);
    expect(panel.back).toEqual({
      side: 'left', x: 0, depth: 0.75, top: 34.5, runIds: [BACK],
      panelRun: { runId: BACK, thickness: 0.75, join: 'miter' },
    });

    const butted = flush('butt');
    expect(wallEndPanels(butted, butted.walls[1], settings)[0].back.panelRun.join).toBe('butt');
  });

  it('gives a run its mitered ends, and a panel at a mitered end its span over the end panel', () => {
    const room = flush();
    const back = resolveWall(room, room.walls[1], 'back');
    const front = resolveWall(room, room.walls[1], 'front');
    const miters = { left: { width: 0.75, thickness: 0.75 }, right: null };
    expect(panelRunMiters(room, back, back.runs[0], settings)).toEqual(miters);
    // The plan passes the stored wall; the run says which face it's on.
    expect(panelRunMiters(room, room.walls[1], back.runs[0], settings)).toEqual(miters);
    expect(panelRunMiters(room, front, front.runs[0], settings)).toEqual({ left: null, right: null });

    const run = back.runs[0];
    expect([run.x, run.width]).toEqual([0.75, 77.75]);
    expect(miteredSpan({ kind: 'panel', x: 0.75, width: 77.75 }, run, miters)).toEqual({ x: 0, width: 78.5 });
    expect(miteredSpan({ kind: 'cabinet', x: 0.75, width: 77.75 }, run, miters)).toEqual({ x: 0.75, width: 77.75 });
    expect(miteredSpan({ kind: 'panel', x: 30, width: 20 }, run, miters)).toEqual({ x: 30, width: 20 });
  });
});
