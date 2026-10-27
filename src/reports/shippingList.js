import { accessoryText } from '../elevation/model/accessories.js';
import { findLeaf } from '../elevation/model/cellTree.js';
import { boxConstruction } from '../elevation/model/boxConstruction.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../elevation/model/constants.js';
import { panelOrientation } from '../elevation/model/cells.js';
import { frontDepth, runBackOffset } from '../elevation/model/corners.js';
import { panelLevels, resolveDoorStyle } from '../elevation/model/doorStyleResolve.js';
import { sheetThickness } from '../elevation/model/doorStyles.js';
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
import { runBands, waterfallEnds } from '../elevation/model/runBands.js';
import { runScene } from '../elevation/model/runScene.js';
import { sectionProfileBounds } from '../elevation/model/sectionProfiles.js';
import { wallInteriorData } from '../elevation/model/shelves.js';
import { resolveSlide } from '../elevation/model/slides.js';
import {
  endPieceBottom, endPieceNotes, isInsetStyle, resolveStyle, REVEAL_KEYS, runFrame, typeStandardReveals,
} from '../elevation/model/styles.js';
import { teeFillers } from '../elevation/model/tees.js';
import { wallBuiltEnds } from '../elevation/model/wallEndPanels.js';
import { WALL_SIDES } from '../elevation/model/wallSides.js';
import { woodTopGroups } from '../elevation/model/woodTopGroups.js';
import { doorOrderItems } from './doorOrder.js';
import { formatInch, formatSize } from './format.js';
import { frameMemberRoles, frameNotes, frameNotchNotes, frameReasons, frameReturnNotes, frameStandards, frameStepReturnNotes } from './frameNotes.js';
import { drawerFrontNote, faceOrder, interiorNotes } from './interiorNotes.js';

export { drawerFrontNote };

const TYPES = { 1: 'Base', 2: 'Upper', 3: 'Tall' };
const MOLDINGS = { toeKick: 'Toe Kick', topMold: 'Top Mold', crown: 'Crown' };
const MOLDING_EXTRA = 24;
const EPSILON = 1e-6;
const PRINTED_FRAME_RULES = new Set(['rule:top-overlap', 'rule:stacked-seam']);
// A floor box under another in a tall run is a base up to this height, a tall above it (Kyle 2026-10-23).
const STACKED_BASE_MAX_HEIGHT = 36.5;

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
        const kinds = Object.keys(MOLDINGS).filter((kind) => carriesMolding(wall, run, profile, kind, settings));
        if (!kinds.length) continue;
        const bands = runBands(room, wall, run, settings, runScene(room, wall, run, settings));
        const moldings = moldingProfiles(profile, settings, run);
        for (const kind of kinds) {
          const data = result[kind];
          const picked = moldings[kind];
          // A toe kick is ordered short of the box by its top gap: a 4" kick is 3 7/8" (Kyle 2026-10-23).
          const gap = kind === 'toeKick' ? settings.toeKickTopGap ?? DEFAULT_SETTINGS.toeKickTopGap : 0;
          const height = formatInch((picked?.height ?? profile[`${kind}Height`]) - gap);
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
  const interiorData = new Map();
  let bases;
  let tops;
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
    if (part.kind === 'wood_top') {
      tops ??= new Map(woodTopGroups(room, settings).map((group) => [group.key, group]));
      return { top: tops.get(part.key) };
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
    const end = piece?.inside ? piece.side
      : ['left', 'right'].find((side) => part.key === `${run.id}:${side}`);
    const blindPanel = scene.panelPieceIds.has(part.key);
    const shelfBack = part.kind === 'panel' && part.key.endsWith(':back');
    let style;
    if (part.kind === 'end_panel' || part.kind === 'panel' || blindPanel) {
      const sheet = shelfBack || (!piece?.inside && (end ? isJoinedEnd(run, end) : isSheetCell(leaf)));
      style = resolveDoorStyle(room, settings, 'panel',
        panelLevels(room, view, run, piece?.inside ? piece : end ? run.ends?.[end] : leaf, { sheet })).style;
    }
    const wallData = () => {
      if (!interiorData.has(viewKey)) interiorData.set(viewKey,
        wallInteriorData(room, wall, part.side ?? 'front', settings));
      return interiorData.get(viewKey);
    };
    const drawerData = () => wallData().boxes.get(part.cabinetId ?? part.key);
    return {
      wall: view, run, scene, piece, leaf, end, blindPanel, shelfBack, style,
      rabbets: teeData.get(run).rabbets, shapeNotes: teeData.get(run).notes,
      drawerData, interiorData: wallData,
      drawerBox: () => drawerData()?.boxes.find(({ path }) => path === part.facePath),
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
    return wall.runs.some((run) => carriesMolding(wall, run, profile, part.molding, settings));
  });
  const profile = resolveProfile(settings, room, wall);
  const id = profile[`${part.molding}ProfileId`];
  return settings.sectionProfiles?.find((entry) => entry.id === id)?.name || MOLDINGS[part.molding];
}

