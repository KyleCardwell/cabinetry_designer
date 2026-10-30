import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { centerOverMessage, centerOverTargets, centerRunOver, targetsAt } from '../centerOver.js';
import { runItems, updateRootItem } from '../grid.js';
import { syncRoom } from '../roomSync.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { attach, auto, fixed, line, room, run, wall } from '../../../test/builders.js';

const stored = JSON.parse(readFileSync(new URL('./fixtures/room8.json', import.meta.url), 'utf8'));
const settings8 = { ...DEFAULT_SETTINGS, ...stored.settingsOverrides };
const WALL = '14154ec7-5eeb-4511-8d78-5d3da7b09418';
const BASE = '8837d4ef-0f27-4ae9-aec6-2d563cadc4b3';
const VOID = 'e77c1c0c-b386-4716-bc71-0f23ec1e585c';
const FIRST_CAB = 'db21d6ce-f4e6-482c-858a-40e9e2f6be7e';
const TALL = '6093224d-9be8-431f-b82f-b1346fd48122';
const HOOD = 'c1cb2dd4-6ec7-4d67-a1ef-1b5072bcc757';
const LEFT_UPPER = 'c3b5d002-c0bc-421b-8d22-6bbd5ee060b6';
const RIGHT_UPPER = 'd63bd233-b318-473d-a13b-23c3a2b83b49';
const HOOD_LEFT_JOINT = 'fe1b16b5-fdf8-4840-abbf-c55164603b10';
const HOOD_RIGHT_JOINT = '97d7faa1-a7c5-4b71-8d7a-030d18a7b281';

const wallOf = (result) => result.room.walls.find(({ id }) => id === WALL);
const runOf = (result, id) => wallOf(result).runs.find((candidate) => candidate.id === id);
const jointX = (result, id) => wallOf(result).joints.find((joint) => joint.id === id).x;

const none = { left: { type: 'none', width: null }, right: { type: 'none', width: null } };
const settings = { ...DEFAULT_SETTINGS };
const split = {
  id: 'mid',
  cols: [{ id: 'm1', size: 12, sizeMode: 'manual' }, { id: 'm2', size: 12, sizeMode: 'manual' }],
  rows: [{ id: 'mr', size: null, sizeMode: 'auto' }],
  cells: [
    { col: 0, row: 0, colSpan: 1, rowSpan: 1, node: { id: 'mid-a', kind: 'cabinet' } },
    { col: 1, row: 0, colSpan: 1, rowSpan: 1, node: { id: 'mid-b', kind: 'cabinet' } },
  ],
};
function baseRun(mid = { id: 'v', kind: 'void', width: 24 }) {
  const built = run({
    id: 'base', x: 0, width: 96, ends: none, autoCount: false,
    items: [fixed('b1', 36), mid.cols ? fixed('mid', 24) : mid, fixed('b3', 36)],
  });
  if (!mid.cols) return built;
  const cells = built.grid.cells.map((cell) => (cell.node.id === 'mid' ? { ...cell, node: mid } : cell));
  return { ...built, grid: { ...built.grid, cells } };
}
const upperRun = (overrides = {}) => run({
  id: 'up', cabinetTypeId: CABINET_TYPE_IDS.UPPER, x: 0, width: 30, z: 54, height: 30, depth: 12,
  ends: none, autoCount: false, items: [auto('u1')], ...overrides,
});
const small = (runs) => room({ walls: [wall({ runs })] });

describe('CV1 step a: center-over targets', () => {
  const targets = centerOverTargets(stored, WALL, HOOD, settings8);
  const byKey = (key) => targets.find((entry) => entry.key === key);

  it('anchor 1: lists the base run, its cabinets and its open cell, but not the hood', () => {
    expect(byKey(`${BASE}:run`)).toMatchObject({ kind: 'run', rect: { x: 38, width: 197 }, center: 136.5 });
    expect(targets.filter((entry) => entry.runId === BASE && entry.kind === 'cabinet')
      .map((entry) => entry.rect.x)).toEqual([38.75, 75.25, 161.25, 197.75]);
    expect(byKey(`${BASE}:${VOID}`)).toMatchObject({
      kind: 'void', rect: { x: 112.5, width: 48 }, center: 136.5, label: 'Open 48"',
    });
    expect(targets.some((entry) => entry.runId === HOOD)).toBe(false);
  });

  it('anchor 2: the tall run gives its whole run, its column and both row cells', () => {
    const tall = targets.filter((entry) => entry.runId === TALL);
    expect(tall.map((entry) => entry.kind)).toEqual(['run', 'column', 'cabinet', 'cabinet']);
    expect(tall.slice(1).map((entry) => entry.rect.height)).toEqual([86, 29.75, 56.25]);
  });

  it('anchor 3: a point in the open cell hits the cell first and the whole run last', () => {
    const hits = targetsAt(targets, { x: 135.5, z: 20 });
    expect(hits.map((entry) => entry.key)).toEqual([`${BASE}:${VOID}`, `${BASE}:run`]);
  });

  it('anchor 3b: inside the tall column the smaller row cell wins', () => {
    const hits = targetsAt(targets, { x: 18, z: 10 });
    expect(hits.map((entry) => entry.kind)).toEqual(['cabinet', 'column', 'run']);
    expect(hits[0].rect.height).toBe(29.75);
  });

  it('anchor 4: a point on the base filler hits only the whole run', () => {
    expect(targetsAt(targets, { x: 234.5, z: 20 }).map((entry) => entry.key)).toEqual([`${BASE}:run`]);
  });

  it('anchor 5: blank wall hits nothing', () => {
    expect(targetsAt(targets, { x: 135.5, z: 50 })).toEqual([]);
  });
});

