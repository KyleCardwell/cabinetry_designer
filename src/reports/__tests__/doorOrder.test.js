import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, CABINET_TYPE_IDS } from '../../elevation/model/constants.js';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from '../../elevation/model/doorStyles.js';
import { partSizes } from '../../elevation/model/doorSizes.js';
import { partNumbers } from '../../elevation/model/partNumbers.js';
import * as numbering from '../../elevation/model/partNumbers.js';
import { syncRoom } from '../../elevation/model/room.js';
import { doorOrder, mergeLines, stileRailNotes } from '../doorOrder.js';

const style = DEFAULT_DOOR_STYLE;
const settings = { ...DEFAULT_SETTINGS, endPanelThickness: 0.8125, doorDesigns: DOOR_DESIGNS };
const frame = (sizes = {}) => partSizes(style, DOOR_DESIGNS[0], { width: 18, height: 60, sizes });
const face = (type, size = null, rest = {}) => ({ type, size, ...rest });
const drawers = (top = 5.875) => ({
  direction: 'vertical', size: null,
  children: [face('drawer_front', top), face('drawer_front', 12), face('drawer_front', 12)],
});
const cell = (node) => ({ col: 0, row: 0, colSpan: 1, rowSpan: 1, node });
function run(id = 'run', node = { id: 'cab', kind: 'cabinet', face: drawers() }, overrides = {}) {
  return {
    id, cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 24, width: 18, z: 4, height: 30.5, depth: 24,
    heightMode: 'manual', autoCount: false, maxCabinetWidth: null, overrides: {},
    anchors: { left: false, right: false },
    ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
    grid: {
      id: `${id}:grid`, cols: [{ id: `${id}:col`, size: null, sizeMode: 'auto' }],
      rows: [{ id: `${id}:row`, size: null, sizeMode: 'auto' }], cells: [cell(node)],
    },
    ...overrides,
  };
}
function room(runs = [run()], overrides = {}, wallOverrides = {}, s = settings) {
  return syncRoom({
    id: 'room', name: 'Kitchen', profile: { ...DEFAULT_SETTINGS.defaultProfile }, wallOrder: ['wall'],
    walls: [{
      id: 'wall', name: 'Wall', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5,
      flipped: false, connections: { start: null, end: null }, landings: { start: null, end: null },
      profile: {}, openings: [], joints: [], soffits: [], endPanels: { start: null, end: null },
      runs, ...wallOverrides,
    }], ...overrides,
  }, s);
}
const sections = (order) => order.pages[0].sections;
const lines = (order) => order.pages.flatMap((page) => page.sections.flatMap((section) => section.lines));

