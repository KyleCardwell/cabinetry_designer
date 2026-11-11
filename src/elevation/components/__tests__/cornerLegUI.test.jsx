import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { renderToStaticMarkup } from 'react-dom/server';
import { auto, fixed, room, run, wall } from '../../../test/builders.js';
import elevationReducer, { setSelection } from '../../store/elevationSlice.js';
import { stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import { normalizeCornerEnd } from '../../model/cornerEnd.js';
import { partNumbers } from '../../model/partNumbers.js';
import { selectSettings } from '../../store/selectors.js';
import PropertiesPanel from '../PropertiesPanel.jsx';
import CornerLegProperties from '../properties/CornerLegProperties.jsx';
import WarningsList from '../properties/WarningsList.jsx';

vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));
vi.mock('react', async (original) => ({
  ...await original(), useMemo: (compute) => compute(), useCallback: (fn) => fn,
  useRef: (current) => ({ current }), useEffect: vi.fn(),
}));

let state;
const subject = () => state.rooms[0];
const ownerWall = () => subject().walls[0];
const owner = () => ownerWall().runs[0];
const dispatch = vi.fn((action) => { state = structuredClone(elevationReducer(state, action)); });
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : tree && typeof tree === 'object' ? text(tree.props?.children) : tree == null || typeof tree === 'boolean' ? '' : String(tree);
const panel = () => {
  useEffect.mockClear();
  return PropertiesPanel();
};
const leg = () => {
  const component = nodes(panel()).find(({ type }) => type === CornerLegProperties);
  expect(component).toBeDefined();
  return CornerLegProperties(component.props);
};
const rows = (tree) => Object.fromEntries(nodes(tree).filter(({ type }) => type === 'div')
  .filter(({ props }) => props.children?.[0]?.type === 'dt')
  .map(({ props }) => props.children.map(text)));
const flushEffects = () => useEffect.mock.calls.forEach(([effect]) => effect());

beforeEach(() => {
  vi.clearAllMocks();
  state = {
    ...stateWithRun(), activeWallId: 'wall-2', activeWallSide: 'front',
    selection: { wallId: 'wall-2' },
    rooms: [room({ name: 'Room A', walls: [
      wall({ runs: [run({ autoCount: false,
        items: [{ ...fixed('cc', 36), face: { type: 'door', hinge: 'right' } }, auto('a')],
        style: { cabinetStyleId: 13 }, anchors: { left: true, right: false },
        ends: { left: normalizeCornerEnd({}), right: { type: 'none' } },
      })], connections: { start: { wallId: 'wall-2', endpoint: 'end' }, end: null } }),
      wall({ id: 'wall-2', x1: 0, y1: 144, x2: 0, y2: 0,
        connections: { start: null, end: { wallId: 'wall-1', endpoint: 'start' } },
      }),
    ] })],
  };
  dispatch(setSelection({ cornerOf: { wallId: 'wall-1', runId: owner().id, side: 'left' } }));
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
});

