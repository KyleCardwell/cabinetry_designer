# Elevation Lab — SPEC-37.4 (fixes: the door crash, wing walls on the elevation, run selection in plan)

Steps 267–269, after 37.3. Written against `375f3f2` (step 266). Baseline **801**.

The code below wasn't run before this was written (Codex implements it). If a test fails, check its expected value against §1 before changing the code.

| Step | What | Tests after |
|---|---|---|
| **267** | Fix: selecting a door or window crashes the elevation | 801 |
| **268** | Model: the elevation's wall row shows wing walls too, with or without cabinets | 802 |
| **269** | Plan: a selected run isn't a selected wall, and Delete deletes the run | 802 |

Next: **38** (combine and full grids).

## §1 What's wrong, and the rules (Kyle, 2026-10-01)

### 1. Clicking a door crashes the elevation

`TypeError: Cannot read properties of undefined (reading 'length') at ElevationCanvas.jsx:424`. With a door or window selected, the vertical chain at the opening's end comes from `verticalOpeningChain`, which returns `{ inner, outer }`. Round 36.3.1 added a `middle` row (counter height) to the cabinet chains, and the canvas reads `vertical.left.middle.length` and `vertical.right.middle.length` (415–425, 496, 501, 1742…). The opening chain never got `middle`. **Fix:** `verticalOpeningChain` returns `middle: []` (an opening has no counter height). Nothing else changes.

### 2. Wing walls on the elevation's horizontal dimensions

Plan view has a row along each wall face (SPEC-36.3.1): wall end → wing wall, the wing wall's thickness, → the next one or a door/window, → the other end. The elevation only has a row for doors and windows (`openingChain`, below the cabinet chains). Wing walls show up on the elevation only as breaks in the gaps *between* cabinet runs, and not at all on a wall with no cabinets.

- **The elevation's opening row becomes the wall row.** It holds every door and window (as now: its own reference edges, jamb or casing per the opening's measure mode, still with its id and label) **and every wing wall landing on that face**, shown at its thickness (kind `'wall'`, with the wing wall's `wallId`), with gaps between them and to the wall ends. Same order as plan: left to right.
- **With or without cabinets.** The row shows whenever the face has a door, window or wing wall, whatever runs there are.
- **Openings keep the elevation's measure mode.** Plan always measures openings to the outside casing; the elevation keeps each opening's own setting (jamb or casing), as it does today.
- The cabinet chains are unchanged (they still break their gaps at a wing wall).

Worked example (the test): a 246" wall, a 36" door with its jamb 24" from the left (measure mode jamb, 3" casing), a 9" wing wall landing at 120. The row: gap 0–24 | door 24–60 | gap 60–120 | wing wall 120–129 | gap 129–246. Without the door: gap 0–120 | wall 120–129 | gap 129–246. A bare wall: no row.

### 3. Plan: clicking a run also selects its wall, and Delete offers to delete the wall

Selecting a run in plan calls `setActiveWall` (so the elevation shows that wall) and then selects the run. `selection.wallId` stays set, and plan treats the wall with `selection.wallId` as selected: it's highlighted, it gets the move handle, and Delete/Backspace asks "Delete this wall and its runs?".

- **A wall is only "selected" in plan when nothing on it is selected.** With a run, an opening, a soffit or a wall end panel selected, the wall isn't highlighted, has no move handle, and Delete doesn't touch it. `selection.wallId` itself doesn't change: it's still the active wall the elevation shows.
- **Delete with a run selected deletes that run**, straight away, as it does in the elevation. (Openings already delete themselves.)

---

## §2 Step 267 — Fix: the opening's vertical chain

**Files:** `src/elevation/model/dimensions.js` (713), `src/elevation/model/__tests__/dimensions.test.js` (800).

### `src/elevation/model/dimensions.js`

`verticalOpeningChain` (≈ 694–713): its return becomes

```js
  return {
    inner,
    // An opening has no counter height (the cabinet chains' middle row, SPEC-36.3.1).
    middle: [],
    outer: wall.height > SEGMENT_EPSILON
      ? [{ start: 0, end: wall.height, kind: 'wall' }]
      : [],
  };
```

### `src/elevation/model/__tests__/dimensions.test.js`

The two `verticalOpeningChain(...)` expectations (748 and 758) use `toEqual` on the whole result: add `middle: [],` to each expected object, between `inner` and `outer`. No other test changes.

**Count:** unchanged, **801**.

---

## §3 Step 268 — Model: wing walls in the elevation's wall row

**Files:** `src/elevation/model/dimensions.js` (716), `src/elevation/model/__tests__/wallFaceRow.test.js` (60).

### `src/elevation/model/dimensions.js`

`openingChain` (91–127) becomes (`landingsOn` is already imported; `room` is now used):

