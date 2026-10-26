import { panelMaterial } from './constants.js';
import { runDoorDetails } from './doorDetails.js';
import { glassMarks } from './glassMarks.js';
import { resolveWall } from './room.js';
import { rolloutSpacerSides } from './rollouts.js';
import { runScene } from './runScene.js';
import { wallInteriorData } from './shelves.js';

const EPSILON = 1e-6;
const rect = ({ x, z, width, height }) => ({ x, z, width, height });

function clip(face, box) {
  const x = Math.max(face.x, box.x);
  const z = Math.max(face.z, box.z);
  const width = Math.min(face.x + face.width, box.x + box.width) - x;
  const height = Math.min(face.z + face.height, box.z + box.height) - z;
  return width > EPSILON && height > EPSILON ? { x, z, width, height } : null;
}

function overlaps(item, window) {
  return [['x', 'width'], ['z', 'height']].every(([axis, size]) => item[size] === 0
    ? item[axis] >= window[axis] - EPSILON && item[axis] <= window[axis] + window[size] + EPSILON
    : Math.min(item[axis] + item[size], window[axis] + window[size])
      - Math.max(item[axis], window[axis]) > EPSILON);
}

function drawableItems(interior, data) {
  const items = [];
  const add = (key, kind, source, extra = {}) => items.push({ key, kind, ...rect(source), ...extra });
  for (const line of interior.partLines ?? []) add(`edge:${line.part}`, 'edge', line);
  for (const divider of interior.dividers) {
    const key = `${divider.path}:${divider.index}`;
    add(`divider:${key}`, 'divider', divider);
    if (divider.kind.startsWith('double_')) {
      const vertical = divider.kind === 'double_partition';
      add(`divider-joint:${key}`, 'edge', {
        x: divider.x + (vertical ? divider.width / 2 : 0),
        z: divider.z + (vertical ? 0 : divider.height / 2),
        width: vertical ? 0 : divider.width, height: vertical ? divider.height : 0,
      });
    }
  }
  for (const section of interior.sections) {
    const { itemId } = interior;
    const shelf = data.shelves.get(itemId)?.get(section.path);
    (shelf?.positions ?? []).forEach((z, i) => add(`shelf:${section.path}:${i}`, 'shelf', {
      x: section.x + (section.width - shelf.width) / 2,
      z, width: shelf.width, height: shelf.nosing?.height ?? shelf.thickness,
    }));
    const shoe = shelf?.shoe;
    (shoe?.positions ?? []).forEach((z, i) => add(`shoe:${section.path}:${i}`, 'shoe', {
      x: section.x + (section.width - shoe.width) / 2, z, width: shoe.width, height: shoe.frontHeight,
    }));
    const rollout = data.rollouts.get(itemId)?.get(section.path);
    for (const box of rollout?.rollouts ?? []) {
      add(`rollout:${section.path}:${box.index}`, 'rollout', box);
      for (const side of rolloutSpacerSides(rollout, box)) {
        add(`spacer:${section.path}:${box.index}:${side}`, 'spacer', {
          x: side === 'left' ? box.column.x : box.column.x + box.column.width - box.spacers.right,
          z: rollout.zone.z, width: box.spacers[side], height: rollout.top - rollout.zone.z,
        });
      }
    }
    for (const item of data.accessories.get(itemId)?.get(section.path)?.items ?? []) {
      if (item.centerZ == null || item.accessory?.attachesTo !== 'section') continue;
      add(`accessory:${section.path}:${item.index}`, 'accessory', item.rect ?? {
        x: section.x, z: item.centerZ, width: section.width, height: 0,
      }, { label: `${item.qty > 1 ? `${item.qty} × ` : ''}${item.accessory.name}`,
        ...(item.drawing ? { drawing: item.drawing } : {}) });
    }
  }
  return items;
}

/** Open faces and framed see-through panels reveal whole interior items through wall-coordinate windows. */
export function wallShowThrough(room, wall, side, settings) {
  const candidates = [];
  const view = resolveWall(room, wall, side);
  for (const run of view.runs) {
    const scene = runScene(room, view, run, settings);
    const hasMaterial = [...scene.faceLayouts.values()].some(({ faces }) => faces.some((face) => face.panelMaterial));
    const details = new Map((hasMaterial ? runDoorDetails(room, view, run, settings, scene).parts : [])
      .map((part) => [part.key, part]));
    for (const [itemId, { faces }] of scene.faceLayouts) {
      const open = faces.filter((face) => face.type === 'open');
      const glass = [];
      for (const face of faces) {
        const material = panelMaterial(face.panelMaterial);
        if (!material?.seeThrough) continue;
        // Door detail half keys use a colon; elevation part ids concatenate the half.
        const detail = details.get(`${itemId}:${face.path}${face.half ? `:${face.half}` : ''}`);
        if (detail?.construction !== 'five_piece') continue;
        const openings = detail.openings.map(rect);
        glass.push({ partId: `${itemId}:${face.path}${face.half ?? ''}`, openings,
          marks: material.glassMarks ? openings.flatMap(glassMarks) : [] });
      }
      if (open.length || glass.some(({ openings }) => openings.length)) {
        candidates.push({ itemId, runId: run.id, open, glass });
      }
    }
  }
  const result = new Map();
  if (!candidates.length) return result;
  // The interior box comes from elevationParts, including blind and face-frame geometry.
  const data = wallInteriorData(room, wall, side, settings);
  for (const { itemId, runId, open, glass } of candidates) {
    const interior = data.interiors.get(itemId);
    if (!interior) continue;
    const windows = [...open.map((face) => clip(face, interior.box)).filter(Boolean),
      ...glass.flatMap(({ openings }) => openings)];
    if (!windows.length) continue;
    const items = drawableItems(interior, data).filter((item) => windows.some((window) => overlaps(item, window)));
    result.set(itemId, { itemId, runId, windows, glass, items });
  }
  return result;
}
