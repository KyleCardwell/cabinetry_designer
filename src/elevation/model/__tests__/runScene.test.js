import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
import { resolveWall, syncRoom } from '../room.js';
import { runScene } from '../runScene.js';
import { WALL_SIDES } from '../wallSides.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;

describe('SPEC-39.1 run scene', () => {
  it('derives every golden run as RunGroup did: same layout and faces, every drawn piece a rectangle', () => {
    for (const stored of document.rooms) {
      const room = syncRoom(stored, settings);
      for (const wall of room.walls) {
        for (const side of WALL_SIDES) {
          const view = resolveWall(room, wall, side);
          for (const run of view.runs) {
            const scene = runScene(room, view, run, settings);
            expect(scene.result).toEqual(layoutRun(room, view, run, settings));
            expect(scene.faceLayouts).toEqual(runFaceLayouts(room, view, run, settings));
            for (const piece of scene.drawnPieces) {
              expect([piece.x, piece.z, piece.width, piece.height].every(Number.isFinite)).toBe(true);
            }
          }
        }
      }
    }
  });
});
