import { isPlainObject } from '@reduxjs/toolkit';

const isText = (value) => typeof value === 'string' && value.length > 0;

function isLegShape(leg) {
  if (Object.hasOwn(leg, 'shapeId')) return isText(leg.shapeId) && !Object.hasOwn(leg, 'square');
  const square = leg.square;
  return Boolean(square) && typeof square === 'object' && !Array.isArray(square)
    && Object.entries(square).every(([key, value]) => ['w', 'd'].includes(key)
      && Number.isFinite(value) && value > 0);
}

function isLegFill(fill) {
  if (!fill || typeof fill !== 'object' || Array.isArray(fill)
    || !['panel', 'filler'].includes(fill.type)) return false;
  if (fill.type === 'filler') return Object.keys(fill).every((key) => key === 'type');
  const keys = ['type', 'inset', 'top', 'bottom', 'past', 'returns', 'returnDepth'];
  return Object.keys(fill).every((key) => keys.includes(key))
    && ['inset', 'top', 'bottom'].every((key) => !Object.hasOwn(fill, key)
      || (Number.isFinite(fill[key]) && fill[key] >= 0))
    && (!Object.hasOwn(fill, 'past') || fill.past === true)
    && (!Object.hasOwn(fill, 'returns') || ['front', 'back', 'both'].includes(fill.returns))
    && (!Object.hasOwn(fill, 'returnDepth') || (Object.hasOwn(fill, 'returns')
      && Number.isFinite(fill.returnDepth) && fill.returnDepth > 0));
}

/** Hand-placed legs cannot own fills; run ends derive them while their fit is active. */
export function isLeg(leg) {
  if (!leg || typeof leg !== 'object' || Array.isArray(leg)
    || !isText(leg.id) || !isLegShape(leg)
    || !['left', 'right'].includes(leg.from) || !Number.isFinite(leg.x)
    || !['front', 'back'].includes(leg.yFrom) || !Number.isFinite(leg.y)
    || !(leg.height === 'full' || leg.height === 'feet'
      || (Number.isFinite(leg.height) && leg.height > 0))
    || (leg.mirror !== undefined && leg.mirror !== true)
    || (leg.mirrorDepth !== undefined && leg.mirrorDepth !== true)
    || (leg.takesRoom !== undefined && leg.takesRoom !== false)
    || (leg.sitsOn !== undefined && !['base', 'countertop'].includes(leg.sitsOn))
    || Object.hasOwn(leg, 'fill')) return false;
  return true;
}

const SPEC_KEYS = ['shapeId', 'square', 'height', 'x', 'y', 'sitsOn', 'takesRoom', 'mirror', 'mirrorDepth'];
const SIDE_KEYS = ['legs', 'front', 'back', 'fit', 'panel'];

/** End legs store only their specs; side and edge belong to the end. */
export function isEndLegs(value) {
  return isPlainObject(value) && Object.keys(value).length > 0
    && Object.entries(value).every(([side, end]) => {
      if (!['left', 'right'].includes(side) || !isPlainObject(end)
        || !Object.keys(end).every((key) => SIDE_KEYS.includes(key))
        || !['front', 'back', 'both'].includes(end.legs)) return false;
      for (const edge of ['front', 'back']) {
        const present = end.legs === edge || end.legs === 'both';
        if (Object.hasOwn(end, edge) !== present) return false;
        if (present && (!isPlainObject(end[edge])
          || !Object.keys(end[edge]).every((key) => SPEC_KEYS.includes(key))
          || !isLeg({ ...end[edge], id: 'x', from: side, yFrom: edge }))) return false;
      }
      if (Object.hasOwn(end, 'fit')
        && !(end.fit === 'between' && end.legs === 'both')
        && !(end.fit === 'behind' && end.legs !== 'back')) return false;
      return !Object.hasOwn(end, 'panel') || (end.fit === 'between'
        && isPlainObject(end.panel) && !Object.hasOwn(end.panel, 'type')
        && isLegFill({ type: 'panel', ...end.panel }));
    });
}

/** A run end piece suppresses the stored fit until that end is None again. */
export function endFit(run, side) {
  return run.ends?.[side]?.type === 'none' ? run.endLegs?.[side]?.fit : undefined;
}

export function endPieceType(run, side) {
  const fit = endFit(run, side);
  return fit === 'between' ? 'end_panel' : fit === 'behind' ? 'filler' : run.ends?.[side]?.type;
}

/** Derived ordinary legs in corner order, with handedness and active fills. */
export function endLegList(run) {
  return ['left', 'right'].flatMap((side) => {
    const end = run.endLegs?.[side];
    if (!end) return [];
    const fit = endFit(run, side);
    return ['front', 'back'].flatMap((edge) => {
      if (!end[edge]) return [];
      const { mirror, mirrorDepth, ...spec } = end[edge];
      return [{
        id: `${run.id}:endleg:${side}-${edge}`, ...spec, from: side, yFrom: edge,
        end: { side, edge },
        ...((side === 'left') !== (mirror === true) ? { mirror: true } : {}),
        ...((edge === 'back') !== (mirrorDepth === true) ? { mirrorDepth: true } : {}),
        ...(edge === 'front' && fit === 'between' ? { fill: { type: 'panel', ...end.panel } } : {}),
        ...(edge === 'front' && fit === 'behind' ? { fill: { type: 'filler' } } : {}),
      }];
    });
  });
}

export function runLegList(run) {
  return [...endLegList(run), ...(run.legs ?? [])];
}

/** Warning subjects keep hand-leg positions independent of the derived end legs. */
export function legWarningSubject(run, leg) {
  return leg.end
    ? { name: `${leg.end.side === 'left' ? 'Left' : 'Right'} ${leg.end.edge} leg` }
    : { index: run.legs.indexOf(leg) + 1 };
}

/** Presets replace the ends they name; One adds an ordinary hand-placed leg. */
export function legPresetEnds(preset, { shapeId, square, height = 'full', sitsOn, fit,
  proud = 0, backOffset = 0, leaveOut }, newId) {
  const spec = (edge) => ({
    ...(square ? { square: { ...square } } : { shapeId }), height, x: 0,
    y: edge === 'front' ? proud : backOffset, ...(sitsOn ? { sitsOn } : {}),
  });
  if (preset === 'one') return { endLegs: {}, legs: [{
    id: newId(), ...spec('front'), from: 'left', yFrom: 'front', mirror: true,
  }] };
  const corners = {
    four: ['LF', 'LB', 'RF', 'RB'], front: ['LF', 'RF'],
    three: ['LF', 'LB', 'RF', 'RB'].filter((corner) => corner !== leaveOut),
    left: ['LF', 'LB'], right: ['RF', 'RB'],
  }[preset] ?? [];
  const endLegs = {};
  for (const [side, letter] of [['left', 'L'], ['right', 'R']]) {
    const front = corners.includes(`${letter}F`);
    const back = corners.includes(`${letter}B`);
    if (!front && !back) continue;
    endLegs[side] = {
      legs: front && back ? 'both' : front ? 'front' : 'back',
      ...(front ? { front: spec('front') } : {}), ...(back ? { back: spec('back') } : {}),
      ...(fit === 'panel' && front && back ? { fit: 'between' } : {}),
      ...(fit === 'filler' && front ? { fit: 'behind' } : {}),
    };
  }
  return { endLegs, legs: [] };
}
