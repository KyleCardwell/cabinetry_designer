import { describe, expect, it } from 'vitest';
import { cellCaptureSides, hingeStops } from '../cells.js';
import { findLeaf, splitGridCell } from '../cellTree.js';
import { toDrawingPayload } from '../drawingPayload.js';
import { elevationParts } from '../elevationParts.js';
import { defaultPick, pickStack } from '../pick.js';
import { planRunPieces } from '../planPieces.js';
import { runBands } from '../runBands.js';
import { room8Upper, settings } from './helpers/room8Upper.js';

const insideIds = ['a:inside-right', 'c:inside-left'];

describe('IE1 step c inside panels drawn and picked', () => {
  it('exports Room 8 upper elevation and plan DXF geometry with two inside panels', () => {
    const { room, wall, run, scene } = room8Upper();
    const parts = elevationParts(room, wall, 'front', settings);
    expect(parts.filter(({ id }) => insideIds.includes(id))).toEqual([
      { id: insideIds[0], kind: 'end_panel', runId: 'r', x: 54.4375, z: 29.875,
        width: 0.75, height: 60.125, back: 0, front: 24.8125, coversBoxEdges: false },
      { id: insideIds[1], kind: 'end_panel', runId: 'r', x: 108.875, z: 29.875,
        width: 0.75, height: 60.125, back: 0, front: 24.8125, coversBoxEdges: false },
    ]);
    const plan = planRunPieces(room, wall, run, settings, scene.result, scene.faceLayouts);
    expect(plan.faces.filter(({ key }) => insideIds.includes(key))).toEqual([
      { key: insideIds[0], kind: 'end_panel', start: 54.4375, end: 55.1875, back: 0, front: 24.8125 },
      { key: insideIds[1], kind: 'end_panel', start: 108.875, end: 109.625, back: 0, front: 24.8125 },
    ]);
    const payload = toDrawingPayload(room, settings);
    expect({ elevations: payload.elevations.map(({ wallId, side, parts }) => ({ wallId, side, parts })),
      plan: payload.plan.parts }).toMatchSnapshot();
  });

  it('captures root and nested cabinets and defaults hinges against their inside panels', () => {
    for (const nested of [false, true]) {
      const { scene } = room8Upper((run) => {
        if (!nested) return;
        let n = 0;
        run.grid = splitGridCell(run.grid, 'a', 'down', 2, () => `a${++n}`);
        findLeaf(run.grid, 'a5').face = { type: 'door', size: null };
      });
      for (const piece of scene.cells.pieces.filter(({ kind }) => kind === 'cabinet')) {
        const side = piece.id === 'c' ? 'left' : 'right';
        expect(cellCaptureSides(scene.cells.pieces, piece.id)[side]).toBe(true);
        expect(hingeStops(scene.cells.pieces, piece.id)[side]).toBe(true);
        const layout = scene.faceLayouts.get(piece.id);
        expect(layout.reveals.values.left).toBe(0.09375);
        expect(layout.reveals.values.right).toBe(0.09375);
      }
    }
    const { scene } = room8Upper((run) => {
      run.ends = { left: { type: 'none' }, right: { type: 'none' } };
    });
    expect(scene.faceLayouts.get('a').faces[0]).toMatchObject({ hinge: 'right', hingeRule: true });
    expect(scene.faceLayouts.get('c').faces[0]).toMatchObject({ hinge: 'left', hingeRule: true });
  });

  it('grows a face frame over stacked inside panel edges only once and miters them in plan', () => {
    const { room, wall, run, scene } = room8Upper((run, room) => {
      room.style = { cabinetStyleId: 14 };
      let n = 0;
      run.grid = splitGridCell(run.grid, 'a', 'down', 2, () => `a${++n}`);
    });
    const panels = scene.cells.pieces.filter(({ inside, ownerId }) => inside && ownerId !== 'c');
    expect(panels).toHaveLength(2);
    const region = scene.frames.regions.find(({ cabinetIds }) => cabinetIds.includes('a'));
    const right = Math.max(...panels.map(({ x, width }) => x + width));
    expect(region.x + region.width).toBe(right);
    expect(region.panelIds).toEqual(expect.arrayContaining(panels.map(({ id }) => id)));
    expect(scene.frames.freeSides.get('a').right).toBe(false);
    const plan = planRunPieces(room, wall, run, settings, scene.result, scene.faceLayouts);
    for (const panel of panels) {
      expect(plan.faces.find(({ key }) => key === panel.id).polygon).toBeDefined();
    }
    expect(plan.faces.find(({ key }) => key === region.id).end).toBe(right);
  });

  it('selects each inside panel by its own id, including the upper drop with doors off', () => {
    const { room, wall, scene } = room8Upper();
    for (const piece of scene.drawnPieces.filter(({ inside }) => inside)) {
      for (const doorsOff of [false, true]) {
        for (const z of [piece.z + 0.0625, piece.z + piece.height / 2]) {
          expect(defaultPick(pickStack(room, wall, settings, { x: piece.x + piece.width / 2, z }, { doorsOff })))
            .toMatchObject({ kind: 'piece', selection: { runId: 'r', pieceId: piece.id } });
        }
      }
    }
  });

  it('keeps run-end lips and bottom spans at run ends, while drawing flush-bottom chip details inside', () => {
    const { room, wall, run, scene } = room8Upper((run) => {
      run.tFiller = true;
      run.bottom = [{ id: 'rail', kind: 'light_rail', height: 1.75, doors: 'flush' }];
    });
    expect(scene.ells.map(({ pieceId }) => pieceId)).toEqual(['r:left', 'r:right']);
    const bands = runBands(room, wall, run, settings, scene);
    expect(bands.bottomParts[0]).toMatchObject({ x: 0, width: 164.125 });
    for (const piece of scene.drawnPieces.filter(({ inside }) => inside)) {
      const line = { x1: piece.x, z1: 30.125, x2: piece.x + piece.width, z2: 30.125 };
      expect(elevationParts(room, wall, 'front', settings).find(({ id }) => id === piece.id).lines).toEqual([line]);
    }
  });
});
