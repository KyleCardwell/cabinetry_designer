# Elevation Lab — Spec 3: Wall chains & numbering, mitered corners, move/stretch handles

Extends SPEC.md and SPEC-2.md (steps 1–10 are built; new rooms start in Plan view with no walls). Source of truth for steps 11–14.
If something is ambiguous, pick the simplest option, leave a `// SPEC-QUESTION:` comment, and mention it in your summary.
**No storage migration:** there's no real saved data. New wall fields are optional and default when missing. Keep the storage key and schemaVersion as they are.
Note: walls saved under the old centroid rule may carry `flipped: true` values that now look mirrored. That's acceptable for test data; the user can press Flip or start a new room.

## 1. Wall chains (`src/elevation/model/topology.js`, pure)
Each wall endpoint has at most one connection, so each connected component is either a **path** (open chain) or a **cycle** (closed room).

- **`wallComponents(room)`** → `[{ kind: 'path'|'cycle', walls: [{ wallId, from, to }] }]`, in **traversal order**, where `from`/`to` are the endpoints ('start'|'end') the walk enters and leaves each wall through.
  - Path: start at the end wall that appears first in `room.walls`, through its free endpoint.
  - Cycle: start at the cycle wall that appears first in `room.walls`, entering it through its `start` endpoint (walk start → end).
  - A single unconnected wall is a path of one, traversed start → end.
