let depth = 0;

/**
 * True while band paths are built or swept. Corner shapes made then leave out the leg bands (they are cut
 * from those same paths, D4 d), and are cached apart from the full shapes.
 */
export const buildingPaths = () => depth > 0;

export function whileBuildingPaths(build) {
  depth += 1;
  try {
    return build();
  } finally {
    depth -= 1;
  }
}
