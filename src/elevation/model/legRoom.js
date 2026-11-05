import { frontDepth, runBackOffset } from './corners.js';

/** Room reserved inside each run end by legs whose depth overlaps the run. */
export function legRoom(run, settings) {
  const room = { left: 0, right: 0 };
  const F = frontDepth(run, settings);
  const B = runBackOffset(run);
  for (const leg of run.legs ?? []) {
    if (run._pinSplit?.[leg.from] || leg.takesRoom === false) continue;
    const shape = (settings.shapes ?? []).find(({ id }) => id === leg.shapeId);
    if (!shape) continue;
    const b = shape.box;
    const t0 = leg.yFrom === 'front' ? -leg.y : F - B + leg.y - b.d;
    const f = F - t0;
    const k = f - b.d;
    if (Math.min(f, F) - Math.max(k, B) <= 1e-6) continue;
    room[leg.from] = Math.max(room[leg.from], b.w - leg.x);
  }
  return room;
}
