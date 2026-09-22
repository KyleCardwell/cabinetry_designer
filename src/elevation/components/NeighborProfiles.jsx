import { Rect } from 'react-konva';
import { wallRectToScreen } from '../canvas/transform.js';
import { neighborProfiles } from '../model/neighborProfiles.js';

export default function NeighborProfiles({ room, wall, settings, transform }) {
  return neighborProfiles(room, wall, settings).map((profile) => (
    <Rect
      key={profile.key}
      {...wallRectToScreen(profile, transform)}
      stroke="#475569"
      strokeWidth={1}
      dash={[4, 4]}
      listening={false}
    />
  ));
}
