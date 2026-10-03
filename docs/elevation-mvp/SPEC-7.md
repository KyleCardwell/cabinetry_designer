# Elevation Lab — Spec 7: Doors and windows

Extends SPEC.md … SPEC-6.md (steps 1–22 are built). Source of truth for steps 23–25.
Codex cannot run the app (it's behind a login): rely on unit tests, `npm run build` and `npm run lint`. If something is ambiguous, pick the simplest option, leave a `// SPEC-QUESTION:` comment, and mention it in your summary.
No storage migration. `wall.openings` is optional and defaults to `[]` when missing, the same way SPEC-6's new settings did.

## 0. What this adds

Walls can hold **openings** — doors and windows. An opening is a hole in the wall plus a rectangular casing around it. Openings are not cabinets: they have no runs, no items, no splitter. They are wall furniture that the elevation and plan views draw, that dimension chains measure to, and that a later DXF/estimate step can read straight off the wall JSON.

Two facts drive the whole design:

1. **A field measurement is taken either to the jamb or to the outside of the casing**, and the same choice applies to the opening's size *and* to its distance from the corner. One switch per opening covers both.
2. **The stored distance is from a wall end, not an absolute x.** An opening measured 12" off the right corner stays 12" off the right corner when the wall gets longer. `run.x` keeps its existing absolute-x behavior; openings do not copy it.

Casing is rectangular, 3/4" thick, 3" wide by default, and has **no reveal** — its inner edge is the opening edge. So outside casing width = jamb width + 2 × casing width.

## 1. Data model

```js
// on Wall, alongside runs
openings: [Opening]

// Opening
{
  id: uuid,
  kind: 'door' | 'window',
  label: string,                    // 'D1', 'W2' — auto-assigned, editable
  measureMode: 'jamb' | 'casing',   // governs width, height, sillZ AND offset
  width: number,                    // in measureMode terms
  height: number,                   // in measureMode terms
  sillZ: number,                    // in measureMode terms; always 0 for a door
  offset: number,                   // distance from the offsetFrom wall end to the
                                    // near reference edge, in measureMode terms
  offsetFrom: 'left' | 'right',     // which ELEVATION end the offset is measured from
  casing: { width: number, thickness: number } | null   // null = no casing
}
```

`left` / `right` are the elevation sides already defined by `wallFrame` (`frame.leftEndpoint` / `frame.rightEndpoint`), so they follow `wall.flipped` exactly like run ends and anchors do.

A door always sits on the floor: `sillZ` is 0 and the UI does not offer it.

Casing sides are derived, not stored: a window is cased on all four sides, a door on head and legs only. Encode that as one helper:

```js
export function casingSides(kind) {
  return { top: true, left: true, right: true, bottom: kind === 'window' };
}
```

### 1.1 Settings (new)

```js
casingWidth: 3,
casingThickness: 0.75,
openingsHaveCasing: true,          // new openings get casing
defaultOpeningMeasureMode: 'jamb',
defaultDoorWidth: 36,              // jamb
defaultDoorHeight: 80,             // jamb
defaultWindowWidth: 36,            // jamb
defaultWindowHeight: 48,           // jamb
defaultWindowSillZ: 36,            // jamb sill above the floor
minOpeningWidth: 6,
openingSnap: 0.5,                  // placement and drag increment
```

The four `default*` sizes are always stored as **jamb** numbers regardless of `defaultOpeningMeasureMode`; `createOpening` converts them when the mode is `'casing'`.

## 2. Geometry — `model/openings.js` (new file)

All of these are pure; no React, no Redux.

### 2.1 `openingGeometry(opening, wallLength, settings) -> Geometry`

```js
{
  jamb:   { x, z, width, height },          // the hole
  casing: { x, z, width, height, thickness, sides } | null,  // outside rectangle
  head:   number,                           // jamb.z + jamb.height
  offsets: {                                // all four distances, always present
    left:  { jamb: number, casing: number },
    right: { jamb: number, casing: number }
  }
}
```

With `c = opening.casing ? opening.casing.width : 0` and `sides = casingSides(opening.kind)`:

**Sizes.** Converting *casing → jamb* subtracts `c` from each cased side; *jamb → casing* adds it.

```
jamb.width  = mode === 'jamb' ? width  : width  - 2c
jamb.height = mode === 'jamb' ? height : height - (sides.bottom ? 2c : c)
casing.width  = jamb.width + 2c
casing.height = jamb.height + (sides.bottom ? 2c : c)
```

**Vertical.**

```
door:   jamb.z = 0,                          casing.z = 0
window: jamb.z = mode === 'jamb' ? sillZ : sillZ + c
        casing.z = jamb.z - c
```

**Horizontal.** `refWidth` is `jamb.width` in jamb mode and `casing.width` in casing mode.

```
refLeftX = offsetFrom === 'left'
  ? offset
  : wallLength - offset - refWidth
jamb.x   = mode === 'jamb' ? refLeftX : refLeftX + c
casing.x = jamb.x - c
```

**Offsets** (for display; every one of the four is derived, none is stored twice):

```
offsets.left.jamb    = jamb.x
offsets.left.casing  = casing ? casing.x : jamb.x
offsets.right.jamb   = wallLength - (jamb.x + jamb.width)
offsets.right.casing = casing ? wallLength - (casing.x + casing.width) : offsets.right.jamb
```

When `opening.casing` is null, `casing` in the result is null and every casing distance equals its jamb distance.

### 2.2 Mode and side conversion

```js
setMeasureMode(opening, mode, wallLength, settings) -> opening
setOffsetSide(opening, side, wallLength, settings) -> opening
```

Both rewrite the stored numbers so that **`openingGeometry` returns an identical `jamb` and `casing` before and after**. They never move or resize the opening; they only change which numbers the user is typing. Implement them by reading the geometry, then re-deriving `width`, `height`, `sillZ` and `offset` in the new terms. A round trip (`jamb → casing → jamb`) must return the original numbers exactly (within 1e-9).

### 2.3 `createOpening({ kind, x, measureMode }, ctx) -> Opening`

`ctx` is `{ settings, room, wall }`, matching `createRun`'s shape.

- Sizes come from the `default*` settings for the kind (jamb numbers), converted if the mode is `'casing'`.
- `casing` is `{ width: settings.casingWidth, thickness: settings.casingThickness }` when `settings.openingsHaveCasing`, otherwise null.
- `offsetFrom` is `'left'`.
- `x` is the requested position of the **reference left edge** in wall-local inches. Round it to `settings.openingSnap`, then clamp so the **casing** rectangle sits inside `[0, wallLength]`. (For a 36" door with 3" casing on a 120" wall, a click at x 118 lands the jamb at 81 and the casing at 78…120.)
- `label` is `D{n}` or `W{n}`, where n is one more than the count of that kind already in the **room**. Editable afterwards; never renumbered automatically.

### 2.4 Validation — `validateOpeningPlacement(wall, opening, settings)`

Returns `{ ok, reason }` like `validateRunPlacement`. `wall` carries a resolved `length` and `height`, the same way `validateRunPlacement` is already called. Checks, in order:

- `jamb.width < settings.minOpeningWidth` or `jamb.height <= 0` → `opening-too-small`
- `casing.x < 0` or `casing.x + casing.width > wall.length` → `opening-out-of-bounds`. Openings never overhang a wall end; `maxRunOverhang` does not apply to them.
- `casing.z < 0` or `casing.z + casing.height > wall.height` → `opening-too-tall`
- casing rectangle overlaps another opening's casing rectangle on the same wall by more than 1e-6 in **both** axes → `opening-conflict`. Touching edges are fine.

Use the casing rectangle (falling back to the jamb when casing is null) for the bounds and conflict checks — trim can't run past a corner or through the neighbouring window's trim.

### 2.5 Runs vs. openings — `runBlocksOpening(run, opening, wall, settings)`

A warning only; there are legitimate reasons to put cabinetry over an opening, and an error would make the editor fight the user.

- Horizontal overlap: run `[x, x+width]` vs. **jamb** `[jamb.x, jamb.x+jamb.width]`, more than 1e-6.
- Vertical overlap: the run's band using the existing `verticalStart` rule from `overlap.js` (base and tall start at 0 so the toe kick counts) vs. `[jamb.z, head]`, more than 1e-6.
- Casing-only overlap is deliberately **not** flagged: a window casing dropping behind a countertop is normal.

`roomDiagnostics` adds `{ code: 'blocks-opening', openingId, label }` to that run's warnings for each opening it blocks.

### 2.6 What `syncRoom` does with openings

Nothing, beyond carrying them through. Openings store their distance from a wall end, so they need no resolution pass and — importantly — **`compensateRuns` must not touch them**. Changing a wall's length or moving it perpendicular leaves an opening's stored `offset` alone, which is exactly why the offset is stored from an end.

`cloneRoom` in `model/room.js` must clone `openings` (`wall.openings?.map(o => ({...o, casing: o.casing ? {...o.casing} : null}))`), and every place that builds a wall (`createWall` in the slice, `migrateV1Document`) must default it to `[]`.

`flipRunsForWall` gains one line for openings: swap `offsetFrom` (`'left' ↔ 'right'`) and leave every other field alone. Flipping the wall must not move an opening in plan.

## 3. Plan view

Render order in `PlanCanvas`: wall polygons → **openings** → run footprints → overlays. An opening therefore reads as a hole in its wall, and a cabinet in front of it still draws on top.

New component `plan/PlanOpening.jsx`, given `{ room, wall, frame, opening, settings, selected, selectable, scale, onSelect }`:

- **The void.** A four-point polygon over the jamb x-range spanning the full wall thickness — `elevationToPlan(frame, jamb.x, 0)`, `(jamb.x + jamb.width, 0)`, `(jamb.x + jamb.width, -wall.thickness)`, `(jamb.x, -wall.thickness)` — filled with the plan background `#030712` so it erases the wall fill beneath it. Export that color as a shared constant; `PlanCanvas` already paints `bg-gray-950`.
- **Jamb lines.** Two lines across the thickness at `jamb.x` and `jamb.x + jamb.width`, stroke `#e2e8f0`, `1/scale`.
- **Window glazing.** For a window, one line down the middle of the thickness (offset `-wall.thickness / 2`) across the jamb range, stroke `#7dd3fc`, `1.25/scale`.
- **Door threshold.** For a door, one line along the face (offset 0) across the jamb range, stroke `#e2e8f0`, `1/scale`. No swing arc in this step.
- **Casing.** A rectangle on the **room side only**, from offset 0 to `+casing.thickness`, spanning `casing.x … casing.x + casing.width`, filled `#a8a29e` at 0.9 opacity with a `#e7e5e4` outline. (The far side of the wall isn't modelled — a note for later, not a TODO now.)
- **Selection.** `selected` thickens the jamb lines and the casing outline to `2.5/scale` and strokes them `#f8fafc`.
- **Label.** The opening's label and jamb width, centered, rotated with the wall the way `PlanWallShape` rotates its dimension label, drawn just outside the casing.

Hit testing: an opening is clickable when the active tool is `select`. Add `openingsAtPoint(room, point, settings)` to `model/openings.js`, mirroring `footprintsAtPoint`, testing the union of the void and the casing rectangle. Openings take priority over the wall itself but **not** over run footprints — `PlanCanvas` should test footprints first, and only fall through to openings when no footprint was hit.

## 4. Elevation view

Render order in `ElevationCanvas`: `WallFrame` → **openings** → runs → neighbor returns → dimension rows.

New component `components/OpeningShape.jsx`, given `{ opening, geometry, transform, selected, selectable, onSelect, onMove }`. The drawing is two stacked rectangles, which is all the casing needs:

1. The **casing rectangle** (`casing.x, casing.z, casing.width, casing.height`), filled `#a8a29e`, stroke `#e7e5e4` at 1px.
2. The **jamb rectangle** (`jamb.x, jamb.z, jamb.width, jamb.height`) drawn over it, filled `#0b1220` for a door and `#0e2a47` for a window, stroke `#94a3b8`.

Because a door's casing rectangle starts at z 0 and is only `jamb.height + c` tall, painting the jamb over it leaves legs and a head and no sill — exactly what a door should look like. A window's casing rectangle extends `c` below the sill, so all four sides survive. No extra per-side logic.

Also draw:

- A label centered in the jamb rectangle: `D1 · 36" × 80"` using `formatInches`, `fill #e2e8f0`, 11px, hidden when the jamb rectangle is narrower than about 60px on screen.
- When `selected`, a 2px `#f8fafc` stroke on both rectangles.

**Moving.** An opening is draggable horizontally in the elevation when the tool is `select`. Constrain with `dragBoundFunc` to the rectangle's own y, convert the dragged x back to wall-local inches, round to `settings.openingSnap`, and dispatch `moveOpening` on drag end (not on every move). Clamp so the casing stays on the wall. The same applies in plan, constrained to the wall's `frame.r` direction, reusing the perpendicular-handle pattern already in `PlanCanvas`.

## 5. Placing an opening

New tools `'door'` and `'window'` alongside `'select'`, `'draw'` and `'wall'` in `setTool`. They are available in **both** views.

- **Toolbar.** Plan: Select · Draw wall · Door · Window. Elevation: Select · Draw run · Door · Window.
- **Elevation.** A single click on the wall places the opening. `screenPointToWallSnapped` gives the wall-local x; pass it to `createOpening` as the reference left edge. The click's z is ignored — a door sits on the floor and a window takes `settings.defaultWindowSillZ`. (Deliberate: a sill height is a typed number, not a sketched one.)
- **Plan.** A single click on a wall places it on that wall. Project the click onto the wall's face line to get the wall-local x: `dot(subtract(point, frame.leftPoint), frame.r)`. Add `planPointToWallX(frame, point)` to `model/geometry.js` for this. Clicking away from any wall does nothing.
- After a successful placement, dispatch `setTool('select')` and select the new opening — the same handoff `createRun` already does.
- If `validateOpeningPlacement` fails, don't create it; show the reason in the toolbar message for ~3s, the way a rejected run does.

There is no drag-to-size. Openings are catalog-sized, and every size ends up typed in the panel anyway.

## 6. Dimensions

### 6.1 Horizontal opening row

`model/dimensions.js` gains:

```js
openingChain(room, wall, settings) -> [{ start, end, kind, openingId?, label? }]
```

- Returns `[]` when the wall has no openings.
- Spans `[0, wallLength]`, contiguous, summing to the wall length.
- Each opening contributes one `kind: 'opening'` segment running between **that opening's own reference edges** — jamb edges in jamb mode, casing edges in casing mode — so the number on the drawing is the number that was typed. Gaps between them are `kind: 'gap'`.
- Openings are sorted by their reference left edge. Overlapping references (possible only with a validation error already showing) are clamped so the chain stays monotonic.

`ElevationCanvas` renders it as one more `DimensionRow` below the lower-band rows, with `wallEndMarks={[0, wallLength]}`, and with the `'opening'` segments labelled in the same style as `'run'` segments.

### 6.2 Vertical

When an opening is selected, the vertical dimension column shows the opening instead of the cabinet stack:

```js
verticalOpeningChain(wall, opening, wallLength, settings)
  -> { inner: [{start, end, kind}], outer: [{start, end, kind: 'wall'}] }
```

`inner` is, for a window, `[0→casing.z 'sill-below'], [casing.z→jamb.z 'casing'], [jamb.z→head 'opening'], [head→casing top 'casing'], [casing top→wall.height 'above']`, dropping any zero-length segment; for a door, the same without the two bottom segments. `outer` stays `[{0, wall.height, 'wall'}]`. `ElevationCanvas` picks this chain when `selection.openingId` is set and `verticalChains` otherwise.

## 7. State — `store/elevationSlice.js`

`selection` becomes `{ runId, pieceId, openingId }`. `setSelection` normalizes: an `openingId` clears `runId` and `pieceId`, and a `runId` clears `openingId`. `clearTransientSelection` clears all three. Anywhere `selection.runId` is read today keeps working.

New reducers, each ending with `syncRoomAt` and each following the existing `runLocation` / `wallLocation` helper style:

| Reducer | Payload | Notes |
|---|---|---|
| `addOpening` | `{ roomId?, wallId, opening }` | pushes onto `wall.openings`; a `prepare` supplies the id like `addWall` does |
| `updateOpening` | `{ wallId, openingId, changes }` | whitelist `label`, `kind`, `width`, `height`, `sillZ`, `offset`, `casing`; ignore anything else |
| `setOpeningMeasureMode` | `{ wallId, openingId, mode }` | delegates to `setMeasureMode`; geometry must not change |
| `setOpeningOffsetSide` | `{ wallId, openingId, side }` | delegates to `setOffsetSide`; geometry must not change |
| `moveOpening` | `{ wallId, openingId, x }` | `x` is the reference left edge in wall-local inches; snap, clamp, store as `offset` in the opening's own terms |
| `deleteOpening` | `{ wallId, openingId }` | clears the selection if it pointed at it |

`updateOpening` rejects a change that fails `validateOpeningPlacement` and sets `state.message` to the reason, leaving the opening as it was — the same contract the run width inputs already have.

Delete/Backspace in both canvases removes the selected opening, matching the existing run behavior.

## 8. Persistence

Stay on `schemaVersion: 2`. In `store/persistence.js`:

- `isOpening(opening)`: string `id`, `kind` in `{door, window}`, string `label`, `measureMode` in `{jamb, casing}`, finite `width`, `height`, `sillZ`, `offset`, `offsetFrom` in `{left, right}`, and `casing` either null or `{width, thickness}` both finite.
- `isWall`: `wall.openings === undefined || (Array.isArray(wall.openings) && wall.openings.every(isOpening))`.
- `normalizeV2Document`: default `wall.openings` to `[]`, and default the new settings keys from `DEFAULT_SETTINGS` exactly as `maxRunOverhang` is defaulted today.
- `migrateV1Document`: `openings: []` on every wall.

## 9. UI — `components/PropertiesPanel.jsx`

When `selection.openingId` is set, the panel shows an **Opening** section instead of the run section:

- **Header:** the label as an editable text input, the kind as a select (Door / Window — switching kinds re-derives `sillZ`: 0 for a door, `settings.defaultWindowSillZ` for a window), and a Delete button.
- **Measured to:** a two-button toggle, *Jamb* / *Outside casing*, dispatching `setOpeningMeasureMode`. Directly beneath it, a one-line note: `Sizes and the corner distance below are to the {jamb | outside of the casing}.`
- **Size:** Width and Height inch inputs, plus Sill height for a window. All three are in the current mode's terms. A door's sill is not shown.
- **Position:** a *From* toggle (*Left end* / *Right end*) dispatching `setOpeningOffsetSide`, and one inch input for the distance — the distance from that end, in the current mode's terms.
- **All four distances**, read-only, so the measurement can be checked against any of them:
  ```
  Left end → jamb 24"   · casing 21"
  Right end → jamb 60"  · casing 57"
  ```
  The pair matching the current mode and side is highlighted; the others are muted.
- **Casing:** a checkbox (casing on/off), plus Width and Thickness inch inputs when on. A note that a door is cased on three sides and a window on four.
- **Head height** read-only (`jamb.z + jamb.height`), since that's the number that decides whether an upper cabinet fits beside it.
- **Warnings**, using the existing warning list styling: the placement error if one is showing, and `Blocked by {run label}` for each run that overlaps it.

The run section gains one line: `Blocks {label}` as a warning when `roomDiagnostics` reports `blocks-opening`.

`components/SettingsPanel.jsx` gains the §1.1 settings in a new "Openings" group, with `defaultOpeningMeasureMode` as a select and `openingsHaveCasing` as a checkbox.

`components/WallList.jsx` shows an opening count per wall next to the run count.

## 10. Required tests (vitest, `src/elevation/model/__tests__/openings.test.js` unless noted)

Wall W: 120" long, 96" high, 4.5" thick. Settings: `casingWidth` 3, `casingThickness` 0.75, no reveal. Tolerance 1e-9 for conversions, 1e-6 elsewhere.

**Geometry**

1. Door, jamb mode, width 36, height 80, offset 24 from left →
   `jamb {x 24, z 0, w 36, h 80}`, `casing {x 21, z 0, w 42, h 83}`, `head 80`,
   `offsets {left: {jamb 24, casing 21}, right: {jamb 60, casing 57}}`.
2. The same door in casing mode — width 42, height 83, offset 21 from left — returns a geometry **deep-equal** to test 1.
3. Window, jamb mode, width 36, height 48, sill 36, offset 12 from the **right** →
   `jamb {x 72, z 36, w 36, h 48}`, `casing {x 69, z 33, w 42, h 54}`, `head 84`,
   `offsets {left: {jamb 72, casing 69}, right: {jamb 12, casing 9}}`.
4. The same window in casing mode — width 42, height 54, sill 33, offset 9 from the right — is deep-equal to test 3.
5. `casing: null` on test 1's door → `casing` is null, jamb unchanged, and all four offsets equal their jamb values.

**Conversion**

6. `setMeasureMode(door, 'casing', 120, settings)` on test 1 gives `{width 42, height 83, sillZ 0, offset 21}` and an unchanged geometry; converting back returns test 1's numbers exactly.
7. `setOffsetSide(window, 'left', 120, settings)` on test 3 gives `offset 72` with `offsetFrom 'left'` and an unchanged geometry; back again returns `offset 12`.
8. Mode and side conversion commute: applying them in either order on test 3 lands on the same opening.

**Validation**

9. Door, jamb mode, offset 1 from left (casing at −2) → `opening-out-of-bounds`. Offset 3 (casing at 0) → ok.
10. Window, jamb sill 66, height 48 (casing top 117 > 96) → `opening-too-tall`.
11. Two doors, jamb mode, offsets 24 and 60 → casings 21…63 and 57…99 overlap → `opening-conflict`. Second door at offset 66 → casings touch at 63 → ok.
12. Window with jamb width 4 → `opening-too-small`.

**Runs vs. openings** (`room.js` tests)

13. Test 1's door and a base run x 0 w 30 → `blocks-opening` warning naming the door. The same run at w 24 (touching the jamb at 24) → no warning.
14. Test 3's window and a base run x 72 w 36 (band 0…34.5, jamb 36…84) → no warning, even though the run overlaps the casing at 33…34.5.
15. The same window and an upper run z 54 h 30 over x 72…108 → `blocks-opening`.

**Wall edits**

16. `setWallLength` from 120 to 132: an opening with `offsetFrom 'right'` keeps `offsets.right` unchanged and its `offsets.left` grows by 12; one with `offsetFrom 'left'` does the opposite. No `compensateRuns` shift is applied to either.
17. `flipRunsForWall` on a wall with test 1's door: `offsetFrom` becomes `'right'`, `offset` stays 24, and the plan position of the jamb (via `elevationToPlan`) is unchanged.

**Placement**

18. `createOpening({kind: 'door', x: 40}, ctx)` on W → jamb mode, `offset 40`, casing 37…79, valid.
19. `createOpening({kind: 'door', x: 118}, ctx)` clamps to `offset 81` so the casing ends exactly at 120.
20. `createOpening({kind: 'window', x: 10}, ctx)` uses `defaultWindowSillZ` for `sillZ` and labels itself `W1`; a second window on another wall in the same room is `W2`.

**Dimensions** (`dimensions.test.js`)

21. `openingChain` for W with test 1's door (jamb mode) and test 3's window (jamb mode) →
   `[gap 0–24, opening 24–60 D1, gap 60–72, opening 72–108 W1, gap 108–120]`, contiguous, summing to 120.
22. The same wall with the door switched to casing mode → its segment becomes 21–63 and the neighbouring gaps absorb the change; still contiguous and still sums to 120.
23. `verticalOpeningChain` for test 3's window → `[0–33 sill-below, 33–36 casing, 36–84 opening, 84–87 casing, 87–96 above]`; for test 1's door → `[0–80 opening, 80–83 casing, 83–96 above]`.

**Persistence** (`persistence.test.js`)

24. A stored v2 document whose walls have no `openings` key loads, validates, and comes back with `openings: []`.
25. A document with a malformed opening (`measureMode: 'rough'`) fails `isElevationDocument` and the editor starts fresh.

All existing tests must keep passing. If one legitimately changes, say which and why.

## 11. Explicitly out of scope

Door swing direction and arcs; which side of the wall a door swings to; window sashes, muntins, stools and aprons; a size catalog or preset list; openings in the DXF or the estimate; rough-opening vs. jamb-size bookkeeping; headers and structural framing; openings that straddle two walls; cabinets auto-avoiding an opening. Casing is rectangular, one piece, room side only.
