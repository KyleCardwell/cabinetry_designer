import { describe, expect, it } from 'vitest';
import { auto, room, run, wall } from '../../../test/builders.js';
import { openBelow } from '../cells.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { runFaceLayouts } from '../faceLayouts.js';
import { resolveWall } from '../room.js';
import { cabinetReveals, REVEAL_SOURCE_LABELS } from '../styles.js';

function fixture({ bottomKind = 'void', voidAbove = false, manual, styleId = 13, gap = 0,
  settings = DEFAULT_SETTINGS } = {}) {
  const cabinet = { ...auto('cabinet'), face: { type: 'door', size: null },
    ...(manual === undefined ? {} : { reveals: { bottom: manual } }) };
  const bottom = { ...auto('bottom'), kind: bottomKind };
  const cabinetRun = run({
    cabinetTypeId: CABINET_TYPE_IDS.TALL, z: 4, height: 86, depth: 24,
    items: [auto('left'), { ...auto('right'), grid: {
      id: 'right', cols: [{ id: 'right:c', size: null, sizeMode: 'auto' }],
      rows: [
        { id: 'right:top', size: null, sizeMode: 'auto', gap },
        { id: 'right:bottom', size: 40, sizeMode: 'manual' },
      ],
      cells: [
        { col: 0, row: 0, colSpan: 1, rowSpan: 1, node: voidAbove ? bottom : cabinet },
        { col: 0, row: 1, colSpan: 1, rowSpan: 1, node: voidAbove ? cabinet : bottom },
      ],
    } }],
  });
  const cabinetWall = wall({ runs: [cabinetRun] });
  const cabinetRoom = room({ walls: [cabinetWall], style: { cabinetStyleId: styleId } });
  return runFaceLayouts(cabinetRoom, resolveWall(cabinetRoom, cabinetWall), cabinetRun, settings);
}

describe('FX11 a bottom reveal over an open cell', () => {
  it('anchor 1: overhangs the open bottom cell by 1/8 inch', () => {
    const layout = fixture().get('cabinet');
    expect(layout.box.z).toBe(44);
    expect(layout.reveals.values.bottom).toBe(-0.125);
    expect(layout.reveals.sources.bottom).toBe('rule:open-below');
    expect(layout.faces).toHaveLength(1);
    expect(layout.faces[0]).toMatchObject({ type: 'door', z: 43.875 });
    expect(REVEAL_SOURCE_LABELS['rule:open-below']).toBe('rule: open below');
  });

  it('anchor 2: retains stacked seams when the bottom cell is a cabinet', () => {
    const layouts = fixture({ bottomKind: 'cabinet' });
    expect(layouts.get('cabinet').reveals.values.bottom).toBe(0);
    expect(layouts.get('cabinet').reveals.sources.bottom).toBe('rule:stacked-seam');
    expect(layouts.get('cabinet').faces[0].z).toBe(44);
    expect(layouts.get('bottom').reveals.values.top).toBe(0.125);
    expect(layouts.get('bottom').reveals.sources.top).toBe('rule:stacked-seam');
  });

  it('anchor 3: leaves a cabinet below an open top cell unchanged', () => {
    const layout = fixture({ voidAbove: true }).get('cabinet');
    expect(layout.box.z).toBe(4);
    expect(layout.reveals.values.bottom).toBe(0.125);
    expect(layout.reveals.sources.bottom).toBe('style');
    expect(layout.faces[0].z).toBe(4.125);
  });

  it('anchor 4: applies a typed bottom reveal after the open-below rule', () => {
    const layout = fixture({ manual: 0.125 }).get('cabinet');
    expect(layout.box.z).toBe(44);
    expect(layout.reveals.values.bottom).toBe(0.125);
    expect(layout.reveals.sources.bottom).toBe('manual');
    expect(layout.faces[0].z).toBe(44.125);
  });

  it('anchor 5: leaves face frame and beaded inset reveals unchanged', () => {
    for (const [styleId, bottom] of [[14, 1.5], [15, 1.75]]) {
      const layout = fixture({ styleId }).get('cabinet');
      expect(layout.reveals.values.bottom).toBe(bottom);
      expect(layout.reveals.sources.bottom).toBe('style');
    }
  });

  it('uses gap reach and the configured upper bottom reveal', () => {
    const settings = { ...DEFAULT_SETTINGS, faceReveals: {
      ...DEFAULT_SETTINGS.faceReveals,
      [CABINET_TYPE_IDS.UPPER]: { ...DEFAULT_SETTINGS.faceReveals[CABINET_TYPE_IDS.UPPER], bottom: -0.25 },
    } };
    const layout = fixture({ gap: 0.75, settings }).get('cabinet');
    expect(layout.box.z).toBe(44.75);
    expect(layout.reveals.values.bottom).toBe(-0.25);
    expect(layout.reveals.sources.bottom).toBe('rule:open-below');
    expect(layout.faces[0].z).toBe(44.5);
  });

  it('keeps stacked-bottom precedence even when openBelow is passed explicitly', () => {
    const reveals = cabinetReveals({ style: DEFAULT_SETTINGS.defaultStyle,
      cabinetTypeId: CABINET_TYPE_IDS.TALL, openBelow: true, stacked: { top: false, bottom: true },
      face: { type: 'door' }, settings: DEFAULT_SETTINGS });
    expect(reveals.values.bottom).toBe(0);
    expect(reveals.sources.bottom).toBe('rule:stacked-seam');
  });
});

describe('openBelow geometry', () => {
  const cabinet = { id: 'cabinet', kind: 'cabinet', x: 20, width: 20, z: 44, height: 46 };
  const voidPiece = { id: 'void', kind: 'void', x: 20, width: 20, z: 4, height: 40 };

  it('requires a cabinet and a horizontally overlapping void directly below', () => {
    expect(openBelow([cabinet, voidPiece], cabinet.id)).toBe(true);
    expect(openBelow([cabinet, { ...voidPiece, x: 39 }], cabinet.id)).toBe(true);
    for (const patch of [
      { x: 40 }, { x: 0 }, { z: 45 }, { height: 41 }, { height: 39.5 }, { kind: 'filler' },
    ]) expect(openBelow([cabinet, { ...voidPiece, ...patch }], cabinet.id)).toBe(false);
    expect(openBelow([cabinet, voidPiece], 'missing')).toBe(false);
    expect(openBelow([cabinet, voidPiece], voidPiece.id)).toBe(false);
    expect(openBelow([{ ...cabinet, kind: 'panel' }, voidPiece], cabinet.id)).toBe(false);
  });

  it('includes the gap reach boundary and excludes farther voids', () => {
    const pieces = [cabinet, { ...voidPiece, height: 39.25 }];
    expect(openBelow(pieces, cabinet.id)).toBe(false);
    expect(openBelow(pieces, cabinet.id, 0.75)).toBe(true);
    expect(openBelow(pieces, cabinet.id, 0.5)).toBe(false);
  });

  it('rejects an open area when any overlapping cabinet meets the bottom within reach', () => {
    const support = { ...voidPiece, id: 'support', kind: 'cabinet', x: 39, width: 1, height: 39.25 };
    expect(openBelow([cabinet, voidPiece, support], cabinet.id)).toBe(true);
    expect(openBelow([cabinet, voidPiece, support], cabinet.id, 0.75)).toBe(false);
  });
});
