import { isStyleRef } from './doorStyles.js';

export const PULL_KEYS = { door: 'doorPullId', drawer: 'drawerPullId' };

export function pullPartType(faceType) {
  switch (faceType) {
    case 'door':
    case 'pair_door': return 'door';
    case 'drawer_front': return 'drawer';
    case 'false_front': return 'false_front';
    default: return null;
  }
}

export const PULL_KINDS = ['pull', 'knob', 'tab'];
export const PULL_SIZE_KEYS = {
  pull: ['length', 'centers', 'width'],
  knob: ['diameter'],
  tab: ['length', 'height'],
};

/** Placeholder sizes in inches, editable to match the shop's hardware. */
export function defaultPullSizes(kind) {
  switch (kind) {
    case 'pull': return { length: 4.75, centers: 4, width: 0.375 };
    case 'knob': return { diameter: 1.25 };
    case 'tab': return { length: 3, height: 0.5 };
    default: return {};
  }
}

export const BUILT_IN_PULLS = [
  { id: 'pull-4', name: '4" pull', kind: 'pull', ...defaultPullSizes('pull'), projection: 1.25, hardwarePullId: null },
  { id: 'knob-1-25', name: '1 1/4" knob', kind: 'knob', ...defaultPullSizes('knob'), projection: 1, hardwarePullId: null },
];
export const BUILT_IN_PULL_IDS = ['pull-4', 'knob-1-25'];

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Allowed own keys, with every required key present. */
function hasKeys(value, allowed, required = allowed) {
  return isPlainObject(value)
    && Reflect.ownKeys(value).every((key) => allowed.includes(key))
    && required.every((key) => Object.hasOwn(value, key));
}

const COMMON_KEYS = ['id', 'name', 'kind', 'projection', 'hardwarePullId'];
const isPositiveSize = (value) => Number.isFinite(value) && value > 0;

export function isPull(pull) {
  if (!isPlainObject(pull) || !PULL_KINDS.includes(pull.kind)) return false;
  const sizeKeys = PULL_SIZE_KEYS[pull.kind];
  return hasKeys(pull, [...COMMON_KEYS, ...sizeKeys], [
    ...COMMON_KEYS, ...sizeKeys.filter((key) => key !== 'centers'),
  ])
    && typeof pull.id === 'string' && pull.id.length > 0
    && typeof pull.name === 'string' && pull.name.length > 0 && pull.name === pull.name.trim()
    && isPositiveSize(pull.projection)
    && sizeKeys.every((key) => !Object.hasOwn(pull, key) || isPositiveSize(pull[key]))
    && (!Object.hasOwn(pull, 'centers') || pull.centers <= pull.length)
    && (pull.hardwarePullId === null || (Number.isInteger(pull.hardwarePullId) && pull.hardwarePullId > 0));
}

export function isPullList(list) {
  if (!Array.isArray(list)) return false;
  const ids = new Set();
  const names = new Set();
  for (const pull of list) {
    if (!isPull(pull) || ids.has(pull.id) || names.has(pull.name.toLowerCase())) return false;
    ids.add(pull.id);
    names.add(pull.name.toLowerCase());
  }
  return BUILT_IN_PULLS.every((seed) => findPull(seed.id, list)?.kind === seed.kind);
}

/** An independent copy with the first unused name and no estimator link. */
export function newPull(list, base, id) {
  const names = new Set(list.map((pull) => pull.name.toLowerCase()));
  let name = `${base.name} copy`;
  let number = 2;
  while (names.has(name.toLowerCase())) {
    name = `${base.name} copy ${number}`;
    number += 1;
  }
  return { ...structuredClone(base), id, name, hardwarePullId: null };
}

export function findPull(id, list) {
  return list.find((pull) => pull.id === id) ?? null;
}

/** Resolve the nearest pull pick without falling through a missing id. */
export function resolvePull(settings, partType, levels, pulls = settings?.pulls ?? BUILT_IN_PULLS) {
  const key = PULL_KEYS[partType];
  const noPull = { pullId: 'none', pull: null, source: { level: 'default', key: null }, warnings: [] };
  if (!key && partType !== 'false_front') return noPull;
  let pullId;
  let source;
  for (const { level, node } of levels) {
    if (!['face', 'cabinet', 'run', 'wall'].includes(level)) continue;
    if (partType === 'false_front' && level !== 'face') continue;
    const pickKey = level === 'face' ? 'pullId' : key;
    const value = node?.[pickKey];
    if (value == null || !isStyleRef(value)) continue;
    pullId = value;
    source = { level, key: pickKey };
    break;
  }
  if (pullId === undefined) {
    if (partType === 'false_front') return noPull;
    pullId = settings?.[key] ?? 'pull-4';
    source = { level: 'settings', key };
  }
  if (pullId === 'none') return { pullId, pull: null, source, warnings: [] };
  const pull = findPull(pullId, pulls);
  return {
    pullId,
    pull: pull ?? findPull('pull-4', BUILT_IN_PULLS),
    source,
    warnings: pull ? [] : [{ code: 'pull-missing', level: source.level, id: pullId }],
  };
}

/** Picker rows and the inherited pull, with this level's own pick removed. */
export function pullPickOptions(settings, partType, levelsAbove, node = {}, ownKey = PULL_KEYS[partType]) {
  const here = { ...node };
  delete here[ownKey];
  const { pull } = resolvePull(settings, partType, [
    { level: ownKey === 'pullId' ? 'face' : 'cabinet', node: here },
    ...levelsAbove,
  ]);
  const options = (settings?.pulls ?? BUILT_IN_PULLS).map(({ id, name }) => ({ id, text: name }));
  if (partType !== 'false_front') options.push({ id: 'none', text: 'No pull' });
  const value = node?.[ownKey];
  if (value != null && value !== 'none' && !options.some(({ id }) => id === value)) {
    options.push({ id: value, text: `Missing (${value})` });
  }
  return {
    inherit: { id: pull?.id ?? 'none', text: partType === 'false_front'
      ? 'No pull (default)' : `Inherit (${pull?.name ?? 'No pull'})` },
    options,
  };
}
