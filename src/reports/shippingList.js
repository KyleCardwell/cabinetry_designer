import { withBuildCache } from '../elevation/model/buildCache.js';
import { accessoryText } from '../elevation/model/accessories.js';
import { findLeaf } from '../elevation/model/cellTree.js';
import { boxConstruction } from '../elevation/model/boxConstruction.js';
import { CABINET_TYPE_IDS } from '../elevation/model/constants.js';
import { cornerEnd } from '../elevation/model/cornerEnd.js';
import { panelLevels, resolveDoorStyle } from '../elevation/model/doorStyleResolve.js';
import { sheetThickness } from '../elevation/model/doorStyles.js';
import { deckZ, elevationParts } from '../elevation/model/elevationParts.js';
import { frameMembers, regionOpenings } from '../elevation/model/frames.js';
import { furnitureBaseGroups } from '../elevation/model/furnitureBaseGroups.js';
import { wallLength } from '../elevation/model/geometry.js';
import { runLegs } from '../elevation/model/legs.js';
import { runLegFills } from '../elevation/model/legFills.js';
import {
  isJoinedEnd, isSheetCell,
} from '../elevation/model/panelThickness.js';
import { partNumbers } from '../elevation/model/partNumbers.js';
import { resolveWall } from '../elevation/model/room.js';
import { runScene } from '../elevation/model/runScene.js';
import { wallInteriorData } from '../elevation/model/shelves.js';
import { resolveSlide } from '../elevation/model/slides.js';
import {
  CABINET_STYLE_LABELS, isInsetStyle, resolveStyle, REVEAL_KEYS, runFrame, typeStandardReveals,
} from '../elevation/model/styles.js';
import { teeFillers, teeSetback } from '../elevation/model/tees.js';
import { wallBuiltEnds } from '../elevation/model/wallEndPanels.js';
import { wallEndFit } from '../elevation/model/wallEndFit.js';
import { woodTopGroups } from '../elevation/model/woodTopGroups.js';
import { doorLines } from '../elevation/model/items/doorLines.js';
import { shippingMoldings } from '../elevation/model/items/bandItems.js';
import { itemDescription, itemReport, itemReportContext } from '../elevation/model/items/itemReport.js';
import { EPSILON, TYPE_LABELS } from '../elevation/model/items/shared.js';
import { cornerFrameNotes, cornerReportNotes } from './cornerNotes.js';
import { formatRevealParts, measureFaceReveals } from './faceReveals.js';
import { formatInch, formatSize } from '../elevation/model/items/format.js';
import { frameMemberRoles, frameNotes, frameNotchNotes, frameReasons, frameReturnNotes, frameStandards, frameStepReturnNotes } from './frameNotes.js';
import { drawerFrontNote, faceOrder, interiorNotes } from './interiorNotes.js';

export { drawerFrontNote };

const PRINTED_FRAME_RULES = new Set(['rule:top-overlap', 'rule:stacked-seam']);
// A floor box under another in a tall run is a base up to this height, a tall above it (Kyle 2026-10-23).
const STACKED_BASE_MAX_HEIGHT = 36.5;

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
  const type = TYPE_LABELS[typeId];
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
  const legs = new Map();
  const legFills = new Map();
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
      return { wall, endpoint, style: resolved.style, fit: wallEndFit(room, wall, endpoint, settings) };
    }
    const viewKey = `${wall.id}:${part.side ?? 'front'}`;
    if (!views.has(viewKey)) views.set(viewKey, resolveWall(room, wall, part.side ?? 'front'));
    const view = views.get(viewKey);
    const run = view.runs.find(({ id }) => id === part.runId);
    if (!run) return { wall: view };
    if (part.kind === 'leg') {
      if (!legs.has(run)) legs.set(run,
        new Map(runLegs(room, view, run, settings).map((placed) => [placed.leg.id, placed])));
      return { wall: view, run, leg: legs.get(run).get(part.key) };
    }
    if (part.kind === 'leg_panel' || part.kind === 'leg_filler') {
      if (!legFills.has(run)) legFills.set(run,
        new Map(runLegFills(room, view, run, settings).map((fill) => [fill.id, fill])));
      return { wall: view, run, fill: legFills.get(run).get(part.key) };
    }
    if (!scenes.has(run)) scenes.set(run, runScene(room, view, run, settings));
    const scene = scenes.get(run);
    if (part.source === 'corner_return') {
      const side = scene.faceLayouts.get(part.columnId).corner.side;
      const corner = cornerEnd(room, view, run, side, settings, scene.result);
      const style = part.kind === 'end_panel' ? resolveDoorStyle(room, settings, 'panel',
        panelLevels(room, view, run, run.ends[side])).style : undefined;
      return { wall: view, run, scene, corner, style };
    }
    if (part.kind === 'frame' && part.columnId) {
      return { wall: view, run, scene,
        cornerFrame: scene.cornerFrames.find(({ columnId }) => columnId === part.columnId) };
    }
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

