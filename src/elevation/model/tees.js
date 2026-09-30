import { gapReach } from './cells.js';
import { findLeaf } from './cellTree.js';
import { runItems } from './grid.js';
import { endPieceBottom, endPieceNotes, isInsetStyle, resolveStyle } from './styles.js';

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

/** The shop note for a box a T-filler covers (FILL-007): which sides to rabbet. */
export function rabbetNote(covers) {
  const sides = ['left', 'right'].filter((side) => covers[side] > 0);
  const edges = ['top', 'bottom'].filter((side) => covers[side] > 0);
  const parts = [
    ...(sides.length === 2 ? ['sides'] : sides.map((side) => `${side} side`)),
    ...(edges.length === 2 ? ['top and bottom'] : edges),
  ];
  return `FF to rabbet ${parts.join(' and ')} for T-filler`;
}

/**
 * The T-fillers of a run (SPEC-37, FILL-011), derived and never stored. A T covers the front edges
 * of the two Euro boxes either side of a seam, `settings.teeCover` (3/4") of each, so its flat is
 * 1 1/2" between tight boxes and wider by the gap between spaced ones. A vertical T runs the whole
 * length of its seam, however the boxes either side are split; a horizontal T between boxes one
 * above the other butts into it and never breaks it. At a run end a T stands in for a
 * filler: the flat is the filler's visible width plus the cover over the box. Each is
 * `{ id, orientation: 'vertical' | 'horizontal', end: 'left' | 'right' | null, pieceId, x, z, width,
 * height, drop, boxIds, ret: { start, end } }`: the flat in wall coordinates, how far the flat drops
 * below the box (the fillers' own drop), and where the return sits along the flat's width, which is
 * centred between boxes and 3/4" off the box side at an end.
 *
 * Also `partWidth` on each (what the shop orders across the flat: the width of a vertical T, the height
 * of a horizontal one; at an end, any width ordered for the filler plus the cover), `notes` (by T id:
 * "T-shape" and the filler notes) and `rabbets` (by box id: the FILL-007 note).
 *
 * @returns {{tees: object[], covers: Map<string, {left: number, right: number, top: number, bottom: number}>, notes: Map<string, string[]>, rabbets: Map<string, string>}}
 */
