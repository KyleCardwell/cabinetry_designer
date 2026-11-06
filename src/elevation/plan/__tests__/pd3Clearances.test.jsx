import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { planDimensions } from '../../model/planDimensions.js';
import { syncRoom } from '../../model/room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';
import usePlanSceneData from '../usePlanSceneData.js';

vi.mock('react', async (original) => ({ ...await original(), useMemo: (callback) => callback() }));

it('PD3: the canvas hook supplies the same shifted G1 clearance as the DXF', () => {
  const document = normalizeElevationDocument(JSON.parse(readFileSync(
    new URL('../../model/__tests__/fixtures/golden.json', import.meta.url), 'utf8',
  )));
  const { settings } = document;
  const room = syncRoom(document.rooms.find(({ name }) => name === 'G1 Euro kitchen'), settings);
  const { clearances } = usePlanSceneData({ room, walls: room.walls, sceneRoom: room, settings });
  const clearance = clearances.find(({ length }) => length === 44.5625);
  expect(clearance.from.y).toBe(1.875);
  expect(clearance.to.y).toBe(1.875);
  const record = planDimensions(room, settings).find(({ row, text }) => row === 'clearance' && text === '44 9/16');
  expect(record.start).toEqual([clearance.to.x, -clearance.to.y]);
  expect(record.end).toEqual([clearance.from.x, -clearance.from.y]);
  expect(usePlanSceneData({ room, walls: [], sceneRoom: null, settings }).clearances).toEqual([]);
});
