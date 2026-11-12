import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { syncRoom } from '../room.js';
import { wallEndFit } from '../wallEndFit.js';
import { wallEndPanelPolygon, wallEndPanelReturnPolygons, wallEndPanelSpans, wallEndPanels } from '../wallEndPanels.js';
import { wallParts } from '../wallParts.js';
import { planParts } from '../planParts.js';
import { clearanceParts } from '../clearances.js';
import { wallFrame } from '../geometry.js';
import { roomParts } from '../parts.js';
import { partNumbers, wallBadgeGroups } from '../partNumbers.js';
import { pickStack } from '../pick.js';
import { runEndView } from '../runSide.js';
import { legWarningText, runLegs } from '../legs.js';
import { planThroughDimensions } from '../planDimensions.js';
import { cornerReserveParts } from '../corners.js';
import { wallSideView } from '../wallSides.js';
import { shippingList } from '../../../reports/shippingList.js';
import { doorOrderItems } from '../../../reports/doorOrder.js';
import { auto, room, run, wall } from '../../../test/builders.js';
import { E, S, Sf, legShape, noEnds } from './fixtures/legs.js';

const settings = { ...DEFAULT_SETTINGS, runFlex: 0, shapes: [legShape()] };
const R = run({ id: 'R', width: 36, anchors: { left: true, right: false }, ends: noEnds,
  autoCount: false, items: [auto('cabinet')] });
const Rb = run({ ...R, id: 'Rb', wallSide: 'back', anchors: { left: false, right: true } });
const W = wall({ id: 'w', x2: 96, thickness: 4.5, runs: [R],
  endPanels: { start: { width: null }, end: null },
  endLegs: { start: { faces: { front: E }, fit: 'between', panel: {} } } });

function inspect(input, options = settings) {
  const synced = syncRoom(input, options);
  const w = synced.walls[0];
  return { synced, w, r: w.runs[0], panel: wallEndPanels(synced, w, options)[0] };
}

const shipped = (synced, options = settings) => shippingList(synced, options).rows
  .find(({ key }) => key === 'w:endPanel:start');

