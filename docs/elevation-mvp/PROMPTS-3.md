# Elevation Lab — Codex Prompts, Steps 11–14 (wall chains, corners in plan, handles)

Commit any pending work first. Run the steps in order. After each step, check it in the browser, and optionally ask Claude to "review step N".
Each step is sized to stay well under ~800 changed lines. If a step grows much past that, stop and say why.

---
## Step 11 — Wall chains, interior side, numbering + labels

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-3.md completely (source of truth; SPEC.md and SPEC-2.md still apply where SPEC-3 doesn't change them). This step covers SPEC-3 §1–§2 and tests 1–8.
If `git status` shows uncommitted changes, stop and tell me.

1. Add src/elevation/model/topology.js (pure, JSDoc): wallComponents, chainOrientation, chainOrder, computeWallOrder(room, previousOrder), wallNumbers, wallNumberWarnings, wallLabel, and normalizeWallName (the /^Wall \d+$/ → '' rule).
2. geometry.js: change wallFrame's interior normal to the chain rule in SPEC-3 §1. Keep its return shape. Keep `flipped` negation. Avoid recomputing components for every wall in hot loops: accept an optional precomputed topology, or memoize per room object.
3. room.js: syncRoom's first pass sets `room.wallOrder = computeWallOrder(room, room.wallOrder ?? [])`.
4. Wall fields: `name` (default '') and `numberOverride` (default null). Update createWall/addWall/addWallSegment so new walls get name ''. The loader in persistence.js applies normalizeWallName and defaults missing fields (no schema bump, no migration). Extend updateWall to accept numberOverride (a positive integer or null).
5. Replace every wall display name with wallLabel(room, wall): WallList (sorted by number), PropertiesPanel (header and corner info), NeighborReturns, PlanCanvas collision messages, JsonToggle if it shows names. Wall properties get "Name (optional)" and "Number" inputs (placeholder = auto number, blank = auto) with an inline duplicate warning.
6. Plan view: a small numbered circle at each wall's midpoint on the exterior side.
7. Tests: SPEC-3 §6 tests 1–8 in src/elevation/model/__tests__/topology.test.js. All existing tests must pass. If an existing SPEC-2 test fails because of the new normal rule, stop and explain; don't edit that test.
8. `npm test`, `npm run build` and `npm run lint` must pass.

Commit "elevation-mvp: step 11 wall chains + numbering" and summarize. Manual test: draw wall A left→right, then B down from A's right end → A=1, B=2. Draw C ending at A's left end → C becomes Wall 1. Set B's number to 1 → the duplicate warning shows.
```
---
## Step 12 — Mitered wall corners in plan

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-3.md §3 and §6 tests 9–12.

1. Add src/elevation/model/wallOutline.js (pure): wallOutline(room, wall), with the miter, parallel fallback and miter-limit fallback exactly as specified. Use a line-intersection helper (add it to geometry.js if one doesn't exist).
2. src/elevation/plan/PlanWallShape.jsx: draw the wallOutline polygon (closed Line) instead of the current rectangle. Keep the face line, interior tick, length label and number circle unchanged. The polygon is also the hit area.
3. Tests 9–12 in src/elevation/model/__tests__/wallOutline.test.js.
4. `npm test`, `npm run build` and `npm run lint` must pass.

Small step; don't change anything else. Commit "elevation-mvp: step 12 mitered plan corners" and summarize. Manual test: an L-shaped room and a U-shaped room both look like one continuous wall; an unconnected end stays square.
```
---
## Step 13 — Move a wall perpendicular to its face

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-3.md §4 and §6 tests 13–16.

1. plan/wallOps.js (pure): moveWallPerpendicular(room, wallId, delta) → {ok, reason, walls}, per §4 (neighbor keeps its angle via line intersection, parallel fallback, the neighbor-too-short check).
2. src/elevation/model/room.js (or a new model/compensate.js): compensateRuns(oldRoom, newRoom) per §4.
3. elevationSlice:
   - A new reducer, moveWallPerpendicular({wallId, delta}). On ok:false, leave state unchanged and set `message` to the reason.
   - Apply compensateRuns (before syncRoom) in moveWallPerpendicular, moveWallEndpoint, setWallLength and connectWalls.
4. PlanCanvas:
   - On the selected wall (Select tool), render a move handle: a small square ~12 px into the room from the midpoint, with a move cursor, constrained to the wall normal with dragBoundFunc.
   - While dragging: a local preview only (a ghost outline of the moved wall and connected neighbors, using the pure op on a copy) plus a delta label (formatInches, signed).
   - On drag end: snap the delta to settings.planGrid and dispatch. Reset the handle position after the dispatch so it follows the new midpoint.
   - The handle must not start a stage pan (cancel bubbling), and must not conflict with the existing endpoint handles.
5. Tests 13–16, plus reducer tests showing that compensation keeps an unanchored run's plan footprint in the same place after moveWallEndpoint on its left end.
6. `npm test`, `npm run build` and `npm run lint` must pass.

Commit "elevation-mvp: step 13 wall move handle" and summarize. Manual test: in a U-shaped room, drag the back wall outward 12" → both side walls lengthen and stay square, and cabinets on the side walls don't jump (except anchored ones, which follow their corner).
```
---
## Step 14 — Run stretch handles in elevation

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-3.md §5 and §6 tests 17–19.

1. A pure helper, stretchRun(room, wallId, runId, side, newEdgeX, settings) → {ok, reason, room}, in src/elevation/model/room.js (or model/stretch.js), per §5: 0.5" snap, then a 2" snap to other run edges, wall ends and corner reserve positions; minRunWidth clamp; anchoring only when snapped to that side's wall end or corner reserve (inside corner → flex filler end); resolve-then-validate, excluding the run itself.
2. elevationSlice: a reducer, replaceRun({wallId, run}) (or stretchRun) that swaps in the resolved run and runs syncRoom.
3. ElevationCanvas / RunGroup:
   - When a run is selected in Select mode, render left and right edge handles (a full-height thin bar, ~8 px on screen, ew-resize cursor, horizontal-only dragBoundFunc).
   - Anchored sides show no handle, only the anchor marker with a tooltip.
   - While dragging: a local preview of the run with its splitRun pieces and a live width label. No dispatch.
   - On drop: call stretchRun. On success, dispatch. On failure, revert and setMessage(reason).
   - Handles must not start a new draw or clear the selection.
4. Tests 17–19, plus a test that an auto-count run re-splits after a stretch (the cabinet count changes when the width crosses a max-width boundary).
5. `npm test`, `npm run build` and `npm run lint` must pass.

Commit "elevation-mvp: step 14 run stretch handles" and summarize, with a manual test: stretch a base run until it gains a cabinet; drag an edge to a wall end → it anchors; uncheck the anchor → the handle comes back.
```
