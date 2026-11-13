import { useEffect, useId, useRef, useState } from 'react';
import { formatInches } from '../model/units.js';
import { sectionProfileBounds, sectionProfileSvgPath } from '../model/sectionProfiles.js';
import { gappedLine } from '../canvas/gappedLine.js';
import { useMeasure } from '../canvas/measureState.js';
import { sectionMeasureGeometry } from '../model/measure.js';
import MeasureReadout from './MeasureReadout.jsx';
import MeasureSvg from './MeasureSvg.jsx';

const MEASURE_HINT = 'Click a corner, midpoint, centre or edge · Shift: point on an edge · Esc: clear';

/**
 * Measuring layer over one section. It only exists while measuring, so the measure hooks never run
 * for a plain section. `frame` maps section inches (y-up) to svg pixels and back.
 */
export function SectionMeasure({ section, frame, viewport, onDone }) {
  const { scale, minX, maxX, minY, maxY } = frame;
  const px = (value) => viewport.width / 2 + (value - (minX + maxX) / 2) * scale;
  const py = (value) => viewport.height / 2 - (value - (minY + maxY) / 2) * scale;
  const measure = useMeasure({
    active: true,
    geometry: sectionMeasureGeometry(section),
    tolerance: 10 / scale,
    resetKey: JSON.stringify(section),
  });
  const { escape } = measure;

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      if (!escape()) onDone();
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [escape, onDone]);

  const world = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    return {
      x: (minX + maxX) / 2 + (sx - viewport.width / 2) / scale,
      y: (minY + maxY) / 2 - (sy - viewport.height / 2) / scale,
    };
  };

  return (
    <>
      <svg
        viewBox={`0 0 ${viewport.width} ${viewport.height}`}
        preserveAspectRatio="xMidYMid meet"
        aria-label="Measure section"
        className="absolute inset-0 h-64 w-full cursor-crosshair"
        onPointerMove={(event) => measure.move(world(event), event.shiftKey)}
        onPointerLeave={measure.leave}
        onClick={(event) => { if (event.button === 0) measure.click(world(event), event.shiftKey); }}
        onContextMenu={(event) => { event.preventDefault(); measure.cancelFirst(); }}
      >
        <MeasureSvg first={measure.first} hover={measure.hover} measures={measure.measures} preview={measure.preview}
          toScreen={({ x, y }) => ({ x: px(x), y: py(y) })} />
      </svg>
      <MeasureReadout result={measure.preview ?? measure.measures.at(-1)?.result} axisLabels={{ x: 'Across', y: 'Deep' }}
        hover={measure.hover} hint={MEASURE_HINT} className="bottom-2 left-2" />
    </>
  );
}

