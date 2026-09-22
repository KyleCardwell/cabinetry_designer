import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  FACE_TYPE_LABELS,
  FACE_TYPES,
  MAX_FACE_SPLIT,
  ROOT_FACE_PATH,
  applyStandardDrawers,
  runFaceLayouts,
  defaultFace,
  equalizeGroup,
  faceOutline,
  getFaceNode,
  makeDrawerStack,
  parentFacePath,
  presetsFor,
  removeFace,
  setFaceSize,
  setFaceType,
  setGroupCount,
  splitFace,
} from '../../model/index.js';
import { setFacePath, setItemFace } from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import CabinetStyleProperties from './CabinetStyleProperties.jsx';

const BUTTON_CLASS = 'rounded bg-gray-700 px-2.5 py-2 text-xs text-gray-100 hover:bg-gray-600';
const DISABLED_CLASS = 'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-gray-700';
const NUMBER_CLASS = 'w-16 rounded border border-gray-600 bg-gray-900 px-2 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';

function groupLabel(node) {
  if (
    node.direction === 'vertical'
    && node.children.every((child) => child.type === 'drawer_front')
  ) {
    return `Drawer stack × ${node.children.length}`;
  }
  const name = node.direction === 'horizontal' ? 'Side by side' : 'Stack';
  return `${name} × ${node.children.length}`;
}

