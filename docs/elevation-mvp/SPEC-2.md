# Elevation Lab — Spec 2: Rooms, Floor Plan, Height Profile, Corners

This extends `SPEC.md` (steps 1–5, already built). Everything in SPEC.md still applies unless this file changes it.
Source of truth for steps 6–10. If something is ambiguous, pick the simplest option, leave a `// SPEC-QUESTION:` comment, and mention it in your summary.

## 0. Goals
1. **Rooms + floor plan.** Walls are drawn and connected in a plan view (like the classic editor). Clicking a wall opens its elevation.
2. **Height profile.** Heights come from room-level inputs (toe kick, base box, countertop, upper clearance, top of crown, molding), with overrides per wall and per run.
3. **Corners.** Runs on connected walls know about each other. A run anchored to an inside corner starts at the neighbor's **front depth** (box depth + bumper + door thickness, e.g. 24 + 1/16 + 13/16 = 24 7/8), and its corner filler takes up the slack. If the neighbor wall has no cabinets in that corner, the run goes all the way to the corner and the filler scribes into the wall.

Still out of scope: face presets, the database and API, the classic editor's files (you may *import* pure helpers from `src/canvas/SnapEngine.js`, but don't modify any classic file), blind or lazy susan corners, outside-corner cabinetry, islands, openings, undo.

## 1. Plan coordinates and wall orientation
- Plan coordinates are inches, x to the right, **y down** (same as the classic canvas).
- A wall's line (x1,y1)→(x2,y2) is the **finished interior face**. `thickness` (default 4.5) is drawn on the exterior side and is visual only. `length` is **derived**: `hypot(x2-x1, y2-y1)`. It is no longer stored.
- **Interior normal `n`:** let `d = (dx, dy)/L`, with candidates `nA = (-dy, dx)/L` and `nB = (dy, -dx)/L`. Let `c` = the centroid of all wall midpoints in the room and `m` = this wall's midpoint. Choose the candidate with `dot(n, c - m) > 0`. If it's a tie, or the room has one wall, choose `nA`. If `wall.flipped`, negate `n`.
- **Elevation frame:** the viewer stands inside the room facing the wall (facing direction `f = -n`). Their right-hand direction is `r = (n.y, -n.x)`. Elevation x runs along `r`.
  - If `dot(d, r) > 0`, the elevation **left end** is the wall's `start` point; otherwise it's the `end` point.
  - `elevationToPlan(frame, x, offset) = leftPoint + r*x + n*offset`, where offset is the distance into the room.
- Helper `wallFrame(room, wall)` returns `{ length, d, n, r, leftEndpoint: 'start'|'end', rightEndpoint, leftPoint, rightPoint }`.
- **Flipping a wall** (`flipWall` reducer) toggles `wall.flipped` AND mirrors its runs so they stay on the same physical cabinets:
  - `x' = L - x - width`
  - swap `ends.left` ↔ `ends.right` and `anchors.left` ↔ `anchors.right`
  - reverse `items`

## 2. Data model v2 (replaces SPEC §5 document shape)
```js
LabDocument {
  schemaVersion: 2,
  settings: Settings,
  rooms: [Room],
  activeRoomId, activeWallId,
  view: 'plan' | 'elevation'
}
Room { id, name, profile: HeightProfile /* complete */, walls: [Wall] }
Wall {
  id, name, x1, y1, x2, y2, height, thickness, flipped: false,
  connections: { start: {wallId, endpoint} | null, end: {wallId, endpoint} | null },
  profile: Partial<HeightProfile>,      // wall overrides, usually {} (e.g. { crownTop: 90 })
  runs: [Run]
}
Run (additions to SPEC §5) {
  heightMode: 'auto' | 'manual',       // auto: z/height are recomputed from the profile
  overrides: {                          // all optional; blank in the UI = inherit
    toeKickHeight?, baseBoxHeight?, countertopThickness?,   // base/tall runs
    upperClearance?,                                        // upper runs
    boxTop?                                                 // any type: explicit top of box (height above floor)
  },
  anchors: { left: boolean, right: boolean }   // anchored to that wall end/corner
}
```
- `run.x`, `run.width`, `run.z` and `run.height` stay stored. They are **resolved values**, rewritten by `syncRoom` (§5), so `splitRun`, the overlap checks and the canvas keep working unchanged.
- End panels may carry a width override: `ends.X = {type:'end_panel', width: number|null}`, where null means `settings.endPanelThickness`. This is already implemented; keep it.

