import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setMessage } from '../store/elevationSlice.js';

const MESSAGE_TEXT = {
  conflict: 'That overlaps another run.',
  'out-of-bounds': 'That goes outside the wall.',
  'stack-cycle': "Can't stack those: it would loop back on itself.",
  'stack-no-overlap': "Those runs don't overlap side to side, so one can't sit on the other.",
  'stack-wall-side': 'Those runs are on different sides of the wall.',
  'follow-cycle': "Can't follow that edge: it would loop back on itself.",
  'joint-same-run': "A run can't join both of its own edges to one joint.",
  'run-not-found': "That run isn't there any more.",
};

/** The current message, under the toolbar, until it's dismissed or times out. */
export default function MessageToast() {
  const dispatch = useDispatch();
  const message = useSelector((state) => state.elevation.message);

  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => dispatch(setMessage(null)), 6000);
    return () => clearTimeout(timer);
  }, [dispatch, message]);

  if (!message) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-4">
      <div
        role="status"
        className="pointer-events-auto flex max-w-xl items-start gap-3 rounded-md border border-amber-500/60 bg-gray-900/95 px-4 py-2.5 text-sm text-amber-200 shadow-lg"
      >
        <span>{MESSAGE_TEXT[message] ?? message}</span>
        <button
          type="button"
          onClick={() => dispatch(setMessage(null))}
          aria-label="Dismiss message"
          className="text-amber-300/80 hover:text-amber-100"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