/**
 * A tall run's cabinet on the floor under another is a base on the shop's lists when it's no taller than
 * 36 1/2"; a taller one stays a tall (Kyle 2026-10-23). It takes a base's notes too (full top).
 */
function listedTypeId(run, piece) {
  if (run?.cabinetTypeId !== CABINET_TYPE_IDS.TALL || !piece) return run?.cabinetTypeId;
  const stacked = piece.z <= run.z + EPSILON && piece.z + piece.height < run.z + run.height - EPSILON;
  return stacked && piece.height <= STACKED_BASE_MAX_HEIGHT + EPSILON ? CABINET_TYPE_IDS.BASE : run.cabinetTypeId;
}

function describePart(part, context) {
  const { run, scene, piece } = context;
  let description;
  switch (part.kind) {
    case 'cabinet': {
      const layout = scene.faceLayouts.get(part.key);
      description = layout?.corner ? `${TYPE_LABELS[listedTypeId(run, piece)]} Corner ${layout.corner.kind}`
        : cabinetDescription(listedTypeId(run, piece), layout?.faces);
      break;
    }
    case 'frame': description = context.cornerFrame ? `Corner ${context.cornerFrame.kind} Face Frame` : 'Face Frame'; break;
  }
  return description;
}

export function shippingDescription(room, settings, part) {
  return itemDescription(part, shippingContext(room, settings)(part), { room, settings }, { description: describePart });
}

