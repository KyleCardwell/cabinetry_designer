import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { furnitureBaseGroups } from '../furnitureBaseGroups.js';
import { room as buildRoom, run as buildRun, wall as buildWall, auto } from '../../../test/builders.js';
import { connectWallStops } from './helpers/wallStops.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const load = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const document = normalizeElevationDocument(load('golden'));
const settings = { ...document.settings, sectionProfiles: load('sectionProfiles').profiles };
const template = document.rooms[0].walls[0].runs.find(({ cabinetTypeId }) => cabinetTypeId === CABINET_TYPE_IDS.BASE);
const run = (id, props = {}) => buildRun({ ...structuredClone(template), id, x: 30, width: 36,
  items: [auto(`${id}:box`)],
  depth: 24, anchors: {}, overrides: {},
  ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } }, ...props });
const wall = (id, runs, props = {}) => buildWall({ ...structuredClone(document.rooms[0].walls[0]), id,
  x1: 0, y1: 0, x2: 120, y2: 0, flipped: false, connections: { start: null, end: null },
  endPanels: { start: null, end: null }, openings: [], joints: [], runs, ...props });
const room = (walls, props = {}) => buildRoom({ ...structuredClone(document.rooms[0]),
  profile: { ...document.rooms[0].profile, baseKind: 'furniture_base', furnitureBaseProfileId: 'fb4' },
  wallOrder: walls.map(({ id }) => id), walls, ...props });
const groups = (stored, using = settings) => furnitureBaseGroups(syncRoom(stored, using), using);
const stepped = () => {
  const stored = room([wall('A', [
    run('B', { x: 30, depth: 21 }),
    run('T', { x: 0, width: 30, cabinetTypeId: CABINET_TYPE_IDS.TALL, anchors: { left: true } }),
  ])]);
  connectWallStops(stored, stored.walls[0], ['start']);
  return stored;
};

