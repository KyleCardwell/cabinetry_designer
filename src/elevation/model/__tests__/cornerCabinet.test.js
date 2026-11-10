import { describe, expect, it } from 'vitest';
import { cornerCabinetShape, cornerFaceLayout } from '../cornerCabinet.js';

describe('CC1 step b cornerCabinetShape', () => {
  it.each([
    ['upper', 24, 12],
    ['base', 36, 24],
  ])('anchor: equal-leg %s 45 cabinet', (_name, leg, depth) => {
    const shape = cornerCabinetShape({ kind: 45, legA: leg, legB: leg, depthA: depth, depthB: depth });
    expect(shape.kind).toBe(45);
    expect(shape.outline).toEqual([[0, 0], [leg, 0], [leg, depth], [depth, leg], [0, leg]]);
    expect(shape.shown).toEqual({ a: 12, b: 12 });
    expect(shape.trueWidth).toBeCloseTo(16.971, 3);
    expect(shape.angle).toBeCloseTo(45, 3);
    expect(shape.miters.a).toBeCloseTo(22.5, 3);
    expect(shape.miters.b).toBeCloseTo(22.5, 3);
    expect(shape.faces).toHaveLength(1);
    const [front] = shape.faces;
    expect(front).toMatchObject({ id: 'front', from: [leg, depth], to: [depth, leg] });
    expect(front.width).toBeCloseTo(16.971, 3);
    expect(front.normal[0]).toBeCloseTo(0.7071, 3);
    expect(front.normal[1]).toBeCloseTo(0.7071, 3);
  });

  it('anchor: uneven base 45 cabinet keeps the shallow miter at A', () => {
    const shape = cornerCabinetShape({ kind: 45, legA: 36, legB: 36, depthA: 24, depthB: 15 });
    expect(shape.kind).toBe(45);
    expect(shape.outline).toEqual([[0, 0], [36, 0], [36, 24], [15, 36], [0, 36]]);
    expect(shape.shown).toEqual({ a: 21, b: 12 });
    expect(shape.trueWidth).toBeCloseTo(24.187, 3);
    expect(shape.angle).toBeCloseTo(29.745, 3);
    expect(shape.miters.a).toBeCloseTo(14.872, 3);
    expect(shape.miters.b).toBeCloseTo(30.128, 3);
    expect(shape.faces).toHaveLength(1);
    const [front] = shape.faces;
    expect(front).toMatchObject({ id: 'front', from: [36, 24], to: [15, 36] });
    expect(front.width).toBeCloseTo(24.187, 3);
    expect(front.normal[0]).toBeCloseTo(0.4961, 3);
    expect(front.normal[1]).toBeCloseTo(0.8682, 3);
    expect(shape.trueWidth * Math.cos(shape.angle * Math.PI / 180)).toBeCloseTo(21, 3);
  });

  it('anchor: base 90 cabinet has two perpendicular faces', () => {
    expect(cornerCabinetShape({ kind: 90, legA: 36, legB: 36, depthA: 24, depthB: 24 })).toEqual({
      kind: 90,
      outline: [[0, 0], [36, 0], [36, 24], [24, 24], [24, 36], [0, 36]],
      faces: [
        { id: 'A', from: [24, 24], to: [36, 24], width: 12, normal: [0, 1] },
        { id: 'B', from: [24, 36], to: [24, 24], width: 12, normal: [1, 0] },
      ],
      shown: { a: 12, b: 12 },
      trueWidth: null, angle: null, miters: null,
    });
  });

  it('anchor: uneven 90 cabinet uses each shown width independently', () => {
    expect(cornerCabinetShape({ kind: 90, legA: 36, legB: 30, depthA: 24, depthB: 15 })).toEqual({
      kind: 90,
      outline: [[0, 0], [36, 0], [36, 24], [15, 24], [15, 30], [0, 30]],
      faces: [
        { id: 'A', from: [15, 24], to: [36, 24], width: 21, normal: [0, 1] },
        { id: 'B', from: [15, 30], to: [15, 24], width: 6, normal: [1, 0] },
      ],
      shown: { a: 21, b: 6 },
      trueWidth: null, angle: null, miters: null,
    });
  });

  it('anchor: a zero shown B returns only an error; either nonpositive width rejects both kinds', () => {
    expect(cornerCabinetShape({ kind: 45, legA: 24, legB: 24, depthA: 24, depthB: 12 }))
      .toEqual({ errors: [{ code: 'legs-too-short' }] });
    for (const kind of [45, 90]) {
      for (const [depthA, depthB] of [[12, 24], [12, 25], [24, 12], [25, 12]]) {
        expect(cornerCabinetShape({ kind, legA: 24, legB: 24, depthA, depthB }))
          .toEqual({ errors: [{ code: 'legs-too-short' }] });
      }
    }
  });

  it('defaults a missing kind to 90', () => {
    const dimensions = { legA: 36, legB: 30, depthA: 24, depthB: 15 };
    expect(cornerCabinetShape(dimensions)).toEqual(cornerCabinetShape({ ...dimensions, kind: 90 }));
  });
});

