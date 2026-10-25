import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { drawingZipName, toDrawingPayload } from '../drawingPayload.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { bandParts } from '../bandParts.js';
import { elevationParts } from '../elevationParts.js';
import { wallParts } from '../wallParts.js';
import { combinedCornerShapes, cornerParts } from '../cornerParts.js';
import { combinedViewOf } from '../combinedElevations.js';
import { shiftPayloadRecord } from '../combinedPayload.js';
import { run } from '../../store/__tests__/helpers/sliceFixtures.js';
import { elevationDimensions } from '../elevationDimensions.js';
import { elevationMarks } from '../elevationMarks.js';
import { elevationDoorDetails } from '../elevationDoorDetails.js';
import { runPulls } from '../pullLayouts.js';
import { partNumbers, wallBadgeGroups, wallMoldingBadges } from '../partNumbers.js';
import { DEFAULT_DOOR_STYLE } from '../doorStyles.js';
import { gridLeaves } from '../grid.js';
import { planParts } from '../planParts.js';
import { planDimensions } from '../planDimensions.js';
import { planMarks } from '../planMarks.js';
import { resolveWall, syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';
import { newAccessory } from '../accessories.js';
import { glassMarks } from '../glassMarks.js';
import { openingGeometry } from '../openings.js';
import { runDoorDetails } from '../doorDetails.js';
import * as showThroughModule from '../showThrough.js';
import { roomWith } from './helpers/showThroughRoom.js';
import { notchedFrameRoom, notchedFrameSettings } from './fixtures/notchedFrame.js';
import { topSegmentRoom, topSegmentSettings } from './fixtures/topSegments.js';

describe('ST6 step b step dimension payload', () => {
  it('exports both internal dimensions from a box segment through the existing dimensions field', () => {
    const payload = toDrawingPayload(topSegmentRoom(), topSegmentSettings);
    expect(payload.elevations[0].dimensions.filter(({ row }) => row === 'steps')).toEqual([
      { row: 'steps', kind: 'step', orientation: 'vertical', start: 32.5, end: 34.5,
        base: 36, at: 36, text: '2', textX: 39.75, textZ: 33.5 },
      { row: 'steps', kind: 'step', orientation: 'vertical', start: 32.5, end: 34.5,
        base: 54, at: 54, text: '2', textX: 50.25, textZ: 33.5 },
    ]);
  });
});

describe('ST4 step c top segment payload', () => {
  it('exports the split main top and dropped segment without changing the golden fixture', () => {
    const payload = toDrawingPayload(topSegmentRoom(), topSegmentSettings);
    expect(payload.elevations[0].parts.filter(({ kind }) => kind === 'countertop'))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'r:countertop', x: -0.75, width: 30.75, z: 34.5, height: 1.5 }),
        expect.objectContaining({ id: 'r:countertop:2', x: 60, width: 30.75, z: 34.5, height: 1.5 }),
        expect.objectContaining({ id: 'r:top-s', x: 30, width: 30, z: 32.5, height: 3.5 }),
      ]));
    expect(payload.elevations[0].parts.filter(({ kind }) => kind === 'countertop')).toHaveLength(3);
  });
});

describe('ST2 step c notched frame payload', () => {
  it('anchor 1: exports the base anchor outline and keeps all three opening holes', () => {
    const payload = toDrawingPayload(notchedFrameRoom(), notchedFrameSettings);
    const frames = payload.elevations[0].parts.filter(({ kind }) => kind === 'frame');
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({ x: 0, z: 4, width: 90, height: 30.5 });
    expect(frames[0].outline).toEqual([
      [0, 4], [90, 4], [90, 34.5], [59, 34.5],
      [59, 32.5], [31, 32.5], [31, 34.5], [0, 34.5],
    ]);
    expect(frames[0].holes).toEqual([
      { x: 1.5, z: 5.5, width: 28, height: 27.5 },
      { x: 31, z: 5.5, width: 28, height: 25.5 },
      { x: 60.5, z: 5.5, width: 28, height: 27.5 },
    ]);
  });

  it('anchor 2: omits the outline key for an unstepped frame', () => {
    const payload = toDrawingPayload(notchedFrameRoom({}), notchedFrameSettings);
    const frame = payload.elevations[0].parts.find(({ kind }) => kind === 'frame');
    expect(frame).toBeDefined();
    expect(frame).not.toHaveProperty('outline');
    expect(frame.holes).toHaveLength(3);
  });
});

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
// Historical payload and pull comparisons keep their original layout with flex disabled.
const settings = { ...document.settings, runFlex: 0 };
const room = (name) => syncRoom(document.rooms.find((candidate) => candidate.name === name), settings);

