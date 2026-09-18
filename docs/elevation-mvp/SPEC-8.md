# Elevation Lab — Spec 8: Editing gestures, positions, pins and clearances

Extends SPEC.md … SPEC-7.md (steps 1–25 are built). Source of truth for steps 26–31.
Codex cannot run the app (it's behind a login): rely on unit tests, `npm run build` and `npm run lint`. If something is ambiguous, pick the simplest option, leave a `// SPEC-QUESTION:` comment, and mention it in your summary.
One storage change, in §3, with a migration. Everything else is additive and defaults when missing.

## 0. What this covers

Six things, in dependency order:

1. **Two bugs** — canvas panning snapping back, and openings dragging without being selected first (§1, §2).
2. **Crown by total height**, not by overlap (§3).
3. **Live numeric entry** — a shared click → move → type → Enter gesture (§4).
4. **Wall length that propagates orthogonally**, and corner handles that become length arrows (§5).
5. **Position readouts** — edge and center, from either wall end, for openings and runs (§6).
6. **Cabinet center pins** (§7) and **casing clearance anchors** with their dimension row (§8).

## 1. Fix: panning snaps back after a zoom

**Symptom.** Zoom with the wheel, then drag the canvas to pan. While the mouse is down the view moves; on release it jumps back to where the zoom left it. The zoom sticks, the pan does not. Both canvases.

**Cause to confirm.** Both canvases pan by making the Konva `Stage` itself draggable and, in `onDragEnd`, folding `stage.x()/stage.y()` into React state before resetting the node with `stage.position({x: 0, y: 0})`:

```js
// ElevationCanvas.jsx — and the same shape in PlanCanvas.jsx
const handleStageDragEnd = useCallback((event) => {
  if (event.target !== stageRef.current) return;
  const stage = event.target;
  setView((current) => panView(current, stage.x(), stage.y()));
  stage.position({ x: 0, y: 0 });
}, []);
```

That commit races the imperative reset and the next react-konva reconcile, and the guard silently drops the gesture whenever `event.target` isn't the stage node. Report what you actually find, but **do not fix it by tuning that handler** — replace the mechanism.

**Fix.** Pan from pointer events, with the view as the single source of truth. Neither canvas's `Stage` is `draggable` any more.

- On `pointerdown` on empty canvas (no shape hit, no active tool gesture, no live entry from §4), record the pointer position and start panning.
- On `pointermove` while panning, apply the **delta since the previous move** to the view (`panView` in the elevation, `setPan` in plan) and update the recorded position. The view moves live, every frame, which it doesn't today.
- On `pointerup`, `pointercancel`, or the pointer leaving the window, stop panning. Nothing to reconcile — the state was already correct on the last move.
- Middle-drag and space-drag pan regardless of the active tool; left-drag pans only under the `select` tool, as today.

Keep `zoomViewAt` and `panView` exactly as they are — the math is fine, only the plumbing is wrong.

**Test.** `panView` and `zoomViewAt` compose: zoom 2× about (300, 200), then pan by (−40, 15), then zoom 2× about the same point again, and assert the wall point under (300, 200) is unchanged across all three steps. Konva behavior is not unit-testable here; the regression guard is that no component calls `stage.position()` to compensate for its own drag.

## 2. Fix: an opening must be selected before it can be moved

`OpeningShape.jsx` sets `draggable = selectable && Boolean(onMove)`, so any opening under the select tool picks up on mousedown and a stray click moves it. Same in `plan/PlanOpening.jsx`.

- `draggable` becomes `selected && selectable && Boolean(onMove)`.
- Cursor: `pointer` when not selected, `ew-resize` (elevation) or `move` (plan) when selected.
- First click selects. A second press on an already-selected opening begins the move — as a live entry (§4), not a raw drag.

The same rule already holds for runs; this just brings openings in line.

## 3. Crown specified by total height

Today `DEFAULT_PROFILE` stores `crownOverlap` and `moldingStack(profile) = topMoldHeight + crownHeight − crownOverlap`. The number people actually say is the total — "a 6" crown" — and the overlap is whatever the chosen profiles make it.

- `DEFAULT_PROFILE`: replace `crownOverlap: 1.5` with **`crownStackHeight: 6`**. (The default parts, 3" top mold and 4 1/2" crown, already total 6" at the old 1 1/2" overlap, so nothing visibly moves.)
- `moldingStack(profile)` becomes `profile.crownStackHeight`.
- New derived helper `crownOverlap(profile) = profile.topMoldHeight + profile.crownHeight − profile.crownStackHeight`. Display only — nothing in the geometry consumes it.
- `PROFILE_KEYS` comes from `Object.keys(DEFAULT_PROFILE)`, so wall and room profile overrides follow automatically. `RUN_OVERRIDE_KEYS` has no crown key and does not change.

**UI.** `RoomHeightsPanel` (and the wall profile override, wherever it appears) shows Top mold, Crown and **Crown total** as inputs, with a read-only line beneath: `Overlap 1 1/2"`. When the derived overlap is negative, that line reads `Gap 1/2"` instead, in muted amber. No diagnostic, no error — a gap between the parts is a legitimate detail, it just gets stated.

**Migration.** Bump `ELEVATION_SCHEMA_VERSION` to 3 with a new storage key `cd.elevationLab.v3`, keeping the v2 key and validator for rollback exactly as v1 is kept today. `migrateV2Document` rewrites every profile object — `settings.defaultProfile`, each `room.profile`, each partial `wall.profile` — by setting `crownStackHeight = topMoldHeight + crownHeight − crownOverlap` and deleting `crownOverlap`. A partial `wall.profile` that carries only some of the three keys inherits the missing ones from the room profile for the arithmetic, then stores only `crownStackHeight`.

## 4. Live numeric entry

One shared gesture, used by four things. Click a handle, release, the thing follows the pointer, and a real HTML input floats over the canvas showing the live value. Type an exact number and press Enter, or just press Enter to take the value the mouse is showing, or click once more to take it. Esc cancels and puts everything back.

### 4.1 The hook — `canvas/useLiveEntry.js` (new)

```js
useLiveEntry() -> {
  entry,        // null, or { kind, label, value, typed, min, max, unit }
  begin(config),// config: { kind, label, value, min, max, onCommit(value), onCancel() }
  update(value),// from pointer motion; ignored once the user has typed
  setTyped(text),
  commit(),     // uses the typed value when parseInches succeeds, else entry.value
  cancel(),
}
```

- `update(value)` clamps to `[min, max]` and is a no-op while `typed` is set, so moving the mouse never overwrites what was typed.
- `commit()` calls `onCommit` with the resolved value and clears the entry. `cancel()` calls `onCancel` and clears.
- Only one entry is live at a time. Beginning a new one cancels the old.

The value is always a single number in inches. A second field (the angle when drawing a non-ortho wall) is out of scope; when Ortho is off, wall drawing keeps its current free behavior.

### 4.2 The input — `components/LiveEntryInput.jsx` (new)

A plain absolutely-positioned `<div>` inside the canvas container — **not** a Konva node, so it gets real focus and real keystrokes. It renders the label, an `InchInput`-style text field showing `formatInches(entry.value)` while untyped and the raw text once typed, and a hint line: `Enter to set · Esc to cancel`. It auto-focuses on mount, follows the pointer with a small offset, and stays inside the container bounds.

### 4.3 Canvas wiring

While an entry is live: the stage does not pan, tool clicks are inert, and `Escape` cancels rather than clearing the selection. A single left click on the canvas commits.

The four gestures:

| Gesture | Value shown | Commit dispatches |
|---|---|---|
| Wall perpendicular move | signed offset along `frame.n`, `signedInches` formatting | `moveWallPerpendicular` |
| Corner length arrow (§5) | that wall's new length | `setWallLength` |
| Drawing a wall (Ortho on) | length of the segment being drawn | `addWallSegment`, then the chain continues from the new point with a fresh entry |
| Moving an opening | distance from the opening's own reference end, in its own measure mode | `moveOpening` |

Each keeps its existing live preview (`wallMovePreview`, `WallDrawPreview`, the opening's own rectangles) driven by the entry value rather than by the raw pointer, so typing a number redraws the preview before you commit.

The wall perpendicular handle and the opening both change from *drag* to *click, move, click*. Run edge stretching keeps its current drag — it has its own snap behavior and wasn't asked for.

## 5. Wall length that propagates orthogonally

### 5.1 The primitive

`plan/wallOps.js`:

```js
setWallLength(room, wallId, length, growEnd) -> walls
```

`growEnd` is `'left' | 'right'` in **elevation** terms, resolved through `wallFrame` to an endpoint, exactly as `cornerAt` does. `Δ = length − currentLength`, signed positive when the wall gets longer.

- **Free end** (no connection): move that endpoint along the wall's own direction by `Δ`. This is today's behavior, generalized to either end.
- **Connected end**: keep this wall's direction *and* the neighbor's direction, and translate the neighbor bodily. With `aOut` the unit vector pointing out of this wall at that end, and `nB` the neighbor's interior normal from `wallFrame`:

  ```
  s = Δ · dot(aOut, nB)
  ```

  then delegate to `moveWallPerpendicular(room, neighborId, s)`, which already re-intersects the neighbor's line with *its* neighbors and so carries the change around the chain. At a 90° corner `dot(aOut, nB)` is ±1 and `s` is ±Δ. If `|dot(aOut, nB)| < 1e-6` the walls are parallel and the call fails with `parallel-neighbor`.

Returns `{ok, reason, walls}` like `moveWallPerpendicular`, and inherits its `neighbor-too-short` rejection.

The old two-argument `setWallLength(room, wallId, length)` is replaced, not kept — it's the source of the "wonky angles" problem, since moving the shared endpoint along one wall rotates the other. Update its one caller in the slice.

### 5.2 Slice and panel

`setWallLength` in `elevationSlice.js` takes `growEnd` in its payload, defaults it to `'right'`, and rejects with `state.message` when the pure function fails.

In the wall properties panel the Length input gets a `‹` and a `›` button beside it, selected before you commit, saying which end absorbs the change. Neither is sticky — they are a per-edit choice, and the one pointing at a free end is preselected when exactly one end is free.

### 5.3 Corner handles become length arrows

`WallEndpoints` today gives every endpoint a free drag handle, which is what lets a corner rotate its neighbors.

When `settings.orthoWalls` is on and the endpoint **is connected**, replace the free handle at that corner with **two arrow handles**, one per wall meeting there, each drawn along its own wall's direction pointing away from the corner. Clicking an arrow begins a live entry (§4) whose value is that wall's length and whose commit is `setWallLength(thatWall, value, thatEnd)` — so dragging the arrow lengthens that wall while every angle in the chain is preserved.

- Unconnected endpoints keep the free drag handle unchanged.
- With `settings.orthoWalls` off, connected endpoints keep the free drag handle too.
- Holding `Alt` while pressing a corner forces the free drag even with Ortho on, for deliberate reshaping.

The arrows are small filled triangles, `#22d3ee`, sized in screen pixels (`/scale`) like the existing handles, offset about 14px from the corner so they don't collide with each other or with the corner marker.

## 6. Position readouts — edge and center, from either end

A wall-local span (an opening's rectangle, a run) can be described four ways against the wall. These are all conversions of one stored number; none of them is new state.

### 6.1 `model/positions.js` (new)

```js
positionReadouts(start, width, wallLength) -> {
  left:  { edge: start,                      center: start + width / 2 },
  right: { edge: wallLength - start - width, center: wallLength - start - width / 2 },
}

startFromReadout(from, anchor, value, width, wallLength) -> start
// from: 'left'|'right', anchor: 'edge'|'center'
```

Round trip: `startFromReadout(from, anchor, positionReadouts(s, w, L)[from][anchor], w, L) === s` for every combination.

### 6.2 Openings

The opening gains one field: **`offsetAnchor: 'edge' | 'center'`**, default `'edge'`. `offset` now means "distance from the `offsetFrom` end to the `offsetAnchor` of the reference rectangle", where the reference rectangle is the jamb or the casing per `measureMode`, as it already is. `openingGeometry` uses `positionReadouts` internally and returns

```js
offsets: {
  left:  { jamb: {edge, center}, casing: {edge, center} },
  right: { jamb: {edge, center}, casing: {edge, center} },
}
```

This replaces the flat `offsets.left.jamb` number from SPEC-7 §2.1. Update every reader — `OpeningShape`, `PlanOpening`, `openingChain`, the panel — and the SPEC-7 tests that assert the flat shape.

`setOffsetSide` gains a sibling `setOffsetAnchor(opening, anchor, wallLength, settings)`. Like the others, it rewrites the stored number so the resolved geometry is **identical** before and after.

**Panel.** The four read-only distances become a 2 × 2 grid for the active measure mode:

```
              edge        center
Left end      24"         42"
Right end     60"         78"
```

Each of the four cells is an inch input. Typing in any one of them sets `offset`, `offsetFrom` and `offsetAnchor` to that cell, so the cell you type in becomes the one that's stored and stays fixed when the wall changes length. The cell matching the current stored triple is highlighted. Beneath the grid, one muted line gives the same four numbers in the *other* measure mode, read-only.

### 6.3 Runs

A run already stores an absolute `x`, so it needs no new field. The run properties panel replaces the single `x` input with the same 2 × 2 grid, every cell writing `run.x` through `startFromReadout`. Center cells are shown in the muted style — per your note, a run's edge is the number that matters and the center is there for reference.

An anchored side's cells are read-only, since the anchor derives the position.

## 7. Cabinet center pins

**On the width question: the pinned cabinet's width does not have to be fixed.** It stays auto. What the pin fixes is *where the run splits*, and the width the pinned cabinet ends up with is the one the splitter would have given it anyway — it simply stops being equal to its siblings, because its neighbors are the ones that absorb the offset.

### 7.1 Data

`Item` gains an optional `pin`:

```js
pin: {
  anchor: 'center' | 'left' | 'right',   // which edge of the CABINET is pinned
  from: 'left' | 'right' | 'opening',    // datum
  openingId: string | null,              // required when from === 'opening'
  openingAnchor: 'center' | 'casing-left' | 'casing-right' | 'jamb-left' | 'jamb-right',
  value: number,                         // inches from the datum; 0 is normal for an opening
} | null
```

Only `kind: 'cabinet'` items may carry a pin. Setting one sets `run.autoCount = false`, consistent with every other manual item edit.

A cabinet item also gains an optional **`absorb: true`** flag, marking it as the one that takes the odd remainder in a segment that has no flex filler (§7.2). At most one per segment; if several are marked, the leftmost wins.

`resolvePinTarget(pin, wall, wallLength, settings) -> number | null` returns the wall-local x the pinned anchor must land on, or null when it can't resolve (a deleted opening). An unresolvable pin is ignored with a `pin-unresolved` warning.

### 7.2 Splitter

`splitRun(run, settings, opts)` gains `opts.pinTargets: Record<itemId, number>` — resolved wall-local positions, supplied by `model/room.js` where the wall context is available. With no pins, behavior is byte-identical to today.

With pins, two passes:

1. **Pass 1** — run the existing algorithm unchanged, ignoring pins. This gives every item a width, including the pinned ones.
2. **Pass 2** — for each pinned item, using its pass-1 width `w`, compute its left edge from the target:
   `left = target − (anchor === 'center' ? w / 2 : anchor === 'right' ? w : 0)`.
   Clamp so the pinned items stay in list order and every resulting segment can hold its contents at their minimums; any clamping emits `{code: 'pin-unreachable', pieceId, message}` with the requested and actual positions. Then split the item list at each pinned item and solve each segment with the existing core over its own span. The left segment carries the run's left end piece and its flex filler, the right segment the right end, and any middle segment neither.

Pinned items keep their pass-1 width in pass 2 — that is what makes "auto width, pinned center" well-defined.

**One pin.** Both segments touch a run end, so both have a flex filler and both solve on your `roundTo` step exactly as usual. Nothing below applies.

### 7.2.1 Two or more pins

Two wall-mounted faucets on one vanity wall is the case this exists for. Three rules, in this order.

**Pinned widths become fixed.** The moment a second pin exists on a run, every pinned cabinet in it has its width written into `item.width` — its pass-1 width, rounded to `settings.roundTo` — so it becomes an ordinary locked cabinet you can retype. This is a **reducer action**, not solver behavior: it happens once, when the pin is added, and it is visible in the pieces list as a lock. Removing a pin does not unlock it again; nothing changes width behind your back.

Once both pinned cabinets are fixed, each one's span is fully determined by its target and its width, so only the segments between and beside them are still variable.

**An interior segment concentrates the remainder in one cabinet.** A segment between two pins has no flex filler, and this spec never inserts one. Instead:

- Every auto cabinet in the segment except the absorber gets `floorTo(available / n, settings.roundTo)`.
- The **absorber** takes whatever is left, so the segment sums exactly.
- The absorber is the item flagged `absorb: true`, or, with no flag, the **last** auto in the segment — the existing "last auto takes the remainder" convention.
- The absorbing piece carries `absorbed: <difference from the base width>` in its output. That is informational, shown in the panel and on the piece label; it is **not** a warning, because it's the intended behavior. The `widths-not-rounded` warning does not fire for an interior pin segment.
- A segment with exactly one auto simply takes the whole span. A segment with **no** auto cabinet and a non-zero span errors `pin-gap`, with a message naming the two pins — widen a pinned cabinet or add a filler item yourself.

This rule applies **only inside pin segments**. A run with no pins is untouched, so SPEC §11 test 7 and every other existing case stand exactly as written.

**Reaching an unreachable pin.** A segment that can't hold its contents at their minimums is resolved in this order:

1. **Grow the run outward at a free end.** A left-segment shortfall extends `run.x` left; a right-segment shortfall extends the right edge. "Free" means `anchors[side]` is falsy — an end anchored to a corner or a casing cannot move. Growth is clamped by `settings.maxRunOverhang` and by `validateRunPlacement`, so it never pushes the run into another run.
2. **Otherwise, clamp the pin** to the nearest position that does fit and emit `{code: 'pin-unreachable', pieceId, message}` naming the requested and actual centers.

Growing the run **cannot** help a middle segment — the span between two pins is set by the pins and their now-fixed widths, and lengthening the run's ends does not widen it. A short middle segment always clamps the later pin and warns. Say so in the message, so the fix (shrink a pinned cabinet, or drop a cabinet) is obvious.

Because growth changes the run's resolved `x` and `width`, it belongs in `model/room.js` beside `resolveHorizontal` — a `resolvePinnedSpan(run, wall, wallLength, settings, pinTargets)` stage running after the horizontal pass and before `splitRun`. `splitRun` itself always receives a final span. Pass 1 uses the pre-growth width; that is not circular, because the only pass-1 widths that survive into pass 2 are the pinned ones, and with two pins those are already fixed.

### 7.2.2 Worked examples

**One pin.** Run x 0, width 120, filler/filler ends, 4 auto cabinets — today `[2, 29, 29, 29, 29, 2]`. Pin the second cabinet's center to 48:

- Pass 1 gives that cabinet width 29, spanning 31 … 60, center 45 1/2.
- Target center 48 → left edge 33 1/2, right edge 62 1/2.
- Left segment 0 … 33 1/2: left flex filler + one auto. `cabSpace` 32, `autoW` 32, filler 1 1/2 → `[1.5, 32]`.
- Right segment 62 1/2 … 120: two autos + right flex filler. `cabSpace` 56, `autoW` 28, filler 1 1/2 → `[28, 28, 1.5]`.
- Result `[1.5, 32, 29, 28, 28, 1.5]`, summing to 120, pinned center at 48.

**Two pins, one cabinet between them.** The vanity case. Run x 0, width 120, filler/filler ends, 5 auto cabinets — `[2.5, 23, 23, 23, 23, 23, 2.5]`. Pin cabinet 1's center to 36 and cabinet 3's center to 84 (the two faucets):

- Adding the second pin fixes both pinned cabinets at 23.
- Spans: cabinet 1 at 24 1/2 … 47 1/2, cabinet 3 at 72 1/2 … 95 1/2.
- Left segment 0 … 24 1/2: flex filler + one auto → `[1.5, 23]`.
- Middle segment 47 1/2 … 72 1/2 = 25, holding one auto → it takes the whole span, 25.
- Right segment 95 1/2 … 120: one auto + flex filler → `[23, 1.5]`.
- Result `[1.5, 23, 23, 25, 23, 23, 1.5]`, summing to 120. The cabinet between the faucets grew from 23 to 25; nothing else moved, no filler appeared, both centers are exact.

**Two pins, two cabinets between them.** Same run with 6 auto cabinets — `[1.5, 19.5, 19.5, 19.5, 19.5, 19.5, 19.5, 1.5]`. Pin cabinet 1's center to 30 and cabinet 4's center to 90:

- Both pinned cabinets fix at 19 1/2. Spans: 20 1/4 … 39 3/4 and 80 1/4 … 99 3/4.
- Left segment 0 … 20 1/4: `cabSpace` 18 3/4, `autoW` 18 1/2, filler 1 3/4 → `[1.75, 18.5]`.
- Middle segment 39 3/4 … 80 1/4 = 40 1/2, two autos, no filler. An even split would be 20 1/4 each, off your 1/2" step. Instead: the non-absorber takes `floorTo(20.25, 0.5)` = 20, and the absorber — the last auto, absent a flag — takes 20 1/2, carrying `absorbed: 0.5`.
- Right segment 99 3/4 … 120: `[18.5, 1.75]`.
- Result `[1.75, 18.5, 19.5, 20, 20.5, 19.5, 18.5, 1.75]`, summing to 120, both centers exact, and every cabinet still on a 1/2" step.

### 7.3 UI

With a cabinet piece selected, the properties panel gains a **Pin** block: a checkbox, then a datum select (Left end of wall / Right end of wall / an opening by label), an anchor select (Left edge / Center / Right edge of the cabinet), an inch input for the distance, and — when the datum is an opening — a second select for which part of the opening (center, casing edge, jamb edge). The resolved target and the cabinet's actual resolved center are shown read-only, so an unreachable pin is visible as a mismatch.

When adding a pin would make it the run's second, the block says so before you commit: `A second pin locks both pinned cabinets to their current widths.`

Every cabinet piece also gets an **Absorb odd amount** toggle, writing `item.absorb`. It is only meaningful inside a pin segment with more than one auto cabinet, so show it disabled with a one-line explanation elsewhere rather than hiding it — you'll want to find it while you're trying this out. The absorbing piece's label shows its `absorbed` amount, e.g. `20 1/2" (+1/2")`.

Pinned cabinets draw a small pin marker at their pinned anchor in the elevation, and their dimension segment is drawn heavier in the piece chain.

## 8. Clearance to openings, as a constraint

### 8.1 Anchoring a run to a casing

`run.anchors[side]` widens from a boolean to `false | true | OpeningAnchor`:

```js
{ to: 'opening', openingId: string, edge: 'casing' | 'jamb', clearance: number | null }
```

`true` still means "anchored to the corner" and `false` still means free, so every stored run keeps working and `Boolean(run.anchors[side])` still answers "is this side anchored".

New setting **`casingClearance: 0`** — the default gap between a run end and the casing it's anchored to. `clearance: null` on the anchor takes that setting. Set it to 4 to get the shop rule from your TODO by default.

`resolveHorizontal` currently takes `reserveLeft` and `reserveRight` and measures both from the wall ends. Generalize each side to a datum:

```
left  anchored to corner:  x = reserveLeft
left  anchored to opening: x = openingEdgeX + clearance
right anchored to corner:  x + width = length − reserveRight
right anchored to opening: x + width = openingEdgeX − clearance
```

where `openingEdgeX` is the near edge of the anchored opening's casing or jamb rectangle — the right edge of the opening for a run anchored on its left, the left edge for a run anchored on its right. `model/room.js` resolves the datum and passes it in, keeping `resolveHorizontal` free of opening lookups.

Both sides anchored still derives the width from the two datums; `anchor-too-narrow` and `anchor-shrunk` are unchanged. A run may be corner-anchored on one side and opening-anchored on the other.

There is no cycle risk: openings never depend on runs, so openings resolve first in `syncRoom` and the run pass reads them.

**Errors.** `anchor-opening-missing` when the referenced opening is gone; `anchor-opening-overlap` when the two datums cross. Deleting an opening clears any anchor pointing at it and leaves the run where it stood.

### 8.2 Clearance warning for unanchored runs

`roomDiagnostics` adds `{code: 'casing-clearance', openingId, label, side, gap, required}` when an unanchored run end sits closer to a compatible opening's casing than `casingClearance`, where compatible means the run's vertical band (the `verticalStart` rule from `overlap.js`) overlaps the opening's jamb range. Warning only.

### 8.3 The clearance dimension row

`model/dimensions.js`:

```js
openingClearances(room, wall, settings)
  -> [{ openingId, label, side, start, end, targetRunId | null, required, violated }]
```

For each opening and each side, a segment from the **casing outer edge** to the near edge of the nearest run whose vertical band overlaps the opening's jamb range, or to the wall end when there is no such run on that side. `violated` is true when `end − start < required`.

`ElevationCanvas` renders these as a `DimensionRow` directly beneath the opening row from SPEC-7 §6.1. Violated segments draw amber with their required value in parentheses: `2 1/2" (4")`. Segments shorter than a few pixels fall back to the row's existing pop-out label behavior.

### 8.4 UI

The run panel's per-side anchor control becomes a select: **Free / Corner / …one entry per opening on this wall**, plus an inch input for the clearance (blank = the setting) and an edge toggle (Casing / Jamb) when an opening is chosen. The resolved line reads `Anchored 4" off W1 casing`.

The settings panel gains `casingClearance` in the Openings group.

## 9. Required tests (vitest)

Room R: wall A (0,0)→(120,0), wall B (120,0)→(120,96), A.end ↔ B.start, both 96" high, 4 1/2" thick. Settings as in §4 of SPEC and §1.1 of SPEC-7. Tolerance 1e-9 for pure conversions, 1e-6 elsewhere.

**Crown (`profile.test.js`, `persistence.test.js`)**

1. `moldingStack` on the default profile → 6. With `topMoldHeight` 3 and `crownHeight` 6 and `crownStackHeight` 6 → still 6, and `crownOverlap` → 3.
2. `crownOverlap` when the parts can't reach the total: top mold 3, crown 4.5, total 9 → −1.5.
3. A v2 document with `crownOverlap: 1.5`, top mold 3, crown 4.5 migrates to `crownStackHeight: 6` with no `crownOverlap` key, at all three profile levels, and `isElevationDocument` accepts the result at schemaVersion 3.
4. A wall profile carrying only `crownHeight: 6` migrates using the room's top mold and overlap for the arithmetic and stores only `crownStackHeight`.

**View math (`transform.test.js`)**

5. Zoom 2× about (300, 200), pan (−40, 15), zoom 2× about (300, 200): `screenToWall` at (300, 200) returns the same wall point at every step.

**Wall length (`wallOps.test.js`)**

6. `setWallLength(R, A, 132, 'right')` → A becomes (0,0)→(132,0) and B becomes (132,0)→(132,96); B's direction and length are unchanged.
7. `setWallLength(R, A, 108, 'right')` → A (0,0)→(108,0), B (108,0)→(108,96).
8. `setWallLength(R, A, 132, 'left')` with A.start free → A becomes (−12,0)→(120,0) and B does not move.
9. A 60° corner: the neighbor still translates along its own normal and keeps its direction; the shared corner lands on the intersection of the two lines, and A's resolved length equals the requested one within 1e-6.
10. A length that would reverse or collapse a neighbor returns `{ok: false, reason: 'neighbor-too-short'}` with the room unchanged.

**Positions (`positions.test.js`)**

11. `positionReadouts(24, 36, 120)` → `{left: {edge: 24, center: 42}, right: {edge: 60, center: 78}}`.
12. Round trip through `startFromReadout` for all four combinations, for spans at, inside and past both ends.
13. `setOffsetAnchor` on SPEC-7's test-1 door (jamb mode, offset 24 from left, edge) to `'center'` → `offset` 42 with an unchanged geometry; back to `'edge'` → 24.
14. `openingGeometry`'s nested `offsets` for that door → `left {jamb {edge 24, center 42}, casing {edge 21, center 42}}`, `right {jamb {edge 60, center 78}, casing {edge 57, center 78}}`. (Both centers are 42 and 78 — casing and jamb share a center.)

**Pins (`splitRun.test.js`)**

15. The §7.2.2 one-pin worked example → `[1.5, 32, 29, 28, 28, 1.5]`, summing to 120, with the pinned cabinet's center at 48 and no `widths-not-rounded` warning.
16. The same run with the pin at the cabinet's *left* edge at 33.5 gives the identical result.
17. Pin the third cabinet's center to 90 (a window's center) → `[1.5, 37, 37, 29, 14, 1.5]`, summing to 120, with two `wide-cabinet` warnings on the 37s.
18. The §7.2.2 two-pin, one-middle-cabinet example → `[1.5, 23, 23, 25, 23, 23, 1.5]`, summing to 120, both pinned centers exact at 36 and 84, both pinned cabinets fixed at 23, no `widths-not-rounded` warning.
19. The §7.2.2 two-pin, two-middle-cabinet example → `[1.75, 18.5, 19.5, 20, 20.5, 19.5, 18.5, 1.75]`, summing to 120, the last middle auto carrying `absorbed: 0.5`, and no `widths-not-rounded` warning. Flagging the *first* middle auto with `absorb: true` instead → `[1.75, 18.5, 19.5, 20.5, 20, 19.5, 18.5, 1.75]`, with `absorbed: 0.5` on that piece.
20. **Adding the second pin fixes the widths.** Dispatching `setItemPin` for a second pin on the 5-cabinet run writes `width: 23` onto both pinned items. Removing one pin afterwards leaves both widths fixed.
21. **Run growth at a free end.** A 120"-wide run at x 0 on a 144" wall, 5 autos, both ends free, pinning cabinet 4's center to 112 → the run grows to x 0, width 125, and solves `[2.5, 24.5, 24.5, 24.5, 24.5, 23, 1.5]`, with the pinned center exactly 112 and no `pin-unreachable` warning.
22. **Clamp at an anchored end.** The same run with `anchors.right = true` cannot grow, so the pin clamps to center 107 (leaving the right flex filler its 1 1/2" minimum) and emits `pin-unreachable` naming 112 and 107.
23. **A short middle segment always clamps.** The 6-cabinet run with pins at 30 and 40 → growing the run cannot help; the second pin clamps to 67 1/2, which is the nearest center that lets both middle autos sit at `minCabinetWidth` 9, and `pin-unreachable` says so.
24. **`pin-gap`.** Two pins on adjacent cabinets with no item between them and a non-zero gap → error `pin-gap`, naming both pins. With the gap at zero, no error.
25. A run with no pins produces output identical to the same run run through the pre-pin splitter, for the whole existing test suite — including SPEC §11 test 7, which must stay `[30 5/8, 30 5/8]`.

**Clearance anchors (`room.test.js`, `corners.test.js`)**

26. Wall A with SPEC-7's test-3 window (casing 69 … 111) and a base run of width 40 anchored right to the window's casing with `clearance: null` and `casingClearance` 0 → run x 29, right edge 69.
27. The same with `clearance: 4` → run x 21, right edge 65.
28. A run anchored left to the corner and right to the window's casing at 4" → x = the corner reserve, right edge 65, width derived.
29. Moving the window 6" left moves the anchored run's right edge with it, in one `syncRoom`.
30. Deleting the window clears the anchor and leaves the run's resolved x where it was.
31. An unanchored base run ending 2 1/2" from the window casing with `casingClearance` 4 → a `casing-clearance` warning carrying `gap 2.5` and `required 4`. An upper run at the same x whose band doesn't overlap the window → no warning.

**Clearance dimensions (`dimensions.test.js`)**

32. `openingClearances` for wall A with the test-3 window and a base run ending at 60 → left segment 60 … 69 targeting that run, right segment 111 … 120 targeting the wall end, `violated` false with `casingClearance` 0.
33. With `casingClearance` 4, the 111 … 120 segment stays valid and a run ending at 67 gives a `violated` left segment of 2".

All existing tests must keep passing. SPEC-7's flat `offsets` assertions change shape per §6.2 — update them and say so in your summary.

## 10. Explicitly out of scope

Angle entry while drawing a wall; a general constraint solver that negotiates several conflicting pins at once — §7.2.1 resolves them left to right and clamps, it does not search; automatically inserting a filler to satisfy a pin, ever; runs auto-avoiding an opening without an explicit anchor; clearances to anything other than an opening casing or jamb; pins on fillers or end panels; pinning across walls; undo/redo for any of the new gestures.
