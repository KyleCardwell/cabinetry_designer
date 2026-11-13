import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CABINET_TYPE_IDS } from '../constants.js';
import { counterHeight } from '../dimensions.js';
import { runTop } from '../tops.js';

vi.mock('../tops.js', () => ({
  isCountertop: (kind) => kind === 'countertop',
  runTop: vi.fn(),
}));

describe('counterHeight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runTop.mockReturnValue({ kind: 'countertop', height: 1.5 });
  });

  it('runs from the floor to the top of a base run countertop', () => {
    const wall = { id: 'wall-1' };
    const run = {
      cabinetTypeId: CABINET_TYPE_IDS.BASE,
      z: 4,
      height: 30,
    };
    const profile = { id: 'profile-1' };

    expect(counterHeight(wall, run, profile)).toEqual([{
      start: 0,
      end: 35.5,
      kind: 'counter-height',
    }]);
    expect(runTop).toHaveBeenCalledWith(wall, run, profile);
  });

  it('is empty for a tall run', () => {
    expect(counterHeight({}, {
      cabinetTypeId: CABINET_TYPE_IDS.TALL,
      z: 0,
      height: 84,
    }, {})).toEqual([]);
    expect(runTop).not.toHaveBeenCalled();
  });

  it('is empty without a base run', () => {
    expect(counterHeight({}, null, {})).toEqual([]);
    expect(runTop).not.toHaveBeenCalled();
  });
});
