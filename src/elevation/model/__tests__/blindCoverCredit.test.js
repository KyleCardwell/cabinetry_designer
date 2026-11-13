import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { attach, auto, fixed, room, run, wall } from '../../../test/builders.js';
import { blindEntries, blindPartWidths } from '../blind.js';
import { cellPieces } from '../cells.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { layoutRun } from '../faceLayouts.js';
import { blindCoversForRun } from '../runAnchors.js';
import { syncRoom } from '../room.js';
import { contentsWidth, lineSharedWidths, runFlexNeeds, runWidthRange, splitRun } from '../splitRun.js';
import { CABINET_STYLE_IDS } from '../styles.js';
import { teeFillers } from '../tees.js';

const S = { ...DEFAULT_SETTINGS, cornerFillerMinWidth: 2 };
const rows = (pieces) => pieces.map(({ x, width }) => [x, width]);

function room10bt(settings = S, edit = () => {}) {
  const source = JSON.parse(readFileSync(new URL('./fixtures/room10bt.json', import.meta.url), 'utf8'));
  edit(source.walls[1].runs[0]);
  const synced = syncRoom(source, settings);
  const currentWall = synced.walls[1];
  const currentRun = currentWall.runs[0];
  const layout = layoutRun(synced, currentWall, currentRun, settings);
  const cells = cellPieces(currentRun, layout);
  const ts = teeFillers(synced, currentRun, cells, settings);
  const openings = cells.pieces.filter(({ kind }) => kind === 'cabinet').map((piece) => {
    const covers = ts.covers.get(piece.id);
    return piece.width - (covers?.left ?? 0) - (covers?.right ?? 0);
  });
  return { synced, currentWall, currentRun, layout, ts, openings };
}

