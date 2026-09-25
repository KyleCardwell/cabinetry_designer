import { useMemo } from 'react';
import { useDispatch } from 'react-redux';
import {
  blindEntries,
  cornerAt,
  cornerReserveParts,
  describeAnchor,
  formatInches,
  formatInchesInput,
  isFollowAnchor,
  isJointAnchor,
  jointMembers,
  landingsOn,
  runShortLabel,
  soffitsOn,
} from '../../model/index.js';
import { wallLabel } from '../../model/topology.js';
import {
  joinRunEdges,
  setRunAnchor,
  setRunCornerClearance,
  setRunJointOffset,
} from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import EndFields from './EndFields.jsx';
import Field from './Field.jsx';

const CORNER_CLEARANCE_MODES = [
  ['auto', 'Auto'],
  ['face', 'Face only'],
  ['custom', 'Custom'],
];

function cornerLabel(corner, room) {
  if (corner.type === 'open') return 'Open end';
  if (corner.type === 'straight') return 'Straight joint';
  if (corner.type === 'outside') return 'Outside corner (not supported yet)';
  const neighbor = room.walls.find((wall) => wall.id === corner.neighborWallId);
  return `Inside corner ${Math.round(corner.angle)}° · ${neighbor
    ? wallLabel(room, neighbor)
    : 'Unknown wall'}`;
}

