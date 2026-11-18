import { Group } from 'react-konva';
import { useMemo } from 'react';
import { placeScreenPartBadges } from '../canvas/partNumberLayout.js';
import MoldingBadges from './MoldingBadges.jsx';
import PartNumberBadges from './PartNumberBadges.jsx';

export default function PartNumberLayer({
  room,
  wall,
  settings,
  partNumbers,
  transform,
}) {
  const ppi = transform.scale;
  const badges = useMemo(
    () => placeScreenPartBadges(room, wall, settings, partNumbers, ppi),
    [room, wall, settings, partNumbers, ppi],
  );
  if (!partNumbers) return null;

  return (
    <Group listening={false}>
      <PartNumberBadges
        badges={badges.parts}
        overrideKeys={partNumbers.overrideKeys}
        transform={transform}
      />
      <MoldingBadges badges={badges.moldings} transform={transform} />
    </Group>
  );
}
