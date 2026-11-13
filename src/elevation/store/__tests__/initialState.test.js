import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createInitialElevationState } from '../elevationSlice.js';
import { normalizeElevationDocument } from '../persistence.js';

const document = normalizeElevationDocument(JSON.parse(readFileSync(
  new URL('../../model/__tests__/fixtures/golden.json', import.meta.url),
  'utf8',
)));

describe('SPEC-39.1 loading a saved document', () => {
  it('syncs every room, so runs in a recess load on their recess', () => {
    const state = createInitialElevationState(document);
    const room = state.rooms.find(({ name }) => name === 'G5 Recess room');
    const wall = room.walls.find(({ id }) => id === '9574ded4-3b8f-470a-afad-2ea36e0ef64c');
    expect(Object.fromEntries(wall.runs.map((run) => [run.id, run._plane?.recessId ?? null]))).toEqual({
      '98b55b5e-3f4c-4e37-8597-f8f7a46b3412': null,
      '1549b66c-9a22-4150-8aa2-ca7bdc54dd2c': '61c07d7e-ec8b-4306-9825-9f3decfb5fa1',
      'e9abb5dc-e72c-44c9-ac96-d3279b7752d9': '56ed5f83-a17f-4d5b-9bcf-b72501cecc4d',
    });
  });
});
