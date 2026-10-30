import { expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { deleteLayoutLine } from '../../store/elevationSlice.js';
import useElevationKeys from './useElevationKeys.js';

vi.mock('react', async (original) => ({ ...await original(), useEffect: vi.fn() }));
vi.mock('react-redux', () => ({ useSelector: vi.fn() }));

it('LL3 5: Delete removes the selected layout line', () => {
  const dispatch = vi.fn();
  let listener;
  let cleanup;
  vi.stubGlobal('window', { addEventListener: (_, fn) => { listener = fn; }, removeEventListener: vi.fn() });
  vi.stubGlobal('document', { querySelector: () => null });
  useEffect.mockImplementation((effect) => { cleanup = effect(); });
  useSelector.mockImplementation((selector) => selector({ elevation: { tool: 'select', view: 'elevation' } }));
  try {
    useElevationKeys({
      cursor: { releaseHold: vi.fn() }, dispatch, dragRef: { current: null }, setAlignmentGuides: vi.fn(),
      selectionRef: { current: { lineId: 'L1' } }, wallRef: { current: { id: 'H', openings: [], runs: [] } },
      tool: 'select',
    });
    const event = { key: 'Delete', target: { tagName: 'DIV' }, preventDefault: vi.fn() };
    listener(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(deleteLayoutLine({ wallId: 'H', lineId: 'L1' }));
  } finally {
    cleanup?.();
    vi.unstubAllGlobals();
  }
});
