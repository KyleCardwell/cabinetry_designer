import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../elevation/model/constants.js';
import { interiorNotes } from '../interiorNotes.js';

const S = (count, rest = {}) => ({ count, lineBore: true, hinges: true, ...rest });
const group = (direction, children) => ({ direction, children, dividers: children.slice(1).map(() => ({})) });
const vertical = (count) => group('vertical', Array.from({ length: count }, () => ({})));
const divider = (kind, rest = {}) => ({ path: 'r', index: 0, kind, banding: true, ...rest });
const rollout = (depth, z, rest = {}) => ({ depth, z, x: 0, slideId: 'blum-562h',
  slide: { name: 'Blum Tandem 562H' }, ...rest });

function input(tree = null, entries = [['r', S(1)]], dividers = []) {
  const sections = [];
  const walk = (node, path, rect) => {
    if (!node?.children) {
      sections.push({ path, ...rect });
      return;
    }
    node.children.forEach((child, index) => {
      const n = node.children.length;
      const bounds = node.direction === 'vertical'
        ? { ...rect, z: rect.z + rect.height * (n - index - 1) / n, height: rect.height / n }
        : { ...rect, x: rect.x + rect.width * index / n, width: rect.width / n };
      walk(child, `${path}.${index}`, bounds);
    });
  };
  // Wall-coordinate fixtures also catch tests that assume a box-local origin.
  walk(tree, 'r', { x: 100, z: 50, width: 30, height: 60 });
  return { interior: { tree, sections, dividers }, shelves: new Map(entries), rollouts: new Map(),
    boxes: [], roomSlideId: 'blum-562h', settings: DEFAULT_SETTINGS };
}

function nestedInput() {
  const tree = group('vertical', [group('horizontal', [{}, {}]), {}]);
  const data = input(tree, [
    ['r.0.0', S(1)], ['r.0.1', S(1)],
    ['r.1', S(0, { lineBore: false, hinges: false, lineBoreSource: 'auto', hingesSource: 'auto' })],
  ], [divider('fixed', { fromBottom: 30 }), divider('partition', { path: 'r.0', fromLeft: 15, dimFrom: 'left' })]);
  data.boxes = [{ kind: 'drawer', space: { x: 105, z: 52, width: 20, height: 20 } }];
  return data;
}

describe('IN12b step g accessory notes', () => {
  it('keeps stored order in one note after roll-outs regardless of sizing or whole-section warnings', () => {
    const data = input();
    data.rollouts.set('r', { rollouts: [rollout(21, 60), rollout(21, 80)] });
    const whole = { accessory: { name: 'Susan', reportText: '6472-28 lazy susan', attachesTo: 'section', wholeSection: true },
      qty: 1, warnings: [{ code: 'accessory-too-small' }] };
    data.accessories = new Map([['r', { items: [whole,
      { accessory: { name: 'Tray dividers', reportText: '', attachesTo: 'section' }, qty: 2, warnings: [] }],
    whole, warnings: [{ code: 'accessory-whole-section' }] }]]);
    const before = structuredClone(data);
    expect(interiorNotes(data).sections).toEqual(['1 as', '2 ro - 21"', '6472-28 lazy susan, 2 Tray dividers']);
    expect(data).toEqual(before);
  });

  it('anchor 4: omits missing and wrong-place items without changing other notes', () => {
    const data = input();
    const withoutAccessories = interiorNotes(data);
    data.accessories = new Map([['r', { whole: null, warnings: [], items: [
      { accessory: null, qty: 1, warnings: [{ code: 'accessory-missing' }] },
      { accessory: { name: 'Drawer accessory', reportText: 'Do not print', attachesTo: 'drawer_box' },
        qty: 2, warnings: [{ code: 'accessory-wrong-place' }] },
    ] }]]);
    expect(interiorNotes(data)).toEqual(withoutAccessories);
  });
});

