import { beforeEach, describe, expect, it } from 'vitest';
import { auto, fixed, room, run, wall } from '../../../test/builders.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../../model/constants.js';
import { defaultLegA, normalizeCornerEnd, RETURN_PIECES } from '../../model/cornerEnd.js';
import { runBlind } from '../../model/grid.js';
import { stretchRun } from '../../model/runMoves.js';
import elevationReducer, {
  createInitialElevationState, setRunAnchor, setRunEnd,
} from '../elevationSlice.js';
import { isElevationDocument, normalizeElevationDocument, toElevationDocument } from '../persistence.js';

const defaultCorner = {
  type: 'corner', width: null,
  corner: { kind: 90, legB: null, depthB: null, returnPiece: 'auto', returnWidth: null, doors: null },
};
const target = { wallId: 'wall-1', runId: 'run-1', side: 'left' };
let state;

beforeEach(() => {
  state = createInitialElevationState(null);
  state.rooms = [room({ walls: [
    wall({ runs: [run({ autoCount: false, items: [auto('left'), auto('right')] })],
      connections: { start: { wallId: 'wall-2', endpoint: 'end' }, end: null } }),
    wall({ id: 'wall-2', x1: 0, y1: 144, x2: 0, y2: 0,
      connections: { start: null, end: { wallId: 'wall-1', endpoint: 'start' } } }),
  ] })];
  state.activeRoomId = 'room-1';
  state.activeWallId = 'wall-1';
});

const current = (subject) => subject.rooms[0].walls[0].runs[0];

describe('CC3.1 step a stored corner doors', () => {
  it('anchor 2: defaults to inheritance and preserves explicit choices', () => {
    expect(normalizeCornerEnd({}).corner.doors).toBeNull();
    for (const doors of [null, 'equal', 'a_long', 'b_long']) {
      expect(normalizeCornerEnd({ corner: { doors } }).corner.doors).toBe(doors);
    }
  });

  it('anchor 3: loads valid overrides and rejects invalid corner door settings', () => {
    for (const doors of [null, 'equal', 'a_long', 'b_long']) {
      const next = elevationReducer(state, setRunEnd({ ...target, end: { type: 'corner', corner: { doors } } }));
      const document = toElevationDocument(next);
      document.rooms[0].settingsOverrides = { cornerDoors: 'b_long', cornerDoorGap: 0, cornerDiagonalReveal: 0.25 };
      expect(isElevationDocument(document)).toBe(true);
      const loaded = createInitialElevationState(normalizeElevationDocument(document));
      expect(current(loaded).ends.left.corner.doors).toBe(doors);
      expect(loaded.rooms[0].settingsOverrides).toEqual(document.rooms[0].settingsOverrides);

      for (const invalid of ['x', '', 90, false, {}]) {
        const bad = structuredClone(document);
        current(bad).ends.left.corner.doors = invalid;
        expect(isElevationDocument(bad)).toBe(false);
      }
      for (const [key, invalidValues] of [
        ['cornerDoors', ['x', '', null, false, 90]],
        ['cornerDoorGap', [-1, '0.125', null, Infinity, NaN]],
        ['cornerDiagonalReveal', [-1, '0.125', null, Infinity, NaN]],
      ]) {
        for (const invalid of invalidValues) {
          for (const scope of ['settings', 'room']) {
            const bad = structuredClone(document);
            const settings = scope === 'settings' ? bad.settings : bad.rooms[0].settingsOverrides;
            settings[key] = invalid;
            expect(isElevationDocument(bad), `${scope}.${key}: ${invalid}`).toBe(false);
          }
        }
      }
    }
    const legacy = structuredClone(toElevationDocument(elevationReducer(state, setRunEnd({ ...target, end: { type: 'corner' } }))));
    for (const key of ['cornerDoorGap', 'cornerDiagonalReveal', 'cornerDoors']) delete legacy.settings[key];
    delete current(legacy).ends.left.corner.doors;
    const normalized = normalizeElevationDocument(legacy);
    expect(isElevationDocument(normalized)).toBe(true);
    expect(normalized.settings).toMatchObject({ cornerDoorGap: 0.125, cornerDiagonalReveal: 0.125, cornerDoors: 'equal' });
  });
});

