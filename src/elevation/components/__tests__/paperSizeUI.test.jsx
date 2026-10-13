import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { toDrawingPayload } from '../../model/drawingPayload.js';
import elevationReducer, { createInitialElevationState } from '../../store/elevationSlice.js';
import { isElevationDocument, normalizeElevationDocument, toElevationDocument } from '../../store/persistence.js';
import SettingsPanel from '../SettingsPanel.jsx';

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
    expect(paper.props.value).toBe('letter');
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

  it('anchor 2: selecting Arch D updates settings, persists the pick and exports Arch D paper', () => {
    field(SettingsPanel(), 'PDF paper').props.onChange({ target: { value: 'archD' } });
    expect(state.settings.paperSize).toBe('archD');
    expect(field(SettingsPanel(), 'PDF paper').props.value).toBe('archD');
    const saved = toElevationDocument(state);
    expect(saved.settings.paperSize).toBe('archD');
    const loaded = normalizeElevationDocument(JSON.parse(JSON.stringify(saved)));
    expect(isElevationDocument(loaded)).toBe(true);
    const restored = createInitialElevationState(loaded);
    expect(restored.settings.paperSize).toBe('archD');
    expect(toDrawingPayload(restored.rooms[0], restored.settings).paperSize).toBe('archD');
  });
});
