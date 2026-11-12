import { describe, expect, it } from 'vitest';
import { auto, fixed, room, run, wall } from '../../../test/builders.js';
import { cellPieces } from '../cells.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { cornerEnd, normalizeCornerEnd } from '../cornerEnd.js';
import { layoutRun } from '../faceLayouts.js';
import { boxInsets, frameRegions } from '../frames.js';
import { resolveWall, syncRoom } from '../room.js';

const S = { ...DEFAULT_SETTINGS, runFlex: 0 };
const INSET = { cabinetStyleId: 14 };
const EURO = { cabinetStyleId: 13 };

/** Room B (SPEC-CC6): a framed base run on wall-1 with a 36 x 36 corner at its left end; C is a 45, D adds a return run. */
function makeRoom({ kind = 90, items = [fixed('cc', 36), auto('a')], returnRun = false, style = INSET } = {}) {
  const owner = run({ autoCount: false, width: 144, items, anchors: { left: true, right: false },
    ends: { left: normalizeCornerEnd({ corner: { kind } }), right: { type: 'none' } } });
  const ownerWall = wall({ runs: [owner],
    connections: { start: { wallId: 'wall-2', endpoint: 'end' }, end: null } });
  const returnWall = wall({ id: 'wall-2', x1: 0, y1: 144, x2: 0, y2: 0,
    connections: { start: null, end: { wallId: 'wall-1', endpoint: 'start' } },
    runs: returnRun ? [run({ id: 'run-2', autoCount: false, width: 108, items: [auto('r')],
      anchors: { left: false, right: true }, ends: { left: { type: 'none' }, right: { type: 'none' } } })] : [] });
  return syncRoom(room({ style, walls: [ownerWall, returnWall] }), S);
}

function framesOf(subject, wallIndex = 0) {
  const resolved = resolveWall(subject, subject.walls[wallIndex]);
  const subjectRun = resolved.runs[0];
  const layout = layoutRun(subject, resolved, subjectRun, S);
  const cells = cellPieces(subjectRun, layout);
  const frames = frameRegions(subject, subjectRun, cells, S);
  return { wall: resolved, run: subjectRun, layout, cells, frames, insets: boxInsets(frames, cells, S) };
}

const box = (cells, id) => cells.pieces.find((piece) => piece.id === id);

describe('framed corner offsets, corner laps (CC6)', () => {
  it('Room B laps the neighbour 3/4 over the corner box', () => {
    const { frames, cells, insets } = framesOf(makeRoom());
    expect(frames.regions.some((region) => region.cabinetIds.includes('cc'))).toBe(false);
    expect(frames.freeSides.has('cc')).toBe(false);
    const [region] = frames.regions;
    expect(region.cabinetIds).toEqual(['a']);
    expect(region.x).toBeCloseTo(35.25, 3);
    expect(box(cells, 'a').x).toBeCloseTo(36, 3);
    expect(region.cornerLaps).toHaveLength(1);
    expect(region.cornerLaps[0]).toMatchObject({ id: 'corner-lap:cc', side: 'left', columnId: 'cc' });
    expect(region.cornerLaps[0].x).toBeCloseTo(35.25, 3);
    expect(region.cornerLaps[0].width).toBeCloseTo(0.75, 3);
    expect(region.panelIds).toEqual([]);
    expect(frames.cornerLaps).toEqual(region.cornerLaps);
    expect(frames.freeSides.get('a').left).toBe(false);
    expect(insets.get('a').left).toBe(0);
    expect(frames.warnings).toEqual([]);
  });

  it('Room C spaces the neighbour off by the mitered stile, with no lap', () => {
    const { frames, cells, insets } = framesOf(makeRoom({ kind: 45 }));
    const [region] = frames.regions;
    expect(region.cabinetIds).toEqual(['a']);
    expect(region.x).toBeCloseTo(36, 3);
    expect(region.cornerLaps).toBeUndefined();
    expect(frames.cornerLaps).toEqual([]);
    expect(frames.freeSides.get('a').left).toBe(true);
    expect(insets.get('a').left).toBeCloseTo(1.0865, 3);
    expect(box(cells, 'a').x + insets.get('a').left).toBeCloseTo(37.0865, 3);
  });

  it('a corner column alone makes no region and no warning', () => {
    const { frames } = framesOf(makeRoom({ items: [fixed('cc', 36)] }));
    expect(frames.regions).toEqual([]);
    expect(frames.warnings).toEqual([]);
  });

  it('Room D return run laps over leg B with a joined end', () => {
    const subject = makeRoom({ returnRun: true });
    const { run: returnRun, frames, cells, insets } = framesOf(subject, 1);
    expect(returnRun._frame.cornerDieIn).toEqual({ left: false, right: true });
    const [region] = frames.regions;
    expect(region.x + region.width).toBeCloseTo(108.75, 3);
    const r = box(cells, 'r');
    expect(r.x + r.width).toBeCloseTo(108, 3);
    expect(region.cornerLaps).toEqual([
      { id: 'corner-lap:cc', side: 'right', x: 108, width: 0.75, columnId: 'cc' },
    ]);
    expect(frames.freeSides.get('r').right).toBe(false);
    expect(insets.get('r').right).toBe(0);
    // splitRun's end gap at the corner end is 0: the box runs to the run's edge.
    expect(returnRun.x + returnRun.width - r.x - r.width).toBeCloseTo(0, 3);
  });

  it('a Corner 45 return run keeps its box at its end and takes the mitered overhang', () => {
    const subject = makeRoom({ kind: 45, returnRun: true });
    const { frames, cells, insets } = framesOf(subject, 1);
    const [region] = frames.regions;
    const r = box(cells, 'r');
    expect(r.x + r.width).toBeCloseTo(108, 3);
    expect(region.x + region.width).toBeCloseTo(108, 3);
    expect(frames.cornerLaps).toEqual([]);
    expect(frames.freeSides.get('r').right).toBe(true);
    expect(insets.get('r').right).toBeCloseTo(1.0865, 3);
  });

  it('framed corner faces sit on the frame front; Euro keeps its face offset', () => {
    const framed = makeRoom();
    const framedEnd = cornerEnd(framed, framed.walls[0], framed.walls[0].runs[0], 'left', S);
    expect(framedEnd.offsetA).toBeCloseTo(0.8125, 3);
    expect(framedEnd.offsetB).toBeCloseTo(0.8125, 3);
    const euro = makeRoom({ style: EURO });
    const euroEnd = cornerEnd(euro, euro.walls[0], euro.walls[0].runs[0], 'left', S);
    expect(euroEnd.offsetA).toBeCloseTo(0.875, 3);
    expect(euroEnd.offsetB).toBeCloseTo(0.875, 3);
  });

  it('a Euro corner owner adds no frame die-in to its return run', () => {
    const subject = makeRoom({ style: EURO, returnRun: true });
    expect(subject.walls[1].runs[0]._frame).toBeUndefined();
    expect(subject.walls[0].runs[0]._frame).toBeUndefined();
  });
});
