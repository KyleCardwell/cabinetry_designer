# Elevation Lab — SPEC-36.3.2 (the soffit on the vertical chain, fixed)

Step 248, after 36.3.1. Written against `01c2b71` (step 247). Baseline **736**.

The code below was run in a scratch copy of the repo against the tests below, and passed ESLint there; Vitest couldn't run there. The new test fails on `01c2b71` and passes with the fix.

| Step | What | Files | Tests after |
|---|---|---|---|
| **248** | Model: the vertical chain stops at a soffit's bottom. The counter height row's colour. | `dimensions.js`, `DimensionRow.jsx`, `soffitChain.test.js` (new) | 739 |

Next: **37** (T-fillers).

## §1 What was wrong (Kyle, 2026-09-30)

With a base run and a soffit, the chain ran from the counter to the ceiling instead of to the soffit's bottom. Step 244 didn't copy SPEC-36.3.1 §2; it wrote its own soffit code, and replaced the SPEC's test with a mocked one that never built a soffit, so nothing caught it:

- `soffitsOn(room, wall)`: the function takes `(wall, side)`. Given the room, it finds no soffits at all, ever.
- `soffit.z`: a soffit's height is `soffit.bottom`. There is no `z`.
- With no runs in the column it never looked for a soffit.
- It labelled the last segment `soffit` even when the open space above it ran past the soffit's bottom.

**Rule change (Kyle, 2026-09-30):** a base run with a soffit elsewhere on the wall should still dimension to the soffit's bottom. The chain stops at the lowest soffit over the column's runs; **when none is over them, at the lowest soffit on that side of the wall**. With no runs, the same. Everything else in SPEC-36.3.1 stands: the split only happens above the last cabinet segment, and only when the soffit's bottom is above it and below the ceiling.

Worked example (the test): a 144" wall, 96" tall; a base at x 24, 48 wide, its counter top at 36.
- Soffit over the base, bottom 84: … countertop 34.5–36 | open 36–84 | soffit 84–96.
- Only a soffit at x 96–144, bottom 78: open 36–78 | soffit 78–96.
- Both: the one over the base wins (84), though the other is lower.
- No soffit: open 36–96, as before.

---

## §2 Step 248 — model: the soffit on the chain

### `src/elevation/model/dimensions.js` (624)

- Replace `columnSoffit` and `soffitBreak` (483–493) with:

```js
/**
 * The soffit a vertical chain stops at (SPEC-36.3.2): the lowest one over the column's runs, or when
 * none is over them (or there are no runs), the lowest one on this side of the wall.
 */
function columnSoffit(wall, runs) {
  const lowest = (soffits) => [...soffits].sort((a, b) => a.bottom - b.bottom)[0] ?? null;
  const soffits = soffitsOn(wall);
  return lowest(soffits.filter((soffit) => runs.some((run) => rangesOverlap(soffit, run))))
    ?? lowest(soffits);
}

/** Where the open space at the top of a chain stops: a soffit's bottom above `cursor`, or null. */
function soffitBreak(wall, runs, cursor) {
  const soffit = columnSoffit(wall, runs);
  if (!soffit) return null;
  return soffit.bottom > cursor - SEGMENT_EPSILON && soffit.bottom < wall.height - SEGMENT_EPSILON
    ? soffit.bottom
    : null;
}
```

- In `stackChain`, the two lines (516–517)

```js
  append(soffitBreak(room, wall, runs), 'open');
  append(wall.height, 'soffit');
```

  become:

```js
  const soffit = soffitBreak(wall, runs, cursor);
  if (soffit !== null) append(soffit, 'open');
  append(wall.height, soffit !== null ? 'soffit' : 'open');
```

- In `verticalChains`, the two lines (598–599)

```js
  append(cursor, soffitBreak(room, wall, [lowerRun, upperRun].filter(Boolean)), 'open');
  append(cursor, wall.height, 'soffit');
```

  become:

```js
  const soffit = soffitBreak(wall, [lowerRun, upperRun].filter(Boolean), cursor);
  if (soffit !== null) append(cursor, soffit, 'open');
  append(cursor, wall.height, soffit !== null ? 'soffit' : 'open');
```

Nothing else in the file changes. `counterHeight` and its test stay as step 244 left them.

### `src/elevation/components/DimensionRow.jsx`

In `KIND_COLORS`, `soffit: '#cbd5e1',` (25) becomes `soffit: '#94a3b8',` and `'counter-height': '#94a3b8',` (26) becomes `'counter-height': '#7dd3fc',` (SPEC-36.3.1: the counter height is light blue, so it stands out).

### New `src/elevation/model/__tests__/soffitChain.test.js`

