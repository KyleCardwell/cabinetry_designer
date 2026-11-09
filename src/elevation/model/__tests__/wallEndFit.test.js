import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { syncRoom } from '../room.js';
import { wallEndFit } from '../wallEndFit.js';
import { wallEndPanelPolygon, wallEndPanelSpans, wallEndPanels } from '../wallEndPanels.js';
import { wallParts } from '../wallParts.js';
import { roomParts } from '../parts.js';
import { wallBadgeGroups } from '../partNumbers.js';
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

describe('SH7.6 step e wall end panel fit', () => {
  it('anchor 1: fits one face, preserving negative back depth through elevation, plan and shipping', () => {
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

  it('anchor 2: fits across opposite faces and reserves each end once', () => {
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

  it('anchor 3: propagates top and bottom clearances to drawing, picking, numbering and reports', () => {
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

  it('anchor 4: falls back inside the legs when they overlap', () => {
    const { synced, r, panel } = inspect(room({ walls: [wall({ ...W,
      endLegs: { start: { ...W.endLegs.start,
        faces: { front: { ...E, back: { ...S, y: -18.5 } } } } } })] }));
    expect(panel).toMatchObject({ front: { x: 3.5, depth: 24.875 }, back: { depth: 0 }, bottom: 0,
      warnings: [{ code: 'wall-panel-no-depth', name: 'Left end wall panel' }] });
    expect(r.x).toBe(4.3125);
    expect(legWarningText(panel.warnings[0])).toBe('Left end wall panel: no room between the legs (they touch or overlap). Drawn inside the legs.');
    expect(shipped(synced)).toBeDefined();
  });

  it('anchor 5: leaves fit dormant without the stored panel', () => {
    const { synced, w, r, panel } = inspect(room({ walls: [wall({ ...W, endPanels: { start: null, end: null } })] }));
    expect(panel).toBeUndefined();
    expect(wallEndFit(synced, w, 'start', settings)).toEqual({ warnings: [] });
    expect(r.x).toBe(3.5);
    expect(runLegs(synced, w, r, settings)).toHaveLength(2);
  });

  it('anchor 6: measures inset from the foremost leg outside face', () => {
    const { r, panel } = inspect(room({ walls: [wall({ ...W,
      endLegs: { start: { ...W.endLegs.start, faces: { front: { ...E, front: { ...Sf, x: 1 } } } } } })] }));
    expect(panel.front.x).toBe(-0.75);
    expect(r.x).toBe(3.5);
  });

  it('anchor 7: falls back inside when the fitted panel has no height', () => {
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
