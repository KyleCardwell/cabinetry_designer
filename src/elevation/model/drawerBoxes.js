import { boxAccessoryEffects, findEffect } from './accessoryEffects.js';
import { DEFAULT_SETTINGS } from './constants.js';
import { findLeaf } from './cellTree.js';
import { getFaceNode } from './faceTree.js';
import { DRAWER_RULES, rotDepth, ruleDepth, ruleHeight, ruleSlide, slideNotch } from './drawerRules.js';
import { wallInteriors } from './interiors.js';
import { resolveWall } from './room.js';
import { fittingLength, resolveBoxSlide, slideBoxWidth } from './slides.js';
import { isInsetStyle } from './styles.js';
import { roundTo } from './units.js';

const MAX_PRESETS = 200;
const sixtyFourths = (value) => Math.round(value * 64) / 64;

function boxKind(face, purpose) {
  if (face.type === 'drawer_front') return 'drawer';
  if (face.type !== 'door' || face.action !== 'pullout') return null;
  return purpose === 'trash' ? 'rot' : purpose === 'hamper' ? 'hamper' : null;
}

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

/** Shared style and material inputs for drawer boxes and section roll-outs. */
export function drawerBoxOptions(room, itemId, layout, settings) {
  const material = room.reportParts?.[itemId]?.boxes ?? settings.report?.boxMaterial;
  return { inset: isInsetStyle(layout.style), prefinishedMaple: isPrefinishedMaple(material) };
}

/** Sink wins ties, then accessory limits in stored item order; an unsized limit is smallest. */
function limitedDepth(ruleInput, slide, interiorDepth, effects) {
  const usableDepth = interiorDepth - slide.backClearance;
  const standard = fittingLength(slide, usableDepth);
  const sink = ruleDepth({ ...ruleInput, slide, usableDepth });
  let result = sink ? { ...sink, accessoryId: null } : null;
  for (const limit of effects.depthLimits) {
    const depth = fittingLength(slide, limit.kind === 'clear_behind'
      ? interiorDepth - Math.max(limit.inches, slide.backClearance) : Math.min(standard ?? 0, limit.inches));
    if (!result || (result.depth !== null && (depth === null || depth < result.depth))) {
      result = { depth, rule: null, accessoryId: limit.accessoryId };
    }
  }
  return result ?? { depth: standard, rule: null, accessoryId: null };
}

