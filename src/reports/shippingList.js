import { findLeaf } from '../elevation/model/cellTree.js';
import { boxConstruction } from '../elevation/model/boxConstruction.js';
import { CABINET_TYPE_IDS } from '../elevation/model/constants.js';
import { panelOrientation } from '../elevation/model/cells.js';
import { frontDepth, runBackOffset } from '../elevation/model/corners.js';
import { panelLevels, resolveDoorStyle } from '../elevation/model/doorStyleResolve.js';
import { wallDrawerBoxes } from '../elevation/model/drawerBoxes.js';
import { elevationParts } from '../elevation/model/elevationParts.js';
import { frameMembers, regionOpenings } from '../elevation/model/frames.js';
import { furnitureBaseGroups } from '../elevation/model/furnitureBaseGroups.js';
import { wallLength } from '../elevation/model/geometry.js';
import { moldingPast, moldingProfiles } from '../elevation/model/moldingProfiles.js';
import {
  isJoinedEnd, isSheetCell, runEndThickness, wallPanelThickness,
} from '../elevation/model/panelThickness.js';
import { partNumbers } from '../elevation/model/partNumbers.js';
import { carriesMolding } from '../elevation/model/parts.js';
import { fillerOrderedDepth, fillerReturnDepth } from '../elevation/model/planPieces.js';
import { resolveProfile } from '../elevation/model/profile.js';
import { resolveWall } from '../elevation/model/room.js';
import { runBands } from '../elevation/model/runBands.js';
import { runScene } from '../elevation/model/runScene.js';
import { sectionProfileBounds } from '../elevation/model/sectionProfiles.js';
import { resolveSlide } from '../elevation/model/slides.js';
import {
  endPieceBottom, endPieceNotes, isInsetStyle, resolveStyle, REVEAL_KEYS, runFrame, typeStandardReveals,
} from '../elevation/model/styles.js';
import { teeFillers } from '../elevation/model/tees.js';
import { wallBuiltEnds } from '../elevation/model/wallEndPanels.js';
import { WALL_SIDES } from '../elevation/model/wallSides.js';
import { doorOrderItems } from './doorOrder.js';
import { formatInch, formatSize } from './format.js';
import { frameMemberRoles, frameNotes, frameReasons, frameStandards } from './frameNotes.js';

const TYPES = { 1: 'Base', 2: 'Upper', 3: 'Tall' };
const MOLDINGS = { toeKick: 'Toe Kick', topMold: 'Top Mold', crown: 'Crown' };
const MOLDING_EXTRA = 24;
const EPSILON = 1e-6;

/** Order eight-foot lengths, allowing two extra feet for fitting. */
export function linealFeet(inches) {
  return Math.ceil((inches + MOLDING_EXTRA) / 96) * 8;
}

function shippingMoldings(room, settings) {
  const result = Object.fromEntries(Object.keys(MOLDINGS).map((kind) => [kind,
    { measured: 0, dimensions: new Map() }]));
  for (const stored of room.walls ?? []) {
    for (const side of WALL_SIDES) {
      const wall = resolveWall(room, stored, side);
      const profile = resolveProfile(settings, room, wall);
      for (const run of wall.runs) {
        const kinds = Object.keys(MOLDINGS).filter((kind) => carriesMolding(wall, run, profile, kind));
        if (!kinds.length) continue;
        const bands = runBands(room, wall, run, settings, runScene(room, wall, run, settings));
        const moldings = moldingProfiles(profile, settings, run);
        for (const kind of kinds) {
          const data = result[kind];
          const picked = moldings[kind];
          const height = formatInch(picked?.height ?? profile[`${kind}Height`]);
          const bounds = picked && sectionProfileBounds({ geometry: picked.geometry });
          const depth = bounds ? formatInch(bounds.maxX - bounds.minX) : null;
          data.dimensions.set(`${height}:${depth}`, { height, depth });
          if (kind === 'toeKick') {
            data.measured += bands.toeKicks.reduce((sum, band) => sum + band.width, 0);
          } else {
            const band = bands[kind];
            data.measured += band.width + band.ends.filter((end) => end.type === 'return').length
              * (frontDepth(run, settings) - runBackOffset(run) + moldingPast(moldings, kind, settings));
          }
        }
      }
    }
  }
  for (const data of Object.values(result)) {
    const dimensions = [...data.dimensions.values()];
    data.note = dimensions.every(({ depth }) => depth === null)
      ? `${dimensions.map(({ height }) => height).join(' & ')} tall`
      : dimensions.map(({ height, depth }) => `${height} tall${depth === null ? '' : ` x ${depth} deep`}`).join(' & ');
  }
  return result;
}

