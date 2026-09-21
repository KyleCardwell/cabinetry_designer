# Elevation Lab — Codex Prompts, Steps 90–95 (wing walls)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, and commit pending work first (including these docs).

**Order:** 90 → 91 → 92 → 93 → 94 → 95. Each step needs the one before it.

**Codex can't open the app**, so don't plan browser checks. Kyle checks 94 and 95 by hand.

**The gate is the same for every step:** while iterating, run only `npx vitest run <the named test file>`. Run `npm test && npm run lint` once, at the end. Don't run `npm run build`. Line numbers are as of `96cba0a`; every site is also named by function.

**Vocabulary:** a *landing* is a wall end sitting on another wall's face (`wall.landings.start|end`); the *host* is the wall landed on; an *interval* is `[a, b]`, the stretch of the host face a landed wall's thickness covers. A landing is not a connection: `wall.connections` stays end-to-end only. SPEC-18 §0.

---
## Step 90 — `wall.landings` and the landing geometry module

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-18.md §0–§2, §5 (persistence only), §8 tests 133–142.
If `git status` shows uncommitted changes, stop and tell me.

This step adds a field, a run-anchor shape and a pure module. Nothing calls the module from the app yet.

Files:
- NEW src/elevation/model/landings.js
- src/elevation/model/index.js (186): one export block
- src/elevation/store/elevationSlice.js (1175): createWall only (64–83)
- src/elevation/model/room.js (1368): cloneRoom only (63–~100)
- src/elevation/store/persistence.js (620): isRunAnchor (168) and isWall (238) only
- tests: NEW src/elevation/model/__tests__/landings.test.js; src/elevation/store/__tests__/persistence.test.js (599; append a describe at the end, reuse tbtDocument())

1. landings.js exports exactly the nine names in SPEC §2 plus LANDING_TO, with the behaviour §2 describes. Imports: add, dot, lineIntersection, magnitude, scale, subtract, wallFrame from './geometry.js' and wallSideFrame from './wallSides.js'. It must NOT import corners.js or room.js (corners.js will import it in step 91).
   - landingInterval uses the landed wall's own front frame (`wallFrame(room, wall.sideSource ?? wall)`), back line = drawn line − n × thickness.
   - landingsOn takes a stored wall (reads side 'front') or a side view (reads view.side).
   - releaseWall in this step clears run anchors only; SPEC-19 adds soffit anchors.
2. createWall: `landings: values.landings ?? { start: null, end: null },` next to endPanels.
3. cloneRoom: copy landings the same way endPanels is copied.
4. persistence.js:
   - isRunAnchor: also accept `{ to: 'wall', wallId: <string> }`.
   - isWall: `&& (wall.landings === undefined || isLandings(wall.landings))`, where isLandings needs both keys, each null or `{ wallId: string, side: 'front'|'back', ref: string, to: 'near'|'far'|'center', offset: finite }`.
5. index.js: `export { LANDING_TO, landingEndpoint, landingInterval, landingOffsetFor, landingRefCreatesCycle, landingsOn, landWallEnd, releaseWall, resolveLandings, snapToWallFace } from './landings.js';`

landings.test.js: base, makeWall (with `landings`), makeRoom, wallById, moveWall, withLanding, interval, alcove, chained and AL exactly as SPEC-18 §8. Tests 133–141 there; test 142 in persistence.test.js.
Expect 432 passing.