/** Size drawer fronts and qualifying pull-out doors from their clear sections, in wall coordinates. */
export function cabinetDrawerBoxes({
  faces, openings = [], reveals, inset, interior, leaf, settings, prefinishedMaple = false,
}) {
  const warnings = [];
  const notes = [];
  const entries = [];
  const presets = drawerBoxHeights(settings);
  const adjustment = Math.max(0, settings.drawerBoxAdjustment ?? DEFAULT_SETTINGS.drawerBoxAdjustment);
  const openingByPath = new Map(openings.map((opening) => [opening.path, opening]));
  const openingUses = new Map();
  for (const face of faces) {
    const path = face.opening ?? face.path;
    openingUses.set(path, (openingUses.get(path) ?? 0) + 1);
  }
  const fronts = faces.filter((face) => boxKind(face, leaf.purpose))
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
    const kind = boxKind(face, leaf.purpose);
    const effects = boxAccessoryEffects(kind === 'drawer' ? pick.accessories : [], settings.accessories);
    const accessorySlide = effects.slide?.slideId ?? null;
    const ruleInput = { kind, purpose: leaf.purpose, front: face };
    const cabinet = leaf.drawerSlideId ?? null;
    const inherited = resolveBoxSlide(settings, { cabinet });
    const inheritedDepth = limitedDepth(ruleInput, inherited.slide, section.depth, effects);
    const accessoryResolved = resolveBoxSlide(settings, { accessory: accessorySlide, cabinet });
    const slideRule = pick.slideId == null && accessoryResolved.source !== 'accessory' ? ruleSlide({ ...ruleInput, inheritedSlide: inherited.slide,
      depth: pick.depth ?? inheritedDepth.depth,
    }) : null;
    const resolved = resolveBoxSlide(settings, { box: pick.slideId ?? null, accessory: accessorySlide, rule: slideRule?.slideId ?? null, cabinet });
    const { slide } = resolved;
    const available = space.height - slide.minBelow - slide.minAbove;
    const heightAuto = presets.findLast((height) => height <= available + 1e-9) ?? null;
    const heightRule = kind === 'rot' ? { height: available >= 15.125 ? 15.125 : heightAuto, rule: 'DRW-009' }
      : kind === 'hamper' ? { height: 6.25, rule: 'DRW-010' } : ruleHeight(ruleInput);
    const height = pick.height ?? heightRule?.height ?? heightAuto;
    const rot = kind === 'rot' ? rotDepth(interior.box.width, interior.box.depth) : null;
    const depthRule = rot ? { depth: rot.depth, rule: 'DRW-009', accessoryId: null }
      : limitedDepth(ruleInput, slide, section.depth, effects);
    const depthAuto = depthRule.depth;
    const depth = pick.depth ?? depthAuto;
    const slideLength = depth === null ? null : fittingLength(slide, depth);
    const notch = slideNotch(slide, slideLength, section.depth);
    const maple = prefinishedMaple && !inset;
    const box = {
      path: face.path, frontHeight: face.height, kind,
      ...resolved, space, available,
      slideRule: resolved.source === 'rule' ? slideRule.rule : null,
      slideAccessory: resolved.source === 'accessory' ? effects.slide.accessoryId : null,
      accessories: effects.items, heightAccessory: null,
      height, heightAuto, heightSource: pick.height !== undefined ? 'manual' : heightRule ? 'rule' : 'auto',
      heightRule: pick.height === undefined ? heightRule?.rule ?? null : null,
      width: roundTo(slideBoxWidth(slide, space.width) + (maple ? 1 / 16 : 0), 1 / 64), maple,
      depth, depthAuto, interiorDepth: section.depth,
      depthSource: pick.depth !== undefined ? 'manual' : depthRule.accessoryId ? 'accessory' : depthRule.rule ? 'rule' : 'auto',
      depthAccessory: pick.depth === undefined ? depthRule.accessoryId : null,
      depthRule: pick.depth === undefined ? depthRule?.rule ?? null : null,
      slideLength, notch,
      clips: slide.clips === false ? null : inset ? 'adjustable' : 'standard',
      notes: kind === 'drawer' && leaf.purpose === 'sink' ? ['notch drw around plumbing']
        : pick.depth === undefined && rot?.note ? [rot.note] : [],
      x: space.x + slide.sideClearance - (maple ? 1 / 32 : 0),
      z: kind === 'hamper' && height !== null ? top - slide.minAbove - height : space.z + slide.minBelow,
    };
    if (kind === 'rot' && pick.height === undefined && available < 15.125) box.warnings.push({ code: 'rot-short' });
    if (kind === 'rot' && pick.depth === undefined && !rot) box.warnings.push({ code: 'rot-size-unlisted' });
    if (height === null) box.warnings.push({ code: 'drawer-too-short' });
    if (depth === null) box.warnings.push({ code: 'no-slide-length' });
    if (depth !== null && depth > section.depth + 1e-9) box.warnings.push({ code: 'drawer-too-deep' });
    if (notch !== null) box.warnings.push({ code: 'slide-notch', notch, backClearance: slide.backClearance });
    entries.push({ box, section, effects, pick });
  }
  if (leaf.purpose === 'sink' && entries.some(({ box }) => box.kind === 'drawer')) {
    notes.push({ rule: 'DRW-006', text: 'notch drw around plumbing' });
  }
  if (fronts.some((face) => face.type === 'drawer_front' && face.width > DRAWER_RULES.stabilizerFrontWidth)) {
    notes.push({ rule: 'BOX-007', text: 'drawer stabilizers' });
  }

  const groups = new Map();
  for (const { box } of entries) {
    if (box.kind !== 'drawer') continue;
    const key = roundTo(box.frontHeight, 1 / 32);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(box);
  }
  // IN5's normal matching establishes the inherited height before accessory limits apply.
  for (const group of groups.values()) {
    const smallest = Math.min(...group.map((box) => box.height).filter((height) => height !== null));
    for (const box of group) {
      if (box.heightSource === 'auto' && box.height !== null && box.height > smallest) {
        box.height = smallest;
        box.heightSource = 'matched';
      }
    }
  }
  for (const { box, effects, pick } of entries) {
    if (pick.height !== undefined) continue;
    const fixed = effects.fixedHeight;
    const max = effects.maxHeight;
    if (fixed || (max && box.height !== null && max.inches < box.height)) {
      box.height = fixed ? fixed.inches
        : presets.findLast((height) => height <= Math.min(box.available, max.inches) + 1e-9) ?? null;
      box.heightSource = 'accessory';
      box.heightRule = null;
      box.heightAccessory = (fixed ?? max).accessoryId;
      if (box.height === null && !box.warnings.some(({ code }) => code === 'drawer-too-short')) {
        box.warnings.push({ code: 'drawer-too-short' });
      }
      if (box.height !== null) box.warnings = box.warnings.filter(({ code }) => code !== 'drawer-too-short');
    }
  }
  for (const group of groups.values()) {
    const matching = group.filter((box) => box.heightSource !== 'accessory');
    if (matching.length !== group.length) {
      for (const box of matching) if (box.heightSource === 'matched') box.heightSource = 'auto';
    }
    const smallest = Math.min(...matching.map((box) => box.height).filter((height) => height !== null));
    const typed = new Set(matching.filter((box) => ['manual', 'rule'].includes(box.heightSource)).map((box) => box.height));
    for (const box of matching) {
      if (box.heightSource === 'auto' && box.height !== null && box.height > smallest) {
        box.height = smallest;
        box.heightSource = 'matched';
      }
      if (typed.size > 1) box.warnings.push({ code: 'drawer-heights-differ' });
    }
  }
  // Drawers and ROTs sit low; hampers start at the top. A box too tall for its space drops lower (the front
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
    // A box a little too tall still fits on the slide's vertical adjustment (IN7.1); auto heights never count on it.
    const over = box.z + box.height - ceiling;
    box.adjustment = over > 1e-9 && over <= adjustment + 1e-9 ? over : 0;
    if (over > adjustment + 1e-9) box.warnings.push({ code: 'drawer-height-too-tall' });
  }
  for (const { box, section, effects, pick } of entries) {
    for (const item of box.accessories) {
      const { accessory } = item;
      if (accessory?.attachesTo === 'drawer_box') {
        const slide = findEffect(accessory, 'slide');
        if (slide && (slide.slideId !== effects.slide.slideId
          || (box.source === 'box' && slide.slideId !== box.slideId))) {
          item.warnings.push({ code: 'accessory-slide', name: accessory.name, slideId: slide.slideId });
        }
        for (const effect of accessory.effects) {
          if (pick.height !== undefined && box.height !== null
            && ((effect.kind === 'fixed_height' && Math.abs(box.height - effect.inches) > 1e-9)
              || (effect.kind === 'max_height' && box.height > effect.inches + 1e-9))) {
            item.warnings.push({ code: 'accessory-height', name: accessory.name,
              limit: effect.kind === 'fixed_height' ? 'fixed' : 'max', inches: effect.inches });
          }
          const has = effect.kind === 'clear_behind' ? section.depth - box.depth : box.depth;
          if (pick.depth !== undefined && box.depth !== null
            && ((effect.kind === 'clear_behind' && has + 1e-9 < effect.inches)
              || (effect.kind === 'max_depth' && has > effect.inches + 1e-9))) {
            item.warnings.push({ code: 'accessory-depth', name: accessory.name,
              limit: effect.kind, inches: effect.inches, has });
          }
        }
        const sizes = ['width', 'depth', 'height'].filter((dim) => accessory.minOpening?.[dim] != null
          && box[dim] !== null && accessory.minOpening[dim] > box[dim] + 1e-9)
          .map((dim) => ({ dim, needs: accessory.minOpening[dim], has: box[dim] }));
        if (sizes.length) item.warnings.push({ code: 'accessory-too-small', name: accessory.name, sizes });
      }
      box.warnings.push(...item.warnings.map((warning) => ({ ...warning, index: item.index })));
    }
    box.notes = [...new Set([...box.notes, ...effects.notes])];
    if (box.kind === 'hamper') {
      box.clearBelow = box.z - section.z;
      if (box.clearBelow < 11) box.warnings.push({ code: 'hamper-clear-below' });
      if (!((box.width >= 15 && box.depth >= 22) || (box.width >= 22 && box.depth >= 15))) {
        box.warnings.push({ code: 'hamper-too-small' });
      }
    }
    if (entries.some((other) => other.box !== box && other.section === section
      && Math.min(box.space.z + box.space.height, other.box.space.z + other.box.space.height)
        > Math.max(box.space.z, other.box.space.z) + 1e-9)) {
      box.warnings.push({ code: 'drawers-share-section' });
    }
    if (box.height !== null && isTallDrawerBox(box.height, settings)) box.warnings.push({ code: 'drawer-box-tall' });
    warnings.push(...box.warnings.map((warning) => ({ ...warning, path: box.path })));
  }
  return { boxes: entries.map(({ box }) => box), warnings, notes };
}

