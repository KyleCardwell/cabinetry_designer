import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE } from '../doorStyles.js';
import { runDoorDetails } from '../doorDetails.js';
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

  it('draws a back panel cell as sheet slab by default, and 5-piece when it picks a style (G3)', () => {
    expect(details('G3 Bath alcove', G3_UPPER).parts).toEqual([{
      key: `panel:${G3_BACK}`,
      kind: 'panelCell',
      pieceId: G3_BACK,
      path: null,
      styleId: 'sheet',
      label: 'Sheet',
      construction: 'slab',
      ...box(0.75, 36, 70.5, 41.25),
      openings: [],
    }]);
    const styled = details('G3 Bath alcove', G3_UPPER, (r) => {
      leafOf(runOf(r, G3_UPPER), G3_BACK).styleId = 'ds-p';
    });
    expect(styled.parts.map(({ label, construction, openings }) => [label, construction, openings]))
      .toEqual([['P', 'five_piece', [box(3.75, 39, 64.5, 35.25)]]]);
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