At most five lines of summary. Commit "elevation-mvp: step 90 wall landings".
```

---
## Step 91 — Corners and anchors at a landing

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-18.md §2 (syncRoom line), §3, §8 tests 143–149.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- src/elevation/model/corners.js (159): cornerAt (51), cornerReserveParts (74), plus three new exports
- src/elevation/model/wallSides.js (53): wallEndPanelAt only
- src/elevation/model/wallEndPanels.js (55): the free-endpoint check only
- src/elevation/model/room.js: syncRoom's first line (~428), endMinWidthsForRun (129), endCornerAnglesForRun (143), resolveRunAnchorDatum (175), describeAnchor (199), the topology import (30)
- src/elevation/model/index.js: export spanCorner, cornerForRunSide, anchoredToCorner
- test: src/elevation/model/__tests__/landings.test.js

corners.js (import landingEndpoint from './landings.js', scale from './geometry.js'):
- cornerAt: after reading `connection`, `const landing = wall.landings?.[endpoint]; if (!connection && landing) return landingCorner(room, wall, frame, endpoint, landing);`. landingCorner is a private function doing exactly SPEC §3 "The landed wall's end".
- New exports spanCorner(room, hostView, run, side), cornerForRunSide(room, wall, run, side) (converts with wallViewForRun first), anchoredToCorner(anchor, corner), per §3.
- cornerReserveParts: `const corner = cornerForRunSide(room, wall, run, side);` instead of cornerAt, and line 97 becomes `if (!anchoredToCorner(neighborRun.anchors?.[corner.neighborSide], corner)) return reserve;`. Nothing else in it changes.

wallSides.js wallEndPanelAt and wallEndPanels.js: an endpoint with `landings?.[endpoint]` counts as not free, exactly like a connection.

room.js:
- syncRoom: `let nextRoom = cloneRoom(resolveLandings(room));`
- endMinWidthsForRun / endCornerAnglesForRun: use cornerForRunSide(room, wall, run, side), and treat `run.anchors?.[side]?.to === 'wall'` like `=== true`.
- resolveRunAnchorDatum: a `{ to: 'wall' }` branch after the opening branch, per §3 (uses landingsOn and cornerReserve).
- describeAnchor: a `{ to: 'wall' }` branch after the joint branch, per §3. Import wallLabel from './topology.js'.

Do NOT touch: horizontalResolution, resolveHorizontal, splitRun, joints, stretchRun, moveRun, createRun (step 92), the slice (step 93).

Tests 143–149 exactly as SPEC-18 §8.
Expect 439 passing.

At most five lines of summary. Commit "elevation-mvp: step 91 corners at wall landings".
```

---
## Step 92 — Drawing, snapping and dimensions against wing walls

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-18.md §4, §8 tests 150–153.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- src/elevation/model/runDefaults.js (128): createRun's anchors (79) and ends (96) blocks
- src/elevation/model/room.js: stretchRun (976) and moveRun's free-run candidate list (~1115) only
- src/elevation/model/dimensions.js (400): appendOpenGap (22) and the tallRanges block in horizontalChains (171)
- test: src/elevation/model/__tests__/landings.test.js

runDefaults.js: import landingsOn. Wall-end check first (returns true as now), then a landed face within cornerSnapDistance (left edge ↔ interval.b, right edge ↔ interval.a) → `{ to: 'wall', wallId }`, else false. In the ends block, `{ to: 'wall' }` → 'filler' before the existing corner rule.

room.js stretchRun:
- The two wall-end reserve candidates use a copy of the run anchored `true` on that side:
  `const atEnd = (end) => ({ ...sourceRun, anchors: { ...sourceRun.anchors, [end]: true } });`
- Append candidates for every landingsOn(room, sideWall) interval:
  `{ value: interval.b, anchor: side === 'left' && { to: 'wall', wallId: interval.wallId } }` and
  `{ value: interval.a, anchor: side === 'right' && { to: 'wall', wallId: interval.wallId } }`.
- `anchorsAtSnap` becomes the snapped candidate's `anchor` value (true or the wall anchor) instead of a boolean; false when not snapped.
- The inside-corner end-type check uses `cornerForRunSide(room, sideWall, proposed, side)`.
room.js moveRun free branch: append `...landingsOn(room, wallViewForRun(sourceWall, sourceRun)).flatMap((i) => [i.a, i.b])` to the candidate numbers. The joined branch is unchanged.

