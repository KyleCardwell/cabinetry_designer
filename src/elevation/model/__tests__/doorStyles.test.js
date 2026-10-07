import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import {
  DEFAULT_DOOR_STYLE,
  DOOR_DESIGNS,
  findDoorDesign,
  isDoorStyle,
  isDoorStyleList,
  isPartSizes,
  isStyleRef,
  teamDoorStyle,
} from '../doorStyles.js';

const style = (patch = {}) => ({ ...DEFAULT_DOOR_STYLE, id: 'ds-a', label: 'A', ...patch });

describe('SPEC-46 door designs and the team default style', () => {
  it('seeds a 5-piece square design and a slab design', () => {
    expect(DOOR_DESIGNS.map(({ id, code, construction, slots }) => [id, code, construction, slots])).toEqual([
      ['five-piece-square', '5PC', 'five_piece', ['outside', 'inside', 'panel', 'applied']],
      ['slab', 'Slab', 'slab', ['outside', 'applied']],
    ]);
    expect(findDoorDesign('slab')).toBe(DOOR_DESIGNS[1]);
    expect(findDoorDesign('110')).toBeNull();
    expect(findDoorDesign('110', [{ ...DOOR_DESIGNS[0], id: '110', code: '110' }]).code).toBe('110');
  });

  it('defaults to square 3" stiles and rails, 13/16" thick, flat panel', () => {
    expect(DEFAULT_DOOR_STYLE).toEqual({
      id: 'default',
      label: 'Std',
      name: 'Team default',
      designId: 'five-piece-square',
      thickness: 0.8125,
      stiles: { left: 3, right: 3 },
      rails: { top: 3, bottom: 3 },
      mid: { extra: 0 },
      panel: { type: 'flat', thickness: 0.25 },
      profiles: { outside: null, inside: null, panel: null, applied: null },
      arch: { rise: 2 },
      shortFace: { minPanel: 2.125, minRail: 1.625, slabBelow: 4.8125, step: 0.0625 },
    });
    expect(isDoorStyle(DEFAULT_DOOR_STYLE)).toBe(true);
  });

  it('takes the team default thickness from settings.doorThickness until the team style screen (46.3)', () => {
    expect(teamDoorStyle(DEFAULT_SETTINGS)).toEqual(DEFAULT_DOOR_STYLE);
    expect(teamDoorStyle({ ...DEFAULT_SETTINGS, doorThickness: 1 }).thickness).toBe(1);
    expect(teamDoorStyle({}).thickness).toBe(0.8125);
    expect(DEFAULT_DOOR_STYLE.thickness).toBe(0.8125);
  });
});

describe('SPEC-46 door style shapes', () => {
  it('accepts a complete style, with or without a name, and rejects anything off', () => {
    const { name, ...unnamed } = style();
    void name;
    expect([style(), unnamed, style({ profiles: { inside: 'prof-og' } })].map(isDoorStyle)).toEqual([true, true, true]);
    expect([
      null,
      [],
      style({ id: '' }),
      style({ label: 7 }),
      style({ designId: undefined }),
      style({ thickness: 0 }),
      style({ rails: { top: 3 } }),
      style({ stiles: { left: 3, right: -1 } }),
      style({ mid: { extra: -0.125 } }),
      style({ panel: { type: 'cloud', thickness: 0.25 } }),
      style({ profiles: { crown: null } }),
      style({ profiles: { inside: 42 } }),
      style({ arch: { rise: 0 } }),
      style({ shortFace: { ...DEFAULT_DOOR_STYLE.shortFace, step: 0 } }),
      style({ color: 'red' }),
    ].map(isDoorStyle)).toEqual(Array(15).fill(false));
  });

  it('accepts a room\'s list with unique ids and labels, never "default"', () => {
    const A = style();
    const B = style({ id: 'ds-b', label: 'B', thickness: 1 });
    expect([undefined, [], [A, B]].map(isDoorStyleList)).toEqual([true, true, true]);
    expect([
      [A, { ...B, id: 'ds-a' }],
      [A, { ...B, label: 'A' }],
      [style({ id: 'default' })],
      [style({ thickness: 'thick' })],
      { a: A },
      null,
    ].map(isDoorStyleList)).toEqual(Array(6).fill(false));
  });

  it('takes a pick as absent, null or an id', () => {
    expect([undefined, null, 'ds-a'].map(isStyleRef)).toEqual([true, true, true]);
    expect(['', 5, {}].map(isStyleRef)).toEqual([false, false, false]);
  });

  it('checks per-part sizes: any stile or rail, mid rails and stiles, arch rise, notes', () => {
    expect([
      { rails: { top: 2.625, bottom: 2.625 } },
      { stiles: { left: 3.5 }, notes: { left: 'scribe' } },
      { midRails: [{ at: 31.5 }], midStiles: [{ at: 12, width: 3.625 }] },
      { archRise: 2.5 },
    ].map(isPartSizes)).toEqual([true, true, true, true]);
    expect([
      null,
      {},
      { rails: {} },
      { rails: { middle: 3 } },
      { rails: { top: 0 } },
      { stiles: { left: 'wide' } },
      { midRails: [] },
      { midRails: [{ width: 3 }] },
      { midStiles: [{ at: 12, width: 0 }] },
      { archRise: -1 },
      { notes: { left: '' } },
      { notes: { middle: 'scribe' } },
      { color: 'red' },
    ].map(isPartSizes)).toEqual(Array(13).fill(false));
  });
});
