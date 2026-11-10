import { useDispatch } from 'react-redux';
import { endHeightMode, formatInches, frontDepth, runBlind } from '../../model/index.js';
import { cornerDepthBAuto, cornerEnd, defaultLegA } from '../../model/cornerEnd.js';
import { cornerEndActive, cornerOwnersAt, cornerReturnRuns } from '../../model/corners.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { wallLabel } from '../../model/topology.js';
import { endFit, endPieceType } from '../../model/endLegs.js';
import { teamDoorStyle } from '../../model/doorStyles.js';
import { panelLevels } from '../../model/doorStyleResolve.js';
import { cornerLap } from '../../model/cornerLaps.js';
import { isJoinedEnd } from '../../model/panelThickness.js';
import {
  setPartStyle, setRunBlind, setRunEnd, setRunEndExtend, setRunEndFiller, setTrackSize,
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

const CORNER_DOORS = [
  ['equal', 'Equal'],
  ['a_long', 'Leg A long'],
  ['b_long', 'Leg B long'],
];

export default function EndFields({
  actionBase, room, wall, run, side, settings, note = null, extendRuns = [],
}) {
  const dispatch = useDispatch();
  const end = run.ends[side];
  const endType = endPieceType(run, side);
  const fitted = endFit(run, side);
  const defaultHeight = endHeightMode({ type: endType });
  const where = { ...actionBase, part: 'runEnd', side };
  const lap = endType === 'filler' && room && wall
    ? cornerLap(room, wall, run, side, settings, { ignoreOwn: true }) : null;
  const isCorner = endType === 'corner';
  const offersCorner = isCorner || (room && wall && cornerEndActive(room, wall, {
    ...run, ends: { ...run.ends, [side]: { type: 'corner' } },
  }, side).active);
  const resolved = isCorner ? cornerEnd(room, wall, run, side, settings) : null;
  const returnWall = isCorner ? cornerReturnRuns(room, wall, run, side).returnWall : null;
  const owners = room && wall ? cornerOwnersAt(room, wall, run, side) : [];
  const updateCorner = (patch) => dispatch(setRunEnd({
    ...actionBase, side,
    end: { type: 'corner', width: null, corner: { ...end.corner, ...patch } },
  }));

  return (
    <>
      <Field label={`${side[0].toUpperCase()}${side.slice(1)} End`}>
        <select
          value={isCorner ? `corner:${end.corner?.kind ?? 90}` : endType}
          onChange={(event) => event.target.value.startsWith('corner:')
            ? updateCorner({ kind: Number(event.target.value.split(':')[1]) })
            : dispatch(setRunEnd({
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
          {offersCorner && <>
            <option value="corner:90">Corner 90</option>
            <option value="corner:45">Corner 45</option>
          </>}
        </select>
      </Field>
      {owners.map((owner) => (
        <p key={`${owner.wall.id}:${owner.run.id}:${owner.side}`} className="mt-1.5 text-xs text-gray-500">
          {`Dies into the corner cabinet on ${wallLabel(room, owner.wall)}.`}
        </p>
      ))}
      {note && (
        <p className="mt-1.5 text-xs text-gray-500">{note}</p>
      )}
      {isCorner ? <>
        <Field label="Leg A">
          <InchInput
            value={resolved.legA}
            {...autoInchProps({ auto: defaultLegA(run), onCommit: (size) => dispatch(setTrackSize({
              ...actionBase,
              trackId: (side === 'left' ? run.grid.cols[0] : run.grid.cols.at(-1))?.id,
              size: size ?? defaultLegA(run),
            })) })}
            aria-label={`${side} end corner leg A`}
          />
        </Field>
        <Field label="Leg B">
          <InchInput
            value={end.corner?.legB}
            {...autoInchProps({ auto: resolved.legA, onCommit: (legB) => updateCorner({ legB }) })}
            aria-label={`${side} end corner leg B`}
          />
        </Field>
        <Field label="Depth B">
          <InchInput
            value={end.corner?.depthB}
            {...autoInchProps({ auto: cornerDepthBAuto(room, wall, run, side),
              onCommit: (depthB) => updateCorner({ depthB }) })}
            aria-label={`${side} end corner depth B`}
          />
        </Field>
        {resolved.kind === 90 && <Field label="Doors">
          <select
            value={end.corner?.doors ?? 'auto'}
            onChange={(event) => updateCorner({ doors: event.target.value === 'auto' ? null : event.target.value })}
            aria-label={`${side} end corner doors`}
            className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          >
            <option value="auto">{`Auto (${CORNER_DOORS.find(([value]) => value === (settings.cornerDoors ?? DEFAULT_SETTINGS.cornerDoors))[1]})`}</option>
            {CORNER_DOORS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>}
        <Field label="Return side">
          <select
            value={end.corner?.returnPiece ?? 'auto'}
            onChange={(event) => updateCorner({ returnPiece: event.target.value })}
            aria-label={`${side} end corner return side`}
            className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          >
            <option value="auto">{`Auto (${resolved.returnSide.type === 'none' ? 'none' : 'end panel'})`}</option>
            <option value="end_panel">End panel</option>
            <option value="filler">Filler</option>
            <option value="none">None</option>
          </select>
        </Field>
        {resolved.returnSide.type !== 'none' && <Field label="Return width">
          <InchInput
            value={end.corner?.returnWidth}
            {...autoInchProps({ auto: resolved.returnSide.width,
              onCommit: (returnWidth) => updateCorner({ returnWidth }) })}
            aria-label={`${side} end corner return width`}
          />
        </Field>}
        {resolved.active && resolved.faceLayout ? (
          <p className="text-xs text-gray-500">
            {`Shows ${formatInches(resolved.faceLayout.shown.a)} here · ${formatInches(resolved.faceLayout.shown.b)} on ${wallLabel(room, returnWall)}`}
            {resolved.kind === 45 && ` · door face ${formatInches(resolved.faceLayout.ordered)} (${Math.round(resolved.shape.angle * 10) / 10}°)`}
          </p>
        ) : resolved.warnings.map((warning) => (
          <p key={warning.code} className="text-amber-300">{warning.message}</p>
        ))}
      </> : fitted ? (
        <p className="mt-1.5 text-xs text-gray-500">Fitted to the legs (set under Legs below).</p>
      ) : <>
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
      </>}
    </>
  );
}
