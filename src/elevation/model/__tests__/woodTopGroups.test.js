import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { auto, fixed, room, run, wall } from '../../../test/builders.js';
import { bandParts } from '../bandParts.js';
import { withBuildCache } from '../buildCache.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { normalizeCornerEnd } from '../cornerEnd.js';
import { syncRoom } from '../room.js';
import { connectWallStops } from './helpers/wallStops.js';
import { woodTopGroups } from '../woodTopGroups.js';
import { goldenRooms } from './helpers/goldenRooms.js';

const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };
const wood = { top: 'wood', autoCount: false,
  ends: { left: { type: 'none' }, right: { type: 'none' } } };
const island = room({ walls: [wall({ id: 'island', x2: 96, thickness: 0, runs: [
  run({ ...wood, id: 'front', width: 96, items: [auto('cabinet')] }),
  run({ ...wood, id: 'back', width: 96, depth: 0.75, wallSide: 'back',
    items: [{ ...auto('back-panel'), kind: 'panel', depth: 0.75, align: 'back' }] }),
] })] });
const touching = room({ walls: [wall({ id: 'w', runs: [
  run({ ...wood, id: 'left', x: 10, width: 30, items: [auto('L')] }),
  run({ ...wood, id: 'right', x: 40, width: 30, items: [auto('R')] }),
] })] });

