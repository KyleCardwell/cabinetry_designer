import { describe, expect, it, vi } from 'vitest';
import { Rect } from 'react-konva';
import { auto, room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { syncRoom } from '../../model/room.js';
import { wallEndPanels } from '../../model/wallEndPanels.js';
import { E, legShape, noEnds } from '../../model/__tests__/fixtures/legs.js';
import WallEndPanelShapes from '../WallEndPanelShapes.jsx';
import WallEndPanelProperties from '../properties/WallEndPanelProperties.jsx';
import PartStyleFields from '../properties/PartStyleFields.jsx';

vi.mock('react', async (original) => ({
  ...await original(), useMemo: (callback) => callback(),
  useState: (initial) => [initial, vi.fn()],
}));
vi.mock('react-redux', () => ({ useDispatch: () => vi.fn() }));
vi.mock('react-konva', () => ({ Group: 'group', Rect: 'rect' }));
vi.mock('../../canvas/cursor.js', async (original) => ({
  ...await original(), useCursorKeys: () => ({ request: vi.fn(), release: vi.fn() }),
}));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const settings = { ...DEFAULT_SETTINGS, runFlex: 0, shapes: [legShape()] };
const synced = syncRoom(room({ walls: [wall({ id: 'w', x2: 96, thickness: 4.5,
  endPanels: { start: { width: null }, end: null },
  endLegs: { start: { faces: { front: E }, fit: 'between', panel: { top: 1, bottom: 0.5 } } },
  runs: [run({ width: 36, anchors: { left: true, right: false }, ends: noEnds,
    autoCount: false, items: [auto('cabinet')] })],
})] }), settings);
const w = synced.walls[0];

describe('SH7.6 fitted wall panel UI', () => {
  it('draws its selected and unselected rectangles and hit area above the floor', () => {
    for (const selectedEndpoint of [null, 'start']) {
      const [element] = WallEndPanelShapes({ room: synced, wall: w, settings, selectedEndpoint,
        transform: { scale: 4, offsetX: 20, offsetY: 30, wallHeight: 96 } });
      const rects = nodes(element.type(element.props)).filter(({ type }) => type === Rect);
      expect(rects).toHaveLength(2);
      rects.forEach(({ props }) => expect(props).toMatchObject({ x: 21, y: 280, width: 3.25, height: 132 }));
    }
  });

  it('shows and passes the fitted height to the panel style controls', () => {
    const panel = wallEndPanels(synced, w, settings)[0];
    const tree = nodes(WallEndPanelProperties({ room: synced, wall: w, panel, settings }));
    expect(tree.find(({ type }) => type === 'p').props.children.join('')).toContain('33"');
    expect(tree.find(({ type }) => type === PartStyleFields).props.height).toBe(33);
  });
});
