import { useCallback, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { BUILT_IN_PULL_IDS } from '../elevation/model/pulls.js';
import { formatInches } from '../elevation/model/units.js';
import { addPull, deletePull } from '../elevation/store/elevationSlice.js';
import PullEditor from './PullEditor.jsx';

const BUTTON_CLASS = 'rounded border border-gray-600 px-2.5 py-1.5 text-sm text-gray-200 hover:bg-gray-700';
const CELL_CLASS = 'px-3 py-3 align-top';
const KIND_LABELS = { pull: 'Pull', knob: 'Knob', tab: 'Tab' };

function sizeText(pull) {
  if (pull.kind === 'knob') return `${formatInches(pull.diameter)} dia.`;
  const length = `${formatInches(pull.length)} long`;
  if (pull.kind === 'tab') return `${length} · ${formatInches(pull.height)} tall`;
  return pull.centers === undefined ? length : `${length} · ${formatInches(pull.centers)} centers`;
}

export default function PullsPage() {
  const dispatch = useDispatch();
  const { settings, source } = useSelector((state) => state.elevation);
  const shopData = source === 'cloud';
  const pulls = settings.pulls;
  const [editingId, setEditingId] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const closeEditor = useCallback(() => setEditingId(null), []);
  const editingPull = pulls.find((pull) => pull.id === editingId);

  const add = () => {
    const action = addPull();
    dispatch(action);
    setEditingId(action.payload.id);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-100">Pulls</h1>
          <p className="mt-1 text-sm text-gray-400">Pulls, knobs and tab pulls drawn on doors and drawer fronts. Never on reports.</p>
        </div>
        <button type="button" className={`${BUTTON_CLASS} shrink-0`} onClick={add}>New pull</button>
      </div>
      <div className="overflow-x-auto rounded border border-gray-700">
        <table className="w-full text-left text-sm text-gray-300">
          <thead className="bg-gray-800 text-xs text-gray-400">
            <tr>
              {['Name', 'Kind', 'Size', 'Projection', 'Actions'].map((heading) => (
                <th key={heading} scope="col" className="px-3 py-2 font-medium">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {pulls.map((pull) => {
              const builtIn = BUILT_IN_PULL_IDS.includes(pull.id);
              const deletingThis = deleting === pull.id;
              return (
                <tr key={pull.id}>
                  <td className={CELL_CLASS}>
                    <span className="font-medium text-gray-100">{pull.name}</span>
                    {builtIn && <span className="ml-2 rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-400">built-in</span>}
                  </td>
                  <td className={CELL_CLASS}>{KIND_LABELS[pull.kind]}</td>
                  <td className={CELL_CLASS}>{sizeText(pull)}</td>
                  <td className={CELL_CLASS}>{formatInches(pull.projection)}</td>
                  <td className={CELL_CLASS}>
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" className={BUTTON_CLASS} onClick={() => setEditingId(pull.id)}>Edit</button>
                      <button type="button" className={BUTTON_CLASS} onClick={() => dispatch(addPull({ baseId: pull.id }))}>Copy</button>
                      {!builtIn && (
                        <button
                          type="button"
                          className={BUTTON_CLASS}
                          onClick={() => {
                            if (deletingThis) {
                              dispatch(deletePull({ pullId: pull.id }));
                              setDeleting(null);
                            } else {
                              setDeleting(pull.id);
                            }
                          }}
                        >
                          {deletingThis ? (shopData ? 'Confirm archive' : 'Confirm delete') : (shopData ? 'Archive' : 'Delete')}
                        </button>
                      )}
                      {deletingThis && (
                        <>
                          <span className="text-sm text-gray-400">Rooms that use it will ask for a replacement when opened.</span>
                          <button type="button" className={BUTTON_CLASS} onClick={() => setDeleting(null)}>Cancel</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editingPull && <PullEditor key={editingPull.id} pull={editingPull} pulls={pulls} onClose={closeEditor} />}
    </div>
  );
}
