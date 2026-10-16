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
