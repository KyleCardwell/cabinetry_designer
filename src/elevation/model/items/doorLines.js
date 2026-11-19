import { activeBuildCache, withBuildCache } from '../buildCache.js';
import { panelOrientation } from '../cells.js';
import { findLeaf } from '../cellTree.js';
import { panelMaterial } from '../constants.js';
import { cornerEnd } from '../cornerEnd.js';
import { cornerLegBDetails } from '../cornerLegs.js';
import { runDoorDetails } from '../doorDetails.js';
import { midDefaults, partSizes } from '../doorSizes.js';
import { doorProfileOffsets } from '../doorProfileLines.js';
import { panelLevels, resolveDoorStyle } from '../doorStyleResolve.js';
import { elevationParts } from '../elevationParts.js';
import { endPanelSheet, isSheetCell } from '../panelThickness.js';
import { wallEndPanelPartKey } from '../partNumbers.js';
import { resolveWall } from '../room.js';
import { runScene } from '../runScene.js';
import { wallEndPanels } from '../wallEndPanels.js';
import { WALL_SIDES } from '../wallSides.js';
import { formatInch } from './format.js';

const EPSILON = 1e-6;
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
  const moldingNote = (overall) => overall == null ? '' : ` (${formatInch(overall)} w/ molding)`;
  const endsNote = ({ full, from, to }) => full === false ? `, ${from} to ${to}` : '';
  for (const mid of result.midRails ?? []) {
    const { at, width, overall } = mid;
    output.push(`${formatInch(width)} MR up ${formatInch(at)} oc${endsNote(mid)}${moldingNote(overall)}`);
  }
  for (const mid of result.midStiles ?? []) {
    const { at, width, overall } = mid;
    output.push(`${formatInch(width)} MS ${formatInch(at)} oc from left${endsNote(mid)}${moldingNote(overall)}`);
  }
  return output;
}

/** Unmerged vendor parts, keyed to their owning shipping part, with ordered note lines. */
export function doorLines(room, settings) {
  return withBuildCache(() => activeBuildCache.byRoom('doorLines', room, settings, () => {
    const items = [];
    const warnings = [];

    function add(part, panel = false) {
      const { style, design, sizes, pieceId, kind, width, height, faceType } = part;
      const key = pieceId;
      if (style.id === 'sheet' || room.reportParts?.[key]?.shopBuilt) return;
      const type = sizes.construction === 'slab' && sizes.slab === 'rule' ? 'slab'
        : ['drawer_front', 'false_front'].includes(faceType) ? 'drawer_fronts' : 'doors';
      const notes = [
        ...(panel ? ['do not sand edges'] : []),
        ...(faceType === 'false_front' ? ['false front'] : []),
        ...(part.panelMaterial ? [panelMaterial(part.panelMaterial).orderText] : []),
        ...stileRailNotes(style, sizes),
      ];
      // Retain the drawing key for the existing unnumbered-part diagnostic.
      items.push({ key, pieceId, kind, style, design, sizes, width, height, faceType, type, notes, sourceKey: part.key });
    }

    function addPanel(wall, run, stored, rect, pieceId, kind, sheet = false) {
      const resolved = resolveDoorStyle(room, settings, 'panel', panelLevels(room, wall, run, stored, { sheet }));
      if (resolved.style.id === 'sheet') return;
      const mid = midDefaults(resolved.style, resolved.design,
        doorProfileOffsets(resolved.style, resolved.design, settings.sectionProfiles));
      add({ ...resolved, ...rect, pieceId, kind, sizes: partSizes(resolved.style, resolved.design, {
        width: rect.width, height: rect.height, sizes: stored?.sizes,
      }, mid) }, true);
    }

    for (const wall of room?.walls ?? []) {
      for (const side of WALL_SIDES) {
        const view = resolveWall(room, wall, side);
        const parts = elevationParts(room, wall, side, settings);
        for (const run of view.runs) {
          const scene = runScene(room, view, run, settings);
          const details = runDoorDetails(room, view, run, settings, scene).parts;
          for (const part of details) {
            if (part.kind === 'panelCell') {
              const leaf = findLeaf(run.grid, part.pieceId);
              const resolved = resolveDoorStyle(room, settings, 'panel',
                panelLevels(room, view, run, leaf, { sheet: isSheetCell(leaf) }));
              if (resolved.style.id === 'sheet') continue;
            }
            add(part, part.kind !== 'face');
          }
          for (const [columnId, entry] of scene.faceLayouts) {
            if (entry.corner) {
              const corner = cornerEnd(room, view, run, entry.corner.side, settings, scene.result);
              if (corner.active && corner.returnSide.type === 'end_panel') {
                addPanel(view, run, run.ends[corner.side], { width: corner.depthB, height: run.height },
                  `${columnId}:return`, 'endPanel');
              }
            }
            if (entry.corner?.kind !== 90 || !entry.cornerReturn?.legB) continue;
            const { doorDetails } = cornerLegBDetails(room, view, run, settings, columnId, entry);
            for (const part of doorDetails.parts) {
              if (part.kind === 'face') add(part);
            }
          }
          const reported = new Set(details.map(({ pieceId }) => pieceId));
          for (const part of parts.filter((entry) => entry.runId === run.id)) {
            if (reported.has(part.id)) continue;
            const piece = scene.cells.pieces.find(({ id }) => id === part.id);
            const end = piece?.inside ? piece.side
              : ['left', 'right'].find((edge) => part.id === `${run.id}:${edge}`);
            if (part.kind === 'end_panel' && end) {
              addPanel(view, run, piece?.inside ? piece : run.ends?.[end],
                { width: part.front - part.back, height: part.height },
                part.id, 'endPanel', !piece?.inside && endPanelSheet(room, view, run, end, settings));
            } else if (part.kind === 'panel') {
              const leaf = findLeaf(run.grid, part.id);
              const orientation = panelOrientation({ ...part, depth: part.front - part.back });
              const rect = orientation === 'side' ? { width: part.front - part.back, height: part.height }
                : orientation === 'top' ? { width: part.width, height: part.front - part.back } : part;
              addPanel(view, run, leaf, rect, part.id, 'panelCell', isSheetCell(leaf));
            }
          }
        }
      }
      for (const panel of wallEndPanels(room, wall, settings)) {
        addPanel(wall, null, wall.endPanels[panel.endpoint], { width: panel.width, height: panel.top - panel.bottom },
          wallEndPanelPartKey(wall.id, panel.endpoint), 'wallEndPanel');
      }
    }

    return { items, warnings };
  }), room);
}
