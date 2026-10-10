import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE } from '../doorStyles.js';
import { runDoorDetails } from '../doorDetails.js';
import { elevationDoorDetails } from '../elevationDoorDetails.js';
import { gridLeaves } from '../grid.js';
import { resolveWall, syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);

const P = { ...DEFAULT_DOOR_STYLE, id: 'ds-p', label: 'P' };
const C = { ...DEFAULT_DOOR_STYLE, id: 'ds-c', label: 'C', designId: 'slab-applied' };
const SL = { ...DEFAULT_DOOR_STYLE, id: 'ds-s', label: 'S', designId: 'slab' };

const G1_BASE = 'b822e8ac-1a44-47ca-acec-ecb93caf7b8a';
const CAB_24 = 'cfc9c904-3a11-43ee-a48d-88bef061b5ae';
const CAB_36 = '0f652c26-5f80-4387-8a1b-1f35ada26b59';
const CAB_C = '0624c9d5-b951-4191-95f2-1562a6b32343';
const CAB_D = 'e3bfb331-0a5d-4cf2-aaba-929c53ca8c54';
const G3_BASE = '02c88254-9a83-4002-9fda-912cd06a2a21';
const G3_DRAWERS = '2648a74b-7f13-44c5-af7d-d1b88ae0d75c';
const G3_UPPER = 'bcdd4e78-0d52-40d0-9f5d-2901e590e98a';
const G3_BACK = '5f4db696-00e1-4303-9881-23a4d8ae7a64';

const box = (x, z, width, height) => ({ x, z, width, height });
const runOf = (room, id) => room.walls.flatMap((wall) => wall.runs).find((run) => run.id === id);
const leafOf = (run, id) => gridLeaves(run.grid).find((node) => node.id === id);
const part = (result, key) => result.parts.find((entry) => entry.key === key);

/** A golden room with P, C (Slab AM) and S (slab) listed, after `edit`, synced; one run's door details. */
function details(name, runId, edit = () => {}) {
  const room = structuredClone(stored(name));
  room.doorStyles = [P, C, SL];
  edit(room);
  const synced = syncRoom(room, settings);
  const wall = synced.walls.find((candidate) => candidate.runs.some((run) => run.id === runId));
  const view = resolveWall(synced, wall, 'front');
  return runDoorDetails(synced, view, view.runs.find((run) => run.id === runId), settings);
}