describe('CC1 step a corner end data', () => {
  it('anchor 1: replaces an auto left track with the default 36-inch manual leg', () => {
    current(state).autoCount = true;
    const next = elevationReducer(state, setRunEnd({ ...target, end: { type: 'corner' } }));
    expect(current(next).ends.left).toEqual(defaultCorner);
    expect(current(next).grid.cols[0]).toMatchObject({ sizeMode: 'manual', size: 36 });
  });

  it('anchor 2: defaults an upper leg to 24 inches', () => {
    current(state).cabinetTypeId = CABINET_TYPE_IDS.UPPER;
    const next = elevationReducer(state, setRunEnd({ ...target, end: { type: 'corner' } }));
    expect(current(next).grid.cols[0]).toMatchObject({ sizeMode: 'manual', size: 24 });
    expect(defaultLegA(run({ cabinetTypeId: CABINET_TYPE_IDS.TALL }))).toBe(36);
  });

  it('anchor 3: keeps a manual 30-inch column', () => {
    state.rooms[0].walls[0].runs = [run({ autoCount: false, items: [fixed('left', 30), auto('right')] })];
    const next = elevationReducer(state, setRunEnd({ ...target, end: { type: 'corner' } }));
    expect(current(next).grid.cols[0]).toMatchObject({ sizeMode: 'manual', size: 30 });
  });

  it('anchor 4: stores typed 45-degree dimensions with the default return piece', () => {
    const next = elevationReducer(state, setRunEnd({ ...target,
      end: { type: 'corner', corner: { kind: 45, legB: 30, depthB: 15 } },
    }));
    expect(current(next).ends.left).toEqual({ type: 'corner', width: null,
      corner: { kind: 45, legB: 30, depthB: 15, returnPiece: 'auto', returnWidth: null, doors: null } });
    for (const returnPiece of RETURN_PIECES) {
      expect(normalizeCornerEnd({ type: 'corner', width: 2, height: 'full', auto: true,
        extend: {}, styleId: 'old', sizes: {}, corner: { returnPiece } }))
        .toEqual({ ...defaultCorner, corner: { ...defaultCorner.corner, returnPiece } });
    }
  });

  it('anchor 5: clears old end details, filler, legs and the grid blind', () => {
    state.rooms[0].walls[0].runs = [run({ autoCount: false,
      items: [auto('left'), auto('right')], blind: { left: 42 },
      ends: { left: { type: 'filler', width: 2, height: 'full', auto: true,
        extend: { top: 2 }, styleId: 'old', sizes: {} }, right: { type: 'filler', width: null } },
      endFiller: { left: { width: 2 }, right: null },
      endLegs: { left: { legs: 'front' } },
    })];
    expect(runBlind(current(state)).left).toBe(42);
    const next = elevationReducer(state, setRunEnd({ ...target, end: { type: 'corner' } }));
    expect(current(next).ends.left).toEqual(defaultCorner);
    expect(current(next).endFiller.left).toBeNull();
    expect(current(next).endLegs?.left).toBeUndefined();
    expect(runBlind(current(next))).toBeUndefined();
  });

  it('anchor 6: drops corner data when switching to filler without changing the column', () => {
    const corner = elevationReducer(state, setRunEnd({ ...target, end: { type: 'corner' } }));
    const next = elevationReducer(corner, setRunEnd({ ...target, end: { type: 'filler', width: null } }));
    expect(current(next).ends.left).toEqual({ type: 'filler', width: null });
    expect(current(next).grid.cols[0]).toEqual(current(corner).grid.cols[0]);
  });

  it('anchor 7: keeps corner and filler ends when anchoring inside, and resets end panels', () => {
    for (const end of [defaultCorner, { type: 'filler', width: null }, { type: 'end_panel', width: null }]) {
      const initial = structuredClone(state);
      current(initial).ends.left = end;
      const next = elevationReducer(initial, setRunAnchor({ ...target, value: true }));
      expect(current(next).ends.left).toEqual(end.type === 'corner' ? defaultCorner : { type: 'filler', width: null });
      expect(current(next).anchors.left).toBe(true);
    }
  });

  it('anchor 8: keeps a corner on a wall-face anchor while a blind becomes filler', () => {
    const anchor = { to: 'wall', wallId: 'wall-2' };
    for (const end of [defaultCorner, { type: 'blind', width: null }]) {
      const initial = structuredClone(state);
      current(initial).ends.right = end;
      const next = elevationReducer(initial, setRunAnchor({ ...target, side: 'right', value: anchor }));
      expect(current(next).ends.right).toEqual(end.type === 'corner' ? defaultCorner : { type: 'filler', width: null });
      expect(current(next).anchors.right).toEqual(anchor);
    }
  });

  it('anchor 9: loads valid corner ends and rejects malformed ends and corner defaults', () => {
    const next = elevationReducer(state, setRunEnd({ ...target, end: { type: 'corner' } }));
    const document = toElevationDocument(next);
    expect(isElevationDocument(document)).toBe(true);
    for (const kind of [90, 45]) {
      for (const returnPiece of RETURN_PIECES) {
        const valid = structuredClone(document);
        current(valid).ends.left.corner = { kind, legB: 30, depthB: 15, returnPiece, returnWidth: null };
        expect(isElevationDocument(valid)).toBe(true);
        expect(current(createInitialElevationState(normalizeElevationDocument(valid))).ends.left)
          .toEqual(current(valid).ends.left);
      }
    }
    const invalidEnds = [
      { ...defaultCorner, corner: { ...defaultCorner.corner, kind: 60 } },
      ...[0, -1, Infinity, NaN, '30', undefined].flatMap((value) => ['legB', 'depthB', 'returnWidth'].map((key) => (
        { ...defaultCorner, corner: { ...defaultCorner.corner, [key]: value } }
      ))),
      { ...defaultCorner, corner: { ...defaultCorner.corner, returnPiece: 'x' } },
      { type: 'corner', width: null },
      { ...defaultCorner, corner: null },
      { type: 'filler', width: null, corner: defaultCorner.corner },
      ...['height', 'extend', 'auto', 'styleId', 'sizes'].map((key) => ({ ...defaultCorner, [key]: null })),
      { ...defaultCorner, width: 2 },
    ];
    for (const end of invalidEnds) {
      const invalid = structuredClone(document);
      current(invalid).ends.left = end;
      expect(isElevationDocument(invalid), JSON.stringify(end)).toBe(false);
    }
    for (const side of ['left', 'right']) {
      const invalid = structuredClone(document);
      invalid.settings.defaultEnds[side] = 'corner';
      expect(isElevationDocument(invalid)).toBe(false);
    }
  });

  it('sizes a solved right column and preserves the other column and end legs', () => {
    current(state).grid.cols[1] = { ...current(state).grid.cols[1], sizeMode: 'solved', size: 29 };
    current(state).endLegs = { left: { legs: 'front' }, right: { legs: 'front' } };
    const next = elevationReducer(state, setRunEnd({ ...target, side: 'right', end: { type: 'corner' } }));
    expect(current(next).grid.cols[1]).toMatchObject({ sizeMode: 'manual', size: 36 });
    expect(current(next).grid.cols[0]).toEqual(current(state).grid.cols[0]);
    expect(current(next).endLegs).toEqual({ left: { legs: 'front' } });
  });

  it('CC2 anchor 11: defaults returnWidth, loads null and positive widths, and rejects invalid widths', () => {
    expect(normalizeCornerEnd({}).corner.returnWidth).toBeNull();
    for (const returnWidth of [null, 3]) {
      const next = elevationReducer(state, setRunEnd({ ...target,
        end: { type: 'corner', corner: { returnWidth } },
      }));
      const document = toElevationDocument(next);
      expect(isElevationDocument(document)).toBe(true);
      expect(current(createInitialElevationState(normalizeElevationDocument(document))).ends.left.corner.returnWidth)
        .toBe(returnWidth);
      for (const invalid of [0, -1, '3', Infinity, NaN, undefined]) {
        const bad = structuredClone(document);
        current(bad).ends.left.corner.returnWidth = invalid;
        expect(isElevationDocument(bad)).toBe(false);
      }
    }
  });

  it('keeps a corner when snapping inside and changes it to a panel at an outside corner', () => {
    current(state).ends.left = defaultCorner;
    current(state).x = 10;
    current(state).width = 110;
    const inside = stretchRun(state.rooms[0], 'wall-1', 'run-1', 'left', 0, DEFAULT_SETTINGS);
    expect(inside.ok).toBe(true);
    expect(inside.room.walls[0].runs[0].anchors.left).toBe(true);
    expect(inside.room.walls[0].runs[0].ends.left).toEqual(defaultCorner);

    state.rooms[0].walls[0].flipped = true;
    state.rooms[0].walls[1].y1 = -144;
    const anchored = elevationReducer(state, setRunAnchor({ ...target, value: true }));
    expect(current(anchored).ends.left).toEqual({ type: 'end_panel', width: null });
    const outside = stretchRun(state.rooms[0], 'wall-1', 'run-1', 'left', 0, DEFAULT_SETTINGS);
    expect(outside.ok).toBe(true);
    expect(outside.room.walls[0].runs[0].ends.left).toEqual({ type: 'end_panel', width: null });
  });

  it('keeps a corner when snapping to a landing on a wall face', () => {
    state.rooms[0].walls = [
      wall({ x2: 240, runs: [run({ x: 130, width: 80, autoCount: false,
        items: [auto('left'), auto('right')], ends: { left: defaultCorner, right: { type: 'none' } },
      })] }),
      wall({ id: 'wall-2', x1: 100, y1: 0, x2: 100, y2: 100,
        landings: { start: { wallId: 'wall-1', side: 'front', ref: 'left', to: 'near', offset: 100 }, end: null } }),
    ];
    const result = stretchRun(state.rooms[0], 'wall-1', 'run-1', 'left', 104.5, DEFAULT_SETTINGS);
    expect(result.ok, result.reason).toBe(true);
    expect(result.room.walls[0].runs[0].anchors.left).toEqual({ to: 'wall', wallId: 'wall-2' });
    expect(result.room.walls[0].runs[0].ends.left).toEqual(defaultCorner);
  });
});
