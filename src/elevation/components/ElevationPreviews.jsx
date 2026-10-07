import { Layer, Rect } from 'react-konva';
import { wallRectToScreen } from '../canvas/transform.js';
import { followersOf } from '../model/joints.js';
import DragPreview from './DragPreview.jsx';
import RunGroup from './RunGroup.jsx';

export default function ElevationPreviews({
  stretchPreview,
  settings,
  transform,
  dragPreview,
  wall,
}) {
  return (
    <>
      {stretchPreview && (
        <Layer listening={false}>
          {[...stretchPreview.runIds,
            ...followersOf(stretchPreview.wall, stretchPreview.runIds)].map((runId) => {
            const previewRun = stretchPreview.wall.runs.find((run) => run.id === runId);
            return previewRun ? (
              <RunGroup
                key={runId}
                run={previewRun}
                room={stretchPreview.room}
                wall={stretchPreview.wall}
                settings={settings}
                diagnostic={null}
                transform={transform}
                selectedRun={false}
                selectedPieceId={null}
                preview
              />
            ) : null;
          })}
        </Layer>
      )}
      {dragPreview && (
        <Layer listening={false}>
          {dragPreview.soffit ? (
            <Rect
              {...wallRectToScreen({
                x: dragPreview.soffit.x,
                z: dragPreview.soffit.bottomZ,
                width: dragPreview.soffit.width,
                height: wall.height - dragPreview.soffit.bottomZ,
              }, transform)}
              stroke="#60a5fa"
              strokeWidth={2}
              dash={[8, 6]}
            />
          ) : (
            <DragPreview
              run={dragPreview.run}
              valid={dragPreview.valid}
              transform={transform}
            />
          )}
        </Layer>
      )}
    </>
  );
}
