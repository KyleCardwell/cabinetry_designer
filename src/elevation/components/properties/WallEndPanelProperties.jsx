import { useMemo } from 'react';
import { useDispatch } from 'react-redux';
import {
  formatInches, partNumbers, wallEndPanelFramed, wallEndPanelPartKey,
} from '../../model/index.js';
import { setWallEndPanel } from '../../store/elevationSlice.js';
import PartNumberField from './PartNumberField.jsx';
import WallEndPanelFields from './WallEndPanelFields.jsx';

/** A selected wall end panel (SPEC-36.2.1). `panel` is one entry of wallEndPanels. */
export default function WallEndPanelProperties({
  room, wall, panel, settings,
}) {
  const dispatch = useDispatch();
  const numbers = useMemo(() => partNumbers(room, settings), [room, settings]);
  const key = wallEndPanelPartKey(wall.id, panel.endpoint);
  const side = panel[wall.side ?? 'front'];
  const label = side.side === 'left' ? 'Left end' : 'Right end';
  const stored = wall.endPanels?.[panel.endpoint] ?? { width: null };

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        Wall end panel · {label}
      </h3>
      <PartNumberField
        roomId={room.id}
        partKey={key}
        autoNumber={numbers.byKey.get(key)}
        override={room.partNumberOverrides?.[key]}
        duplicate={numbers.warnings.some((warning) => warning.keys.includes(key))}
      />
      <p className="text-xs text-gray-300">
        {formatInches(panel.width)} × {formatInches(panel.top)} · {formatInches(side.depth)} deep on this side
      </p>
      <WallEndPanelFields
        wall={wall}
        endpoint={panel.endpoint}
        panel={stored}
        label={label}
        framed={wallEndPanelFramed(wall, panel)}
        settings={settings}
      />
      <button
        type="button"
        onClick={() => dispatch(setWallEndPanel({ wallId: wall.id, endpoint: panel.endpoint, panel: null }))}
        className="w-full rounded bg-red-900/70 px-3 py-2 text-sm text-red-100 hover:bg-red-800"
      >
        Remove panel
      </button>
    </div>
  );
}
