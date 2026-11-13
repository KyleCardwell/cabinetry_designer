import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { combinedViewOf } from '../combinedElevations.js';
import { toDrawingPayload } from '../drawingPayload.js';
import { resolveCombinedFaces } from '../../components/CombinedFaces.jsx';
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from '../constants.js';
import { combinedCornerShapes } from '../cornerParts.js';
import { gridFromItems } from '../grid.js';
import { syncRoom } from '../room.js';

const { profiles } = JSON.parse(readFileSync(new URL('./fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const cr45 = structuredClone(profiles.find(({ id }) => id === 'cr45'));
for (const point of Object.values(cr45.geometry.points)) point[0] *= 1.5;
const settings = { ...DEFAULT_SETTINGS, runFlex: 0,
  defaultProfile: { ...DEFAULT_PROFILE, crownTop: 120, crownStackHeight: 6,
    topMoldProfileId: 'tm3', crownProfileId: 'cr45' },
  sectionProfiles: [profiles.find(({ id }) => id === 'tm3'), cr45] };

const makeWall = (id, extra) => ({ id, height: 120, thickness: 4.5, profile: {},
  openings: [], joints: [], runs: [], connections: { start: null, end: null }, ...extra });

vi.mock('react-konva', () => ({ Group: 'group', Layer: 'layer', Rect: 'rect', Text: 'text',
  Line: 'line', Shape: 'shape', Label: 'label', Tag: 'tag' }));

function setup() {
  const stored = { id: 'room', name: 'End views', profile: {}, wallOrder: ['W4', 'W3', 'W2'],
    combinedElevations: [{ id: 'g', on: true, faces: ['W4', 'W2'] }], walls: [
    makeWall('W2', { elevationForced: true, x1: 72.875, y1: -120, x2: 72.875, y2: 0,
      connections: { start: null, end: { wallId: 'W3', endpoint: 'start' } } }),
    makeWall('W3', { x1: 72.875, y1: 0, x2: 0, y2: 0,
      connections: { start: { wallId: 'W2', endpoint: 'end' }, end: { wallId: 'W4', endpoint: 'start' } },
      runs: [{ id: 'tall', cabinetTypeId: 3, heightMode: 'auto', x: 0, width: 97.75, depth: 24,
        overrides: {}, anchors: { left: true }, ends: { right: { type: 'end_panel', width: null } },
        autoCount: false, grid: gridFromItems('tall', [{ id: 'box', kind: 'cabinet', width: null }]) }] }),
    makeWall('W4', { x1: 0, y1: 0, x2: 0, y2: 60,
      connections: { start: { wallId: 'W3', endpoint: 'end' }, end: null },
      runs: [{ id: 'face-tall', cabinetTypeId: 3, heightMode: 'auto', x: 0, width: 36, depth: 24,
        overrides: {}, anchors: { left: true }, ends: {}, autoCount: false,
        grid: gridFromItems('face-tall', [{ id: 'face-box', kind: 'cabinet', width: null }]) }] }),
  ] };
  const room = syncRoom(stored, settings);
  room.wallOrder = ['W4', 'W3', 'W2'];
  // The tall's free end reaches 24 7/8 past Wall 4, level with its faces.
  room.walls[1].runs[0].width = 97.75;
  return { room, combined: combinedViewOf(room, 'W4') };
}

describe('combined jog walls (DM6)', () => {
  it('keeps the tall end-on from Wall 2 only, with face x 95 1/8…120 in both outputs', () => {
    const { room, combined } = setup();
    for (const returns of ['section', 'end']) {
      room.elevationOptions = { W4: { returns } };
      const corners = combinedCornerShapes(room, combined, settings);
      expect(corners.get('W4').filter(({ runId }) => runId === 'tall')).toEqual([]);
      const shape = corners.get('W2').find(({ runId }) => runId === 'tall');
      expect(shape.kind).toBe('return');
      expect(shape.parts.some(({ kind }) => kind === 'section')).toBe(false);
      expect(shape.parts.find(({ id }) => id.endsWith(':box')))
        .toMatchObject({ kind: 'profile', x: 96, width: 24, back: 0, front: 97.75 });
      expect(shape.parts.find(({ id }) => id.endsWith(':faces')))
        .toMatchObject({ kind: 'profile', x: 95.125, width: 0.875, back: 0, front: 97.75 });
      expect(shape.parts.find(({ kind }) => kind === 'end_panel'))
        .toMatchObject({ x: 95.125, width: 24.875 });
      const payload = toDrawingPayload(room, settings).elevations.find(({ faces }) => faces);
      const tall = payload.parts.filter(({ runId }) => runId === 'tall');
      expect(tall).toEqual(shape.parts.map((part) => {
        const payloadPart = { ...part };
        delete payloadPart.doorDetail;
        return payloadPart;
      }));
      const canvas = resolveCombinedFaces(room, combined, settings);
      for (const face of combined.faces) expect(canvas.get(face.key).shapes).toEqual(corners.get(face.key));
      // Keeping the return must not depend on which face is first in the input.
      const reversed = combinedCornerShapes(room, { ...combined, faces: [...combined.faces].reverse() }, settings);
      expect(reversed).toEqual(corners);
    }
  });

});
