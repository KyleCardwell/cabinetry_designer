import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_PULLS, DEFAULT_SETTINGS, PULL_KEYS, allowedAt, cleanOverrides,
  isFaceNode, pullPartType, registryEntry, resolvePull, resolveSettings,
  setFacePull, setFaceType, splitFace, teamSettingsToRow,
} from '../index.js';
import { isValidSettingValue } from '../settingsResolve.js';

const levels = (nodes) => Object.entries(nodes).map(([level, node]) => ({ level, node }));
const resolve = (partType, nodes = {}, settings = DEFAULT_SETTINGS, pulls) =>
  resolvePull(settings, partType, levels(nodes), pulls);
const leaf = (type, patch = {}) => ({ type, size: null, ...patch });
const noPull = { pullId: 'none', pull: null, source: { level: 'default', key: null }, warnings: [] };

describe('HP3c step a pull chain', () => {
  it('defaults both independent chains to the 4-inch pull (anchor 1)', () => {
    expect(PULL_KEYS).toEqual({ door: 'doorPullId', drawer: 'drawerPullId' });
    for (const [partType, key] of Object.entries(PULL_KEYS)) {
      expect(resolve(partType)).toEqual({
        pullId: 'pull-4', pull: BUILT_IN_PULLS[0], source: { level: 'settings', key }, warnings: [],
      });
      expect(resolve(partType).pull.name).toBe('4" pull');
      expect(resolvePull(undefined, partType, []).pullId).toBe('pull-4');
      expect(resolve(partType, {}, {}).pullId).toBe('pull-4');
    }
  });

  it('takes cabinet door picks without falling back across to drawers (anchor 2)', () => {
    const nodes = { face: leaf('door'), cabinet: { doorPullId: 'knob-1-25' }, run: { doorPullId: 'none' } };
    expect(resolve('door', nodes)).toEqual({
      pullId: 'knob-1-25', pull: BUILT_IN_PULLS[1],
      source: { level: 'cabinet', key: 'doorPullId' }, warnings: [],
    });
    expect(resolve('drawer', { ...nodes, face: leaf('drawer_front') })).toEqual({
      pullId: 'pull-4', pull: BUILT_IN_PULLS[0],
      source: { level: 'settings', key: 'drawerPullId' }, warnings: [],
    });
    expect(resolve('door', { cabinet: { drawerPullId: 'none' } }).pullId).toBe('pull-4');
  });

  it('lets none win, skips null and absent picks, and honors every node level (anchor 3)', () => {
    expect(resolve('door', { face: leaf('door'), cabinet: {}, run: { doorPullId: 'none' } })).toEqual({
      pullId: 'none', pull: null, source: { level: 'run', key: 'doorPullId' }, warnings: [],
    });
    const nodes = {
      face: leaf('door', { pullId: 'knob-1-25' }), cabinet: { doorPullId: 'none' },
      run: { doorPullId: 'knob-1-25' }, wall: { doorPullId: 'none' },
    };
    for (const [level, node] of Object.entries(nodes)) {
      expect(resolve('door', nodes).source).toEqual({ level, key: level === 'face' ? 'pullId' : 'doorPullId' });
      node[level === 'face' ? 'pullId' : 'doorPullId'] = null;
    }
    expect(resolve('door', nodes).source.level).toBe('settings');
  });

  it('keeps missing winners and warns while using the built-in fallback (anchors 4–5)', () => {
    expect(resolve('door', { face: leaf('door', { pullId: 'gone' }), cabinet: { doorPullId: 'knob-1-25' } })).toEqual({
      pullId: 'gone', pull: BUILT_IN_PULLS[0], source: { level: 'face', key: 'pullId' },
      warnings: [{ code: 'pull-missing', level: 'face', id: 'gone' }],
    });
    expect(resolve('door', {}, { ...DEFAULT_SETTINGS, doorPullId: 'gone' })).toEqual({
      pullId: 'gone', pull: BUILT_IN_PULLS[0], source: { level: 'settings', key: 'doorPullId' },
      warnings: [{ code: 'pull-missing', level: 'settings', id: 'gone' }],
    });
    const custom = { ...BUILT_IN_PULLS[1], id: 'custom' };
    expect(resolve('drawer', { wall: { drawerPullId: 'custom' } }, DEFAULT_SETTINGS, [custom]).pull).toBe(custom);
    expect(resolve('door', { run: { doorPullId: 'gone' } }, { ...DEFAULT_SETTINGS, pulls: [] }).pull).toBe(BUILT_IN_PULLS[0]);
  });

  it('maps face types and permits only pull-bearing leaves to store pull ids (anchor 6)', () => {
    expect(['door', 'pair_door', 'drawer_front', 'false_front', 'panel', 'open', 'unknown'].map(pullPartType))
      .toEqual(['door', 'door', 'drawer', 'false_front', null, null, null]);
    for (const type of ['door', 'pair_door', 'drawer_front', 'false_front']) {
      for (const pullId of [undefined, null, 'pull-4', 'none', 'gone']) expect(isFaceNode(leaf(type, { pullId }))).toBe(true);
      for (const pullId of ['', 3, false, {}]) expect(isFaceNode(leaf(type, { pullId }))).toBe(false);
    }
    for (const type of ['open', 'panel']) {
      expect(isFaceNode(leaf(type))).toBe(true);
      for (const pullId of ['pull-4', null]) expect(isFaceNode(leaf(type, { pullId }))).toBe(false);
      expect(resolve(pullPartType(type), { face: leaf(type) })).toEqual(noPull);
    }
    expect(isFaceNode({ direction: 'vertical', size: null, pullId: 'pull-4', children: [leaf('door'), leaf('door')] })).toBe(false);
    expect(resolve(pullPartType('door'), { face: leaf('door', { action: 'pullout' }) }).pullId).toBe('pull-4');
  });

  it('sets and clears nested picks, preserves allowed type changes, and clears split leaves (anchor 6)', () => {
    const face = leaf('door', { pullId: 'knob-1-25' });
    const before = structuredClone(face);
    for (const type of ['door', 'pair_door', 'drawer_front', 'false_front']) {
      expect(setFaceType(face, 'r', type).pullId).toBe('knob-1-25');
    }
    for (const type of ['panel', 'open']) {
      const changed = setFaceType(face, 'r', type);
      expect(changed).not.toHaveProperty('pullId');
      expect(setFacePull(changed, 'r', 'pull-4')).toBe(changed);
    }
    expect(setFacePull(face, 'r', 'knob-1-25')).toBe(face);
    for (const value of ['', 3, false]) expect(setFacePull(face, 'r', value)).toBe(face);
    const cleared = setFacePull(face, 'r', null);
    expect(cleared).not.toHaveProperty('pullId');
    expect(setFacePull(cleared, 'r', null)).toBe(cleared);
    const split = splitFace(face, 'r', 'vertical', 2);
    expect(split.children).toEqual([leaf('door'), leaf('door')]);
    const picked = setFacePull(split, 'r.1', 'none');
    expect(picked.children[1].pullId).toBe('none');
    expect(split.children[1]).not.toHaveProperty('pullId');
    expect(setFacePull(split, 'r', 'pull-4')).toBe(split);
    expect(setFacePull(split, 'r.8', 'pull-4')).toBe(split);
    expect(face).toEqual(before);
  });

  it('uses only explicit face picks on false fronts (anchor 6b)', () => {
    const nodes = { face: leaf('false_front'), cabinet: { drawerPullId: 'knob-1-25' }, run: { doorPullId: 'none' } };
    expect(resolve('false_front', nodes)).toEqual(noPull);
    expect(resolve('false_front', { ...nodes, face: leaf('false_front', { pullId: null }) })).toEqual(noPull);
    expect(resolve('false_front', { ...nodes, face: leaf('false_front', { pullId: 'pull-4' }) })).toEqual({
      pullId: 'pull-4', pull: BUILT_IN_PULLS[0], source: { level: 'face', key: 'pullId' }, warnings: [],
    });
    expect(resolve('false_front', { face: leaf('false_front', { pullId: 'none' }) }).pull).toBeNull();
    expect(resolve('false_front', { face: leaf('false_front', { pullId: 'gone' }) }).warnings)
      .toEqual([{ code: 'pull-missing', level: 'face', id: 'gone' }]);
  });

  it('registers and validates picks and includes them in shop-standard rows (anchor 7)', () => {
    for (const [key, label] of [['doorPullId', 'Door pull'], ['drawerPullId', 'Drawer pull']]) {
      expect(registryEntry(key)).toEqual({ key, label, kind: 'pull', lowest: 'room' });
      for (const value of ['none', 'knob-1-25', 'gone']) expect(isValidSettingValue(key, value)).toBe(true);
      for (const value of ['', 3, null, undefined, false]) expect(isValidSettingValue(key, value)).toBe(false);
      for (const level of ['team', 'project', 'phase', 'room']) expect(allowedAt(key, level)).toBe(true);
      for (const level of ['wall', 'run', 'cabinet', 'face']) expect(allowedAt(key, level)).toBe(false);
      expect(teamSettingsToRow(DEFAULT_SETTINGS)[key]).toBe('pull-4');
    }
    expect(cleanOverrides({ doorPullId: 'knob-1-25' }, 'room')).toEqual({ doorPullId: 'knob-1-25' });
    expect(cleanOverrides({ doorPullId: null, drawerPullId: '' }, 'room')).toEqual({});
  });

  it('resolves room and higher settings layers with null inheriting', () => {
    const chain = [
      { level: 'team', values: { doorPullId: 'knob-1-25', drawerPullId: 'none' } },
      { level: 'project', values: { doorPullId: 'none', drawerPullId: null } },
      { level: 'phase', values: { doorPullId: null, drawerPullId: 'knob-1-25' } },
      { level: 'room', values: { doorPullId: 'gone', drawerPullId: null } },
      { level: 'wall', values: { doorPullId: 'pull-4' } },
    ];
    const settings = resolveSettings(chain);
    expect(resolve('door', {}, settings).pullId).toBe('gone');
    expect(resolve('drawer', {}, settings).pullId).toBe('knob-1-25');
    expect(resolveSettings(chain.slice(0, 3)).doorPullId).toBe('none');
    expect(resolveSettings([{ level: 'team', values: { doorPullId: null } }]).doorPullId).toBe('pull-4');
  });
});