// `layout` is the run's splitRun result; it supplies the same-width targets.
export default function FaceProperties({ wall, run, piece, item, layout, settings }) {
  const dispatch = useDispatch();
  const facePath = useSelector((state) => state.elevation.facePath);
  const stored = item.face ?? null;
  const face = stored ?? defaultFace(piece.width, settings);
  const room = useSelector((state) => state.elevation.rooms.find(
    (candidate) => candidate.id === state.elevation.activeRoomId,
  ));
  const faceLayout = runFaceLayouts(room, wall, run, settings, layout).get(piece.id);
  const warnings = faceLayout?.warnings ?? [];
  const [splitCount, setSplitCount] = useState(2);
  const selected = facePath === null ? null : getFaceNode(face, facePath);
  const sameWidthIds = layout.pieces
    .filter((p) => p.kind === 'cabinet' && p.role === 'item' && Math.abs(p.width - piece.width) < 1e-6)
    .map((p) => p.id);
  const hasOtherMatches = sameWidthIds.some((id) => id !== item.id);

  const commit = (nextFace) => dispatch(setItemFace({
    wallId: wall.id,
    runId: run.id,
    itemIds: [item.id],
    face: nextFace,
  }));

  const applyPreset = (nextFace) => {
    commit(nextFace);
    dispatch(setFacePath(null));
  };

  const commitIfChanged = (nextFace) => {
    if (nextFace !== face) commit(nextFace);
  };

  const remove = () => {
    commitIfChanged(removeFace(face, facePath));
    dispatch(setFacePath(parentFacePath(facePath)));
  };

  const applyToSameWidth = () => dispatch(setItemFace({
    wallId: wall.id,
    runId: run.id,
    itemIds: sameWidthIds,
    face: stored,
  }));

  return (
    <section className="space-y-3">
      {faceLayout && (
        <CabinetStyleProperties
          room={room}
          wall={wall}
          run={run}
          item={item}
          settings={settings}
          faceLayout={faceLayout}
        />
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Faces</h3>
        {stored === null ? (
          <span className="text-xs text-gray-500">Default</span>
        ) : (
          <button
            type="button"
            onClick={() => applyPreset(null)}
            className="rounded bg-gray-700 px-2 py-1 text-xs text-gray-100 hover:bg-gray-600"
          >
            Reset
          </button>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {presetsFor(run.cabinetTypeId).map((preset) => (
          <button
            key={preset.key}
            type="button"
            title={preset.description}
            onClick={() => applyPreset(faceLayout
              ? applyStandardDrawers(preset.face, faceLayout.style, settings)
              : preset.face)}
            className={BUTTON_CLASS}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="space-y-1">
        {faceOutline(face).map(({ path, depth, node }) => (
          <div
            key={path}
            onClick={() => dispatch(setFacePath(path))}
            style={{ paddingLeft: depth * 12 }}
            className={`flex cursor-pointer items-center gap-2 border-l-2 py-1 pr-1 ${
              path === facePath ? 'border-blue-500 bg-gray-800/60' : 'border-transparent'
            }`}
          >
            <div className="min-w-0 flex-1">
              {node.type ? (
                <select
                  value={node.type}
                  onChange={(event) => commit(setFaceType(face, path, event.target.value))}
                  aria-label={`Face type ${path}`}
                  className={SELECT_CLASS}
                >
                  {FACE_TYPES.map((type) => (
                    <option key={type} value={type}>{FACE_TYPE_LABELS[type]}</option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-gray-300">{groupLabel(node)}</span>
              )}
            </div>
            {path !== ROOT_FACE_PATH && (
              <div className="w-20 shrink-0">
                <InchInput
                  value={node.size}
                  allowBlank
                  placeholder="auto"
                  aria-label={`Face size ${path}`}
                  onCommit={(value) => {
                    const next = setFaceSize(face, path, value);
                    if (next === face) return false;
                    commit(next);
                    return true;
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {selected && (
        <div className="space-y-2 rounded border border-gray-700 p-2">
          {selected.type ? (
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-gray-300">
                Sections
                <input
                  type="number"
                  min={2}
                  max={MAX_FACE_SPLIT}
                  value={splitCount}
                  onChange={(event) => setSplitCount(event.target.value)}
                  onBlur={() => {
                    const n = Math.round(Number(splitCount));
                    setSplitCount(Number.isFinite(n) ? Math.min(MAX_FACE_SPLIT, Math.max(2, n)) : 2);
                  }}
                  className={NUMBER_CLASS}
                />
              </label>
              <button
                type="button"
                title="Split side by side"
                aria-label="Split side by side"
                onClick={() => commitIfChanged(splitFace(face, facePath, 'horizontal', Number(splitCount)))}
                className={`${BUTTON_CLASS} flex h-7 w-7 items-center justify-center p-0`}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <path d="M8 2v12M5.5 5 2.5 8l3 3M10.5 5l3 3-3 3" />
                </svg>
              </button>
              <button
                type="button"
                title="Split into a stack"
                aria-label="Split into a stack"
                onClick={() => commitIfChanged(splitFace(face, facePath, 'vertical', Number(splitCount)))}
                className={`${BUTTON_CLASS} flex h-7 w-7 items-center justify-center p-0`}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <path
                    d="M8 2v12M5.5 5 2.5 8l3 3M10.5 5l3 3-3 3"
                    transform="rotate(90 8 8)"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => commitIfChanged(makeDrawerStack(
                  face,
                  facePath,
                  Number(splitCount),
                ))}
                className={BUTTON_CLASS}
              >
                Drawer stack
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-gray-300">
                Sections
                <input
                  type="number"
                  min={1}
                  max={MAX_FACE_SPLIT}
                  value={selected.children.length}
                  onChange={(event) => {
                    if (event.target.value === '') return;
                    commitIfChanged(setGroupCount(face, facePath, Number(event.target.value)));
                  }}
                  className={NUMBER_CLASS}
                />
              </label>
              <button
                type="button"
                onClick={() => commitIfChanged(equalizeGroup(face, facePath))}
                className={BUTTON_CLASS}
              >
                Make equal
              </button>
            </div>
          )}
          {facePath !== ROOT_FACE_PATH && (
            <button type="button" onClick={remove} className={BUTTON_CLASS}>
              Remove
            </button>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={applyToSameWidth}
        disabled={!hasOtherMatches}
        className={`w-full ${BUTTON_CLASS} ${DISABLED_CLASS}`}
      >
        Apply to same-width cabinets
      </button>

      {warnings.length > 0 && (
        <p className="text-xs font-medium text-amber-300">Sections don&apos;t fit. Reduce a fixed size.</p>
      )}
    </section>
  );
}