describe('CC3.1 step b cornerFaceLayout', () => {
  const base = { kind: 90, legA: 36, legB: 36, depthA: 24, depthB: 24,
    offsetA: 0.875, offsetB: 0.875, sideReveal: 1 / 16, gap: 1 / 8,
    diagonalReveal: 1 / 8, doors: 'equal' };

  it('anchor 1: equal 90 doors clear the other face and gap', () => {
    expect(cornerFaceLayout(base)).toEqual({
      a: { cornerReveal: 1 }, b: { cornerReveal: 1 }, shown: { a: 11.125, b: 11.125 },
    });
  });

  it.each([
    ['a_long', null, 1], ['b_long', 1, null],
  ])('anchor 2: %s keeps the long leg rule reveal', (doors, a, b) => {
    expect(cornerFaceLayout({ ...base, doors })).toMatchObject({
      a: { cornerReveal: a }, b: { cornerReveal: b },
    });
  });

  it('anchor 3: uneven 90 doors retain independent shown widths', () => {
    expect(cornerFaceLayout({ ...base, legB: 30, depthB: 15 })).toEqual({
      a: { cornerReveal: 1 }, b: { cornerReveal: 1 }, shown: { a: 20.125, b: 5.125 },
    });
  });

  it.each([
    ['base', 36, 24, 24, [36.2125, 25.025], [25.025, 36.2125], 15.8215, 15.5625, 0.1295, 11.1875],
    ['upper', 24, 12, 12, [24.2125, 13.025], [13.025, 24.2125], 15.8215, 15.5625, 0.1295, 11.1875],
    ['uneven', 36, 24, 15, [36.1043, 24.9482], [16.0668, 36.3982], 23.0782, 22.8125, 0.1329, 20.0375],
  ])('anchors 4–6: %s 45 measures between feet on the door face', (
    _name, leg, depthA, depthB, fa, fb, span, ordered, reveal, shownA,
  ) => {
    const result = cornerFaceLayout({ ...base, kind: 45, legA: leg, legB: leg, depthA, depthB });
    for (const [actual, expected] of [
      [result.feet.a[0], fa[0]], [result.feet.a[1], fa[1]],
      [result.feet.b[0], fb[0]], [result.feet.b[1], fb[1]],
      [result.span, span], [result.ordered, ordered], [result.reveal, reveal], [result.shown.a, shownA],
      [result.shown.b, fb[1] - fa[1]],
    ]) expect(actual).toBeCloseTo(expected, 3);
  });

  it('anchor 7: a sixteenth diagonal reveal orders the next eighth wider', () => {
    const result = cornerFaceLayout({ ...base, kind: 45, diagonalReveal: 1 / 16 });
    expect(result.ordered).toBeCloseTo(15.6875, 3);
    expect(result.reveal).toBeCloseTo(0.067, 3);
  });
});
