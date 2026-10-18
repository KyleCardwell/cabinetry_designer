import { useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { DEFAULT_SETTINGS, cabinetDrawerBoxesFor, formatInches, getFaceNode } from '../../model/index.js';
import { BUILT_IN_SLIDES, resolveSlide } from '../../model/slides.js';
import { setCabinetSlide, setFaceDrawerBox } from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import Field from './Field.jsx';

const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const frontLabel = (height) => `Front ${formatInches(height)}`;

function SlideSelect({ value, automatic, slides, label, onChange }) {
  return (
    <select aria-label={label} className={SELECT_CLASS} value={value ?? ''}
      onChange={(event) => onChange(event.target.value || null)}>
      <option value="">{automatic}</option>
      {slides.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
      {value && !slides.some(({ id }) => id === value) && (
        <option value={value}>{`Missing (${value})`}</option>
      )}
    </select>
  );
}

function warningText(code, box, settings) {
  switch (code) {
    case 'slide-missing': return `A slide picked here isn't in the Library any more; using ${box.slide.name}.`;
    case 'drawer-outside-box': return "This drawer front isn't over the cabinet's interior.";
    case 'drawers-share-section': return 'Side-by-side drawers need a partition between them.';
    case 'drawer-too-short': return `No drawer box fits this front (needs ${formatInches(box.slide.minBelow + box.slide.minAbove + 2.25)}).`;
    case 'drawer-height-too-tall': return `This box is taller than the space (${formatInches(box.available)} available).`;
    case 'drawer-heights-differ': return 'Same-height fronts have different typed box heights.';
    case 'drawer-box-tall': return `Taller than ${formatInches(settings.drawerBoxHeights?.warnAbove ?? DEFAULT_SETTINGS.drawerBoxHeights.warnAbove)}, the tallest the shop normally builds.`;
    case 'no-slide-length': return `No ${box.slide.name} length fits ${formatInches(box.interiorDepth)} of depth.`;
    case 'drawer-too-deep': return `Deeper than the interior (${formatInches(box.interiorDepth)}).`;
    default: return null;
  }
}

export default function DrawerBoxFields({ room, wall, run, item, itemIds = [item.id], settings, faceLayout }) {
  const dispatch = useDispatch();
  const facePath = useSelector((state) => state.elevation.facePath);
  const resolved = useMemo(() => cabinetDrawerBoxesFor(
    room, wall.sideSource ?? wall, wall.side ?? 'front', settings, item.id,
  ), [room, wall, settings, item.id]);
  if (!resolved) return null;

  const slides = settings.slides ?? BUILT_IN_SLIDES;
  const at = { roomId: room.id, wallId: wall.id, runId: run.id };
  const patchBox = (path, patch) => {
    if (Object.values(patch).some((value) => typeof value === 'number' && (!Number.isFinite(value) || value <= 0))) return false;
    dispatch(setFaceDrawerBox({ ...at, itemId: item.id, path, patch }));
    return true;
  };

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Drawer boxes</h3>
      <Field label="Slide">
        <SlideSelect label="Cabinet drawer slide" value={item.drawerSlideId} slides={slides}
          automatic={`Inherit (${resolveSlide(settings).name})`}
          onChange={(slideId) => dispatch(setCabinetSlide({ ...at, itemIds, slideId }))} />
      </Field>
      {resolved.boxes.map((box) => {
        const pick = getFaceNode(item.face, box.path)?.drawerBox ?? {};
        const label = frontLabel(box.frontHeight);
        const matched = box.heightSource === 'matched';
        const height = matched ? box.height : box.heightAuto;
        return (
          <div key={box.path} aria-label={`Drawer box ${box.path}`}
            className={`space-y-2 rounded border p-2 ${facePath === box.path ? 'border-blue-500 bg-gray-800/60' : 'border-gray-700'}`}>
            <h4 className="text-xs font-medium text-gray-300">{label}</h4>
            <Field label="Slide">
              <SlideSelect label={`Drawer slide ${box.path}`} value={pick.slideId} slides={slides}
                automatic={`Auto (${box.slide.name})`} onChange={(slideId) => patchBox(box.path, { slideId })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Height">
                <InchInput aria-label={`Drawer height ${box.path}`} value={pick.height} allowBlank
                  placeholder={`Auto (${height === null ? 'none fits' : `${formatInches(height)}${matched ? ', matched' : ''}`})`}
                  onCommit={(height) => patchBox(box.path, { height })} />
              </Field>
              <Field label="Width">
                <div aria-label={`Drawer width ${box.path}`} className="py-1.5 text-sm text-gray-300">
                  {`${formatInches(box.width, 1 / 64)}${box.maple ? ' +1/16 maple' : ''}`}
                </div>
              </Field>
            </div>
            <Field label="Depth">
              <InchInput aria-label={`Drawer depth ${box.path}`} value={pick.depth} allowBlank
                placeholder={`Auto (${box.depthAuto === null ? 'no length fits' : formatInches(box.depthAuto)})`}
                onCommit={(depth) => patchBox(box.path, { depth })} />
            </Field>
          </div>
        );
      })}
      {resolved.warnings.map((warning, index) => {
        const box = resolved.boxes.find(({ path }) => path === warning.path);
        const front = box ?? faceLayout?.faces.find(({ path }) => path === warning.path);
        const label = front ? frontLabel(front.frontHeight ?? front.height) : null;
        return (
          <p key={index} className="text-xs text-amber-400">
            {`${label ? `${label}: ` : ''}${warningText(warning.code, box, settings)}`}
          </p>
        );
      })}
    </section>
  );
}
