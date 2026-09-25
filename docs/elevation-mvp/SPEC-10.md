# Elevation Lab — Spec 10: Named elevations, dimension-row order, centerline callouts

Extends SPEC.md … SPEC-9.md (steps 1–33 are built, on `feature/elevation-mvp`). Source of truth for steps 34–38.
Codex cannot run the app (it's behind a login): rely on unit tests, `npm run build` and `npm run lint`. If something is ambiguous, pick the simplest option, leave a `// SPEC-QUESTION:` comment, and mention it in your summary.
No storage migration beyond §4.1's single new boolean field, which follows the exact pattern `numberOverride` already uses (default `false`, always present, validated, migrated).

## 0. What this covers

1. **The wall-length input stays fully selected while you drag** — today it only selects once, then a live-updating value quietly clears the selection before you can type over it (§1).
2. **Casing-to-cabinet clearances move to the row closest to the wall** — today they're the outermost (farthest) row (§2).
3. **The overall wall-length dimension is always shown below the wall**, even before any cabinets are drawn on it — matching how the overall wall-height dimension already always shows at the left (§3).
4. **Named elevations** — every wall with at least one cabinet run gets a letter (A, B, C…), independent of its number; an empty wall can be forced in with a checkbox. The letter shows as "Elevation A" below the bottom dimension stack in that wall's elevation view (§4).
5. **A plan-view marker** — a small flagged circle with the letter in it, next to each lettered wall's number marker, pointing at the wall (§5).
6. **A centerline callout** — when a cabinet/element is pinned by its center, a short tick and label appear on the wall 12″ above that cabinet's top, showing the pin's entered offset (§6).

## 1. Wall-length input: keep the value selected while dragging

### 1.1 The bug

`components/LiveEntryInput.jsx` (89 lines) already calls `inputRef.current?.select()` — but only inside a `useEffect` keyed on `[entry.kind, entry.label]` (lines 28–31). For a drawn wall, `beginEntry` is called once with `kind: 'wall-draw', label: 'Wall length'` (`plan/PlanCanvas.jsx` lines ~547–560), and then `updateEntry(length)` fires on every `mousemove` while the pointer is out over the canvas (lines 482–510). Each of those calls re-renders `LiveEntryInput` with a new controlled `value` (the live-tracked length), which resets the input's selection to a collapsed caret — but the effect's dependency array doesn't change (`kind`/`label` are the same every time), so `.select()` never re-fires. By the time you actually start typing, the selection from the very first render is long gone and your keystrokes insert into the middle of the displayed number instead of replacing it.

`useLiveEntry.js`'s `update()` (lines 57–61) already no-ops once `entry.typed !== null` — so once the user types one character, the live mouse-tracked updates stop overwriting `value`, and the selection is never disturbed again. The fix only needs to cover the window *before* the first keystroke.

### 1.2 The fix

In `components/LiveEntryInput.jsx`, re-select whenever the entry's live value changes and nothing has been typed yet:

```js
useEffect(() => {
  if (entry.typed !== null) return;
  inputRef.current?.focus();
  inputRef.current?.select();
}, [entry.kind, entry.label, entry.value, entry.typed]);
```

This keeps the whole displayed number selected on every mouse-driven update, so the user can start typing at any point during the drag and replace it outright. Once `entry.typed` becomes non-null (the user typed something), the effect still runs once more (dependency changed) but returns immediately without touching selection or focus, so an in-progress edit is never disturbed.

This applies to every kind of live entry (`wall-draw`, `wall-length`, `wall-perpendicular`, and any dimension-drag entry elsewhere that reuses this component) — it is a single shared input component, so the fix is global by construction. No other file uses `LiveEntryInput` outside `plan/PlanCanvas.jsx`.

No test: this is a DOM focus/selection behavior and the repo has no component-level test harness (no `@testing-library/*`, no `.test.jsx` files — every existing test is a pure-function test). Keep the diff to the one effect above.

## 2. Casing clearances become the first (closest-to-wall) row

### 2.1 Current stacking, and the reordering

`components/ElevationCanvas.jsx`'s `dimensionOffsets` (lines 306–331) stacks four "below the wall" rows outward from the wall in this order today: piece widths (`lower.inner`) → overall wall length (`lower.outer`) → opening widths (`openings`) → casing clearances (`clearances`, farthest). The JSX at lines ~692–718 renders them in that same order.

Move `clearances` to the front, ahead of the piece widths:

**New order, closest to farthest:** casing clearances → piece widths → overall wall length → opening widths → (new) the "Elevation X" label from §4.4.

### 2.2 Extract a pure offset-stacker

Add this to `canvas/dimensionLayout.js` (71 lines today), alongside the existing `dimensionRowOffsets`:

```js
/**
 * Offsets for the below-wall row stack, wall-first: casing clearances, piece
 * widths, overall wall length, opening widths, then the elevation label.
 */
export function belowRowOffsets({
  clearances: clearanceLevels = 0,
  pieces: pieceLevels = 0,
  overall: overallLevels = 0,
  openings: openingLevels = 0,
} = {}) {
  const clearances = 20;
  const pieces = clearances + 22 + clearanceLevels * 14;
  const overall = pieces + 22 + pieceLevels * 14;
  const openings = overall + 22 + overallLevels * 14;
  const label = openings + 22 + openingLevels * 14;
  return { clearances, pieces, overall, openings, label };
}
```

Same `20` / `22` / `14` constants `dimensionRowOffsets` already uses for the horizontal orientation — only the stacking order changes, not the spacing math.

### 2.3 Wire it into `ElevationCanvas.jsx`

Replace the `openings` / `clearances` lines inside the `dimensionOffsets` `useMemo` (lines 306–331) with:

```js
const clearanceLevels = layoutDimensionRow(dimensionChains.clearances, {
  scale: transform.scale,
}).levels;
// lowerLevels / lowerOuterLevels / openingLevels already computed above, unchanged
const below = belowRowOffsets({
  clearances: clearanceLevels,
  pieces: lowerLevels,
  overall: lowerOuterLevels,
  openings: openingLevels,
});
return {
  lower: { inner: below.pieces, outer: below.overall },
  upper: dimensionRowOffsets('horizontal', upperLevels),
  vertical: dimensionRowOffsets('vertical', verticalLevels),
  openings: below.openings,
  clearances: below.clearances,
  label: below.label,
};
```

`dimensionChains.lower.outer` is now always non-empty after §3, so the old fallback (`dimensionChains.lower.outer.length > 0 ? … : 20`) is gone — `belowRowOffsets` has no conditional branch.

In the JSX (lines ~692–718), reorder the four `<DimensionRow>` elements so `clearances` renders first, followed by `lower.inner`, `lower.outer`, `openings` — same props each already has today, just reordered and reading their offsets from the renamed fields above. `upper.inner`, `upper.outer` (above the wall) and both `vertical` rows are untouched — this step only touches the "below" stack.

### 2.4 What NOT to touch

`dimensionRowOffsets` itself, and its use for `upper` and `vertical`, stay exactly as they are — this step does not change the above-the-wall or side stacking. `dimensionChains.openings` (opening widths) and `dimensionChains.clearances` (casing clearances) are two different chains built by two different functions (`openingChain` vs `openingClearances` in `model/dimensions.js`) — don't conflate them; only their row order changes.

## 3. Overall wall-length dimension always shows

### 3.1 The gap

`model/dimensions.js`'s `horizontalChains(room, wall, band, settings)` (lines 145–217) returns `{ inner: [], outer: [] }` immediately when `runsForBand(wall, band)` is empty (line 147) — so a wall with zero base/tall cabinets shows no bottom overall dimension at all. Contrast `verticalChains` (lines 272–337), whose `outer` is unconditional: `wall.height > SEGMENT_EPSILON ? [{ start: 0, end: wall.height, kind: 'wall' }] : []` (lines 274–276) — the side (height) dimension shows regardless of what's on the wall.

### 3.2 The fix

In `horizontalChains`, change the empty-band early return so `outer` still carries the full wall length, matching the vertical convention:

```js
const runs = runsForBand(wall, band);
if (runs.length === 0) {
  const length = wallLength(wall);
  return {
    inner: [],
    outer: length > SEGMENT_EPSILON ? [{ start: 0, end: length, kind: 'wall' }] : [],
  };
}
```

This applies to both `band === 'lower'` and `band === 'upper'` — the same function serves both, and the vertical chain's precedent is band-agnostic too, so an empty upper band gets its own always-on overall dimension above the wall the same way. If that turns out to be unwanted clutter on walls with no upper cabinets, it's a one-line follow-up to gate this on `band === 'lower'` only — leave a comment noting the choice either way.

### 3.3 Downstream effect

Because `dimensionChains.lower.outer` (and `.upper.outer`) can no longer be empty for any wall with a nonzero length, the `openings` fallback branch removed in §2.3 is safe to delete — there is no longer a case where `lower.outer` is empty on a real wall.

## 4. Named elevations

### 4.1 New wall field: `elevationForced`

A wall gains a fifth persisted field, `elevationForced` (boolean, default `false`) — "force this wall into the elevation lettering even with no cabinets." This is a pure shape addition: no new behavior in this step, suite stays green. Follow the exact same four touch points `numberOverride` already uses:

- `model/room.js` `cloneRoom` (line 48): add `elevationForced: wall.elevationForced ?? false,` beside the `numberOverride` line.
- `store/elevationSlice.js` `createWall` (lines 42–58): add `elevationForced: values.elevationForced ?? false,` beside `numberOverride`. In `updateWall` (lines 357–381), add a boolean-only branch beside the `numberOverride` one: `if (typeof allowedChanges.elevationForced === 'boolean') location.wall.elevationForced = allowedChanges.elevationForced;`.
- `store/persistence.js`:
  - `isWall` (lines 192–201): add `&& typeof wall.elevationForced === 'boolean'` to the conjunction.
  - `normalizeDocument`'s per-wall map (around line 230): add `elevationForced: wall.elevationForced ?? false,` beside `numberOverride`.
  - the old-schema migration block (around line 427): add `elevationForced: false,` beside `numberOverride: null,`.

### 4.2 Deriving letters

Add to `model/topology.js` (240 lines), beside `wallNumbers`:

```js
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Convert a 1-based index to spreadsheet-style letters: 1 -> A, 26 -> Z, 27 -> AA. */
export function indexToLetters(n) {
  let value = n;
  let result = '';
  while (value > 0) {
    result = LETTERS[(value - 1) % 26] + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

/** A wall counts as "with cabinets" for elevation lettering. */
export function wallHasCabinets(wall) {
  return (wall?.runs?.length ?? 0) > 0;
}

/** Return the elevation letter for every wall that has cabinets, or is forced in, in wall order. */
export function elevationLetters(room) {
  const walls = room?.walls ?? [];
  const wallById = new Map(walls.map((wall) => [wall.id, wall]));
  const orderedIds = [
    ...(room?.wallOrder ?? []),
    ...walls.map((wall) => wall.id),
  ].filter((wallId, index, ids) => wallById.has(wallId) && ids.indexOf(wallId) === index);

  const letters = new Map();
  let next = 1;
  for (const wallId of orderedIds) {
    const wall = wallById.get(wallId);
    if (!wallHasCabinets(wall) && !wall.elevationForced) continue;
    letters.set(wallId, indexToLetters(next));
    next += 1;
  }
  return letters;
}

/** "Elevation A", or null when the wall has no letter. */
export function elevationLabel(room, wall) {
  const letter = elevationLetters(room).get(wall.id);
  return letter ? `Elevation ${letter}` : null;
}
```

This deliberately mirrors `wallNumbers` (same ordering source, same iteration shape) but is its own independent sequence with its own rule for who's included — a wall's number and its elevation letter are unrelated once assigned (a wall with no cabinets keeps a number but gets no letter unless forced). There is no override for a *specific* letter — only the boolean force switch from §4.1; letters are always assigned in wall order.

Export all four from `model/index.js`'s existing `topology.js` block (currently `chainOrder, chainOrientation, computeWallOrder, normalizeWallName, nextWallId, wallComponents, wallLabel, wallNumbers, wallNumberWarnings`).

### 4.3 The "Include in elevations" checkbox

In `components/PropertiesPanel.jsx`, `WallHeightProperties` (function starts at line 1342), the wall section currently has a `Name` / `Number` two-column grid (lines 1372–1408). Add a checkbox below that grid, inside the same `<section>`, before the `plan ?` block (line ~1410):

```jsx
{!wallHasCabinets(wall) && (
  <label className="mb-3 flex items-center gap-2 text-xs text-gray-300">
    <input
      type="checkbox"
      checked={Boolean(wall.elevationForced)}
      onChange={(event) => dispatch(updateWall({
        wallId: wall.id,
        changes: { elevationForced: event.target.checked },
      }))}
      aria-label="Include in elevations"
    />
    Include in elevations
  </label>
)}
```

The checkbox only appears once the wall already has no cabinets — a wall with cabinets is lettered automatically and the control would be a no-op (and confusing to uncheck, since it wouldn't remove the letter). Import `wallHasCabinets` from `model/topology.js` alongside the existing `wallLabel` import (line 30).

### 4.4 The bottom "Elevation X" label

In `components/ElevationCanvas.jsx`, after the four reordered `<DimensionRow>` elements from §2.3 (still inside the same `{dimensionChains && dimensionOffsets && (<Layer …>` block), add:

```jsx
{elevationLabel(room, wall) && (
  <Text
    x={wallToScreen({ x: wall.length / 2, z: 0 }, transform).x}
    y={wallToScreen({ x: wall.length / 2, z: 0 }, transform).y + dimensionOffsets.label}
    text={elevationLabel(room, wall)}
    fontSize={13}
    fill="#e2e8f0"
    align="center"
    offsetX={40}
    width={80}
    listening={false}
  />
)}
```

Add `Text` to the existing `react-konva` import (`Layer, Rect, Stage` today, line 12) and `wallToScreen` to the `canvas/transform.js` import (line ~18, which already imports `screenToWall` from the same module — `DimensionRow.jsx` imports `wallToScreen` from there today as precedent). Import `elevationLabel` from `model/topology.js`.

### 4.5 What NOT to touch

`wallLabel`, `wallNumbers`, and the wall-number circle in `plan/PlanWallShape.jsx` are unchanged — the elevation letter is additive, not a replacement for the existing "Wall 2 · Sink wall" numbering. `WallList.jsx` keeps sorting and labeling by number only; this spec doesn't ask for the letter to appear there.

## 5. Plan-view elevation marker

### 5.1 A new small component

`plan/PlanWallShape.jsx` (183 lines) already draws the wall-number circle (a plain `Circle` + `Text`, lines ~155–182) offset from the wall by `wall.thickness + 38/scale` outward and `frame.d * 24/scale` along the wall. Add a second marker for the elevation letter, on the *other* side of the tick mark so it never overlaps the number: same outward offset, `frame.d * -24/scale` along the wall instead of `+24`.

New file `plan/PlanElevationMarker.jsx`:

```jsx
import { Circle, Group, Line, Text } from 'react-konva';

const RADIUS = 9;
const FLAG_LENGTH = 7;

/** A circled letter with a small triangular flag pointing back at the wall. */
export default function PlanElevationMarker({ point, exterior, scale, letter }) {
  const radius = RADIUS / scale;
  const flagLength = FLAG_LENGTH / scale;
  const flagHalfWidth = radius * 0.6;
  const perp = { x: -exterior.y, y: exterior.x };
  const flagBase = {
    x: point.x - exterior.x * radius,
    y: point.y - exterior.y * radius,
  };
  const flagTip = {
    x: flagBase.x - exterior.x * flagLength,
    y: flagBase.y - exterior.y * flagLength,
  };

  return (
    <Group listening={false}>
      <Line
        points={[
          flagBase.x + perp.x * flagHalfWidth, flagBase.y + perp.y * flagHalfWidth,
          flagTip.x, flagTip.y,
          flagBase.x - perp.x * flagHalfWidth, flagBase.y - perp.y * flagHalfWidth,
        ]}
        closed
        fill="#f59e0b"
      />
      <Circle x={point.x} y={point.y} radius={radius} fill="#111827" stroke="#f59e0b" strokeWidth={1.5 / scale} />
      <Text
        x={point.x - radius}
        y={point.y - radius}
        width={radius * 2}
        height={radius * 2}
        text={letter}
        align="center"
        verticalAlign="middle"
        fontSize={10 / scale}
        fill="#fde68a"
      />
    </Group>
  );
}
```

`exterior` is the same `{ x: -frame.n.x, y: -frame.n.y }` vector `PlanWallShape` already computes (line 19) — the flag points from the circle back toward the wall (opposite of `exterior`), which is the direction *toward* the wall since the marker itself sits outward along `exterior`.

### 5.2 Wiring it into `PlanWallShape.jsx`

Near the existing `numberPoint` calculation (lines 26–32), add:

```js
const letter = elevationLetters(room).get(wall.id);
const elevationOffset = wall.thickness + 38 / scale;
const elevationPoint = {
  x: midpoint.x + exterior.x * elevationOffset - frame.d.x * 24 / scale,
  y: midpoint.y + exterior.y * elevationOffset - frame.d.y * 24 / scale,
};
```

Render it right after the existing number `<Text>` (end of the file, ~line 182):

```jsx
{letter && (
  <PlanElevationMarker point={elevationPoint} exterior={exterior} scale={scale} letter={letter} />
)}
```

Import `elevationLetters` from `../model/topology.js` (alongside the existing `wallNumbers` import, line 4) and the new `PlanElevationMarker` component.

### 5.3 What NOT to touch

The wall-number circle, its offset math, and everything else in `PlanWallShape.jsx` (the outline, the tick, the wall-length dimension along the exterior face) are unchanged. `plan/PlanCanvas.jsx` doesn't need any change — `PlanWallShape` already receives `room` as a prop and can call `elevationLetters(room)` itself, the same way it already calls `wallNumbers(room)`.

## 6. Centerline callout

### 6.1 A pure marker-builder

Add to `model/dimensions.js` (360 lines), near `pickColumnRuns`:

```js
/**
 * Return one centerline callout per item pinned by its center: the piece's
 * horizontal center, the z 12" above its top, and the pin's raw entered value.
 */
export function centerlineMarkers(run, pieces) {
  return pieces.flatMap((piece) => {
    if (piece.role !== 'item') return [];
    const item = run.items.find((candidate) => candidate.id === piece.id);
    if (item?.pin?.anchor !== 'center') return [];
    return [{
      pieceId: piece.id,
      x: piece.x + piece.width / 2,
      calloutZ: piece.z + piece.height + 12,
      value: item.pin.value,
      from: item.pin.from,
    }];
  });
}
```

This only looks at `piece.role`, `piece.x/width/z/height`, and `run.items` — it does not call `splitRun` itself, so it can be tested with hand-built piece fixtures (§7). Export it from `model/index.js`'s existing `dimensions.js` block (`pickColumnRuns, verticalChains, verticalOpeningChain`, …).

### 6.2 Rendering it in `RunGroup.jsx`

`components/RunGroup.jsx` (327 lines) already renders one marker per pinned item (the "◆" diamond, lines 278–303) using `result.pieces.flatMap(...)`. Add a second, separate `flatMap` block right after it, using `centerlineMarkers`:

```jsx
{centerlineMarkers(run, result.pieces).map((marker) => {
  const base = wallRectToScreen({ x: marker.x, z: marker.calloutZ - 12, width: 0, height: 0 }, transform);
  const tip = wallRectToScreen({ x: marker.x, z: marker.calloutZ, width: 0, height: 0 }, transform);
  const fromLabel = marker.from === 'right' ? 'from right' : marker.from === 'opening' ? 'from opening' : 'from left';
  return (
    <Group key={`centerline:${marker.pieceId}`} listening={false}>
      <Line points={[base.x, base.y, tip.x, tip.y]} stroke="#facc15" strokeWidth={1} dash={[3, 2]} />
      <Text
        x={tip.x - 40}
        y={tip.y - 14}
        width={80}
        align="center"
        text={`℄ ${formatInches(marker.value)} ${fromLabel}`}
        fontSize={10}
        fill="#facc15"
      />
    </Group>
  );
})}
```

Add `Line` to the existing `react-konva` import (`Group, Label, Rect, Tag, Text` today, lines 2–8) and `formatInches` to a new import from `../model/units.js`. Import `centerlineMarkers` from `../model/dimensions.js` alongside the existing `splitRun` import.

The tick runs from the cabinet's own top (`marker.calloutZ - 12`, i.e. `piece.z + piece.height`) up to 12″ above it (`marker.calloutZ`) — this is per-item, not per-wall, so two centered items at different heights each get their own tick starting at their own top.

### 6.3 What NOT to touch

The existing "◆" pin marker (lines 278–303) is unchanged and keeps showing for *every* pinned item regardless of anchor — the centerline callout is additive and only appears for `anchor === 'center'`. `model/room.js`'s pin-resolution functions (`resolvePinTarget`, `pinTargetsForRun`, `resolvePinnedSpan`) are untouched — this step only reads `item.pin.anchor`/`.value`/`.from`, values those functions already produce and consume.

## 7. Required tests (vitest)

Reuse `dimensions.test.js`'s `roomR()` / `cabinetRun()` helpers (wall A `(0,0)→(120,0)`, wall B `(120,0)→(120,96)`, both 96″ high) unless a test says otherwise. Tolerance `1e-6` where floating point applies.

**`dimensionLayout.test.js` — `belowRowOffsets`**

1. `belowRowOffsets()` (no args) → `{ clearances: 20, pieces: 42, overall: 64, openings: 86, label: 108 }`.
2. `belowRowOffsets({ clearances: 2 })` → `{ clearances: 20, pieces: 70, overall: 92, openings: 114, label: 136 }`.
3. `belowRowOffsets({ pieces: 1, openings: 2 })` → `{ clearances: 20, pieces: 42, overall: 78, openings: 100, label: 150 }`.

**`dimensions.test.js` — `horizontalChains`**

4. `horizontalChains(room, wallA, 'lower', DEFAULT_SETTINGS)` on `roomR()` with `wallA.runs = []` → `{ inner: [], outer: [{ start: 0, end: 120, kind: 'wall' }] }`.
5. Same for `band: 'upper'` on a wall with base runs but no upper runs → `outer` still `[{ start: 0, end: 120, kind: 'wall' }]` (upper band is independently empty of runs, independently gets the full-length segment).
6. A wall with `wall.height` effectively 0 (construct one with `x1,y1,x2,y2` giving `wallLength` 0, if the fixture allows, or skip and note why in the summary if the geometry helper rejects a zero-length wall) → `outer` stays `[]`. If constructing a true zero-length wall is impractical with `roomR()`, this case may be covered by inspection of the `length > SEGMENT_EPSILON` guard instead of a dedicated test — say which in your summary.

**`topology.test.js` — elevation letters**

7. `indexToLetters(1)` → `'A'`; `indexToLetters(26)` → `'Z'`; `indexToLetters(27)` → `'AA'`; `indexToLetters(52)` → `'AZ'`; `indexToLetters(53)` → `'BA'`.
8. Room with three walls in `wallOrder` `['A', 'B', 'C']`: A has one base run, B has no runs and `elevationForced` unset/false, C has no runs and `elevationForced: true`. `elevationLetters(room)` → `Map { 'A' => 'A', 'C' => 'B' }` (B is skipped, C gets the next letter in wall order despite following B).
9. `elevationLabel(room, wallA)` → `'Elevation A'`; `elevationLabel(room, wallB)` → `null` (B has no runs and isn't forced).
10. A wall with `numberOverride` set and cabinets: its elevation letter is independent of the number override — e.g. wall B is `Wall 1` (via `numberOverride: 1`) but still gets elevation letter `'B'` if it's second in `wallOrder` and has cabinets. Confirms the two sequences don't share state.

**`dimensions.test.js` — `centerlineMarkers`**

11. A run with `items: [{ id: 'left', pin: null }, { id: 'mid', pin: { from: 'left', value: 24, anchor: 'center' } }]` and hand-built `pieces: [{ id: 'left', role: 'item', x: 0, width: 24, z: 4, height: 30.5 }, { id: 'mid', role: 'item', x: 24, width: 24, z: 4, height: 30.5 }]` → `centerlineMarkers(run, pieces)` returns exactly one entry: `{ pieceId: 'mid', x: 36, calloutZ: 46.5, value: 24, from: 'left' }`.
12. Add a third piece/item pinned with `anchor: 'left'` (not `'center'`) → still exactly one entry (the `'left'`-anchored pin is excluded).
13. Empty `run.items` or no pins at all → `[]`.

**Persistence (`persistence.test.js`)**

14. A wall lacking `elevationForced` (an old-schema document) normalizes to `elevationForced: false`. `isWall` rejects a wall where `elevationForced` is not a boolean.

**Store (`elevationSlice.test.js`)**

15. `createWall` defaults `elevationForced` to `false`; passing `elevationForced: true` through `values` keeps it. `updateWall` with `changes: { elevationForced: true }` sets it; a non-boolean value (e.g. `1` or `'yes'`) is ignored, mirroring how `numberOverride` rejects non-integers.

All existing tests must keep passing — in particular every test asserting the exact pixel offsets `dimensionRowOffsets`/the old inline `dimensionOffsets` produced for the below-wall stack will need updating to the new order; say which in your summary. `npm test`, `npm run build` and `npm run lint` must pass at the end of every step.

## 8. Explicitly out of scope

Editing an already-assigned elevation letter directly (no override field — only the boolean force switch); showing the elevation letter in `WallList.jsx` or the `ElevationToolbar.jsx` wall-navigation readout; a centerline callout for non-center anchors; a full spanning dimension line from the pin's datum to the centerline (this spec draws a short tick + label, not an extension line back to x=0 or the opening); persisting or animating the plan marker's position during a live wall-length drag; letters beyond what `indexToLetters` naturally produces (no manual "AA" override); changing `wallNumbers`/`numberOverride` in any way.