describe('IN10 step a interior notes', () => {
  it('prints a single unwrapped section (anchor 1)', () => {
    expect(interiorNotes(input())).toMatchObject({ dividers: [], sections: ['1 as'] });
  });

  it('prints the resolved open-box flags (anchor 2)', () => {
    expect(interiorNotes(input(null, [['r', S(0, { lineBore: false, hinges: false })]])))
      .toMatchObject({ dividers: [], sections: ['NLB, NPH (No Doors)'] });
  });

  it('prints a fixed shelf and top/bottom sections (anchor 3)', () => {
    expect(interiorNotes(input(vertical(2), [['r.0', S(3)], ['r.1', S(1)]],
      [divider('fixed', { fromBottom: 42 })])))
      .toMatchObject({ dividers: ['fs up 42" oc'], sections: ['Top Sec (3 as)', 'Btm Sec (1 as)'] });
  });

  it('prints both shelf centres lower first and no banding (anchor 4)', () => {
    const data = input(vertical(2), [], [divider('double_fixed', { fromBottom: 12.5, banding: false })]);
    expect(interiorNotes(data).dividers).toEqual(['2 fs (up 12 1/8", 12 7/8"), no banding']);
    data.settings = { sheetThickness: 0.5 };
    expect(interiorNotes(data).dividers).toEqual(['2 fs (up 12 1/4", 12 3/4"), no banding']);
    data.interior.dividers = [divider('fixed', { fromBottom: 42, banding: false })];
    expect(interiorNotes(data).dividers).toEqual(['fs up 42" oc, no banding']);
  });

  it('uses the partition dimension origin (anchor 5)', () => {
    const data = input(group('horizontal', [{}, {}]), [['r.0', S(1)], ['r.1', S(1)]],
      [divider('partition', { fromLeft: 21, dimFrom: 'left' })]);
    expect(interiorNotes(data)).toMatchObject({ dividers: ['pt 21" oc from L'],
      sections: ['Left Sec (1 as)', 'Right Sec (1 as)'] });
    data.interior.dividers = [divider('double_partition', { fromRight: 20.25, dimFrom: 'right' })];
    expect(interiorNotes(data).dividers).toEqual(['dbl pt 20 1/4" oc from R']);
  });

  it('nests group notes and suppresses auto flags for every drawer kind (anchor 6)', () => {
    const data = nestedInput();
    const before = structuredClone(data);
    for (const kind of ['drawer', 'rot', 'hamper']) {
      data.boxes[0].kind = kind;
      expect(interiorNotes(data)).toMatchObject({ dividers: ['fs up 30" oc'],
        sections: ['Top Sec (pt 15" oc from L, Left Sec (1 as), Right Sec (1 as))'] });
    }
    data.boxes[0].kind = 'drawer';
    expect(data).toEqual(before);
  });

  it('retains manual flags in drawer sections (anchor 7)', () => {
    const data = nestedInput();
    data.shelves.get('r.1').lineBoreSource = 'manual';
    expect(interiorNotes(data).sections).toEqual([
      'Top Sec (pt 15" oc from L, Left Sec (1 as), Right Sec (1 as))', 'Btm Sec (NLB)',
    ]);
    data.shelves.get('r.1').hingesSource = 'manual';
    expect(interiorNotes(data).sections.at(-1)).toBe('Btm Sec (NLB, NPH (No Doors))');
  });

  it('names all siblings, including empty sections (anchor 8)', () => {
    for (const [direction, expected] of [
      ['vertical', ['Top Sec (1 as)', 'Mid Sec (1 as)', 'Mid Btm Sec (1 as)', 'Btm Sec (1 as)']],
      ['vertical', ['Sec 1 (1 as)', 'Sec 2 (1 as)', 'Sec 3 (1 as)', 'Sec 4 (1 as)', 'Sec 5 (1 as)']],
      ['horizontal', ['Left Sec (1 as)', 'Mid Sec (1 as)', 'Right Sec (1 as)']],
      ['vertical', ['Top Sec (1 as)', 'Mid Sec (1 as)', 'Btm Sec (1 as)']],
      ['horizontal', ['Sec 1 (1 as)', 'Sec 2 (1 as)', 'Sec 3 (1 as)', 'Sec 4 (1 as)']],
    ]) {
      const tree = group(direction, expected.map(() => ({})));
      const data = input(tree, expected.map((_, index) => [`r.${index}`, S(1)]));
      expect(interiorNotes(data).sections).toEqual(expected);
      data.shelves = new Map([['r.0', S(1)]]);
      expect(interiorNotes(data).sections).toEqual([expected[0]]);
    }
  });

  it('prints hardwood, folded and glass shelf notes (anchor 9)', () => {
    const data = input(null, [['r', S(2, { nosing: { kind: 'hardwood' } })]]);
    expect(interiorNotes(data).sections).toEqual(['2 as, no banding - add 1 1/2" nosing']);
    data.shelves.get('r').nosing.kind = 'folded';
    expect(interiorNotes(data).sections).toEqual(['2 as, +2" as depth - FF to cut & fold for 1 1/2" nosing']);
    data.shelves.get('r').glass = true;
    expect(interiorNotes(data).sections).toEqual(['2 as (1/4" glass)']);
  });

  it('groups roll-outs before the section flags (anchor 10)', () => {
    const data = input(null, [['r', S(0, { lineBore: false })]]);
    data.rollouts.set('r', { rollouts: [rollout(18, 60), rollout(18, 80)] });
    expect(interiorNotes(data).sections).toEqual(['NLB', '2 ro - 18"']);
  });

  it('lists roll-out groups top-down and tags other slides (anchor 11)', () => {
    const data = input();
    data.rollouts.set('r', { rollouts: [rollout(21, 60), rollout(22, 80, {
      slideId: 'accuride-3832', slide: { name: 'Accuride 3832' },
    })] });
    const before = structuredClone(data);
    expect(interiorNotes(data).sections).toEqual(['1 as', '1 ro - 22" (Accuride 3832), 1 ro - 21"']);
    expect(data).toEqual(before);
    data.roomSlideId = 'accuride-3832';
    expect(interiorNotes(data).sections)
      .toEqual(['1 as', '1 ro - 22", 1 ro - 21" (Blum Tandem 562H)']);
  });

  it('prints stretcher centres and keeps empty siblings in naming (anchor 12)', () => {
    const data = input(vertical(2), [
      ['r.0', S(0, { lineBore: false, hinges: false, lineBoreSource: 'auto', hingesSource: 'auto' })],
      ['r.1', S(1)],
    ], [divider('stretcher', { fromBottom: 24.3125 })]);
    data.boxes = [{ space: { x: 105, z: 85, width: 20, height: 20 } }];
    expect(interiorNotes(data)).toMatchObject({ dividers: ['stretcher up 24 5/16" oc'], sections: ['Btm Sec (1 as)'] });
  });

  it('omits empty contents and uses shelf settings with default fallbacks', () => {
    const data = input(null, [['r', S(0, { nosing: { kind: 'hardwood' }, glass: true })]]);
    expect(interiorNotes(data)).toMatchObject({ dividers: [], sections: [] });
    data.settings = { glassShelfThickness: 0.375, shelfNosingHeight: 2, foldedNosingExtra: 2.5 };
    data.shelves.get('r').count = 2;
    expect(interiorNotes(data).sections).toEqual(['2 as (3/8" glass)']);
    data.shelves.get('r').glass = false;
    expect(interiorNotes(data).sections).toEqual(['2 as, no banding - add 2" nosing']);
    data.shelves.get('r').nosing.kind = 'folded';
    expect(interiorNotes(data).sections).toEqual(['2 as, +2 1/2" as depth - FF to cut & fold for 2" nosing']);
  });

  it('orders dividers by index and paired roll-outs left first, retaining depthless groups', () => {
    const data = input(vertical(3), [['r.0', S(0)]], [
      divider('fixed', { index: 1, fromBottom: 20 }), divider('fixed', { index: 0, fromBottom: 40 }),
    ]);
    data.rollouts.set('r.0', { rollouts: [rollout(18, 100, { x: 120 }), rollout(null, 100, { x: 100 })] });
    expect(interiorNotes(data)).toMatchObject({ dividers: ['fs up 40" oc', 'fs up 20" oc'],
      sections: ['Top Sec (1 ro, 1 ro - 18")'] });
    // A box outside this section must not hide its flags, even if it overlaps the section.
    data.shelves.get('r.0').lineBore = false;
    data.boxes = [{ space: { x: 100, z: 50, width: 30, height: 60 } }];
    expect(interiorNotes(data).sections).toEqual(['Top Sec (NLB, 1 ro, 1 ro - 18")']);
  });

  describe('IN10.1 drawer fronts in their section, flags first', () => {
    const front = (path, height, z) => ({ type: 'drawer_front', path, x: 105, width: 20, height, z });

    it('prints a tall\'s bottom drawers inside Btm Sec, with the depth', () => {
      const data = input(vertical(2), [['r.0', S(3)],
        ['r.1', S(0, { lineBore: false, hinges: false, lineBoreSource: 'auto', hingesSource: 'auto' })]],
      [divider('fixed', { fromBottom: 30 })]);
      data.faces = [front('a', 12, 52), front('b', 12, 66)];
      data.depths = new Map([['a', 21], ['b', 21]]);
      data.boxes = [{ space: { x: 100, z: 52, width: 30, height: 12 } }];
      expect(interiorNotes(data)).toEqual({ dividers: ['fs up 30" oc'],
        sections: ['Top Sec (3 as)', 'Btm Sec (DF\'s (2 - 12", 21" drws))'], fronts: null });
    });

    it('puts flags first and each item on its own line in a single section', () => {
      const data = input(null, [['r', S(1, { lineBore: false, lineBoreSource: 'manual' })]]);
      data.faces = [front('a', 5.875, 100)];
      data.depths = new Map([['a', 21]]);
      data.rollouts.set('r', { rollouts: [rollout(21, 60)] });
      expect(interiorNotes(data)).toEqual({ dividers: [],
        sections: ['NLB', 'DF\'s (1 - 5 7/8", 21" drw)', '1 as', '1 ro - 21"'], fronts: null });
    });

    it('keeps fronts outside every section at the cabinet level', () => {
      const data = input();
      data.faces = [{ type: 'drawer_front', path: 'x', x: 0, width: 10, height: 6, z: 0 }];
      expect(interiorNotes(data)).toEqual({ dividers: [], sections: ['1 as'], fronts: 'DF\'s (1 - 6")' });
    });
  });
});
