import { DEFAULT_SETTINGS } from '../constants.js';
import { panelOrientation } from '../cells.js';
import { bandPaths } from '../bandPaths.js';
import { cornerLegBandParts } from '../bandSweep.js';
import { frontDepth, runBackOffset } from '../corners.js';
import { planPointToWallX } from '../geometry.js';
import { moldingPast, moldingProfiles } from '../moldingProfiles.js';
import { carriesMolding } from '../parts.js';
import { resolveProfile } from '../profile.js';
import { resolveWall } from '../room.js';
import { bandPast, runBands, waterfallEnds } from '../runBands.js';
import { runScene } from '../runScene.js';
import { sectionProfileBounds } from '../sectionProfiles.js';
import { isShelvesOnlyRun } from '../wallEndPanels.js';
import { WALL_SIDES, wallSideFrame } from '../wallSides.js';
import { formatInch, formatSize } from './format.js';

const MOLDINGS = { toeKick: 'Toe Kick', topMold: 'Top Mold', crown: 'Crown' };

/** Whole measured feet, allowing a sixteenth over a whole foot. */
export function moldingFeet(inches) {
  return Math.ceil((inches - 1 / 16) / 12);
}

function insideMitreExtra(room, wall, run, settings, kind, drawnEnds, paths) {
  const frame = wallSideFrame(room, wall, wall.side ?? 'front');
  const addedEnds = new Set();
  let extra = 0;
  for (const path of paths.filter((path) => path.kind === kind)) {
    path.vertices.forEach((vertex, index) => {
      if (vertex.type !== 'mitre') return;
      const pair = [path.segments[index], path.segments[(index + 1) % path.segments.length]];
      const returned = pair.find((segment) => segment.return);
      const member = pair.find((segment) => !segment.return && !segment.corner && segment.runId === run.id
        && segment.wallId === wall.id && segment.face === (wall.side ?? 'front'));
      if (!returned || !member || returned.wallId !== member.wallId || returned.face !== member.face
        || member.front >= returned.front) return;
      const side = Math.hypot(member.from.x - vertex.at.x, member.from.y - vertex.at.y) < 1e-6
        ? 'left' : 'right';
      if (addedEnds.has(side)) return;
      addedEnds.add(side);
      const deeper = wall.runs.find(({ id }) => id === returned.runId);
      // The path follows the return's face; its inside vertex is back on the deeper run's side line.
      const insideX = planPointToWallX(frame, vertex.at) - (returned.returnSide === 'left' ? -1 : 1)
        * bandPast(room, wall, deeper, returned.returnSide, kind, settings);
      const distance = drawnEnds[side === 'left' ? 0 : 1] - insideX;
      extra += kind === 'toeKick' ? Math.max(0, distance * (side === 'left' ? 1 : -1)) : Math.abs(distance);
    });
  }
  return extra;
}