export function teeFillers(room, run, cells, settings) {
  const tees = [];
  const covers = new Map();
  const notes = new Map();
  const rabbets = new Map();
  const cover = settings.teeCover;
  const returnThickness = settings.fillerReturnThickness;
  const runStyle = resolveStyle(settings, room, run);
  if (isInsetStyle(runStyle)) return { tees, covers, notes, rabbets };
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

  const leaf = (piece) => leafOf(run, piece);
  // A seam's own choice comes from the box left of it (or above it), then the one right (or below).
  const verticalOn = (a, b) => leaf(a)?.tFiller?.right ?? leaf(b)?.tFiller?.left ?? Boolean(run.tFiller);
  const horizontalOn = (upper, lower) => leaf(upper)?.tFiller?.bottom
    ?? leaf(lower)?.tFiller?.top ?? run.tFiller === 'all';

  // Seams between two boxes side by side.
  const contacts = [];
  for (const a of boxes) {
    for (const b of boxes) {
      const gap = b.x - a.x - a.width;
      const low = Math.max(a.z, b.z);
      const high = Math.min(a.z + a.height, b.z + b.height);
      if (a === b || gap < -EPSILON || gap > reach + EPSILON || high - low <= EPSILON) continue;
      if (verticalOn(a, b)) contacts.push({ a, b, gap: Math.max(0, gap), low, high });
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
        partWidth: width,
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
      partWidth: (run.endFiller?.[side]?.width > 0 ? run.endFiller[side].width : piece.width) + cover,
      boxIds: beside.map((box) => box.id),
      ret: side === 'left' ? { start: edge - thickness, end: edge } : { start: edge, end: edge + thickness },
    });
    for (const box of beside) addCover(box.id, side, cover);
  }

  // Seams between two boxes one above the other. A flat stops at the T it meets (the cover).
  const covered = (piece, side) => covers.get(piece.id)?.[side] ?? 0;
  const stacks = [];
  for (const upper of boxes) {
    for (const lower of boxes) {
      const gap = upper.z - lower.z - lower.height;
      const left = Math.max(upper.x + covered(upper, 'left'), lower.x + covered(lower, 'left'));
      const right = Math.min(
        upper.x + upper.width - covered(upper, 'right'),
        lower.x + lower.width - covered(lower, 'right'),
      );
      if (upper === lower || gap < -EPSILON || gap > reach + EPSILON || right - left <= EPSILON) continue;
      if (horizontalOn(upper, lower)) stacks.push({ upper, lower, gap: Math.max(0, gap), left, right });
    }
  }
  const seams = new Map();
  for (const stack of stacks) {
    const key = `${Math.round((stack.lower.z + stack.lower.height) * 1e4)}:${Math.round(stack.upper.z * 1e4)}`;
    seams.set(key, [...(seams.get(key) ?? []), stack]);
  }
  for (const seam of seams.values()) {
    seam.sort((p, q) => p.left - q.left);
    const chains = [];
    for (const stack of seam) {
      const last = chains[chains.length - 1];
      const before = last?.[last.length - 1];
      const continues = before
        && stack.left - before.right >= -EPSILON && stack.left - before.right <= reach + EPSILON
        && stack.upper !== before.upper && stack.lower !== before.lower
        && near(before.upper.x + before.upper.width, before.lower.x + before.lower.width)
        && near(stack.upper.x, stack.lower.x)
        && !verticalOn(before.upper, stack.upper) && !verticalOn(before.lower, stack.lower);
      if (continues) last.push(stack);
      else chains.push([stack]);
    }
    for (const joined of chains) {
      const first = joined[0];
      const z = first.lower.z + first.lower.height - cover;
      const height = first.gap + 2 * cover;
      const start = z + (height - returnThickness) / 2;
      tees.push({
        id: `tee:h:${first.upper.id}|${first.lower.id}`,
        orientation: 'horizontal',
        end: null,
        pieceId: null,
        x: first.left,
        z,
        width: joined[joined.length - 1].right - first.left,
        height,
        drop: 0,
        partWidth: height,
        boxIds: [...new Set(joined.flatMap((stack) => [stack.upper.id, stack.lower.id]))],
        ret: { start, end: start + returnThickness },
      });
      for (const stack of joined) {
        addCover(stack.upper.id, 'bottom', cover);
        addCover(stack.lower.id, 'top', cover);
      }
    }
  }

  tees.sort((p, q) => p.x - q.x || p.z - q.z);
  const bottom = endPieceBottom(run, runStyle, settings);
  for (const tee of tees) {
    notes.set(tee.id, [
      'T-shape',
      ...(tee.orientation === 'vertical' && near(tee.z + tee.drop, run.z) ? endPieceNotes('filler', bottom) : []),
    ]);
  }
  for (const [id, sides] of covers) rabbets.set(id, rabbetNote(sides));
  return { tees, covers, notes, rabbets };
}

/**
 * What a box has on each side for the properties panel (SPEC-37): the box touching that side (or
 * null), the cabinet's own T-filler choice there (true, false, or null to follow the run), and
 * whether a T-filler is on that side now. Null for anything but a Euro cabinet.
 */
export function teeSides(room, run, cells, settings, boxId) {
  const box = cells.pieces.find((piece) => piece.id === boxId && piece.kind === 'cabinet' && piece.role === 'item');
  if (!box || isInsetStyle(resolveStyle(settings, room, run, leafOf(run, box)))) return null;
  const { covers } = teeFillers(room, run, cells, settings);
  const reach = gapReach(cells.gaps ?? []);
  const others = cells.pieces.filter((piece) => piece !== box && piece.kind === 'cabinet' && piece.role === 'item');
  const within = (gap) => gap >= -EPSILON && gap <= reach + EPSILON;
  const rows = (other) => overlap(box.z, box.z + box.height, other.z, other.z + other.height);
  const columns = (other) => overlap(box.x, box.x + box.width, other.x, other.x + other.width);
  const nearest = (candidates, size) => candidates.reduce(
    (best, other) => (!best || size(other) > size(best) + EPSILON ? other : best),
    null,
  )?.id ?? null;
  const neighbors = {
    left: nearest(others.filter((other) => rows(other) > EPSILON && within(box.x - other.x - other.width)), rows),
    right: nearest(others.filter((other) => rows(other) > EPSILON && within(other.x - box.x - box.width)), rows),
    top: nearest(others.filter((other) => columns(other) > EPSILON && within(other.z - box.z - box.height)), columns),
    bottom: nearest(others.filter((other) => columns(other) > EPSILON && within(box.z - other.z - other.height)), columns),
  };
  const own = leafOf(run, box)?.tFiller ?? {};
  return Object.fromEntries(['left', 'right', 'top', 'bottom'].map((side) => [side, {
    neighbor: neighbors[side],
    own: own[side] ?? null,
    on: (covers.get(box.id)?.[side] ?? 0) > 0,
  }]));
}
