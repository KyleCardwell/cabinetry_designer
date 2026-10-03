# Elevation Lab — Spec 5: Elevation zoom, bigger click targets, plan fills, anchor/end rules

Extends SPEC.md, SPEC-2.md, SPEC-3.md and SPEC-4.md (steps 1–17 are built). Source of truth for steps 18–19.
Codex cannot run the app (it's behind a login), so correctness has to come from unit tests and careful reading. If something is ambiguous, pick the simplest option, leave a `// SPEC-QUESTION:` comment, and mention it in your summary. No storage or schema changes.

## 1. Elevation zoom and pan
Today the elevation always auto-fits. Add a view state on top of the fit transform.

### 1.1 Pure helpers (`src/elevation/canvas/transform.js`)
- `DEFAULT_VIEW = { zoom: 1, panX: 0, panY: 0 }`
- `withView(base, view)` → `{ scale: base.scale * view.zoom, offsetX: base.offsetX * view.zoom + view.panX, offsetY: base.offsetY * view.zoom + view.panY, wallHeight: base.wallHeight }`
  - `base` is the `fitWallToViewport` result, so `withView(base, DEFAULT_VIEW)` equals `base`.
- `zoomViewAt(base, view, pointer, factor, { min = 0.25, max = 8 })` → a new view whose zoom is `clamp(view.zoom * factor, min, max)` and whose pan keeps the wall point under `pointer` in the same screen position:
  - `panX' = pointer.x − zoom' × (wx × base.scale + base.offsetX)`
  - `panY' = pointer.y − zoom' × ((base.wallHeight − wz) × base.scale + base.offsetY)`
  - where `{x: wx, z: wz} = screenToWall(pointer, withView(base, view))`.
  - When the zoom is already clamped, the view is returned unchanged.
- `panView(view, dx, dy)` → `{ ...view, panX: view.panX + dx, panY: view.panY + dy }`

### 1.2 ElevationCanvas
- Hold `view` in component state. Reset it to `DEFAULT_VIEW` when the active wall changes and whenever "Zoom to fit" runs (the existing `fitRequest`).
- Everything that consumes the transform uses `withView(base, view)`, so dimension rows, handles, hit testing and the draw tool all keep working.
- **Wheel:** `event.evt.preventDefault()`, then `zoomViewAt` with factor `1.08` (up) or `1/1.08` (down) at the pointer. Ctrl/⌘ inverts, matching the plan canvas.
- **Pan:** the Stage is draggable in Select mode when no run drag, stretch or draw is in progress. On drag end, fold the stage position into `view` via `panView` and reset the stage position to 0,0 (the plan canvas does the same).
- Handles (stretch, and anything draggable) must set `cancelBubble` on `dragstart`, so panning never starts from a handle.
- **Toolbar:** in Elevation view, add "−", "+" and a zoom percentage readout (`Math.round(zoom × 100)%`), plus the existing Zoom to fit. "+"/"−" zoom about the viewport center.
- **Keyboard** (when focus isn't in an input, select or textarea): `+`/`=` zoom in, `−` zoom out, `0` zoom to fit.

## 2. Bigger click targets for run selection (elevation)
In `DimensionRow.jsx`, for `'run'` segments (the only clickable ones), replace the thin line hit area with explicit invisible hit rectangles, all with `fill="rgba(0,0,0,0.001)"`:
- **Band:** along the dimension line, covering the segment from end to end and 14px on each side of the line (28px total thickness). For vertical rows, the same rotated.
- **Label:** a rectangle around the label's bounding box, plus 4px, whether the label is inline or popped out. When it's popped out, also cover its leader line (a 10px-wide band between the line and the label).
- Keep `onSegmentClick`. A hidden label has no label rectangle, but keeps its hover tooltip.
- Nothing else in the row listens for events.

## 3. Plan view: fill upper cabinets
In `PlanRunFootprint.jsx`, upper runs get a translucent fill instead of the near-invisible one: `fill={`${color}59`}` (about 35% alpha), keeping the dashed outline and the type color. Base and tall fills are unchanged. Uppers still render above base and tall footprints, and the click-through cycling from SPEC-4 §1 still applies, so a base under an upper is reachable with a second click.

## 4. Anchoring and automatic ends
### 4.1 Settings
- `cornerSnapDistance`: **3** (was 30). A run only anchors when its edge is within 3" of a wall end **and** that end is an `inside` corner (a connected corner). Open, straight and outside wall ends never auto-anchor.
- New: `autoEndPanelOnFreeEnd: true`.
- New: `adjacentRunGap: 1` — a run edge within this distance of another run's edge counts as "adjacent".
- Show both new settings in the settings panel (a checkbox and an inch input).

### 4.2 `createRun` anchors and end types
**Anchors:** `anchors[side] = true` only when the run's edge on that side is within `cornerSnapDistance` of that wall end **and** `cornerAt(room, wall, side).type === 'inside'`. Otherwise false. (The user can still tick Anchor manually on any side.)

**End types**, for each side, in order:
1. If the side is anchored → `{type: 'filler', width: null}` (anchored now implies an inside corner).
2. Otherwise, if `autoEndPanelOnFreeEnd` and the side is **not adjacent** to an existing band-compatible run on that wall → `{type: 'end_panel', width: null}`.
   - "Adjacent" means the distance between this run's edge and the other run's nearest edge is ≤ `adjacentRunGap`, using `bandsCompatible`.
3. Otherwise → `{type: settings.defaultEnds[side], width: null}` (today's behavior). An adjacent run therefore gives `defaultEnds`, which is normally a filler.
- A side at an `open`, `straight` or `outside` wall end is never anchored, so a run drawn to the open end of a wall keeps its drawn position and gets an end panel.

### 4.3 Elsewhere
- `stretchRun` (SPEC-3 §5): same restriction — snapping an edge to a wall end or corner reserve sets the anchor **only** at an `inside` corner, and then sets a flex filler. At an open, straight or outside end, the edge still snaps but no anchor is set and the end type doesn't change.
- Toggling the Anchor checkbox keeps today's behavior (anchoring at an inside corner sets a flex filler).

## 5. Required tests (vitest)
**Transform**
1. `withView(base, DEFAULT_VIEW)` deep-equals `base`.
2. `zoomViewAt` with factor 2 at pointer P: the wall point under P before the zoom maps back to P (within 1e-6), and the zoom is 2.
3. Zoom clamping: from zoom 8, factor 2 returns the view unchanged; from 0.25, factor 0.5 likewise.
4. `panView` adds the deltas; `withView` shifts screen positions by exactly the pan.

**createRun ends** (Room R from SPEC-2: A (0,0)→(120,0), B (120,0)→(120,96) connected, defaults with `cornerSnapDistance` 3)

5. A run drawn x 2 → w 60 on wall A, whose left end is open: `anchors.left` false (open ends never anchor) and the left end is `end_panel`. The right side (x+w = 62, far from both ends) → `end_panel`, anchor false.
6. A run drawn x 6 → w 60 (no anchor on either side, no neighbors) → both ends `end_panel`, both anchors false.
7. A run whose right edge is 118.5 (within 3 of the 120 end, an inside corner with B) → `anchors.right` true and the right end is a flex filler.
8. With an existing run ending at x 60: a new run drawn from x 60.5 → its left edge is adjacent (0.5 ≤ 1) → the left end is `defaultEnds.left` ('filler'), not an end panel. Its far side is still an end panel.
9. `autoEndPanelOnFreeEnd: false` → both ends fall back to `defaultEnds`.
10. `DEFAULT_SETTINGS.cornerSnapDistance === 3`, and a run drawn 5" from the inside corner no longer anchors (it did at 30").
11. On wall B (whose left end is the inside corner with A), a run drawn with its left edge at 1.5 → `anchors.left` true and a flex filler. The same run on wall A's open left end → no anchor, end panel.
