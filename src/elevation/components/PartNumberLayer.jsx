import { Group } from 'react-konva';
import { wallBadgeGroups } from '../model/partNumbers.js';
import MoldingBadges from './MoldingBadges.jsx';
import PartNumberBadges from './PartNumberBadges.jsx';

export default function PartNumberLayer({
  room,
  wall,
  settings,
  partNumbers,
  transform,
}) {
  if (!partNumbers) return null;

  return (
    <Group listening={false}>
      {wallBadgeGroups(room, wall, settings).map((group) => (
        <PartNumberBadges
          key={group.key}
          pieces={group.pieces}
          numbers={partNumbers.byKey}
          overrideKeys={partNumbers.overrideKeys}
          transform={transform}
          lift={group.lift}
        />
      ))}
      <MoldingBadges
        room={room}
        wall={wall}
        settings={settings}
        partNumbers={partNumbers}
        transform={transform}
      />
    </Group>
  );
}