describe('LL4 f: live centerRunOver', () => {
  it('anchor 6: centers the Room 8 hood on the open cell and moves both joints', () => {
    const result = centerRunOver(stored, WALL, HOOD, `${BASE}:${VOID}`, settings8, { lineId: 'N' });
    expect(result).toMatchObject({ ok: true, reason: null, lineId: 'N', targetAttached: true });
    expect(wallOf(result).lines).toEqual([{ id: 'N', label: 'L1', from: 'right', value: 98.5 }]);
    expect(runOf(result, HOOD).attach).toEqual(attach('N'));
    expect(runItems(runOf(result, BASE)).find(({ id }) => id === VOID).attach).toEqual(attach('N'));
    expect(result.target.rect.x).toBe(112.5);
    expect(centerOverTargets(result.room, WALL, HOOD, settings8).find(({ itemId }) => itemId === VOID).rect.x).toBe(112.5);
    expect(centerOverMessage(result)).toBe('Centred on L1. Move L1 to move both.');
    expect(stored.walls.find(({ id }) => id === WALL).lines).toBeUndefined();
    expect(runOf(result, HOOD)).toMatchObject({ x: 96.5, width: 80 });
    expect(runOf(result, LEFT_UPPER)).toMatchObject({ x: 38, width: 58.5 });
    expect(runOf(result, RIGHT_UPPER)).toMatchObject({ x: 176.5, width: 58.5 });
    expect(jointX(result, HOOD_LEFT_JOINT)).toBe(96.5);
    expect(jointX(result, HOOD_RIGHT_JOINT)).toBe(176.5);
  });

  it('anchor 7: centers over the whole base run', () => {
    const result = centerRunOver(stored, WALL, HOOD, `${BASE}:run`, settings8, { lineId: 'N' });
    expect(result).toMatchObject({ ok: true, targetAttached: true });
    expect(runOf(result, BASE).attach).toEqual(attach('N'));
    expect(runOf(result, HOOD)).toMatchObject({ x: 96.5, width: 80, attach: attach('N') });
  });

  it('anchor 8: centers exactly over the same far cabinet without the old minimum clamp', () => {
    const result = centerRunOver(stored, WALL, HOOD, `${BASE}:${FIRST_CAB}`, settings8, { lineId: 'N' });
    expect(result.ok).toBe(true);
    expect(result.target.center).toBe(57);
    expect(runOf(result, HOOD)).toMatchObject({ x: 17, width: 80, attach: attach('N') });
    expect(jointX(result, HOOD_LEFT_JOINT)).toBe(17);
    expect(jointX(result, HOOD_RIGHT_JOINT)).toBe(97);
  });

  it('anchor 9: moves a free run without joints', () => {
    const subject = small([baseRun(), upperRun()]);
    const target = centerOverTargets(subject, 'wall-1', 'up', settings).find((entry) => entry.key === 'base:v');
    const result = centerRunOver(subject, 'wall-1', 'up', 'base:v', settings, { lineId: 'N' });
    expect(result).toMatchObject({ ok: true, lineId: 'N', targetAttached: true });
    expect(result.room.walls[0].runs.find(({ id }) => id === 'up').x).toBeCloseTo(target.center - 15, 9);
  });

  it('anchor 10: cells inside split columns are targets of their own', () => {
    const subject = small([baseRun(split), upperRun()]);
    subject.walls[0].lines = [line('existing', 20, { label: 'L1' })];
    const targets = centerOverTargets(subject, 'wall-1', 'up', settings);
    const cells = ['mid-a', 'mid-b'].map((id) => targets.find((entry) => entry.key === `base:${id}`));
    expect(cells.map((entry) => entry?.rect.width)).toEqual([12, 12]);
    expect(cells[1].rect.x - cells[0].rect.x).toBeGreaterThanOrEqual(12);
    const result = centerRunOver(subject, 'wall-1', 'up', 'base:mid-b', settings, { lineId: 'N' });
    expect(result.room.walls[0].runs.find(({ id }) => id === 'up').x).toBeCloseTo(cells[1].center - 15, 9);
    expect(result).toMatchObject({ ok: true, lineId: 'N', targetAttached: false });
    expect(runItems(result.room.walls[0].runs[0]).every((item) => !item.attach)).toBe(true);
    expect(centerOverMessage(result)).toBe("Centred on L2. That cell can't attach to a line yet, so L2 won't follow it.");
  });

  it('anchor 11: refuses a run anchored to the wall end', () => {
    const subject = small([baseRun(), upperRun({ anchors: { left: true, right: false } })]);
    const result = centerRunOver(subject, 'wall-1', 'up', 'base:v', settings);
    expect(result).toMatchObject({ ok: false, reason: 'anchored' });
    expect(result.room).toBe(subject);
  });

  it('anchor 12: an unknown target is refused', () => {
    const subject = small([baseRun(), upperRun()]);
    expect(centerRunOver(subject, 'wall-1', 'up', 'base:nope', settings))
      .toMatchObject({ ok: false, reason: 'target-not-found' });
  });

  it('anchor 13: the only run on a wall has no targets', () => {
    expect(centerOverTargets(small([upperRun()]), 'wall-1', 'up', settings)).toEqual([]);
  });

  it('anchor 14: only runs on the same wall face are listed', () => {
    const subject = small([baseRun(), upperRun(), run({ id: 'back', wallSide: 'back', x: 0, width: 60 })]);
    const runIds = new Set(centerOverTargets(subject, 'wall-1', 'up', settings).map((entry) => entry.runId));
    expect([...runIds]).toEqual(['base']);
  });
});

