import { useDispatch } from 'react-redux';
import {
  REVEAL_KEYS,
  REVEAL_SOURCE_LABELS,
  formatInches,
  resolveStyle,
} from '../../model/index.js';
import { setItemReveals, setItemStyle } from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import StyleFields from './StyleFields.jsx';

const REVEAL_STEP = 1 / 32;

const REVEAL_LABELS = {
  top: 'Top',
  bottom: 'Bottom',
  left: 'Left',
  right: 'Right',
  horizontal: 'Between stacked',
  vertical: 'Between side by side',
};

// `faceLayout` is this cabinet's entry from runFaceLayouts (faces, style, reveals).
export default function CabinetStyleProperties({ room, wall, run, item, settings, faceLayout }) {
  const dispatch = useDispatch();
  const at = { wallId: wall.id, runId: run.id, itemIds: [item.id] };
  const manual = item.reveals ?? {};
  const { values, sources } = faceLayout.reveals;

  const setReveal = (key, value) => {
    dispatch(setItemReveals({ ...at, reveals: { ...manual, [key]: value } }));
    return true;
  };

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Cabinet style</h3>
      <StyleFields
        label="Cabinet"
        value={item.style}
        inherited={resolveStyle(settings, room, run)}
        onChange={(style) => dispatch(setItemStyle({ ...at, style }))}
      />

      <div className="space-y-1.5">
        <p className="text-xs text-gray-400">Reveals (blank = automatic)</p>
        {REVEAL_KEYS.map((key) => (
          <div key={key} className="grid grid-cols-[1fr_5rem] items-center gap-2 text-xs">
            <span className="text-gray-400">
              {REVEAL_LABELS[key]}
              <span className="ml-1 text-gray-500">
                {formatInches(values[key], REVEAL_STEP)} · {REVEAL_SOURCE_LABELS[sources[key]]}
              </span>
            </span>
            <InchInput
              value={manual[key] ?? null}
              allowBlank
              displayStep={REVEAL_STEP}
              onCommit={(next) => setReveal(key, next)}
              aria-label={`Manual ${REVEAL_LABELS[key]} reveal`}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
