import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from '../doorStyles.js';
import { applyDesignDefaults } from '../doorStyleEdits.js';
import { partSizes } from '../doorSizes.js';
import { isDoorDesign, isDoorDesignList, SEEDED_DESIGN_IDS } from '../doorDesigns.js';
import { MICRO_SHAKER } from './fixtures/microShakerDesign.js';

const five = DOOR_DESIGNS[0];
const micro = MICRO_SHAKER;
const microStyle = () => applyDesignDefaults(DEFAULT_DOOR_STYLE, five, micro);

describe('Step 530 Micro Shaker', () => {
  it('is a team design, not a built-in: valid beside the built-ins and never seeded', () => {
    expect(DOOR_DESIGNS.map(({ id }) => id)).not.toContain('micro-shaker');
    expect(SEEDED_DESIGN_IDS).not.toContain('micro-shaker');
    expect(isDoorDesign(micro)).toBe(true);
    expect(isDoorDesignList([...DOOR_DESIGNS, micro])).toBe(true);
  });

  it('applies the Micro Shaker defaults to the standard 5PC style (anchor 2)', () => {
    expect(micro).toMatchObject({
      code: 'Micro Shaker', description: 'Micro shaker, 1 1/2" stiles & rails',
      construction: 'five_piece', slabCore: null, panelJoint: 'square',
      topRail: { shape: 'flat' }, bottomRail: { shape: 'flat' },
      slots: ['outside', 'inside', 'panel', 'applied'],
    });
    expect(microStyle()).toEqual({
      ...DEFAULT_DOOR_STYLE,
      designId: 'micro-shaker', thickness: 0.8125,
      stiles: { left: 1.5, right: 1.5 }, rails: { top: 1.5, bottom: 1.5 },
      panel: { type: 'flat', thickness: 0.625 },
      shortFace: { ...DEFAULT_DOOR_STYLE.shortFace, slabBelow: 3.9375 },
    });
  });

  it('keeps 1 1/2" rails and stiles on a 24 × 4 front (anchor 3)', () => {
    const style = microStyle();
    expect(style.shortFace).toEqual({ minPanel: 2.125, minRail: 1.625, slabBelow: 3.9375, step: 0.0625 });
    expect(partSizes(style, micro, { width: 24, height: 4 })).toMatchObject({
      construction: 'five_piece', slab: null,
      rails: { top: 1.5, bottom: 1.5 }, stiles: { left: 1.5, right: 1.5 },
      opening: { width: 21, height: 1 },
      sources: { top: 'style', bottom: 'style', left: 'style', right: 'style' },
    });
    expect(partSizes(style, micro, { width: 24, height: 3.9375 }).construction).toBe('five_piece');
  });

  it('uses hardwood Slab below the editable threshold on a 24 × 3.875 front (anchor 4)', () => {
    const style = microStyle();
    expect(partSizes(style, micro, { width: 24, height: 3.875 })).toEqual({
      construction: 'slab', slab: 'rule', molding: false, designId: 'slab',
    });
    const lowered = { ...style, shortFace: { ...style.shortFace, slabBelow: 3.75 } };
    expect(partSizes(lowered, micro, { width: 24, height: 3.875 }).rails).toEqual({ top: 1.5, bottom: 1.5 });
  });
});
