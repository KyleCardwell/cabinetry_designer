import { dragPointsToRunInput } from '../../canvas/drag.js';

export function runDrawBounds(start, current, width, fallbackDirection = 1) {
  const direction = current.x === start.x
    ? fallbackDirection
    : Math.sign(current.x - start.x);
  return dragPointsToRunInput(start, {
    ...current,
    x: start.x + direction * width,
  });
}

export function runEdgeXForWidth(run, side, width) {
  return side === 'left' ? run.x + run.width - width : run.x + width;
}

export function runWidthForEdgeX(run, side, edgeX) {
  return side === 'left' ? run.x + run.width - edgeX : edgeX - run.x;
}
