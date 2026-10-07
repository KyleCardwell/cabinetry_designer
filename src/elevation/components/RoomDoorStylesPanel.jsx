import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { findDoorDesign } from '../model/doorStyles.js';
import { doorStyleUses, pickOptions } from '../model/doorStyleEdits.js';
import { formatInches } from '../model/units.js';
import { addDoorStyle, deleteDoorStyle, setDoorStylePick } from '../store/elevationSlice.js';
import DoorStyleEditor from './DoorStyleEditor.jsx';
import DoorStylePicks from './properties/DoorStylePicks.jsx';

const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const BUTTON_CLASS = 'rounded border border-gray-600 px-2.5 py-1.5 text-xs text-gray-200 hover:bg-gray-700';

function RoomDoorStylesContent({ room, settings }) {
  const dispatch = useDispatch();
  const [baseId, setBaseId] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const styles = room.doorStyles ?? [];
  const { inherit, options } = pickOptions(room, settings, 'door', []);

  return (
    <section className="border-t border-gray-700 pt-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-300">Door styles</h3>
      <div className="space-y-3">
        {styles.length === 0 && (
          <p className="text-xs text-gray-400">
            No door styles yet — everything uses {inherit.text.slice('Inherit ('.length, -1)}
          </p>
        )}
        {styles.map((style) => {
          const uses = doorStyleUses(room, style.id).length;
          return (
            <div key={style.id} className="space-y-2">
              <div className="flex items-start justify-between gap-2 text-xs">
                <div className="min-w-0 space-y-1">
                  <p>
                    <strong className="font-bold">{style.label}</strong>
                    {' · '}{findDoorDesign(style.designId)?.code ?? style.designId}
                    {' · '}{formatInches(style.thickness)}
                  </p>
                  {style.name && <p className="break-words text-gray-300">{style.name}</p>}
                  <p className="text-gray-400">{uses ? `${uses} uses` : 'unused'}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className={BUTTON_CLASS} onClick={() => setEditingId(style.id)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className={BUTTON_CLASS}
                    onClick={() => {
                      if (uses === 0) {
                        dispatch(deleteDoorStyle({ roomId: room.id, styleId: style.id }));
                      } else {
                        setDeleting({ styleId: style.id, reassignTo: '' });
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
              {deleting?.styleId === style.id && (
                <div className="space-y-2 rounded border border-gray-700 p-2">
                  <label className="block text-xs text-gray-400">
                    Used {uses} times. Move them to:
                    <select
                      value={deleting.reassignTo}
                      onChange={(event) => setDeleting({ ...deleting, reassignTo: event.target.value })}
                      aria-label={`Move uses of door style ${style.label} to`}
                      className={`mt-1 ${SELECT_CLASS}`}
                    >
                      <option value="">Inherit</option>
                      <option value="default">Team default</option>
                      {options.filter((option) => option.id !== 'default' && option.id !== style.id).map((option) => (
                        <option key={option.id} value={option.id}>{option.text}</option>
                      ))}
                    </select>
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={BUTTON_CLASS}
                      onClick={() => {
                        dispatch(deleteDoorStyle({
                          roomId: room.id,
                          styleId: style.id,
                          reassignTo: deleting.reassignTo || null,
                        }));
                        setDeleting(null);
                      }}
                    >
                      Delete
                    </button>
                    <button type="button" className={BUTTON_CLASS} onClick={() => setDeleting(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <div className="flex items-end gap-2">
          <label className="block min-w-0 flex-1 text-xs text-gray-400">
            Copy of
            <select
              value={options.some((option) => option.id === baseId) ? baseId : ''}
              onChange={(event) => setBaseId(event.target.value)}
              aria-label="Copy of door style"
              className={`mt-1 ${SELECT_CLASS}`}
            >
              <option value="">Team default (Std)</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>{option.text}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={BUTTON_CLASS}
            onClick={() => {
              const action = addDoorStyle({
                roomId: room.id,
                baseId: styles.some((style) => style.id === baseId) ? baseId : undefined,
              });
              dispatch(action);
              setEditingId(action.payload.id);
            }}
          >
            New
          </button>
        </div>
        <DoorStylePicks
          always
          room={room}
          settings={settings}
          levelsAbove={[]}
          node={room}
          label="Room"
          onChange={(key, styleId) => dispatch(setDoorStylePick({ roomId: room.id, level: 'room', key, styleId }))}
        />
      </div>
      {styles.some((style) => style.id === editingId) && (
        <DoorStyleEditor key={editingId} room={room} styleId={editingId} onClose={() => setEditingId(null)} />
      )}
    </section>
  );
}

export default function RoomDoorStylesPanel() {
  const { rooms, activeRoomId, settings } = useSelector((state) => state.elevation);
  const room = rooms.find((candidate) => candidate.id === activeRoomId) ?? null;
  if (!room) return null;

  return <RoomDoorStylesContent key={room.id} room={room} settings={settings} />;
}
