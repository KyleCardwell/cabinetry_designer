import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS, MAX_PULL_COUNT, PULL_ORIENTATIONS, PULL_POSITIONS,
  allowedAt, groupsFor, isFaceNode, registryEntry, setFacePullPlacement,
  setFaceType, splitFace, teamSettingsToRow,
} from '../index.js';
import { isValidSettingValue } from '../settingsResolve.js';

const leaf = (type, patch = {}) => ({ type, size: null, ...patch });

describe('HP4 step a pull placement keys', () => {
  it('validates positions, orientation and counts only on eligible leaves (anchor 1)', () => {
    expect([
      leaf('door', { pullAt: 'height' }),
      leaf('drawer_front', { pullAt: 'height' }),
      leaf('false_front', { pullAt: 'top-rail', pullCount: 3 }),
      leaf('door', { pullCount: 2 }),
      leaf('drawer_front', { pullCount: 5 }),
      leaf('panel', { pullOrientation: 'vertical' }),
    ].map(isFaceNode)).toEqual([true, false, true, false, false, false]);
    expect(PULL_POSITIONS).toEqual({
      door: ['top-corner', 'bottom-corner', 'height', 'center', 'top-rail', 'bottom-rail'],
      drawer: ['center', 'top-rail'],
    });
    expect(PULL_ORIENTATIONS).toEqual(['vertical', 'horizontal']);
    expect(MAX_PULL_COUNT).toBe(4);
    for (const type of ['door', 'pair_door', 'drawer_front', 'false_front']) {
      const drawer = ['drawer_front', 'false_front'].includes(type);
      for (const pullAt of PULL_POSITIONS[drawer ? 'drawer' : 'door']) {
        expect(isFaceNode(leaf(type, { pullAt, pullId: 'none' }))).toBe(true);
      }
      for (const pullOrientation of PULL_ORIENTATIONS) {
        expect(isFaceNode(leaf(type, { pullOrientation }))).toBe(true);
      }
      for (const pullCount of [2, 3, 4]) expect(isFaceNode(leaf(type, { pullCount }))).toBe(drawer);
      for (const patch of [
        { pullAt: 'auto' }, { pullAt: null }, { pullAt: 'bad' },
        { pullOrientation: 'auto' }, { pullOrientation: null }, { pullOrientation: 'bad' },
        ...[null, 'auto', 0, 1, 2.5, 5, Infinity, '2'].map((pullCount) => ({ pullCount })),
      ]) expect(isFaceNode(leaf(type, patch))).toBe(false);
    }
    const group = { size: null, direction: 'vertical', children: [leaf('door'), leaf('door')] };
    for (const patch of [{ pullAt: 'center' }, { pullOrientation: 'horizontal' }, { pullCount: 2 }]) {
      for (const node of [group, leaf('open'), leaf('panel')]) expect(isFaceNode({ ...node, ...patch })).toBe(false);
    }
  });

  it('sets and clears placement atomically, preserving identity for invalid or unchanged edits (anchor 2)', () => {
    const door = leaf('door', { pullId: 'none' });
    const placed = setFacePullPlacement(door, 'r', { pullAt: 'center', pullOrientation: 'horizontal' });
    expect(placed).toEqual({ ...door, pullAt: 'center', pullOrientation: 'horizontal' });
    expect(door).toEqual(leaf('door', { pullId: 'none' }));
    expect(setFacePullPlacement(placed, 'r', { pullAt: 'center', pullOrientation: 'horizontal' })).toBe(placed);
    const cleared = setFacePullPlacement(placed, 'r', { pullAt: 'auto', pullOrientation: null });
    expect(cleared).toEqual(door);
    expect(setFacePullPlacement(cleared, 'r', { pullAt: null, pullOrientation: 'auto' })).toBe(cleared);
    for (const patch of [
      { pullAt: 'bad' }, { pullOrientation: 'bad' }, { pullCount: 2 },
      { pullAt: 'height', pullOrientation: 'bad' }, { pullAt: undefined }, {},
    ]) expect(setFacePullPlacement(placed, 'r', patch)).toBe(placed);
    const group = { direction: 'vertical', size: null, children: [door, leaf('false_front')] };
    const next = setFacePullPlacement(group, 'r.1', { pullCount: 3, pullAt: 'top-rail' });
    expect(next.children[1]).toEqual(leaf('false_front', { pullCount: 3, pullAt: 'top-rail' }));
    expect(group.children[1]).toEqual(leaf('false_front'));
    for (const pullCount of [null, 'auto', 1]) {
      expect(setFacePullPlacement(next, 'r.1', { pullCount }).children[1]).not.toHaveProperty('pullCount');
    }
    for (const patch of [{ pullCount: 5 }, { pullCount: 2.5 }, { pullAt: 'height' }]) {
      expect(setFacePullPlacement(next, 'r.1', patch)).toBe(next);
    }
    for (const path of ['r', 'r.8']) expect(setFacePullPlacement(group, path, { pullAt: 'center' })).toBe(group);
    for (const type of ['panel', 'open']) {
      const node = leaf(type);
      expect(setFacePullPlacement(node, 'r', { pullAt: 'center' })).toBe(node);
    }
    expect(setFacePullPlacement(leaf('pair_door'), 'r', { pullAt: 'height' }))
      .toEqual(leaf('pair_door', { pullAt: 'height' }));
  });

  it('drops all placement keys on a type change or split and keeps eligible pull picks (anchor 3)', () => {
    const drawer = leaf('drawer_front', {
      pullId: 'none', pullAt: 'top-rail', pullOrientation: 'horizontal', pullCount: 3,
    });
    expect(setFaceType(drawer, 'r', 'door')).toEqual(leaf('door', { pullId: 'none' }));
    expect(setFaceType(drawer, 'r', 'drawer_front')).toEqual(drawer);
    for (const type of ['door', 'pair_door', 'drawer_front', 'false_front']) {
      const original = leaf(type, {
        pullId: 'none', pullAt: 'center', pullOrientation: 'horizontal',
        ...(['drawer_front', 'false_front'].includes(type) ? { pullCount: 3 } : {}),
      });
      for (const nextType of ['door', 'pair_door', 'drawer_front', 'false_front', 'panel', 'open']) {
        if (nextType === type) continue;
        expect(setFaceType(original, 'r', nextType)).toEqual(leaf(nextType,
          ['panel', 'open'].includes(nextType) ? {} : { pullId: 'none' }));
      }
      const split = splitFace(original, 'r', 'vertical', 2);
      expect(split.children).toEqual([leaf(type), leaf(type)]);
      expect(isFaceNode(split)).toBe(true);
    }
  });

  it('registers the 45-inch tall pull height through room level and in team rows (anchor 4)', () => {
    expect(isValidSettingValue('pullHeight', 42)).toBe(true);
    expect(DEFAULT_SETTINGS.pullHeight).toBe(45);
    expect(teamSettingsToRow(DEFAULT_SETTINGS)).toHaveProperty('pullHeight', 45);
    expect(registryEntry('pullHeight')).toEqual({
      key: 'pullHeight', label: 'Tall door pull height', kind: 'number', lowest: 'room',
    });
    for (const level of ['team', 'project', 'phase', 'room']) {
      expect(allowedAt('pullHeight', level)).toBe(true);
      expect(groupsFor(level).find(({ id }) => id === 'pulls').keys).toContain('pullHeight');
    }
    for (const level of ['wall', 'run', 'cabinet', 'face']) expect(allowedAt('pullHeight', level)).toBe(false);
  });
});
