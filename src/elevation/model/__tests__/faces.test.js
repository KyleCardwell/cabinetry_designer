import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { applyHinges, cabinetFaces, isFaceNode } from '../faces.js';

const { BASE, UPPER } = CABINET_TYPE_IDS;
const B18 = { x: 0, z: 4, width: 18, height: 30.5 };
const B30 = { ...B18, width: 30 };
const U15 = { x: 0, z: 54, width: 15, height: 30 };

const drawer = (size = null) => ({ type: 'drawer_front', size });
const stack = (children, size = null) => ({ direction: 'vertical', size, children });
const NESTED = stack([
  { direction: 'horizontal', size: 6, children: [drawer(), drawer()] },
  { type: 'pair_door', size: null },
]);

describe('cabinetFaces', () => {
  it('1. defaults to a single door inside the base reveals', () => {
    expect(cabinetFaces({ id: 'a' }, B18, BASE, DEFAULT_SETTINGS)).toEqual({
      faces: [{ path: 'r', type: 'door', x: 0.0625, z: 4.125, width: 17.875, height: 30.25 }],
      warnings: [],
    });
  });

  it('2. defaults to a pair door above 24 inches', () => {
    const { faces } = cabinetFaces({ id: 'a', face: null }, B30, BASE, DEFAULT_SETTINGS);
    const shared = { path: 'r', type: 'pair_door', z: 4.125, width: 14.875, height: 30.25 };
    expect(faces).toEqual([
      { ...shared, half: 'left', x: 0.0625 },
      { ...shared, half: 'right', x: 15.0625 },
    ]);

    const at24 = cabinetFaces({ id: 'a' }, { ...B18, width: 24 }, BASE, DEFAULT_SETTINGS).faces;
    expect(at24).toHaveLength(1);
    expect(at24[0]).toMatchObject({ type: 'door', width: 23.875 });
  });

  it('3. resolves a 3Df stack top to bottom', () => {
    const face = stack([drawer(6), drawer(), drawer()]);
    const { faces } = cabinetFaces({ id: 'a', face }, B18, BASE, DEFAULT_SETTINGS);
    const shared = { type: 'drawer_front', x: 0.0625, width: 17.875 };
    expect(faces).toEqual([
      { ...shared, path: 'r.0', z: 28.375, height: 6 },
      { ...shared, path: 'r.1', z: 16.25, height: 12 },
      { ...shared, path: 'r.2', z: 4.125, height: 12 },
    ]);
  });

  it('4. applies the upper reveals, including the bottom overhang', () => {
    expect(cabinetFaces({ id: 'u' }, U15, UPPER, DEFAULT_SETTINGS).faces).toEqual([
      { path: 'r', type: 'door', x: 0.0625, z: 53.875, width: 14.875, height: 30 },
    ]);
  });

  it('5. resolves nested groups and pair door halves', () => {
    const { faces } = cabinetFaces({ id: 'a', face: NESTED }, B30, BASE, DEFAULT_SETTINGS);
    expect(faces).toEqual([
      { path: 'r.0.0', type: 'drawer_front', x: 0.0625, z: 28.375, width: 14.875, height: 6 },
      { path: 'r.0.1', type: 'drawer_front', x: 15.0625, z: 28.375, width: 14.875, height: 6 },
      { path: 'r.1', type: 'pair_door', half: 'left', x: 0.0625, z: 4.125, width: 14.875, height: 24.125 },
      { path: 'r.1', type: 'pair_door', half: 'right', x: 15.0625, z: 4.125, width: 14.875, height: 24.125 },
    ]);
  });

  it('6. treats the last child as auto when every child is fixed', () => {
    const face = stack([drawer(6), drawer(6)]);
    const { faces } = cabinetFaces({ id: 'a', face }, B18, BASE, DEFAULT_SETTINGS);
    expect(faces[1]).toMatchObject({ path: 'r.1', height: 24.125 });
  });

  it('7. warns when sections do not fit but still resolves them', () => {
    const face = stack([drawer(20), drawer(10), drawer()]);
    const result = cabinetFaces({ id: 'a', face }, B18, BASE, DEFAULT_SETTINGS);
    expect(result.faces).toHaveLength(3);
    expect(result.warnings).toEqual([{ code: 'face-too-small', path: 'r' }]);
  });

  it('HP1 anchor 7: carries actions to both pair halves and single doors', () => {
    const face = { type: 'pair_door', size: null, action: 'flipper' };
    const resolved = cabinetFaces({ face }, B30, BASE, DEFAULT_SETTINGS);
    const plain = cabinetFaces({ face: { type: 'pair_door', size: null } }, B30, BASE, DEFAULT_SETTINGS);
    expect(resolved).toEqual({ ...plain, faces: plain.faces.map((half) => ({ ...half, action: 'flipper' })) });
    const single = { type: 'door', size: null, action: 'pocket', hinge: 'right' };
    expect(cabinetFaces({ face: single }, B18, BASE, DEFAULT_SETTINGS).faces[0])
      .toMatchObject({ type: 'door', action: 'pocket', hinge: 'right' });
    expect(cabinetFaces({ face: { type: 'door', size: null, hinge: 'bottom' } }, B18, BASE, DEFAULT_SETTINGS).faces[0])
      .toMatchObject({ type: 'door', hinge: 'bottom' });
  });
});

