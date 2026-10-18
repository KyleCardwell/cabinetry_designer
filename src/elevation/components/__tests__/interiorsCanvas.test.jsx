import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDispatch, useSelector } from 'react-redux';
import { Group, Rect, Text } from 'react-konva';
import { CABINET_TYPE_IDS, INTERIOR_DIVIDERS } from '../../model/constants.js';
import { boxConstruction } from '../../model/boxConstruction.js';
import { placeInterior, resolveInterior, wallInteriors } from '../../model/interiors.js';
import { resolveWall, syncRoom } from '../../model/room.js';
import { wallRectToScreen } from '../../canvas/transform.js';
import elevationReducer, { setDoorsOff, setSelection, setView } from '../../store/elevationSlice.js';
import { run, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import CellChains from '../CellChains.jsx';
import DoorDetails from '../DoorDetails.jsx';
import ElevationToolbar from '../ElevationToolbar.jsx';
import FaceOutlines from '../FaceOutlines.jsx';
import FrameOutline from '../FrameOutline.jsx';
import InteriorShapes from '../InteriorShapes.jsx';
import PieceRect from '../PieceRect.jsx';
import Pulls from '../Pulls.jsx';
import RunGroup from '../RunGroup.jsx';
import SwingMarks from '../SwingMarks.jsx';

vi.mock('react', async (original) => ({
  ...await original(),
  useMemo: (callback) => callback(),
  useState: (initial) => [initial, vi.fn()],
  useRef: (current) => ({ current }),
  useId: () => 'interiors',
  useEffect: vi.fn(),
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
vi.mock('react-konva', () => ({
  Group: 'group', Label: 'label', Line: 'line', Rect: 'rect', Shape: 'shape', Tag: 'tag', Text: 'text',
}));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const transform = { scale: 8, offsetX: 20, offsetY: 30, wallHeight: 96 };
let state;
let dispatch;

function canvas(extra = {}) {
  const room = syncRoom(state.rooms[0], state.settings);
  const wall = resolveWall(room, room.walls[0], 'front');
  const interiors = wallInteriors(room, wall.sideSource, 'front', state.settings);
  const tree = nodes(RunGroup.type({
    room, wall, run: wall.runs[0], settings: state.settings, transform,
    doorsOff: state.doorsOff, interiors, selectedRun: true, selectedPieceId: 'cabinet',
    interiorPath: state.interiorPath, interiorDivider: state.interiorDivider,
    ...extra,
  }));
  const layer = tree.find(({ type }) => type === InteriorShapes);
  return { tree, layer, shapes: layer ? nodes(InteriorShapes(layer.props)) : [] };
}

beforeEach(() => {
  vi.clearAllMocks();
  state = stateWithRun(run({
    cabinetTypeId: CABINET_TYPE_IDS.TALL, x: 10, z: 0, width: 24, height: 84,
    autoCount: false, ends: { left: { type: 'none' }, right: { type: 'none' } },
    items: [{ id: 'cabinet', kind: 'cabinet', width: 24, face: { type: 'door', hinge: 'left' },
      interior: { direction: 'vertical', children: [{}, {}], dividers: [{ kind: 'fixed' }] } }],
  }));
  state.doorsOff = false;
  state.rooms[0].swingMarks = true;
  dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
});

describe('IN3 doors-off canvas', () => {
  it('anchor 4: hides the door layers, keeps pieces and chains, and draws two clear sections and a shelf', () => {
    const normal = canvas();
    for (const component of [FaceOutlines, DoorDetails, Pulls, SwingMarks]) {
      expect(normal.tree.some(({ type }) => type === component)).toBe(true);
    }
    expect(normal.layer).toBeUndefined();
    dispatch(setDoorsOff(true));
    const onSelectInterior = vi.fn();
    const { tree, layer, shapes } = canvas({ interiorPath: 'r.1', onSelectInterior });
    for (const component of [FaceOutlines, DoorDetails, Pulls, SwingMarks]) {
      expect(tree.some(({ type }) => type === component)).toBe(false);
    }
    expect(tree.some(({ type }) => type === CellChains)).toBe(true);
    expect(tree.indexOf(layer)).toBeGreaterThan(tree.findIndex(({ type }) => type === PieceRect));
    expect(tree.filter(({ type }) => type === FrameOutline).every((frame) => tree.indexOf(frame) < tree.indexOf(layer))).toBe(true);
    const rects = shapes.filter(({ type }) => type === Rect);
    expect(rects).toHaveLength(3);
    expect(rects.map(({ props }) => [props.stroke, props.strokeWidth])).toEqual([
      ['#64748b', 1], ['#7dd3fc', 2], ['#1e293b', 1],
    ]);
    expect(rects[2].props).toMatchObject({ fill: '#cbd5e1', opacity: 0.9 });
    expect(shapes.filter(({ type }) => type === Text).map(({ props }) => props.text))
      .toEqual(['22 1/2 × 40 7/8', '22 1/2 × 40 7/8']);
    for (const [index, interior] of [[0, { path: 'r.0', divider: null }], [2, { path: 'r', divider: 0 }]]) {
      const event = {};
      rects[index].props.onClick(event);
      expect(event.cancelBubble).toBe(true);
      expect(onSelectInterior).toHaveBeenLastCalledWith(interior);
    }
    expect(canvas({ selectedPieceId: null }).shapes.filter(({ type }) => type === Rect)
      .every(({ props }) => props.listening === false && !props.onClick && props.strokeWidth === 1)).toBe(true);
    expect(canvas({ preview: true }).shapes.some(({ type }) => type === Text)).toBe(false);
    const selected = canvas({ interiorPath: 'r', interiorDivider: 0 }).shapes.filter(({ type }) => type === Rect);
    expect(selected.every(({ props }) => props.stroke === '#7dd3fc' && props.strokeWidth === 2)).toBe(true);
    dispatch(setDoorsOff(false));
    expect(canvas().tree.map(({ type }) => type)).toEqual(normal.tree.map(({ type }) => type));
  });

  it('clips all five divider kinds to the drawn piece and fits sizes only for the selected cabinet', () => {
    const box = { x: 10, z: 4, width: 24, height: 84, depth: 24 };
    const drawn = { id: 'cabinet', x: 16, z: 4, width: 18, height: 84 };
    const render = (interior, extra = {}) => nodes(InteriorShapes({
      entries: [{ itemId: 'cabinet', ...placeInterior({
        box, ...resolveInterior(interior, box, boxConstruction({}), state.settings),
      }) }],
      drawnPieces: [drawn], transform, selectedPieceId: 'cabinet', ...extra,
    }));
    for (const [direction, kinds] of Object.entries(INTERIOR_DIVIDERS)) {
      for (const kind of kinds) {
        const shapes = render({ direction, children: [{}, {}], dividers: [{ kind }] });
        const group = shapes.find(({ type }) => type === Group);
        const clip = wallRectToScreen(drawn, transform);
        expect(group.props).toMatchObject({ clipX: clip.x, clipY: clip.y, clipWidth: clip.width, clipHeight: clip.height });
        const divider = shapes.filter(({ type }) => type === Rect).at(-1);
        expect(divider.props).toMatchObject({ stroke: '#1e293b', strokeWidth: 1, fill: '#cbd5e1', opacity: 0.9 });
        expect(direction === 'vertical' ? divider.props.height : divider.props.width)
          .toBe((kind.startsWith('double_') ? 1.5 : 0.75) * transform.scale);
      }
    }
    // No stored tree still shows the clear box, with root selected like the panel.
    expect(render(undefined).filter(({ type }) => type === Rect)).toHaveLength(1);
    expect(render(undefined).find(({ type }) => type === Rect).props.stroke).toBe('#7dd3fc');
    expect(render(undefined).find(({ type }) => type === Text).props.text).toBe('22 1/2 × 82 1/2');
    const unselected = render(undefined, { selectedPieceId: 'other' });
    expect(unselected.some(({ type }) => type === Text)).toBe(false);
    expect(unselected.find(({ type }) => type === Rect).props).toMatchObject({ listening: false, stroke: '#64748b' });
    expect(render(undefined, { transform: { ...transform, scale: 0.1 } }).some(({ type }) => type === Text)).toBe(false);
    expect(render(undefined, { drawnPieces: [] }).find(({ type }) => type === Group).props.clipWidth).toBeUndefined();
    const nested = { direction: 'vertical', dividers: [{ kind: 'fixed' }], children: [
      { direction: 'horizontal', dividers: [{ kind: 'partition' }], children: [{}, {}] }, {},
    ] };
    expect(render(nested, { interiorPath: 'r.0' }).filter(({ type }) => type === Rect)
      .map(({ props }) => props.stroke)).toEqual(['#7dd3fc', '#7dd3fc', '#64748b', '#1e293b', '#1e293b']);
  });

  it('anchor 5: toggles Doors off beside part numbers in elevation, including read-only, and hides it in plan', () => {
    const buttons = () => nodes(ElevationToolbar({ readOnly: true })).filter(({ type }) => type === 'button');
    const toggle = () => buttons().find(({ props }) => props.children === 'Doors off');
    dispatch(setSelection({ runId: 'run-1', pieceId: 'cabinet' }));
    expect(toggle().props['aria-pressed']).toBe(false);
    expect(toggle().props.disabled).toBeUndefined();
    const partIndex = buttons().findIndex(({ props }) => props.children === 'Part #');
    expect(buttons()[partIndex + 1].props.children).toBe('Doors off');
    toggle().props.onClick();
    expect(dispatch).toHaveBeenLastCalledWith(setDoorsOff(true));
    expect(state.doorsOff).toBe(true);
    expect(toggle().props['aria-pressed']).toBe(true);
    toggle().props.onClick();
    expect(state.doorsOff).toBe(false);
    dispatch(setView('plan'));
    expect(toggle()).toBeUndefined();
  });
});