dimensions.js: ranges carry a `kind`. tallRanges entries get `kind: 'tall-span'`; add landingsOn(room, wall) intervals as `{ start: a, end: b, wallId, kind: 'wall' }` for BOTH bands, sorted by start. appendOpenGap emits `range.kind` with `{ wallId }` for walls and `{ runId }` for talls. Nothing else in dimensions.js changes.

Tests 150–153 exactly as SPEC-18 §8.
Expect 443 passing.

At most five lines of summary. Commit "elevation-mvp: step 92 snapping to wing walls".
```

---
## Step 93 — Store: land, move, detach, delete

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-18.md §5, §8 tests 154–159.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- src/elevation/store/elevationSlice.js: addWallSegment (340), connectWalls (386), deleteWall (485), setRunAnchor (746), two new reducers, the exports list (~1106)
- test: src/elevation/store/__tests__/elevationSlice.test.js (1499; append a describe at the end; stateWithRun is at ~106, run at ~66)

Import from '../model/landings.js': LANDING_TO, landWallEnd, landingEndpoint, landingOffsetFor, landingRefCreatesCycle, releaseWall.

- addWallSegment: after addWallWithConnections, for [['start', landStart, connectStart], ['end', landEnd, connectEnd]] where land is set and connect is not: `const landed = landWallEnd({ ...room, walls: room.walls }, wall.id, endpoint, land); if (landed) room.walls = landed.walls;`
- setWallLanding(state, { wallId, endpoint, ref, to, offset }) and detachWallLanding(state, { wallId, endpoint }) exactly as §5. For the cycle check, the host is landing.wallId and the side landing.side; a wall ref must satisfy `landingEndpoint(refWall, host, side)`.
- deleteWall: before the splice, `location.room.walls = releaseWall(location.room, wallId).walls;` then find the wall's index again by id and splice that.
- connectWalls: after connectWallEndpoints, set `landings[endpoint] = null` on both named walls' endpoints (skip if absent).
- setRunAnchor: validWallAnchor = object with to === 'wall' and a string wallId. Accept it next to validOpeningAnchor; store a copy; end type `{ type: 'filler', width: null }`.

Do NOT touch: moveWallEndpoint, setWallLength, moveWallPerpendicular — syncRoom's resolveLandings re-seats wing walls after all of them.

Tests 154–159 exactly as SPEC-18 §8.
Expect 449 passing.

At most five lines of summary. Commit "elevation-mvp: step 93 wing walls in the store".
```

---
## Step 94 — Plan: drawing onto a face, landed ends, span dimensions

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-18.md §6 "Plan".
If `git status` shows uncommitted changes, stop and tell me.

Files:
- src/elevation/plan/PlanCanvas.jsx (1136): ONLY handleStageClick (450–515), handleMouseMove (516–590), the ortho live-entry effect (592–640), the render near <WallDrawPreview> (~1089) and imports. Don't read the rest.
- src/canvas/components/WallEndpoints.jsx (164)
- src/elevation/plan/PlanWallShape.jsx (201)

PlanCanvas.jsx:
- One helper `snapDrawPoint(snapped, fixed)` → `{ point, connect, land, faceLabel }`: endpoint snap as now → connect; else `snapToWallFace(room, snapped, ENDPOINT_SNAP_RADIUS)` → land `{ wallId, side, x }` and point = its point; else applyAlignment as now. Replace the four duplicated endpoint-snap blocks (first click, second click, live-entry move, free move) with it.
- First click stores `_landOn: land` on wallDrawStart. Second click and the live-entry commit pass `landStart: wallDrawStart._landOn` (only when `_connectTo` is null) and `landEnd` (dropped under the same typed-length rule as connectEnd). The chain's next start keeps `_connectTo` to the new wall's end and `_landOn: null`.
- While a face snap is live (hover before the first click, or at the current end), render a cyan circle (radius 4/scale) at the snap point and a Text `${formatInches(d)} from ${left|right}`, d measured from the nearer end of that host side (`x` or `length − x`), 10/scale above it. Keep it in state next to mouseWorldPos.