describe('isFaceNode', () => {
  it('IN7.3 anchor 4: match is only valid on an auto group sized by its vertical parent', () => {
    const matched = { ...stack([drawer(), drawer()]), match: 'base' };
    expect(isFaceNode(stack([drawer(), matched]))).toBe(true);
    expect(isFaceNode(stack([drawer(), { ...matched, direction: 'horizontal' }]))).toBe(true);
    expect(isFaceNode(matched)).toBe(false);
    expect(isFaceNode({ ...drawer(), match: 'base' })).toBe(false);
    expect(isFaceNode(stack([drawer(), { ...drawer(), match: 'base' }]))).toBe(false);
    expect(isFaceNode({ ...stack([drawer(), matched]), direction: 'horizontal' })).toBe(false);
    for (const match of ['tall', null, undefined, true]) {
      expect(isFaceNode(stack([drawer(), { ...matched, match }]))).toBe(false);
    }
    expect(isFaceNode(stack([drawer(), { ...matched, size: 30 }]))).toBe(false);
  });

  it('8. accepts valid trees and rejects malformed nodes', () => {
    expect(isFaceNode(NESTED)).toBe(true);
    expect(isFaceNode(stack([drawer()]))).toBe(false);
    expect(isFaceNode({ type: 'shelf', size: null })).toBe(false);
    expect(isFaceNode({ type: 'door', size: -2 })).toBe(false);
    expect(isFaceNode({ type: 'door', size: null, children: [] })).toBe(false);
    expect(isFaceNode({ type: 'door' })).toBe(false);
  });

  it('HP1 anchor 5: validates hinge edges, door actions, and their combinations', () => {
    const door = { type: 'door', size: null };
    for (const fields of [
      { hinge: 'bottom' }, { hinge: 'top' }, { action: 'pullout' }, { action: 'sliding' },
      { action: 'flipper', hinge: 'left' }, { action: 'pocket', hinge: 'right' },
    ]) {
      expect(isFaceNode({ ...door, ...fields })).toBe(true);
    }
    for (const fields of [
      { action: 'pullout', hinge: 'left' }, { action: 'sliding', hinge: 'right' },
      { action: 'flipper', hinge: 'top' }, { action: 'pocket', hinge: 'bottom' },
      { action: 'swing' }, { action: null }, { action: 'unknown' }, { hinge: null },
    ]) {
      expect(isFaceNode({ ...door, ...fields })).toBe(false);
    }
    expect(isFaceNode({ type: 'drawer_front', size: null, action: 'flipper' })).toBe(false);
    expect(isFaceNode({ type: 'pair_door', size: null, hinge: 'left' })).toBe(false);
    expect(isFaceNode({ type: 'pair_door', size: null, action: 'pullout' })).toBe(false);
    for (const action of ['flipper', 'pocket', 'sliding']) {
      expect(isFaceNode({ type: 'pair_door', size: null, action })).toBe(true);
    }
    expect(isFaceNode({ ...NESTED, action: 'flipper' })).toBe(false);
    expect(isFaceNode({ ...NESTED, hinge: 'left' })).toBe(false);
    expect(isFaceNode(stack([door, { ...door, action: 'pullout', hinge: 'left' }]))).toBe(false);
  });
});

