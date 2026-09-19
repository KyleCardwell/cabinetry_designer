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
  cornerAt,
  cornerReserveParts,
  crownOverlap,
  describeAnchor,
  formatInches,
  formatInchesInput,
  frontDepth,
  moldingStack,
  openingGeometry,
  pinTargetsForRun,
  positionReadouts,
  resolvePinTarget,
  resolveProfile,
  runBlocksOpening,
  splitRun,
  startFromReadout,
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
  formatRunWarning,
  lastCabinetItem,
  lastRunItem,
  prepareRunUpdate,
  resolveSelectedPiece,
} from '../properties/helpers.js';
import {
  addItemAfter,
  clearSelection,
  deleteOpening,
  flipWall,
  lockItem,
  removeItem,
  setAutoCount,
  setItemWidth,
  setItemAbsorb,
  setItemPin,
  setMaxCabinetWidth,
  setMessage,
  setOpeningMeasureMode,
  setRunEnd,
  setRunHeightMode,
  setRunAnchor,
  setRunCornerClearance,
  setRunOverride,
  setRunType,
  setSelection,
  setWallLength,
  splitItem,
  updateOpening,
  updateRun,
  updateWall,
} from '../store/elevationSlice.js';
import InchInput from './InchInput.jsx';
import FaceProperties from './properties/FaceProperties.jsx';

const RUN_TYPES = [
  [CABINET_TYPE_IDS.BASE, 'Base'],
  [CABINET_TYPE_IDS.UPPER, 'Upper'],
  [CABINET_TYPE_IDS.TALL, 'Tall'],
];

const END_TYPES = [
  ['filler', 'Filler'],
  ['end_panel', 'End panel'],
  ['none', 'None'],
];

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

const ERROR_MESSAGES = {
  'over-constrained': 'Fixed widths exceed the run width.',
  'does-not-fill': 'The fixed pieces do not fill the run.',
  'pin-gap': 'The space between pinned cabinets is not filled.',
  'no-room-for-box': 'The height profile leaves no room for this cabinet box.',
  'anchor-opening-missing': 'The anchored opening no longer exists.',
  'anchor-opening-overlap': 'The run anchor datums cross.',
};

