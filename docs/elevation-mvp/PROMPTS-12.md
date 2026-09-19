# Elevation Lab — Codex Prompts, Steps 45–50 (selection bugs, plan depth labels, centerline dimension, move a run by its dimension)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session.
Commit pending work first. Steps 45, 46, 47 and 48 are independent of each other and of the rest;
step 50 needs step 49's `moveRun`. Otherwise any order — 45 and 46 are the two reported bugs, so
they're worth running first.
Codex cannot open the app (it's behind a login), so don't plan browser checks: rely on unit tests,
`npm run build` and `npm run lint`.

---
## Step 45 — Deleting a run no longer strands the wall

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-12.md §1 completely. This step covers tests 4–8.
If `git status` shows uncommitted changes, stop and tell me.

The bug: PropertiesPanel resolves the wall, run, piece and opening it shows from selection.wallId (PropertiesPanel.jsx lines ~1557–1566). deleteRun calls clearTransientSelection, which nulls wallId along with the rest, and setSelection deliberately preserves whatever wallId already is (`wallId: state.selection.wallId ?? null`, line 823). So after a delete, every later click sets runId on a selection whose wallId is null, nothing resolves, and the panel keeps saying "Select a wall, run or opening to edit it." setActiveWall is the only thing that puts wallId back — which is why switching walls and back fixes it.

1. §1.2 — store/elevationSlice.js (912 lines): change clearTransientSelection (line 155) to keep the wall when the elevation view is open:

   wallId: state.view === 'elevation' ? state.activeWallId : null,

   That is the whole fix. Do not change setSelection, and do not add a fallback in PropertiesPanel.

2. The nine callers are already ordered to suit it — each one that changes which wall is active does so before clearing. Do not "fix" any of them, and do not open files to check them; §1.2 has the table:

store/elevationSlice.js:155-174   activateRoom          activeWallId set first
store/elevationSlice.js:~272      addWall               plan-only gesture
store/elevationSlice.js:~305      addWallSegment        plan-only gesture
store/elevationSlice.js:~426      deleteWall            activeWallId reassigned first
store/elevationSlice.js:430-437   setActiveWall         explicit wallId assignment on the next line is now redundant — LEAVE IT
store/elevationSlice.js:553       deleteOpening         fixed by this change
store/elevationSlice.js:597       deleteRun             fixed by this change
store/elevationSlice.js:826       clearSelection        elevation keeps the wall, plan clears it
store/elevationSlice.js:836-842   setView               state.view assigned before the clear; the explicit wallId line is now redundant — LEAVE IT

3. clearSelection keeping the wall in elevation is intended, not a side effect: an empty-space click in elevation should leave the panel on that wall's properties (§2.3). Don't special-case it.

4. Tests 4–8 from SPEC-12 §7, in store/__tests__/elevationSlice.test.js, using the existing stateWithRun helper (line ~91) — note it will need `view` and an opening for tests 7 and 8; build those inline rather than changing the shared helper's defaults. While iterating run only `npx vitest run src/elevation/store/__tests__/elevationSlice.test.js`. Run `npm test && npm run build && npm run lint` once at the end. If any other test file fails, stop and tell me which and what it asserts.

At most five lines of summary: what changed, what surprised you, what you left undone.

Commit "elevation-mvp: step 45 keep the wall selected in elevation".
```
---
## Step 46 — An empty-space click deselects again (pan needs real travel)

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-12.md §2 completely. This step covers tests 1–3.
If `git status` shows uncommitted changes, stop and tell me.

The bug: both canvases already dispatch the deselect on an empty-space click (ElevationCanvas.handleStageClick line 579 → setSelection({}); PlanCanvas.handleStageClick → clearSelection()). Neither is reached. In select mode a press on empty canvas starts a pan, the window pointermove handler sets `moved: true` on ANY non-zero delta, and stopPanning then sets suppressClickRef whenever moved is set — so one pixel of trackpad travel swallows the click. Esc works because it's a different path.

1. §2.2 — create src/elevation/canvas/panGesture.js exactly as SPEC-12 §2.2 gives it: PAN_THRESHOLD_PX = 3 and panExceedsThreshold(origin, point, threshold). Two named exports, no default.

2. Apply the same two edits in BOTH canvases — the files differ only in whether the pan applies setPan or setView:

src/elevation/components/ElevationCanvas.jsx:446-461   handlePanPointerDown — add originX/originY beside x/y
src/elevation/components/ElevationCanvas.jsx:~240      window pointermove handler — compute `moved` via panExceedsThreshold, store it, and `if (!moved) return;` before the existing setView(...) line
src/elevation/plan/PlanCanvas.jsx:781-795              handlePanPointerDown — same addition
src/elevation/plan/PlanCanvas.jsx:330-343              window pointermove handler — same guard before the existing setPan(...) line

   Keep x/y as the running position (the existing dx/dy are computed from them and must stay that way); originX/originY are the press point and never change during the gesture.

3. Do NOT change stopPanning in either file — `if (!current?.moved) return;` is already correct once `moved` means "travelled far enough". Do NOT change suppressClickRef, the click-suppression timeouts, handleStageClick in either canvas, or the Escape handlers.

4. The view now trails the cursor by up to 3px on the first movement of a real pan. That is intended (§2.2) — do not compensate by panning from the origin on the crossing move, which makes the content jump.

5. Tests 1–3 from SPEC-12 §7 in a new file src/elevation/canvas/__tests__/panGesture.test.js. While iterating run only `npx vitest run src/elevation/canvas/__tests__/panGesture.test.js`. Run `npm test && npm run build && npm run lint` once at the end; no other test file should change.

At most five lines of summary, including one line on whether the two canvases' pan blocks were actually identical.

Commit "elevation-mvp: step 46 pan threshold so empty clicks deselect".
```
---
## Step 47 — Full-depth label on each run in plan

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-12.md §3. One file, no tests.

The number already exists: frontDepth(run, settings) = run.depth + bumperThickness + doorThickness (model/corners.js line 12), which is 24 7/8 for a base with shipped defaults, and PlanRunFootprint.jsx already computes it as `depth` at line 75 to draw the footprint. This step only labels it.

1. §3.2 — plan/PlanRunFootprint.jsx (159 lines): add centerY, depthFontSize, depthText, depthTextWidth, depthRotation and showsDepth beside the existing centerX (line 83), then render the <Text> as the last child of the outer <Group>, after the boundaryPieces block and before the collision <Label>. Exact code in §3.2. Import formatInches from '../model/units.js'; Text is already imported (line 2).

2. Details that matter and are already decided — don't redesign them:
   - 0.6 * 11 is the same character-width estimate canvas/dimensionLayout.js uses; showsDepth hides the label on a run too narrow to hold it instead of letting it spill over neighbours.
   - Every size divides by scale so the label stays a fixed on-screen size, like every other plan label.
   - fill is #e2e8f0 (the plan wall-length label color), not the run's type color.
   - rotation comes from frame.d with the same `> 90 || < -90` flip PlanWallShape.jsx uses at line ~74, so the text never reads upside down.

3. This is a label, not a dimension: no extension lines, no ticks, no dimension geometry (§3.3). Do not touch plan/PlanWallShape.jsx, canvas/dimensionLayout.js, components/DimensionRow.jsx or model/footprints.js.

4. No test — pure Konva rendering over an already-tested number. `npm run build` and `npm run lint` must pass; `npm test` must show no regressions.

At most five lines of summary.

Commit "elevation-mvp: step 47 plan full-depth labels".
```
---
## Step 48 — Centerline callout becomes a dimension line at 40" above the floor

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-12.md §4 completely. This step covers tests 9–11 and REWRITES three existing tests.

The callout sits at a fixed 40" above the floor for every run type — above a base box (top ~34.5", counter 36"), below an upper (bottom ~54"), inside a tall (4" to ~90"). That is the three-way placement this wants, from one constant instead of a per-type branch (§4.1).

1. §4.2 — model/dimensions.js (387 lines): export CENTERLINE_CALLOUT_Z = 40 and replace centerlineMarkers (lines 242–255) with the version in SPEC-12 §4.2. New signature is (run, pieces, wall, wallLengthValue, settings); new return shape is {pieceId, x, datumX, z, value, pieceBottom, pieceTop, from}. Import resolvePinTarget from './room.js' in the import block that already takes endCornerAnglesForRun, endMinWidthsForRun and pinTargetsForRun from there (line 7) — room.js does not import dimensions.js, so there is no cycle. Export CENTERLINE_CALLOUT_Z from model/index.js's dimensions.js block (line ~71), beside centerlineMarkers.

   Two things are deliberate: datumX is recovered from the pin (resolvePinTarget returns pin.value for 'left', length - pin.value for 'right', openingAnchorX + pin.value for 'opening', so subtracting — or adding, for 'right' — pin.value gives the datum itself), and `value` is the MEASURED distance |x - datumX| from the piece's real center, not the stored pin.value, so a clamped pin draws what is actually built. Don't "correct" either to the stored value.

2. §4.3 — components/RunGroup.jsx (350 lines): replace the step-38 block at lines 311–330 with the four-part render in SPEC-12 §4.3 — dashed vertical from the piece to the dimension line, the dimension line from datumX to the centerline, 45° slash ticks at both ends, and the `℄ <value>` label. The call site becomes centerlineMarkers(run, result.pieces, wall, wall.length, settings). formatInches, Group, Line, Text and wallRectToScreen are all already imported.

   The label drops "from left"/"from right"/"from opening" — the line starts at the datum now, so the direction is drawn. The Math.min/Math.max against pieceBottom/pieceTop is what makes the dashed line pass through a tall and reach up or down to a base or upper; keep it.

3. Leave the "◆" pin marker block (lines ~278–303) alone — it still renders for every pinned item. Don't touch model/room.js's pin resolution (resolvePinTarget, pinTargetsForRun, resolvePinnedSpan), model/splitRun.js, or the dimension rows in ElevationCanvas.

4. §4.4 — model/__tests__/dimensions.test.js (559 lines) tests 11–13 (the `describe('centerlineMarkers')` block at line 350) call the old two-argument signature and assert calloutZ: 46.5. Rewrite those three as tests 9–11 from SPEC-12 §7, with the literal expectations given there. While iterating run only `npx vitest run src/elevation/model/__tests__/dimensions.test.js`. Run `npm test && npm run build && npm run lint` once at the end.

At most five lines of summary, including one line on whether 40" looked reasonable against the fixtures you had in front of you.

Commit "elevation-mvp: step 48 centerline dimension line".
```
---
## Step 49 — `moveRun` (pure, snaps like the stretch handles)

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-12.md §5 completely. Pure model work plus tests — no UI, nothing calls moveRun at the end of this step except its tests. The wiring is step 50; touching the canvases here would make a test failure ambiguous.

1. §5.1 — model/room.js (652 lines): add moveRun exactly as SPEC-12 §5.1 gives it, immediately after stretchRun (which ends at line 617). It reuses the file's existing STRETCH_EDGE_SNAP_DISTANCE (line 23, 2"), cornerReserve, cloneRoom, cloneRun, syncRoom, wallLength, validateRunPlacement, roundTo and DEFAULT_SETTINGS — all already imported or defined. Export it from model/index.js's room.js block (lines 95–110), beside stretchRun.

   It mirrors stretchRun's snapping: round to ½", then snap to the nearest of 0, the wall length, the two corner reserves, and every other run's two edges within 2". The one difference is that a move has two edges that can catch, so both are tested and the nearest pairing wins. Tie-breaking is iteration order — candidates in the listed order, 'left' before 'right'.

2. Three differences from stretchRun that are deliberate (§5.2) — do not "align" them with stretchRun:
   - moveRun NEVER sets run.anchors and never touches run.ends. stretchRun sets an anchor when a RESIZE lands on a wall end or corner reserve; sliding a run there is not that statement, and resolveHorizontal (model/corners.js line 115) would then derive x from the datum and discard the drag.
   - An anchored run is refused with reason 'anchored' for the same reason: with anchors.left set, x is recomputed on every sync.
   - width never changes, so there is no minRunWidth clamp — only the maxRunOverhang bounds check.
   It also returns `snap` ({value, edge} or null) so step 50 can draw the alignment line at the candidate that caught. Do NOT add a snap return to stretchRun.

3. Do not add a reducer. The stretch path already does its model call in the component and dispatches replaceRun({wallId, run}); the move follows that exact pattern in step 50, so store/elevationSlice.js is not opened this step.

4. Tests 12–16 from SPEC-12 §7 in model/__tests__/stretchRun.test.js (181 lines), reusing its makeRun / makeRoom / makeOutsideRoom helpers (lines 5–68) — makeRoom puts one run at x: 40, width: 40 on a 120" wall, which is what the literal expectations assume. While iterating run only `npx vitest run src/elevation/model/__tests__/stretchRun.test.js`. Run `npm test && npm run build && npm run lint` once at the end.

At most five lines of summary, including one line on whether moving a run that contains a center-pinned item did anything surprising in your fixtures (§5.3 predicts the neighbouring cabinet widths absorb the move).

Commit "elevation-mvp: step 49 moveRun".
```
---
## Step 50 — Drag a run by its dimension

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-12.md §6 completely. Requires step 49's moveRun. No new unit test — moveRun's snapping is covered by tests 12–16 and this is Konva wiring.

What this adds: hovering a run's dimension gives a move cursor and lets you drag the whole run along the wall without changing its width. Clicking it still opens the run's panel. Dragging a stretch HANDLE still resizes — that path is untouched.

1. §6.2 — components/DimensionRow.jsx (275 lines): add the props draggableRuns = false, onSegmentDragStart, onSegmentDragMove, onSegmentDragEnd, a local dragMovedRef, and the dragProps helper from SPEC-12 §6.2. Spread dragProps(segment, origin) onto the three existing invisible hit rects for kind === 'run' segments (the `band`, the label rect and the `leader`, lines ~213–235) — those already exist for onSegmentClick; this reuses them rather than adding new shapes.

   - dragBoundFunc locks the cross axis so the rect slides along its own row.
   - The delta handed out is inches: (event.target.x() - origin.x) / transform.scale for a horizontal row, and -(event.target.y() - origin.y) / transform.scale for a vertical one (screen y grows down, wall z grows up).
   - onDragEnd calls event.target.position(origin) — the same reset RunGroup's stretch handle does at line ~209 — so the rect returns to its laid-out spot and the run's new position arrives through the store.
   - onDragStart also calls onSegmentClick?.(segment) once, so the panel follows what you're dragging, and the existing onClick returns early when dragMovedRef is set so the trailing Konva click doesn't re-fire.

2. §6.3 — components/ElevationCanvas.jsx (850 lines): add moveOriginRef, startRunMove and applyRunMove exactly as SPEC-12 §6.3 gives them, near the existing startStretch/previewStretch/finishStretch group (lines 614–657). Import moveRun from '../model/room.js' beside the existing stretchRun import.

   The move REUSES the stretchPreview state (line 95) for its ghost run — that render path already exists and the visual is identical. Renaming it to something view-neutral is deliberately skipped to keep the diff small; don't rename it.

   The snap line comes free: ElevationAlignmentGuides (rendered at line 730) already takes {axis: 'x', value} in wall coordinates, so setAlignmentGuides([{axis: 'x', value: result.snap.value}]) draws the dashed pink vertical at whichever candidate the move caught. Guides and preview clear on commit, on a refused commit, and on Esc (the handler at line ~356 already clears guides).

   A refused move reports it: reason 'anchored' becomes the message "Anchored — set Anchor to Free to move" (mirroring RunGroup's existing "Anchored — set Anchor to Free to resize" tooltip), any other reason passes through showMessage. Only report on the commit, not on every drag-move frame.

3. Wire the new props on exactly the two DimensionRows that already pass onSegmentClick — the lower.outer row (lines 755–763) and the upper.outer row (~795–805), with draggableRuns={tool === 'select'}. The other six rows carry no run segments; leave them alone.

4. Do not change: the stretch handles or their two snaps (step 44's 6px alignment snap plus stretchRun's 2" candidate snap, which is also what sets anchors — that behavior is liked as shipped), canvas/alignment.js, model/room.js, OpeningShape.jsx / moveOpening, or RunGroup.jsx's run Rect and stretch handles.

5. `npm run build` and `npm run lint` must pass; `npm test` must show no regressions and no test file should change.

At most five lines of summary — including one line on whether the drag-then-click suppression needed anything beyond dragMovedRef, and one on whether reusing stretchPreview for the move preview caused any flicker you could reason about.

Commit "elevation-mvp: step 50 drag a run by its dimension".
```
