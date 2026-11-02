import { describe, expect, it } from 'vitest';
import { room, wall } from '../../test/builders.js';
import { landingOffsetFor, resolveLandings } from '../model/landings.js';
import { moveLandingDistance } from './landingMoves.js';

const host = wall({ id: 'host', x1: 0, y1: 0, x2: 144, y2: 0, thickness: 4.5 });
const landed = wall({
  id: 'landed', x1: 40, y1: 0, x2: 40, y2: 60, thickness: 4.5,
  landings: { start: { wallId: 'host', side: 'front', ref: 'left', to: 'near', offset: 40 }, end: null },
});

describe('moveLandingDistance', () => {
  it('leaves a non-square wall unsynced for the existing landing resolver', () => {
    const angled = { ...landed, x2: 70 };
    const subject = room({ walls: [host, angled] });
    const current = landingOffsetFor(subject, angled, 'start', 'left', 'near');
    const result = moveLandingDistance(subject, 'landed', 'start', {
      ref: 'left', to: 'near', offset: current + 10,
    });
    expect(result).toMatchObject({ ok: true, reason: null, message: null });
    expect(result.walls[1]).toMatchObject({
      x1: 40, y1: 0, x2: 70, y2: 60, landings: { start: { offset: current + 10 } },
    });
    expect(resolveLandings({ ...subject, walls: result.walls }).walls[1]).toMatchObject({
      x1: 50, y1: 0, x2: 80, y2: 60,
    });
    expect(angled.landings.start.offset).toBe(40);
  });

  it('uses the wall-reference direction on either side and measures the new target', () => {
    for (const x of [20, 80]) {
      const reference = { ...landed, id: 'reference', x1: x, x2: x };
      const subject = room({ walls: [host, landed, reference] });
      const current = landingOffsetFor(subject, landed, 'start', 'reference', 'far');
      const result = moveLandingDistance(subject, 'landed', 'start', {
        ref: 'reference', to: 'far', offset: current + 2,
      });
      const expectedX = x < 40 ? 42 : 38;
      expect(result.walls[1]).toMatchObject({
        x1: expectedX, y1: 0, x2: expectedX, y2: 60,
        landings: { start: { ref: 'reference', to: 'far', offset: current + 2 } },
      });
      expect(result.walls[0]).toEqual(host);
      expect(subject.walls[1]).toBe(landed);
      expect(landed.x1).toBe(40);
    }
  });

  it('moves only the shared endpoint of an angled neighbour', () => {
    const joined = {
      ...landed, connections: { start: null, end: { wallId: 'neighbour', endpoint: 'start' } },
    };
    const neighbour = wall({
      id: 'neighbour', x1: 40, y1: 60, x2: 80, y2: 100,
      connections: { start: { wallId: 'landed', endpoint: 'end' }, end: null },
    });
    const subject = room({ walls: [host, joined, neighbour] });
    const current = landingOffsetFor(subject, joined, 'start', 'left', 'near');
    const result = moveLandingDistance(subject, 'landed', 'start', {
      ref: 'left', to: 'near', offset: current + 10,
    });
    expect(result.ok).toBe(true);
    expect(result.walls[1]).toMatchObject({ x1: 50, y1: 0, x2: 50, y2: 60 });
    expect(result.walls[2]).toMatchObject({ x1: 50, y1: 60, x2: 80, y2: 100 });
  });

  it('propagates wall operation refusals without changing the input', () => {
    const joined = {
      ...landed, connections: { start: null, end: { wallId: 'neighbour', endpoint: 'start' } },
    };
    const neighbour = wall({
      id: 'neighbour', x1: 40, y1: 60, x2: 50, y2: 60,
      connections: { start: { wallId: 'landed', endpoint: 'end' }, end: null },
    });
    const subject = room({ walls: [host, joined, neighbour] });
    for (const [options, reason] of [
      [{ offset: 60 }, 'neighbor-too-short'],
      [{ offset: -200, move: 'host' }, 'invalid-length'],
    ]) {
      const result = moveLandingDistance(subject, 'landed', 'start', {
        ref: 'left', to: 'near', ...options,
      });
      expect(result).toEqual({ ok: false, reason, message: reason, walls: subject.walls });
      expect(result.walls).toBe(subject.walls);
      expect(joined.x1).toBe(40);
    }
  });
});