const WARNING_MESSAGES = {
  'mixed-counter-heights': 'Overlapping base runs have different counter heights.',
  'crown-above-ceiling': 'The crown profile extends above the wall height.',
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

function Field({ label, children }) {
  return (
    <label className="block text-xs text-gray-400">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function ReadOnlyValue({ value, ariaLabel }) {
  return (
    <div
      aria-label={ariaLabel}
      className="w-full rounded border border-gray-700 bg-gray-900/60 px-2.5 py-1.5 text-sm text-gray-300"
    >
      {formatInches(value)}
    </div>
  );
}

function cornerLabel(corner, room) {
  if (corner.type === 'open') return 'Open end';
  if (corner.type === 'straight') return 'Straight joint';
  if (corner.type === 'outside') return 'Outside corner (not supported yet)';
  const neighbor = room.walls.find((wall) => wall.id === corner.neighborWallId);
  return `Inside corner ${Math.round(corner.angle)}° · ${neighbor
    ? wallLabel(room, neighbor)
    : 'Unknown wall'}`;
}

function EndEditor({ side, end, onChange }) {
  const label = `${side[0].toUpperCase()}${side.slice(1)} end`;
  const hasWidth = end.type === 'filler' || end.type === 'end_panel';

  return (
    <div className="rounded border border-gray-700 bg-gray-900/45 p-3">
      <p className="mb-2 text-xs font-medium text-gray-300">{label}</p>
      <div className="space-y-2">
        <Field label="Type">
          <select
            value={end.type}
            onChange={(event) => {
              const type = event.target.value;
              onChange({
                type,
                width: hasWidth && type === end.type ? end.width : null,
              });
            }}
            className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          >
            {END_TYPES.map(([value, optionLabel]) => (
              <option key={value} value={value}>{optionLabel}</option>
            ))}
          </select>
        </Field>
        {hasWidth && (
          <Field label={end.type === 'filler'
            ? 'Width (blank = auto)'
            : 'Width (blank = default)'}>
            <InchInput
              value={end.width}
              allowBlank
              onCommit={(width) => onChange({ type: end.type, width })}
              aria-label={`${label} width`}
            />
          </Field>
        )}
      </div>
    </div>
  );
}

function WarningsList({ layout }) {
  const warnings = layout.warnings.filter((warning) => warning.code !== 'overhang');
  const hasOverhang = warnings.length !== layout.warnings.length;
  const hasIssues = warnings.length > 0 || layout.errors.length > 0;

  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        Warnings &amp; errors
      </h3>
      {!hasIssues ? (
        <p className="mt-2 text-xs text-gray-500">
          {hasOverhang ? 'No other warnings or errors.' : 'No warnings or errors.'}
        </p>
      ) : (
        <ul className="mt-2 space-y-2 text-xs">
          {layout.errors.map((error, index) => (
            <li
              key={`${error.code}-${index}`}
              className="rounded border border-red-900/80 bg-red-950/45 px-2.5 py-2 text-red-300"
            >
              {ERROR_MESSAGES[error.code] ?? error.code}
            </li>
          ))}
          {warnings.map((warning, index) => (
            <li
              key={`${warning.code}-${warning.pieceId}-${index}`}
              className="rounded border border-amber-900/80 bg-amber-950/35 px-2.5 py-2 text-amber-300"
            >
              {formatRunWarning(warning) ?? WARNING_MESSAGES[warning.code] ?? warning.code}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
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
          <Field label="Width">
            <InchInput
              value={opening.width}
              onCommit={(width) => update({ width })}
              aria-label="Opening width"
            />
          </Field>
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
    boxTop: profile.crownTop - moldingStack(profile),
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
  const overhang = formatRunOverhang(run, wall.length);
  const bothAnchored = run.anchors.left && run.anchors.right;
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

  const changeEnd = (side, end) => dispatch(setRunEnd({ ...actionBase, side, end }));

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
          {[
            ['width', 'Width'],
            ['depth', 'Depth'],
          ].map(([key, label]) => (
            <Field key={key} label={label}>
              {key === 'width' && bothAnchored ? (
                <ReadOnlyValue
                  value={run[key]}
                  ariaLabel={`Resolved run ${label.toLowerCase()}`}
                />
              ) : (
                <InchInput
                  value={run[key]}
                  onCommit={(value) => validateAndDispatch({ [key]: value })}
                  aria-label={`Run ${label.toLowerCase()}`}
                />
              )}
            </Field>
          ))}
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
          Corners &amp; anchors
        </h3>
        <div className="space-y-2">
          {['left', 'right'].map((side) => {
            const insideCorner = corners[side].type === 'inside';
            const anchor = run.anchors[side];
            const openingAnchor = anchor?.to === 'opening' ? anchor : null;
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
              : anchor === true ? 'corner' : 'free';
            const anchorDescription = describeAnchor(room, wall, run, side, settings);
            return (
              <div
                key={side}
                className="rounded border border-gray-700 bg-gray-900/45 p-3"
              >
                <Field label={`Anchor ${side}`}>
                  <select
                    value={anchorValue}
                    onChange={(event) => {
                      const value = event.target.value;
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
                  </select>
                </Field>
                <p className="mt-1.5 text-xs text-gray-500">
                  {cornerLabel(corners[side], room)}
                </p>
                {openingAnchor ? (
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
                ) : wallEndAnchor ? (
                  <div className="mt-3 space-y-2 border-t border-gray-700 pt-3">
                    <Field label={insideCorner ? 'Corner clearance' : 'End offset'}>
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
                    {clearanceMode === 'custom' && (
                      <p className="text-xs text-gray-500">
                        Positive holds the run back; negative carries it past.
                      </p>
                    )}
                    <p className="text-xs text-cyan-300">
                      {anchorDescription}
                    </p>
                  </div>
                ) : null}
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
          Ends
        </h3>
        <div className="space-y-2">
          <EndEditor
            side="left"
            end={run.ends.left}
            onChange={(end) => changeEnd('left', end)}
          />
          <EndEditor
            side="right"
            end={run.ends.right}
            onChange={(end) => changeEnd('right', end)}
          />
        </div>
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

      <WarningsList layout={layout} />
    </div>
  );
}

function CabinetProperties({ wall, run, piece, item, layout, settings }) {
  const dispatch = useDispatch();
  const actionBase = { wallId: wall.id, runId: run.id, itemId: item.id };
  const locked = item.width !== null;
  const typeLabel = RUN_TYPES.find(([value]) => value === run.cabinetTypeId)?.[1] ?? 'Unknown';
  const actualCenter = piece.x + piece.width / 2;
  const pinCount = run.items.filter((candidate) => candidate.pin).length;
  const warnsSecondPin = !item.pin && pinCount === 1;
  const itemIndex = run.items.findIndex((candidate) => candidate.id === item.id);
  const pinnedIndexes = run.items.flatMap((candidate, index) => (candidate.pin ? [index] : []));
  const previousPin = [...pinnedIndexes].reverse().find((index) => index < itemIndex);
  const nextPin = pinnedIndexes.find((index) => index > itemIndex);
  const interiorAutos = previousPin !== undefined && nextPin !== undefined
    ? run.items.slice(previousPin + 1, nextPin).filter(
      (candidate) => candidate.kind === 'cabinet' && candidate.width === null,
    )
    : [];
  const canAbsorb = item.width === null && interiorAutos.length > 1;
  const resolvedTarget = item.pin
    ? resolvePinTarget(item.pin, wall, wall.length, settings)
    : null;
  const defaultPin = {
    anchor: 'center',
    from: 'left',
    openingId: null,
    openingAnchor: 'center',
    value: actualCenter,
  };
  const updatePin = (changes) => dispatch(setItemPin({
    ...actionBase,
    pin: { ...(item.pin ?? defaultPin), ...changes },
  }));
  const datumValue = item.pin?.from === 'opening'
    ? `opening:${item.pin.openingId}`
    : item.pin?.from ?? 'left';

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Cabinet
        </h3>
        <Field label="Width">
          <InchInput
            value={piece.width}
            onCommit={(width) => dispatch(setItemWidth({ ...actionBase, width }))}
            aria-label="Cabinet width"
          />
        </Field>
        <button
          type="button"
          onClick={() => {
            if (locked) dispatch(setItemWidth({ ...actionBase, width: null }));
            else dispatch(lockItem({ ...actionBase, computedWidth: piece.width }));
          }}
          className="mt-2 w-full rounded bg-gray-700 px-3 py-2 text-sm font-medium text-gray-100 hover:bg-gray-600"
        >
          {locked ? 'Unlock width' : 'Lock width'}
        </button>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Pin
        </h3>
        {warnsSecondPin && (
          <p className="mb-2 rounded border border-cyan-900/70 bg-cyan-950/30 p-2 text-xs text-cyan-200">
            A second pin locks both pinned cabinets to their current widths.
          </p>
        )}
        <label className="flex items-center justify-between rounded border border-gray-700 bg-gray-900/45 px-3 py-2 text-sm text-gray-300">
          Pin cabinet
          <input
            type="checkbox"
            checked={Boolean(item.pin)}
            onChange={(event) => dispatch(setItemPin({
              ...actionBase,
              pin: event.target.checked ? defaultPin : null,
            }))}
            className="rounded border-gray-600 bg-gray-900 text-blue-600 focus:ring-blue-500"
          />
        </label>
        {item.pin && (
          <div className="mt-3 space-y-2.5">
            <Field label="Datum">
              <select
                value={datumValue}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value.startsWith('opening:')) {
                    updatePin({
                      from: 'opening',
                      openingId: value.slice('opening:'.length),
                      openingAnchor: 'center',
                      value: 0,
                    });
                  } else {
                    updatePin({
                      from: value,
                      openingId: null,
                      value: value === 'right' ? wall.length - actualCenter : actualCenter,
                    });
                  }
                }}
                aria-label="Pin datum"
                className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
              >
                <option value="left">Left end of wall</option>
                <option value="right">Right end of wall</option>
                {item.pin.openingId
                  && !wall.openings.some((opening) => opening.id === item.pin.openingId)
                  && (
                    <option value={`opening:${item.pin.openingId}`}>
                      Missing opening
                    </option>
                  )}
                {wall.openings.map((opening) => (
                  <option key={opening.id} value={`opening:${opening.id}`}>
                    {opening.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Cabinet anchor">
              <select
                value={item.pin.anchor}
                onChange={(event) => updatePin({ anchor: event.target.value })}
                aria-label="Pinned cabinet anchor"
                className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
              >
                <option value="left">Left edge</option>
                <option value="center">Center</option>
                <option value="right">Right edge</option>
              </select>
            </Field>
            {item.pin.from === 'opening' && (
              <Field label="Opening part">
                <select
                  value={item.pin.openingAnchor}
                  onChange={(event) => updatePin({ openingAnchor: event.target.value })}
                  aria-label="Pinned opening reference"
                  className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
                >
                  <option value="center">Center</option>
                  <option value="casing-left">Casing left edge</option>
                  <option value="casing-right">Casing right edge</option>
                  <option value="jamb-left">Jamb left edge</option>
                  <option value="jamb-right">Jamb right edge</option>
                </select>
              </Field>
            )}
            <Field label="Distance">
              <InchInput
                value={item.pin.value}
                onCommit={(value) => updatePin({ value })}
                aria-label="Pin distance"
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Resolved target">
                {resolvedTarget === null ? (
                  <div className="rounded border border-gray-700 bg-gray-900/60 px-2.5 py-1.5 text-sm text-amber-300">
                    Unresolved
                  </div>
                ) : (
                  <ReadOnlyValue value={resolvedTarget} ariaLabel="Resolved pin target" />
                )}
              </Field>
              <Field label="Actual center">
                <ReadOnlyValue value={actualCenter} ariaLabel="Actual cabinet center" />
              </Field>
            </div>
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Remainder
        </h3>
        <label className={`flex items-center justify-between rounded border border-gray-700 bg-gray-900/45 px-3 py-2 text-sm ${canAbsorb ? 'text-gray-300' : 'text-gray-500'}`}>
          Absorb odd amount
          <input
            type="checkbox"
            checked={Boolean(item.absorb)}
            disabled={!canAbsorb}
            onChange={(event) => dispatch(setItemAbsorb({
              ...actionBase,
              value: event.target.checked,
            }))}
            className="rounded border-gray-600 bg-gray-900 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          />
        </label>
        {!canAbsorb && (
          <p className="mt-2 text-xs leading-relaxed text-gray-500">
            This only affects an auto cabinet inside a segment between two pins that contains more than one auto cabinet.
          </p>
        )}
        {Number.isFinite(piece.absorbed) && (
          <p className="mt-2 text-xs text-cyan-300">
            Absorbed {formatInches(piece.absorbed)}
          </p>
        )}
      </section>

      <section className="grid grid-cols-2 gap-2 rounded border border-gray-700 bg-gray-900/45 p-3 text-xs">
        <div>
          <p className="text-gray-500">Run type</p>
          <p className="mt-1 text-gray-200">{typeLabel}</p>
        </div>
        <div>
          <p className="text-gray-500">Run height</p>
          <p className="mt-1 text-gray-200">{formatInches(run.height)}</p>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => dispatch(splitItem(actionBase))}
          className="rounded bg-gray-700 px-2.5 py-2 text-xs text-gray-100 hover:bg-gray-600"
        >
          Split in 2
        </button>
        <button
          type="button"
          onClick={() => dispatch(addItemAfter({ ...actionBase, kind: 'cabinet' }))}
          className="rounded bg-gray-700 px-2.5 py-2 text-xs text-gray-100 hover:bg-gray-600"
        >
          Add cabinet right
        </button>
        <button
          type="button"
          onClick={() => dispatch(addItemAfter({ ...actionBase, kind: 'filler' }))}
          className="rounded bg-gray-700 px-2.5 py-2 text-xs text-gray-100 hover:bg-gray-600"
        >
          Add filler right
        </button>
        <button
          type="button"
          onClick={() => dispatch(removeItem(actionBase))}
          className="rounded bg-red-900/70 px-2.5 py-2 text-xs text-red-100 hover:bg-red-800"
        >
          Remove
        </button>
      </section>

      <FaceProperties wall={wall} run={run} piece={piece} item={item} layout={layout} settings={settings} />
    </div>
  );
}

function InteriorFillerProperties({ wallId, run, piece, item }) {
  const dispatch = useDispatch();
  const actionBase = { wallId, runId: run.id, itemId: item.id };

  return (
    <div className="space-y-4">
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Interior filler
        </h3>
        <Field label="Width">
          <InchInput
            value={piece.width}
            onCommit={(width) => dispatch(setItemWidth({ ...actionBase, width }))}
            aria-label="Interior filler width"
          />
        </Field>
      </section>
      <button
        type="button"
        onClick={() => dispatch(removeItem(actionBase))}
        className="w-full rounded bg-red-900/70 px-3 py-2 text-sm text-red-100 hover:bg-red-800"
      >
        Remove
      </button>
    </div>
  );
}

function EndProperties({ wallId, run, side }) {
  const dispatch = useDispatch();
  const end = run.ends[side];

  return (
    <section>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
        {side} end piece
      </h3>
      <EndEditor
        side={side}
        end={end}
        onChange={(nextEnd) => dispatch(setRunEnd({
          wallId,
          runId: run.id,
          side,
          end: nextEnd,
        }))}
      />
    </section>
  );
}

function PieceProperties({ wall, run, layout, selectionContext, settings }) {
  const { piece, item, side } = selectionContext;

  if (side) {
    return <EndProperties wallId={wall.id} run={run} side={side} />;
  }
  if (!item) return null;
  if (item.kind === 'filler') {
    return (
      <InteriorFillerProperties
        wallId={wall.id}
        run={run}
        piece={piece}
        item={item}
      />
    );
  }
  return (
    <CabinetProperties
      wall={wall}
      run={run}
      piece={piece}
      item={item}
      layout={layout}
      settings={settings}
    />
  );
}

function WallHeightProperties({ room, wall, plan }) {
  const dispatch = useDispatch();
  const autoNumber = wallNumbers(room).get(wall.id);
  const duplicateNumber = wallNumberWarnings(room)
    .some((warning) => warning.wallIds.includes(wall.id));
  const resolvedProfile = { ...room.profile, ...wall.profile };
  const overlap = crownOverlap(resolvedProfile);
  const frame = wallFrame(room, wall);
  const leftFree = !wall.connections?.[frame.leftEndpoint];
  const rightFree = !wall.connections?.[frame.rightEndpoint];
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
              <div className="block text-xs text-gray-400">
                <span className="mb-1 block">Length</span>
                <div className="flex items-stretch gap-1">
                  <button
                    type="button"
                    onClick={() => setGrowEnd('left')}
                    aria-label="Change wall length at left end"
                    aria-pressed={growEnd === 'left'}
                    className={`w-7 rounded border text-lg leading-none transition-colors ${
                      growEnd === 'left'
                        ? 'border-cyan-500 bg-cyan-950/70 text-cyan-200'
                        : 'border-gray-600 bg-gray-900 text-gray-500 hover:bg-gray-700'
                    }`}
                  >
                    ‹
                  </button>
                  <InchInput
                    value={wall.length}
                    onCommit={updateLength}
                    aria-label="Wall length"
                    className="min-w-0"
                  />
                  <button
                    type="button"
                    onClick={() => setGrowEnd('right')}
                    aria-label="Change wall length at right end"
                    aria-pressed={growEnd === 'right'}
                    className={`w-7 rounded border text-lg leading-none transition-colors ${
                      growEnd === 'right'
                        ? 'border-cyan-500 bg-cyan-950/70 text-cyan-200'
                        : 'border-gray-600 bg-gray-900 text-gray-500 hover:bg-gray-700'
                    }`}
                  >
                    ›
                  </button>
                </div>
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
  const wall = useMemo(() => resolveWall(room, storedWall), [room, storedWall]);
  const opening = wall?.openings.find(
    (candidate) => candidate.id === selection.openingId,
  ) ?? null;
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
        ) : !run || !displayLayout ? (
          <WallHeightProperties room={room} wall={wall} plan={view === 'plan'} />
        ) : selectionContext ? (
          <PieceProperties
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
