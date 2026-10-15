import { findLeaf } from '../elevation/model/cellTree.js';
import { panelOrientation } from '../elevation/model/cells.js';
import { panelLevels, resolveDoorStyle } from '../elevation/model/doorStyleResolve.js';
import { elevationParts } from '../elevation/model/elevationParts.js';
import { furnitureBaseGroups } from '../elevation/model/furnitureBaseGroups.js';
import {
  isJoinedEnd, isSheetCell, runEndThickness, wallPanelThickness,
} from '../elevation/model/panelThickness.js';
import { partNumbers } from '../elevation/model/partNumbers.js';
import { carriesMolding } from '../elevation/model/parts.js';
import { fillerReturnDepth } from '../elevation/model/planPieces.js';
import { resolveProfile } from '../elevation/model/profile.js';
import { resolveWall } from '../elevation/model/room.js';
import { runScene } from '../elevation/model/runScene.js';
import { runFrame } from '../elevation/model/styles.js';
import { formatSize } from './format.js';

const TYPES = { 1: 'Base', 2: 'Upper', 3: 'Tall' };
const MOLDINGS = { toeKick: 'Toe Kick', topMold: 'Top Mold', crown: 'Crown' };
const EPSILON = 1e-6;

/** Cabinet doors are implied; only working drawer fronts are counted. */
export function cabinetDescription(typeId, faces = []) {
  const type = TYPES[typeId];
  const drawers = faces.filter((face) => face.type === 'drawer_front');
  const doors = faces.filter((face) => ['door', 'pair_door', 'panel'].includes(face.type));
  if (drawers.length === 0) return doors.length ? type : `${type} Open`;
  if (doors.length === 0) return `${type} ${drawers.length} Drawer${drawers.length === 1 ? '' : 's'}`;
  if (drawers.every((drawer) => doors.every((door) => drawer.z >= door.z + door.height - EPSILON))) {
    return drawers.length === 1 ? `${type} Top Drawer` : `${type} ${drawers.length} Top Drawers`;
  }
  return `${type} Drawers & Doors`;
}

/** Cache each drawing view and run once while building a room's rows. */
function shippingContext(room, settings) {
  const views = new Map();
  const scenes = new Map();
  const elevations = new Map();
  let bases;
  return (part) => {
    if (part.kind === 'furniture_base') {
      bases ??= new Map(furnitureBaseGroups(room, settings).map((group) => [group.key, group]));
      return { base: bases.get(part.key) };
    }
    const wall = room.walls?.find(({ id }) => id === part.wallId);
    if (!wall) return {};
    if (part.kind === 'wall_end_panel') {
      const endpoint = part.key.slice(part.key.lastIndexOf(':') + 1);
      const stored = wall.endPanels?.[endpoint];
      const resolved = resolveDoorStyle(room, settings, 'panel', panelLevels(room, wall, null, stored));
      return { wall, endpoint, style: resolved.style };
    }
    const viewKey = `${wall.id}:${part.side ?? 'front'}`;
    if (!views.has(viewKey)) views.set(viewKey, resolveWall(room, wall, part.side ?? 'front'));
    const view = views.get(viewKey);
    const run = view.runs.find(({ id }) => id === part.runId);
    if (!run) return { wall: view };
    if (!scenes.has(run)) scenes.set(run, runScene(room, view, run, settings));
    const scene = scenes.get(run);
    const piece = scene.cells.pieces.find(({ id }) => id === part.key)
      ?? scene.shelves.find(({ id }) => id === part.key);
    const leaf = findLeaf(run.grid, part.key);
    const end = ['left', 'right'].find((side) => part.key === `${run.id}:${side}`);
    const blindPanel = scene.panelPieceIds.has(part.key);
    const shelfBack = part.kind === 'panel' && part.key.endsWith(':back');
    let style;
    if (part.kind === 'end_panel' || part.kind === 'panel' || blindPanel) {
      const sheet = shelfBack || (end ? isJoinedEnd(run, end) : isSheetCell(leaf));
      style = resolveDoorStyle(room, settings, 'panel',
        panelLevels(room, view, run, end ? run.ends?.[end] : leaf, { sheet })).style;
    }
    return {
      wall: view, run, scene, piece, end, blindPanel, shelfBack, style,
      // Descriptions and the properties placeholder need no elevation geometry.
      rectangle: () => {
        if (!elevations.has(viewKey)) elevations.set(viewKey,
          new Map(elevationParts(room, wall, part.side ?? 'front', settings).map((entry) => [entry.id, entry])));
        return elevations.get(viewKey).get(part.key);
      },
    };
  };
}

function moldingDescription(room, settings, part) {
  const wall = room.walls?.find((wall) => {
    const profile = resolveProfile(settings, room, wall);
    return wall.runs.some((run) => carriesMolding(wall, run, profile, part.molding));
  });
  const profile = resolveProfile(settings, room, wall);
  const id = profile[`${part.molding}ProfileId`];
  return settings.sectionProfiles?.find((entry) => entry.id === id)?.name || MOLDINGS[part.molding];
}

