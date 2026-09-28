import { useDispatch } from 'react-redux';
import { formatInches } from '../../model/index.js';
import { setWallEndPanel } from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import Field from './Field.jsx';

const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';

/** A wall end panel's width and, beside a face frame run, how the frame meets it (SPEC-36.2.1). */
export default function WallEndPanelFields({
  wall, endpoint, panel, label, framed, settings,
}) {
  const dispatch = useDispatch();
  const update = (changes) => dispatch(setWallEndPanel({
    wallId: wall.id,
    endpoint,
    panel: { width: panel.width ?? null, frame: panel.frame ?? null, ...changes },
  }));

  return (
    <div className="space-y-2.5">
      <Field label="Width">
        <InchInput
          value={panel.width}
          allowBlank
          placeholder={formatInches(settings.endPanelThickness)}
          onCommit={(width) => update({ width })}
          aria-label={`${label} panel width`}
        />
      </Field>
      {framed && (
        <Field label="Face frame">
          <select
            value={panel.frame ?? 'auto'}
            onChange={(event) => update({ frame: event.target.value === 'auto' ? null : event.target.value })}
            aria-label={`${label} panel face frame`}
            className={SELECT_CLASS}
          >
            <option value="auto">Auto</option>
            <option value="miter">Frame covers the panel edge</option>
            <option value="butt">Frame dies into the panel</option>
          </select>
        </Field>
      )}
    </div>
  );
}
