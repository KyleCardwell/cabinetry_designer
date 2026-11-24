import { boxesOverlap, lineHitsBox } from './planBoxes.js';

const samePoint = (a, b) => a[0] === b[0] && a[1] === b[1];
const sameLine = (a, b) => (samePoint(a[0], b[0]) && samePoint(a[1], b[1]))
  || (samePoint(a[0], b[1]) && samePoint(a[1], b[0]));

function inside(point, polygon) {
  let result = false;
  for (let i = 0; i < polygon.length; i += 1) {
    const [a, b] = [polygon[i], polygon[(i + 1) % polygon.length]];
    if ((a[1] > point[1]) !== (b[1] > point[1])
      && point[0] < a[0] + (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1])) result = !result;
  }
  return result;
}

/** Place oriented footprints in order; closed polygons may be parts or plain point arrays. */
export function placePlanMarks(items, blockers, { gap }) {
  const grow = (box) => ({ ...box, half: box.half.map((half) => half + gap / 2) });
  const boxes = (blockers.boxes ?? []).map(grow);
  const lines = blockers.lines ?? [];
  const polygons = blockers.polygons ?? [];
  return items.map((item) => {
    const search = (overCabinets = false) => {
      let best;
      for (const step of item.steps) {
        const at = item.at.map((value, i) => value + step[i]);
        const box = grow({
          center: at.map((value, i) => value + item.shift[i]), axes: item.axes, half: item.half,
        });
        let hits = boxes.filter((other) => boxesOverlap(box, other)).length;
        hits += lines.filter((line) => !item.ignore?.lines?.some((own) => sameLine(line, own))
          && lineHitsBox(line, box)).length;
        for (const polygon of polygons) {
          const points = polygon.points ?? polygon;
          for (let i = 0; i < points.length; i += 1) {
            if (lineHitsBox([points[i], points[(i + 1) % points.length]], box)) hits += 1;
          }
          if (!(overCabinets && polygon.kind === 'cabinet') && inside(box.center, points)) hits += 1;
        }
        if (!best || hits < best.hits) best = { key: item.key, at, hits, box };
        if (hits === 0) break;
      }
      return best;
    };
    let best = search();
    if (best.hits > 0 && item.overCabinets) {
      const relaxed = search(true);
      if (relaxed.hits === 0) best = relaxed;
    }
    boxes.push(best.box);
    return { key: best.key, at: best.at, hits: best.hits };
  });
}
