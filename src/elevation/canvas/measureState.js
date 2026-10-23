import { useCallback, useEffect, useReducer } from 'react';
import { measureBetween, snapMeasure } from '../model/measure.js';

const initialState = () => ({ first: null, hover: null, measures: [] });

/** Measurements belong to one canvas session, outside the saved room model. */
export function measureReducer(state = initialState(), action) {
  switch (action.type) {
    case 'hover':
      return { ...state, hover: action.pick };
    case 'click': {
      if (!state.first) return { ...state, first: action.pick };
      const result = measureBetween(state.first, action.pick);
      if (result.distance < 1e-6 && state.first.kind !== 'edge' && action.pick.kind !== 'edge') return state;
      return {
        ...state,
        first: null,
        measures: [...state.measures, { a: state.first, b: action.pick, result }],
      };
    }
    case 'escape':
      return state.first ? { ...state, first: null } : { ...state, measures: [] };
    case 'cancelFirst':
      return { ...state, first: null };
    case 'reset':
      return initialState();
    default:
      return state;
  }
}

export function measurePreview(state) {
  return state.first && state.hover ? measureBetween(state.first, state.hover) : null;
}

export function useMeasure({ active, geometry, tolerance, resetKey }) {
  const [state, dispatch] = useReducer(measureReducer, undefined, initialState);
  useEffect(() => {
    dispatch({ type: 'reset' });
  }, [active, resetKey]);

  const move = useCallback((world, shift) => {
    if (!active) return;
    dispatch({ type: 'hover', pick: snapMeasure(world, geometry, tolerance, { pointOnly: shift }) });
  }, [active, geometry, tolerance]);
  const click = useCallback((world, shift) => {
    if (!active) return;
    dispatch({ type: 'click', pick: snapMeasure(world, geometry, tolerance, { pointOnly: shift }) });
  }, [active, geometry, tolerance]);
  const leave = useCallback(() => dispatch({ type: 'hover', pick: null }), []);
  const escape = useCallback(() => {
    if (!state.first && state.measures.length === 0) return false;
    dispatch({ type: 'escape' });
    return true;
  }, [state.first, state.measures]);
  const cancelFirst = useCallback(() => dispatch({ type: 'cancelFirst' }), []);

  return { ...state, preview: measurePreview(state), move, click, leave, escape, cancelFirst };
}
