import { gapReach, panelOrientation } from './cells.js';
import { findLeaf } from './cellTree.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from './constants.js';
import { resolveFaces } from './faces.js';
import { runItems } from './grid.js';
import { isInsetStyle, resolveStyle } from './styles.js';

const EPSILON = 1e-6;

function overlaps(start, end, otherStart, otherEnd) {
  return Math.min(end, otherEnd) - Math.max(start, otherStart) > EPSILON;
}

/** Which side of `a` `b` is on, touching or across a gap no wider than `reach`; null otherwise. */
export function sideOf(a, b, reach = 0) {
  const within = (distance) => distance >= -EPSILON && distance <= reach + EPSILON;
  const rows = overlaps(a.z, a.z + a.height, b.z, b.z + b.height);
  const cols = overlaps(a.x, a.x + a.width, b.x, b.x + b.width);
  if (rows && within(b.x - a.x - a.width)) return 'right';
  if (rows && within(a.x - b.x - b.width)) return 'left';
  if (cols && within(b.z - a.z - a.height)) return 'top';
  if (cols && within(a.z - b.z - b.height)) return 'bottom';
  return null;
}

function pieceItem(run, piece) {
  return piece.columnId
    ? findLeaf(run.grid, piece.id)
    : runItems(run).find((item) => item.id === piece.id);
}

function isSidePanel(piece) {
  return piece.kind === 'end_panel' || (piece.kind === 'panel' && panelOrientation(piece) === 'side');
}

function areaOf(rect) {
  return rect.width * rect.height;
}

function overlapArea(a, b) {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.z + a.height, b.z + b.height) - Math.max(a.z, b.z);
  return width > 0 && height > 0 ? width * height : 0;
}

function boundsOf(pieces) {
  const left = Math.min(...pieces.map((piece) => piece.x));
  const right = Math.max(...pieces.map((piece) => piece.x + piece.width));
  const bottom = Math.min(...pieces.map((piece) => piece.z));
  const top = Math.max(...pieces.map((piece) => piece.z + piece.height));
  return { x: left, z: bottom, width: right - left, height: top - bottom };
}

/**
 * Face frame regions for a run (SPEC-36). Each face frame cabinet, and each filler beside one,
 * joins a region with the boxes it touches or meets across a gap. A region is the rectangle
 * around its members, grown over a side or end panel at either side (the stile covers the
 * panel's edge), or a wall end panel the frame is mitered over (SPEC-36.2, `region.wallPanels`),
 * and down by the upper drop on an upper whose doors overhang. A filler in a frame
 * is part of a wider stile. A cabinet side with nothing framed or covered beside it is free.
 *
 * @returns {{regions: object[], fillerIds: Set<string>, freeSides: Map<string, {left: boolean, right: boolean}>, seamSides: Map<string, {left: boolean, right: boolean}>, warnings: object[]}}
 */
