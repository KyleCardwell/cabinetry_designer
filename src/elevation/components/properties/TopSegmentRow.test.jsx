import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDispatch } from 'react-redux';
import { updateTopSegment } from '../../store/elevationSlice.js';
import TopSegmentRow from './TopSegmentRow.jsx';

vi.mock('react-redux', () => ({ useDispatch: vi.fn() }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const dispatch = vi.fn();
const segment = { id: 's', from: 'B', to: 'B', kind: 'stone', drop: 1, mode: 'box' };
const modeSelect = (storedSegment = segment) => nodes(TopSegmentRow({
  wall: { id: 'wall-1' }, run: { id: 'run-1' }, segment: storedSegment, index: 0,
  columns: [{ id: 'B', width: 30 }], warnings: [],
})).find(({ type, props }) => type === 'select' && props['aria-label'] === 'Segment 1 Mode');

beforeEach(() => {
  vi.clearAllMocks();
  useDispatch.mockReturnValue(dispatch);
});

describe('ST5 step c top segment mode', () => {
  it('anchor 1: defaults to Box drops and dispatches the selected mode', () => {
    const select = modeSelect();
    expect(select.props.value).toBe('box');
    expect(nodes(select).filter(({ type }) => type === 'option')
      .map(({ props }) => [props.value, props.children])).toEqual([
      ['box', 'Box drops'], ['overlap', 'Top overlaps'],
    ]);
    for (const mode of ['overlap', 'box']) {
      select.props.onChange({ target: { value: mode } });
      expect(dispatch).toHaveBeenLastCalledWith(updateTopSegment({
        wallId: 'wall-1', runId: 'run-1', segmentId: 's', changes: { mode },
      }));
    }
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it('anchor 2: shows Top overlaps for a stored overlap segment', () => {
    const select = modeSelect({ ...segment, mode: 'overlap' });
    expect(select.props.value).toBe('overlap');
    expect(nodes(select).find(({ type, props }) => type === 'option'
      && props.value === select.props.value).props.children).toBe('Top overlaps');
    expect(dispatch).not.toHaveBeenCalled();
  });
});
