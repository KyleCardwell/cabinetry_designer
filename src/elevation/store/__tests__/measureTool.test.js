import { expect, it } from 'vitest';
import elevationReducer, { createInitialElevationState, setTool } from '../elevationSlice.js';

it('MS2a anchor 1: accepts Measure and ignores unknown tools', () => {
  const state = elevationReducer(createInitialElevationState(null), setTool('measure'));
  expect(state.tool).toBe('measure');
  expect(elevationReducer(state, setTool('ruler'))).toBe(state);
});