export function frameRegions(room, run, cells, settings) {
  const frame = { ...DEFAULT_SETTINGS.insetFrame, ...settings.insetFrame };
  const { pieces } = cells;
  const gaps = cells.gaps ?? [];
  const reach = gapReach(gaps);
  const regions = [];
  const fillerIds = new Set();
  const freeSides = new Map();
  const seamSides = new Map();
  const warnings = [];
  const cabinets = pieces.filter((piece) => piece.kind === 'cabinet' && piece.role === 'item'
    && isInsetStyle(resolveStyle(settings, room, run, pieceItem(run, piece))));
  if (cabinets.length === 0) return { regions, fillerIds, freeSides, seamSides, warnings };

  const members = [...cabinets, ...pieces.filter((piece) => piece.kind === 'filler')];
  const parent = new Map(members.map((piece) => [piece.id, piece.id]));
  const root = (id) => (parent.get(id) === id ? id : root(parent.get(id)));
  for (const a of members) {
    for (const b of members) {
      if (a === b || (a.kind === 'filler' && b.kind === 'filler')) continue;
      if (sideOf(a, b, reach)) parent.set(root(a.id), root(b.id));
    }
  }
  const groups = new Map();
  for (const piece of members) {
    const key = root(piece.id);
    groups.set(key, [...(groups.get(key) ?? []), piece]);
  }

  // A wall end panel the frame is mitered over (SPEC-36.2) counts as a side panel at the run's edge.
  const wallPanels = ['left', 'right'].flatMap((edge) => {
    const panel = run._frame?.wallPanels?.[edge];
    if (panel?.join !== 'miter') return [];
    return [{
      id: `${run.id}:wall-${edge}`,
      kind: 'end_panel',
      edge,
      x: edge === 'left' ? run.x - panel.width : run.x + run.width,
      z: 0,
      width: panel.width,
      height: panel.top,
    }];
  });
  const panels = [...pieces.filter(isSidePanel), ...wallPanels];
  for (const group of groups.values()) {
    const boxes = group.filter((piece) => piece.kind === 'cabinet');
    if (boxes.length === 0) continue;
    const bounds = boundsOf(group);
    const filled = group.reduce((total, piece) => total + areaOf(piece), 0)
      + gaps.reduce((total, gap) => total + overlapArea(gap, bounds), 0);
    if (filled < areaOf(bounds) - EPSILON) {
      warnings.push({
        code: 'frame-not-rectangle',
        pieceId: boxes[0].id,
        message: 'These face frame cabinets don\'t make a rectangle, so one frame can\'t cover them.',
      });
    }

    const region = {
      id: `frame:${boxes[0].id}`,
      ...bounds,
      cabinetIds: boxes.map((piece) => piece.id),
      fillerIds: group.filter((piece) => piece.kind === 'filler').map((piece) => piece.id),
      panelIds: [],
    };
    const covered = [];
    for (const panel of panels) {
      if (!overlaps(panel.z, panel.z + panel.height, bounds.z, bounds.z + bounds.height)) continue;
      const before = Math.abs(panel.x + panel.width - bounds.x) <= EPSILON;
      if (!before && Math.abs(panel.x - bounds.x - bounds.width) > EPSILON) continue;
      if (before) region.x = panel.x;
      region.width += panel.width;
      covered.push(panel);
      if (panel.edge) (region.wallPanels ??= []).push({ side: panel.edge, x: panel.x, width: panel.width });
      else region.panelIds.push(panel.id);
    }
    if (run.cabinetTypeId === CABINET_TYPE_IDS.UPPER
      && (run.upperBottom ?? 'overhang') === 'overhang'
      && Math.abs(bounds.z - run.z) <= EPSILON) {
      region.z -= frame.upperDrop;
      region.height += frame.upperDrop;
    }
    regions.push(region);
    for (const id of region.fillerIds) fillerIds.add(id);

    const covering = [...group, ...covered];
    for (const box of boxes) {
      const beside = (side) => covering.some((other) => other !== box && sideOf(box, other, reach) === side);
      const besideCabinet = (side) => boxes.some((other) => other !== box && sideOf(box, other, reach) === side);
      freeSides.set(box.id, { left: !beside('left'), right: !beside('right') });
      seamSides.set(box.id, { left: besideCabinet('left'), right: besideCabinet('right') });
    }
  }
  return { regions, fillerIds, freeSides, seamSides, warnings };
}

/** Each face's opening in the frame: its slot before any fit, a pair door's halves as one. */
export function faceOpenings(face, area, reveals) {
  const { faces } = resolveFaces(face, area, { ...reveals, fit: 0, pairFit: 0 });
  const byPath = new Map();
  for (const rect of faces) {
    const seen = byPath.get(rect.path);
    if (!seen) {
      byPath.set(rect.path, { path: rect.path, x: rect.x, z: rect.z, width: rect.width, height: rect.height });
      continue;
    }
    const right = Math.max(seen.x + seen.width, rect.x + rect.width);
    seen.x = Math.min(seen.x, rect.x);
    seen.width = right - seen.x;
  }
  return [...byPath.values()];
}

/**
 * How much narrower than its slot each framed box is, per side (SPEC-36.2): the stile's overhang on
 * a free side, else 0. Keyed by cabinet cell id, and by column id for a split column (from the cells
 * along its outside edges). Boxes outside a frame aren't in the map.
 */
