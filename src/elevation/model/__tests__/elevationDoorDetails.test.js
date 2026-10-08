import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE } from '../doorStyles.js';
import { elevationDoorDetails } from '../elevationDoorDetails.js';
import { elevationParts } from '../elevationParts.js';
import { gridLeaves } from '../grid.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);

const C = { ...DEFAULT_DOOR_STYLE, id: 'ds-c', label: 'C', designId: 'slab-applied' };
const SL = { ...DEFAULT_DOOR_STYLE, id: 'ds-s', label: 'S', designId: 'slab' };

const TALL_CAB = '28072a7d-e691-40d1-a005-4d0ed1c9e825';
const BASE = 'b822e8ac-1a44-47ca-acec-ecb93caf7b8a';
const CAB_24 = 'cfc9c904-3a11-43ee-a48d-88bef061b5ae';
const CAB_36 = '0f652c26-5f80-4387-8a1b-1f35ada26b59';
const CAB_C = '0624c9d5-b951-4191-95f2-1562a6b32343';
const CAB_D = 'e3bfb331-0a5d-4cf2-aaba-929c53ca8c54';
const UP_1 = 'ae7626bb-d1e5-4396-8b5b-a8630bfed949';
const UP_2 = '2dc1a45e-c462-4c4a-99f3-65c8b6782a2a';
const G3_DRAWERS = '2648a74b-7f13-44c5-af7d-d1b88ae0d75c';
const G3_UPPER = 'bcdd4e78-0d52-40d0-9f5d-2901e590e98a';
const G3_BACK = '5f4db696-00e1-4303-9881-23a4d8ae7a64';

const box = (x, z, width, height) => ({ x, z, width, height });
const G1_A_IDS = [
  `${TALL_CAB}:rleft`, `${TALL_CAB}:rright`, `${CAB_24}:r`, `${CAB_36}:rleft`, `${CAB_36}:rright`,
  `${CAB_C}:rleft`, `${CAB_C}:rright`, `${CAB_D}:rleft`, `${CAB_D}:rright`, `${UP_1}:r`, `${UP_2}:r`,
];

/** A golden room with C (Slab AM) and S (slab) listed, `patch` on the room, after `edit`, synced. */
function room(name, patch = {}, edit = () => {}) {
  const copy = { ...structuredClone(stored(name)), ...patch, doorStyles: [C, SL] };
  edit(copy);
  return syncRoom(copy, settings);
}
const wallWith = (synced, runId) => synced.walls.find((wall) => wall.runs.some((run) => run.id === runId));
/** G1 elevation A: wall 1, front. */
const g1A = (synced, partIds) => elevationDoorDetails(synced, wallWith(synced, BASE), 'front', settings, partIds);

describe('SPEC-46.4 door details for one wall face', () => {
  it('gives every door its frame opening, keyed by its elevation part (G1 A)', () => {
    const synced = room('G1 Euro kitchen');
    const result = g1A(synced);
    expect(result.map(({ partId }) => partId)).toEqual(G1_A_IDS);
    expect(result.slice(0, 3)).toEqual([
      { partId: `${TALL_CAB}:rleft`, openings: [box(3.8125, 7.125, 8.125, 79.75)] },
      { partId: `${TALL_CAB}:rright`, openings: [box(18.0625, 7.125, 8.125, 79.75)] },
      { partId: `${CAB_24}:r`, openings: [box(33.0625, 7.125, 17.875, 24.125)] },
    ]);
    const ids = new Set(elevationParts(synced, wallWith(synced, BASE), 'front', settings).map(({ id }) => id));
    expect(result.every(({ partId }) => ids.has(partId))).toBe(true);
  });

  it('keys drawer fronts by their path and a back panel cell by its piece (G3)', () => {
    const synced = room('G3 Bath alcove');
    const result = elevationDoorDetails(synced, wallWith(synced, G3_UPPER), 'front', settings);
    expect(result).toHaveLength(9);
    expect(result[0]).toEqual({ partId: `${G3_DRAWERS}:r.0`, openings: [box(4.5625, 30.25, 13.375, 2.125)] });
    expect(result[8]).toEqual({ partId: G3_BACK, openings: [box(3.75, 39, 64.5, 35.25)] });
  });

  it('follows the room\'s Draw door details and Show style tags choices', () => {
    expect(g1A(room('G1 Euro kitchen', { doorDetails: false }))).toEqual([]);
    const tagged = g1A(room('G1 Euro kitchen', { doorStyleTags: true }));
    expect(tagged[2]).toEqual({ partId: `${CAB_24}:r`, openings: [box(33.0625, 7.125, 17.875, 24.125)], tag: 'Std' });
    const tagsOnly = g1A(room('G1 Euro kitchen', { doorDetails: false, doorStyleTags: true }));
    expect(tagsOnly.map(({ partId }) => partId)).toEqual(G1_A_IDS);
    expect(tagsOnly[2]).toEqual({ partId: `${CAB_24}:r`, tag: 'Std' });
  });

  it('sends Slab AM molding rectangles; a slab part only when tags are on', () => {
    const edit = (r) => {
      r.doorStyleId = 'ds-c';
      const base = r.walls.flatMap((wall) => wall.runs).find((run) => run.id === BASE);
      gridLeaves(base.grid).find((node) => node.id === CAB_36).face = { type: 'pair_door', size: null, styleId: 'ds-s' };
    };
    const result = g1A(room('G1 Euro kitchen', {}, edit));
    expect(result.map(({ partId }) => partId)).toEqual(G1_A_IDS.filter((id) => !id.startsWith(CAB_36)));
    expect(result.find(({ partId }) => partId === `${CAB_24}:r`))
      .toEqual({ partId: `${CAB_24}:r`, openings: [box(33.0625, 7.125, 17.875, 24.125)] });
    const tagged = g1A(room('G1 Euro kitchen', { doorStyleTags: true }, edit));
    expect(tagged.filter(({ partId }) => partId.startsWith(CAB_36))).toEqual([
      { partId: `${CAB_36}:rleft`, tag: 'S' },
      { partId: `${CAB_36}:rright`, tag: 'S' },
    ]);
    expect(tagged[0].tag).toBe('C');
  });

  it('leaves out parts the elevation doesn\'t draw', () => {
    const synced = room('G1 Euro kitchen');
    expect(g1A(synced, new Set([`${CAB_24}:r`, `${UP_2}:r`])).map(({ partId }) => partId))
      .toEqual([`${CAB_24}:r`, `${UP_2}:r`]);
    expect(g1A(synced, new Set())).toEqual([]);
  });
});
