import { gapReach, panelOrientation } from './cells.js';
import { findLeaf } from './cellTree.js';
import { DEFAULT_SETTINGS } from './constants.js';
import { cornerCabinetShape } from './cornerCabinet.js';
import { cornerDepthBAuto, cornerEndActive, cornerLegs, cornerOwnersAt } from './corners.js';
import { extendRunPieces } from './extensions.js';
import { resolveFaces } from './faces.js';
import { layoutFaces } from './faceLayouts.js';
import { runItems } from './grid.js';
import { frameDrop, isInsetStyle, resolveStyle } from './styles.js';
import { wallViewForRun } from './wallSides.js';

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

/** A framed corner's half-angle cut at its A (owner) or B (return) vertex: 0 unless a Corner 45. */
function cornerCut(room, wall, owner, side, vertex, legA) {
  const corner = owner.ends[side].corner ?? {};
  if ((corner.kind ?? 90) !== 45) return 0;
  const legs = cornerLegs(owner, side);
  const shape = cornerCabinetShape({
    kind: 45, legA: legA ?? legs.legA, legB: legs.legB, depthA: owner.depth,
    depthB: corner.depthB ?? cornerDepthBAuto(room, wall, owner, side),
  });
  return shape.errors ? 0 : shape.miters[vertex];
}

/**
 * The active corner cabinets on a framed run's ends (SPEC-CC6), per side: its own corner column
 * (`owner`), or a framed owner on the return wall that this run's plain end dies into. Each gives
 * the corner's kind and the cut its neighbour's stile takes (Corner 45).
 */
