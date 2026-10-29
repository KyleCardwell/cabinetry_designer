import { useDispatch, useSelector } from 'react-redux';
import { missingDoorDesigns } from '../model/doorDesigns.js';
import { missingDesignName } from '../../projects/roomText.js';
import { moveMissingDoorDesign } from '../store/elevationSlice.js';
import MissingCatalogRow from './MissingCatalogRow.jsx';

export function MissingDoorDesignRow({ room, designId, styles, readOnly }) {
  const dispatch = useDispatch();
  const designs = useSelector((state) => state.elevation.settings.doorDesigns);
  return MissingCatalogRow({
    canMove: true, readOnly,
    options: designs.map(({ id, code, vendor }) => ({ value: id, label: code + (vendor !== null ? ` · ${vendor}` : '') })),
    ariaLabel: `Move styles using ${designId} to`,
    onMove: (value) => dispatch(moveMissingDoorDesign({ roomId: room.id, designId, reassignTo: value })),
    message: <>
        {missingDesignName(designId)} isn&apos;t in the Library any more.{' '}
        {styles.length === 1 ? 'Style' : 'Styles'}{' '}
        <strong>{styles.map((style) => style.label).join(', ')}</strong>{' '}
        use it and draw as the built-in 5-piece until moved.
    </>,
  });
}

export default function MissingDoorDesignsNotice() {
  const { rooms, activeRoomId, settings, cloud } = useSelector((state) => state.elevation);
  const room = rooms.find((candidate) => candidate.id === activeRoomId) ?? null;
  if (!room) return null;

  const missing = missingDoorDesigns(room, settings.doorDesigns);
  if (missing.length === 0) return null;

  return (
    <div className="space-y-2 border-b border-amber-700 bg-amber-900/40 px-4 py-2 text-xs text-amber-100">
      {missing.map(({ designId, styles }) => (
        <MissingDoorDesignRow key={designId} room={room} designId={designId} styles={styles} readOnly={Boolean(cloud?.room?.readOnly)} />
      ))}
    </div>
  );
}