export function boxInsets(frames, cells, settings) {
  const overhang = { ...DEFAULT_SETTINGS.insetFrame, ...settings.insetFrame }.stile;
  const insets = new Map();
  for (const [id, free] of frames.freeSides) {
    insets.set(id, { left: free.left ? overhang : 0, right: free.right ? overhang : 0 });
  }
  const columns = new Map();
  for (const piece of cells.pieces) {
    if (piece.columnId) columns.set(piece.columnId, [...(columns.get(piece.columnId) ?? []), piece]);
  }
  for (const [columnId, pieces] of columns) {
    const left = Math.min(...pieces.map((piece) => piece.x));
    const right = Math.max(...pieces.map((piece) => piece.x + piece.width));
    const free = (side, edge) => pieces.some((piece) => (insets.get(piece.id)?.[side] ?? 0) > 0
      && Math.abs((side === 'left' ? piece.x : piece.x + piece.width) - edge) <= EPSILON);
    const inset = { left: free('left', left) ? overhang : 0, right: free('right', right) ? overhang : 0 };
    if (inset.left > 0 || inset.right > 0) insets.set(columnId, inset);
  }
  return insets;
}

/** Every opening in a frame region, from its cabinets' face layouts (SPEC-36.2). */
export function regionOpenings(region, faceLayouts) {
  return region.cabinetIds.flatMap((id) => faceLayouts.get(id)?.openings ?? []);
}

