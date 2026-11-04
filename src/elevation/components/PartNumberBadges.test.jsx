import { describe, expect, it, vi } from 'vitest';
import { Line, Rect, Text } from 'react-konva';
import { auto, room, run, wall } from '../../test/builders.js';
import { DEFAULT_SETTINGS } from '../model/constants.js';
import { elevationPartNumbers } from '../model/elevationPartNumbers.js';
import { partNumbers, wallBadgeGroups } from '../model/partNumbers.js';
import { resolveWall } from '../model/room.js';
import { legShape } from '../model/__tests__/fixtures/legs.js';
import { wallRectToScreen } from '../canvas/transform.js';
import PartNumberBadges from './PartNumberBadges.jsx';

vi.mock('react-konva', () => ({ Group: 'group', Line: 'line', Rect: 'rect', Text: 'text' }));
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const settings = { ...DEFAULT_SETTINGS, shapes: [legShape()] };
const transform = { scale: 4, offsetX: 20, offsetY: 30, wallHeight: 96 };

describe('SH7 step d leg badges', () => {
  it('centres canvas and DXF badges on each leg bounds like narrow fillers, on either wall face', () => {
    for (const side of ['front', 'back']) {
      const r = run({ id: 'R', wallSide: side, x: 10, width: 36, autoCount: false, items: [auto('cabinet')],
        legs: [
          { id: 'LF', shapeId: 'leg', from: 'left', x: 0, yFrom: 'front', y: 0, height: 'full' },
          { id: 'RB', shapeId: 'leg', from: 'right', x: 0, yFrom: 'back', y: 0, height: 30 },
          { id: 'missing', shapeId: 'missing', from: 'left', x: 5, yFrom: 'front', y: 0, height: 'full' },
        ], ends: { left: { type: 'none' }, right: { type: 'none' } } });
      const w = wall({ runs: [r] });
      const input = room({ walls: [w], partNumberOverrides: { LF: 12 } });
      const view = resolveWall(input, w, side);
      const groups = wallBadgeGroups(input, view, settings);
      const group = groups.find(({ key }) => key === 'legs:R');
      expect(group).toEqual({ key: 'legs:R', lift: 0, pieces: [
        { id: 'LF', x: 10, z: 0, width: 3.5, height: 34.5 },
        { id: 'RB', x: 42.5, z: 0, width: 3.5, height: 30 },
      ] });
      expect(wallBadgeGroups(input, resolveWall(input, w, side === 'front' ? 'back' : 'front'), settings))
        .toEqual([]);
      const numbers = partNumbers(input, settings);
      const tree = nodes(PartNumberBadges({ ...group, numbers: numbers.byKey,
        overrideKeys: numbers.overrideKeys, transform }));
      const rects = tree.filter(({ type }) => type === Rect);
      const lines = tree.filter(({ type }) => type === Line);
      expect(tree.filter(({ type }) => type === Text).map(({ props }) => props.text)).toEqual(['12', '2']);
      expect(rects.map(({ props }) => props.stroke)).toEqual(['#facc15', '#f8fafc']);
      const dxf = elevationPartNumbers(input, w, side, settings);
      group.pieces.forEach((piece, i) => {
        const screen = wallRectToScreen(piece, transform);
        const { props } = rects[i];
        expect(props.x + props.width / 2).toBe(screen.x + screen.width / 2);
        expect(lines[i].props.points.at(-1)).toBe(screen.y + screen.height / 2 - 20);
        expect(dxf.find(({ key }) => key === piece.id)).toMatchObject({
          text: i === 0 ? '12' : '2', x: piece.x + piece.width / 2,
          z: piece.height / 2 + 6,
          leader: { x2: piece.x + piece.width / 2, z2: piece.height / 2 },
        });
      });
    }
  });
});
