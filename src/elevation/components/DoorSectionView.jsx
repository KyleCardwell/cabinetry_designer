import { useEffect, useId, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { doorSection, doorSectionDimensions } from '../model/doorSection.js';
import { formatInches } from '../model/units.js';
import { doorProfileOffsets } from '../model/doorProfileLines.js';
import { sectionProfileBounds, sectionProfileSvgPath } from '../model/sectionProfiles.js';

const SLOT_LABELS = {
  outside: 'Outside edge',
  inside: 'Inside profile',
  panel: 'Raised panel',
  applied: 'Applied molding',
};

export default function DoorSectionView({ style, design }) {
  const profiles = useSelector((state) => state.elevation.settings.sectionProfiles);
  const maskId = useId().replace(/:/g, '');
  const section = doorSection(style, design, profiles);
  const hasSection = section !== null;
  const svgRef = useRef(null);
  const [viewport, setViewport] = useState({ width: 400, height: 256 });
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setViewport({ width, height });
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, [hasSection]);
  const warnings = doorProfileOffsets(style, design, profiles).warnings;
  const thinMessages = warnings.filter(({ code }) => code === 'door-profile-too-thin').map(({ slot }) => (
    <p key={slot} className="text-xs text-amber-300">{SLOT_LABELS[slot]} can't shrink to this thickness — shown unstretched</p>
  ));
  const deep = warnings.filter(({ code }) => code === 'door-profile-too-deep').map(({ slot }) => SLOT_LABELS[slot]);

  if (section === null) {
    return (
      <>
        <p className="text-xs text-gray-400">Too thin to draw a section (thickness and stile/inset must be over 1/2").</p>
        {thinMessages}
      </>
    );
  }

  const bounds = [section.body, ...section.placed.map(({ geometry }) => geometry)]
    .map((geometry) => sectionProfileBounds({ geometry }));
  const minX = Math.min(...bounds.map((b) => b.minX));
  const maxX = Math.max(...bounds.map((b) => b.maxX));
  const minY = Math.min(0, ...bounds.map((b) => b.minY));
  const maxY = Math.max(0, ...bounds.map((b) => b.maxY));
  const dimensions = doorSectionDimensions(style, design, profiles);
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

  const horizontalChain = (chain, side) => {
    const direction = side === 'above' ? -1 : 1;
    const lineY = py(side === 'above' ? maxY : minY) + direction * 20;
    const measuredY = py(side === 'above' ? 0 : -style.thickness);
    const lanes = [];
    return (
      <g aria-label={`${side} dimensions`}>
        {chain.map(({ label, from, to, value }, index) => {
          const start = px(from);
          const end = px(to);
          const labelWidth = textWidth(value);
          const outside = end - start < labelWidth + 8;
          const anchor = outside ? (index === 0 ? 'end' : 'start') : 'middle';
          const labelX = outside ? (index === 0 ? start - 6 : end + 6) : (start + end) / 2;
          const labelLeft = labelX - (anchor === 'end' ? labelWidth : anchor === 'middle' ? labelWidth / 2 : 0);
          const labelRight = labelLeft + labelWidth;
          // Adjacent short segments may need separate rows, even with labels outside their spans.
          let lane = 0;
          while (lanes[lane]?.some(([a, b]) => labelLeft < b + 8 && labelRight > a - 8)) lane += 1;
          (lanes[lane] ??= []).push([labelLeft, labelRight]);
          const labelY = lineY + direction * (12 + lane * 16);
          return (
            <g key={label} aria-label={`${label}: ${formatInches(value)}`}>
              {[start, end].map((point, i) => (
                <line key={`extension-${i}`} x1={point} y1={measuredY} x2={point} y2={lineY + direction * 4} />
              ))}
              <line x1={start} y1={lineY} x2={end} y2={lineY} />
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
    <>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${viewport.width} ${viewport.height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Door section"
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
          {section.placed.map(({ slot, name, geometry }) => geometry.loops.map((loop) => (
            <path
              key={`${slot}-${loop.id}`}
              d={sectionProfileSvgPath({ geometry: { ...geometry, loops: [loop] } })}
              className="text-blue-400"
              fill={loop.closed ? 'currentColor' : 'none'}
              fillOpacity={loop.closed ? 0.3 : undefined}
              stroke="currentColor"
              strokeWidth={loop.closed ? 1.5 : 2}
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
            >
              <title>{name}</title>
            </path>
          )))}
        </g>
        <g className="text-gray-400" fill="currentColor" stroke="currentColor" strokeWidth={1} fontSize={fontSize}>
          <g aria-label="left dimensions">
            {dimensions.left.map(({ label, from, to, value }) => (
              <g key={label} aria-label={`${label}: ${formatInches(value)}`}>
                {[from, to].map((point, i) => (
                  <line key={`extension-${i}`} x1={px(0)} y1={py(point)} x2={leftX - 4} y2={py(point)} />
                ))}
                <line x1={leftX} y1={py(from)} x2={leftX} y2={py(to)} />
                {[from, to].map((point, i) => (
                  <line key={`tick-${i}`} x1={leftX - 3} y1={py(point) + 3} x2={leftX + 3} y2={py(point) - 3} />
                ))}
                <text x={leftX - 8} y={(py(from) + py(to)) / 2} textAnchor="end" dominantBaseline="middle" stroke="none">
                  {formatInches(value)}
                </text>
              </g>
            ))}
          </g>
          {horizontalChain(dimensions.below, 'below')}
          {horizontalChain(dimensions.above, 'above')}
        </g>
      </svg>
      <p className="text-xs text-gray-400">
        Half section through the left stile, front face up, at this style's thickness and width. Open lines cut the wood back to the face; closed shapes are applied. Raised panels draw over the flat panel for now.
      </p>
      {section.skipped.length > 0 && (
        <p className="text-xs text-amber-300">
          Not shown (missing or wrong kind): {section.skipped.map((slot) => SLOT_LABELS[slot]).join(', ')}.
        </p>
      )}
      {thinMessages}
      {deep.length > 0 && (
        <p className="text-xs text-amber-300">Cuts deeper than the door is thick: {deep.join(', ')}.</p>
      )}
    </>
  );
}
