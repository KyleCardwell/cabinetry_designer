import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import {
  applyStandardDrawers,
  cabinetReveals,
  isSingleColumn,
  isStyle,
  panelDrop,
  resolveStyle,
  stackedSeamReveals,
  standardDrawerHeight,
  styleReveals,
} from '../styles.js';

const { BASE, UPPER, TALL } = CABINET_TYPE_IDS;
const S = DEFAULT_SETTINGS;
const EURO = { cabinetStyleId: 13, beadWidth: 0.25, profiledEdge: false };
const INSET = { cabinetStyleId: 14, beadWidth: 0.25, profiledEdge: false };
const BEADED = { cabinetStyleId: 15, beadWidth: 0.25, profiledEdge: false };
const DOOR = { type: 'door', size: null };
const PAIR = { type: 'pair_door', size: null };
const THREE_DF = { direction: 'vertical', size: null, children: [{ type: 'drawer_front', size: 6 }, { type: 'drawer_front', size: null }, { type: 'drawer_front', size: null }] };
const DF_PD = { direction: 'vertical', size: null, children: [{ type: 'drawer_front', size: 6 }, PAIR] };
const SIDE = { direction: 'horizontal', size: null, children: [DOOR, DOOR] };

describe('styles', () => {
  it('26 resolveStyle layers room, run and item', () => {
    expect(resolveStyle(S)).toEqual(EURO);
    const room = { style: { cabinetStyleId: 14 } };
    expect(resolveStyle(S, room, { style: { profiledEdge: true } }, { style: { cabinetStyleId: 15, beadWidth: 0.375 } }))
      .toEqual({ cabinetStyleId: 15, beadWidth: 0.375, profiledEdge: true });
    expect(resolveStyle(S, room, { style: { cabinetStyleId: null } }, {})).toEqual(INSET);
  });

  it('27 isStyle', () => {
    [undefined, null, {}, { cabinetStyleId: 14 }, { beadWidth: 0 }, { profiledEdge: null }]
      .forEach((value) => expect(isStyle(value)).toBe(true));
    [{ cabinetStyleId: 12 }, { beadWidth: -1 }, { profiledEdge: 'yes' }, { color: 'red' }, [], 'x']
      .forEach((value) => expect(isStyle(value)).toBe(false));
  });

  it('28 European style reveals', () => {
    expect(styleReveals(EURO, BASE, S)).toEqual({
      top: 0.25, bottom: 0.125, left: 0.0625, right: 0.0625, horizontal: 0.125, vertical: 0.125, pair: 0.125, fit: 0, pairFit: 0,
    });
  });

  it('29 inset style reveals', () => {
    expect(styleReveals(INSET, BASE, S)).toEqual({
      top: 1.5, bottom: 1.5, left: 0.75, right: 0.75, horizontal: 1.5, vertical: 1.5, pair: 0, fit: 0, pairFit: 0,
    });
    expect(styleReveals(INSET, UPPER, S).bottom).toBe(0.75);
  });

  it('30 beaded, profiled upper', () => {
    expect(styleReveals({ cabinetStyleId: 15, beadWidth: 0.25, profiledEdge: true }, UPPER, S)).toEqual({
      top: 1.75, bottom: 1, left: 1, right: 1, horizontal: 2, vertical: 2, pair: 0.125, fit: 0.09375, pairFit: 0.0625,
    });
  });

  it('31 isSingleColumn', () => {
    expect(isSingleColumn(DOOR)).toBe(true);
    expect(isSingleColumn(PAIR)).toBe(false);
    expect(isSingleColumn(THREE_DF)).toBe(true);
    expect(isSingleColumn(DF_PD)).toBe(false);
    expect(isSingleColumn(SIDE)).toBe(false);
  });

  it('32 wood top rule is European only', () => {
    const euro = cabinetReveals({ style: EURO, cabinetTypeId: BASE, run: { top: 'wood' }, face: DOOR, settings: S });
    expect(euro.values.top).toBe(0.125);
    expect(euro.sources.top).toBe('rule:wood-top');
    const inset = cabinetReveals({ style: INSET, cabinetTypeId: BASE, run: { top: 'wood' }, face: DOOR, settings: S });
    expect(inset.values.top).toBe(1.5);
    expect(inset.sources.top).toBe('style');
  });

  it('33 upper bottom rules', () => {
    const plain = cabinetReveals({ style: EURO, cabinetTypeId: UPPER, run: {}, face: DOOR, settings: S });
    expect(plain.values.bottom).toBe(-0.125);
    expect(plain.sources.bottom).toBe('style');
    const flush = cabinetReveals({ style: EURO, cabinetTypeId: UPPER, run: { upperBottom: 'flush' }, face: DOOR, settings: S });
    expect(flush.values.bottom).toBe(0.125);
    expect(flush.sources.bottom).toBe('rule:upper-flush');
    const counter = cabinetReveals({ style: INSET, cabinetTypeId: UPPER, run: { upperBottom: 'counter' }, face: DOOR, settings: S });
    expect(counter.values.bottom).toBe(1.5);
    expect(counter.sources.bottom).toBe('rule:upper-counter');
  });

  it('34 captured single rule', () => {
    const both = { left: true, right: true };
    const hit = cabinetReveals({ style: EURO, cabinetTypeId: BASE, face: THREE_DF, captured: both, settings: S });
    expect([hit.values.left, hit.values.right]).toEqual([0.09375, 0.09375]);
    expect([hit.sources.left, hit.sources.right]).toEqual(['rule:captured-single', 'rule:captured-single']);
    const oneSide = cabinetReveals({ style: EURO, cabinetTypeId: BASE, face: DOOR, captured: { left: true, right: false }, settings: S });
    expect(oneSide.values.left).toBe(0.0625);
    const pair = cabinetReveals({ style: EURO, cabinetTypeId: BASE, face: PAIR, captured: both, settings: S });
    expect(pair.values.left).toBe(0.0625);
    const inset = cabinetReveals({ style: INSET, cabinetTypeId: BASE, face: DOOR, captured: both, settings: S });
    expect(inset.values.left).toBe(0.75);
  });

  it('35 manual overrides win', () => {
    const result = cabinetReveals({
      style: EURO, cabinetTypeId: BASE, run: { top: 'wood' }, face: DOOR, manual: { top: 0.1875, left: null }, settings: S,
    });
    expect(result.values.top).toBe(0.1875);
    expect(result.sources.top).toBe('manual');
    expect(result.values.left).toBe(0.0625);
    expect(result.sources.left).toBe('style');
  });

  it('36 panelDrop', () => {
    expect(panelDrop({ cabinetTypeId: UPPER }, EURO, S)).toBe(0.125);
    expect(panelDrop({ cabinetTypeId: UPPER, upperBottom: 'flush' }, EURO, S)).toBe(0);
    expect(panelDrop({ cabinetTypeId: UPPER, upperBottom: 'overhang' }, INSET, S)).toBe(0.75);
    expect(panelDrop({ cabinetTypeId: BASE }, EURO, S)).toBe(0);
  });

  it('53 stackedSeamReveals', () => {
    expect(stackedSeamReveals(EURO, S)).toEqual({ upperBottom: 0, lowerTop: 0.125 });
    expect(stackedSeamReveals(INSET, S)).toEqual({ upperBottom: 0.75, lowerTop: 0.75 });
    expect(stackedSeamReveals(BEADED, S)).toEqual({ upperBottom: 1, lowerTop: 1 });
    expect(stackedSeamReveals(EURO, { ...S, stackedUpperBottom: 0.0625 }).upperBottom).toBe(0.0625);
  });

  it('54 stacked seam rule', () => {
    const top = cabinetReveals({
      style: EURO, cabinetTypeId: TALL, face: DOOR,
      stacked: { top: true, bottom: false }, settings: S,
    });
    expect(top.values.top).toBe(0.125);
    expect(top.sources.top).toBe('rule:stacked-seam');
    expect(top.sources.bottom).toBe('style');

    const upper = cabinetReveals({
      style: EURO, cabinetTypeId: UPPER, run: { upperBottom: 'flush' }, face: DOOR,
      stacked: { top: false, bottom: true }, settings: S,
    });
    expect(upper.values.bottom).toBe(0);
    expect(upper.sources.bottom).toBe('rule:stacked-seam');

    const base = cabinetReveals({
      style: EURO, cabinetTypeId: BASE, run: { top: 'wood' }, face: DOOR,
      stacked: { top: true, bottom: false }, settings: S,
    });
    expect(base.sources.top).toBe('rule:stacked-seam');

    const inset = cabinetReveals({
      style: INSET, cabinetTypeId: TALL, face: DOOR,
      stacked: { top: true, bottom: true }, settings: S,
    });
    expect([inset.values.top, inset.values.bottom]).toEqual([0.75, 0.75]);

    const manual = cabinetReveals({
      style: EURO, cabinetTypeId: TALL, face: DOOR,
      stacked: { top: false, bottom: true }, manual: { bottom: -0.25 }, settings: S,
    });
    expect(manual.values.bottom).toBe(-0.25);
    expect(manual.sources.bottom).toBe('manual');
  });
});