### Settings changes (v2)
Remove `toeKickHeight`, `baseBoxHeight`, `countertopThickness`, `upperBottomZ`, `upperBoxHeight` and `tallBoxHeight` from settings. Add:
```js
defaultProfile: {           // HeightProfile — shop defaults; new rooms copy this
  toeKickHeight: 4,         // toe kick / furniture base is built separately (not part of the box)
  baseBoxHeight: 30.5,
  countertopThickness: 1.5,
  upperClearance: 18,       // countertop surface → bottom of upper boxes
  crownTop: 96,             // UI label: "Top of crown" (height above floor)
  topMoldHeight: 3,
  crownHeight: 4.5,
  crownOverlap: 1.5,        // crown overlaps top mold; stack = 3 + 4.5 − 1.5 = 6
},
bumperThickness: 0.0625,
doorThickness: 0.8125,
cornerFillerMinWidth: 1.5,
cornerSnapDistance: 30,     // drawn runs within this distance of a wall end get anchored
orthoWalls: true,           // plan drawing snaps wall angles to 0/90/180/270
planGrid: 0.5,
```
Keep `baseDepth`, `upperDepth`, `tallDepth` and every other SPEC §4 setting. (Later, top mold and crown will be picked from a molding catalog and these three numbers will be derived from the selections. Keep them in one place so that swap is easy.)

## 3. Migration v1 → v2 (`persistence.js`)
- New storage key `cd.elevationLab.v2`. On load: if v2 is valid, use it. Otherwise, if `cd.elevationLab.v1` is valid, migrate it. Otherwise start fresh with one room, "Room 1", containing one wall. **Never delete the v1 key.**
- **Settings:** build `defaultProfile` from the old values:
  - `toeKickHeight`, `baseBoxHeight` and `countertopThickness` copy over as-is.
  - `upperClearance = old.upperBottomZ − (toe + base + counter)`.
  - All other new keys use their defaults.
- **Room:** create one room, "Room 1", with `profile = defaultProfile`.
- **Walls:** each old wall i becomes `x1 = 0, y1 = i*60, x2 = old.length, y2 = i*60`, with thickness 4.5, no connections and `profile {}`.
  - After building the room, for every wall where `wallFrame(...).leftEndpoint !== 'start'`, set `flipped = true` **without** mirroring runs. The elevation must look identical after migration.
- **Runs:** `heightMode: 'manual'`, `overrides: {}`, `anchors: {left:false, right:false}`. Their positions stay as they are.

## 4. Height profile resolution (`src/elevation/model/profile.js`, pure)
- `resolveProfile(settings, room, wall)` = `{...settings.defaultProfile, ...room.profile, ...wall.profile}`, ignoring null/undefined.
- `moldingStack(p) = p.topMoldHeight + p.crownHeight - p.crownOverlap`
- `counterTop(p) = p.toeKickHeight + p.baseBoxHeight + p.countertopThickness`
- `resolveVertical(run, p, baseRunsBelow)` → `{ z, height, warnings[], errors[] }`, where `q = {...p, ...run.overrides}` and `boxTop = q.boxTop ?? (q.crownTop − moldingStack(q))`:
  - **BASE:** `z = q.toeKickHeight`, `height = q.baseBoxHeight`.
  - **TALL:** `z = q.toeKickHeight`, `height = boxTop − z`.
  - **UPPER:**
    - `counterRef` is the max of `counterTop({...p, ...b.overrides})` over the **base** runs on the same wall whose x-range overlaps this run by more than 1e-6.
    - If those values differ → warning `mixed-counter-heights`. If there are no such base runs → `counterTop(q)`.
    - `z = counterRef + q.upperClearance`, `height = boxTop − z`.
  - `height <= 0` → error `no-room-for-box`.
  - `boxTop + moldingStack(q) > wall.height + 1e-6` (for upper/tall) → warning `crown-above-ceiling`.
