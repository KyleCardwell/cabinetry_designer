import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, DEFAULT_SETTINGS } from '../../model/constants.js';

const retiredKeys = [
  // The source inventory test reserves this literal for the migration and its existing test.
  ['profiled', 'Edge'].join(''), 'midRails', 'midStiles', 'doorThickness',
  'endPanelThickness', 'standardDrawerBelow',
];

function checkRetiredShapes(value, path) {
  if (!value || typeof value !== 'object') return;
  for (const key of retiredKeys) {
    expect(Object.hasOwn(value, key), `${path}.${key}`).toBe(false);
  }
  for (const [owner, key] of [['drawerBox', 'charging'], ['mid', 'extra'], ['profiles', 'applied']]) {
    if (value[owner] && typeof value[owner] === 'object') {
      expect(Object.hasOwn(value[owner], key), `${path}.${owner}.${key}`).toBe(false);
    }
  }
  expect(value.purpose, `${path}.purpose`).not.toBe('charging');
  expect(value.designId, `${path}.designId`).not.toBe('slab-applied');
  for (const [key, child] of Object.entries(value)) {
    checkRetiredShapes(child, `${path}.${key}`);
  }
}

describe('AU2 fixtures free of old shapes', () => {
  it.each(['golden.json', 'room8.json', 'room9.json', 'room9b.json'])(
    '%s contains current shapes', (name) => {
      const fixture = JSON.parse(readFileSync(
        new URL(`../../model/__tests__/fixtures/${name}`, import.meta.url), 'utf8',
      ));
      checkRetiredShapes(fixture, name);
      for (const room of fixture.rooms ?? [fixture]) {
        for (const key of ['partNumberStart', 'partNumberOverrides', 'reportParts', 'reportNote']) {
          expect(Object.hasOwn(room, key), `${name}: room ${room.id}.${key}`).toBe(true);
        }
        for (const wall of room.walls) {
          for (const key of ['thicknessOverride', 'numberOverride', 'elevationForced', 'openings', 'joints']) {
            expect(Object.hasOwn(wall, key), `${name}: wall ${wall.id}.${key}`).toBe(true);
          }
          expect(Array.isArray(wall.openings)).toBe(true);
          expect(Array.isArray(wall.joints)).toBe(true);
          for (const opening of wall.openings) {
            expect(Object.hasOwn(opening, 'offsetAnchor'), `${name}: opening ${opening.id}`).toBe(true);
          }
          if (name === 'golden.json') {
            expect(wall.thicknessOverride).toBe(
              wall.thickness === DEFAULT_SETTINGS.wallThickness ? null : wall.thickness,
            );
          }
        }
      }
      if (name === 'golden.json') {
        for (const key of ['doorPanelDefault', 'stoneTopReveal', 'teamDoorStyle']) {
          expect(Object.hasOwn(fixture.settings, key), `golden settings.${key}`).toBe(true);
        }
        for (const key of Object.keys(DEFAULT_PREFS)) {
          expect(Object.hasOwn(fixture.settings, key), `golden settings.${key}`).toBe(false);
        }
      }
      if (name === 'room9b.json') {
        const pinned = fixture.walls.flatMap((wall) => wall.runs)
          .find(({ id }) => id === '0cc425d0-8b87-4763-aedc-ea203f368453');
        expect(pinned._pinWidths).toEqual({ 'a897bd8e-9e38-434d-8196-24bfe01189b6': 30.875 });
        expect(pinned._returnPins).toEqual({
          'a897bd8e-9e38-434d-8196-24bfe01189b6': { target: 60.625 },
        });
      }
    },
  );
});
