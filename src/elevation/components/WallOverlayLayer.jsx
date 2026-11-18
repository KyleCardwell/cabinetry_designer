import { Layer } from 'react-konva';
import ElevationAlignmentGuides from './ElevationAlignmentGuides.jsx';
import NeighborReturns from './NeighborReturns.jsx';
import { PickOutline } from './SelectionPicker.jsx';
import { RecessOutline } from './RecessShapes.jsx';

export default function WallOverlayLayer({
  room,
  wall,
  settings,
  transform,
  combinedFaces,
  activeKey,
  selection,
  hovered,
  alignmentGuides,
  viewport,
}) {
  return (
          <Layer listening={false}>
            <NeighborReturns
              room={room}
              wall={wall}
              settings={settings}
              transform={transform}
              selection={selection}
              shapes={combinedFaces?.get(activeKey).shapes}
            />
            {selection.recessId && (
              <RecessOutline wall={wall} transform={transform} recessId={selection.recessId} />
            )}
            <PickOutline candidate={hovered} transform={transform} />
            <ElevationAlignmentGuides
              guides={alignmentGuides}
              transform={transform}
              width={viewport.width}
              height={viewport.height}
            />
          </Layer>
  );
}
