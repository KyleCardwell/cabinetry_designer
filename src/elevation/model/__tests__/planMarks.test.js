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
  it('puts each lettered face\'s marker past its runs and dimension rows (GC5.2)', () => {
    expect(marks(stored('G1 Euro kitchen'))).toEqual([
      marker([expect.closeTo(-21.825, 10), -17.73125], 'A', [-1, 0]),
      marker([6.4375, 46.825], 'B', [0, 1]),
      marker([43.55, 33.3], 'C', [0, -1]),
      marker([55.25, -41.05], 'D', [0, 1]),
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

  it('sizes smaller markers for paper at both plot scales (GC5.2)', () => {
    expect(marks(stored('G4 T-filler run'))).toEqual([marker([6.5, expect.closeTo(-14.6125, 10)], 'A', [0, 1])]);
    expect(marks(stored('G4 T-filler run'), { ...settings, plotScale: 48 }))
      .toEqual([marker([6.5, -20.9125], 'A', [0, 1])]);
  });

  it('places a forced face marker clear of the surrounding plan (GC5.2)', () => {
    const room = structuredClone(stored('G1 Euro kitchen'));
    room.walls.find(({ id }) => id === '8cf88b99-0a56-4ec4-96c2-ffdcaeef4051').elevationForced = true;
    expect(marks(room).filter(({ kind }) => kind === 'elevation').map(({ text, at }) => [text, at])).toEqual([
      ['A', [expect.closeTo(-21.825, 10), -17.73125]],
      ['B', [6.4375, 46.825]],
      // Its preferred point is blocked; the clear candidate is outward and sideways.
      ['C', [47.7, 46.8]],
      ['D', [43.55, 33.3]],
      ['E', [55.25, -41.05]],
    ]);
  });
});
