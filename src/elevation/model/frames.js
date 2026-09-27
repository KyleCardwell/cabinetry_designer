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
 * panel's edge) and down by the upper drop on an upper whose doors overhang. A filler in a frame
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

  const panels = pieces.filter(isSidePanel);
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
    for (const panel of panels) {
      if (!overlaps(panel.z, panel.z + panel.height, bounds.z, bounds.z + bounds.height)) continue;
      if (Math.abs(panel.x + panel.width - bounds.x) <= EPSILON) {
        region.x = panel.x;
        region.width += panel.width;
        region.panelIds.push(panel.id);
      } else if (Math.abs(panel.x - bounds.x - bounds.width) <= EPSILON) {
        region.width += panel.width;
        region.panelIds.push(panel.id);
      }
    }
    if (run.cabinetTypeId === CABINET_TYPE_IDS.UPPER
      && (run.upperBottom ?? 'overhang') === 'overhang'
      && Math.abs(bounds.z - run.z) <= EPSILON) {
      region.z -= frame.upperDrop;
      region.height += frame.upperDrop;
    }
    regions.push(region);
    for (const id of region.fillerIds) fillerIds.add(id);

    const covering = [...group, ...panels.filter((panel) => region.panelIds.includes(panel.id))];
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
