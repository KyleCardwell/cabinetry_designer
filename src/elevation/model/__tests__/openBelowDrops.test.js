import { describe, expect, it } from 'vitest';
import { auto, room, run, wall } from '../../../test/builders.js';
import { shippingList } from '../../../reports/shippingList.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { elevationParts } from '../elevationParts.js';
import { resolveWall } from '../room.js';
import { runScene } from '../runScene.js';
import { openBelowDrops, teeFillers } from '../tees.js';

function fixture({ both = false, tFiller, height = 'cabinets', endType = 'filler',
  manual, leftManual, styleId = 13, gap = 0, seamGap = 0 } = {}) {
  const column = (id, reveal) => ({ ...auto(id), grid: {
    id, cols: [{ id: `${id}:c`, size: null, sizeMode: 'auto' }],
    rows: [
      { id: `${id}:top`, size: null, sizeMode: 'auto', gap },
      { id: `${id}:bottom`, size: 40, sizeMode: 'manual' },
    ],
    cells: [
      { col: 0, row: 0, colSpan: 1, rowSpan: 1, node: {
        ...auto(`${id}-cabinet`), face: { type: 'door', size: null },
        ...(reveal === undefined ? {} : { reveals: { bottom: reveal } }),
      } },
      { col: 0, row: 1, colSpan: 1, rowSpan: 1, node: { ...auto(`${id}-void`), kind: 'void' } },
    ],
  } });
  const cabinetRun = run({
    cabinetTypeId: CABINET_TYPE_IDS.TALL, z: 4, height: 86, depth: 24,
    tFiller, seamGap, autoCount: false,
    ends: { left: { type: endType, height, width: 3 }, right: { type: endType, height, width: 3 } },
    items: [both ? column('left', leftManual) : auto('left'), column('right', manual)],
  });
  const cabinetWall = wall({ runs: [cabinetRun] });
  const cabinetRoom = room({ walls: [cabinetWall], style: { cabinetStyleId: styleId } });
  const view = resolveWall(cabinetRoom, cabinetWall);
  const scene = runScene(cabinetRoom, view, cabinetRun, DEFAULT_SETTINGS);
  return { scene, cabinetRoom, cabinetRun, view };
}