/**
 * A tall run's cabinet on the floor under another is a base on the shop's lists when it's no taller than
 * 36 1/2"; a taller one stays a tall (Kyle 2026-10-23). It takes a base's notes too (full top).
 */
function listedTypeId(run, piece) {
  if (run?.cabinetTypeId !== CABINET_TYPE_IDS.TALL || !piece) return run?.cabinetTypeId;
  const stacked = piece.z <= run.z + EPSILON && piece.z + piece.height < run.z + run.height - EPSILON;
  return stacked && piece.height <= STACKED_BASE_MAX_HEIGHT + EPSILON ? CABINET_TYPE_IDS.BASE : run.cabinetTypeId;
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
    case 'cabinet': description = cabinetDescription(listedTypeId(run, piece), scene.faceLayouts.get(part.key)?.faces); break;
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
    case 'wood_top': description = 'Wood Top'; break;
    case 'rot': description = 'ROT Drawer Box'; break;
    case 'trash_lid': description = 'Trash Lid'; break;
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
  if (part.kind === 'wood_top') return formatSize(context.top.width, context.top.depth, context.top.thickness);
  if (part.kind === 'molding') return `Lineal Feet: ${linealFeet(context.molding.measured)}`;
  if (part.kind === 'rot' || part.kind === 'trash_lid') {
    const box = context.drawerBox?.();
    if (!box || ![box.width, box.height, box.depth].every(Number.isFinite)) return '';
    return part.kind === 'rot' ? formatSize(box.width, box.height, box.depth)
      : formatSize(box.width, box.depth, sheetThickness(settings));
  }
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
  const { scene, leaf, rabbets, run, wall, piece } = context;
  const box = boxConstruction(leaf, run, wall);
  const fullTop = box.top === 'between' || box.top === 'overlay';
  const base = listedTypeId(run, piece) === CABINET_TYPE_IDS.BASE;
  const layout = scene.faceLayouts.get(part.key);
  const faces = layout?.faces ?? [];
  const roomSlideId = resolveSlide(settings).id;
  const drawerData = context.drawerData();
  const slideNames = new Map((drawerData?.boxes ?? []).map(({ path, slideId, slide }) =>
    [path, slideId !== roomSlideId ? slide.name : null]));
  const depths = new Map((drawerData?.boxes ?? []).map(({ path, depth }) => [path, depth]));
  const accessoryTags = new Map((drawerData?.boxes ?? []).map(({ path, accessories }) => [path,
    (accessories ?? []).filter(({ accessory }) => accessory?.attachesTo === 'drawer_box')
      .map(({ accessory, qty }) => `${qty > 1 ? `${qty} ` : ''}${accessoryText(accessory)}`).join(', '),
  ]));
  const data = context.interiorData();
  const notch = Math.max(0,
    ...(drawerData?.boxes ?? []).map(({ notch }) => notch ?? 0),
    ...[...(data.rollouts.get(part.key)?.values() ?? [])]
      .flatMap(({ rollouts }) => rollouts.map(({ notch }) => notch ?? 0)));
  const interior = data.interiors.get(part.key);
  const notes = interior ? interiorNotes({ interior, shelves: data.shelves.get(part.key),
    rollouts: data.rollouts.get(part.key), accessories: data.accessories.get(part.key),
    boxes: drawerData?.boxes ?? [], roomSlideId, settings,
    faces, slideNames, depths, accessoryTags }) : null;
  const boxes = room.reportParts?.[part.key]?.boxes;
  const style = resolveStyle(settings, room, run, leaf);
  const standard = layout && !isInsetStyle(style)
    ? typeStandardReveals(style, run.cabinetTypeId, settings) : null;
  // Face frame reveals print only when typed, except a top overlap, which changes the box's reveal too (Kyle 2026-10-22),
  // and the 3/4" seam reveals of boxes stacked under one shared rail (Kyle 2026-10-23).
  const overlap = layout && !standard ? REVEAL_KEYS.filter((key) => PRINTED_FRAME_RULES.has(layout.reveals.sources?.[key]))
    .map((key) => [key, layout.reveals.values[key]]) : [];
  const values = standard ? layout.reveals.values : { ...leaf?.reveals, ...Object.fromEntries(overlap) };
  const reveals = REVEAL_KEYS.filter((key) => Number.isFinite(values?.[key])
    && (!standard || Math.abs(values[key] - standard[key]) > EPSILON))
    // A negative reveal is an overhang: "1 5/8" OH B", not "-1 5/8" B" (Kyle 2026-10-19).
    .map((key) => `${formatInch(Math.abs(values[key]))} ${values[key] < 0 ? 'OH ' : ''}${key[0].toUpperCase()}`);
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
    // Drawer fronts print inside their section (IN10.1); only fronts outside every section stay here.
    4: notes ? notes.fronts : drawerFrontNote(faces, slideNames, depths, accessoryTags),
    5: falseFronts ? falseFronts === 1 ? 'false front' : `${falseFronts} false fronts` : null,
    5.4: notes?.dividers,
    5.5: notes?.sections,
    // Drawer rule notes follow the DF's, which now sit in their section (IN10.1).
    5.6: [
      ...(drawerData?.notes ?? []).map(({ text }) => text),
      notch > 0 ? `notch back for slides (${formatInch(notch)})` : null,
    ],
    6: hingeNote(faces),
    7: rabbets.get(part.key),
  };
}