export default function SectionSvg({ section, dimensions, style, label }) {
  const maskId = useId().replace(/:/g, '');
  const svgRef = useRef(null);
  const [viewport, setViewport] = useState({ width: 400, height: 256 });
  const [measuring, setMeasuring] = useState(false);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setViewport({ width, height });
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  const bounds = [section.body, ...section.placed.map(({ geometry }) => geometry)]
    .map((geometry) => sectionProfileBounds({ geometry }));
  const minX = Math.min(...bounds.map((b) => b.minX));
  const maxX = Math.max(...bounds.map((b) => b.maxX));
  const minY = Math.min(0, ...bounds.map((b) => b.minY));
  const maxY = Math.max(0, ...bounds.map((b) => b.maxY));
  const fontSize = 12;
  const textWidth = (value) => formatInches(value).length * fontSize * 0.65;
  const gutter = Math.max(48, ...Object.values(dimensions).flat().map(({ value }) => textWidth(value))) + 30;
  // Work in viewport pixels so type, ticks and gaps keep their size as the section changes.
  const scale = Math.min(
    Math.max(1, viewport.width - 2 * gutter) / (maxX - minX),
    Math.max(1, viewport.height - 144) / (maxY - minY),
  );
  const px = (value) => viewport.width / 2 + (value - (minX + maxX) / 2) * scale;
  const py = (value) => viewport.height / 2 - (value - (minY + maxY) / 2) * scale;
  const leftX = px(minX) - 20;

  const horizontalChain = (chain, side, row = 0) => {
    const direction = side === 'above' ? -1 : 1;
    const lineY = py(side === 'above' ? maxY : minY) + direction * (20 + row * 32);
    const measuredY = py(side === 'above' ? 0 : -style.thickness);
    const lanes = [];
    return (
      <g aria-label={`${row === 0 ? side : 'overall'} dimensions`}>
        {chain.map(({ label, from, to, value }, index) => {
          const start = px(from);
          const end = px(to);
          const labelWidth = textWidth(value);
          const outside = (to - from) * scale < labelWidth + 16;
          const anchor = outside ? (index === 0 ? 'end' : 'start') : 'middle';
          const labelX = outside ? (index === 0 ? start - 6 : end + 6) : (start + end) / 2;
          const labelLeft = labelX - (anchor === 'end' ? labelWidth : anchor === 'middle' ? labelWidth / 2 : 0);
          const labelRight = labelLeft + labelWidth;
          // Adjacent short segments may need separate rows, even with labels outside their spans.
          let lane = 0;
          while (lanes[lane]?.some(([a, b]) => labelLeft < b + 8 && labelRight > a - 8)) lane += 1;
          (lanes[lane] ??= []).push([labelLeft, labelRight]);
          const labelY = outside ? lineY + direction * (12 + lane * 16) : lineY;
          const pieces = gappedLine(
            { x: start, y: lineY }, { x: end, y: lineY },
            { x: (start + end) / 2, y: lineY }, outside ? 0 : labelWidth / 2 + 4,
          );
          return (
            <g key={`${label}-${index}`} aria-label={`${label}: ${formatInches(value)}`}>
              {[start, end].map((point, i) => (
                <line key={`extension-${i}`} x1={point} y1={measuredY} x2={point} y2={lineY + direction * 4} />
              ))}
              {pieces.map(([x1, y1, x2, y2], i) => <line key={`line-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} />)}
              {[start, end].map((point, i) => (
                <line key={`tick-${i}`} x1={point - 3} y1={lineY + 3} x2={point + 3} y2={lineY - 3} />
              ))}
              <text x={labelX} y={labelY} textAnchor={anchor} dominantBaseline="middle" stroke="none">
                {formatInches(value)}
              </text>
            </g>
          );
        })}
      </g>
    );
  };

  return (
    <div className="relative">
    <svg
      ref={svgRef}
      viewBox={`0 0 ${viewport.width} ${viewport.height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={label}
      className="h-64 w-full rounded border border-gray-700 bg-gray-900"
    >
      <g transform={`translate(${px(0)} ${py(0)}) scale(${scale})`}>
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x={minX - 0.25} y={-maxY - 0.25} width={maxX - minX + 0.5} height={maxY - minY + 0.5}>
            <rect x={minX - 0.25} y={-maxY - 0.25} width={maxX - minX + 0.5} height={maxY - minY + 0.5} fill="white" />
            {section.cuts.map(({ slot, geometry }, index) => (
              <path
                key={`${slot}-${index}`}
                d={sectionProfileSvgPath({ geometry })}
                fill="black"
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
              />
            ))}
          </mask>
        </defs>
        <path
          d={sectionProfileSvgPath({ geometry: section.body })}
          className="text-gray-400"
          fill="currentColor"
          fillOpacity={0.2}
          fillRule="evenodd"
          stroke="currentColor"
          strokeOpacity={0.6}
          strokeWidth={1}
          mask={`url(#${maskId})`}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
        <line
          x1={minX}
          y1={0}
          x2={maxX}
          y2={0}
          className="text-gray-600"
          stroke="currentColor"
          strokeWidth={1}
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
        {section.placed.map(({ slot, index, side, name, geometry }) => geometry.loops.map((loop) => (
          <path
            key={`${slot}-${index ?? ''}-${side ?? ''}-${loop.id}`}
            d={sectionProfileSvgPath({ geometry: { ...geometry, loops: [loop] } })}
            className="text-blue-400"
            fill={loop.closed ? 'currentColor' : 'none'}
            fillOpacity={loop.closed ? 0.3 : undefined}
            stroke="currentColor"
            strokeWidth={loop.closed ? 1.5 : 2}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          >
            <title>{slot === 'applied' ? `Applied molding ${index + 1}: ${name}` : name}</title>
          </path>
        )))}
      </g>
      <g className="text-gray-400" fill="currentColor" stroke="currentColor" strokeWidth={1} fontSize={fontSize}>
        <g aria-label="left dimensions">
          {dimensions.left?.map(({ label, from, to, value }) => {
            const centerY = (py(from) + py(to)) / 2;
            const inline = Math.abs(to - from) * scale >= textWidth(value) + 16;
            const pieces = gappedLine(
              { x: leftX, y: py(from) }, { x: leftX, y: py(to) },
              { x: leftX, y: centerY }, inline ? textWidth(value) / 2 + 4 : 0,
            );
            return (
              <g key={label} aria-label={`${label}: ${formatInches(value)}`}>
                {[from, to].map((point, i) => (
                  <line key={`extension-${i}`} x1={px(0)} y1={py(point)} x2={leftX - 4} y2={py(point)} />
                ))}
                {pieces.map(([x1, y1, x2, y2], i) => <line key={`line-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} />)}
                {[from, to].map((point, i) => (
                  <line key={`tick-${i}`} x1={leftX - 3} y1={py(point) + 3} x2={leftX + 3} y2={py(point) - 3} />
                ))}
                <text
                  x={inline ? leftX : leftX - 8}
                  y={centerY}
                  transform={inline ? `rotate(-90 ${leftX} ${centerY})` : undefined}
                  textAnchor={inline ? 'middle' : 'end'}
                  dominantBaseline="middle"
                  stroke="none"
                >
                  {formatInches(value)}
                </text>
              </g>
            );
          })}
        </g>
        {horizontalChain(dimensions.below, 'below')}
        {horizontalChain(dimensions.above, 'above')}
        {dimensions.overall?.length > 0 && horizontalChain(dimensions.overall, 'below', 1)}
      </g>
    </svg>
    <button
      type="button"
      aria-pressed={measuring}
      className={`absolute right-2 top-2 z-10 rounded border border-gray-600 px-2 py-0.5 text-xs ${measuring ? 'bg-pink-600 text-white' : 'bg-gray-800 text-gray-200 hover:bg-gray-700'}`}
      onClick={() => setMeasuring((current) => !current)}
    >
      Measure
    </button>
    {measuring && (
      <SectionMeasure section={section} viewport={viewport} onDone={() => setMeasuring(false)}
        frame={{ scale, minX, maxX, minY, maxY }} />
    )}
    </div>
  );
}
