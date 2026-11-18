import { Group, Rect } from 'react-konva';
import { CURSORS, useCursorKeys } from '../canvas/cursor.js';
import { wallRectToScreen } from '../canvas/transform.js';
import { wallEndPanelReturns, wallEndPanels } from '../model/wallEndPanels.js';

function WallEndPanelShape({
  wall, panel, transform, selected, onSelect, cursor,
}) {
  const cursorKeys = useCursorKeys(cursor);
  const side = panel[wall.side ?? 'front'];
  const cursorKey = `wall-end-panel:${panel.endpoint}`;
  const rect = (z, height) => wallRectToScreen({ x: side.x, z, width: panel.width, height }, transform);
  return (
    <Group
      listening={Boolean(onSelect)}
      onMouseEnter={() => {
        cursorKeys.request(cursorKey, CURSORS.select);
      }}
      onMouseLeave={() => {
        cursorKeys.release(cursorKey);
      }}
      onClick={(event) => {
        event.cancelBubble = true;
        onSelect?.(panel.endpoint);
      }}
    >
      <Rect
        {...rect(panel.bottom, panel.top - panel.bottom)}
        fill="rgba(0, 0, 0, 0.001)"
        stroke={selected ? '#7dd3fc' : undefined}
        strokeWidth={3}
      />
      {/* A fitted panel's returns (SH7.6 step f); a click on one selects the panel. */}
      {wallEndPanelReturns(panel, wall.side ?? 'front').map((ret) => (
        <Rect
          key={`return-${ret.edge}`}
          {...wallRectToScreen({ x: ret.start, z: panel.bottom, width: ret.end - ret.start,
            height: panel.top - panel.bottom }, transform)}
          fill="rgba(0, 0, 0, 0.001)"
          stroke={selected ? '#7dd3fc' : undefined}
          strokeWidth={selected ? 3 : 1}
        />
      ))}
    </Group>
  );
}

export default function WallEndPanelShapes({
  room, wall, settings, transform, selectedEndpoint = null, onSelect, cursor,
}) {
  return wallEndPanels(room, wall, settings).map((panel) => (
    <WallEndPanelShape
      key={panel.endpoint}
      wall={wall}
      panel={panel}
      transform={transform}
      selected={selectedEndpoint === panel.endpoint}
      onSelect={onSelect}
      cursor={cursor}
    />
  ));
}
