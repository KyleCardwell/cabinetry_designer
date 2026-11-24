import { bandOutline, frontContour } from './bandEnds.js';
import { returnX, angledBandX, landedReturns } from './cornerParts.js';
import { anchoredToCorner, cornerAt, crossingRuns, frontDepth, runBackOffset } from './corners.js';
import { dot, elevationToPlan, planPointToWallX, subtract } from './geometry.js';
import { runSide } from './runSide.js';
import { transformOutline } from './sectionProfileOutline.js';
import { elevationKey, returnsView } from './topology.js';

const EPSILON = 1e-6;
const SIDES = ['left', 'right'];
const PART_KINDS = { toeKick: 'toe_kick', furnitureBase: 'furniture_base', countertop: 'countertop',
  topMold: 'top_mold', crown: 'crown' };
const same = (a, b) => Math.abs(a - b) <= EPSILON;
const opposite = (side) => side === 'left' ? 'right' : 'left';

/**
 * Neighbours of each raw path entry, keyed by entry then left/right (corner and profile independently).
 * firstPass is a Map of entry -> { left, right } endRule results with profile neighbours disabled.
 * Only those rules decide whether a neighbour's end-view band fills back to its wall; no end drawing
 * or band-end builder is needed here. Omit firstPass for section-only corner lookups.
 */
