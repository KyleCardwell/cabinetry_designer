import { afterEach, describe, expect, it, vi } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../../elevation/model/constants.js';
import { gridFromItems } from '../../elevation/model/grid.js';
import * as numbering from '../../elevation/model/partNumbers.js';
import { syncRoom } from '../../elevation/model/room.js';
import * as interiors from '../../elevation/model/shelves.js';
import { BUILT_IN_SLIDES } from '../../elevation/model/slides.js';
import { reportHeader } from '../header.js';
import { proBoxOrder } from '../proBoxOrder.js';

const settings = { ...DEFAULT_SETTINGS, slides: BUILT_IN_SLIDES, drawerSlideId: 'blum-562h' };
const face = (type, size = null, rest = {}) => ({ type, size, ...rest });
const stack = (...children) => ({ direction: 'vertical', size: null, children });
const drawers = () => stack(face('drawer_front', 5.875), face('drawer_front'), face('drawer_front'));
function run(id, width = 18, patch = {}, extra = {}) {
  return {
    id: `run:${id}`, cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 24, width, z: 4, height: 30.5, depth: 24,
    heightMode: 'manual', autoCount: false, overrides: {}, anchors: { left: false, right: false },
    ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
    grid: gridFromItems(`run:${id}`, [{ id, kind: 'cabinet', width: null, face: drawers(), ...patch }]), ...extra,
  };
}
function room(runs, overrides = {}, s = settings) {
  return syncRoom({
    id: 'room', name: 'Kitchen', profile: { ...DEFAULT_SETTINGS.defaultProfile }, wallOrder: ['wall'],
    walls: [{ id: 'wall', name: 'Wall', x1: 0, y1: 0, x2: 240, y2: 0, height: 96, thickness: 4.5,
      flipped: false, connections: { start: null, end: null }, landings: { start: null, end: null },
      profile: {}, openings: [], joints: [], soffits: [], endPanels: { start: null, end: null }, runs }],
    ...overrides,
  }, s);
}
function order(r, s = settings, project = { name: 'Cardwell' }) {
  const header = reportHeader({ project, room: r, settings: { ...s,
    report: { ...s.report, jobNumber: '573' } }, revision: 1 });
  return proBoxOrder(r, s, header);
}
const tuples = ({ lines }) => lines.map(({ cab, qty, height, width, depth, instructions }) =>
  [cab, qty, height, width, depth, instructions]);
function sample(s = settings, framed = false, extra = []) {
  const numbers = framed ? [102, 105, 111] : [2, 5, 11];
  // A freestanding framed run includes two stile overhangs outside the 18/24-inch box.
  const overhang = framed ? 2 * s.insetFrame.stile : 0;
  const fronts = () => {
    const result = drawers();
    if (framed) result.children[0].size = s.standardDrawerHeights.faceFrame;
    return result;
  };
  return room([
    run('a', 18 + overhang, { face: fronts() }), run('b', 18 + overhang, { face: fronts() }, { x: 60 }),
    run('c', 24 + overhang, { face: face('door', null, { hinge: 'left' }),
      interior: { rollouts: { count: 2 } } }, { x: 90 }),
    ...extra,
  ], { partNumberOverrides: { a: numbers[0], b: numbers[1], c: numbers[2], euro: 103 } }, s);
}
const framed = { ...settings, defaultStyle: { ...settings.defaultStyle, cabinetStyleId: 14 } };
afterEach(() => vi.restoreAllMocks());