describe('CC4 step d corner leg properties', () => {
  it('anchor 1: shows the owner, part number and true Room A 90 sizes on the return wall', () => {
    const tree = leg();
    expect(text(tree)).toContain('Corner 90 on Wall 1');
    expect(rows(tree)).toEqual({
      Part: String(partNumbers(subject(), selectSettings({ elevation: state })).byKey.get('cc')),
      Legs: '36" × 36"', Depths: '24" / 24"', 'Return side': 'End panel 13/16"',
      Doors: 'Equal', 'Leg B face': 'Same as leg A',
      'Door widths': 'Leg A 10 15/16" · leg B 10 15/16"',
      Shows: '11 1/8" on Wall 1 · 11 1/8" here',
    });
    expect(nodes(tree).find(({ type }) => type === WarningsList).props.layout).toEqual({ errors: [], warnings: [] });
    flushEffects();
    expect(state.selection.cornerOf).toBeDefined();
    expect(state.activeWallId).toBe('wall-2');
    subject().partNumberOverrides = { cc: 42 };
    expect(rows(leg()).Part).toBe('42');
  });

  it('anchor 2: renders the entire properties panel without inputs or selects', () => {
    const markup = renderToStaticMarkup(panel());
    expect(markup).toContain('Corner 90 on Wall 1');
    expect(markup).not.toMatch(/<(input|select|textarea)\b/);
  });

  it('anchor 3: Edit on Wall 1 activates the owner and selects its corner column', () => {
    nodes(leg()).find(({ type, props }) => type === 'button' && props.children === 'Edit on Wall 1').props.onClick();
    expect(state.activeWallId).toBe('wall-1');
    expect(state.activeWallSide).toBe('front');
    expect(state.selection).toMatchObject({ wallId: 'wall-1', runId: owner().id, pieceId: 'cc' });
    expect(state.selection).not.toHaveProperty('cornerOf');
  });

  it('anchor 4: shows the true 45 door width and omits the 90-only rows', () => {
    owner().ends.left.corner.kind = 45;
    const tree = leg();
    expect(text(tree)).toContain('Corner 45 on Wall 1');
    expect(rows(tree)['Door widths']).toBe('15 9/16"');
    expect(rows(tree)).not.toHaveProperty('Doors');
    expect(rows(tree)).not.toHaveProperty('Leg B face');
  });

  it.each(['filler', 'missing run', 'missing wall', 'inactive', 'wrong wall', 'wrong face'])(
    'anchor 5 and stale selection: clears selection for %s', (invalid) => {
      if (invalid === 'filler') owner().ends.left = { type: 'filler', width: null };
      if (invalid === 'missing run') ownerWall().runs = [];
      if (invalid === 'missing wall') subject().walls.shift();
      if (invalid === 'inactive') owner().anchors.left = false;
      if (invalid === 'wrong wall') state.selection.wallId = 'wall-1';
      if (invalid === 'wrong face') state.activeWallSide = 'back';
      expect(nodes(panel()).some(({ type }) => type === CornerLegProperties)).toBe(false);
      flushEffects();
      expect(state.selection).not.toHaveProperty('cornerOf');
    },
  );

  it('edits a back-face owner on its own face', () => {
    owner().wallSide = 'back';
    ownerWall().flipped = true;
    const button = nodes(leg()).find(({ type }) => type === 'button');
    button.props.onClick();
    expect(state.activeWallId).toBe('wall-1');
    expect(state.activeWallSide).toBe('back');
    expect(state.selection).toMatchObject({ runId: owner().id, pieceId: 'cc' });
    expect(state.selection).not.toHaveProperty('cornerOf');
  });

  it('reads effective doors, the B face, return fillers and no-door faces', () => {
    state.settings.cornerDoors = 'a_long';
    Object.assign(owner().ends.left.corner, { legBFace: 'panel', returnPiece: 'filler', returnWidth: 1.5 });
    expect(rows(leg())).toMatchObject({
      Doors: 'Leg A long', 'Leg B face': 'Panel', 'Return side': 'Filler 1 1/2"',
      'Door widths': 'Leg A 11 7/8" · leg B —',
    });
    owner().grid.cells[0].node.face = { type: 'panel' };
    owner().ends.left.corner.returnPiece = 'none';
    expect(rows(leg())).toMatchObject({ 'Door widths': '—', 'Return side': 'None' });
    owner().ends.left.corner.legBFace = 'door';
    expect(rows(leg())['Leg B face']).toBe('Door');
  });

  it('lists every true pair-door width and passes corner warnings through WarningsList', () => {
    owner().grid.cells[0].node.face = { type: 'pair_door' };
    // (10 15/16" door span - 1/16" pair gap) / 2 = 5 7/16" per leaf.
    expect(rows(leg())['Door widths']).toBe('Leg A 5 7/16", 5 7/16" · leg B 5 7/16", 5 7/16"');
    owner().ends.left.corner.legB = 20;
    const tree = leg();
    expect(rows(tree).Shows).toBe('—');
    const warnings = nodes(tree).find(({ type }) => type === WarningsList);
    expect(text(WarningsList(warnings.props))).toContain("The corner cabinet's legs are shorter than the depths beside them.");
  });
});
