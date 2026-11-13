import { useState } from 'react';
import { builderProblemText, MAX_STACK_SECTIONS, newStackDetail, newStackSection } from '../../elevation/model/shapeBuilders.js';
import { convertShapeToDrawn, withShapeBuilder } from '../../elevation/model/libraryShapes.js';
import { formatInches } from '../../elevation/model/units.js';
import { sectionProfileBounds } from '../../elevation/model/sectionProfiles.js';
import CoordInput from '../profileEditor/CoordInput.jsx';

const BUTTON_CLASS = 'rounded border border-gray-600 px-2.5 py-1.5 text-sm text-gray-200 hover:bg-gray-700 disabled:opacity-50';
const SMALL_BUTTON = 'rounded border border-gray-600 px-2 py-0.5 text-xs text-gray-200 hover:bg-gray-700 disabled:opacity-50';
const SELECT_CLASS = 'min-w-0 flex-1 rounded border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-gray-100';
const FAIL = 'That change would make the shape invalid.';

export function ProfileSelect({ profiles, label, disabled, onPick }) {
  const [pick, setPick] = useState('');
  const chosen = profiles.find((profile) => profile.id === pick);
  return (
    <div className="flex items-center gap-2">
      <select aria-label={label} className={SELECT_CLASS} value={pick} disabled={disabled}
        onChange={(event) => setPick(event.target.value)}>
        <option value="">{label}</option>
        {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
      </select>
      <button type="button" className={SMALL_BUTTON} disabled={disabled || !chosen}
        onClick={() => { if (chosen && onPick(chosen) !== false) setPick(''); }}>Copy</button>
    </div>
  );
}

function turnedHeight(section) {
  const { minY, maxY } = sectionProfileBounds({ geometry: section.profile });
  return Number.isFinite(minY) ? maxY - minY : 0;
}

export function ExtrudeFields({ shape, profiles, readOnly, onApply }) {
  const { builder } = shape;
  const set = (next, side) => onApply(withShapeBuilder(shape, next, side), FAIL);
  const sideHasLoops = shape.views.side.loops.length > 0;
  return (
    <div className="space-y-3">
      <label className="block space-y-1 text-xs text-gray-400">
        <span>Length (along x)</span>
        <CoordInput aria-label="Extrusion length" value={builder.length} disabled={readOnly}
          onCommit={(length) => set({ ...builder, length })} />
      </label>
      <label className="flex items-center gap-2 text-sm text-gray-200">
        <input type="checkbox" checked={builder.stretches} disabled={readOnly}
          onChange={(event) => set({ ...builder, stretches: event.target.checked })} />
        Stretches to fit
      </label>
      <div className="space-y-1">
        <p className="text-xs text-gray-400">Start from profile{sideHasLoops ? ' (replaces the Side view)' : ''}</p>
        <ProfileSelect profiles={profiles} label="Pick a section profile" disabled={readOnly}
          onPick={(profile) => set({ ...builder, drawnPoints: structuredClone(profile.drawnPoints) }, profile.geometry)} />
      </div>
      <p className="text-xs text-gray-500">Draw the cross-section in the Side view. Front and Plan are made from it; tick drawn points for lines along the length.</p>
    </div>
  );
}

export function StackFields({ shape, profiles, readOnly, onApply, section, detail, onEditSection }) {
  const { builder } = shape;
  const { sections } = builder;
  const set = (nextSections, stretch, keepEditing = false) => {
    const next = { type: 'stack', sections: nextSections, ...(stretch === null ? {} : { stretch }) };
    if (onApply(withShapeBuilder(shape, next), FAIL) !== false && !keepEditing) onEditSection(null);
  };
  const stretch = Object.hasOwn(builder, 'stretch') ? builder.stretch : null;
  const move = (index, by) => {
    const to = index + by;
    const next = [...sections];
    [next[index], next[to]] = [next[to], next[index]];
    set(next, stretch === index ? to : stretch === to ? index : stretch);
  };
  const remove = (index) => set(sections.filter((_, i) => i !== index),
    stretch === null || stretch === index ? null : stretch > index ? stretch - 1 : stretch);
  const update = (index, value) => set(sections.map((entry, i) => (i === index ? value : entry)), stretch, true);
  const total = sections.reduce((sum, entry) => sum + (entry.type === 'turned' ? turnedHeight(entry) : entry.height), 0);
  const radioName = `stack-stretch-${shape.id}`;

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400">Sections, top to bottom. 0,0,0 is the centre at the bottom.</p>
      {sections.map((entry, index) => (
        <div key={index} className={`space-y-2 rounded border p-2 ${section === index ? 'border-blue-500' : 'border-gray-700'}`}>
          <div className="flex items-center gap-2 text-sm text-gray-200">
            <span className="font-medium">{`${index + 1}. ${entry.type[0].toUpperCase()}${entry.type.slice(1)}`}</span>
            <div className="flex-1" />
            <button type="button" className={SMALL_BUTTON} aria-label={`Move section ${index + 1} up`}
              disabled={readOnly || index === 0} onClick={() => move(index, -1)}>↑</button>
            <button type="button" className={SMALL_BUTTON} aria-label={`Move section ${index + 1} down`}
              disabled={readOnly || index === sections.length - 1} onClick={() => move(index, 1)}>↓</button>
            <button type="button" className={SMALL_BUTTON} aria-label={`Remove section ${index + 1}`}
              disabled={readOnly} onClick={() => remove(index)}>Remove</button>
          </div>
          {entry.type !== 'turned' ? (
            <div className="grid grid-cols-2 gap-2">
              {entry.type === 'tapered' && <label className="col-span-2 space-y-1 text-xs text-gray-400">
                <span>Shape</span>
                <select aria-label={`Section ${index + 1} shape`} className={SELECT_CLASS} value={entry.shape} disabled={readOnly}
                  onChange={(event) => update(index, { ...entry, shape: event.target.value,
                    taper: event.target.value === 'round' ? 'all' : entry.taper })}>
                  <option value="square">Square</option><option value="round">Round</option>
                </select>
              </label>}
              {(entry.type === 'square' ? [['width', 'Width'], ['height', 'Height']]
                : [['top', 'Top width'], ['bottom', 'Bottom width'], ['height', 'Height']]).map(([key, label]) => (
                <label key={key} className="space-y-1 text-xs text-gray-400">
                  <span>{label}</span>
                  <CoordInput aria-label={`Section ${index + 1} ${key}`} value={entry[key]} disabled={readOnly}
                    onCommit={(value) => update(index, { ...entry, [key]: value })} />
                </label>
              ))}
              {entry.type === 'tapered' && entry.shape === 'square' && <>
                <label className="col-span-2 space-y-1 text-xs text-gray-400">
                  <span>Taper</span>
                  <select aria-label={`Section ${index + 1} taper`} className={SELECT_CLASS} value={entry.taper} disabled={readOnly}
                    onChange={(event) => update(index, { ...entry, taper: event.target.value })}>
                    <option value="all">All sides</option><option value="inside">Inside faces</option>
                  </select>
                </label>
                {entry.taper === 'inside' && <p className="col-span-2 text-xs text-gray-500">
                  Draw the right-front leg: the right and front faces stay plumb.</p>}
              </>}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-400">Height {formatInches(turnedHeight(entry))} (from its profile)</p>
              <button type="button" className={SMALL_BUTTON} disabled={section === index && detail == null}
                onClick={() => onEditSection(index)}>{section === index && detail == null ? 'Editing profile' : 'Edit profile'}</button>
              <ProfileSelect profiles={profiles} label="Copy from profile" disabled={readOnly}
                onPick={(profile) => update(index, { ...entry, profile: structuredClone(profile.geometry),
                  drawnPoints: { elevation: [...profile.drawnPoints.elevation] } })} />
            </div>
          )}
          {entry.type !== 'turned' && (
            <label className="flex items-center gap-2 text-xs text-gray-200">
              <input type="radio" name={radioName} checked={stretch === index} disabled={readOnly}
                onChange={() => set(sections, index, true)} />
              Stretches
            </label>
          )}
          <div className="space-y-2 border-t border-gray-700 pt-2">
            <p className="text-xs font-medium text-gray-300">Details</p>
            {(entry.details ?? []).map((item, k, details) => {
              const label = `Section ${index + 1} detail ${k + 1}`;
              const change = (value) => update(index, { ...entry, details: details.map((d, j) => j === k ? value : d) });
              const moveDetail = (by) => {
                const next = [...details];
                [next[k], next[k + by]] = [next[k + by], next[k]];
                set(sections.map((s, i) => i === index ? { ...entry, details: next } : s), stretch);
              };
              return <div key={k} aria-label={label} className="space-y-2 rounded border border-gray-700 p-2">
                <p className="text-xs text-gray-300">Detail {k + 1} · Height {formatInches(turnedHeight(item))}</p>
                <div className="flex gap-2">
                  <label className="text-xs text-gray-400">From
                    <select aria-label={`${label} from`} className={SELECT_CLASS} value={item.from} disabled={readOnly}
                      onChange={(event) => change({ ...item, from: event.target.value })}>
                      <option value="bottom">Bottom</option><option value="top">Top</option>
                    </select>
                  </label>
                  <label className="min-w-0 flex-1 text-xs text-gray-400">At
                    <CoordInput aria-label={`${label} at`} value={item.at} disabled={readOnly}
                      onCommit={(at) => change({ ...item, at })} />
                  </label>
                </div>
                <div className="flex flex-wrap gap-1">
                  <button type="button" className={SMALL_BUTTON} disabled={section === index && detail === k}
                    onClick={() => onEditSection(index, k)}>Edit detail</button>
                  <button type="button" className={SMALL_BUTTON} aria-label={`Move ${label.toLowerCase()} up`}
                    disabled={readOnly || k === 0} onClick={() => moveDetail(-1)}>↑</button>
                  <button type="button" className={SMALL_BUTTON} aria-label={`Move ${label.toLowerCase()} down`}
                    disabled={readOnly || k === details.length - 1} onClick={() => moveDetail(1)}>↓</button>
                  <button type="button" className={SMALL_BUTTON} aria-label={`Remove ${label.toLowerCase()}`} disabled={readOnly}
                    onClick={() => set(sections.map((s, i) => i === index
                      ? { ...entry, details: details.filter((_, j) => j !== k) } : s), stretch)}>Remove</button>
                </div>
              </div>;
            })}
            <button type="button" className={SMALL_BUTTON} aria-label={`Add detail to section ${index + 1}`}
              disabled={readOnly || (entry.details?.length ?? 0) >= 8} onClick={() => {
                const height = entry.type === 'turned' ? turnedHeight(entry) : entry.height;
                update(index, { ...entry, details: [...(entry.details ?? []),
                  { ...newStackDetail(), at: Math.round((height - 0.5) / 2 * 16) / 16 }] });
              }}>Add detail</button>
          </div>
        </div>
      ))}
      <label className="flex items-center gap-2 text-xs text-gray-200">
        <input type="radio" name={radioName} checked={stretch === null} disabled={readOnly}
          onChange={() => set(sections, null, true)} />
        None stretches (fixed height)
      </label>
      <div className="flex flex-wrap gap-2">
        {['square', 'tapered', 'turned'].map((type) => (
          <button key={type} type="button" className={BUTTON_CLASS}
            disabled={readOnly || sections.length >= MAX_STACK_SECTIONS}
            onClick={() => set([...sections, newStackSection(type)], stretch, true)}>
            {`Add ${type}`}
          </button>
        ))}
      </div>
      <p className="text-sm text-gray-300">{`Total height ${formatInches(total)}`}</p>
    </div>
  );
}

