import { useId } from 'react';
import { useSelector } from 'react-redux';
import { doorSection } from '../model/doorSection.js';
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
  const w = maxX - minX;
  const h = maxY - minY;
  const pad = 0.25;
  const x = minX - pad;
  const y = -maxY - pad;
  const width = w + 2 * pad;
  const height = h + 2 * pad;

  return (
    <>
      <svg
        viewBox={`${x} ${y} ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Door section"
        className="h-64 w-full rounded border border-gray-700 bg-gray-900"
      >
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x={x} y={y} width={width} height={height}>
            <rect x={x} y={y} width={width} height={height} fill="white" />
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
          x1={minX - pad}
          y1={0}
          x2={maxX + pad}
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
