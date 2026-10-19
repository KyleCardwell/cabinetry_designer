import { BACK_PANEL_THICKNESS, DADO_BACK_SETBACK, STRETCHER_DEPTH } from './constants.js';
import { autoInterior } from './autoInterior.js';
import { boxConstruction } from './boxConstruction.js';
import { findLeaf } from './cellTree.js';
import { sheetThickness } from './doorStyles.js';
import { elevationParts } from './elevationParts.js';
import { defaultFace, MIN_FACE_SIZE, ROOT_FACE_PATH } from './faces.js';
import { getFaceNode } from './faceTree.js';
import { getInteriorNode } from './interiorTree.js';
import { resolveWall } from './room.js';
import { runScene } from './runScene.js';
import { isInsetStyle } from './styles.js';
import { roundTo } from './units.js';

/** A raised face frame deck (`box.deckZ`, IN5.2); an overlay bottom stays at the box bottom. */
function deckRaise(box, construction) {
  return construction.bottom === 'overlay' ? 0 : box.deckZ ?? 0;
}

export function interiorDepth(boxDepth, back, settings) {
  switch (back) {
    case 'dado': return boxDepth - DADO_BACK_SETBACK - BACK_PANEL_THICKNESS;
    case 'inset': return boxDepth - sheetThickness(settings);
    case 'applied': return boxDepth - BACK_PANEL_THICKNESS;
    default: return boxDepth;
  }
}

/** Divider centres along the outline axis: left to right, or top to bottom (-z). */
function dividerCenters(node, rect, box, thicknesses, seams) {
  const stacked = node.direction === 'vertical';
  const start = stacked ? -rect.z - rect.height : rect.x;
  const end = stacked ? -rect.z : rect.x + rect.width;
  const centers = node.dividers.map((divider, index) => {
    if (divider.at === undefined) return seams[index] === null ? null : stacked ? -seams[index] : seams[index];
    if (stacked) return -divider.at;
    return divider.from === 'right' ? box.width - divider.at : divider.at;
  });
  let first = 0;
  let bound = start;
  for (let i = 0; i <= centers.length; i += 1) {
    if (i < centers.length && centers[i] === null) continue;
    const limit = i === centers.length ? end : centers[i] - thicknesses[i] / 2;
    const material = thicknesses.slice(first, i).reduce((sum, value) => sum + value, 0);
    const clear = (limit - bound - material) / (i - first + 1);
    let cursor = bound;
    for (let j = first; j < i; j += 1) {
      centers[j] = cursor + clear + thicknesses[j] / 2;
      cursor = centers[j] + thicknesses[j] / 2;
    }
    if (i < centers.length) bound = centers[i] + thicknesses[i] / 2;
    first = i + 1;
  }
  return { centers, start, end };
}

/** A valid seam in wall coordinates becomes an exterior-to-centre box-local position. */
function seamCenter(seam, direction, thickness, box, context) {
  if (!context || !seam) return null;
  const [path, key] = seam.split(':');
  const node = getFaceNode(context.faceTree, path);
  const under = (entries, prefix) => (entries ?? [])
    .filter((entry) => entry.path === prefix || entry.path.startsWith(`${prefix}.`));
  if (key === 'pair') {
    if (direction !== 'horizontal' || node?.type !== 'pair_door') return null;
    const halves = under(context.faces, path);
    const left = halves.find((face) => face.half === 'left');
    const right = halves.find((face) => face.half === 'right');
    return left && right ? (left.x + left.width + right.x) / 2 - (box.x ?? 0) : null;
  }
  const index = Number(key);
  if (!node?.children || node.direction !== direction || !Number.isInteger(index)
    || index < 0 || index >= node.children.length - 1) return null;
  const above = under(context.faces, `${path}.${index}`);
  const below = under(context.faces, `${path}.${index + 1}`);
  if (!above.length || !below.length) return null;
  if (direction === 'horizontal') {
    return (Math.max(...above.map((face) => face.x + face.width))
      + Math.min(...below.map((face) => face.x))) / 2 - (box.x ?? 0);
  }
  if (context.inset && !node.noRail?.includes(index)) {
    const openings = under(context.openings, `${path}.${index}`);
    return openings.length ? Math.min(...openings.map((opening) => opening.z))
      - thickness / 2 - (box.z ?? 0) : null;
  }
  return (Math.min(...above.map((face) => face.z))
    + Math.max(...below.map((face) => face.z + face.height))) / 2 - (box.z ?? 0);
}

function hasPartition(tree) {
  return Boolean(tree?.dividers?.some(({ kind }) => ['partition', 'double_partition'].includes(kind))
    || tree?.children?.some(hasPartition));
}

