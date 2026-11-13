import { landedReturns } from './cornerParts.js';
import { runSide } from './runSide.js';

/** Box-and-faces extents of landed returns, in the host face's x (without band overhangs). */
export function returnExtents(room, view, settings) {
  return landedReturns(room, view).flatMap(({ wallId, run, landedView, xOf }) => {
    const xs = runSide(room, landedView, run, settings)
      .filter(({ piece }) => piece === 'box' || piece === 'faces')
      .flatMap(({ back, front }) => [xOf(back), xOf(front)]);
    return xs.length ? [{ wallId, runId: run.id, left: Math.min(...xs), right: Math.max(...xs) }] : [];
  });
}
