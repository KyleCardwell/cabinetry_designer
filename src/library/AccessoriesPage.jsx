import { useCallback, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { accessoryText } from '../elevation/model/accessories.js';
import { effectText } from '../elevation/model/accessoryEffects.js';
import { formatPrice, PRICING_UNIT_LABELS } from '../elevation/model/libraryPricing.js';
import { formatInches } from '../elevation/model/units.js';
import { addAccessory, deleteAccessory } from '../elevation/store/elevationSlice.js';
import AccessoryEditor from './AccessoryEditor.jsx';

const BUTTON_CLASS = 'rounded border border-gray-600 px-2.5 py-1.5 text-sm text-gray-200 hover:bg-gray-700';
const CELL_CLASS = 'px-3 py-3 align-top';
function openingText(accessory) {
  return [['width', 'W'], ['depth', 'D'], ['height', 'H']]
    .filter(([key]) => accessory.minOpening[key] !== null)
    .map(([key, label]) => `${formatInches(accessory.minOpening[key])} ${label}`)
    .join(' · ') || '—';
}

function sizeText(accessory) {
  return [['width', 'W'], ['height', 'H'], ['depth', 'D']]
    .filter(([key]) => accessory.size[key] !== null)
    .map(([key, label]) => accessory.size[key] === 'section' ? 'section W' : `${formatInches(accessory.size[key])} ${label}`)
    .join(' · ') || '—';
}

export default function AccessoriesPage() {
  const dispatch = useDispatch();
  const { settings, source, teamServices = [] } = useSelector((state) => state.elevation);
  const shopData = source === 'cloud';
  const accessories = settings.accessories ?? [];
  const [editingId, setEditingId] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const closeEditor = useCallback(() => setEditingId(null), []);
  const editingAccessory = accessories.find((accessory) => accessory.id === editingId);

  const add = () => {
    const action = addAccessory();
    dispatch(action);
    setEditingId(action.payload.id);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-100">Accessories</h1>
          <p className="mt-1 text-sm text-gray-400">Organizers, inserts and other parts placed in cabinet interiors.</p>
        </div>
        <button type="button" className={`${BUTTON_CLASS} shrink-0`} onClick={add}>New accessory</button>
      </div>
      <div className="overflow-x-auto rounded border border-gray-700">
        <table className="w-full text-left text-sm text-gray-300">
          <thead className="bg-gray-800 text-xs text-gray-400">
            <tr>
              {['Name', 'Goes in', 'Min opening', 'Size', 'Report text', 'Price', 'Actions'].map((heading) => (
                <th key={heading} scope="col" className="px-3 py-2 font-medium">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {accessories.map((accessory) => {
              const deletingThis = deleting === accessory.id;
              return (
                <tr key={accessory.id}>
                  <td className={CELL_CLASS}>
                    <span className="font-medium text-gray-100">{accessory.name}</span>
                  </td>
                  <td className={CELL_CLASS}>
                    {accessory.attachesTo === 'section' ? 'Section' : 'Drawer box'}{accessory.wholeSection ? ' · whole section' : ''}
                    {accessory.effects.length > 0 && (
                      <div className="mt-1 text-xs text-gray-400">{accessory.effects.map((effect) => effectText(effect, settings.slides)).join(' · ')}</div>
                    )}
                  </td>
                  <td className={CELL_CLASS}>{openingText(accessory)}</td>
                  <td className={CELL_CLASS}>
                    {sizeText(accessory)}
                    {accessory.lengthDeduction !== null && (
                      <div className="mt-1 text-xs text-gray-400">
                        {accessory.lengthDeduction === 0 ? 'ordered at section width' : `ordered at section − ${formatInches(accessory.lengthDeduction)}`}
                      </div>
                    )}
                  </td>
                  <td className={`${CELL_CLASS} ${accessory.reportText ? '' : 'text-gray-500'}`}>{accessoryText(accessory)}</td>
                  <td className={CELL_CLASS}>{formatPrice(accessory.price, PRICING_UNIT_LABELS[accessory.pricing])}</td>
                  <td className={CELL_CLASS}>
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" className={BUTTON_CLASS} onClick={() => setEditingId(accessory.id)}>Edit</button>
                      <button type="button" className={BUTTON_CLASS} onClick={() => dispatch(addAccessory({ baseId: accessory.id }))}>Copy</button>
                      <button
                        type="button"
                        className={BUTTON_CLASS}
                        onClick={() => {
                          if (deletingThis) {
                            dispatch(deleteAccessory({ accessoryId: accessory.id }));
                            setDeleting(null);
                          } else {
                            setDeleting(accessory.id);
                          }
                        }}
                      >
                        {deletingThis ? (shopData ? 'Confirm archive' : 'Confirm delete') : (shopData ? 'Archive' : 'Delete')}
                      </button>
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
      {!accessories.length && <p className="text-sm text-gray-400">No accessories yet. Add the ones the shop uses with New accessory.</p>}
      {editingAccessory && <AccessoryEditor key={editingAccessory.id} accessory={editingAccessory} accessories={accessories} slides={settings.slides} services={teamServices} onClose={closeEditor} />}
    </div>
  );
}
