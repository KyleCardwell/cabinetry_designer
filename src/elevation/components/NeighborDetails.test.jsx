import { expect, it, vi } from 'vitest';
import { Line, Rect, Text } from 'react-konva';
import { wallRectToScreen } from '../canvas/transform.js';
import { DEFAULT_SETTINGS } from '../model/constants.js';
import CombinedFaces from './CombinedFaces.jsx';
import DoorDetails from './DoorDetails.jsx';
import NeighborProfiles from './NeighborProfiles.jsx';
import NeighborReturns from './NeighborReturns.jsx';

vi.mock('react', async (original) => ({ ...await original(), useMemo: (callback) => callback() }));
vi.mock('react-konva', () => ({
  Group: 'group', Layer: 'layer', Line: 'line', Rect: 'rect', Shape: 'shape', Text: 'text',
}));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const transform = { scale: 8, offsetX: 20, offsetY: 30, wallHeight: 96 };
const panel = {
  id: 'return:end_panel', kind: 'end_panel', x: 95.125, z: 4, width: 24.875, height: 30.5,
  doorDetail: {
    openings: [{ x: 98.125, z: 7, width: 18.875, height: 24.5 }],
    profileLines: [{ x: 97.125, z: 6, width: 20.875, height: 26.5 }],
    miters: [{ x1: 97.125, z1: 6, x2: 98.125, z2: 7 }],
  },
};
const wall = { id: 'wall', x1: 0, y1: 0, x2: 120, y2: 0, height: 96, length: 120,
  runs: [], openings: [], recesses: [], soffits: [] };

it('DM8 anchor 3: draws end-view openings, profiles and miters only with details on and doors on, across combined faces', () => {
  for (const doorsOff of [false, true]) {
    for (const doorDetails of [true, false]) {
      const room = { walls: [wall], doorDetails, doorStyleTags: true };
      for (const [Component, kind] of [[NeighborReturns, 'return'], [NeighborProfiles, 'profile']]) {
        const shapes = [{ key: 'neighbor', kind, wallId: wall.id,
          parts: [panel, { id: 'section', kind: 'section', x: 0, z: 0, width: 10, height: 20 }] }];
        const props = { room, wall, settings: DEFAULT_SETTINGS, transform, shapes, doorsOff };
        const layers = nodes(Component(props)).filter(({ type }) => type === DoorDetails);
        expect(layers).toHaveLength(doorDetails && !doorsOff ? 1 : 0);
        for (const layer of layers) {
          expect(layer.props).toMatchObject({ warnings: [], showDetails: true, showTags: false });
          const detail = nodes(DoorDetails(layer.props));
          const rectangles = detail.filter(({ type }) => type === Rect);
          expect(rectangles.map(({ props }) => ({ x: props.x, y: props.y, width: props.width, height: props.height })))
            .toEqual([panel.doorDetail.openings[0], panel.doorDetail.profileLines[0]]
              .map((rect) => wallRectToScreen(rect, transform)));
          expect(detail.filter(({ type }) => type === Line).map(({ props }) => props.points))
            .toEqual([[797, 750, 805, 742]]);
          expect(detail.some(({ type }) => type === Text)).toBe(false);
        }
        const combined = { faces: [
          { key: 'active', dx: 0, depth: 0, length: 120, height: 96 },
          { key: 'other', dx: 120, depth: 0, length: 120, height: 96 },
        ] };
        const tree = CombinedFaces({ room, combined, activeKey: 'active', settings: DEFAULT_SETTINGS,
          faces: new Map([['other', { wall, shapes }]]), diagnostics: {}, transform, doorsOff });
        const neighbors = nodes(tree).filter(({ type }) => type === NeighborReturns || type === NeighborProfiles);
        expect(neighbors).toHaveLength(2);
        expect(neighbors.every(({ props }) => props.doorsOff === doorsOff)).toBe(true);
      }
    }
  }
});
