/** Kyle's shop design (SPEC-50.19): a team's own 5-piece design with a square panel joint, not a built-in. */
export const MICRO_SHAKER = {
  id: 'micro-shaker',
  code: 'Micro Shaker',
  vendor: null,
  description: 'Micro shaker, 1 1/2" stiles & rails',
  construction: 'five_piece',
  slabCore: null,
  panelJoint: 'square',
  topRail: { shape: 'flat' },
  bottomRail: { shape: 'flat' },
  slots: ['outside', 'inside', 'panel', 'applied'],
  defaults: { thickness: 0.8125, stileWidth: 1.5, panelThickness: 0.625, slabBelow: 3.9375 },
};