- Manual runs keep their z/height (still validated for `no-room-for-box`).

## 5. Corners (`src/elevation/model/corners.js`, pure)
- `frontDepth(run, settings) = run.depth + settings.bumperThickness + settings.doorThickness`
- **`cornerAt(room, wall, side)`** (`side` is 'left' or 'right' in elevation terms):
  - `endpoint` = the frame's left or right endpoint. `conn = wall.connections[endpoint]`. No connection → `{type: 'open'}`.
  - `uA` = the unit vector from the corner point along wall A (toward A's other end). `uB` = the same for the neighbor.
  - `θ = acos(clamp(dot(uA, uB)))` in degrees.
  - If `|θ − 180| < 1` → `{type: 'straight'}`.
  - If `dot(nA, uB) > 0` → `{type: 'inside', angle: θ, neighborWallId, neighborSide}`. `neighborSide` is the neighbor's elevation side at that corner.
  - Otherwise → `{type: 'outside', angle: 360 − θ, ...}`.
- **Band compatibility:** base ↔ base or tall; upper ↔ upper or tall; tall ↔ everything.
- A neighbor run **occupies the corner** when `run.anchors[neighborSide] === true`. Unanchored runs never reserve space; the collision check (§7) catches those.
- **`cornerReserve(room, wall, side, run, settings)`:**
  - For an inside corner: `max(frontDepth(nb) / sin(θ))` over the neighbor runs that occupy the corner and are band-compatible with `run`, or 0 if there are none.
  - For open, straight or outside corners: 0.
- **`resolveHorizontal(run, L, reserveL, reserveR)`:**
  - both anchors → `x = reserveL`, `width = L − reserveL − reserveR`
  - left only → `x = reserveL` (width unchanged)
  - right only → `x = L − reserveR − width`
  - neither → unchanged
  - If a one-sided anchor would push the run past the other wall end (x < 0, or x + width > L), shrink the width to fit and include warning `anchor-shrunk` in resolveHorizontal's return value. The shrink is stored and does not grow back automatically. roomDiagnostics does not need to report it; the UI may show a transient message.
  - `width < settings.minRunWidth` → error `anchor-too-narrow`
  - Round the results to 1/16.
- **Splitter:** `splitRun(run, settings, opts?)`. The new optional `opts.endMinWidths = {left, right}` replaces `fillerMinWidth` for flex fillers on that end. When a side is anchored to an inside corner, pass `settings.cornerFillerMinWidth`. Existing 2-argument calls and tests must keep working unchanged.
- **`syncRoom(room, settings) → room`** (pure; called by every reducer that changes a room, wall, run or settings):
  1. Horizontal pass: for every wall and every run, compute reserves and `resolveHorizontal`. Reserves depend only on neighbor anchors and depths, never on neighbor positions, so a single pass is enough.
  2. Vertical pass: resolve all BASE runs, then TALL, then UPPER (uppers read the resolved base runs). Skip manual runs.
  3. `syncAutoItems` on every run, using the end minimum widths.
  - Return per-run diagnostics via a separate pure function, `roomDiagnostics(room, settings) → { [runId]: {warnings, errors} }`, which combines the splitter, vertical, anchor and collision results. The UI uses this for highlighting and the warnings list.

## 6. Creating runs (changes to SPEC §7 `createRun`)
- `createRun(bounds, ctx)` with `ctx = {settings, room, wall}`:
  - Infer the type as before. Then `heightMode = settings.snapHeightsToDefaults ? 'auto' : 'manual'`, `overrides = {}`.
  - Anchors: `left = x <= cornerSnapDistance`, `right = (L − (x + width)) <= cornerSnapDistance`.
  - For each anchored side whose corner is `inside`, set that end to `{type:'filler', width:null}`. For anchored `open` sides, leave `defaultEnds` as is.
  - The caller adds the run and the reducer runs `syncRoom`, which resolves x, width, z and height.
- **Placement validation** runs on the resolved run: build a temporary room with the run added, run `syncRoom`, then call `validateRunPlacement` against the resolved wall (length = the derived L). Put this in a helper, `tryPlaceRun(room, wallId, run, settings) → {ok, reason, room}`.

## 7. Plan footprints and collisions (`src/elevation/model/footprints.js`, pure)
- `runFootprint(frame, run, settings)`: a 4-point polygon from `elevationToPlan(frame, x, 0)` → `(x+width, 0)` → `(x+width, frontDepth)` → `(x, frontDepth)`.
- `findCollisions(room, settings)`: for each pair of runs on **different** walls that are band-compatible, check whether their footprints overlap with area > 1e-3 (SAT, or convex polygon clipping). Report warning `corner-collision` on both runs.

## 8. UI changes
- **Sidebar:**
  - Room picker: add, rename, delete (inline confirm), select.
  - "Room heights" panel: every HeightProfile field as an InchInput, with "Top of crown" as the label for `crownTop`, and a read-only molding stack and counter height.
  - The wall list shows the active room's walls, with length read-only (derived).
  - The Settings panel gains the new §2 settings.
- **Toolbar:** a **Plan | Elevation** view toggle, persisted as `view`.
  - Plan tools: Select, Draw Wall, an Ortho toggle and Zoom to fit.
  - Elevation tools: unchanged.
- **Plan canvas** (`src/elevation/plan/PlanCanvas.jsx` + subcomponents, react-konva, sized with a ResizeObserver):
  - Draw walls as their interior-face line plus a thickness band on the exterior side, with a small arrow or tick showing the interior side.
  - Draw Wall: click the start point, then click the end point (snap to `planGrid`; ortho when enabled). Endpoints within 6" of an existing endpoint snap to it and auto-connect. You may import `snapToGrid` / `snapToEndpoint` from `src/canvas/SnapEngine.js`. Port the connection behavior of the classic `wallSlice` (`addWall` with connectStart/connectEnd, `moveWallEndpoint` propagating to the connected wall, `connectWalls`, `disconnectWallEndpoint`, and removal clearing connections) into elevation-slice reducers. Do **not** import or modify the classic slice.
  - Select: click a wall to select it. Dragging a selected wall's endpoint handle moves it, with connections following and ortho applied. Double-click a wall to set it active and switch to Elevation.
  - Draw run footprints (§7) for all runs: base/tall solid, upper dashed outline, colored by type, with collisions outlined red. Clicking a footprint selects its wall and run.
  - Show each wall's length label along the wall.
- **Wall properties** (right panel, when a wall is selected in plan and no run is selected):
  - name
  - length (InchInput; moves the non-anchor endpoint along the wall direction, and the connected neighbor endpoint follows)
  - height, thickness
  - Flip (interior side) button
  - wall profile overrides: "Top of crown" etc., where blank = inherit from room
- **Run properties** (additions):
  - Heights: an Auto/Manual toggle. In Auto, show resolved z and height read-only, plus override inputs by type:
    - base: toe kick, box height, countertop
    - tall: toe kick, box top
    - upper: clearance above counter, box top
    - Blank = inherit.
  - In Manual, show the z and height inputs as today.
  - Anchors: "Anchor left" / "Anchor right" checkboxes. When anchored, x (and width, if both are anchored) become read-only with a note like "anchored to corner (reserve 24 7/8")". Anchoring a side at an inside corner sets that end to a flex filler.
  - Corner info per side: open / inside 90° with Wall B / etc.
  - A front depth read-only line.
