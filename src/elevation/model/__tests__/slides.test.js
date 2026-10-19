import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_SLIDES, BUILT_IN_SLIDE_IDS, DEFAULT_SETTINGS, SLIDE_MOUNTS,
  findSlide, fittingLength, isSlide, isSlideList, newSlide, slideBoxWidth,
} from '../index.js';
import { missingSlides, resolveSlide, roomSlideUses } from '../slides.js';
import { gridFromItems } from '../grid.js';
import { copySettings } from '../../store/slices/helpers.js';

const [blum, accuride3832, accuride4034] = BUILT_IN_SLIDES;

it('IN9 anchor 7: counts stored roll-out slide picks across nested interiors and cabinet grids', () => {
  const item = { slideId: 'x' };
  const cabinet = { id: 'c', kind: 'cabinet', interior: { rollouts: { count: 1, items: [item] } } };
  const room = { walls: [{ runs: [{ grid: gridFromItems('g', [cabinet]) }] }] };
  expect([...roomSlideUses(room)]).toEqual([{ node: item, key: 'slideId' }]);
  expect([...roomSlideUses(room)][0].node).toBe(item);
  expect(missingSlides(room, DEFAULT_SETTINGS)).toEqual([{ slideId: 'x', roomUses: 1, setIn: [] }]);

  const other = { height: 6, slideId: 'accuride-3832' };
  const group = (children) => ({
    direction: 'vertical', children, dividers: children.slice(1).map(() => ({ kind: 'fixed' })),
  });
  cabinet.interior = group([{}, group([
    { rollouts: { count: 2, items: [{}, item] } },
    { rollouts: { count: 1, items: [other] } },
  ])]);
  room.walls[0].runs[0].grid = gridFromItems('outer', [{
    id: 'wrapper', grid: gridFromItems('inner', [cabinet, { id: 'auto', kind: 'cabinet', purpose: 'sink' }]),
  }]);
  room.walls[0].runs.push({ grid: gridFromItems('back', [{
    id: 'back-c', kind: 'cabinet', interior: { rollouts: { count: 1, items: [{ slideId: 'x' }] } },
  }]) });
  const uses = [...roomSlideUses(room)];
  expect(uses.map(({ node, key }) => node[key])).toEqual(['x', 'accuride-3832', 'x']);
  expect(uses[0].node).toBe(item);
  expect(uses[1].node).toBe(other);
  expect(missingSlides(room, DEFAULT_SETTINGS)).toEqual([{ slideId: 'x', roomUses: 2, setIn: [] }]);
  expect([...roomSlideUses({})]).toEqual([]);
});

