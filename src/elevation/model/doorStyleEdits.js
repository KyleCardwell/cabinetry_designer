import { DEFAULT_DESIGN_ID, DOOR_DESIGNS, DOOR_STYLE_KEYS, findDoorDesign, teamDoorStyle } from './doorStyles.js';
import { gridLeaves } from './grid.js';
import { formatInches } from './units.js';
import { resolveDoorStyle } from './doorStyleResolve.js';
import { partSizes } from './doorSizes.js';

/** First unused letter, followed by the first unused positive integer label. */
export function nextDoorStyleLabel(styles = []) {
  const labels = new Set(styles.map((style) => style.label));
  for (const label of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    if (!labels.has(label)) return label;
  }
  let number = 1;
  while (labels.has(String(number))) number += 1;
  return String(number);
}

/** A complete independent copy with a fresh identity and no name. */
export function newDoorStyle(styles, base, id) {
  const copy = structuredClone(base);
  delete copy.name;
  return { ...copy, id, label: nextDoorStyleLabel(styles) };
}

/** Visit matching picks in room, wall, run, grid and face order. */
function visitDoorStyleUses(room, styleId, visit) {
  const pick = (object, key, use) => {
    if (object != null && Object.hasOwn(object, key) && object[key] === styleId) {
      visit(object, key, use);
    }
  };
  const keys = (object, at) => {
    for (const key of DOOR_STYLE_KEYS) pick(object, key, { ...at, key });
  };
  const faceLeaves = (node, at, path = 'r') => {
    if (!node) return;
    if (node.children) {
      node.children.forEach((child, index) => faceLeaves(child, at, `${path}.${index}`));
    } else {
      pick(node, 'styleId', { level: 'face', ...at, path });
    }
  };

  keys(room, { level: 'room' });
  for (const wall of room.walls ?? []) {
    const wallAt = { wallId: wall.id };
    keys(wall, { level: 'wall', ...wallAt });
    for (const endpoint of ['start', 'end']) {
      pick(wall.endPanels?.[endpoint], 'styleId', { level: 'wallEndPanel', ...wallAt, endpoint });
    }
    for (const run of wall.runs ?? []) {
      const runAt = { ...wallAt, runId: run.id };
      keys(run, { level: 'run', ...runAt });
      for (const side of ['left', 'right']) {
        pick(run.ends?.[side], 'styleId', { level: 'runEnd', ...runAt, side });
      }
      if (!run.grid) continue;
      for (const leaf of gridLeaves(run.grid)) {
        if (leaf.kind === 'cabinet') {
          const itemAt = { ...runAt, itemId: leaf.id };
          keys(leaf, { level: 'cabinet', ...itemAt });
          faceLeaves(leaf.face, itemAt);
        } else if (leaf.kind === 'panel') {
          pick(leaf, 'styleId', { level: 'panelCell', ...runAt, cellId: leaf.id });
        }
      }
    }
  }
}

/** Every place that explicitly picks the style, ordered from room to face. */
export function doorStyleUses(room, styleId) {
  const uses = [];
  visitDoorStyleUses(room, styleId, (object, key, use) => uses.push(use));
  return uses;
}

/** Move or clear picks on a deep copy, preserving the room's style list. */
export function reassignDoorStyle(room, fromId, toId) {
  const copy = structuredClone(room);
  visitDoorStyleUses(copy, fromId, (object, key) => {
    if (toId === null) delete object[key];
    else object[key] = toId;
  });
  return copy;
}

const PART_SIDES = ['top', 'bottom', 'left', 'right'];
const sideGroup = (side) => (side === 'top' || side === 'bottom' ? 'rails' : 'stiles');

/** Replace or remove a sizes group, omitting the sizes object when empty. */
function withSizeGroup(sizes, key, group) {
  const next = { ...sizes };
  if (Object.keys(group).length) next[key] = group;
  else delete next[key];
  return Object.keys(next).length ? next : undefined;
}