describe('ProBox order model', () => {
  it('anchor 1: groups and orders the Euro sample with the default form spec', () => {
    const r = sample();
    const before = structuredClone(r);
    const result = order(r);
    expect(tuples(result)).toEqual([
      [2, 1, 4.25, 16, 21, ''], [5, 1, 4.25, 16, 21, ''],
      [2, 2, 10.25, 16, 21, ''], [5, 2, 10.25, 16, 21, ''], [11, 2, 4.25, 20.75, 21, 'Scoop'],
    ]);
    expect(result).toMatchObject({ jobName: 'Cardwell - 573 KITCHEN',
      options: { notch: true, clips: true, brand: 'STANDARD BLUM' },
      comments: ['Cross Grain Bottoms'], warnings: [] });
    expect(Object.values(result.spec).map(({ options, writeIn }) => {
      expect(writeIn).toBeNull();
      return options.filter(({ checked }) => checked).map(({ label }) => label);
    })).toEqual([['Baltic Birch Ply'], ['5/8"'], ['1/4" Baltic Birch Ply'],
      ['Flat Flush (w/ eased edges)'], ['Standard'], ['Pre-finished & assembled']]);
    expect(r).toEqual(before);
  });

  it('anchor 2: uses adjustable header clips and standard roll-out clips in the face frame sample', () => {
    const result = order(sample(framed, true), framed);
    expect(tuples(result)).toEqual([
      [102, 1, 3.25, 16, 21, ''], [105, 1, 3.25, 16, 21, ''],
      [102, 2, 8.25, 16, 21, ''], [105, 2, 8.25, 16, 21, ''],
      [111, 2, 4.25, 20.75, 21, 'Scoop, Use Standard Mounting Clips'],
    ]);
    expect(result.options).toEqual({ notch: true, clips: true, brand: 'ADJUSTABLE BLUM' });
    expect(result.comments).toEqual(['Cross Grain Bottoms', 'Use Adjustable Mounting Clips Except As Noted']);
    expect(result.jobName).toBe('Cardwell - 573 KITCHEN - FACE FRAME');
  });

  it('anchor 3: adds standard clip instructions for a Euro cabinet in a face frame room', () => {
    const r = sample(framed, true, [run('euro', 19.5, { style: { cabinetStyleId: 13 } }, { x: 130 })]);
    const result = order(r, framed);
    expect(tuples(result).filter(([cab]) => cab === 103)).toEqual([
      [103, 1, 4.25, 16, 21, 'Use Standard Mounting Clips'],
      [103, 2, 10.25, 16, 21, 'Use Standard Mounting Clips'],
    ]);
  });

  it('anchor 4: uses the ROT part number and retains its bottom-placement note', () => {
    const r = room([run('trash', 18, { purpose: 'trash',
      face: stack(face('drawer_front', 5.875), face('door', null, { action: 'pullout' })) })],
    { partNumberStart: 7 });
    expect(tuples(order(r))).toEqual([
      [7, 1, 4.25, 16, 21, ''], [8, 1, 15.125, 16, 22, 'bottom up 1 3/4"'],
    ]);
  });

  it('anchor 5: adds no-notch and no-clips instructions for side-mount cabinet overrides', () => {
    const r = room([run('cab', 18, { drawerSlideId: 'accuride-3832' })], { partNumberStart: 3 });
    const result = order(r);
    expect(tuples(result)).toEqual([
      [3, 1, 4.25, 15.5, 22, 'No Notch, No Clips'], [3, 2, 10.25, 15.5, 22, 'No Notch, No Clips'],
    ]);
    expect(result.options.brand).toBe('STANDARD BLUM');
  });

  it('anchor 6: leaves a side-mount room header blank and notes its undermount box override', () => {
    const s = { ...settings, drawerSlideId: 'accuride-3832' };
    const fronts = drawers();
    fronts.children[0].drawerBox = { slideId: 'blum-562h' };
    const result = order(room([run('cab', 18, { face: fronts })], { partNumberStart: 3 }, s), s);
    expect(result.options).toEqual({ notch: false, clips: false, brand: '' });
    expect(result.comments).toEqual(['Cross Grain Bottoms']);
    expect(tuples(result)).toEqual([
      [3, 1, 4.25, 16, 21, 'Notch & Undermount Clips, Use Standard Mounting Clips'],
      [3, 2, 10.25, 15.5, 22, ''],
    ]);
  });

  it('anchor 7: preserves sink roll-out sizes and the sink drawer plumbing note', () => {
    const r = room([
      run('sink', 36, { purpose: 'sink', face: face('pair_door'), interior: { rollouts: { count: 2 } } }),
      run('drawers', 18, { purpose: 'sink' }, { x: 90 }),
    ], { partNumberOverrides: { sink: 1, drawers: 2 } });
    expect(tuples(order(r))).toEqual([
      [2, 1, 4.25, 16, 18, 'notch drw around plumbing'],
      [2, 2, 10.25, 16, 18, 'notch drw around plumbing'], [1, 2, 4.25, 15.5, 18, 'Scoop'],
    ]);
  });

  it('anchor 8: omits unsized boxes with a warning, handles empty rooms and writes in Poplar', () => {
    const result = order(room([run('tiny', 18, { face: face('drawer_front') }, { height: 3.5 })],
      { partNumberStart: 3 }));
    expect(result.lines).toEqual([]);
    expect(result.warnings).toEqual([{ code: 'report-drawer-box-unsized',
      message: 'Cab 3: a drawer box has no size; not on the ProBox order.' }]);
    expect(order(room([])).lines).toEqual([]);
    const s = { ...settings, drawerBoxOrder: { ...settings.drawerBoxOrder, sideMaterial: 'Poplar' } };
    expect(order(room([]), s).spec.sideMaterial).toEqual({
      options: [{ label: 'Baltic Birch Ply', checked: false }, { label: 'Soft Maple', checked: false }], writeIn: 'Poplar',
    });
  });

  it('matches trimmed case-insensitive specs, checks nothing for blanks and omits an empty job and comment', () => {
    const s = { ...settings, drawerBoxOrder: { sideMaterial: '  soft MAPLE ', sideThickness: ' ',
      topEdge: 'flat flush', assembly: 'Shop finish', comments: '' } };
    const result = order(room([]), s, null);
    expect(result.jobName).toBe('573 KITCHEN');
    expect(result.comments).toEqual([]);
    expect(result.spec.sideMaterial).toEqual({ options: [
      { label: 'Baltic Birch Ply', checked: false }, { label: 'Soft Maple', checked: true }], writeIn: null });
    expect(result.spec.sideThickness).toEqual({ options: [
      { label: '1/2"', checked: false }, { label: '5/8"', checked: false }], writeIn: null });
    expect(result.spec.topEdge.options[0].checked).toBe(true);
    expect(result.spec.assembly.writeIn).toBe('Shop finish');
    expect(order(room([], {}, framed), { ...framed, drawerBoxOrder: { comments: '' } }).comments)
      .toEqual(['Use Adjustable Mounting Clips Except As Noted']);
  });

  it('collects each wall face once, including hampers and adjustable clips in a Euro room', () => {
    const r = room([
      run('front'),
      run('back', 24, { purpose: 'hamper', face: face('door', null, { action: 'pullout' }) },
        { wallSide: 'back', x: 60 }),
    ]);
    r.walls.push({ ...structuredClone(r.walls[0]), id: 'second', y1: 120, y2: 120,
      runs: [run('framed', 18, { style: { cabinetStyleId: 14 } })] });
    r.wallOrder.push('second');
    const shared = vi.spyOn(interiors, 'wallInteriorData');
    const numbers = vi.spyOn(numbering, 'partNumbers');
    const result = order(r);
    expect(numbers).toHaveBeenCalledTimes(1);
    expect(shared.mock.calls.map(([, wall, side]) => [wall.id, side])).toEqual([
      ['wall', 'front'], ['wall', 'back'], ['second', 'front'], ['second', 'back'],
    ]);
    const byKey = numbers.mock.results[0].value.byKey;
    const back = result.lines.filter(({ cab }) => cab === byKey.get('back'));
    expect(back).toEqual([{ cab: byKey.get('back'), qty: 1, height: 6.25, width: 22, depth: 21, instructions: '' }]);
    expect(result.lines.filter(({ cab }) => cab === byKey.get('framed'))
      .every(({ instructions }) => instructions === 'Use Adjustable Mounting Clips')).toBe(true);
    expect(result.lines.reduce((total, { qty }) => total + qty, 0)).toBe(7);
    expect(result.warnings).toEqual([]);
  });

  it('groups only equal sizes and instructions, sorts all ties, and warns for every missing dimension', () => {
    const box = (height = 3, width = 10, depth = 20, notes = []) => ({
      height, width, depth, notes, kind: 'drawer', slide: BUILT_IN_SLIDES[0], clips: 'standard',
    });
    const duplicate = { code: 'duplicate-part-number', number: 10, keys: ['a', 'other'] };
    vi.spyOn(numbering, 'partNumbers').mockReturnValue({
      byKey: new Map([['a', 10], ['b', 2]]), warnings: [duplicate],
    });
    const data = {
      boxes: new Map([
        ['a', { boxes: [box(3, 9), box(2, 9), box(3, 9), box(null)] }],
        ['b', { boxes: [box(3, 10, 20, ['z']), box(3, 11), box(3, 10, 20, ['a']),
          box(3, 10, 19), box(3, null)] }],
        ['unknown', { boxes: [box(3, 1), box(3, 1, null)] }],
      ]),
      rollouts: new Map([['b', new Map([['r', { rollouts: [box(1)] }]])]]),
    };
    vi.spyOn(interiors, 'wallInteriorData').mockImplementation((r, w, side) =>
      side === 'front' ? data : { boxes: new Map(), rollouts: new Map() });
    const result = order(room([]));
    expect(tuples(result)).toEqual([
      [10, 1, 2, 9, 20, ''], [2, 1, 3, 10, 19, ''], [2, 1, 3, 10, 20, 'a'],
      [2, 1, 3, 10, 20, 'z'], [2, 1, 3, 11, 20, ''], [10, 2, 3, 9, 20, ''],
      [null, 1, 3, 1, 20, ''], [2, 1, 1, 10, 20, 'Scoop'],
    ]);
    expect(result.warnings).toEqual([duplicate, ...[10, 2, '?'].map((cab) => ({
      code: 'report-drawer-box-unsized', message: `Cab ${cab}: a drawer box has no size; not on the ProBox order.`,
    }))]);
  });
});
