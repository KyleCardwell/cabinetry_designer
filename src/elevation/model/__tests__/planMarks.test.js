import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { planDimensions } from '../planDimensions.js';
import { planParts } from '../planParts.js';
import { planMarks } from '../planMarks.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
// Keep these layout anchors independent of run flex (RF3).
const settings = { ...document.settings, runFlex: 0 };
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);
const marks = (room, use = settings) => {
  const synced = syncRoom(room, use);
  return planMarks(synced, use, planDimensions(synced, use), planParts(synced, use)).marks;
};
const marker = (at, text, direction) => ({ kind: 'elevation', at, text, direction });

describe('SPEC-45.1 elevation markers and labels in plan', () => {
  it('puts each lettered face\'s marker past its runs and dimension rows (G1)', () => {
    expect(marks(stored('G1 Euro kitchen'))).toEqual([
      marker([-17.625, -25.53125], 'A', [-1, 0]),
      marker([6.4375, 42.625], 'B', [0, 1]),
      marker([74.75, 37.5], 'C', [0, -1]),
      marker([55.25, -45.25], 'D', [0, 1]),
      { kind: 'label', at: [-67.125, -12], text: 'W1 · 48"', rotation: 90 },
    ]);
  });

  it('labels doors and recesses just outside the wall and its bump-out (G2, G5)', () => {
    expect(marks(stored('G2 Face frame kitchen')).filter(({ kind }) => kind === 'label')).toEqual([
      { kind: 'label', at: [-63, 22.125], text: 'D1 · 36"', rotation: 0 },
    ]);
    expect(marks(stored('G5 Recess room')).filter(({ kind }) => kind === 'label')).toEqual([
      { kind: 'label', at: [-54, 34.125], text: 'R1 · 48" × 12"', rotation: 0 },
      { kind: 'label', at: [54, 46.125], text: 'R2 · 48" × 24"', rotation: 0 },
    ]);
  });

  it('sizes the symbol and the label gap for paper at the plot scale (G4 at 1/4" = 1\'-0")', () => {
    expect(marks(stored('G4 T-filler run'))).toEqual([marker([6.5, -18.8125], 'A', [0, 1])]);
    expect(marks(stored('G4 T-filler run'), { ...settings, plotScale: 48 }))
      .toEqual([marker([-32.5, -29.3125], 'A', [0, 1])]);
  });

  it('places a forced face marker clear of the surrounding plan (GC5.1)', () => {
    const room = structuredClone(stored('G1 Euro kitchen'));
    room.walls.find(({ id }) => id === '8cf88b99-0a56-4ec4-96c2-ffdcaeef4051').elevationForced = true;
    expect(marks(room).filter(({ kind }) => kind === 'elevation').map(({ text, at }) => [text, at])).toEqual([
      ['A', [-17.625, -25.53125]],
      ['B', [6.4375, 42.625]],
      // Its preferred point is blocked; the clear candidate is outward and sideways.
      ['C', [expect.closeTo(-11.4, 10), 19.5]],
      ['D', [74.75, 37.5]],
      ['E', [55.25, -45.25]],
    ]);
  });
});
