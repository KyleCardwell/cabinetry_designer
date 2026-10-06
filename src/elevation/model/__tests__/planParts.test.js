import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { planParts } from '../planParts.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);
const WALL_KINDS = ['wall', 'void', 'opening', 'casing', 'recess', 'soffit', 'wall_end_panel'];
const wallThings = (room) => planParts(syncRoom(room, settings), settings)
  .filter(({ kind }) => WALL_KINDS.includes(kind));

describe('SPEC-44 the room in plan: walls and what is in them', () => {
  it('outlines each wall, cuts and cases the window, skips a wall with no thickness (G1)', () => {
    const window = '93ab97a1-ce31-4283-8240-ead92a6ae665';
    const island = '84063fed-ab0d-4a1d-ae05-ffe67decad5e';
    expect(wallThings(stored('G1 Euro kitchen'))).toEqual([
      { id: 'cb33d774-f31e-41c1-bbe4-198cbf981619:wall', kind: 'wall', points: [[-60, -84], [-60, 84], [-64.5, 88.5], [-64.5, -84]] },
      { id: `${window}:void`, kind: 'void', points: [[-60, -36], [-60, 12], [-64.5, 12], [-64.5, -36]] },
      { id: `${window}:detail`, kind: 'opening', points: [[-62.25, -36], [-62.25, 12]], closed: false },
      { id: `${window}:casing`, kind: 'casing', points: [[-60, -39], [-60, 15], [-59.25, 15], [-59.25, -39]] },
      { id: '4afd9749-bbe8-4848-8a67-a1d063bdfce8:wall', kind: 'wall', points: [[-60, 84], [60, 84], [64.5, 88.5], [-64.5, 88.5]] },
      { id: '8cf88b99-0a56-4ec4-96c2-ffdcaeef4051:wall', kind: 'wall', points: [[60, 84], [60, 57], [64.5, 57], [64.5, 88.5]] },
      { id: `${island}:endPanel:start`, kind: 'wall_end_panel', points: [[10.25, -16.75], [9.5, -16.75], [9.5, 21], [10.25, 21]] },
      { id: `${island}:endPanel:end`, kind: 'wall_end_panel', points: [[101, -16.75], [100.25, -16.75], [100.25, 21], [101, 21]] },
    ]);
  });

  it('fills a deep recess behind the wall and knocks its notch out; raised, its outline is dashed (G5)', () => {
    const recess = '61c07d7e-ec8b-4306-9825-9f3decfb5fa1';
    const mine = (parts) => parts.filter(({ id }) => id.startsWith(recess));
    const fill = { id: `${recess}:fill`, kind: 'wall', points: [[-82.5, 19.5], [-25.5, 19.5], [-25.5, 31.5], [-82.5, 31.5]] };
    expect(mine(wallThings(stored('G5 Recess room')))).toEqual([
      fill,
      { id: `${recess}:knockout`, kind: 'void', points: [[-78, 15], [-30, 15], [-30, 27], [-78, 27]] },
    ]);
    const raised = structuredClone(stored('G5 Recess room'));
    raised.walls[1].recesses[0].bottom = 12;
    const line = (index, points) => ({ id: `${recess}:line-${index}`, kind: 'recess', points, closed: false, dashed: true });
    expect(mine(wallThings(raised))).toEqual([
      fill,
      line(0, [[-78, 15], [-78, 27]]),
      line(1, [[-78, 27], [-30, 27]]),
      line(2, [[-30, 27], [-30, 15]]),
    ]);
  });

  it('dashes a soffit (G3)', () => {
    expect(wallThings(stored('G3 Bath alcove')).filter(({ kind }) => kind === 'soffit')).toEqual([{
      id: '5ac8edd3-2c75-476d-bc64-f80ade3f5fba', kind: 'soffit', points: [[-102, 9], [-30, 9], [-30, -5], [-102, -5]], dashed: true,
    }]);
  });
});
