import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEFAULT_SETTINGS } from '../constants.js';
import { horizontalChains } from '../dimensionsHorizontal.js';
import { effectiveSettings } from '../effectiveSettings.js';
import { syncRoom } from '../room.js';

const framed = (source) => { source.style = { cabinetStyleId: 14 }; };
const mitered90 = (source) => {
  framed(source);
  const wall3 = source.walls.find(({ name }) => name === 'Wall 3');
  for (const run of wall3.runs) {
    for (const end of Object.values(run.ends ?? {})) if (end?.type === 'corner') end.corner.kind = 90;
  }
};
const emptyReturn = (source) => { source.walls.find(({ name }) => name === 'Wall 4').runs = []; };

function innerRow(edit, band, wallName = 'Wall 3') {
  const source = JSON.parse(readFileSync(new URL('./fixtures/room8cc.json', import.meta.url), 'utf8'));
  edit(source);
  const settings = effectiveSettings({ settings: { ...DEFAULT_SETTINGS } }, source);
  const room = syncRoom(source, settings);
  const wall = room.walls.find(({ name }) => name === wallName);
  return horizontalChains(room, wall, band, settings).inner;
}

describe('corner owner face dimensions', () => {
  it.each([
    ['euro upper', () => {}, 'upper', [
      ['neighbor', 0, 12.875, '40329765'], ['piece', 12.875, 24, 'a72f41f6'], ['piece', 24, 24.75],
    ]],
    ['euro base', () => {}, 'lower', [
      ['piece', 74, 127], ['piece', 127, 138.125, 'b0505231'], ['neighbor', 138.125, 163, 'fa801266'],
    ]],
    ['face frame 45', framed, 'lower', [
      ['frame', 125.1635, 126.6635], ['piece', 126.6635, 138.1875], ['neighbor', 138.1875, 163],
    ]],
    ['face frame 90', mitered90, 'lower', [
      ['frame', 126.25, 127.75], ['piece', 127.75, 138.1875], ['neighbor', 138.1875, 163],
    ]],
    ['empty return', emptyReturn, 'lower', [
      ['piece', 74, 127], ['piece', 127, 139], ['corner-return', 139, 163],
    ]],
  ])('reads return depth then corner span on the owner face: %s (CC8)', (_, edit, band, expected) => {
    const row = innerRow(edit, band);
    const first = row.findIndex((segment) => (
      segment.kind === expected[0][0] && Math.abs(segment.start - expected[0][1]) < 1e-3
    ));
    expect(first).toBeGreaterThanOrEqual(0);
    const got = row.slice(first, first + expected.length);
    expect(got.map(({ kind }) => kind)).toEqual(expected.map(([kind]) => kind));
    expected.forEach(([, start, end], index) => {
      expect(got[index].start).toBeCloseTo(start, 3);
      expect(got[index].end).toBeCloseTo(end, 3);
    });
    expected.forEach(([, , , id], index) => {
      if (id) expect(got[index].pieceId ?? got[index].neighborRunId).toMatch(new RegExp(`^${id}`));
    });
  });
});

describe('corner return face dimensions', () => {
  it.each([
    ['euro upper', () => {}, 'Wall 2', 'upper', [
      ['piece', 59.625, 78.5], ['corner-leg', 78.5, 89.625], ['neighbor', 89.625, 102.5],
    ]],
    ['euro base', () => {}, 'Wall 4', 'lower', [
      ['neighbor', 0, 24.875], ['corner-leg', 24.875, 36], ['piece', 36, 48],
    ]],
    ['face frame 45', framed, 'Wall 4', 'lower', [
      ['neighbor', 0, 24.8125], ['corner-leg', 24.8125, 36.3365], ['frame', 36.3365, 37.8365],
    ]],
    ['face frame 90', mitered90, 'Wall 4', 'lower', [
      ['neighbor', 0, 24.8125], ['corner-leg', 24.8125, 35.25], ['frame', 35.25, 36.75],
    ]],
    ['empty return', emptyReturn, 'Wall 4', 'lower', [
      ['neighbor', 0, 24.875], ['corner-leg', 24.875, 36], ['open', 36, 60.5],
    ]],
  ])('reads the corner leg span on the return face: %s (CC8)', (_, edit, wallName, band, expected) => {
    const row = innerRow(edit, band, wallName);
    const first = row.findIndex((segment) => (
      segment.kind === expected[0][0] && Math.abs(segment.start - expected[0][1]) < 1e-3
    ));
    expect(first).toBeGreaterThanOrEqual(0);
    const got = row.slice(first, first + expected.length);
    expect(got.map(({ kind }) => kind)).toEqual(expected.map(([kind]) => kind));
    expected.forEach(([, start, end], index) => {
      expect(got[index].start).toBeCloseTo(start, 3);
      expect(got[index].end).toBeCloseTo(end, 3);
    });
  });
});
