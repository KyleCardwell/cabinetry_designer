import {
  Fragment,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useDispatch } from 'react-redux';
import {
  CABINET_TYPE_IDS,
  KIND_LABELS,
  blindEntries,
  boxTopOf,
  cornerAt,
  cornerReserveParts,
  describeAnchor,
  formatInches,
  formatInchesInput,
  frontDepth,
  isJointAnchor,
  jointMembers,
  landingsOn,
  positionReadouts,
  profileUnderSoffit,
  resolveProfile,
  runShortLabel,
  soffitsOn,
  startFromReadout,
  stretchedStart,
} from '../../model/index.js';
import { wallLabel } from '../../model/topology.js';
import {
  formatRunOverhang,
  lastCabinetItem,
  lastRunItem,
  prepareRunUpdate,
} from '../../properties/helpers.js';
import {
  addItemAfter,
  joinRunEdges,
  removeItem,
  resizeRun,
  setAutoCount,
  setMaxCabinetWidth,
  setRunAnchor,
  setRunCornerClearance,
  setRunHeightMode,
  setRunJointOffset,
  setRunOverride,
  setRunType,
  setSelection,
  updateRun,
} from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import EndFields from './EndFields.jsx';
import Field, { ReadOnlyValue } from './Field.jsx';
import RunFaceOptions from './RunFaceOptions.jsx';
import StretchInput from './StretchInput.jsx';
import WarningsList from './WarningsList.jsx';
import { RUN_TYPES } from './constants.js';

const CORNER_CLEARANCE_MODES = [
  ['auto', 'Auto'],
  ['face', 'Face only'],
  ['custom', 'Custom'],
];

const PLACEMENT_MESSAGES = {
  'out-of-bounds': 'Run must stay inside the wall.',
  conflict: 'Run conflicts with another run.',
};

const RUN_OVERRIDE_FIELDS = {
  [CABINET_TYPE_IDS.BASE]: [
    ['toeKickHeight', 'Toe kick'],
    ['baseBoxHeight', 'Box height'],
    ['countertopThickness', 'Countertop'],
  ],
  [CABINET_TYPE_IDS.TALL]: [
    ['toeKickHeight', 'Toe kick'],
    ['boxTop', 'Box top'],
  ],
  [CABINET_TYPE_IDS.UPPER]: [
    ['upperClearance', 'Clearance above counter'],
    ['boxTop', 'Box top'],
  ],
};

function cornerLabel(corner, room) {
  if (corner.type === 'open') return 'Open end';
  if (corner.type === 'straight') return 'Straight joint';
  if (corner.type === 'outside') return 'Outside corner (not supported yet)';
  const neighbor = room.walls.find((wall) => wall.id === corner.neighborWallId);
  return `Inside corner ${Math.round(corner.angle)}° · ${neighbor
    ? wallLabel(room, neighbor)
    : 'Unknown wall'}`;
}

