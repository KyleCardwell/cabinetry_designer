import { Group, Rect } from 'react-konva';
import { wallRectToScreen } from '../canvas/transform.js';
import { neighborProfiles } from '../model/neighborProfiles.js';

const MOLDING_STYLES = {
  toeKick: { fill: '#111827', opacity: 1, stroke: '#334155' },
  topMold: { fill: '#94a3b8', opacity: 0.55, stroke: '#cbd5e1' },
  crown: { fill: '#e2e8f0', opacity: 0.5, stroke: '#f8fafc' },
};

export default function NeighborProfiles({ room, wall, settings, transform }) {
  return neighborProfiles(room, wall, settings).map((profile) => (
    <Group key={profile.key} listening={false}>
      <Rect {...wallRectToScreen(profile, transform)} stroke="#64748b" strokeWidth={1} />
      {profile.moldings.map((molding) => (
        <Rect
          key={molding.kind}
          {...wallRectToScreen({
            x: profile.x,
            z: molding.z,
            width: profile.width,
            height: molding.height,
          }, transform)}
          {...MOLDING_STYLES[molding.kind]}
          strokeWidth={1}
          listening={false}
        />
      ))}
    </Group>
  ));
}
