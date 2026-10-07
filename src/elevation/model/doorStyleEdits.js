import { DOOR_STYLE_KEYS } from './doorStyles.js';
import { gridLeaves } from './grid.js';

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
