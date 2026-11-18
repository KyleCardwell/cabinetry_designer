import { expect, it } from 'vitest';
import { auto, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { elevationMeasureGeometry, snapMeasure } from '../measure.js';
import { syncRoom } from '../room.js';

it('snaps to the framed cabinet interior top and omits the hidden face seam with doors off (GC6.2)', () => {
  const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };
  const model = syncRoom(room({ walls: [wall({ runs: [run({
    width: 30, autoCount: false, style: { cabinetStyleId: 14 }, items: [auto('A')],
  })] })] }), settings);
  const geometry = elevationMeasureGeometry(model, model.walls[0], 'front', settings, { doorsOff: true });
  expect(snapMeasure({ x: 8, y: 33.7 }, geometry, 0.1)).toMatchObject({
    kind: 'edge', point: { x: 8, y: 33.75 },
    segment: { x1: 27.75, y1: 33.75, x2: 2.25, y2: 33.75 },
  });
  const seam = { x: 15, y: 22 };
  expect(snapMeasure(seam, elevationMeasureGeometry(model, model.walls[0], 'front', settings), 0.1).kind)
    .toBe('edge');
  expect(snapMeasure(seam, geometry, 0.1)).toEqual({ kind: 'free', point: seam });
});
