import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  DEFAULT_SETTINGS,
  INTERIOR_DIVIDERS,
  INTERIOR_DIVIDER_LABELS,
  MAX_FACE_SPLIT,
  addSectionAccessory,
  cabinetInterior,
  cabinetDrawerBoxesFor,
  clearSplit,
  equalizeDividers,
  formatInches,
  getInteriorNode,
  interiorOutline,
  placeInterior,
  removeDivider,
  removeSectionAccessory,
  resolveWall,
  runScene,
  setDividerBanding,
  setDividerDepth,
  setDividerKind,
  setDividerPosition,
  setSectionAccessory,
  setSectionShelves,
  setSectionRollouts,
  setRolloutItem,
  setSectionFlag,
  splitSection,
} from '../../model/index.js';
import { drawerBoxOptions } from '../../model/drawerBoxes.js';
import { sectionAccessories } from '../../model/accessories.js';
import { sectionRollouts } from '../../model/rollouts.js';
import { BUILT_IN_SLIDES, resolveBoxSlide, resolveSlide } from '../../model/slides.js';
import { sectionShelves } from '../../model/shelves.js';
import { setCabinetSlide, setInteriorPath, setItemInterior, setItemShelves } from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import PanelSection from '../panel/PanelSection.jsx';
import Field from './Field.jsx';
import SlideSelect from './SlideSelect.jsx';

