import { withBuildCache } from '../elevation/model/buildCache.js';
import { findLeaf } from '../elevation/model/cellTree.js';
import { cornerEnd } from '../elevation/model/cornerEnd.js';
import { panelLevels, resolveDoorStyle } from '../elevation/model/doorStyleResolve.js';
import { elevationParts } from '../elevation/model/elevationParts.js';
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
import { teeFillers } from '../elevation/model/tees.js';
import { wallBuiltEnds } from '../elevation/model/wallEndPanels.js';
import { wallEndFit } from '../elevation/model/wallEndFit.js';
import { woodTopGroups } from '../elevation/model/woodTopGroups.js';
import { doorLines } from '../elevation/model/items/doorLines.js';
import { shippingMoldings } from '../elevation/model/items/bandItems.js';
import { itemDescription, itemReport, itemReportContext } from '../elevation/model/items/itemReport.js';
import { EPSILON } from '../elevation/model/items/shared.js';
import { formatSize } from '../elevation/model/items/format.js';

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

export function shippingDescription(room, settings, part) {
  return itemDescription(part, shippingContext(room, settings)(part), { room, settings });
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
    const rows = parts
      .sort((a, b) => a.number - b.number).map((part) => ({
        number: part.number, key: part.key, kind: part.kind,
        ...itemReport(part, getContext(part), ctx),
      }));
    rows.push({ number: null, key: 'adjustable-shelves', kind: 'adjustable_shelves',
      description: 'Adjustable Shelves', notes: [], size: '' });
    return { rows, wallNotes: wallLengthNotes(room, settings), roomNote: room.reportNote?.trim() || null, warnings };
  }, room);
}
