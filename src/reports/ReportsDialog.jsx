import { useState } from 'react';
import { useSelector } from 'react-redux';
import { selectSettings } from '../elevation/store/selectors.js';
import { drawingRevision } from '../elevation/model/roomVersions.js';
import { COPIES } from './copies.js';
import { reportHeader } from './header.js';
import { doorOrder } from './doorOrder.js';
import { doorOrderDocument, doorOrderFileName } from './doorOrderPdf.js';
import { shippingList } from './shippingList.js';
import { shippingListDocument, shippingListFileName } from './shippingListPdf.js';
import { downloadPdf } from './pdf.js';

const copiesKey = 'ff.reportCopies';
const reportsKey = 'ff.reports';
const REPORTS = [
  { id: 'door_order', label: 'Door Order Form' },
  { id: 'shipping_list', label: 'Main Shipping List' },
];

function savedReports() {
  try {
    const saved = JSON.parse(localStorage.getItem(reportsKey));
    if (Array.isArray(saved) && saved.every((id) => REPORTS.some((report) => report.id === id))) {
      return REPORTS.filter(({ id }) => saved.includes(id)).map(({ id }) => id);
    }
  } catch { /* Storage may be unavailable; use the first-open defaults. */ }
  return REPORTS.map(({ id }) => id);
}

function savedCopies() {
  try {
    const saved = JSON.parse(localStorage.getItem(copiesKey));
    if (Array.isArray(saved) && saved.every((id) => COPIES.some((copy) => copy.id === id))) {
      return COPIES.filter(({ id }) => saved.includes(id)).map(({ id }) => id);
    }
  } catch { /* Storage may be unavailable; use the first-open defaults. */ }
  return COPIES.map(({ id }) => id);
}

function warningMessage(warning) {
  if (warning.code === 'report-part-unnumbered') return `Part ? : a door or panel has no part number (${warning.key})`;
  if (warning.code === 'report-profile-missing') return `Profile missing: ${warning.id} (${warning.slot})`;
  return warning.message || warning.code;
}

export default function ReportsDialog({ onClose }) {
  const { rooms, activeRoomId, source, cloud } = useSelector((state) => state.elevation);
  const settings = useSelector(selectSettings);
  const room = rooms.find((candidate) => candidate.id === activeRoomId) ?? null;
  const [selected, setSelected] = useState(savedReports);
  const [copies, setCopies] = useState(savedCopies);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const canDownload = Boolean(room && selected.length && copies.length && !building);

  function toggleReport(id, checked) {
    const next = REPORTS.filter((report) => report.id === id ? checked : selected.includes(report.id)).map((report) => report.id);
    setSelected(next);
    try { localStorage.setItem(reportsKey, JSON.stringify(next)); }
    catch { /* Keep the dialog usable when browser storage is blocked. */ }
  }

  function toggleCopy(id, checked) {
    const next = COPIES.filter((copy) => copy.id === id ? checked : copies.includes(copy.id)).map((copy) => copy.id);
    setCopies(next);
    try { localStorage.setItem(copiesKey, JSON.stringify(next)); }
    catch { /* Keep the dialog usable when browser storage is blocked. */ }
  }

  async function download(event) {
    event.preventDefault();
    if (!canDownload) return;
    setBuilding(true);
    setError(null);
    setWarnings([]);
    const messages = [];
    const reportWarnings = [];
    try {
      const header = reportHeader({ project: cloud?.project, room, settings, revision: drawingRevision(source, cloud?.room) });
      if (selected.includes('door_order')) {
        const order = doorOrder(room, settings);
        reportWarnings.push(...order.warnings);
        if (!order.pages.length) messages.push('No doors, drawer fronts or panels in this room.');
        else await downloadPdf(doorOrderDocument(order, header, copies), doorOrderFileName(header, room.name));
      }
      if (selected.includes('shipping_list')) {
        const list = shippingList(room, settings);
        reportWarnings.push(...list.warnings);
        if (!list.rows.some((row) => row.kind !== 'adjustable_shelves')) messages.push('No parts in this room.');
        else await downloadPdf(shippingListDocument(list, header, copies), shippingListFileName(header, room.name));
      }
    } catch (failure) {
      messages.push(failure.message || String(failure));
    } finally {
      setError(messages.join(' ') || null);
      setWarnings(reportWarnings);
      setBuilding(false);
    }
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    onKeyDown={(event) => event.stopPropagation()}>
    <section role="dialog" aria-modal="true" aria-labelledby="reports-title" className="max-h-full w-full max-w-lg space-y-4 overflow-y-auto rounded border border-gray-700 bg-gray-800 p-6 text-gray-100">
      <h2 id="reports-title" className="text-lg font-semibold">Reports</h2>
      <form onSubmit={download} className="space-y-4">
        <fieldset disabled={building} className="space-y-2">
          <legend className="mb-2 font-medium">Reports</legend>
          {REPORTS.map(({ id, label }, index) => <label key={id} className="flex items-center gap-2">
            <input type="checkbox" autoFocus={index === 0} checked={selected.includes(id)} onChange={(event) => toggleReport(id, event.target.checked)} />
            {label}
          </label>)}
        </fieldset>
        <fieldset disabled={building} className="space-y-2">
          <legend className="mb-2 font-medium">Copies</legend>
          {COPIES.map(({ id }) => <label key={id} className="flex items-center gap-2">
            <input type="checkbox" checked={copies.includes(id)} onChange={(event) => toggleCopy(id, event.target.checked)} />
            {id[0].toUpperCase() + id.slice(1)}
          </label>)}
        </fieldset>
        <div className="flex gap-3">
          <button type="submit" disabled={!canDownload} className="rounded bg-blue-600 px-3 py-2 disabled:opacity-50">{building ? 'Building…' : 'Download'}</button>
          <button type="button" disabled={building} onClick={onClose} className="rounded border border-gray-600 px-3 py-2 disabled:opacity-50">Cancel</button>
        </div>
        {warnings.length > 0 && <ul className="space-y-1 text-sm text-amber-300">
          {warnings.map((warning, index) => <li key={index}>{warningMessage(warning)}</li>)}
        </ul>}
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      </form>
    </section>
  </div>;
}