describe('blind cover credit (BT1)', () => {
  it('returns the blind cover to the fillers and keeps the shared flex width', () => {
    const { synced, currentWall, currentRun, layout, ts, openings } = room10bt();
    expect(rows(layout.pieces)).toEqual([[0, 1.625], [1.625, 30], [31.625, 29.25], [60.875, 2.3125]]);
    expect(ts.tees.find(({ end }) => end === 'left')).toMatchObject({ x: 0, width: 2.375 });
    expect(ts.tees.find(({ end, orientation }) => end === null && orientation === 'vertical'))
      .toMatchObject({ x: 30.875, width: 1.5 });
    expect(openings).toEqual([28.5, 28.5, 28.5, 28.5]);
    expect(currentRun.flex.boxes.run).toBe(30);
    expect(blindEntries(synced, currentWall, currentRun, S).entries[0])
      .toMatchObject({ boxX: 31.625, boxWidth: 42, visibleWidth: 29.25 });
    const widths = blindPartWidths(synced, currentWall, currentRun, S);
    expect(widths.get(layout.pieces[2].id)).toBe(42);
    expect(widths.get(`${currentRun.id}:right`)).toBe(6);
    expect(syncRoom(synced, S)).toEqual(synced);
  });

  it('gives equal openings and visible ends with default minimums', () => {
    const { layout, ts, openings } = room10bt(DEFAULT_SETTINGS);
    expect(rows(layout.pieces)).toEqual([[0, 1.125], [1.125, 30.5], [31.625, 29.75], [61.375, 1.8125]]);
    expect(openings).toEqual([29, 29, 29, 29]);
    expect(ts.tees.find(({ end }) => end === 'left').width).toBe(1.875);
    expect(layout.pieces.at(-1).width).toBe(1.8125);
  });

  it('leaves the widths unchanged when the blind end T is off', () => {
    const { layout } = room10bt(S, (r) => { r.endFiller = { ...r.endFiller, right: { tFiller: false } }; });
    expect(rows(layout.pieces)).toEqual([[0, 1.75], [1.75, 29.5], [31.25, 29.5], [60.75, 2.4375]]);
  });

  it('leaves the no-T layout unchanged', () => {
    const { layout, ts } = room10bt(S, (r) => { delete r.tFiller; });
    expect(rows(layout.pieces)).toEqual([[0, 2.125], [2.125, 29.5], [31.625, 29.5], [61.125, 2.0625]]);
    expect(ts.tees).toEqual([]);
  });

  it('requires Euro style, a blind end and box, seam Ts and that end cover on either wall face', () => {
    for (const side of ['left', 'right']) {
      const source = run({ tFiller: 'all', blind: { [side]: 42 },
        ends: { left: { type: 'blind' }, right: { type: 'blind' } }, items: [auto('A'), auto('B')] });
      const host = wall({ runs: [source] });
      const state = room({ walls: [host] });
      const expected = { left: 0, right: 0, [side]: 0.75 };
      expect(blindCoversForRun(state, host, source, S)).toEqual(expected);
      expect(blindCoversForRun(state, host, { ...source, wallSide: 'back' }, S)).toEqual(expected);
      for (const cabinetStyleId of [CABINET_STYLE_IDS.INSET, CABINET_STYLE_IDS.BEADED_INSET]) {
        expect(blindCoversForRun(state, host, { ...source, style: { cabinetStyleId } }, S))
          .toEqual({ left: 0, right: 0 });
        expect(blindCoversForRun({ ...state, style: { cabinetStyleId } }, host, source, S))
          .toEqual({ left: 0, right: 0 });
      }
      for (const edited of [
        { ...source, tFiller: undefined, endFiller: { [side]: { tFiller: true } } },
        { ...source, endFiller: { [side]: { tFiller: false } } },
        { ...source, ends: { ...source.ends, [side]: { type: 'filler', width: null } } },
        run({ ...source, blind: { [side]: 0 }, items: [auto('A'), auto('B')] }),
      ]) expect(blindCoversForRun(state, host, edited, S)).toEqual({ left: 0, right: 0 });
    }
  });

  it('credits only outer autos at real ends with another root cabinet, without changing width bounds', () => {
    for (const side of ['left', 'right']) {
      for (const items of [[auto('A'), auto('B')], [fixed('A', 20), auto('B')], [auto('A')],
        [auto('A'), { ...auto('P'), kind: 'panel' }]]) {
        const source = run({ width: 63.125, autoCount: false, items });
        const opts = { blindCovers: { [side]: 0.75 } };
        const outer = side === 'left' ? items[0] : items.at(-1);
        const eligible = outer.width === null && items.some((item) => item !== outer && item.kind === 'cabinet');
        const plain = splitRun(source, S);
        const credited = splitRun(source, S, opts);
        if (eligible) expect(credited.pieces).not.toEqual(plain.pieces);
        else expect(credited).toEqual(plain);
        expect(splitRun({ ...source, _pinSplit: { [side]: true } }, S, opts)).toEqual(plain);
        expect(contentsWidth(source, S, opts)).toBe(contentsWidth(source, S));
        expect(runWidthRange(source, S, opts)).toEqual(runWidthRange(source, S));
      }
    }
  });

  it('uses the same credit for line sharing and the real ends of pinned segments', () => {
    const opts = { blindCovers: { left: 0.75, right: 0.75 }, pinTargets: { P: 60 } };
    const source = run({ width: 120, autoCount: false, items: [auto('A'), auto('B'),
      { ...fixed('P', 20), attach: attach('L') }, auto('C'), auto('D')] });
    const layout = splitRun(source, S, opts);
    expect(layout.errors).toEqual([]);
    expect(rows(layout.pieces)).toEqual([
      [0, 1.75], [1.75, 23.75], [25.5, 24.5], [50, 20],
      [70, 24.5], [94.5, 23.75], [118.25, 1.75],
    ]);
    expect(runFlexNeeds(source, S, opts).map(({ box }) => box)).toEqual([24.5, 24.5]);
    const sharing = run({ width: 63.125, autoCount: false, anchors: { left: true, right: true },
      ends: { left: { type: 'filler' }, right: { type: 'none' } },
      items: [auto('A'), { ...auto('B'), attach: attach('L', 'right') }] });
    expect(lineSharedWidths(sharing, S, { blindCovers: { left: 0.75 }, pinTargets: { B: 63.125 } })).toEqual({ B: 31 });
    expect(rows(splitRun(sharing, S, {
      blindCovers: { left: 0.75 }, pinTargets: { B: 63.125 },
    }).pieces)).toEqual([[0, 1.875], [1.875, 30.25], [32.125, 31]]);
  });
});
