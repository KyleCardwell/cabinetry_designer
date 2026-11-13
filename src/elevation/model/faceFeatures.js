import { landingsOn } from './landings.js';
import { openingGeometry } from './openings.js';
import { recessGeometry, recessesOn } from './recesses.js';
import { soffitsOn } from './soffits.js';
import { wallSideFrame, wallSideView } from './wallSides.js';

/**
 * Everything placed on one face of a wall (SPEC-39 C7), in that face's coordinates, left to right:
 * { kind: 'landing' | 'opening' | 'recess' | 'projection' | 'soffit', id, x, width, bottom, top, depth }.
 * Openings are on the front face only, by their outside (casing, else jamb). New hosts (a floor step,
 * a column face, a cutout filled with cabinetry) are added here.
 */
export function faceFeatures(room, wall, side, settings) {
  const view = wallSideView(wall, side);
  const { length } = wallSideFrame(room, wall, side);
  const features = landingsOn(room, view).map(({ wallId, a, b }) => ({
    kind: 'landing',
    id: wallId,
    x: a,
    width: b - a,
    bottom: 0,
    top: room.walls.find((candidate) => candidate.id === wallId)?.height ?? wall.height,
    depth: null,
  }));
  if (side === 'front') {
    for (const opening of wall.openings ?? []) {
      const geometry = openingGeometry(opening, length, settings);
      const outside = geometry.casing ?? geometry.jamb;
      features.push({
        kind: 'opening',
        id: opening.id,
        x: outside.x,
        width: outside.width,
        bottom: outside.z,
        top: outside.z + outside.height,
        depth: wall.thickness,
      });
    }
  }
  for (const recess of recessesOn(view)) {
    const geometry = recessGeometry(recess, length, wall.height);
    features.push({
      kind: recess.kind === 'projection' ? 'projection' : 'recess',
      id: recess.id,
      x: geometry.x,
      width: geometry.width,
      bottom: geometry.bottom,
      top: geometry.top,
      depth: geometry.depth,
    });
  }
  for (const soffit of soffitsOn(view)) {
    features.push({
      kind: 'soffit',
      id: soffit.id,
      x: soffit.x,
      width: soffit.width,
      bottom: soffit.bottom,
      top: wall.height,
      depth: soffit.depth,
    });
  }
  return features.sort((a, b) => a.x - b.x || a.kind.localeCompare(b.kind));
}
