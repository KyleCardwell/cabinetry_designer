import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { DEFAULT_DOOR_STYLE } from '../doorStyles.js';
import { runFaceStyles } from '../doorStyleResolve.js';
import { gridFromItems } from '../grid.js';
import { runFillerThickness } from '../planPieces.js';

const settings = DEFAULT_SETTINGS;
const mdf = { ...DEFAULT_DOOR_STYLE, id: 'mdf', designId: 'slab-mdf', thickness: 0.75 };
const thinner = { ...mdf, id: 'thin-mdf', thickness: 0.625 };
const room = { doorStyles: [mdf, thinner], doorStyleId: 'mdf' };

describe('FL1 step a run filler face thickness', () => {
  it('uses the shop thickness for mixed MDF and five-piece faces (A2), and the thickest for all MDF', () => {
    const run = { grid: gridFromItems('run', [
      { id: 'a', kind: 'cabinet', width: null },
      { id: 'b', kind: 'cabinet', width: null, face: {
        direction: 'vertical', children: [
          { type: 'drawer_front', styleId: 'default' },
          { type: 'open' },
        ],
      } },
      { id: 'panel', kind: 'panel', width: 0.75 },
    ]) };
    const faces = runFaceStyles(room, {}, run, settings);
    expect(faces.map(({ style, design }) => [style.id, design.slabCore]))
      .toEqual([['mdf', 'mdf'], ['default', null]]);
    expect(Object.keys(faces[0]).sort()).toEqual(['design', 'style']);
    expect(runFillerThickness(room, {}, run, settings)).toBe(0.8125);
    const drawer = run.grid.cells[1].node.face.children[0];
    drawer.styleId = 'thin-mdf';
    expect(runFillerThickness(room, {}, run, settings)).toBe(0.75);
  });

  it('uses the shop thickness when every cabinet is open (A3) or the run has no cabinets', () => {
    const run = { grid: gridFromItems('run', [
      { id: 'a', kind: 'cabinet', width: null, face: { type: 'open' } },
      { id: 'b', kind: 'cabinet', width: null, face: { type: 'open' } },
    ]) };
    expect(runFaceStyles(room, {}, run, settings)).toEqual([]);
    expect(runFillerThickness(room, {}, run, settings)).toBe(0.8125);
    expect(runFillerThickness(room, {}, {}, { ...settings, fillerThickness: 0.875 })).toBe(0.875);
  });
});
