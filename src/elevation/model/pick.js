import { CABINET_TYPE_IDS, KIND_LABELS } from './constants.js';
import { faceFeatures } from './faceFeatures.js';
import { FACE_TYPE_LABELS } from './faces.js';
import { runScene } from './runScene.js';
import { wallLabel } from './topology.js';
import { formatInches } from './units.js';
import { wallEndPanels } from './wallEndPanels.js';

const PICK_EPSILON = 1e-6;
const RUN_LABELS = {
  [CABINET_TYPE_IDS.BASE]: 'Base run',
  [CABINET_TYPE_IDS.UPPER]: 'Upper run',
  [CABINET_TYPE_IDS.TALL]: 'Tall run',
};
const RECESS_LABELS = { recess: 'Recess', projection: 'Projection' };
const FEATURE_ORDER = { opening: 0, soffit: 1, recess: 2 };

function contains(rect, point) {
  return point.x >= rect.x - PICK_EPSILON
    && point.x <= rect.x + rect.width + PICK_EPSILON
    && point.z >= rect.z - PICK_EPSILON
    && point.z <= rect.z + rect.height + PICK_EPSILON;
}

function size(rect) {
  return `${formatInches(rect.width)} × ${formatInches(rect.height)}`;
}

/**
 * Everything under a point on an elevation (SPEC-39.1), front to back: faces, then pieces (as drawn,
 * T-fillers first), then runs, wall end panels, openings, soffits, recesses and projections, and last
 * the wall itself. `point` is in the view's coordinates ({ x, z }, inches). Each candidate:
 * { kind, key, label, rect, selection, facePath }, where `selection` is a setSelection payload
 * (null for the wall: clear the selection) and `facePath` is set only on faces.
 */
export function pickStack(room, wall, settings, point) {
  const faces = [];
  const pieces = [];
  const runs = [];
  for (const run of wall.runs) {
    const runRect = { x: run.x, z: run.z, width: run.width, height: run.height };
    const scene = runScene(room, wall, run, settings);
    for (const [pieceId, layout] of scene.faceLayouts) {
      const face = layout.faces.find((candidate) => contains(candidate, point));
      if (!face) continue;
      faces.push({
        kind: 'face',
        key: `face:${run.id}:${pieceId}:${face.path}`,
        label: `${FACE_TYPE_LABELS[face.type] ?? 'Face'} ${size(face)}`,
        rect: { x: face.x, z: face.z, width: face.width, height: face.height },
        selection: { runId: run.id, pieceId },
        facePath: face.path,
      });
    }
    const drawn = scene.drawnPieces.filter((piece) => !scene.hiddenIds.has(piece.id));
    for (const piece of [...drawn].reverse()) {
      if (!contains(piece, point)) continue;
      const name = piece.role === 'tee'
        ? 'T-filler'
        : scene.subLabels.get(piece.id) ?? KIND_LABELS[piece.kind] ?? 'Piece';
      pieces.push({
        kind: 'piece',
        key: `piece:${run.id}:${piece.id}`,
        label: `${name} ${size(piece)}`,
        rect: { x: piece.x, z: piece.z, width: piece.width, height: piece.height },
        selection: { runId: run.id, pieceId: piece.id },
        facePath: null,
      });
    }
    if (contains(runRect, point)) {
      runs.push({
        kind: 'run',
        key: `run:${run.id}`,
        label: `${RUN_LABELS[run.cabinetTypeId] ?? 'Run'} ${formatInches(run.width)}`,
        rect: runRect,
        selection: { runId: run.id },
        facePath: null,
      });
    }
  }
  const side = wall.side ?? 'front';
  const endPanels = wallEndPanels(room, wall, settings).flatMap((panel) => {
    const rect = { x: panel[side].x, z: 0, width: panel.width, height: panel.top };
    return contains(rect, point) ? [{
      kind: 'end_panel',
      key: `end_panel:${panel.endpoint}`,
      label: `Wall end panel ${size(rect)}`,
      rect,
      selection: { endPanel: panel.endpoint },
      facePath: null,
    }] : [];
  });
  const stored = wall.sideSource ?? wall;
  const features = faceFeatures(room, stored, side, settings).flatMap((feature) => {
    if (feature.kind === 'landing') return [];
    const rect = { x: feature.x, z: feature.bottom, width: feature.width, height: feature.top - feature.bottom };
    if (!contains(rect, point)) return [];
    if (feature.kind === 'opening') {
      const opening = stored.openings.find((candidate) => candidate.id === feature.id);
      return [{
        kind: 'opening',
        key: `opening:${feature.id}`,
        label: `${opening.kind === 'door' ? 'Door' : 'Window'} ${opening.label}`,
        rect,
        selection: { openingId: feature.id },
        facePath: null,
      }];
    }
    if (feature.kind === 'soffit') {
      return [{
        kind: 'soffit', key: `soffit:${feature.id}`, label: 'Soffit', rect,
        selection: { soffitId: feature.id }, facePath: null,
      }];
    }
    const recess = (stored.recesses ?? []).find((candidate) => candidate.id === feature.id);
    return [{
      kind: 'recess',
      key: `recess:${feature.id}`,
      label: `${RECESS_LABELS[feature.kind]} ${recess?.label ?? ''}`.trim(),
      rect,
      selection: { recessId: feature.id },
      facePath: null,
    }];
  }).sort((a, b) => FEATURE_ORDER[a.kind] - FEATURE_ORDER[b.kind]);
  return [
    ...faces,
    ...pieces,
    ...runs,
    ...endPanels,
    ...features,
    {
      kind: 'wall',
      key: 'wall',
      label: wallLabel(room, stored),
      rect: { x: 0, z: 0, width: wall.length, height: wall.height },
      selection: null,
      facePath: null,
    },
  ];
}

/**
 * What a click selects (SPEC-39.1): the `prefer`red kind if it's under the click (the canvas prefers
 * 'face' when the click landed on a face of the selected cabinet), else the front-most candidate that
 * isn't a face, which is what a click always selected.
 */
export function defaultPick(candidates, prefer = null) {
  return (prefer && candidates.find((candidate) => candidate.kind === prefer))
    || candidates.find((candidate) => candidate.kind !== 'face')
    || null;
}