describe('standard drawer heights', () => {
  const FOUR_DF = { direction: 'vertical', size: null, children: [{ type: 'drawer_front', size: 5.875 }, { type: 'drawer_front', size: 5.875 }, { type: 'drawer_front', size: null }, { type: 'drawer_front', size: null }] };

  it('51 standardDrawerHeight by style', () => {
    expect(standardDrawerHeight(EURO, S)).toBe(5.875);
    expect(standardDrawerHeight(INSET, S)).toBe(5);
    expect(standardDrawerHeight({ ...INSET, cabinetStyleId: 15 }, S)).toBe(5);
  });

  it('52 applyStandardDrawers changes fixed drawer and false fronts under 6"', () => {
    expect(applyStandardDrawers(FOUR_DF, INSET, S).children.map((child) => child.size)).toEqual([5, 5, null, null]);
    const mixed = { direction: 'vertical', size: null, children: [{ type: 'false_front', size: 4 }, { type: 'drawer_front', size: 6.5 }, { type: 'open', size: 3 }, { type: 'drawer_front', size: 5 }] };
    expect(applyStandardDrawers(mixed, EURO, S).children.map((child) => child.size)).toEqual([5.875, 6.5, 3, 5.875]);
    const tall = { direction: 'vertical', size: null, children: [{ type: 'door', size: null }, { ...FOUR_DF, size: 30.25 }] };
    const tallInset = applyStandardDrawers(tall, INSET, S);
    expect(tallInset.children[1].size).toBe(30.25);
    expect(tallInset.children[1].children.map((child) => child.size)).toEqual([5, 5, null, null]);
    expect(tallInset.children[0]).toBe(tall.children[0]);
    expect(applyStandardDrawers(FOUR_DF, EURO, S)).toBe(FOUR_DF);
    expect(applyStandardDrawers(DOOR, INSET, S)).toBe(DOOR);
    expect(applyStandardDrawers(null, INSET, S)).toBeNull();
  });
});