/** Part notes share vendor annotations and the properties panel's return/chip rules. */
function partNotes(room, settings, part, context, doorItems, shop, numberOf) {
  const { run, scene, piece, shapeNotes, style, wall, end, endpoint } = context;
  const groups = {};
  if (part.kind === 'rot') {
    const box = context.drawerBox?.();
    if (box) groups[4.5] = [...box.notes,
      box.slideId !== resolveSlide(settings).id ? box.slide.name : null];
  }
  if (part.kind === 'molding') groups[13] = context.molding.note;
  if (part.kind === 'wood_top') {
    const top = context.top;
    let left = false;
    let right = false;
    const nosings = new Set();
    const stored = room.walls.find(({ id }) => id === top.wallId);
    for (const { side, runIds } of top.faces) {
      const view = resolveWall(room, stored, side);
      const profile = resolveProfile(settings, room, view);
      for (const run of view.runs.filter(({ id }) => runIds.includes(id))) {
        const waterfall = waterfallEnds(room, view, run, settings);
        left ||= Boolean(waterfall.left);
        right ||= Boolean(waterfall.right);
        const nosing = moldingProfiles(profile, settings, run).nosing;
        if (nosing?.profile.name) nosings.add(nosing.profile.name);
      }
    }
    groups[13] = [top.faces.length === 2 ? 'Both faces' : null,
      left && right ? 'Waterfall both' : left ? 'Waterfall L' : right ? 'Waterfall R' : null,
      ...nosings];
  }
  // Scribe is already in the ordered size, so it gets no note of its own (Kyle 2026-10-23).
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
    groups[10] = [...(groups[10] ?? []), ...frameReturnNotes(run, region),
      ...frameNotchNotes(region, scene.cells.pieces, numberOf),
      ...frameStepReturnNotes(run, region, scene.cells, numberOf)];
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
