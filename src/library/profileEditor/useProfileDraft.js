import { useCallback, useEffect, useReducer, useRef } from 'react';

const initialState = (saved) => ({ draft: structuredClone(saved), past: [], future: [] });
const shape = (profile) => JSON.stringify([profile.kind, profile.geometry, profile.attach, profile.drawnPoints]);

function reducer(state, action) {
  const { draft, past, future } = state;
  switch (action.type) {
    case 'reset':
      return initialState(action.saved);
    case 'apply':
      return { draft: action.next, past: [...past, draft].slice(-100), future: [] };
    case 'undo':
      return past.length === 0 ? state : {
        draft: past.at(-1), past: past.slice(0, -1), future: [draft, ...future],
      };
    case 'redo':
      return future.length === 0 ? state : {
        draft: future[0], past: [...past, draft].slice(-100), future: future.slice(1),
      };
    default:
      return state;
  }
}

export default function useProfileDraft(saved) {
  const [state, dispatch] = useReducer(reducer, saved, initialState);
  const savedId = useRef(saved?.id);

  useEffect(() => {
    if (savedId.current !== saved?.id) {
      savedId.current = saved?.id;
      dispatch({ type: 'reset', saved });
    }
  }, [saved]);

  const apply = useCallback((next) => dispatch({ type: 'apply', next }), []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);

  return {
    draft: state.draft,
    apply,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    dirty: Boolean(saved && state.draft && shape(state.draft) !== shape(saved)),
  };
}
