import { useMemo } from 'react';
import {
  formatInches, frameMembers, groupMembers, regionOpenings, runFaceLayouts,
} from '../../model/index.js';
import PartNumberField from './PartNumberField.jsx';

const MEMBER_LABELS = { stile: 'Stile', rail: 'Rail', mullion: 'Mullion' };

/** The face frame a cabinet sits in (SPEC-36.2): its part number, size and derived stiles and rails. */
export default function FrameSection({
  room, wall, run, layout, region, numbers, settings,
}) {
  const members = useMemo(() => {
    const faceLayouts = runFaceLayouts(room, wall, run, settings, layout);
    return frameMembers(region, regionOpenings(region, faceLayouts));
  }, [layout, region, room, run, settings, wall]);
  const groups = members ? groupMembers(members) : [];

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Face frame</h3>
      <PartNumberField
        roomId={room.id}
        partKey={region.id}
        autoNumber={numbers.byKey.get(region.id)}
        override={room.partNumberOverrides?.[region.id]}
        duplicate={numbers.warnings.some((warning) => warning.keys.includes(region.id))}
      />
      <p className="text-xs text-gray-300">
        {formatInches(region.width)} × {formatInches(region.height)}
      </p>
      {members === null ? (
        <p className="text-xs text-amber-300">These openings can&apos;t be cut into stiles and rails.</p>
      ) : (
        <ul className="space-y-1 rounded border border-gray-700 bg-gray-900/45 p-2 text-xs text-gray-300">
          {groups.map((group) => (
            <li key={`${group.kind}:${group.width}:${group.length}`} className="flex justify-between gap-2">
              <span>{group.count} × {MEMBER_LABELS[group.kind]}</span>
              <span className="tabular-nums">
                {formatInches(group.width)} × {formatInches(group.length)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-gray-500">Stiles run full height; rails fit between them. Derived, not saved.</p>
    </section>
  );
}