function frameCorners(room, run, columns) {
  const found = {};
  const wall = run._frame && room?.walls?.find((candidate) => candidate.runs.some((other) => other.id === run.id));
  if (!wall) return found;
  const view = wallViewForRun(wall, run);
  const items = runItems(run);
  for (const side of ['left', 'right']) {
    const type = run.ends?.[side]?.type;
    if (type === 'corner' && cornerEndActive(room, view, run, side).active) {
      const columnId = (side === 'left' ? items[0] : items.at(-1))?.id;
      const column = columns.get(columnId);
      if (!column) continue;
      found[side] = { owner: true, columnId, column,
        kind: run.ends[side].corner?.kind ?? 90, cut: cornerCut(room, view, run, side, 'a', column.width) };
    } else if (type === 'none') {
      const owner = cornerOwnersAt(room, view, run, side).find((entry) => entry.run._frame);
      if (!owner) continue;
      const ownerItems = runItems(owner.run);
      found[side] = { owner: false,
        columnId: (owner.side === 'left' ? ownerItems[0] : ownerItems.at(-1))?.id ?? null,
        kind: owner.run.ends[owner.side].corner?.kind ?? 90,
        cut: cornerCut(room, owner.wall, owner.run, owner.side, 'b') };
    }
  }
  return found;
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

/** Grow stiles with their end pieces, cutting away the space beyond the old frame edges. */
function extendRegion(region, openings, ends) {
  const bottom = region.z;
  const top = bottom + region.height;
  const extended = ends.filter((piece) => piece.z < bottom - EPSILON
    || piece.z + piece.height > top + EPSILON);
  if (!extended.length) return;
  const members = frameMembers(region, openings) ?? [];
  const low = Math.min(bottom, ...extended.map((piece) => piece.z));
  const high = Math.max(top, ...extended.map((piece) => piece.z + piece.height));
  const notches = [];
  for (const edge of ['bottom', 'top']) {
    const limit = edge === 'bottom' ? bottom : top;
    const spans = extended.flatMap((piece) => {
      const end = edge === 'bottom' ? piece.z : piece.z + piece.height;
      if (edge === 'bottom' ? end >= limit - EPSILON : end <= limit + EPSILON) return [];
      return members.filter((member) => member.kind !== 'rail'
        && Math.abs((edge === 'bottom' ? member.z : member.z + member.height) - limit) <= EPSILON
        && overlaps(member.x, member.x + member.width, piece.x, piece.x + piece.width))
        .map((member) => ({ x: member.x, width: member.width, end }));
    });
    const steps = (region.notches ?? []).filter((notch) => notch.edge === edge);
    const edges = [...new Set([region.x, region.x + region.width,
      ...[...spans, ...steps].flatMap(({ x, width }) => [x, x + width])])].sort((a, b) => a - b);
    for (let i = 1; i < edges.length; i += 1) {
      const x = edges[i - 1];
      const width = edges[i] - x;
      const covers = (piece) => overlaps(x, x + width, piece.x, piece.x + piece.width);
      const ends = spans.filter(covers).map(({ end }) => end);
      const step = steps.find(covers);
      let end = edge === 'bottom' ? Math.min(limit, ...ends) : Math.max(limit, ...ends);
      if (step) end = edge === 'bottom' ? Math.max(end, step.z + step.height) : Math.min(end, step.z);
      const z = edge === 'bottom' ? low : end;
      const height = edge === 'bottom' ? end - low : high - end;
      if (height <= EPSILON) continue;
      const columnId = step?.columnId;
      const last = notches.at(-1);
      if (last?.edge === edge && last.columnId === columnId
        && Math.abs(last.x + last.width - x) <= EPSILON
        && Math.abs(last.z - z) <= EPSILON && Math.abs(last.height - height) <= EPSILON) {
        last.width += width;
      } else {
        notches.push({ ...(columnId ? { columnId } : {}), edge, x, z, width, height });
      }
    }
  }
  region.z = low;
  region.height = high - low;
  region.notches = notches;
}

/**
 * Face frame regions for a run (SPEC-36). Each face frame cabinet, and each filler beside one,
 * joins a region with the boxes it touches or meets across a gap. A region is the rectangle
 * around its members, grown over a side or end panel at either side (the stile covers the
 * panel's edge), or a wall end panel the frame is mitered over (SPEC-36.2, `region.wallPanels`),
 * and down by the upper drop on an upper whose doors overhang. A filler in a frame
 * is part of a wider stile. A cabinet side with nothing framed or covered beside it is free.
 * `faceLayouts` may supply resolved openings; otherwise the shared face resolver derives them.
 *
 * SPEC-CC6: an active corner column on a framed run is in no region. Beside a Corner 90 the
 * neighbour's frame laps over the corner box (`cornerLaps`, `region.cornerLaps`): on the owner's
 * wall over the column's edge, on a return run dying into the corner past its end. Beside a
 * Corner 45 the neighbouring box is free, with the mitered stile's wider overhang (`overhangs`).
 *
 * @returns {{regions: object[], fillerIds: Set<string>, freeSides: Map<string, {left: boolean, right: boolean}>, seamSides: Map<string, {left: boolean, right: boolean}>, overhangs: Map<string, {left?: number, right?: number}>, cornerLaps: object[], warnings: object[]}}
 */
export function frameRegions(room, run, cells, settings, faceLayouts) {
  const pieces = cells.pieces.filter((piece) => !piece.step);
  const gaps = cells.gaps ?? [];
  const reach = gapReach(gaps);
  const regions = [];
  const fillerIds = new Set();
  const freeSides = new Map();
  const seamSides = new Map();
  const warnings = [];
  const overhangs = new Map();
  const cornerLaps = [];
  // Use the root grid's full box, including void cells, rather than a nested cabinet's bounds.
  const columns = new Map(pieces.map((piece) => {
    const id = piece.columnId ?? piece.id;
    const grid = cells.grids?.find((entry) => entry.columnId === id && entry.depth === 1);
    return [id, grid ? { ...grid, id, depth: piece.depth } : piece];
  }));
  const corners = frameCorners(room, run, columns);
  const cornerColumnIds = new Set(Object.values(corners).filter((corner) => corner.owner)
    .map((corner) => corner.columnId));
  const cabinets = pieces.filter((piece) => piece.kind === 'cabinet' && piece.role === 'item'
    && !cornerColumnIds.has(piece.columnId ?? piece.id)
    && isInsetStyle(resolveStyle(settings, room, run, pieceItem(run, piece))));
  if (cabinets.length === 0) return { regions, fillerIds, freeSides, seamSides, overhangs, cornerLaps, warnings };

  // SPEC-38.3: cells.gaps only records gaps between pieces; plain ends also have an end gap.
  // Include those gaps so a mitered wall end panel can reach the outermost box too.
  const runBounds = boundsOf(pieces);
  const wallReach = Math.max(reach, runBounds.x - run.x,
    run.x + run.width - runBounds.x - runBounds.width);

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
  // SPEC-CC6: a Corner 90 lap covers like a side panel but is never a part.
  const lap = { ...DEFAULT_SETTINGS.insetFrame, ...settings.insetFrame }.stile;
  const laps = Object.entries(corners).filter(([, corner]) => corner.kind === 90).map(([side, corner]) => {
    const rect = corner.owner ? corner.column : runBounds;
    const x = corner.owner
      ? (side === 'left' ? rect.x + rect.width - lap : rect.x)
      : (side === 'left' ? run.x - lap : run.x + run.width);
    return { id: `corner-lap:${corner.columnId}`, lap: true, side, columnId: corner.columnId,
      x, z: rect.z, width: lap, height: rect.height };
  });
  const panels = [...pieces.filter(isSidePanel), ...wallPanels, ...laps];
  const wall = room.walls?.find((candidate) => candidate.runs.some((other) => other.id === run.id));
  const extended = wall ? new Map(extendRunPieces(room, wallViewForRun(wall, run), run, cells, settings)
    .pieces.filter((piece) => (piece.kind === 'filler' || isSidePanel(piece))
      && piece.extended?.some((direction) => direction === 'up' || direction === 'down'))
    .map((piece) => [piece.id, piece]))
    : new Map();
  const pending = [];
  for (const group of groups.values()) {
    const boxes = group.filter((piece) => piece.kind === 'cabinet');
    if (boxes.length === 0) continue;
    const bounds = boundsOf(group);
    const boxBounds = boundsOf(boxes);
    const filled = group.reduce((total, piece) => total + areaOf(piece), 0)
      + gaps.reduce((total, gap) => total + overlapArea(gap, bounds), 0);
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
      // SPEC-38.3: a panel within the run's gap reach (the bead gap, plus any stile leftover) joins too.
      const gapBefore = bounds.x - (panel.x + panel.width);
      const gapAfter = panel.x - (bounds.x + bounds.width);
      const panelReach = panel.edge ? wallReach : reach;
      const before = gapBefore >= -EPSILON && gapBefore <= panelReach + EPSILON;
      const after = gapAfter >= -EPSILON && gapAfter <= panelReach + EPSILON;
      if (!before && !after) continue;
      // Stacked inside panels share an edge; grow the bounds once over that edge.
      const right = Math.max(region.x + region.width, panel.x + panel.width);
      region.x = Math.min(region.x, panel.x);
      region.width = right - region.x;
      covered.push(panel);
      if (panel.lap) {
        const entry = { id: panel.id, side: panel.side, x: panel.x, width: panel.width, columnId: panel.columnId };
        (region.cornerLaps ??= []).push(entry);
        cornerLaps.push(entry);
      } else if (panel.edge) (region.wallPanels ??= []).push({ side: panel.edge, x: panel.x, width: panel.width });
      else region.panelIds.push(panel.id);
    }

    // SPEC-38.3: at a run end with no panel, the frame runs out to the run's edge, over the bead gap
    // and any stile leftover, when nothing of the run sits between.
    const runRight = run.x + run.width;
    const leftClear = !covered.some((panel) => panel.x < bounds.x)
      && !pieces.some((piece) => piece.x >= run.x - EPSILON && piece.x + piece.width <= bounds.x + EPSILON);
    if (leftClear && bounds.x - run.x > EPSILON) {
      region.width += region.x - run.x;
      region.x = run.x;
    }
    const rightClear = !covered.some((panel) => panel.x > bounds.x)
      && !pieces.some((piece) => piece.x >= bounds.x + bounds.width - EPSILON
        && piece.x + piece.width <= runRight + EPSILON);
    if (rightClear && runRight - (region.x + region.width) > EPSILON) {
      region.width = runRight - region.x;
    }
    const drop = frameDrop(run, settings);
    if (drop > 0 && Math.abs(bounds.z - run.z) <= EPSILON) {
      region.z -= drop;
      region.height += drop;
    }
    const steps = [...new Set(boxes.map((box) => box.columnId ?? box.id))].flatMap((columnId) => {
      const column = columns.get(columnId);
      const top = column.z + column.height;
      const high = boxBounds.z + boxBounds.height;
      return [
        ...(high - top > EPSILON ? [{ columnId, edge: 'top', x: column.x, z: top,
          width: column.width, height: bounds.z + bounds.height - top }] : []),
        ...(column.z - boxBounds.z > EPSILON ? [{ columnId, edge: 'bottom', x: column.x, z: bounds.z,
          width: column.width, height: column.z - bounds.z }] : []),
      ];
    });
    // Check the original box footprint; end extensions are filled by their stiles and notches below.
    // The full column footprint includes the full-height stiles alongside the actual step notch.
    const filledSteps = steps.reduce((total, step) => total + overlapArea(step, bounds), 0);
    if (filled + filledSteps < areaOf(bounds) - EPSILON) {
      warnings.push({
        code: 'frame-not-rectangle',
        pieceId: boxes[0].id,
        message: 'These face frame cabinets don\'t make a rectangle, so one frame can\'t cover them.',
      });
    }
    const ends = [...group.filter((piece) => piece.kind === 'filler'), ...covered]
      .flatMap((piece) => extended.get(piece.id) ?? []);
    if (steps.length || ends.some((piece) => piece.z < region.z - EPSILON
      || piece.z + piece.height > region.z + region.height + EPSILON)) {
      pending.push({ region, boxes, steps, drop, ends });
    }
    regions.push(region);
    for (const id of region.fillerIds) fillerIds.add(id);

    const covering = [...group, ...covered];
    const atRunEnd = {
      left: (box) => leftClear && Math.abs(box.x - bounds.x) <= EPSILON,
      right: (box) => rightClear && Math.abs(box.x + box.width - bounds.x - bounds.width) <= EPSILON,
    };
    for (const box of boxes) {
      const beside = (side) => covering.some((other) => other !== box
        && sideOf(box, other, other.edge ? wallReach : reach) === side);
      const besideCabinet = (side) => boxes.some((other) => other !== box && sideOf(box, other, reach) === side);
      // SPEC-38.3: a run end's overhang is in its end gap, so the box there isn't narrowed.
      freeSides.set(box.id, {
        left: !beside('left') && !atRunEnd.left(box),
        right: !beside('right') && !atRunEnd.right(box),
      });
      seamSides.set(box.id, { left: besideCabinet('left'), right: besideCabinet('right') });
    }
  }
  // SPEC-CC6: beside a Corner 45 the stile is mitered: the box is free, spaced off by lap + ft·tan(cut).
  for (const [side, corner] of Object.entries(corners)) {
    if (corner.kind !== 45) continue;
    const other = side === 'left' ? 'right' : 'left';
    const amount = lap + run._frame.thickness * Math.tan(corner.cut * Math.PI / 180);
    for (const [id, free] of freeSides) {
      const box = cabinets.find((piece) => piece.id === id);
      const meets = corner.owner
        ? sideOf(corner.column, box, reach) === other
        : (side === 'left' ? box.x - run.x : run.x + run.width - box.x - box.width) <= wallReach + EPSILON;
      if (!meets) continue;
      free[side] = true;
      overhangs.set(id, { ...overhangs.get(id), [side]: amount });
      if (!(run._frame.bead > 0)) {
        const region = regions.find((region) => region.cabinetIds.includes(id));
        (region.cuts ??= {})[side] = corner.cut;
      }
    }
  }
  const frames = { regions, fillerIds, freeSides, seamSides, overhangs, cornerLaps, warnings };
  if (pending.length) {
    const faces = faceLayouts ?? layoutFaces(room, wall, run, settings,
      { pieces: [...columns.values()] }, { cells: { ...cells, gaps }, frames });
    const stile = { ...DEFAULT_SETTINGS.insetFrame, ...settings.insetFrame }.stile;
    for (const { region, boxes, steps, drop, ends } of pending) {
      const notches = steps.flatMap((step) => {
        const columnBoxes = boxes.filter((box) => (box.columnId ?? box.id) === step.columnId);
        const openings = columnBoxes.flatMap((box) => faces.get(box.id)?.openings ?? []);
        const column = columns.get(step.columnId);
        const beside = (side) => boxes.some((box) => !columnBoxes.includes(box)
          && sideOf(column, box, reach) === side);
        const left = openings.length ? Math.min(...openings.map((opening) => opening.x))
          : column.x + (beside('left') ? stile : 0);
        const right = openings.length ? Math.max(...openings.map((opening) => opening.x + opening.width))
          : column.x + column.width - (beside('right') ? stile : 0);
        const z = step.edge === 'bottom' ? region.z : step.z;
        const top = step.edge === 'bottom' ? column.z - drop : region.z + region.height;
        return right - left > EPSILON && top - z > EPSILON
          ? [{ columnId: step.columnId, edge: step.edge, x: left, z, width: right - left, height: top - z }]
          : [];
      });
      if (steps.length) region.notches = notches;
      extendRegion(region, regionOpenings(region, faces), ends);
      region.notches?.sort((a, b) => (a.edge === b.edge ? a.x - b.x : a.edge === 'top' ? -1 : 1));
    }
  }
  return frames;
}