describe('SPEC-46.2 door details for a run', () => {
  it('gives every face in G1\'s base run the team default 5-piece detail', () => {
    const result = details('G1 Euro kitchen', G1_BASE);
    expect(result.parts.map(({ key }) => key)).toEqual([
      `${CAB_24}:r`, `${CAB_36}:r:left`, `${CAB_36}:r:right`,
      `${CAB_C}:r:left`, `${CAB_C}:r:right`, `${CAB_D}:r:left`, `${CAB_D}:r:right`,
    ]);
    expect(part(result, `${CAB_24}:r`)).toEqual({
      key: `${CAB_24}:r`,
      kind: 'face',
      pieceId: CAB_24,
      path: 'r',
      styleId: 'default',
      label: 'Std',
      construction: 'five_piece',
      ...box(30.0625, 4.125, 23.875, 30.125),
      openings: [box(33.0625, 7.125, 17.875, 24.125)],
      lines: [], openingsShown: true,
    });
    expect(part(result, `${CAB_36}:r:right`).openings).toEqual([box(75.0625, 7.125, 11.875, 24.125)]);
    expect(result.warnings).toEqual([]);
  });

  it('labels each part with its style; Slab AM gets its molding rectangle, a slab face none', () => {
    const result = details('G1 Euro kitchen', G1_BASE, (r) => {
      r.doorStyleId = 'ds-c';
      leafOf(runOf(r, G1_BASE), CAB_36).face = { type: 'pair_door', size: null, styleId: 'ds-s' };
    });
    const cab24 = part(result, `${CAB_24}:r`);
    expect([cab24.styleId, cab24.label, cab24.construction, cab24.openings])
      .toEqual(['ds-c', 'C', 'slab_applied', [box(33.0625, 7.125, 17.875, 24.125)]]);
    expect(['left', 'right'].map((half) => {
      const leaf = part(result, `${CAB_36}:r:${half}`);
      return [leaf.label, leaf.construction, leaf.openings];
    })).toEqual([['S', 'slab', []], ['S', 'slab', []]]);
  });

  it('follows the short-face rule on G3\'s drawers, and warns when a shorter front above has a bigger panel', () => {
    const plain = details('G3 Bath alcove', G3_BASE);
    expect([0, 1, 2].map((index) => part(plain, `${G3_DRAWERS}:r.${index}`).openings)).toEqual([
      [box(4.5625, 30.25, 13.375, 2.125)],
      [box(4.5625, 19.25, 13.375, 6)],
      [box(4.5625, 7.125, 13.375, 6)],
    ]);
    expect(plain.warnings).toEqual([]);
    const tight = details('G3 Bath alcove', G3_BASE, (r) => {
      leafOf(runOf(r, G3_BASE), G3_DRAWERS).face.children[1].sizes = { rails: { top: 5, bottom: 5 } };
    });
    expect(part(tight, `${G3_DRAWERS}:r.1`).openings).toEqual([box(4.5625, 21.25, 13.375, 2)]);
    expect(tight.warnings).toEqual([
      { code: 'front-panel-over-taller', pieceId: G3_DRAWERS, path: 'r.0', below: 'r.1' },
    ]);
  });

  it('draws a back panel cell in the room\'s styles by default, and plain when it picks sheet slab (G3)', () => {
    expect(details('G3 Bath alcove', G3_UPPER).parts).toEqual([{
      key: `panel:${G3_BACK}`,
      kind: 'panelCell',
      pieceId: G3_BACK,
      path: null,
      styleId: 'default',
      label: 'Std',
      construction: 'five_piece',
      ...box(0.75, 36, 70.5, 41.25),
      openings: [box(3.75, 39, 64.5, 35.25)],
      lines: [], openingsShown: true,
    }]);
    const sheet = details('G3 Bath alcove', G3_UPPER, (r) => {
      leafOf(runOf(r, G3_UPPER), G3_BACK).styleId = 'sheet';
    });
    expect(sheet.parts.map(({ label, construction, openings }) => [label, construction, openings]))
      .toEqual([['Sheet', 'slab', []]]);
  });

  it('passes on the resolver\'s warnings, one per part, with the part\'s key', () => {
    const result = details('G1 Euro kitchen', G1_BASE, (r) => { r.doorStyleId = 'gone'; });
    expect(result.warnings.length).toBe(7);
    expect(result.warnings[0]).toEqual({
      code: 'door-style-missing', level: 'room', id: 'gone', pieceId: CAB_24, key: `${CAB_24}:r`,
    });
    expect(part(result, `${CAB_24}:r`).label).toBe('Std');
  });
});

describe('SPEC-50 profile lines and profile warnings for a run', () => {
  const line = (from, to) => ({ type: 'line', from, to });
  const ROUND = {
    id: 'sp-round', name: 'Round 1/4', kind: 'door_outside', version: 1, archived: false, drawnPoints: { elevation: ['a'] },
    geometry: {
      units: 'in',
      points: { a: [0.25, 0], b: [0, -0.25], c: [0, -0.8125] },
      loops: [{ id: 'L1', closed: false, segs: [{ type: 'arc', from: 'a', to: 'b', center: [0.25, -0.25], ccw: true }, line('b', 'c')] }],
    },
  };
  const STEP = {
    id: 'sp-step', name: 'Step', kind: 'door_inside', version: 1, archived: false, drawnPoints: { elevation: ['p'] },
    geometry: {
      units: 'in',
      points: { p: [-0.25, 0], q: [-0.25, -0.125], r: [0, -0.125] },
      loops: [{ id: 'L1', closed: false, segs: [line('p', 'q'), line('q', 'r')] }],
    },
  };
  const withProfiles = { ...settings, sectionProfiles: [ROUND, STEP] };

  /** G1's base run with every face in P, P's picks set to `picks`. */
  function profiled(picks) {
    const room = structuredClone(stored('G1 Euro kitchen'));
    room.doorStyles = [{ ...P, profiles: { ...P.profiles, ...picks } }];
    room.doorStyleId = 'ds-p';
    const synced = syncRoom(room, withProfiles);
    const wall = synced.walls.find((candidate) => candidate.runs.some((run) => run.id === G1_BASE));
    const view = resolveWall(synced, wall, 'front');
    return runDoorDetails(synced, view, view.runs.find((run) => run.id === G1_BASE), withProfiles);
  }

  it('gives each door its profile lines, and flags every part when a pick is missing', () => {
    const result = profiled({ outside: 'sp-round', inside: 'sp-step' });
    expect(part(result, `${CAB_24}:r`).lines)
      .toEqual([box(30.3125, 4.375, 23.375, 29.625), box(32.8125, 6.875, 18.375, 24.625)]);
    expect(part(result, `${CAB_36}:r:right`).lines)
      .toEqual([box(72.3125, 4.375, 17.375, 29.625), box(74.8125, 6.875, 12.375, 24.625)]);
    expect(result.warnings).toEqual([]);
    expect(result.parts.every(({ openingsShown }) => openingsShown)).toBe(true);
    const missing = profiled({ panel: 'gone' });
    expect(missing.parts.every(({ lines }) => lines.length === 0)).toBe(true);
    expect([missing.warnings.length, missing.warnings[0]]).toEqual([
      7, { code: 'door-profile-missing', slot: 'panel', pieceId: CAB_24, key: `${CAB_24}:r` },
    ]);
  });
});


