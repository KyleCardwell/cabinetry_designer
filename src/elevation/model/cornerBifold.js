import { flipHinges } from './faces.js';

/** A Corner 90 with one root door per leg shares one hinge and a pull choice. */
export function cornerBifold(run, side, legAFace) {
  const end = run.ends?.[side];
  if (end?.type !== 'corner' || (end.corner?.kind ?? 90) !== 90
    || legAFace?.type !== 'door'
    || ![null, undefined, 'door'].includes(end.corner?.legBFace)) return null;
  const hinge = ['left', 'right'].includes(legAFace.hinge) ? legAFace.hinge : null;
  const farA = side === 'left' ? 'right' : 'left';
  return {
    hinge,
    hingedLeg: hinge === null ? null : hinge === farA ? 'A' : 'B',
    pulls: end.corner?.pulls === 'both' ? 'both' : 'one',
  };
}

/** Bi-folds share A's hinge; other return faces keep their own type or flipped copy. */
export function cornerLegBFaceTree(run, side, legAFace) {
  const stored = run.ends?.[side]?.corner?.legBFace;
  const bifold = cornerBifold(run, side, legAFace);
  if (bifold) return stored ? { type: 'door', ...(bifold.hinge ? { hinge: bifold.hinge } : {}) }
    : { ...legAFace };
  return stored ? { type: stored } : legAFace ? flipHinges(legAFace) : null;
}
