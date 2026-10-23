import { useState } from 'react';
import {
  MAX_MID_SPLIT, equalizeLayout, removeLayoutChild, setLayoutCount,
  setLayoutMidWidth, setLayoutSize, setMidPosition, splitLayout,
} from '../../model/midLayout.js';
import { formatInchesInput } from '../../model/units.js';
import InchInput from '../InchInput.jsx';

const BUTTON_CLASS = 'rounded bg-gray-700 px-2.5 py-2 text-xs text-gray-100 hover:bg-gray-600';
const NUMBER_CLASS = 'w-16 rounded border border-gray-600 bg-gray-900 px-2 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';

export default function MidLayoutFields({ layout, resolved, slab, label, onLayout }) {
  const [selection, setSelection] = useState('root');
  const [sections, setSections] = useState(2);
  const selected = selection.split('.').slice(1).reduce((node, index) => node?.children?.[index], layout);
  const path = selected ? selection : 'root';
  const node = selected ?? layout;
  const root = resolved.nodes.find((entry) => entry.path === 'root');
  const mids = [...resolved.midRails, ...resolved.midStiles];
  const commit = (next) => {
    if (next === layout) return false;
    onLayout(next);
    return true;
  };
  const select = (next) => {
    setSelection(next);
    setSections(2);
  };

  const outline = (entry, entryPath = 'root', depth = 0, parentSplit) => {
    const rect = resolved.nodes.find((item) => item.path === entryPath);
    const indexes = entry.children?.map((_, index) => index) ?? [];
    if (entry.split === 'rows') indexes.reverse();
    return (
      <div key={entryPath}>
        <div
          role="button"
          tabIndex={0}
          aria-label={`${label} Select ${entryPath}`}
          aria-pressed={entryPath === path}
          onClick={() => select(entryPath)}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              select(entryPath);
            }
          }}
          style={{ paddingLeft: depth * 12 }}
          className={`flex cursor-pointer items-center gap-2 border-l-2 py-1 pr-1 ${
            entryPath === path ? 'border-blue-500 bg-gray-800/60' : 'border-transparent'
          }`}
        >
          <span className="min-w-0 flex-1 text-xs text-gray-300">
            {entry.split ? `${entry.split === 'rows' ? 'Rows' : 'Columns'} (${entry.children.length})` : 'Panel'}
          </span>
          {entryPath !== 'root' && (
            <div className="w-20 shrink-0">
              <InchInput
                value={entry.size ?? null}
                allowBlank
                allowAuto
                placeholder={rect && formatInchesInput(parentSplit === 'rows' ? rect.height : rect.width)}
                aria-label={`${label} Panel size ${entryPath}`}
                onCommit={(value) => commit(setLayoutSize(layout, entryPath, value))}
              />
            </div>
          )}
        </div>
        {indexes.map((index, order) => {
          const midIndex = entry.split === 'rows' ? index - 1 : index;
          const mid = mids.find((item) => item.path === entryPath && item.index === midIndex);
          return (
            <div key={index}>
              {outline(entry.children[index], `${entryPath}.${index}`, depth + 1, entry.split)}
              {order < indexes.length - 1 && mid && (
                <div style={{ paddingLeft: (depth + 1) * 12 }} className="flex flex-wrap items-center gap-2 py-1 text-xs text-gray-400">
                  <span>{mid.name}</span>
                  <label className="flex items-center gap-1">
                    At
                    <div className="w-20">
                      <InchInput
                        value={mid.at}
                        aria-label={`${label} ${mid.name} At`}
                        onCommit={(value) => commit(setMidPosition(
                          layout, entryPath, mid.index, value, resolved.nodes, mid.width,
                        ))}
                      />
                    </div>
                  </label>
                  {!slab && (
                    <label className="flex items-center gap-1">
                      Width
                      <div className="w-20">
                        <InchInput
                          value={entry.mids?.[mid.index]?.width ?? null}
                          allowBlank
                          placeholder={formatInchesInput(mid.width)}
                          aria-label={`${label} ${mid.name} Width`}
                          onCommit={(value) => commit(setLayoutMidWidth(layout, entryPath, mid.index, value))}
                        />
                      </div>
                    </label>
                  )}
                  {!mid.full && <span className="text-[10px] text-gray-500">{mid.from} to {mid.to}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <h4 className="font-semibold">Panels</h4>
        {!layout && root && <span>{formatInchesInput(root.width)} × {formatInchesInput(root.height)}</span>}
      </div>
      {layout && <div className="space-y-1">{outline(layout)}</div>}
      <div className="flex flex-wrap items-center gap-2 rounded border border-gray-700 p-2">
        <label className="flex items-center gap-2 text-xs text-gray-300">
          Sections
          <input
            type="number"
            min={node?.split ? 1 : 2}
            max={MAX_MID_SPLIT}
            value={node?.children?.length ?? sections}
            aria-label={`${label} Sections`}
            onChange={(event) => {
              if (node?.split) {
                if (event.target.value !== '') commit(setLayoutCount(layout, path, Number(event.target.value)));
              } else setSections(event.target.value);
            }}
            onBlur={() => {
              const count = Math.round(Number(sections));
              setSections(Number.isFinite(count) ? Math.min(MAX_MID_SPLIT, Math.max(2, count)) : 2);
            }}
            className={NUMBER_CLASS}
          />
        </label>
        {node?.split ? (
          <button type="button" className={BUTTON_CLASS} onClick={() => commit(equalizeLayout(layout, path))}>Equal</button>
        ) : layout ? (
          <>
            <button
              type="button"
              aria-label={`${label} Split ↔`}
              title="Split ↔"
              className={`${BUTTON_CLASS} flex h-7 w-7 items-center justify-center p-0`}
              onClick={() => commit(splitLayout(layout, path, 'cols', Number(sections)))}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path d="M8 2v12M5.5 5 2.5 8l3 3M10.5 5l3 3-3 3" />
              </svg>
            </button>
            <button
              type="button"
              aria-label={`${label} Split ↕`}
              title="Split ↕"
              className={`${BUTTON_CLASS} flex h-7 w-7 items-center justify-center p-0`}
              onClick={() => commit(splitLayout(layout, path, 'rows', Number(sections)))}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path
                  d="M8 2v12M5.5 5 2.5 8l3 3M10.5 5l3 3-3 3"
                  transform="rotate(90 8 8)"
                />
              </svg>
            </button>
          </>
        ) : (
          <>
            <button type="button" className={BUTTON_CLASS} onClick={() => commit(splitLayout(undefined, 'root', 'rows', Number(sections)))}>Mid rails</button>
            <button type="button" className={BUTTON_CLASS} onClick={() => commit(splitLayout(undefined, 'root', 'cols', Number(sections)))}>Mid stiles</button>
          </>
        )}
        {layout && (
          <button
            type="button"
            className={BUTTON_CLASS}
            onClick={() => {
              if (commit(path === 'root' ? undefined : removeLayoutChild(layout, path))) select('root');
            }}
          >
            {path === 'root' ? 'Remove mids' : 'Remove'}
          </button>
        )}
      </div>
    </div>
  );
}
