import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../elevation/model/constants.js';
import { frontDepth, runBackOffset } from '../../elevation/model/corners.js';
import { DEFAULT_DOOR_STYLE } from '../../elevation/model/doorStyles.js';
import * as frameModel from '../../elevation/model/frames.js';
import { gridFromItems } from '../../elevation/model/grid.js';
import { partNumbers } from '../../elevation/model/partNumbers.js';
import { resolveWall, syncRoom } from '../../elevation/model/room.js';
import { runBandEnds, runBands } from '../../elevation/model/runBands.js';
import * as sceneModel from '../../elevation/model/runScene.js';
import { normalizeElevationDocument } from '../../elevation/store/persistence.js';
import { doorOrderItems } from '../doorOrder.js';
import { formatInch } from '../format.js';
import { cabinetDescription, drawerFrontNote, hingeNote, linealFeet, shippingDescription, shippingList } from '../shippingList.js';

const settings = DEFAULT_SETTINGS;
const { runScene } = sceneModel;
const face = (type, rest = {}) => ({ type, size: null, ...rest });
const drawers = { direction: 'vertical', size: null,
  children: [face('drawer_front', { size: 5.875 }), face('drawer_front'), face('drawer_front')] };
const cabinet = (id = 'cab') => ({ id, kind: 'cabinet', face: drawers });
const ends = (left = 'none', right = 'none') => ({
  left: { type: left, width: null }, right: { type: right, width: null },
});
function run(id = 'run', pieces = [cabinet()], overrides = {}) {
  return {
    id, cabinetTypeId: 1, x: 24, width: 18, z: 4, height: 30.5, depth: 24,
    heightMode: 'manual', autoCount: false, maxCabinetWidth: null, overrides: {},
    anchors: { left: false, right: false }, ends: ends(),
    grid: gridFromItems(id, pieces.map((piece) => ({ ...piece, width: piece.width ?? null })), overrides.blind),
    ...overrides,
  };
}
function room(runs = [run()], overrides = {}, wallOverrides = {}, s = settings) {
  return syncRoom({
    id: 'room', name: 'Kitchen', profile: { ...settings.defaultProfile }, wallOrder: ['wall'],
    walls: [{
      id: 'wall', name: 'Wall', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5,
      flipped: false, connections: { start: null, end: null }, landings: { start: null, end: null },
      profile: {}, openings: [], joints: [], soffits: [], endPanels: { start: null, end: null },
      runs, ...wallOverrides,
    }], ...overrides,
  }, s);
}
const row = (r, key = 'cab', s = settings) => shippingList(r, s).rows.find((entry) => entry.key === key);
const adjustable = { number: null, key: 'adjustable-shelves', kind: 'adjustable_shelves',
  description: 'Adjustable Shelves', notes: [], size: '' };

describe('RP2.4 step d face frame reasons', () => {
  const flat = { ...settings, defaultStyle: { ...settings.defaultStyle, cabinetStyleId: 14 } };
  const door = (id, extra = {}) => ({ id, kind: 'cabinet', face: face('door'), ...extra });
  const notes = (r, s = flat, shop = s) => shippingList(r, s, shop).rows
    .filter(({ kind }) => kind === 'frame').map(({ notes }) => notes);

  it.each([
    ['D1', 14, ['1 9/16" left stile (mitered to 13/16" end panel)']],
    ['D2', 15, ['beaded face frame - 1 3/4" stiles & rails',
      '1 13/16" left stile (mitered to 13/16" end panel)']],
  ])('explains a mitered run end panel (%s)', (_anchor, cabinetStyleId, expected) => {
    const s = { ...flat,
      defaultStyle: { ...flat.defaultStyle, cabinetStyleId } };
    const r = room([run('run', [door('a')], { ends: ends('end_panel') })], {}, {}, s);
    expect(notes(r, s)).toEqual([expected]);
  });

  it('explains a folded flex filler at a wall (D3)', () => {
    const r = room([run('run', [door('a', { width: 45 })], {
      x: 0, width: 48, anchors: { left: true, right: false },
      ends: { ...ends(), left: { type: 'filler', width: null } },
    })], {}, {}, flat);
    const wall = resolveWall(r, r.walls[0], 'front');
    const scene = runScene(r, wall, wall.runs[0], flat);
    const filler = scene.cells.pieces.find(({ kind }) => kind === 'filler');
    expect(notes(r)).toEqual([[`${formatInch(filler.width + 0.75)} left stile (filler)`]]);
  });

  it('prefers corner lap to filler when a face frame laps a Euro run (D4)', () => {
    const makeRun = (id) => run(id, [door(`${id}-cab`, { width: 45 })], {
      x: 0, width: 48, anchors: { left: true, right: true },
      ends: { left: { type: 'filler', width: null }, right: { type: 'filler', width: null } },
    });
    const a = makeRun('a');
    a.style = { cabinetStyleId: 14 };
    const b = makeRun('b');
    const r = syncRoom({ id: 'room', profile: { ...settings.defaultProfile }, walls: [
      { id: 'A', x1: 0, y1: 0, x2: 84.875, y2: 0, height: 96, thickness: 4.5,
        connections: { end: { wallId: 'B', endpoint: 'start' } },
        profile: {}, openings: [], runs: [a] },
      { id: 'B', x1: 84.875, y1: 0, x2: 84.875, y2: 120.875, height: 96, thickness: 4.5,
        connections: { start: { wallId: 'A', endpoint: 'end' } },
        profile: {}, openings: [], runs: [b] },
    ] }, settings);
    expect(notes(r, settings)).toHaveLength(1);
    expect(notes(r, settings)[0]).toContainEqual(expect.stringMatching(/right stile \(corner lap\)$/));
    expect(notes(r, settings)[0]).not.toContainEqual(expect.stringMatching(/right stile \(filler\)$/));
  });

  it('explains a half-inch gap between flat boxes (D5)', () => {
    const r = room([run('run', [door('a', { gap: 0.5 }), door('b')])], {}, {}, flat);
    expect(notes(r)).toEqual([['2" stile @ #1/#2 (1/2" spacer)']]);
  });

  it('explains an upper bottom rail covering a light rail (D6)', () => {
    const r = room([run('run', [door('a')], { cabinetTypeId: 2, z: 54, depth: 12,
      bottom: [{ id: 'light', kind: 'light_rail', height: 1.5, doors: 'cover' }],
    })], {}, {}, flat);
    expect(notes(r)).toEqual([['2 1/4" bottom rail (light rail behind)']]);
  });

  it('leaves typed reveals without reasons (D7 / C6)', () => {
    const r = room([run('run', [door('a', { reveals: { left: 2.0625 } }), door('b')])], {}, {}, flat);
    expect(notes(r)).toEqual([['2 13/16" left stile']]);
  });

  it('uses the correct wall panel endpoint and style thickness on front and back views', () => {
    const r = room(['front', 'back'].map((wallSide) => run(wallSide, [door(`${wallSide}-cab`)], {
      x: 0, width: 48, wallSide, anchors: { left: true, right: true },
    })), {}, { x2: 48, thickness: 0,
      endPanels: { start: { width: null, styleId: 'thick' }, end: { width: null } },
    }, flat);
    r.doorStyles = [{ ...DEFAULT_DOOR_STYLE, id: 'thick', thickness: 1 }];
    expect(notes(syncRoom(r, flat))).toEqual([
      ['1 3/4" left stile (mitered to 1" end panel)', '1 9/16" right stile (mitered to 13/16" end panel)'],
      ['1 9/16" left stile (mitered to 13/16" end panel)', '1 3/4" right stile (mitered to 1" end panel)'],
    ]);
  });

  it('subtracts the beaded seam gap and ignores gaps equal to the run standard', () => {
    const s = { ...flat, defaultStyle: { ...flat.defaultStyle, cabinetStyleId: 15 } };
    const beaded = 'beaded face frame - 1 3/4" outer stiles & rails, 2" interior stiles & rails';
    const fixture = (gap) => room([run('run', [door('a', { gap }), door('b')])], {}, {}, s);
    expect(notes(fixture(1), s)).toEqual([[beaded, '2 1/2" stile @ #1/#2 (1/2" spacer)']]);
    expect(notes(fixture(0.5), s)).toEqual([[beaded]]);
    const standard = { ...s, insetFrame: { ...s.insetFrame, stile: 1 } };
    expect(notes(fixture(1), s, standard)).toEqual([[
      'beaded face frame - 2 1/4" outer stiles & rails, 2 1/2" interior stiles & rails',
      '1 3/4" left stile', '1 3/4" right stile']]);
  });

  it('joins only the leading covered bottom part labels', () => {
    const r = room([run('run', [door('a')], { cabinetTypeId: 2, z: 54, depth: 12,
      bottom: [
        { id: 'light', kind: 'light_rail', height: 1.5, doors: 'cover' },
        { id: 'panel', kind: 'panel', height: 0.75, doors: 'flush' },
        { id: 'cap', kind: 'bottom_cap', height: 1, doors: 'visible' },
      ],
    })], {}, {}, flat);
    expect(notes(r)).toEqual([['3" bottom rail (light rail & panel behind)']]);
  });
});

