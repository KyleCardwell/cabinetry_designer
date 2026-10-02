# SPEC-38.5 — Stacked runs leave the horizontal chains

Bug fix before round 39. One step: **286.2**. Baseline **847** (after 286.1); **849** after.

## Problem

In `G6 Stacked runs`, the console warns `Encountered two children with the same key, run:0:101` from `DimensionRow`. `horizontalChains()` puts every run of a band into the band's chains, and a run stacked on or under another run in the same band (a panel run on a base, a middle upper held under an upper) covers the same x range. That gives two overlapping `run` segments in the outer chain and overlapping pieces in the inner chain. They draw on top of each other, one run's click and drag target covers the other's, and the duplicate React keys can make React drop or duplicate a segment.

The golden snapshot (step 287) records `horizontalChains` for every face, so this goes in before 287.

## Decision (Kyle, 2026-10-02)

- **A band's horizontal chains measure only the bottom run of each stack.** A run whose `stack.below` or `stack.above` points to a run **in the same band** is left out of that band's inner and outer chains. The stack's vertical chain (SPEC-35) already measures it.
- A stack link to a run in a different band doesn't count (the budgeted middle run is an upper that sits on a base: it still drops out of the upper band, because it's held under the upper).
- Stack links can't form a cycle (`stackCreatesCycle`), so every stack keeps at least one run in the chains.
- `DimensionRow` keys each segment by its index too, so no two segments can ever collide.
- **Later, not this step:** a stacked run loses its dimension segment as a click/drag target. Selection gets a right-click (or Alt-click) list of everything under the cursor (face, cabinet, run, stacked runs), with a hover highlight on the canvas. A plain click keeps today's behavior, and there's no click-to-cycle. Logged in `TODO.md`.

## §1 `dimensions.js`

Import (≈ 23):

```js
import { stackLeaders, stackOf } from './stacks.js';
```

Replace `runsForBand` (≈ 67–75) with:

```js
/**
 * The runs a band's horizontal chains measure, left to right. A run stacked on or under another run
 * in the same band is left out: its stack's vertical chain measures it (SPEC-38.5).
 */
function runsForBand(wall, band) {
  const matches = band === 'lower'
    ? (run) => (
      run.cabinetTypeId === CABINET_TYPE_IDS.BASE
      || run.cabinetTypeId === CABINET_TYPE_IDS.TALL
    )
    : (run) => run.cabinetTypeId === CABINET_TYPE_IDS.UPPER;
  const inBand = wall.runs.filter(matches);
  const ids = new Set(inBand.map((run) => run.id));
  return inBand
    .filter((run) => !stackLeaders(run).some((id) => ids.has(id)))
    .sort((a, b) => a.x - b.x);
}
```

`runsForBand` is used only by `horizontalChains`. `neighborSegments`, `pickColumnRuns` and `verticalChains` don't change.

## §2 `DimensionRow.jsx`

The segment group key (≈ 259) becomes:

```jsx
          <Group key={`${index}:${segment.kind}:${segment.start}:${segment.end}`}>
```

## §3 Test

In `src/elevation/model/__tests__/stacks.test.js`, line 3 becomes:

```js
import { horizontalChains, pickColumnRuns, verticalChains } from '../dimensions.js';
```

Append at the end of the file:

```js

describe('SPEC-38.5 stacked runs in the horizontal chains', () => {
  const runIds = (chain) => chain.filter((segment) => segment.kind === 'run').map((segment) => segment.runId);
  const ranges = (chain) => chain.map((segment) => `${segment.start}:${segment.end}`);

  it('measures only the bottom run of a stack in each band', () => {
    const room = syncRoom(budgeted(), S);
    const wall = room.walls[0];
    const upperChains = horizontalChains(room, wall, 'upper', S);
    expect(runIds(upperChains.outer)).toEqual(['U']);
    expect(upperChains.inner.some((segment) => segment.runId === 'M')).toBe(false);
    expect(runIds(horizontalChains(room, wall, 'lower', S).outer)).toEqual(['B']);
  });

  it('leaves no overlapping run segments for a base stacked on a base', () => {
    const top = makeRun('T', BASE, {
      heightMode: 'manual', z: 36, height: 12, stack: { below: link('B'), above: null },
    });
    const room = syncRoom(rawRoom([base(), top]), S);
    const { inner, outer } = horizontalChains(room, room.walls[0], 'lower', S);
    expect(runIds(outer)).toEqual(['B']);
    expect(new Set(ranges(outer)).size).toBe(outer.length);
    expect(inner.some((segment) => segment.runId === 'T')).toBe(false);
  });
});
```

Both tests fail before §1 and pass after.

## Verified

Run in a scratch copy of `d93e169`: both new tests fail without §1; with §1–§3, `npm test` is 849 passing (91 files) and `npm run lint` is clean.

## Effect on round 39

Every test count in PROMPTS-39 is **5 higher** than written (844-based; 38.4 added 3, 38.5 adds 2). Line ranges don't change: `dimensions.js` grows 8 lines but round 39 cuts no ranges from it, and `ElevationCanvas.jsx`, `room.js`, the slice and `PlanCanvas.jsx` aren't touched. `DimensionRow.jsx` changes one line; step 293 still doesn't touch it.
