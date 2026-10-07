import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS, isPartSizes } from '../doorStyles.js';
import { partSizeRows, pickOptions, setPartMids, setPartNote, setPartSide } from '../doorStyleEdits.js';
import { setFacePart } from '../faceTree.js';

const [SQUARE, SLAB, SLAB_AM] = DOOR_DESIGNS;
const A = { ...DEFAULT_DOOR_STYLE, id: 'ds-a', label: 'A' };
const B = { ...DEFAULT_DOOR_STYLE, id: 'ds-b', label: 'B', thickness: 1 };
const C = { ...DEFAULT_DOOR_STYLE, id: 'ds-c', label: 'C', designId: 'slab-applied', thickness: 0.75 };

describe('SPEC-46.1 a face\'s own style and sizes', () => {
  it('sets and clears styleId and sizes on a face leaf, never on a group or an open face', () => {
    const face = {
      direction: 'vertical', size: null, children: [{ type: 'drawer_front', size: 6 }, { type: 'open', size: null }],
    };
    const withA = setFacePart(face, 'r.0', { styleId: 'ds-a' });
    expect([withA.children[0], face.children[0]])
      .toEqual([{ type: 'drawer_front', size: 6, styleId: 'ds-a' }, { type: 'drawer_front', size: 6 }]);
    const sized = setFacePart(withA, 'r.0', { sizes: { rails: { top: 2 } } });
    expect(setFacePart(sized, 'r.0', { styleId: null }).children[0])
      .toEqual({ type: 'drawer_front', size: 6, sizes: { rails: { top: 2 } } });
    expect(setFacePart(sized, 'r.0', { styleId: 'ds-b', sizes: null }).children[0])
      .toEqual({ type: 'drawer_front', size: 6, styleId: 'ds-b' });
    expect([
      setFacePart(face, 'r', { styleId: 'ds-a' }),
      setFacePart(face, 'r.1', { styleId: 'ds-a' }),
      setFacePart(face, 'r.5', { styleId: 'ds-a' }),
    ].every((next) => next === face)).toBe(true);
    expect(setFacePart(withA, 'r.0', { styleId: 'ds-a' })).toBe(withA);
    expect(setFacePart(sized, 'r.0', { sizes: { rails: { top: 2 } } })).toBe(sized);
  });
});

describe('SPEC-46.1 per-part size edits (P13)', () => {
  it('sets and clears one stile or rail, dropping empty groups', () => {
    const one = setPartSide(undefined, 'top', 2.625);
    const two = setPartSide(one, 'bottom', 2.625);
    expect([one, two]).toEqual([{ rails: { top: 2.625 } }, { rails: { top: 2.625, bottom: 2.625 } }]);
    expect(setPartSide(undefined, 'left', 3.5)).toEqual({ stiles: { left: 3.5 } });
    expect(setPartSide({ rails: { top: 2.625 }, notes: { top: 'match' } }, 'top', null)).toEqual({ notes: { top: 'match' } });
    expect(setPartSide({ rails: { top: 2.625 } }, 'top', null)).toBeUndefined();
    const sizes = { stiles: { left: 3 } };
    expect([setPartSide(sizes, 'left', 0), setPartSide(sizes, 'middle', 3)].every((next) => next === sizes)).toBe(true);
  });

  it('sets notes and mid rails/stiles the same way; every result is valid sizes or undefined', () => {
    const results = [
      setPartNote(undefined, 'left', 'scribe'),
      setPartNote({ notes: { left: 'scribe' }, stiles: { left: 3.5 } }, 'left', ''),
      setPartNote({ notes: { left: 'scribe' } }, 'left', null),
      setPartMids(undefined, 'midRails', [{ at: 31.5 }]),
      setPartMids({ midRails: [{ at: 31.5 }], midStiles: [{ at: 7.5, width: 3 }] }, 'midRails', []),
      setPartMids({ midStiles: [{ at: 7.5 }] }, 'midStiles', []),
    ];
    expect(results).toEqual([
      { notes: { left: 'scribe' } },
      { stiles: { left: 3.5 } },
      undefined,
      { midRails: [{ at: 31.5 }] },
      { midStiles: [{ at: 7.5, width: 3 }] },
      undefined,
    ]);
    expect(results.every((entry) => entry === undefined || isPartSizes(entry))).toBe(true);
  });
});

