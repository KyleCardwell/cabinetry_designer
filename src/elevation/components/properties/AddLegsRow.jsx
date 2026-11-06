import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { v4 as uuid } from 'uuid';
import CoordInput from '../../../library/profileEditor/CoordInput.jsx';
import { legPresetEnds } from '../../model/endLegs.js';
import { applyRunLegPreset } from '../../store/elevationSlice.js';
import Field from './Field.jsx';
import { LEG_SELECT_CLASS, LegHeightFields, LegShapeSelect, LegSitsOnSelect, liveLegShapes } from './LegRow.jsx';

export default function AddLegsRow({ room, wall, run, settings }) {
  const dispatch = useDispatch();
  const [preset, setPreset] = useState('four');
  const [leaveOut, setLeaveOut] = useState('RB');
  const [pickedShape, setShape] = useState(undefined);
  const [height, setHeight] = useState('full');
  const [sitsOn, setSitsOn] = useState(undefined);
  const [fit, setFit] = useState(undefined);
  const [proud, setProud] = useState(0);
  const [backOffset, setBackOffset] = useState(0);
  const shapes = liveLegShapes(settings);
  const shapeId = pickedShape === '' || shapes.some(({ id }) => id === pickedShape) ? pickedShape : shapes[0]?.id ?? '';

  return (
    <div aria-label="Add legs" className="space-y-2 rounded border border-gray-700 p-3">
      <p className="text-xs font-semibold text-gray-300">Add legs</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Preset">
          <select aria-label="Add legs Preset" value={preset} onChange={(event) => setPreset(event.target.value)} className={LEG_SELECT_CLASS}>
            <option value="four">Four corners</option>
            <option value="front">Front two</option>
            <option value="three">Three</option>
            <option value="left">Free end left</option>
            <option value="right">Free end right</option>
            <option value="one">One leg (placed by hand)</option>
          </select>
        </Field>
        {preset === 'three' && <Field label="Leave out">
          <select aria-label="Add legs Leave out" value={leaveOut} onChange={(event) => setLeaveOut(event.target.value)} className={LEG_SELECT_CLASS}>
            <option value="LF">Left front</option><option value="LB">Left back</option>
            <option value="RF">Right front</option><option value="RB">Right back</option>
          </select>
        </Field>}
        <LegShapeSelect settings={settings} value={shapeId} label="Add legs Shape"
          onChange={(choice) => setShape(choice.shapeId ?? '')} />
        <LegHeightFields value={height} fullHeight={run.z + run.height} label="Add legs Height" onChange={setHeight} />
        <LegSitsOnSelect value={sitsOn} label="Add legs Sits on" onChange={setSitsOn} />
        <Field label="Fit">
          <select aria-label="Add legs Fit" value={fit ?? ''} onChange={(event) => setFit(event.target.value || undefined)}
            className={LEG_SELECT_CLASS}>
            <option value="">Nothing</option>
            <option value="panel">Panel between the legs</option>
            <option value="filler">Filler behind the front leg</option>
          </select>
        </Field>
        <Field label="Proud">
          <CoordInput aria-label="Add legs Proud" value={proud} onCommit={setProud} />
        </Field>
        <Field label="Back offset">
          <CoordInput aria-label="Add legs Back offset" value={backOffset} onCommit={setBackOffset} />
        </Field>
      </div>
      <button type="button" onClick={() => {
        dispatch(applyRunLegPreset({ roomId: room.id, wallId: wall.id, runId: run.id,
          ...legPresetEnds(preset, { ...(shapeId ? { shapeId } : { square: {} }), height, sitsOn, fit, proud, backOffset, leaveOut }, () => `lg_${uuid()}`) }));
      }} className="w-full rounded bg-gray-700 px-3 py-2 text-sm font-medium text-gray-100 hover:bg-gray-600">Apply</button>
      <p className="text-xs text-gray-500">Corner presets set the run&apos;s ends (edit them under Ends). One leg adds a leg placed by hand.</p>
    </div>
  );
}
