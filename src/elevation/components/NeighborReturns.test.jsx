import { expect, it, vi } from 'vitest';
import { Text } from 'react-konva';
import { auto, fixed, room, run, wall } from '../../test/builders.js';
import { DEFAULT_SETTINGS } from '../model/constants.js';
import { normalizeCornerEnd } from '../model/cornerEnd.js';
import { resolveWall, syncRoom } from '../model/room.js';
import NeighborReturns from './NeighborReturns.jsx';

vi.mock('react-konva', () => ({
  Group: 'group', Line: 'line', Rect: 'rect', Shape: 'shape', Text: 'text',
}));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];

it('CC7: draws owner leg bands without a wall label while retaining the joining run label', () => {
  const settings = { ...DEFAULT_SETTINGS, runFlex: 0 };
  const subject = syncRoom(room({ walls: [
    wall({ runs: [run({ autoCount: false, items: [fixed('cc', 36), auto('a')],
      anchors: { left: true, right: false },
      ends: { left: normalizeCornerEnd({}), right: { type: 'none' } },
    })], connections: { start: { wallId: 'wall-2', endpoint: 'end' }, end: null } }),
    wall({ id: 'wall-2', x1: 0, y1: 144, x2: 0, y2: 0,
      connections: { start: null, end: { wallId: 'wall-1', endpoint: 'start' } },
      runs: [run({ id: 'run-2', width: 96, anchors: { left: false, right: true },
        items: [auto('r')], ends: { left: { type: 'none' }, right: { type: 'none' } } })],
    }),
  ] }), settings);
  const tree = nodes(NeighborReturns({ room: subject,
    wall: resolveWall(subject, subject.walls[0], 'front'), settings,
    transform: { scale: 8, offsetX: 20, offsetY: 30, wallHeight: 96 },
  }));
  const leg = tree.find(({ key }) => key === 'left:corner:run-1');
  expect(leg).toBeDefined();
  expect(nodes(leg).filter(({ type }) => type === 'rect')).toHaveLength(2);
  expect(nodes(leg).some(({ type }) => type === Text)).toBe(false);
  expect(tree.filter(({ type }) => type === Text)).toHaveLength(1);
});
