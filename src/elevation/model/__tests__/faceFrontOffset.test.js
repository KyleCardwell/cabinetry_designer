import { describe, expect, it } from 'vitest';
import { auto, room, run, wall } from '../../../test/builders.js';
import { cellDepth } from '../cells.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { faceFrontOffset, frontDepth } from '../corners.js';
import { DEFAULT_DOOR_STYLE } from '../doorStyles.js';
import { elevationParts } from '../elevationParts.js';
import { planRunPieces } from '../planPieces.js';
import { resolveWall, syncRoom } from '../room.js';
import { runScene } from '../runScene.js';
import { CABINET_STYLE_IDS } from '../styles.js';

const S = DEFAULT_SETTINGS;
const thick = { ...DEFAULT_DOOR_STYLE, id: 'thick', thickness: 1 };

function geometry(overrides = {}, roomOverrides = {}) {
  const source = room({
    ...roomOverrides,
    walls: [wall({ runs: [run({
      width: 36, autoCount: false, items: [auto('a'), auto('b')],
      tFiller: 'all', ...overrides,
    })] })],
  });
  const current = syncRoom(source, S);
  const view = resolveWall(current, current.walls[0], 'front');
  const subject = view.runs[0];
  const scene = runScene(current, view, subject, S);
  return {
    run: subject,
    plan: planRunPieces(current, view, subject, S, scene.result, scene.faceLayouts),
    parts: elevationParts(current, current.walls[0], 'front', S),
  };
}

const bands = (faces) => faces.filter(({ kind }) => kind === 'face').map(({ back, front }) => [back, front]);

