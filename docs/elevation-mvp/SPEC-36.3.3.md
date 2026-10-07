# Elevation Lab — SPEC-36.3.3 (each end of the wall gets its own vertical chain)

Step 249, after 36.3.2. Written against `f88ac14` (step 248). Baseline **739**.

The code below was run in a scratch copy of the repo against the tests below, and passed ESLint there; Vitest couldn't run there. The new tests fail on `f88ac14` and pass with the change, and the existing chain tests (`dimensions`, `stacks`, `tops`, `frameParts`, `soffits`, `hanging`, `soffitChain`) still pass.

| Step | What | Files | Tests after |
|---|---|---|---|
| **249** | Model: a chain only takes runs from its own half of the wall; with no soffit over its runs, it takes the soffit nearest its edge. | `dimensions.js`, `alcoves.test.js` (new) | 741 |

Next: **37** (T-fillers).

## §1 What was wrong, and the rules (Kyle, 2026-09-30)

A wall with an alcove at each end: a base under the left alcove's soffit, nothing under the right one. The right chain showed the left base and the left soffit.

- **Runs.** With nothing selected, `pickColumnPair` took the rightmost run on the whole wall for the right chain, even one at the far left. Now each chain only takes runs that **reach into its half of the wall**: for the left chain, a run starting left of the middle; for the right, one ending right of it. A run across the middle is on both chains, as before. A bare half gets a chain with no cabinets. Selecting a run works as it did.
- **Soffit.** The lowest soffit over the chain's runs still wins. When none is over them (or there are none), it's now the soffit **nearest that chain's edge** of the wall (the left chain measures from x 0, the right from the wall's end), and the lowest of those that tie. SPEC-36.3.2 took the lowest one on the wall.

Worked example (the tests): a 144" wall, 96" tall.
- Alcoves: a base at x 0–48 under a soffit at 0–48 (bottom 84); a soffit at 96–144 (bottom 80), nothing under it. Left chain: … countertop 34.5–36 | open 36–84 | soffit 84–96. Right chain: open 0–80 | soffit 80–96.
- No runs, soffits at 0–30 (bottom 72) and 114–144 (bottom 84): left open 0–72, soffit to 96; right open 0–84, soffit to 96.
- A base across the whole wall is on the right chain too.

---

## §2 Step 249 — model: each end's own chain

### `src/elevation/model/dimensions.js` (634)

- In `pickColumnPair`, replace its last lines, from `const edgeRun = edge === 'right' ? rightmost : leftmost;` (432) to the closing `};` of the returned object, with:

```js
  // Only runs reaching into this edge's half of the wall (SPEC-36.3.3): a run at the far end is the
  // other chain's, so a bare end of the wall gets a chain of its own.
  const half = wallLength(wall) / 2;
  const onSide = (run) => (edge === 'right'
    ? run.x + run.width > half + SEGMENT_EPSILON
    : run.x < half - SEGMENT_EPSILON);
  const edgeRun = edge === 'right' ? rightmost : leftmost;
  return {
    lowerRun: edgeRun(lowerRuns.filter(onSide)),
    upperRun: edgeRun(upperRuns.filter(onSide)),
  };
```

- Replace `columnSoffit` and the first two lines of `soffitBreak` (the doc comment above `columnSoffit`, about 483, through `const soffit = columnSoffit(wall, runs);`) with:

```js
/**
 * The soffit a vertical chain stops at (SPEC-36.3.2, 36.3.3): the lowest one over the column's runs,
 * or when none is over them (or there are no runs), the one nearest the chain's edge of the wall,
 * the lowest of those that tie.
 */
function columnSoffit(wall, runs, edge) {
  const soffits = soffitsOn(wall);
  const over = soffits.filter((soffit) => runs.some((run) => rangesOverlap(soffit, run)));
  if (over.length > 0) return [...over].sort((a, b) => a.bottom - b.bottom)[0];
  const length = wallLength(wall);
  const distance = (soffit) => (edge === 'right' ? length - (soffit.x + soffit.width) : soffit.x);
  return [...soffits].sort((a, b) => (
    Math.abs(distance(a) - distance(b)) > SEGMENT_EPSILON ? distance(a) - distance(b) : a.bottom - b.bottom
  ))[0] ?? null;
}

/** Where the open space at the top of a chain stops: a soffit's bottom above `cursor`, or null. */
function soffitBreak(wall, runs, cursor, edge) {
  const soffit = columnSoffit(wall, runs, edge);
```

  The rest of `soffitBreak` stays.
