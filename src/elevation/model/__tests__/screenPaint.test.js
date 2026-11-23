import { expect, it } from 'vitest';
import { drawingElevationFaces, toDrawingPayload } from '../drawingPayload.js';
import { syncRoom } from '../room.js';
import { paintEntries, screenFace } from '../screenPaint.js';
import { goldenRooms } from './helpers/goldenRooms.js';

const face = { id: 'F', kind: 'face', front: 24.875 };
const cabinet = { id: 'B', kind: 'cabinet', front: 30 };
const frame = { id: 'R', kind: 'frame', front: 24.75 };
const detail = { partId: 'F', openings: [{ x: 1, z: 1, width: 2, height: 3 }] };
const pull = { partId: 'F', x: 2, z: 3 };
const swing = { partId: 'F', lines: [] };
const attached = { doorDetails: [detail], pulls: [pull], swingMarks: [swing] };
const loop = { closed: true, points: [{ x: 0, z: 0 }, { x: 1, z: 1 }] };

it.each([
  ['sorts parts by ascending front depth', [{
    drawing: { parts: [face, { id: 'C', kind: 'cabinet', front: 24 },
      { id: 'T', kind: 'toe_kick', front: 21 }] },
    ids: ['T', 'C', 'F'],
  }]],
  ['keeps payload order at equal front depths', [
    { drawing: { parts: [frame, { ...face, front: 24.75 }] }, ids: ['R', 'F'] },
    { drawing: { parts: [{ ...face, front: 24.75 }, frame] }, ids: ['F', 'R'] },
  ]],
  ['attaches details to their part before the next part paints', [{
    drawing: { parts: [face, cabinet], ...attached }, ids: ['F', 'B'],
    attachments: { F: { doorDetail: detail, pulls: [pull], swingMarks: [swing] } },
  }]],
  ['drops faces and their details with doors off', [{
    drawing: { parts: [face, cabinet, frame], ...attached },
    options: { doorsOff: true }, ids: ['R', 'B'],
  }]],
  ['filters parts by run membership', [{
    drawing: { parts: [
      { id: 'A', kind: 'cabinet', front: 24, runId: 'r1' },
      { id: 'B', kind: 'cabinet', front: 24, runId: 'r2' },
      { id: 'K', kind: 'casing', front: 0 },
    ] },
    options: { runIds: new Set(['r1']) }, ids: ['A'],
  }]],
  ['attaches leg loops and ignores accessory shapes', [{
    drawing: {
      parts: [{ id: 'L', kind: 'leg', front: 24, opaque: false },
        { id: 'C', kind: 'cabinet', front: 24 }],
      shapes: [{ partId: 'L', kind: 'leg', loops: [loop] },
        { partId: 'C', kind: 'accessory' }],
    },
    ids: ['L', 'C'], attachments: { L: { legLoops: [loop] } },
  }]],
])('%s (GC6)', (_name, cases) => {
  for (const { drawing, options, ids, attachments = {} } of cases) {
    const entries = paintEntries(drawing, options);
    expect(entries.map(({ part }) => part.id)).toEqual(ids);
    expect(entries).toEqual(ids.map((id) => ({
      part: drawing.parts.find((part) => part.id === id),
      clip: null, front: drawing.parts.find((part) => part.id === id).front,
      doorDetail: null, pulls: [], swingMarks: [], legLoops: [], ...attachments[id],
    })));
  }
});

it.each([
  ['interleaves band strips with other parts at their depths', {
    parts: [
      { id: 'C', kind: 'crown', front: 17, strips: [
        { z1: 90, z2: 93, front: 14 }, { z1: 93, z2: 95, front: 17 },
      ] },
      { id: 'P', kind: 'projection', front: 15 },
    ],
    doorDetails: [{ ...detail, partId: 'C' }],
    pulls: [{ ...pull, partId: 'C' }],
    swingMarks: [{ ...swing, partId: 'C' }],
    shapes: [{ partId: 'C', kind: 'leg', loops: [loop] }],
  }, [
    { id: 'C', clip: { z1: 90, z2: 93 }, front: 14 },
    { id: 'P', clip: null, front: 15 },
    { id: 'C', clip: { z1: 93, z2: 95 }, front: 17 },
  ]],
  ['paints a part without strips in one unclipped entry', {
    parts: [{ id: 'B', kind: 'cabinet', front: 24 }],
  }, [{ id: 'B', clip: null, front: 24 }]],
])('%s (D7)', (_name, drawing, expected) => {
  const entries = paintEntries(drawing);
  expect(entries.map(({ part, clip, front }) => ({ id: part.id, clip, front }))).toEqual(expected);
  expect(entries.map(({ doorDetail, pulls, swingMarks, legLoops }) => ({
    doorDetail, pulls, swingMarks, legLoops,
  }))).toEqual(expected.map((_entry, index) => ({
    doorDetail: index === entries.length - 1 ? drawing.doorDetails?.[0] ?? null : null,
    pulls: index === entries.length - 1 ? drawing.pulls ?? [] : [],
    swingMarks: index === entries.length - 1 ? drawing.swingMarks ?? [] : [],
    legLoops: index === entries.length - 1 ? drawing.shapes?.[0].loops ?? [] : [],
  })));
});

it('matches the first separate golden face drawing parts before ownership tags (GC6)', () => {
  for (const { key, load } of goldenRooms()) {
    const { room: source, settings } = load();
    const room = syncRoom(source, settings);
    const { wall, side, key: faceKey } = [...drawingElevationFaces(room)].find(({ combined }) => !combined);
    const drawing = screenFace(room, wall, side, settings);
    const parts = drawing.parts.map(({ itemKey, ...part }) => part); // eslint-disable-line no-unused-vars
    const expected = toDrawingPayload(room, settings).elevations.find(({ key }) => key === faceKey);
    expect(parts, key).toEqual(expected.parts);
  }
});
