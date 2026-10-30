import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { attach, line, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { lineHeldJoints, placeAttachedRuns } from '../index.js';
import { PLACEMENT_STAGES, runEdges } from '../placement.js';
import { roomDiagnostics, syncRoom } from '../roomSync.js';

const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };
const joint = (jointId, offset = 0) => ({ to: 'joint', jointId, offset });

describe('LL4 run layout lines', () => {
  it('slides a free run without changing width, offsets included, and preserves settled objects', () => {
    const stored = room({ walls: [wall({
      x2: 240, lines: [line('L1', 100)],
      runs: [run({ x: 10, width: 30, attach: attach('L1') })],
    })] });
    const before = structuredClone(stored);
    const placed = placeAttachedRuns(stored, settings);
    expect(placed.walls[0].runs[0]).toMatchObject({ x: 85, width: 30 });
    expect(stored).toEqual(before);
    expect(placeAttachedRuns(placed, settings)).toBe(placed);
    const edited = structuredClone(placed);
    edited.walls[0].runs[0].attach.offset = 2;
    expect(placeAttachedRuns(edited, settings).walls[0].runs[0].x).toBe(87);
  });

  it.each([['right', 50], ['center', 100], ['left', 30]])(
    'moves the free right edge for %s, keeping the wall-anchored left edge', (at, width) => {
      const stored = room({ walls: [wall({
        lines: [line('L1', 50)],
        runs: [run({ width: 30, anchors: { left: true, right: false }, attach: attach('L1', at) })],
      })] });
      const synced = syncRoom(stored, settings);
      expect(synced.walls[0].runs[0]).toMatchObject({ x: 0, width });
      const warnings = roomDiagnostics(synced, settings)['run-1'].warnings;
      expect(warnings.filter(({ code }) => code === 'line-unmet')).toEqual(at === 'left' ? [{
        code: 'line-unmet',
        message: "Can't sit on L1: its left end is anchored. Free that end or attach a different point.",
      }] : []);
    },
  );

  it.each([['left', 50, 94], ['center', -44, 188], ['right', 114, 30]])(
    'moves the free left edge for %s, keeping the wall-anchored right edge', (at, x, width) => {
      const stored = room({ walls: [wall({
        lines: [line('L1', 50)],
        runs: [run({ x: 114, width: 30, anchors: { left: false, right: true }, attach: attach('L1', at) })],
      })] });
      expect(placeAttachedRuns(runEdges(stored, settings), settings).walls[0].runs[0])
        .toMatchObject({ x, width });
    },
  );

  it('reports fixed ends only beyond the 1/64 target tolerance', () => {
    for (const value of [72, 72 + 1 / 64, 73]) {
      const stored = room({ walls: [wall({
        lines: [line('L1', value)],
        runs: [run({ anchors: { left: true, right: true }, attach: attach('L1') })],
      })] });
      const warnings = roomDiagnostics(stored, settings)['run-1'].warnings;
      expect(warnings.filter(({ code }) => code === 'line-unmet')).toEqual(value === 73 ? [{
        code: 'line-unmet',
        message: "Can't sit on L1: its both ends are anchored. Free that end or attach a different point.",
      }] : []);
    }
  });

  it('lets the first attached run hold a shared joint, even when it starts on target', () => {
    const first = run({ id: 'first', x: 20, width: 30, holdWidth: true,
      anchors: { left: joint('J0'), right: joint('J1') }, attach: attach('L1') });
    const second = run({ id: 'second', x: 50, width: 30, holdWidth: true,
      anchors: { left: joint('J1'), right: joint('J2') }, attach: attach('L2') });
    const stored = room({ walls: [wall({
      lines: [line('L1', 35), line('L2', 100)],
      joints: [{ id: 'J0', x: 20 }, { id: 'J1', x: 50 }, { id: 'J2', x: 80 }],
      runs: [first, second,
        run({ id: 'left', width: 20, anchors: { left: false, right: joint('J0') } }),
        run({ id: 'right', x: 80, width: 30, anchors: { left: joint('J2'), right: false } })],
    })] });
    expect(lineHeldJoints(stored.walls[0]).get('J1')).toEqual({ lineId: 'L1', runId: 'first' });
    const synced = syncRoom(stored, settings);
    expect(synced.walls[0].joints.find(({ id }) => id === 'J1').x).toBe(50);
    expect(roomDiagnostics(synced, settings).second.warnings).toContainEqual({
      code: 'line-joint-taken', side: 'left',
      message: "Can't move its left joint: L1 holds it through another run.",
    });
    const reversed = { ...stored.walls[0], runs: [second, first] };
    expect(lineHeldJoints(reversed).get('J1')).toEqual({ lineId: 'L2', runId: 'second' });
  });

  it('inverts signed joint offsets and resolves neighbours and transitive followers on the changed wall', () => {
    const untouched = wall({ id: 'untouched', runs: [run({ id: 'unattached' })] });
    const stored = room({ walls: [wall({
      x2: 240, lines: [line('L1', 100)],
      joints: [{ id: 'JL', x: 8 }, { id: 'JR', x: 43 }],
      runs: [run({ id: 'leader', x: 10, width: 30,
        anchors: { left: joint('JL', 2), right: joint('JR', 3) }, attach: attach('L1') }),
      run({ id: 'neighbour', x: 43, width: 197, anchors: { left: joint('JR'), right: true } }),
      run({ id: 'follower2', width: 10, anchors: { left: { to: 'follow', runId: 'follower', side: 'right', offset: 0 }, right: false } }),
      run({ id: 'follower', width: 10, anchors: { left: { to: 'follow', runId: 'leader', side: 'right', offset: 0 }, right: false } })],
    }), untouched] });
    const placed = placeAttachedRuns(stored, settings);
    expect(placed.walls[1]).toBe(untouched);
    expect(placed.walls[0].joints.map(({ x }) => x)).toEqual([83, 118]);
    expect(placed.walls[0].runs.map(({ x, width }) => [x, width]))
      .toEqual([[85, 30], [118, 122], [125, 10], [115, 10]]);
  });

  it('uses back-face coordinates without mirroring the run', () => {
    const stored = room({ walls: [wall({
      lines: [line('B', 20, { wallSide: 'back' })],
      runs: [run({ width: 30, wallSide: 'back', attach: attach('B') })],
    })] });
    expect(syncRoom(stored, settings).walls[0].runs[0]).toMatchObject({ x: 5, width: 30 });
  });

  it('does not hold a joint when the attachment requests the opposite fixed edge', () => {
    const stored = wall({ lines: [line('L1', 20)], runs: [run({
      anchors: { left: true, right: joint('J') }, attach: attach('L1', 'left'),
    })] });
    expect(lineHeldJoints(stored).size).toBe(0);
  });

  it('is an identity for Room 8 without lines', () => {
    const room8 = JSON.parse(readFileSync(new URL('./fixtures/room8.json', import.meta.url), 'utf8'));
    expect(placeAttachedRuns(room8, settings)).toBe(room8);
  });

  it('places run lines immediately after edges and before column targets', () => {
    expect(PLACEMENT_STAGES.map(({ name }) => name))
      .toEqual(['return-pins', 'soffits', 'run-edges', 'line-runs', 'pin-growth']);
    expect(PLACEMENT_STAGES[3].run).toBe(placeAttachedRuns);
  });
});
