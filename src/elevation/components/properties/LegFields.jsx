import CoordInput from '../../../library/profileEditor/CoordInput.jsx';
import { frontDepth, runBackOffset } from '../../model/corners.js';
import { resolveShape } from '../../model/libraryShapes.js';
import { legBottom, legShapeOf, legWarningText } from '../../model/legs.js';
import { formatProfileCoord } from '../../model/profileEditing.js';
import { formatInches } from '../../model/units.js';
import Field from './Field.jsx';

export const LEG_SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
export const liveLegShapes = (settings) => (settings.shapes ?? [])
  .filter((shape) => shape.kind === 'leg' && !shape.archived)
  .sort((a, b) => a.name.localeCompare(b.name));

export function LegShapeSelect({ settings, value, onChange, label }) {
  const shapes = liveLegShapes(settings);
  const unavailable = value && !shapes.some(({ id }) => id === value);
  const current = settings.shapes?.find(({ id }) => id === value);
  return (
    <Field label="Shape">
      <select aria-label={label} value={value ?? ''}
        onChange={(event) => onChange(event.target.value ? { shapeId: event.target.value } : { square: {} })}
        className={LEG_SELECT_CLASS}>
        <option value="">Square</option>
        {shapes.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
        {unavailable && <option value={value}>{current?.name ?? 'Missing shape'} (archived)</option>}
      </select>
    </Field>
  );
}

export function LegSitsOnSelect({ value, onChange, label }) {
  return (
    <Field label="Sits on">
      <select aria-label={label} value={value ?? ''} onChange={(event) => onChange(event.target.value || undefined)}
        className={LEG_SELECT_CLASS}>
        <option value="">Floor</option>
        <option value="base">Furniture base</option>
        <option value="countertop">Countertop below</option>
      </select>
    </Field>
  );
}

export function LegHeightFields({ value, onChange, fullHeight, label, showFullHeight = false }) {
  return (
    <Field label="Height">
      <select aria-label={label} value={typeof value === 'number' ? 'custom' : value}
        onChange={(event) => onChange(event.target.value === 'custom' ? Math.max(fullHeight, 1) : event.target.value)}
        className={LEG_SELECT_CLASS}>
        <option value="full">{showFullHeight ? `Full (${formatInches(fullHeight)})` : 'Full'}</option>
        <option value="feet">Feet</option>
        <option value="custom">Custom</option>
      </select>
      {typeof value === 'number' && <CoordInput aria-label={`${label} inches`} className="mt-1" value={value}
        onCommit={(next) => {
          if (!Number.isFinite(next) || next <= 0) return false;
          onChange(next);
        }} />}
    </Field>
  );
}

export function LegPanelFields({ panel, settings, label, onChange, children }) {
  return (
    <>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {children}
        {[
          ['inset', 'Reveal', 'legPanelReveal'],
          ['top', 'Top clearance', 'legPanelTopClearance'],
          ['bottom', 'Bottom clearance', 'legPanelBottomClearance'],
        ].map(([key, text, setting]) => (
          <Field key={key} label={text}>
            <CoordInput aria-label={`${label} ${text}`} value={panel[key]} allowBlank
              placeholder={formatProfileCoord(settings[setting])} onCommit={(value) => {
                if (value !== undefined && (!Number.isFinite(value) || value < 0)) return false;
                onChange(key, value);
              }} />
          </Field>
        ))}
        <Field label="Returns">
          <select aria-label={`${label} Returns`} value={panel.returns ?? ''}
            onChange={(event) => onChange('returns', event.target.value || undefined)} className={LEG_SELECT_CLASS}>
            <option value="">None</option>
            <option value="front">Front</option>
            <option value="back">Back</option>
            <option value="both">Both</option>
          </select>
        </Field>
        {panel.returns && <Field label="Return depth">
          <CoordInput aria-label={`${label} Return depth`} value={panel.returnDepth} allowBlank
            placeholder={formatProfileCoord(settings.legPanelReturnDepth)} onCommit={(value) => {
              if (value !== undefined && (!Number.isFinite(value) || value <= 0)) return false;
              onChange('returnDepth', value);
            }} />
        </Field>}
      </div>
      <label className="mt-2 flex items-center gap-2 text-xs text-gray-300">
        <input type="checkbox" aria-label={`${label} Full depth`} checked={panel.past === true}
          onChange={(event) => onChange('past', event.target.checked ? true : undefined)} />Full depth
      </label>
    </>
  );
}

export default function LegFields({ room, wall, run, leg, settings, onChange: update,
  placement, fixedRefs = false, label = 'Leg', warnings = [], children }) {
  const shape = legShapeOf(leg, settings);
  const width = shape?.box.w ?? 0;
  const u0 = leg.from === 'left' ? run.x - leg.x : run.x + run.width + leg.x - width;
  // Skipped legs (for example, Feet on a base) still need the right Full height.
  const bottom = placement?.bounds.z ?? legBottom(room, wall, run, settings, leg, u0, width).z;
  const fullHeight = run.z + run.height - bottom;
  const height = leg.height === 'full' ? fullHeight : leg.height === 'feet' ? run.z - bottom : leg.height;
  const box = shape ? resolveShape(shape, { h: height }).shape.box : null;
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <LegShapeSelect settings={settings} value={leg.shapeId} label={`${label} Shape`}
            onChange={(choice) => update({ shapeId: undefined, square: undefined, ...choice })} />
          {leg.square && <div className="mt-1 grid grid-cols-2 gap-2">
            {[['w', 'Width', 'squareLegWidth'], ['d', 'Depth', 'squareLegDepth']].map(([key, text, setting]) => (
              <Field key={key} label={text}>
                <CoordInput aria-label={`${label} ${text}`} value={leg.square[key]} allowBlank
                  placeholder={formatProfileCoord(settings[setting])} onCommit={(value) => {
                    if (value !== undefined && (!Number.isFinite(value) || value <= 0)) return false;
                    const square = { ...leg.square };
                    if (value === undefined) delete square[key];
                    else square[key] = value;
                    update({ square });
                  }} />
              </Field>
            ))}
          </div>}
        </div>
        <LegHeightFields value={leg.height} label={`${label} Height`} fullHeight={fullHeight} showFullHeight onChange={(height) => update({ height })} />
        <LegSitsOnSelect value={leg.sitsOn} label={`${label} Sits on`} onChange={(sitsOn) => update({ sitsOn })} />
        {['x', 'y'].map((axis) => {
          const reference = axis === 'x' ? 'from' : 'yFrom';
          const sides = axis === 'x' ? ['left', 'right'] : ['front', 'back'];
          const name = axis === 'x' ? 'Along' : 'In/out';
          return (
            <div key={axis}>
              <Field label={name}>
                <CoordInput aria-label={`${label} ${name}`} value={leg[axis]} onCommit={(value) => {
                  if (!Number.isFinite(value)) return false;
                  update({ [axis]: value });
                }} />
              </Field>
              {!fixedRefs && <div role="group" aria-label={`${label} ${name} reference`} className="mt-1 flex gap-1">
                {sides.map((side) => (
                  <button key={side} type="button" aria-pressed={leg[reference] === side} disabled={!box}
                    className={`flex-1 rounded px-2 py-1 text-xs disabled:opacity-40 ${leg[reference] === side ? 'bg-blue-700 text-white' : 'bg-gray-700 text-gray-200'}`}
                    onClick={() => {
                      if (!box || side === leg[reference]) return;
                      update({ [reference]: side, [axis]: axis === 'x'
                        ? box.w - run.width - leg.x
                        : runBackOffset(run) - frontDepth(run, settings) + box.d - leg.y });
                    }}>{side[0].toUpperCase() + side.slice(1)}</button>
                ))}
              </div>}
            </div>
          );
        })}
      </div>
      {children}
      <label className="mt-2 flex items-center gap-2 text-xs text-gray-300">
        <input type="checkbox" aria-label={`${label} Takes room`} checked={leg.takesRoom !== false}
          onChange={(event) => update({ takesRoom: event.target.checked ? undefined : false })} />Takes room
      </label>
      {[['mirror', 'Mirror left–right'], ['mirrorDepth', 'Mirror front–back']].map(([key, text]) => (
        <label key={key} className="mt-2 flex items-center gap-2 text-xs text-gray-300">
          <input type="checkbox" aria-label={`${label} ${text}`} checked={leg[key] === true}
            onChange={(event) => update({ [key]: event.target.checked ? true : undefined })} />{text}
        </label>
      ))}
      {warnings.filter(({ legId }) => legId === leg.id).map((warning, i) => (
        <p key={`${warning.code}-${i}`} className="mt-2 text-xs text-amber-400">{legWarningText(warning)}</p>
      ))}
    </>
  );
}
