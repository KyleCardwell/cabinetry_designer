import { describe, expect, it } from 'vitest';
import { runHighlight } from '../selectionHighlight.js';

describe('SPEC-39.1 only the selected thing is outlined', () => {
  it('outlines the run, a piece or a face, never what it sits in', () => {
    expect(runHighlight(false, null, null)).toEqual({ run: false, pieceId: null, facePath: null });
    expect(runHighlight(true, null, null)).toEqual({ run: true, pieceId: null, facePath: null });
    expect(runHighlight(true, 'cab-1', null)).toEqual({ run: false, pieceId: 'cab-1', facePath: null });
    expect(runHighlight(true, 'cab-1', 'r.0')).toEqual({ run: false, pieceId: null, facePath: 'r.0' });
  });
});
