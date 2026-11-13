import { sectionProfileBounds, sectionProfileSvgPath } from '../elevation/model/sectionProfiles.js';

export default function ProfileThumbnail({ profile, className = '' }) {
  const b = sectionProfileBounds(profile);
  const w = Math.max(b.maxX - b.minX, 0.01);
  const h = Math.max(b.maxY - b.minY, 0.01);
  const pad = Math.max(w, h) * 0.08;

  return (
    <svg
      viewBox={`${b.minX - pad} ${-b.maxY - pad} ${w + 2 * pad} ${h + 2 * pad}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`${profile.name} profile`}
      className={className}
    >
      <path
        d={sectionProfileSvgPath(profile)}
        fill="currentColor"
        fillOpacity={0.12}
        fillRule="evenodd"
        stroke="currentColor"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
}
