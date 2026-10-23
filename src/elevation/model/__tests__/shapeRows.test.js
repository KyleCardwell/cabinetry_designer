import { expect, it } from 'vitest';
import { shapeFromRow, shapeToRow, teamSettingsFromRow, teamSettingsToRow } from '../cloudRows.js';
import { newShape } from '../libraryShapes.js';

it('SH2 anchor 2: round-trips archived shapes with independent row versions and rejects malformed data', () => {
  const shape = { ...newShape([], '0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'), name: 'Rod', version: 3, archived: true };
  const row = shapeToRow(shape);
  const { id, name, archived, ...data } = shape;
  expect(archived).toBe(true);
  expect(row).toEqual({ shape_id: id, name, data });
  expect(shapeFromRow({ ...row, version: 7, archived_at: 't' })).toEqual(shape);
  expect(shapeFromRow({ ...row, name: ' Rod ', archived_at: null })).toEqual({ ...shape, archived: false });
  row.data.box.w = 40;
  expect(shape.box.w).toBe(12);
  const { box, ...missingBox } = row.data;
  expect(box.w).toBe(40);
  for (const invalid of [null, { ...row, shape_id: 'old-id' }, { ...row, data: missingBox },
    { ...row, name: ' ' }, { ...row, data: { ...row.data, extra: true } }]) {
    expect(shapeFromRow(invalid)).toBeNull();
  }
  expect(teamSettingsToRow({ shapes: [shape] })).not.toHaveProperty('shapes');
  expect(teamSettingsFromRow({ shapes: [shape] })).not.toHaveProperty('shapes');
});
