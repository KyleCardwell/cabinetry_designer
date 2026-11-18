import { describe, expect, it } from 'vitest';
import { fixed, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { partNumbers, wallBadgeGroups } from '../../model/partNumbers.js';
import { PART_BADGE_HEIGHT, placeScreenPartBadges } from '../partNumberLayout.js';

describe('screen part number placement', () => {
  it.each([
    { name: 'places coincident T-filler and wall end panel pills without overlap', ppi: 8 },
    { name: 're-places coincident pills without overlap at smaller zoom', ppi: 2 },
  ])('$name (GC5)', ({ ppi }) => {
    const face = wall({
      endPanels: { start: { width: 0.75 }, end: null },
      runs: [run({
        x: -17.625, width: 36, autoCount: false, tFiller: 'seams',
        ends: { left: { type: 'none' }, right: { type: 'none' } },
        anchors: { left: true, right: false },
        items: [fixed('a', 18), fixed('b', 18)],
      })],
    });
    const subject = room({ walls: [face] });
    const keys = ['tee:a|b', 'wall-1:endPanel:start'];
    const pieces = wallBadgeGroups(subject, face, DEFAULT_SETTINGS).flatMap(({ pieces }) => pieces);
    const [tee, panel] = keys.map((key) => pieces.find(({ id }) => id === key));
    expect(tee.x + tee.width / 2).toBe(panel.x + panel.width / 2);
    const numbered = partNumbers(subject, DEFAULT_SETTINGS);
    const numbers = { ...numbered, byKey: new Map(keys.map((key) => [key, numbered.byKey.get(key)])) };
    keys.forEach((key) => expect(numbers.byKey.get(key)).toBeTypeOf('number'));
    const placed = placeScreenPartBadges(subject, face, DEFAULT_SETTINGS, numbers, ppi);
    expect(placed.parts.map(({ key }) => key).sort()).toEqual([...keys].sort());
    const [a, b] = placed.parts;
    expect(Math.abs(a.x - b.x) >= (a.width + b.width) / 2 + 3 / ppi
      || Math.abs(a.z - b.z) >= (a.height + b.height) / 2 + 3 / ppi - 1e-7).toBe(true);
    placed.parts.forEach((badge) => expect(badge.height * ppi).toBe(PART_BADGE_HEIGHT));
    if (ppi < 8) {
      const original = placeScreenPartBadges(subject, face, DEFAULT_SETTINGS, numbers, 8);
      expect(placed.parts.map(({ x, z }) => ({ x, z })))
        .not.toEqual(original.parts.map(({ x, z }) => ({ x, z })));
    }
  });
});
