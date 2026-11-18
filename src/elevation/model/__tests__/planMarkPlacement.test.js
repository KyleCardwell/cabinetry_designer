import { expect, it } from 'vitest';
import { boxesOverlap, lineHitsBox } from '../planBoxes.js';
import { placePlanMarks } from '../planMarkPlacement.js';

const scale = 24;
const gap = scale / 16;
const axes = [[1, 0], [0, 1]];
// Plain oriented footprints, in plan inches at scale 24.
const marker = {
  key: 'A', at: [0, 0], axes: [[-1, 0], [0, -1]],
  half: [8.4, 9], shift: [-2.4, 0],
  steps: [[0, 0], [0, -19.5], [0, 19.5], [18.3, 0]],
};
const text = {
  key: 'text', at: [0, 0], axes, half: [3, 1.125], shift: [0, 0], steps: [[0, 0]],
};
const footprint = (item, at) => ({
  center: at.map((value, i) => value + item.shift[i]), axes: item.axes,
  half: item.half.map((half) => half + gap / 2),
});
const cases = [
  {
    name: 'places opposing markers one side step apart',
    items: [marker, { ...marker, key: 'E', axes, shift: [2.4, 0],
      steps: [[0, 0], [0, 19.5], [0, -19.5], [-18.3, 0]] }],
    blockers: {}, expected: [[0, 0], [0, 19.5]], hits: [0, 0],
  },
  {
    name: 'clears a horizontal dimension line and its text at the first clear candidate',
    items: [marker], blockers: { lines: [[[-100, 0], [100, 0]]],
      boxes: [{ center: [0, 0], axes, half: [3, 1.125] }] },
    expected: [[0, -19.5]], hits: [0],
  },
  { name: 'leaves an isolated marker at rest', items: [marker], blockers: {}, expected: [[0, 0]], hits: [0] },
  {
    name: 'moves enclosed text just past its own line end',
    items: [{ ...text, steps: [0, 3.75, -3.75, 7.5, -7.5, 11.25, -11.25]
      .map((y) => [0, y]).concat([[34.5, 0]]),
    ignore: { lines: [[[0, 0], [30, 0]]] } }],
    blockers: { lines: [[[0, 0], [30, 0]]],
      polygons: [[[-20, -20], [20, -20], [20, 20], [-20, 20]]] },
    expected: [[34.5, 0]], hits: [0],
  },
  {
    name: 'slides a label along its text direction clear of dimension text',
    items: [{ ...text, key: 'label', half: [6.75, 1.125], steps: [[0, 0], [6, 0], [-6, 0], [12, 0]] }],
    blockers: { boxes: [{ center: [0, 0], axes, half: [3, 1.125] }] },
    expected: [[12, 0]], hits: [0],
  },
  {
    name: 'uses the first candidate with the fewest hits when all are blocked',
    items: [{ ...text, steps: [[0, 0], [30, 0], [60, 0]] }],
    blockers: { boxes: [0, 0, 30, 60].map((x) => ({ center: [x, 0], axes, half: [3, 1.125] })) },
    expected: [[30, 0]], hits: [1],
  },
];

it.each(cases)('$name (GC5.1)', ({ items, blockers, expected, hits }) => {
  const placed = placePlanMarks(items, blockers, { gap });
  expect(placed.map(({ at }) => at)).toEqual(expected);
  expect(placed.map(({ hits }) => hits)).toEqual(hits);
  const boxes = placed.map(({ at }, i) => footprint(items[i], at));
  for (let i = 0; i < boxes.length; i += 1) {
    for (const other of boxes.slice(0, i)) expect(boxesOverlap(boxes[i], other)).toBe(false);
    if (placed[i].hits) continue;
    for (const other of blockers.boxes ?? []) {
      expect(boxesOverlap(boxes[i], { ...other, half: other.half.map((h) => h + gap / 2) })).toBe(false);
    }
    for (const line of blockers.lines ?? []) {
      if (!items[i].ignore) expect(lineHitsBox(line, boxes[i])).toBe(false);
    }
  }
});