/** Resolve a whole wall face with shared interior and per-run face layout passes. */
export function wallDrawerBoxes(room, wall, side, settings, shared = {}) {
  const view = resolveWall(room, wall, side);
  const faceLayoutsByRun = shared.faceLayoutsByRun ?? new Map();
  const interiors = shared.interiors ?? wallInteriors(room, wall, side, settings, faceLayoutsByRun);
  const byRun = new Map();
  for (const interior of interiors) {
    if (!byRun.has(interior.runId)) byRun.set(interior.runId, []);
    byRun.get(interior.runId).push(interior);
  }
  const result = new Map();
  for (const run of view.runs) {
    if (!byRun.has(run.id)) continue;
    const faceLayouts = faceLayoutsByRun.get(run.id);
    for (const interior of byRun.get(run.id)) {
      const layout = faceLayouts.get(interior.itemId);
      const leaf = findLeaf(run.grid, interior.itemId);
      if (!layout?.faces.some((face) => boxKind(face, leaf.purpose))) continue;
      result.set(interior.itemId, {
        runId: run.id,
        ...cabinetDrawerBoxes({
          faces: layout.faces, openings: layout.openings, reveals: layout.reveals.values,
          interior, leaf, settings, ...drawerBoxOptions(room, interior.itemId, layout, settings),
        }),
      });
    }
  }
  return result;
}

export function cabinetDrawerBoxesFor(room, wall, side, settings, itemId) {
  return wallDrawerBoxes(room, wall, side, settings).get(itemId) ?? null;
}
