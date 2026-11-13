import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { elevationMarks } from '../elevationMarks.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);
const SINK = '0f652c26-5f80-4387-8a1b-1f35ada26b59';

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

describe('SPEC-43.3 centreline marks', () => {
  it('marks a cabinet centred on its datum with a centre line from the cabinet\'s bottom to the window\'s middle (G1 A)', () => {
    const g1 = syncRoom(stored('G1 Euro kitchen'), settings);
    expect(elevationMarks(g1, g1.walls[0], 'front', settings)).toEqual([
      { kind: 'centerline', x: 72, bottom: 4, top: 66, text: 'CL', textX: 72, textZ: 68.625 },
    ]);
    expect(elevationMarks(g1, g1.walls[0], 'front', { ...settings, plotScale: 48 })[0].textZ).toBe(71.25);
    expect(elevationMarks(g1, g1.walls[1], 'front', settings)).toEqual([]);
  });

  it('leaves a pin with a distance to the dimensions', () => {
    const g1 = pinned({ offset: 3 });
    expect(elevationMarks(g1, g1.walls[0], 'front', settings)).toEqual([]);
  });
});