describe('wall end panel fit (SH7.6)', () => {
  it('fits one face, preserving negative back depth through elevation, plan and shipping', () => {
    const input = room({ walls: [W] });
    const before = structuredClone(input);
    const { synced, w, r, panel } = inspect(input);
    expect(panel).toMatchObject({ width: 0.8125, top: 34.5, bottom: 0,
      front: { x: 0.25, depth: 21.875 }, back: { depth: -8 } });
    expect(r.x).toBe(3.5);
    expect(wallParts(synced, w, 'front', settings)[0]).toMatchObject({
      x: 0.25, z: 0, width: 0.8125, height: 34.5, back: 3.5, front: 21.875 });
    expect(planThroughDimensions(synced, w, settings).map(({ text }) => text)).toEqual(['18 3/8']);
    expect(wallEndPanelPolygon(synced, w, panel)).toEqual([
      { x: 0.25, y: 3.5 }, { x: 1.0625, y: 3.5 },
      { x: 1.0625, y: 21.875 }, { x: 0.25, y: 21.875 },
    ]);
    expect(shipped(synced)).toMatchObject({ description: 'Wall End Panel', size: '18 3/8 x 34 1/2 x 13/16' });
    expect(syncRoom(synced, settings)).toEqual(synced);
    expect(input).toEqual(before);
  });

  it('fits across opposite faces and reserves each end once', () => {
    const { synced, w, r, panel } = inspect(room({ walls: [wall({ ...W, runs: [R, Rb],
      endLegs: { start: { faces: { front: { legs: 'front', front: Sf },
        back: { legs: 'front', front: Sf } }, fit: 'between', panel: {} } } })] }));
    expect(panel).toMatchObject({ front: { x: 0.25, depth: 21.875 },
      back: { x: 94.9375, depth: 21.875 } });
    expect(wallEndFit(synced, w, 'start', settings).lo).toBe(-26.375);
    expect(r.x).toBe(3.5);
    expect(96 - w.runs[1].x - w.runs[1].width).toBe(3.5);
    expect(shipped(synced).size).toBe('48 1/4 x 34 1/2 x 13/16');
  });

  it('propagates top and bottom clearances to drawing, picking, numbering and reports', () => {
    const { synced, w, r, panel } = inspect(room({ walls: [wall({ ...W,
      endLegs: { start: { ...W.endLegs.start, panel: { top: 1, bottom: 0.5 } } } })] }));
    expect(panel).toMatchObject({ top: 33.5, bottom: 0.5 });
    expect(wallParts(synced, w, 'front', settings)[0]).toMatchObject({ z: 0.5, height: 33 });
    expect(roomParts(synced, settings).find(({ kind }) => kind === 'wall_end_panel'))
      .toMatchObject({ z: 0.5, height: 33 });
    expect(wallBadgeGroups(synced, w, settings).find(({ key }) => key === 'panel:start').pieces[0])
      .toMatchObject({ z: 0.5, height: 33 });
    expect(wallEndPanelSpans(w, panel)).toEqual([{ z: 0.5, height: 33 }]);
    expect(pickStack(synced, w, settings, { x: 0.5, z: 0.25 }).some(({ kind }) => kind === 'end_panel')).toBe(false);
    expect(pickStack(synced, w, settings, { x: 0.5, z: 1 }).find(({ kind }) => kind === 'end_panel').rect)
      .toMatchObject({ z: 0.5, height: 33 });
    expect(runEndView(synced, w, r, 'left', settings, { returnEnd: true })
      .find(({ wallEndpoint }) => wallEndpoint === 'start')).toMatchObject({ z: 0.5, height: 33 });
    expect(shipped(synced).size).toBe('18 3/8 x 33 x 13/16');
    expect(doorOrderItems(synced, settings).items.find(({ pieceId }) => pieceId === 'w:endPanel:start').height).toBe(33);
  });

  it('falls back inside the legs when they overlap', () => {
    const { synced, r, panel } = inspect(room({ walls: [wall({ ...W,
      endLegs: { start: { ...W.endLegs.start,
        faces: { front: { ...E, back: { ...S, y: -18.5 } } } } } })] }));
    expect(panel).toMatchObject({ front: { x: 3.5, depth: 24.875 }, back: { depth: 0 }, bottom: 0,
      warnings: [{ code: 'wall-panel-no-depth', name: 'Left end wall panel' }] });
    expect(r.x).toBe(4.3125);
    expect(legWarningText(panel.warnings[0])).toBe('Left end wall panel: no room between the legs (they touch or overlap). Drawn inside the legs.');
    expect(shipped(synced)).toBeDefined();
  });

  it('leaves fit dormant without the stored panel', () => {
    const { synced, w, r, panel } = inspect(room({ walls: [wall({ ...W, endPanels: { start: null, end: null } })] }));
    expect(panel).toBeUndefined();
    expect(wallEndFit(synced, w, 'start', settings)).toEqual({ warnings: [] });
    expect(r.x).toBe(3.5);
    expect(runLegs(synced, w, r, settings)).toHaveLength(2);
  });

  it('measures inset from the foremost leg outside face', () => {
    const { r, panel } = inspect(room({ walls: [wall({ ...W,
      endLegs: { start: { ...W.endLegs.start, faces: { front: { ...E, front: { ...Sf, x: 1 } } } } } })] }));
    expect(panel.front.x).toBe(-0.75);
    expect(r.x).toBe(3.5);
  });

  it('falls back inside when the fitted panel has no height', () => {
    const { r, panel } = inspect(room({ walls: [wall({ ...W,
      endLegs: { start: { ...W.endLegs.start, panel: { bottom: 100 } } } })] }));
    expect(panel).toMatchObject({ top: 34.5, bottom: 0, front: { x: 3.5 },
      warnings: [{ code: 'wall-panel-no-height', name: 'Left end wall panel' }] });
    expect(r.x).toBe(4.3125);
    expect(legWarningText(panel.warnings[0])).toBe('Left end wall panel: it has no height. Drawn inside the legs.');
  });

  it('uses team clearances and panel thickness and reserves a panel extending inside the legs', () => {
    const options = { ...settings, legPanelReveal: 4, legPanelTopClearance: 1, legPanelBottomClearance: 0.5 };
    const { synced, w, r, panel } = inspect(room({ walls: [wall({ ...W,
      endPanels: { start: { width: 1.25 }, end: null } })] }), options);
    expect(panel).toMatchObject({ width: 1.25, front: { x: 4 }, top: 33.5, bottom: 0.5 });
    expect(r.x).toBe(5.25);
    expect(cornerReserveParts(synced, w, 'left', { ...r, cornerClearance: { left: 2 } }, options).total).toBe(2);
  });

  it.each(['base', 'countertop'])('uses the foremost leg %s support for the panel bottom', (sitsOn) => {
    const supported = run({ ...R, z: sitsOn === 'countertop' ? 40 : 4,
      overrides: { baseKind: 'furniture_base', toeKickHeight: 4 } });
    const support = run({ id: 'support', width: 36, autoCount: false, items: [auto('support-cabinet')] });
    const { panel } = inspect(room({ walls: [wall({ ...W,
      runs: sitsOn === 'countertop' ? [supported, support] : [supported],
      endLegs: { start: { ...W.endLegs.start, faces: { front: { ...E, front: { ...Sf, sitsOn } } } } } })] }));
    expect(panel.bottom).toBe(sitsOn === 'base' ? 4 : 36);
  });

  it('uses the largest anchored run top, while missing shapes leave the fit dormant', () => {
    const tall = run({ id: 'tall', cabinetTypeId: 3, z: 0, height: 80, width: 36,
      anchors: { left: true, right: false }, ends: noEnds, items: [auto('tall-cabinet')] });
    const { panel } = inspect(room({ walls: [wall({ ...W, runs: [R, tall] })] }));
    expect(panel.top).toBe(80);
    const missing = inspect(room({ walls: [wall({ ...W,
      endLegs: { start: { ...W.endLegs.start, faces: { front: { ...E, back: { ...S, shapeId: 'missing' } } } } } })] }));
    expect(wallEndFit(missing.synced, missing.w, 'start', settings)).toEqual({ warnings: [] });
    expect(missing.panel.front.x).toBe(3.5);
    expect(missing.panel.bottom).toBe(0);
  });

  it('uses the 1/1000 depth and height tolerance', () => {
    for (const delta of [0.0005, 0.0015]) {
      const { panel } = inspect(room({ walls: [wall({ ...W,
        endLegs: { start: { ...W.endLegs.start, faces: { front: { ...E,
          back: { ...S, y: -(18.375 - delta) } } } } } })] }));
      expect(panel.warnings?.[0]?.code).toBe(delta < 0.001 ? 'wall-panel-no-depth' : undefined);
      const short = inspect(room({ walls: [wall({ ...W,
        endLegs: { start: { ...W.endLegs.start, panel: { bottom: 34.5 - delta } } } })] }));
      expect(short.panel.warnings?.[0]?.code).toBe(delta < 0.001 ? 'wall-panel-no-height' : undefined);
    }
  });

  it('keeps fitted panels on the correct endpoint with flipped views and end flex', () => {
    const input = room({ walls: [wall({ ...W, flipped: true, _endFlex: { start: 1 },
      runs: [run({ ...R, anchors: { left: false, right: true } })] })] });
    const w = input.walls[0];
    const panel = wallEndPanels(input, w, settings)[0];
    expect(panel.front).toMatchObject({ side: 'right', x: 95.9375, depth: 21.875 });
    expect(panel.back).toMatchObject({ side: 'left', x: -0.75, depth: -8 });
    expect(wallEndPanels(input, wallSideView(w, 'back'), settings)[0]).toEqual(panel);
    expect(cornerReserveParts(input, w, 'right', w.runs[0], settings).total).toBe(3.5);
  });
});


