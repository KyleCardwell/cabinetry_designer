import {
  partSizeRows,
  pickOptions,
  setPartNote,
  setPartSide,
} from '../../model/doorStyleEdits.js';
import { doorProfileOffsets } from '../../model/doorProfileLines.js';
import { resolveDoorStyle } from '../../model/doorStyleResolve.js';
import { resolveMidLayout } from '../../model/midLayout.js';
import { formatInches, formatInchesInput } from '../../model/units.js';
import InchInput from '../InchInput.jsx';
import MidLayoutFields from './MidLayoutFields.jsx';

const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const NOTE_CLASS = 'min-w-0 flex-1 rounded border border-gray-600 bg-gray-900 px-2 py-1 text-xs text-gray-100 focus:border-blue-500 focus:outline-none';

export default function PartStyleFields({
  room, settings, partType, levels, part, width, height, label, onChange,
}) {
  if (partType === null) return null;

  const picker = pickOptions(room, settings, partType, levels.slice(1));
  const { style, design, warnings } = resolveDoorStyle(room, settings, partType, levels);
  const offsets = doorProfileOffsets(style, design, settings.sectionProfiles);
  const edgeOut = offsets.slots.outside?.reachOut ?? 0;
  const rows = partSizeRows(style, design, { width, height, sizes: part?.sizes }, edgeOut, offsets.applied, offsets);
  const styleId = part?.styleId ?? '';
  const missingPick = styleId !== ''
    && !picker.options.some((option) => option.id === styleId);

  const slab = design.construction === 'slab';
  // The size rows expose resolved mids but omit nodes. Reuse their actual widths
  // (including zero-width slab splits) to recover unmirrored editor coordinates.
  const mids = [...rows.midRails, ...rows.midStiles];
  const withWidths = (node, path = 'root') => node?.split ? {
    ...node,
    mids: node.children.slice(1).map((_, index) => ({
      width: mids.find((mid) => mid.path === path && mid.index === index).width,
    })),
    children: node.children.map((child, index) => withWidths(child, `${path}.${index}`)),
  } : node;
  const resolved = rows.opening && {
    ...resolveMidLayout(withWidths(part?.sizes?.layout), slab
      ? rows.area ?? { x: 0, z: 0, width, height }
      : {
        x: rows.rows.find((row) => row.side === 'left').value,
        z: rows.rows.find((row) => row.side === 'bottom').value,
        ...rows.opening,
      }, { rail: 0, stile: 0, over: 0, source: { rail: 'flat', stile: 'flat' } }),
    midRails: rows.midRails,
    midStiles: rows.midStiles,
  };

  return (
    <div className="space-y-2">
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
      <h4 className="text-xs font-semibold text-gray-400">{`${rows.title} · ${style.label}`}</h4>
      {rows.note ? (
        <p className="text-xs text-gray-400">{rows.note}</p>
      ) : (
        <>
          {rows.rows.map((row) => row.readOnly ? (
            <div key={row.index} className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
              <span>{row.label}</span>
              <span>
                {formatInchesInput(row.value)}
                {row.note && ` (style ${formatInchesInput(row.typed)})`}
              </span>
              {row.note && <span className="text-[10px] text-gray-500">{row.note}</span>}
            </div>
          ) : (
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
          {resolved && (
            <MidLayoutFields
              layout={part?.sizes?.layout}
              resolved={resolved}
              slab={slab}
              label={label}
              onLayout={(next) => {
                const sizes = { ...part?.sizes };
                if (next === undefined) delete sizes.layout;
                else sizes.layout = next;
                onChange({ sizes: Object.keys(sizes).length ? sizes : null });
              }}
            />
          )}
          {slab && rows.opening && (
            <p className="text-xs text-gray-400">
              Molding{' '}
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