describe('SPEC-50.1 core sizes throughout run details', () => {
  it('keeps overall part sizes, omits covered payload openings, and compares front stacks by their cores', () => {
    const line = (from, to) => ({ type: 'line', from, to });
    const bead = {
      id: 'sp-bead5', name: 'Flush bead 5/16', kind: 'door_outside', version: 1, archived: false,
      stretch: { y: -0.25 }, drawnPoints: { elevation: ['q', 'a'] },
      geometry: { units: 'in',
        points: { a: [-0.3125, 0], q: [-0.0625, 0], b: [0, 0], c: [0, -0.8125], d: [-0.3125, -0.8125] },
        loops: [{ id: 'L1', closed: true, segs: [line('a', 'q'), line('q', 'b'), line('b', 'c'), line('c', 'd'), line('d', 'a')] }],
      },
    };
    const applied = {
      id: 'sp-am', name: 'Applied 1', kind: 'applied_molding', version: 1, archived: false,
      drawnPoints: { elevation: ['v', 'u'] },
      geometry: { units: 'in',
        points: { u: [-0.25, 0], v: [0.75, 0], w: [0.75, 0.375], k: [-0.25, 0.375] },
        loops: [{ id: 'L1', closed: true, segs: [line('u', 'v'), line('v', 'w'), line('w', 'k'), line('k', 'u')] }],
      },
    };
    const withProfiles = { ...settings, sectionProfiles: [bead, applied] };
    const edge = { ...P, id: 'ds-edge', profiles: { ...P.profiles, outside: bead.id } };
    const room = structuredClone(stored('G1 Euro kitchen'));
    room.doorStyles = [{ ...edge, profiles: { ...edge.profiles, applied: applied.id } }];
    room.doorStyleId = edge.id;
    const synced = syncRoom(room, withProfiles);
    const wall = synced.walls.find((candidate) => candidate.runs.some((run) => run.id === G1_BASE));
    const view = resolveWall(synced, wall, 'front');
    const result = runDoorDetails(synced, view, runOf(synced, G1_BASE), withProfiles);
    const door = part(result, `${CAB_24}:r`);
    expect([door.x, door.z, door.width, door.height]).toEqual([30.0625, 4.125, 23.875, 30.125]);
    expect(door.openings).toEqual([box(33.375, 7.4375, 17.25, 23.5)]);
    expect(door.lines).toEqual([
      box(30.375, 4.4375, 23.25, 29.5), box(30.3125, 4.375, 23.375, 29.625),
      box(33.125, 7.1875, 17.75, 24), box(34.125, 8.1875, 15.75, 22),
    ]);
    expect(door.openingsShown).toBe(false);
    expect(result.warnings).toEqual([]);
    const payload = elevationDoorDetails(synced, wall, 'front', withProfiles);
    expect(payload.find(({ partId }) => partId === `${CAB_24}:r`))
      .toEqual({ partId: `${CAB_24}:r`, profileLines: door.lines });
    expect(payload.every((entry) => !Object.hasOwn(entry, 'openings'))).toBe(true);

    const stackRoom = structuredClone(stored('G3 Bath alcove'));
    stackRoom.doorStyles = [P, edge];
    const run = runOf(stackRoom, G3_BASE);
    const stackWall = stackRoom.walls.find((candidate) => candidate.runs.includes(run));
    const face = leafOf(run, G3_DRAWERS).face;
    face.children[0].styleId = P.id;
    face.children[1].styleId = edge.id;
    const scene = {
      faceLayouts: new Map([[G3_DRAWERS, { box: { width: 15 }, faces: [
        { type: 'drawer_front', path: 'r.0', ...box(0, 9, 15, 8.5) },
        { type: 'drawer_front', path: 'r.1', ...box(0, 0, 15, 9) },
      ] }]]), drawnPieces: [], blind: { entries: [] },
    };
    const stack = runDoorDetails(stackRoom, stackWall, run, withProfiles, scene);
    expect(stack.parts.map(({ openings }) => openings[0].height)).toEqual([2.5, 2.375]);
    expect(stack.warnings).toEqual([]);
  });
});