export default function RunEndsSection({ room, wall, run, settings, actionBase }) {
  const dispatch = useDispatch();
  const corners = Object.fromEntries(['left', 'right'].map((side) => [
    side,
    cornerAt(room, wall, side),
  ]));
  const reserveParts = Object.fromEntries(['left', 'right'].map((side) => [
    side,
    cornerReserveParts(room, wall, side, run, settings),
  ]));
  const blindEntryData = useMemo(
    () => blindEntries(room, wall, run, settings),
    [room, wall, run, settings],
  );

  return (
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Ends &amp; corners
        </h3>
        <div className="space-y-2">
          {['left', 'right'].map((side) => {
            const insideCorner = corners[side].type === 'inside';
            const anchor = run.anchors[side];
            const openingAnchor = anchor?.to === 'opening' ? anchor : null;
            const soffitAnchor = anchor?.to === 'soffit' ? anchor : null;
            const wallAnchor = anchor?.to === 'wall' ? anchor : null;
            const jointAnchor = isJointAnchor(anchor) ? anchor : null;
            const followAnchor = isFollowAnchor(anchor) ? anchor : null;
            const linkAnchor = jointAnchor ?? followAnchor;
            const otherJointMember = jointAnchor
              ? jointMembers(wall, jointAnchor.jointId)
                .find((member) => member.runId !== run.id || member.side !== side)
              : null;
            const wallEndAnchor = anchor === true;
            const clearance = run.cornerClearance?.[side] ?? 'auto';
            const clearanceMode = typeof clearance === 'number'
              ? 'custom'
              : insideCorner && clearance === 'face' ? 'face' : 'auto';
            const clearanceModes = insideCorner
              ? CORNER_CLEARANCE_MODES
              : CORNER_CLEARANCE_MODES.filter(([value]) => value !== 'face');
            const anchorValue = openingAnchor
              ? `opening:${openingAnchor.openingId}`
              : soffitAnchor
                ? `soffit:${soffitAnchor.soffitId}`
              : wallAnchor
                ? `wall:${wallAnchor.wallId}`
              : followAnchor
                ? `joint:${followAnchor.runId}:${followAnchor.side}`
              : otherJointMember
                ? `joint:${otherJointMember.runId}:${otherJointMember.side}`
                : anchor === true ? 'corner' : 'free';
            const anchorDescription = describeAnchor(room, wall, run, side, settings);
            return (
              <div
                key={side}
                className="rounded border border-gray-700 bg-gray-900/45 p-3"
              >
                <EndFields
                  actionBase={actionBase}
                  run={run}
                  side={side}
                  settings={settings}
                  note={cornerLabel(corners[side], room)}
                />
                <Field label={`Anchor ${side}`}>
                  <select
                    value={anchorValue}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value.startsWith('joint:')) {
                        const [, targetRunId, targetSide] = value.split(':');
                        dispatch(joinRunEdges({
                          ...actionBase,
                          side,
                          targetRunId,
                          targetSide,
                        }));
                        return;
                      }
                      if (value.startsWith('wall:')) {
                        dispatch(setRunAnchor({
                          ...actionBase,
                          side,
                          anchor: {
                            to: 'wall',
                            wallId: value.slice('wall:'.length),
                          },
                        }));
                        return;
                      }
                      if (value.startsWith('soffit:')) {
                        dispatch(setRunAnchor({
                          ...actionBase,
                          side,
                          anchor: {
                            to: 'soffit',
                            soffitId: value.slice('soffit:'.length),
                            offset: 0,
                          },
                        }));
                        return;
                      }
                      dispatch(setRunAnchor({
                        ...actionBase,
                        side,
                        anchor: value === 'free'
                          ? false
                          : value === 'corner'
                            ? true
                            : {
                                to: 'opening',
                                openingId: value.slice('opening:'.length),
                                edge: 'casing',
                                clearance: null,
                              },
                      }));
                    }}
                    aria-label={`${side} run anchor`}
                    className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="free">Free</option>
                    <option value="corner">Corner</option>
                    {(wall.openings ?? []).map((opening) => (
                      <option key={opening.id} value={`opening:${opening.id}`}>
                        {opening.label}
                      </option>
                    ))}
                    <optgroup label="Wall faces">
                      {landingsOn(room, wall).map((interval) => {
                        const landedWall = room.walls.find(
                          (candidate) => candidate.id === interval.wallId,
                        );
                        return landedWall ? (
                          <option
                            key={`${interval.wallId}:${interval.endpoint}`}
                            value={`wall:${interval.wallId}`}
                          >
                            {wallLabel(room, landedWall)}
                          </option>
                        ) : null;
                      })}
                    </optgroup>
                    <optgroup label="Soffit sides">
                      {soffitsOn(wall).map((soffit) => (
                        <option key={soffit.id} value={`soffit:${soffit.id}`}>
                          {`Soffit ${formatInches(soffit.x)}–${formatInches(soffit.x + soffit.width)}`}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Run edges">
                      {wall.runs.filter((candidate) => candidate.id !== run.id)
                        .flatMap((candidate) => ['left', 'right'].map((targetSide) => (
                          <option
                            key={`${candidate.id}:${targetSide}`}
                            value={`joint:${candidate.id}:${targetSide}`}
                          >
                            {`${runShortLabel(candidate)} · ${targetSide} edge${
                              candidate.anchors?.[targetSide]
                                && !isJointAnchor(candidate.anchors[targetSide])
                                ? ' · follow'
                                : ''
                            }`}
                          </option>
                        )))}
                    </optgroup>
                  </select>
                </Field>
                {linkAnchor ? (
                  <div className="mt-3 space-y-2 border-t border-gray-700 pt-3">
                    <Field label="Offset">
                      <InchInput
                        value={linkAnchor.offset}
                        allowBlank
                        placeholder="0"
                        onCommit={(value) => dispatch(setRunJointOffset({
                          ...actionBase,
                          side,
                          offset: value ?? 0,
                        }))}
                        aria-label={`${side} joint anchor offset`}
                      />
                    </Field>
                    <p className="text-xs text-gray-500">
                      Positive holds the run back; negative carries it past.
                    </p>
                    <p className="text-xs text-cyan-300">
                      {anchorDescription}
                    </p>
                  </div>
                ) : openingAnchor ? (
                  <div className="mt-3 space-y-2 border-t border-gray-700 pt-3">
                    <Field label="Clearance">
                      <InchInput
                        value={openingAnchor.clearance}
                        allowBlank
                        placeholder={formatInchesInput(settings.casingClearance)}
                        onCommit={(value) => dispatch(setRunAnchor({
                          ...actionBase,
                          side,
                          anchor: { ...openingAnchor, clearance: value },
                        }))}
                        aria-label={`${side} opening anchor clearance`}
                      />
                    </Field>
                    <p className="text-xs text-gray-500">
                      Positive holds the run back; negative carries it past.
                    </p>
                    <div className="grid grid-cols-2 overflow-hidden rounded border border-gray-700">
                      {['casing', 'jamb'].map((edge) => (
                        <button
                          key={edge}
                          type="button"
                          onClick={() => dispatch(setRunAnchor({
                            ...actionBase,
                            side,
                            anchor: { ...openingAnchor, edge },
                          }))}
                          className={`px-2 py-1.5 text-xs capitalize ${
                            openingAnchor.edge === edge
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-900 text-gray-400'
                          }`}
                        >
                          {edge}
                        </button>
                      ))}
                    </div>
                    <p className={`text-xs ${anchorDescription === 'Anchored opening is missing'
                      ? 'text-amber-300'
                      : 'text-cyan-300'}`}>
                      {anchorDescription}
                    </p>
                  </div>
                ) : soffitAnchor ? (
                  <div className="mt-3 space-y-2 border-t border-gray-700 pt-3">
                    <Field label="Offset">
                      <InchInput
                        value={soffitAnchor.offset}
                        allowBlank
                        placeholder="0"
                        onCommit={(value) => dispatch(setRunAnchor({
                          ...actionBase,
                          side,
                          anchor: { ...soffitAnchor, offset: value ?? 0 },
                        }))}
                        aria-label={`${side} soffit anchor offset`}
                      />
                    </Field>
                    <p className="text-xs text-gray-500">
                      Positive holds the run back; negative carries it past.
                    </p>
                    <p className="text-xs text-cyan-300">
                      {anchorDescription}
                    </p>
                  </div>
                ) : (wallEndAnchor || wallAnchor) ? (
                  <div className="mt-3 space-y-2 border-t border-gray-700 pt-3">
                    <Field label={wallAnchor
                      ? 'Clearance'
                      : insideCorner ? 'Corner clearance' : 'End offset'}>
                      <select
                        value={clearanceMode}
                        onChange={(event) => {
                          const mode = event.target.value;
                          dispatch(setRunCornerClearance({
                            ...actionBase,
                            side,
                            value: mode === 'custom' ? reserveParts[side].total : mode,
                          }));
                        }}
                        aria-label={`${side} corner clearance`}
                        className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
                      >
                        {clearanceModes.map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </Field>
                    {clearanceMode === 'custom' && (
                      <Field label="Custom clearance">
                        <InchInput
                          value={clearance}
                          onCommit={(value) => dispatch(setRunCornerClearance({
                            ...actionBase,
                            side,
                            value,
                          }))}
                          aria-label={`${side} custom corner clearance`}
                        />
                      </Field>
                    )}
                    {(clearanceMode === 'custom' || wallAnchor) && (
                      <p className="text-xs text-gray-500">
                        Positive holds the run back; negative carries it past.
                      </p>
                    )}
                    <p className="text-xs text-cyan-300">
                      {anchorDescription}
                    </p>
                  </div>
                ) : null}
                {blindEntryData.warnings
                  .filter((warning) => warning.side === side)
                  .map((warning) => (
                    <p key={warning.code} className="text-xs text-amber-300">
                      {warning.code === 'blind-not-past'
                        ? 'Blind box is no wider than the cabinet.'
                        : 'Blind is exposed — add a filler or panel at this end.'}
                    </p>
                  ))}
              </div>
            );
          })}
        </div>
      </section>
  );
}
