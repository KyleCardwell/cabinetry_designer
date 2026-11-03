import { describe, expect, it } from 'vitest';
import { auto, room, run, wall } from '../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../elevation/model/constants.js';
import { DEFAULT_DOOR_STYLE } from '../../elevation/model/doorStyles.js';
import { syncRoom } from '../../elevation/model/room.js';
import { CABINET_STYLE_IDS } from '../../elevation/model/styles.js';
import { teeSetback } from '../../elevation/model/tees.js';
import { shippingList } from '../shippingList.js';

const S = DEFAULT_SETTINGS;
const thick = { ...DEFAULT_DOOR_STYLE, id: 'thick', thickness: 1 };
const setbackNotes = (row) => row.notes.filter((note) => note.startsWith('deck, fixed shelves & top set back'));

function cabinetRows(overrides = {}, roomOverrides = {}, settings = S) {
  const current = syncRoom(room({
    ...roomOverrides,
    walls: [wall({ runs: [run({
      width: 36, autoCount: false, items: [auto('a'), auto('b')],
      tFiller: 'all', ...overrides,
    })] })],
  }), settings);
  return shippingList(current, settings).rows.filter(({ kind }) => kind === 'cabinet');
}

describe('FX9 b: T-run cabinet setback notes', () => {
  it('anchor 1: puts a 1/16-inch setback beside each cabinet rabbet note in group 7', () => {
    const rows = cabinetRows({}, { reportParts: { a: { note: 'last' }, b: { note: 'last' } } });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.notes.slice(-3)).toEqual([
        'FF to rabbet sides for T-filler',
        'deck, fixed shelves & top set back 1/16"',
        'last',
      ]);
    }
  });

  it('anchor 2: prints a 1/4-inch setback for 1-inch doors', () => {
    const rows = cabinetRows({ doorStyleId: thick.id }, { doorStyles: [thick] });
    expect(rows.map(setbackNotes)).toEqual([
      ['deck, fixed shelves & top set back 1/4"'],
      ['deck, fixed shelves & top set back 1/4"'],
    ]);
  });

  it('anchor 3: omits the setback only on the Open cabinet', () => {
    const rows = cabinetRows({ items: [{ ...auto('a'), face: { type: 'open', size: null } }, auto('b')] });
    expect(rows.map(({ key }) => key)).toEqual(['a', 'b']);
    expect(rows.map(setbackNotes)).toEqual([[], ['deck, fixed shelves & top set back 1/16"']]);
  });

  it('anchor 4: omits the setback without run Ts', () => {
    expect(cabinetRows({ tFiller: undefined }).map(setbackNotes)).toEqual([[], []]);
  });

  it('uses each cabinet thickness instead of the thickest thickness of the run', () => {
    const rows = cabinetRows({ items: [{ ...auto('a'), doorStyleId: thick.id }, auto('b')] },
      { doorStyles: [thick] });
    expect(rows.map(setbackNotes)).toEqual([
      ['deck, fixed shelves & top set back 1/4"'],
      ['deck, fixed shelves & top set back 1/16"'],
    ]);
  });

  it.each(['seams', 'all'])('keeps the %s run setback even when individual Ts are off', (tFiller) => {
    const rows = cabinetRows({ tFiller,
      endFiller: { left: { tFiller: false }, right: { tFiller: false } },
      items: [{ ...auto('a'), tFiller: { right: false } }, { ...auto('b'), tFiller: { left: false } }],
    });
    for (const row of rows) {
      expect(row.notes.some((note) => note.startsWith('FF to rabbet'))).toBe(false);
      expect(setbackNotes(row)).toEqual(['deck, fixed shelves & top set back 1/16"']);
    }
  });

  it('omits the setback for individually enabled Ts on a non-T run and for face frames', () => {
    expect(cabinetRows({ tFiller: 'none', endFiller: { right: { tFiller: true } } })
      .map(setbackNotes)).toEqual([[], []]);
    expect(cabinetRows({ style: { cabinetStyleId: CABINET_STYLE_IDS.INSET } })
      .map(setbackNotes)).toEqual([[], []]);
  });

  it('omits a zero setback and formats custom settings to thirty-seconds', () => {
    expect(cabinetRows({}, {}, { ...S, teeThickness: 1 }).map(setbackNotes)).toEqual([[], []]);
    const settings = { ...S, teamDoorStyle: { ...DEFAULT_DOOR_STYLE, thickness: 0.84375 } };
    expect(cabinetRows({}, {}, settings).map(setbackNotes)).toEqual([
      ['deck, fixed shelves & top set back 3/32"'],
      ['deck, fixed shelves & top set back 3/32"'],
    ]);
  });

  it('uses the thickest resolved non-open face within a cabinet', () => {
    const rows = cabinetRows({ items: [{ ...auto('a'), face: {
      direction: 'vertical', size: null, children: [
        { type: 'drawer_front', size: 6 },
        { type: 'door', size: null, styleId: thick.id },
      ],
    } }, auto('b')] }, { doorStyles: [thick] });
    expect(setbackNotes(rows[0])).toEqual(['deck, fixed shelves & top set back 1/4"']);
  });

  it('returns zero without closed faces and ignores open face thickness without mutating inputs', () => {
    const subject = run({ tFiller: 'all' });
    const faces = [{ type: 'open', thickness: 2 }, { type: 'false_front', thickness: 0.75 },
      { type: 'panel', thickness: 1 }, { type: 'drawer_front' }];
    const before = structuredClone({ subject, faces, settings: S });
    expect(teeSetback(subject, [], S)).toBe(0);
    expect(teeSetback(subject, [faces[0]], S)).toBe(0);
    expect(teeSetback(subject, faces, S)).toBe(0.25);
    expect(teeSetback(subject, [faces[1]], S)).toBe(0);
    expect({ subject, faces, settings: S }).toEqual(before);
  });
});
