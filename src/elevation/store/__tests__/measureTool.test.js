import { expect, it } from 'vitest';
import elevationReducer, { createInitialElevationState, setTool } from '../elevationSlice.js';

it('accepts Measure and ignores unknown tools (MS2a)', () => {
  const state = elevationReducer(createInitialElevationState(null), setTool('measure'));
  expect(state.tool).toBe('measure');
  expect(elevationReducer(state, setTool('ruler'))).toBe(state);
});