/** Each face's opening in the frame: its slot before any fit, a pair door's halves as one, and the faces on either side of a no-rail seam as one. */
export function faceOpenings(face, area, reveals) {
  const { faces } = resolveFaces(face, area, { ...reveals, fit: 0, pairFit: 0 });
  const byPath = new Map();
  for (const rect of faces) {
    // The faces on either side of a no-rail seam are one opening (SPEC-36.3).
    const key = rect.opening ?? rect.path;
    const seen = byPath.get(key);
    if (!seen) {
      byPath.set(key, { path: key, x: rect.x, z: rect.z, width: rect.width, height: rect.height });
      continue;
    }
    const right = Math.max(seen.x + seen.width, rect.x + rect.width);
    const top = Math.max(seen.z + seen.height, rect.z + rect.height);
    seen.x = Math.min(seen.x, rect.x);
    seen.z = Math.min(seen.z, rect.z);
    seen.width = right - seen.x;
    seen.height = top - seen.z;
  }
  return [...byPath.values()];
}

/**
 * How much narrower than its slot each framed box is, per side (SPEC-36.2): the stile's overhang on
 * a free side (a mitered corner stile's own, SPEC-CC6), else 0. Keyed by cabinet cell id, and by column id for a split column (from the cells
 * along its outside edges). Boxes outside a frame aren't in the map.
 */
