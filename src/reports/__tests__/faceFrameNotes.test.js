import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { auto, room, run, wall } from '../../test/builders.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../../elevation/model/constants.js';
import { syncRoom } from '../../elevation/model/room.js';
import { shippingList } from '../shippingList.js';

describe('FX14 step a deck up notes', () => {
  it('anchor 1: notes Room 10 FF tall #32 deck centre before reveals', () => {
    const stored = JSON.parse(readFileSync(
      new URL('../../../../specs/fixtures/room10ff.json', import.meta.url), 'utf8',
    ));
    const settings = { ...DEFAULT_SETTINGS, ...stored.settingsOverrides };
    const built = syncRoom(stored, settings);
    const entry = shippingList(built, settings).rows.find(({ number }) => number === 32);
    expect(entry).toMatchObject({ kind: 'cabinet', description: 'Tall' });
    expect(entry.notes).toContain('deck up 1 1/8" (with supports)');
    for (const [index, note] of entry.notes.entries()) {
      if (note.startsWith("RV's")) {
        expect(entry.notes.indexOf('deck up 1 1/8" (with supports)')).toBeLessThan(index);
      }
    }
  });

  it('anchor 2: follows the quarter-inch bead to a 1 3/8-inch deck centre', () => {
    const built = syncRoom(room({ walls: [wall({ runs: [run({
      width: 30, autoCount: false, style: { cabinetStyleId: 15, beadWidth: 0.25 },
      items: [auto('cab')],
    })] })] }), DEFAULT_SETTINGS);
    const entry = shippingList(built, DEFAULT_SETTINGS).rows.find(({ key }) => key === 'cab');
    expect(entry.notes).toContain('deck up 1 3/8" (with supports)');
  });

  it('anchor 3: notes a typed 2-inch bottom reveal at 1 5/8 inches on centre', () => {
    const built = syncRoom(room({ walls: [wall({ runs: [run({
      width: 30, autoCount: false, style: { cabinetStyleId: 14 },
      items: [{ ...auto('cab'), reveals: { bottom: 2 } }],
    })] })] }), DEFAULT_SETTINGS);
    const entry = shippingList(built, DEFAULT_SETTINGS).rows.find(({ key }) => key === 'cab');
    expect(entry.notes).toContain('deck up 1 5/8" (with supports)');
    expect(entry.notes.indexOf('deck up 1 5/8" (with supports)'))
      .toBeLessThan(entry.notes.indexOf('RV\'s (2" B)'));
  });

  it('anchor 4: omits notes without a raised standard inset deck and keeps no deck', () => {
    for (const [runOverrides, leaf] of [
      [{ cabinetTypeId: CABINET_TYPE_IDS.UPPER, z: 54, depth: 12 }, {}],
      [{}, { box: { bottom: 'none' } }],
      [{}, { box: { bottom: 'spreaders' } }],
      [{}, { box: { bottom: 'overlay' } }],
      [{}, { style: { cabinetStyleId: 13 } }],
      [{ hanging: true }, {}],
      [{}, { reveals: { bottom: 0.75 } }],
      [{}, { reveals: { bottom: 0.5 } }],
    ]) {
      const built = syncRoom(room({ walls: [wall({ runs: [run({
        width: 30, autoCount: false, style: { cabinetStyleId: 14 }, ...runOverrides,
        items: [{ ...auto('cab'), ...leaf }],
      })] })] }), DEFAULT_SETTINGS);
      const entry = shippingList(built, DEFAULT_SETTINGS).rows.find(({ key }) => key === 'cab');
      expect(entry.notes.filter((note) => note.startsWith('deck up'))).toEqual([]);
      if (leaf.box?.bottom === 'none') expect(entry.notes).toContain('no deck');
    }
  });
});

describe('FX14 step b box style notes', () => {
  it('anchors 1/2: puts the differing Room 10 FF style first and omits the matching Euro style', () => {
    const stored = JSON.parse(readFileSync(
      new URL('../../../../specs/fixtures/room10ff.json', import.meta.url), 'utf8',
    ));
    const settings = { ...DEFAULT_SETTINGS, ...stored.settingsOverrides };
    const built = syncRoom(stored, settings);
    const { rows } = shippingList(built, settings);
    expect(rows.find(({ number }) => number === 32).notes[0]).toBe('INSET FACE FRAME BOX');
    expect(rows.find(({ number }) => number === 35).notes)
      .not.toContain('EUROPEAN BOX');
  });

  it('anchor 3: omits matching room/run styles, including bead-only differences', () => {
    for (const cabinetStyleId of [14, 15]) {
      const built = syncRoom(room({
        style: { cabinetStyleId, beadWidth: 0.25 },
        walls: [wall({ runs: [run({
          width: 30, autoCount: false, style: { cabinetStyleId, beadWidth: 0.125 },
          items: [auto('cab')],
        })] })],
      }), DEFAULT_SETTINGS);
      const entry = shippingList(built, DEFAULT_SETTINGS).rows.find(({ key }) => key === 'cab');
      expect(entry.notes.filter((note) => note.endsWith(' BOX'))).toEqual([]);
    }
  });

  it('anchor 4: labels beaded and European runs in an inset room and resolves leaf overrides', () => {
    const built = syncRoom(room({
      style: { cabinetStyleId: 14 },
      walls: [wall({ runs: [
        run({
          id: 'beaded-run', width: 60, autoCount: false, style: { cabinetStyleId: 15 },
          items: [auto('beaded'), { ...auto('inset-leaf'), style: { cabinetStyleId: 14 } }],
        }),
        run({
          id: 'euro-run', x: 60, width: 60, autoCount: false, style: { cabinetStyleId: 13 },
          items: [auto('euro')],
        }),
      ] })],
    }), DEFAULT_SETTINGS);
    const { rows } = shippingList(built, DEFAULT_SETTINGS);
    expect(rows.find(({ key }) => key === 'beaded').notes[0]).toBe('BEADED INSET FACE FRAME BOX');
    expect(rows.find(({ key }) => key === 'euro').notes[0]).toBe('EUROPEAN BOX');
    expect(rows.find(({ key }) => key === 'inset-leaf').notes)
      .not.toContain('INSET FACE FRAME BOX');
  });
});