describe('wall end panel returns (SH7.6)', () => {
  it('reserves both returns, emits elevation outlines and ships one C-shape', () => {
    const { synced, w, r, panel } = inspect(room({ walls: [wall({ ...W,
      endLegs: { start: { ...W.endLegs.start, panel: { returns: 'both' } } } })] }));
    expect(r.x).toBe(4.75);
    expect(panel.returnDepth).toBe(4.5);
    expect(panel.returns).toEqual([
      { edge: 'front', start: 1.0625, end: 4.75, back: 21.0625, front: 21.875 },
      { edge: 'back', start: 1.0625, end: 4.75, back: 3.5, front: 4.3125 },
    ]);
    expect(wallParts(synced, w, 'front', settings).slice(1)).toEqual(panel.returns.map((ret) => ({
      id: `w:endPanel:start:return-${ret.edge}`, kind: 'wall_end_panel',
      x: 1.0625, z: 0, width: 3.6875, height: 34.5, back: ret.back, front: ret.front,
      coversBoxEdges: false, opaque: false,
    })));
    expect(shippingList(synced, settings).rows.filter(({ kind }) => kind === 'wall_end_panel'))
      .toMatchObject([{ key: 'w:endPanel:start', notes: expect.arrayContaining(['C-shape']), size: '18 3/8 x 34 1/2 x 4 1/2' }]);
    expect(roomParts(synced, settings).filter(({ kind }) => kind === 'wall_end_panel')).toHaveLength(1);
    expect([...partNumbers(synced, settings).byKey.keys()].filter((key) => key.startsWith('w:endPanel:')))
      .toEqual(['w:endPanel:start']);
    expect(syncRoom(synced, settings)).toEqual(synced);
  });

  it('ships a single front or back return as an L-shape', () => {
    for (const edge of ['front', 'back']) {
      const { synced, r, panel } = inspect(room({ walls: [wall({ ...W,
        endLegs: { start: { ...W.endLegs.start, panel: { returns: edge } } } })] }));
      expect(panel.returns).toHaveLength(1);
      expect(panel.returns[0].edge).toBe(edge);
      expect(r.x).toBe(4.75);
      expect(shipped(synced)).toMatchObject({ notes: expect.arrayContaining(['L-shape']), size: '18 3/8 x 34 1/2 x 4 1/2' });
    }
  });

  it('warns and keeps a plain panel for returns no deeper than thickness', () => {
    for (const returnDepth of [0.75, 0.8125, 0.8125 + 0.5e-6]) {
      const { synced, w, r, panel } = inspect(room({ walls: [wall({ ...W,
        endLegs: { start: { ...W.endLegs.start, panel: { returns: 'both', returnDepth } } } })] }));
      expect(panel.returns ?? []).toEqual([]);
      expect(panel).not.toHaveProperty('returnDepth');
      expect(panel.warnings).toEqual([{ code: 'leg-fill-return-short', name: 'Left end wall panel' }]);
      expect(r.x).toBe(3.5);
      expect(wallParts(synced, w, 'front', settings)).toHaveLength(1);
      expect(planParts(synced, settings).filter(({ kind }) => kind === 'wall_end_panel')).toHaveLength(1);
      expect(shipped(synced).size).toBe('18 3/8 x 34 1/2 x 13/16');
      expect(shipped(synced).notes).not.toEqual(expect.arrayContaining(['C-shape']));
      expect(shipped(synced).notes).not.toEqual(expect.arrayContaining(['L-shape']));
    }
  });

  it('draws a C in plan while dimensions and clearances retain the panel rectangle', () => {
    const { synced, w, panel } = inspect(room({ walls: [wall({ ...W,
      endLegs: { start: { ...W.endLegs.start, panel: { returns: 'both' } } } })] }));
    const parts = planParts(synced, settings).filter(({ kind }) => kind === 'wall_end_panel');
    expect(parts).toEqual([
      { id: 'w:endPanel:start', kind: 'wall_end_panel', top: 34.5,
        points: [[0.25, -3.5], [1.0625, -3.5], [1.0625, -21.875], [0.25, -21.875]] },
      { id: 'w:endPanel:start:return-front', kind: 'wall_end_panel', top: 34.5,
        points: [[1.0625, -21.0625], [4.75, -21.0625], [4.75, -21.875], [1.0625, -21.875]] },
      { id: 'w:endPanel:start:return-back', kind: 'wall_end_panel', top: 34.5,
        points: [[1.0625, -3.5], [4.75, -3.5], [4.75, -4.3125], [1.0625, -4.3125]] },
    ]);
    expect(clearanceParts(synced, settings).filter(({ kind }) => kind === 'panel')).toMatchObject([
      { points: wallEndPanelPolygon(synced, w, panel) },
    ]);
    expect(planThroughDimensions(synced, w, settings).map(({ text }) => text)).toEqual(['18 3/8']);
  });

  it('gives the plan canvas the return rectangles beside the panel polygon', () => {
    const { synced, w, panel } = inspect(room({ walls: [wall({ ...W,
      endLegs: { start: { ...W.endLegs.start, panel: { returns: 'both' } } } })] }));
    const xy = (points) => points.map(({ x, y }) => [x, Math.abs(y)]);
    expect(wallEndPanelReturnPolygons(synced, w, panel).map(({ edge, points }) => [edge, xy(points)])).toEqual([
      ['front', [[1.0625, 21.0625], [4.75, 21.0625], [4.75, 21.875], [1.0625, 21.875]]],
      ['back', [[1.0625, 3.5], [4.75, 3.5], [4.75, 4.3125], [1.0625, 4.3125]]],
    ]);
    expect(wallEndPanelReturnPolygons(synced, w, { ...panel, returns: undefined })).toEqual([]);
  });

  it('picks the panel on returns from either face and respects its vertical clearances', () => {
    const { synced, w } = inspect(room({ walls: [wall({ ...W,
      endLegs: { start: { ...W.endLegs.start, panel: { returns: 'both', bottom: 1, top: 2 } } } })] }));
    for (const [side, x] of [['front', 3], ['back', 93]]) {
      const view = wallSideView(w, side);
      expect(pickStack(synced, view, settings, { x, z: 2 }).filter(({ kind }) => kind === 'end_panel'))
        .toMatchObject([{ key: 'end_panel:start', selection: { endPanel: 'start' },
          rect: { z: 1, height: 31.5 } }]);
      for (const z of [0.5, 33]) {
        expect(pickStack(synced, view, settings, { x, z }).some(({ kind }) => kind === 'end_panel')).toBe(false);
      }
      expect(wallParts(synced, w, side, settings).slice(1))
        .toMatchObject([{ z: 1, height: 31.5 }, { z: 1, height: 31.5 }]);
    }
  });

  it('maps returns through right ends, flipped views, rotated walls and end flex', () => {
    for (const flipped of [false, true]) {
      for (const endpoint of ['start', 'end']) {
        const side = (endpoint === 'start') !== flipped ? 'left' : 'right';
        const backSide = side === 'left' ? 'right' : 'left';
        const w = wall({ ...W, flipped, x1: 10, y1: 20, x2: 10, y2: 116,
          _endFlex: { [endpoint]: 1 }, runs: [run({ ...R, anchors: { [side]: true } })],
          endPanels: { [endpoint]: { width: null } },
          endLegs: { [endpoint]: { ...W.endLegs.start, panel: { returns: 'both' } } } });
        const source = room({ walls: [w] });
        const panel = wallEndPanels(source, w, settings)[0];
        const x = side === 'left' ? 0.0625 : 92.25;
        expect(panel.returns).toMatchObject([{ start: x, end: x + 3.6875 }, { start: x, end: x + 3.6875 }]);
        const backParts = wallParts(source, w, 'back', settings).slice(1);
        expect(backParts).toMatchObject([
          { x: backSide === 'left' ? 0.0625 : 92.25, width: 3.6875, back: -26.375, front: -25.5625 },
          { back: -8.8125, front: -8 },
        ]);
        const frame = wallFrame(source, wallSideView(w, 'front'));
        const returns = planParts(source, settings).filter(({ id }) => id.includes(':return-'));
        expect(returns).toHaveLength(2);
        for (const [index, ret] of returns.entries()) {
          const points = ret.points.map(([px, py]) => {
            const dx = px - frame.leftPoint.x;
            const dy = -py - frame.leftPoint.y;
            return [dx * frame.r.x + dy * frame.r.y, dx * frame.n.x + dy * frame.n.y];
          });
          const band = panel.returns[index];
          expect(points).toEqual([[band.start, band.back], [band.end, band.back],
            [band.end, band.front], [band.start, band.front]]);
        }
      }
    }
  });

  it('reserves returns only where they overlap run depth, including across the back face', () => {
    const front = { ...Sf, takesRoom: false };
    const back = { ...S, y: 12, takesRoom: false };
    for (const [returns, expected] of [['back', 1.0625], ['front', 6.25]]) {
      const { synced, w, r, panel } = inspect(room({ walls: [wall({ ...W,
        endLegs: { start: { ...W.endLegs.start, faces: { front: { legs: 'both', front, back } },
          panel: { returns } } } })] }), { ...settings, legPanelReturnDepth: 6 });
      expect(r.x).toBe(expected);
      expect(panel.returnDepth).toBe(6);
      expect(cornerReserveParts(synced, w, 'left', { ...r, cornerClearance: { left: 2 } }, settings).total).toBe(2);
    }
    const { w } = inspect(room({ walls: [wall({ ...W, runs: [R, Rb],
      endLegs: { start: { faces: { front: { legs: 'front', front: Sf }, back: { legs: 'front', front: Sf } },
        fit: 'between', panel: { returns: 'back', returnDepth: 6 } } } })] }));
    expect(w.runs[0].x).toBe(6.25);
    expect(96 - w.runs[1].x - w.runs[1].width).toBe(6.25);
  });

  it('uses explicit return depth and panel thickness, leaving invalid fits without returns', () => {
    const { synced, r, panel } = inspect(room({ walls: [wall({ ...W,
      endPanels: { start: { width: 1.25 } },
      endLegs: { start: { ...W.endLegs.start, panel: { returns: 'front', returnDepth: 5 } } } })] }),
    { ...settings, legPanelReturnDepth: 6 });
    expect(r.x).toBe(5.25);
    expect(panel.returns).toEqual([{ edge: 'front', start: 1.5, end: 5.25, back: 20.625, front: 21.875 }]);
    expect(shipped(synced).size).toBe('18 3/8 x 34 1/2 x 5');
    for (const changes of [{ fit: undefined }, { panel: { returns: 'both', bottom: 100 } },
      { faces: { front: { ...E, back: { ...S, y: -18.5 } } } }]) {
      const result = inspect(room({ walls: [wall({ ...W,
        endLegs: { start: { ...W.endLegs.start, panel: { returns: 'both' }, ...changes } } })] }));
      expect(result.panel.returns ?? []).toEqual([]);
      expect(result.r.x).toBe(4.3125);
    }
  });
});
