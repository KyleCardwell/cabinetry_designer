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
      faces: [{ path: 'r', type: 'door', x: 0.0625, z: 4.125, width: 17.875, height: 30.125 }],
      warnings: [],
    });
  });

  it('2. defaults to a pair door above 24 inches', () => {
    const { faces } = cabinetFaces({ id: 'a', face: null }, B30, BASE, DEFAULT_SETTINGS);
    const shared = { path: 'r', type: 'pair_door', z: 4.125, width: 14.875, height: 30.125 };
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
      { ...shared, path: 'r.0', z: 28.25, height: 6 },
      { ...shared, path: 'r.1', z: 16.1875, height: 11.9375 },
      { ...shared, path: 'r.2', z: 4.125, height: 11.9375 },
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
      { path: 'r.0.0', type: 'drawer_front', x: 0.0625, z: 28.25, width: 14.875, height: 6 },
      { path: 'r.0.1', type: 'drawer_front', x: 15.0625, z: 28.25, width: 14.875, height: 6 },
      { path: 'r.1', type: 'pair_door', half: 'left', x: 0.0625, z: 4.125, width: 14.875, height: 24 },
      { path: 'r.1', type: 'pair_door', half: 'right', x: 15.0625, z: 4.125, width: 14.875, height: 24 },
    ]);
  });

  it('6. treats the last child as auto when every child is fixed', () => {
    const face = stack([drawer(6), drawer(6)]);
    const { faces } = cabinetFaces({ id: 'a', face }, B18, BASE, DEFAULT_SETTINGS);
    expect(faces[1]).toMatchObject({ path: 'r.1', height: 24 });
  });

  it('7. warns when sections do not fit but still resolves them', () => {
    const face = stack([drawer(20), drawer(10), drawer()]);
    const result = cabinetFaces({ id: 'a', face }, B18, BASE, DEFAULT_SETTINGS);
    expect(result.faces).toHaveLength(3);
    expect(result.warnings).toEqual([{ code: 'face-too-small', path: 'r' }]);
  });
});

describe('isFaceNode', () => {
  it('8. accepts valid trees and rejects malformed nodes', () => {
    expect(isFaceNode(NESTED)).toBe(true);
    expect(isFaceNode(stack([drawer()]))).toBe(false);
    expect(isFaceNode({ type: 'shelf', size: null })).toBe(false);
    expect(isFaceNode({ type: 'door', size: -2 })).toBe(false);
    expect(isFaceNode({ type: 'door', size: null, children: [] })).toBe(false);
    expect(isFaceNode({ type: 'door' })).toBe(false);
  });
});

describe('applyHinges', () => {
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
