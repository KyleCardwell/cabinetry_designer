import { useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { teamDoorStyle } from '../../model/doorStyles.js';
import { frameLegButts } from '../../model/frameLegButts.js';
import { runScene } from '../../model/runScene.js';
import { wallEndPanelAt, wallViewForRun } from '../../model/wallSides.js';
import { setWallEndPanel } from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import { autoInchProps } from '../autoInchProps.js';
import Field from './Field.jsx';

const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';

/**
 * A wall end panel's width and, beside a face frame run (SPEC-36.2.1) or a back panel run (SPEC-43), how that run meets it.
 */
export default function WallEndPanelFields({
  room, wall, endpoint, panel, label, framed, settings,
}) {
  const dispatch = useDispatch();
  const legCoversJoint = useMemo(() => {
    if (!room || !framed) return false;
    return wall.runs.some((run) => {
      if (!run._frame) return false;
      const view = wallViewForRun(wall, run);
      const side = ['left', 'right'].find((edge) =>
        run._frame.wallPanels?.[edge]
        && wallEndPanelAt(room, view, edge, settings)?.endpoint === endpoint);
      if (!side) return false;
      return runScene(room, view, run, settings).frames.regions.some((region) => {
        if (region.legButts?.some((joint) => joint.wall && joint.side === side)) return true;
        const covered = region.wallPanels?.find((joint) => joint.side === side);
        return covered && Boolean(frameLegButts(room, view, run, settings, {
          [side]: { x: covered.x, width: covered.width, z: region.z, height: region.height },
        })[side]);
      });
    });
  }, [room, wall, endpoint, framed, settings]);
  const update = (changes) => dispatch(setWallEndPanel({
    wallId: wall.id,
    endpoint,
    panel: { width: panel.width ?? null, frame: panel.frame ?? null, ...changes },
  }));

  return (
    <div className="space-y-2.5">
      <Field label="Width">
        <InchInput
          value={panel.width}
          {...autoInchProps({
            auto: wall._endPanelThickness?.[endpoint] ?? teamDoorStyle(settings).thickness, quoted: true,
            onCommit: (width) => update({ width }) })}
          aria-label={`${label} panel width`}
        />
      </Field>
      {framed && <>
        <Field label="Joint">
          <select
            value={panel.frame ?? 'auto'}
            onChange={(event) => update({ frame: event.target.value === 'auto' ? null : event.target.value })}
            aria-label={`${label} panel joint`}
            className={SELECT_CLASS}
          >
            <option value="auto">Auto</option>
            <option value="miter">Mitered (frame or back panel covers the edge)</option>
            <option value="butt">Butted (dies into the panel)</option>
          </select>
        </Field>
        {legCoversJoint && <p className="mt-1.5 text-xs text-gray-500">
          A leg covers this joint: Auto butts the stile into the end panel.
        </p>}
      </>}
    </div>
  );
}
