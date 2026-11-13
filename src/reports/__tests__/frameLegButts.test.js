import { expect, it } from 'vitest';
import { auto, room, run, wall } from '../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../elevation/model/constants.js';
import { layoutRun, runFaceLayouts } from '../../elevation/model/faceLayouts.js';
import { planRunPieces } from '../../elevation/model/planPieces.js';
import { resolveWall, syncRoom } from '../../elevation/model/room.js';
import { shippingList } from '../shippingList.js';

const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };

it.each([
  ['left', '3 11/16" left stile (butts end panel, no miter)'],
  ['right', '3 11/16" right stile (butts end panel, no miter)'],
])('lists the %s stile butting the end panel (SH7.7)', (side, note) => {
  const input = room({ style: { cabinetStyleId: 14 }, walls: [wall({ runs: [run({
    id: 'R', width: 36, autoCount: false, items: [auto('cabinet')],
    ends: { left: { type: 'none' }, right: { type: 'none' }, [side]: { type: 'end_panel' } },
    endLegs: { [side]: { legs: 'front', front: {
      square: { w: 3, d: 3 }, height: 'full', x: 0, y: 3,
    } } },
  })] })] });
  const subject = syncRoom(input, settings);
  const rows = shippingList(subject, settings).rows;
  expect(rows.find(({ kind }) => kind === 'frame').notes).toEqual([note]);

  const reference = structuredClone(input);
  reference.walls[0].runs[0].ends[side].frame = 'miter';
  const panel = rows.find(({ key }) => key === `R:${side}`);
  expect(panel).toBeDefined();
  expect(panel).toEqual(shippingList(syncRoom(reference, settings), settings).rows
    .find(({ key }) => key === `R:${side}`));

  if (side === 'left') {
    const view = resolveWall(subject, subject.walls[0]);
    const owner = view.runs[0];
    const layout = layoutRun(subject, view, owner, settings);
    const { faces } = planRunPieces(subject, view, owner, settings, layout,
      runFaceLayouts(subject, view, owner, settings, layout));
    expect(faces.find(({ kind }) => kind === 'frame')).toMatchObject({
      start: 0.8125, end: 36, back: 24, front: 24.8125,
      polygon: [[0.8125, 24.8125], [36, 24.8125], [36, 24], [0.8125, 24]],
    });
    expect(faces.find(({ key }) => key === 'R:left')).toEqual({
      key: 'R:left', kind: 'end_panel', start: 0, end: 0.8125, back: 0, front: 24.8125,
    });
  }
});
