import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_SLIDES, FACE_TYPES, isFaceNode, makeDrawerStack, resolveBoxSlide,
  setFaceDrawerBox, setFaceType, splitFace,
} from '../index.js';

const leaf = (type = 'drawer_front', patch = {}) => ({ type, size: null, ...patch });
const tree = () => ({ direction: 'vertical', size: null, children: [leaf(), leaf('door')] });
const settings = { slides: BUILT_IN_SLIDES, drawerSlideId: 'blum-562h' };
const missing = (level, slideId = 'gone') => ({ code: 'slide-missing', level, slideId });
const resolved = (slideId, source, warnings = []) => ({
  slideId, slide: BUILT_IN_SLIDES.find(({ id }) => id === slideId), source, warnings,
});

describe('IN5 step a drawer box picks', () => {
  it('validates nonempty box overrides only on drawer front leaves (anchor 1)', () => {
    expect(isFaceNode(leaf('drawer_front', { drawerBox: { height: 3.625 } }))).toBe(true);
    for (const drawerBox of [
      {}, { slideId: '' }, { height: 0 }, { width: 16 }, null, [], 'box',
      { height: -1 }, { height: Infinity }, { height: NaN }, { height: '3' }, { height: undefined },
      { depth: 0 }, { depth: -1 }, { depth: Infinity }, { depth: NaN }, { depth: '18' },
      { slideId: null }, { slideId: 1 }, { height: 3.625, width: 16 },
    ]) expect(isFaceNode(leaf('drawer_front', { drawerBox }))).toBe(false);
    const drawerBox = { slideId: 'archived-slide', height: 3.625, depth: 18.125 };
    for (const type of FACE_TYPES) {
      expect(isFaceNode(leaf(type, { drawerBox }))).toBe(type === 'drawer_front');
    }
    expect(isFaceNode({ ...tree(), drawerBox })).toBe(false);
    expect(isFaceNode({ ...tree(), children: [leaf('drawer_front', { drawerBox }), leaf()] })).toBe(true);
  });

  it('merges and clears box keys atomically, ignoring ineligible and invalid edits (anchor 2)', () => {
    const face = tree();
    const sized = setFaceDrawerBox(face, 'r.0', { height: 3.625 });
    expect(sized.children[0].drawerBox).toEqual({ height: 3.625 });
    const picked = setFaceDrawerBox(sized, 'r.0', { slideId: 'accuride-3832' });
    expect(picked.children[0].drawerBox).toEqual({ height: 3.625, slideId: 'accuride-3832' });
    expect(setFaceDrawerBox(picked, 'r.0', { height: null, slideId: null }).children[0])
      .not.toHaveProperty('drawerBox');
    const deep = setFaceDrawerBox(picked, 'r.0', { depth: 18.125, height: null });
    expect(deep.children[0].drawerBox).toEqual({ slideId: 'accuride-3832', depth: 18.125 });
    expect(face).toEqual(tree());
    for (const path of ['r', 'r.1', 'r.8']) expect(setFaceDrawerBox(picked, path, { height: 4 })).toBe(picked);
    for (const patch of [null, [], {}, { width: 16 }, { height: 0 }, { slideId: '' },
      { depth: Infinity }, { height: undefined }, { height: 4, depth: -1 }, { height: 3.625 }]) {
      expect(setFaceDrawerBox(picked, 'r.0', patch)).toBe(picked);
    }
    expect(setFaceDrawerBox(face, 'r.0', { depth: null })).toBe(face);
    expect(setFaceDrawerBox(leaf(), 'r', { depth: 18 }).drawerBox).toEqual({ depth: 18 });
  });

  it('keeps picks for the same type and drops them on a type change or split (anchor 3)', () => {
    const drawer = leaf('drawer_front', { drawerBox: { height: 3.625, slideId: 'accuride-3832' } });
    expect(setFaceType(drawer, 'r', 'drawer_front')).toEqual(drawer);
    for (const type of FACE_TYPES.filter((type) => type !== 'drawer_front')) {
      expect(setFaceType(drawer, 'r', type)).toEqual(leaf(type));
    }
    const face = { ...tree(), children: [drawer, leaf()] };
    for (const direction of ['horizontal', 'vertical']) {
      const split = splitFace(face, 'r.0', direction, 2);
      expect(isFaceNode(split)).toBe(true);
      expect(JSON.stringify(split)).not.toContain('drawerBox');
    }
    expect(splitFace(drawer, 'r', 'vertical', 2).children).toEqual([leaf(), leaf()]);
    expect(makeDrawerStack(drawer, 'r', 2).children).toEqual([leaf(), leaf()]);
  });

  it('resolves box, rule, cabinet and room slides in order (anchor 5)', () => {
    expect(resolveBoxSlide(settings, { cabinet: 'accuride-3832' })).toEqual(resolved('accuride-3832', 'cabinet'));
    expect(resolveBoxSlide(settings, { box: 'blum-562h', cabinet: 'accuride-3832' }))
      .toEqual(resolved('blum-562h', 'box'));
    expect(resolveBoxSlide(settings, { rule: 'accuride-4034', cabinet: 'accuride-3832' }))
      .toEqual(resolved('accuride-4034', 'rule'));
    expect(resolveBoxSlide(settings, { box: 'blum-562h', rule: 'accuride-4034' }))
      .toEqual(resolved('blum-562h', 'box'));
    const custom = { ...BUILT_IN_SLIDES[0], id: 'custom', sideClearance: 0.375 };
    expect(resolveBoxSlide({ ...settings, slides: [...BUILT_IN_SLIDES, custom] }, { rule: 'custom' }))
      .toEqual({ slideId: 'custom', slide: custom, source: 'rule', warnings: [] });
  });

  it('warns for missing picks and falls through to the next valid slide (anchor 6)', () => {
    expect(resolveBoxSlide(settings, { box: 'gone', cabinet: 'accuride-3832' }))
      .toEqual(resolved('accuride-3832', 'cabinet', [missing('box')]));
    expect(resolveBoxSlide({ ...settings, drawerSlideId: 'accuride-3832' }, {}))
      .toEqual(resolved('accuride-3832', 'room'));
    expect(resolveBoxSlide(settings, { cabinet: 'gone' }))
      .toEqual(resolved('blum-562h', 'room', [missing('cabinet')]));
    expect(resolveBoxSlide(settings, { box: 'gone', rule: 'gone-rule', cabinet: 'gone-cabinet' }))
      .toEqual(resolved('blum-562h', 'room', [missing('box'), missing('rule', 'gone-rule'), missing('cabinet', 'gone-cabinet')]));
    expect(resolveBoxSlide(settings, { rule: 'gone', cabinet: 'accuride-3832' }))
      .toEqual(resolved('accuride-3832', 'cabinet', [missing('rule')]));
    expect(resolveBoxSlide({ drawerSlideId: 'gone' })).toEqual(resolved('blum-562h', 'room'));
    const editedBlum = { ...BUILT_IN_SLIDES[0], sideClearance: 0.375 };
    expect(resolveBoxSlide({ slides: [editedBlum], drawerSlideId: 'gone' }).slide).toBe(editedBlum);
    expect(resolveBoxSlide()).toEqual(resolved('blum-562h', 'room'));
    expect(resolveBoxSlide(settings, { box: 'blum-562h', rule: 'gone', cabinet: 'gone' }).warnings).toEqual([]);
  });
});