describe('wood top groups (FX4)', () => {
  it('sizes the Room 9 wood top with its settings overrides', () => {
    const stored = JSON.parse(readFileSync(new URL('./fixtures/room9.json', import.meta.url), 'utf8'));
    const using = { ...DEFAULT_SETTINGS, ...stored.settingsOverrides };
    const groups = woodTopGroups(syncRoom(stored, using), using);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: 'wood_top:0f8a2992-b035-45af-9dcb-88e9196b28a8',
      width: 60.9375, depth: 25.625, thickness: 1.5, segment: false });
    expect(groups[0].faces).toHaveLength(1);
    expect(groups[0]).toMatchObject({ orderedWidth: groups[0].width, orderedDepth: groups[0].depth,
      scribe: { left: false, right: false, back: false } });
  });

  it('joins a zero-thickness island front and back panel at the same top surface', () => {
    const [group] = woodTopGroups(island, settings);
    const fronts = ['front', 'back'].map((side) => bandParts(island, island.walls[0], side, settings)
      .find(({ kind }) => kind === 'countertop').front);
    expect(woodTopGroups(island, settings)).toHaveLength(1);
    expect(group).toEqual({ key: 'wood_top:front', runIds: ['front', 'back'],
      bandRefs: [
        { wallId: 'island', side: 'front', bandId: 'front:countertop' },
        { wallId: 'island', side: 'back', bandId: 'back:countertop' },
      ], miters: { left: false, right: false },
      faces: [
        { wallId: 'island', side: 'front', runIds: ['front'], x1: -0.75, x2: 96.75 },
        { wallId: 'island', side: 'back', runIds: ['back'], x1: -0.75, x2: 96.75 },
      ], width: 97.5, depth: fronts[0] + fronts[1], thickness: 1.5,
      start: -0.75, end: 96.75, wallId: 'island', segment: false,
      orderedWidth: 97.5, orderedDepth: fronts[0] + fronts[1],
      scribe: { left: false, right: false, back: false } });
  });

  it('adds wall thickness to a two-face group depth', () => {
    const stored = structuredClone(island);
    stored.walls[0].thickness = 4.5;
    const groups = woodTopGroups(stored, settings);
    expect(groups).toHaveLength(1);
    expect(groups[0].depth).toBe(woodTopGroups(island, settings)[0].depth + 4.5);
  });

  it('separates opposite faces whose top surfaces differ by half an inch', () => {
    const stored = structuredClone(island);
    stored.walls[0].runs[1].height -= 0.5;
    expect(woodTopGroups(stored, settings).map(({ key }) => key))
      .toEqual(['wood_top:front', 'wood_top:back']);
  });

  it('joins touching wood spans on one face, including the drawn outside overhangs', () => {
    expect(woodTopGroups(touching, settings)).toEqual([{
      key: 'wood_top:left', runIds: ['left', 'right'],
      bandRefs: [
        { wallId: 'w', side: 'front', bandId: 'left:countertop' },
        { wallId: 'w', side: 'front', bandId: 'right:countertop' },
      ], miters: { left: false, right: false },
      faces: [{ wallId: 'w', side: 'front', runIds: ['left', 'right'], x1: 9.25, x2: 70.75 }],
      width: 61.5, depth: 25.625, thickness: 1.5, start: 9.25, end: 70.75, wallId: 'w', segment: false,
      orderedWidth: 61.5, orderedDepth: 26.125, scribe: { left: false, right: false, back: true },
    }]);
  });

  it('keeps runs with a one-inch gap separate even when their overhangs overlap', () => {
    const stored = structuredClone(touching);
    stored.walls[0].runs[1].x += 1;
    expect(woodTopGroups(stored, settings).map(({ runIds }) => runIds)).toEqual([['left'], ['right']]);
  });

  it('excludes stone tops and handles an empty room', () => {
    const stored = structuredClone(touching);
    stored.walls[0].runs.forEach((run) => { run.top = 'stone'; });
    expect(woodTopGroups(stored, settings)).toEqual([]);
    expect(woodTopGroups(room())).toEqual([]);
  });

  it('keeps a wood insert in a stone top as its own band-sized part', () => {
    const stored = room({ walls: [wall({ id: 'w', runs: [run({ ...wood, id: 'r', top: 'stone',
      width: 90, items: [fixed('A', 30), fixed('B', 30), fixed('C', 30)],
      topSegments: [{ id: 'insert', from: 'B', to: 'B', kind: 'wood', drop: 2, mode: 'box' }],
    })] })] });
    expect(woodTopGroups(stored, settings)).toEqual([{
      key: 'wood_top:r:top-insert', runIds: ['r'],
      bandRefs: [{ wallId: 'w', side: 'front', bandId: 'r:top-insert' }],
      miters: { left: false, right: false },
      faces: [{ wallId: 'w', side: 'front', runIds: ['r'], x1: 30, x2: 60 }],
      width: 30, depth: 25.625, thickness: 3.5, start: 30, end: 60, wallId: 'w', segment: true,
      orderedWidth: 30, orderedDepth: 26.125, scribe: { left: false, right: false, back: true },
    }]);
  });

  it('keeps inserts separate, ignores stone inserts, and suffixes split groups of one run', () => {
    const stored = room({ walls: [wall({ runs: [run({ ...wood, id: 'r', width: 90,
      items: [fixed('A', 30), fixed('B', 30), fixed('C', 30)], topSegments: [
        { id: 'wood', from: 'A', to: 'A', kind: 'wood', drop: 0, mode: 'box' },
        { id: 'stone', from: 'B', to: 'B', kind: 'stone', drop: 0, mode: 'box' },
      ],
    })] })] });
    expect(woodTopGroups(stored, settings).map(({ key, width, segment }) => ({ key, width, segment })))
      .toEqual([
        { key: 'wood_top:r', width: 0.75, segment: false },
        { key: 'wood_top:r:2', width: 30.75, segment: false },
        { key: 'wood_top:r:top-wood', width: 30, segment: true },
      ]);
  });

  it('closes links transitively, mirrors back spans, and preserves wall/face/run walk order', () => {
    const stored = room({ wallOrder: ['first', 'w'], walls: [wall({ id: 'w', x2: 120, runs: [
      run({ ...wood, id: 'right', x: 60, width: 20, items: [auto('R')] }),
      run({ ...wood, id: 'left', x: 10, width: 20, items: [auto('L')] }),
      run({ ...wood, id: 'bridge', x: 40, width: 65, wallSide: 'back', items: [auto('B')] }),
    ] }), wall({ id: 'first', runs: [run({ ...wood, id: 'first-run', items: [auto('F')] })] })] });
    const groups = woodTopGroups(stored, settings);
    expect(groups.map(({ key, runIds }) => ({ key, runIds }))).toEqual([
      { key: 'wood_top:first-run', runIds: ['first-run'] },
      { key: 'wood_top:left', runIds: ['left', 'right', 'bridge'] },
    ]);
    expect(groups[1].faces[1]).toEqual({ wallId: 'w', side: 'back', runIds: ['bridge'], x1: 14.25, x2: 80.75 });
  });

  it('requires overlap across faces and never links different walls', () => {
    const stored = room({ walls: [wall({ id: 'w', x2: 120, runs: [
      run({ ...wood, id: 'front', width: 30, items: [auto('F')], topOverhang: { left: 0, right: 0 } }),
      run({ ...wood, id: 'back', x: 60, width: 30, wallSide: 'back', items: [auto('B')],
        topOverhang: { left: 0, right: 0 } }),
    ] }), wall({ id: 'other', runs: [run({ ...wood, id: 'other-run', items: [auto('O')] })] })] });
    expect(woodTopGroups(stored, settings)).toHaveLength(3);
    stored.walls[0].runs[1].x += 1;
    expect(woodTopGroups(stored, settings)).toHaveLength(2);
  });

  it('includes back overhangs in single-face depth and excludes waterfall leg height from thickness', () => {
    const stored = room({ walls: [wall({ runs: [run({ ...wood, width: 60, items: [auto('C')],
      topOverhang: { back: 3 }, waterfall: { left: {}, right: {} },
    })] })] });
    expect(woodTopGroups(stored, settings)[0]).toMatchObject({ width: 63, depth: 28.625, thickness: 1.5 });
  });
});