const BUTTON_CLASS = 'rounded bg-gray-700 px-2.5 py-2 text-xs text-gray-100 hover:bg-gray-600';
const DISABLED_CLASS = 'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-gray-700';
const NUMBER_CLASS = 'w-16 rounded border border-gray-600 bg-gray-900 px-2 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const NOSINGS = [['none', 'None'], ['hardwood', 'Hardwood'], ['folded', 'Folded']];
const size = (value) => formatInches(value, 1 / 64).replace(/"$/, '');
const WARNING_MESSAGES = {
  'rollouts-overlap': 'Roll-outs overlap; move one or use fewer.',
  'rollout-outside': "A roll-out runs past the section's clear space.",
  'rollouts-dont-fit': "These roll-outs don't fit the section's height.",
  'rollout-hinge-unknown': 'The door has no hinge side, so the roll-out has spacers on both sides.',
  'rollout-pair-invalid': 'Side by side needs 2 roll-outs behind a pair door; stacked instead.',
  'rollout-too-narrow': 'No roll-out fits this width.',
  'shelves-crowded': 'Adjustable shelves have less than 3" of clear space between them.',
  'section-too-small': 'A section is smaller than 1". Move a divider.',
  'divider-too-deep': 'A divider is deeper than the box interior.',
  'divider-seam-missing': 'A shelf or partition lost its door seam; it\'s spaced evenly.',
  'wide-no-partition': 'Box is over 36" wide with no partition between the doors.',
};

function rolloutWarning(code, rollout, settings) {
  switch (code) {
    case 'rollout-too-deep': return `Deeper than the interior (${formatInches(rollout.interiorDepth)}).`;
    case 'slide-notch': return `${rollout.slide.name} needs ${formatInches(rollout.slide.backClearance)} behind the box; notch the cabinet back ${formatInches(rollout.notch)}.`;
    case 'slide-missing': return `A slide picked here isn't in the Library any more; using ${rollout.slide.name}.`;
    case 'no-slide-length': return `No ${rollout.slide.name} length fits ${formatInches(rollout.interiorDepth)} of depth.`;
    case 'drawer-box-tall': return `Taller than ${formatInches(settings.drawerBoxHeights?.warnAbove ?? DEFAULT_SETTINGS.drawerBoxHeights.warnAbove)}, the tallest the shop normally builds.`;
    default: return WARNING_MESSAGES[code];
  }
}

function accessoryWarning(warning, accessory) {
  switch (warning.code) {
    case 'accessory-missing': return "This accessory isn't in the Library any more.";
    case 'accessory-wrong-place': return `${accessory.name} goes on a drawer box, not in a section.`;
    case 'accessory-shape-missing': return "Its drawing isn't in the shape library.";
    case 'accessory-shape-too-small': return `Too small for its drawing: the fixed parts are ${formatInches(warning.fixed)} ${{ x: 'wide', z: 'tall', y: 'deep' }[warning.axis]}, this is ${formatInches(warning.target)}.`;
    case 'accessory-too-small': return `${warning.sizes.map(({ dim, needs, has }) =>
      `Needs ${formatInches(needs)} ${{ width: 'wide', depth: 'deep', height: 'tall' }[dim]} (${formatInches(has)} here)`
    ).join('; ')}.`;
    case 'accessory-whole-section': return `${warning.name} takes the whole section; remove the roll-outs, typed shelves or other accessories.`;
    case 'accessory-outside': return `Placed outside the section (${formatInches(warning.sectionHeight)} tall here).`;
    case 'accessory-outside-depth': return `Sticks out the ${warning.side} of the section by ${formatInches(warning.by)}.`;
    case 'accessory-length': return `${accessory.name} is ordered at section width − ${formatInches(warning.deduction)} (${formatInches(warning.has)} wide here).`;
    default: return null;
  }
}

export default function InteriorFields({ room, wall, run, item, settings }) {
  const dispatch = useDispatch();
  const interiorPath = useSelector((state) => state.elevation.interiorPath);
  const interiorDivider = useSelector((state) => state.elevation.interiorDivider);
  const selectedPath = interiorPath ?? 'r';
  const [splitCount, setSplitCount] = useState(2);
  const resolved = useMemo(() => cabinetInterior(
    room, wall.sideSource ?? wall, wall.side ?? 'front', settings, item.id,
  ), [room, wall, settings, item.id]);
  const interior = resolved?.tree ?? null;
  const path = getInteriorNode(interior, selectedPath) ? selectedPath : 'r';
  const selected = getInteriorNode(interior, path);

  const shelfData = useMemo(() => {
    if (!resolved) return null;
    const view = resolveWall(room, wall.sideSource ?? wall, wall.side ?? 'front');
    const viewRun = view.runs.find(({ id }) => id === run.id);
    const layout = runScene(room, view, viewRun, settings).faceLayouts.get(item.id);
    const faces = layout?.faces ?? [];
    const boxes = cabinetDrawerBoxesFor(room, wall.sideSource ?? wall, wall.side ?? 'front', settings, item.id)?.boxes ?? [];
    // Faces and drawer boxes are in wall coordinates, so the sections must be too.
    const placed = placeInterior(resolved);
    const args = { interior: placed, faces, boxes, leaf: item, settings };
    const rolloutArgs = { ...args, ...drawerBoxOptions(room, item.id, layout, settings) };
    const rollouts = sectionRollouts(rolloutArgs);
    args.rollouts = rollouts;
    args.accessories = sectionAccessories(args);
    const rollout = rollouts.get(path);
    const resolveTree = (tree) => sectionRollouts({ ...rolloutArgs, interior: { ...placed, tree } }).get(path);
    const autoLayout = rollout && resolveTree(setSectionRollouts(interior, path, { layout: null })).layout;
    const autoItems = rollout?.rollouts.map(({ index }) => resolveTree(
      setRolloutItem(interior, path, index, { at: null, depth: null }),
    ).rollouts[index]);
    const shelves = sectionShelves(args);
    const autoCount = sectionShelves({ ...args,
      interior: { ...placed, tree: setSectionShelves(interior, path, { count: null }) },
    }).get(path);
    const autoFlags = sectionShelves({ ...args,
      interior: { ...placed, tree: setSectionFlag(setSectionFlag(interior, path, 'hinges', null), path, 'lineBore', null) },
    }).get(path);
    return { shelves, autoCount, autoFlags, rollouts, rollout, autoLayout, autoItems, accessories: args.accessories.get(path), hasBoxes: boxes.length > 0 };
  }, [resolved, room, wall, run.id, settings, item, interior, path]);

  useEffect(() => {
    if (path !== selectedPath) dispatch(setInteriorPath(null));
  }, [dispatch, path, selectedPath]);

  const commit = (next) => {
    if (next === interior) return false;
    dispatch(setItemInterior({
      roomId: room.id, wallId: wall.id, runId: run.id, itemIds: [item.id], interior: next,
    }));
    return true;
  };

  if (!resolved) return null;

  const shelf = shelfData.shelves.get(path);
  const { rollout, autoLayout, autoItems } = shelfData;
  const accessoryOptions = (settings.accessories ?? []).filter(({ attachesTo }) => attachesTo === 'section')
    .sort((a, b) => a.name.localeCompare(b.name));
  const slides = settings.slides ?? BUILT_IN_SLIDES;
  const autoSlide = resolveBoxSlide(settings, { cabinet: item.drawerSlideId ?? null }).slide;
  const patchRollouts = (patch) => commit(setSectionRollouts(interior, path, patch));
  const patchRollout = (index, patch) => commit(setRolloutItem(interior, path, index, patch));
  const cabinetGlass = item.shelves?.glass ?? false;
  const cabinetNosing = item.shelves?.nosing ?? 'none';
  const patchCabinet = (patch) => dispatch(setItemShelves({
    roomId: room.id, wallId: wall.id, runId: run.id, itemIds: [item.id], patch,
  }));
  const patchShelves = (patch) => commit(setSectionShelves(interior, path, patch));

  return (
    <PanelSection id="piece.interior" title="Interior">
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>{resolved.auto ? 'Auto from faces' : 'Edited'}</span>
          {!resolved.auto && (
            <button type="button" className={BUTTON_CLASS} onClick={() => commit(null)}>Auto</button>
          )}
        </div>
        {interiorPath == null && (
          <div className="space-y-2">
            {shelfData.rollouts.size > 0 && !shelfData.hasBoxes && (
              <Field label="Slide">
                <SlideSelect label="Cabinet drawer slide" value={item.drawerSlideId} slides={slides}
                  automatic={`Inherit (${resolveSlide(settings).name})`}
                  onChange={(slideId) => dispatch(setCabinetSlide({
                    roomId: room.id, wallId: wall.id, runId: run.id, itemIds: [item.id], slideId,
                  }))} />
              </Field>
            )}
            <h4 className="text-xs font-medium text-gray-300">Shelves</h4>
            <Field label="Nosing">
              <select aria-label="Cabinet shelf nosing" className={SELECT_CLASS} value={cabinetNosing}
                disabled={cabinetGlass} onChange={(event) => patchCabinet({ nosing: event.target.value })}>
                {NOSINGS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" aria-label="Cabinet glass shelves" checked={cabinetGlass}
                onChange={(event) => patchCabinet({ glass: event.target.checked })} />
              Glass
            </label>
          </div>
        )}
        <div className="space-y-1">
          {interiorOutline(interior).map(({ path: rowPath, depth, node }) => {
            const rect = resolved.sections.find((section) => section.path === rowPath);
            const label = node.children
              ? `${node.direction === 'vertical' ? 'Stack' : 'Side by side'} × ${node.children.length}`
              : `Section ${formatInches(rect.width)} × ${formatInches(rect.height)}`;
            return (
              <button
                key={rowPath}
                type="button"
                aria-label={`Interior ${rowPath}`}
                aria-pressed={rowPath === path}
                onClick={() => dispatch(setInteriorPath({ path: rowPath }))}
                style={{ paddingLeft: depth * 12 }}
                className={`flex w-full items-center border-l-2 py-1 pr-1 text-left text-xs text-gray-300 ${
                  rowPath === path ? 'border-blue-500 bg-gray-800/60' : 'border-transparent'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        {[...new Set(resolved.warnings.map(({ code }) => code))].map((code) => (
          <p key={code} className="text-xs text-amber-400">{WARNING_MESSAGES[code]}</p>
        ))}
        {interiorPath != null && shelf && (
          <div className="space-y-2">
            <Field label="Adj. shelves">
              <InchInput aria-label={`Shelf count ${path}`} value={selected.shelves?.count} allowBlank allowAuto
                placeholder={`Auto (${shelfData.autoCount.count})`} className="placeholder:text-gray-500"
                onCommit={(count) => {
                  if (count !== null && (!Number.isInteger(count) || count < 0 || count > 20)) return false;
                  return patchShelves({ count });
                }} />
            </Field>
            <Field label="Shoe shelves">
              <InchInput aria-label={`Shoe shelves ${path}`} value={selected.shelves?.shoe} allowBlank
                placeholder="0"
                onCommit={(shoe) => {
                  if (shoe !== null && (!Number.isInteger(shoe) || shoe < 0 || shoe > 20)) return false;
                  return patchShelves({ shoe: shoe === 0 ? null : shoe });
                }} />
            </Field>
            <div className="flex items-center justify-between text-xs text-gray-400">
              <label className="flex items-center gap-2">
                <input type="checkbox" aria-label={`Glass shelves ${path}`} checked={shelf.glass}
                  onChange={(event) => patchShelves({ glass: event.target.checked })} />
                Glass
              </label>
              <button type="button" aria-label={`Auto glass shelves ${path}`}
                aria-pressed={selected.shelves?.glass === undefined}
                className="text-teal-400 hover:underline" onClick={() => patchShelves({ glass: null })}>
                {`Auto (${cabinetGlass ? 'Yes' : 'No'})`}
              </button>
            </div>
            <Field label="Nosing">
              <select aria-label={`Shelf nosing ${path}`} className={SELECT_CLASS}
                value={selected.shelves?.nosing ?? ''} disabled={shelf.glass}
                onChange={(event) => patchShelves({ nosing: event.target.value || null })}>
                <option value="">{`Auto (${NOSINGS.find(([value]) => value === cabinetNosing)[1]})`}</option>
                {NOSINGS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </Field>
            {[['hinges', 'Hinge plates'], ['lineBore', 'Line bore']].map(([key, label]) => (
              <Field key={key} label={label}>
                <select aria-label={`${label} ${path}`} className={SELECT_CLASS}
                  value={selected[key] === undefined ? '' : String(selected[key])}
                  onChange={(event) => commit(setSectionFlag(interior, path, key,
                    event.target.value === '' ? null : event.target.value === 'true'))}>
                  <option value="">{`Auto (${shelfData.autoFlags[key] ? 'Yes' : 'No'})`}</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </Field>
            ))}
            <p aria-label={`Shelf size ${path}`} className="text-xs text-gray-400">
              {`${size(shelf.width)} × ${size(shelf.depth)} × ${size(shelf.thickness)}`}
              {shelf.nosing?.kind === 'hardwood' && ` + ${size(shelf.nosing.height)} × ${size(shelf.nosing.thickness)} nosing`}
              {shelf.nosing?.kind === 'folded' && ` · order ${size(shelf.orderedDepth)} deep (folded)`}
            </p>
            {shelf.shoe && (
              <p aria-label={`Shoe shelf size ${path}`} className="text-xs text-gray-400">
                {`Shoe: ${size(shelf.shoe.width)} × ${size(shelf.shoe.depth)} × ${size(shelf.shoe.thickness)}`}
                {shelf.shoe.nosing.kind === 'hardwood' && ` + ${size(shelf.shoe.nosing.height)} × ${size(shelf.shoe.nosing.thickness)} nosing`}
                {shelf.shoe.nosing.kind === 'folded' && ` · order ${size(shelf.shoe.orderedDepth)} deep (folded)`}
                {` · ${shelf.shoe.angle}°`}
              </p>
            )}
            {shelf.gap !== null && (
              <p aria-label={`Shelf spacing ${path}`} className="text-xs text-gray-400">
                {`${size(shelf.gap)} clear between shelves`}
              </p>
            )}
            {shelf.warnings.map(({ code, clear }) => (
              <p key={code} className="text-xs text-amber-400">
                {code === 'shoe-shelves-tight'
                  ? `Shoe shelves leave less than ${formatInches(settings.shoeShelfClear ?? DEFAULT_SETTINGS.shoeShelfClear, 1 / 16)} clear above the top one (${formatInches(clear, 1 / 16)} here).`
                  : WARNING_MESSAGES[code]}
              </p>
            ))}
            {[...new Set(rollout?.warnings.filter(({ index }) => index === undefined).map(({ code }) => code))].map((code) => (
              <p key={code} className="text-xs text-amber-400">{WARNING_MESSAGES[code]}</p>
            ))}
          </div>
        )}
        {interiorPath != null && shelf && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-gray-300">Roll-outs</h4>
            <Field label="Count">
              <InchInput aria-label={`Roll-out count ${path}`} value={selected.rollouts?.count}
                allowBlank allowAuto placeholder="None" className="placeholder:text-gray-500"
                onCommit={(count) => patchRollouts({ count })} />
            </Field>
            {(selected.rollouts?.count === 2 || selected.rollouts?.layout) && (
              <Field label="Layout">
                <select aria-label={`Roll-out layout ${path}`} className={SELECT_CLASS}
                  value={selected.rollouts.layout ?? ''}
                  onChange={(event) => patchRollouts({ layout: event.target.value || null })}>
                  <option value="">{`Auto (${autoLayout === 'pair' ? 'Side by side' : 'Stacked'})`}</option>
                  <option value="stack">Stacked</option>
                  <option value="pair">Side by side</option>
                </select>
              </Field>
            )}
            {rollout?.rollouts.map((box) => {
              const pick = selected.rollouts.items?.[box.index] ?? {};
              const automatic = autoItems[box.index];
              const key = `${path}.${box.index}`;
              const spacers = box.spacers.left && box.spacers.right ? 'spacers left & right'
                : box.spacers.left ? 'spacer left' : box.spacers.right ? 'spacer right' : 'no spacers';
              return (
                <div key={key} aria-label={`Roll-out ${key}`} className="space-y-2 rounded border border-gray-700 p-2">
                  <h4 className="text-xs font-medium text-gray-300">
                    {rollout.layout === 'pair' ? (box.side === 'left' ? 'Left' : 'Right')
                      : `Roll-out ${box.index + 1}${box.index === 0 ? ' (bottom)' : ''}`}
                  </h4>
                  <Field label="Slide">
                    <SlideSelect label={`Roll-out slide ${key}`} value={pick.slideId} slides={slides}
                      automatic={`Auto (${autoSlide.name})`}
                      onChange={(slideId) => patchRollout(box.index, { slideId })} />
                  </Field>
                  {[
                    ['height', 'Height', size(settings.rolloutHeight ?? DEFAULT_SETTINGS.rolloutHeight)],
                    ['depth', 'Depth', `${automatic.depthAuto === null ? 'no length fits' : size(automatic.depthAuto)}${automatic.depthRule ? `, ${automatic.depthRule}` : ''}`],
                    ['at', 'Up from section bottom', size(automatic.at)],
                  ].map(([field, label, placeholder]) => (
                    <Field key={field} label={label}>
                      <InchInput aria-label={`Roll-out ${field} ${key}`} value={pick[field]} allowBlank allowAuto
                        displayStep={1 / 64} placeholder={`Auto (${placeholder})`} className="placeholder:text-gray-500"
                        onCommit={(value) => patchRollout(box.index, { [field]: value })} />
                    </Field>
                  ))}
                  <p aria-label={`Roll-out size ${key}`} className="text-xs text-gray-400">
                    {`${size(box.width)} wide · ${spacers}${box.maple ? ` · +${size(box.mapleExtra)} maple` : ''}`}
                  </p>
                  {box.warnings.map(({ code }) => (
                    <p key={code} className="text-xs text-amber-400">{rolloutWarning(code, box, settings)}</p>
                  ))}
                </div>
              );
            })}
          </div>
        )}
        {interiorPath != null && shelf && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-gray-300">Accessories</h4>
            {shelfData.accessories?.items.map(({ index, accessoryId, accessory, qty, fromBottom, drawing, orderedLength, warnings }) => {
              const name = accessory?.name ?? 'Missing';
              const key = `${path}.${index}`;
              return (
                <div key={key} aria-label={`Accessory ${key}`} className="space-y-2 rounded border border-gray-700 p-2">
                  <select aria-label={`Accessory pick ${key}`} className={SELECT_CLASS} value={accessoryId}
                    onChange={(event) => commit(setSectionAccessory(interior, path, index, { accessoryId: event.target.value }))}>
                    {accessory?.attachesTo !== 'section' && <option value={accessoryId}>{name}</option>}
                    {accessoryOptions.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
                  </select>
                  <Field label="Qty">
                    <input type="number" aria-label={`Accessory qty ${key}`} className={NUMBER_CLASS}
                      min={1} max={20} step={1} value={qty}
                      onChange={(event) => commit(setSectionAccessory(interior, path, index, { qty: Number(event.target.value) }))} />
                  </Field>
                  {accessory?.attachesTo === 'section' && (
                    <Field label="Up (oc)">
                      <InchInput aria-label={`Accessory up ${key}`} value={fromBottom} allowBlank
                        placeholder="Not placed"
                        onCommit={(value) => commit(setSectionAccessory(interior, path, index, { fromBottom: value }))} />
                    </Field>
                  )}
                  {drawing && (
                    <label className="flex items-center gap-2 text-xs text-gray-300">
                      <input type="checkbox" aria-label={`Accessory mirror ${key}`}
                        checked={getInteriorNode(interior, path)?.accessories?.[index]?.mirror === true}
                        onChange={(event) => commit(setSectionAccessory(interior, path, index, { mirror: event.target.checked }))} />
                      Mirror
                    </label>
                  )}
                  {orderedLength != null && (
                    <p className="text-xs text-gray-400">Ordered length {formatInches(orderedLength)}</p>
                  )}
                  <button type="button" aria-label={`Remove ${name}`} className={BUTTON_CLASS}
                    onClick={() => commit(removeSectionAccessory(interior, path, index))}>Remove</button>
                  {warnings.map((warning) => (
                    <p key={warning.code} className="text-xs text-amber-400">{accessoryWarning(warning, accessory)}</p>
                  ))}
                </div>
              );
            })}
            {shelfData.accessories?.items.some(({ accessory }) => accessory?.attachesTo === 'section') && (
              <p className="text-xs text-gray-400">Height from the bottom of the section to the accessory's centre.</p>
            )}
            {shelfData.accessories?.warnings.map((warning) => (
              <p key={warning.code} className="text-xs text-amber-400">{accessoryWarning(warning)}</p>
            ))}
            <select aria-label={`Add accessory ${path}`} className={SELECT_CLASS} value=""
              disabled={accessoryOptions.length === 0}
              onChange={(event) => commit(addSectionAccessory(interior, path, event.target.value))}>
              <option value="">Add accessory…</option>
              {accessoryOptions.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
            </select>
            {accessoryOptions.length === 0 && (
              <p className="text-xs text-gray-400">Add accessories in Library → Accessories.</p>
            )}
          </div>
        )}
        {selected.children ? (
          <>
            <div className="flex gap-2">
              <button type="button" className={BUTTON_CLASS} onClick={() => commit(equalizeDividers(interior, path))}>
                Equal spacing
              </button>
              <button type="button" className={BUTTON_CLASS} onClick={() => commit(clearSplit(interior, path))}>
                Clear
              </button>
            </div>
            {selected.dividers.map((divider, index) => {
              const actual = resolved.dividers.find((entry) => entry.path === path && entry.index === index);
              const stacked = selected.direction === 'vertical';
              const from = actual.dimFrom;
              const position = stacked ? actual.fromBottom : from === 'right' ? actual.fromRight : actual.fromLeft;
              const canRemove = !selected.children[index].children && !selected.children[index + 1].children;
              return (
                <div key={index} className={`space-y-2 rounded border p-2 ${
                  path === interiorPath && index === interiorDivider ? 'border-blue-500' : 'border-gray-700'
                }`}>
                  <Field label="Kind">
                    <select
                      aria-label={`Divider kind ${path}.${index}`}
                      className={SELECT_CLASS}
                      value={divider.kind}
                      onChange={(event) => commit(setDividerKind(interior, path, index, event.target.value))}
                    >
                      {INTERIOR_DIVIDERS[selected.direction].map((kind) => (
                        <option key={kind} value={kind}>{INTERIOR_DIVIDER_LABELS[kind]}</option>
                      ))}
                    </select>
                  </Field>
                  <div className="flex gap-2">
                    {!stacked && (
                      <div className="w-20 shrink-0">
                        <Field label="From">
                          <select
                            aria-label={`Divider from ${path}.${index}`}
                            className={SELECT_CLASS}
                            value={from}
                            onChange={(event) => {
                              const side = event.target.value;
                              commit(setDividerPosition(interior, path, index,
                                side === 'right' ? actual.fromRight : actual.fromLeft, side));
                            }}
                          >
                            <option value="left">Left</option>
                            <option value="right">Right</option>
                          </select>
                        </Field>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <Field label={`oc from ${from}`}>
                        <InchInput
                          aria-label={`Divider position ${path}.${index}`}
                          value={divider.at}
                          allowBlank
                          allowAuto
                          placeholder={`Auto (${formatInches(position)}${actual.linked ? ' · Seam' : ''})`}
                          onCommit={(value) => commit(setDividerPosition(
                            interior, path, index, value, stacked ? undefined : from,
                          ))}
                        />
                      </Field>
                      {divider.seam && divider.at !== undefined && (
                        <p className="mt-1 text-xs text-gray-400">type auto to return to the seam</p>
                      )}
                    </div>
                  </div>
                  <Field label="Depth">
                    <InchInput
                      aria-label={`Divider depth ${path}.${index}`}
                      value={divider.depth}
                      allowBlank
                      placeholder={`Auto (${formatInches(actual.depth)})`}
                      onCommit={(value) => commit(setDividerDepth(interior, path, index, value))}
                    />
                  </Field>
                  {actual.banding !== null && (
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          aria-label={`Divider banding ${path}.${index}`}
                          checked={actual.banding}
                          onChange={(event) => commit(setDividerBanding(
                            interior, path, index, event.target.checked,
                          ))}
                        />
                        Banded
                      </label>
                      {actual.bandingSource === 'manual' && (
                        <button
                          type="button"
                          aria-label={`Reset divider banding ${path}.${index}`}
                          className="text-teal-400 hover:underline"
                          onClick={() => commit(setDividerBanding(interior, path, index, null))}
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    aria-label={`Remove divider ${path}.${index}`}
                    className={`${BUTTON_CLASS} ${DISABLED_CLASS}`}
                    disabled={!canRemove}
                    title={canRemove ? undefined : 'Remove the splits beside it first'}
                    onClick={() => commit(removeDivider(interior, path, index))}
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Sections">
              <input
                type="number"
                aria-label="Interior sections"
                min={2}
                max={MAX_FACE_SPLIT}
                value={splitCount}
                className={NUMBER_CLASS}
                onChange={(event) => setSplitCount(event.target.value)}
                onBlur={() => {
                  const n = Math.round(Number(splitCount));
                  setSplitCount(Number.isFinite(n) ? Math.min(MAX_FACE_SPLIT, Math.max(2, n)) : 2);
                }}
              />
            </Field>
            <button type="button" className={BUTTON_CLASS} onClick={() => commit(splitSection(interior, path, 'vertical', Number(splitCount)))}>
              Fixed shelves
            </button>
            <button type="button" className={BUTTON_CLASS} onClick={() => commit(splitSection(interior, path, 'horizontal', Number(splitCount)))}>
              Partitions
            </button>
          </div>
        )}
      </div>
    </PanelSection>
  );
}
