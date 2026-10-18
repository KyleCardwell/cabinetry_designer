import { BACK_PANEL_THICKNESS, DADO_BACK_SETBACK, STRETCHER_DEPTH } from './constants.js';
import { boxConstruction } from './boxConstruction.js';
import { findLeaf } from './cellTree.js';
import { sheetThickness } from './doorStyles.js';
import { elevationParts } from './elevationParts.js';
import { MIN_FACE_SIZE, ROOT_FACE_PATH } from './faces.js';
import { getInteriorNode } from './interiorTree.js';
import { resolveWall } from './room.js';

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
  return { rect, depth, sections, dividers, warnings };
}

/** Find the drawn cabinet box on this face, including any blind portion. */
export function cabinetInterior(room, wall, side, settings, itemId) {
  const part = elevationParts(room, wall, side, settings)
    .find((entry) => entry.kind === 'cabinet' && entry.id === itemId);
  if (!part) return null;
  const view = resolveWall(room, wall, side);
  const run = view.runs.find((entry) => entry.id === part.runId);
  const leaf = findLeaf(run.grid, itemId);
  const box = { x: part.x, z: part.z, width: part.width, height: part.height, depth: part.front - part.back };
  const construction = boxConstruction(leaf, run, wall);
  return { box, construction, ...resolveInterior(leaf.interior, box, construction, settings) };
}
