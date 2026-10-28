import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { centerOverTargets, centerRunOver, targetsAt } from '../centerOver.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { auto, fixed, room, run, wall } from '../../../test/builders.js';

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

describe('CV1 step a: centerRunOver', () => {
  it('anchor 6: centers the Room 8 hood on the open cell and moves both joints', () => {
    const result = centerRunOver(stored, WALL, HOOD, `${BASE}:${VOID}`, settings8);
    expect(result).toMatchObject({ ok: true, joints: true, off: 0 });
    expect(runOf(result, HOOD)).toMatchObject({ x: 96.5, width: 80 });
    expect(runOf(result, LEFT_UPPER)).toMatchObject({ x: 38, width: 58.5 });
    expect(runOf(result, RIGHT_UPPER)).toMatchObject({ x: 176.5, width: 58.5 });
    expect(jointX(result, HOOD_LEFT_JOINT)).toBe(96.5);
    expect(jointX(result, HOOD_RIGHT_JOINT)).toBe(176.5);
  });

  it('anchor 7: centers over the whole base run', () => {
    const result = centerRunOver(stored, WALL, HOOD, `${BASE}:run`, settings8);
    expect(result.ok).toBe(true);
    expect(runOf(result, HOOD)).toMatchObject({ x: 96.5, width: 80 });
  });

  it('anchor 8: stops at the left upper minimum and reports how far off it is', () => {
    const result = centerRunOver(stored, WALL, HOOD, `${BASE}:${FIRST_CAB}`, settings8);
    expect(result.ok).toBe(true);
    expect(result.limit).toMatchObject({ runId: LEFT_UPPER });
    expect(runOf(result, HOOD).x).toBeGreaterThan(38);
    expect(runOf(result, HOOD).width).toBe(80);
    expect(result.off).toBeGreaterThan(0);
  });

  it('anchor 9: moves a free run without joints', () => {
    const subject = small([baseRun(), upperRun()]);
    const target = centerOverTargets(subject, 'wall-1', 'up', settings).find((entry) => entry.key === 'base:v');
    const result = centerRunOver(subject, 'wall-1', 'up', 'base:v', settings);
    expect(result).toMatchObject({ ok: true, joints: false, off: 0 });
    expect(result.room.walls[0].runs.find(({ id }) => id === 'up').x).toBeCloseTo(target.center - 15, 9);
  });

  it('anchor 10: cells inside split columns are targets of their own', () => {
    const subject = small([baseRun(split), upperRun()]);
    const targets = centerOverTargets(subject, 'wall-1', 'up', settings);
    const cells = ['mid-a', 'mid-b'].map((id) => targets.find((entry) => entry.key === `base:${id}`));
    expect(cells.map((entry) => entry?.rect.width)).toEqual([12, 12]);
    expect(cells[1].rect.x - cells[0].rect.x).toBeGreaterThanOrEqual(12);
    const result = centerRunOver(subject, 'wall-1', 'up', 'base:mid-b', settings);
    expect(result.room.walls[0].runs.find(({ id }) => id === 'up').x).toBeCloseTo(cells[1].center - 15, 9);
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
