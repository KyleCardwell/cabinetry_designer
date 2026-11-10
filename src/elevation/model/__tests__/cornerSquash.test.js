import { describe, expect, it } from 'vitest';
import {
  cornerSquashes, squashDoorDetails, squashFace, squashFaceLayouts, squashPulls, squashRect, squashX,
} from '../cornerSquash.js';

const squash = { pivot: 36, k: 0.5 };

describe('CC3 step a drawing squash helpers', () => {
  it('anchor 10: projects x and width while preserving height, z and the true face width', () => {
    const rect = { x: 20, z: 4, width: 16, height: 30 };
    expect(squashX(30, squash)).toBe(33);
    expect(squashRect(rect, squash)).toEqual({ x: 28, z: 4, width: 8, height: 30 });
    expect(squashFace(rect, squash)).toEqual({ x: 28, z: 4, width: 8, height: 30, trueWidth: 16 });
    expect(rect).toEqual({ x: 20, z: 4, width: 16, height: 30 });
  });

  it('projects layouts into a new map without changing the true layouts or ordinary entries', () => {
    const face = { x: 22, width: 12, z: 4, height: 30, path: 'r', hinge: 'right' };
    const opening = { x: 21, width: 14, z: 5, height: 28 };
    const corner = { squash, faces: [face], openings: [opening], box: { x: 20, width: 16 } };
    const ordinary = { squash: null, faces: [face], openings: [opening], box: corner.box };
    const entries = new Map([['cc', corner], ['ordinary', ordinary], ['inactive', { box: corner.box }]]);
    const before = structuredClone(entries);
    const result = squashFaceLayouts(entries);
    expect(result).not.toBe(entries);
    expect(result.get('cc')).toEqual({ squash,
      faces: [{ ...face, x: 29, width: 6, trueWidth: 12 }],
      openings: [{ ...opening, x: 28.5, width: 7 }], box: { x: 28, width: 8 },
    });
    expect(result.get('ordinary')).toBe(ordinary);
    expect(result.get('inactive')).toBe(entries.get('inactive'));
    expect(cornerSquashes(entries)).toEqual(new Map([['cc', squash]]));
    expect(entries).toEqual(before);
  });

  it('anchor 10: projects detail rectangles, openings, lines and miter endpoints only', () => {
    const part = { pieceId: 'cc', x: 20, width: 16, z: 4, height: 30,
      openings: [{ x: 23, width: 10, z: 7, height: 24 }],
      lines: [{ x: 21, width: 14, z: 5, height: 28 }],
      miters: [{ x1: 20, x2: 23, z1: 4, z2: 7 }], sizes: { width: 16 },
    };
    const other = { ...part, pieceId: 'a' };
    const details = { parts: [part, other], warnings: [{ code: 'example' }] };
    const before = structuredClone(details);
    const result = squashDoorDetails(details, new Map([['cc', squash]]));
    expect(result.parts[0]).toEqual({ ...part, x: 28, width: 8,
      openings: [{ x: 29.5, width: 5, z: 7, height: 24 }],
      lines: [{ x: 28.5, width: 7, z: 5, height: 28 }],
      miters: [{ x1: 28, x2: 29.5, z1: 4, z2: 7 }],
    });
    expect(result.parts[1]).toBe(other);
    expect(result.warnings).toBe(details.warnings);
    expect(result.parts[0].sizes).toBe(part.sizes);
    expect(details).toEqual(before);
  });

  it('anchor 10: projects pull centres without resizing hardware or changing other pieces', () => {
    const pull = { pieceId: 'cc', centers: [{ x: 30, z: 10 }], along: 6, across: 0.375 };
    const other = { ...pull, pieceId: 'a' };
    const pulls = [pull, other];
    const before = structuredClone(pulls);
    const result = squashPulls(pulls, new Map([['cc', squash]]));
    expect(result[0]).toEqual({ ...pull, centers: [{ x: 33, z: 10 }] });
    expect(result[1]).toBe(other);
    expect(pulls).toEqual(before);
  });
});
