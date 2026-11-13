import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from '../doorStyles.js';
import { cabinetFaceLevels, facePartType, panelLevels, resolveDoorStyle } from '../doorStyleResolve.js';

const S = DEFAULT_SETTINGS;
const ds = (id, label, patch = {}) => ({ ...DEFAULT_DOOR_STYLE, id, label, ...patch });
const A = ds('ds-a', 'A');
const B = ds('ds-b', 'B', { thickness: 1 });
const C = ds('ds-c', 'C', { designId: 'slab' });
const D = ds('ds-d', 'D', { designId: '114' });
const ARCHED = { ...DOOR_DESIGNS[0], id: '114', code: '114', topRail: { shape: 'arch' } };

/** A face (or cabinet-level part) resolved through cabinet, run, wall and the room holding A–D. */
function resolve(partType, { face, cabinet, run, wall, room } = {}, settings = S, designs) {
  const roomNode = { doorStyles: [A, B, C, D], ...room };
  const levels = [
    { level: 'face', node: face ?? null },
    { level: 'cabinet', node: cabinet ?? null },
    { level: 'run', node: run ?? null },
    { level: 'wall', node: wall ?? null },
    { level: 'room', node: roomNode },
  ].filter(({ node }) => node);
  return resolveDoorStyle(roomNode, settings, partType, levels, designs);
}

/** A panel part (end panel, wall end panel, panel cell) resolved through run, wall and room. */
function resolvePanel({ part, run, wall, room } = {}) {
  const roomNode = { doorStyles: [A, B, C, D], ...room };
  return resolveDoorStyle(roomNode, S, 'panel', panelLevels(roomNode, wall ?? null, run ?? null, part ?? null));
}

const pick = ({ style, design, source, warnings }) => ({ id: style.id, design: design.id, source, warnings });
const from = (result) => [result.style.id, result.source];

describe('SPEC-46 which door style a part uses', () => {
  it('falls back to the team default when nothing picks a style', () => {
    expect(pick(resolve('door'))).toEqual({
      id: 'default', design: 'five-piece-square', source: { level: 'team', key: null }, warnings: [],
    });
    expect(resolve('door', {}, { ...S, teamDoorStyle: { ...S.teamDoorStyle, thickness: 1 } }).style.thickness).toBe(1);
    expect(resolveDoorStyle({}, S, 'door', []).style).toEqual(DEFAULT_DOOR_STYLE);
  });

  it('takes the nearest level\'s pick; null inherits', () => {
    expect(from(resolve('door', { run: { doorStyleId: 'ds-b' }, room: { doorStyleId: 'ds-a' } })))
      .toEqual(['ds-b', { level: 'run', key: 'doorStyleId' }]);
    expect(from(resolve('door', { wall: { doorStyleId: 'ds-b' }, room: { doorStyleId: 'ds-a' } })))
      .toEqual(['ds-b', { level: 'wall', key: 'doorStyleId' }]);
    expect(from(resolve('door', { cabinet: { doorStyleId: null }, room: { doorStyleId: 'ds-a' } })))
      .toEqual(['ds-a', { level: 'room', key: 'doorStyleId' }]);
    expect(resolve('door', { run: { doorStyleId: 'ds-b' } }).style).toBe(B);
  });

  it('lets a face pick its own style over everything above it', () => {
    expect(from(resolve('door', { face: { type: 'door', styleId: 'ds-a' }, cabinet: { doorStyleId: 'ds-b' } })))
      .toEqual(['ds-a', { level: 'face', key: 'styleId' }]);
  });

  it('walks the drawer-front chain first, then the door chain (P12)', () => {
    const levels = { run: { doorStyleId: 'ds-b' }, room: { drawerFrontStyleId: 'ds-a' } };
    expect(from(resolve('drawer_front', levels))).toEqual(['ds-a', { level: 'room', key: 'drawerFrontStyleId' }]);
    expect(from(resolve('door', levels))).toEqual(['ds-b', { level: 'run', key: 'doorStyleId' }]);
    expect(from(resolve('drawer_front', { run: { doorStyleId: 'ds-b' } })))
      .toEqual(['ds-b', { level: 'run', key: 'doorStyleId' }]);
    expect(from(resolve('drawer_front', { face: { styleId: 'ds-c' }, run: { drawerFrontStyleId: 'ds-a' } })))
      .toEqual(['ds-c', { level: 'face', key: 'styleId' }]);
  });

  it('walks the panel chain first, then the door chain (P15)', () => {
    expect(from(resolvePanel({ run: { doorStyleId: 'ds-b' }, room: { panelStyleId: 'ds-c', doorStyleId: 'ds-a' } })))
      .toEqual(['ds-c', { level: 'room', key: 'panelStyleId' }]);
    expect(from(resolvePanel({ part: { styleId: 'ds-a' }, room: { panelStyleId: 'ds-c' } })))
      .toEqual(['ds-a', { level: 'part', key: 'styleId' }]);
    expect(from(resolvePanel({ run: { doorStyleId: 'ds-b' }, room: { doorStyleId: 'ds-a' } })))
      .toEqual(['ds-b', { level: 'run', key: 'doorStyleId' }]);
  });

  it('skips a pick of a style the room doesn\'t have, with a warning', () => {
    expect(pick(resolve('door', {
      face: { styleId: 'gone-1' }, run: { doorStyleId: 'gone-2' }, room: { doorStyleId: 'ds-a' },
    }))).toEqual({
      id: 'ds-a',
      design: 'five-piece-square',
      source: { level: 'room', key: 'doorStyleId' },
      warnings: [
        { code: 'door-style-missing', level: 'face', id: 'gone-1' },
        { code: 'door-style-missing', level: 'run', id: 'gone-2' },
      ],
    });
  });

  it('finds the style\'s design, falling back to 5-piece square with a warning', () => {
    expect(resolve('door', { room: { doorStyleId: 'ds-c' } }).design).toBe(DOOR_DESIGNS[1]);
    expect(pick(resolve('door', { room: { doorStyleId: 'ds-d' } }))).toEqual({
      id: 'ds-d',
      design: 'five-piece-square',
      source: { level: 'room', key: 'doorStyleId' },
      warnings: [{ code: 'door-design-missing', id: '114' }],
    });
    const withArched = resolve('door', { room: { doorStyleId: 'ds-d' } }, S, [...DOOR_DESIGNS, ARCHED]);
    expect([withArched.design, withArched.warnings]).toEqual([ARCHED, []]);
  });

  it('maps face types to chains and builds the level lists', () => {
    expect(['door', 'pair_door', 'false_front', 'panel', 'drawer_front', 'open'].map(facePartType))
      .toEqual(['door', 'door', 'door', 'door', 'drawer_front', null]);
    const [R, W, U, I, F, P] = [{ id: 'R' }, { id: 'W' }, { id: 'U' }, { id: 'I' }, { type: 'door' }, { id: 'P' }];
    expect(cabinetFaceLevels(R, W, U, I, F)).toEqual([
      { level: 'face', node: F },
      { level: 'cabinet', node: I },
      { level: 'run', node: U },
      { level: 'wall', node: W },
      { level: 'room', node: R },
    ]);
    expect(cabinetFaceLevels(R, W, U, undefined, F).map(({ level }) => level)).toEqual(['face', 'run', 'wall', 'room']);
    expect(panelLevels(R, W, null, P)).toEqual([
      { level: 'part', node: P },
      { level: 'wall', node: W },
      { level: 'room', node: R },
    ]);
  });
});