/** Set or clear one typed rail or stile width. */
export function setPartSide(sizes, side, width) {
  if (!PART_SIDES.includes(side) || (width !== null && !(Number.isFinite(width) && width > 0))) return sizes;
  const key = sideGroup(side);
  const group = { ...sizes?.[key] };
  if (width === null) delete group[side];
  else group[side] = width;
  return withSizeGroup(sizes, key, group);
}

/** Set or clear a side's note, dropping an empty notes group. */
export function setPartNote(sizes, side, note) {
  if (!PART_SIDES.includes(side)) return sizes;
  const notes = { ...sizes?.notes };
  if (note === null || note === '') delete notes[side];
  else notes[side] = note;
  return withSizeGroup(sizes, 'notes', notes);
}

/** Replace mid rails or stiles, dropping an empty list. */
export function setPartMids(sizes, kind, mids) {
  if (kind !== 'midRails' && kind !== 'midStiles') return sizes;
  return withSizeGroup(sizes, kind, mids);
}

function styleRow(style, design, partType, settings) {
  const thickness = partType === 'panel' && style.id === 'default'
    ? settings.endPanelThickness : style.thickness;
  return `${style.label} · ${design.code} · ${formatInches(thickness)}`;
}

/** Team and room picker rows, plus the style inherited without this level's own pick. */
export function pickOptions(room, settings, partType, levelsAbove, node = null) {
  const ownKey = { door: 'doorStyleId', drawer_front: 'drawerFrontStyleId', panel: 'panelStyleId' }[partType];
  const here = { ...node };
  delete here[ownKey];
  const levels = node ? [{ level: 'here', node: here }, ...levelsAbove] : levelsAbove;
  const { style, design, source } = resolveDoorStyle(room, settings, partType, levels);
  const prefix = partType !== 'door' && (source.level === 'team' || source.key === 'doorStyleId')
    ? 'Same as doors' : 'Inherit';
  const teamRow = styleRow(teamDoorStyle(settings), findDoorDesign(DEFAULT_DESIGN_ID), partType, settings);
  return {
    inherit: { id: style.id, text: `${prefix} (${styleRow(style, design, partType, settings)})` },
    options: [
      { id: 'default', text: `Team default (${teamRow})` },
      ...(room?.doorStyles ?? []).map((entry) => ({
        id: entry.id,
        text: styleRow(entry, findDoorDesign(entry.designId) ?? DOOR_DESIGNS[0], partType, settings),
      })),
    ],
  };
}

/** Display typed and resolved sizes, or explain why this part is a slab. */
export function partSizeRows(style, design, part) {
  const result = partSizes(style, design, part);
  const sizes = part.sizes ?? {};
  if (result.construction === 'slab') {
    const note = result.slab === 'design'
      ? 'Slab design'
      : `Slab under ${formatInches(style.shortFace.slabBelow)}${result.molding === false ? ' — molding left off' : ''}`;
    return { title: 'Slab', note, rows: [], midRails: [], midStiles: [], opening: null };
  }
  const molding = result.construction === 'slab_applied';
  const labels = molding
    ? ['Top', 'Bottom', 'Left', 'Right']
    : ['Top rail', 'Bottom rail', 'Left stile', 'Right stile'];
  const mids = (kind) => result[kind].map((entry, index) => ({
    ...entry, typed: sizes[kind][index].width !== undefined,
  }));
  return {
    title: molding ? 'Molding inset' : 'Stiles & rails',
    note: null,
    rows: PART_SIDES.map((side, index) => ({
      side,
      label: labels[index],
      typed: sizes[sideGroup(side)]?.[side] ?? null,
      value: result[sideGroup(side)][side],
      source: result.sources[side],
      note: sizes.notes?.[side] ?? null,
    })),
    midRails: mids('midRails'),
    midStiles: mids('midStiles'),
    opening: result.opening,
  };
}