describe('applyHinges', () => {
  const door = { path: 'r', type: 'door', x: 0.0625, z: 0, width: 17.875, height: 30 };
  const noStops = { left: false, right: false };
  const noCovers = { left: 0, right: 0 };

  it('HP1 b anchor 1: hinges toward the one wall without needing a run centre', () => {
    for (const side of ['left', 'right']) {
      expect(applyHinges([door], noStops, noCovers, { wallSides: { [side]: true } }))
        .toEqual({ faces: [{ ...door, hinge: side, hingeRule: true }], warnings: [] });
    }
  });

  it('HP1 b anchor 2: swings, flippers and pockets hinge toward the nearer run end', () => {
    for (const action of [undefined, 'flipper', 'pocket']) {
      for (const [x, hinge] of [[0.0625, 'left'], [100.0625, 'right']]) {
        const face = { ...door, x, ...(action ? { action } : {}) };
        expect(applyHinges([face], noStops, noCovers, { runCenter: 60 }))
          .toEqual({ faces: [{ ...face, hinge, hingeRule: true }], warnings: [] });
      }
    }
  });

  it('HP1 b anchor 3: ties within 1e-6 hinge left', () => {
    for (const delta of [0, -0.5e-6, 0.5e-6, 2e-6]) {
      const face = { ...door, x: 60 - door.width / 2 + delta };
      expect(applyHinges([face], noStops, noCovers, { runCenter: 60 }).faces)
        .toEqual([{ ...face, hinge: delta > 1e-6 ? 'right' : 'left', hingeRule: true }]);
    }
  });

  it('HP1 b anchor 4: a stop takes precedence over a wall and the nearer end', () => {
    expect(applyHinges([door], { left: true, right: false }, noCovers, {
      wallSides: { right: true }, runCenter: 0,
    })).toEqual({ faces: [{ ...door, hinge: 'left', hingeRule: true }], warnings: [] });
  });

  it('HP1 b anchor 5: a covered side takes precedence over a wall without warning', () => {
    expect(applyHinges([door], noStops, { left: 0, right: 0.75 }, {
      wallSides: { right: true }, runCenter: 0,
    })).toEqual({ faces: [{ ...door, hinge: 'left', hingeRule: true }], warnings: [] });
  });

  it('HP1 b anchor 6: stored hinges win and top/bottom never warn about covered sides', () => {
    for (const hinge of ['top', 'bottom', 'left', 'right']) {
      const face = { ...door, hinge };
      const result = applyHinges([face], { left: true, right: false }, { left: 0.75, right: 0 }, {
        wallSides: { right: true }, runCenter: 60,
      });
      expect(result.faces).toEqual([face]);
      expect(result.faces[0]).not.toHaveProperty('hingeRule');
      expect(result.warnings).toEqual(hinge === 'left'
        ? [{ code: 'hinge-on-covered-side', path: 'r' }] : []);
    }
  });

  it('HP1 b anchor 7: sliding and pullout doors get no automatic hinge', () => {
    for (const action of ['pullout', 'sliding']) {
      const face = { ...door, action };
      expect(applyHinges([face], { left: true, right: false }, { left: 0, right: 0.75 }, {
        wallSides: { left: true }, runCenter: 60,
      })).toEqual({ faces: [face], warnings: [] });
    }
  });

  it('uses only walls a face touches and leaves pair doors and missing-context results alone', () => {
    const left = { ...door, path: 'r.0' };
    const right = { ...door, path: 'r.1', x: 18.0625 };
    expect(applyHinges([left, right], noStops, noCovers, { wallSides: { left: true } }).faces)
      .toEqual([{ ...left, hinge: 'left', hingeRule: true }, right]);
    expect(applyHinges([door], noStops, noCovers, { wallSides: { left: true, right: true } }).faces)
      .toEqual([door]);
    expect(applyHinges([door], noStops, noCovers).faces).toEqual([door]);
    const pair = [{ ...left, type: 'pair_door', half: 'left' }, { ...right, type: 'pair_door', half: 'right' }];
    expect(applyHinges(pair, noStops, noCovers, { wallSides: { left: true }, runCenter: 60 }))
      .toEqual({ faces: pair, warnings: [] });
  });

  it('applies hinge sides and validates hinges', () => {
    const faces = [
      { path: 'r.0', type: 'door', x: 0, z: 0, width: 10, height: 30 },
      { path: 'r.1', type: 'door', x: 10.125, z: 0, width: 10, height: 30 },
    ];
    const stopped = applyHinges(faces, { left: true, right: false }, { left: 0, right: 0 });
    expect(stopped.faces[0]).toEqual({ ...faces[0], hinge: 'left', hingeRule: true });
    expect(stopped.faces[1]).toBe(faces[1]);
    const covered = applyHinges(faces, { left: false, right: false }, { left: 0, right: 0.75 });
    expect(covered.faces[0]).toBe(faces[0]);
    expect(covered.faces[1]).toEqual({ ...faces[1], hinge: 'left', hingeRule: true });
    expect(covered.warnings).toEqual([]);
    expect(isFaceNode({ type: 'door', size: null, hinge: 'left' })).toBe(true);
    expect(isFaceNode({ type: 'drawer_front', size: null, hinge: 'left' })).toBe(false);
    expect(isFaceNode({ type: 'door', size: null, hinge: 'up' })).toBe(false);
  });
});
