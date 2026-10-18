import { DEFAULT_SETTINGS } from './constants.js';
import { findLeaf } from './cellTree.js';
import { getFaceNode } from './faceTree.js';
import { wallInteriors } from './interiors.js';
import { resolveWall } from './room.js';
import { runScene } from './runScene.js';
import { fittingLength, resolveBoxSlide, slideBoxWidth } from './slides.js';
import { isInsetStyle } from './styles.js';
import { roundTo } from './units.js';

const MAX_PRESETS = 200;
const sixtyFourths = (value) => Math.round(value * 64) / 64;

function heightSettings(settings) {
  return { ...DEFAULT_SETTINGS.drawerBoxHeights, ...settings?.drawerBoxHeights };
}

/**
 * Preset drawer box heights, ascending (INTERIORS-PLAN ID11, ProBox): `from`..`to`, then
 * `thenFrom`..`max`, every `step`. Nothing above `max`; a bad step falls back to the default.
 */
export function drawerBoxHeights(settings) {
  const { from, to, thenFrom, max, step: rawStep } = heightSettings(settings);
  const step = rawStep > 0 ? rawStep : DEFAULT_SETTINGS.drawerBoxHeights.step;
  const heights = new Set();
  for (const [start, end] of [[from, Math.min(to, max)], [thenFrom, max]]) {
    for (let i = 0; i < MAX_PRESETS && start + i * step <= end + 1e-9; i += 1) {
      const height = sixtyFourths(start + i * step);
      if (height > 0) heights.add(height);
    }
  }
  return [...heights].sort((a, b) => a - b);
}

/** A box taller than the shop normally builds (warning only; any height can be typed). */
export function isTallDrawerBox(height, settings) {
  return height > heightSettings(settings).warnAbove + 1e-9;
}

export function isPrefinishedMaple(material) {
  return typeof material === 'string' && /pre-?\s?finished\s+maple/i.test(material);
}