describe('RP2.4 step c shipping face frame notes', () => {
  function fixture(insetFrame = {}, cabinetStyleId = 14, reveals = []) {
    const s = { ...settings, insetFrame: { ...settings.insetFrame, ...insetFrame },
      defaultStyle: { ...settings.defaultStyle, cabinetStyleId } };
    const r = room([run('run', ['a', 'b'].map((id, index) => ({
      id, kind: 'cabinet', face: face('door', { hinge: 'left' }), reveals: reveals[index],
    })))], { settingsOverrides: { insetFrame } }, {}, s);
    return { r, s };
  }

  it.each([
    ['C1', {}, 14, [], false, []],
    ['C2', { stile: 1 }, 14, [], false, ['2" stiles, 1 1/2" rails']],
    ['C3', { stile: 1, rail: 2 }, 14, [], false, ['2" stiles & rails']],
    ['C4', {}, 15, [], false, ['beaded face frame - 1 3/4" outer stiles & rails, 2" interior stiles & rails']],
    ['C5', { stile: 1 }, 14, [], true, []],
    ['C6', {}, 14, [{ left: 2.0625 }], false, ['2 13/16" left stile']],
    ['C7', {}, 14, [{ right: 1 }, { left: 1 }], false, ['2" stile @ #1/#2']],
    ['C8', {}, 14, [{ right: 1 }, { left: 1 }], false, ['2" stile @ #1/#2', 'glue up']],
  ])('prints the frame row notes for %s', (anchor, insetFrame, style, reveals, sameShop, expected) => {
    const { r, s } = fixture(insetFrame, style, reveals);
    const frame = partNumbers(r, s).parts.find(({ kind }) => kind === 'frame');
    if (anchor === 'C8') r.reportParts = { [frame.key]: { note: 'glue up' } };
    const result = shippingList(r, s, sameShop ? s : settings);
    expect(result.rows.filter(({ kind }) => kind === 'cabinet').map(({ number }) => number)).toEqual([1, 2]);
    expect(result.rows.find(({ kind }) => kind === 'frame')).toMatchObject({ number: 3, notes: expected });
  });

  it('keeps Euro rows unchanged and has no frame row (C9)', () => {
    const { r, s } = fixture({}, 13);
    const result = shippingList(r, s);
    expect(result.rows.some(({ kind }) => kind === 'frame')).toBe(false);
    expect(shippingList(r, s, { ...settings, insetFrame: { stile: 2, rail: 3 } })).toEqual(result);
    expect(result.rows.filter(({ kind }) => kind === 'cabinet')).toEqual([
      { number: 1, key: 'a', kind: 'cabinet', description: 'Base', notes: ['full top', 'hl'], size: '9 x 30 1/2 x 24' },
      { number: 2, key: 'b', kind: 'cabinet', description: 'Base', notes: ['full top', 'hl'], size: '9 x 30 1/2 x 24' },
    ]);
  });

  it('uses room settings as the standards when shop settings are omitted', () => {
    const { r, s } = fixture({ stile: 1 });
    expect(shippingList(r, s).rows.find(({ kind }) => kind === 'frame').notes).toEqual([]);
  });

  it('uses the shipping row part-number overrides for member locations', () => {
    const { r, s } = fixture({}, 14, [{ right: 1 }, { left: 1 }]);
    r.partNumberOverrides = { a: 8, b: 5 };
    expect(shippingList(r, s, settings).rows.find(({ kind }) => kind === 'frame').notes)
      .toEqual(['2" stile @ #5/#8']);
  });

  it('preserves free text without frame notes when members cannot be cut apart', () => {
    const { r, s } = fixture({}, 15);
    const frame = partNumbers(r, s).parts.find(({ kind }) => kind === 'frame');
    r.reportParts = { [frame.key]: { note: 'glue up' } };
    const spy = vi.spyOn(frameModel, 'frameMembers').mockReturnValue(null);
    try {
      expect(shippingList(r, s, settings).rows.find(({ kind }) => kind === 'frame').notes).toEqual(['glue up']);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('FL1 step a ordered filler depths', () => {
  const endRun = (overrides = {}) => run('run', undefined, {
    width: 19.625, ends: { ...ends(), left: { type: 'filler', width: 1.625 } }, ...overrides,
  });

  it('keeps the standard filler depth beside one-inch doors (P2)', () => {
    const r = room([endRun({ doorStyleId: 'thick' })], { doorStyles: [
      { ...DEFAULT_DOOR_STYLE, id: 'thick', thickness: 1 },
    ] });
    expect(r.walls[0].runs[0]._doorThickness).toBe(1);
    expect(row(r, 'run:left').size).toBe('1 5/8 x 30 1/2 x 3 3/16');
  });

  it('uses MDF face thickness when every door and drawer front is MDF core (P3)', () => {
    const r = room([endRun({ doorStyleId: 'mdf' })], { doorStyles: [
      { ...DEFAULT_DOOR_STYLE, id: 'mdf', designId: 'slab-mdf', thickness: 0.75 },
    ] });
    expect(r.walls[0].runs[0]._doorThickness).toBe(0.75);
    expect(row(r, 'run:left').size).toBe('1 5/8 x 30 1/2 x 3 1/8');
  });

  it('uses a stored four-inch return (P6) and omits the tongue deduction for a typed zero', () => {
    const r = room([endRun({ endFiller: { left: { returnDepth: 4 } } })]);
    expect(row(r, 'run:left').size).toBe('1 5/8 x 30 1/2 x 4 11/16');
    r.walls[0].runs[0].endFiller.left.returnDepth = 0;
    expect(row(r, 'run:left').size).toBe('1 5/8 x 30 1/2 x 13/16');
  });

  it('uses the configured face thickness (P10) and tongue depth for ordinary and T-fillers', () => {
    const s = { ...settings, fillerThickness: 0.75 };
    const r = room([endRun()], {}, {}, s);
    expect(row(r, 'run:left', s).size).toBe('1 5/8 x 30 1/2 x 3 1/8');
    const tongue = { ...s, fillerReturnTongue: 0.25 };
    expect(row(r, 'run:left', tongue).size).toBe('1 5/8 x 30 1/2 x 3');
    const tees = room([run('run', [cabinet('a'), cabinet('b')], { width: 40, tFiller: 'seams' })], {}, {}, tongue);
    expect(row(tees, 'tee:a|b', tongue).size).toBe('1 1/2 x 30 1/2 x 3 1/16');
  });
});

describe('HP1 step d shipping hinge notes', () => {
  it('keeps a left swing note and omits plain pairs (anchors 1 and 6)', () => {
    expect(hingeNote([face('door', { hinge: 'left' })])).toBe('hl');
    expect(hingeNote(['left', 'right'].map((half) => face('pair_door', { path: 'r', half })))).toBeNull();
  });

  it('spells out vertical hinges and orders mixed notes top-down (anchors 2 and 3)', () => {
    expect(hingeNote([face('door', { hinge: 'top' })])).toBe('hinge top');
    expect(hingeNote([face('door', { hinge: 'bottom' })])).toBe('hinge bottom');
    const faces = [face('door', { z: 0, height: 10, hinge: 'left' }),
      face('door', { z: 10, height: 10, hinge: 'top' })];
    const before = structuredClone(faces);
    expect(hingeNote(faces)).toBe('hinge top, hl');
    expect(faces).toEqual(before);
  });

  it('names flipper and pocket actions with their side hinges (anchor 4)', () => {
    expect(hingeNote([face('door', { action: 'flipper', hinge: 'right' })])).toBe('flipper door hr');
    expect(hingeNote([face('door', { action: 'flipper', hinge: 'left' })])).toBe('flipper door hl');
    expect(hingeNote([face('door', { action: 'pocket', hinge: 'left' })])).toBe('pocket door hl');
    expect(hingeNote([face('door', { action: 'pocket', hinge: 'right' })])).toBe('pocket door hr');
  });

  it('notes each action pair once by path in face order (anchor 5)', () => {
    const pair = (action, path, x) => ['right', 'left'].map((half) => face('pair_door', {
      action, path, half, x: x + (half === 'right' ? 10 : 0), z: 0, height: 10,
    }));
    const flipper = pair('flipper', 'r.0', 0);
    expect(hingeNote(flipper)).toBe('flipper doors');
    expect(hingeNote(pair('pocket', 'r.1', 20))).toBe('pocket doors');
    expect(hingeNote(pair('sliding', 'r.2', 40))).toBe('sliding doors');
    expect(hingeNote([...pair('sliding', 'r.2', 40), ...pair('pocket', 'r.1', 20), ...flipper,
      ...pair('flipper', 'r.3', 60)]))
      .toBe('flipper doors, pocket doors, sliding doors, flipper doors');
  });

  it('notes a pull-out above drawer fronts without a hinge (anchor 7)', () => {
    expect(hingeNote([face('drawer_front', { z: 0, height: 10 }),
      face('drawer_front', { z: 10, height: 10 }), face('door', { action: 'pullout', z: 20, height: 10 })]))
      .toBe('pull-out');
    const r = room([run('run', [{ ...cabinet(), face: { direction: 'vertical', size: null,
      children: [face('door', { action: 'pullout', size: 10 }), face('drawer_front'), face('drawer_front')] } }])]);
    expect(row(r).notes).toContain('pull-out');
  });

  it('collapses repeated sliding notes and passes pair actions into report rows (anchor 8)', () => {
    expect(hingeNote([face('door', { action: 'sliding' }), face('door', { action: 'sliding' })]))
      .toBe('sliding door');
    const r = room([run('run', [{ ...cabinet(), face: face('pair_door', { action: 'flipper' }) }])]);
    expect(row(r).notes).toEqual(['full top', 'flipper doors']);
  });
});

describe('IN1b step c box construction notes', () => {
  const fixture = (leaf = {}, runOverrides = {}, wallOverrides = {}, roomOverrides = {}) => room([
    run('run', [{ ...cabinet(), face: face('open'), ...leaf }], runOverrides),
  ], roomOverrides, wallOverrides);

  it('prints full top for a standard base (anchor 1)', () => {
    expect(row(fixture()).notes).toEqual(['full top']);
  });

  it('omits the standard base sink spreaders note (anchor 2)', () => {
    expect(row(fixture({ purpose: 'sink' })).notes).toEqual([]);
    expect(row(fixture({ purpose: 'cooktop' })).notes).toEqual([]);
  });

  it('combines upper overlays before the finished bottom note (anchor 3)', () => {
    const r = fixture({ box: { top: 'overlay', bottom: 'overlay', finBottom: true } },
      { cabinetTypeId: 2, z: 54, depth: 12 });
    expect(row(r).notes).toEqual(['top & bottom overlay sides', 'fin bottom (dowel front holes)']);
  });

  it('orders full top, reveals, no deck, inset back and missing side (anchor 4)', () => {
    const r = fixture({ box: { bottom: 'none', right: false }, reveals: { left: 0.125 } },
      {}, { thickness: 0 });
    expect(row(r).notes).toEqual(['full top', 'RV\'s (1/8" L)', 'no deck', '3/4" inset back', 'no right side']);
  });

  it('prints tall spreaders before an applied back (anchor 5)', () => {
    const r = fixture({ box: { top: 'spreaders', back: 'applied' } },
      { cabinetTypeId: 3, z: 0, height: 84 });
    expect(row(r).notes).toEqual(['top spreaders', '1/4" applied back']);
  });

  it('orders individual overlays and finishes between Boxes and reveals, with free text last', () => {
    for (const [box, overlay] of [
      [{ top: 'overlay' }, 'top overlays sides'],
      [{ bottom: 'overlay' }, 'bottom overlays sides'],
    ]) {
      const r = fixture({ box: { ...box, finTop: true, finBottom: true }, reveals: { left: 0.125 } },
        {}, {}, { reportParts: { cab: { boxes: 'MAPLE PLY', note: 'last' } } });
      expect(row(r).notes).toEqual(['MAPLE PLY BOX', 'full top', overlay,
        'fin top (dowel front holes)', 'fin bottom (dowel front holes)', 'RV\'s (1/8" L)', 'last']);
    }
  });

  it('orders missing parts and bottom spreaders while suppressing finishes on non-full parts', () => {
    const r = fixture({ box: {
      top: 'none', bottom: 'spreaders', back: 'none', left: false, right: false, finTop: true, finBottom: true,
    } });
    const before = structuredClone(r);
    expect(row(r).notes).toEqual(['no top', 'bottom spreaders', 'no back', 'no left side', 'no right side']);
    expect(r).toEqual(before);
    expect(row(fixture({ box: { top: 'spreaders', bottom: 'none', finTop: true, finBottom: true } })).notes)
      .toEqual(['no deck', '3/4" inset back']);
  });

  it('uses nested cabinet leaves and keeps construction notes off filler rows', () => {
    const grid = gridFromItems('nested', [
      { ...cabinet(), width: null, face: face('open'), box: { back: 'none' } },
      { id: 'fill', kind: 'filler', width: 3 },
    ]);
    const r = room([run('run', [{ id: 'group', grid }])]);
    expect(row(r).notes).toEqual(['full top', 'no back']);
    expect(row(r, 'fill').notes).toEqual(['L-shape']);
  });
});

describe('RP2 step d cabinet notes', () => {
  it('groups working drawer heights top-down (anchor 1)', () => {
    const faces = [face('drawer_front', { z: 0, height: 12 }),
      face('drawer_front', { z: 24, height: 5.875 }), face('drawer_front', { z: 12, height: 12 })];
    const before = structuredClone(faces);
    expect(drawerFrontNote(faces)).toBe('DF\'s (1 - 5 7/8", 2 - 12")');
    expect(drawerFrontNote([5.875, 12, 12].map((height) => face('drawer_front', { height }))))
      .toBe('DF\'s (1 - 5 7/8", 2 - 12")');
    expect(faces).toEqual(before);
  });

  it('counts identical fronts and groups to the nearest thirty-second (anchor 2)', () => {
    expect(drawerFrontNote([6, 6, 6].map((height) => face('drawer_front', { height })))).toBe('DF\'s (3 - 6")');
    expect(drawerFrontNote([6.001, 5.999, 6.032].map((height, index) => face('drawer_front', { height, z: 20 - index * 10 }))))
      .toBe('DF\'s (2 - 6", 1 - 6 1/32")');
    expect(drawerFrontNote([face('false_front', { height: 6 }), face('door')])).toBeNull();
  });

  it('prints a right hinge and collapses repeated known sides (anchor 3)', () => {
    expect(hingeNote([face('door', { hinge: 'right' })])).toBe('hr');
    expect(hingeNote([face('door', { hinge: 'left' }), face('door', { hinge: 'left' })])).toBe('hl');
  });

  it('prints mixed hinges top-down, then left-right (anchor 4)', () => {
    const faces = [face('door', { z: 0, height: 10, hinge: 'right' }),
      face('door', { z: 10, height: 10, hinge: 'left' })];
    const before = structuredClone(faces);
    expect(hingeNote(faces)).toBe('hl, hr');
    expect(faces).toEqual(before);
    expect(hingeNote([face('door', { x: 20, hinge: 'right' }), face('door', { x: 0, hinge: 'left' })]))
      .toBe('hl, hr');
  });

  it('marks each unknown hinge and excludes pair halves (anchor 5)', () => {
    expect(hingeNote([face('door')])).toBe('hinge?');
    expect(hingeNote([face('pair_door', { half: 'left' }), face('pair_door', { half: 'right' })])).toBeNull();
    expect(hingeNote([face('door'), face('door', { hinge: 'right' }), face('door')])).toBe('hinge?, hr, hinge?');
    expect(hingeNote([])).toBeNull();
  });

  it('prints only reveals differing from the standard in T, B, L, R, H, V order (anchor 6)', () => {
    const r = room([run('run', [{ ...cabinet(), face: face('open'), reveals: { top: 0.25, bottom: 0.125 } }])]);
    expect(row(r).notes).toEqual(['full top']);
    r.walls[0].runs[0].grid.cells[0].node.reveals = {
      vertical: 0.125, right: 0.25, horizontal: 0, bottom: null, left: 0.125, top: 0.25,
    };
    expect(row(r).notes).toEqual(['full top', 'RV\'s (1/8" L, 1/4" R, 0" H)']);
    delete r.walls[0].runs[0].grid.cells[0].node.reveals;
    expect(row(r).notes).toEqual(['full top']);
  });

  it('prints an override only when it differs from room Boxes (anchor 7)', () => {
    const s = { ...settings, report: { ...settings.report, boxMaterial: 'WHITE MELAMINE' } };
    const r = room([run('run', [{ ...cabinet(), face: face('open') }])], {
      reportParts: { cab: { boxes: 'MAPLE PLY' } },
    }, {}, s);
    expect(row(r, 'cab', s).notes).toEqual(['MAPLE PLY BOX', 'full top']);
    r.reportParts.cab.boxes = 'WHITE MELAMINE';
    expect(row(r, 'cab', s).notes).toEqual(['full top']);
    delete r.reportParts.cab.boxes;
    expect(row(r, 'cab', s).notes).toEqual(['full top']);
  });

  it('uses the widest resolved single door and the blind extension (anchor 8)', () => {
    const r = room([run('run', [{ ...cabinet(), face: face('door') }], {
      width: 24, blind: { left: 39.5, right: null }, ends: { ...ends(), left: { type: 'blind', width: 6 } },
    })]);
    expect(row(r).notes).toEqual(['full top', 'Door x 17 7/8", Blind x 21 1/2"', 'hl']);
    r.walls[0].runs[0].grid.cells[0].node.face = { direction: 'horizontal', size: null,
      children: [face('door', { size: 6 }), face('door')] };
    expect(row(r).notes[1]).toBe('Door x 11 3/4", Blind x 21 1/2"');
  });

  it('uses visible width when a blind cabinet has no single door', () => {
    const r = room([run('run', [{ ...cabinet(), face: face('pair_door') }], {
      width: 24, blind: { left: null, right: 39.5 }, ends: { ...ends(), right: { type: 'blind', width: 6 } },
    })]);
    expect(row(r).notes).toEqual(['full top', 'Door x 18", Blind x 21 1/2"']);
  });

  it('passes through the right-side T-filler rabbet note (anchor 9)', () => {
    const r = room([run('run', [{ ...cabinet(), face: face('open') }], {
      width: 21, ends: { ...ends(), right: { type: 'filler', width: 3 } },
      endFiller: { right: { tFiller: true } },
    })]);
    expect(row(r).notes).toEqual(['full top', 'RV\'s (13/16" R)', 'FF to rabbet right side for T-filler']);
    expect(row(r, 'run:right').notes).toEqual(['T-shape']);
  });

  it('keeps box, drawer, hinge and free-text notes in order (anchor 10)', () => {
    const r = room([run('run', [{ ...cabinet(), face: { direction: 'vertical', size: null,
      children: [face('drawer_front', { size: 5.875 }), face('door', { hinge: 'left' })] } }])], {
      reportParts: { cab: { boxes: 'MAPLE PLY', note: ' x ' } },
    });
    expect(row(r)).toMatchObject({ description: 'Base Top Drawer',
      notes: ['MAPLE PLY BOX', 'full top', 'DF\'s (1 - 5 7/8")', 'hl', 'x'] });
  });

  it('counts false fronts separately from drawers and ignores pair hinges (anchor 11)', () => {
    const sink = { ...cabinet(), face: { direction: 'vertical', size: null,
      children: [face('false_front', { size: 5.875 }), face('pair_door')] } };
    expect(row(room([run('run', [sink])])).notes).toEqual(['full top', 'false front']);
    sink.face.children.unshift(face('false_front', { size: 5.875 }));
    expect(row(room([run('run', [sink])])).notes).toEqual(['full top', '2 false fronts']);
  });

  it('orders all seven groups before free text and preserves the room', () => {
    const r = room([run('run', [{ ...cabinet(), reveals: { top: 0.25 }, face: {
      direction: 'vertical', size: null, children: [face('drawer_front', { size: 5.875 }),
        face('false_front', { size: 5.875 }), face('door', { hinge: 'left' })],
    } }], { width: 27, blind: { left: 39.5, right: null },
      ends: { left: { type: 'blind', width: 6 }, right: { type: 'filler', width: 3 } },
      endFiller: { right: { tFiller: true } },
    })], { reportParts: { cab: { boxes: 'MAPLE PLY', note: 'last' } } });
    const before = structuredClone(r);
    expect(row(r).notes).toEqual(['MAPLE PLY BOX', 'full top', 'RV\'s (3/32" L, 27/32" R)',
      'Door x 17 1/16", Blind x 21 1/2"', 'DF\'s (1 - 5 7/8")', 'false front', 'hl',
      'FF to rabbet right side for T-filler', 'last']);
    expect(r).toEqual(before);
  });
});

describe('RP2.2 step b reveal notes', () => {
  const revealNotes = (r, s = settings) => row(r, 'cab', s).notes.filter((note) => note.startsWith("RV's"));
  const uncaptured = (overrides = {}, reveals, roomOverrides = {}) => room([run('run', [
    { ...cabinet(), width: 24, face: face('door', { hinge: 'left' }), reveals },
    { ...cabinet('cab2'), width: 24, face: face('door', { hinge: 'left' }) },
  ], { width: 48, ...overrides })], roomOverrides);

  it('compares final base reveals against the stone standard (anchors 3, 4, 6, 7)', () => {
    for (const [top, reveals, expected] of [
      [undefined, undefined, []],
      ['wood', undefined, ['RV\'s (1/8" T)']],
      ['wood', { bottom: 0.25 }, ['RV\'s (1/8" T, 1/4" B)']],
      [undefined, { top: 0.25 }, []],
    ]) {
      const r = uncaptured({ top }, reveals);
      expect(revealNotes(r)).toEqual(expected);
      expect(row(r, 'cab2').notes.filter((note) => note.startsWith("RV's")))
        .toEqual(top === 'wood' ? ['RV\'s (1/8" T)'] : []);
    }
  });

  it('uses each tall and upper type standard (anchors 5, 9)', () => {
    expect(revealNotes(uncaptured({ cabinetTypeId: 3, height: 84, z: 0, top: 'wood' }))).toEqual([]);
    expect(revealNotes(uncaptured({ cabinetTypeId: 2, z: 54, depth: 12 }))).toEqual([]);
  });

  it('prints rule-made captured side reveals (anchor 8)', () => {
    const r = room([run('run', [{ ...cabinet(), face: face('door', { hinge: 'left' }) }], {
      width: 36, ends: {
        left: { type: 'filler', width: 3 }, right: { type: 'filler', width: 3 },
      },
    })]);
    expect(revealNotes(r)).toEqual(['RV\'s (3/32" L, 3/32" R)']);
  });

  it('keeps inset notes typed-only and resolves room, run and leaf styles (anchor 10)', () => {
    const insetRoom = { style: { cabinetStyleId: 14 } };
    const r = uncaptured({}, { top: 0.25 }, insetRoom);
    expect(revealNotes(r)).toEqual(['RV\'s (1/4" T)']);
    const base = r.walls[0].runs[0];
    delete base.grid.cells[0].node.reveals;
    expect(revealNotes(r)).toEqual([]);
    expect(revealNotes(uncaptured({ style: { cabinetStyleId: 13 } }, { top: 0.25 }, insetRoom)))
      .toEqual([]);
    const leafEuro = structuredClone(r);
    leafEuro.walls[0].runs[0].grid.cells[0].node.reveals = { top: 0.25 };
    leafEuro.walls[0].runs[0].grid.cells[0].node.style = { cabinetStyleId: 13 };
    expect(revealNotes(leafEuro)).toEqual([]);
  });

  it('compares at 1e-6 tolerance before formatting and orders all six differences', () => {
    const r = uncaptured({}, { top: 0.25 + 0.5e-6 });
    expect(revealNotes(r)).toEqual([]);
    r.walls[0].runs[0].grid.cells[0].node.reveals.top = 0.25 + 2e-6;
    expect(revealNotes(r)).toEqual(['RV\'s (1/4" T)']);
    r.walls[0].runs[0].grid.cells[0].node.reveals = {
      vertical: 0, right: 0, horizontal: 0, bottom: 0, left: 0, top: 0,
    };
    expect(revealNotes(r)).toEqual(['RV\'s (0" T, 0" B, 0" L, 0" R, 0" H, 0" V)']);
  });

  it('falls back to typed-only notes when a cabinet has no face layout', () => {
    const r = uncaptured({}, { top: 0.25, bottom: null });
    const spy = vi.spyOn(sceneModel, 'runScene').mockImplementation((...args) => ({
      ...runScene(...args), faceLayouts: new Map(),
    }));
    try {
      expect(revealNotes(r)).toEqual(['RV\'s (1/4" T)']);
      delete r.walls[0].runs[0].grid.cells[0].node.reveals;
      expect(revealNotes(r)).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('RP2 step c cabinet descriptions', () => {
  it('counts working drawer fronts (anchor 1)', () => {
    expect(cabinetDescription(1, Array.from({ length: 3 }, () => face('drawer_front')))).toBe('Base 3 Drawers');
  });

  it('recognizes a drawer above every door (anchor 2)', () => {
    expect(cabinetDescription(1, [face('drawer_front', { z: 24.5, height: 5.875 }),
      face('door', { z: 0, height: 24.375 })])).toBe('Base Top Drawer');
  });

  it('implies doors for every run type, including resolved pair halves and panels (anchor 3)', () => {
    expect(cabinetDescription(1, [face('pair_door', { half: 'L' }), face('pair_door', { half: 'R' })])).toBe('Base');
    expect(cabinetDescription(3, Array.from({ length: 6 }, () => face('door')))).toBe('Tall');
    expect(cabinetDescription(2, [face('door')])).toBe('Upper');
    expect(cabinetDescription(1, [face('panel')])).toBe('Base');
  });

  it('calls open or absent faces Open (anchor 4)', () => {
    expect(cabinetDescription(1, [face('open')])).toBe('Base Open');
    expect(cabinetDescription(1, [])).toBe('Base Open');
  });

  it('handles singular, multiple top drawers and other mixes (anchor 5)', () => {
    expect(cabinetDescription(1, [face('drawer_front')])).toBe('Base 1 Drawer');
    const two = [face('drawer_front', { z: 25, height: 5 }), face('drawer_front', { z: 25, height: 5 })];
    expect(cabinetDescription(1, [...two, face('door', { z: 0, height: 24 }), face('door', { z: 0, height: 24 })]))
      .toBe('Base 2 Top Drawers');
    expect(cabinetDescription(1, [face('door', { z: 6, height: 24 }), face('drawer_front', { z: 0, height: 5 })]))
      .toBe('Base Drawers & Doors');
    expect(cabinetDescription(1, [face('drawer_front', { z: 24 - 0.0000005 }), face('door', { z: 0, height: 24 })]))
      .toBe('Base Top Drawer');
    expect(cabinetDescription(1, [face('drawer_front', { z: 24 - 0.000002 }), face('door', { z: 0, height: 24 })]))
      .toBe('Base Drawers & Doors');
  });

  it('ignores false fronts above pairs (anchor 6)', () => {
    expect(cabinetDescription(1, [face('false_front', { z: 25 }), face('pair_door', { half: 'L' }),
      face('pair_door', { half: 'R' })])).toBe('Base');
    expect(cabinetDescription(1, [face('false_front'), face('open')])).toBe('Base Open');
  });
});

describe('RP2 step c shipping list rows', () => {
  it('uses resolved cabinet faces and box depth without mutating the room (anchor 7)', () => {
    const r = room();
    const before = structuredClone(r);
    expect(row(r)).toEqual({ number: 1, key: 'cab', kind: 'cabinet',
      description: 'Base 3 Drawers', notes: ['full top', 'DF\'s (1 - 5 7/8", 2 - 12")'], size: '18 x 30 1/2 x 24' });
    const part = partNumbers(r, settings).parts.find(({ key }) => key === 'cab');
    expect(shippingDescription(r, settings, part)).toBe('Base 3 Drawers');
    expect(r).toEqual(before);
  });

  it('lets the typed name replace the entire description and keeps free text last (anchor 8)', () => {
    const r = room(undefined, { reportParts: { cab: { name: 'Pencil Base', note: 'check pulls', shopBuilt: true } } });
    expect(row(r)).toMatchObject({ description: 'Pencil Base', notes: ['full top', 'DF\'s (1 - 5 7/8", 2 - 12")', 'check pulls'] });
    r.reportParts.cab.name = '  ';
    r.reportParts.cab.note = '   ';
    expect(row(r)).toMatchObject({ description: 'Shop-built Base 3 Drawers', notes: ['full top', 'DF\'s (1 - 5 7/8", 2 - 12")'] });
  });

  it('adds the normal filler return to its thickness (anchor 9)', () => {
    const r = room([run('run', undefined, { width: 19.625,
      ends: { ...ends('filler'), left: { type: 'filler', width: 1.625 } } })]);
    expect(row(r, 'run:left')).toMatchObject({ description: 'Base Filler', size: '1 5/8 x 30 1/2 x 3 3/16' });
  });

  it('orders the blind filler six inches wide with no return (anchor 10)', () => {
    const r = room([run('run', undefined, { width: 48, blind: { left: 42, right: null },
      ends: ends('blind') })]);
    expect(row(r, 'run:left')).toMatchObject({ description: 'Base Filler', size: '6 x 30 1/2 x 13/16' });
  });

  it('orders a free end by depth and accepts the explicit Shop-built flag (anchors 11, 13)', () => {
    const r = room([run('run', undefined, { width: 18.75, ends: ends('none', 'end_panel') })]);
    expect(row(r, 'run:right')).toMatchObject({ description: 'Base End Panel', size: '24 7/8 x 30 1/2 x 13/16' });
    r.reportParts = { 'run:right': { shopBuilt: true } };
    expect(row(r, 'run:right').description).toBe('Shop-built Base End Panel');
  });

  it('recognizes a joined end as sheet, unless its own style overrides it (anchor 12)', () => {
    const r = room([
      run('run', undefined, { width: 18.75, ends: ends('end_panel'),
        anchors: { left: { to: 'follow', runId: 'other', side: 'right', offset: 0 }, right: false } }),
      run('other', [cabinet('other-cab')], { x: 60 }),
    ]);
    expect(row(r, 'run:left')).toMatchObject({ description: 'Shop-built Base End Panel', size: '24 7/8 x 30 1/2 x 3/4' });
    r.walls[0].runs.find(({ id }) => id === 'run').ends.left.styleId = 'default';
    expect(row(syncRoom(r, settings), 'run:left').description).toBe('Base End Panel');
  });

  it('prints a flush side cell with the drawing depth and its resolved style (anchor 14)', () => {
    const r = room([run('run', [{ id: 'panel', kind: 'panel', width: 0.75, styleId: 'default' }, cabinet()], { width: 18.75 })]);
    expect(row(r, 'panel')).toMatchObject({ description: 'Base Side Panel', size: '24 7/8 x 30 1/2 x 3/4' });
    r.walls[0].runs[0].grid.cells[0].node.styleId = 'sheet';
    expect(row(syncRoom(r, settings), 'panel').description).toBe('Shop-built Base Side Panel');
  });

  it('prints a wall end panel using its part width, top and resolved thickness (anchor 15)', () => {
    const r = room([run('run', undefined, { z: 6, anchors: { left: true, right: false } })], {},
      { endPanels: { start: { width: 25 }, end: null } });
    expect(row(r, 'wall:endPanel:start')).toMatchObject({ description: 'Wall End Panel', size: '25 x 36 1/2 x 13/16' });
  });

  it('uses ordered furniture base dimensions (anchor 16)', () => {
    const r = room([run('run', undefined, { width: 96.5 })], {
      profile: { ...settings.defaultProfile, baseKind: 'furniture_base', furnitureBaseProud: 0 },
    });
    expect(row(r, 'furniture_base:run')).toMatchObject({ description: 'Furniture Base', size: '96 1/2 x 4 1/2 x 24 7/8' });
  });

  it('retains Toe Kick and Crown molding rows at their part numbers (anchor 17)', () => {
    const r = room([run('run', undefined, { top: 'crown' })]);
    const rows = shippingList(r, settings).rows;
    expect(rows.filter(({ key }) => ['molding:toeKick', 'molding:crown'].includes(key)))
      .toEqual(['Toe Kick', 'Crown'].map((description, index) => ({
        number: index === 0 ? 2 : 4, key: index === 0 ? 'molding:toeKick' : 'molding:crown',
        kind: 'molding', description, notes: [index === 0 ? '4" tall' : '4 1/2" tall'],
        size: index === 0 ? 'Lineal Feet: 8' : 'Lineal Feet: 16',
      })));
    // Existing part numbering also carries Top Mold with Crown; step c must keep that entry.
    expect(rows.slice(1, -1).map(({ description }) => description)).toEqual(['Toe Kick', 'Top Mold', 'Crown']);
  });

  it('always ends with Adjustable Shelves and trims the room note (anchor 18)', () => {
    expect(shippingList(room(undefined, { reportNote: ' Ship Fri ' }), settings)).toMatchObject({ roomNote: 'Ship Fri' });
    expect(shippingList(room(), settings).rows.at(-1)).toEqual(adjustable);
    expect(shippingList(room(undefined, { reportNote: '   ' }), settings).roomNote).toBeNull();
  });

  it('sorts overrides numerically and preserves part order for duplicate numbers (anchor 19)', () => {
    const r = room([run('run', [cabinet('a'), cabinet('b'), cabinet('c')], { width: 54 })], {
      partNumberOverrides: { c: 40 },
    });
    expect(shippingList(r, settings).rows.map(({ key }) => key)).toEqual(['a', 'b', 'molding:toeKick', 'c', 'adjustable-shelves']);
    r.partNumberOverrides = { c: 2, a: 2 };
    const numbers = partNumbers(r, settings);
    const result = shippingList(r, settings);
    expect(result.rows.slice(0, -1).map(({ key }) => key)).toEqual(['b', 'a', 'c', 'molding:toeKick']);
    expect(result.warnings).toEqual(numbers.warnings);
    expect(result.warnings).toEqual([{ code: 'duplicate-part-number', number: 2, keys: ['a', 'c'] }]);
  });

  it('returns only Adjustable Shelves for an empty room (anchor 20)', () => {
    expect(shippingList(room([]), settings)).toEqual({ rows: [adjustable], wallNotes: [], roomNote: null, warnings: [] });
  });

  it('uses the picked molding profile name without a Shop-built prefix', () => {
    const s = { ...settings, sectionProfiles: [{ id: 'crown', kind: 'crown', name: 'Cove',
      drawnPoints: { elevation: [], plan: [] }, geometry: {
      points: { a: [0, 0], b: [0, 4.5], c: [1, 0] },
      loops: [{ id: 'outline', closed: true, segs: [
        { type: 'line', from: 'a', to: 'b' }, { type: 'line', from: 'b', to: 'c' }, { type: 'line', from: 'c', to: 'a' },
      ] }],
    } }] };
    const r = room([run('run', undefined, { top: 'crown' })], {
      profile: { ...settings.defaultProfile, crownProfileId: 'crown' },
      reportParts: { 'molding:crown': { shopBuilt: true, note: ' Match existing ' } },
    }, {}, s);
    expect(row(r, 'molding:crown', s)).toMatchObject({ description: 'Cove', size: 'Lineal Feet: 16',
      notes: ['4 1/2" tall x 1" deep', 'Match existing'] });
  });

  it('uses tee thickness and default return for both end and seam T-fillers', () => {
    const r = room([run('run', [cabinet('a'), cabinet('b')], { width: 40, tFiller: 'seams',
      ends: { ...ends(), left: { type: 'filler', width: 3 } }, endFiller: { left: { tFiller: true } } })]);
    const fillers = shippingList(r, settings).rows.filter(({ kind }) => kind === 'filler');
    expect(fillers.length).toBe(2);
    expect(fillers.every(({ description }) => description === 'Base Filler')).toBe(true);
    expect(row(r, 'run:left').size).toBe('3 3/4 x 30 1/2 x 3 3/16');
    expect(row(r, 'tee:a|b').size).toBe('1 1/2 x 30 1/2 x 3 3/16');
  });

  it('uses the blind panel face width, the cabinet ordered width and custom filler returns', () => {
    const r = room([run('run', undefined, { width: 48, blind: { left: 42, right: null }, ends: ends('blind'),
      endFiller: { left: { returnDepth: 1 } } })]);
    expect(row(r, 'run:left').size).toBe('6 x 30 1/2 x 1 11/16');
    // Tall blind corners have a separate panel at the blind end.
    let tall = room([run('run', undefined, { width: 24, height: 86, cabinetTypeId: 3,
      blind: { left: 42, right: null }, ends: { ...ends(), left: { type: 'blind', width: 3 } } })]);
    tall.walls[0].connections.start = { wallId: 'neighbor', endpoint: 'start' };
    tall.walls.push({ ...tall.walls[0], id: 'neighbor', x2: 0, y2: 96,
      connections: { start: { wallId: 'wall', endpoint: 'start' }, end: null },
      runs: [run('neighbor-run', [cabinet('neighbor-cab')], { anchors: { left: false, right: true } })],
    });
    tall.wallOrder.push('neighbor');
    tall = syncRoom(tall, settings);
    expect(row(tall, 'run:left').description).toBe('Tall Blind Panel');
    expect(row(tall, 'run:left').size).toBe('27 7/8 x 86 x 13/16');
    expect(row(tall).size).toBe('42 x 86 x 24');
  });

  it('orders panel faces by orientation, including shelf backs and floating shelves', () => {
    const auto = (id) => ({ id, size: null, sizeMode: 'auto' });
    const grid = { id: 'panels', cols: [auto('col')], rows: [
      { id: 'top-row', size: 0.75, sizeMode: 'manual' }, auto('middle-row'), { id: 'bottom-row', size: 0.75, sizeMode: 'manual' },
    ], cells: [
      { col: 0, row: 0, colSpan: 1, rowSpan: 1, node: { id: 'top', kind: 'panel' } },
      { col: 0, row: 1, colSpan: 1, rowSpan: 1, node: { id: 'back', kind: 'panel', align: 'back', depth: 0.75 } },
      { col: 0, row: 2, colSpan: 1, rowSpan: 1, node: { id: 'bottom', kind: 'panel' } },
    ] };
    const r = room([
      run('panels', [{ id: 'panels', kind: 'cabinet', grid }], { width: 18 }),
      run('shelves', [{ id: 'shelves', kind: 'shelves', shelves: { count: 2, back: true } }], { x: 60 }),
    ]);
    expect(row(r, 'top')).toMatchObject({ description: 'Shop-built Base Top Panel', size: '18 x 24 x 3/4' });
    expect(row(r, 'bottom')).toMatchObject({ description: 'Shop-built Base Bottom Panel', size: '18 x 24 x 3/4' });
    expect(row(r, 'back')).toMatchObject({ description: 'Base Back Panel', size: '18 x 29 x 3/4' });
    expect(row(r, 'shelves:back')).toMatchObject({ description: 'Shop-built Shelf Back Panel', size: '18 x 30 1/2 x 3/4' });
    expect(row(r, 'shelves:shelf-1')).toMatchObject({ description: 'Floating Shelf', size: '18 x 23 1/4 x 1 1/2' });
  });

  it('uses the style thickness for a thick door-style panel but retains drawn sheet thickness', () => {
    const r = room([run('run', [{ id: 'panel', kind: 'panel', align: 'back', depth: 1.5625 }])]);
    expect(row(r, 'panel')).toMatchObject({ description: 'Base Back Panel', size: '18 x 30 1/2 x 13/16',
      notes: ['do not sand edges', 'add 3/4" square nosing, mitered (1 9/16" thick)'] });
    r.walls[0].runs[0].grid.cells[0].node.styleId = 'sheet';
    expect(row(syncRoom(r, settings), 'panel')).toMatchObject({ description: 'Shop-built Base Back Panel', size: '18 x 30 1/2 x 1 9/16' });
  });

  it('uses resolved back-side runs and the run face frame thickness', () => {
    const s = { ...settings, defaultStyle: { ...settings.defaultStyle, cabinetStyleId: 14 } };
    const r = room([run('run', undefined, { wallSide: 'back', cabinetTypeId: 2, depth: 12 })], {}, {}, s);
    const result = shippingList(r, s);
    expect(result.rows.find(({ kind }) => kind === 'cabinet')).toMatchObject({ description: 'Upper 3 Drawers', size: '16 1/2 x 30 1/2 x 12' });
    expect(result.rows.find(({ kind }) => kind === 'frame')).toMatchObject({ description: 'Face Frame', size: '18 x 31 1/4 x 13/16' });
  });

  it('resolves shipping rows for the golden rooms without missing descriptions or dimensions', () => {
    const document = normalizeElevationDocument(JSON.parse(readFileSync(
      new URL('../../elevation/model/__tests__/fixtures/golden.json', import.meta.url), 'utf8',
    )));
    for (const stored of document.rooms) {
      const r = syncRoom(stored, document.settings);
      for (const entry of shippingList(r, document.settings).rows) {
        expect(entry.description).toBeTruthy();
        expect(entry.description).not.toContain('undefined');
        if (entry.kind === 'molding') expect(entry.size).toMatch(/^Lineal Feet: \d+$/);
        else if (entry.kind === 'adjustable_shelves') expect(entry.size).toBe('');
        else expect(entry.size).toMatch(/^\d[^x]* x \d[^x]* x \d[^x]*$/);
      }
    }
  });
});

describe('RP2 step e panel, filler and base notes', () => {
  it('labels a one-return run end filler L-shape (anchor 1)', () => {
    const r = room([run('run', undefined, { width: 21, ends: { ...ends(), right: { type: 'filler', width: 3 } } })]);
    expect(row(r, 'run:right').notes).toEqual(['L-shape']);
  });

  it('labels a filler between two cabinets U-shape (anchor 2)', () => {
    const r = room([run('run', [cabinet('a'), { id: 'fill', kind: 'filler', width: 3 }, cabinet('b')], { width: 39 })]);
    expect(row(r, 'fill').notes).toEqual(['U-shape']);
  });

  it('leaves a blind filler with no return unannotated (anchor 3)', () => {
    const r = room([run('run', undefined, { width: 48, blind: { left: 42, right: null }, ends: ends('blind') })]);
    expect(row(r, 'run:left').notes).toEqual([]);
  });

  it('retains T-filler notes at ends and seams, before free text (anchor 4)', () => {
    const r = room([run('run', [cabinet('a'), cabinet('b')], { cabinetTypeId: 2, z: 54, depth: 12,
      width: 40, tFiller: 'seams', ends: { ...ends(), left: { type: 'filler', width: 3 } },
      endFiller: { left: { tFiller: true } },
    })], { reportParts: { 'run:left': { note: 'last' } } });
    expect(row(r, 'run:left').notes).toEqual(['T-shape', 'return up 1/8"', 'last']);
    expect(row(r, 'tee:a|b').notes).toEqual(['T-shape', 'return up 1/8"']);
  });

  it('puts an upper return after shape and omits it when extended down (anchor 5)', () => {
    const r = room([run('run', undefined, { cabinetTypeId: 2, z: 54, depth: 12, width: 21,
      ends: { ...ends(), left: { type: 'filler', width: 3 } },
    })]);
    expect(row(r, 'run:left').notes).toEqual(['L-shape', 'return up 1/8"']);
    r.walls[0].runs[0].ends.left.extend = { down: { to: 'floor' } };
    expect(row(syncRoom(r, settings), 'run:left').notes).toEqual(['L-shape']);
  });

  it('copies door panel notes including a scribe before free text (anchor 6)', () => {
    const r = room([run('run', undefined, { width: 18.75, ends: { ...ends(), right: {
      type: 'end_panel', width: null, sizes: { stiles: { left: 3.5 }, notes: { left: 'scribe' } },
    } } })], { reportParts: { 'run:right': { note: 'last' } } });
    const notes = ['do not sand edges', '3 1/2" LS (scribe)'];
    expect(doorOrderItems(r, settings).items.find(({ key }) => key === 'run:right').notes).toEqual(notes);
    expect(row(r, 'run:right').notes).toEqual([...notes, 'last']);
    // A cabinet's vendor face notes never leak into its shipping row.
    expect(row(r).notes).not.toContain('1 7/8" TR & BR');
  });

  it('leaves joined sheet panels off the vendor notes (anchor 7)', () => {
    const r = room([
      run('run', undefined, { ends: ends('end_panel'),
        anchors: { left: { to: 'follow', runId: 'other', side: 'right', offset: 0 }, right: false } }),
      run('other', [cabinet('other')], { x: 60 }),
    ]);
    expect(row(r, 'run:left').notes).toEqual([]);
  });

  it('adds nosing to a thick side panel and prints the style thickness (anchor 8)', () => {
    const r = room([run('run', [{ id: 'side', kind: 'panel', width: 1.5625, styleId: 'default' }, cabinet()], { width: 19.5625 })]);
    expect(row(r, 'side')).toMatchObject({ size: '24 7/8 x 30 1/2 x 13/16',
      notes: ['do not sand edges', 'add 3/4" square nosing, mitered (1 9/16" thick)'] });
  });

  it('prints only positive base scribes, height then width (anchor 9)', () => {
    const r = room([run('run', undefined, { anchors: { left: true, right: false } })], {
      profile: { ...settings.defaultProfile, baseKind: 'furniture_base', furnitureBaseProud: 0 },
    });
    expect(row(r, 'furniture_base:run').notes).toEqual(['+1/2" scribe bottom', '+1/2" scribe left/right']);
    const s = { ...settings, furnitureBaseScribe: 0 };
    expect(row(r, 'furniture_base:run', s).notes).toEqual([]);
  });

  it('keeps a shop-built end panel on shipping with its prefix (anchor 10)', () => {
    const r = room([run('run', undefined, { ends: ends('none', 'end_panel') })], {
      reportParts: { 'run:right': { shopBuilt: true } },
    });
    expect(row(r, 'run:right')).toMatchObject({ description: 'Shop-built Base End Panel', notes: [] });
  });

  it('keeps L-panel shape and chip notes ahead of vendor notes and suppresses extended chips', () => {
    const r = room([run('run', undefined, { cabinetTypeId: 2, z: 54, depth: 12,
      tFiller: 'seams', ends: ends('end_panel'),
      bottom: [{ id: 'rail', kind: 'light_rail', height: 1.5, doors: 'flush' }],
    })]);
    expect(row(r, 'run:left').notes).toEqual(['L-shape', 'chip detail bottom 1/8"', 'do not sand edges']);
    r.walls[0].runs[0].ends.left.extend = { down: { to: 'floor' } };
    expect(row(syncRoom(r, settings), 'run:left').notes).toEqual(['L-shape', 'do not sand edges']);
  });
});

describe('RP2 step f molding rows', () => {
  function upper(width = 96, anchors = { left: true, right: true }, wallLength = width, extra = {}) {
    return room([run('upper', [cabinet()], { cabinetTypeId: 2, x: 0, width, depth: 12,
      z: 54, height: 36, top: 'crown', anchors, ...extra })], {}, { x2: wallLength });
  }
  function bandsOf(r, s = settings) {
    const wall = resolveWall(r, r.walls[0]);
    const resolved = wall.runs[0];
    const scene = runScene(r, wall, resolved, s);
    return { wall, run: resolved, scene, bands: runBands(r, wall, resolved, s, scene) };
  }
  function twoWalls(firstWidth, secondWidth, secondProfile = {}) {
    const anchors = { left: true, right: true };
    const first = room([run('first', [cabinet('a')], { x: 0, width: firstWidth, anchors })], {}, { x2: firstWidth });
    const second = { ...structuredClone(first.walls[0]), id: 'wall2', y1: 200, y2: 200,
      x2: secondWidth, profile: secondProfile,
      runs: [run('second', [cabinet('b')], { x: 0, width: secondWidth, anchors })] };
    return syncRoom({ ...first, wallOrder: ['wall', 'wall2'], walls: [...first.walls, second] }, settings);
  }

  it('rounds the extra two feet into eight-foot stock lengths (anchor 1)', () => {
    expect([0, 72, 73, 264].map(linealFeet)).toEqual([8, 8, 16, 24]);
  });

  it('sums 117 and 58 inches of toe kick before rounding (anchor 2)', () => {
    const r = twoWalls(117, 58);
    expect(bandsOf(r).bands.toeKicks.map(({ width }) => width)).toEqual([117]);
    const wall = resolveWall(r, r.walls[1]);
    const second = wall.runs[0];
    expect(runBands(r, wall, second, settings, runScene(r, wall, second, settings)).toeKicks
      .map(({ width }) => width)).toEqual([58]);
    expect(row(r, 'molding:toeKick').size).toBe('Lineal Feet: 24');
  });

  it('uses the band width of a square-ended 96-inch crown (anchor 3)', () => {
    const r = upper();
    const { wall, run, scene, bands } = bandsOf(r);
    expect(bands.crown.width).toBe(96);
    for (const kind of ['topMold', 'crown']) {
      expect(bands[kind].ends).toEqual(runBandEnds(r, wall, run, settings, scene, kind, bands[kind].z));
      expect(bands[kind].ends.map(({ type }) => type)).toEqual(['square', 'square']);
      expect(row(r, `molding:${kind}`).size).toBe('Lineal Feet: 16');
    }
  });

  it('adds the 12 7/8-inch face depth and 3-inch crown past at a return (anchor 4)', () => {
    const r = upper(96, { left: true, right: false }, 144);
    const { run, bands } = bandsOf(r);
    expect(frontDepth(run, settings) - runBackOffset(run)).toBe(12.875);
    expect(bands.crown.width).toBe(99);
    expect(bands.crown.ends.map(({ type }) => type)).toEqual(['square', 'return']);
    expect(linealFeet(bands.crown.width + 12.875 + 3)).toBe(16);
    expect(row(r, 'molding:crown').size).toBe('Lineal Feet: 16');
    // At 60 inches the same return changes the number of stock lengths ordered.
    const shorter = upper(60, { left: true, right: false }, 144);
    expect(row(shorter, 'molding:crown').size).toBe('Lineal Feet: 16');
    expect(row(shorter, 'molding:topMold').size).toBe('Lineal Feet: 16');
    const both = upper(50, { left: false, right: false }, 144, { x: 24 });
    expect(row(both, 'molding:crown').size).toBe('Lineal Feet: 16');
  });

  it('uses the unpicked toe-kick profile height (anchor 5)', () => {
    expect(row(room(), 'molding:toeKick').notes).toEqual(['4" tall']);
  });

  it('prints the picked CV10 height and bounds depth (anchor 6)', () => {
    const s = { ...settings, sectionProfiles: [{ id: 'cv10', name: 'CV10', kind: 'crown',
      drawnPoints: { elevation: [], plan: [] }, geometry: {
        points: { a: [0, 0], b: [4.625, 0], c: [0, -4.625] },
        loops: [{ closed: true, segs: [{ type: 'line', from: 'a', to: 'b' },
          { type: 'line', from: 'b', to: 'c' }, { type: 'line', from: 'c', to: 'a' }] }],
      } }] };
    const r = upper();
    r.profile.crownProfileId = 'cv10';
    expect(row(syncRoom(r, s), 'molding:crown', s)).toMatchObject({ description: 'CV10',
      notes: ['4 5/8" tall x 4 5/8" deep'] });
  });

  it('joins distinct wall heights and omits repeated heights (anchor 7)', () => {
    const r = twoWalls(117, 58, { toeKickHeight: 3.5 });
    r.walls[0].runs.push(run('repeat', [cabinet('c')], { wallSide: 'back' }));
    expect(row(syncRoom(r, settings), 'molding:toeKick').notes).toEqual(['4" & 3 1/2" tall']);
  });

  it('puts the free-text molding note last (anchor 8)', () => {
    const r = room(undefined, { reportParts: { 'molding:toeKick': { note: ' add scribe if necessary ' } } });
    expect(row(r, 'molding:toeKick').notes).toEqual(['4" tall', 'add scribe if necessary']);
  });

  it('includes both wall faces and excludes furniture bases from toe-kick length', () => {
    const r = room([run('front', [cabinet('a')], { x: 24, width: 74 }),
      run('back', [cabinet('b')], { wallSide: 'back', x: 24, width: 74 }),
      run('furniture', [cabinet('c')], { x: 130, width: 36, overrides: { baseKind: 'furniture_base' } })],
    {}, { x2: 216 });
    expect(row(r, 'molding:toeKick').size).toBe('Lineal Feet: 16');
    expect(shippingList(r, settings).rows.filter(({ kind }) => kind === 'molding')).toHaveLength(1);
    expect(row(r, 'furniture_base:furniture').size).toMatch(/^\d[^x]* x \d[^x]* x \d[^x]*$/);
  });

  it('subtracts the back offset from return depths and leaves inputs unchanged', () => {
    const r = upper(120, { left: false, right: false }, 200, { x: 24, outset: 7 });
    const before = structuredClone(r);
    expect(row(r, 'molding:crown').size).toBe('Lineal Feet: 16');
    expect(r).toEqual(before);
  });
});
