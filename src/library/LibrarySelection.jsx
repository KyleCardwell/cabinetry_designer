import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { isLibraryBuiltIn } from '../elevation/model/libraryFile.js';

export function useLibrarySelection(rows, filter = '') {
  const source = useSelector((state) => state.elevation.source);
  const loadId = useSelector((state) => state.elevation.cloud?.loadId);
  const [ids, setIds] = useState([]);
  useEffect(() => setIds([]), [filter, source, loadId]);
  const visibleIds = rows.filter((row) => !isLibraryBuiltIn(row.id)).map((row) => row.id);
  const selectedIds = ids.filter((id) => visibleIds.includes(id));
  return {
    selectedIds,
    all: visibleIds.length > 0 && selectedIds.length === visibleIds.length,
    some: selectedIds.length > 0 && selectedIds.length < visibleIds.length,
    empty: visibleIds.length === 0,
    toggleAll: (checked) => setIds(checked ? visibleIds : []),
    toggle: (id, checked) => setIds((previous) => checked ? [...previous, id] : previous.filter((value) => value !== id)),
  };
}

export function LibrarySelectAll({ selection }) {
  return <input type="checkbox" aria-label="Select all visible rows" checked={selection.all}
    disabled={selection.empty} ref={(input) => { if (input) input.indeterminate = selection.some; }}
    onChange={(event) => selection.toggleAll(event.target.checked)} />;
}

export function LibrarySelectRow({ row, selection }) {
  if (isLibraryBuiltIn(row.id)) return null;
  return <input type="checkbox" aria-label={`Select ${row.name ?? row.code}`} checked={selection.selectedIds.includes(row.id)}
    onChange={(event) => selection.toggle(row.id, event.target.checked)} />;
}
