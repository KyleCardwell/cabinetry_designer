import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { saveBlob } from '../api/drawings.js';
import {
  LIBRARY_KINDS, isLibraryBuiltIn, libraryExport, mergeLibrary, parseLibraryFile, remapLibraryIds,
} from '../elevation/model/libraryFile.js';
import { importLibrary } from '../elevation/store/elevationSlice.js';
import { useShopReadOnly } from './WorkspaceSourceBar.jsx';

const BUTTON_CLASS = 'rounded border border-gray-600 px-2.5 py-1.5 text-sm text-gray-200 hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50';
const rowKey = (group, key, index) => `${group}:${key}:${index}`;

function ImportPreview({ file, settings, readOnly, onImport, onClose }) {
  const [unchecked, setUnchecked] = useState([]);
  const panelRef = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const previousFocus = document.activeElement;
    const panel = panelRef.current;
    panel.querySelector('input:not(:disabled), button')?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key === 'Tab') {
        const controls = panel.querySelectorAll('input:not(:disabled), button:not(:disabled)');
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); previousFocus?.focus(); };
  }, [onClose]);

  const exists = (key, row) => (settings[key] ?? []).some((entry) => entry.id === row?.id);
  const checked = (group, key, row, index) => !(group === 'dependencies' && exists(key, row))
    && !unchecked.includes(rowKey(group, key, index));
  const picked = { kind: 'library', version: 1, items: {}, dependencies: {} };
  for (const group of ['items', 'dependencies']) {
    for (const [key, rows] of Object.entries(file[group])) {
      const selected = rows.filter((row, index) => checked(group, key, row, index));
      if (selected.length) picked[group][key] = selected;
    }
  }
  const count = [...Object.values(picked.items), ...Object.values(picked.dependencies)].flat().length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className="w-[36rem] max-w-[95vw] max-h-[90vh] space-y-4 overflow-y-auto rounded border border-gray-700 bg-gray-800 p-5">
        <h2 id={titleId} className="text-lg font-semibold text-gray-100">Import library</h2>
        {['items', 'dependencies'].map((group) => (
          <section key={group} className="space-y-3">
            <h3 className="font-medium text-gray-100">{group === 'items' ? 'Items' : 'Needed by them'}</h3>
            {Object.keys(file[group]).length === 0 && <p className="text-sm text-gray-400">None</p>}
            {Object.entries(file[group]).map(([key, rows]) => (
              <div key={key} className="space-y-1">
                <h4 className="text-xs text-gray-400">{LIBRARY_KINDS[key].label}</h4>
                {rows.map((row, index) => {
                  const id = rowKey(group, key, index);
                  const present = exists(key, row);
                  const label = [row?.name, row?.code, row?.id].find((value) => typeof value === 'string') ?? 'Invalid item';
                  return (
                    <label key={id} className="flex items-center gap-2 text-sm text-gray-200">
                      <input type="checkbox" checked={checked(group, key, row, index)}
                        disabled={group === 'dependencies' && present}
                        onChange={(event) => setUnchecked((previous) => event.target.checked
                          ? previous.filter((value) => value !== id) : [...previous, id])} />
                      {label}
                      {present && <span className="text-xs text-gray-400">{group === 'items' ? 'replaces' : 'already in library'}</span>}
                    </label>
                  );
                })}
              </div>
            ))}
          </section>
        ))}
        <div className="flex justify-end gap-2">
          <button type="button" className={BUTTON_CLASS} onClick={onClose}>Cancel</button>
          <button type="button" className={BUTTON_CLASS} disabled={readOnly || count === 0}
            onClick={() => onImport(picked)}>Import</button>
        </div>
      </div>
    </div>
  );
}

export default function LibraryTransfer({ listKey, selectedIds }) {
  const dispatch = useDispatch();
  const { settings, source, cloud } = useSelector((state) => state.elevation);
  const readOnly = useShopReadOnly();
  const inputRef = useRef(null);
  const scope = `${source}:${cloud?.loadId ?? ''}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState(null);
  const closePreview = useCallback(() => setPreview(null), []);
  useEffect(() => { setPreview(null); setMessage(null); }, [scope]);

  const readFile = async (event) => {
    const input = event.target;
    const file = input.files?.[0];
    const startedIn = scope;
    setMessage(null);
    try {
      if (!file || readOnly) return;
      const parsed = parseLibraryFile(await file.text());
      if (scopeRef.current !== startedIn) return;
      if (parsed === null) setMessage({ error: true, text: "That file isn't a library export." });
      else setPreview(parsed);
    } catch {
      if (scopeRef.current === startedIn) setMessage({ error: true, text: "That file isn't a library export." });
    } finally {
      input.value = '';
    }
  };
  const importPicked = (file) => {
    if (readOnly) return;
    const action = importLibrary({ file });
    const picked = source === 'cloud' ? remapLibraryIds(file, action.payload.freshIds) : file;
    const { added, replaced, dependenciesAdded, skipped } = mergeLibrary(settings, picked);
    dispatch(action);
    setPreview(null);
    setMessage({ text: `Imported: ${added} new, ${replaced} replaced, ${dependenciesAdded} dependencies added, ${skipped} skipped.` });
  };
  const exportFile = () => {
    const file = libraryExport(settings, listKey, selectedIds);
    const count = file.items[listKey]?.length ?? 0;
    saveBlob(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }), `${LIBRARY_KINDS[listKey].filename}-${count}.json`);
  };

  return (
    <div className="max-w-sm space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={BUTTON_CLASS} onClick={exportFile}
          disabled={!(settings[listKey] ?? []).some((row) => !isLibraryBuiltIn(row.id))}>
          {selectedIds.length ? `Export ${selectedIds.length} selected` : 'Export'}
        </button>
        <button type="button" className={BUTTON_CLASS} disabled={readOnly}
          onClick={() => { setMessage(null); inputRef.current.click(); }}>Import…</button>
        <input ref={inputRef} type="file" accept=".json,application/json" hidden disabled={readOnly} onChange={readFile} />
      </div>
      {message && <p role="status" className={`text-sm ${message.error ? 'text-red-400' : 'text-gray-300'}`}>{message.text}</p>}
      {preview && <ImportPreview file={preview} settings={settings} readOnly={readOnly} onImport={importPicked} onClose={closePreview} />}
    </div>
  );
}