describe('IN4b step a slide model', () => {
  it('validates exact slide fields, bounded text, ascending lengths and estimator links (anchor 1)', () => {
    expect(isSlide(blum)).toBe(true);
    expect(isSlide({ ...blum, brand: '' })).toBe(true);
    expect(isSlide({ ...blum, hardwareSlideId: 3 })).toBe(true);
    expect(isSlide({ ...blum, cvName: '' })).toBe(false);
    for (const key of ['brand', 'model', 'description']) {
      for (const value of ['', 'x'.repeat(120)]) expect(isSlide({ ...blum, [key]: value })).toBe(true);
      for (const value of ['x'.repeat(121), ' x', 'x ', 3, null, undefined]) {
        expect(isSlide({ ...blum, [key]: value })).toBe(false);
      }
    }
    for (const key of ['sideClearance', 'minBelow', 'minAbove', 'height']) {
      expect(isSlide({ ...blum, [key]: 0 })).toBe(key !== 'height');
      for (const value of [-0.1, NaN, Infinity, -Infinity, '1', null, undefined]) {
        expect(isSlide({ ...blum, [key]: value })).toBe(false);
      }
    }
    for (const key of ['clips', 'softClose', 'heavyDuty']) {
      for (const value of [true, false]) expect(isSlide({ ...blum, [key]: value })).toBe(true);
      for (const value of [0, 'true', null, undefined]) expect(isSlide({ ...blum, [key]: value })).toBe(false);
    }
    for (const hardwareSlideId of [0, -1, 1.5, '3', Infinity, NaN, undefined]) {
      expect(isSlide({ ...blum, hardwareSlideId })).toBe(false);
    }
    for (const lengths of [
      [], null, {}, new Array(1), [{ nominal: 12 }, { nominal: 9 }], [{ nominal: 9 }, { nominal: 9 }],
      [{ nominal: 9, extra: 1 }], [{ nominal: 9, [Symbol('extra')]: 1 }], [Object.create({ nominal: 9 })],
      Array.from({ length: 41 }, (_, index) => ({ nominal: index + 1 })),
      ...['nominal', 'length', 'extension'].flatMap((key) =>
        [0, -1, NaN, Infinity, '9', null, undefined].map((value) => [{ nominal: 9, [key]: value }])),
    ]) expect(isSlide({ ...blum, lengths })).toBe(false);
    expect(isSlide({ ...blum, lengths: [{ nominal: 1, length: 2, extension: 3 }] })).toBe(true);
    expect(isSlide({ ...blum, lengths: Array.from({ length: 40 }, (_, index) => ({ nominal: index + 1 })) })).toBe(true);
    for (const key of Object.keys(blum)) {
      const missing = { ...blum };
      delete missing[key];
      expect(isSlide(missing)).toBe(false);
    }
    for (const slide of [
      { ...blum, mount: 'top' }, { ...blum, price: 5 }, { ...blum, name: ' Blum' },
      { ...blum, name: 'Blum ' }, { ...blum, name: '' }, { ...blum, id: '' },
      { ...blum, [Symbol('extra')]: true }, Object.create(blum), [], null, undefined,
    ]) expect(isSlide(slide)).toBe(false);
  });

  it('provides the confirmed built-ins and provisional 4034 dimensions (anchor 2)', () => {
    expect(SLIDE_MOUNTS).toEqual(['undermount', 'side']);
    expect(BUILT_IN_SLIDE_IDS).toEqual(['blum-562h', 'accuride-3832', 'accuride-4034']);
    expect(BUILT_IN_SLIDES.map(({ id }) => id)).toEqual(BUILT_IN_SLIDE_IDS);
    expect(blum).toEqual({
      id: 'blum-562h', name: 'Blum Tandem 562H', brand: 'Blum', model: '562H',
      description: 'Blum Tandem 562H soft-close', mount: 'undermount',
      lengths: [9, 12, 15, 18, 21, 24, 27, 30, 33, 36].map((nominal) =>
        nominal === 15 ? { nominal: 15, length: 15.515625, extension: 14.953125 } : { nominal }),
      sideClearance: 0.25, minBelow: 0.5625, minAbove: 0.25, height: 1,
      clips: true, softClose: true, heavyDuty: false, hardwareSlideId: null,
    });
    expect(accuride3832).toEqual({
      id: 'accuride-3832', name: 'Accuride 3832', brand: 'Accuride', model: '3832',
      description: 'Accuride 3832 full extension', mount: 'side',
      lengths: [{ nominal: 8, length: 8, extension: 8 }, ...[10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36]
        .map((nominal) => ({ nominal }))],
      sideClearance: 0.5, minBelow: 0.5625, minAbove: 0.25, height: 1.796875,
      clips: false, softClose: false, heavyDuty: true, hardwareSlideId: null,
    });
    expect(accuride3832.lengths).toHaveLength(15);
    expect(accuride4034).toEqual({
      ...accuride3832, id: 'accuride-4034', name: 'Accuride 4034', model: '4034',
      description: 'Accuride 4034 heavy duty',
      lengths: [8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36].map((nominal) => ({ nominal })),
    });
  });

  it('requires unique ids and names plus all built-ins with their original mounts (anchor 3)', () => {
    expect(isSlideList(BUILT_IN_SLIDES)).toBe(true);
    expect(isSlideList(BUILT_IN_SLIDES.map((slide) => ({ ...slide, name: `${slide.name} edited`, height: 2 })))).toBe(true);
    for (const list of [
      [blum, accuride3832], [blum, { ...accuride3832, mount: 'undermount' }, accuride4034],
      [{ ...blum, mount: 'side' }, accuride3832, accuride4034],
      [blum, accuride3832, { ...accuride4034, mount: 'undermount' }],
      [...BUILT_IN_SLIDES, { ...blum, id: 'x', name: 'blum tandem 562H' }],
      [...BUILT_IN_SLIDES, { ...blum, name: 'Other' }], [...BUILT_IN_SLIDES, null], [], null, {},
    ]) expect(isSlideList(list)).toBe(false);
  });

  it('deep-copies a slide with a unique name and no estimator link (anchor 4)', () => {
    const before = structuredClone(BUILT_IN_SLIDES);
    const copy = newSlide(BUILT_IN_SLIDES, blum, 'x');
    expect(copy).toEqual({ ...blum, id: 'x', name: 'Blum Tandem 562H copy', hardwareSlideId: null });
    expect(copy.lengths).not.toBe(blum.lengths);
    expect(copy.lengths[0]).not.toBe(blum.lengths[0]);
    expect(newSlide([...BUILT_IN_SLIDES, copy], blum, 'y').name).toBe('Blum Tandem 562H copy 2');
    expect(newSlide([...BUILT_IN_SLIDES, { ...copy, name: copy.name.toUpperCase() },
      { ...copy, id: 'y', name: 'Blum Tandem 562H copy 2' }], blum, 'z').name).toBe('Blum Tandem 562H copy 3');
    expect(newSlide([], { ...blum, hardwareSlideId: 3 }, 'new').hardwareSlideId).toBeNull();
    copy.lengths[0].nominal = 1;
    expect(BUILT_IN_SLIDES).toEqual(before);
  });

  it('fits nominal lengths within the depth tolerance and subtracts both side clearances (anchor 5)', () => {
    expect(fittingLength(blum, 23)).toBe(21);
    expect(fittingLength(blum, 8.5)).toBeNull();
    expect(fittingLength(accuride3832, 23)).toBe(22);
    expect(slideBoxWidth(blum, 16.5)).toBe(16);
    expect(slideBoxWidth(accuride3832, 16.5)).toBe(15.5);
    expect(fittingLength(blum, 15)).toBe(15);
    expect(fittingLength(blum, 15 - 0.5e-9)).toBe(15);
    expect(fittingLength(blum, 15 - 2e-9)).toBe(12);
    expect(fittingLength(blum, 100)).toBe(36);
  });

  it('looks up slides and independently clones default and custom settings libraries', () => {
    expect(findSlide('blum-562h', BUILT_IN_SLIDES)).toBe(blum);
    expect(findSlide('missing', BUILT_IN_SLIDES)).toBeNull();
    expect(DEFAULT_SETTINGS.slides).toBe(BUILT_IN_SLIDES);
    for (const settings of [undefined, { ...DEFAULT_SETTINGS, slides: undefined }, { ...DEFAULT_SETTINGS, slides: [accuride3832] }]) {
      const expected = settings?.slides ?? BUILT_IN_SLIDES;
      const copy = copySettings(settings);
      expect(copy.slides).toEqual(expected);
      expect(copy.slides).not.toBe(expected);
      expect(copy.slides[0]).not.toBe(expected[0]);
      expect(copy.slides[0].lengths).not.toBe(expected[0].lengths);
      expect(copy.slides[0].lengths[0]).not.toBe(expected[0].lengths[0]);
      copy.slides[0].lengths[0].nominal = 99;
      expect(expected[0].lengths[0].nominal).not.toBe(99);
    }
  });
});


describe('IN4b step d slide resolution', () => {
  it('resolves the selected slide, shop Blum, then the code built-in (anchor 2)', () => {
    expect(resolveSlide({ drawerSlideId: 'accuride-3832', slides: BUILT_IN_SLIDES })).toBe(accuride3832);
    expect(resolveSlide({ drawerSlideId: 'gone', slides: BUILT_IN_SLIDES })).toBe(blum);
    expect(resolveSlide({ drawerSlideId: 'accuride-3832' })).toBe(blum);
    const editedBlum = { ...blum, name: 'Shop Blum', sideClearance: 0.3125 };
    const custom = { ...accuride3832, id: 'custom', name: 'Shop slide' };
    expect(resolveSlide({ drawerSlideId: 'custom', slides: [editedBlum, custom] })).toBe(custom);
    expect(resolveSlide({ drawerSlideId: 'gone', slides: [editedBlum, custom] })).toBe(editedBlum);
    expect(resolveSlide({ drawerSlideId: 'gone', slides: [custom] })).toBe(blum);
    expect(resolveSlide({ slides: [] })).toBe(blum);
    expect(resolveSlide()).toBe(blum);
  });
});
