import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { toDrawingPayload } from '../../model/drawingPayload.js';
import elevationReducer, { createInitialElevationState } from '../../store/elevationSlice.js';
import { isElevationDocument, normalizeElevationDocument, toElevationDocument } from '../../store/persistence.js';
import SettingsPanel from '../SettingsPanel.jsx';
import ElevationToolbar from '../ElevationToolbar.jsx';
import { selectSettings } from '../../store/selectors.js';

vi.mock('react', async (original) => ({ ...await original(), useState: vi.fn() }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const field = (tree, label) => nodes(tree).find(({ props }) => props['aria-label'] === label);
let state;

beforeEach(() => {
  vi.clearAllMocks();
  state = createInitialElevationState(null);
  useState.mockReturnValue([true, vi.fn()]);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
  useDispatch.mockReturnValue((action) => { state = elevationReducer(state, action); });
});

describe('Step 524 PDF paper control', () => {
  it('anchor 4: shows the three labelled paper options directly under Drawing scale with the same look', () => {
    const tree = SettingsPanel();
    const selects = nodes(tree).filter(({ type }) => type === 'select');
    const scale = field(tree, 'Drawing scale');
    const paper = field(tree, 'PDF paper');
    expect(selects[selects.indexOf(scale) + 1]).toBe(paper);
    expect(paper.props.value).toBe('archD');
    expect(paper.props.className).toBe(scale.props.className);
    const label = nodes(tree).find(({ type, props }) => type === 'label' && nodes(props.children).includes(paper));
    expect(label.props.children[0]).toBe('PDF paper');
    expect(label.props.className).toBe('block text-xs text-gray-400');
    expect(nodes(paper).filter(({ type }) => type === 'option').map(({ props }) => [props.value, props.children]))
      .toEqual([
        ['letter', 'Letter (8.5 × 11)'],
        ['ledger', 'Ledger (11 × 17)'],
        ['archD', 'Arch D (24 × 36)'],
      ]);
  });

  it('selecting Letter updates prefs and drawing export, then resets to Arch D on load', () => {
    field(SettingsPanel(), 'PDF paper').props.onChange({ target: { value: 'letter' } });
    expect(state.prefs.paperSize).toBe('letter');
    expect(state.settings).not.toHaveProperty('paperSize');
    expect(field(SettingsPanel(), 'PDF paper').props.value).toBe('letter');
    expect(toDrawingPayload(state.rooms[0], selectSettings({ elevation: state })).paperSize).toBe('letter');
    const saved = toElevationDocument(state);
    expect(saved.settings).not.toHaveProperty('paperSize');
    const loaded = normalizeElevationDocument(JSON.parse(JSON.stringify(saved)));
    expect(isElevationDocument(loaded)).toBe(true);
    const restored = createInitialElevationState(loaded);
    expect(restored.prefs.paperSize).toBe('archD');
    expect(toDrawingPayload(restored.rooms[0], selectSettings({ elevation: restored })).paperSize).toBe('archD');
  });

  it('groups view controls and routes their changes and toolbar toggles into prefs', () => {
    const tree = SettingsPanel();
    const view = nodes(tree).find(({ type, props }) => type === 'div'
      && nodes(props.children).some(({ type, props }) => type === 'h3' && props.children === 'View (not saved)'));
    field(view, 'Drawing scale').props.onChange({ target: { value: '32' } });
    field(view, 'Orthogonal plan walls').props.onChange({ target: { checked: false } });
    for (const [key, label, value] of [
      ['planGrid', 'Plan grid', 1], ['openingSnap', 'Opening snap', 2],
      ['cornerSnapDistance', 'Corner snap distance', 6],
    ]) {
      field(view, label).props.onCommit(value);
      expect(state.prefs[key]).toBe(value);
      expect(state.settings).not.toHaveProperty(key);
    }
    expect(state.prefs.plotScale).toBe(32);
    expect(state.prefs.orthoWalls).toBe(false);
    nodes(ElevationToolbar({})).find(({ props }) => props.children === 'Ortho').props.onClick();
    expect(state.prefs.orthoWalls).toBe(true);
    state = { ...state, view: 'elevation' };
    const toggle = () => nodes(ElevationToolbar({})).find(({ props }) => props.children === 'Part #');
    expect(toggle().props['aria-pressed']).toBe(false);
    toggle().props.onClick();
    expect(state.prefs.showPartNumbers).toBe(true);
    expect(state.settings).not.toHaveProperty('showPartNumbers');
  });
});
