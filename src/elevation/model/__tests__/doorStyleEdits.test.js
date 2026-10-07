import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE, isDoorStyle } from '../doorStyles.js';
import { doorStyleUses, newDoorStyle, nextDoorStyleLabel, reassignDoorStyle } from '../doorStyleEdits.js';
import { gridFromItems, gridLeaves } from '../grid.js';

const A = { ...DEFAULT_DOOR_STYLE, id: 'ds-a', label: 'A' };
const B = { ...DEFAULT_DOOR_STYLE, id: 'ds-b', label: 'B', thickness: 1 };
const { name, ...UNNAMED } = DEFAULT_DOOR_STYLE;
void name;

/** A room picking A and B at every level that can pick a style. */
function room() {
  return {
    id: 'room-1',
    doorStyles: [A, B],
    doorStyleId: 'ds-a',
    panelStyleId: 'ds-b',
    walls: [{
      id: 'w1',
      doorStyleId: 'ds-b',
      endPanels: { start: { width: null, styleId: 'ds-a' }, end: null },
      runs: [{
        id: 'r1',
        drawerFrontStyleId: 'ds-a',
        ends: {
          left: { type: 'end_panel', width: null, styleId: 'ds-a', sizes: { stiles: { left: 3.5 } } },
          right: { type: 'filler', width: null },
        },
        grid: gridFromItems('r1', [
          {
            id: 'c1',
            kind: 'cabinet',
            width: null,
            doorStyleId: 'ds-b',
            face: {
              direction: 'vertical',
              size: null,
              children: [{ type: 'drawer_front', size: 6, styleId: 'ds-a' }, { type: 'door', size: null, styleId: 'ds-b' }],
            },
          },
          { id: 'c2', kind: 'cabinet', width: null },
          { id: 'p1', kind: 'panel', width: 0.75, styleId: 'ds-a' },
        ]),
      }],
    }],
  };
}

describe('SPEC-46.1 the room\'s door style list', () => {
  it('labels a new style with the first free letter, then numbers', () => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((label) => ({ label }));
    expect([[], [A, B], [B], letters, [...letters, { label: '1' }]].map((styles) => nextDoorStyleLabel(styles)))
      .toEqual(['A', 'C', 'A', '1', '2']);
  });

  it('copies a style as a new one: new id and label, no name, nothing shared', () => {
    expect(newDoorStyle([A, B], DEFAULT_DOOR_STYLE, 'ds-new')).toEqual({ ...UNNAMED, id: 'ds-new', label: 'C' });
    const named = { ...B, name: 'Kitchen' };
    const copy = newDoorStyle([A, named], named, 'ds-c');
    expect([copy.thickness, copy.label, 'name' in copy, copy.stiles === named.stiles, isDoorStyle(copy)])
      .toEqual([1, 'C', false, false, true]);
  });

  it('lists every place a style is picked, room to face', () => {
    const at = { wallId: 'w1', runId: 'r1' };
    expect(doorStyleUses(room(), 'ds-a')).toEqual([
      { level: 'room', key: 'doorStyleId' },
      { level: 'wallEndPanel', wallId: 'w1', endpoint: 'start' },
      { level: 'run', ...at, key: 'drawerFrontStyleId' },
      { level: 'runEnd', ...at, side: 'left' },
      { level: 'face', ...at, itemId: 'c1', path: 'r.0' },
      { level: 'panelCell', ...at, cellId: 'p1' },
    ]);
    expect(doorStyleUses(room(), 'ds-b')).toEqual([
      { level: 'room', key: 'panelStyleId' },
      { level: 'wall', wallId: 'w1', key: 'doorStyleId' },
      { level: 'cabinet', ...at, itemId: 'c1', key: 'doorStyleId' },
      { level: 'face', ...at, itemId: 'c1', path: 'r.1' },
    ]);
    expect([doorStyleUses(room(), 'ds-x'), doorStyleUses({ walls: [] }, 'ds-a')]).toEqual([[], []]);
  });

  it('moves every use to another style, or clears it, on a copy', () => {
    const before = room();
    const moved = reassignDoorStyle(before, 'ds-a', 'ds-b');
    expect([doorStyleUses(moved, 'ds-a'), doorStyleUses(moved, 'ds-b').length]).toEqual([[], 10]);
    expect(moved.walls[0].runs[0].ends.left).toEqual({
      type: 'end_panel', width: null, styleId: 'ds-b', sizes: { stiles: { left: 3.5 } },
    });
    expect(doorStyleUses(before, 'ds-a').length).toBe(6);

    const cleared = reassignDoorStyle(before, 'ds-a', null);
    const run = cleared.walls[0].runs[0];
    const leaf = (id) => gridLeaves(run.grid).find((node) => node.id === id);
    expect([
      'doorStyleId' in cleared,
      cleared.walls[0].endPanels.start,
      'drawerFrontStyleId' in run,
      run.ends.left,
      leaf('c1').face.children[0],
      'styleId' in leaf('p1'),
      cleared.doorStyles,
    ]).toEqual([
      false,
      { width: null },
      false,
      { type: 'end_panel', width: null, sizes: { stiles: { left: 3.5 } } },
      { type: 'drawer_front', size: 6 },
      false,
      [A, B],
    ]);
  });
});
