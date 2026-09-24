import { useDispatch } from 'react-redux';
import { formatInchesInput } from '../../model/index.js';
import { setRunBlind, setRunEnd, setRunEndFiller } from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import Field from './Field.jsx';

const END_TYPES = [
  ['end_panel', 'End panel'],
  ['none', 'None'],
  ['filler', 'Filler'],
  ['blind', 'Blind corner'],
];

export default function EndFields({ actionBase, run, side, settings, note = null }) {
  const dispatch = useDispatch();
  const endType = run.ends[side].type;

  return (
    <>
      <Field label={`${side[0].toUpperCase()}${side.slice(1)} End`}>
        <select
          value={endType}
          onChange={(event) => dispatch(setRunEnd({
            ...actionBase,
            side,
            end: { type: event.target.value, width: null },
          }))}
          aria-label={`${side} end type`}
          className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
        >
          {END_TYPES.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </Field>
      {note && (
        <p className="mt-1.5 text-xs text-gray-500">{note}</p>
      )}
      {endType !== 'none' && (
        <Field label={endType === 'end_panel' ? 'Width' : 'Visible width'}>
          <InchInput
            value={run.ends[side].width}
            allowBlank
            placeholder={endType === 'end_panel'
              ? formatInchesInput(settings.endPanelThickness)
              : 'auto'}
            onCommit={(width) => dispatch(setRunEnd({
              ...actionBase,
              side,
              end: { type: endType, width },
            }))}
            aria-label={`${side} end width`}
          />
        </Field>
      )}
      {endType === 'blind' && (
        <Field label="Blind box">
          <InchInput
            value={run.blind?.[side] ?? null}
            allowBlank
            placeholder="none"
            onCommit={(width) => dispatch(setRunBlind({
              ...actionBase,
              side,
              width,
            }))}
            aria-label={`${side} blind box width`}
          />
        </Field>
      )}
      {(endType === 'filler' || endType === 'blind') && (
        <>
          <Field label="Ordered width">
            <InchInput
              value={run.endFiller?.[side]?.width ?? null}
              allowBlank
              placeholder={endType === 'blind'
                ? formatInchesInput(settings.blindFillerWidth)
                : 'from layout'}
              onCommit={(value) => dispatch(setRunEndFiller({
                ...actionBase,
                side,
                key: 'width',
                value,
              }))}
              aria-label={`${side} end filler ordered width`}
            />
          </Field>
          <Field label="Return">
            <InchInput
              value={run.endFiller?.[side]?.returnDepth ?? null}
              allowBlank
              placeholder={endType === 'blind'
                ? '0"'
                : formatInchesInput(settings.fillerReturnDepth)}
              onCommit={(value) => dispatch(setRunEndFiller({
                ...actionBase,
                side,
                key: 'returnDepth',
                value,
              }))}
              aria-label={`${side} end filler return depth`}
            />
          </Field>
          <p className="mt-1.5 text-xs text-gray-500">
            {endType === 'blind'
              ? 'Box width of the cabinet at this end. The extra runs into the corner. The filler is ordered 6" with no return; the elevation still shows what fits.'
              : 'Ordered width and return depth. The elevation still shows what fits.'}
          </p>
        </>
      )}
    </>
  );
}

