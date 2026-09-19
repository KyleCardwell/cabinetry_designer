import { useDispatch, useSelector } from 'react-redux';
import {
  FACE_TYPE_LABELS,
  FACE_TYPES,
  ROOT_FACE_PATH,
  cabinetFaces,
  defaultFace,
  faceOutline,
  presetsFor,
  setFaceSize,
  setFaceType,
} from '../../model/index.js';
import { setFacePath, setItemFace } from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';

const BUTTON_CLASS = 'rounded bg-gray-700 px-2.5 py-2 text-xs text-gray-100 hover:bg-gray-600';
const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';

function groupLabel(node) {
  const name = node.direction === 'horizontal' ? 'Side by side' : 'Stack';
  return `${name} × ${node.children.length}`;
}

// `layout` is the run's splitRun result; it's used by the step 58 actions.
export default function FaceProperties({ wall, run, piece, item, layout, settings }) {
  const dispatch = useDispatch();
  const facePath = useSelector((state) => state.elevation.facePath);
  const stored = item.face ?? null;
  const face = stored ?? defaultFace(piece.width, settings);
  const { warnings } = cabinetFaces(item, piece, run.cabinetTypeId, settings);

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

  return (
    <section className="space-y-3">
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
            onClick={() => applyPreset(preset.face)}
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

      {warnings.length > 0 && (
        <p className="text-xs font-medium text-amber-300">Sections don&apos;t fit. Reduce a fixed size.</p>
      )}
    </section>
  );
}
