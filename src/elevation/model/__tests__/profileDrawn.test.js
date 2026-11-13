import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  addProfilePoint, profileDrawnIn, profileVertexIds, setProfileDrawnPoint, setProfileDrawnPoints,
  setProfilePlanSameAsElevation,
} from '../profileEditing.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const [COVE, BEAD, CROWN] = sample.profiles;

describe('SPEC-48.1 editing drawn points', () => {
  it('draws and un-draws a point in elevation; the list stays in points order', () => {
    const added = setProfileDrawnPoint(COVE, 'elevation', 'a', true);
    expect(added.drawnPoints).toEqual({ elevation: ['a', 'b', 'c'] });
    expect(setProfileDrawnPoint(added, 'elevation', 'b', false).drawnPoints).toEqual({ elevation: ['a', 'c'] });
    expect(setProfileDrawnPoint(COVE, 'elevation', 'b', true)).toEqual(COVE);
    expect(setProfileDrawnPoint(COVE, 'elevation', 'e', false)).toEqual(COVE);
    const crossed = { ...COVE, drawnPoints: { elevation: ['c', 'b'] } };
    expect(setProfileDrawnPoint(crossed, 'elevation', 'a', true).drawnPoints).toEqual({ elevation: ['a', 'b', 'c'] });
    expect(setProfileDrawnPoint(CROWN, 'elevation', 'c1', true).drawnPoints)
      .toEqual({ elevation: ['c1', 'c3', 'c4', 'c5'], plan: ['c3'] });
    expect(COVE.drawnPoints).toEqual({ elevation: ['b', 'c'] });
  });

  it('gives plan its own list only when it is edited, and takes it away again', () => {
    expect(setProfileDrawnPoint(COVE, 'plan', 'c', false).drawnPoints).toEqual({ elevation: ['b', 'c'], plan: ['b'] });
    expect(setProfileDrawnPoint(COVE, 'plan', 'd', true).drawnPoints).toEqual({ elevation: ['b', 'c'], plan: ['b', 'c', 'd'] });
    expect(setProfileDrawnPoint(CROWN, 'plan', 'c5', true).drawnPoints)
      .toEqual({ elevation: ['c3', 'c4', 'c5'], plan: ['c3', 'c5'] });
    const same = setProfilePlanSameAsElevation(CROWN, true);
    expect(same.drawnPoints).toEqual({ elevation: ['c3', 'c4', 'c5'] });
    expect('plan' in same.drawnPoints).toBe(false);
    expect(setProfilePlanSameAsElevation(COVE, false).drawnPoints).toEqual({ elevation: ['b', 'c'], plan: ['b', 'c'] });
    expect(setProfilePlanSameAsElevation(COVE, true)).toEqual(COVE);
    expect(setProfilePlanSameAsElevation(CROWN, false)).toEqual(CROWN);
    expect([
      profileDrawnIn(COVE, 'elevation'),
      profileDrawnIn(COVE, 'plan'),
      profileDrawnIn(CROWN, 'plan'),
      profileDrawnIn(COVE, 'side'),
    ]).toEqual([['b', 'c'], ['b', 'c'], ['c3'], []]);
  });

  it('sets a whole list, finds the shape points, and refuses bad input', () => {
    expect(setProfileDrawnPoints(COVE, 'elevation', ['e', 'a']).drawnPoints).toEqual({ elevation: ['a', 'e'] });
    expect(setProfileDrawnPoints(COVE, 'elevation', []).drawnPoints).toEqual({ elevation: [] });
    expect(setProfileDrawnPoints(CROWN, 'plan', ['c5', 'c4']).drawnPoints)
      .toEqual({ elevation: ['c3', 'c4', 'c5'], plan: ['c4', 'c5'] });
    expect(setProfileDrawnPoints(COVE, 'plan', ['c']).drawnPoints).toEqual({ elevation: ['b', 'c'], plan: ['c'] });
    const extra = addProfilePoint(COVE, [2, 2], 'p9');
    expect([profileVertexIds(COVE), profileVertexIds(extra), profileVertexIds(BEAD)])
      .toEqual([['a', 'b', 'c', 'd', 'e'], ['a', 'b', 'c', 'd', 'e'], ['s', 't']]);
    expect(setProfileDrawnPoints(extra, 'elevation', profileVertexIds(extra)).drawnPoints)
      .toEqual({ elevation: ['a', 'b', 'c', 'd', 'e'] });
    expect(setProfileDrawnPoints(extra, 'elevation', ['p9']).drawnPoints).toEqual({ elevation: ['p9'] });
    expect([
      setProfileDrawnPoints(COVE, 'elevation', ['a', 'a']),
      setProfileDrawnPoints(COVE, 'elevation', ['q']),
      setProfileDrawnPoints(COVE, 'elevation', 'a'),
      setProfileDrawnPoints(COVE, 'side', ['a']),
      setProfileDrawnPoint(COVE, 'side', 'a', true),
      setProfileDrawnPoint(COVE, 'elevation', 'q', true),
      setProfileDrawnPoint(COVE, 'elevation', 'a', 'yes'),
      setProfilePlanSameAsElevation(COVE, 'yes'),
    ]).toEqual([null, null, null, null, null, null, null, null]);
  });
});