describe('door order form data', () => {
  it('collapses equal short-face rail exceptions (anchor 1)', () => {
    expect(stileRailNotes(style, frame({ rails: { top: 1.875, bottom: 1.875 } })))
      .toEqual(['1 7/8" TR & BR']);
  });

  it('attaches a side note to a single exception (anchor 2)', () => {
    expect(stileRailNotes(style, frame({ stiles: { left: 3.5 } }), { left: 'scribe' }))
      .toEqual(['3 1/2" LS (scribe)']);
  });

  it('orders side exceptions, mid rails and mid stiles (anchor 3)', () => {
    expect(stileRailNotes(style, frame({
      rails: { top: 2.625 }, midRails: [{ at: 31.5, width: 3.625 }], midStiles: [{ at: 12, width: 3 }],
    }))).toEqual(['2 5/8" TR', '3 5/8" MR up 31 1/2" oc', '3" MS 12" oc from left']);
  });

  it('merges identical lines within a part number, then sorts (anchor 4)', () => {
    expect(mergeLines([4, 3, 4, 9].map((number) => ({
      number, width: number === 4 ? 17.875 : 23.875, height: 30.125, notes: '',
    })))).toEqual([
      { number: 3, qty: 1, width: 23.875, height: 30.125, size: '23 7/8 x 30 1/8', notes: '' },
      { number: 4, qty: 2, width: 17.875, height: 30.125, size: '17 7/8 x 30 1/8', notes: '' },
      { number: 9, qty: 1, width: 23.875, height: 30.125, size: '23 7/8 x 30 1/8', notes: '' },
    ]);
  });

  it('uses installed drawer sizes and the end panel depth from the drawing (anchor 5)', () => {
    const r = room([run('run', undefined, {
      width: 18.8125,
      ends: { left: { type: 'none', width: null }, right: { type: 'end_panel', width: null } },
    })]);
    const before = structuredClone(r);
    const order = doorOrder(r, settings);
    const numbers = partNumbers(r, settings).byKey;
    expect(order.warnings).toEqual([]);
    expect(order.pages).toHaveLength(1);
    expect(sections(order)).toEqual([
      { id: 'drawer_fronts', title: 'Drawer Fronts', lines: [
        { number: numbers.get('cab'), qty: 2, width: 17.875, height: 12, size: '17 7/8 x 12', notes: '' },
        { number: numbers.get('cab'), qty: 1, width: 17.875, height: 5.875, size: '17 7/8 x 5 7/8', notes: '1 7/8" TR & BR' },
      ] },
      { id: 'doors', title: 'Doors', lines: [
        { number: numbers.get('run:right'), qty: 1, width: 24.875, height: 30.5, size: '24 7/8 x 30 1/2', notes: 'do not sand edges' },
      ] },
    ]);
    expect(r).toEqual(before);
  });

  it('puts a short-face slab in Slab without frame notes (anchor 6)', () => {
    const order = doorOrder(room([run('run', { id: 'cab', kind: 'cabinet', face: drawers(4.5) })]), settings);
    expect(sections(order).map(({ id }) => id)).toEqual(['drawer_fronts', 'slab']);
    expect(sections(order)[1].lines).toEqual([
      { number: 1, qty: 1, width: 17.875, height: 4.5, size: '17 7/8 x 4 1/2', notes: '' },
    ]);
  });

  it('merges the two 14 7/8 inch halves of a Euro 30 inch pair (anchor 7)', () => {
    const order = doorOrder(room([run('pair', { id: 'cab', kind: 'cabinet', face: face('pair_door') }, { width: 30 })]), settings);
    expect(lines(order)).toEqual([
      { number: 1, qty: 2, width: 14.875, height: 30.125, size: '14 7/8 x 30 1/8', notes: '' },
    ]);
  });

  it('skips joined sheet ends and sheet panel cells (anchor 8)', () => {
    const r = room([
      run('joined', { id: 'cab', kind: 'cabinet', face: face('open') }, {
        anchors: { left: { to: 'follow', runId: 'other', side: 'right', offset: 0 }, right: false },
        ends: { left: { type: 'end_panel', width: null }, right: { type: 'none', width: null } },
      }),
      run('other', { id: 'sheet', kind: 'panel', align: 'back', styleId: 'sheet', depth: 0.75 }, { x: 60 }),
      run('sheet-default', { id: 'sheet-default', kind: 'panel', align: 'front', depth: 0.75 }, { x: 90 }),
    ]);
    expect(doorOrder(r, settings)).toEqual({ pages: [], warnings: [] });
    r.walls[0].runs.find(({ id }) => id === 'joined').ends.left.styleId = 'default';
    expect(lines(doorOrder(syncRoom(r, settings), settings))).toEqual([
      expect.objectContaining({ qty: 1, size: '24 7/8 x 30 1/2', notes: 'do not sand edges' }),
    ]);
  });

  it('groups resolved styles and builds their header in part number order (anchor 9)', () => {
    const s = { ...settings, report: { ...settings.report, doorFormNote: 'No Midrails Unless Noted' },
      doorDesigns: [...DOOR_DESIGNS, { ...DOOR_DESIGNS[0], id: '110', code: '110', description: 'Square', vendor: 'Stillwater' }] };
    const a = { ...style, id: 'A', designId: '110', material: 'MAPLE/MDF' };
    const r = room([
      run('fronts', undefined, { drawerFrontStyleId: 'default' }),
      run('doors', { id: 'door', kind: 'cabinet', face: face('door') }, { x: 60 }),
    ], { doorStyles: [a], doorStyleId: 'A', partNumberOverrides: { door: 1, cab: 9 } }, {}, s);
    const order = doorOrder(r, s);
    expect(order.pages.map(({ styleId }) => styleId)).toEqual(['A', 'default']);
    expect(order.pages[0].header).toEqual({
      style: 'SQUARE - 110', wood: 'MAPLE/MDF', vendor: 'STILLWATER', thickness: '13/16"',
      edgeProfile: 'SQUARE', insideProfile: 'SQUARE', panelProfile: 'FLAT', appliedMoldings: null,
      notes: '3" Stiles & Rails - No Midrails Unless Noted',
    });
  });

  it('has no pages or warnings without faces or panels (anchor 10)', () => {
    expect(doorOrder(room([]), settings)).toEqual({ pages: [], warnings: [] });
    expect(doorOrder(room([run('open', { id: 'cab', kind: 'cabinet', face: face('open') })]), settings))
      .toEqual({ pages: [], warnings: [] });
  });

  it('rounds merge keys to 1/32, keeps distinct notes, and sorts by height then width', () => {
    const order = mergeLines([
      { number: 2, width: 10, height: 12 }, { number: 2, width: 10.001, height: 12.001 },
      { number: 2, width: 10, height: 12, notes: 'scribe' },
      { number: 2, width: 11, height: 12 }, { number: 2, width: 10, height: 13 },
    ]);
    expect(order.map(({ width, height, qty, notes }) => [width, height, qty, notes]))
      .toEqual([[10, 13, 1, ''], [11, 12, 1, ''], [10, 12, 2, ''], [10, 12, 1, 'scribe']]);
    expect(stileRailNotes(style, frame({ rails: { top: 3 + 0.0000005 } }))).toEqual([]);
    expect(stileRailNotes(style, frame({
      rails: { top: 2, bottom: 2.5 }, stiles: { left: 3.5, right: 4 },
      notes: { top: 'top', bottom: 'bottom', left: 'left', right: 'right' },
    }))).toEqual(['2" TR (top)', '2 1/2" BR (bottom)', '3 1/2" LS (left)', '4" RS (right)']);
  });

  it('keeps slab-design fronts in their regular sections and preserves false-front notes', () => {
    const slab = { ...style, id: 'slab-style', designId: 'slab' };
    const r = room([run('run', { id: 'cab', kind: 'cabinet', face: {
      direction: 'vertical', size: null, children: [face('false_front', 4.5), face('door')],
    } })], { doorStyles: [slab], doorStyleId: slab.id });
    const order = doorOrder(r, { ...settings, report: { doorFormNote: 'Shop note' } });
    expect(sections(order).map(({ id }) => id)).toEqual(['drawer_fronts', 'doors']);
    expect(lines(order).map(({ notes }) => notes)).toEqual(['false front', '']);
    expect(order.pages[0].header).toMatchObject({ insideProfile: null, panelProfile: null, notes: 'Shop note' });
  });

  it('lists back panels, blind panels and wall end panels once with their own part numbers', () => {
    let r = room([
      run('blind', { id: 'cab', kind: 'cabinet', face: face('open') }, {
        x: 25, width: 24, height: 86, cabinetTypeId: CABINET_TYPE_IDS.TALL, blind: { left: 42, right: null },
        ends: { left: { type: 'blind', width: 3 }, right: { type: 'none', width: null } },
      }),
      run('back', { id: 'back', kind: 'panel', align: 'back', depth: 0.75 }, { x: 60 }),
      run('wallrun', { id: 'open', kind: 'cabinet', face: face('open') }, {
        x: 0, anchors: { left: true, right: true }, wallSide: 'back',
      }),
    ], {}, { endPanels: { start: null, end: { width: 0.8125 } } });
    r.walls[0].connections.start = { wallId: 'neighbor', endpoint: 'start' };
    r.walls.push({
      ...r.walls[0], id: 'neighbor', x2: 0, y2: 96, endPanels: { start: null, end: null },
      connections: { start: { wallId: 'wall', endpoint: 'start' }, end: null },
      runs: [run('neighbor', { id: 'neighbor-cab', kind: 'cabinet', face: face('open') }, {
        anchors: { left: false, right: true },
      })],
    });
    r.wallOrder.push('neighbor');
    r = syncRoom(r, settings);
    const order = doorOrder(r, settings);
    const numbers = partNumbers(r, settings).byKey;
    expect(order.warnings).toEqual([]);
    expect(lines(order).map(({ number, notes, qty }) => [number, notes, qty])).toEqual(
      ['wall:endPanel:end', 'blind:left', 'back'].map((key) => [numbers.get(key), 'do not sand edges', 1])
        .sort((a, b) => a[0] - b[0]),
    );
    expect(lines(order).find(({ number }) => number === numbers.get('wall:endPanel:end')))
      .toMatchObject({ size: '13/16 x 34 1/2' });
  });

  it('prints profile names and missing picks, with asymmetric style notes', () => {
    const s = { ...settings, sectionProfiles: [{ id: 'edge', name: 'Ogee' }, { id: 'bead', name: 'Bead' }] };
    const custom = { ...style, id: 'custom', stiles: { left: 3, right: 3 }, rails: { top: 2.75, bottom: 2.75 },
      panel: { ...style.panel, type: 'raised' }, profiles: { outside: 'edge', inside: 'gone', panel: null },
      appliedMoldings: [{ profileId: 'bead', offset: 0 }, { profileId: 'missing', offset: 0 }, { profileId: null, offset: 1 }] };
    const order = doorOrder(room([run()], { doorStyles: [custom], doorStyleId: custom.id }, {}, s), s);
    expect(order.pages[0].header).toMatchObject({
      wood: null, edgeProfile: 'OGEE', insideProfile: 'MISSING PROFILE', panelProfile: 'RAISED',
      appliedMoldings: 'BEAD, MISSING PROFILE', notes: '3" Stiles, 2 3/4" Rails',
    });
    expect(order.warnings).toEqual([
      { code: 'report-profile-missing', styleId: 'custom', id: 'gone', slot: 'inside' },
      { code: 'report-profile-missing', styleId: 'custom', id: 'missing', slot: 'applied' },
    ]);
  });

  it('marks an unnumbered part with ? and warns', () => {
    const r = room();
    // A corrupt/incomplete numbering map is exceptional; keep the actual drawing model in use.
    const get = vi.spyOn(numbering, 'partNumbers').mockReturnValueOnce({ byKey: new Map() });
    try {
      const order = doorOrder(r, settings);
      expect(lines(order).every(({ number }) => number === '?')).toBe(true);
      expect(order.warnings).toHaveLength(3);
      expect(order.warnings.every(({ code, pieceId }) => code === 'report-part-unnumbered' && pieceId === 'cab')).toBe(true);
    } finally {
      get.mockRestore();
    }
  });
});
