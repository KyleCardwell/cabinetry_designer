import { findLeaf } from './cellTree.js';
import { DEFAULT_SETTINGS } from './constants.js';
import { drawerBoxOptions, isTallDrawerBox, wallDrawerBoxes } from './drawerBoxes.js';
import { sinkDepth, slideNotch } from './drawerRules.js';
import { getInteriorNode } from './interiorTree.js';
import { wallInteriors } from './interiors.js';
import { resolveWall } from './room.js';
import { covers, shelfZone, sideHinged } from './shelves.js';
import { fittingLength, resolveBoxSlide, slideBoxWidth } from './slides.js';
import { spacedStack } from './spacedStack.js';

const EPSILON = 1e-9;

export function pairSeam(faces) {
  for (const left of faces) {
    if (left.type !== 'pair_door' || left.half !== 'left') continue;
    const right = faces.find((face) => face.type === 'pair_door' && face.path === left.path && face.half === 'right');
    if (right) return (left.x + left.width + right.x) / 2;
  }
  return null;
}

function columnSpacers(column, faces, spacer) {
  const sides = new Set();
  let unknown = false;
  for (const face of faces.filter(sideHinged)) {
    const hinge = face.type === 'pair_door' ? face.half : face.hinge;
    if (!hinge) {
      unknown = true;
      sides.add('left');
      sides.add('right');
      continue;
    }
    const edge = face.x + (hinge === 'right' ? face.width : 0);
    const left = Math.abs(edge - column.x);
    const right = Math.abs(edge - column.x - column.width);
    if (Math.min(left, right) <= 2 + EPSILON) sides.add(left <= right ? 'left' : 'right');
  }
  return { spacers: { left: sides.has('left') ? spacer : 0, right: sides.has('right') ? spacer : 0 }, unknown };
}

/** Space each run of auto boxes between the zone boundaries and typed box positions. */
function placeStack(rollouts, zone, section, pick, warnings) {
  let gap = null;
  for (let start = 0; start < rollouts.length;) {
    if (rollouts[start].zSource === 'manual') {
      start += 1;
      continue;
    }
    let end = start;
    while (end < rollouts.length && rollouts[end].zSource === 'auto') end += 1;
    const below = start > 0 ? rollouts[start - 1] : null;
    const floor = below ? below.z + below.height : zone.z + rollouts[start].slide.minBelow;
    const ceiling = end < rollouts.length ? rollouts[end].z : zone.z + zone.height;
    const bottom = below ? null : pick.bottom === undefined ? floor : section.z + pick.bottom;
    const top = end === rollouts.length && pick.top !== undefined
      ? section.z + section.height - pick.top : null;
    const stack = spacedStack({ floor, ceiling, bottom, top,
      heights: rollouts.slice(start, end).map((rollout) => rollout.height) });
    warnings.push(...stack.warnings);
    gap = stack.gap;
    stack.positions.forEach((z, index) => { rollouts[start + index].z = z; });
    start = end;
  }
  return gap;
}

