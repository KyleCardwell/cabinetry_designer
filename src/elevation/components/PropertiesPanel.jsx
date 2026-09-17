import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  CABINET_TYPE_IDS,
  KIND_LABELS,
  cornerAt,
  cornerReserve,
  formatInches,
  frontDepth,
  moldingStack,
  resolveProfile,
  splitRun,
} from '../model/index.js';
import {
  endMinWidthsForRun,
  resolveWall,
  roomDiagnostics,
} from '../model/room.js';
import {
  lastCabinetItem,
  lastRunItem,
  prepareRunUpdate,
  resolveSelectedPiece,
} from '../properties/helpers.js';
import {
  addItemAfter,
  clearSelection,
  flipWall,
  lockItem,
  removeItem,
  setAutoCount,
  setItemWidth,
  setMaxCabinetWidth,
  setMessage,
  setRunEnd,
  setRunHeightMode,
  setRunAnchor,
  setRunOverride,
  setRunType,
  setSelection,
  setWallLength,
  splitItem,
  updateRun,
  updateWall,
} from '../store/elevationSlice.js';
import InchInput from './InchInput.jsx';

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

const PLACEMENT_MESSAGES = {
  'out-of-bounds': 'Run must stay inside the wall.',
  conflict: 'Run conflicts with another run.',
};

const ERROR_MESSAGES = {
  'over-constrained': 'Fixed widths exceed the run width.',
  'does-not-fill': 'The fixed pieces do not fill the run.',
  'no-room-for-box': 'The height profile leaves no room for this cabinet box.',
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
  return `Inside corner ${Math.round(corner.angle)}° · ${neighbor?.name ?? 'Unknown wall'}`;
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
  const hasIssues = layout.warnings.length > 0 || layout.errors.length > 0;

  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        Warnings &amp; errors
      </h3>
      {!hasIssues ? (
        <p className="mt-2 text-xs text-gray-500">No warnings or errors.</p>
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
          {layout.warnings.map((warning, index) => (
            <li
              key={`${warning.code}-${warning.pieceId}-${index}`}
              className="rounded border border-amber-900/80 bg-amber-950/35 px-2.5 py-2 text-amber-300"
            >
              {warning.message ?? WARNING_MESSAGES[warning.code] ?? warning.code}
            </li>
          ))}
        </ul>
      )}
    </section>
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
  const reserves = Object.fromEntries(['left', 'right'].map((side) => [
    side,
    cornerReserve(room, wall, side, run, settings),
  ]));
  const anchored = run.anchors.left || run.anchors.right;
  const bothAnchored = run.anchors.left && run.anchors.right;

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
            ['x', 'X'],
            ['width', 'Width'],
            ['depth', 'Depth'],
          ].map(([key, label]) => (
            <Field key={key} label={label}>
              {(key === 'x' && anchored) || (key === 'width' && bothAnchored) ? (
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
        <div className="mt-2.5">
          <Field label="Front depth">
            <ReadOnlyValue
              value={frontDepth(run, settings)}
              ariaLabel="Installed front depth"
            />
          </Field>
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Corners &amp; anchors
        </h3>
        <div className="space-y-2">
          {['left', 'right'].map((side) => (
            <div
              key={side}
              className="rounded border border-gray-700 bg-gray-900/45 p-3"
            >
              <label className="flex items-center justify-between text-sm text-gray-200">
                <span className="capitalize">Anchor {side}</span>
                <input
                  type="checkbox"
                  checked={run.anchors[side]}
                  onChange={(event) => dispatch(setRunAnchor({
                    ...actionBase,
                    side,
                    value: event.target.checked,
                  }))}
                  className="rounded border-gray-600 bg-gray-900 text-blue-600 focus:ring-blue-500"
                />
              </label>
              <p className="mt-1.5 text-xs text-gray-500">
                {cornerLabel(corners[side], room)}
              </p>
              {run.anchors[side] && (
                <p className="mt-1 text-xs text-cyan-300">
                  Anchored — corner reserve {formatInches(reserves[side])}
                </p>
              )}
            </div>
          ))}
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
                    placeholder={formatInches(inheritedValues[key])}
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
                <span className="tabular-nums text-gray-300">{formatInches(piece.width)}</span>
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

function CabinetProperties({ wallId, run, piece, item }) {
  const dispatch = useDispatch();
  const actionBase = { wallId, runId: run.id, itemId: item.id };
  const locked = item.width !== null;
  const typeLabel = RUN_TYPES.find(([value]) => value === run.cabinetTypeId)?.[1] ?? 'Unknown';

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

function PieceProperties({ wallId, run, selectionContext }) {
  const { piece, item, side } = selectionContext;

  if (side) {
    return <EndProperties wallId={wallId} run={run} side={side} />;
  }
  if (!item) return null;
  if (item.kind === 'filler') {
    return (
      <InteriorFillerProperties
        wallId={wallId}
        run={run}
        piece={piece}
        item={item}
      />
    );
  }
  return (
    <CabinetProperties
      wallId={wallId}
      run={run}
      piece={piece}
      item={item}
    />
  );
}

function WallHeightProperties({ room, wall, plan }) {
  const dispatch = useDispatch();

  const updateLength = (length) => {
    if (length <= 0) return false;
    dispatch(setWallLength({ wallId: wall.id, length }));
    return true;
  };

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Wall
        </h3>
        {plan ? (
          <div className="space-y-2.5">
            <Field label="Name">
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
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Length">
                <InchInput
                  value={wall.length}
                  onCommit={updateLength}
                  aria-label="Wall length"
                />
              </Field>
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
            <p className="mb-3 text-sm font-medium text-gray-200">{wall.name}</p>
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
                placeholder={formatInches(room.profile[key])}
                onCommit={(value) => dispatch(updateWall({
                  wallId: wall.id,
                  changes: { profile: { [key]: value } },
                }))}
                aria-label={`Wall ${label} override`}
              />
            </Field>
          ))}
        </div>
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
    selection,
    settings,
    view,
  } = useSelector(
    (state) => state.elevation,
  );
  const room = rooms.find((candidate) => candidate.id === activeRoomId) ?? null;
  const storedWall = room?.walls.find((candidate) => candidate.id === activeWallId) ?? null;
  const wall = useMemo(() => resolveWall(room, storedWall), [room, storedWall]);
  const run = wall?.runs.find((candidate) => candidate.id === selection.runId) ?? null;
  const layout = useMemo(
    () => (run ? splitRun(run, settings, {
      endMinWidths: endMinWidthsForRun(room, wall, run, settings),
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

  return (
    <aside className="w-80 shrink-0 overflow-y-auto border-l border-gray-700 bg-gray-800/50 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300">
        Properties
      </h2>

      <div className="mt-4">
        {!wall ? (
          <p className="text-sm leading-relaxed text-gray-500">
            Add or select a wall to edit its properties.
          </p>
        ) : !run || !displayLayout ? (
          <WallHeightProperties room={room} wall={wall} plan={view === 'plan'} />
        ) : selectionContext ? (
          <PieceProperties
            wallId={wall.id}
            run={run}
            selectionContext={selectionContext}
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
