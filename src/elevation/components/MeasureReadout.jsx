import { formatMeasure } from '../model/measure.js';

export default function MeasureReadout({ result, axisLabels, hover,
  hint = 'Click a corner, midpoint or edge · Shift: point on an edge · Esc: clear',
  className = 'bottom-3 left-3' }) {
  const prefix = result?.kind === 'point-line' ? 'Square to line'
    : result?.kind === 'lines' ? 'Between lines' : 'Distance';
  return (
    <div className={`pointer-events-none absolute ${className} rounded bg-gray-950/90 px-3 py-2 text-xs text-pink-50`}>
      {result && <>
        <div>{prefix} {formatMeasure(result.distance)}</div>
        {result.kind === 'points' && result.dx > 1e-3 && result.dy > 1e-3 && (
          <div>{axisLabels.x} {formatMeasure(result.dx)} · {axisLabels.y} {formatMeasure(result.dy)}</div>
        )}
        {result.angle !== undefined && (
          <div>Lines not parallel ({Math.round(result.angle * 10) / 10}°) — measured point to point</div>
        )}
      </>}
      {hover?.kind === 'arc' && <div>Arc R {formatMeasure(hover.arc.r)}</div>}
      <div className="text-gray-400">{hint}</div>
    </div>
  );
}