/** Size working drawer fronts from their containing clear sections, in wall coordinates. */
export function cabinetDrawerBoxes({
  faces, openings = [], reveals, inset, interior, leaf, settings, prefinishedMaple = false,
}) {
  const warnings = [];
  const entries = [];
  const presets = drawerBoxHeights(settings);
  const openingByPath = new Map(openings.map((opening) => [opening.path, opening]));
  const openingUses = new Map();
  for (const face of faces) {
    const path = face.opening ?? face.path;
    openingUses.set(path, (openingUses.get(path) ?? 0) + 1);
  }
  const fronts = faces.filter((face) => face.type === 'drawer_front')
    .sort((a, b) => (b.z + b.height) - (a.z + a.height) || a.x - b.x);
  for (const face of fronts) {
    const cx = face.x + face.width / 2;
    const cz = face.z + face.height / 2;
    const section = interior.sections.find((rect) => cx >= rect.x && cx <= rect.x + rect.width
      && cz >= rect.z && cz <= rect.z + rect.height);
    if (!section) {
      warnings.push({ code: 'drawer-outside-box', path: face.path });
      continue;
    }
    const openingPath = face.opening ?? face.path;
    const opening = inset && openingUses.get(openingPath) === 1 ? openingByPath.get(openingPath) : null;
    const grow = inset ? (reveals.fit ?? 0) : reveals.horizontal / 2;
    const bottom = Math.max(section.z, opening ? opening.z : face.z - grow);
    const top = Math.min(section.z + section.height,
      opening ? opening.z + opening.height : face.z + face.height + grow);
    const space = { x: section.x, z: bottom, width: section.width, height: Math.max(0, top - bottom) };
    const pick = getFaceNode(leaf.face, face.path)?.drawerBox ?? {};
    const resolved = resolveBoxSlide(settings, { box: pick.slideId ?? null, rule: null, cabinet: leaf.drawerSlideId ?? null });
    const { slide } = resolved;
    const available = space.height - slide.minBelow - slide.minAbove;
    const heightAuto = presets.findLast((height) => height <= available + 1e-9) ?? null;
    const height = pick.height ?? heightAuto;
    const depthAuto = fittingLength(slide, section.depth);
    const depth = pick.depth ?? depthAuto;
    const maple = prefinishedMaple && !inset;
    const box = {
      path: face.path, frontHeight: face.height,
      ...resolved, space, available,
      height, heightAuto, heightSource: pick.height === undefined ? 'auto' : 'manual',
      width: roundTo(slideBoxWidth(slide, space.width) + (maple ? 1 / 16 : 0), 1 / 64), maple,
      depth, depthAuto, interiorDepth: section.depth,
      x: space.x + slide.sideClearance - (maple ? 1 / 32 : 0), z: space.z + slide.minBelow,
    };
    if (height === null) box.warnings.push({ code: 'drawer-too-short' });
    if (depth === null) box.warnings.push({ code: 'no-slide-length' });
    if (pick.depth > section.depth + 1e-9) box.warnings.push({ code: 'drawer-too-deep' });
    entries.push({ box, section });
  }

  const groups = new Map();
  for (const { box } of entries) {
    const key = roundTo(box.frontHeight, 1 / 32);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(box);
  }
  for (const group of groups.values()) {
    const heights = group.map((box) => box.height).filter((height) => height !== null);
    const smallest = Math.min(...heights);
    const typed = new Set(group.filter((box) => box.heightSource === 'manual').map((box) => box.height));
    for (const box of group) {
      if (box.heightSource === 'auto' && box.height !== null && box.height > smallest) {
        box.height = smallest;
        box.heightSource = 'matched';
      }
      if (typed.size > 1) box.warnings.push({ code: 'drawer-heights-differ' });
    }
  }
  // Boxes sit as low in their space as the slide allows; one too tall for that drops lower (the front
  // overhangs more at the top), down to the box below it in the section, before it's called too tall.
  const bottomUp = entries.filter(({ box }) => box.height !== null).sort((a, b) => a.box.space.z - b.box.space.z);
  for (const { box, section } of bottomUp) {
    const below = bottomUp.filter(({ box: other, section: otherSection }) => other !== box && otherSection === section
      && other.space.z + other.space.height <= box.space.z + 1e-9);
    const floor = Math.max(section.z, ...below.map(({ box: other }) => other.z + other.height + other.slide.minAbove))
      + box.slide.minBelow;
    const ceiling = box.space.z + box.space.height - box.slide.minAbove;
    box.maxHeight = Math.max(0, ceiling - floor);
    box.z = Math.max(floor, Math.min(box.z, ceiling - box.height));
    if (box.z + box.height > ceiling + 1e-9) box.warnings.push({ code: 'drawer-height-too-tall' });
  }
  for (const { box, section } of entries) {
    if (entries.some((other) => other.box !== box && other.section === section
      && Math.min(box.space.z + box.space.height, other.box.space.z + other.box.space.height)
        > Math.max(box.space.z, other.box.space.z) + 1e-9)) {
      box.warnings.push({ code: 'drawers-share-section' });
    }
    if (box.height !== null && isTallDrawerBox(box.height, settings)) box.warnings.push({ code: 'drawer-box-tall' });
    warnings.push(...box.warnings.map((warning) => ({ ...warning, path: box.path })));
  }
  return { boxes: entries.map(({ box }) => box), warnings };
}

/** Resolve a whole wall face with shared interior and per-run face layout passes. */
export function wallDrawerBoxes(room, wall, side, settings) {
  const view = resolveWall(room, wall, side);
  const interiors = wallInteriors(room, wall, side, settings);
  const byRun = new Map();
  for (const interior of interiors) {
    if (!byRun.has(interior.runId)) byRun.set(interior.runId, []);
    byRun.get(interior.runId).push(interior);
  }
  const result = new Map();
  for (const run of view.runs) {
    if (!byRun.has(run.id)) continue;
    const { faceLayouts } = runScene(room, view, run, settings);
    for (const interior of byRun.get(run.id)) {
      const layout = faceLayouts.get(interior.itemId);
      if (!layout?.faces.some((face) => face.type === 'drawer_front')) continue;
      const leaf = findLeaf(run.grid, interior.itemId);
      const material = room.reportParts?.[interior.itemId]?.boxes ?? settings.report?.boxMaterial;
      result.set(interior.itemId, {
        runId: run.id,
        ...cabinetDrawerBoxes({
          faces: layout.faces, openings: layout.openings, reveals: layout.reveals.values,
          inset: isInsetStyle(layout.style), interior, leaf, settings,
          prefinishedMaple: isPrefinishedMaple(material),
        }),
      });
    }
  }
  return result;
}

export function cabinetDrawerBoxesFor(room, wall, side, settings, itemId) {
  return wallDrawerBoxes(room, wall, side, settings).get(itemId) ?? null;
}