function endPanelRoom() {
  const copy = structuredClone(document.rooms[0]);
  // A 120" host puts the same right return at x 95.125, with its opening at 98.125.
  copy.walls[0].y1 -= 48;
  copy.walls[1].runs[1].ends.right = { type: 'end_panel', width: null };
  copy.elevationOptions = { [copy.walls[0].id]: { returns: 'end' } };
  return syncRoom(copy, settings);
}

describe('DM8 step b end-view panel payload', () => {
  it('anchor 1: appends the opening at 98.125 and strips doorDetail from every payload part', () => {
    const synced = endPanelRoom();
    const payload = toDrawingPayload(synced, settings);
    const elevation = payload.elevations[0];
    const panel = elevation.parts.find(({ id }) => id.endsWith(':end_panel'));
    expect(panel).toMatchObject({ kind: 'end_panel', x: 95.125, z: 4, height: 30.5 });
    const faceDetails = elevationDoorDetails(synced, synced.walls[0], 'front', settings,
      new Set(elevation.parts.map(({ id }) => id)));
    expect(elevation.doorDetails).toEqual([...faceDetails, {
      partId: panel.id,
      openings: [{ x: 98.125, z: panel.z + 3, width: 18.875, height: panel.height - 6 }],
    }]);
    expect(payload.elevations.flatMap(({ parts }) => parts).every((part) => !('doorDetail' in part))).toBe(true);
  });

  it('anchor 2: omits end-view details when details are off, including with style tags on', () => {
    const synced = { ...endPanelRoom(), doorDetails: false, doorStyleTags: true };
    const payload = toDrawingPayload(synced, settings);
    for (const elevation of payload.elevations) {
      for (const part of elevation.parts) {
        expect(part).not.toHaveProperty('doorDetail');
        if (part.id.endsWith(':end_panel')) {
          expect(elevation.doorDetails.some(({ partId }) => partId === part.id)).toBe(false);
        }
      }
    }
  });

  it('carries combined jog end-view details through the cornerShapes option, shifted and deduplicated', () => {
    const { profiles } = JSON.parse(readFileSync(new URL('./fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
    const outside = { ...profiles.find(({ id }) => id === 'am1'), kind: 'door_outside' };
    const config = { ...settings, sectionProfiles: [outside], teamDoorStyle: {
      ...DEFAULT_DOOR_STYLE, profiles: { ...DEFAULT_DOOR_STYLE.profiles, outside: outside.id },
    } };
    const link = (wallId, endpoint) => ({ wallId, endpoint });
    const wall = (id, x1, y1, x2, y2, start, end, runs = []) => ({
      id, name: id, x1, y1, x2, y2, height: 96, thickness: 4.5, flipped: false,
      runs, openings: [], recesses: [], soffits: [], connections: { start, end },
    });
    const synced = syncRoom({ ...document.rooms[0], wallOrder: ['C', 'K', 'B', 'J', 'A'],
      combinedElevations: [{ id: 'group', on: true, faces: ['A', 'B', 'C'] }],
      walls: [
        wall('A', 0, 0, 100, 0, null, link('J', 'start'), [run({ id: 'a', x: 10, width: 30 })]),
        wall('J', 100, 0, 100, 48, link('A', 'end'), link('B', 'start'), [run({
          id: 'j', x: 0, width: 30, anchors: { left: true },
          ends: { left: { type: 'none' }, right: { type: 'end_panel', width: null } },
        })]),
        wall('B', 100, 48, 180, 48, link('J', 'end'), link('K', 'start'), [run({ id: 'b', x: 10, width: 30 })]),
        wall('K', 180, 48, 180, 0, link('B', 'end'), link('C', 'start')),
        wall('C', 180, 0, 260, 0, link('K', 'end'), null, [run({ id: 'c', x: 10, width: 30 })]),
      ],
    }, config);
    const combined = combinedViewOf(synced, 'C');
    const shapes = combinedCornerShapes(synced, combined, config);
    const seen = new Set();
    const expected = combined.faces.flatMap(({ key, dx }) => shapes.get(key).flatMap(({ parts }) =>
      parts.flatMap(({ id, doorDetail }) => {
        if (!doorDetail || seen.has(id)) return [];
        seen.add(id);
        return [shiftPayloadRecord({ partId: id,
          ...Object.fromEntries(Object.entries(doorDetail).filter(([, list]) => list.length)),
        }, dx)];
      })));
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.every(({ profileLines, miters }) => profileLines.length > 0 && miters.length > 0)).toBe(true);
    expect(combined.faces.find(({ key }) => key === 'B').dx).toBe(80);
    expect(expected.some(({ openings }) => openings.some(({ x }) => x > 80))).toBe(true);
    const elevation = toDrawingPayload(synced, config).elevations.find(({ faces }) => faces);
    expect(elevation.doorDetails.filter(({ partId }) => partId.endsWith(':end_panel'))).toEqual(expected);
    expect(elevation.parts.every((part) => !('doorDetail' in part))).toBe(true);
  });
});

// Captured before HP5 step d: the existing golden snapshot covers derived rooms, not payloads.
// DM1 updated G1/G2; DM3 updated elevation rows. DM4 gives all rooms explicit rectangle
// molding picks: same box heights/front projections, actual profile outlines and side extents.
// DM7 updates centred-text fitting and pop-out levels; G2 also had a stale hash before DM7.
// FX2 step a returns G5's countertop past its recess side: width 37 -> 37.75; other payload fields stay unchanged.
const preHP5PayloadHashes = {
  'G1 Euro kitchen': 'eb8fab873358080acfb429040ffc547a005e387c3d83daf9322e8751945c7ebd',
  'G2 Face frame kitchen': '6db3785fa9bca11c26a0f61d77a287d756a18b9cc7e687fb1c6b0c54c68b58d4',
  'G3 Bath alcove': '972df0b7e5cf218bf98a7725b79e676a933734d8b21507c980438310f46e2ef1',
  'G4 T-filler run': 'f32f42cd95835870de06a6de27c6889e6b428f3980f12b0290ae0b7eaacf5350',
  'G5 Recess room': '154268c5476095dd92645b353eeb17471df94f6c7f91b13abc00e50b918e92c4',
  'G6 Stacked runs': 'b6e24f564707fab1b30922602e819f26ab3cd600478dfd61e3d1dd4c70e47393',
};

/** The round-40 fields only, so the first test keeps checking just those. */
const withoutParts = (payload) => ({
  ...payload,
  plan: undefined,
  elevations: payload.elevations.map((elevation) => {
    const copy = { ...elevation };
    delete copy.parts;
    delete copy.dimensions;
    delete copy.marks;
    delete copy.doorDetails;
    delete copy.partNumbers;
    delete copy.pulls;
    delete copy.interiors;
    delete copy.glassMarks;
    return copy;
  }),
});

describe('SPEC-40 drawing payload', () => {
  it('HP5 step d anchor 1: disabling pulls preserves every pre-HP5 golden payload', () => {
    for (const { name } of document.rooms) {
      const synced = room(name);
      const payload = toDrawingPayload({ ...synced, showPulls: false }, settings);
      expect(payload.payloadVersion).toBe(1);
      for (const elevation of payload.elevations) {
        expect(elevation).not.toHaveProperty('pulls');
      }
      const legacy = structuredClone(payload);
      for (const elevation of legacy.elevations) delete elevation.glassMarks;
      expect(createHash('sha256').update(JSON.stringify(legacy)).digest('hex'))
        .toBe(preHP5PayloadHashes[name]);
      const enabled = toDrawingPayload(synced, settings);
      for (const elevation of enabled.elevations) delete elevation.pulls;
      expect(enabled).toEqual(payload);
    }
  });

  it('HP5 step d anchor 2: carries every drawn golden face pull and all its centres', () => {
    for (const { name } of document.rooms) {
      const synced = room(name);
      const { elevations } = toDrawingPayload(synced, settings);
      expect(elevations.length).toBeGreaterThan(0);
      for (const elevation of elevations) {
        const wall = synced.walls.find(({ id }) => id === elevation.wallId);
        const view = resolveWall(synced, wall, elevation.side);
        const faceIds = new Set(elevation.parts.filter(({ kind }) => kind === 'face').map(({ id }) => id));
        const placements = view.runs.flatMap((run) => runPulls(synced, view, run, settings).pulls)
          .filter(({ partId }) => faceIds.has(partId));
        if (faceIds.size) expect(elevation.pulls.length).toBeGreaterThan(0);
        else expect(elevation).not.toHaveProperty('pulls');
        expect((elevation.pulls ?? []).map(({ partId }) => partId))
          .toEqual(placements.map(({ partId }) => partId));
        for (const { partId, outlines } of elevation.pulls ?? []) {
          expect(faceIds.has(partId)).toBe(true);
          expect(outlines).toHaveLength(placements.find((entry) => entry.partId === partId).centers.length);
        }
      }
      expect(elevations.map(({ letter, pulls }) => ({ letter, ...(pulls ? { pulls } : {}) })))
        .toMatchSnapshot(`${name} elevation pulls`);
      // Pulls remain visible with outlines only, independently of swing marks.
      for (const swingMarks of [true, false]) {
        expect(toDrawingPayload({ ...synced, doorDetails: false, swingMarks }, settings)
          .elevations.map(({ pulls }) => pulls)).toEqual(elevations.map(({ pulls }) => pulls));
      }
    }
  });

  it('HP5 step d anchor 3: omits pulls when both door and drawer picks are none', () => {
    const noPulls = { ...settings, doorPullId: 'none', drawerPullId: 'none' };
    for (const { name } of document.rooms) {
      const { elevations } = toDrawingPayload(room(name), noPulls);
      expect(elevations.length).toBeGreaterThan(0);
      for (const elevation of elevations) expect(elevation).not.toHaveProperty('pulls');
    }
  });

  it('HP2 step d anchor 1: omits swing marks from every golden room by default', () => {
    for (const { name } of document.rooms) {
      const synced = room(name);
      expect(synced).not.toHaveProperty('swingMarks');
      const payload = toDrawingPayload(synced, settings);
      expect(payload.payloadVersion).toBe(1);
      expect(payload.elevations.length).toBeGreaterThan(0);
      for (const elevation of payload.elevations) {
        expect(elevation).not.toHaveProperty('swingMarks');
      }
      expect(toDrawingPayload({ ...synced, swingMarks: false }, settings)).toEqual(payload);
    }
  });

  it('HP2 step d anchor 2: carries two swing lines per drawn door on front and back elevations', () => {
    for (const doorDetails of [true, false]) {
      const synced = { ...room('G1 Euro kitchen'), swingMarks: true, doorDetails };
      const payload = toDrawingPayload(synced, settings);
      expect(payload.payloadVersion).toBe(1);
      expect(payload.elevations.map(({ side }) => side)).toEqual(['front', 'front', 'front', 'back']);
      for (const elevation of payload.elevations) {
        expect(elevation.swingMarks.length).toBeGreaterThan(0);
        const faceIds = new Set(elevation.parts.filter(({ kind }) => kind === 'face').map(({ id }) => id));
        for (const { partId, lines } of elevation.swingMarks) {
          expect(faceIds.has(partId)).toBe(true);
          expect(lines).toHaveLength(2);
          for (const line of lines) {
            expect(Object.keys(line).sort()).toEqual(['x1', 'x2', 'z1', 'z2']);
            expect(Object.values(line).every(Number.isFinite)).toBe(true);
          }
        }
      }
    }
  });

  it('HP2 step d anchor 3: omits swing marks when every front is a drawer front', () => {
    const copy = structuredClone(room('G1 Euro kitchen'));
    copy.swingMarks = true;
    for (const run of copy.walls.flatMap(({ runs }) => runs)) {
      for (const node of gridLeaves(run.grid)) {
        if (node.kind === 'cabinet') node.face = { type: 'drawer_front' };
      }
    }
    const { elevations } = toDrawingPayload(syncRoom(copy, settings), settings);
    expect(elevations.length).toBeGreaterThan(0);
    for (const elevation of elevations) {
      expect(elevation.parts.some(({ kind }) => kind === 'face')).toBe(true);
      expect(elevation).not.toHaveProperty('swingMarks');
    }
  });

  it('DB8b omits the revision key unless a non-empty string is supplied', () => {
    const synced = room('G1 Euro kitchen');
    const identity = { id: synced.id, name: synced.name };
    expect(toDrawingPayload(synced, settings).room).toEqual(identity);
    for (const revision of [null, undefined, '', 2]) {
      expect(toDrawingPayload(synced, settings, { revision }).room).toEqual(identity);
    }
  });

  it('DB8b carries revision text within the geometry limit of 80 characters', () => {
    const synced = room('G1 Euro kitchen');
    expect(toDrawingPayload(synced, settings, { revision: 'DRAFT' }).room)
      .toEqual({ id: synced.id, name: synced.name, revision: 'DRAFT' });
    const revision = 'R'.repeat(80);
    expect(toDrawingPayload(synced, settings, { revision }).room.revision).toBe(revision);
    expect(toDrawingPayload(synced, settings, { revision: `${revision}X` }).room.revision).toBe(revision);
  });

  it('SPEC-50.15 anchor 1: includes default Arch D paper immediately after plotScale', () => {
    const synced = room('G1 Euro kitchen');
    const payload = toDrawingPayload(synced, DEFAULT_SETTINGS);
    expect(payload.paperSize).toBe('archD');
    const keys = Object.keys(payload);
    expect(keys[keys.indexOf('plotScale') + 1]).toBe('paperSize');
    const { paperSize, ...legacySettings } = settings;
    void paperSize;
    expect(toDrawingPayload(synced, legacySettings).paperSize).toBe('archD');
    expect(toDrawingPayload(synced, { ...settings, paperSize: 'a4' }).paperSize).toBe('archD');
  });

  it('SPEC-50.14 omits inch marks from G1 dimensions and keeps them on plan labels', () => {
    const { elevations, plan } = toDrawingPayload(room('G1 Euro kitchen'), settings);
    expect(elevations.find(({ letter }) => letter === 'A').dimensions.length).toBeGreaterThan(0);
    expect(plan.dimensions.filter(({ row }) => row === 'depth')).toHaveLength(7);
    for (const { text } of [...elevations.flatMap(({ dimensions }) => dimensions), ...plan.dimensions]) {
      expect(text).not.toContain('"');
    }
    expect(plan.marks.filter(({ kind }) => kind === 'label').map(({ text }) => text))
      .toEqual(['W1 · 48"']);
  });

  it('SPEC-50.13 anchor 9: exports every canvas badge once, aligned with front and back parts (G1)', () => {
    const synced = room('G1 Euro kitchen');
    const using = { ...settings, showPartNumbers: false };
    const { byKey } = partNumbers(synced, using);
    const { elevations } = toDrawingPayload(synced, using);
    expect(elevations[0].letter).toBe('A');
    expect(elevations.some(({ side }) => side === 'back')).toBe(true);
    for (const elevation of elevations) {
      const wall = synced.walls.find(({ id }) => id === elevation.wallId);
      const view = resolveWall(synced, wall, elevation.side);
      const pieces = wallBadgeGroups(synced, view, using).flatMap(({ pieces }) => pieces)
        .filter(({ id }) => byKey.has(id));
      const moldings = wallMoldingBadges(synced, view, using, byKey);
      const expected = [
        ...pieces.map(({ id }) => [id, String(byKey.get(id))]),
        ...moldings.map(({ key, label, number }) => [key, `${label} ${number}`]),
      ];
      expect(expected.length).toBeGreaterThan(0);
      expect(elevation.partNumbers.map(({ key, text }) => [key, text])).toEqual(expected);
      expect(new Set(elevation.partNumbers.map(({ key }) => key)).size).toBe(expected.length);
      expect(Object.keys(elevation).filter((key) => !['pulls', 'interiors', 'glassMarks'].includes(key)).slice(-2))
        .toEqual(['doorDetails', 'partNumbers']);
      for (const { id } of pieces) {
        const badge = elevation.partNumbers.find(({ key }) => key === id);
        const part = elevation.parts.find((part) => part.id === id);
        expect(part, `part for badge ${id} on elevation ${elevation.letter}`).toBeDefined();
        expect(badge.x).toBeGreaterThanOrEqual(part.x);
        expect(badge.x).toBeLessThanOrEqual(part.x + part.width);
      }
    }
  });

  it('has one elevation per lettered wall face, in letter order', () => {
    const island = '84063fed-ab0d-4a1d-ae05-ffe67decad5e';
    expect(withoutParts(toDrawingPayload(room('G1 Euro kitchen'), settings))).toEqual({
      payloadVersion: 1,
      units: 'in',
      plotScale: 24,
      paperSize: 'archD',
      room: { id: '7ee9fabb-5daf-4fb2-96f9-b24b9e1e546f', name: 'G1 Euro kitchen' },
      elevations: [
        {
          key: 'cb33d774-f31e-41c1-bbe4-198cbf981619', letter: 'A', wallId: 'cb33d774-f31e-41c1-bbe4-198cbf981619',
          side: 'front', title: 'Elevation A', wallLabel: 'Wall 1', length: 168, height: 96,
        },
        {
          key: '4afd9749-bbe8-4848-8a67-a1d063bdfce8', letter: 'B', wallId: '4afd9749-bbe8-4848-8a67-a1d063bdfce8',
          side: 'front', title: 'Elevation B', wallLabel: 'Wall 2', length: 120, height: 96,
        },
        {
          key: island, letter: 'C', wallId: island,
          side: 'front', title: 'Elevation C', wallLabel: 'Wall 4', length: 91.5, height: 36,
        },
        {
          key: `${island}:back`, letter: 'D', wallId: island,
          side: 'back', title: 'Elevation D', wallLabel: 'Wall 4', length: 91.5, height: 36,
        },
      ],
    });
    expect(toDrawingPayload(room('G3 Bath alcove'), settings).elevations.map(
      ({ letter, wallLabel, length, height }) => [letter, wallLabel, length, height],
    )).toEqual([['A', 'Wall 2', 168, 96]]);
  });

  it('names the zip after the room', () => {
    expect(drawingZipName('G1 Euro kitchen')).toBe('g1-euro-kitchen.zip');
    expect(drawingZipName('Bath #2 / Main')).toBe('bath-2-main.zip');
    expect(drawingZipName('  ')).toBe('room.zip');
  });

  it('SPEC-42.2 carries each wall face\'s parts, its bands, the wall\'s own parts, then its neighbours', () => {
    const synced = room('G1 Euro kitchen');
    const payload = toDrawingPayload(synced, settings);
    expect(payload.elevations.map((elevation) => elevation.parts.length)).toEqual([40, 34, 13, 13]);
    for (const elevation of payload.elevations) {
      const wall = synced.walls.find((candidate) => candidate.id === elevation.wallId);
      expect(elevation.parts).toEqual([
        ...elevationParts(synced, wall, elevation.side, settings),
        ...bandParts(synced, wall, elevation.side, settings),
        ...wallParts(synced, wall, elevation.side, settings),
        ...cornerParts(synced, wall, elevation.side, settings),
      ]);
    }
  });

  it('SPEC-43 carries each wall face\'s dimensions', () => {
    const synced = room('G1 Euro kitchen');
    const payload = toDrawingPayload(synced, settings);
    // DM3: elevation A merges its runs and drops the openings row; the island loses its open gaps.
    expect(payload.elevations.map((elevation) => elevation.dimensions.length)).toEqual([33, 30, 15, 15]);
    for (const elevation of payload.elevations) {
      const wall = synced.walls.find((candidate) => candidate.id === elevation.wallId);
      expect(elevation.dimensions).toEqual(elevationDimensions(synced, wall, elevation.side, settings));
    }
  });

  it('SPEC-43.3 carries each wall face\'s centreline marks', () => {
    const synced = room('G1 Euro kitchen');
    const payload = toDrawingPayload(synced, settings);
    expect(payload.elevations.map((elevation) => elevation.marks.length)).toEqual([1, 0, 0, 0]);
    for (const elevation of payload.elevations) {
      const wall = synced.walls.find((candidate) => candidate.id === elevation.wallId);
      expect(elevation.marks).toEqual(elevationMarks(synced, wall, elevation.side, settings));
    }
  });

  it('SPEC-44 carries the room in plan', () => {
    const synced = room('G1 Euro kitchen');
    const { plan } = toDrawingPayload(synced, settings);
    expect(Object.keys(plan)).toEqual(['parts', 'dimensions', 'marks']);
    expect(plan.parts).toHaveLength(76);
    expect(plan.parts).toEqual(planParts(synced, settings));
  });

  it('SPEC-45 carries the plan dimensions', () => {
    const synced = room('G1 Euro kitchen');
    const { plan } = toDrawingPayload(synced, settings);
    expect(plan.dimensions).toHaveLength(18);
    expect(plan.dimensions).toEqual(planDimensions(synced, settings));
  });

  it('SPEC-45.1 carries the plan markers and labels', () => {
    const synced = room('G1 Euro kitchen');
    const { plan } = toDrawingPayload(synced, settings);
    expect(plan.marks).toHaveLength(5);
    expect(plan.marks).toEqual(planMarks(synced, settings));
  });

  it('SPEC-46.4 carries each wall face\'s door details', () => {
    const synced = room('G1 Euro kitchen');
    const payload = toDrawingPayload(synced, settings);
    expect(payload.elevations.map((elevation) => elevation.doorDetails.length)).toEqual([11, 12, 6, 6]);
    for (const elevation of payload.elevations) {
      const wall = synced.walls.find((candidate) => candidate.id === elevation.wallId);
      const ids = new Set(elevation.parts.map(({ id }) => id));
      expect(elevation.doorDetails).toEqual(elevationDoorDetails(synced, wall, elevation.side, settings, ids));
    }
  });

  it('SPEC-46.4 draws each face in plan at its own thickness; the filler front follows the thickest with its shop thickness (G1)', () => {
    const BASE = 'b822e8ac-1a44-47ca-acec-ecb93caf7b8a';
    const CAB_24 = 'cfc9c904-3a11-43ee-a48d-88bef061b5ae';
    const CAB_36 = '0f652c26-5f80-4387-8a1b-1f35ada26b59';
    const copy = structuredClone(document.rooms.find((candidate) => candidate.name === 'G1 Euro kitchen'));
    copy.doorStyles = [{ ...DEFAULT_DOOR_STYLE, id: 'ds-thick', label: 'A', thickness: 1 }];
    const base = copy.walls.flatMap((wall) => wall.runs).find((run) => run.id === BASE);
    gridLeaves(base.grid).find((node) => node.id === CAB_24).doorStyleId = 'ds-thick';
    const { parts } = toDrawingPayload(syncRoom(copy, settings), settings).plan;
    const points = (id) => parts.find((part) => part.id === id).points;
    expect(points(`${CAB_24}:r`))
      .toEqual([[-35.9375, -53.9375], [-35.9375, -30.0625], [-34.9375, -30.0625], [-34.9375, -53.9375]]);
    expect(points(`${CAB_36}:rleft`))
      .toEqual([[-35.9375, -29.9375], [-35.9375, -12.0625], [-35.125, -12.0625], [-35.125, -29.9375]]);
    expect(points(`${BASE}:right`))
      .toEqual([[-35.75, 57], [-35.75, 59.125], [-34.9375, 59.125], [-34.9375, 57]]);
  });
});

const in14Room = (type = 'open', extra = {}) => roomWith([
  { id: 'a', face: { type, size: null, ...extra } },
]);
const in14Elevation = (room, effective = DEFAULT_SETTINGS) => toDrawingPayload(room, effective).elevations[0];
const shelfLines = [
  { x1: 24.8125, z1: 18.875, x2: 47.1875, z2: 18.875 },
  { x1: 47.1875, z1: 18.875, x2: 47.1875, z2: 19.625 },
  { x1: 47.1875, z1: 19.625, x2: 24.8125, z2: 19.625 },
  { x1: 24.8125, z1: 19.625, x2: 24.8125, z2: 18.875 },
];

afterEach(() => vi.restoreAllMocks());

describe('IN14 step e payload', () => {
  it('anchor 1: adds only window glass marks to the golden rooms and preserves legacy hashes', () => {
    const records = [];
    for (const { name } of document.rooms) {
      const synced = room(name);
      const payload = toDrawingPayload({ ...synced, showPulls: false }, settings);
      expect(payload.payloadVersion).toBe(1);
      for (const elevation of payload.elevations) {
        expect(elevation).not.toHaveProperty('interiors');
        const wall = synced.walls.find(({ id }) => id === elevation.wallId);
        const view = resolveWall(synced, wall, elevation.side);
        const expected = view.openings.filter(({ kind }) => kind === 'window').map((opening) => ({
          partId: opening.id, lines: glassMarks(openingGeometry(opening, view.length, settings).jamb),
        }));
        expect(elevation.glassMarks ?? []).toEqual(expected);
        records.push(...expected);
        delete elevation.glassMarks;
      }
      expect(createHash('sha256').update(JSON.stringify(payload)).digest('hex'))
        .toBe(preHP5PayloadHashes[name]);
    }
    expect(records).toHaveLength(1);
    expect(records[0].lines).toHaveLength(6); // GM1: the golden window is over 24 x 24
  });

  it('anchor 2: exports four box edges and four whole shelf sides for the open cabinet', () => {
    const room = in14Room();
    const before = structuredClone(room);
    const elevation = in14Elevation(room);
    expect(elevation.interiors).toEqual([{ partId: 'a', lines: [
      { x1: 24.75, z1: 4, x2: 24.75, z2: 34.5 },
      { x1: 47.25, z1: 4, x2: 47.25, z2: 34.5 },
      { x1: 24.75, z1: 4.75, x2: 47.25, z2: 4.75 },
      { x1: 24.75, z1: 33.75, x2: 47.25, z2: 33.75 },
      ...shelfLines,
    ], labels: [] }]);
    expect(elevation).not.toHaveProperty('glassMarks');
    expect(room).toEqual(before);
  });

  it('anchor 3: turns framed glass openings into holes and keeps just the shelf and three marks', () => {
    for (const doorDetails of [true, false]) {
      const room = { ...in14Room('door', { panelMaterial: 'glass' }), doorDetails, doorStyleTags: true };
      const elevation = in14Elevation(room);
      const details = runDoorDetails(room, room.walls[0], room.walls[0].runs[0], DEFAULT_SETTINGS)
        .parts.find(({ key }) => key === 'a:r');
      expect(elevation.parts.find(({ id }) => id === 'a:r').holes).toEqual(details.openings);
      expect(elevation.doorDetails.find(({ partId }) => partId === 'a:r')).not.toHaveProperty('openings');
      expect(elevation.doorDetails.find(({ partId }) => partId === 'a:r').tag).toEqual(details.label);
      expect(elevation.interiors).toEqual([{ partId: 'a', lines: shelfLines, labels: [] }]);
      expect(elevation.glassMarks).toEqual([{ partId: 'a:r', lines: details.openings.flatMap(glassMarks) }]);
      expect(elevation.glassMarks[0].lines).toHaveLength(3);
      if (doorDetails) {
        const record = elevation.doorDetails.find(({ partId }) => partId === 'a:r');
        expect(record.profileLines ?? []).toEqual(details.lines);
        expect(record.miters ?? []).toEqual(details.miters);
      }
    }
  });

  it('anchor 4: labels the placed rod rectangle and omits unplaced and line-only accessory labels', () => {
    const rod = { ...newAccessory([], 'FR'), name: 'Fixed rod',
      size: { width: 'section', height: 1.25, depth: 1.25 }, lengthDeduction: 0.25,
      effects: [{ kind: 'line_bore_row' }] };
    const hook = { ...newAccessory([], 'HK'), name: 'Robe hook', size: { width: 3, height: 2, depth: 3 } };
    const line = { ...newAccessory([], 'LN'), name: 'Line only' };
    const room = in14Room();
    gridLeaves(room.walls[0].runs[0].grid)[0].interior = { accessories: [
      { accessoryId: 'FR', fromBottom: 20 }, { accessoryId: 'HK' },
      { accessoryId: 'LN', fromBottom: 10, qty: 2 },
    ] };
    const elevation = in14Elevation(room, { ...DEFAULT_SETTINGS, accessories: [rod, hook, line] });
    expect(elevation.interiors[0].labels).toEqual([
      { text: 'Fixed rod', x: 24.75, z: 24.125, width: 22.5, height: 1.25 },
    ]);
    expect(elevation.interiors[0].lines).toContainEqual({ x1: 24.75, z1: 14.75, x2: 47.25, z2: 14.75 });
  });

  it('anchor 6: omits the optional collections and face holes for closed opaque doors', () => {
    const elevation = in14Elevation(in14Room('door'));
    expect(elevation).not.toHaveProperty('interiors');
    expect(elevation).not.toHaveProperty('glassMarks');
    const faces = elevation.parts.filter(({ kind }) => kind === 'face');
    expect(faces).toHaveLength(1);
    expect(faces[0]).not.toHaveProperty('holes');
    expect(elevation.doorDetails.find(({ partId }) => partId === faces[0].id).openings).toHaveLength(1);
  });

  it('exports holes and marks for each pair half, but none for slab or short-face glass', () => {
    const room = { ...in14Room('pair_door', { panelMaterial: 'glass' }), doorStyleTags: true };
    const elevation = in14Elevation(room);
    expect(elevation.glassMarks.map(({ partId }) => partId)).toEqual(['a:rleft', 'a:rright']);
    for (const { partId, lines } of elevation.glassMarks) {
      const part = elevation.parts.find(({ id }) => id === partId);
      expect(part.holes).toHaveLength(1);
      expect(lines).toEqual(part.holes.flatMap(glassMarks));
      expect(elevation.doorDetails.find((detail) => detail.partId === partId)).not.toHaveProperty('openings');
    }
    for (const teamDoorStyle of [
      { ...DEFAULT_DOOR_STYLE, designId: 'slab' },
      { ...DEFAULT_DOOR_STYLE, shortFace: { ...DEFAULT_DOOR_STYLE.shortFace, slabBelow: 40 } },
    ]) {
      const slab = in14Elevation(room, { ...DEFAULT_SETTINGS, teamDoorStyle });
      expect(slab).not.toHaveProperty('interiors');
      expect(slab).not.toHaveProperty('glassMarks');
      for (const part of slab.parts) expect(part).not.toHaveProperty('holes');
    }
  });

  it('deduplicates segments, filters missing part ids and drops records with no lines', () => {
    const rect = { kind: 'shelf', x: 1, z: 2, width: 3, height: 4 };
    const entry = { itemId: 'a', glass: [{ partId: 'missing', openings: [rect], marks: shelfLines }],
      items: [rect, { ...rect }, { kind: 'edge', x: 1, z: 2, width: 0, height: 4 }] };
    const show = vi.spyOn(showThroughModule, 'wallShowThrough').mockReturnValue(new Map([
      ['a', entry], ['missing', { ...entry, itemId: 'missing' }],
    ]));
    const elevation = in14Elevation(in14Room());
    expect(elevation.interiors).toHaveLength(1);
    expect(elevation.interiors[0].lines).toHaveLength(4);
    expect(elevation.interiors[0].labels).toEqual([]);
    expect(elevation).not.toHaveProperty('glassMarks');
    show.mockReturnValue(new Map([['a', { ...entry, glass: [], items: [] }]]));
    expect(in14Elevation(in14Room())).not.toHaveProperty('interiors');
    const glass = { partId: 'a:r', openings: [rect], marks: [] };
    show.mockReturnValue(new Map([['a', { ...entry, glass: [glass], items: [] }]]));
    const emptyMarks = in14Elevation(in14Room('door'));
    expect(emptyMarks).not.toHaveProperty('glassMarks');
    expect(emptyMarks.parts.find(({ id }) => id === 'a:r').holes).toEqual([rect]);
  });
});
