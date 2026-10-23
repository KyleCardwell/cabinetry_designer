// Shared test builders. New tests build walls, runs, openings and rooms from here instead of
// declaring their own, so a new field only needs a default in one place (or in the app's own
// createWall / createRoom, which these wrap). Every builder takes overrides; ids are fixed so
// expected values stay stable.
import { CABINET_TYPE_IDS } from '../elevation/model/constants.js';
import { gridFromItems } from '../elevation/model/grid.js';
import { createRoom, createWall } from '../elevation/store/slices/helpers.js';

/** An auto-width cabinet cell for `run({ items })`. */
export function auto(id) {
  return { id, kind: 'cabinet', width: null };
}

/** A fixed-width cabinet cell for `run({ items })`. */
export function fixed(id, width) {
  return { id, kind: 'cabinet', width };
}

/** A 120" base run with filler ends; `items` (and `blind`) become its grid. */
export function run(overrides = {}) {
  const { items, blind, ...rest } = {
    id: 'run-1',
    cabinetTypeId: CABINET_TYPE_IDS.BASE,
    x: 0,
    width: 120,
    z: 4,
    height: 30.5,
    depth: 24,
    ends: {
      left: { type: 'filler', width: null },
      right: { type: 'filler', width: null },
    },
    autoCount: true,
    maxCabinetWidth: null,
    items: [],
    heightMode: 'manual',
    overrides: {},
    anchors: { left: false, right: false },
    ...overrides,
  };
  return { ...rest, grid: gridFromItems(rest.id, items, blind) };
}

/** A 36" x 80" door opening measured to the jamb, 24" from the wall's left edge. */
export function opening(overrides = {}) {
  return {
    id: 'door-1',
    kind: 'door',
    label: 'D1',
    measureMode: 'jamb',
    width: 36,
    height: 80,
    sillZ: 0,
    offset: 24,
    offsetFrom: 'left',
    offsetAnchor: 'edge',
    casing: { width: 3, thickness: 0.75 },
    ...overrides,
  };
}

/** A pin (fixed position) for a cell, `value` inches from the run's left by default. */
export function pin(value, overrides = {}) {
  return {
    anchor: 'center',
    from: 'left',
    openingId: null,
    openingAnchor: 'center',
    value,
    ...overrides,
  };
}

/** A 144" wall along y = 0 with the app's own defaults; extra keys (e.g. `side`) are kept. */
export function wall(overrides = {}) {
  return { ...createWall('', 0, 144, { id: 'wall-1', ...overrides }), ...overrides };
}

/** An empty room with the app's own defaults; pass `walls` (sync fills in `wallOrder`). */
export function room(overrides = {}) {
  return { ...createRoom('Room 1', undefined, 'room-1'), ...overrides };
}
