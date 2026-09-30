import { gapReach } from './cells.js';
import { findLeaf } from './cellTree.js';
import { runItems } from './grid.js';
import { endPieceBottom, isInsetStyle, resolveStyle } from './styles.js';

const EPSILON = 1e-6;

function near(a, b) {
  return Math.abs(a - b) <= EPSILON;
}

function overlap(start, end, otherStart, otherEnd) {
  return Math.min(end, otherEnd) - Math.max(start, otherStart);
}

function leafOf(run, piece) {
  return piece.columnId
    ? findLeaf(run.grid, piece.id)
    : runItems(run).find((item) => item.id === piece.id);
}

/** Every side of a box a T-filler covers: { left, right, top, bottom }, in inches. */
function noCovers() {
  return { left: 0, right: 0, top: 0, bottom: 0 };
}

/**
 * The T-fillers of a run (SPEC-37, FILL-011), derived and never stored. A T covers the front edges
 * of the two Euro boxes either side of a seam, `settings.teeCover` (3/4") of each, so its flat is
 * 1 1/2" between tight boxes and wider by the gap between spaced ones. At a run end it stands in for
 * a filler: the flat is the filler's visible width plus the cover over the box. Each is
 * `{ id, orientation: 'vertical' | 'horizontal', end: 'left' | 'right' | null, pieceId, x, z, width,
 * height, drop, boxIds, ret: { start, end } }`: the flat in wall coordinates, how far the flat drops
 * below the box (the fillers' own drop), and where the return sits along the flat's width, which is
 * centred between boxes and 3/4" off the box side at an end.
 *
 * @returns {{tees: object[], covers: Map<string, {left: number, right: number, top: number, bottom: number}>}}
 */
export function teeFillers(room, run, cells, settings) {
  const tees = [];
  const covers = new Map();
  const cover = settings.teeCover;
  const returnThickness = settings.fillerReturnThickness;
  const runStyle = resolveStyle(settings, room, run);
  if (isInsetStyle(runStyle)) return { tees, covers };
  const { drop } = endPieceBottom(run, runStyle, settings);
  const reach = gapReach(cells.gaps ?? []);
  const boxes = cells.pieces.filter((piece) => piece.kind === 'cabinet' && piece.role === 'item')
    .filter((piece) => !isInsetStyle(resolveStyle(settings, room, run, leafOf(run, piece))));
  const addCover = (id, side, amount) => {
    const current = covers.get(id) ?? noCovers();
    covers.set(id, { ...current, [side]: Math.max(current[side], amount) });
  };
  const dropped = (z, height) => (near(z, run.z) && drop > 0
    ? { z: z - drop, height: height + drop, drop }
    : { z, height, drop: 0 });

  // Seams between two boxes side by side.
  const contacts = [];
  for (const a of boxes) {
    for (const b of boxes) {
      const gap = b.x - a.x - a.width;
      const low = Math.max(a.z, b.z);
      const high = Math.min(a.z + a.height, b.z + b.height);
      if (a === b || gap < -EPSILON || gap > reach + EPSILON || high - low <= EPSILON) continue;
      const on = leafOf(run, a)?.tFiller?.right ?? leafOf(run, b)?.tFiller?.left ?? Boolean(run.tFiller);
      if (on) contacts.push({ a, b, gap: Math.max(0, gap), low, high });
    }
  }
  const lines = new Map();
  for (const contact of contacts) {
    const key = `${Math.round((contact.a.x + contact.a.width) * 1e4)}:${Math.round(contact.b.x * 1e4)}`;
    lines.set(key, [...(lines.get(key) ?? []), contact]);
  }
  for (const line of lines.values()) {
    line.sort((p, q) => p.low - q.low);
    const runs = [];
    for (const contact of line) {
      const last = runs[runs.length - 1];
      const before = last?.[last.length - 1];
      const continues = before
        && contact.low - before.high >= -EPSILON && contact.low - before.high <= reach + EPSILON;
      if (continues) last.push(contact);
      else runs.push([contact]);
    }
    for (const joined of runs) {
      const first = joined[0];
      const x = first.a.x + first.a.width - cover;
      const flat = dropped(first.low, Math.max(...joined.map((contact) => contact.high)) - first.low);
      const width = first.gap + 2 * cover;
      const start = x + (width - returnThickness) / 2;
      tees.push({
        id: `tee:${first.a.id}|${first.b.id}`,
        orientation: 'vertical',
        end: null,
        pieceId: null,
        x,
        z: flat.z,
        width,
        height: flat.height,
        drop: flat.drop,
        boxIds: [...new Set(joined.flatMap((contact) => [contact.a.id, contact.b.id]))],
        ret: { start, end: start + returnThickness },
      });
      for (const contact of joined) {
        addCover(contact.a.id, 'right', cover);
        addCover(contact.b.id, 'left', cover);
      }
    }
  }

  // A filler at either end of the run.
  for (const side of ['left', 'right']) {
    const piece = cells.pieces.find((candidate) => candidate.role === `end-${side}` && candidate.kind === 'filler');
    if (!piece || run.ends[side].type !== 'filler') continue;
    if (!(run.endFiller?.[side]?.tFiller ?? Boolean(run.tFiller))) continue;
    const edge = side === 'left' ? piece.x + piece.width : piece.x;
    const beside = boxes.filter((box) => near(side === 'left' ? box.x : box.x + box.width, edge)
      && overlap(box.z, box.z + box.height, piece.z, piece.z + piece.height) > EPSILON);
    if (beside.length === 0) continue;
    const flat = dropped(piece.z, piece.height);
    const thickness = Math.min(returnThickness, piece.width);
    tees.push({
      id: piece.id,
      orientation: 'vertical',
      end: side,
      pieceId: piece.id,
      x: side === 'left' ? piece.x : piece.x - cover,
      z: flat.z,
      width: piece.width + cover,
      height: flat.height,
      drop: flat.drop,
      boxIds: beside.map((box) => box.id),
      ret: side === 'left' ? { start: edge - thickness, end: edge } : { start: edge, end: edge + thickness },
    });
    for (const box of beside) addCover(box.id, side, cover);
  }

  tees.sort((p, q) => p.x - q.x || p.z - q.z);
  return { tees, covers };
}