- `stackChain` (524): `const soffit = soffitBreak(wall, runs, cursor);` becomes `const soffit = soffitBreak(wall, runs, cursor, edge);`.
- `verticalChains` (607): `const soffit = soffitBreak(wall, [lowerRun, upperRun].filter(Boolean), cursor);` becomes `const soffit = soffitBreak(wall, [lowerRun, upperRun].filter(Boolean), cursor, edge);`.

Nothing else changes. `pickColumnRuns`' tests 11 and 192 put a run in each half, so they still pass.

### New `src/elevation/model/__tests__/alcoves.test.js`

```js
import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { pickColumnRuns, verticalChains } from '../dimensions.js';
import { gridFromItems } from '../grid.js';
import { resolveWall, syncRoom } from '../room.js';

const S = DEFAULT_SETTINGS;
const NONE = { type: 'none', width: null };

const base = (id, x, width) => ({
  id, cabinetTypeId: CABINET_TYPE_IDS.BASE, x, width, z: 4, height: 30.5, depth: 24,
  ends: { left: NONE, right: NONE }, autoCount: false, maxCabinetWidth: null,
  heightMode: 'auto', overrides: {}, anchors: { left: false, right: false },
  grid: gridFromItems(id, [{ id: `${id}a`, kind: 'cabinet', width: null }]),
});

const soffit = (id, x, width, bottom) => ({
  id, wallSide: 'front', x, width, bottom, depth: 14, molding: 'none', anchors: { left: false, right: false },
});

/** SPEC-36.3.3: a 144" wall, 96" tall, as the elevation builds its left and right chains. */
function chain(runs, soffits, edge) {
  const wall = {
    id: 'wall-1', name: 'Wall 1', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5,
    flipped: false, connections: { start: null, end: null }, profile: {}, runs, openings: [],
    joints: [], endPanels: { start: null, end: null }, landings: { start: null, end: null }, soffits,
  };
  const room = syncRoom({
    id: 'room-1', name: 'Room 1', profile: { ...S.defaultProfile }, walls: [wall], wallOrder: ['wall-1'],
  }, S);
  const resolved = resolveWall(room, room.walls[0]);
  return verticalChains(room, resolved, pickColumnRuns(resolved, null, edge), S, edge)
    .inner.map(({ start, end, kind }) => [kind, start, end]);
}

describe('SPEC-36.3.3 each end of the wall gets its own chain', () => {
  it('gives a bare end its own soffit and no cabinets from the other end', () => {
    // An alcove each end: a base under the left soffit, nothing under the right one.
    const runs = [base('b', 0, 48)];
    const soffits = [soffit('L', 0, 48, 84), soffit('R', 96, 48, 80)];
    expect(chain(runs, soffits, 'left').slice(-3)).toEqual([
      ['countertop', 34.5, 36],
      ['open', 36, 84],
      ['soffit', 84, 96],
    ]);
    expect(chain(runs, soffits, 'right')).toEqual([['open', 0, 80], ['soffit', 80, 96]]);
  });

  it('takes the soffit nearest the edge when none is over the runs', () => {
    const soffits = [soffit('L', 0, 30, 72), soffit('R', 114, 30, 84)];
    expect(chain([], soffits, 'left')).toEqual([['open', 0, 72], ['soffit', 72, 96]]);
    expect(chain([], soffits, 'right')).toEqual([['open', 0, 84], ['soffit', 84, 96]]);
    // A run across the whole wall is on both chains.
    expect(chain([base('w', 0, 144)], [], 'right')[0]).toEqual(['toe-kick', 0, 4]);
  });
});
```

It builds real rooms and uses `pickColumnRuns` the way the elevation does. Don't mock anything in it.

**Count:** 739 + 2 = **741**.

**Done when:** `npm test` (741) and `npm run lint` clean.

## §3 Check by hand

See the end of PROMPTS-36.3.3.

## §4 Left for later

- "Nearest the edge" is measured along the wall, not by alcove. A chain doesn't know about wing walls: with no soffit near its end, it still takes the nearest one, even across the middle.
- A selected run still decides its own side's chain, as before.