WallEndpoints.jsx: when `wall.landings?.[endpoint]` is set, render a non-draggable cyan square (6/scale) instead of the free handle or corner arrows.

PlanWallShape.jsx: for each side with `landingsOn(room, wallSideView(wall, side))` non-empty, a second dimension row offset beyond that face (front: along −n past the existing row's offset + 16/scale; back: along +n from the back face by the same amount). Its segments are 0 → a₁, a₁ → b₁, b₁ → a₂ … bₙ → length, laid out with layoutDimensionRow like the existing row and drawn with the same ticks and labels. Don't change the existing row.

No new tests (UI). Run `npm test && npm run lint`: 449 passing.

At most five lines of summary. Commit "elevation-mvp: step 94 draw walls onto faces".
```

**Check after 94:**
- Draw a 246" wall. Pick Draw wall again and hover its room face about 60" from the left: a cyan dot and "60" from left" appear. Click, draw 30" out, press Esc.
- The new wall's thickness sits to the right of where you clicked. Its landed end shows a cyan square and can't be dragged.
- Do the same near the right end. The long wall's plan shows a second row: 60 · 4 1/2 · … · 45 (with default thickness).
- Move the long wall with its perpendicular handle: both wing walls come with it.

---
## Step 95 — Elevation sections, wing properties, anchor options

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-18.md §6 "Elevation" and "Properties".
If `git status` shows uncommitted changes, stop and tell me.

Files:
- src/elevation/components/NeighborReturns.jsx (90)
- src/elevation/components/PropertiesPanel.jsx (1797): ONLY RunProperties' anchor select (~710–800), WallHeightProperties (1451–~1680) and the imports / slice import list. Don't read the rest.

NeighborReturns.jsx:
- line 52: `anchoredToCorner(run.anchors?.[corner.neighborSide], corner)` instead of `=== true`.
- After the wall-end loop, for each interval in landingsOn(room, wall): push a hatched section `{ x: a, z: 0, width: b − a, height: landedWall.height }` labelled with wallLabel(room, landedWall). Then for side of ['left', 'right']: `const corner = spanCorner(room, wall, { wallSide: wall.side, anchors: { [side]: { to: 'wall', wallId } } }, side)`; for each run on the landed wall with wallSideOf(run) === corner.neighborWallSide and anchors[corner.neighborSide] === true, push a return rect of width `frontDepth(run)/sin(angle)` at `x: b` (side 'left') or `x: a − width` (side 'right'), z run.z, height run.height — the same shape the wall-end returns use.

PropertiesPanel.jsx:
- RunProperties anchor select: an optgroup "Wall faces" listing each landingsOn(room, wall) interval as `wall:<wallId>` labelled wallLabel(room, landedWall). anchorValue maps `{ to: 'wall' }` to `wall:<id>`; onChange maps it back to `{ to: 'wall', wallId }` via setRunAnchor.
- WallHeightProperties: leftFree / rightFree also require no landing at that endpoint. For each endpoint with a landing, a section "Lands on <host label> · Front|Back" with Measured from (select: Left end, Right end, other walls landed on the same host face that don't create a cycle), To (Near face / Far face / Centre), Distance (InchInput) and a Detach button, dispatching setWallLanding / detachWallLanding per SPEC §6.

No new tests (UI). Run `npm test && npm run lint`: 449 passing.

At most five lines of summary. Commit "elevation-mvp: step 95 wing walls in elevation and properties".
```

**Check after 95 — your alcove:**
- On the long wall's elevation, both wing walls show hatched, with the 120" span between them.
- Draw a base run in the span, starting near the left wing. It anchors to "Wall 2" (Anchor left shows it) and fills to the right wing when stretched there.
- On a wing wall's elevation, draw a base against its landed end. It dies into the long wall, and the long wall's run pulls back by its depth.
- Select a wing wall. Set Measured from to the other wing: nothing moves, and Distance shows the span. Type a new distance: it moves.
- Set a run's left clearance to −1/2": the run laps 1/2" onto the wing.
