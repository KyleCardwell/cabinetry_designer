import {
  partSizeRows,
  pickOptions,
  setPartMids,
  setPartNote,
  setPartSide,
} from '../../model/doorStyleEdits.js';
import { doorProfileOffsets } from '../../model/doorProfileLines.js';
import { resolveDoorStyle } from '../../model/doorStyleResolve.js';
import { formatInches, formatInchesInput } from '../../model/units.js';
import InchInput from '../InchInput.jsx';

const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const BUTTON_CLASS = 'rounded bg-gray-700 px-2 py-1 text-xs text-gray-100 hover:bg-gray-600';
const NOTE_CLASS = 'min-w-0 flex-1 rounded border border-gray-600 bg-gray-900 px-2 py-1 text-xs text-gray-100 focus:border-blue-500 focus:outline-none';

export default function PartStyleFields({
  room, settings, partType, levels, part, width, height, label, onChange,
}) {
  if (partType === null) return null;

  const picker = room.doorStyles?.length
    ? pickOptions(room, settings, partType, levels.slice(1))
    : null;
  const { style, design, warnings } = resolveDoorStyle(room, settings, partType, levels);
  const edgeOut = doorProfileOffsets(style, design, settings.sectionProfiles).slots.outside?.reachOut ?? 0;
  const rows = partSizeRows(style, design, { width, height, sizes: part?.sizes }, edgeOut);
  const styleId = part?.styleId ?? '';
  const missingPick = picker && styleId !== ''
    && !picker.options.some((option) => option.id === styleId);

  const commitMids = (kind, list) => {
    onChange({ sizes: setPartMids(part?.sizes, kind, list) ?? null });
  };

  const editMid = (kind, index, key, value) => {
    if (!(value > 0) && !(key === 'width' && value === null)) return false;
    const list = (part?.sizes?.[kind] ?? []).map((entry, entryIndex) => {
      if (entryIndex !== index) return entry;
      const next = { ...entry };
      if (value === null) delete next[key];
      else next[key] = value;
      return next;
    });
    commitMids(kind, list);
    return true;
  };

  const midFields = (kind, word, dimension) => (
    <div className="space-y-2">
      {rows[kind].map((entry, index) => (
        <div key={index} className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-xs text-gray-400">Mid {word} {index + 1}</span>
          <label className="min-w-0 flex-1 text-xs text-gray-400">
            At
            <InchInput
              value={entry.at}
              required
              displayStep={1 / 16}
              aria-label={`${label} mid ${word} ${index + 1} at`}
              onCommit={(value) => editMid(kind, index, 'at', value)}
            />
          </label>
          <label className="min-w-0 flex-1 text-xs text-gray-400">
            Width
            <InchInput
              value={part?.sizes?.[kind]?.[index]?.width ?? null}
              allowBlank
              displayStep={1 / 16}
              placeholder={formatInchesInput(entry.width)}
              aria-label={`${label} mid ${word} ${index + 1} width`}
              onCommit={(value) => editMid(kind, index, 'width', value)}
            />
          </label>
          <button
            type="button"
            aria-label={`${label} remove mid ${word} ${index + 1}`}
            onClick={() => commitMids(
              kind,
              (part?.sizes?.[kind] ?? []).filter((_, entryIndex) => entryIndex !== index),
            )}
            className={BUTTON_CLASS}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => commitMids(kind, [
          ...(part?.sizes?.[kind] ?? []),
          { at: Math.round(dimension / 2 * 16) / 16 },
        ])}
        className={BUTTON_CLASS}
      >
        Add mid {word}
      </button>
    </div>
  );

  return (
    <div className="space-y-2">
      {picker && (
        <label className="block text-xs text-gray-400">
          Style
          <select
            value={styleId}
            onChange={(event) => onChange({ styleId: event.target.value || null })}
            aria-label={`${label} style`}
            className={`mt-1 ${SELECT_CLASS}`}
          >
            <option value="">{picker.inherit.text}</option>
            {picker.options.map((option) => (
              <option key={option.id} value={option.id}>{option.text}</option>
            ))}
            {missingPick && <option value={styleId}>Missing ({styleId})</option>}
          </select>
        </label>
      )}
      <h4 className="text-xs font-semibold text-gray-400">{`${rows.title} · ${style.label}`}</h4>
      {rows.note ? (
        <p className="text-xs text-gray-400">{rows.note}</p>
      ) : (
        <>
          {rows.rows.map((row) => (
            <div key={row.side} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-xs text-gray-400">{row.label}</span>
              <div className="w-16 shrink-0">
                <InchInput
                  value={row.typed}
                  allowBlank
                  displayStep={1 / 16}
                  placeholder={formatInchesInput(row.value)}
                  aria-label={`${label} ${row.label}`}
                  onCommit={(value) => {
                    if (value !== null && !(value > 0)) return false;
                    onChange({ sizes: setPartSide(part?.sizes, row.side, value) ?? null });
                    return true;
                  }}
                />
              </div>
              {row.source === 'rule' && (
                <span className="shrink-0 text-[10px] text-gray-500">short face</span>
              )}
              <input
                key={row.note ?? ''}
                type="text"
                defaultValue={row.note ?? ''}
                placeholder="note"
                aria-label={`${label} ${row.label} note`}
                onBlur={(event) => {
                  const text = event.currentTarget.value.trim();
                  if (text !== (row.note ?? '')) {
                    onChange({ sizes: setPartNote(part?.sizes, row.side, text) ?? null });
                  }
                }}
                className={NOTE_CLASS}
              />
            </div>
          ))}
          {midFields('midRails', 'rail', height)}
          {width > 0 && midFields('midStiles', 'stile', width)}
          {rows.opening && (
            <p className="text-xs text-gray-400">
              {design.construction === 'slab_applied' ? 'Molding' : 'Panel'}{' '}
              {formatInches(rows.opening.width)} × {formatInches(rows.opening.height)}
            </p>
          )}
        </>
      )}
      {warnings.filter(({ code }) => code === 'door-style-missing').map((warning) => (
        <p key={`${warning.level}:${warning.id}`} className="text-xs text-amber-300">
          Style {warning.id} is missing — using {style.label}
        </p>
      ))}
    </div>
  );
}
