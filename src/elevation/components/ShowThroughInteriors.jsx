import { Fragment, useMemo } from 'react';
import { Group, Line, Rect, Text } from 'react-konva';
import { wallRectToScreen, wallToScreen } from '../canvas/transform.js';
import { wallInteriors } from '../model/interiors.js';
import { glassMarkStrokePx } from '../model/glassMarks.js';
import { formatInches } from '../model/units.js';
import { placedAccessoryShape } from './InteriorShapes.jsx';

function interiorItem(item, transform, sections) {
  const rect = wallRectToScreen(item, transform);
  if (item.kind === 'accessory') {
    const path = item.key.split(':')[1];
    const section = sections?.find((section) => section.path === path);
    return placedAccessoryShape({
      shapeKey: item.key,
      box: item.height ? rect : null,
      line: item.height ? null : rect,
      rect: section ? wallRectToScreen(section, transform) : rect,
      text: item.label, color: '#94a3b8',
      drawing: item.drawing, transform,
    });
  }
  if (item.kind === 'spacer') {
    return <Rect key={item.key} {...rect} fill="#cbd5e1" opacity={0.5} listening={false} />;
  }
  const stroke = item.kind === 'rollout' ? '#e2e8f0' : '#94a3b8';
  if (!item.width || !item.height) {
    return <Line key={item.key} points={[rect.x, rect.y, rect.x + rect.width, rect.y + rect.height]}
      stroke={stroke} strokeWidth={0.75} listening={false} />;
  }
  const text = `RO ${formatInches(item.height).replace(/"$/, '')}`;
  return (
    <Fragment key={item.key}>
      <Rect {...rect} stroke={stroke} strokeWidth={item.kind === 'rollout' ? 1 : 0.75}
        fillEnabled={false} listening={false} />
      {item.kind === 'rollout' && rect.height >= 16 && rect.width >= text.length * 6 + 6 && (
        <Text {...rect} text={text} fontSize={10} fill={stroke}
          align="center" verticalAlign="middle" listening={false} />
      )}
    </Fragment>
  );
}

/** Non-interactive interiors clipped to the union of open faces and glass panels. */
export default function ShowThroughInteriors({ entries, transform, room, wall, settings }) {
  // Accessory labels use their actual section bounds, just as in the doors-off view.
  const interiors = useMemo(() => entries.some(({ items }) => items.some(({ kind }) => kind === 'accessory'))
    ? new Map(wallInteriors(room, wall.sideSource ?? wall, wall.side ?? 'front', settings)
      .map((entry) => [entry.itemId, entry.sections])) : new Map(), [entries, room, wall, settings]);
  return entries.map((entry) => (
    <Fragment key={entry.itemId}>
      <Group listening={false} clipFunc={(context) => {
        for (const window of entry.windows) {
          const rect = wallRectToScreen(window, transform);
          context.rect(rect.x, rect.y, rect.width, rect.height);
        }
      }}>
        {entry.items.map((item) => interiorItem(item, transform, interiors.get(entry.itemId)))}
      </Group>
      {entry.glass.map((glass) => (
        <Group key={glass.partId} listening={false}>
          {glass.openings.map((opening, index) => (
            <Rect key={`opening:${index}`} {...wallRectToScreen(opening, transform)}
              stroke="#e2e8f0" strokeWidth={1} fillEnabled={false} listening={false} />
          ))}
          {glass.marks.map((mark, index) => {
            const from = wallToScreen({ x: mark.x1, z: mark.z1 }, transform);
            const to = wallToScreen({ x: mark.x2, z: mark.z2 }, transform);
            return <Line key={`mark:${index}`} points={[from.x, from.y, to.x, to.y]}
              stroke="#e2e8f0" strokeWidth={glassMarkStrokePx(mark.weight, settings, transform)} listening={false} />;
          })}
        </Group>
      ))}
    </Fragment>
  ));
}
