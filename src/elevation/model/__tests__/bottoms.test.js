import { describe, expect, it } from 'vitest';
import {
  belowRunReveal,
  createBottomPart,
  isBottomPart,
  runBottomHeight,
  runBottomParts,
} from '../bottoms.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { runFaceLayouts } from '../faceLayouts.js';
import { syncRoom } from '../room.js';
import { cabinetReveals, panelDrop } from '../styles.js';

const S = DEFAULT_SETTINGS;
const { UPPER } = CABINET_TYPE_IDS;
const EURO = { cabinetStyleId: 13, beadWidth: 0.25, profiledEdge: false };
const INSET = { cabinetStyleId: 14, beadWidth: 0.25, profiledEdge: false };
const DOOR = { type: 'door', size: null };
const RAIL = { id: 'rail', kind: 'light_rail', height: 1.5, doors: 'cover' };
const PANEL = { id: 'panel', kind: 'panel', height: 0.75, doors: 'cover' };
const CAP = { id: 'cap', kind: 'bottom_cap', height: 1.5, doors: 'visible' };

describe('SPEC-35 parts below a run', () => {
  it('lists parts top to bottom, totals them and makes new ones', () => {
    const run = { z: 54, bottom: [RAIL, CAP] };
    expect(runBottomParts(run).map(({ id, z }) => [id, z])).toEqual([['rail', 52.5], ['cap', 51]]);
    expect(runBottomHeight(run)).toBe(3);
    expect(runBottomHeight({ z: 54 })).toBe(0);
    expect(createBottomPart('light_rail', S)).toMatchObject({ kind: 'light_rail', height: 1.5, doors: 'cover' });
    expect(createBottomPart('corbels', S)).toMatchObject({ kind: 'corbels', height: 6, doors: 'visible' });
    expect(isBottomPart(createBottomPart('panel', S))).toBe(true);
    expect(isBottomPart({ ...CAP, doors: 'cover' })).toBe(false);
  });

  it('REV-011: covered, flush and visible parts set the bottom reveal', () => {
    expect(belowRunReveal({ bottom: [RAIL] }, S)).toBe(-1.625);
    expect(belowRunReveal({ bottom: [PANEL, CAP] }, S)).toBe(-0.875);
    expect(belowRunReveal({ bottom: [{ ...RAIL, doors: 'flush' }] }, S)).toBe(0.125);
    expect(belowRunReveal({ bottom: [{ ...RAIL, doors: 'visible' }] }, S)).toBeNull();
    expect(belowRunReveal({}, S)).toBeNull();

    const covered = cabinetReveals({ style: EURO, cabinetTypeId: UPPER, run: { bottom: [RAIL] }, face: DOOR, settings: S });
    expect(covered.values.bottom).toBe(-1.625);
    expect(covered.sources.bottom).toBe('rule:below-run');
    const notAtBottom = cabinetReveals({
      style: EURO, cabinetTypeId: UPPER, run: { bottom: [RAIL] }, face: DOOR,
      runEdges: { top: true, bottom: false }, settings: S,
    });
    expect(notAtBottom.values.bottom).toBe(-0.125);
    expect(notAtBottom.sources.bottom).toBe('style');
    const inset = cabinetReveals({ style: INSET, cabinetTypeId: UPPER, run: { bottom: [RAIL] }, face: DOOR, settings: S });
    expect(inset.values.bottom).toBe(0.75);
    const manual = cabinetReveals({
      style: EURO, cabinetTypeId: UPPER, run: { bottom: [RAIL] }, face: DOOR, manual: { bottom: -1 }, settings: S,
    });
    expect(manual.values.bottom).toBe(-1);
    expect(manual.sources.bottom).toBe('manual');
  });

  it('drops end panels to the doors and moves the faces', () => {
    expect(panelDrop({ cabinetTypeId: UPPER, bottom: [RAIL] }, EURO, S)).toBe(1.625);
    expect(panelDrop({ cabinetTypeId: UPPER, bottom: [{ ...RAIL, doors: 'flush' }] }, EURO, S)).toBe(0);
    expect(panelDrop({ cabinetTypeId: UPPER, bottom: [{ ...RAIL, doors: 'visible' }] }, EURO, S)).toBe(0.125);

    const run = {
      id: 'U', cabinetTypeId: UPPER, x: 0, width: 60, z: 54, height: 36, depth: 12,
      ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
      autoCount: false, maxCabinetWidth: null,
      items: [{ id: 'U-cabinet', kind: 'cabinet', width: null }],
      heightMode: 'auto', overrides: {}, anchors: { left: false, right: false },
      bottom: [RAIL],
    };
    const room = syncRoom({
      id: 'room', name: 'Room', profile: { ...S.defaultProfile }, wallOrder: ['A'],
      walls: [{
        id: 'A', name: '', numberOverride: null, x1: 0, y1: 0, x2: 120, y2: 0,
        height: 96, thickness: 4.5, flipped: false,
        connections: { start: null, end: null }, profile: {}, openings: [], runs: [run],
      }],
    }, S);
    const wall = room.walls[0];
    const faces = runFaceLayouts(room, wall, wall.runs[0], S).get('U-cabinet').faces;
    expect(faces[0]).toMatchObject({ z: 52.375, height: 37.5 });
  });
});