describe('wood top scribe (FX4)', () => {
  const stopped = room({ walls: [wall({ id: 'w', x2: 96, thickness: 4.5, runs: [
    run({ ...wood, id: 'base', width: 96, anchors: { left: true, right: true }, items: [auto('C')] }),
  ] })] });
  connectWallStops(stopped, stopped.walls[0]);

  it('adds half an inch at each wall edge without changing drawn dimensions', () => {
    expect(DEFAULT_SETTINGS.woodTopScribe).toBe(0.5);
    const before = structuredClone(stopped);
    const [group] = woodTopGroups(stopped, settings);
    expect(group).toMatchObject({ width: 96, depth: 25.625, thickness: 1.5,
      orderedWidth: 97, orderedDepth: 26.125, scribe: { left: true, right: true, back: true } });
    const older = { ...settings };
    delete older.woodTopScribe;
    expect(woodTopGroups(stopped, older)).toEqual([group]);
    expect(woodTopGroups(stopped, { ...settings, woodTopScribe: 1 })[0])
      .toMatchObject({ orderedWidth: 98, orderedDepth: 26.625 });
    expect(stopped).toEqual(before);
  });

  it('honors zero scribe while retaining the wall contact flags', () => {
    expect(woodTopGroups(stopped, { ...settings, woodTopScribe: 0 })[0]).toMatchObject({
      orderedWidth: 96, orderedDepth: 25.625, scribe: { left: true, right: true, back: true },
    });
  });

  it('leaves an end meeting a return wall top unscribed', () => {
    const stored = structuredClone(stopped);
    stored.walls[1].runs = [run({ ...wood, id: 'return', x: 84, width: 36,
      anchors: { right: true }, items: [auto('R')] })];
    const group = woodTopGroups(stored, { ...settings, woodTopCorner: 'butt' })
      .find(({ key }) => key === 'wood_top:base');
    expect(group.scribe).toEqual({ left: false, right: true, back: true });
    expect(group.start).toBe(25.625);
    expect(group.orderedWidth).toBe(group.width + 0.5);
    expect(group.orderedDepth).toBe(26.125);
  });

  it('maps back-face end flags into front coordinates and scribes only group outside ends', () => {
    const stored = room({ walls: [wall({ id: 'w', x2: 96, runs: [
      run({ ...wood, id: 'L', width: 48, wallSide: 'back', anchors: { left: true, right: true },
        items: [auto('L')] }),
      run({ ...wood, id: 'R', x: 48, width: 48, wallSide: 'back', items: [auto('R')] }),
    ] })] });
    connectWallStops(stored, stored.walls[0]);
    // Explicit wall anchors also stop a back-face run square at its own left end.
    stored.walls[0].runs[0].anchors.left = { to: 'wall', wallId: 'w:stop:end' };
    const [group] = woodTopGroups(stored, settings);
    expect(group.scribe).toEqual({ left: false, right: true, back: true });
    expect(group.orderedWidth).toBe(group.width + 0.5);
  });

  it('does not scribe open wall ends, back overhangs or both-face tops on a thick wall', () => {
    const stored = room({ walls: [wall({ x2: 96, runs: [run({ ...wood, width: 96,
      anchors: { left: true, right: true }, topOverhang: { back: 3 }, items: [auto('C')] })] })] });
    const [group] = woodTopGroups(stored, settings);
    expect(group).toMatchObject({ width: 97.5, orderedWidth: 97.5, depth: 28.625, orderedDepth: 28.625,
      scribe: { left: false, right: false, back: false } });
    const thickIsland = structuredClone(island);
    thickIsland.walls[0].thickness = 4.5;
    const [top] = woodTopGroups(thickIsland, settings);
    expect(top.orderedDepth).toBe(top.depth);
    expect(top.scribe).toEqual({ left: false, right: false, back: false });
  });

  it('scribes square ends only at the run’s own recess sides', () => {
    const stored = room({ walls: [wall({ runs: [run({ ...wood, x: 30, width: 36,
      _plane: { recessId: 'recess', offset: -30 },
      anchors: { left: { to: 'recess', recessId: 'recess' }, right: { to: 'recess', recessId: 'recess' } },
      items: [auto('C')] })] })] });
    expect(woodTopGroups(stored, settings)[0]).toMatchObject({ width: 36, orderedWidth: 37,
      scribe: { left: true, right: true, back: false } });
    stored.walls[0].runs[0].anchors.left.recessId = 'other';
    expect(woodTopGroups(stored, settings)[0].scribe.left).toBe(false);
    stored.walls[0].runs[0].anchors.left.recessId = 'recess';
    stored.walls[0].runs[0]._plane.offset = -6;
    const [returned] = woodTopGroups(stored, settings);
    expect(returned.scribe).toEqual({ left: false, right: false, back: false });
    expect(returned.orderedWidth).toBe(returned.width);
  });
});

