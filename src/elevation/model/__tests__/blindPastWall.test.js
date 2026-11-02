import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fixed, room, run, wall } from '../../../test/builders.js';
import { blindEntries } from '../blind.js';
import { DEFAULT_SETTINGS } from '../constants.js';
import { syncRoom } from '../room.js';

const S = { ...DEFAULT_SETTINGS, cornerFillerMinWidth: 2 };

describe('BT1 b blind box past the wall', () => {
  it.each([
    [1, 42, 73.5625, []],
    [2, 60, 91.5625, [{ code: 'blind-past-wall', side: 'right' }]],
  ])('anchor %i: checks Room 10 BT with blind width %s', (_anchor, blindWidth, farEdge, warnings) => {
    const source = JSON.parse(readFileSync(new URL('./fixtures/room10bt.json', import.meta.url), 'utf8'));
    for (const { node } of source.walls[1].runs[0].grid.cells[1].node.cells) {
      node.blind.right = blindWidth;
    }
    const synced = syncRoom(source, S);
    const currentWall = synced.walls[1];
    const result = blindEntries(synced, currentWall, currentWall.runs[0], S);
    expect(result.entries[0]).toMatchObject({ boxX: 31.5625, boxWidth: blindWidth, cornerX: 88 });
    expect(result.entries[0].boxX + result.entries[0].boxWidth).toBe(farEdge);
    expect(result.warnings).toEqual(warnings);
  });

  it('checks either wall end with 1e-6 tolerance, including boxes exactly at the end', () => {
    for (const side of ['left', 'right']) {
      for (const overhang of [-0.5, 0, 0.5e-6, 2e-6]) {
        const host = run({
          x: side === 'left' ? 10 : 90,
          width: 20,
          autoCount: false,
          items: [fixed('cab', 20)],
          blind: { [side]: 30 + overhang },
          ends: { left: { type: 'none' }, right: { type: 'none' }, [side]: { type: 'blind' } },
        });
        const currentWall = wall({ x2: 120, runs: [host] });
        const currentRoom = room({ walls: [currentWall] });
        const result = blindEntries(currentRoom, currentWall, host, S, {
          pieces: [{ id: 'cab', kind: 'cabinet', x: host.x, width: 20 }],
        });
        expect(result.warnings).toEqual(overhang > 1e-6 ? [{ code: 'blind-past-wall', side }] : []);
      }
    }
  });
});
