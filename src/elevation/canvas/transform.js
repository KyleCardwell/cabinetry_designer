import { formatInches } from '../model/units.js';
import { textScales } from './textScale.js';

const DEFAULT_PADDING = {
  top: 64,
  right: 48,
  bottom: 40,
  left: 48,
};

/** Elevation zoom limit, 2000% of fit (FX5). */
export const MAX_ELEVATION_ZOOM = 20;

/** @type {{zoom: number, panX: number, panY: number}} */
export const DEFAULT_VIEW = { zoom: 1, panX: 0, panY: 0 };

function normalizePadding(padding) {
  if (typeof padding === 'number') {
    return { top: padding, right: padding, bottom: padding, left: padding };
  }
  return { ...DEFAULT_PADDING, ...padding };
}

/**
 * Fit a wall into a viewport and return the transform needed for conversion.
 *
 * @param {{length: number, height: number}} wall
 * @param {{width: number, height: number}} viewport
 * @param {number|{top?: number, right?: number, bottom?: number, left?: number}} [padding]
 * @returns {{scale: number, offsetX: number, offsetY: number, wallHeight: number}}
 */
export function fitWallToViewport(wall, viewport, padding = DEFAULT_PADDING) {
  const inset = normalizePadding(padding);
  const wallLength = Math.max(wall.length, 1);
  const wallHeight = Math.max(wall.height, 1);
  const availableWidth = Math.max(viewport.width - inset.left - inset.right, 1);
  const availableHeight = Math.max(viewport.height - inset.top - inset.bottom, 1);
  const scale = Math.min(availableWidth / wallLength, availableHeight / wallHeight);
  const drawnWidth = wallLength * scale;
  const drawnHeight = wallHeight * scale;

  return {
    scale,
    offsetX: inset.left + (availableWidth - drawnWidth) / 2,
    offsetY: inset.top + (availableHeight - drawnHeight) / 2,
    wallHeight: wall.height,
  };
}

/** Place every combined face relative to the opened face's transform, sharing the floor. */
export function combinedFaceTransforms(transform, combined, activeKey) {
  if (!combined) return new Map();
  const active = combined.faces.find((face) => face.key === activeKey);
  return new Map(combined.faces.map((face) => [face.key, {
    ...transform,
    offsetX: transform.offsetX + (face.dx - active.dx) * transform.scale,
  }]));
}

/** A face's depth relative to the opened face (not necessarily the group's lead). */
export function combinedDepthNote(face, reference) {
  const delta = face.depth - reference.depth;
  return Math.abs(delta) <= 1e-6 ? null : `${formatInches(Math.abs(delta))} ${delta < 0 ? 'back' : 'out'}`;
}

/**
 * Apply zoom and pan view state to a fitted wall transform.
 *
 * @param {{scale: number, offsetX: number, offsetY: number, wallHeight: number}} base
 * @param {{zoom: number, panX: number, panY: number}} view
 * @returns {{scale: number, offsetX: number, offsetY: number, wallHeight: number, text: {label: number, dimension: number}}}
 */
export function withView(base, view) {
  return {
    scale: base.scale * view.zoom,
    offsetX: base.offsetX * view.zoom + view.panX,
    offsetY: base.offsetY * view.zoom + view.panY,
    wallHeight: base.wallHeight,
    text: textScales(view.zoom),
  };
}

/**
 * Zoom a fitted wall view around a screen-space pointer.
 *
 * @param {{scale: number, offsetX: number, offsetY: number, wallHeight: number}} base
 * @param {{zoom: number, panX: number, panY: number}} view
 * @param {{x: number, y: number}} pointer
 * @param {number} factor
 * @param {{min?: number, max?: number}} [limits]
 * @returns {{zoom: number, panX: number, panY: number}}
 */
export function zoomViewAt(base, view, pointer, factor, { min = 0.25, max = MAX_ELEVATION_ZOOM } = {}) {
  const zoom = Math.max(min, Math.min(max, view.zoom * factor));
  if (zoom === view.zoom) return view;
  const wallPoint = screenToWall(pointer, withView(base, view));
  return {
    zoom,
    panX: pointer.x - zoom * (wallPoint.x * base.scale + base.offsetX),
    panY: pointer.y - zoom * (
      (base.wallHeight - wallPoint.z) * base.scale + base.offsetY
    ),
  };
}

/**
 * Add screen-space deltas to a wall view's pan.
 *
 * @param {{zoom: number, panX: number, panY: number}} view
 * @param {number} dx
 * @param {number} dy
 * @returns {{zoom: number, panX: number, panY: number}}
 */
export function panView(view, dx, dy) {
  return { ...view, panX: view.panX + dx, panY: view.panY + dy };
}

/**
 * Convert wall-local x/z coordinates to screen x/y coordinates.
 *
 * @param {{x: number, z: number}} point
 * @param {{scale: number, offsetX: number, offsetY: number, wallHeight: number}} transform
 * @returns {{x: number, y: number}}
 */
export function wallToScreen(point, transform) {
  return {
    x: point.x * transform.scale + transform.offsetX,
    y: (transform.wallHeight - point.z) * transform.scale + transform.offsetY,
  };
}

/**
 * Convert screen x/y coordinates to wall-local x/z coordinates.
 *
 * @param {{x: number, y: number}} point
 * @param {{scale: number, offsetX: number, offsetY: number, wallHeight: number}} transform
 * @returns {{x: number, z: number}}
 */
export function screenToWall(point, transform) {
  return {
    x: (point.x - transform.offsetX) / transform.scale,
    z: transform.wallHeight - (point.y - transform.offsetY) / transform.scale,
  };
}

/**
 * Convert a bottom-left-origin wall rectangle to a screen rectangle.
 *
 * @param {{x: number, z: number, width: number, height: number}} rectangle
 * @param {{scale: number, offsetX: number, offsetY: number, wallHeight: number}} transform
 * @returns {{x: number, y: number, width: number, height: number}}
 */
export function wallRectToScreen(rectangle, transform) {
  const topLeft = wallToScreen({
    x: rectangle.x,
    z: rectangle.z + rectangle.height,
  }, transform);
  const bottomRight = wallToScreen({
    x: rectangle.x + rectangle.width,
    z: rectangle.z,
  }, transform);

  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
}

/** A wall-coordinate line ({ x1, z1, x2, z2 }) as Konva points [x1, y1, x2, y2]. */
export function wallLineToScreen({ x1, z1, x2, z2 }, transform) {
  const start = wallToScreen({ x: x1, z: z1 }, transform);
  const end = wallToScreen({ x: x2, z: z2 }, transform);
  return [start.x, start.y, end.x, end.y];
}