function mergeSpans(spans) {
  const merged = [];
  for (const [start, end] of [...spans].sort((a, b) => a[0] - b[0])) {
    const last = merged[merged.length - 1];
    if (last && start < last[1] - EPSILON) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

function fills(opening, rect) {
  return Math.abs(opening.x - rect.x) <= EPSILON && Math.abs(opening.z - rect.z) <= EPSILON
    && Math.abs(opening.width - rect.width) <= EPSILON && Math.abs(opening.height - rect.height) <= EPSILON;
}

/**
 * A frame's stiles, rails and mullions (SPEC-36.2), cut from the region around its openings: the
 * full-height stiles first, then the rails between each pair of stiles, then any mullion between
 * those rails, and so on. Each is { kind, x, z, width, height }. Null when the openings can't be
 * cut apart that way (a pinwheel).
 */
export function frameMembers(region, openings) {
  const members = [];
  const cut = (rect, inside, vertical, depth, stuck) => {
    if (inside.length === 0 || (inside.length === 1 && fills(inside[0], rect))) return true;
    if (stuck > 1) return false;
    const low = vertical ? rect.x : rect.z;
    const high = low + (vertical ? rect.width : rect.height);
    const bays = mergeSpans(inside.map((opening) => (vertical
      ? [opening.x, opening.x + opening.width]
      : [opening.z, opening.z + opening.height])));
    const solids = [];
    let cursor = low;
    for (const [start, end] of bays) {
      if (start - cursor > EPSILON) solids.push([cursor, start]);
      cursor = Math.max(cursor, end);
    }
    if (high - cursor > EPSILON) solids.push([cursor, high]);
    for (const [start, end] of solids) {
      members.push(vertical
        ? { kind: depth === 0 ? 'stile' : 'mullion', x: start, z: rect.z, width: end - start, height: rect.height }
        : { kind: 'rail', x: rect.x, z: start, width: rect.width, height: end - start });
    }
    return bays.every(([start, end]) => {
      const bay = vertical
        ? { x: start, z: rect.z, width: end - start, height: rect.height }
        : { x: rect.x, z: start, width: rect.width, height: end - start };
      const within = inside.filter((opening) => (vertical
        ? opening.x >= start - EPSILON && opening.x + opening.width <= end + EPSILON
        : opening.z >= start - EPSILON && opening.z + opening.height <= end + EPSILON));
      return cut(bay, within, !vertical, depth + 1, solids.length === 0 ? stuck + 1 : 0);
    });
  };
  return cut(region, openings, true, 0, 0) ? members : null;
}

const MEMBER_ORDER = ['stile', 'rail', 'mullion'];

/**
 * Frame members counted by kind and size (SPEC-36.2): { kind, width, length, count }, stiles first.
 * A rail's width is its height and its length runs across; a stile's or mullion's length is its height.
 */
export function groupMembers(members) {
  const groups = new Map();
  for (const member of members) {
    const across = member.kind === 'rail' ? member.height : member.width;
    const length = member.kind === 'rail' ? member.width : member.height;
    const key = `${member.kind}:${Math.round(across * 10000)}:${Math.round(length * 10000)}`;
    const group = groups.get(key);
    if (group) group.count += 1;
    else groups.set(key, { kind: member.kind, width: across, length, count: 1 });
  }
  return [...groups.values()].sort((a, b) => MEMBER_ORDER.indexOf(a.kind) - MEMBER_ORDER.indexOf(b.kind));
}

/** Stacks of openings (widths overlapping), left to right, each with rail | opening | rail tracks, bottom to top. */
function openingStacks(region, openings) {
  const stacks = [];
  for (const opening of [...openings].sort((a, b) => a.x - b.x)) {
    const last = stacks[stacks.length - 1];
    if (last && opening.x < last.end - EPSILON) {
      last.end = Math.max(last.end, opening.x + opening.width);
      last.openings.push(opening);
    } else {
      stacks.push({ start: opening.x, end: opening.x + opening.width, openings: [opening] });
    }
  }
  const top = region.z + region.height;
  return stacks.map((stack) => {
    const tracks = [];
    let cursor = region.z;
    for (const [start, end] of mergeSpans(stack.openings.map((opening) => [opening.z, opening.z + opening.height]))) {
      if (start - cursor > EPSILON) tracks.push({ kind: 'frame', start: cursor, end: start });
      tracks.push({ kind: 'frame-opening', start, end });
      cursor = end;
    }
    if (top - cursor > EPSILON) tracks.push({ kind: 'frame', start: cursor, end: top });
    return { ...stack, tracks };
  });
}

/**
 * A frame region's vertical opening chains (SPEC-36.2): one per stack of openings, left to right,
 * leaving out a stack whose chain repeats one already given. Shaped like a cell grid on a row axis.
 */
export function frameVerticalChains(region, openings) {
  const seen = new Set();
  return openingStacks(region, openings).flatMap((stack, index) => {
    const signature = stack.tracks
      .map((track) => `${track.kind}:${Math.round((track.end - track.start) * 10000)}`)
      .join('|');
    if (seen.has(signature)) return [];
    seen.add(signature);
    const id = `${region.id}:v${index}`;
    return [{
      id,
      axis: 'row',
      x: stack.start,
      z: region.z,
      width: stack.end - stack.start,
      height: region.height,
      tracks: stack.tracks.map((track, trackIndex) => ({ ...track, id: `${id}:${trackIndex}`, manual: false })),
    }];
  });
}

/** Rail | opening | rail up the stack of openings nearest one side of a frame (SPEC-36.2.1). */
export function frameEdgeTracks(region, openings, edge) {
  const stacks = openingStacks(region, openings);
  if (stacks.length === 0) return [];
  return (edge === 'right' ? stacks[stacks.length - 1] : stacks[0]).tracks;
}

/**
 * Where a frame's part badge points (SPEC-36.2.1): the middle of the full-height stile nearest the
 * frame's centre, clear of the cabinets' own badges; the frame's centre when there's no stile.
 */
export function frameBadgeAnchor(region, members) {
  const middle = region.x + region.width / 2;
  const stiles = (members ?? []).filter((member) => member.kind === 'stile');
  if (stiles.length === 0) return { x: middle, z: region.z + region.height / 2 };
  const offset = (stile) => Math.abs(stile.x + stile.width / 2 - middle);
  const nearest = stiles.reduce((best, stile) => (offset(stile) < offset(best) - EPSILON ? stile : best));
  return { x: nearest.x + nearest.width / 2, z: nearest.z + nearest.height / 2 };
}