```js
/**
 * The elevation's wall row (SPEC-37.4): every door and window by its own reference edges (jamb or
 * casing, per its measure mode), and every wing wall landing on this face at its thickness, with the
 * gaps between them and to the wall's ends. Shown with or without cabinets; [] when there's nothing.
 */
export function openingChain(room, wall, settings) {
  const length = wallLength(wall);
  const ranges = [
    ...(wall.openings ?? []).map((opening) => {
      const geometry = openingGeometry(opening, length, settings);
      const reference = opening.measureMode === 'casing' && geometry.casing
        ? geometry.casing
        : geometry.jamb;
      const start = geometry.offsets.left[opening.measureMode].edge;
      return {
        start,
        end: start + reference.width,
        metadata: { kind: 'opening', openingId: opening.id, label: opening.label },
      };
    }),
    ...landingsOn(room, wall).map(({ a, b, wallId }) => ({
      start: a,
      end: b,
      metadata: { kind: 'wall', wallId },
    })),
  ].sort((a, b) => a.start - b.start || a.end - b.end);
  if (ranges.length === 0) return [];

  const segments = [];
  let cursor = 0;
  for (const range of ranges) {
    const start = Math.min(length, Math.max(cursor, range.start));
    const end = Math.min(length, Math.max(start, range.end));
    appendSegment(segments, cursor, start, 'gap');
    segments.push({ start, end, ...range.metadata });
    cursor = end;
  }
  appendSegment(segments, cursor, length, 'gap');
  return segments;
}
```

The opening segments keep exactly the keys they have now (`start, end, kind, openingId, label`), so the existing opening tests pass unchanged. Check that `landingsOn` is in the `./landings.js` import at the top of the file; `horizontalChains` already uses it.

`ElevationCanvas.jsx` needs no change: it already draws `dimensionChains.openings` in its own row below the cabinets, makes room for it when it isn't empty, and `DimensionRow` already colors `'wall'` segments.

### `src/elevation/model/__tests__/wallFaceRow.test.js`

Add `import { openingChain } from '../dimensions.js';` (after the `constants.js` import) and append:

```js
describe('SPEC-37.4 the wall row in elevation', () => {
  it('shows each wing wall at its thickness beside the doors and windows, with or without them', () => {
    const wing = makeWall('W1', 120, 0, 120, 30, { thickness: 9 });
    let room = makeRoom([makeWall('H', 0, 0, 246, 0, { openings: [DOOR] }), wing]);
    room = landWallEnd(room, 'W1', 'start', { wallId: 'H', side: 'front', x: 120 });
    expect(openingChain(room, host(room), S)).toEqual([
      { start: 0, end: 24, kind: 'gap' },
      { start: 24, end: 60, kind: 'opening', openingId: 'D', label: 'D1' },
      { start: 60, end: 120, kind: 'gap' },
      { start: 120, end: 129, kind: 'wall', wallId: 'W1' },
      { start: 129, end: 246, kind: 'gap' },
    ]);

    let bare = makeRoom([makeWall('H', 0, 0, 246, 0), wing]);
    expect(openingChain(bare, host(bare), S)).toEqual([]);
    bare = landWallEnd(bare, 'W1', 'start', { wallId: 'H', side: 'front', x: 120 });
    expect(openingChain(bare, host(bare), S)).toEqual([
      { start: 0, end: 120, kind: 'gap' },
      { start: 120, end: 129, kind: 'wall', wallId: 'W1' },
      { start: 129, end: 246, kind: 'gap' },
    ]);
  });
});
```

(The door's jamb is 24–60 because its measure mode is `jamb`; plan's row for the same wall measures it 21–63 to the outside casing. The wing wall's numbers match the SPEC-36.3.1 plan test above it in this file.)

**Count:** 801 + 1 = **802**.

---

## §4 Step 269 — Plan: a selected run isn't a selected wall, and Delete deletes it

**Files:** `src/elevation/plan/PlanCanvas.jsx` (1253).

1. **What counts as the selected wall** (line 116):

```js
  // The active wall is only selected in plan when nothing on it is (SPEC-37.4): a selected run,
  // opening, soffit or wall end panel isn't its wall.
  const wallItselfSelected = !selection.runId && !selection.openingId && !selection.soffitId
    && !selection.endPanel;
  const selectedWall = wallItselfSelected
    ? walls.find((wall) => wall.id === selection.wallId) ?? null
    : null;
```

2. **The highlight** (≈ 1019): `isSelected={wall.id === selection.wallId}` becomes `isSelected={wall.id === selectedWall?.id}`.

3. **Delete** (the keydown effect, 427–451): after the `selection.openingId` branch and before `if (!selectedWall) return;`, add

```js
      if (selection.runId) {
        const runWall = walls.find((wall) => wall.runs.some((run) => run.id === selection.runId));
        if (!runWall) return;
        event.preventDefault();
        dispatch(deleteRun({ wallId: runWall.id, runId: selection.runId }));
        return;
      }
```

add `deleteRun` to the `elevationSlice.js` import (beside `deleteOpening` and `deleteWall`, 59–76), and add `selection.runId` to the effect's dependency list.

Everything else that reads `selectedWall` (the move handle, the wall-move preview, the label position) then follows on its own: none of it shows while a run is selected. The effect at 330–332 keeps `selection.wallId` as it is.

**Count:** unchanged, **802** (no component tests; `npm run build` is the check).
