import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { runItems } from '../../model/grid.js';
import { splitRun } from '../../model/splitRun.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { setColumnStep } from '../../store/elevationSlice.js';
import { fixed, run as makeRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import InchInput from '../InchInput.jsx';
import ColumnStepFields from './ColumnStepFields.jsx';

vi.mock('react', async (original) => ({ ...await original(), useState: vi.fn(), useEffect: vi.fn() }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn() }));

const dispatch = vi.fn();
const manual = (value) => ({ source: 'manual', value });
const boxSegment = { id: 'segment-B', from: 'B', to: 'B', kind: 'stone', mode: 'box', drop: 2 };
const wall = { id: 'wall-1' };
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const readouts = (tree) => nodes(tree).filter(({ type }) => type === 'p').map(({ props }) => props.children);
const field = (tree, label = 'Top drop') => nodes(tree).find(({ type, props }) => type === InchInput && props['aria-label'] === label);
const render = (run, { id = 'B', nested = false } = {}) => ColumnStepFields({
  wall, run, item: runItems(run).find((item) => item.id === id), nested,
});
const anchorRun = (offsets = {}, topSegments = [boxSegment]) => makeRun({
  width: 90, x: 0, z: 4, height: 30.5, top: 'stone', style: { cabinetStyleId: 13 },
  overrides: { countertopThickness: 1.5 }, autoCount: false,
  ends: { left: { type: 'none' }, right: { type: 'none' } }, topSegments,
  items: ['A', 'B', 'C'].map((id) => ({ ...fixed(id, 30), ...(id === 'B' ? offsets : {}) })),
});

beforeEach(() => {
  vi.clearAllMocks();
  useDispatch.mockReturnValue(dispatch);
  useState.mockImplementation((initial) => [typeof initial === 'function' ? initial() : initial, vi.fn()]);
});

describe('ST6 step c column step readouts', () => {
  it('anchor 1: shows the box segment drop read-only and grayed with its row number', () => {
    const run = anchorRun();
    const tree = render(run);
    const input = InchInput(field(tree).props);
    expect(input.props).toMatchObject({ value: '2', readOnly: true });
    expect(input.props.className).toContain('text-gray-500');
    expect(readouts(tree)).toEqual(['From top segment 1']);
    input.props.onBlur();
    expect(dispatch).not.toHaveBeenCalled();
    for (const id of ['A', 'C']) {
      expect(field(render(run, { id })).props).toMatchObject({ value: null, readOnly: false });
      expect(readouts(render(run, { id }))).toEqual([]);
    }
  });

  it('anchor 2: warns that the stored manual top is ignored without overwriting it', () => {
    const run = anchorRun({ top: manual(1), bottom: manual(3) });
    const before = structuredClone(run);
    const tree = render(run);
    expect(field(tree).props).toMatchObject({ value: 2, readOnly: true });
    expect(readouts(tree)).toEqual(['From top segment 1', '⚠ Manual 1" ignored']);
    expect(nodes(tree).find(({ props }) => props.children === '⚠ Manual 1" ignored').props.className).toContain('text-amber-400');
    expect(field(tree, 'Bottom up').props).toMatchObject({ value: 3, readOnly: false });
    expect(run).toEqual(before);
  });

  it('anchor 3: leaves the top blank and editable for an overlap segment', () => {
    const run = anchorRun({}, [{ ...boxSegment, mode: 'overlap', drop: 1 }]);
    const tree = render(run);
    expect(InchInput(field(tree).props).props).toMatchObject({ value: '', readOnly: false });
    expect(readouts(tree)).toEqual(['Top overlap 1" (segment 1)']);
    expect(field(tree).props.onCommit(2)).toBe(true);
    expect(dispatch).toHaveBeenLastCalledWith(setColumnStep({
      wallId: wall.id, runId: run.id, itemId: 'B', edge: 'top', value: 2,
    }));
    const manualTree = render(anchorRun({ top: manual(2) }, run.topSegments));
    expect(field(manualTree).props).toMatchObject({ value: 2, readOnly: false });
    expect(readouts(manualTree)).toEqual(['Top overlap 1" (segment 1)']);
  });

  it('anchor 4: shows and edits a manual top drop without a segment', () => {
    const run = anchorRun({ top: manual(2) }, []);
    const tree = render(run);
    expect(InchInput(field(tree).props).props).toMatchObject({ value: '2', readOnly: false });
    expect(readouts(tree)).toEqual([]);
    expect(field(tree).props.onCommit(null)).toBe(true);
    expect(dispatch).toHaveBeenLastCalledWith(setColumnStep({
      wallId: wall.id, runId: run.id, itemId: 'B', edge: 'top', value: null,
    }));
  });

  it('uses stored row numbers for active segments, including nested column controls', () => {
    const orphan = { ...boxSegment, id: 'orphan', from: 'missing' };
    for (const mode of ['box', 'overlap']) {
      const tree = render(anchorRun({}, [orphan, { ...boxSegment, mode, drop: 1.5 }]), { nested: true });
      expect(field(tree, 'Column top drop').props).toMatchObject({ readOnly: mode === 'box' });
      expect(readouts(tree)).toEqual([mode === 'box' ? 'From top segment 2' : 'Top overlap 1 1/2" (segment 2)']);
      expect(field(tree, 'Column bottom up').props).toMatchObject({ value: null, readOnly: false });
    }
  });

  it('ignores inactive segments when displaying the value and source', () => {
    const run = anchorRun({ top: manual(2) });
    for (const inactiveRun of [
      { ...run, top: 'none' },
      { ...run, topSegments: [{ ...boxSegment, from: 'missing' }] },
    ]) {
      const tree = render(inactiveRun);
      expect(field(tree).props).toMatchObject({ value: 2, readOnly: false });
      expect(readouts(tree)).toEqual([]);
    }
    const tree = render(anchorRun({ top: manual(2) }, [
      { ...boxSegment, id: 'first', mode: 'overlap', drop: 1 }, boxSegment,
    ]));
    expect(field(tree).props).toMatchObject({ value: 2, readOnly: false });
    expect(readouts(tree)).toEqual(['Top overlap 1" (segment 1)']);
  });

  it('keeps oversized typed values visible while the solver still warns', () => {
    for (const edge of ['top', 'bottom']) {
      const run = anchorRun({ [edge]: manual(30) }, []);
      const tree = render(run);
      expect(InchInput(field(tree, edge === 'top' ? 'Top drop' : 'Bottom up').props).props)
        .toMatchObject({ value: '30', readOnly: false });
      expect(splitRun(run, DEFAULT_SETTINGS).warnings).toContainEqual({
        code: 'column-step-too-big', pieceId: 'B',
        message: 'Top drop and bottom up leave less than 1 inch of box.',
      });
    }
  });
});