describe('mitered wood top corners (PT2)', () => {
  const stopped = room({ walls: [wall({ id: 'w', x2: 96, thickness: 4.5, runs: [
    run({ ...wood, id: 'base', width: 96, anchors: { left: true, right: true }, items: [auto('C')] }),
  ] })] });
  connectWallStops(stopped, stopped.walls[0]);
  stopped.walls[1].runs = [run({ ...wood, id: 'return', x: 84, width: 36,
    anchors: { right: true }, items: [auto('R')] })];
  const butt = { ...settings, woodTopCorner: 'butt' };

  it('extends the base to the return wall and flags both unscribed miter ends', () => {
    expect(DEFAULT_SETTINGS.woodTopCorner).toBe('miter');
    const before = structuredClone(stopped);
    const [base, returned] = woodTopGroups(stopped, settings);
    expect(base).toMatchObject({ key: 'wood_top:base', start: 0, end: 96, width: 96, orderedWidth: 96.5,
      scribe: { left: false, right: true, back: true }, miters: { left: true, right: false },
      bandRefs: [{ wallId: 'w', side: 'front', bandId: 'base:countertop' }],
      faces: [{ x1: 0, x2: 96 }] });
    const buttReturn = woodTopGroups(stopped, butt)[1];
    expect(buttReturn).toMatchObject({ start: 83.25, end: 120, width: 36.75, orderedWidth: 36.75,
      scribe: { left: false, right: false, back: true } });
    expect(returned).toEqual({ ...buttReturn, miters: { left: false, right: true } });
    expect(returned.orderedWidth - buttReturn.orderedWidth).toBe(0);
    const legacy = { ...settings };
    delete legacy.woodTopCorner;
    expect(woodTopGroups(stopped, legacy)).toEqual([base, returned]);
    expect(stopped).toEqual(before);
  });

  it('runs the butt return into the corner without miter flags', () => {
    const [base, returned] = woodTopGroups(stopped, butt);
    expect(base).toMatchObject({ start: 25.625, end: 96, width: 70.375, orderedWidth: 70.875,
      depth: 25.625, orderedDepth: 26.125, scribe: { left: false, right: true, back: true },
      miters: { left: false, right: false } });
    expect(returned).toMatchObject({ start: 83.25, end: 120, width: 36.75, orderedWidth: 36.75,
      depth: 25.625, orderedDepth: 26.125, scribe: { left: false, right: false, back: true },
      miters: { left: false, right: false }, faces: [{ x1: 83.25, x2: 120 }] });
  });

  it('keeps the cope when the return top is stone', () => {
    const stored = structuredClone(stopped);
    stored.walls[1].runs[0].top = 'stone';
    expect(woodTopGroups(stored, settings)).toEqual([woodTopGroups(stopped, butt)[0]]);
  });

  it('maps back-face miters and reach into front coordinates like scribe flags', () => {
    const stored = structuredClone(stopped);
    stored.walls[0].flipped = true;
    stored.walls[0].runs[0].wallSide = 'back';
    expect(woodTopGroups(stored, settings)[0]).toMatchObject({ start: 0, end: 96, width: 96,
      orderedWidth: 96.5, scribe: { left: true, right: false, back: true },
      miters: { left: false, right: true },
      bandRefs: [{ wallId: 'w', side: 'back', bandId: 'base:countertop' }] });
    // With the return first in the walk, the back-face entry is Y instead of X.
    stored.wallOrder = ['w:stop:start', 'w', 'w:stop:end'];
    expect(woodTopGroups(stored, settings).find(({ key }) => key === 'wood_top:base'))
      .toMatchObject({ start: 0, end: 96, width: 96, miters: { left: false, right: true },
        scribe: { left: true, right: false, back: true } });
  });
});

