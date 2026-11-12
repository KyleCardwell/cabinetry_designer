import { beforeEach, expect, it, vi } from 'vitest';
import { Line } from 'react-konva';
import { auto, fixed, room, run, wall } from '../../../test/builders.js';
import { CABINET_TYPE_COLORS, DEFAULT_SETTINGS } from '../../model/constants.js';
import { normalizeCornerEnd } from '../../model/cornerEnd.js';
import { DEFAULT_DOOR_STYLE } from '../../model/doorStyles.js';
import { elevationToPlan } from '../../model/geometry.js';
import { wallSideFrame } from '../../model/wallSides.js';
import PlanRunFootprint from '../PlanRunFootprint.jsx';

vi.mock('react', async (original) => ({
  ...await original(),
  useMemo: (callback) => callback(),
  useRef: (current) => ({ current }),
  useId: () => 'corner-plan-canvas',
  useEffect: vi.fn(),
  useState: (value) => [value, vi.fn()],
}));
vi.mock('react-konva', () => ({
  Group: 'group', Label: 'label', Line: 'line', Tag: 'tag', Text: 'text',
}));

const settings = { ...DEFAULT_SETTINGS, bumperThickness: 0.125 };
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
let owner, ownerWall, subject, frame;

beforeEach(() => {
  owner = run({ autoCount: false, items: [fixed('cc', 36), auto('a')], _doorThickness: 0.75,
    style: { cabinetStyleId: 13 }, anchors: { left: true, right: false },
    ends: { left: normalizeCornerEnd({}), right: { type: 'none' } },
  });
  owner.grid.cells[0].node.face = { type: 'door' };
  owner.grid.cells[0].node.doorStyleId = 'thin';
  ownerWall = wall({ runs: [owner],
    connections: { start: { wallId: 'wall-2', endpoint: 'end' }, end: null },
  });
  const returnWall = wall({ id: 'wall-2', x1: 0, y1: 144, x2: 0, y2: 0,
    connections: { start: null, end: { wallId: 'wall-1', endpoint: 'start' } },
  });
  subject = room({ walls: [ownerWall, returnWall],
    doorStyles: [{ ...DEFAULT_DOOR_STYLE, id: 'thin', label: 'Thin', thickness: 0.75 }],
  });
  frame = wallSideFrame(subject, ownerWall, owner.wallSide);
});

function lines(props = {}) {
  return nodes(PlanRunFootprint({ frame, room: subject, wall: ownerWall, run: owner,
    settings, selectable: true, scale: 1, ...props,
  })).filter(({ type }) => type === Line);
}

function mapped(polygon) {
  return polygon.flatMap(([u, v]) => {
    const { x, y } = elevationToPlan(frame, u, v);
    return [x, y];
  });
}

it('anchor 1: Room A Corner 90 outlines the L once and keeps ordinary box segments', () => {
  const drawing = lines();
  const outlines = drawing.filter(({ key, props }) => key.startsWith('cc:') && props.strokeWidth === 1.5);
  expect(outlines).toHaveLength(1);
  expect(outlines[0].props).toMatchObject({
    points: mapped([[0, 0], [36, 0], [36, 24], [24, 24], [24, 36], [0, 36]]),
    closed: true, stroke: CABINET_TYPE_COLORS[owner.cabinetTypeId],
    strokeWidth: 1.5, listening: false,
  });
  expect(outlines[0].props.fill).toBeUndefined();
  expect(drawing.filter(({ key }) => key.startsWith('cc:outline:'))).toEqual([]);
  const ordinary = drawing.filter(({ key }) => key.startsWith('a:outline:'));
  expect(ordinary).toHaveLength(4);
  ordinary.forEach(({ props }) => {
    expect(props.points).toHaveLength(4);
    expect(props.closed).toBeUndefined();
    expect(props.strokeWidth).toBe(1.5);
  });
});

it('anchor 2: Euro Corner 45 outlines seven points and draws only the diagonal cc:r face', () => {
  owner.ends.left.corner.kind = 45;
  const drawing = lines();
  const outlines = drawing.filter(({ key, props }) => key.startsWith('cc:') && props.strokeWidth === 1.5);
  expect(outlines).toHaveLength(1);
  expect(outlines[0].props).toMatchObject({
    points: mapped([[0, 0], [36, 0], [36, 24], [35.25, 24], [24, 35.25], [24, 36], [0, 36]]),
    closed: true,
  });
  expect(drawing.filter(({ key }) => key.startsWith('cc:outline:'))).toEqual([]);
  const faces = drawing.filter(({ key }) => key === 'cc:r');
  expect(faces).toHaveLength(1);
  expect(faces[0].props.closed).toBe(true);
  const expected = mapped([[35.9709, 24.9665], [24.9665, 35.9709],
    [24.4362, 35.4406], [35.4406, 24.4362]]);
  expect(faces[0].props.points).toHaveLength(8);
  faces[0].props.points.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 3));
});

it.each([
  ['selected', { selected: true }, '#f8fafc'],
  ['collision', { collision: true, selected: true }, '#ef4444'],
])('anchor 3: %s polygon uses the matching stroke and zoom-scaled width', (_, state, stroke) => {
  for (const kind of [90, 45]) {
    owner.ends.left.corner.kind = kind;
    for (const scale of [1, 4]) {
      const outlines = lines({ ...state, scale })
        .filter(({ key, props }) => key.startsWith('cc:') && props.strokeWidth === 2.5 / scale);
      expect(outlines).toHaveLength(1);
      expect(outlines[0].props).toMatchObject({ closed: true, stroke, strokeWidth: 2.5 / scale,
        listening: false });
    }
  }
});