export default function RunProperties({ room, wall, run, layout, settings, showMessage }) {
  const dispatch = useDispatch();
  const actionBase = { wallId: wall.id, runId: run.id };
  const finalCabinet = lastCabinetItem(run);
  const finalItem = lastRunItem(run);
  const cabinetCount = run.items.filter((item) => item.kind === 'cabinet').length;
  const profile = resolveProfile(settings, room, wall);
  const inheritedValues = {
    ...profile,
    boxTop: boxTopOf(profileUnderSoffit(profile, wall, run)),
  };
  const overrideFields = RUN_OVERRIDE_FIELDS[run.cabinetTypeId] ?? [];
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
  const overhang = formatRunOverhang(run, wall.length);
  const leftGrowLocked = run.anchors.left && !isJointAnchor(run.anchors.left);
  const rightGrowLocked = run.anchors.right && !isJointAnchor(run.anchors.right);
  const bothAnchored = leftGrowLocked && rightGrowLocked;
  // A non-joint anchored end can't move, so stretch away from it.
  const preferredRunGrow = leftGrowLocked ? 'right' : rightGrowLocked ? 'left' : 'right';
  const runGrowLocked = [
    ...(leftGrowLocked ? ['left', 'both'] : []),
    ...(rightGrowLocked ? ['right', 'both'] : []),
  ];
  const [runGrow, setRunGrow] = useState(preferredRunGrow);
  useEffect(() => {
    setRunGrow(preferredRunGrow);
  }, [preferredRunGrow, run.id]);
  const runPositions = positionReadouts(run.x, run.width, wall.length);

  const validateAndDispatch = (changes) => {
    const { validation } = prepareRunUpdate(room, wall.id, run, settings, changes);
    if (!validation.ok) {
      showMessage(PLACEMENT_MESSAGES[validation.reason] ?? validation.reason);
      return false;
    }
    dispatch(updateRun({ ...actionBase, changes }));
    return true;
  };

  const changeType = (typeId, resetToDefaults = false) => {
    const changes = {
      cabinetTypeId: typeId,
      ...(resetToDefaults ? { heightMode: 'auto', overrides: {} } : {}),
    };
    const { validation } = prepareRunUpdate(room, wall.id, run, settings, changes);
    if (!validation.ok) {
      showMessage(PLACEMENT_MESSAGES[validation.reason] ?? validation.reason);
      return;
    }
    dispatch(setRunType({ ...actionBase, typeId, resetToDefaults }));
  };

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Run
        </h3>
        <Field label="Type">
          <select
            value={run.cabinetTypeId}
            onChange={(event) => changeType(Number(event.target.value))}
            className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          >
            {RUN_TYPES.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </Field>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Geometry
        </h3>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="col-span-2">
            {bothAnchored ? (
              <Field label="Width">
                <ReadOnlyValue value={run.width} ariaLabel="Resolved run width" />
              </Field>
            ) : (
              <StretchInput
                label="Width"
                value={run.width}
                grow={runGrow}
                onGrowChange={setRunGrow}
                locked={runGrowLocked}
                onCommit={(width) => {
                  if (isJointAnchor(run.anchors.left) || isJointAnchor(run.anchors.right)) {
                    dispatch(resizeRun({ ...actionBase, width, grow: runGrow }));
                    setRunGrow(preferredRunGrow);
                    return true;
                  }
                  const accepted = validateAndDispatch({
                    width,
                    x: stretchedStart(run.x, run.width, width, runGrow),
                  });
                  if (accepted) setRunGrow(preferredRunGrow);
                  return accepted;
                }}
                ariaLabel="Run width"
              />
            )}
          </div>
          <Field label="Depth">
            <InchInput
              value={run.depth}
              onCommit={(value) => validateAndDispatch({ depth: value })}
              aria-label="Run depth"
            />
          </Field>
        </div>
        <div className="mt-3 grid grid-cols-[auto_1fr_1fr] items-end gap-2">
          <span />
          <span className="text-center text-xs text-gray-500">Edge</span>
          <span className="text-center text-xs text-gray-500">Center</span>
          {['left', 'right'].map((side) => (
            <Fragment key={side}>
              <span className="text-xs capitalize text-gray-400">{side} end</span>
              {['edge', 'center'].map((anchor) => {
                const readOnly = run.anchors[side];
                const className = anchor === 'center' ? 'opacity-60' : '';
                const ariaLabel = `Run ${side} ${anchor} position`;
                return (
                  <div key={anchor} className={className}>
                    {readOnly ? (
                      <ReadOnlyValue
                        value={runPositions[side][anchor]}
                        ariaLabel={ariaLabel}
                      />
                    ) : (
                      <InchInput
                        value={runPositions[side][anchor]}
                        onCommit={(value) => validateAndDispatch({
                          x: startFromReadout(
                            side,
                            anchor,
                            value,
                            run.width,
                            wall.length,
                          ),
                        })}
                        aria-label={ariaLabel}
                      />
                    )}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
        <div className="mt-2.5">
          <Field label="Front depth">
            <ReadOnlyValue
              value={frontDepth(run, settings)}
              ariaLabel="Installed front depth"
            />
          </Field>
        </div>
        {overhang && (
          <p className="mt-2 text-xs font-medium text-amber-300">{overhang}</p>
        )}
      </section>

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
                            {`${runShortLabel(candidate)} · ${targetSide} edge`}
                          </option>
                        )))}
                    </optgroup>
                  </select>
                </Field>
                {jointAnchor ? (
                  <div className="mt-3 space-y-2 border-t border-gray-700 pt-3">
                    <Field label="Offset">
                      <InchInput
                        value={jointAnchor.offset}
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

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Heights
        </h3>
        <div className="mb-3 grid grid-cols-2 overflow-hidden rounded border border-gray-700">
          {['auto', 'manual'].map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => dispatch(setRunHeightMode({ ...actionBase, mode }))}
              className={`px-3 py-2 text-xs font-medium capitalize transition-colors ${
                run.heightMode === mode
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-900/45 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        {run.heightMode === 'auto' ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Resolved Z">
                <ReadOnlyValue value={run.z} ariaLabel="Resolved run z" />
              </Field>
              <Field label="Resolved height">
                <ReadOnlyValue value={run.height} ariaLabel="Resolved run height" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {overrideFields.map(([key, label]) => (
                <Field key={key} label={`${label} (blank = inherit)`}>
                  <InchInput
                    value={run.overrides[key] ?? null}
                    allowBlank
                    placeholder={formatInchesInput(inheritedValues[key])}
                    onCommit={(value) => dispatch(setRunOverride({
                      ...actionBase,
                      key,
                      value,
                    }))}
                    aria-label={`Run ${label} override`}
                  />
                </Field>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Z">
              <InchInput
                value={run.z}
                onCommit={(value) => validateAndDispatch({ z: value })}
                aria-label="Run z"
              />
            </Field>
            <Field label="Height">
              <InchInput
                value={run.height}
                onCommit={(value) => validateAndDispatch({ height: value })}
                aria-label="Run height"
              />
            </Field>
          </div>
        )}

        <button
          type="button"
          onClick={() => dispatch(setRunType({
            ...actionBase,
            typeId: run.cabinetTypeId,
            resetToDefaults: true,
          }))}
          className="mt-3 w-full rounded bg-gray-700 px-3 py-2 text-xs font-medium text-gray-200 transition-colors hover:bg-gray-600"
        >
          Reset heights to defaults
        </button>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Cabinets
        </h3>
        <label className="flex items-center justify-between rounded border border-gray-700 bg-gray-900/45 px-3 py-2 text-sm text-gray-300">
          Auto count
          <input
            type="checkbox"
            checked={run.autoCount}
            onChange={(event) => dispatch(setAutoCount({
              ...actionBase,
              value: event.target.checked,
            }))}
            className="rounded border-gray-600 bg-gray-900 text-blue-600 focus:ring-blue-500"
          />
        </label>

        <div className="mt-2 flex items-center justify-between rounded border border-gray-700 bg-gray-900/45 p-2">
          <span className="text-xs text-gray-400">Cabinet count</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!finalCabinet}
              onClick={() => finalCabinet && dispatch(removeItem({
                ...actionBase,
                itemId: finalCabinet.id,
              }))}
              aria-label="Remove last cabinet"
              className="h-7 w-7 rounded bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              −
            </button>
            <span className="min-w-5 text-center text-sm tabular-nums text-gray-100">
              {cabinetCount}
            </span>
            <button
              type="button"
              onClick={() => dispatch(addItemAfter({
                ...actionBase,
                itemId: finalItem?.id ?? null,
                kind: 'cabinet',
              }))}
              aria-label="Add cabinet"
              className="h-7 w-7 rounded bg-gray-700 text-gray-200 hover:bg-gray-600"
            >
              +
            </button>
          </div>
        </div>

        <div className="mt-2">
          <Field label="Max cabinet width (blank = setting)">
            <InchInput
              value={run.maxCabinetWidth}
              allowBlank
              onCommit={(value) => dispatch(setMaxCabinetWidth({
                ...actionBase,
                value,
              }))}
              aria-label="Maximum cabinet width override"
            />
          </Field>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Pieces
        </h3>
        <div className="overflow-hidden rounded border border-gray-700">
          {layout.pieces.map((piece) => {
            const item = piece.role === 'item'
              ? run.items.find((candidate) => candidate.id === piece.id)
              : null;
            const lockState = piece.kind === 'cabinet'
              ? (item?.width === null ? 'Auto' : 'Locked')
              : (piece.auto ? 'Auto' : 'Fixed');
            return (
              <button
                key={piece.id}
                type="button"
                onClick={() => dispatch(setSelection({ runId: run.id, pieceId: piece.id }))}
                className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-gray-700 bg-gray-900/35 px-2.5 py-2 text-left text-xs last:border-b-0 hover:bg-gray-700/65"
              >
                <span className="truncate text-gray-200">{KIND_LABELS[piece.kind]}</span>
                <span className="tabular-nums text-gray-300">
                  {formatInches(piece.width)}
                  {Number.isFinite(piece.absorbed)
                    ? ` (${piece.absorbed >= 0 ? '+' : ''}${formatInches(piece.absorbed)})`
                    : ''}
                </span>
                <span className="text-gray-500">{lockState}</span>
              </button>
            );
          })}
          {layout.pieces.length === 0 && (
            <p className="px-3 py-2 text-xs text-gray-500">No pieces.</p>
          )}
        </div>
      </section>

      <RunFaceOptions room={room} wall={wall} run={run} settings={settings} />

      <WarningsList layout={layout} />
    </div>
  );
}
