import { useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { cornerEnd } from '../../model/cornerEnd.js';
import { runFaceLayouts } from '../../model/faceLayouts.js';
import { partNumbers } from '../../model/partNumbers.js';
import { wallLabel } from '../../model/topology.js';
import { formatInches } from '../../model/units.js';
import { wallSideOf } from '../../model/wallSides.js';
import { setActiveWall, setActiveWallSide, setSelection } from '../../store/elevationSlice.js';
import WarningsList from './WarningsList.jsx';

const DOORS = { equal: 'Equal', a_long: 'Leg A long', b_long: 'Leg B long' };
const FACES = { door: 'Door', panel: 'Panel' };
const doorWidths = (faces = []) => faces.filter(({ type }) => ['door', 'pair_door'].includes(type))
  .map(({ width }) => formatInches(width)).join(', ') || '—';

export default function CornerLegProperties({ room, ownerWall, ownerRun, side, settings }) {
  const dispatch = useDispatch();
  const corner = useMemo(() => cornerEnd(room, ownerWall, ownerRun, side, settings),
    [room, ownerWall, ownerRun, side, settings]);
  const entry = useMemo(() => runFaceLayouts(room, ownerWall, ownerRun, settings).get(corner.columnId),
    [room, ownerWall, ownerRun, settings, corner.columnId]);
  const numbers = useMemo(() => partNumbers(room, settings), [room, settings]);
  const label = wallLabel(room, ownerWall);
  const widthsA = doorWidths(entry?.faces);
  const widthsB = doorWidths(entry?.cornerReturn?.legB?.faces);
  const { returnSide, faceLayout } = corner;
  const rows = [
    ['Part', numbers.byKey.get(corner.columnId) ?? '—'],
    ['Legs', `${formatInches(corner.legA)} × ${formatInches(corner.legB)}`],
    ['Depths', `${formatInches(corner.depthA)} / ${formatInches(corner.depthB)}`],
    ['Return side', returnSide.type === 'none' ? 'None'
      : `${returnSide.type === 'filler' ? 'Filler' : 'End panel'} ${formatInches(returnSide.width)}`],
    ...(corner.kind === 90 ? [
      ['Doors', DOORS[corner.doors]],
      ['Leg B face', FACES[ownerRun.ends[side].corner?.legBFace] ?? 'Same as leg A'],
    ] : []),
    ['Door widths', corner.kind === 45 || (widthsA === '—' && widthsB === '—')
      ? widthsA : `Leg A ${widthsA} · leg B ${widthsB}`],
    ['Shows', faceLayout
      ? `${formatInches(faceLayout.shown.a)} on ${label} · ${formatInches(faceLayout.shown.b)} here` : '—'],
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-300">{`Corner ${corner.kind} on ${label}`}</h3>
      <dl className="space-y-2 text-xs">
        {rows.map(([name, value]) => (
          <div key={name} className="flex justify-between gap-3">
            <dt className="shrink-0 text-gray-400">{name}</dt>
            <dd className="text-right text-gray-300">{value}</dd>
          </div>
        ))}
      </dl>
      <WarningsList layout={{ errors: [], warnings: corner.warnings }} />
      <button type="button"
        className="w-full rounded bg-blue-700 px-3 py-2 text-sm text-white hover:bg-blue-600"
        onClick={() => {
          dispatch(setActiveWall(ownerWall.id));
          if (wallSideOf(ownerRun) === 'back') dispatch(setActiveWallSide('back'));
          dispatch(setSelection({ runId: ownerRun.id, pieceId: corner.columnId }));
        }}>
        {`Edit on ${label}`}
      </button>
    </div>
  );
}
