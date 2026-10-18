import { useCallback, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { BUILT_IN_SLIDE_IDS } from '../elevation/model/slides.js';
import { formatInches } from '../elevation/model/units.js';
import { addSlide, deleteSlide } from '../elevation/store/elevationSlice.js';
import SlideEditor from './SlideEditor.jsx';

const BUTTON_CLASS = 'rounded border border-gray-600 px-2.5 py-1.5 text-sm text-gray-200 hover:bg-gray-700';
const CELL_CLASS = 'px-3 py-3 align-top';
const MOUNT_LABELS = { undermount: 'Undermount', side: 'Side mount' };

function lengthsText(slide) {
  const first = formatInches(slide.lengths[0].nominal);
  return slide.lengths.length === 1 ? first
    : `${first}–${formatInches(slide.lengths.at(-1).nominal)} (${slide.lengths.length})`;
}

function clearancesText(slide) {
  return `${formatInches(slide.sideClearance)} per side · ${formatInches(slide.minBelow)} below · ${formatInches(slide.minAbove)} above`;
}

export default function SlidesPage() {
  const dispatch = useDispatch();
  const { settings, source } = useSelector((state) => state.elevation);
  const shopData = source === 'cloud';
  const slides = settings.slides;
  const [editingId, setEditingId] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const closeEditor = useCallback(() => setEditingId(null), []);
  const editingSlide = slides.find((slide) => slide.id === editingId);

  const add = () => {
    const action = addSlide();
    dispatch(action);
    setEditingId(action.payload.id);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-100">Slides</h1>
          <p className="mt-1 text-sm text-gray-400">Drawer slides for drawer boxes and roll-outs. Sizes come from the slide.</p>
        </div>
        <button type="button" className={`${BUTTON_CLASS} shrink-0`} onClick={add}>New slide</button>
      </div>
      <div className="overflow-x-auto rounded border border-gray-700">
        <table className="w-full text-left text-sm text-gray-300">
          <thead className="bg-gray-800 text-xs text-gray-400">
            <tr>
              {['Name', 'Mount', 'Lengths', 'Clearances', 'Actions'].map((heading) => (
                <th key={heading} scope="col" className="px-3 py-2 font-medium">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {slides.map((slide) => {
              const builtIn = BUILT_IN_SLIDE_IDS.includes(slide.id);
              const deletingThis = deleting === slide.id;
              return (
                <tr key={slide.id}>
                  <td className={CELL_CLASS}>
                    <span className="font-medium text-gray-100">{slide.name}</span>
                    {builtIn && <span className="ml-2 rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-400">built-in</span>}
                  </td>
                  <td className={CELL_CLASS}>{MOUNT_LABELS[slide.mount]}</td>
                  <td className={CELL_CLASS}>{lengthsText(slide)}</td>
                  <td className={CELL_CLASS}>{clearancesText(slide)}</td>
                  <td className={CELL_CLASS}>
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" className={BUTTON_CLASS} onClick={() => setEditingId(slide.id)}>Edit</button>
                      <button type="button" className={BUTTON_CLASS} onClick={() => dispatch(addSlide({ baseId: slide.id }))}>Copy</button>
                      {!builtIn && (
                        <button
                          type="button"
                          className={BUTTON_CLASS}
                          onClick={() => {
                            if (deletingThis) {
                              dispatch(deleteSlide({ slideId: slide.id }));
                              setDeleting(null);
                            } else {
                              setDeleting(slide.id);
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
      {editingSlide && <SlideEditor key={editingSlide.id} slide={editingSlide} slides={slides} onClose={closeEditor} />}
    </div>
  );
}
