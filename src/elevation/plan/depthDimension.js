import { DEPTH_LANES } from '../model/planDepthPositions.js';
import { frontDepth } from '../model/corners.js';
import { elevationToPlan, planPointToWallX } from '../model/geometry.js';
import { formatDimension } from '../model/units.js';
import { wallSideFrame, wallSideOf } from '../model/wallSides.js';
import { PLAN_DIM_FONT_SIZE } from './constants.js';

const DEPTH_POPOUT_LEADER = 10;

export function depthDimension(run, depth, scale, fontSize = PLAN_DIM_FONT_SIZE, x) {
  const factor = fontSize / PLAN_DIM_FONT_SIZE;
  const lane = DEPTH_LANES[run.cabinetTypeId] ?? 0;
  const side = lane < 0 ? -1 : 1;
  const textPx = formatDimension(depth).length * 0.6 * fontSize + 8 * factor;
  const fits = depth * scale >= textPx + 8 * factor;
  const offset = depth / 2;

  if (fits) {
    return { x, fits, label: { x, offset }, leader: null };
  }

  return {
    x,
    fits,
    label: {
      x: x + side * ((DEPTH_POPOUT_LEADER + 2) * factor + fontSize / 2) / scale,
      offset,
    },
    leader: {
      x1: x,
      x2: x + side * DEPTH_POPOUT_LEADER * factor / scale,
      offset,
    },
  };
}

// Every text on one wall face has the same rotation. In that face's frame its drawn
// box is fontSize across x and depthTextWidth along depth, even on angled walls.
function textBox(entry, dim, scale, fontSize) {
  const halfWidth = (formatDimension(entry.depth).length * 0.6 * fontSize
    + 8 * fontSize / PLAN_DIM_FONT_SIZE) / scale / 2;
  const center = entry.planeBack + dim.label.offset;
  return {
    left: dim.label.x - fontSize / scale / 2,
    right: dim.label.x + fontSize / scale / 2,
    bottom: center - halfWidth,
    top: center + halfWidth,
  };
}

function overlaps(a, b) {
  return Math.min(a.right, b.right) > Math.max(a.left, b.left) + 1e-6
    && Math.min(a.top, b.top) > Math.max(a.bottom, b.bottom) + 1e-6;
}

/** Keep popped depth labels clear of the other texts and lines on their own face. */
export function planDepthLabels(room, settings, positions, { scale, fontSize, gap }) {
  const labels = new Map();
  for (const wall of room.walls) {
    const entries = wall.runs.filter((run) => positions.has(run.id)).map((run) => {
      const { x, pair } = positions.get(run.id);
      const side = wallSideOf(run);
      const planeBack = run._plane?.offset ?? 0;
      const depth = frontDepth(run, settings) - planeBack;
      // A near-aligned back base shares the front base's exact drawing line.
      const lineX = pair && pair.back === run.id ? planPointToWallX(
        wallSideFrame(room, wall, 'back'),
        elevationToPlan(wallSideFrame(room, wall), positions.get(pair.front).x, 0),
      ) : x;
      const other = pair && wall.runs.find(({ id }) => id === (pair.front === run.id ? pair.back : pair.front));
      const dim = depthDimension(run, depth, scale, fontSize, lineX);
      labels.set(run.id, dim);
      return { run, pair, side, x: lineX, planeBack, depth, dim,
        lineBack: other ? -(wall.thickness ?? 0) - frontDepth(other, settings) : planeBack,
        lineFront: planeBack + depth };
    });
    const placed = new Set();
    for (const entry of entries) {
      if (entry.dim.fits || placed.has(entry.run.id)) continue;
      // Reverse or lengthen both popped halves together so an island pair always
      // keeps its texts on opposite sides in front-face x.
      const group = entry.pair ? entries.filter((other) => other.pair === entry.pair && !other.dim.fits) : [entry];
      const tries = [[1, 0], [-1, 0], ...[1, 2, 3].map((n) => [1, n * gap / 2])];
      for (const [direction, extra] of tries) {
        const candidates = group.map((item) => {
          const { dim } = item;
          const side = Math.sign(dim.label.x - dim.x) * direction;
          const labelX = dim.x + side * (Math.abs(dim.label.x - dim.x) + extra);
          return { ...dim, label: { ...dim.label, x: labelX },
            leader: { ...dim.leader, x2: dim.x + side * (Math.abs(dim.leader.x2 - dim.x) + extra) } };
        });
        const clear = group.every((item, index) => {
          const box = textBox(item, candidates[index], scale, fontSize);
          return entries.filter((other) => other !== item && other.side === item.side).every((other) => (
            !overlaps(box, textBox(other, labels.get(other.run.id), scale, fontSize))
            && !(other.x > box.left + 1e-6 && other.x < box.right - 1e-6
              && Math.min(box.top, other.lineFront) > Math.max(box.bottom, other.lineBack) + 1e-6)
          ));
        });
        if (clear) {
          group.forEach((item, index) => labels.set(item.run.id, candidates[index]));
          break;
        }
      }
      group.forEach((item) => placed.add(item.run.id));
    }
  }
  return labels;
}
