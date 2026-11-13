import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { verticalChains } from '../dimensions.js';
import { gridFromItems } from '../grid.js';
import { resolveWall, syncRoom } from '../room.js';

const S = DEFAULT_SETTINGS;
const NONE = { type: 'none', width: null };
const INSET = { cabinetStyleId: 14 };

const run = (id, cabinetTypeId, overrides = {}) => ({
  id, cabinetTypeId, x: 24, width: 48, z: 4, height: 30.5, depth: cabinetTypeId === CABINET_TYPE_IDS.UPPER ? 12 : 24,
  ends: { left: NONE, right: NONE }, autoCount: false, maxCabinetWidth: null,
  heightMode: 'auto', overrides: {}, anchors: { left: false, right: false },
  grid: gridFromItems(id, [{ id: `${id}a`, kind: 'cabinet', width: null }, { id: `${id}b`, kind: 'cabinet', width: null }]),
  ...overrides,
});

const SOFFIT = {
  id: 'SF', wallSide: 'front', x: 0, width: 144, bottom: 84, depth: 14, molding: 'none', anchors: { left: false, right: false },
};

/** SPEC-36.3.1: a 144" wall, 96" tall, with the given runs and soffits. */
function chains(style, runs, soffits = []) {
  const wall = {
    id: 'wall-1', name: 'Wall 1', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5,
    flipped: false, connections: { start: null, end: null }, profile: {}, runs, openings: [],
    joints: [], endPanels: { start: null, end: null }, landings: { start: null, end: null }, soffits,
  };
  const room = syncRoom({
    id: 'room-1', name: 'Room 1', profile: { ...S.defaultProfile }, walls: [wall], wallOrder: ['wall-1'],
    ...(style ? { style } : {}),
  }, S);
  const resolved = resolveWall(room, room.walls[0]);
  const find = (type) => resolved.runs.find((entry) => entry.cabinetTypeId === type) ?? null;
  const result = verticalChains(room, resolved, {
    lowerRun: find(CABINET_TYPE_IDS.BASE) ?? find(CABINET_TYPE_IDS.TALL),
    upperRun: find(CABINET_TYPE_IDS.UPPER),
  }, S, 'left');
  const shown = (segments) => segments.map(({ start, end, kind }) => [kind, start, end]);
  return { inner: shown(result.inner), middle: shown(result.middle) };
}

describe('SPEC-36.3.2 the vertical chain with a hanging base or a soffit', () => {
  it('shows a hanging base\'s bottom rail whole, and its counter height', () => {
    expect(chains(INSET, [run('b', CABINET_TYPE_IDS.BASE, { hanging: true })]).inner.slice(0, 3)).toEqual([
      ['toe-kick', 0, 4],
      ['frame', 4, 5.5],
      ['frame-opening', 5.5, 33],
    ]);
    expect(chains(INSET, [run('b', CABINET_TYPE_IDS.BASE, { hanging: true })]).middle)
      .toEqual([['counter-height', 0, 36]]);
    expect(chains(null, [run('b', CABINET_TYPE_IDS.BASE)]).middle).toEqual([['counter-height', 0, 36]]);
  });

  it('shows no counter height for a tall', () => {
    expect(chains(null, [run('t', CABINET_TYPE_IDS.TALL)]).middle).toEqual([]);
  });

  it('stops the open space at a soffit\'s bottom, over cabinets or none', () => {
    const base = run('b', CABINET_TYPE_IDS.BASE);
    expect(chains(null, [base], [SOFFIT]).inner.slice(-3)).toEqual([
      ['countertop', 34.5, 36],
      ['open', 36, 84],
      ['soffit', 84, 96],
    ]);
    expect(chains(null, [], [SOFFIT]).inner).toEqual([['open', 0, 84], ['soffit', 84, 96]]);
    // With none over the column's runs, the lowest soffit on the wall; one over them wins.
    const aside = { ...SOFFIT, id: 'SA', x: 96, width: 48, bottom: 78 };
    expect(chains(null, [base], [aside]).inner.slice(-2)).toEqual([['open', 36, 78], ['soffit', 78, 96]]);
    expect(chains(null, [base], [aside, { ...SOFFIT, width: 72 }]).inner.slice(-2))
      .toEqual([['open', 36, 84], ['soffit', 84, 96]]);
    expect(chains(null, [base]).inner.at(-1)).toEqual(['open', 36, 96]);
  });
});