export function shippingMoldings(room, settings) {
  const result = Object.fromEntries(Object.keys(MOLDINGS).map((kind) => [kind,
    { measured: 0, dimensions: new Map() }]));
  const shelfDepths = new Map();
  for (const stored of room.walls ?? []) {
    for (const side of WALL_SIDES) {
      const wall = resolveWall(room, stored, side);
      const profile = resolveProfile(settings, room, wall);
      for (const run of wall.runs) {
        const kinds = Object.keys(MOLDINGS).filter((kind) => carriesMolding(wall, run, profile, kind, settings));
        if (!kinds.length) continue;
        const scene = runScene(room, wall, run, settings);
        const bands = runBands(room, wall, run, settings, scene);
        const moldings = moldingProfiles(profile, settings, run);
        const { ends, paths } = bandPaths(room, settings);
        const legBands = ['left', 'right'].flatMap((end) =>
          cornerLegBandParts(room, wall.id, run, end, settings));
        for (const kind of kinds) {
          const data = result[kind];
          const picked = moldings[kind];
          // A toe kick is ordered short of the box by its top gap: a 4" kick is 3 7/8" (Kyle 2026-10-23).
          const gap = kind === 'toeKick' ? settings.toeKickTopGap ?? DEFAULT_SETTINGS.toeKickTopGap : 0;
          const height = formatInch((picked?.height ?? profile[`${kind}Height`]) - gap);
          const bounds = picked && sectionProfileBounds({ geometry: picked.geometry });
          const depth = bounds ? formatInch(bounds.maxX - bounds.minX) : null;
          data.dimensions.set(`${height}:${depth}`, { height, depth });
          // Panel orientation needs resolved leaf dimensions, including nested grid cells.
          if (kind === 'topMold' && isShelvesOnlyRun(run)
            && !scene.cells.pieces.some((piece) => panelOrientation(piece) === 'top')) {
            const depth = run.depth + moldingPast(moldings, kind, settings);
            shelfDepths.set(formatInch(depth), depth);
          }
          const returned = paths.flatMap((path) => path.kind === kind ? path.segments.filter((segment) =>
            segment.return && segment.runId === run.id && segment.wallId === wall.id && segment.face === side) : []);
          if (kind === 'toeKick') {
            data.measured += bands.toeKicks.reduce((sum, band) => sum + band.width, 0);
            if (bands.toeKicks.length) {
              const drawnEnds = [Math.min(...bands.toeKicks.map((band) => band.x)),
                Math.max(...bands.toeKicks.map((band) => band.x + band.width))];
              data.measured += insideMitreExtra(room, wall, run, settings, kind, drawnEnds, paths);
            }
          } else {
            const band = bands[kind];
            data.measured += band.width + band.ends.filter((end, index) => end.type === 'return'
              && !returned.some((segment) => segment.returnSide === (index === 0 ? 'left' : 'right'))).length
              * (frontDepth(run, settings) - runBackOffset(run) + moldingPast(moldings, kind, settings));
            data.measured += insideMitreExtra(room, wall, run, settings, kind, band.ends.map(({ x }) => x), paths);
          }
          data.measured += returned.reduce((sum, segment) => sum
            + Math.hypot(segment.to.x - segment.from.x, segment.to.y - segment.from.y), 0);
          const partKind = kind === 'toeKick' ? 'toe_kick' : kind === 'topMold' ? 'top_mold' : kind;
          for (const leg of legBands.filter((leg) => leg.kind === partKind)) {
            data.measured += leg.width;
            // A dropped leg still has a projected view, owned by the diagonal member.
            const member = ends.has(`${leg.id}|${kind}|${leg.z}|left`)
              ? leg.id : leg.id.replace('corner-leg:', 'corner-diagonal:');
            const returned = ['left', 'right'].some((side) =>
              ends.get(`${member}|${kind}|${leg.z}|${side}`)?.type === 'return');
            if (kind !== 'toeKick' && returned) data.measured += leg.front - leg.back;
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
  if (shelfDepths.size) {
    const depths = [...shelfDepths].sort((a, b) => a[1] - b[1]).map(([text]) => text);
    result.topMold.note += `, ${depths.join(' & ')} deep over shelves`;
  }
  return result;
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

export const bandItems = {
  kinds: ['molding', 'furniture_base', 'wood_top'],
  description(item, facts, { room, settings }) {
    if (item.kind === 'molding') return moldingDescription(room, settings, item);
    return item.kind === 'furniture_base' ? 'Furniture Base' : 'Wood Top';
  },
  size(item, facts) {
    if (item.kind === 'molding') return `${moldingFeet(facts.molding.measured)} feet\nsend 1 extra length`;
    if (item.kind === 'furniture_base') {
      const { base } = facts;
      return formatSize(base.orderedWidth, base.orderedHeight, base.depth);
    }
    const { top } = facts;
    return formatSize(top.orderedWidth, top.orderedDepth, top.thickness);
  },
  notes(item, facts, { room, settings }) {
    if (item.kind === 'molding') return { 13: facts.molding.note };
    if (item.kind !== 'wood_top') return {};
    const top = facts.top;
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
    return { 13: [top.faces.length === 2 ? 'Both faces' : null,
      left && right ? 'Waterfall both' : left ? 'Waterfall L' : right ? 'Waterfall R' : null,
      top.miters.left && top.miters.right ? 'Miter both' : top.miters.left ? 'Miter L' : top.miters.right ? 'Miter R' : null,
      ...nosings] };
  },
};