export function boxInsets(frames, cells, settings) {
  const overhang = { ...DEFAULT_SETTINGS.insetFrame, ...settings.insetFrame }.stile;
  const insets = new Map();
  for (const [id, free] of frames.freeSides) {
    const own = frames.overhangs?.get(id);
    insets.set(id, { left: free.left ? own?.left ?? overhang : 0, right: free.right ? own?.right ?? overhang : 0 });
  }
  const columns = new Map();
  for (const piece of cells.pieces) {
    if (piece.columnId) columns.set(piece.columnId, [...(columns.get(piece.columnId) ?? []), piece]);
  }
  for (const [columnId, pieces] of columns) {
    const left = Math.min(...pieces.map((piece) => piece.x));
    const right = Math.max(...pieces.map((piece) => piece.x + piece.width));
    const edgeInset = (side, edge) => Math.max(0, ...pieces.filter((piece) => (
      Math.abs((side === 'left' ? piece.x : piece.x + piece.width) - edge) <= EPSILON
    )).map((piece) => insets.get(piece.id)?.[side] ?? 0));
    const inset = { left: edgeInset('left', left), right: edgeInset('right', right) };
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
 * A frame's stiles, rails and mullions (SPEC-36.2), cut around its openings and notches (never
 * emitted): full-height stiles first, then rails between each pair of stiles, then any mullion
 * between those rails, and so on. Each is { kind, x, z, width, height }. Null when the openings can't be
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
  return cut(region, [...openings, ...(region.notches ?? [])], true, 0, 0) ? members : null;
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
