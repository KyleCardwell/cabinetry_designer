import { memo } from 'react';
import {
  Group,
  Label,
  Rect,
  Tag,
  Text,
} from 'react-konva';
import { CURSORS, useCursorKeys } from '../canvas/cursor.js';
import { wallRectToScreen, wallToScreen } from '../canvas/transform.js';
import {
  followGlyphs,
  jointGlyphs,
  jointMembers,
  runShortLabel,
} from '../model/joints.js';

function JointMarkers({
  wall,
  transform,
  selectedRunId,
  onJointDragStart,
  onJointDragMove,
  onJointDragEnd,
  onUnjoin,
  hoveredGlyphId,
  setHoveredGlyphId,
  cursor,
}) {
  const cursorKeys = useCursorKeys(cursor);
  const stopEvent = (event) => {
    event.cancelBubble = true;
  };

  const jointMarkers = (wall.joints ?? []).map((joint) => {
    const members = jointMembers(wall, joint.id);
    const glyphs = jointGlyphs(wall, joint.id);
    const memberIds = new Set(members.map((member) => member.runId));
    const memberRuns = wall.runs.filter((run) => memberIds.has(run.id));
    if (memberRuns.length === 0) return null;

    const bottom = Math.min(...memberRuns.map((run) => run.z));
    const top = Math.max(...memberRuns.map((run) => run.z + run.height));
    const bounds = wallRectToScreen({
      x: joint.x,
      z: bottom,
      width: 0,
      height: top - bottom,
    }, transform);
    const selected = memberIds.has(selectedRunId);
    const hovered = glyphs.some(({ ownerRunId }) => (
      hoveredGlyphId === `${joint.id}:${ownerRunId}`
    ));
    const wallXFromHandle = (event) => (
      (event.target.x() - transform.offsetX) / transform.scale
    );

    return (
      <Group key={joint.id}>
        {hovered && memberRuns.map((run) => (
          <Rect
            key={`highlight:${run.id}`}
            {...wallRectToScreen(run, transform)}
            fillEnabled={false}
            stroke="#67e8f9"
            strokeWidth={2.5}
            listening={false}
          />
        ))}

        {selected && (
          <Rect
            x={bounds.x}
            y={bounds.y}
            offsetX={4}
            width={8}
            height={bounds.height}
            fill="#38bdf8"
            opacity={0.65}
            stroke="#bae6fd"
            strokeWidth={1}
            draggable
            dragBoundFunc={(position) => ({ x: position.x, y: bounds.y })}
            onMouseDown={(event) => {
              stopEvent(event);
              onJointDragStart(joint.id);
            }}
            onMouseUp={stopEvent}
            onClick={stopEvent}
            onMouseEnter={() => cursorKeys.request(joint.id, CURSORS.resizeX)}
            onMouseLeave={() => cursorKeys.release(joint.id)}
            onDragStart={(event) => {
              stopEvent(event);
            }}
            onDragMove={(event) => {
              stopEvent(event);
              onJointDragMove(joint.id, wallXFromHandle(event));
            }}
            onDragEnd={(event) => {
              stopEvent(event);
              const x = wallXFromHandle(event);
              event.target.position({ x: bounds.x, y: bounds.y });
              cursorKeys.request(joint.id, CURSORS.resizeX);
              onJointDragEnd(joint.id, x);
            }}
          />
        )}

        {glyphs.map((glyph) => {
          const point = wallToScreen({ x: joint.x, z: glyph.z }, transform);
          const glyphId = `${joint.id}:${glyph.ownerRunId}`;
          const member = members.find(({ runId }) => runId === glyph.ownerRunId);
          const ownerRun = wall.runs.find((run) => run.id === glyph.ownerRunId);
          const type = runShortLabel(ownerRun).split(' ')[0];
          const glyphHovered = hoveredGlyphId === glyphId;
          return (
            <Group key={glyphId}>
              <Text
                x={point.x - 12}
                y={point.y - 12}
                width={24}
                height={24}
                align="center"
                verticalAlign="middle"
                text="⛓"
                fontSize={18}
                fill="#67e8f9"
                listening={false}
              />
              <Rect
                x={point.x - 12}
                y={point.y - 12}
                width={24}
                height={24}
                fill="rgba(0,0,0,0.001)"
                onMouseDown={stopEvent}
                onMouseUp={stopEvent}
                onClick={(event) => {
                  stopEvent(event);
                  onUnjoin(glyph.ownerRunId, member.side);
                }}
                onMouseEnter={() => {
                  setHoveredGlyphId(glyphId);
                  cursorKeys.request(glyphId, CURSORS.select);
                }}
                onMouseLeave={() => {
                  setHoveredGlyphId(null);
                  cursorKeys.release(glyphId);
                }}
              />
              {glyphHovered && (
                <Label x={point.x} y={point.y - 12} listening={false}>
                  <Tag
                    fill="#0f172a"
                    stroke="#67e8f9"
                    strokeWidth={1}
                    cornerRadius={3}
                    pointerDirection="down"
                    pointerWidth={8}
                    pointerHeight={5}
                  />
                  <Text
                    text={`Joined edge — click to free the ${type}`}
                    fill="#e2e8f0"
                    fontSize={11}
                    padding={6}
                  />
                </Label>
              )}
            </Group>
          );
        })}
      </Group>
    );
  });

  const followMarkers = followGlyphs(wall).map((glyph) => {
    const point = wallToScreen({ x: glyph.x, z: glyph.z }, transform);
    const glyphId = `follow:${glyph.runId}:${glyph.side}`;
    const followerRun = wall.runs.find((run) => run.id === glyph.runId);
    const leaderRun = wall.runs.find((run) => run.id === glyph.leaderRunId);
    if (!followerRun || !leaderRun) return null;
    const followerType = runShortLabel(followerRun).split(' ')[0];
    const leaderType = runShortLabel(leaderRun).split(' ')[0];
    const glyphHovered = hoveredGlyphId === glyphId;
    return (
      <Group key={glyphId}>
        {glyphHovered && [followerRun, leaderRun].map((run) => (
          <Rect
            key={`highlight:${run.id}`}
            {...wallRectToScreen(run, transform)}
            fillEnabled={false}
            stroke="#67e8f9"
            strokeWidth={2.5}
            listening={false}
          />
        ))}
        <Text
          x={point.x - 12}
          y={point.y - 12}
          width={24}
          height={24}
          align="center"
          verticalAlign="middle"
          text="⛓"
          fontSize={18}
          fill="#67e8f9"
          listening={false}
        />
        <Rect
          x={point.x - 12}
          y={point.y - 12}
          width={24}
          height={24}
          fill="rgba(0,0,0,0.001)"
          onMouseDown={stopEvent}
          onMouseUp={stopEvent}
          onClick={(event) => {
            stopEvent(event);
            onUnjoin(glyph.runId, glyph.side);
          }}
          onMouseEnter={() => {
            setHoveredGlyphId(glyphId);
            cursorKeys.request(glyphId, CURSORS.select);
          }}
          onMouseLeave={() => {
            setHoveredGlyphId(null);
            cursorKeys.release(glyphId);
          }}
        />
        {glyphHovered && (
          <Label x={point.x} y={point.y - 12} listening={false}>
            <Tag
              fill="#0f172a"
              stroke="#67e8f9"
              strokeWidth={1}
              cornerRadius={3}
              pointerDirection="down"
              pointerWidth={8}
              pointerHeight={5}
            />
            <Text
              text={`Follows the ${leaderType} — click to free the ${followerType}`}
              fill="#e2e8f0"
              fontSize={11}
              padding={6}
            />
          </Label>
        )}
      </Group>
    );
  });

  return [...jointMarkers, ...followMarkers];
}

export default memo(JointMarkers);
