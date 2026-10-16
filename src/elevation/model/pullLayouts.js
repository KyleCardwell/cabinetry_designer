import { findLeaf } from './cellTree.js';
import { doorDrawing, runDoorDetails } from './doorDetails.js';
import { cabinetFaceLevels } from './doorStyleResolve.js';
import { getFaceNode } from './faceTree.js';
import { defaultFace } from './faces.js';
import { runItems } from './grid.js';
import { pullPartType, resolvePull } from './pulls.js';
import { resolveWall } from './room.js';
import { runScene } from './runScene.js';
import { wallViewForRun } from './wallSides.js';

const EPS = 1e-6;

export function pullPositionLabel(at) {
  return {
    'top-corner': 'Top corner',
    'bottom-corner': 'Bottom corner',
    height: 'Tall pull height',
    center: 'Centred',
    'top-rail': 'On top rail',
    'bottom-rail': 'On bottom rail',
    'top-edge': 'Top edge',
    'bottom-edge': 'Bottom edge',
  }[at];
}

function pullSize(pull) {
  if (pull.kind === 'knob') return { along: pull.diameter, across: pull.diameter };
  return { along: pull.length, across: pull.kind === 'tab' ? pull.height : pull.width };
}

/** Place one resolved face's hardware in wall inches, with z measured from the floor. */
export function facePullPlacement({ face, part, pull, pullHeight = 45, overrides = {} }) {
  const drawer = ['drawer_front', 'false_front'].includes(face.type);
  const hinge = face.type === 'pair_door' ? face.half : face.hinge;
  const railAuto = hinge === 'top' ? 'bottom-rail'
    : hinge === 'bottom' || face.action === 'pullout' ? 'top-rail' : null;
  const at = overrides.pullAt ?? (drawer ? 'center' : railAuto
    ?? (face.z + face.height <= pullHeight ? 'top-corner'
      : face.z >= pullHeight ? 'bottom-corner' : 'height'));
  const autoOrientation = drawer || railAuto ? 'horizontal' : 'vertical';
  const orientation = pull.kind === 'tab' ? 'horizontal'
    : pull.kind === 'knob' ? autoOrientation : overrides.pullOrientation ?? autoOrientation;
  const result = { at, orientation, centers: [], warnings: [] };
  if (!pullPartType(face.type)) return result;
  const stilePosition = ['top-corner', 'bottom-corner', 'height'].includes(at);
  const side = face.action !== 'sliding' && ['left', 'right'].includes(hinge)
    ? (hinge === 'left' ? 'right' : 'left') : null;
  if (stilePosition && !side) {
    result.warnings.push('pull-needs-hinge');
    return result;
  }

  const { along, across } = pullSize(pull);
  const { x, z, width, height } = part.core ?? part;
  const members = part.construction === 'five_piece' ? part.sizes : part.style;
  const { edgeIn, frameOut } = part.flat;
  const inner = part.construction === 'five_piece' ? frameOut : 0;
  const flatCenter = (size) => (edgeIn + size - inner) / 2;
  const topRail = z + height - flatCenter(members.rails.top);
  const bottomRail = z + flatCenter(members.rails.bottom);
  let cx = face.x + face.width / 2;
  let cz = face.z + face.height / 2;
  if (stilePosition) {
    cx = side === 'right' ? x + width - flatCenter(members.stiles.right)
      : x + flatCenter(members.stiles.left);
  }

  if (pull.kind === 'tab') {
    const bottom = ['bottom-corner', 'bottom-rail'].includes(at);
    result.at = bottom ? 'bottom-edge' : 'top-edge';
    cz = bottom ? face.z + across / 2 : face.z + face.height - across / 2;
  } else {
    const end = orientation === 'vertical' ? along / 2 : 0;
    if (at === 'top-corner') cz = topRail - end;
    if (at === 'bottom-corner') cz = bottomRail + end;
    if (at === 'top-rail') cz = topRail;
    if (at === 'bottom-rail') cz = bottomRail;
    if (at === 'height') {
      const low = bottomRail + end;
      const high = topRail - end;
      if (low > high) result.warnings.push('pull-too-long');
      else cz = Math.max(low, Math.min(pullHeight, high));
    }
    if (stilePosition && orientation === 'horizontal') {
      cx += side === 'right' ? -along / 2 : along / 2;
    }
  }

  const count = drawer ? overrides.pullCount ?? 1 : 1;
  const section = face.width / count;
  const halfWidth = (orientation === 'horizontal' ? along : across) / 2;
  const halfHeight = (orientation === 'horizontal' ? across : along) / 2;
  for (let i = 0; i < count; i++) {
    const left = face.x + section * i;
    const center = { x: drawer ? left + section / 2 : cx, z: cz };
    result.centers.push(center);
    if (center.x - halfWidth < left - EPS || center.x + halfWidth > left + section + EPS
      || center.z - halfHeight < face.z - EPS
      || center.z + halfHeight > face.z + face.height + EPS) {
      if (!result.warnings.includes('pull-too-long')) result.warnings.push('pull-too-long');
    }
  }
  return result;
}