function faceOrder(a, b) {
  const topA = a.z == null ? 0 : a.z + (a.height ?? 0);
  const topB = b.z == null ? 0 : b.z + (b.height ?? 0);
  return topB - topA || (a.x ?? 0) - (b.x ?? 0);
}

/** Group working fronts by height and slide, retaining their first top-down appearance. */
export function drawerFrontNote(faces = [], slideNames = new Map()) {
  const groups = new Map();
  for (const face of faces.filter((face) => face.type === 'drawer_front').sort(faceOrder)) {
    const height = Math.round(face.height * 32) / 32;
    const name = slideNames.get(face.path) || null;
    const key = JSON.stringify([height, name]);
    if (!groups.has(key)) groups.set(key, { height, name, count: 0 });
    groups.get(key).count += 1;
  }
  return groups.size ? `DF's (${[...groups.values()].map(({ height, name, count }) =>
    `${count} - ${formatInch(height)}${name ? ` (${name})` : ''}`).join(', ')})` : null;
}

/** Single doors and action pairs need shop instructions; pair halves share a path. */
export function hingeNote(faces = []) {
  const doors = faces.filter((face) => face.type === 'door'
    || (face.type === 'pair_door' && ['flipper', 'pocket', 'sliding'].includes(face.action))).sort(faceOrder);
  const pairs = new Set();
  const notes = [];
  for (const { type, path, action, hinge } of doors) {
    if (type === 'pair_door') {
      if (pairs.has(path)) continue;
      pairs.add(path);
      notes.push(`${action} doors`);
    } else if (action === 'sliding') {
      notes.push('sliding door');
    } else if (action === 'pullout') {
      notes.push('pull-out');
    } else {
      const side = { left: 'hl', right: 'hr', top: 'hinge top', bottom: 'hinge bottom' }[hinge] ?? 'hinge?';
      notes.push(action === 'flipper' || action === 'pocket' ? `${action} door ${side}` : side);
    }
  }
  if (!notes.length) return null;
  return notes[0] !== 'hinge?' && notes.every((note) => note === notes[0]) ? notes[0] : notes.join(', ');
}

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
  const teeData = new Map();
  const elevations = new Map();
  const drawerBoxes = new Map();
  let bases;
  let moldings;
  return (part) => {
    if (part.kind === 'molding') {
      moldings ??= shippingMoldings(room, settings);
      return { molding: moldings[part.molding] };
    }
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
    if (!teeData.has(run)) teeData.set(run, teeFillers(room, run, scene.cells, settings));
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
      wall: view, run, scene, piece, leaf, end, blindPanel, shelfBack, style,
      rabbets: teeData.get(run).rabbets, shapeNotes: teeData.get(run).notes,
      drawerBoxes: () => {
        if (!drawerBoxes.has(viewKey)) drawerBoxes.set(viewKey,
          wallDrawerBoxes(room, wall, part.side ?? 'front', settings));
        return drawerBoxes.get(viewKey).get(part.key)?.boxes ?? [];
      },
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

/** Thick door panels are ordered at their style thickness, with a separate nosing note. */
function orderedThickness(drawn, style) {
  return style && style.id !== 'sheet' && drawn > style.thickness + EPSILON ? style.thickness : drawn;
}

function shippingSize(room, settings, part, context) {
  if (part.kind === 'molding') return `Lineal Feet: ${linealFeet(context.molding.measured)}`;
  const { wall, run, scene, piece, end, blindPanel, style, endpoint, base } = context;
  if (part.kind === 'furniture_base') return formatSize(base.orderedWidth, base.orderedHeight, base.depth);
  if (part.kind === 'wall_end_panel') {
    return formatSize(part.width, part.height, orderedThickness(wallPanelThickness(room, wall, settings)[endpoint], style));
  }
  if (blindPanel) return formatSize(part.width, part.height,
    orderedThickness(runEndThickness(room, wall, run, settings)[end], style));
  if (part.kind === 'filler') {
    const tee = scene.tees.some((tee) => tee.id === part.key || tee.pieceId === part.key);
    const thickness = tee ? settings.teeThickness + settings.fillerReturnDepth - settings.fillerReturnTongue
      : fillerOrderedDepth(room, wall, run, piece, settings);
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

function cabinetNotes(room, settings, part, context) {
  if (part.kind !== 'cabinet') return {};
  const { scene, leaf, rabbets, run, wall } = context;
  const box = boxConstruction(leaf, run, wall);
  const fullTop = box.top === 'between' || box.top === 'overlay';
  const base = run.cabinetTypeId === CABINET_TYPE_IDS.BASE;
  const layout = scene.faceLayouts.get(part.key);
  const faces = layout?.faces ?? [];
  const roomSlideId = resolveSlide(settings).id;
  const slideNames = new Map(context.drawerBoxes().map(({ path, slideId, slide }) =>
    [path, slideId !== roomSlideId ? slide.name : null]));
  const boxes = room.reportParts?.[part.key]?.boxes;
  const style = resolveStyle(settings, room, run, leaf);
  const standard = layout && !isInsetStyle(style)
    ? typeStandardReveals(style, run.cabinetTypeId, settings) : null;
  const values = standard ? layout.reveals.values : leaf?.reveals;
  const reveals = REVEAL_KEYS.filter((key) => Number.isFinite(values?.[key])
    && (!standard || Math.abs(values[key] - standard[key]) > EPSILON))
    .map((key) => `${formatInch(values[key])} ${key[0].toUpperCase()}`);
  const blind = scene.blind.entries.find(({ pieceId }) => pieceId === part.key);
  const doors = faces.filter((face) => face.type === 'door');
  const doorWidth = doors.length ? Math.max(...doors.map(({ width }) => width)) : blind?.visibleWidth;
  const falseFronts = faces.filter((face) => face.type === 'false_front').length;
  return {
    1: boxes && boxes !== settings.report?.boxMaterial ? `${boxes} BOX` : null,
    1.5: [
      base && fullTop ? 'full top' : null,
      !base && box.top === 'spreaders' ? 'top spreaders' : null,
      box.top === 'none' ? 'no top' : null,
      box.top === 'overlay' && box.bottom === 'overlay' ? 'top & bottom overlay sides'
        : box.top === 'overlay' ? 'top overlays sides'
          : box.bottom === 'overlay' ? 'bottom overlays sides' : null,
      box.finTop ? 'fin top (dowel front holes)' : null,
      box.finBottom ? 'fin bottom (dowel front holes)' : null,
    ],
    2: reveals.length ? `RV's (${reveals.join(', ')})` : null,
    2.5: [
      box.bottom === 'none' ? 'no deck' : null,
      box.bottom === 'spreaders' ? 'bottom spreaders' : null,
      { inset: '3/4" inset back', applied: '1/4" applied back', none: 'no back' }[box.back],
      box.left === false ? 'no left side' : null,
      box.right === false ? 'no right side' : null,
    ],
    3: blind ? `Door x ${formatInch(doorWidth)}, Blind x ${formatInch(blind.extension)}` : null,
    4: drawerFrontNote(faces, slideNames),
    5: falseFronts ? falseFronts === 1 ? 'false front' : `${falseFronts} false fronts` : null,
    6: hingeNote(faces),
    7: rabbets.get(part.key),
  };
}

/** Part notes share vendor annotations and the properties panel's return/chip rules. */
function partNotes(room, settings, part, context, doorItems, shop, numberOf) {
  const { run, scene, piece, shapeNotes, style, wall, end, endpoint, base } = context;
  const groups = {};
  if (part.kind === 'molding') groups[13] = context.molding.note;
  if (part.kind === 'furniture_base') {
    groups[12] = [
      ...(base.orderedHeight - base.height > EPSILON
        ? [`+${formatInch(base.orderedHeight - base.height)} scribe bottom`] : []),
      ...(base.orderedWidth - base.width > EPSILON
        ? [`+${formatInch(base.orderedWidth - base.width)} scribe left/right`] : []),
    ];
  }
  if (['filler', 'end_panel'].includes(part.kind)) {
    const tee = scene.tees.find((tee) => tee.id === part.key || tee.pieceId === part.key);
    const notes = shapeNotes.get(tee?.id ?? part.key) ?? [];
    groups[8] = notes.filter((note) => note === 'T-shape' || note === 'L-shape');
    if (!groups[8].length && part.kind === 'filler' && fillerReturnDepth(run, piece, settings) > 0) {
      const index = scene.cells.pieces.indexOf(piece);
      const returns = [-1, 1].filter((offset) => scene.cells.pieces[index + offset]?.kind === 'cabinet').length;
      groups[8] = returns === 2 ? ['U-shape'] : returns === 1 ? ['L-shape'] : [];
    }
    if (!piece?.extend?.down) {
      groups[9] = tee ? notes.filter((note) => note !== 'T-shape')
        : endPieceNotes(part.kind, endPieceBottom(run, resolveStyle(settings, room, run), settings));
    }
  }
  groups[10] = doorItems.get(part.key)?.notes;
  if (part.kind === 'frame') {
    const region = scene.frames.regions.find(({ id }) => id === part.key);
    const members = region && frameMembers(region, regionOpenings(region, scene.faceLayouts));
    if (members) {
      const bead = runFrame(room, run, settings).bead;
      const standards = frameStandards(shop.insetFrame, bead);
      const entries = frameReasons(room, wall, run, scene, region,
        frameMemberRoles(region, members, scene.cells.pieces), settings, standards);
      groups[10] = frameNotes(entries, standards, { bead, numberOf });
    }
  }
  if (style && style.id !== 'sheet') {
    let drawn;
    if (part.kind === 'wall_end_panel') drawn = wallPanelThickness(room, wall, settings)[endpoint];
    else if (part.kind === 'end_panel' || context.blindPanel) drawn = runEndThickness(room, wall, run, settings)[end];
    else if (part.kind === 'panel') {
      const orientation = panelOrientation(piece);
      drawn = orientation === 'side' ? part.width : orientation === 'top' ? part.height
        : context.rectangle().front - context.rectangle().back;
    }
    if (drawn > style.thickness + EPSILON) {
      groups[11] = `add ${formatInch(drawn - style.thickness)} square nosing, mitered (${formatInch(drawn)} thick)`;
    }
  }
  return groups;
}

/** Keep the specified note order, with free text last (#14). */
function orderedNotes(groups) {
  return Object.entries(groups).sort(([a], [b]) => Number(a) - Number(b))
    .flatMap(([, notes]) => notes).map((note) => note?.trim()).filter(Boolean);
}

/** One planned-length reason per island/peninsula wall, shared by both faces. */
function wallLengthNotes(room, settings) {
  if (settings.runFlex === 0) return [];
  return (room.walls ?? []).flatMap((wall) => {
    if (wall.thickness !== 0) return [];
    const { start, end } = wallBuiltEnds(wall);
    if (Math.abs(start + end) <= EPSILON) return [];
    const planned = wallLength(wall);
    const attached = ['start', 'end'].some((endpoint) => wall.connections?.[endpoint] || wall.landings?.[endpoint]);
    const name = wall.name?.trim() || (attached ? 'Peninsula' : 'Island');
    return [`${name} ${formatSize(planned + start + end)} (planned ${formatSize(planned)})`];
  });
}

export function shippingList(room, settings, shop = settings) {
  const { parts, warnings } = partNumbers(room, settings);
  const numbers = new Map(parts.map(({ key, number }) => [key, number]));
  const numberOf = (id) => numbers.get(id);
  const getContext = shippingContext(room, settings);
  const doorItems = new Map(doorOrderItems(room, settings).items
    .filter(({ kind }) => kind !== 'face').map((item) => [item.key, item]));
  const rows = [...parts].sort((a, b) => a.number - b.number).map((part) => {
    const context = getContext(part);
    return {
      number: part.number, key: part.key, kind: part.kind,
      description: describePart(room, settings, part, context),
      notes: orderedNotes({ ...cabinetNotes(room, settings, part, context),
        ...partNotes(room, settings, part, context, doorItems, shop, numberOf), 14: [room.reportParts?.[part.key]?.note] }),
      size: shippingSize(room, settings, part, context),
    };
  });
  rows.push({ number: null, key: 'adjustable-shelves', kind: 'adjustable_shelves',
    description: 'Adjustable Shelves', notes: [], size: '' });
  return { rows, wallNotes: wallLengthNotes(room, settings), roomNote: room.reportNote?.trim() || null, warnings };
}
