import { useState } from 'react';
import { Group, Rect } from 'react-konva';
import { CURSORS, useCursorKeys } from '../canvas/cursor.js';
import { wallRectToScreen } from '../canvas/transform.js';
import { KIND_COLORS } from '../model/constants.js';
import { wallEndPanelSpans, wallEndPanels } from '../model/wallEndPanels.js';

function WallEndPanelShape({
  wall, panel, transform, selected, onSelect, cursor,
}) {
  const [hovered, setHovered] = useState(false);
  const cursorKeys = useCursorKeys(cursor);
  const side = panel[wall.side ?? 'front'];
  const cursorKey = `wall-end-panel:${panel.endpoint}`;
  const rect = (z, height) => wallRectToScreen({ x: side.x, z, width: panel.width, height }, transform);
  // A mitered face frame covers part of the panel (SPEC-36.2); hovered or selected, it all shows.
  const spans = hovered || selected ? [{ z: 0, height: panel.top }] : wallEndPanelSpans(wall, panel);

  return (
    <Group
      listening={Boolean(onSelect)}
      onMouseEnter={() => {
        setHovered(true);
        cursorKeys.request(cursorKey, CURSORS.select);
      }}
      onMouseLeave={() => {
        setHovered(false);
        cursorKeys.release(cursorKey);
      }}
      onClick={(event) => {
        event.cancelBubble = true;
        onSelect?.(panel.endpoint);
      }}
    >
      <Rect {...rect(0, panel.top)} fill="rgba(0, 0, 0, 0.001)" />
      {spans.map((span) => (
        <Rect
          key={span.z}
          {...rect(span.z, span.height)}
          fill={KIND_COLORS.end_panel}
          opacity={0.55}
          stroke={selected ? '#7dd3fc' : KIND_COLORS.end_panel}
          strokeWidth={selected ? 3 : 1}
          listening={false}
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