- **Elevation canvas** (additions):
  - For upper and tall runs in auto mode, draw the molding stack above the box top: a top mold band (`boxTop` → `+topMoldHeight`) and a crown band (`boxTop + topMoldHeight − crownOverlap` → `+crownHeight`). Visual only.
  - Draw a dashed "Top of crown" line across the wall at the resolved `crownTop`, with a label.
  - **Neighbor returns:** for each inside-corner side, draw a hatched block for each occupying neighbor run: x from the wall end to `frontDepth/sin θ`, z range = the neighbor's z/height, label "<neighbor wall name>". Not selectable.
  - Show an anchor marker (e.g. ⚓ or ▌) on anchored run ends.
- All highlighting and warnings use `roomDiagnostics`.

## 9. Required tests (vitest)
Use the defaults in §2 unless noted.

**Profile:**
1. `moldingStack` = 6. With `crownTop` 96: boxTop = 90.
2. Base auto: z 4, h 30.5. Tall auto: z 4, h 86. Upper auto with no base below: z 54, h 36. No `crown-above-ceiling` on a 96" wall; wall height 95 → warning.
3. Upper over a base with `countertopThickness` override 3 → z 55.5, h 34.5. Upper with `upperClearance` override 20 (base defaults) → z 56, h 34.
4. Wall profile `{crownTop: 90}` → upper h 30 (z 54), tall h 80.
5. Upper over two bases, one with counter 3 and one default → z 55.5 + `mixed-counter-heights`.
6. Room `crownTop` 60 → upper `no-room-for-box`.