/** Resolve only sections with explicit roll-outs, using placed wall coordinates throughout. */
export function sectionRollouts({ interior, faces, boxes = [], leaf, settings, inset = false, prefinishedMaple = false }) {
  const result = new Map();
  const setting = (key) => settings?.[key] ?? DEFAULT_SETTINGS[key];
  for (const section of interior.sections) {
    const pick = getInteriorNode(interior.tree, section.path)?.rollouts;
    if (!pick) continue;
    const zone = shelfZone(section, boxes);
    const covering = faces.filter((face) => covers(face, section));
    const warnings = [];
    const rollouts = Array.from({ length: pick.count }, (_, index) => {
      const item = pick.items?.[index] ?? {};
      const column = { x: section.x, width: section.width };
      const resolved = resolveBoxSlide(settings, { box: item.slideId ?? null, cabinet: leaf.drawerSlideId ?? null });
      const { slide } = resolved;
      const { spacers, unknown } = columnSpacers(column, covering, setting('rolloutSpacer'));
      const mapleExtra = setting('prefinishedMapleExtra');
      const maple = prefinishedMaple && !inset && mapleExtra > 0;
      const standard = fittingLength(slide, section.depth - slide.backClearance);
      const sink = leaf.purpose === 'sink';
      const depthAuto = sink ? sinkDepth(slide, standard) : standard;
      const depth = item.depth ?? depthAuto;
      const slideLength = depth === null ? null : fittingLength(slide, depth);
      const notch = slideNotch(slide, slideLength, section.depth);
      const height = item.height ?? setting('rolloutHeight');
      const width = slideBoxWidth(slide, column.width - spacers.left - spacers.right) + (maple ? mapleExtra : 0);
      const rollout = {
        index, ...resolved, height, heightSource: item.height === undefined ? 'auto' : 'manual',
        width, depth, depthAuto, depthSource: item.depth !== undefined ? 'manual' : sink ? 'rule' : 'auto',
        depthRule: item.depth === undefined && sink ? 'DRW-006' : null,
        slideLength, notch, interiorDepth: section.depth,
        spacers, maple, mapleExtra: maple ? mapleExtra : 0, clips: slide.clips === false ? null : 'standard',
        x: column.x + spacers.left + slide.sideClearance - (maple ? mapleExtra / 2 : 0),
        z: item.at === undefined ? zone.z + slide.minBelow : section.z + item.at,
        zSource: item.at === undefined ? 'auto' : 'manual', column,
      };
      if (unknown) rollout.warnings.push({ code: 'rollout-hinge-unknown' });
      if (depth === null || rollout.slideLength === null) rollout.warnings.push({ code: 'no-slide-length' });
      if (depth !== null && depth > section.depth + EPSILON) rollout.warnings.push({ code: 'rollout-too-deep' });
      if (notch !== null) rollout.warnings.push({ code: 'slide-notch', notch, backClearance: slide.backClearance });
      if (width <= 0) rollout.warnings.push({ code: 'rollout-too-narrow' });
      if (isTallDrawerBox(height, settings)) rollout.warnings.push({ code: 'drawer-box-tall' });
      return rollout;
    });
    const gap = placeStack(rollouts, zone, section, pick, warnings);
    const lowest = rollouts.reduce((lowest, rollout) => rollout.z < lowest.z ? rollout : lowest);
    for (const rollout of rollouts) {
      rollout.at = rollout.z - section.z;
      rollout.space = { z: rollout.z - rollout.slide.minBelow,
        height: rollout.slide.minBelow + rollout.height + rollout.slide.minAbove };
    }
    for (const rollout of rollouts) {
      const { space } = rollout;
      if (space.z < zone.z - EPSILON || space.z + space.height > zone.z + zone.height + EPSILON) {
        rollout.warnings.push({ code: 'rollout-outside' });
      }
      const bottomMounted = rollout === lowest && section.edges?.bottom !== 'zone'
        && Math.abs(rollout.z - zone.z - rollout.slide.minBelow) <= EPSILON;
      if ((section.edges?.left === 'zone' || section.edges?.right === 'zone') && !bottomMounted) {
        rollout.warnings.push({ code: 'rollout-no-side' });
      }
      if (rollouts.some((other) => other !== rollout
        && Math.min(space.z + space.height, other.space.z + other.space.height)
          > Math.max(space.z, other.space.z) + EPSILON)) {
        rollout.warnings.push({ code: 'rollouts-overlap' });
      }
      warnings.push(...rollout.warnings.map((warning) => ({ ...warning, index: rollout.index })));
    }
    result.set(section.path, {
      zone, gap,
      top: Math.max(...rollouts.map(({ space }) => space.z + space.height)), rollouts, warnings,
    });
  }
  return result;
}

/** One interiors pass and one drawer-box pass; shelves may supply those same shared results. */
export function wallRollouts(room, wall, side, settings, shared = {}) {
  const faceLayoutsByRun = shared.faceLayoutsByRun ?? new Map();
  const interiors = shared.interiors ?? wallInteriors(room, wall, side, settings, faceLayoutsByRun);
  const boxes = shared.boxes ?? wallDrawerBoxes(room, wall, side, settings, { interiors, faceLayoutsByRun });
  const runs = new Map(resolveWall(room, wall, side).runs.map((run) => [run.id, run]));
  return new Map(interiors.map((interior) => {
    const layout = faceLayoutsByRun.get(interior.runId).get(interior.itemId);
    return [interior.itemId, sectionRollouts({
      interior, faces: layout.faces, boxes: boxes.get(interior.itemId)?.boxes ?? [],
      leaf: findLeaf(runs.get(interior.runId).grid, interior.itemId), settings,
      ...drawerBoxOptions(room, interior.itemId, layout, settings),
    })];
  }));
}

/** Spacer sides drawn once per column and width, shared by both interior views. */
export function rolloutSpacerSides(rollout, box) {
  return ['left', 'right'].filter((side) => box.spacers[side] > 0
    && !rollout.rollouts.slice(0, box.index).some((other) =>
      other.column.x === box.column.x && other.column.width === box.column.width
      && other.spacers[side] === box.spacers[side]));
}
