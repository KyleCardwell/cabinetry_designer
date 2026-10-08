import { PANEL_TYPES, findDoorDesign } from '../model/doorStyles.js';
import InchInput from './InchInput.jsx';

const INPUT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const HEADING_CLASS = 'text-sm font-semibold text-gray-300';

function SizeField({ label, value, onChange, allowZero = false, disabled = false }) {
  return (
    <label className={`block text-xs text-gray-400 ${disabled ? 'opacity-50' : ''}`}>
      {label}
      <InchInput
        value={value}
        displayStep={1 / 16}
        disabled={disabled}
        onCommit={(next) => {
          if (!Number.isFinite(next) || (allowZero ? next < 0 : !(next > 0))) return false;
          onChange(next);
          return true;
        }}
        aria-label={label}
        className="mt-1"
      />
    </label>
  );
}

export default function DoorStyleFields({ draft, setDraft, designs }) {
  const design = findDoorDesign(draft.designId, designs);
  const slab = design?.construction === 'slab';
  const fivePiece = design?.construction === 'five_piece';
  const applied = design?.construction === 'slab_applied';
  const arched = Boolean(design && (design.topRail.shape !== 'flat' || design.bottomRail.shape !== 'flat'));
  const change = (key, value) => setDraft((previous) => ({ ...previous, [key]: value }));
  const changeSize = (group, key, value) => setDraft((previous) => ({
    ...previous,
    [group]: { ...previous[group], [key]: value },
  }));

  return (
    <div className="space-y-4">
      <label className="block text-xs text-gray-400">
        Design
        <select
          value={draft.designId}
          onChange={(event) => change('designId', event.target.value)}
          aria-label="Design"
          className={`mt-1 ${INPUT_CLASS}`}
        >
          {designs.map(({ id, code, description }) => (
            <option key={id} value={id}>{code} — {description}</option>
          ))}
        </select>
      </label>
      <SizeField label="Thickness" value={draft.thickness} onChange={(value) => change('thickness', value)} />
      <section className="space-y-2">
        <h3 className={HEADING_CLASS}>{applied ? 'Molding inset' : 'Stiles & rails'}</h3>
        {slab && <p className="text-xs text-gray-400">Not used by a slab — kept if you switch back</p>}
        <div className="grid grid-cols-2 gap-3">
          {[
            ['stiles', 'left', applied ? 'Left' : 'Left stile'],
            ['stiles', 'right', applied ? 'Right' : 'Right stile'],
            ['rails', 'top', applied ? 'Top' : 'Top rail'],
            ['rails', 'bottom', applied ? 'Bottom' : 'Bottom rail'],
          ].map(([group, key, label]) => (
            <SizeField
              key={`${group}.${key}`}
              label={label}
              value={draft[group][key]}
              disabled={slab}
              onChange={(value) => changeSize(group, key, value)}
            />
          ))}
        </div>
      </section>
      <SizeField
        label="Mid rail/stile extra"
        value={draft.mid.extra}
        allowZero
        disabled={!fivePiece && !applied}
        onChange={(value) => changeSize('mid', 'extra', value)}
      />
      <section className="space-y-2">
        <h3 className={HEADING_CLASS}>Panel</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className={`block text-xs text-gray-400 ${fivePiece ? '' : 'opacity-50'}`}>
            Panel type
            <select
              value={draft.panel.type}
              disabled={!fivePiece}
              onChange={(event) => changeSize('panel', 'type', event.target.value)}
              aria-label="Panel type"
              className={`mt-1 ${INPUT_CLASS}`}
            >
              {PANEL_TYPES.map((type) => (
                <option key={type} value={type}>{type === 'flat' ? 'Flat' : 'Raised'}</option>
              ))}
            </select>
          </label>
          <SizeField
            label="Panel thickness"
            value={draft.panel.thickness}
            disabled={!fivePiece}
            onChange={(value) => changeSize('panel', 'thickness', value)}
          />
        </div>
      </section>
      <div className="space-y-1">
        <SizeField
          label="Arch rise"
          value={draft.arch.rise}
          disabled={!arched}
          onChange={(value) => changeSize('arch', 'rise', value)}
        />
        <p className="text-xs text-gray-400">Drawn flat until arched rails are added</p>
      </div>
      <section className="space-y-2">
        <h3 className={HEADING_CLASS}>Short faces</h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            ['minPanel', 'Min panel'],
            ['minRail', 'Min rail/inset'],
            ['slabBelow', 'Slab below'],
            ['step', 'Round to'],
          ].map(([key, label]) => (
            <SizeField
              key={key}
              label={label}
              value={draft.shortFace[key]}
              allowZero={key === 'slabBelow'}
              disabled={slab}
              onChange={(value) => changeSize('shortFace', key, value)}
            />
          ))}
        </div>
      </section>
      <section className="space-y-2">
        <h3 className={HEADING_CLASS}>Profiles</h3>
        <p className="text-xs text-gray-400">All square — the profile library comes later.</p>
      </section>
    </div>
  );
}
