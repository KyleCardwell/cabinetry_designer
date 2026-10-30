import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { attach, auto, line, opening, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { attachOffsetHere, placeAttachedOpenings } from '../linePlacement.js';
import { openingGeometry, validateOpeningPlacement } from '../openings.js';
import { syncRoom } from '../roomSync.js';

const room8 = JSON.parse(readFileSync(new URL('./fixtures/room8.json', import.meta.url), 'utf8'));
const settings = DEFAULT_SETTINGS;

function windowW(overrides = {}) {
  return opening({ id: 'W', kind: 'window', label: 'W1', sillZ: 36, height: 40, ...overrides });
}

function synced({ length = 240, lines = [], openings = [windowW()], runs = [] } = {}) {
  return syncRoom(room({ walls: [wall({ id: 'H', x2: length, lines, openings, runs })] }), settings);
}

const wallOf = (state) => state.walls[0];
const openingOf = (state, id = 'W') => wallOf(state).openings.find((candidate) => candidate.id === id);
const geometryOf = (state, id = 'W') => openingGeometry(openingOf(state, id), wallOf(state).x2, settings);
const jambX = (state, id) => geometryOf(state, id).jamb.x;

describe('LL3 openings placed by layout lines', () => {
  it('1–2. centres the window on a line from either end', () => {
    const left = synced({ lines: [line('L1', 100)], openings: [windowW({ attach: attach('L1') })] });
    expect(jambX(left)).toBe(82);
    expect(openingOf(left).offset).toBe(82);
    const right = synced({
      lines: [line('L1', 100, { from: 'right' })], openings: [windowW({ attach: attach('L1') })],
    });
    expect(jambX(right)).toBe(122);
    expect(openingOf(right).offset).toBe(122);
  });

  it('3. keeps the opening’s own readout terms', () => {
    const state = synced({
      lines: [line('L1', 100)],
      openings: [windowW({ offsetFrom: 'right', offsetAnchor: 'center', offset: 198, attach: attach('L1') })],
    });
    expect(openingOf(state).offset).toBe(140);
    expect(jambX(state)).toBe(82);
  });

  it('4–5. puts an edge on the line, in the measure mode’s reference rect', () => {
    const edge = synced({ lines: [line('L1', 100)], openings: [windowW({ attach: attach('L1', 'left', -2) })] });
    expect(jambX(edge)).toBe(98);
    const casing = synced({
      lines: [line('L1', 100)],
      openings: [windowW({ measureMode: 'casing', width: 42, height: 46, offset: 21, attach: attach('L1', 'right') })],
    });
    expect(geometryOf(casing).casing.x).toBe(58);
    expect(jambX(casing)).toBe(61);
    expect(openingOf(casing).offset).toBe(58);
  });

  it('6. mirrors a back-face line', () => {
    const state = synced({
      lines: [line('B', 30, { wallSide: 'back' })], openings: [windowW({ attach: attach('B', 'left', 2) })],
    });
    expect(jambX(state)).toBe(172);
  });

  it('7. follows a right-measured line when the wall length changes', () => {
    const lines = [line('L1', 99, { from: 'right' })];
    const openings = [windowW({ attach: attach('L1') })];
    expect(openingOf(synced({ length: 235, lines, openings })).offset).toBe(118);
    expect(openingOf(synced({ length: 240, lines, openings })).offset).toBe(123);
  });

  it('10. does not clamp a window pushed off the wall', () => {
    const state = synced({ lines: [line('L1', 10)], openings: [windowW({ attach: attach('L1') })] });
    expect(jambX(state)).toBe(-8);
    const resolved = { ...wallOf(state), length: 240 };
    expect(validateOpeningPlacement(resolved, openingOf(state), settings).reason).toBe('opening-out-of-bounds');
  });

  it('11. numbers windows after placing them', () => {
    const state = synced({
      lines: [line('L1', 180)],
      openings: [
        windowW({ id: 'Wa', label: 'W1', offset: 24, attach: attach('L1') }),
        windowW({ id: 'Wb', label: 'W2', offset: 100 }),
      ],
    });
    expect(jambX(state, 'Wa')).toBe(162);
    expect(openingOf(state, 'Wb').label).toBe('W1');
    expect(openingOf(state, 'Wa').label).toBe('W2');
  });

  it('12. runs anchored to the casing follow the line', () => {
    const anchored = (value) => synced({
      lines: [line('L1', value)],
      openings: [windowW({ attach: attach('L1') })],
      runs: [run({
        id: 'base', x: 0, width: 40, autoCount: false, items: [auto('A')],
        anchors: { left: false, right: { to: 'opening', openingId: 'W', edge: 'casing', clearance: null } },
      })],
    });
    const rightEdge = (state) => wallOf(state).runs[0].x + wallOf(state).runs[0].width;
    expect(rightEdge(anchored(100))).toBe(79);
    expect(rightEdge(anchored(110))).toBe(89);
  });

  it('13. leaves rooms without attachments alone', () => {
    expect(placeAttachedOpenings(room8, settings)).toBe(room8);
    const state = synced({ lines: [line('L1', 100)], openings: [windowW({ attach: attach('L1') })] });
    expect(placeAttachedOpenings(state, settings)).toBe(state);
  });

  it('measures the offset that keeps an opening in place', () => {
    const window = windowW();
    expect(attachOffsetHere(window, line('L1', 100), 'center', 240, settings)).toBe(-58);
    expect(attachOffsetHere(window, line('B', 30, { wallSide: 'back' }), 'left', 240, settings)).toBe(150);
  });
});