```js
import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { verticalChains } from '../dimensions.js';
import { gridFromItems } from '../grid.js';
import { resolveWall, syncRoom } from '../room.js';

const S = DEFAULT_SETTINGS;
const NONE = { type: 'none', width: null };
const INSET = { cabinetStyleId: 14 };

const run = (id, cabinetTypeId, overrides = {}) => ({
  id, cabinetTypeId, x: 24, width: 48, z: 4, height: 30.5, depth: cabinetTypeId === CABINET_TYPE_IDS.UPPER ? 12 : 24,
  ends: { left: NONE, right: NONE }, autoCount: false, maxCabinetWidth: null,
  heightMode: 'auto', overrides: {}, anchors: { left: false, right: false },
  grid: gridFromItems(id, [{ id: `${id}a`, kind: 'cabinet', width: null }, { id: `${id}b`, kind: 'cabinet', width: null }]),
  ...overrides,
});

const SOFFIT = {
  id: 'SF', wallSide: 'front', x: 0, width: 144, bottom: 84, depth: 14, molding: 'none', anchors: { left: false, right: false },
};

/** SPEC-36.3.1: a 144" wall, 96" tall, with the given runs and soffits. */
function chains(style, runs, soffits = []) {
  const wall = {
    id: 'wall-1', name: 'Wall 1', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5,
    flipped: false, connections: { start: null, end: null }, profile: {}, runs, openings: [],
    joints: [], endPanels: { start: null, end: null }, landings: { start: null, end: null }, soffits,
  };
  const room = syncRoom({
    id: 'room-1', name: 'Room 1', profile: { ...S.defaultProfile }, walls: [wall], wallOrder: ['wall-1'],
    ...(style ? { style } : {}),
  }, S);
  const resolved = resolveWall(room, room.walls[0]);
  const find = (type) => resolved.runs.find((entry) => entry.cabinetTypeId === type) ?? null;
  const result = verticalChains(room, resolved, {
    lowerRun: find(CABINET_TYPE_IDS.BASE) ?? find(CABINET_TYPE_IDS.TALL),
    upperRun: find(CABINET_TYPE_IDS.UPPER),
  }, S, 'left');
  const shown = (segments) => segments.map(({ start, end, kind }) => [kind, start, end]);
  return { inner: shown(result.inner), middle: shown(result.middle) };
}

describe('SPEC-36.3.2 the vertical chain with a hanging base or a soffit', () => {
  it('shows a hanging base\'s bottom rail whole, and its counter height', () => {
    expect(chains(INSET, [run('b', CABINET_TYPE_IDS.BASE, { hanging: true })]).inner.slice(0, 3)).toEqual([
      ['toe-kick', 0, 4],
      ['frame', 4, 5.5],
      ['frame-opening', 5.5, 33],
    ]);
    expect(chains(INSET, [run('b', CABINET_TYPE_IDS.BASE, { hanging: true })]).middle)
      .toEqual([['counter-height', 0, 36]]);
    expect(chains(null, [run('b', CABINET_TYPE_IDS.BASE)]).middle).toEqual([['counter-height', 0, 36]]);
  });

  it('shows no counter height for a tall', () => {
    expect(chains(null, [run('t', CABINET_TYPE_IDS.TALL)]).middle).toEqual([]);
  });

  it('stops the open space at a soffit\'s bottom, over cabinets or none', () => {
    const base = run('b', CABINET_TYPE_IDS.BASE);
    expect(chains(null, [base], [SOFFIT]).inner.slice(-3)).toEqual([
      ['countertop', 34.5, 36],
      ['open', 36, 84],
      ['soffit', 84, 96],
    ]);
    expect(chains(null, [], [SOFFIT]).inner).toEqual([['open', 0, 84], ['soffit', 84, 96]]);
    // With none over the column's runs, the lowest soffit on the wall; one over them wins.
    const aside = { ...SOFFIT, id: 'SA', x: 96, width: 48, bottom: 78 };
    expect(chains(null, [base], [aside]).inner.slice(-2)).toEqual([['open', 36, 78], ['soffit', 78, 96]]);
    expect(chains(null, [base], [aside, { ...SOFFIT, width: 72 }]).inner.slice(-2))
      .toEqual([['open', 36, 84], ['soffit', 84, 96]]);
    expect(chains(null, [base]).inner.at(-1)).toEqual(['open', 36, 96]);
  });
});
```

It builds real rooms through `syncRoom` and `verticalChains`: don't mock anything in it.

Working: SPEC-36.3.1 §2. The hanging base and the counter height already work on `01c2b71` (this file checks them end to end); the soffit test is the one that fails there.

**Count:** 736 + 3 = **739**.

**Done when:** `npm test` (739) and `npm run lint` clean.

## §3 Check by hand

See the end of PROMPTS-36.3.2.
