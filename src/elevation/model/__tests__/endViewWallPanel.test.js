import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { cornerShapes } from '../cornerParts.js';
import { syncRoom } from '../room.js';

const load = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const stored = load('room9b');
const settings = { ...DEFAULT_SETTINGS, ...stored.settingsOverrides };
const synced = syncRoom(stored, settings);
const wall2 = synced.walls.find(({ name }) => name === 'Wall 2');
const parts = (returns) => cornerShapes(synced, wall2, 'front', settings, { returns })
  .flatMap((shape) => shape.parts);
const span = ({ x, width }) => [x, x + width];

describe('FX5.1 Room 9b end view of the Wall 4 peninsula from Wall 2', () => {
  it('draws the wall end panel once, across both faces, on the furniture base', () => {
    const panels = parts('end').filter(({ kind }) => kind === 'end_panel');
    expect(panels).toHaveLength(1);
    expect(span(panels[0])).toEqual([63.625, 89.3125]);
    expect(panels[0]).toMatchObject({ z: 4, height: 24.5 });
  });

  it('runs the furniture base back to the wall on both faces', () => {
    const bases = parts('end').filter(({ kind }) => kind === 'furniture_base').map(span);
    expect(bases).toEqual([[88.5, 90.125], [62.8125, 88.5]]);
  });

  it('leaves sections as they were (no wall end panel, base lip only)', () => {
    const section = parts('section');
    expect(section.some(({ kind }) => kind === 'end_panel')).toBe(false);
    expect(section.filter(({ kind }) => kind === 'furniture_base').map(({ width }) => width))
      .toEqual([0.8125, 0.8125]);
  });

  it('draws the wall end panel\'s stiles and rails from the room\'s panel style', () => {
    const [panel] = parts('end').filter(({ kind }) => kind === 'end_panel');
    expect(panel.doorDetail.openings.length).toBeGreaterThan(0);
    const [opening] = panel.doorDetail.openings;
    // 3" stiles and rails inside the 25 11/16 x 24 1/2 panel.
    expect(opening).toMatchObject({ x: 66.625, z: 7, height: 18.5 });
    expect(opening.width).toBeCloseTo(19.6875);
  });

  it('runs a profiled furniture base\'s lines across the end, to the profile', () => {
    const using = { ...settings, sectionProfiles: load('sectionProfiles').profiles };
    const room = structuredClone(stored);
    room.profile = { ...room.profile, furnitureBaseProfileId: 'fb4' };
    const synced4 = syncRoom(room, using);
    const wall = synced4.walls.find(({ name }) => name === 'Wall 2');
    const bases = cornerShapes(synced4, wall, 'front', using, { returns: 'end' })
      .flatMap((shape) => shape.parts).filter(({ kind }) => kind === 'furniture_base');
    expect(bases).toHaveLength(2);
    for (const base of bases) {
      expect(base.lines.length).toBeGreaterThan(0);
      for (const line of base.lines) {
        expect(line.z1).toBe(line.z2);
        expect(line.x1).toBeGreaterThanOrEqual(base.x - 1e-9);
        expect(line.x2).toBeLessThanOrEqual(base.x + base.width + 1e-9);
      }
    }
    // The front face's lines start at the wall plane (x 88.5 here) and stop on the profile, past the panel.
    const front = bases.find(({ x }) => x < 80);
    expect(Math.max(...front.lines.map(({ x2 }) => x2))).toBeCloseTo(88.5);
  });
});
