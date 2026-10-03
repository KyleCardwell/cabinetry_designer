import {
  CABINET_TYPE_IDS,
  DEFAULT_SETTINGS,
} from '../../../model/constants.js';
import {
  gridFromItems,
} from '../../../model/grid.js';

export function auto(id) {
  return { id, kind: 'cabinet', width: null };
}

export function fixed(id, width) {
  return { id, kind: 'cabinet', width };
}

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

export function stateWithRun(existingRun = null) {
  return {
    schemaVersion: 3,
    settings: {
      ...DEFAULT_SETTINGS,
      defaultProfile: { ...DEFAULT_SETTINGS.defaultProfile },
      defaultEnds: { ...DEFAULT_SETTINGS.defaultEnds },
    },
    rooms: [{
      id: 'room-1',
      name: 'Room 1',
      profile: { ...DEFAULT_SETTINGS.defaultProfile },
      walls: [{
        id: 'wall-1',
        name: 'Wall 1',
        x1: 0,
        y1: 0,
        x2: 144,
        y2: 0,
        height: 96,
        thickness: 4.5,
        flipped: false,
        connections: { start: null, end: null },
        profile: {},
        runs: existingRun ? [existingRun] : [],
        openings: [],
      }],
    }],
    activeRoomId: 'room-1',
    activeWallId: 'wall-1',
    view: 'elevation',
    selection: {
      runId: null,
      pieceId: null,
      openingId: null,
      wallId: 'wall-1',
    },
    tool: 'select',
    message: null,
  };
}

export function currentOpening(state) {
  return state.rooms[0].walls[0].openings[0];
}

export function currentRun(state) {
  return state.rooms[0].walls[0].runs[0];
}

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

