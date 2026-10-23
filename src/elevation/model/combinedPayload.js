import { combinedSoffitJoins } from './combinedElevations.js';
import { seamHiddenEdges } from './combinedSeams.js';
import { combinedCornerShapes } from './cornerParts.js';
import { resolveWall } from './room.js';
import { wallLabel } from './topology.js';
import { formatInches } from './units.js';
import { wallExtent } from './wallExtent.js';

const COLLECTIONS = ['parts', 'dimensions', 'marks', 'doorDetails', 'partNumbers', 'swingMarks', 'pulls', 'interiors', 'glassMarks'];
const X_FIELDS = new Set(['x', 'x1', 'x2', 'textX']);
const shiftPoint = ([x, ...rest], dx) => [x + dx, ...rest];

/** Shift all payload coordinates, preserving heights, depths, lengths and arc bulges. */
export function shiftPayloadRecord(record, dx) {
  if (record === null || typeof record !== 'object') return record;
  if (Array.isArray(record)) return record.map((entry) => shiftPayloadRecord(entry, dx));
  const dimensionFields = record.orientation === 'vertical'
    ? ['base', 'at', 'startBase', 'endBase'] : ['start', 'end'];
  return Object.fromEntries(Object.entries(record).map(([key, value]) => {
    if (typeof value === 'number' && (X_FIELDS.has(key)
      || ('row' in record && dimensionFields.includes(key)))) return [key, value + dx];
    if (key === 'outline' && value) return [key, value.map((point) => shiftPoint(point, dx))];
    if (key === 'outlines') return [key, value.map((outline) => outline.map((point) => shiftPoint(point, dx)))];
    return [key, shiftPayloadRecord(value, dx)];
  }));
}

/** Build each saved face as usual, then merge it in face order into the lead's elevation. */
export function combinedElevationPayload(room, combined, settings, buildFace) {
  const faces = combined.faces.map((face) => ({
    ...face, wall: room.walls.find(({ id }) => id === face.wallId),
  }));
  const extents = faces.map(({ wall, side }) => wallExtent(room, resolveWall(room, wall, side), settings));
  const extent = {
    top: Math.max(...extents.map(({ top }) => top)),
    bottom: Math.min(...extents.map(({ bottom }) => bottom)),
  };
  const left = faces.reduce((one, two) => two.dx < one.dx ? two : one);
  const right = faces.reduce((one, two) => two.dx + two.length > one.dx + one.length ? two : one);
  const shapes = combinedCornerShapes(room, combined, settings);
  const soffitJoins = combinedSoffitJoins(room, combined);
  const seen = new Set();
  const records = Object.fromEntries(COLLECTIONS.map((key) => [key, []]));
  let lead;
  for (const face of faces) {
    const payload = buildFace(face.wall, face.side, {
      extent, cornerShapes: shapes.get(face.key), soffitJoins: soffitJoins.filter(({ key }) => key === face.key),
    });
    lead ??= payload;
    const duplicates = new Set(payload.parts.filter(({ id }) => seen.has(id)).map(({ id }) => id));
    for (const key of COLLECTIONS) {
      const kept = (payload[key] ?? []).filter((record) => {
        if (key === 'parts' && duplicates.has(record.id)) return false;
        if (duplicates.has(record.partId) || (key === 'partNumbers' && duplicates.has(record.key))) return false;
        if (key === 'dimensions') {
          if (record.row.startsWith('left.') && face !== left) return false;
          if (record.row.startsWith('right.') && face !== right) return false;
        }
        return true;
      });
      records[key].push(...kept.map((record) => shiftPayloadRecord(record, face.dx)));
    }
    for (const { id } of payload.parts) seen.add(id);
  }
  // Preserve the existing omission of empty optional collections.
  if (!records.swingMarks.length) delete records.swingMarks;
  if (!records.pulls.length) delete records.pulls;
  if (!records.interiors.length) delete records.interiors;
  if (!records.glassMarks.length) delete records.glassMarks;
  const hiddenEdges = seamHiddenEdges(combined, records.parts, soffitJoins);
  return {
    ...lead,
    length: combined.length,
    height: combined.height,
    wallLabel: faces.map(({ wall }) => wallLabel(room, wall)).join(', '),
    faces: faces.map(({ wall, ...face }) => {
      const delta = face.depth - faces[0].depth;
      return {
        ...face,
        depth: face.depth === 0 ? 0 : face.depth,
        wallLabel: wallLabel(room, wall),
        ...(Math.abs(delta) > 1e-6 ? { note: `${formatInches(Math.abs(delta))} ${delta < 0 ? 'back' : 'out'}` } : {}),
        ...(hiddenEdges.has(face.key) ? { hiddenEdges: hiddenEdges.get(face.key) } : {}),
      };
    }),
    ...records,
  };
}
