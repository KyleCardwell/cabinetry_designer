import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { v4 as uuid } from 'uuid';
import CoordInput from '../../../library/profileEditor/CoordInput.jsx';
import { legPreset } from '../../model/legs.js';
import { addRunLegs } from '../../store/elevationSlice.js';
import Field from './Field.jsx';
import { LEG_SELECT_CLASS, LegHeightFields, LegShapeSelect, LegSitsOnSelect, liveLegShapes } from './LegRow.jsx';

export default function AddLegsRow({ room, wall, run, settings }) {
  const dispatch = useDispatch();
  const [preset, setPreset] = useState('four');
  const [leaveOut, setLeaveOut] = useState('RB');
  const [pickedShape, setShape] = useState('');
  const [height, setHeight] = useState('full');
  const [sitsOn, setSitsOn] = useState(undefined);
  const [proud, setProud] = useState(0);
  const [backOffset, setBackOffset] = useState(0);
  const shapes = liveLegShapes(settings);
  const shapeId = shapes.some(({ id }) => id === pickedShape) ? pickedShape : shapes[0]?.id ?? '';

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
          </select>
        </Field>
        {preset === 'three' && <Field label="Leave out">
          <select aria-label="Add legs Leave out" value={leaveOut} onChange={(event) => setLeaveOut(event.target.value)} className={LEG_SELECT_CLASS}>
            <option value="LF">Left front</option><option value="LB">Left back</option>
            <option value="RF">Right front</option><option value="RB">Right back</option>
          </select>
        </Field>}
        <LegShapeSelect settings={settings} value={shapeId} label="Add legs Shape" onChange={setShape} />
        <LegHeightFields value={height} fullHeight={run.z + run.height} label="Add legs Height" onChange={setHeight} />
        <LegSitsOnSelect value={sitsOn} label="Add legs Sits on" onChange={setSitsOn} />
        <Field label="Proud">
          <CoordInput aria-label="Add legs Proud" value={proud} onCommit={setProud} />
        </Field>
        <Field label="Back offset">
          <CoordInput aria-label="Add legs Back offset" value={backOffset} onCommit={setBackOffset} />
        </Field>
      </div>
      {!shapeId && <p className="text-xs text-gray-500">Make a leg in Library → Shapes first.</p>}
      <button type="button" disabled={!shapeId} onClick={() => {
        if (!shapeId) return;
        dispatch(addRunLegs({ roomId: room.id, wallId: wall.id, runId: run.id,
          legs: legPreset(preset, { shapeId, height, sitsOn, proud, backOffset, leaveOut }, () => `lg_${uuid()}`) }));
      }} className="w-full rounded bg-gray-700 px-3 py-2 text-sm font-medium text-gray-100 hover:bg-gray-600 disabled:opacity-40">Add</button>
    </div>
  );
}