describe('SPEC-50.7 step 495 furniture base groups', () => {
  it('orders one free 24-inch run with returned ends (anchor 1)', () => {
    expect(groups(room([wall('A', [run('base')])]))).toEqual([{
      key: 'furniture_base:base', runIds: ['base'], height: 4, orderedHeight: 4.5,
      width: 37.625, orderedWidth: 37.625, depth: 25.6875,
      steps: [{ wallId: 'A', side: 'front', x1: 29.1875, x2: 66.8125, depth: 25.6875 }],
      faces: [{ wallId: 'A', side: 'front', runIds: ['base'] }],
    }]);
  });

  it('joins a tall and shallower base, records the depth seam, and scribes the wall end (anchor 2)', () => {
    expect(groups(stepped())).toEqual([{
      key: 'furniture_base:T', runIds: ['T', 'B'], height: 4, orderedHeight: 4.5,
      width: 66.8125, orderedWidth: 67.3125, depth: 25.6875,
      steps: [
        { wallId: 'A', side: 'front', x1: 0, x2: 30, depth: 25.6875 },
        { wallId: 'A', side: 'front', x1: 30, x2: 66.8125, depth: 22.6875 },
      ], faces: [{ wallId: 'A', side: 'front', runIds: ['T', 'B'] }],
    }]);
  });

  it('separates touching bases with different heights (anchor 3)', () => {
    const stored = stepped();
    stored.walls[0].runs[0].overrides.toeKickHeight = 6;
    expect(groups(stored).map(({ runIds, height, orderedHeight }) => ({ runIds, height, orderedHeight })))
      .toEqual([{ runIds: ['T'], height: 4, orderedHeight: 4.5 },
        { runIds: ['B'], height: 6, orderedHeight: 6.5 }]);
  });

  it('keeps inside corners separate and orders the cope to the return at the floor (anchor 4)', () => {
    // The exposed blind panel takes A's base square to the wall; B copes to A's return.
    const a = wall('A', [run('long', { x: 84, width: 36, anchors: { right: true },
      cabinetTypeId: CABINET_TYPE_IDS.TALL, height: 86, heightMode: 'manual',
      ends: { left: { type: 'none', width: null }, right: { type: 'blind', width: 3 } }, blind: { right: 42 } })],
      { x1: 0, y1: 120, x2: 0, y2: 0, connections: { start: null, end: { wallId: 'B', endpoint: 'start' } } });
    const b = wall('B', [run('cope', { x: 0, width: 40, anchors: { left: true } })],
      { connections: { start: { wallId: 'A', endpoint: 'end' }, end: null } });
    const result = furnitureBaseGroups(room([a, b]), settings);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ key: 'furniture_base:long', width: 36.8125, orderedWidth: 37.3125 });
    expect(result[1]).toMatchObject({ key: 'furniture_base:cope', width: 15.125, orderedWidth: 15.125,
      steps: [{ wallId: 'B', side: 'front', x1: 25.6875, x2: 40.8125, depth: 25.6875 }] });
  });

  it('wraps both island faces and end panels without depth scribe (anchor 5)', () => {
    const t = 4.5;
    const endPanelWidth = 0.75;
    const result = groups(room([wall('island', [
      run('front', { x: 0, width: 96, anchors: { left: true, right: true } }),
      run('back', { x: 0, width: 96, depth: 12, wallSide: 'back', anchors: { left: true, right: true } }),
    ], { x2: 96, thickness: t, endPanels: { start: { width: endPanelWidth }, end: { width: endPanelWidth } } })]));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ key: 'furniture_base:front', runIds: ['front', 'back'],
      depth: 25.6875 + t + 13.6875, width: 96 + 2 * (endPanelWidth + 0.8125),
      orderedWidth: 96 + 2 * (endPanelWidth + 0.8125),
      faces: [{ wallId: 'island', side: 'front', runIds: ['front'] },
        { wallId: 'island', side: 'back', runIds: ['back'] }] });
  });

  it('returns no groups for toe kicks or an empty room (anchor 6)', () => {
    expect(groups(room([wall('A', [run('toe', { overrides: { baseKind: 'toe_kick' } })])]))).toEqual([]);
    expect(furnitureBaseGroups({ walls: [] }, settings)).toEqual([]);
  });

  it('closes links through an overlapping back face, maps back x, and preserves walk order', () => {
    const stored = room([wall('A', [
      run('right', { x: 60, width: 20, depth: 21 }),
      run('left', { x: 10, width: 20 }),
      // Back x 40–105 maps to front x 15–80, bridging the two front runs.
      run('bridge', { x: 40, width: 65, depth: 12, wallSide: 'back' }),
      run('separate', { x: 10, width: 20, depth: 12, wallSide: 'back' }),
    ], { x2: 120 }), wall('first', [run('first-run')])], { wallOrder: ['first', 'A'] });
    const result = groups(stored);
    expect(result.map(({ key, runIds }) => ({ key, runIds }))).toEqual([
      { key: 'furniture_base:first-run', runIds: ['first-run'] },
      { key: 'furniture_base:left', runIds: ['left', 'right', 'bridge'] },
      { key: 'furniture_base:separate', runIds: ['separate'] },
    ]);
    expect(result[1]).toMatchObject({ width: 71.625, depth: 25.6875 + 4.5 + 13.6875 });
    expect(result[1].steps.find(({ side }) => side === 'back'))
      .toMatchObject({ x1: 14.1875, x2: 80.8125, depth: 13.6875 });
  });

  it('uses the touch tolerance, merges equal-depth spans, and honors zero and custom scribe', () => {
    expect(DEFAULT_SETTINGS.furnitureBaseScribe).toBe(0.5);
    const stored = room([wall('A', [run('L', { x: 0, width: 30, anchors: { left: true } }),
      run('R', { x: 30, width: 36 })])]);
    connectWallStops(stored, stored.walls[0], ['start']);
    const resolved = syncRoom(stored, settings);
    resolved.walls[0].runs[1].x = 30 + 0.0000005;
    const result = furnitureBaseGroups(resolved, { ...settings, furnitureBaseScribe: 0 });
    expect(result).toHaveLength(1);
    expect(result[0].orderedWidth).toBe(result[0].width);
    expect(result[0].orderedHeight).toBe(4);
    expect(result[0].steps).toHaveLength(1);
    const custom = furnitureBaseGroups(resolved, { ...settings, furnitureBaseScribe: 1 });
    expect(custom[0].orderedWidth).toBe(custom[0].width + 1);
    expect(custom[0].orderedHeight).toBe(5);
    resolved.walls[0].runs[1].x = 30.000002;
    expect(furnitureBaseGroups(resolved, settings)).toHaveLength(2);
  });

  it('scribes both square recess sides while including the resolved wall offset in depth', () => {
    const recessed = run('recessed', { x: 30, width: 36, _plane: { recessId: 'recess', offset: -6 },
      anchors: { left: { to: 'recess', recessId: 'recess' }, right: { to: 'recess', recessId: 'recess' } } });
    const [group] = furnitureBaseGroups(room([wall('A', [recessed])]), settings);
    expect(group).toMatchObject({ width: 36, orderedWidth: 37, orderedHeight: 4.5, depth: 19.6875 });
    const noScribeSetting = { ...settings };
    delete noScribeSetting.furnitureBaseScribe;
    expect(furnitureBaseGroups(room([wall('A', [recessed])]), noScribeSetting)[0]).toEqual(group);
  });

  it('requires opposite-face overlap and matching height, independent of wall flip', () => {
    for (const flipped of [false, true]) {
      const stored = room([wall('A', [run('front', { x: 0, width: 30 }),
        // Back x 60–90 maps to front x 30–60: it only touches the front run.
        run('back', { x: 60, width: 30, depth: 12, wallSide: 'back' }),
      ], { flipped })]);
      expect(groups(stored)).toHaveLength(2);
      stored.walls[0].runs[1].x = 75;
      expect(groups(stored)).toHaveLength(1);
      stored.walls[0].runs[1].overrides.toeKickHeight = 6;
      expect(groups(stored)).toHaveLength(2);
    }
  });
});
