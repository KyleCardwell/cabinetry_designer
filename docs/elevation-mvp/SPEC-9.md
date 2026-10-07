# Elevation Lab — Spec 9: Deselection, signed anchor offsets, wall navigation

Extends SPEC.md … SPEC-8.md (steps 1–31 are built). Source of truth for steps 32–33.
Codex cannot run the app (it's behind a login): rely on unit tests, `npm run build` and `npm run lint`. If something is ambiguous, pick the simplest option, leave a `// SPEC-QUESTION:` comment, and mention it in your summary.
No storage migration. `selection.wallId` is transient state; every new anchor value is a number in a field that already accepts one.

## 0. What this covers

1. **Clicking empty space deselects** — in plan it clears the wall too, without losing the elevation's place (§1).
2. **Every anchor offset takes a sign** — one rule across corners, wall ends and openings (§2).
3. **Wall navigation arrows** in the elevation toolbar (§3).

## 1. Deselect on empty space

### 1.1 The problem

`activeWallId` is doing two jobs: it is the **navigation cursor** (which wall the elevation draws, which wall the properties panel edits) and it is the **visual selection** (`PlanWallShape` takes `isSelected={wall.id === activeWallId}`). Because the elevation needs a wall to draw, the cursor can't go null — so today the highlight can't clear either, and `PlanCanvas`'s stage click doesn't even try. The elevation already clears run/piece/opening on an empty click; plan clears nothing.

### 1.2 Split the two jobs

`selection` gains a fourth field:

```js
selection: { runId, pieceId, openingId, wallId }
```

`selection.wallId` is the visual and editable selection. `activeWallId` stays exactly what it is — the cursor — and is never cleared by a deselect.

- `setActiveWall` sets `activeWallId` **and** `selection.wallId` to that wall, clearing the other three.
- `clearTransientSelection` sets all four to null and leaves `activeWallId` alone.
- `setView('elevation')` sets `selection.wallId = activeWallId`, because in the elevation you are always inside a wall.
- `plan/PlanWallShape.jsx` takes `isSelected` from `selection.wallId === wall.id`, not `activeWallId`.
- `components/PropertiesPanel.jsx` renders its wall section from `selection.wallId` rather than `activeWallId`. With nothing selected it shows a one-line hint — `Select a wall, run or opening to edit it.` — instead of a wall the canvas isn't highlighting.
- Everything that *draws* keeps using `activeWallId`: `ElevationCanvas`, `RoomPicker`, `WallList`'s current-wall marker.

### 1.3 Behavior per view

**Plan.** A left click on empty space under the `select` tool, with no live entry open and no shape hit, dispatches `clearSelection()`. The wall highlight, the run selection and the panel all clear; the elevation still knows where it was.

**Elevation.** An empty click clears run, piece and opening but **leaves `selection.wallId` set**, because the wall filling the screen is the thing you are looking at — deselecting it while still drawing it would only empty the panel. This is the one asymmetry in this spec; if it reads wrong in use, the change is one line in `ElevationCanvas`'s `handleStageClick`.

`Escape` behaves the same as an empty click in both views, after any live entry has been cancelled.

## 2. Signed anchor offsets

### 2.1 One rule

> **A positive offset holds the run back on the room side of its datum. A negative offset carries it past.**

That reading already matches the arithmetic in `resolveHorizontal` — `x = reserveLeft` on the left, `x + width = length − reserveRight` on the right — so a negative reserve puts the edge past the datum with no formula changes. It applies to all three datum kinds:

| Datum | Positive | Negative |
|---|---|---|
| Inside corner | more clearance from the neighbour's cabinets | into the neighbour's cabinet space |
| Outside, straight or open wall end | back inside the wall | past the end of the wall |
| Opening casing or jamb | clear of the opening | overlapping the opening |

**Parsing is already done.** `parseInches` accepts `[+-]` in all three of its forms and `formatInches` emits a leading `-`, so `-2 1/2` round-trips through `InchInput` today. Nothing in `units.js` or `InchInput.jsx` needs to change.

### 2.2 Wall ends that are not inside corners

`cornerReserveParts` currently returns `{face: 0, back: 0, total: 0}` for anything that isn't an inside corner, which is why anchoring at an outside corner pins a run to exactly x 0 or x L with no way to offset it. Anchoring was gated to inside corners because that's the only place the reserve is *derived* from something — not because the other ends don't matter.

For `outside`, `straight` and `open` ends:

```js
{ face: 0, back: 0, total: <resolved>, source: <'auto' | 'custom'> }
```

where `resolved` is `run.cornerClearance?.[side]` when that is a finite number, and `0` otherwise. So `'auto'` means flush with the wall end, and a custom number is the signed offset. `'face'` has no meaning at these ends — treat it as `'auto'`.

The inside-corner behavior — face term, back term, the `'face'` mode, `cornerFillerMin` — is unchanged. The only change there is that a custom number may now be negative, which pushes the run into the neighbour's cabinets; `findCollisions` already reports that as `corner-collision`, so nothing new is needed.

**Gates to relax.** Anchoring is refused or special-cased at five places keyed on `type === 'inside'`. Each becomes "any wall end":

- `store/elevationSlice.js` `setRunAnchor` — at an inside corner it sets the end to a flex filler, as today. At an outside, straight or open end it sets `{type: 'end_panel', width: null}` instead, since that end is exposed; leave the end alone if it is already an end panel.
- `model/runDefaults.js` `createRun` — a drawn edge within `settings.cornerSnapDistance` of **any** wall end auto-anchors, with the same end rule.
- `model/room.js` `stretchRun` — the anchor snap candidates at 0 and `length` engage at any wall end, not only inside corners.
- `components/PropertiesPanel.jsx` and `components/RunGroup.jsx` — show the offset control and the anchor marker at any anchored end.

Two stay inside-only and are correct as they are: `model/room.js` `endMinWidthsForRun` / `endCornerAnglesForRun` (a scribe filler minimum only applies where a neighbour's cabinet is being scribed to) and `components/NeighborReturns.jsx` (nothing returns around an outside corner). `model/dimensions.js` keeps `'corner-gap'` for inside corners only — the gap beside an outside-corner anchor holds nothing, so it stays `'open'`.

**Bounds.** A negative offset is bounded by the checks that already exist: `validateRunPlacement` rejects beyond `settings.maxRunOverhang`, and the chain range from SPEC-6 §3 already spans an overhanging run.

### 2.3 Opening anchors

The formulas from SPEC-8 §8.1 already carry the sign correctly — `x = openingEdgeX + clearance` on a left anchor, `x + width = openingEdgeX − clearance` on a right one. The work is permitting it and saying what it means:

- A **positive** clearance is a gap between the run end and the opening's casing or jamb edge.
- A **negative** clearance runs the cabinetry under the trim. Past the casing but short of the jamb is deliberate and silent — a base run tucked under a window's casing is normal. Past the **jamb**, `runBlocksOpening` already fires `blocks-opening`, which is the warning that matters.
- `settings.casingClearance` remains the default for `clearance: null` and is expected to be ≥ 0, but nothing enforces that.

### 2.4 UI

The per-side offset control, today shown only for an anchored inside corner, appears at **every anchored end**:

- Inside corner: **Auto / Face only / Custom**, as now.
- Outside, straight or open end: **Auto / Custom**, where Auto reads `Flush with the wall end`.
- Opening anchor: the existing Clearance input, now accepting a negative.

Under any of the signed inputs, one muted helper line: `Positive holds the run back; negative carries it past.`

A pure formatter carries the resolved line, so it can be tested without React:

```js
describeAnchor(room, wall, run, side, settings) -> string
```

- Inside corner, auto: `Reserve 42 9/16" (face 28 3/4" + back 13 7/8")` — unchanged.
- Outside / straight / open, auto: `Flush with the wall end`.
- Outside / straight / open, custom: `Held back 2"` or `2" past the wall end`.
- Opening: `4" clear of W1 casing` or `1 1/2" into W1 casing`.

## 3. Wall navigation arrows

`components/ElevationToolbar.jsx`, elevation view only, beside the zoom controls:

```
‹   Wall 2 / 5   ›
```

- Order comes from `room.wallOrder`, which `computeWallOrder` already maintains. The label comes from `wallLabel(room, wall)`, so a named wall shows its name.
- Each arrow dispatches `setActiveWall` for the neighbouring wall, which per §1.2 also selects it and clears the run selection.
- Navigation **wraps**: right from the last wall goes to the first. Walking a closed room should not dead-end.
- Both arrows are disabled when the room has fewer than two walls.
- Keyboard: `[` and `]` in the elevation canvas do the same thing. Ignore them while focus is in an `input`, `select` or `textarea`, and while a live entry is open — the existing key handler already has that guard for Delete and Escape.

## 4. Required tests (vitest)

Room R: wall A (0,0)→(120,0), wall B (120,0)→(120,96), A.end ↔ B.start, both 96" high. Room O is the same with B rotated so `cornerAt(O, A, 'right').type === 'outside'`. Settings as in SPEC-8. Tolerance 1e-6.

**Selection (`elevationSlice.test.js`)**

1. `setActiveWall` sets `activeWallId` and `selection.wallId` to that wall and nulls `runId`, `pieceId` and `openingId`.
2. `clearSelection` nulls all four selection fields and leaves `activeWallId` unchanged.
3. `setView('elevation')` sets `selection.wallId` to `activeWallId`.
4. Deleting the selected wall clears `selection.wallId` and moves `activeWallId` to the next wall, as it does today.

**Signed offsets (`corners.test.js`, `room.test.js`)**

5. `cornerReserveParts` on room O's outside corner: `cornerClearance.right` unset → `{face: 0, back: 0, total: 0, source: 'auto'}`; `= 2` → total 2, source `'custom'`; `= −3` → total −3.
6. A 40"-wide run on wall A of room O, anchored right with `cornerClearance.right = 2` → x 78, right edge 118. With `= −3` → x 83, right edge 123, and `validateRunPlacement` passes (3 ≤ `maxRunOverhang` 36).
7. The same run with `cornerClearance.right = −40` → `validateRunPlacement` fails with `out-of-bounds`.
8. Anchoring the left side at an **open** end (wall A with no connection at its left endpoint) with `cornerClearance.left = 1.5` → x 1.5; with `= −1.5` → x −1.5.
9. `setRunAnchor` at room O's outside corner sets that end to `{type: 'end_panel', width: null}`; at room R's inside corner it still sets `{type: 'filler', width: null}`. An end already set to `end_panel` is left alone.
10. Inside corner with `cornerClearance.right = −2` resolves to total −2 and produces a `corner-collision` warning against the anchored neighbour run, with no new error code.
11. `createRun` drawn with its right edge 1" from room O's outside corner auto-anchors that side with an end panel; drawn 6" away (beyond `cornerSnapDistance` 3) it does not.
12. `stretchRun` dragging a run's right edge to within 2" of room O's outside corner snaps and sets `anchors.right`.

**Opening anchors (`room.test.js`)**

13. A base run anchored right to SPEC-7's test-3 window (jamb 72 … 108, casing 69 … 111) with `clearance: −2` → right edge 71. The run is under the casing but short of the jamb, so there is **no** `blocks-opening` warning.
14. The same with `clearance: −5` → right edge 74, overlapping the jamb by 2", and `blocks-opening` fires.

**describeAnchor (`helpers.test.js`)**

15. The five strings in §2.4, for an inside corner in auto mode, an outside corner in auto and in custom (both signs), and an opening anchor with a positive and a negative clearance.

**Wall navigation (`topology.test.js` or a small toolbar helper test)**

16. A pure `nextWallId(room, activeWallId, direction)` follows `wallOrder`, wraps at both ends, and returns the same id when the room has one wall.

All existing tests must keep passing. Anything asserting `isSelected` from `activeWallId` in the plan changes per §1.2 — say which in your summary.

## 5. Explicitly out of scope

A no-wall empty state for the elevation view; deselecting the wall from inside the elevation; wall navigation in the plan view or from the wall list; multi-select of any kind; negative widths, heights or depths anywhere; enforcing a non-negative `casingClearance` setting.
