import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { drawingZipName, toDrawingPayload } from '../drawingPayload.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { bandParts } from '../bandParts.js';
import { elevationParts } from '../elevationParts.js';
import { wallParts } from '../wallParts.js';
import { cornerParts } from '../cornerParts.js';
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

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const room = (name) => syncRoom(document.rooms.find((candidate) => candidate.name === name), settings);

// Captured before HP5 step d: the existing golden snapshot covers derived rooms, not payloads.
const preHP5PayloadHashes = {
  'G1 Euro kitchen': 'c0f7b00ec500b12d3f2fc65b9e172e05f5feae57be9aefc988bdacb1f069c18d',
  'G2 Face frame kitchen': '920674664ebfe648f37f88ba30872e6b2028c25d6cfdb5ddb9896f359e4a01f6',
  'G3 Bath alcove': 'fd35d5a3467446c85bc9a9c57b83f893deac61402f1e62e0b35597e66a4ec702',
  'G4 T-filler run': 'de06c1a25cb6963ae9fdb05014adf6fb469622bf04513d26a36166188fece772',
  'G5 Recess room': '86f8714cb04ff4d889490283215216c8bb43d2fe73c4dd049c8fc837120a3304',
  'G6 Stacked runs': 'dc7196687196c99fadf089ece3b342612b011964e72b70b201b6d841df907a36',
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
      expect(createHash('sha256').update(JSON.stringify(payload)).digest('hex'))
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
      expect(Object.keys(elevation).filter((key) => key !== 'pulls').slice(-2))
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
    expect(payload.elevations.map((elevation) => elevation.dimensions.length)).toEqual([38, 30, 17, 17]);
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
    expect(plan.dimensions).toHaveLength(17);
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