describe('LL4 f: shared target lines', () => {
  it('anchor 2: moving the new Room 8 line to 99 moves the hood, joints and open together', () => {
    const centered = centerRunOver(stored, WALL, HOOD, `${BASE}:${VOID}`, settings8, { lineId: 'N' });
    const edited = structuredClone(centered.room);
    edited.walls.find(({ id }) => id === WALL).lines[0].value = 99;
    const result = { room: syncRoom(edited, settings8) };
    expect(runOf(result, HOOD)).toMatchObject({ x: 96, width: 80 });
    expect(runOf(result, LEFT_UPPER)).toMatchObject({ x: 38, width: 58 });
    expect(runOf(result, RIGHT_UPPER)).toMatchObject({ x: 176, width: 59 });
    expect(jointX(result, HOOD_LEFT_JOINT)).toBe(96);
    expect(jointX(result, HOOD_RIGHT_JOINT)).toBe(176);
    expect(centerOverTargets(result.room, WALL, HOOD, settings8).find(({ itemId }) => itemId === VOID))
      .toMatchObject({ rect: { x: 112, width: 48 }, center: 136 });
  });

  it('anchor 3: reuses the open column’s left-edge line with a 24-inch centre offset', () => {
    const source = structuredClone(stored);
    const wall = source.walls.find(({ id }) => id === WALL);
    wall.lines = [line('existing', 112.5)];
    const base = wall.runs.find(({ id }) => id === BASE);
    base.grid = updateRootItem(base.grid, VOID, { attach: attach('existing', 'left') });
    const result = centerRunOver(source, WALL, HOOD, `${BASE}:${VOID}`, settings8, { lineId: 'unused' });
    expect(wallOf(result).lines).toEqual(wall.lines);
    expect(result).toMatchObject({ lineId: 'existing', targetAttached: true });
    expect(runOf(result, HOOD)).toMatchObject({ x: 96.5, width: 80, attach: attach('existing', 'center', 24) });
    expect(runItems(runOf(result, BASE)).find(({ id }) => id === VOID).attach).toEqual(attach('existing', 'left'));
  });

  it('uses the back face, nearer end and next face label, then reuses a whole-run attachment', () => {
    const source = room({ walls: [wall({ x2: 240, lines: [line('front', 10, { label: 'L1' })], runs: [
      run({ id: 'base', wallSide: 'back', x: 150, width: 60 }),
      run({ id: 'up', wallSide: 'back', x: 0, width: 30, z: 54 }),
    ] })] });
    const first = centerRunOver(source, 'wall-1', 'up', 'base:run', settings, { lineId: 'back' });
    expect(first.room.walls[0].lines[1]).toEqual({ id: 'back', label: 'L1', wallSide: 'back', from: 'right', value: 60 });
    expect(first.room.walls[0].runs[1]).toMatchObject({ x: 165, width: 30, attach: attach('back') });
    const second = centerRunOver(first.room, 'wall-1', 'up', 'base:run', settings, { lineId: 'unused' });
    expect(second.lineId).toBe('back');
    expect(second.room.walls[0].lines).toEqual(first.room.walls[0].lines);
  });
});

it('attaching a second root target locks both widths', () => {
  const subject = room({ walls: [wall({ x2: 240, lines: [line('first', 45, { label: 'L1' })], runs: [
    run({ id: 'base', width: 90, ends: none, autoCount: false,
      items: [auto('A'), { ...auto('B'), attach: attach('first') }, auto('C')] }),
    run({ id: 'up', width: 20, z: 54, ends: none }),
  ] })] });
  const result = centerRunOver(subject, 'wall-1', 'up', 'base:C', { ...settings, runFlex: 0 }, { lineId: 'second' });
  const target = result.room.walls[0].runs[0];
  expect(target.autoCount).toBe(false);
  expect(runItems(target).map(({ width }) => width)).toEqual([null, 30, 30]);
  expect(runItems(target).map(({ attach }) => attach)).toEqual([undefined, attach('first'), attach('second')]);
  expect(result.targetAttached).toBe(true);
});
