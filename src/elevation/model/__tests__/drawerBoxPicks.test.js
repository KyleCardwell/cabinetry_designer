import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_SLIDES, FACE_TYPES, isFaceNode, makeDrawerStack, resolveBoxSlide,
  setFaceAction, setFaceDrawerBox, setFaceType, splitFace,
} from '../index.js';

const leaf = (type = 'drawer_front', patch = {}) => ({ type, size: null, ...patch });
const tree = () => ({ direction: 'vertical', size: null, children: [leaf(), leaf('door')] });
const settings = { slides: BUILT_IN_SLIDES, drawerSlideId: 'blum-562h' };
const missing = (level, slideId = 'gone') => ({ code: 'slide-missing', level, slideId });
const resolved = (slideId, source, warnings = []) => ({
  slideId, slide: BUILT_IN_SLIDES.find(({ id }) => id === slideId), source, warnings,
});

describe('IN6 step a pull-out boxes', () => {
  it('anchor 1: permits pull-out box dimensions and rejects retired charging picks', () => {
    expect(isFaceNode(leaf('door', { action: 'pullout', drawerBox: { height: 12.125 } }))).toBe(true);
    expect(isFaceNode(leaf('door', { drawerBox: { height: 12.125 } }))).toBe(false);
    expect(isFaceNode(leaf('drawer_front', { drawerBox: { charging: true } }))).toBe(false);
    expect(isFaceNode(leaf('drawer_front', { drawerBox: { charging: false } }))).toBe(false);
    expect(isFaceNode(leaf('door', { action: 'pullout', drawerBox: { charging: true } }))).toBe(false);
    for (const charging of [null, undefined, 1, 'true']) {
      expect(isFaceNode(leaf('drawer_front', { drawerBox: { charging } }))).toBe(false);
    }
    for (const action of ['sliding', 'pocket', 'flipper']) {
      expect(isFaceNode(leaf('door', { action, drawerBox: { depth: 21 } }))).toBe(false);
    }
    expect(isFaceNode(leaf('pair_door', { action: 'pullout', drawerBox: { depth: 21 } }))).toBe(false);
  });

  it('anchor 2: patches pull-out boxes and ignores retired charging patches atomically', () => {
    const face = { ...tree(), children: [leaf(), leaf('door', { action: 'pullout' })] };
    const picked = setFaceDrawerBox(face, 'r.1', { depth: 21 });
    expect(picked.children[1].drawerBox).toEqual({ depth: 21 });
    for (const path of ['r.0', 'r.1']) {
      for (const patch of [{ charging: true }, { height: 12.125, charging: true }, { charging: null }]) {
        expect(setFaceDrawerBox(picked, path, patch)).toBe(picked);
      }
    }
    expect(setFaceDrawerBox(picked, 'r.1', { depth: null }).children[1]).not.toHaveProperty('drawerBox');
    expect(face.children[0]).not.toHaveProperty('drawerBox');
    expect(face.children[1]).not.toHaveProperty('drawerBox');
  });

  it('anchor 3: drops picks on type or action changes, retains qualifying picks, and starts splits empty', () => {
    const pullout = leaf('door', { action: 'pullout', drawerBox: { height: 12.125 } });
    for (const action of [null, 'swing', 'sliding', 'flipper', 'pocket']) {
      const changed = setFaceAction(pullout, 'r', action);
      expect(changed).not.toHaveProperty('drawerBox');
      expect(isFaceNode(changed)).toBe(true);
    }
    expect(setFaceAction(pullout, 'r', 'pullout')).toBe(pullout);
    expect(setFaceType(pullout, 'r', 'door')).toEqual(pullout);
    for (const type of FACE_TYPES.filter((type) => type !== 'door')) {
      expect(setFaceType(pullout, 'r', type)).toEqual(leaf(type));
    }
    const drawer = leaf('drawer_front', { drawerBox: { accessories: [{ accessoryId: 'a' }], depth: 18 } });
    expect(setFaceType(drawer, 'r', 'door')).toEqual(leaf('door'));
    for (const face of [pullout, drawer]) {
      for (const direction of ['horizontal', 'vertical']) {
        const split = splitFace(face, 'r', direction, 2);
        expect(isFaceNode(split)).toBe(true);
        expect(split.children).toEqual([leaf(face.type), leaf(face.type)]);
      }
      expect(makeDrawerStack(face, 'r', 2).children).toEqual([leaf(), leaf()]);
    }
    expect(pullout.drawerBox).toEqual({ height: 12.125 });
  });
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


describe('IN12c c drawer box accessories', () => {
  it('anchor 1: validates shared item lists only on drawer fronts', () => {
    expect(isFaceNode(leaf('drawer_front', { drawerBox: { accessories: [{ accessoryId: 'a' }] } }))).toBe(true);
    expect(isFaceNode(leaf('drawer_front', { drawerBox: { accessories: [] } }))).toBe(false);
    expect(isFaceNode(leaf('drawer_front', { drawerBox: { charging: true } }))).toBe(false);
    expect(isFaceNode(leaf('door', { action: 'pullout', drawerBox: { accessories: [{ accessoryId: 'a' }] } }))).toBe(false);
    for (const accessories of [null, [{ accessoryId: 'a', qty: 1 }], [{ accessoryId: 'a', qty: 21 }],
      [{ accessoryId: 'a' }, { accessoryId: 'a' }], [{ accessoryId: '' }],
      Array.from({ length: 13 }, (_, i) => ({ accessoryId: String(i) }))]) {
      expect(isFaceNode(leaf('drawer_front', { drawerBox: { accessories } }))).toBe(false);
    }
    expect(isFaceNode(leaf('drawer_front', { drawerBox: {
      accessories: Array.from({ length: 12 }, (_, i) => ({ accessoryId: String(i), qty: 20 })),
    } }))).toBe(true);
  });

  it('anchor 2: stores and clears items, prunes empty boxes, and rejects invalid patches atomically', () => {
    const face = tree();
    const accessories = [{ accessoryId: 'a', qty: 2 }];
    const picked = setFaceDrawerBox(face, 'r.0', { accessories });
    expect(picked.children[0].drawerBox).toEqual({ accessories });
    expect(setFaceDrawerBox(picked, 'r.0', { accessories: null }).children[0]).not.toHaveProperty('drawerBox');
    const sized = setFaceDrawerBox(picked, 'r.0', { depth: 20 });
    expect(setFaceDrawerBox(sized, 'r.0', { accessories: null }).children[0].drawerBox).toEqual({ depth: 20 });
    for (const patch of [{ accessories: [] }, { accessories: undefined }, { accessories, charging: true }]) {
      expect(setFaceDrawerBox(picked, 'r.0', patch)).toBe(picked);
    }
    const pullout = leaf('door', { action: 'pullout' });
    expect(setFaceDrawerBox(pullout, 'r', { accessories })).toBe(pullout);
    expect(face).toEqual(tree());
  });
});