describe('FX9 a: Euro T-run faces line up with the T fronts', () => {
  it('anchor 1: aligns doors, seam T and end Ts at 24 13/16', () => {
    const { run: subject, plan, parts } = geometry();
    expect(frontDepth(subject, S)).toBe(24.8125);
    expect(bands(plan.faces)).toEqual([[24, 24.8125], [24, 24.8125]]);
    expect(plan.faces.filter(({ kind }) => kind === 'filler').map(({ key, back, front }) => [key, back, front]))
      .toEqual([['run-1:left', 24, 24.8125], ['run-1:right', 24, 24.8125], ['tee:a|b', 24, 24.8125]]);
    expect(bands(parts)).toEqual([[24, 24.8125], [24, 24.8125]]);
    expect(plan.boxes.every(({ back, front }) => back === 0 && front === 24)).toBe(true);
  });

  it('anchor 2: keeps the bumper and own face thickness without a run T choice', () => {
    const { run: subject, plan, parts } = geometry({ tFiller: undefined });
    expect(frontDepth(subject, S)).toBe(24.875);
    expect(bands(plan.faces)).toEqual([[24.0625, 24.875], [24.0625, 24.875]]);
    expect(bands(parts)).toEqual([[24.0625, 24.875], [24.0625, 24.875]]);
  });

  it('anchor 3: sinks 1-inch doors behind the T front', () => {
    const { run: subject, plan, parts } = geometry({ doorStyleId: thick.id }, { doorStyles: [thick] });
    expect(subject._doorThickness).toBe(1);
    expect(frontDepth(subject, S)).toBe(24.8125);
    expect(bands(plan.faces)).toEqual([[23.8125, 24.8125], [23.8125, 24.8125]]);
    expect(bands(parts)).toEqual([[23.8125, 24.8125], [23.8125, 24.8125]]);
  });

  it('anchor 4: keeps face frame doors at the frame front', () => {
    const { run: subject, plan, parts } = geometry({
      style: { cabinetStyleId: CABINET_STYLE_IDS.INSET }, doorStyleId: thick.id,
    }, { doorStyles: [thick] });
    expect(subject._frame.thickness).toBe(0.8125);
    expect(frontDepth(subject, S)).toBe(24.8125);
    expect(plan.faces.filter(({ kind }) => kind === 'frame').map(({ back, front }) => [back, front]))
      .toEqual([[24, 24.8125]]);
    expect(bands(parts)).toEqual([[23.8125, 24.8125], [23.8125, 24.8125]]);
    expect(parts.filter(({ kind }) => kind === 'frame').every(({ back, front }) => back === 24 && front === 24.8125))
      .toBe(true);
  });

  it('anchor 5: brings a flush side panel to the T front with its back at zero', () => {
    const { plan, parts } = geometry({ items: [auto('a'),
      { ...auto('panel'), kind: 'panel', width: 0.75 }, auto('b')] });
    expect(plan.faces.find(({ key }) => key === 'panel')).toMatchObject({ back: 0, front: 24.8125 });
    expect(parts.find(({ id }) => id === 'panel')).toMatchObject({ back: 0, front: 24.8125 });
  });

  it.each(['seams', 'all'])('uses the %s run choice even when every individual T is disabled', (tFiller) => {
    const { run: subject, plan, parts } = geometry({ tFiller,
      endFiller: { left: { tFiller: false }, right: { tFiller: false } },
      items: [{ ...auto('a'), tFiller: { right: false } }, { ...auto('b'), tFiller: { left: false } }],
    });
    expect(faceFrontOffset(subject, S)).toBe(0.8125);
    expect(bands(plan.faces)).toEqual([[24, 24.8125], [24, 24.8125]]);
    expect(bands(parts)).toEqual([[24, 24.8125], [24, 24.8125]]);
  });

  it('keeps individually enabled end and seam Ts from moving a non-T run', () => {
    const { run: subject, plan, parts } = geometry({ tFiller: 'none',
      endFiller: { left: { tFiller: true }, right: { tFiller: true } },
      items: [{ ...auto('a'), tFiller: { right: true } }, auto('b')],
    });
    expect(frontDepth(subject, S)).toBe(24.875);
    expect(bands(plan.faces)).toEqual([[24.0625, 24.875], [24.0625, 24.875]]);
    expect(bands(parts)).toEqual([[24.0625, 24.875], [24.0625, 24.875]]);
  });

  it('aligns mixed face thicknesses only on T runs', () => {
    const items = [{ ...auto('a'), doorStyleId: thick.id }, auto('b')];
    for (const tFiller of ['all', 'none']) {
      const { plan, parts } = geometry({ items, tFiller }, { doorStyles: [thick] });
      const expected = tFiller === 'all'
        ? [[23.8125, 24.8125], [24, 24.8125]]
        : [[24.0625, 25.0625], [24.0625, 24.875]];
      expect(bands(plan.faces)).toEqual(expected);
      expect(bands(parts)).toEqual(expected);
    }
  });

  it('adds the recess plane and outset once, including back-aligned shallow cabinets', () => {
    const { run: subject, plan, parts } = geometry({ outset: 2,
      items: [{ ...auto('a'), depth: 21, align: 'back' }, auto('b')],
    });
    expect(frontDepth({ ...subject, _plane: { offset: -3 } }, S)).toBe(23.8125);
    expect(bands(plan.faces)).toEqual([[23, 23.8125], [26, 26.8125]]);
    expect(bands(parts)).toEqual([[23, 23.8125], [26, 26.8125]]);
  });

  it('keeps cellDepth backward-compatible and uses the passed offset only for flush panels', () => {
    const side = { kind: 'panel', width: 0.75, height: 30, depth: 24 };
    const top = { kind: 'panel', width: 30, height: 0.75, depth: 24 };
    const back = { kind: 'panel', width: 30, height: 30, depth: 0.75 };
    expect(cellDepth(side, {}, 24, S)).toBe(24.875);
    expect(cellDepth(side, {}, 24, S, 1)).toBe(25.0625);
    for (const piece of [side, top]) {
      expect(cellDepth(piece, {}, 24, S, 1, 0.8125)).toBe(24.8125);
      expect(cellDepth(piece, { doors: 'cover' }, 24, S, 1, 0.8125)).toBe(24);
      expect(cellDepth(piece, { depth: 12 }, 24, S, 1, 0.8125)).toBe(12);
    }
    expect(cellDepth(back, {}, 24, S, 1, 0.8125)).toBe(24);
    expect(cellDepth({ kind: 'cabinet' }, {}, 24, S, 1, 0.8125)).toBe(24);
    const panels = run({ tFiller: 'all', items: [{ ...auto('panel'), kind: 'panel' }] });
    expect(frontDepth(panels, S)).toBe(24);
    expect(faceFrontOffset({ _frame: { thickness: 0.8125 }, tFiller: 'all' }, S)).toBe(0.875);
    expect(faceFrontOffset({ tFiller: 'all' }, { ...S, teeThickness: 1 })).toBe(1);
  });
});