/** Resolve the effective tree into box-local clear sections and full-span dividers. */
export function resolveInterior(interior, box, construction, settings, context) {
  const automatic = context ? autoInterior(context.faceTree, box.width, {
    nosing: context.nosing === 'none' ? null : context.nosing,
  }) : null;
  const auto = interior === undefined && Boolean(context);
  const tree = auto ? automatic : interior ?? null;
  const t = sheetThickness(settings);
  const x = construction.left ? t : 0;
  const z = construction.bottom === 'none' ? 0 : deckRaise(box, construction) + t;
  const rect = {
    x, z,
    width: box.width - x - (construction.right ? t : 0),
    height: box.height - z - (construction.top === 'none' ? 0 : t),
  };
  const depth = interiorDepth(box.depth, construction.back, settings);
  const sections = [];
  const dividers = [];
  const warnings = [];
  const walk = (node, region, path) => {
    const smallWidth = region.width < MIN_FACE_SIZE;
    const smallHeight = region.height < MIN_FACE_SIZE;
    if (smallWidth || smallHeight) warnings.push({ code: 'section-too-small', path });
    const clear = {
      ...region,
      width: smallWidth ? 0 : region.width,
      height: smallHeight ? 0 : region.height,
    };
    if (!node.children) {
      sections.push({ path, ...clear, depth });
      return;
    }
    const stacked = node.direction === 'vertical';
    const thicknesses = node.dividers.map(({ kind }) => kind.startsWith('double_') ? 2 * t : t);
    const seams = node.dividers.map((divider, index) => (
      seamCenter(divider.seam, node.direction, thicknesses[index], box, context)
    ));
    const { centers, start, end } = dividerCenters(node, clear, box, thicknesses, seams);
    node.dividers.forEach((divider, index) => {
      const thickness = thicknesses[index];
      const center = stacked ? -centers[index] : centers[index];
      const auto = divider.at === undefined;
      const depthAuto = divider.depth === undefined;
      const dividerDepth = divider.depth ?? (divider.kind === 'stretcher' ? STRETCHER_DEPTH : depth);
      const banded = ['fixed', 'double_fixed'].includes(divider.kind);
      const dimensions = stacked ? { fromBottom: center, dimFrom: 'bottom' } : {
        fromLeft: center,
        fromRight: box.width - center,
        dimFrom: auto ? (center <= box.width - center ? 'left' : 'right') : (divider.from ?? 'left'),
      };
      dividers.push({
        path, index, kind: divider.kind,
        x: stacked ? clear.x : center - thickness / 2,
        z: stacked ? center - thickness / 2 : clear.z,
        width: stacked ? clear.width : thickness,
        height: stacked ? thickness : clear.height,
        depth: dividerDepth, ...dimensions, auto, depthAuto,
        seam: divider.seam ?? null, linked: auto && seams[index] !== null,
        banding: banded ? divider.banding ?? !context?.inset : null,
        bandingSource: banded ? divider.banding === undefined ? 'auto' : 'manual' : null,
      });
      if (context && divider.seam && seams[index] === null) {
        warnings.push({ code: 'divider-seam-missing', path, index });
      }
      if (dividerDepth > depth) warnings.push({ code: 'divider-too-deep', path, index });
    });
    node.children.forEach((child, index) => {
      const leading = index === 0 ? start : centers[index - 1] + thicknesses[index - 1] / 2;
      const trailing = index === centers.length ? end : centers[index] - thicknesses[index] / 2;
      const childRect = stacked
        ? { x: clear.x, z: -trailing, width: clear.width, height: trailing - leading }
        : { x: leading, z: clear.z, width: trailing - leading, height: clear.height };
      walk(child, childRect, `${path}.${index}`);
    });
  };
  walk(getInteriorNode(tree, ROOT_FACE_PATH), rect, ROOT_FACE_PATH);
  if (hasPartition(automatic) && !hasPartition(tree)) warnings.push({ code: 'wide-no-partition' });
  return { tree, auto, rect, depth, sections, dividers, warnings, partLines: boxPartLines(box, construction, t) };
}

/**
 * Inner edges of the built box parts, as zero-width/height rectangles (box-local). Sides run the full
 * box height past between/spreader tops and bottoms; an overlay top or bottom runs the full width and
 * cuts the side lines short. Parts that aren't built draw nothing.
 */
export function boxPartLines(box, construction, t) {
  const { width: w, height: h } = box;
  const lines = [];
  const z0 = construction.bottom === 'overlay' ? t : 0;
  const z1 = construction.top === 'overlay' ? h - t : h;
  if (construction.left) lines.push({ part: 'left', x: t, z: z0, width: 0, height: z1 - z0 });
  if (construction.right) lines.push({ part: 'right', x: w - t, z: z0, width: 0, height: z1 - z0 });
  for (const part of ['bottom', 'top']) {
    const kind = construction[part];
    if (kind === 'none') continue;
    const x0 = kind !== 'overlay' && construction.left ? t : 0;
    const x1 = kind !== 'overlay' && construction.right ? w - t : w;
    lines.push({ part, x: x0, z: part === 'bottom' ? deckRaise(box, construction) + t : h - t, width: x1 - x0, height: 0 });
    // A raised deck (IN5.2) shows its underside too, so it reads as one 3/4" part.
    if (part === 'bottom' && deckRaise(box, construction) > 0) {
      lines.push({ part: 'deckUnder', x: x0, z: deckRaise(box, construction), width: x1 - x0, height: 0 });
    }
  }
  return lines;
}