describe('wood tops at corner cabinets (CC7)', () => {
  it.each([90, 45])('skips a %s corner cabinet in either wall walk order and corner mode', (kind) => {
    const owner = run({ top: 'wood', autoCount: false, items: [fixed('cc', 36), auto('a')],
      anchors: { left: true, right: false },
      ends: { left: normalizeCornerEnd({ corner: { kind } }), right: { type: 'none' } },
    });
    const stored = room({ walls: [wall({ runs: [owner],
      connections: { start: { wallId: 'wall-2', endpoint: 'end' }, end: null },
    }), wall({ id: 'wall-2', x1: 0, y1: 144, x2: 0, y2: 0,
      runs: [run({ ...wood, id: 'run-2', x: 0, width: 96,
        anchors: { left: false, right: true }, items: [auto('r')] })],
      connections: { start: null, end: { wallId: 'wall-1', endpoint: 'start' } },
    })] });
    for (const wallOrder of [['wall-1', 'wall-2'], ['wall-2', 'wall-1']]) {
      for (const woodTopCorner of ['miter', 'butt']) {
        const using = { ...settings, woodTopCorner };
        const subject = syncRoom({ ...stored, wallOrder }, using);
        const groups = woodTopGroups(subject, using);
        expect(groups).toHaveLength(2);
        groups.forEach(({ miters }) => expect(miters).toEqual({ left: false, right: false }));
        expect(groups.find(({ key }) => key === 'wood_top:run-1')).toMatchObject({ start: 25.625, end: 120.75 });
        expect(groups.find(({ key }) => key === 'wood_top:run-2').end)
          .toBeCloseTo(kind === 90 ? 108 : 107.6268, 3);
      }
    }
  });
});

function expectGroupFields(actual, expected, label) {
  if (typeof expected === 'number') {
    expect(actual, label).toBeTypeOf('number');
    expect(Math.abs(actual - expected), label).toBeLessThanOrEqual(0.001);
  } else if (expected && typeof expected === 'object') {
    expect(actual, label).toBeTruthy();
    expect(Array.isArray(actual), label).toBe(Array.isArray(expected));
    expect(Object.keys(actual).sort(), label).toEqual(Object.keys(expected).sort());
    for (const field of Object.keys(expected)) {
      expectGroupFields(actual[field], expected[field], `${label}.${field}`);
    }
  } else {
    expect(actual, label).toEqual(expected);
  }
}

