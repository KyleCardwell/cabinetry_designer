import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  CABINET_TYPE_IDS,
  KIND_LABELS,
  blindEntries,
  boxTopOf,
  cornerAt,
  cornerReserveParts,
  crownOverlap,
  describeAnchor,
  formatInches,
  formatInchesInput,
  frontDepth,
  openingGeometry,
  pinTargetsForRun,
  positionReadouts,
  profileUnderSoffit,
  resolveProfile,
  isJointAnchor,
  jointMembers,
  landingRefCreatesCycle,
  landingsOn,
  runShortLabel,
  runBlocksOpening,
  soffitsOn,
  splitRun,
  startFromReadout,
  stretchedStart,
  validateOpeningPlacement,
  wallFrame,
  wallNumbers,
  wallNumberWarnings,
} from '../model/index.js';
import { wallHasCabinets, wallLabel } from '../model/topology.js';
import {
  endCornerAnglesForRun,
  endMinWidthsForRun,
  resolveWall,
  roomDiagnostics,
} from '../model/room.js';
import {
  formatRunOverhang,
  lastCabinetItem,
  lastRunItem,
  prepareRunUpdate,
  resolveSelectedPiece,
} from '../properties/helpers.js';
import {
  addItemAfter,
  clearSelection,
  deleteOpening,
  detachWallLanding,
  flipWall,
  removeItem,
  setAutoCount,
  setMaxCabinetWidth,
  setMessage,
  setOpeningMeasureMode,
  setRunHeightMode,
  setRunAnchor,
  joinRunEdges,
  resizeRun,
  setRunCornerClearance,
  setRunJointOffset,
  setRunOverride,
  setRunType,
  setSelection,
  setWallEndPanel,
  setWallLanding,
  setWallLength,
  resizeOpening,
  updateOpening,
  updateRun,
  updateWall,
} from '../store/elevationSlice.js';
import InchInput from './InchInput.jsx';
import EndFields from './properties/EndFields.jsx';
import Field, { ReadOnlyValue } from './properties/Field.jsx';
import PieceProperties from './properties/PieceProperties.jsx';
import SoffitProperties from './properties/SoffitProperties.jsx';
import WarningsList from './properties/WarningsList.jsx';
import { RUN_TYPES } from './properties/constants.js';
import RunFaceOptions from './properties/RunFaceOptions.jsx';
import StretchInput from './properties/StretchInput.jsx';

const CORNER_CLEARANCE_MODES = [
  ['auto', 'Auto'],
  ['face', 'Face only'],
  ['custom', 'Custom'],
];

const PLACEMENT_MESSAGES = {
  'out-of-bounds': 'Run must stay inside the wall.',
  conflict: 'Run conflicts with another run.',
};

