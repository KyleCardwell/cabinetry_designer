import { BACK_PANEL_THICKNESS, DADO_BACK_SETBACK, STRETCHER_DEPTH } from './constants.js';
import { boxConstruction } from './boxConstruction.js';
import { findLeaf } from './cellTree.js';
import { sheetThickness } from './doorStyles.js';
import { elevationParts } from './elevationParts.js';
import { MIN_FACE_SIZE, ROOT_FACE_PATH } from './faces.js';
import { getInteriorNode } from './interiorTree.js';
import { resolveWall } from './room.js';
import { roundTo } from './units.js';

export function interiorDepth(boxDepth, back, settings) {
  switch (back) {
    case 'dado': return boxDepth - DADO_BACK_SETBACK - BACK_PANEL_THICKNESS;
    case 'inset': return boxDepth - sheetThickness(settings);
    case 'applied': return boxDepth - BACK_PANEL_THICKNESS;
    default: return boxDepth;
  }
}

/** Divider centres along the outline axis: left to right, or top to bottom (-z). */
function dividerCenters(node, rect, box, thicknesses) {
  const stacked = node.direction === 'vertical';
  const start = stacked ? -rect.z - rect.height : rect.x;
  const end = stacked ? -rect.z : rect.x + rect.width;
  const centers = node.dividers.map((divider) => {
    if (divider.at === undefined) return null;
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

/** Resolve the stored tree into box-local clear sections and full-span dividers. */
export function resolveInterior(interior, box, construction, settings) {
  const t = sheetThickness(settings);
  const x = construction.left ? t : 0;
  const z = construction.bottom === 'none' ? 0 : t;
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
    const { centers, start, end } = dividerCenters(node, clear, box, thicknesses);
    node.dividers.forEach((divider, index) => {
      const thickness = thicknesses[index];
      const center = stacked ? -centers[index] : centers[index];
      const auto = divider.at === undefined;
      const depthAuto = divider.depth === undefined;
      const dividerDepth = divider.depth ?? (divider.kind === 'stretcher' ? STRETCHER_DEPTH : depth);
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
      });
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
  walk(getInteriorNode(interior, ROOT_FACE_PATH), rect, ROOT_FACE_PATH);
  return { rect, depth, sections, dividers, warnings, partLines: boxPartLines(box, construction, t) };
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
    lines.push({ part, x: x0, z: part === 'bottom' ? t : h - t, width: x1 - x0, height: 0 });
  }
  return lines;
}

/** Find the drawn cabinet box on this face, including any blind portion. */
export function cabinetInterior(room, wall, side, settings, itemId) {
  const part = elevationParts(room, wall, side, settings)
    .find((entry) => entry.kind === 'cabinet' && entry.id === itemId);
  if (!part) return null;
  const view = resolveWall(room, wall, side);
  const run = view.runs.find((entry) => entry.id === part.runId);
  return interiorForPart(part, run, wall, settings);
}

function interiorForPart(part, run, wall, settings) {
  const leaf = findLeaf(run.grid, part.id);
  const box = { x: part.x, z: part.z, width: part.width, height: part.height, depth: part.front - part.back };
  const construction = boxConstruction(leaf, run, wall);
  return { box, construction, ...resolveInterior(leaf.interior, box, construction, settings) };
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
export function wallInteriors(room, wall, side, settings) {
  const view = resolveWall(room, wall, side);
  const runs = new Map(view.runs.map((run) => [run.id, run]));
  return elevationParts(room, wall, side, settings)
    .filter((part) => part.kind === 'cabinet')
    .map((part) => ({
      itemId: part.id,
      runId: part.runId,
      ...placeInterior(interiorForPart(part, runs.get(part.runId), wall, settings)),
    }));
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
