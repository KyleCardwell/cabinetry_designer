import { describe, expect, it, vi } from 'vitest';
import { Line, Rect } from 'react-konva';
import { wallRectToScreen } from '../canvas/transform.js';
import { openingGeometry } from '../model/openings.js';
import { DEFAULT_SETTINGS } from '../model/constants.js';
import { opening } from '../store/__tests__/helpers/sliceFixtures.js';
import OpeningShape from './OpeningShape.jsx';

vi.mock('react', async (original) => ({
  ...await original(), useRef: (current) => ({ current }), useEffect: vi.fn(), useId: () => 'opening',
  useMemo: (callback) => callback(),
}));
vi.mock('react-konva', () => ({ Group: 'group', Line: 'line', Rect: 'rect', Text: 'text' }));
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];

describe('IN14 wall-window glass marks', () => {
  it('anchor 5 (GM1): draws two sets of three rising marks inside a 36 by 48 jamb using its stroke, and none on doors', () => {
    const transform = { scale: 8, offsetX: 20, offsetY: 30, wallHeight: 96 };
    for (const selected of [false, true]) {
      for (const kind of ['window', 'door']) {
        const item = opening({ kind, width: 36, height: 48, sillZ: 30 });
        const geometry = openingGeometry(item, 144, DEFAULT_SETTINGS);
        const shapes = nodes(OpeningShape({ opening: item, geometry, transform, selected, selectable: true }));
        const marks = shapes.filter(({ type }) => type === Line);
        expect(marks).toHaveLength(kind === 'window' ? 6 : 0);
        const jamb = wallRectToScreen(geometry.jamb, transform);
        const outline = shapes.find(({ type, props }) => type === Rect && props.x === jamb.x);
        marks.forEach(({ props }) => {
          expect(props).toMatchObject({ stroke: outline.props.stroke, strokeWidth: 0.75, listening: false });
          const [x1, y1, x2, y2] = props.points;
          expect(x2).toBeGreaterThan(x1);
          expect(y2).toBeLessThan(y1);
          expect(x1).toBeGreaterThan(jamb.x);
          expect(x2).toBeLessThan(jamb.x + jamb.width);
          expect(y2).toBeGreaterThan(jamb.y);
          expect(y1).toBeLessThan(jamb.y + jamb.height);
        });
      }
    }
  });
});