function shippingSize(part, context, { room, settings }) {
  if (context.cornerFrame) {
    const { diagonal, frame } = context.cornerFrame;
    return diagonal ? formatSize(diagonal.frontWidth, frame.height, frame.thickness) : '';
  }
  const { wall, run, scene } = context;
  const corner = part.kind === 'cabinet' && scene.faceLayouts.get(part.key)?.corner;
  if (corner) {
    const { legA, legB } = cornerEnd(room, wall, run, corner.side, settings, scene.result);
    return formatSize(legA, part.height, legB);
  }
  switch (part.kind) {
    case 'cabinet': {
      const rect = context.rectangle();
      const depth = rect.front - rect.back;
      return formatSize(part.width, part.height, depth);
    }
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
  const corner = layout?.corner ? cornerReportNotes(room, wall, run, layout, settings,
    scene.cornerFrames.find(({ columnId }) => columnId === part.key)) : null;
  const deckRise = deckZ(layout, settings);
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
  const values = { ...(standard ? layout.reveals.values : { ...leaf?.reveals, ...Object.fromEntries(overlap) }) };
  if (layout?.corner?.kind === 90) {
    const { side } = layout.corner;
    const farA = side === 'left' ? 'right' : 'left';
    const exterior = standard || Number.isFinite(values[farA]) ? corner.revealValues[side] : undefined;
    delete values[side];
    if (Number.isFinite(exterior)) values[side] = exterior;
  }
  const profiled = isInsetStyle(style) && faces.some((face) => face.type !== 'open'
    && !layout.reveals.values.squarePaths?.has(face.path));
  const measured = profiled ? measureFaceReveals(layout.corner ? layout.box : piece, faces) : null;
  if (profiled && layout.corner?.kind === 90 && layout.cornerReturn?.legB) {
    const { legB, dir } = layout.cornerReturn;
    measured[layout.corner.side] = measureFaceReveals(legB.box, legB.faces)[dir === 1 ? 'right' : 'left'];
  }
  const reveals = profiled ? formatRevealParts(measured) : formatRevealParts(Object.fromEntries(
    REVEAL_KEYS.filter((key) => Number.isFinite(values?.[key])
      && (!standard || Math.abs(values[key] - standard[key]) > EPSILON))
      .map((key) => [key, [values[key]]]),
  ));
  const blind = scene.blind.entries.find(({ pieceId, unsized }) => pieceId === part.key && !unsized);
  const doors = faces.filter((face) => face.type === 'door');
  const doorWidth = doors.length ? Math.max(...doors.map(({ width }) => width)) : blind?.visibleWidth;
  const falseFronts = faces.filter((face) => face.type === 'false_front').length;
  const setback = teeSetback(run, faces, settings);
  return {
    0.5: style.cabinetStyleId !== resolveStyle(settings, room).cabinetStyleId
      ? `${CABINET_STYLE_LABELS[style.cabinetStyleId].toUpperCase()} BOX` : null,
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
    1.6: corner?.sides,
    1.8: box.bottom === 'between' && deckRise > 0
      ? `deck up ${formatInch(deckRise + sheetThickness(settings) / 2)} (with supports)` : null,
    2: reveals.length ? `RV's (${reveals.join(', ')})` : null,
    2.5: [
      box.bottom === 'none' ? 'no deck' : null,
      box.bottom === 'spreaders' ? 'bottom spreaders' : null,
      { inset: '3/4" inset back', applied: '1/4" applied back', none: 'no back' }[box.back],
      box.left === false ? 'no left side' : null,
      box.right === false ? 'no right side' : null,
    ],
    3: corner ? corner.doors : blind ? `Door x ${formatInch(doorWidth)}, Blind x ${formatInch(blind.extension)}` : null,
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
    6: corner?.hinge ?? hingeNote([...faces, ...(layout?.cornerReturn?.legB?.faces ?? [])]),
    7: [
      rabbets.get(part.key),
      setback > 0 ? `deck, fixed shelves & top set back ${formatInch(setback)}` : null,
    ],
  };
}

/** Part notes share vendor annotations and the properties panel's return/chip rules. */
function partNotes(room, settings, part, context, doorItems, shop, numberOf) {
  if (context.cornerFrame) {
    const { wall, run, scene, cornerFrame } = context;
    const { returnSide } = cornerEnd(room, wall, run, cornerFrame.side, settings, scene.result);
    return { 10: cornerFrameNotes(cornerFrame, returnSide) };
  }
  const { run, scene, wall } = context;
  const groups = {};
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
  return groups;
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
  return withBuildCache(() => {
    const { parts, warnings } = partNumbers(room, settings);
    const numbers = new Map(parts.map(({ key, number }) => [key, number]));
    const numberOf = (id) => numbers.get(id);
    const getContext = shippingContext(room, settings);
    const doorItems = new Map(doorLines(room, settings).items
      .filter(({ kind }) => kind !== 'face').map((item) => [item.key, item]));
    const ctx = itemReportContext(room, settings, { shop, numberOf, doorItems });
    const fallback = {
      description: describePart,
      size: shippingSize,
      notes: (part, context, { room, settings, shop, numberOf }) => ({
        ...cabinetNotes(room, settings, part, context),
        ...partNotes(room, settings, part, context, doorItems, shop, numberOf),
      }),
    };
    const rows = parts
      .sort((a, b) => a.number - b.number).map((part) => ({
        number: part.number, key: part.key, kind: part.kind,
        ...itemReport(part, getContext(part), ctx, fallback),
      }));
    rows.push({ number: null, key: 'adjustable-shelves', kind: 'adjustable_shelves',
      description: 'Adjustable Shelves', notes: [], size: '' });
    return { rows, wallNotes: wallLengthNotes(room, settings), roomNote: room.reportNote?.trim() || null, warnings };
  }, room);
}
