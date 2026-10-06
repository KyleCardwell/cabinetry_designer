import { useDispatch } from 'react-redux';
import { formatInches } from '../../model/index.js';
import { setWallEndPanel } from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import Field from './Field.jsx';

const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';

/**
 * A wall end panel's width and, beside a face frame run (SPEC-36.2.1) or a back panel run (SPEC-43), how that run meets it.
 */
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
        <Field label="Joint">
          <select
            value={panel.frame ?? 'auto'}
            onChange={(event) => update({ frame: event.target.value === 'auto' ? null : event.target.value })}
            aria-label={`${label} panel joint`}
            className={SELECT_CLASS}
          >
            <option value="auto">Auto</option>
            <option value="miter">Mitered (frame or back panel covers the edge)</option>
            <option value="butt">Butted (dies into the panel)</option>
          </select>
        </Field>
      )}
    </div>
  );
}
