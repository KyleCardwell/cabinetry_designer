import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { elevationDimensions } from '../elevationDimensions.js';
import { toDrawingPayload } from '../drawingPayload.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
// Keep these layout anchors independent of run flex (RF3).
const settings = { ...document.settings, runFlex: 0 };
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

/**
 * G1 with the sink's layout line attachment changed (as drawn it's centred on line L1 with the window,
 * 0" off). LL4: `line` puts the sink on a new line L2 of its own instead.
 */
function pinned({ offset = 0, at = 'center', line = null }) {
  const copy = structuredClone(stored('G1 Euro kitchen'));
  const track = copy.walls[0].runs.flatMap((run) => run.grid?.cols ?? []).find(({ id }) => id === `${SINK}:col`);
  if (line) copy.walls[0].lines.push({ id: 'L2', label: 'L2', ...line });
  track.attach = { lineId: line ? 'L2' : track.attach.lineId, at, offset };
  return syncRoom(copy, settings);
}
const pins = (synced) => of('pins')(elevationDimensions(synced, synced.walls[0], 'front', settings)).map(row);

describe('SPEC-43.3 callouts in the DXF', () => {
  it('dimensions casing clearances to a run beside the opening, inside the wall at their own height', () => {
    const g1 = room('G1 Euro kitchen');
    expect(of('clearances')(elevationDimensions(g1, g1.walls[0], 'front', settings)).map(row)).toEqual([
      ['clearance', 30, 45, 64.5, 64.5, '15'],
      ['clearance', 99, 108.5, 72, 72, '9 1/2', 103.75, 75.75],
    ]);
    // G2's window is 2" from the wall end with no run there: the wall row already says so.
    const g2 = room('G2 Face frame kitchen');
    expect(of('clearances')(elevationDimensions(g2, g2.walls[0], 'front', settings)).map(row)).toEqual([
      ['clearance', 44, 50, 41.5, 41.5, '6', 47, 45.25],
    ]);
  });

  it('dimensions a pin from its datum to the point it holds, each end from its own point', () => {
    // From the window's middle (66") and the sink's top (34 1/2") to a line 6" over the sill.
    expect(pins(pinned({ offset: 3 }))).toEqual([['pin', 72, 75, 48, 66, 34.5, 48, 'CL 3', 73.5, 51.75]]);
    expect(toDrawingPayload(pinned({ offset: 3 }), settings).elevations[0].dimensions
      .filter(({ row }) => row === 'pins').map(({ text }) => text)).toEqual(['CL 3']);
    expect(pins(pinned({ offset: -3 }))).toEqual([['pin', 69, 72, 48, 34.5, 66, 48, 'CL 3', 70.5, 51.75]]);
    // From a wall end the datum has no point of its own, so that end has no extension line.
    expect(pins(pinned({ line: { from: 'left', value: 60 }, at: 'left' })))
      .toEqual([['pin', 0, 60, 40, 40, 34.5, 40, '60']]);
    expect(pins(pinned({ line: { from: 'right', value: 60 }, at: 'right' })))
      .toEqual([['pin', 108, 168, 40, 34.5, 40, 40, '60']]);
    // As drawn the sink is 0" off the window's centre: a centreline mark, not a dimension.
    expect(pins(room('G1 Euro kitchen'))).toEqual([]);
  });
});
