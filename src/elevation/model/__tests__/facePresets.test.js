import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { faceArea, faceRevealsFor, isFaceNode, resolveFaces } from '../faces.js';
import { FACE_PRESETS, presetsFor } from '../facePresets.js';

const { BASE, UPPER, TALL, FILLER } = CABINET_TYPE_IDS;
const keys = (presets) => presets.map((preset) => preset.key);

describe('face presets', () => {
  it('18. presetsFor keys by type', () => {
    expect(keys(presetsFor(BASE))).toEqual(['d', 'pd', '2d', '2df', '3df', '4df', 'df_d', 'df_pd', 'fs']);
    expect(keys(presetsFor(UPPER))).toEqual(['d', 'pd', '2d']);
    expect(keys(presetsFor(TALL))).toEqual(['d', 'pd', '2d', 'd_4df', 'pd_3df']);
    expect(presetsFor(FILLER)).toEqual([]);
  });

  it("19. every preset's face passes isFaceNode", () => {
    for (const preset of FACE_PRESETS) {
      expect(isFaceNode(preset.face), preset.key).toBe(true);
    }
  });

  it('20. d_4df on a tall piece', () => {
    const preset = FACE_PRESETS.find((p) => p.key === 'd_4df');
    const piece = { x: 0, z: 4, width: 24, height: 84 };
    const r = faceRevealsFor(TALL, DEFAULT_SETTINGS);
    const { faces } = resolveFaces(preset.face, faceArea(piece, r), r);
    expect(faces).toHaveLength(5);
    expect(faces.map(({ path, z, height }) => ({ path, z, height }))).toEqual([
      { path: 'r.0', z: 34.5, height: 53.375 },
      { path: 'r.1.0', z: 28.375, height: 6 },
      { path: 'r.1.1', z: 22.25, height: 6 },
      { path: 'r.1.2', z: 13.1875, height: 8.9375 },
      { path: 'r.1.3', z: 4.125, height: 8.9375 },
    ]);
    expect(faces[0].type).toBe('door');
    for (const face of faces) {
      expect(face.x).toBe(0.0625);
      expect(face.width).toBe(23.875);
    }
  });
});
