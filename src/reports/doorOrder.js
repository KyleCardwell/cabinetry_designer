import { findLeaf } from '../elevation/model/cellTree.js';
import { runDoorDetails } from '../elevation/model/doorDetails.js';
import { partSizes } from '../elevation/model/doorSizes.js';
import { panelLevels, resolveDoorStyle } from '../elevation/model/doorStyleResolve.js';
import { elevationParts } from '../elevation/model/elevationParts.js';
import { isJoinedEnd, isSheetCell } from '../elevation/model/panelThickness.js';
import { partNumbers, wallEndPanelPartKey } from '../elevation/model/partNumbers.js';
import { resolveWall } from '../elevation/model/room.js';
import { wallEndPanels } from '../elevation/model/wallEndPanels.js';
import { WALL_SIDES } from '../elevation/model/wallSides.js';
import { formatInch, formatSize } from './format.js';

const EPSILON = 1e-6;
const SECTIONS = [['drawer_fronts', 'Drawer Fronts'], ['doors', 'Doors'], ['slab', 'Slab']];
const same = (a, b) => Math.abs(a - b) <= EPSILON;

/** Exceptions to the style's frame widths, followed by the part's stored mid members. */
export function stileRailNotes(style, result, notes = result.notes ?? {}) {
  if (result.construction === 'slab' || !result.rails) return [];
  const output = [];
  for (const [group, first, second, a, b] of [
    ['rails', 'top', 'bottom', 'TR', 'BR'], ['stiles', 'left', 'right', 'LS', 'RS'],
  ]) {
    const changed = (side) => !same(result[group][side], style[group][side]);
    if (changed(first) && changed(second) && same(result[group][first], result[group][second])) {
      output.push(`${formatInch(result[group][first])} ${a} & ${b}`);
    } else {
      for (const [side, label] of [[first, a], [second, b]]) {
        if (changed(side)) output.push(`${formatInch(result[group][side])} ${label}${notes[side] ? ` (${notes[side]})` : ''}`);
      }
    }
  }
  for (const { at, width } of result.midRails ?? []) output.push(`${formatInch(width)} MR up ${formatInch(at)} oc`);
  for (const { at, width } of result.midStiles ?? []) output.push(`${formatInch(width)} MS ${formatInch(at)} oc from left`);
  return output;
}

const numberOrder = (number) => typeof number === 'number' ? number : Infinity;

/** Merge only identically numbered, sized (to 1/32), and annotated parts. */
export function mergeLines(items) {
  const lines = new Map();
  for (const { number, width, height, notes = '', qty = 1 } of items) {
    const w = Math.round(width * 32) / 32;
    const h = Math.round(height * 32) / 32;
    const key = JSON.stringify([number, w, h, notes]);
    if (lines.has(key)) lines.get(key).qty += qty;
    else lines.set(key, { number, qty, width: w, height: h, size: formatSize(w, h), notes });
  }
  return [...lines.values()].sort((a, b) =>
    numberOrder(a.number) - numberOrder(b.number) || b.height - a.height || b.width - a.width);
}

function styleNotes(style, design) {
  if (design.construction !== 'five_piece') return null;
  const { left, right } = style.stiles;
  const { top, bottom } = style.rails;
  if ([right, top, bottom].every((width) => same(left, width))) return `${formatInch(left)} Stiles & Rails`;
  const stiles = same(left, right) ? `${formatInch(left)} Stiles`
    : `${formatInch(left)} LS, ${formatInch(right)} RS`;
  const rails = same(top, bottom) ? `${formatInch(top)} Rails`
    : `${formatInch(top)} TR, ${formatInch(bottom)} BR`;
  return `${stiles}, ${rails}`;
}

function pageHeader(style, design, settings, warnings) {
  function profileName(id, fallback, slot) {
    if (!id) return fallback;
    const profile = (settings.sectionProfiles ?? []).find((entry) => entry.id === id);
    if (profile) return profile.name.toUpperCase();
    warnings.push({ code: 'report-profile-missing', styleId: style.id, id, slot });
    return 'MISSING PROFILE';
  }
  const fivePiece = design.construction === 'five_piece';
  const description = design.description?.toUpperCase();
  return {
    style: !description || description === design.code.toUpperCase() ? design.code : `${description} - ${design.code}`,
    wood: style.material || null,
    vendor: design.vendor?.toUpperCase() || null,
    thickness: formatInch(style.thickness),
    edgeProfile: profileName(style.profiles.outside, 'SQUARE', 'outside'),
    insideProfile: fivePiece ? profileName(style.profiles.inside, 'SQUARE', 'inside') : null,
    panelProfile: fivePiece ? profileName(style.profiles.panel, style.panel.type.toUpperCase(), 'panel') : null,
    appliedMoldings: (style.appliedMoldings ?? []).map(({ profileId }) => profileName(profileId, null, 'applied'))
      .filter(Boolean).join(', ') || null,
    notes: [styleNotes(style, design), settings.report?.doorFormNote].filter(Boolean).join(' - ') || null,
  };
}