/** Resolved pull placements and face warnings in run drawing order. */
export function runPulls(room, wall, run, settings, scene = runScene(room, wall, run, settings),
  details = runDoorDetails(room, wall, run, settings, scene)) {
  const pulls = [];
  const warnings = [];
  const parts = new Map(details.parts.map((part) => [part.key, part]));
  const levelsWall = wallViewForRun(wall, run);
  for (const [pieceId, layout] of scene.faceLayouts) {
    const item = layout.box.columnId ? findLeaf(run.grid, pieceId)
      : runItems(run).find((candidate) => candidate.id === pieceId);
    for (const face of layout.faces) {
      const partType = pullPartType(face.type);
      if (!partType) continue;
      const node = getFaceNode(item?.face ?? defaultFace(layout.box.width, settings), face.path);
      const resolved = resolvePull(settings, partType,
        cabinetFaceLevels(room, levelsWall, run, item, node).slice(0, 4));
      if (resolved.pullId === 'none') continue;
      const { path, half = null } = face;
      const identity = { pieceId, path, ...(half ? { half } : {}) };
      warnings.push(...resolved.warnings.map(({ code }) => ({ code, ...identity })));
      const part = parts.get(`${pieceId}:${path}${half ? `:${half}` : ''}`);
      const placement = facePullPlacement({ face, part, pull: resolved.pull,
        pullHeight: item?.pullHeight ?? settings?.pullHeight ?? 45, overrides: node ?? {} });
      warnings.push(...placement.warnings.map((code) => ({ code, ...identity })));
      if (!placement.centers.length) continue;
      pulls.push({ partId: `${pieceId}:${path}${half ?? ''}`, pieceId, path, half,
        pullId: resolved.pullId, kind: resolved.pull.kind, ...pullSize(resolved.pull),
        orientation: placement.orientation, at: placement.at, centers: placement.centers });
    }
  }
  return { pulls, warnings };
}

/** Closed pull outlines in wall inches, with bulges on the outgoing segments. */
export function pullOutlines({ kind, orientation, along: L, across: W, centers }) {
  return centers.map(({ x: cx, z: cz }) => {
    if (kind === 'knob') return [[cx + L / 2, cz, 1], [cx - L / 2, cz, 1]];
    if (kind === 'tab' || L < W) {
      return [
        [cx - L / 2, cz - W / 2], [cx + L / 2, cz - W / 2],
        [cx + L / 2, cz + W / 2], [cx - L / 2, cz + W / 2],
      ];
    }
    const r = W / 2;
    if (orientation === 'vertical') {
      const z0 = cz - L / 2 + r;
      const z1 = cz + L / 2 - r;
      return [[cx + r, z0], [cx + r, z1, 1], [cx - r, z1], [cx - r, z0, 1]];
    }
    const x0 = cx - L / 2 + r;
    const x1 = cx + L / 2 - r;
    return [[x0, cz - r], [x1, cz - r, 1], [x1, cz + r], [x0, cz + r, 1]];
  });
}

/** Pulls on one resolved wall face, optionally limited to the drawn part ids. */
export function elevationPulls(room, wall, side, settings, partIds = null) {
  if (!doorDrawing(room).pulls) return [];
  const view = resolveWall(room, wall, side);
  const result = [];
  for (const run of view.runs) {
    for (const entry of runPulls(room, view, run, settings).pulls) {
      if (partIds && !partIds.has(entry.partId)) continue;
      result.push({ partId: entry.partId, outlines: pullOutlines(entry) });
    }
  }
  return result;
}
