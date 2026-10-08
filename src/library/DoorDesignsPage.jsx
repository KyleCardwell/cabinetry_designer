import { Fragment, useCallback, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { SEEDED_DESIGN_IDS, doorDesignUses } from '../elevation/model/doorDesigns.js';
import { addDoorDesign, deleteDoorDesign } from '../elevation/store/elevationSlice.js';
import DoorDesignEditor from './DoorDesignEditor.jsx';

const BUTTON_CLASS = 'rounded border border-gray-600 px-2.5 py-1.5 text-sm text-gray-200 hover:bg-gray-700';
const INPUT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const CELL_CLASS = 'px-3 py-3 align-top';
const CONSTRUCTION_LABELS = {
  five_piece: '5-piece',
  slab: 'Slab',
  slab_applied: 'Slab + applied molding',
};

function railsText(design) {
  const top = design.topRail.shape;
  const bottom = design.bottomRail.shape;
  if (top === 'flat' && bottom === 'flat') return 'Flat';
  return `${top[0].toUpperCase()}${top.slice(1)} top / ${bottom} bottom`;
}

export default function DoorDesignsPage() {
  const dispatch = useDispatch();
  const { settings, rooms } = useSelector((state) => state.elevation);
  const designs = settings.doorDesigns;
  const [editingId, setEditingId] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const closeEditor = useCallback(() => setEditingId(null), []);
  const editingDesign = designs.find((design) => design.id === editingId);

  const addDesign = () => {
    const action = addDoorDesign();
    dispatch(action);
    setEditingId(action.payload.id);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-100">Door designs</h1>
          <p className="mt-1 text-sm text-gray-400">How doors are built — your vendor&apos;s codes. Each room&apos;s door styles pick one.</p>
        </div>
        <button type="button" className={`${BUTTON_CLASS} shrink-0`} onClick={() => addDesign()}>New design</button>
      </div>
      <div className="overflow-x-auto rounded border border-gray-700">
        <table className="w-full text-left text-sm text-gray-300">
          <thead className="bg-gray-800 text-xs text-gray-400">
            <tr>
              {['Code', 'Vendor', 'Description', 'Construction', 'Rails', 'Used by', 'Actions'].map((heading) => (
                <th key={heading} scope="col" className="px-3 py-2 font-medium">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {designs.map((design) => {
              const seeded = SEEDED_DESIGN_IDS.includes(design.id);
              const uses = doorDesignUses(settings, rooms, design.id);
              const usedBy = uses.map((use) => use.level === 'team'
                ? 'Team default'
                : `${rooms.find((room) => room.id === use.roomId)?.name ?? use.roomId} ${use.label}`).join(', ');
              const deletingThis = deleting?.designId === design.id;
              return (
                <Fragment key={design.id}>
                  <tr>
                    <td className={CELL_CLASS}>
                      <span className="font-medium text-gray-100">{design.code}</span>
                      {seeded && <span className="ml-2 rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-400">built-in</span>}
                    </td>
                    <td className={CELL_CLASS}>{design.vendor ?? '—'}</td>
                    <td className={CELL_CLASS}>{design.description}</td>
                    <td className={CELL_CLASS}>{CONSTRUCTION_LABELS[design.construction]}</td>
                    <td className={CELL_CLASS}>{railsText(design)}</td>
                    <td className={CELL_CLASS}>{usedBy || '—'}</td>
                    <td className={CELL_CLASS}>
                      <div className="flex gap-2">
                        <button type="button" className={BUTTON_CLASS} onClick={() => setEditingId(design.id)}>Edit</button>
                        <button type="button" className={BUTTON_CLASS} onClick={() => dispatch(addDoorDesign({ baseId: design.id }))}>Copy</button>
                        {!seeded && (
                          <button
                            type="button"
                            className={BUTTON_CLASS}
                            onClick={() => {
                              if (!uses.length) {
                                dispatch(deleteDoorDesign({ designId: design.id }));
                                setDeleting(null);
                                return;
                              }
                              setDeleting({
                                designId: design.id,
                                reassignTo: designs.find((entry) => entry.id !== design.id).id,
                              });
                            }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {deletingThis && (
                    <tr className="bg-gray-800/60">
                      <td colSpan={7} className="px-3 py-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <label className="flex items-center gap-3 text-sm text-gray-400">
                            Used by {uses.length} style(s). Move them to:
                            <select
                              aria-label={`Move styles from ${design.code} to`}
                              value={deleting.reassignTo}
                              className={INPUT_CLASS}
                              onChange={(event) => setDeleting({ ...deleting, reassignTo: event.target.value })}
                            >
                              {designs.filter((entry) => entry.id !== design.id).map((entry) => (
                                <option key={entry.id} value={entry.id}>{entry.code}</option>
                              ))}
                            </select>
                          </label>
                          <button
                            type="button"
                            className={BUTTON_CLASS}
                            onClick={() => {
                              dispatch(deleteDoorDesign(deleting));
                              setDeleting(null);
                            }}
                          >
                            Delete
                          </button>
                          <button type="button" className={BUTTON_CLASS} onClick={() => setDeleting(null)}>Cancel</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500">Arched rails are recorded now and drawn flat until arched rails are added. Profile slots follow the construction. The library is saved in this browser with the Elevation Lab drawings until it moves to the team&apos;s account.</p>
      {editingDesign && <DoorDesignEditor key={editingDesign.id} design={editingDesign} designs={designs} onClose={closeEditor} />}
    </div>
  );
}
