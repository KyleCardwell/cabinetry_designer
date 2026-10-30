import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { attach, auto, line, opening, pin, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { runItems } from '../grid.js';
import {
  attachmentsTo,
  canAttach,
  lineX,
  nextLineLabel,
  pruneLines,
  setLineFrom,
} from '../layoutLines.js';
import { cloneRoom } from '../roomClone.js';
import { syncRoom } from '../roomSync.js';
import { isRoom } from '../../store/documentValidation.js';

const room8 = JSON.parse(readFileSync(new URL('./fixtures/room8.json', import.meta.url), 'utf8'));
const settings = DEFAULT_SETTINGS;

function attachedWall() {
  const front = run({ id: 'run-1', items: [auto('A'), auto('B')], attach: attach('A') });
  front.grid.cols[1].attach = attach('B');
  return wall({
    id: 'H',
    lines: [line('A', 60), line('B', 30, { wallSide: 'back' })],
    openings: [opening({ id: 'W', kind: 'window', label: 'W1', sillZ: 40, height: 40, offset: 80, attach: attach('B') })],
    runs: [front, run({ id: 'run-2', x: 130, width: 10, items: [auto('C')], attach: attach('gone') })],
  });
}

describe('LL2 layout line helpers', () => {
  it('positions a line and switches its end without moving it', () => {
    expect(lineX({ from: 'right', value: 99 }, 235)).toBe(136);
    const stored = { id: 'L', label: 'L1', from: 'right', value: 99 };
    expect(setLineFrom(stored, 'left', 235)).toEqual({ id: 'L', label: 'L1', from: 'left', value: 136 });
    expect(setLineFrom(stored, 'right', 235)).toBe(stored);
  });

  it('labels the next line per face', () => {
    const lined = wall({ lines: [
      line('a', 1, { label: 'L1' }), line('b', 2, { label: 'L3' }), line('c', 3, { label: 'Sink CL' }),
      line('d', 4, { label: 'L1', wallSide: 'back' }),
    ] });
    expect(nextLineLabel(lined, 'front')).toBe('L2');
    expect(nextLineLabel(lined, 'back')).toBe('L2');
    expect(nextLineLabel(wall(), 'front')).toBe('L1');
    expect(nextLineLabel(wall({ lines: [line('a', 1, { label: 'Sink' }), line('b', 2, { label: 'L2' })] }))).toBe('L1');
  });

  it('checks the face rule and column kinds when attaching', () => {
    const subject = attachedWall();
    const [front] = subject.runs;
    const back = { ...front, wallSide: 'back' };
    expect(canAttach(subject, 'opening', subject.openings[0], attach('B'))).toBe(true);
    expect(canAttach(subject, 'run', front, attach('A'))).toBe(true);
    expect(canAttach(subject, 'run', front, attach('B'))).toBe(false);
    expect(canAttach(subject, 'run', back, attach('B'))).toBe(true);
    expect(canAttach(subject, 'run', front, attach('gone'))).toBe(false);
    expect(canAttach(subject, 'run', front, { lineId: 'A', at: 'middle', offset: 0 })).toBe(false);
    expect(canAttach(subject, 'column', front, attach('A'), { kind: 'cabinet' })).toBe(true);
    expect(canAttach(subject, 'column', front, attach('A'), { kind: 'void' })).toBe(true);
    expect(canAttach(subject, 'column', front, attach('A'), { kind: 'filler' })).toBe(false);
    expect(canAttach(subject, 'column', front, attach('A'), { kind: 'cabinet', pin: pin(3) })).toBe(false);
  });

  it('lists what is attached to a line', () => {
    expect(attachmentsTo(attachedWall(), 'B')).toEqual([
      { kind: 'opening', openingId: 'W' },
      { kind: 'column', runId: 'run-1', itemId: 'B' },
    ]);
    expect(attachmentsTo(attachedWall(), 'A')).toEqual([{ kind: 'run', runId: 'run-1' }]);
  });
});

describe('LL2 pruning', () => {
  it('leaves walls without lines alone', () => {
    const synced = syncRoom(structuredClone(room8), { ...settings, ...room8.settingsOverrides });
    for (const each of synced.walls) {
      expect(pruneLines(each)).toBe(each);
      expect(each).not.toHaveProperty('lines');
    }
  });

  it('drops attachments to missing lines and to lines on the other face', () => {
    const before = attachedWall();
    const pruned = pruneLines(before);
    expect(pruned.runs[0].attach).toEqual(attach('A'));
    expect(pruned.runs[0].grid.cols[1]).not.toHaveProperty('attach');
    expect(pruned.openings[0].attach).toEqual(attach('B'));
    expect('attach' in pruned.runs[1]).toBe(false);
    expect(before.runs[1].attach).toEqual(attach('gone'));
    expect(pruneLines(pruned)).toBe(pruned);
  });
});

describe('LL2 validation', () => {
  const valid = () => room({ walls: [attachedWall()], wallOrder: ['H'] });

  it('accepts lines and attachments', () => {
    expect(isRoom(valid())).toBe(true);
  });

  it('rejects bad lines and attachments', () => {
    const edits = [
      (w) => { w.lines[0].value = -1; },
      (w) => { w.lines[0].from = 'center'; },
      (w) => { w.lines[0].label = '  '; },
      (w) => { w.lines[1].id = 'A'; },
      (w) => { w.lines[0].wallSide = 'top'; },
      (w) => { w.lines[0].extra = 1; },
      (w) => { w.runs[0].attach.at = 'middle'; },
      (w) => { w.runs[0].attach.offset = '2'; },
      (w) => { w.runs[0].attach.lineId = 3; },
      (w) => { w.openings[0].attach.extra = true; },
      (w) => { w.runs[1].grid = run({ id: 'run-2', items: [{ id: 'F', kind: 'filler', width: 3 }] }).grid;
        w.runs[1].grid.cols[0].attach = attach('A'); },
      (w) => { w.runs[0].grid.cols[1].pin = pin(10); },
    ];
    for (const edit of edits) {
      const bad = valid();
      edit(bad.walls[0]);
      expect(isRoom(bad)).toBe(false);
    }
  });
});

describe('LL2 sync and clone', () => {
  it('keeps lines and attachments through sync without moving anything', () => {
    const lined = room({ walls: [wall({ id: 'H', lines: [line('A', 60)], openings: [opening({ id: 'D', attach: attach('A') })],
      runs: [run({ id: 'run-1', x: 70, width: 60, items: [auto('A'), auto('B')], attach: attach('A', 'left') })] })] });
    lined.walls[0].runs[0].grid.cols[0].attach = attach('A', 'center', -3);
    const plain = structuredClone(lined);
    delete plain.walls[0].lines;
    delete plain.walls[0].openings[0].attach;
    delete plain.walls[0].runs[0].attach;
    delete plain.walls[0].runs[0].grid.cols[0].attach;

    const synced = syncRoom(lined, settings);
    const syncedPlain = syncRoom(plain, settings);
    const [w] = synced.walls;
    expect(w.lines).toEqual([line('A', 60)]);
    expect(w.openings[0].attach).toEqual(attach('A'));
    expect(w.runs[0].attach).toEqual(attach('A', 'left'));
    expect(runItems(w.runs[0])[0].attach).toEqual(attach('A', 'center', -3));
    expect([w.runs[0].x, w.runs[0].width]).toEqual([syncedPlain.walls[0].runs[0].x, syncedPlain.walls[0].runs[0].width]);
    expect(runItems(w.runs[0]).map((item) => item.width)).toEqual(runItems(syncedPlain.walls[0].runs[0]).map((item) => item.width));
    expect(w.openings[0].offset).toBe(syncedPlain.walls[0].openings[0].offset);
  });

  it('clones lines and attachments', () => {
    const source = room({ walls: [attachedWall()] });
    const copy = cloneRoom(source);
    const [a, b] = [source.walls[0], copy.walls[0]];
    expect(b.lines).toEqual(a.lines);
    expect(b.lines[0]).not.toBe(a.lines[0]);
    expect(b.runs[0].attach).toEqual(a.runs[0].attach);
    expect(b.runs[0].attach).not.toBe(a.runs[0].attach);
    expect(b.openings[0].attach).not.toBe(a.openings[0].attach);
    expect(b.runs[0].grid.cols[1].attach).toEqual(a.runs[0].grid.cols[1].attach);
    expect(b.runs[0].grid.cols[1].attach).not.toBe(a.runs[0].grid.cols[1].attach);
    expect(cloneRoom(room({ walls: [wall()] })).walls[0]).not.toHaveProperty('lines');
  });
});
