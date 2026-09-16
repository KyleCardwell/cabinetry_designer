import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Layer, Rect, Stage } from 'react-konva';
import { fitWallToViewport } from '../canvas/transform.js';
import RunGroup from './RunGroup.jsx';
import WallFrame from './WallFrame.jsx';

export default function ElevationCanvas({ wall, settings, fitRequest = 0 }) {
  const containerRef = useRef(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const updateSize = ({ width, height }) => {
      const next = {
        width: Math.max(0, Math.floor(width)),
        height: Math.max(0, Math.floor(height)),
      };
      setViewport((current) => (
        current.width === next.width && current.height === next.height ? current : next
      ));
    };

    const initial = container.getBoundingClientRect();
    updateSize(initial);

    const observer = new ResizeObserver((entries) => {
      if (entries[0]) updateSize(entries[0].contentRect);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const transform = useMemo(() => (
    wall && viewport.width > 0 && viewport.height > 0
      ? fitWallToViewport(wall, viewport)
      : null
  ), [fitRequest, viewport, wall]);

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-gray-900">
      {!wall && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-500">
          Add a wall to begin.
        </div>
      )}
      {wall && transform && (
        <Stage width={viewport.width} height={viewport.height}>
          <Layer listening={false}>
            <Rect width={viewport.width} height={viewport.height} fill="#111827" />
            <WallFrame wall={wall} transform={transform} />
          </Layer>
          <Layer>
            {wall.runs.map((run) => (
              <RunGroup
                key={run.id}
                run={run}
                settings={settings}
                transform={transform}
              />
            ))}
          </Layer>
        </Stage>
      )}
    </div>
  );
}
