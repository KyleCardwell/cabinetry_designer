import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { runShortLabel, wallLabel } from '../../model/index.js';
import elevationReducer, { setSelection } from '../../store/elevationSlice.js';
import { auto, run as makeRun, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import PropertiesHeader from '../PropertiesHeader.jsx';
import PropertiesPanel from '../PropertiesPanel.jsx';
import PieceProperties from '../properties/PieceProperties.jsx';
import RunProperties from '../properties/RunProperties.jsx';
import WarningsList from '../properties/WarningsList.jsx';

vi.mock('react', async (original) => ({
  ...await original(),
  useState: vi.fn(),
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useRef: (value) => ({ current: value }),
  useEffect: vi.fn(),
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : tree && typeof tree === 'object' ? text(tree.props?.children)
    : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : '';
const buttons = (tree) => nodes(tree).filter(({ type }) => type === 'button');
const button = (tree, label) => buttons(tree).find((node) => text(node) === label);
const path = (tree) => nodes(tree).find(({ props }) => props['aria-label'] === 'Selection path');
const badge = (tree) => buttons(tree).find(({ props }) => props['aria-controls'] === 'properties-warnings');
let state, open;
const dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
const panel = () => PropertiesPanel();
const headerElement = () => nodes(panel()).find(({ type }) => type === PropertiesHeader);
const header = () => PropertiesHeader(headerElement().props);

beforeEach(() => {
  vi.clearAllMocks();
  open = false;
  state = stateWithRun(makeRun({ autoCount: false, items: [auto('a'), auto('b'), auto('c')] }));
  state.rooms[0].walls[0].name = 'B';
  state.selection = { wallId: 'wall-1', runId: 'run-1', pieceId: 'c' };
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
  useState.mockImplementation((initial) => [open ?? initial, (next) => {
    open = typeof next === 'function' ? next(open) : next;
  }]);
});

describe('UI3 step b properties header', () => {
  it('anchor 1: labels the third cabinet left to right and keeps the last segment plain', () => {
    const props = headerElement().props;
    expect(props.selectionContext.piece.id).toBe('c');
    // wallLabel includes the numbered wall and its custom name B.
    const wallName = wallLabel(props.room, props.wall);
    const tree = header();
    expect(text(path(tree))).toBe(`${wallName}›Run 1›Cab 3`);
    expect(buttons(path(tree)).map(text)).toEqual([wallName, 'Run 1']);
    expect(button(tree, 'Run 1').props.title).toBe(runShortLabel(props.run));
    expect(nodes(panel()).some(({ type }) => type === PieceProperties)).toBe(true);
    // Derived pieces need not be stored in horizontal order.
    expect(text(path(PropertiesHeader({ ...props, cells: { pieces: [...props.cells.pieces].reverse() } })))).toBe(`${wallName}›Run 1›Cab 3`);
  });

  it('anchor 2: navigates from the cabinet to its run and clears all child selection', () => {
    button(header(), 'Run 1').props.onClick();
    expect(dispatch).toHaveBeenLastCalledWith(setSelection({ wallId: 'wall-1', runId: 'run-1', pieceId: null }));
    expect(state.selection).toMatchObject({ wallId: 'wall-1', runId: 'run-1', pieceId: null });
    expect(text(path(header()))).toBe('Wall 1 · B›Run 1');
    expect(button(header(), 'Run 1')).toBeUndefined();
    expect(nodes(panel()).some(({ type }) => type === RunProperties)).toBe(true);
    button(header(), 'Wall 1 · B').props.onClick();
    expect(dispatch).toHaveBeenLastCalledWith(setSelection({ wallId: 'wall-1' }));
    expect(state.selection).toMatchObject({ wallId: 'wall-1', runId: null, pieceId: null, openingId: null, soffitId: null, recessId: null });
    expect(text(path(header()))).toBe('Wall 1 · B');
    expect(buttons(header())).toHaveLength(0);
  });

  it('anchor 3: toggles both warning lines for run and piece selections, with no bottom list', () => {
    const layout = { ...headerElement().props.layout, errors: [], warnings: [
      { code: 'crown-above-ceiling' }, { code: 'mixed-counter-heights' },
    ] };
    for (const pieceId of [null, 'c']) {
      state.selection.pieceId = pieceId;
      open = false;
      const props = { ...headerElement().props, layout };
      let tree = PropertiesHeader(props);
      expect(text(badge(tree))).toBe('⚠ 2');
      expect(badge(tree).props['aria-expanded']).toBe(false);
      expect(nodes(tree).some(({ type }) => type === WarningsList)).toBe(false);
      badge(tree).props.onClick();
      tree = PropertiesHeader(props);
      expect(badge(tree).props['aria-expanded']).toBe(true);
      const list = nodes(tree).find(({ type }) => type === WarningsList);
      const lines = nodes(WarningsList(list.props)).filter(({ type }) => type === 'li').map(text);
      expect(lines).toEqual(['The crown profile extends above the wall height.', 'The runs below this one have different top heights.']);
      badge(tree).props.onClick();
      expect(nodes(PropertiesHeader(props)).some(({ type }) => type === WarningsList)).toBe(false);
      expect(nodes(RunProperties({ ...props, settings: state.settings, showMessage: vi.fn() }))
        .some(({ type }) => type === WarningsList)).toBe(false);
    }
  });

  it('anchor 4: shows Properties with no badge when nothing is selected', () => {
    state.selection = {};
    const tree = header();
    expect(text(tree)).toBe('Properties');
    expect(badge(tree)).toBeUndefined();
    expect(tree.props.className).toContain('sticky top-0 z-10');
  });

  it('labels wall features, back faces and every derived piece kind', () => {
    const props = headerElement().props;
    const base = { ...props, run: null, selectionContext: null };
    const cases = [
      [{ opening: { kind: 'door' } }, 'Door'],
      [{ opening: { kind: 'window' } }, 'Window'],
      [{ soffit: {} }, 'Soffit'], [{ recess: {} }, 'Recess'],
      [{ endPanel: { front: { side: 'left' } } }, 'Left end panel'],
      [{ endPanel: { front: { side: 'right' } } }, 'Right end panel'],
    ];
    for (const [feature, label] of cases) {
      const tree = PropertiesHeader({ ...base, ...feature });
      expect(text(path(tree))).toBe(`Wall 1 · B›${label}`);
      button(tree, 'Wall 1 · B').props.onClick();
      expect(state.selection.runId).toBeNull();
    }
    expect(text(path(PropertiesHeader({ ...base, wall: { ...base.wall, side: 'back' } })))).toBe('Wall 1 · B · Back');
    for (const [context, label] of [
      [{ piece: { kind: 'void' } }, 'Section'],
      [{ piece: { kind: 'shelves' } }, 'Section'],
      [{ piece: { kind: 'filler' } }, 'Filler'],
      [{ piece: {}, side: 'left' }, 'Left end'],
      [{ piece: {}, side: 'right' }, 'Right end'],
      [{ piece: { role: 'tee' }, tee: {} }, 'T-filler'],
    ]) {
      expect(text(path(PropertiesHeader({ ...props, selectionContext: context })))).toBe(`Wall 1 · B›Run 1›${label}`);
    }
  });

  it('counts visible diagnostics, resets the dropdown on selection changes and protects the final label from truncation', () => {
    const props = headerElement().props;
    const layout = { ...props.layout, warnings: [{ code: 'overhang' }], errors: [] };
    expect(badge(PropertiesHeader({ ...props, layout }))).toBeUndefined();
    layout.errors = [{ code: 'over-constrained' }];
    expect(text(badge(PropertiesHeader({ ...props, layout })))).toBe('⚠ 1');
    const tree = PropertiesHeader({ ...props, layout });
    const last = path(tree).props.children.at(-1);
    expect(last.props.className).toContain('shrink-0');
    expect(nodes(last).some(({ props }) => props.className?.includes('truncate'))).toBe(false);
    expect(button(tree, 'Run 1').props.className).toContain('truncate');
    const pieceKey = headerElement().key;
    state.selection.pieceId = 'a';
    expect(headerElement().key).not.toBe(pieceKey);
    state.selection.runId = null;
    expect(headerElement().key).not.toBe(pieceKey);
  });
});
