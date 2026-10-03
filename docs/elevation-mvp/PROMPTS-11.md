# Elevation Lab — Codex Prompts, Steps 39–44 (label sizes, room wall height, center on origin, alignment snaps)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session.
Commit pending work first. Steps 39, 40, 41 and 42 are independent of each other; steps 43 and 44
need step 42's module. Run 42 before 43 or 44; otherwise any order.
Codex cannot open the app (it's behind a login), so don't plan browser checks: rely on unit tests,
`npm run build` and `npm run lint`.

Step 40 intentionally invalidates whatever is currently in localStorage — there are no saved rooms
worth preserving, and the app starts from a fresh default room. SPEC-11 §2.4 explains it and §7 has
the rescue if that turns out to be wrong.

---
## Step 39 — Bigger elevation labels in plan and elevation

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-11.md §1. Two files, no tests, no new settings.
If `git status` shows uncommitted changes, stop and tell me.

1. §1.1 — plan/PlanElevationMarker.jsx (46 lines): RADIUS 9 → 14 (line 3), FLAG_LENGTH 7 → 10 (line 4), and the <Text> fontSize 10 / scale → 15 / scale (line 41). Leave flagHalfWidth, the colors, the Circle's 1.5 / scale stroke and all the geometry alone — they derive from radius already.

2. §1.2 — components/ElevationCanvas.jsx (819 lines): in the elevationLabel <Text> block at lines 742–754 only, set fontSize={20} (was 13), width={140} (was 80) and offsetX={70} (was 40). offsetX must stay exactly half of width — that pairing is what centers the label on the wall midpoint. Change nothing else in that block; dimensionOffsets.label stays as step 34 computed it.

3. Do not touch the plan wall-number circle (plan/PlanWallShape.jsx lines 169–189, numberRadius = 9 / scale, fontSize 10 / scale) — §1.3 says why. Do not touch canvas/dimensionLayout.js, DimensionRow.jsx or any dimension row offsets.

4. No test — both changes are Konva render constants with no derivable pure output. `npm test` must show no regressions; `npm run build` and `npm run lint` must pass.

At most five lines of summary: what changed, what surprised you, what you left undone.

Commit "elevation-mvp: step 39 larger elevation labels".
```
---
## Step 40 — Per-room wall height that new walls pick up

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-11.md §2 completely, including §2.4. This step covers tests 8–10.
If `git status` shows uncommitted changes, stop and tell me.

1. §2.1 — model/constants.js (80 lines): add `wallHeight: 96` as the FIRST key of DEFAULT_PROFILE (lines 11–20). DEFAULT_SETTINGS.defaultProfile spreads it (line 24) and the slice's createRoom already spreads settings.defaultProfile (elevationSlice.js line 67), so settings and new rooms pick it up with no edit.

2. §2.2 — components/RoomHeightsPanel.jsx (89 lines): add ['wallHeight', 'Wall height'] as the FIRST entry of PROFILE_FIELDS (lines 11–20). Nothing else in that file changes — it already dispatches updateRoomProfile({roomId, key, value}) for every field, and that reducer (elevationSlice.js lines 212–224) writes whatever key it is handed.

3. §2.2 — components/SettingsPanel.jsx (207 lines): add the same pair as the FIRST entry of PROFILE_SETTINGS (lines 29–38), the list under the "Default height profile" heading. Do not touch NUMBER_SETTINGS or OPENING_NUMBER_SETTINGS.

4. §2.3 — store/elevationSlice.js (889 lines), two reducers, exact code in SPEC-11 §2.3:
   - addWall (lines 233–256): pass `height: action.payload.height ?? room.profile.wallHeight` into the createWall values object.
   - addWallSegment (lines 257–287): same, in the explicit values object it already builds at lines 265–273.
   Leave createWall's `height: values.height ?? 96` (line 53) exactly as it is — it is the last-resort default for calls with no room.

5. DO NOT OPEN store/persistence.js. Adding the key does make any document already in localStorage fail validation, so the app starts from a fresh default room — that is accepted, not a bug to fix, and §2.4 explains why. Do not add a migration, do not bump ELEVATION_SCHEMA_VERSION, do not touch normalizeV3Document or V2_PROFILE_KEYS.

6. No test file should need an edit other than the one in step 7. Every fixture in the suite derives its profile from DEFAULT_PROFILE or DEFAULT_SETTINGS.defaultProfile, so the new key flows in automatically — these are the files that do it, and none of them should change:

src/elevation/model/__tests__/casingAnchors.test.js:30
src/elevation/model/__tests__/dimensions.test.js:42,453
src/elevation/model/__tests__/openings.test.js:76
src/elevation/model/__tests__/overlap.test.js:36
src/elevation/model/__tests__/profile.test.js:26,51,131
src/elevation/model/__tests__/roomOpenings.test.js:93
src/elevation/model/__tests__/roomsCorners.test.js:79
src/elevation/model/__tests__/runDefaults.test.js:28
src/elevation/model/__tests__/splitRun.test.js:35,36,152
src/elevation/model/__tests__/stretchRun.test.js:32
src/elevation/model/__tests__/topology.test.js:41
src/elevation/plan/__tests__/wallMove.test.js:65
src/elevation/properties/__tests__/helpers.test.js:62,150,171
src/elevation/store/__tests__/elevationSlice.test.js:96,102,386
src/elevation/store/__tests__/persistence.test.js:76-89 (the v2Profile helper spreads ...rest), 98,102,135

   If store/__tests__/persistence.test.js fails anyway, STOP and tell me which test and what it asserts before changing anything — SPEC-11 §7 has the intended fix and it is a decision, not a cleanup.

   One thing you may want to confirm rather than assume: model/profile.js line 82 already reads `profile.wallHeight` as a fallback in resolveVertical, but it is only reached when no wall is passed, and both production callers (model/room.js lines 414 and 460) plus every existing test pass the wall. Read those three lines if you like; don't change them.

7. Tests 8–10 from SPEC-11 §8, in store/__tests__/elevationSlice.test.js, using the existing stateWithRun helper (line 91). While iterating run only `npx vitest run src/elevation/store/__tests__/elevationSlice.test.js`. Run `npm test && npm run build && npm run lint` once at the end.

At most five lines of summary, including one line on whether the suite stayed green with persistence.js untouched.

Commit "elevation-mvp: step 40 per-room wall height".
```
---
## Step 41 — Center the room on the origin

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-11.md §3 completely. Independent of the other steps. This step covers tests 11–14.

1. §3.1 — store/elevationSlice.js (889 lines): add the centerRoomOnOrigin reducer exactly as SPEC-11 §3.1 gives it, immediately after useAutoHeightsForRoom (ends line 232). roundTo is already imported (line 21); roomIndexFor (line 100) and syncRoomAt (line 141) are already in the file. Export centerRoomOnOrigin from the elevationSlice.actions destructuring block (lines 837–886), next to useAutoHeightsForRoom.

   It translates wall endpoints only: bounding-box center to 0,0, delta rounded to settings.planGrid, no-op when the delta is zero or the room has no walls, syncRoomAt at the end. Do NOT touch run.x, run.z, opening.offset, wall.flipped, connections or wallOrder — runs and openings are wall-local and a pure translation leaves every frame and corner type unchanged. That reasoning is in §3.1; don't re-derive it by reading model/geometry.js, model/corners.js or model/room.js.

2. §3.2 — components/ElevationToolbar.jsx (148 lines): add the plan-only "Center room" button exactly as SPEC-11 §3.2 gives it, right after the existing `{view === 'plan' && (...Ortho...)}` block (lines 71–84). It dispatches centerRoomOnOrigin({roomId: activeRoomId}) and then calls onZoomToFit?.() — without the refit the room translates out of frame. Import centerRoomOnOrigin in the existing store import block (lines 3–8). room, activeRoomId, dispatch and onZoomToFit are already in scope; add no new props.

3. Do not touch plan/PlanCanvas.jsx or ElevationLab.jsx. PlanCanvas's zoomToFit (lines 218–245) already recenters on the room's bounding box, so the existing fitRequest path does the right thing once the geometry has moved.

4. Tests 11–14 from SPEC-11 §8, in store/__tests__/elevationSlice.test.js. Hand-build the two-wall room in the test (literal coordinates are in §8 test 11); the delta is exactly (-60, -48), so no rounding subtlety is in play. While iterating run only `npx vitest run src/elevation/store/__tests__/elevationSlice.test.js`. Run `npm test && npm run build && npm run lint` once at the end.

At most five lines of summary.

Commit "elevation-mvp: step 41 center room on origin".
```
---
## Step 42 — Alignment snap module (pure, nothing wired up yet)

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-11.md §4 completely. One new file plus one new test file. Nothing imports the module at the end of this step except its test — the canvases are steps 43 and 44, and touching them here would make a test failure ambiguous.

1. Create src/elevation/canvas/alignment.js exactly as SPEC-11 §4 gives it: snapAxis, snapToAlignment, endpointAlignmentTargets, runAlignmentTargets, plus the TIE_EPSILON constant and the JSDoc as written. Four named exports, no default export.

2. Do NOT add these to src/elevation/model/index.js — it re-exports the model/ modules only, and canvas/ modules (transform.js, drag.js, dimensionLayout.js, useLiveEntry.js) are all imported by path. Follow that.

3. Do NOT edit src/canvas/SnapEngine.js (124 lines, shared with the older canvas). snapToGrid and snapToEndpoint stay exactly as they are; this is a separate, weaker snap that runs after them.

4. Tests 1–7 from SPEC-11 §8 in a new file src/elevation/canvas/__tests__/alignment.test.js, with the literal fixtures given there. While iterating run only `npx vitest run src/elevation/canvas/__tests__/alignment.test.js`. Run `npm test && npm run build && npm run lint` once at the end; no other test file should change.

At most five lines of summary.

Commit "elevation-mvp: step 42 alignment snap module".
```
---
## Step 43 — Plan-view alignment guides

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-11.md §5 completely. Requires step 42's canvas/alignment.js. No new unit test — the pure logic is already covered by tests 1–7; this step is wiring and Konva rendering.

Precedence, which §5.1 states and you should not re-litigate: grid + ortho first (unchanged), then endpoint snap within ENDPOINT_SNAP_RADIUS — if that fires, use it and draw NO guide, because it also creates a wall connection — and only otherwise the alignment snap.

1. §5.4 — create plan/PlanAlignmentGuides.jsx exactly as SPEC-11 §5.4 gives it: dashed pink lines at ±10000, strokeWidth and dash divided by scale, listening={false}.

2. §5.3 — plan/PlanCanvas.jsx (1,068 lines):
   a. Add `const ALIGNMENT_SNAP_PX = 6;` beside ENDPOINT_SNAP_RADIUS (line 70).
   b. Add `const [alignmentGuides, setAlignmentGuides] = useState([]);` beside wallDrawStart (line 148).
   c. Add the applyAlignment useCallback exactly as §5.3 gives it, right after gridAndOrtho (lines 410–415). It owns the ortho axis rule from §5.2 (under Ortho only the free axis may snap, decided by whether point.y equals fixed.y) and it sets alignmentGuides.
   d. Apply it at exactly these four sites, each of which currently reads `const point = endpointSnap ? {...} : snapped`. Endpoint snap wins; otherwise call applyAlignment; when the endpoint snap wins call setAlignmentGuides([]).

      src/elevation/plan/PlanCanvas.jsx:431-436   handleStageClick, wall tool           applyAlignment(snapped, { fixed })
      src/elevation/plan/PlanCanvas.jsx:489-497   handleMouseMove, wall-draw entry      applyAlignment(snapped, { fixed: wallDrawStart })
      src/elevation/plan/PlanCanvas.jsx:526-530   handleMouseMove, preview tail         applyAlignment(snapped, { fixed: wallDrawStart })
      src/elevation/plan/PlanCanvas.jsx:606-619   handleWallEndpointDrag                applyAlignment(snapped, { fixed, excludeWallId: wallId })

      In the wall-draw entry branch the aligned point must be what dx/dy/length are computed from (lines 499–504), so the typed length matches the wall that gets drawn. In handleWallEndpointDrag the aligned point is what goes to event.target.position(point) and moveWallEndpoint.
   e. Clear the guides in three places: cancelDrawing (lines 262–265), the `event.type === 'dragend'` branch of handleWallEndpointDrag, and right after each dispatch(addWallSegment(...)) in handleStageClick.
   f. Render `<PlanAlignmentGuides guides={alignmentGuides} scale={scale} />` immediately after `<AxisGuides scale={scale} />` (line 891).

3. Leave every other snap call alone: the snapToGrid/snapToEndpoint call sites keep their current radii and order, gridAndOrtho itself does not change, and src/canvas/SnapEngine.js is not opened. Do not touch plan/wallOps.js, store/elevationSlice.js or src/canvas/components/AxisGuides.jsx.

4. `npm run build` and `npm run lint` must pass; `npm test` must show no regressions and no test file should change.

At most five lines of summary — including one line on whether any of the four sites didn't fit the pattern.

Commit "elevation-mvp: step 43 plan alignment guides".
```
---
## Step 44 — Elevation alignment guides

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-11.md §6 completely. Requires step 42's canvas/alignment.js. No new unit test — tests 1–7 already cover the pure logic.

Everything happens in components/ElevationCanvas.jsx (819 lines). RunGroup.jsx already reports the dragged handle's wall x through onStretchMove(run.id, side, wallXFromHandle(event)), and ElevationCanvas is what turns that into a stretchRun call, so the snap belongs there. DO NOT OPEN components/RunGroup.jsx (350 lines) — nothing in it changes.

1. §6.4 — create components/ElevationAlignmentGuides.jsx exactly as SPEC-11 §6.4 gives it. Elevation guides are screen-space (that canvas draws through wallToScreen rather than a scaled Layer), so strokeWidth is 1 and dash is [6, 4] with no scale division.

2. §6.1 — in ElevationCanvas.jsx: add `const ALIGNMENT_SNAP_PX = 6;` near the top-of-file constants, `const [alignmentGuides, setAlignmentGuides] = useState([]);` beside stretchPreview (line 91), and the applyRunAlignment useCallback exactly as §6.1 gives it, near wallPointFromEvent (line 473). Import snapToAlignment and runAlignmentTargets from '../canvas/alignment.js' beside the existing '../canvas/drag.js' import (lines 32–35).

3. §6.2 — snap the stretched edge in previewStretch (lines 592–604) and finishStretch (lines 612–630): `const alignedEdgeX = applyRunAlignment({ x: newEdgeX }, runId).x;` and pass alignedEdgeX to stretchRun. excludeRunId = runId keeps the dragged run's own two edges out of its candidate list. Only the 'x' axis snaps here — the handle's dragBoundFunc locks y. Clear the guides where finishStretch clears stretchPreview (line 613), and in the Esc handler at line 356.

4. §6.3 — snap the drawing gesture: handleMouseDown (line 487), handleMouseMove (line 496) and handleMouseUp (line 503) all go through wallPointFromEvent (line 473); align its result with applyRunAlignment(raw, null, ['x', 'z']) — a run being dragged out has no id to exclude. handleMouseUp clears the guides alongside cancelDrag(), as does the existing cancelDrag path in the keydown handler (line 355).

   Expect the aligned point to sit off the ½" draw increment sometimes: screenPointToWallSnapped rounds first and the snap then pulls it onto a neighbouring run's actual edge (30 5/8, say). That is the feature. Do not add a second roundTo after it and do not change canvas/drag.js.

5. §6.4 — render <ElevationAlignmentGuides guides={alignmentGuides} transform={transform} width={viewport.width} height={viewport.height} /> inside the existing `<Layer listening={false}>` that holds NeighborReturns (~line 700), right after it.

6. Openings are deliberately NOT alignment candidates (§6.5) — anchoring a run to a casing with a clearance is what step 31's run.anchors[side] = {to: 'opening', …} already does properly. Do not touch model/dimensions.js, model/splitRun.js, model/stretchRun.js, model/openings.js or components/OpeningShape.jsx.

7. `npm run build` and `npm run lint` must pass; `npm test` must show no regressions and no test file should change.

At most five lines of summary — including one line on whether the stretch snap felt like the right place for it or whether it wants to move into model/stretchRun.js later.

Commit "elevation-mvp: step 44 elevation alignment guides".
```