/** Installed door order data, using the same dimensions and resolved sizes as the drawings. */
export function doorOrder(room, settings) {
  const { byKey } = partNumbers(room, settings);
  const pages = new Map();
  const warnings = [];

  function add(part, panel = false) {
    const { style, design, sizes, pieceId, width, height, faceType } = part;
    if (style.id === 'sheet') return;
    let number = byKey.get(pieceId);
    if (number === undefined) {
      number = '?';
      warnings.push({ code: 'report-part-unnumbered', pieceId, key: part.key });
    }
    if (!pages.has(style.id)) pages.set(style.id, {
      styleId: style.id, header: pageHeader(style, design, settings, warnings), items: new Map(),
    });
    const page = pages.get(style.id);
    const section = sizes.construction === 'slab' && sizes.slab === 'rule' ? 'slab'
      : ['drawer_front', 'false_front'].includes(faceType) ? 'drawer_fronts' : 'doors';
    const notes = [
      ...(panel ? ['do not sand edges'] : []),
      ...(faceType === 'false_front' ? ['false front'] : []),
      ...stileRailNotes(style, sizes),
    ].join(' - ');
    if (!page.items.has(section)) page.items.set(section, []);
    page.items.get(section).push({ number, width, height, notes });
  }

  function addPanel(wall, run, stored, rect, pieceId, sheet = false) {
    const resolved = resolveDoorStyle(room, settings, 'panel', panelLevels(room, wall, run, stored, { sheet }));
    if (resolved.style.id === 'sheet') return;
    add({ ...resolved, ...rect, pieceId, sizes: partSizes(resolved.style, resolved.design, {
      width: rect.width, height: rect.height, sizes: stored?.sizes,
    }) }, true);
  }

  for (const wall of room?.walls ?? []) {
    for (const side of WALL_SIDES) {
      const view = resolveWall(room, wall, side);
      const parts = elevationParts(room, wall, side, settings);
      for (const run of view.runs) {
        const details = runDoorDetails(room, view, run, settings).parts;
        for (const part of details) {
          if (part.kind === 'panelCell') {
            const leaf = findLeaf(run.grid, part.pieceId);
            const resolved = resolveDoorStyle(room, settings, 'panel',
              panelLevels(room, view, run, leaf, { sheet: isSheetCell(leaf) }));
            if (resolved.style.id === 'sheet') continue;
          }
          add(part, part.kind !== 'face');
        }
        const reported = new Set(details.map(({ pieceId }) => pieceId));
        for (const part of parts.filter((entry) => entry.runId === run.id)) {
          if (reported.has(part.id)) continue;
          const end = ['left', 'right'].find((edge) => part.id === `${run.id}:${edge}`);
          if (part.kind === 'end_panel' && end) {
            addPanel(view, run, run.ends?.[end], { width: part.front - part.back, height: part.height },
              part.id, isJoinedEnd(run, end));
          } else if (part.kind === 'panel') {
            const leaf = findLeaf(run.grid, part.id);
            addPanel(view, run, leaf, part, part.id, isSheetCell(leaf));
          }
        }
      }
    }
    for (const panel of wallEndPanels(room, wall, settings)) {
      addPanel(wall, null, wall.endPanels[panel.endpoint], { width: panel.width, height: panel.top },
        wallEndPanelPartKey(wall.id, panel.endpoint));
    }
  }

  const result = [...pages.values()].map(({ items, ...page }) => ({
    ...page,
    sections: SECTIONS.filter(([id]) => items.has(id)).map(([id, title]) => ({
      id, title, lines: mergeLines(items.get(id)),
    })),
  }));
  const firstNumber = (page) => Math.min(...page.sections.flatMap(({ lines }) => lines.map(({ number }) => numberOrder(number))));
  result.sort((a, b) => firstNumber(a) - firstNumber(b));
  return { pages: result, warnings };
}
