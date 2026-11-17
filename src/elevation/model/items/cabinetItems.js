import { accessoryText } from '../accessories.js';
import { boxConstruction } from '../boxConstruction.js';
import { CABINET_TYPE_IDS } from '../constants.js';
import { cornerEnd } from '../cornerEnd.js';
import { sheetThickness } from '../doorStyles.js';
import { deckZ } from '../elevationParts.js';
import { resolveSlide } from '../slides.js';
import {
  CABINET_STYLE_LABELS, isInsetStyle, resolveStyle, REVEAL_KEYS, typeStandardReveals,
} from '../styles.js';
import { teeSetback } from '../tees.js';
import { EPSILON, TYPE_LABELS } from './shared.js';
import { cornerReportNotes } from './cornerNotes.js';
import { formatRevealParts, measureFaceReveals } from './faceReveals.js';
import { formatInch, formatSize } from './format.js';
import { drawerFrontNote, faceOrder, interiorNotes } from './interiorNotes.js';

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

/**
 * A tall run's cabinet on the floor under another is a base on the shop's lists when it's no taller than
 * 36 1/2"; a taller one stays a tall (Kyle 2026-10-23). It takes a base's notes too (full top).
 */
function listedTypeId(run, piece) {
  if (run?.cabinetTypeId !== CABINET_TYPE_IDS.TALL || !piece) return run?.cabinetTypeId;
  const stacked = piece.z <= run.z + EPSILON && piece.z + piece.height < run.z + run.height - EPSILON;
  return stacked && piece.height <= STACKED_BASE_MAX_HEIGHT + EPSILON ? CABINET_TYPE_IDS.BASE : run.cabinetTypeId;
}

function cabinetNotes(part, context, { room, settings }) {
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

export const cabinetItems = {
  kinds: ['cabinet'],
  description(part, context) {
    const { run, scene, piece } = context;
    const layout = scene.faceLayouts.get(part.key);
    return layout?.corner ? `${TYPE_LABELS[listedTypeId(run, piece)]} Corner ${layout.corner.kind}`
      : cabinetDescription(listedTypeId(run, piece), layout?.faces);
  },
  size(part, context, { room, settings }) {
    const { wall, run, scene } = context;
    const corner = scene.faceLayouts.get(part.key)?.corner;
    if (corner) {
      const { legA, legB } = cornerEnd(room, wall, run, corner.side, settings, scene.result);
      return formatSize(legA, part.height, legB);
    }
    const rect = context.rectangle();
    const depth = rect.front - rect.back;
    return formatSize(part.width, part.height, depth);
  },
  notes: cabinetNotes,
};
