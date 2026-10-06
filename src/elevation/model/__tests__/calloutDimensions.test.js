import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { elevationDimensions } from '../elevationDimensions.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);
const room = (name) => syncRoom(stored(name), settings);
const SINK = '0f652c26-5f80-4387-8a1b-1f35ada26b59';
const of = (name) => (dimensions) => dimensions.filter(({ row }) => row === name);
const row = ({
  kind, start, end, base, startBase, endBase, at, text, textX, textZ,
}) => [
  kind, start, end, base, ...(startBase === undefined ? [] : [startBase, endBase]), at, text,
  ...(textX === undefined ? [] : [textX, textZ]),
];

/** G1 with the sink's pin changed (as drawn it's on the window's centre, 0" off). */
function pinned(pin) {
  const copy = structuredClone(stored('G1 Euro kitchen'));
  const track = copy.walls[0].runs.flatMap((run) => run.grid?.cols ?? []).find(({ id }) => id === `${SINK}:col`);
  track.pin = { ...track.pin, ...pin };
  return syncRoom(copy, settings);
}
const pins = (synced) => of('pins')(elevationDimensions(synced, synced.walls[0], 'front', settings)).map(row);

describe('SPEC-43.3 callouts in the DXF', () => {
  it('dimensions casing clearances to a run beside the opening, inside the wall at their own height', () => {
    const g1 = room('G1 Euro kitchen');
    expect(of('clearances')(elevationDimensions(g1, g1.walls[0], 'front', settings)).map(row)).toEqual([
      ['clearance', 30, 45, 64.5, 64.5, '15"'],
      ['clearance', 99, 108.5, 72, 72, '9 1/2"', 103.75, 78.375],
    ]);
    // G2's window is 2" from the wall end with no run there: the wall row already says so.
    const g2 = room('G2 Face frame kitchen');
    expect(of('clearances')(elevationDimensions(g2, g2.walls[0], 'front', settings)).map(row)).toEqual([
      ['clearance', 44, 50, 41.5, 41.5, '6"'],
    ]);
  });

  it('dimensions a pin from its datum to the point it holds, each end from its own point', () => {
    // From the window's middle (66") and the sink's top (34 1/2") to a line 6" over the sill.
    expect(pins(pinned({ value: 3 }))).toEqual([['pin', 72, 75, 48, 66, 34.5, 48, 'CL 3"', 73.5, 54.375]]);
    expect(pins(pinned({ value: -3 }))).toEqual([['pin', 69, 72, 48, 34.5, 66, 48, 'CL 3"', 70.5, 54.375]]);
    // From a wall end the datum has no point of its own, so that end has no extension line.
    expect(pins(pinned({ from: 'left', anchor: 'left', value: 60 })))
      .toEqual([['pin', 0, 60, 40, 40, 34.5, 40, '60"']]);
    expect(pins(pinned({ from: 'right', anchor: 'right', value: 60 })))
      .toEqual([['pin', 108, 168, 40, 34.5, 40, 40, '60"']]);
    // As drawn the sink is 0" off the window's centre: a centreline mark, not a dimension.
    expect(pins(room('G1 Euro kitchen'))).toEqual([]);
  });
});
