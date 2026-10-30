import { useDispatch } from 'react-redux';
import { endHeightMode, frontDepth, runBlind } from '../../model/index.js';
import { teamDoorStyle } from '../../model/doorStyles.js';
import { panelLevels } from '../../model/doorStyleResolve.js';
import { cornerLap } from '../../model/cornerLaps.js';
import { isJoinedEnd } from '../../model/panelThickness.js';
import {
  setPartStyle, setRunBlind, setRunEnd, setRunEndExtend, setRunEndFiller,
} from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import { autoInchProps } from '../autoInchProps.js';
import ExtendFields from './ExtendFields.jsx';
import Field from './Field.jsx';
import PartStyleFields from './PartStyleFields.jsx';

const END_TYPES = [
  ['end_panel', 'End panel'],
  ['none', 'None'],
  ['filler', 'Filler'],
  ['blind', 'Blind corner'],
];

export default function EndFields({
  actionBase, room, wall, run, side, settings, note = null, extendRuns = [],
}) {
  const dispatch = useDispatch();
  const end = run.ends[side];
  const endType = end.type;
  const defaultHeight = endHeightMode({ type: endType });
  const where = { ...actionBase, part: 'runEnd', side };
  const lap = endType === 'filler' && room && wall
    ? cornerLap(room, wall, run, side, settings, { ignoreOwn: true }) : null;

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
            <option key={value} value={value}>
              {value === 'filler' && run._frame ? 'Face frame stile' : label}
            </option>
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
            {...autoInchProps({
              auto: run._endThickness?.[side] ?? teamDoorStyle(settings).thickness,
              text: endType === 'end_panel' ? undefined : 'auto',
              onCommit: (width) => dispatch(setRunEnd({
                ...actionBase,
                side,
                end: { type: endType, width },
              })) })}
            aria-label={`${side} end width`}
          />
        </Field>
      )}
      {(endType === 'filler' || endType === 'end_panel') && (
        <Field label="Height">
          <select
            value={endHeightMode(end)}
            onChange={(event) => dispatch(setRunEnd({
              ...actionBase,
              side,
              end: {
                type: endType,
                width: end.width,
                height: event.target.value === defaultHeight ? null : event.target.value,
              },
            }))}
            aria-label={`${side} end height`}
            className={`w-full rounded border bg-gray-900 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none ${end.height == null
              ? 'border-gray-600 text-gray-500' : 'border-teal-500 text-gray-100'}`}
          >
            <option value="full">Full height</option>
            <option value="cabinets">Match cabinets</option>
          </select>
        </Field>
      )}
      {endType === 'end_panel' && (
        <Field label="L-shape">
          <select
            value={run.endFiller?.[side]?.tFiller === true ? 'yes'
              : run.endFiller?.[side]?.tFiller === false ? 'no' : 'follow'}
            onChange={(event) => dispatch(setRunEndFiller({
              ...actionBase,
              side,
              key: 'tFiller',
              value: { follow: null, yes: true, no: false }[event.target.value],
            }))}
            aria-label={`${side} end panel L-shape`}
            className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          >
            <option value="follow">Follow run</option>
            <option value="yes">L-shape</option>
            <option value="no">Plain panel</option>
          </select>
        </Field>
      )}
      {endType !== 'none' && (
        <ExtendFields
          directions={['up', 'down']}
          extend={run.ends[side].extend}
          runs={extendRuns}
          label={`${side} end`}
          onChange={(direction, target) => dispatch(setRunEndExtend({
            ...actionBase, side, direction, target,
          }))}
        />
      )}
      {endType === 'blind' && (
        <Field label="Blind box">
          <InchInput
            value={runBlind(run)?.[side] ?? null}
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
              {...autoInchProps({ auto: settings.blindFillerWidth, text: endType === 'blind' ? undefined : 'from layout',
                onCommit: (value) => dispatch(setRunEndFiller({
                  ...actionBase,
                  side,
                  key: 'width',
                  value,
                })) })}
              aria-label={`${side} end filler ordered width`}
            />
          </Field>
          <Field label="Return">
            <InchInput
              value={run.endFiller?.[side]?.returnDepth ?? null}
              {...autoInchProps({ auto: settings.fillerReturnDepth, text: endType === 'blind' ? '0"' : undefined,
                onCommit: (value) => dispatch(setRunEndFiller({
                  ...actionBase,
                  side,
                  key: 'returnDepth',
                  value,
                })) })}
              aria-label={`${side} end filler return depth`}
            />
          </Field>
          {lap && (
            <Field label="Corner">
              <select
                value={run.endFiller?.[side]?.cornerLap ?? 'auto'}
                onChange={(event) => dispatch(setRunEndFiller({
                  ...actionBase,
                  side,
                  key: 'cornerLap',
                  value: event.target.value === 'auto' ? null : event.target.value,
                }))}
                aria-label={`${side} end filler corner`}
                className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
              >
                <option value="auto">{lap.laps ? 'Auto (laps over)' : 'Auto (dies in)'}</option>
                <option value="over">Laps over</option>
                <option value="into">Dies in</option>
              </select>
            </Field>
          )}
          {endType === 'filler' && (
            <Field label="T-filler">
              <select
                value={run.endFiller?.[side]?.tFiller === true ? 'yes'
                  : run.endFiller?.[side]?.tFiller === false ? 'no' : 'follow'}
                onChange={(event) => dispatch(setRunEndFiller({
                  ...actionBase,
                  side,
                  key: 'tFiller',
                  value: { follow: null, yes: true, no: false }[event.target.value],
                }))}
                aria-label={`${side} end filler T-filler`}
                className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
              >
                <option value="follow">Follow run</option>
                <option value="yes">T-filler</option>
                <option value="no">Plain filler</option>
              </select>
            </Field>
          )}
          <p className="mt-1.5 text-xs text-gray-500">
            {endType === 'blind'
              ? 'Box width of the cabinet at this end. The extra runs into the corner. The filler is ordered 6" with no return; the elevation still shows what fits.'
              : 'Ordered width and return depth. The elevation still shows what fits.'}
          </p>
        </>
      )}
      {room && wall && (endType === 'end_panel' || endType === 'blind') && (
        <PartStyleFields
          room={room}
          settings={settings}
          partType="panel"
          part={run.ends[side]}
          levels={panelLevels(room, wall, run, run.ends[side], { sheet: isJoinedEnd(run, side) })}
          width={frontDepth(run, settings)}
          height={run.height}
          label={`${side === 'left' ? 'Left' : 'Right'} end panel`}
          onChange={(patch) => dispatch(setPartStyle({ ...where, ...patch }))}
        />
      )}
    </>
  );
}
