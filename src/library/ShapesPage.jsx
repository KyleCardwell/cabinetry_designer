import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useNavigate } from 'react-router-dom';
import { SHAPE_KINDS } from '../elevation/model/constants.js';
import { copyShape, newShape, shapeViewProfile } from '../elevation/model/libraryShapes.js';
import { formatInches } from '../elevation/model/units.js';
import { addShape, deleteShape, setShapeArchived } from '../elevation/store/elevationSlice.js';
import ProfileThumbnail from './ProfileThumbnail.jsx';
import { useShopReadOnly } from './WorkspaceSourceBar.jsx';

const BUTTON_CLASS = 'rounded border border-gray-600 px-2.5 py-1.5 text-sm text-gray-200 hover:bg-gray-700 disabled:opacity-50';
const INPUT_CLASS = 'rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';

const BUILDER_TAGS = { extrude: ' · Extrusion', stack: ' · Leg stack' };

export default function ShapesPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { settings, source } = useSelector((state) => state.elevation);
  const readOnly = useShopReadOnly();
  const shapes = settings.shapes;
  const shopData = source === 'cloud';
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [confirmingId, setConfirmingId] = useState(null);
  const filtered = shapes.filter((shape) => (showArchived || !shape.archived)
    && (kind === null || shape.kind === kind)
    && shape.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-100">Shapes</h1>
          <p className="mt-1 text-sm text-gray-400">Drawings for accessories, appliances, legs and other shapes.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[['drawn', 'New shape'], ['extrude', 'New extrusion'], ['stack', 'New leg / column']].map(([type, label]) => (
            <button key={type} type="button" className={BUTTON_CLASS} disabled={readOnly} onClick={() => {
              if (readOnly) return;
              const shape = newShape(shapes, undefined, type);
              dispatch(addShape({ shape }));
              navigate(`/library/shapes/${shape.id}`);
            }}>{label}</button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input type="search" aria-label="Search shapes" placeholder="Search names" className={`${INPUT_CLASS} w-full max-w-xs`}
          value={search} onChange={(event) => { setSearch(event.target.value); setConfirmingId(null); }} />
        <div className="flex flex-wrap gap-2">
          {[[null, 'All'], ...Object.entries(SHAPE_KINDS)].map(([value, label]) => (
            <button key={value ?? 'all'} type="button" aria-pressed={kind === value}
              className={`rounded-full px-2.5 py-1 text-xs ${kind === value ? 'bg-blue-600 text-white' : 'border border-gray-600 text-gray-300 hover:bg-gray-700'}`}
              onClick={() => { setKind(value); setConfirmingId(null); }}>{label}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" checked={showArchived} onChange={(event) => { setShowArchived(event.target.checked); setConfirmingId(null); }} />
          Show archived
        </label>
      </div>
      {filtered.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((shape) => (
            <div key={shape.id} className={`space-y-2 rounded border border-gray-700 bg-gray-800/60 p-3${shape.archived ? ' opacity-60' : ''}`}>
              <div className="h-32 rounded bg-gray-900 p-2 text-gray-200">
                <ProfileThumbnail profile={shapeViewProfile(shape, 'front')} className="h-full w-full" />
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-100">{shape.name}</span>
                {shape.archived && <span className="rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-400">archived</span>}
              </div>
              <p className="text-sm text-gray-300">{`${SHAPE_KINDS[shape.kind]}${BUILDER_TAGS[shape.builder?.type] ?? ''} · ${['w', 'h', 'd'].map((axis) => formatInches(shape.box[axis]).replace(/"$/, '')).join(' × ')}`}</p>
              <div className="flex flex-wrap gap-2">
                <Link to={`/library/shapes/${shape.id}`} className={BUTTON_CLASS}>Edit</Link>
                <button type="button" className={BUTTON_CLASS} disabled={readOnly} onClick={() => {
                  if (readOnly) return;
                  setConfirmingId(null);
                  dispatch(addShape({ shape: copyShape(shapes, shape) }));
                }}>Copy</button>
                {shape.archived ? (
                  <button type="button" className={BUTTON_CLASS} disabled={readOnly} onClick={() => {
                    if (readOnly) return;
                    setConfirmingId(null);
                    dispatch(setShapeArchived({ shapeId: shape.id, archived: false }));
                  }}>Restore</button>
                ) : (
                  <button type="button" className={BUTTON_CLASS} disabled={readOnly} onClick={() => {
                    if (readOnly) return;
                    if (confirmingId !== shape.id) { setConfirmingId(shape.id); return; }
                    dispatch(shopData ? setShapeArchived({ shapeId: shape.id, archived: true }) : deleteShape({ shapeId: shape.id }));
                    setConfirmingId(null);
                  }}>{confirmingId === shape.id ? `Confirm ${shopData ? 'archive' : 'delete'}` : shopData ? 'Archive' : 'Delete'}</button>
                )}
                {!shopData && shape.archived && <button type="button" className={BUTTON_CLASS} onClick={() => {
                  if (confirmingId !== shape.id) { setConfirmingId(shape.id); return; }
                  dispatch(deleteShape({ shapeId: shape.id }));
                  setConfirmingId(null);
                }}>{confirmingId === shape.id ? 'Confirm delete' : 'Delete'}</button>}
              </div>
              {confirmingId === shape.id && <p role="alert" className="text-sm text-amber-300">Accessories that use it will still draw it.</p>}
            </div>
          ))}
        </div>
      ) : <p className="text-sm text-gray-400">{shapes.length === 0 ? 'No shapes yet. New shape starts a 12 × 12 × 12 size box; New extrusion and New leg / column build the views for you.' : 'No shapes match.'}</p>}
    </div>
  );
}
