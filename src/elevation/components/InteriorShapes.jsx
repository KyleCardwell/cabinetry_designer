import { Fragment, useRef } from 'react';
import { Group, Line, Rect, Text } from 'react-konva';
import { wallRectToScreen } from '../canvas/transform.js';
import { formatDimension, formatInches } from '../model/units.js';
import { dragDividerPosition, interiorDimensions } from '../model/interiors.js';

const SIZE_FONT = 10;
const SIZE_INSET = 3;

export default function InteriorShapes({
  entries,
  framedIds = null,
  drawerBoxes = [],
  shelves = new Map(),
  rollouts = new Map(),
  accessories = new Map(),
  drawnPieces,
  transform,
  selectedPieceId,
  interiorPath = null,
  interiorDivider = null,
  onSelectInterior,
  draggable = false,
  dragPreview,
  onPreviewDivider,
  onMoveDivider,
}) {
  const draggedRef = useRef(false);
  const selectedPath = interiorPath ?? 'r';
  const click = (interior) => (event) => {
    event.cancelBubble = true;
    if (draggedRef.current) return;
    onSelectInterior?.(interior);
  };
  return entries.map((entry) => {
    const piece = drawnPieces.find(({ id }) => id === entry.itemId);
    const clip = piece ? wallRectToScreen(piece, transform) : null;
    const selectable = selectedPieceId === entry.itemId;
    const dimensions = interiorDimensions(entry);
    return (
      <Group
        key={entry.itemId}
        clipX={clip?.x}
        clipY={clip?.y}
        clipWidth={clip?.width}
        clipHeight={clip?.height}
        onMouseDown={() => { draggedRef.current = false; }}
        onTouchStart={() => { draggedRef.current = false; }}
      >
        {entry.sections.map((section) => {
          const rect = wallRectToScreen(section, transform);
          const selected = selectable && (section.path === selectedPath
            || section.path.startsWith(`${selectedPath}.`));
          const text = `${formatDimension(section.width)} × ${formatDimension(section.height)}`;
          const showSize = selectable
            && rect.height >= SIZE_FONT + SIZE_INSET * 2
            && rect.width >= text.length * 6 + SIZE_INSET * 2;
          const accessory = accessories.get(entry.itemId)?.get(section.path);
          const labels = (accessory?.items ?? []).filter(({ accessory }) => accessory?.attachesTo === 'section')
            .map((item) => ({ ...item, text: `${item.qty > 1 ? `${item.qty} × ` : ''}${item.accessory.name}` }));
          const showAccessories = rect.height >= labels.length * SIZE_FONT + SIZE_INSET * 2
            && labels.every(({ text }) => rect.width >= text.length * 6 + SIZE_INSET * 2);
          return (
            <Fragment key={section.path}>
              <Rect
                {...rect}
                stroke={selected ? '#7dd3fc' : '#64748b'}
                strokeWidth={selected ? 2 : 1}
                fill={selectable ? 'rgba(0, 0, 0, 0.001)' : undefined}
                listening={selectable}
                onClick={selectable ? click({ path: section.path, divider: null }) : undefined}
              />
              {showAccessories && labels.map(({ index, text, warnings }, line) => (
                <Text key={`accessory:${section.path}:${index}`}
                  x={rect.x + SIZE_INSET} y={rect.y + SIZE_INSET + line * SIZE_FONT}
                  text={text} fontSize={SIZE_FONT}
                  fill={warnings.length || accessory.warnings.length ? '#f59e0b' : selected ? '#7dd3fc' : '#64748b'}
                  listening={false} />
              ))}
              {showSize && (
                <Text
                  x={rect.x + SIZE_INSET}
                  y={rect.y + rect.height - SIZE_FONT - SIZE_INSET}
                  text={text}
                  fontSize={SIZE_FONT}
                  fill={selected ? '#7dd3fc' : '#64748b'}
                  listening={false}
                />
              )}
            </Fragment>
          );
        })}
        {entry.sections.flatMap((section) => {
          const shelf = shelves.get(entry.itemId)?.get(section.path);
          const visible = shelf?.nosing?.height ?? shelf?.thickness;
          const rects = (shelf?.positions ?? []).map((z, index) => (
            <Rect
              key={`shelf:${section.path}:${index}`}
              {...wallRectToScreen({
                x: section.x + (section.width - shelf.width) / 2,
                z, width: shelf.width, height: visible,
              }, transform)}
              stroke="#94a3b8"
              strokeWidth={0.75}
              fillEnabled={false}
              listening={false}
            />
          ));
          // The selected cabinet labels the clear space below, between and above its shelves (information only).
          if (!selectable || !shelf?.gap) return rects;
          const label = formatDimension(shelf.gap);
          const labels = [shelf.zone.z, ...shelf.positions.map((z) => z + visible)].map((z, index) => {
            const rect = wallRectToScreen({ x: section.x, z, width: section.width, height: shelf.gap }, transform);
            return rect.height < SIZE_FONT || rect.width < label.length * 6 ? null : (
              <Text
                key={`shelf-gap:${section.path}:${index}`}
                {...rect}
                text={label}
                fontSize={SIZE_FONT}
                fill="#94a3b8"
                align="center"
                verticalAlign="middle"
                listening={false}
              />
            );
          });
          return [...rects, ...labels];
        })}
        {entry.sections.flatMap((section) => {
          const rollout = rollouts.get(entry.itemId)?.get(section.path);
          return (rollout?.rollouts ?? []).map((box) => {
            const rect = wallRectToScreen(box, transform);
            const text = `RO ${formatInches(box.height).replace(/"$/, '')}`;
            const color = box.warnings.length || rollout.warnings.some(({ index }) => index === undefined)
              ? '#f59e0b' : '#e2e8f0';
            const showHeight = rect.height >= SIZE_FONT + SIZE_INSET * 2
              && rect.width >= text.length * 6 + SIZE_INSET * 2;
            return (
              <Group key={`rollout:${section.path}:${box.index}`} listening={false}>
                {['left', 'right'].filter((side) => box.spacers[side] > 0
                  && !rollout.rollouts.slice(0, box.index).some((other) =>
                    other.column.x === box.column.x && other.column.width === box.column.width
                    && other.spacers[side] === box.spacers[side])).map((side) => (
                  <Rect key={side} {...wallRectToScreen({
                    x: side === 'left' ? box.column.x : box.column.x + box.column.width - box.spacers.right,
                    z: rollout.zone.z, width: box.spacers[side], height: rollout.top - rollout.zone.z,
                  }, transform)} fill="#cbd5e1" opacity={0.5} listening={false} />
                ))}
                <Rect {...rect} stroke={color} strokeWidth={1} listening={false} />
                {showHeight && (
                  <Text {...rect} text={text} fontSize={SIZE_FONT} fill={color}
                    align="center" verticalAlign="middle" listening={false} />
                )}
              </Group>
            );
          });
        })}
        {/* A face frame box is hidden behind its frame normally (SPEC-36.1); with the doors off its outline shows. */}
        {framedIds?.has(entry.itemId) && (
          <Rect
            key="box"
            {...wallRectToScreen(entry.box, transform)}
            stroke="#f8fafc"
            strokeWidth={1}
            fillEnabled={false}
            listening={false}
          />
        )}
        {(entry.partLines ?? []).map((line) => {
          const { x, y, width, height } = wallRectToScreen(line, transform);
          return (
            <Line
              key={`part:${line.part}`}
              points={[x, y, x + width, y + height]}
              stroke="#f8fafc"
              strokeWidth={1}
              listening={false}
            />
          );
        })}
        {entry.dividers.map((divider) => {
          const selected = selectable && divider.path === selectedPath
            && divider.index === interiorDivider;
          const dimension = dimensions.find(({ path, index }) => path === divider.path && index === divider.index);
          const rect = wallRectToScreen(divider, transform);
          const vertical = dimension.axis === 'vertical';
          const preview = dragPreview?.itemId === entry.itemId && dragPreview.key === dimension.key
            ? dragPreview.delta : { x: 0, z: 0 };
          const deltaFrom = (event) => ({
            x: vertical ? 0 : (event.target.x() - rect.x) / transform.scale,
            z: vertical ? (rect.y - event.target.y()) / transform.scale : 0,
          });
          return (
            <Rect
              key={`${divider.path}:${divider.index}`}
              {...rect}
              x={rect.x + preview.x * transform.scale}
              y={rect.y - preview.z * transform.scale}
              fill="#cbd5e1"
              opacity={0.9}
              stroke={selected ? '#7dd3fc' : '#1e293b'}
              strokeWidth={selected ? 2 : 1}
              listening={selectable}
              draggable={selectable && draggable}
              dragDistance={3}
              dragBoundFunc={(position) => vertical
                ? { x: rect.x, y: position.y } : { x: position.x, y: rect.y }}
              onDragStart={(event) => {
                event.cancelBubble = true;
                draggedRef.current = true;
              }}
              onDragMove={(event) => {
                event.cancelBubble = true;
                onPreviewDivider?.({ itemId: entry.itemId, key: dimension.key, delta: deltaFrom(event) });
              }}
              onDragEnd={(event) => {
                event.cancelBubble = true;
                const delta = deltaFrom(event);
                event.target.position({ x: rect.x, y: rect.y });
                onPreviewDivider?.(null);
                if (Math.abs(vertical ? delta.z : delta.x) * transform.scale < 3) {
                  onSelectInterior?.({ path: divider.path, divider: divider.index });
                  return;
                }
                const position = dragDividerPosition(dimension, delta);
                onMoveDivider?.({
                  runId: entry.runId, itemId: entry.itemId,
                  path: divider.path, index: divider.index, side: dimension.side,
                }, position.at);
              }}
              onClick={selectable ? click({ path: divider.path, divider: divider.index }) : undefined}
            />
          );
        })}
        {(drawerBoxes.find(({ itemId }) => itemId === entry.itemId)?.boxes ?? [])
          .filter((box) => box.height !== null).map((box) => {
            const rect = wallRectToScreen(box, transform);
            const label = box.kind === 'rot' ? 'ROT ' : box.kind === 'hamper' ? 'Hamper ' : '';
            const heightText = `${label}${formatInches(box.height).replace(/"$/, '')}`;
            const names = (box.accessories ?? []).filter(({ accessory }) => accessory?.attachesTo === 'drawer_box')
              .map(({ accessory, qty }) => `${qty > 1 ? `${qty} × ` : ''}${accessory.name}`);
            const fullText = names.length ? `${heightText} · ${names.join(', ')}` : heightText;
            const text = rect.width >= fullText.length * 6 + SIZE_INSET * 2 ? fullText : heightText;
            const color = box.warnings.length ? '#f59e0b' : '#e2e8f0';
            const showHeight = rect.height >= SIZE_FONT + SIZE_INSET * 2
              && rect.width >= text.length * 6 + SIZE_INSET * 2;
            return (
              <Group key={`drawer:${box.path}`} listening={false}>
                <Rect {...rect} stroke={color} strokeWidth={1} listening={false} />
                {showHeight && (
                  <Text
                    {...rect}
                    text={text}
                    fontSize={SIZE_FONT}
                    fill={color}
                    align="center"
                    verticalAlign="middle"
                    listening={false}
                  />
                )}
              </Group>
            );
          })}
      </Group>
    );
  });
}
