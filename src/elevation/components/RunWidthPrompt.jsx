import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { runWidthChoices } from '../model/runWidthChoices.js';
import { applyRunWidthChoice, closeRunWidthPrompt } from '../store/elevationSlice.js';
import { selectSettings } from '../store/selectors.js';

/**
 * What Apply does with the picked option (LL6): a non-final remove only adds to `removed` (the list
 * refreshes), anything else is the `applyRunWidthChoice` payload.
 */
export function pickResult(prompt, choices, option) {
  if (!option) return null;
  if (option.type === 'remove' && !option.final) return { removed: [...choices.removed, option.itemId] };
  const removed = option.type === 'remove' ? [...choices.removed, option.itemId] : choices.removed;
  return {
    apply: {
      ...(prompt.roomId ? { roomId: prompt.roomId } : {}),
      wallId: prompt.wallId, runId: prompt.runId, width: prompt.width, grow: prompt.grow,
      removed,
      auto: option.type === 'auto' ? option.itemId : null,
      end: option.type === 'end' ? { side: option.side, width: option.width } : null,
    },
  };
}

/** The dialog body: header, the options as radios, Apply / Cancel. */
export function RunWidthPromptView({ choices, picked = 0, onPick, onApply, onCancel }) {
  const empty = choices.options.length === 0;
  return (
    <div className="absolute inset-0 z-30 flex items-start justify-center bg-black/40 px-4 pt-20">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Typed width"
        className="w-[420px] max-w-full rounded-lg border border-gray-600 bg-gray-800 p-4 text-sm text-gray-100 shadow-xl"
      >
        <p className="font-medium">{choices.header}</p>
        {choices.without && <p className="mt-1 text-xs text-gray-400">{choices.without}</p>}
        {empty ? (
          <p className="mt-3 text-gray-300">Nothing can change to fit; cancel.</p>
        ) : (
          <div className="mt-3 space-y-1.5" role="radiogroup" aria-label="Which typed width changes">
            {choices.options.map((option, index) => (
              <label key={`${option.type}-${option.itemId ?? option.side}`} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="run-width-choice"
                  checked={index === picked}
                  onChange={() => onPick(index)}
                  aria-label={option.label}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-gray-600 px-3 py-1 text-gray-200 hover:bg-gray-700"
          >
            Cancel
          </button>
          {!empty && (
            <button
              type="button"
              onClick={onApply}
              className="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-500"
            >
              Apply
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** LL6: asks which typed width gives way when a typed run width can't fit. Driven by `widthPrompt`. */
export default function RunWidthPrompt() {
  const dispatch = useDispatch();
  const prompt = useSelector((state) => state.elevation.widthPrompt);
  const room = useSelector((state) => state.elevation.rooms.find(
    (candidate) => candidate.id === (prompt?.roomId ?? state.elevation.activeRoomId),
  ) ?? null);
  const settings = useSelector(selectSettings);
  const [removed, setRemoved] = useState([]);
  const [picked, setPicked] = useState(0);

  useEffect(() => {
    setRemoved([]);
    setPicked(0);
  }, [prompt]);

  useEffect(() => {
    const target = globalThis.window;
    if (!prompt || !target) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      dispatch(closeRunWidthPrompt());
    };
    target.addEventListener('keydown', onKeyDown);
    return () => target.removeEventListener('keydown', onKeyDown);
  }, [dispatch, prompt]);

  if (!prompt || !room) return null;
  const choices = runWidthChoices(
    room, prompt.wallId, prompt.runId, prompt.width, prompt.grow, settings, removed,
  );
  if (!choices.needsChoice) return null;
  return (
    <RunWidthPromptView
      choices={choices}
      picked={picked}
      onPick={setPicked}
      onCancel={() => dispatch(closeRunWidthPrompt())}
      onApply={() => {
        const result = pickResult(prompt, choices, choices.options[picked]);
        if (result?.removed) {
          setRemoved(result.removed);
          setPicked(0);
        } else if (result?.apply) {
          dispatch(applyRunWidthChoice(result.apply));
        }
      }}
    />
  );
}