function describePart(room, settings, part, context) {
  const entry = room.reportParts?.[part.key];
  const name = entry?.name?.trim();
  if (name) return name;
  if (part.kind === 'molding') return moldingDescription(room, settings, part);
  const { run, scene, piece, blindPanel, shelfBack, style } = context;
  const type = TYPES[run?.cabinetTypeId];
  let description;
  switch (part.kind) {
    case 'cabinet': description = cabinetDescription(run.cabinetTypeId, scene.faceLayouts.get(part.key)?.faces); break;
    case 'filler': description = `${type} ${blindPanel ? 'Blind Panel' : 'Filler'}`; break;
    case 'end_panel': description = `${type} ${scene.panelPieceIds.has(part.key) ? 'Blind' : 'End'} Panel`; break;
    case 'panel': {
      const orientation = panelOrientation(piece);
      const position = piece?.z + piece?.height / 2 > run.z + run.height / 2 ? 'Top' : 'Bottom';
      description = shelfBack ? 'Shelf Back Panel' : `${type} ${
        orientation === 'side' ? 'Side' : orientation === 'back' ? 'Back' : position
      } Panel`;
      break;
    }
    case 'shelf': description = 'Floating Shelf'; break;
    case 'wall_end_panel': description = 'Wall End Panel'; break;
    case 'frame': description = 'Face Frame'; break;
    case 'furniture_base': description = 'Furniture Base'; break;
  }
  return entry?.shopBuilt || style?.id === 'sheet' ? `Shop-built ${description}` : description;
}

export function shippingDescription(room, settings, part) {
  return describePart(room, settings, part, shippingContext(room, settings)(part));
}

/** Thick door panels are ordered at their style thickness; later note groups describe the nosing. */
function orderedThickness(drawn, style) {
  return style && style.id !== 'sheet' && drawn > style.thickness + EPSILON ? style.thickness : drawn;
}

function shippingSize(room, settings, part, context) {
  if (part.kind === 'molding') return '';
  const { wall, run, scene, piece, end, blindPanel, style, endpoint, base } = context;
  if (part.kind === 'furniture_base') return formatSize(base.orderedWidth, base.orderedHeight, base.depth);
  if (part.kind === 'wall_end_panel') {
    return formatSize(part.width, part.height, orderedThickness(wallPanelThickness(room, wall, settings)[endpoint], style));
  }
  if (blindPanel) return formatSize(part.width, part.height,
    orderedThickness(runEndThickness(room, wall, run, settings)[end], style));
  if (part.kind === 'filler') {
    const tee = scene.tees.some((tee) => tee.id === part.key || tee.pieceId === part.key);
    const thickness = tee ? settings.teeThickness + settings.fillerReturnDepth
      : settings.endPanelThickness + fillerReturnDepth(run, piece, settings);
    return formatSize(part.width, part.height, thickness);
  }
  const rect = context.rectangle();
  const depth = rect.front - rect.back;
  switch (part.kind) {
    case 'cabinet': return formatSize(part.width, part.height, depth);
    case 'end_panel': return formatSize(depth,
      part.height, orderedThickness(runEndThickness(room, wall, run, settings)[end], style));
    case 'panel': {
      const orientation = panelOrientation(piece);
      const sizes = orientation === 'side' ? [depth, part.height, part.width]
        : orientation === 'top' ? [part.width, depth, part.height] : [part.width, part.height, depth];
      sizes[2] = orderedThickness(sizes[2], style);
      return formatSize(...sizes);
    }
    case 'shelf': return formatSize(part.width, depth, part.height);
    case 'frame': return formatSize(part.width, part.height, runFrame(room, run, settings).thickness);
  }
}

/** Numbered note groups leave room for steps d–f ahead of the free-text group (#14). */
function orderedNotes(groups) {
  return Object.entries(groups).sort(([a], [b]) => Number(a) - Number(b))
    .flatMap(([, notes]) => notes).map((note) => note?.trim()).filter(Boolean);
}

export function shippingList(room, settings) {
  const { parts, warnings } = partNumbers(room, settings);
  const getContext = shippingContext(room, settings);
  const rows = [...parts].sort((a, b) => a.number - b.number).map((part) => {
    const context = getContext(part);
    return {
      number: part.number, key: part.key, kind: part.kind,
      description: describePart(room, settings, part, context),
      notes: orderedNotes({ 14: [room.reportParts?.[part.key]?.note] }),
      size: shippingSize(room, settings, part, context),
    };
  });
  rows.push({ number: null, key: 'adjustable-shelves', kind: 'adjustable_shelves',
    description: 'Adjustable Shelves', notes: [], size: '' });
  return { rows, roomNote: room.reportNote?.trim() || null, warnings };
}
