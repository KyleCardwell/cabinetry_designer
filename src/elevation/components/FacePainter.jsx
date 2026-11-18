import { Fragment } from 'react';
import { Group, Line, Rect, Shape } from 'react-konva';
import { screenPartStyle } from '../canvas/screenPartStyle.js';
import { wallRectToScreen, wallToScreen } from '../canvas/transform.js';
import DoorDetails from './DoorDetails.jsx';
import Hatch from './Hatch.jsx';
import LegShapes from './LegShapes.jsx';
import Pulls from './Pulls.jsx';
import SwingMarks from './SwingMarks.jsx';
import { outlineGeometry, outlinePath } from './outlinePath.js';

function partGeometry(part, transform) {
  const rect = wallRectToScreen(part, transform);
  const traceOutline = part.outline ? outlinePath(part.outline, transform) : null;
  const trace = (context) => {
    if (traceOutline) traceOutline(context);
    else {
      context.beginPath();
      context.rect(rect.x, rect.y, rect.width, rect.height);
    }
    for (const hole of part.holes ?? []) {
      const opening = wallRectToScreen(hole, transform);
      context.rect(opening.x, opening.y, opening.width, opening.height);
    }
  };
  const geometry = part.holes?.length ? {
    fillRule: 'evenodd',
    sceneFunc(context, shape) {
      trace(context);
      context.fillStrokeShape(shape);
    },
  } : part.outline ? outlineGeometry(part.outline, transform) : rect;
  return { rect, geometry, clipFunc: (context) => { trace(context); return ['evenodd']; } };
}

/** Filled parts and their attached details in the model's back-to-front order. */
export default function FacePainter({ entries, transform, after }) {
  return (
    <Group listening={false}>
      {entries.map(({ part, doorDetail, pulls, swingMarks, legLoops }) => {
        const { hatch, ...style } = screenPartStyle(part);
        const { rect, geometry, clipFunc } = partGeometry(part, transform);
        const PartShape = part.outline || part.holes?.length ? Shape : Rect;
        return (
          <Fragment key={part.id}>
            {part.kind === 'leg' ? (
              <LegShapes legs={[{ leg: part, outlines: legLoops.map(({ closed, points }) => ({
                closed, outline: points,
              })) }]} transform={transform} listening={false} />
            ) : (
              <PartShape {...geometry} {...style} fillEnabled={style.fill !== null} />
            )}
            {hatch && (
              <Group clipFunc={clipFunc}>
                <Hatch rect={rect} />
              </Group>
            )}
            {(part.lines ?? []).map((line, index) => {
              const from = wallToScreen({ x: line.x1, z: line.z1 }, transform);
              const to = wallToScreen({ x: line.x2, z: line.z2 }, transform);
              return <Line key={`line:${index}`} points={[from.x, from.y, to.x, to.y]}
                stroke={style.stroke} strokeWidth={0.5} />;
            })}
            {after?.(part)}
            {doorDetail && (
              <DoorDetails parts={[{
                ...part, key: part.id, openings: doorDetail.openings ?? [],
                lines: doorDetail.profileLines ?? [], miters: doorDetail.miters ?? [],
                label: doorDetail.tag,
              }]} warnings={[]} transform={transform} showDetails showTags={Boolean(doorDetail.tag)} />
            )}
            <SwingMarks marks={swingMarks} transform={transform} />
            <Pulls pulls={pulls} transform={transform} />
          </Fragment>
        );
      })}
    </Group>
  );
}