**Frame and corners.** Room R: wall A (0,0)→(120,0), wall B (120,0)→(120,96), A.end ↔ B.start connected.

7. `wallFrame(A)`: n = (0,1), leftEndpoint 'start'. `wallFrame(B)`: n = (−1,0), leftEndpoint 'start'. With A drawn reversed ((120,0)→(0,0), connection updated), A's leftEndpoint is 'end'.
8. `cornerAt(A, 'right')` → inside, 90°, neighbor B side 'left'. `cornerAt(A, 'left')` → open.
9. B.end at (120,−96) with A.flipped = true (so A's interior stays (0,1)) → `cornerAt(A,'right')` is outside. Note: without the flip, the centroid rule puts the room on the concave side and the corner is inside, which is also correct. B.end at (200,0) → straight.
10. A base run anchored right (width 60) + B base run anchored left (width 48) → after `syncRoom`: A run x = 120 − 24.875 − 60 = 35.125; B run x = 24.875.
11. B has no runs → the A run anchored right ends exactly at 120 (reserve 0).
12. B has only an anchored upper → A base reserve 0 and A upper reserve 12.875. B has an anchored tall (depth 24) → both A base and A upper reserve 24.875.
13. B base unanchored at x 0 → A reserve 0, and `findCollisions` flags both runs. Both anchored → no collision.
14. 135° corner: B.end at (120 + 67.8823, 67.8823) → reserve = 24.875 / sin(135°) ≈ 35.1786 (within 1e-3).
15. Both anchors on A, B base anchored → A x = 0, width = 95.125 (left open, reserve 0).
16. `flipWall` on L = 120, run x 10, w 30, left anchor true, ends {left: end_panel, right: filler}, items [a, b] → x 80, anchors.right true, ends swapped, items [b, a].
17a. Room R with an A base run anchored right only, width 110, plus an anchored B base run → after syncRoom, A run x = 0, width = 95.125. Calling resolveHorizontal directly with those inputs returns warning `anchor-shrunk`.
17. Corner filler minimum: `cornerFillerMinWidth` 3 and A run anchored right at an inside corner → the right flex filler is ≥ 3; the left, unanchored flex filler uses a 1.5 minimum.

**Migration:**

18. A v1 document with two walls (lengths 144, 96) and runs → v2 with one room, the walls horizontal at y 0 and 60, every wall `leftEndpoint === 'start'` after the flipped fix, run x/z/height unchanged, `heightMode` 'manual', and the v1 key still present.

**Regression:**

19. All existing tests still pass.