it.each([
  ['G1', 'butt', []],
  ['S1', 'butt', []],
  ['S4', 'wood depth step', [
    {
      key: 'wood_top:Base-L', runIds: ['Base-L', 'Base-R'],
      faces: [{ wallId: 'W1', side: 'front', runIds: ['Base-L', 'Base-R'], x1: -0.75, x2: 120.5625}],
      bandRefs: [
        { wallId: 'W1', side: 'front', bandId: 'Base-L:countertop' },
        { wallId: 'W1', side: 'front', bandId: 'Base-R:countertop' },
      ],
      width: 121.3125, depth: 25.625, thickness: 1.5, start: -0.75, end: 120.5625,
      orderedWidth: 121.3125, orderedDepth: 26.125,
      scribe: { left: false, right: false, back: true }, miters: { left: false, right: false },
      wallId: 'W1', segment: false,
    },
  ]],
  ['N1', 'butt', [
    {
      key: 'wood_top:1dd86015-ceda-42cd-b1bc-15da5a7d7389', runIds: ['1dd86015-ceda-42cd-b1bc-15da5a7d7389', 'eb5f40b0-cf2c-4167-91bf-6be8041d66d2'],
      faces: [
        { wallId: '14d8d962-114c-4f20-ae0d-ead114857c95', side: 'front', runIds: ['1dd86015-ceda-42cd-b1bc-15da5a7d7389'], x1: -1.6875, x2: 47.25},
        { wallId: '14d8d962-114c-4f20-ae0d-ead114857c95', side: 'back', runIds: ['eb5f40b0-cf2c-4167-91bf-6be8041d66d2'], x1: -1.6875, x2: 47.25},
      ],
      bandRefs: [
        { wallId: '14d8d962-114c-4f20-ae0d-ead114857c95', side: 'front', bandId: '1dd86015-ceda-42cd-b1bc-15da5a7d7389:countertop' },
        { wallId: '14d8d962-114c-4f20-ae0d-ead114857c95', side: 'back', bandId: 'eb5f40b0-cf2c-4167-91bf-6be8041d66d2:countertop' },
      ],
      width: 48.9375, depth: 32.1875, thickness: 1.5, start: -1.6875, end: 47.25,
      orderedWidth: 48.9375, orderedDepth: 32.1875,
      scribe: { left: false, right: false, back: false }, miters: { left: false, right: false },
      wallId: '14d8d962-114c-4f20-ae0d-ead114857c95', segment: false,
    },
  ]],
  // 90° ends use old butt values; 45° ends use old miter values (7b9dea spans both).
  ['N4', 'butt', [
    {
      key: 'wood_top:72daa65d-b2af-4907-82ec-b1c56159ff50', runIds: ['72daa65d-b2af-4907-82ec-b1c56159ff50'],
      faces: [{ wallId: '2e7a1a97-e9f7-4490-9f38-2e6d7f913630', side: 'front', runIds: ['72daa65d-b2af-4907-82ec-b1c56159ff50'], x1: 25, x2: 54}],
      bandRefs: [{ wallId: '2e7a1a97-e9f7-4490-9f38-2e6d7f913630', side: 'front', bandId: '72daa65d-b2af-4907-82ec-b1c56159ff50:countertop' }],
      width: 29, depth: 25.875, thickness: 1.5, start: 25, end: 54,
      orderedWidth: 29, orderedDepth: 26.375,
      scribe: { left: false, right: false, back: true }, miters: { left: false, right: false },
      wallId: '2e7a1a97-e9f7-4490-9f38-2e6d7f913630', segment: false,
    },
    {
      key: 'wood_top:e006a1de-eb3c-49e6-bf1a-cafb77b5c8a6', runIds: ['e006a1de-eb3c-49e6-bf1a-cafb77b5c8a6'],
      faces: [{ wallId: '2e7a1a97-e9f7-4490-9f38-2e6d7f913630', side: 'front', runIds: ['e006a1de-eb3c-49e6-bf1a-cafb77b5c8a6'], x1: 83, x2: 119}],
      bandRefs: [{ wallId: '2e7a1a97-e9f7-4490-9f38-2e6d7f913630', side: 'front', bandId: 'e006a1de-eb3c-49e6-bf1a-cafb77b5c8a6:countertop' }],
      width: 36, depth: 25.875, thickness: 1.5, start: 83, end: 119,
      orderedWidth: 36, orderedDepth: 26.375,
      scribe: { left: false, right: false, back: true }, miters: { left: false, right: false },
      wallId: '2e7a1a97-e9f7-4490-9f38-2e6d7f913630', segment: false,
    },
    {
      key: 'wood_top:7b9deabf-fef3-40d8-97a8-ca5ab085e216', runIds: ['7b9deabf-fef3-40d8-97a8-ca5ab085e216'],
      faces: [{ wallId: '2adf9275-5a33-45e6-b544-79f1592b2625', side: 'front', runIds: ['7b9deabf-fef3-40d8-97a8-ca5ab085e216'], x1: 0, x2: 96}],
      bandRefs: [{ wallId: '2adf9275-5a33-45e6-b544-79f1592b2625', side: 'front', bandId: '7b9deabf-fef3-40d8-97a8-ca5ab085e216:countertop' }],
      width: 96, depth: 25.875, thickness: 1.5, start: 0, end: 96,
      orderedWidth: 96, orderedDepth: 26.375,
      scribe: { left: false, right: false, back: true }, miters: { left: false, right: true },
      wallId: '2adf9275-5a33-45e6-b544-79f1592b2625', segment: false,
    },
    {
      key: 'wood_top:21f77ced-7606-4672-97fc-1cdd3cdd4d2c', runIds: ['21f77ced-7606-4672-97fc-1cdd3cdd4d2c'],
      faces: [{ wallId: '3c2c922c-0710-4324-81cf-5932b4477662', side: 'front', runIds: ['21f77ced-7606-4672-97fc-1cdd3cdd4d2c'], x1: 0, x2: 36.062445840513924}],
      bandRefs: [{ wallId: '3c2c922c-0710-4324-81cf-5932b4477662', side: 'front', bandId: '21f77ced-7606-4672-97fc-1cdd3cdd4d2c:countertop' }],
      width: 36.062445840513924, depth: 25.875, thickness: 1.5, start: 0, end: 36.062445840513924,
      orderedWidth: 36.062445840513924, orderedDepth: 26.375,
      scribe: { left: false, right: false, back: true }, miters: { left: true, right: true },
      wallId: '3c2c922c-0710-4324-81cf-5932b4477662', segment: false,
    },
    {
      key: 'wood_top:100fcdd9-4232-4031-b819-bd9882debde1', runIds: ['100fcdd9-4232-4031-b819-bd9882debde1'],
      faces: [{ wallId: 'da73d88e-1cc3-4db2-8e16-736ecd03f9b6', side: 'front', runIds: ['100fcdd9-4232-4031-b819-bd9882debde1'], x1: 0, x2: 44}],
      bandRefs: [{ wallId: 'da73d88e-1cc3-4db2-8e16-736ecd03f9b6', side: 'front', bandId: '100fcdd9-4232-4031-b819-bd9882debde1:countertop' }],
      width: 44, depth: 25.875, thickness: 1.5, start: 0, end: 44,
      orderedWidth: 44, orderedDepth: 26.375,
      scribe: { left: false, right: false, back: true }, miters: { left: true, right: false },
      wallId: 'da73d88e-1cc3-4db2-8e16-736ecd03f9b6', segment: false,
    },
    {
      key: 'wood_top:c3dacb3a-ee41-4d65-806a-d65e92b01c8f', runIds: ['c3dacb3a-ee41-4d65-806a-d65e92b01c8f'],
      faces: [{ wallId: 'e089ce01-8cbf-42bc-83d0-192b506f7c35', side: 'front', runIds: ['c3dacb3a-ee41-4d65-806a-d65e92b01c8f'], x1: 25, x2: 85.5}],
      bandRefs: [{ wallId: 'e089ce01-8cbf-42bc-83d0-192b506f7c35', side: 'front', bandId: 'c3dacb3a-ee41-4d65-806a-d65e92b01c8f:countertop' }],
      width: 60.5, depth: 25.875, thickness: 1.5, start: 25, end: 85.5,
      orderedWidth: 60.5, orderedDepth: 26.375,
      scribe: { left: false, right: false, back: true }, miters: { left: false, right: false },
      wallId: 'e089ce01-8cbf-42bc-83d0-192b506f7c35', segment: false,
    },
  ]],
])('sizes %s wood tops for %s (D6)', (key, variant, expected) => {
  const loaded = goldenRooms().find((room) => room.key === key).load();
  const using = { ...loaded.settings, ...(variant === 'butt' ? { woodTopCorner: 'butt' } : {}) };
  if (variant === 'wood depth step') {
    for (const wall of loaded.room.walls) for (const run of wall.runs) {
      if (!['Base-L', 'Base-R'].includes(run.id)) continue;
      run.top = 'wood';
      run.overrides = { ...run.overrides, nosingProfileId: null };
      if (run.id === 'Base-R') run.depth = 21;
    }
  }
  const subject = syncRoom(loaded.room, using);
  const actual = withBuildCache(() => woodTopGroups(subject, using), subject);
  expectGroupFields(actual, expected, `${key} ${variant}`);
});