export default function BuilderPanel({ shape, profiles, problems, readOnly, onApply, section, detail, onEditSection }) {
  const [converting, setConverting] = useState(false);
  const { builder } = shape;
  return (
    <section aria-label="Builder" className="space-y-3">
      <h2 className="text-sm font-medium text-gray-200">
        {builder.type === 'extrude' ? 'Extrusion builder' : 'Leg / column builder'}
      </h2>
      {builder.type === 'extrude'
        ? <ExtrudeFields shape={shape} profiles={profiles} readOnly={readOnly} onApply={onApply} />
        : <StackFields shape={shape} profiles={profiles} readOnly={readOnly} onApply={onApply}
          section={section} detail={detail} onEditSection={onEditSection} />}
      {problems.map((problem, index) => (
        <p key={index} role="alert" className="text-sm text-amber-300">{builderProblemText(problem)}</p>
      ))}
      <div className="space-y-1">
        <button type="button" className={BUTTON_CLASS} disabled={readOnly} onClick={() => {
          if (!converting) { setConverting(true); return; }
          if (onApply(convertShapeToDrawn(shape), FAIL) !== false) {
            setConverting(false);
            onEditSection(null);
          }
        }}>{converting ? 'Confirm convert to drawn' : 'Convert to drawn'}</button>
        {converting && <p role="alert" className="text-xs text-amber-300">
          Turn this into a drawn shape? The builder settings are dropped and can&apos;t come back.</p>}
      </div>
    </section>
  );
}