const OPENING_PLACEMENT_MESSAGES = {
  'opening-too-small': 'Opening is too small.',
  'opening-out-of-bounds': 'Opening casing must stay inside the wall.',
  'opening-too-tall': 'Opening casing must stay below the wall top.',
  'opening-conflict': 'Opening casing overlaps another opening.',
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

const WALL_OVERRIDE_FIELDS = [
  ['crownTop', 'Top of crown'],
  ['toeKickHeight', 'Toe kick height'],
  ['countertopThickness', 'Countertop thickness'],
  ['topMoldHeight', 'Top mold'],
  ['crownHeight', 'Crown'],
  ['crownStackHeight', 'Crown total'],
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

function OpeningProperties({ wall, opening, settings, placementMessage }) {
  const dispatch = useDispatch();
  const actionBase = { wallId: wall.id, openingId: opening.id };
  const geometry = openingGeometry(opening, wall.length, settings);
  const validation = validateOpeningPlacement(wall, opening, settings);
  const placementReason = !validation.ok
    ? validation.reason
    : OPENING_PLACEMENT_MESSAGES[placementMessage] ? placementMessage : null;
  const blockingRuns = wall.runs.filter(
    (run) => runBlocksOpening(run, opening, wall, settings),
  );
  const update = (changes) => dispatch(updateOpening({ ...actionBase, changes }));
  // Grow away from the wall end the offset is measured from, so the typed offset holds.
  const preferredOpeningGrow = opening.offsetFrom === 'right' ? 'left' : 'right';
  const [openingGrow, setOpeningGrow] = useState(preferredOpeningGrow);
  useEffect(() => {
    setOpeningGrow(preferredOpeningGrow);
  }, [preferredOpeningGrow, opening.id]);
  const hasWarnings = Boolean(placementReason) || blockingRuns.length > 0;

  return (
    <div className="space-y-5">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Opening
          </h3>
          <button
            type="button"
            onClick={() => dispatch(deleteOpening(actionBase))}
            className="rounded bg-red-900/70 px-2.5 py-1.5 text-xs text-red-100 hover:bg-red-800"
          >
            Delete
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Label">
            <input
              type="text"
              value={opening.label}
              onChange={(event) => update({ label: event.target.value })}
              aria-label="Opening label"
              className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
            />
          </Field>
          <Field label="Kind">
            <select
              value={opening.kind}
              onChange={(event) => {
                const kind = event.target.value;
                update({
                  kind,
                  sillZ: kind === 'door' ? 0 : settings.defaultWindowSillZ,
                });
              }}
              aria-label="Opening kind"
              className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
            >
              <option value="door">Door</option>
              <option value="window">Window</option>
            </select>
          </Field>
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Measured to
        </h3>
        <div className="grid grid-cols-2 overflow-hidden rounded border border-gray-700">
          {[
            ['jamb', 'Jamb'],
            ['casing', 'Outside casing'],
          ].map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => dispatch(setOpeningMeasureMode({ ...actionBase, mode }))}
              className={`px-2 py-2 text-xs font-medium transition-colors ${
                opening.measureMode === mode
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-900/45 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-gray-500">
          Sizes and the corner distance below are to the {opening.measureMode === 'jamb'
            ? 'jamb'
            : 'outside of the casing'}.
        </p>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Size
        </h3>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="col-span-2">
            <StretchInput
              label="Width"
              value={opening.width}
              grow={openingGrow}
              onGrowChange={setOpeningGrow}
              onCommit={(width) => {
                dispatch(resizeOpening({ ...actionBase, width, grow: openingGrow }));
                setOpeningGrow(preferredOpeningGrow);
                return true;
              }}
              ariaLabel="Opening width"
            />
          </div>
          <Field label="Height">
            <InchInput
              value={opening.height}
              onCommit={(height) => update({ height })}
              aria-label="Opening height"
            />
          </Field>
          {opening.kind === 'window' && (
            <Field label="Sill height">
              <InchInput
                value={opening.sillZ}
                onCommit={(sillZ) => update({ sillZ })}
                aria-label="Opening sill height"
              />
            </Field>
          )}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Position
        </h3>
        <div className="grid grid-cols-[auto_1fr_1fr] items-end gap-2">
          <span />
          <span className="text-center text-xs text-gray-500">Edge</span>
          <span className="text-center text-xs text-gray-500">Center</span>
          {['left', 'right'].map((side) => (
            <Fragment key={side}>
              <span className="text-xs capitalize text-gray-400">{side} end</span>
              {['edge', 'center'].map((anchor) => {
                const active = opening.offsetFrom === side
                  && (opening.offsetAnchor ?? 'edge') === anchor;
                return (
                  <div
                    key={anchor}
                    className={active ? 'rounded ring-1 ring-cyan-400' : ''}
                  >
                    <InchInput
                      value={geometry.offsets[side][opening.measureMode][anchor]}
                      onCommit={(offset) => update({
                        offset,
                        offsetFrom: side,
                        offsetAnchor: anchor,
                      })}
                      aria-label={`Opening ${side} ${anchor} position`}
                    />
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
        {(() => {
          const otherMode = opening.measureMode === 'jamb' ? 'casing' : 'jamb';
          const other = geometry.offsets;
          return (
            <p className="mt-3 text-xs leading-relaxed text-gray-500">
              {otherMode[0].toUpperCase() + otherMode.slice(1)}: left edge{' '}
              {formatInches(other.left[otherMode].edge)}, center{' '}
              {formatInches(other.left[otherMode].center)} · right edge{' '}
              {formatInches(other.right[otherMode].edge)}, center{' '}
              {formatInches(other.right[otherMode].center)}
            </p>
          );
        })()}
      </section>

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Casing
        </h3>
        <label className="flex items-center justify-between rounded border border-gray-700 bg-gray-900/45 px-3 py-2 text-sm text-gray-300">
          Include casing
          <input
            type="checkbox"
            checked={Boolean(opening.casing)}
            onChange={(event) => update({
              casing: event.target.checked
                ? { width: settings.casingWidth, thickness: settings.casingThickness }
                : null,
            })}
            className="rounded border-gray-600 bg-gray-900 text-blue-600 focus:ring-blue-500"
          />
        </label>
        {opening.casing && (
          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            <Field label="Width">
              <InchInput
                value={opening.casing.width}
                onCommit={(width) => update({ casing: { ...opening.casing, width } })}
                aria-label="Opening casing width"
              />
            </Field>
            <Field label="Thickness">
              <InchInput
                value={opening.casing.thickness}
                onCommit={(thickness) => update({ casing: { ...opening.casing, thickness } })}
                aria-label="Opening casing thickness"
              />
            </Field>
          </div>
        )}
        <p className="mt-2 text-xs text-gray-500">
          {opening.kind === 'door'
            ? 'Doors are cased on three sides.'
            : 'Windows are cased on all four sides.'}
        </p>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Head height
        </h3>
        <ReadOnlyValue value={geometry.head} ariaLabel="Opening head height" />
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Warnings &amp; errors
        </h3>
        {!hasWarnings ? (
          <p className="mt-2 text-xs text-gray-500">No warnings or errors.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-xs">
            {placementReason && (
              <li className="rounded border border-red-900/80 bg-red-950/45 px-2.5 py-2 text-red-300">
                {OPENING_PLACEMENT_MESSAGES[placementReason] ?? placementReason}
              </li>
            )}
            {blockingRuns.map((run) => {
              const type = RUN_TYPES.find(([typeId]) => typeId === run.cabinetTypeId)?.[1]
                ?? 'Cabinet';
              return (
                <li
                  key={run.id}
                  className="rounded border border-amber-900/80 bg-amber-950/35 px-2.5 py-2 text-amber-300"
                >
                  Blocked by {type} run
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function RunProperties({ room, wall, run, layout, settings, showMessage }) {
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

function WallHeightProperties({ room, wall, plan }) {
  const dispatch = useDispatch();
  const settings = useSelector((state) => state.elevation.settings);
  const autoNumber = wallNumbers(room).get(wall.id);
  const duplicateNumber = wallNumberWarnings(room)
    .some((warning) => warning.wallIds.includes(wall.id));
  const resolvedProfile = { ...room.profile, ...wall.profile };
  const overlap = crownOverlap(resolvedProfile);
  const frame = wallFrame(room, wall);
  const leftFree = !wall.connections?.[frame.leftEndpoint]
    && !wall.landings?.[frame.leftEndpoint];
  const rightFree = !wall.connections?.[frame.rightEndpoint]
    && !wall.landings?.[frame.rightEndpoint];
  const preferredGrowEnd = leftFree !== rightFree && leftFree ? 'left' : 'right';
  const [growEnd, setGrowEnd] = useState(preferredGrowEnd);

  useEffect(() => {
    setGrowEnd(preferredGrowEnd);
  }, [preferredGrowEnd, wall.id]);

  const updateLength = (length) => {
    if (length <= 0) return false;
    dispatch(setWallLength({ wallId: wall.id, length, growEnd }));
    setGrowEnd(preferredGrowEnd);
    return true;
  };

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Wall
        </h3>
        <p className="mb-3 text-sm font-medium text-gray-200">{wallLabel(room, wall)}</p>
        <div className="mb-3 grid grid-cols-2 gap-2.5">
          <Field label="Name (optional)">
            <input
              type="text"
              value={wall.name}
              onChange={(event) => dispatch(updateWall({
                wallId: wall.id,
                changes: { name: event.target.value },
              }))}
              aria-label="Wall name"
              className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
            />
          </Field>
          <Field label="Number">
            <input
              type="number"
              min="1"
              step="1"
              value={wall.numberOverride ?? ''}
              placeholder={String(autoNumber ?? '')}
              onChange={(event) => {
                const value = event.target.value;
                if (value === '') {
                  dispatch(updateWall({ wallId: wall.id, changes: { numberOverride: null } }));
                  return;
                }
                const number = Number(value);
                if (Number.isInteger(number) && number > 0) {
                  dispatch(updateWall({ wallId: wall.id, changes: { numberOverride: number } }));
                }
              }}
              aria-label="Wall number"
              className={`w-full rounded border bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:outline-none ${
                duplicateNumber
                  ? 'border-amber-500 focus:border-amber-400'
                  : 'border-gray-600 focus:border-blue-500'
              }`}
            />
          </Field>
        </div>
        {!wallHasCabinets(wall) && (
          <label className="mb-3 flex items-center gap-2 text-xs text-gray-300">
            <input
              type="checkbox"
              checked={Boolean(wall.elevationForced)}
              onChange={(event) => dispatch(updateWall({
                wallId: wall.id,
                changes: { elevationForced: event.target.checked },
              }))}
              aria-label="Include in elevations"
            />
            Include in elevations
          </label>
        )}
        {duplicateNumber && (
          <p className="mb-3 text-xs text-amber-400">This wall number is also assigned to another wall.</p>
        )}
        {plan ? (
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="col-span-2">
                <StretchInput
                  label="Length"
                  value={wall.length}
                  grow={growEnd}
                  onGrowChange={setGrowEnd}
                  onCommit={updateLength}
                  ariaLabel="Wall length"
                />
              </div>
              <Field label="Height">
                <InchInput
                  value={wall.height}
                  onCommit={(height) => dispatch(updateWall({
                    wallId: wall.id,
                    changes: { height },
                  }))}
                  aria-label="Wall height"
                />
              </Field>
              <Field label="Thickness">
                <InchInput
                  value={wall.thickness}
                  onCommit={(thickness) => dispatch(updateWall({
                    wallId: wall.id,
                    changes: { thickness },
                  }))}
                  aria-label="Wall thickness"
                />
              </Field>
            </div>
            <button
              type="button"
              onClick={() => dispatch(flipWall({ wallId: wall.id }))}
              className="w-full rounded bg-gray-700 px-3 py-2 text-sm font-medium text-gray-100 hover:bg-gray-600"
            >
              Flip interior side
            </button>
          </div>
        ) : (
          <>
            <Field label="Wall height">
              <InchInput
                value={wall.height}
                onCommit={(height) => dispatch(updateWall({
                  wallId: wall.id,
                  changes: { height },
                }))}
                aria-label="Wall height"
              />
            </Field>
          </>
        )}
      </section>

      {[
        ['left', frame.leftEndpoint],
        ['right', frame.rightEndpoint],
      ].map(([side, endpoint]) => {
        const landing = wall.landings?.[endpoint];
        if (!landing) return null;
        const host = room.walls.find((candidate) => candidate.id === landing.wallId);
        if (!host) return null;
        const hostView = resolveWall(room, host, landing.side);
        const referenceWalls = landingsOn(room, hostView)
          .filter((interval) => interval.wallId !== wall.id)
          .map((interval) => room.walls.find(
            (candidate) => candidate.id === interval.wallId,
          ))
          .filter((candidate) => candidate && !landingRefCreatesCycle(
            room,
            wall.id,
            host.id,
            landing.side,
            candidate.id,
          ));
        return (
          <section key={endpoint}>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
              {`Lands on ${wallLabel(room, host)} · ${landing.side === 'front' ? 'Front' : 'Back'}`}
            </h3>
            <div className="space-y-2.5">
              <Field label="Measured from">
                <select
                  value={landing.ref}
                  onChange={(event) => dispatch(setWallLanding({
                    wallId: wall.id,
                    endpoint,
                    ref: event.target.value,
                  }))}
                  aria-label={`${side} landing measured from`}
                  className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
                >
                  <option value="left">Left end</option>
                  <option value="right">Right end</option>
                  {referenceWalls.map((referenceWall) => (
                    <option key={referenceWall.id} value={referenceWall.id}>
                      {wallLabel(room, referenceWall)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="To">
                <select
                  value={landing.to}
                  onChange={(event) => dispatch(setWallLanding({
                    wallId: wall.id,
                    endpoint,
                    to: event.target.value,
                  }))}
                  aria-label={`${side} landing measured to`}
                  className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
                >
                  <option value="near">Near face</option>
                  <option value="far">Far face</option>
                  <option value="center">Centre</option>
                </select>
              </Field>
              <Field label="Distance">
                <InchInput
                  value={landing.offset}
                  onCommit={(offset) => dispatch(setWallLanding({
                    wallId: wall.id,
                    endpoint,
                    offset,
                  }))}
                  aria-label={`${side} landing distance`}
                />
              </Field>
              <button
                type="button"
                onClick={() => dispatch(detachWallLanding({
                  wallId: wall.id,
                  endpoint,
                }))}
                className="w-full rounded bg-gray-700 px-3 py-2 text-sm font-medium text-gray-100 hover:bg-gray-600"
              >
                Detach
              </button>
            </div>
          </section>
        );
      })}

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Wall end panels
        </h3>
        <div className="space-y-2.5">
          {[
            ['Left end', frame.leftEndpoint, leftFree],
            ['Right end', frame.rightEndpoint, rightFree],
          ].map(([label, endpoint, free]) => {
            const panel = wall.endPanels?.[endpoint] ?? null;
            return (
              <div
                key={endpoint}
                className="rounded border border-gray-700 bg-gray-900/45 px-3 py-2"
              >
                <label className={`flex items-center justify-between text-sm ${free ? 'text-gray-300' : 'text-gray-500'}`}>
                  {label}
                  <input
                    type="checkbox"
                    checked={Boolean(panel)}
                    disabled={!free}
                    onChange={(event) => dispatch(setWallEndPanel({
                      wallId: wall.id,
                      endpoint,
                      panel: event.target.checked ? { width: null } : null,
                    }))}
                    aria-label={`${label} wall end panel`}
                  />
                </label>
                {!free && (
                  <p className="mt-1 text-xs text-gray-500">Connected — corner</p>
                )}
                {panel && (
                  <div className="mt-2">
                    <Field label="Width">
                      <InchInput
                        value={panel.width}
                        allowBlank
                        placeholder={formatInches(settings.endPanelThickness)}
                        onCommit={(width) => dispatch(setWallEndPanel({
                          wallId: wall.id,
                          endpoint,
                          panel: { width },
                        }))}
                        aria-label={`${label} panel width`}
                      />
                    </Field>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Heights
        </h3>
        <p className="mb-3 text-xs text-gray-500">Blank values inherit from the room.</p>
        <div className="space-y-2.5">
          {WALL_OVERRIDE_FIELDS.map(([key, label]) => (
            <Field key={key} label={label}>
              <InchInput
                value={wall.profile[key] ?? null}
                allowBlank
                placeholder={formatInchesInput(room.profile[key])}
                onCommit={(value) => dispatch(updateWall({
                  wallId: wall.id,
                  changes: { profile: { [key]: value } },
                }))}
                aria-label={`Wall ${label} override`}
              />
            </Field>
          ))}
        </div>
        <p className={`mt-2 text-xs ${overlap < 0 ? 'text-amber-500/80' : 'text-gray-500'}`}>
          {overlap < 0 ? 'Gap' : 'Overlap'} {formatInches(Math.abs(overlap))}
        </p>
      </section>
    </div>
  );
}

export default function PropertiesPanel() {
  const dispatch = useDispatch();
  const messageTimer = useRef(null);
  const {
    rooms,
    activeRoomId,
    activeWallId,
    activeWallSide,
    selection,
    settings,
    view,
    message,
  } = useSelector(
    (state) => state.elevation,
  );
  const room = rooms.find((candidate) => candidate.id === activeRoomId) ?? null;
  const storedWall = room?.walls.find(
    (candidate) => candidate.id === selection.wallId,
  ) ?? null;
  const wall = useMemo(() => resolveWall(room, storedWall, storedWall?.id === activeWallId ? activeWallSide : 'front'), [room, storedWall, activeWallId, activeWallSide]);
  const opening = wall?.openings.find(
    (candidate) => candidate.id === selection.openingId,
  ) ?? null;
  const soffit = wall
    ? soffitsOn(wall).find((candidate) => candidate.id === selection.soffitId) ?? null
    : null;
  const run = wall?.runs.find((candidate) => candidate.id === selection.runId) ?? null;
  const layout = useMemo(
    () => (run ? splitRun(run, settings, {
      endMinWidths: endMinWidthsForRun(room, wall, run, settings),
      endCornerAngles: endCornerAnglesForRun(room, wall, run),
      pinTargets: pinTargetsForRun(run, wall, wall.length, settings),
    }) : null),
    [room, run, settings, wall],
  );
  const diagnostics = useMemo(
    () => (room ? roomDiagnostics(room, settings) : {}),
    [room, settings],
  );
  const displayLayout = layout && diagnostics[run?.id]
    ? { ...layout, ...diagnostics[run.id] }
    : layout;
  const selectionContext = useMemo(
    () => (run && layout
      ? resolveSelectedPiece(run, layout, selection.pieceId)
      : null),
    [run, layout, selection.pieceId],
  );

  const showMessage = useCallback((message) => {
    if (messageTimer.current) clearTimeout(messageTimer.current);
    dispatch(setMessage(message));
    messageTimer.current = setTimeout(() => {
      dispatch(setMessage(null));
      messageTimer.current = null;
    }, 3000);
  }, [dispatch]);

  useEffect(() => () => {
    if (messageTimer.current) clearTimeout(messageTimer.current);
  }, []);

  useEffect(() => {
    if (!selection.runId) return;
    if (!run) {
      dispatch(clearSelection());
      return;
    }
    if (selection.pieceId && !selectionContext) {
      dispatch(setSelection({ runId: run.id, pieceId: null }));
    }
  }, [dispatch, run, selection.pieceId, selection.runId, selectionContext]);

  useEffect(() => {
    if (selection.openingId && !opening) dispatch(clearSelection());
  }, [dispatch, opening, selection.openingId]);

  return (
    <aside className="w-80 shrink-0 overflow-y-auto border-l border-gray-700 bg-gray-800/50 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300">
        Properties
      </h2>

      <div className="mt-4">
        {!wall ? (
          <p className="text-sm leading-relaxed text-gray-500">
            Select a wall, run or opening to edit it.
          </p>
        ) : opening ? (
          <OpeningProperties
            wall={wall}
            opening={opening}
            settings={settings}
            placementMessage={message}
          />
        ) : soffit ? (
          <SoffitProperties
            room={room}
            wall={wall}
            soffit={soffit}
            settings={settings}
          />
        ) : !run || !displayLayout ? (
          <WallHeightProperties room={room} wall={wall} plan={view === 'plan'} />
        ) : selectionContext ? (
          <PieceProperties
            room={room}
            wall={wall}
            run={run}
            layout={layout}
            selectionContext={selectionContext}
            settings={settings}
          />
        ) : (
          <RunProperties
            wall={wall}
            room={room}
            run={run}
            layout={displayLayout}
            settings={settings}
            showMessage={showMessage}
          />
        )}
      </div>
    </aside>
  );
}
