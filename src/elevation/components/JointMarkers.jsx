import { memo } from 'react';
import {
  Group,
  Label,
  Rect,
  Tag,
  Text,
} from 'react-konva';
import { wallRectToScreen, wallToScreen } from '../canvas/transform.js';
import { jointMembers } from '../model/joints.js';

function JointMarkers({
  wall,
  transform,
  selectedRunId,
  onJointDragStart,
  onJointDragMove,
  onJointDragEnd,
  onDissolve,
  hoveredJointId,
  setHoveredJointId,
}) {
  const stopEvent = (event) => {
    event.cancelBubble = true;
  };

  const setCursor = (event, cursor) => {
    const stage = event.target.getStage();
    if (stage) stage.container().style.cursor = cursor;
  };

  return (wall.joints ?? []).map((joint) => {
    const memberIds = new Set(jointMembers(wall, joint.id).map((member) => member.runId));
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
    const middle = wallToScreen({ x: joint.x, z: (bottom + top) / 2 }, transform);
    const selected = memberIds.has(selectedRunId);
    const hovered = hoveredJointId === joint.id;
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
            onMouseDown={stopEvent}
            onMouseUp={stopEvent}
            onClick={stopEvent}
            onMouseEnter={(event) => setCursor(event, 'ew-resize')}
            onMouseLeave={(event) => setCursor(event, 'default')}
            onDragStart={(event) => {
              stopEvent(event);
              onJointDragStart(joint.id);
            }}
            onDragMove={(event) => {
              stopEvent(event);
              onJointDragMove(joint.id, wallXFromHandle(event));
            }}
            onDragEnd={(event) => {
              stopEvent(event);
              const x = wallXFromHandle(event);
              event.target.position({ x: bounds.x, y: bounds.y });
              setCursor(event, 'ew-resize');
              onJointDragEnd(joint.id, x);
            }}
          />
        )}

        <Text
          x={middle.x - 12}
          y={middle.y - 7}
          width={24}
          align="center"
          text="⛓"
          fontSize={12}
          fill="#67e8f9"
          onMouseDown={stopEvent}
          onMouseUp={stopEvent}
          onClick={(event) => {
            stopEvent(event);
            onDissolve(joint.id);
          }}
          onMouseEnter={(event) => {
            setHoveredJointId(joint.id);
            setCursor(event, 'pointer');
          }}
          onMouseLeave={(event) => {
            setHoveredJointId(null);
            setCursor(event, 'default');
          }}
        />
        {hovered && (
          <Label x={middle.x} y={middle.y - 12} listening={false}>
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
              text="Joined edge — click to disconnect"
              fill="#e2e8f0"
              fontSize={11}
              padding={6}
            />
          </Label>
        )}
      </Group>
    );
  });
}

export default memo(JointMarkers);
