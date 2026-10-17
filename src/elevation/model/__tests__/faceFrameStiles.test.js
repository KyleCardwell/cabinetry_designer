import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveWall, syncRoom } from '../room.js';
import { runScene } from '../runScene.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const TALL = 'a42e9a57-a98f-47f0-b6b4-9076b513db6e';

/** Kyle's G2 tall at 32 7/8" (one column, end panels both sides) in a cabinet style. */
function tall(cabinetStyleId, runFlex = 0) {
  const flexSettings = { ...settings, runFlex };
  const copy = structuredClone(document.rooms.find(({ name }) => name === 'G2 Face frame kitchen'));
  copy.style = { ...copy.style, cabinetStyleId };
  const stored = copy.walls[0].runs.find(({ id }) => id === TALL);
  stored.x = 76.5 - 32.875;
  stored.width = 32.875;
  const room = syncRoom(copy, flexSettings);
  const view = resolveWall(room, room.walls[0]);
  const scene = runScene(room, view, view.runs.find(({ id }) => id === TALL), flexSettings);
  const [region] = scene.frames.regions;
  const { box, openings } = scene.faceLayouts.get(region.cabinetIds[0]);
  return {
    box: box.width,
    leftStile: openings[0].x - region.x,
    rightStile: region.x + region.width - openings[0].x - openings[0].width,
  };
}

describe('SPEC-42.1 face frame end stiles follow panel thickness', () => {
  it('keeps the rounding leftover in the box and follows the end panel thickness (G2 tall at 32 7/8)', () => {
    expect(tall(15)).toEqual({ box: 30.8125, leftStile: 1.8125, rightStile: 1.75 });
    expect(tall(14)).toEqual({ box: 31.3125, leftStile: 1.5625, rightStile: 1.5 });
  });
});

// RF.2: stale since SPEC-42.1 stiles follow the panel thickness; rewrite with the one-run solver.
describe.skip('SPEC-RF1 run flex on the same tall', () => {
  it('grows the run by 1/8" so the box comes out round; the stiles stay standard', () => {
    expect(tall(15, 0.25)).toEqual({ box: 31, leftStile: 1.75, rightStile: 1.75 });
    expect(tall(14, 0.25)).toEqual({ box: 31.5, leftStile: 1.5, rightStile: 1.5 });
  });
});
