import { useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { DEFAULT_SETTINGS, cabinetDrawerBoxesFor, formatInches, getFaceNode, wallInteriors } from '../../model/index.js';
import { addAccessoryItem, removeAccessoryItem, setAccessoryItem } from '../../model/accessoryItems.js';
import { BUILT_IN_SLIDES, resolveSlide } from '../../model/slides.js';
import { setCabinetSlide, setFaceDrawerBox } from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import Field from './Field.jsx';
import SlideSelect from './SlideSelect.jsx';

const frontLabel = (height, kind) => `${kind === 'rot' ? 'ROT · front' : kind === 'hamper' ? 'Hamper · front' : 'Front'} ${formatInches(height)}`;

const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const NUMBER_CLASS = 'w-16 rounded border border-gray-600 bg-gray-900 px-2 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const BUTTON_CLASS = 'rounded bg-gray-700 px-2.5 py-2 text-xs text-gray-100 hover:bg-gray-600';

function warningText(warning, box, settings, interior) {
  switch (warning.code) {
    case 'slide-missing': return `A slide picked here isn't in the Library any more; using ${box.slide.name}.`;
    case 'drawer-outside-box': return "This drawer front isn't over the cabinet's interior.";
    case 'drawers-share-section': return 'Side-by-side drawers need a partition between them.';
    case 'drawer-too-short': return `No drawer box fits this front (needs ${formatInches(box.slide.minBelow + box.slide.minAbove + 2.25)}).`;
    case 'drawer-height-too-tall': return `This box is taller than the space (${formatInches(box.maxHeight)} available).`;
    case 'drawer-heights-differ': return 'Same-height fronts have different typed box heights.';
    case 'drawer-box-tall': return `Taller than ${formatInches(settings.drawerBoxHeights?.warnAbove ?? DEFAULT_SETTINGS.drawerBoxHeights.warnAbove)}, the tallest the shop normally builds.`;
    case 'no-slide-length': return `No ${box.slide.name} length fits ${formatInches(box.interiorDepth)} of depth.`;
    case 'drawer-too-deep': return `Deeper than the interior (${formatInches(box.interiorDepth)}).`;
    case 'rot-short': return `Shorter than the standard 15 1/8 ROT (${formatInches(box.available)} available).`;
    case 'rot-size-unlisted': return `No ROT depth rule for a ${formatInches(interior.box.width)} × ${formatInches(interior.box.depth)} box; sized like a drawer.`;
    case 'hamper-clear-below': return `A hamper needs 11 clear below the box (${formatInches(box.clearBelow)} here).`;
    case 'hamper-too-small': return `A hamper box needs at least 15 × 22 (this one is ${formatInches(box.width)} × ${formatInches(box.depth)}).`;
    case 'accessory-missing': return "An accessory here isn't in the Library any more.";
    case 'accessory-wrong-place': return `${warning.name} goes in a section, not on a drawer box.`;
    case 'accessory-too-small': return `${warning.name} needs a box ${warning.sizes.map(({ dim, needs, has }) =>
      `${formatInches(needs)} ${{ width: 'wide', depth: 'deep', height: 'tall' }[dim]} (${formatInches(has)} here)`
    ).join('; ')}.`;
    case 'accessory-slide': return `${warning.name} rides on ${(settings.slides ?? BUILT_IN_SLIDES).find(({ id }) => id === warning.slideId)?.name ?? 'Missing slide'}; this box is on ${box.slide.name}.`;
    case 'accessory-height': return warning.limit === 'fixed'
      ? `${warning.name} needs a ${formatInches(warning.inches)} tall box.`
      : `${warning.name} needs a box no taller than ${formatInches(warning.inches)}.`;
    case 'accessory-depth': return warning.limit === 'clear_behind'
      ? `${warning.name} needs ${formatInches(warning.inches)} clear behind the box (${formatInches(warning.has)} here).`
      : `${warning.name} needs a box no deeper than ${formatInches(warning.inches)}.`;
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
  const accessoryOptions = (settings.accessories ?? []).filter(({ attachesTo }) => attachesTo === 'drawer_box')
    .sort((a, b) => a.name.localeCompare(b.name));
  const accessoryName = (id) => settings.accessories?.find((accessory) => accessory.id === id)?.name ?? 'Missing';
  const interior = resolved.warnings.some(({ code }) => code === 'rot-size-unlisted')
    ? wallInteriors(room, wall.sideSource ?? wall, wall.side ?? 'front', settings)
      .find(({ itemId }) => itemId === item.id) : null;
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
        const label = frontLabel(box.frontHeight, box.kind);
        const matched = box.heightSource === 'matched';
        const height = matched || ['rule', 'accessory'].includes(box.heightSource) ? box.height : box.heightAuto;
        return (
          <div key={box.path} aria-label={`Drawer box ${box.path}`}
            className={`space-y-2 rounded border p-2 ${facePath === box.path ? 'border-blue-500 bg-gray-800/60' : 'border-gray-700'}`}>
            <h4 className="text-xs font-medium text-gray-300">{label}</h4>
            <Field label="Slide">
              <SlideSelect label={`Drawer slide ${box.path}`} value={pick.slideId} slides={slides}
                automatic={`Auto (${box.slide.name}${box.slideAccessory ? `, ${accessoryName(box.slideAccessory)}` : box.slideRule ? `, ${box.slideRule}` : ''})`}
                onChange={(slideId) => patchBox(box.path, { slideId })} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Height">
                <InchInput aria-label={`Drawer height ${box.path}`} value={pick.height} allowBlank
                  placeholder={`Auto (${height === null ? 'none fits' : formatInches(height)}${box.heightSource === 'accessory' ? `, ${accessoryName(box.heightAccessory)}` : matched ? ', matched' : box.heightRule ? `, ${box.heightRule}` : ''})`}
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
                placeholder={`Auto (${box.depthAuto === null ? 'no length fits' : formatInches(box.depthAuto)}${box.depthSource === 'accessory' ? `, ${accessoryName(box.depthAccessory)}` : box.depthRule ? `, ${box.depthRule}` : ''})`}
                onCommit={(depth) => patchBox(box.path, { depth })} />
            </Field>
            {box.kind === 'drawer' && (
              <div className="space-y-2">
                <h5 className="text-xs font-medium text-gray-300">Accessories</h5>
                {box.accessories.map(({ index, accessoryId, accessory, qty }) => {
                  const name = accessory?.name ?? 'Missing';
                  const key = `${box.path}.${index}`;
                  return (
                    <div key={key} aria-label={`Drawer accessory ${key}`} className="space-y-2 rounded border border-gray-700 p-2">
                      <select aria-label={`Drawer accessory pick ${key}`} className={SELECT_CLASS} value={accessoryId}
                        onChange={(event) => patchBox(box.path, {
                          accessories: setAccessoryItem(pick.accessories, index, { accessoryId: event.target.value }),
                        })}>
                        {accessory?.attachesTo !== 'drawer_box' && <option value={accessoryId}>{name}</option>}
                        {accessoryOptions.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
                      </select>
                      <Field label="Qty">
                        <input type="number" aria-label={`Drawer accessory qty ${key}`} className={NUMBER_CLASS}
                          min={1} max={20} step={1} value={qty}
                          onChange={(event) => patchBox(box.path, {
                            accessories: setAccessoryItem(pick.accessories, index, { qty: Number(event.target.value) }),
                          })} />
                      </Field>
                      <button type="button" aria-label={`Remove ${name}`} className={BUTTON_CLASS}
                        onClick={() => patchBox(box.path, { accessories: removeAccessoryItem(pick.accessories, index) ?? null })}>Remove</button>
                    </div>
                  );
                })}
                <select aria-label={`Add drawer accessory ${box.path}`} className={SELECT_CLASS} value=""
                  disabled={accessoryOptions.length === 0}
                  onChange={(event) => patchBox(box.path, { accessories: addAccessoryItem(pick.accessories, event.target.value) })}>
                  <option value="">Add accessory…</option>
                  {accessoryOptions.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
                </select>
                {accessoryOptions.length === 0 && (
                  <p className="text-xs text-gray-400">Add drawer box accessories in Library → Accessories.</p>
                )}
              </div>
            )}
            {box.adjustment > 0 && (
              <p className="text-xs text-gray-400">{`Fits using ${formatInches(box.adjustment)} of the slide's vertical adjustment.`}</p>
            )}
            {box.notes.map((note) => <p key={note} className="text-xs text-gray-400">{note}</p>)}
          </div>
        );
      })}
      {resolved.warnings.map((warning, index) => {
        const box = resolved.boxes.find(({ path }) => path === warning.path);
        const front = box ?? faceLayout?.faces.find(({ path }) => path === warning.path);
        const kind = box?.kind ?? (front?.type === 'door' && front.action === 'pullout'
          ? item.purpose === 'trash' ? 'rot' : item.purpose === 'hamper' ? 'hamper' : null : null);
        const label = front ? frontLabel(front.frontHeight ?? front.height, kind) : null;
        return (
          <p key={index} className="text-xs text-amber-400">
            {`${label ? `${label}: ` : ''}${warningText(warning, box, settings, interior)}`}
          </p>
        );
      })}
      {resolved.notes.map(({ rule, text }) => (
        <p key={rule} className="text-xs text-gray-400">{`${text} (${rule})`}</p>
      ))}
    </section>
  );
}