- **`chainOrientation(room, component)`**: take the vertices `point(w0.from), point(w0.to), point(w1.to), …` (a cycle doesn't repeat its first vertex). Signed area `A = ½ Σ (x_i·y_{i+1} − x_{i+1}·y_i)`, closing back to the first vertex. Returns `+1` if `A ≥ −1e-6`, else `−1`. Straight chains and single walls return +1.
- **Interior normal (replaces the centroid rule in `wallFrame`):** for a wall traversed along the unit direction `t` (from → to), `n = orientation > 0 ? (−t.y, t.x) : (t.y, −t.x)`. `wall.flipped` still negates it. Everything else in `wallFrame` (r, left/right endpoints, …) stays the same.
  - Consequence: with no flips, every wall's elevation **right** end is its traversal-forward end when orientation is +1 (and the reverse when −1). So "left → right" follows the chain.
  - All SPEC-2 §9 tests must still pass unchanged. They were checked against this rule.
- **Chain order:** the component's traversal order if orientation is +1, reversed if −1. For a path, the first wall in chain order is the one whose **left** end is free.
  - **Cycles:** rotate the order to start at the cycle wall with the lowest index in the previous `room.wallOrder`. If none of its walls were in `wallOrder`, start at the wall that appears first in `room.walls`.
- **`room.wallOrder`** (a new stored array of wall ids) is recomputed by `syncRoom` as its **first** pass, before anything else.
  - Components are concatenated, sorted by the lowest previous `wallOrder` index among their walls. Components with no previously ordered walls go last, in `room.walls` order.
  - Result: when a new wall's right end connects to Wall 1's left end, the new wall becomes Wall 1 automatically, and other chains keep their relative order.

## 2. Wall numbers and labels
- New optional wall fields: `name: string` (a custom label, default `''`) and `numberOverride: number | null` (a positive integer, default null).
- **`wallNumbers(room)`** → `Map(wallId → number)`.
  - Walls with `numberOverride` get that number.
  - The remaining walls, in `room.wallOrder` order, get 1, 2, 3, …, skipping numbers already taken by overrides.
  - Duplicate overrides are allowed, but `wallNumberWarnings(room)` returns `{code:'duplicate-wall-number', wallIds}`.
- **`wallLabel(room, wall)`** → `"Wall 3"`, or `"Wall 3 · Sink wall"` when `name` is non-empty.
- **Every UI place that shows a wall uses `wallLabel`:** wall list, properties header, corner info, neighbor returns, collision messages, JSON view, plan labels.
  - The wall list is sorted by number.
- New walls are created with `name: ''`. On load, treat a name matching `/^Wall \d+$/` as `''`. This is a normalization in the loader, not a migration.
- **Wall properties panel:** a "Name (optional)" text input, and a "Number" input showing the auto number as its placeholder (blank = auto, integer ≥ 1). Show the duplicate warning inline.
- **Plan view:** draw the wall number in a small circle at the midpoint, on the exterior side, in addition to the length label.

## 3. Mitered wall corners in plan (`src/elevation/model/wallOutline.js`, pure)
- **`wallOutline(room, wall)`** → a 4-point polygon `[faceStart, faceEnd, backEnd, backStart]`.
  - The face points are the wall endpoints.
  - The back points are the face points offset by `−n · thickness`, **except** at connected endpoints, where the back point is the intersection of this wall's back line with the neighbor's back line (the neighbor's own `−n · neighbor.thickness` offset).
- **Fallbacks:** keep the plain offset point when the lines are parallel (`|cross| < 1e-6`), or when the intersection is farther than `4 × max(thicknesses)` from the face corner (a very acute angle).
- `PlanWallShape` draws this polygon instead of its own rectangle. The face line, tick and labels are unchanged. Selection and hit area use the polygon.

## 4. Moving a wall perpendicular to its face (plan view)
- **Handle:** when a wall is selected in Plan/Select, show a small draggable square at its midpoint, offset ~12 px (screen) into the room along `n`.
  - It drags only along `n`: use Konva `dragBoundFunc` to project onto the normal line through the midpoint.
  - While dragging, show a local preview (outline + delta label, e.g. `+3 1/2"`) and don't dispatch.
  - On drag end, dispatch `moveWallPerpendicular({wallId, delta})`, with the delta snapped to `settings.planGrid`.
- **`moveWallPerpendicular(room, wallId, delta)`** (pure, in `plan/wallOps.js`) → `{ ok, reason, walls }`:
  - The moved line is the wall's face line shifted by `delta · n`.
  - For each endpoint:
    - **Connected to neighbor N at endpoint f:** the new shared point is the intersection of the moved line with N's line (through N's other endpoint, in N's direction). N keeps its angle. If the lines are parallel, use `old point + delta · n`. Set the point on both walls.
    - **Unconnected:** `old point + delta · n`.
  - Reject the move (`ok:false`) with reason `neighbor-too-short` if any wall ends up shorter than 1", or with its direction reversed (dot of old and new direction ≤ 0).
- **Keeping runs in place (all wall-geometry reducers):** add a pure helper, `compensateRuns(oldRoom, newRoom)`.
  - For every wall whose frame-left point moved, compute `shift = dot(newLeft − oldLeft, newFrame.r)`.
  - Every **unanchored-left** run on that wall gets `x −= shift`, so it stays physically in place.
  - Left-anchored runs are left to `syncRoom`.
  - Apply it in `moveWallPerpendicular`, `moveWallEndpoint`, `setWallLength` and `connectWalls`, before `syncRoom`.

## 5. Run stretch handles (elevation view)
- **Handles:** when a run is selected (Select tool), draw a handle on its left edge and one on its right edge: a thin vertical bar the full run height, ~8 px wide on screen, with an `ew-resize` cursor.
  - Handles drag horizontally only (`dragBoundFunc`).
  - A side with `anchors[side] === true` shows no handle, only the anchor marker with a tooltip: "Anchored — uncheck Anchor to resize".
- **During the drag:** a local preview only. Recompute the run with the new x/width and render its `splitRun` pieces in the preview, with a live width label. Don't dispatch.
- **On drop** (pure helper `stretchRun(room, wallId, runId, side, newEdgeX, settings)` → `{ok, reason, room}`):
  1. Snap the edge to 0.5".
  2. Then, if it's within 2" of another run's edge on the same wall (any type) or of a wall end, snap to that.
  3. Enforce `width ≥ settings.minRunWidth`. The opposite edge stays fixed.
  4. If the edge snapped to that side's wall end, or to that side's current corner reserve position (step 2's 2" snap), set `anchors[side] = true`. If that corner is an inside corner, also set that end to a flex filler (same rule as `createRun`). Stretching deliberately does **not** use `cornerSnapDistance`, so users can still place an edge a few inches from a wall end without anchoring it.
  5. Validate with the same resolve-then-check approach as `tryPlaceRun`, excluding the run from its own conflicts.
  - On failure, revert and show the reason via `setMessage`. On success, dispatch a reducer that replaces the run and runs `syncRoom` (auto-count runs re-split automatically).
- Plan-view footprints get no handles in this phase.

## 6. Required tests (vitest)
Room R (from SPEC-2): A (0,0)→(120,0), B (120,0)→(120,96), A.end ↔ B.start, thickness 4.5.

**Topology and numbering**
1. `wallComponents(R)` is one path, A then B. Orientation +1. `wallOrder = [A, B]`. Numbers A=1, B=2.
2. Add wall C (0,96)→(0,0) with C.end ↔ A.start → `wallOrder = [C, A, B]`, so C is Wall 1. Normals: C n = (1,0), A (0,1), B (−1,0).
3. Test 2's room with every wall drawn in the opposite direction (A (120,0)→(0,0), B (120,96)→(120,0), C (0,0)→(0,96); connections A.start ↔ B.end, A.end ↔ C.start) gives the same normals and `wallOrder = [C, A, B]`.
4. Close the loop with D (120,96)→(0,96), connecting B.end ↔ D.start and D.end ↔ C.start → cycle. `wallOrder` still starts at C (the previous first wall).
5. Overrides: `B.numberOverride = 1` in R+C → B=1, C=2, A=3. `A.numberOverride = 1` too → a duplicate warning listing both.
6. `wallLabel`: `name ''` → "Wall 2". `name 'Sink wall'` → "Wall 2 · Sink wall". A loaded name "Wall 7" is normalized to `''`.
7. Two separate chains: the order is stable when a wall is added to the second chain. The first chain keeps numbers 1..k.
8. All SPEC-2 §9 frame/corner tests (7–17a) still pass unchanged.

**Outlines**

9. R outlines: A = [(0,0),(120,0),(124.5,−4.5),(0,−4.5)]; B = [(120,0),(120,96),(124.5,96),(124.5,−4.5)].
10. B thickness 6 → the shared back point is (126,−4.5) on both walls.
11. 135° corner (B.end at (120+67.8823, 67.8823)) → A's mitered back point ≈ (121.864, −4.5) (within 1e-3).
12. Collinear connection (B.end at (200,0)) → plain offsets, no miter.

**Wall move**

13. Move A by delta −10 (toward the exterior, n = (0,1)) → A at y = −10, B.start = (120,−10), B length 106, B angle unchanged.
14. 135° neighbor: move A by +5 → the shared point is on B's original line, and B's direction is unchanged (within 1e-6).
15. Moving A by +96 (B would have length 0) → `ok:false`, reason `neighbor-too-short`, walls unchanged.
16. `compensateRuns`: an unanchored run on B at x = 30 before test 13's move → x = 40 after it (B's left end moved 10 away from B's interior-right direction). A left-anchored run on B isn't changed by compensation, and `syncRoom` resolves it.

**Stretch**

17. Run on A (no other runs), x 40, w 40. Stretch the right edge to 87.3 → width 47.5 (snapped to 0.5), no anchor. From the original run, stretch the left edge to 3 → x 3, width 77, no anchor. Stretch the left edge to 1.2 → snaps to the wall end (0) → `anchors.left = true`, and after `syncRoom`, x = 0.
18. A stretch that would overlap another base run → `ok:false`, reason `conflict`, room unchanged. The edge snaps to a neighboring run edge within 2".
19. A stretch below `minRunWidth` is clamped to `minRunWidth`.
