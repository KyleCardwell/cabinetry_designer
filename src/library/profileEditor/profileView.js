import { sectionProfileBounds } from '../../elevation/model/sectionProfiles.js';
import { profileArcInfo } from '../../elevation/model/profileEditing.js';

const clampScale = (scale) => Math.min(4000, Math.max(20, scale));

/** SPEC-48 fits the profile and origin with space around their bounds. */
export function fitView(profile, width, height) {
  const bounds = sectionProfileBounds(profile);
  const minX = Math.min(bounds.minX, 0);
  const minY = Math.min(bounds.minY, 0);
  const maxX = Math.max(bounds.maxX, 0);
  const maxY = Math.max(bounds.maxY, 0);
  const w = Math.max(maxX - minX, 0.25);
  const h = Math.max(maxY - minY, 0.25);
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    scale: clampScale(Math.min(width / (w * 1.3), height / (h * 1.3))),
  };
}

/** SPEC-48 maps y-up model inches to screen pixels. */
export function toScreen(view, size, [x, y]) {
  return [(x - view.cx) * view.scale + size.width / 2,
    size.height / 2 - (y - view.cy) * view.scale];
}

/** SPEC-48 maps screen pixels back to y-up model inches. */
export function toModel(view, size, [sx, sy]) {
  return [view.cx + (sx - size.width / 2) / view.scale,
    view.cy - (sy - size.height / 2) / view.scale];
}

/** SPEC-48 zooms while preserving the model point beneath the cursor. */
export function zoomAt(view, size, [sx, sy], factor) {
  const [x, y] = toModel(view, size, [sx, sy]);
  const scale = clampScale(view.scale * factor);
  return {
    cx: x - (sx - size.width / 2) / scale,
    cy: y + (sy - size.height / 2) / scale,
    scale,
  };
}

function segmentCommand(profile, seg, view, size) {
  const [x, y] = toScreen(view, size, profile.geometry.points[seg.to]);
  if (seg.type === 'line') return `L ${x} ${y}`;
  const loop = profile.geometry.loops.find((entry) => entry.segs.includes(seg));
  const info = profileArcInfo(profile, loop.id, loop.segs.indexOf(seg));
  const r = info.radius * view.scale;
  return `A ${r} ${r} 0 ${info.sweep > 180 ? 1 : 0} ${info.ccw ? 0 : 1} ${x} ${y}`;
}

/** SPEC-48 renders a line or arc using constant-size screen coordinates. */
export function segmentScreenPath(profile, seg, view, size) {
  const [x, y] = toScreen(view, size, profile.geometry.points[seg.from]);
  return `M ${x} ${y} ${segmentCommand(profile, seg, view, size)}`;
}

/** SPEC-48 renders a chained loop with one move and an optional close. */
export function loopScreenPath(profile, loop, view, size) {
  const [x, y] = toScreen(view, size, profile.geometry.points[loop.segs[0].from]);
  return `M ${x} ${y} ${loop.segs.map((seg) => segmentCommand(profile, seg, view, size)).join(' ')}${loop.closed ? ' Z' : ''}`;
}