describe('FX11 b fillers and Ts over an open cell', () => {
  it('anchor 1: drops the matched right filler and its shipping return by 1/8 inch', () => {
    const { scene, cabinetRoom } = fixture();
    expect(scene.drawnPieces.find(({ role }) => role === 'end-right')).toMatchObject({ z: 43.875, height: 46.125 });
    const filler = shippingList(cabinetRoom, DEFAULT_SETTINGS).rows.find(({ key }) => key === 'run-1:right');
    expect(filler.notes).toContain('return up 1/8"');
    expect(filler.size).toContain('46 1/8');
    expect(elevationParts(cabinetRoom, cabinetRoom.walls[0], 'front', DEFAULT_SETTINGS)
      .find(({ id }) => id === 'run-1:right')).toMatchObject({ z: 43.875, height: 46.125 });
  });

  it('anchor 2: leaves a full-height right filler at z 4', () => {
    for (const tFiller of [undefined, 'all']) {
      const { scene, cabinetRoom } = fixture({ height: 'full', tFiller });
      expect(scene.drawnPieces.find(({ role }) => role === 'end-right')).toMatchObject({ z: 4, height: 86 });
      expect(shippingList(cabinetRoom, DEFAULT_SETTINGS).rows.find(({ key }) => key === 'run-1:right').notes)
        .not.toContain('return up 1/8"');
      if (tFiller) expect(scene.tees.find(({ end }) => end === 'right')).toMatchObject({ z: 4, height: 86, drop: 0 });
    }
  });

  it('anchor 3: drops the right end T while the full-height seam stays unchanged', () => {
    const { scene } = fixture({ tFiller: 'all' });
    expect(scene.tees.find(({ end }) => end === 'right')).toMatchObject({ z: 43.875, height: 46.125 });
    expect(scene.tees.find(({ end }) => !end)).toMatchObject({ z: 4, height: 86, drop: 0 });
  });

  it('anchor 4: drops the seam and both ends when both columns are open below', () => {
    const { scene, cabinetRoom, cabinetRun } = fixture({ both: true, tFiller: 'all' });
    expect(scene.tees).toHaveLength(3);
    for (const tee of scene.tees) {
      expect(tee).toMatchObject({ z: 43.875, height: 46.125, drop: 0.125 });
    }
    const direct = teeFillers(cabinetRoom, cabinetRun, scene.cells, DEFAULT_SETTINGS);
    expect(direct.tees).toEqual(scene.tees);
    for (const notes of direct.notes.values()) expect(notes).toContain('return up 1/8"');
  });

  it('anchor 5: leaves the full-height left cabinet end filler unchanged', () => {
    const { scene } = fixture();
    expect(scene.drawnPieces.find(({ role }) => role === 'end-left')).toMatchObject({ z: 4, height: 86 });
  });

  it('keeps one continuous seam past an open cell with another cabinet below it', () => {
    const { cabinetRoom, cabinetRun, view } = fixture({ tFiller: 'all' });
    const grid = cabinetRun.grid.cells[1].node;
    grid.rows.push({ id: 'right:lower', size: 20, sizeMode: 'manual' });
    grid.cells.push({ col: 0, row: 2, colSpan: 1, rowSpan: 1, node: auto('lower-cabinet') });
    const scene = runScene(cabinetRoom, view, cabinetRun, DEFAULT_SETTINGS);
    const seams = scene.tees.filter(({ end, orientation }) => !end && orientation === 'vertical');
    expect(seams).toHaveLength(1);
    expect(seams[0]).toMatchObject({ z: 4, height: 86, drop: 0 });
    expect(seams[0].boxIds).toEqual(expect.arrayContaining(['left', 'right-cabinet', 'lower-cabinet']));
  });

  it.each([[-0.375, 43.625, 46.375], [0.125, 44, 46], [0, 44, 46]])(
    'follows a typed bottom reveal of %s', (manual, z, height) => {
      for (const tFiller of [undefined, 'all']) {
        const { scene, cabinetRoom } = fixture({ manual, tFiller });
        expect(scene.drawnPieces.find(({ role }) => role === 'end-right')).toMatchObject({ z, height });
        const notes = shippingList(cabinetRoom, DEFAULT_SETTINGS).rows.find(({ key }) => key === 'run-1:right').notes;
        expect(notes.filter((note) => note.startsWith('return up'))).toEqual(manual < 0 ? ['return up 3/8"'] : []);
      }
    },
  );

  it('uses the largest neighboring drop across gaps, but leaves lower or distant pieces alone', () => {
    const { scene, cabinetRoom, cabinetRun } = fixture({ both: true, manual: -0.375, leftManual: -0.25,
      tFiller: 'all', seamGap: 0.5, gap: 0.75 });
    expect(scene.tees.find(({ end }) => !end)).toMatchObject({ z: 44.375, drop: 0.375 });
    const drop = openBelowDrops(cabinetRoom, cabinetRun, scene.cells, DEFAULT_SETTINGS);
    const box = scene.cells.pieces.find(({ id }) => id === 'right-cabinet');
    expect(drop({ x: box.x + box.width + 0.75, width: 3, z: box.z })).toBe(0.375);
    expect(drop({ x: box.x + box.width + 0.751, width: 3, z: box.z })).toBe(0);
    expect(drop({ x: box.x + box.width, width: 3, z: box.z - 0.01 })).toBe(0);
    expect(drop({ x: box.x + box.width, width: 3, z: box.z + 0.0000005 })).toBe(0.375);
  });

  it('drops matched end panels, including L-shaped ends, once', () => {
    for (const tFiller of [undefined, 'all']) {
      const { scene, cabinetRoom } = fixture({ endType: 'end_panel', tFiller });
      expect(scene.drawnPieces.find(({ role }) => role === 'end-right')).toMatchObject({ z: 43.875, height: 46.125 });
      expect(shippingList(cabinetRoom, DEFAULT_SETTINGS).rows.find(({ key }) => key === 'run-1:right').size)
        .toContain('46 1/8');
      if (tFiller) expect(scene.ells.find(({ side }) => side === 'right')).toMatchObject({ z: 43.875, height: 46.125 });
    }
    expect(fixture({ endType: 'end_panel', height: 'full', tFiller: 'all' }).scene.ells
      .find(({ side }) => side === 'right')).toMatchObject({ z: 4, height: 86, drop: 0 });
  });

  it.each([14, 15])('leaves inset style %s unchanged even with a negative typed reveal', (styleId) => {
    const { scene } = fixture({ styleId, manual: -0.375, tFiller: 'all' });
    expect(scene.drawnPieces.find(({ role }) => role === 'end-right')).toMatchObject({ z: 44, height: 46 });
    expect(scene.tees).toEqual([]);
  });
});