/** Find the drawn cabinet box on this face, including any blind portion. */
export function cabinetInterior(room, wall, side, settings, itemId) {
  const part = elevationParts(room, wall, side, settings, { withDecks: true })
    .find((entry) => entry.kind === 'cabinet' && entry.id === itemId);
  if (!part) return null;
  const view = resolveWall(room, wall, side);
  const run = view.runs.find((entry) => entry.id === part.runId);
  const { faceLayouts } = runScene(room, view, run, settings);
  return interiorForPart(part, run, wall, settings, faceLayouts.get(itemId));
}

function interiorForPart(part, run, wall, settings, layout) {
  const leaf = findLeaf(run.grid, part.id);
  const box = {
    x: part.x, z: part.z, width: part.width, height: part.height, depth: part.front - part.back,
    ...(part.deckZ > 0 ? { deckZ: part.deckZ } : {}),
  };
  const construction = boxConstruction(leaf, run, wall);
  const context = layout ? {
    faceTree: leaf.face ?? defaultFace(layout.box.width, settings),
    faces: layout.faces, openings: layout.openings, inset: isInsetStyle(layout.style),
    nosing: leaf.shelves?.nosing,
  } : undefined;
  return { box, construction, ...resolveInterior(leaf.interior, box, construction, settings, context) };
}

/** Place clear sections and dividers in wall view coordinates without changing their measurements. */
export function placeInterior(interior) {
  const place = (rect) => ({ ...rect, x: rect.x + interior.box.x, z: rect.z + interior.box.z });
  return {
    ...interior,
    sections: interior.sections.map(place),
    dividers: interior.dividers.map(place),
    partLines: (interior.partLines ?? []).map(place),
  };
}

/** Resolve every cabinet on a face using one shared elevation parts pass. */
export function wallInteriors(room, wall, side, settings, faceLayoutsByRun = new Map()) {
  const view = resolveWall(room, wall, side);
  const runs = new Map(view.runs.map((run) => [run.id, run]));
  return elevationParts(room, wall, side, settings, { withDecks: true })
    .filter((part) => part.kind === 'cabinet')
    .map((part) => {
      const run = runs.get(part.runId);
      if (!faceLayoutsByRun.has(run.id)) {
        faceLayoutsByRun.set(run.id, runScene(room, view, run, settings).faceLayouts);
      }
      return {
        itemId: part.id,
        runId: part.runId,
        ...placeInterior(interiorForPart(part, run, wall, settings, faceLayoutsByRun.get(run.id).get(part.id))),
      };
    });
}

/** Exterior-to-centre dimensions in divider order, with lanes shared only on the same anchor line. */
export function interiorDimensions(placed) {
  const { box, dividers } = placed;
  const lanes = new Map();
  const dimensions = dividers.map((divider) => {
    const { path, index, dimFrom: side } = divider;
    const vertical = side === 'bottom';
    const z = divider.z + divider.height;
    const dimension = {
      key: `${path}:${index}`,
      path, index,
      axis: vertical ? 'vertical' : 'horizontal',
      from: vertical ? { x: divider.x, z: box.z } : {
        x: side === 'left' ? box.x : box.x + box.width, z,
      },
      to: vertical ? { x: divider.x, z: box.z + divider.fromBottom } : {
        x: box.x + divider.fromLeft, z,
      },
      value: vertical ? divider.fromBottom : side === 'left' ? divider.fromLeft : divider.fromRight,
      side,
      manual: !divider.auto,
      lane: 0,
    };
    const anchor = vertical ? `vertical:${divider.x}` : `horizontal:${z}:${side}`;
    if (!lanes.has(anchor)) lanes.set(anchor, []);
    lanes.get(anchor).push(dimension);
    return dimension;
  });
  for (const group of lanes.values()) {
    group.sort((a, b) => a.value - b.value)
      .forEach((dimension, lane) => { dimension.lane = lane; });
  }
  return dimensions;
}

/** Convert a wall-coordinate move into a snapped position on the dimension's stored side. */
export function dragDividerPosition(dimension, delta) {
  const { side, value } = dimension;
  const move = side === 'bottom' ? delta.z : side === 'left' ? delta.x : -delta.x;
  const at = Math.max(1 / 16, roundTo(value + move, 1 / 16));
  return side === 'bottom' ? { at } : { at, from: side };
}
