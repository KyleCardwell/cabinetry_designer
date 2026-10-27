import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { cabinetFaces, resolveFaces } from '../faces.js';

const AREA = { x: 0, z: 0, width: 30, height: 30 };
const REVEALS = {
  top: 0, bottom: 0, left: 0, right: 0, horizontal: 1.5, vertical: 1.5,
  fit: 3 / 32, pairFit: 1 / 16, pair: 1 / 8, shared: 1 / 16,
};
const DOOR = { type: 'door', size: null };
const STACK = {
  direction: 'vertical', size: null,
  children: [{ type: 'drawer_front', size: 6 }, DOOR],
};

describe('FX4 c1 square leaf paths', () => {
  it('anchor 1: preserves profiled fit when squarePaths is absent', () => {
    expect(resolveFaces(DOOR, AREA, REVEALS)).toEqual({
      faces: [{ path: 'r', type: 'door', x: 3 / 32, z: 3 / 32, width: 29.8125, height: 29.8125 }],
      warnings: [],
    });
  });

  it('anchor 2: passes squarePaths through cabinetFaces so a square door fills its slot', () => {
    expect(cabinetFaces({ face: DOOR }, AREA, CABINET_TYPE_IDS.BASE, DEFAULT_SETTINGS, {
      ...REVEALS, squarePaths: new Set(['r']),
    })).toEqual({
      faces: [{ path: 'r', type: 'door', ...AREA }], warnings: [],
    });
  });

  it('anchor 3: removes side fit, height fit and the pair gap from both square halves', () => {
    expect(resolveFaces({ type: 'pair_door', size: null }, AREA, {
      ...REVEALS, squarePaths: new Set(['r']),
    })).toEqual({
      faces: [
        { path: 'r', type: 'pair_door', half: 'left', x: 0, z: 0, width: 15, height: 30 },
        { path: 'r', type: 'pair_door', half: 'right', x: 15, z: 0, width: 15, height: 30 },
      ],
      warnings: [],
    });
  });

  it('anchor 4: changes leaf fit without moving the slots around a rail', () => {
    const profiled = resolveFaces(STACK, AREA, REVEALS);
    const mixed = resolveFaces(STACK, AREA, { ...REVEALS, squarePaths: new Set(['r.0']) });
    expect(mixed).toEqual({
      faces: [
        { path: 'r.0', type: 'drawer_front', x: 0, z: 24, width: 30, height: 6 },
        { path: 'r.1', type: 'door', x: 3 / 32, z: 3 / 32, width: 29.8125, height: 22.3125 },
      ],
      warnings: [],
    });
    expect(mixed.faces[1]).toEqual(profiled.faces[1]);
    expect(profiled.faces[0]).toMatchObject({ z: 24 + 3 / 32, height: 6 - 3 / 16 });
  });

  it('anchor 5: keeps the shared gap beside a profiled face and fits only its uncut edges', () => {
    expect(resolveFaces({ ...STACK, noRail: [0] }, AREA, {
      ...REVEALS, squarePaths: new Set(['r.0']),
    })).toEqual({
      faces: [
        { path: 'r.0', opening: 'r.0', type: 'drawer_front', x: 0, z: 24, width: 30, height: 6 },
        { path: 'r.1', opening: 'r.0', type: 'door', x: 3 / 32, z: 3 / 32, width: 29.8125, height: 23.84375 },
      ],
      warnings: [],
    });
  });

  it('anchor 6: removes the shared gap when both faces are square', () => {
    expect(resolveFaces({ ...STACK, noRail: [0] }, AREA, {
      ...REVEALS, squarePaths: new Set(['r.0', 'r.1']),
    })).toEqual({
      faces: [
        { path: 'r.0', opening: 'r.0', type: 'drawer_front', x: 0, z: 24, width: 30, height: 6 },
        { path: 'r.1', opening: 'r.0', type: 'door', x: 0, z: 0, width: 30, height: 24 },
      ],
      warnings: [],
    });
  });

  it('uses each auto child’s own fit at no-rail seams in either direction', () => {
    for (const direction of ['vertical', 'horizontal']) {
      const face = { direction, size: null, children: [DOOR, DOOR], noRail: [0] };
      const { faces, warnings } = resolveFaces(face, AREA, {
        ...REVEALS, squarePaths: new Set(['r.0']),
      });
      const size = (30 - 1 / 16 - 3 / 32) / 2;
      expect(warnings).toEqual([]);
      expect(faces).toEqual(direction === 'vertical' ? [
        { path: 'r.0', opening: 'r.0', type: 'door', x: 0, z: 30 - size, width: 30, height: size },
        { path: 'r.1', opening: 'r.0', type: 'door', x: 3 / 32, z: 3 / 32, width: 29.8125, height: size },
      ] : [
        { path: 'r.0', opening: 'r.0', type: 'door', x: 0, z: 0, width: size, height: 30 },
        { path: 'r.1', opening: 'r.0', type: 'door', x: size + 1 / 16, z: 3 / 32, width: size, height: 29.8125 },
      ]);
    }
  });

  it('uses nested leaf paths and pair fit beside a cut mullion', () => {
    const row = {
      direction: 'horizontal', size: null, noRail: [0],
      children: [{ type: 'pair_door', size: 6 }, DOOR],
    };
    const tree = { ...STACK, children: [{ type: 'drawer_front', size: 6 }, row] };
    const area = { ...AREA, height: 37.5 };
    const { faces } = resolveFaces(tree, area, {
      ...REVEALS, squarePaths: new Set(['r.1.0']),
    });
    expect(faces.slice(1)).toEqual([
      { path: 'r.1.0', opening: 'r.1.0', type: 'pair_door', half: 'left', x: 0, z: 0, width: 3, height: 30 },
      { path: 'r.1.0', opening: 'r.1.0', type: 'pair_door', half: 'right', x: 3, z: 0, width: 3, height: 30 },
      { path: 'r.1.1', opening: 'r.1.0', type: 'door', x: 6.0625, z: 3 / 32, width: 23.84375, height: 29.8125 },
    ]);
    const reverse = resolveFaces(tree, area, { ...REVEALS, squarePaths: new Set(['r.1.1']) });
    expect(reverse.faces.slice(1)).toEqual([
      { path: 'r.1.0', opening: 'r.1.0', type: 'pair_door', half: 'left', x: 1 / 16, z: 3 / 32, width: 2.90625, height: 29.8125 },
      { path: 'r.1.0', opening: 'r.1.0', type: 'pair_door', half: 'right', x: 3.09375, z: 3 / 32, width: 2.90625, height: 29.8125 },
      { path: 'r.1.1', opening: 'r.1.0', type: 'door', x: 6.0625, z: 0, width: 23.9375, height: 30 },
    ]);
    for (const squarePaths of [new Set(), new Set(['r', 'r.1', 'r.9'])]) {
      expect(resolveFaces(tree, area, { ...REVEALS, squarePaths }))
        .toEqual(resolveFaces(tree, area, REVEALS));
    }
  });
});
