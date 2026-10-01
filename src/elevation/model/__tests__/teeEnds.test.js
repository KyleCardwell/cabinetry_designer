import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { gridFromItems } from '../grid.js';
import { endMinWidthsForRun } from '../room.js';
import { endCoverOn } from '../styles.js';

const S = DEFAULT_SETTINGS;
const { BASE } = CABINET_TYPE_IDS;
const NONE = { type: 'none', width: null };
const FILLER = { type: 'filler', width: null };
const cab = (id, width = null, extra = {}) => ({ id, kind: 'cabinet', width, ...extra });

function cornerRoom(runsA, style) {
  const wall = (id, x1, y1, x2, y2, connections, runs) => ({
    id, name: `Wall ${id}`, x1, y1, x2, y2, height: 96, thickness: 4.5, flipped: false,
    connections, profile: {}, runs,
  });
  return {
    id: 'R', name: 'Room R', profile: { ...S.defaultProfile }, ...(style ? { style } : {}),
    walls: [
      wall('A', 0, 0, 120, 0, { start: null, end: { wallId: 'B', endpoint: 'start' } }, runsA),
      wall('B', 120, 0, 120, 96, { start: { wallId: 'A', endpoint: 'end' }, end: null }, []),
    ],
  };
}

const anchoredRun = (overrides = {}) => ({
  id: 'r', cabinetTypeId: BASE, x: 24, width: 40, z: 4, height: 30.5, depth: 24,
  ends: { left: NONE, right: FILLER }, autoCount: false, maxCabinetWidth: null,
  heightMode: 'manual', overrides: {}, anchors: { left: false, right: true },
  tFiller: 'seams',
  grid: gridFromItems('r', [cab('a')]),
  ...overrides,
});

const minimum = (run, style) => {
  const room = cornerRoom([run], style);
  return endMinWidthsForRun(room, room.walls[0], run, S);
};

describe('SPEC-37.1 a T end at an inside corner', () => {
  it('takes the cover off the corner filler minimum, so the flat is 1 1/2" like a plain filler', () => {
    expect(minimum(anchoredRun())).toEqual({ left: 1.5, right: 0.75 });
    expect(minimum(anchoredRun({ tFiller: undefined }))).toEqual({ left: 1.5, right: 1.5 });
    expect(minimum(anchoredRun({ tFiller: undefined, endFiller: { left: null, right: { tFiller: true } } })))
      .toEqual({ left: 1.5, right: 0.75 });
  });

  it('leaves plain fillers, other end types, wall-scribe ends and face frames as they were', () => {
    expect(minimum(anchoredRun({ endFiller: { left: null, right: { tFiller: false } } })))
      .toEqual({ left: 1.5, right: 1.5 });
    expect(minimum(anchoredRun({ ends: { left: NONE, right: { type: 'end_panel', width: null } } })))
      .toEqual({ left: 1.5, right: 1.5 });
    expect(minimum(anchoredRun({ anchors: { left: false, right: false } }))).toEqual({ left: 1.5, right: 1.5 });
    expect(minimum(anchoredRun(), { cabinetStyleId: 14 })).toEqual({ left: 1.5, right: 0.75 });
    expect(endCoverOn({ tFiller: 'all' }, 'left')).toBe(true);
    expect(endCoverOn({ tFiller: 'all', endFiller: { left: { tFiller: false } } }, 'left')).toBe(false);
    expect(endCoverOn({ endFiller: { right: { tFiller: true } } }, 'right')).toBe(true);
    expect(endCoverOn({}, 'right')).toBe(false);
  });
});
