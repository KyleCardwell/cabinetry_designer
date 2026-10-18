import { useEffect, useMemo, useState } from 'react';
import { useDispatch } from 'react-redux';
import {
  INTERIOR_DIVIDERS,
  INTERIOR_DIVIDER_LABELS,
  MAX_FACE_SPLIT,
  cabinetInterior,
  clearSplit,
  equalizeDividers,
  formatInches,
  getInteriorNode,
  interiorOutline,
  removeDivider,
  setDividerDepth,
  setDividerKind,
  setDividerPosition,
  splitSection,
} from '../../model/index.js';
import { setItemInterior } from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import Field from './Field.jsx';

const BUTTON_CLASS = 'rounded bg-gray-700 px-2.5 py-2 text-xs text-gray-100 hover:bg-gray-600';
const DISABLED_CLASS = 'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-gray-700';
const NUMBER_CLASS = 'w-16 rounded border border-gray-600 bg-gray-900 px-2 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const WARNING_MESSAGES = {
  'section-too-small': 'A section is smaller than 1". Move a divider.',
  'divider-too-deep': 'A divider is deeper than the box interior.',
};

export default function InteriorFields({ room, wall, run, item, settings }) {
  const dispatch = useDispatch();
  const interior = item.interior ?? null;
  const [selectedPath, setSelectedPath] = useState('r');
  const [splitCount, setSplitCount] = useState(2);
  const path = getInteriorNode(interior, selectedPath) ? selectedPath : 'r';
  const selected = getInteriorNode(interior, path);
  const resolved = useMemo(() => cabinetInterior(
    room, wall.sideSource ?? wall, wall.side ?? 'front', settings, item.id,
  ), [room, wall, settings, item.id]);

  useEffect(() => {
    if (path !== selectedPath) setSelectedPath('r');
  }, [path, selectedPath]);

  const commit = (next) => {
    if (next === interior) return false;
    dispatch(setItemInterior({
      roomId: room.id, wallId: wall.id, runId: run.id, itemIds: [item.id], interior: next,
    }));
    return true;
  };

  if (!resolved) return null;

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Interior</h3>
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
              onClick={() => setSelectedPath(rowPath)}
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
              <div key={index} className="space-y-2 rounded border border-gray-700 p-2">
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
                        placeholder={`Auto (${formatInches(position)})`}
                        onCommit={(value) => commit(setDividerPosition(
                          interior, path, index, value, stacked ? undefined : from,
                        ))}
                      />
                    </Field>
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