export function pathNeighbors(room, settings, entries, firstPass = new Map()) {
  const pieces = new Map();
  const sidePieces = (entry) => {
    if (!pieces.has(entry.run)) pieces.set(entry.run, runSide(room, entry.view, entry.run, settings));
    return pieces.get(entry.run);
  };
  const bandPiece = (entry) => sidePieces(entry).find((piece) => piece.piece === PART_KINDS[entry.kind]
    && same(piece.z, entry.z) && (entry.kind !== 'furnitureBase' || same(piece.height, entry.height)));
  const matching = (entry, other) => entry.kind === other.kind && same(entry.z, other.z)
    && (entry.kind !== 'furnitureBase' || same(entry.height, other.height));
  const onFace = (entry, wallId, face) => entry.view.id === wallId && entry.view.side === face;
  const endPiece = (entry, side, returnEnd) => {
    const piece = bandPiece(entry);
    if (!piece || !(['countertop', 'topMold', 'crown'].includes(entry.kind)
      || (returnEnd && entry.kind === 'furnitureBase'))) return piece;
    const rule = firstPass.get(entry)?.[side];
    const returned = rule?.type === 'return' || (entry.kind === 'countertop' && rule?.type === 'waterfall');
    if (!returned) return piece;
    const back = runBackOffset(entry.run);
    return { ...piece, back, ...(piece.outline ? { outline: bandOutline(
      [[back, piece.z, 0], [back, piece.z + piece.height, 0]],
      frontContour(piece.outline), piece.z, piece.height,
    ) } : {}) };
  };
  const mapped = (piece, xOf, lo, hi) => {
    if (!piece) return null;
    const clamp = (x) => Math.min(hi, Math.max(lo, x));
    const xs = [clamp(xOf(piece.back)), clamp(xOf(piece.front))];
    const x = Math.min(...xs);
    const right = Math.max(...xs);
    if (right - x <= EPSILON) return null;
    return { x, right, ...(piece.outline ? { outline: transformOutline(piece.outline,
      ([depth, z]) => [clamp(xOf(depth)), z], xOf(1) < xOf(0)) } : {}) };
  };
  const result = new Map();
  for (const entry of entries) {
    const { run, view, frame } = entry;
    const length = frame.length;
    const depthOf = (point) => dot(subtract(point, frame.leftPoint), frame.n);
    const endView = returnsView(room, elevationKey(view.id, view.side)) === 'end';
    const ends = {};
    for (const side of SIDES) {
      const anchor = run.anchors?.[side];
      const candidates = [];
      const cut = (other, farSide, xOf, section = false, bandXOf) => {
        if (!matching(entry, other) || other.run.height <= 0) return;
        const piece = endView && !section ? endPiece(other, farSide, true) : bandPiece(other);
        if (!piece) return;
        const part = mapped(piece, bandXOf?.(piece) ?? xOf, 0, length);
        if (part) candidates.push({ kind: 'corner', entry: other, side: farSide,
          x: side === 'left' ? part.right : part.x,
          reach: side === 'left' ? part.x : part.right,
          ...(part.outline ? { outline: part.outline } : {}) });
      };
      if (anchor === true) {
        const corner = cornerAt(room, view, side);
        const sine = Math.sin(corner.angle * Math.PI / 180);
        if (corner.type === 'inside' && Math.abs(sine) >= 1e-9) {
          const others = entries.filter((other) => onFace(other, corner.neighborWallId, corner.neighborWallSide));
          for (const other of others) {
            if (!anchoredToCorner(other.run.anchors?.[corner.neighborSide], corner)) continue;
            const endX = corner.neighborSide === 'left' ? other.run.x : other.run.x + other.run.width;
            cut(other, opposite(corner.neighborSide), returnX(frame, other.frame,
              side === 'left' ? 0 : length, corner.neighborSide === 'left' ? 0 : other.frame.length, endX),
            false, angledBandX(room, view, side, other.view, other.run, corner, settings));
          }
          const crossing = new Set(crossingRuns(room, corner));
          for (const other of others.filter((other) => crossing.has(other.run))) {
            cut(other, opposite(corner.neighborSide),
              (offset) => side === 'left' ? offset / sine : length - offset / sine, true);
          }
        }
      } else if (anchor?.to === 'wall') {
        for (const landed of landedReturns(room, view)) {
          if (!landed.key.startsWith(`landing:${anchor.wallId}:${side}:`)) continue;
          for (const other of entries.filter((other) => other.run === landed.run
            && onFace(other, landed.landedView.id, landed.landedView.side))) {
            cut(other, landed.end, landed.xOf);
          }
        }
      }
      const corner = candidates.reduce((best, other) => !best
        || (side === 'left' ? other.x > best.x : other.x < best.x) ? other : best, null);

      const source = view.sideSource ?? view;
      const connected = new Set(['start', 'end'].map((endpoint) => source.connections?.[endpoint]?.wallId));
      const profiles = [];
      for (const other of entries) {
        if (!connected.has(other.view.id) || other.run.recessId || !matching(entry, other)) continue;
        const project = (piece) => [other.run.x, other.run.x + other.run.width].flatMap((x) =>
          [piece.back, piece.front].map((offset) => elevationToPlan(other.frame, x, offset)));
        const body = sidePieces(other).filter((piece) => ['box', 'faces'].includes(piece.piece));
        const bodyPoints = body.flatMap(project);
        if (!bodyPoints.length || Math.max(...bodyPoints.map(depthOf)) <= EPSILON) continue;
        const farSide = depthOf(elevationToPlan(other.frame, other.run.x, 0))
          > depthOf(elevationToPlan(other.frame, other.run.x + other.run.width, 0)) ? 'left' : 'right';
        const endX = farSide === 'left' ? other.run.x : other.run.x + other.run.width;
        const xOf = (depth) => planPointToWallX(frame, elevationToPlan(other.frame, endX, depth));
        const piece = endPiece(other, farSide, false);
        if (!piece) continue;
        for (const past of SIDES) {
          const bounds = (p) => {
            const points = project(p);
            const xs = points.map((point) => planPointToWallX(frame, point));
            const x = past === 'left' ? Math.min(...xs) : Math.max(Math.min(...xs), length);
            const right = past === 'left' ? Math.min(Math.max(...xs), 0) : Math.max(...xs);
            return right - x > EPSILON ? { x, right, front: Math.max(...points.map(depthOf)) } : null;
          };
          const bodies = body.filter((p) => Math.min(run.z + run.height, p.z + p.height)
            - Math.max(run.z, p.z) > EPSILON).map(bounds).filter(Boolean);
          if (!bodies.length) continue;
          const near = side === 'left' ? Math.max(...bodies.map((p) => p.right))
            : Math.min(...bodies.map((p) => p.x));
          if (!same(near, side === 'left' ? run.x : run.x + run.width)) continue;
          const faces = body.find((p) => p.piece === 'faces');
          const faceBounds = faces && bounds(faces);
          const bandBounds = bounds(piece);
          if (!faceBounds || !bandBounds) continue;
          const part = { ...bandBounds, ...(piece.outline ? { outline: transformOutline(piece.outline,
            ([depth, z]) => [Math.min(bandBounds.right, Math.max(bandBounds.x, xOf(depth))), z],
            xOf(1) < xOf(0)) } : {}) };
          const front = Math.max(...bodies.map((p) => p.front));
          profiles.push({ other, farSide, part, faceBounds, front });
        }
      }
      const profile = profiles.reduce((best, other) => !best || other.front > best.front ? other : best, null);
      let joint = null;
      if (profile) {
        const { other, farSide, part, faceBounds, front } = profile;
        const ownFront = frontDepth(run, settings);
        const relation = ownFront > front + 1 / 32 ? 'free' : Math.abs(ownFront - front) <= 1 / 32 ? 'through' : 'cope';
        const far = side === 'left' ? part.x : part.right;
        const face = side === 'left' ? faceBounds.x : faceBounds.right;
        const edge = side === 'left' ? run.x : run.x + run.width;
        const facing = side === 'left' ? -1 : 1;
        const end = relation === 'through' ? { type: 'return', x: far, side: face, facing,
          ...(part.outline ? { outline: part.outline } : {}) }
          : relation === 'cope' ? { type: 'cope', x: edge + face - far, side: edge, facing: -facing,
            ...(part.outline ? { outline: transformOutline(part.outline, ([x, z]) => [edge + face - x, z], true) } : {}) } : null;
        joint = { kind: 'profile', entry: other, side: farSide, relation, x: far,
          ...(part.outline ? { outline: part.outline } : {}), ...(end ? { end } : {}) };
      }
      ends[side] = { corner, profile: joint };
    }
    result.set(entry, ends);
  }
  return result;
}
