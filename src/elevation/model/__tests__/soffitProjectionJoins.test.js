import { describe, expect, it } from 'vitest';
import {
  joinedSides,
  projectionJoinsBySide,
  soffitJoinsBySide,
  soffitProjectionJoins,
} from '../soffits.js';

const soffit = (overrides = {}) => ({ id: 'S', x: 0, width: 48, bottom: 84, depth: 14, ...overrides });
const projection = (overrides = {}) => ({
  id: 'P', kind: 'projection', offsetFrom: 'left', offsetAnchor: 'edge', offset: 48, width: 30,
  bottom: 0, height: null, depth: 14, ...overrides,
});
const view = (soffits, recesses) => ({ side: 'front', length: 144, height: 96, soffits, recesses });

describe('soffit beside a projection just as deep (Kyle 2026-10-16)', () => {
  it('joins them from the soffit bottom up to the projection top', () => {
    expect(soffitProjectionJoins(view([soffit()], [projection()]))).toEqual([
      { soffitId: 'S', projectionId: 'P', side: 'right', x: 48, bottom: 84, top: 96 },
    ]);
    // A soffit on the projection's right side, and a projection stopping short of the ceiling.
    expect(soffitProjectionJoins(view([soffit({ x: 78, width: 66 })], [projection({ height: 90 })]))).toEqual([
      { soffitId: 'S', projectionId: 'P', side: 'left', x: 78, bottom: 84, top: 90 },
    ]);
  });

  it('keeps the seam for a different depth, a gap, or a projection below the soffit', () => {
    expect(soffitProjectionJoins(view([soffit()], [projection({ depth: 16 })]))).toEqual([]);
    expect(soffitProjectionJoins(view([soffit({ width: 47 })], [projection()]))).toEqual([]);
    expect(soffitProjectionJoins(view([soffit()], [projection({ height: 80 })]))).toEqual([]);
    expect(soffitProjectionJoins(view([soffit()], [{ ...projection(), kind: 'recess' }]))).toEqual([]);
  });

  it('opens the shared side and draws only the parts no join hides', () => {
    const joins = soffitProjectionJoins(view([soffit()], [projection({ height: 90 })]));
    expect(joinedSides({ x: 0, z: 84, width: 48, height: 12 }, soffitJoinsBySide(joins, soffit()))).toEqual({
      openEdges: ['right'],
      lines: [{ x1: 48, z1: 90, x2: 48, z2: 96 }],
    });
    expect(joinedSides({ x: 48, z: 0, width: 30, height: 90 }, projectionJoinsBySide(joins, 'P'))).toEqual({
      openEdges: ['left'],
      lines: [{ x1: 48, z1: 0, x2: 48, z2: 84 }],
    });
    // A side already flush with a wing wall stays fully open, with no lines.
    expect(soffitJoinsBySide(joins, soffit(), { right: true })).toEqual({ left: [] });
  });
});