describe('SPEC-46.1 what the pickers and the Stiles & rails block show', () => {
  it('lists the room\'s styles and what a level inherits from the levels above it', () => {
    const room = { doorStyles: [A, B, C], doorStyleId: 'ds-b' };
    expect(pickOptions(room, DEFAULT_SETTINGS, 'door', [])).toEqual({
      inherit: { id: 'default', text: 'Inherit (Std · 5PC · 13/16")' },
      options: [
        { id: 'ds-a', text: 'A · 5PC · 13/16"' },
        { id: 'ds-b', text: 'B · 5PC · 1"' },
        { id: 'ds-c', text: 'C · Slab AM · 3/4"' },
      ],
    });
    expect(pickOptions(room, DEFAULT_SETTINGS, 'drawer_front', [{ level: 'room', node: room }]).inherit)
      .toEqual({ id: 'ds-b', text: 'Inherit (B · 5PC · 1")' });
    const panels = { ...room, panelStyleId: 'ds-c' };
    expect(pickOptions(panels, DEFAULT_SETTINGS, 'panel', [{ level: 'room', node: panels }]).inherit.id).toBe('ds-c');
    expect(pickOptions({}, { ...DEFAULT_SETTINGS, doorThickness: 1 }, 'door', [])).toEqual({
      inherit: { id: 'default', text: 'Inherit (Std · 5PC · 1")' }, options: [],
    });
  });

  it('gives each side\'s typed value, final value, where it came from and its note', () => {
    expect(partSizeRows(DEFAULT_DOOR_STYLE, SQUARE, {
      width: 15, height: 7, sizes: { stiles: { left: 3.5 }, notes: { left: 'scribe' }, midStiles: [{ at: 7.5 }] },
    })).toEqual({
      title: 'Stiles & rails',
      note: null,
      rows: [
        { side: 'top', label: 'Top rail', typed: null, value: 2.4375, source: 'rule', note: null },
        { side: 'bottom', label: 'Bottom rail', typed: null, value: 2.4375, source: 'rule', note: null },
        { side: 'left', label: 'Left stile', typed: 3.5, value: 3.5, source: 'part', note: 'scribe' },
        { side: 'right', label: 'Right stile', typed: null, value: 3, source: 'style', note: null },
      ],
      midRails: [],
      midStiles: [{ at: 7.5, width: 3, typed: false }],
      opening: { width: 8.5, height: 2.125 },
    });
  });

  it('relabels for a molding inset and says why a part is a slab', () => {
    const molding = partSizeRows(DEFAULT_DOOR_STYLE, SLAB_AM, {
      width: 15, height: 30, sizes: { midRails: [{ at: 15, width: 4 }] },
    });
    expect([molding.title, molding.rows.map(({ label }) => label), molding.midRails, molding.opening]).toEqual([
      'Molding inset', ['Top', 'Bottom', 'Left', 'Right'], [{ at: 15, width: 4, typed: true }], { width: 9, height: 24 },
    ]);
    const slab = { title: 'Slab', rows: [], midRails: [], midStiles: [], opening: null };
    expect([
      partSizeRows(DEFAULT_DOOR_STYLE, SLAB, { width: 15, height: 30 }),
      partSizeRows(DEFAULT_DOOR_STYLE, SQUARE, { width: 15, height: 4.75 }),
      partSizeRows(DEFAULT_DOOR_STYLE, SLAB_AM, { width: 15, height: 4.75 }),
    ]).toEqual([
      { ...slab, note: 'Slab design' },
      { ...slab, note: 'Slab under 4 13/16"' },
      { ...slab, note: 'Slab under 4 13/16" — molding left off' },
    ]);
  });
});
