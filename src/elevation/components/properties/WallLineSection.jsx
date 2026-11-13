import { useDispatch } from 'react-redux';
import { canAttachWall, canMoveWallGroup, heldBy, wallAttachmentStatus } from '../../model/wallGroups.js';
import { wallLabel } from '../../model/topology.js';
import { setWallAttachment } from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import PanelSection from '../panel/PanelSection.jsx';
import Field from './Field.jsx';

const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const POINTS = [['left', 'Left end'], ['center', 'Centre'], ['right', 'Right end']];

/** Wall attachments always use the stored wall's front frame, in either view. */
export default function WallLineSection({ room, wall }) {
  const dispatch = useDispatch();
  if (!canMoveWallGroup(room, wall.id).ok) return null;
  const held = heldBy(room, wall.id);
  if (held && held.wall.id !== wall.id) {
    return <p className="mt-3 text-xs text-gray-500">{`Moves with ${wallLabel(room, held.wall)}, which is on ${held.line.label}.`}</p>;
  }

  const attach = held?.attach;
  const status = wallAttachmentStatus(room, wall.id);
  const lines = (room.roomLines ?? []).filter((line) => line.id === attach?.lineId
    || canAttachWall(room, wall.id, line.id).ok);
  const update = (attachment) => dispatch(setWallAttachment({ wallId: wall.id, attach: attachment }));

  return (
    <PanelSection id="wall.line" title="Line" level={2}>
      <Field label="Line">
        <select value={attach?.lineId ?? ''} aria-label="Wall layout line" className={SELECT_CLASS}
          onChange={(event) => update(event.target.value
            ? { lineId: event.target.value, at: 'center', offset: 0 } : null)}>
          <option value="">None</option>
          {lines.map((line) => <option key={line.id} value={line.id}>{line.label}</option>)}
        </select>
      </Field>
      {attach && status && (
        <>
          <div className="mt-2.5" role="group" aria-label="At">
            <p className="mb-1 text-xs text-gray-400">At</p>
            <div className="grid grid-cols-3 overflow-hidden rounded border border-gray-700">
              {POINTS.map(([at, label]) => (
                <button key={at} type="button" aria-pressed={attach.at === at}
                  onClick={() => update({ ...attach, at })}
                  className={`px-2 py-2 text-xs font-medium transition-colors ${attach.at === at
                    ? 'bg-blue-600 text-white' : 'bg-gray-900/45 text-gray-400 hover:bg-gray-700'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2.5">
            <Field label={`Offset from ${status.line.label}`} tag="+ = front elevation's right">
              <InchInput value={attach.offset} aria-label="Wall line offset" onCommit={(offset) => {
                if (!Number.isFinite(offset)) return false;
                update({ ...attach, offset });
                return true;
              }} />
            </Field>
          </div>
          {!status.square && <p className="mt-2 text-xs text-amber-300">{`${status.line.label} isn't square to ${wallLabel(room, wall)}; ${wallLabel(room, wall)} stays where it is.`}</p>}
        </>
      )}
    </PanelSection>
  );
}
