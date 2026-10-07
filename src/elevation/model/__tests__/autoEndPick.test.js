import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE } from '../doorStyles.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const P = { ...DEFAULT_DOOR_STYLE, id: 'ds-p', label: 'P' };
const G1_TALL = 'b38f2f11-5318-42f2-9d95-8b9b3d1b9087';
const runOf = (room) => room.walls.flatMap((wall) => wall.runs).find((run) => run.id === G1_TALL);

describe('SPEC-46.1.1 a joined end keeps its own style', () => {
  it('keeps styleId and sizes on an auto end through every sync (G1 tall, right end joined)', () => {
    const room = structuredClone(document.rooms.find((candidate) => candidate.name === 'G1 Euro kitchen'));
    room.doorStyles = [P];
    const stored = runOf(room).ends.right;
    runOf(room).ends.right = { ...stored, styleId: 'ds-p', sizes: { rails: { bottom: 42 } } };
    const once = syncRoom(room, settings);
    const twice = syncRoom(once, settings);
    for (const synced of [once, twice]) {
      const end = runOf(synced).ends.right;
      expect([end.type, end.auto, end.styleId, end.sizes, runOf(synced)._endThickness])
        .toEqual(['end_panel', true, 'ds-p', { rails: { bottom: 42 } }, { right: 0.8125 }]);
    }
  });
});
