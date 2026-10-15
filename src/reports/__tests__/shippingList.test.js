import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../elevation/model/constants.js';
import { gridFromItems } from '../../elevation/model/grid.js';
import { partNumbers } from '../../elevation/model/partNumbers.js';
import { syncRoom } from '../../elevation/model/room.js';
import { normalizeElevationDocument } from '../../elevation/store/persistence.js';
import { cabinetDescription, drawerFrontNote, hingeNote, shippingDescription, shippingList } from '../shippingList.js';

const settings = DEFAULT_SETTINGS;
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

  it('prints only manual reveals in T, B, L, R, H, V order (anchor 6)', () => {
    const r = room([run('run', [{ ...cabinet(), face: face('open'), reveals: { top: 0.25, bottom: 0.125 } }])]);
    expect(row(r).notes).toEqual(['RV\'s (1/4" T, 1/8" B)']);
    r.walls[0].runs[0].grid.cells[0].node.reveals = {
      vertical: 0.125, right: 0.25, horizontal: 0, bottom: null, left: 0.125, top: 0.25,
    };
    expect(row(r).notes).toEqual(['RV\'s (1/4" T, 1/8" L, 1/4" R, 0" H, 1/8" V)']);
    delete r.walls[0].runs[0].grid.cells[0].node.reveals;
    expect(row(r).notes).toEqual([]);
  });

  it('prints an override only when it differs from room Boxes (anchor 7)', () => {
    const s = { ...settings, report: { ...settings.report, boxMaterial: 'WHITE MELAMINE' } };
    const r = room([run('run', [{ ...cabinet(), face: face('open') }])], {
      reportParts: { cab: { boxes: 'MAPLE PLY' } },
    }, {}, s);
    expect(row(r, 'cab', s).notes).toEqual(['MAPLE PLY BOX']);
    r.reportParts.cab.boxes = 'WHITE MELAMINE';
    expect(row(r, 'cab', s).notes).toEqual([]);
    delete r.reportParts.cab.boxes;
    expect(row(r, 'cab', s).notes).toEqual([]);
  });

  it('uses the widest resolved single door and the blind extension (anchor 8)', () => {
    const r = room([run('run', [{ ...cabinet(), face: face('door') }], {
      width: 24, blind: { left: 39.5, right: null }, ends: { ...ends(), left: { type: 'blind', width: 6 } },
    })]);
    expect(row(r).notes).toEqual(['Door x 17 7/8", Blind x 21 1/2"', 'hl']);
    r.walls[0].runs[0].grid.cells[0].node.face = { direction: 'horizontal', size: null,
      children: [face('door', { size: 6 }), face('door')] };
    expect(row(r).notes[0]).toBe('Door x 11 3/4", Blind x 21 1/2"');
  });

  it('uses visible width when a blind cabinet has no single door', () => {
    const r = room([run('run', [{ ...cabinet(), face: face('pair_door') }], {
      width: 24, blind: { left: null, right: 39.5 }, ends: { ...ends(), right: { type: 'blind', width: 6 } },
    })]);
    expect(row(r).notes).toEqual(['Door x 18", Blind x 21 1/2"']);
  });

  it('passes through the right-side T-filler rabbet note (anchor 9)', () => {
    const r = room([run('run', [{ ...cabinet(), face: face('open') }], {
      width: 21, ends: { ...ends(), right: { type: 'filler', width: 3 } },
      endFiller: { right: { tFiller: true } },
    })]);
    expect(row(r).notes).toEqual(['FF to rabbet right side for T-filler']);
    expect(row(r, 'run:right').notes).toEqual([]);
  });

  it('keeps box, drawer, hinge and free-text notes in order (anchor 10)', () => {
    const r = room([run('run', [{ ...cabinet(), face: { direction: 'vertical', size: null,
      children: [face('drawer_front', { size: 5.875 }), face('door', { hinge: 'left' })] } }])], {
      reportParts: { cab: { boxes: 'MAPLE PLY', note: ' x ' } },
    });
    expect(row(r)).toMatchObject({ description: 'Base Top Drawer',
      notes: ['MAPLE PLY BOX', 'DF\'s (1 - 5 7/8")', 'hl', 'x'] });
  });

  it('counts false fronts separately from drawers and ignores pair hinges (anchor 11)', () => {
    const sink = { ...cabinet(), face: { direction: 'vertical', size: null,
      children: [face('false_front', { size: 5.875 }), face('pair_door')] } };
    expect(row(room([run('run', [sink])])).notes).toEqual(['false front']);
    sink.face.children.unshift(face('false_front', { size: 5.875 }));
    expect(row(room([run('run', [sink])])).notes).toEqual(['2 false fronts']);
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
    expect(row(r).notes).toEqual(['MAPLE PLY BOX', 'RV\'s (1/4" T)',
      'Door x 17 1/16", Blind x 21 1/2"', 'DF\'s (1 - 5 7/8")', 'false front', 'hl',
      'FF to rabbet right side for T-filler', 'last']);
    expect(r).toEqual(before);
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
      description: 'Base 3 Drawers', notes: ['DF\'s (1 - 5 7/8", 2 - 12")'], size: '18 x 30 1/2 x 24' });
    const part = partNumbers(r, settings).parts.find(({ key }) => key === 'cab');
    expect(shippingDescription(r, settings, part)).toBe('Base 3 Drawers');
    expect(r).toEqual(before);
  });

  it('lets the typed name replace the entire description and keeps free text last (anchor 8)', () => {
    const r = room(undefined, { reportParts: { cab: { name: 'Pencil Base', note: 'check pulls', shopBuilt: true } } });
    expect(row(r)).toMatchObject({ description: 'Pencil Base', notes: ['DF\'s (1 - 5 7/8", 2 - 12")', 'check pulls'] });
    r.reportParts.cab.name = '  ';
    r.reportParts.cab.note = '   ';
    expect(row(r)).toMatchObject({ description: 'Shop-built Base 3 Drawers', notes: ['DF\'s (1 - 5 7/8", 2 - 12")'] });
  });

  it('adds the normal filler return to its thickness (anchor 9)', () => {
    const r = room([run('run', undefined, { width: 19.625,
      ends: { ...ends('filler'), left: { type: 'filler', width: 1.625 } } })]);
    expect(row(r, 'run:left')).toMatchObject({ description: 'Base Filler', size: '1 5/8 x 30 1/2 x 3 1/4' });
  });

  it('orders the blind filler six inches wide with no return (anchor 10)', () => {
    const r = room([run('run', undefined, { width: 48, blind: { left: 42, right: null },
      ends: ends('blind') })]);
    expect(row(r, 'run:left')).toMatchObject({ description: 'Base Filler', size: '6 x 30 1/2 x 3/4' });
  });

  it('orders a free end by depth and accepts the explicit Shop-built flag (anchors 11, 13)', () => {
    const r = room([run('run', undefined, { width: 18.75, ends: ends('none', 'end_panel') })]);
    expect(row(r, 'run:right')).toMatchObject({ description: 'Base End Panel', size: '24 7/8 x 30 1/2 x 3/4' });
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
    expect(row(r, 'wall:endPanel:start')).toMatchObject({ description: 'Wall End Panel', size: '25 x 36 1/2 x 3/4' });
  });

  it('uses ordered furniture base dimensions (anchor 16)', () => {
    const r = room([run('run', undefined, { width: 96.5 })], {
      profile: { ...settings.defaultProfile, baseKind: 'furniture_base', furnitureBaseProud: 0 },
    });
    expect(row(r, 'furniture_base:run')).toMatchObject({ description: 'Furniture Base', size: '96 1/2 x 4 1/2 x 24 7/8' });
  });

  it('retains Toe Kick and Crown molding rows with blank sizes (anchor 17)', () => {
    const r = room([run('run', undefined, { top: 'crown' })]);
    const rows = shippingList(r, settings).rows;
    expect(rows.filter(({ key }) => ['molding:toeKick', 'molding:crown'].includes(key)))
      .toEqual(['Toe Kick', 'Crown'].map((description, index) => ({
        number: index === 0 ? 2 : 4, key: index === 0 ? 'molding:toeKick' : 'molding:crown',
        kind: 'molding', description, notes: [], size: '',
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
    expect(shippingList(room([]), settings)).toEqual({ rows: [adjustable], roomNote: null, warnings: [] });
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
    expect(row(r, 'molding:crown', s)).toMatchObject({ description: 'Cove', size: '', notes: ['Match existing'] });
  });

  it('uses tee thickness and default return for both end and seam T-fillers', () => {
    const r = room([run('run', [cabinet('a'), cabinet('b')], { width: 40, tFiller: 'seams',
      ends: { ...ends(), left: { type: 'filler', width: 3 } }, endFiller: { left: { tFiller: true } } })]);
    const fillers = shippingList(r, settings).rows.filter(({ kind }) => kind === 'filler');
    expect(fillers.length).toBe(2);
    expect(fillers.every(({ description, size }) => description === 'Base Filler' && size.endsWith(' x 3 5/16'))).toBe(true);
  });

  it('uses the blind panel face width, the cabinet ordered width and custom filler returns', () => {
    const r = room([run('run', undefined, { width: 48, blind: { left: 42, right: null }, ends: ends('blind'),
      endFiller: { left: { returnDepth: 1 } } })]);
    expect(row(r, 'run:left').size).toBe('6 x 30 1/2 x 1 3/4');
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
    expect(row(tall, 'run:left').size).toBe('27 7/8 x 86 x 3/4');
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
    expect(row(r, 'panel')).toMatchObject({ description: 'Base Back Panel', size: '18 x 30 1/2 x 13/16', notes: [] });
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
        if (['molding', 'adjustable_shelves'].includes(entry.kind)) expect(entry.size).toBe('');
        else expect(entry.size).toMatch(/^\d[^x]* x \d[^x]* x \d[^x]*$/);
      }
    }
  });
});
