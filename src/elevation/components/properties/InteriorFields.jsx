import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  INTERIOR_DIVIDERS,
  INTERIOR_DIVIDER_LABELS,
  MAX_FACE_SPLIT,
  cabinetInterior,
  cabinetDrawerBoxesFor,
  clearSplit,
  equalizeDividers,
  formatInches,
  getInteriorNode,
  interiorOutline,
  removeDivider,
  resolveWall,
  runScene,
  setDividerBanding,
  setDividerDepth,
  setDividerKind,
  setDividerPosition,
  setSectionShelves,
  setSectionFlag,
  splitSection,
} from '../../model/index.js';
import { sectionShelves } from '../../model/shelves.js';
import { setInteriorPath, setItemInterior, setItemShelves } from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import Field from './Field.jsx';

const BUTTON_CLASS = 'rounded bg-gray-700 px-2.5 py-2 text-xs text-gray-100 hover:bg-gray-600';
const DISABLED_CLASS = 'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-gray-700';
const NUMBER_CLASS = 'w-16 rounded border border-gray-600 bg-gray-900 px-2 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const NOSINGS = [['none', 'None'], ['hardwood', 'Hardwood'], ['folded', 'Folded']];
const size = (value) => formatInches(value, 1 / 64).replace(/"$/, '');
const WARNING_MESSAGES = {
  'shelves-crowded': 'Adjustable shelves have less than 3" of clear space between them.',
  'section-too-small': 'A section is smaller than 1". Move a divider.',
  'divider-too-deep': 'A divider is deeper than the box interior.',
  'divider-seam-missing': 'A shelf or partition lost its door seam; it\'s spaced evenly.',
  'wide-no-partition': 'Box is over 36" wide with no partition between the doors.',
};

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
    const faces = runScene(room, view, viewRun, settings).faceLayouts.get(item.id)?.faces ?? [];
    const boxes = cabinetDrawerBoxesFor(room, wall.sideSource ?? wall, wall.side ?? 'front', settings, item.id)?.boxes ?? [];
    const args = { interior: resolved, faces, boxes, leaf: item, settings };
    const shelves = sectionShelves(args);
    const autoCount = sectionShelves({ ...args,
      interior: { ...resolved, tree: setSectionShelves(interior, path, { count: null }) },
    }).get(path);
    const autoFlags = sectionShelves({ ...args,
      interior: { ...resolved, tree: setSectionFlag(setSectionFlag(interior, path, 'hinges', null), path, 'lineBore', null) },
    }).get(path);
    return { shelves, autoCount, autoFlags };
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
  const cabinetGlass = item.shelves?.glass ?? false;
  const cabinetNosing = item.shelves?.nosing ?? 'none';
  const patchCabinet = (patch) => dispatch(setItemShelves({
    roomId: room.id, wallId: wall.id, runId: run.id, itemIds: [item.id], patch,
  }));
  const patchShelves = (patch) => commit(setSectionShelves(interior, path, patch));

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Interior</h3>
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>{resolved.auto ? 'Auto from faces' : 'Edited'}</span>
        {!resolved.auto && (
          <button type="button" className={BUTTON_CLASS} onClick={() => commit(null)}>Auto</button>
        )}
      </div>
      {interiorPath == null && (
        <div className="space-y-2">
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
          {shelf.warnings.map(({ code }) => (
            <p key={code} className="text-xs text-amber-400">{WARNING_MESSAGES[code]}</p>
          ))}
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
    </section>
  );
}
