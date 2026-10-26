import { describe, expect, it, vi } from 'vitest';
import { Line, Rect } from 'react-konva';
import { wallRectToScreen } from '../canvas/transform.js';
import { openingGeometry } from '../model/openings.js';
import { DEFAULT_SETTINGS } from '../model/constants.js';
import { opening } from '../../test/builders.js';
import OpeningShape from './OpeningShape.jsx';

vi.mock('react', async (original) => ({
  ...await original(), useRef: (current) => ({ current }), useEffect: vi.fn(), useId: () => 'opening',
  useMemo: (callback) => callback(),
}));
vi.mock('react-konva', () => ({ Group: 'group', Line: 'line', Rect: 'rect', Text: 'text' }));
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];

describe('IN14 wall-window glass marks', () => {
  it('anchor 5 (GM2): draws three weighted marks across a 36 by 48 jamb using its stroke, and none on doors', () => {
    const transform = { scale: 8, offsetX: 20, offsetY: 30, wallHeight: 96 };
    const settings = { ...DEFAULT_SETTINGS, plotScale: 32 };
    for (const selected of [false, true]) {
      for (const kind of ['window', 'door']) {
        const item = opening({ kind, width: 36, height: 48, sillZ: 30 });
        const geometry = openingGeometry(item, 144, settings);
        const shapes = nodes(OpeningShape({ opening: item, geometry, settings, transform, selected, selectable: true }));
        const marks = shapes.filter(({ type }) => type === Line);
        expect(marks).toHaveLength(kind === 'window' ? 3 : 0);
        if (marks.length) {
          expect(marks[1].props.strokeWidth).toBeGreaterThan(marks[0].props.strokeWidth);
          expect(marks[0].props.strokeWidth).toBeGreaterThan(marks[2].props.strokeWidth);
        }
        const jamb = wallRectToScreen(geometry.jamb, transform);
        const outline = shapes.find(({ type, props }) => type === Rect && props.x === jamb.x);
        marks.forEach(({ props }, index) => {
          expect(props).toMatchObject({ stroke: outline.props.stroke,
            strokeWidth: [70, 100, 35][index] / 100 / 25.4 * settings.plotScale * transform.scale,
            listening: false });
          const [x1, y1, x2, y2] = props.points;
          expect(x2).toBeGreaterThan(x1);
          expect(y2).toBeLessThan(y1);
          expect(x1).toBeGreaterThanOrEqual(jamb.x);
          expect(x2).toBeLessThanOrEqual(jamb.x + jamb.width);
          expect(y2).toBe(jamb.y);
          expect(y1).toBe(jamb.y + jamb.height);
        });
      }
    }
  });
});
