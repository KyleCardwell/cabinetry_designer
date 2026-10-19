import { findLeaf } from './cellTree.js';
import { DEFAULT_SETTINGS } from './constants.js';
import { sheetThickness } from './doorStyles.js';
import { wallDrawerBoxes } from './drawerBoxes.js';
import { getInteriorNode } from './interiorTree.js';
import { wallInteriors } from './interiors.js';
import { resolveWall } from './room.js';
import { wallRollouts } from './rollouts.js';

const door = (face) => ['door', 'pair_door'].includes(face.type);
const shelfFace = (face) => face.type === 'open'
  || (door(face) && (face.action === undefined || ['pocket', 'sliding'].includes(face.action)));
// Top- and bottom-hinged doors don't hinge on the box sides, so they need no hinge plate holes (Kyle 2026-10-19).
export const sideHinged = (face) => door(face) && face.action === undefined && !['top', 'bottom'].includes(face.hinge);
export const covers = (face, section) => (
  Math.min(face.x + face.width, section.x + section.width) - Math.max(face.x, section.x) > 1 / 4
  && Math.min(face.z + face.height, section.z + section.height) - Math.max(face.z, section.z) > 1 / 4
);

/** Tallest clear vertical band after unioning the drawer spaces owned by this section. */
export function shelfZone(section, boxes) {
  const top = section.z + section.height;
  const spaces = boxes.map(({ space }) => space).filter((space) => {
    const x = space.x + space.width / 2;
    const z = space.z + space.height / 2;
    return x >= section.x && x <= section.x + section.width && z >= section.z && z <= top;
  }).map((space) => ({ z: Math.max(section.z, space.z), top: Math.min(top, space.z + space.height) }))
    .sort((a, b) => a.z - b.z);
  let cursor = section.z;
  let zone = { z: section.z, height: 0 };
  for (const space of [...spaces, { z: top, top }]) {
    if (space.z - cursor > zone.height) zone = { z: cursor, height: space.z - cursor };
    cursor = Math.max(cursor, space.top);
  }
  return zone;
}

/** Resolve adjustable shelves and shop flags for each placed, wall-coordinate section. */
export function sectionShelves({ interior, faces, boxes = [], leaf, settings, rollouts = new Map() }) {
  const setting = (key) => settings?.[key] ?? DEFAULT_SETTINGS[key];
  const result = new Map();
  for (const section of interior.sections) {
    const node = getInteriorNode(interior.tree, section.path) ?? {};
    const pick = node.shelves ?? {};
    const cabinet = leaf.shelves ?? {};
    const source = (key) => pick[key] !== undefined ? 'manual' : cabinet[key] !== undefined ? 'cabinet' : 'auto';
    const glass = pick.glass ?? cabinet.glass ?? false;
    const kind = glass ? 'none' : pick.nosing ?? cabinet.nosing ?? 'none';
    const width = section.width - setting('shelfWidthClearance');
    const depth = section.depth - setting('shelfSetback');
    const thickness = glass ? setting('glassShelfThickness') : sheetThickness(settings);
    const nosing = kind === 'none' ? null : {
      kind, height: setting('shelfNosingHeight'), thickness: setting('shelfNosingThickness'), length: width,
    };
    const clear = shelfZone(section, boxes);
    const entry = rollouts.get(section.path);
    const zone = entry ? { z: entry.top, height: Math.max(0, clear.z + clear.height - entry.top) } : clear;
    const covering = faces.filter((face) => covers(face, section));
    const eligible = !['sink', 'cooktop', 'oven'].includes(leaf.purpose) && covering.some(shelfFace);
    const visible = nosing?.height ?? thickness;
    // Auto: the most shelves that still leave at least `shelfSpacing` (11" default) clear between them (Kyle 2026-10-19).
    const spacing = setting('shelfSpacing');
    const count = pick.count ?? (eligible
      ? Math.max(0, Math.floor((zone.height - spacing) / (spacing + visible) + 1e-9)) : 0);
    const gap = (zone.height - count * visible) / (count + 1);
    result.set(section.path, {
      count, countSource: pick.count === undefined ? 'auto' : 'manual', zone, width, depth,
      orderedDepth: kind === 'folded' ? depth + setting('foldedNosingExtra')
        : kind === 'hardwood' ? depth - nosing.thickness : depth,
      // Equal clear space between shelves (and above/below them), for information only.
      gap: count > 0 ? gap : null,
      thickness, glass, glassSource: source('glass'), nosing, nosingSource: source('nosing'),
      banding: glass ? null : !nosing,
      positions: Array.from({ length: count }, (_, index) => zone.z + gap + index * (visible + gap)),
      hinges: node.hinges ?? covering.some(sideHinged),
      hingesSource: node.hinges === undefined ? 'auto' : 'manual',
      lineBore: node.lineBore ?? count > 0,
      lineBoreSource: node.lineBore === undefined ? 'auto' : 'manual',
      warnings: count > 0 && gap < 3 ? [{ code: 'shelves-crowded' }] : [],
    });
  }
  return result;
}

/** Share all interior passes across every cabinet on the wall face. */
export function wallInteriorData(room, wall, side, settings) {
  const faceLayoutsByRun = new Map();
  const interiors = wallInteriors(room, wall, side, settings, faceLayoutsByRun);
  const boxes = wallDrawerBoxes(room, wall, side, settings, { interiors, faceLayoutsByRun });
  const rollouts = wallRollouts(room, wall, side, settings, { interiors, faceLayoutsByRun, boxes });
  const runs = new Map(resolveWall(room, wall, side).runs.map((run) => [run.id, run]));
  const shelves = new Map(interiors.map((interior) => [interior.itemId, sectionShelves({
    interior,
    faces: faceLayoutsByRun.get(interior.runId)?.get(interior.itemId)?.faces ?? [],
    boxes: boxes.get(interior.itemId)?.boxes ?? [],
    rollouts: rollouts.get(interior.itemId),
    leaf: findLeaf(runs.get(interior.runId).grid, interior.itemId),
    settings,
  })]));
  return { interiors: new Map(interiors.map((interior) => [interior.itemId, interior])), boxes, rollouts, shelves };
}

/** Adjustable shelves retain the same wall-coordinate results as the shared interior data. */
export function wallShelves(room, wall, side, settings) {
  return wallInteriorData(room, wall, side, settings).shelves;
}
