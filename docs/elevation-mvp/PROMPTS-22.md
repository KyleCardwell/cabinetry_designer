# Elevation Lab — Codex Prompts, Steps 109–116 (marker centring, dimension clearance, neighbour profiles, right-hand heights, cursors)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, and commit pending work first, including these docs.

**Order:** 109 and 110 are independent of everything. 111 → 112 → 113 must run in that order. 114 → 115 → 116 must run in that order. The pass counts below assume 109 → 116 straight through.

**Codex can't open the app**, so don't plan browser checks. Kyle checks each step by hand.

**The gate is the same for every step:** while iterating, run only `npx vitest run <the named test file>`. Run `npm test && npm run lint` once, at the end. Don't run `npm run build`. Line numbers are as of `75dd21e`.

**Two steps are expensive** — 112 and 114 both open `ElevationCanvas.jsx` (1,637 lines). Run each at the start of a window, alone.

---
## Step 109 — Plan elevation letters centre on their runs

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-22.md §1, §9 tests 178 (changed), 185, 186.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- src/elevation/plan/elevationMarkers.js (44): the body of the `side` loop only
- test: src/elevation/plan/__tests__/elevationMarkers.test.js (84): rewrite test 178's two expected points, then add 185 and 186

elevationMarkers.js: filter the side's runs once (`wallSideOf(run) === side`), take `deepest` from that list instead of the second reduce over wall.runs, and anchor the marker at the centre of the runs' span along the wall instead of `mid`, exactly as SPEC §1. Keep MARKER_SHIFT only for a side with no runs. MARKER_RADIUS, MARKER_FLAG_LENGTH, MARKER_CLEARANCE, `offset`, `direction`, the returned shape and the letter lookup don't change. No clamping to the wall ends.

Don't open PlanCanvas.jsx, PlanElevationMarker.jsx or anything in components/ — nothing else reads these points.

Test 178's room and runs stay as they are; only the two `point` values change (front { x: 35, y: 42.875 }, back { x: 131, y: -35.375 }). Tests 185 and 186 exactly as SPEC-22 §9.
Expect 476 passing.

At most five lines of summary. Commit "elevation-mvp: step 109 plan elevation letters centre on runs".
```

**Check after 109:**
- A wall with one run: the circled letter sits over the middle of that run, at the same distance out as before.
- A wall with three runs across it: the letter sits at the middle of the whole group, not the wall.
- A wall with cabinets at both ends of a doorway: the letter lands between them. Say if you'd rather it sat over the wider group.
- A wall with no cabinets, forced to have an elevation: the letter is exactly where it used to be.
- Cabinets on both sides of a wall: each letter follows its own side's runs.

---
## Step 110 — One rotation rule for plan text

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-22.md §2, §9 tests 187–188.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- NEW src/elevation/plan/textRotation.js (pure, no React): readableRotation and readableFlip exactly as SPEC §2
- NEW test src/elevation/plan/__tests__/textRotation.test.js (187, 188)
- src/elevation/plan/PlanWallShape.jsx (340): lines 70–71 and 103–104 only
- src/elevation/plan/PlanRunFootprint.jsx (222): lines 101–102 and the depth Text's offsetY at 186 only
- src/elevation/plan/PlanOpening.jsx (168): the local readableRotation at 19–23, and the Text's offsetY/rotation at 158/160

The whole change is that the fold lands in [-90, 90) instead of (-90, 90], so text that used to sit at +90 (bottom to the left) now sits at -90 (bottom to the right).

PlanWallShape: both labels are centred, so just swap the two-line fold for readableRotation(...). PlanRunFootprint: keep the angle in a variable, use readableRotation for the rotation and readableFlip for the offsetY, exactly as SPEC §2 — a fitted depth number must stay on the same side of its depth line after a flip. PlanOpening: delete the local helper, call the shared one on atan2(frame.r.y, frame.r.x), and set offsetY to PLAN_DIM_FONT_SIZE / 2 / scale.

Don't touch src/elevation/components/DimensionRow.jsx beyond adding a one-line comment at line 177 that -90 puts the text's bottom to the right; elevation dimension text is already correct. Don't open PlanCanvas.jsx.

Tests 187–188 exactly as SPEC-22 §9.
Expect 478 passing.

At most five lines of summary. Commit "elevation-mvp: step 110 one rotation rule for plan text".
```

**Check after 110:**
- A room with walls running all four ways: every rotated dimension number now reads the same way — turn your head right, never left.
- The depth numbers on vertical walls stay on the same side of their depth lines as before, at every zoom.
- Opening labels are centred on their lines and read the same way as the dimensions.
- Nothing moved on horizontal walls.

---
## Step 111 — Neighbour profiles and wall extent, model only

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-22.md §3, §4, §9 tests 189–191.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- NEW src/elevation/model/neighborProfiles.js (pure): neighborProfiles exactly as SPEC §3
- NEW src/elevation/model/wallExtent.js (pure): wallExtent exactly as SPEC §4
- NEW test src/elevation/model/__tests__/wallExtent.test.js (189, 190, 191 — both modules, one file)
- src/elevation/model/index.js (222): export both

No component changes in this step, and no existing module changes. Nothing calls these yet; step 112 wires them in.

Imports you need, all existing: frontDepth from './corners.js'; dot, elevationToPlan, planPointToWallX, subtract, wallFrame from './geometry.js'; WALL_SIDES, wallSideFrame, wallSideView from './wallSides.js'; moldingStack, resolveProfile from './profile.js'; resolveSoffitSpan, soffitsOn from './soffits.js'; CABINET_TYPE_IDS from './constants.js'.

The projection in §3 is the whole trick: put the neighbour run's four footprint corners into plan with elevationToPlan on the neighbour's own side frame, then read them back with planPointToWallX on this wall's side frame. Don't special-case corner types — cornerAt doesn't name a neighbour for a straight joint, and the projection already gives nothing for a square corner. Don't open corners.js beyond the frontDepth import, and don't open room.js, dimensions.js or any component.

Tests 189–191 exactly as SPEC-22 §9; copy makeWall/the run helper from src/elevation/plan/__tests__/elevationMarkers.test.js rather than importing from another test.
Expect 481 passing.

At most five lines of summary. Commit "elevation-mvp: step 111 neighbour profiles and wall extent".
```

**Check after 111:** nothing visible. The suite is the check.

---
## Step 112 — Draw the neighbours, push the dimensions clear

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-22.md §5.
If `git status` shows uncommitted changes, stop and tell me. Step 111 must be in.

Files:
- NEW src/elevation/components/NeighborProfiles.jsx (~25 lines) exactly as SPEC §5
- src/elevation/components/ElevationCanvas.jsx (1,637): three places only —
  - the model import block (~39–72): add wallExtent
  - the dimensionOffsets memo (409–442): add the extent clearances
  - the non-listening Layer (1,462–1,476): add <NeighborProfiles room={room} wall={wall} settings={settings} transform={transform} /> before <WallEndPanelShapes …>, and import it beside NeighborReturns
- TODO.md: one bullet (below)

dimensionOffsets: compute `extent` and `clear` exactly as SPEC §5, add clear.below to clearances/lower.inner/lower.outer/openings/label, clear.above to both upper offsets, clear.left to both vertical offsets. Compute clear.right in the same object even though nothing uses it until step 113. Add room, wall and settings to the memo's dependency list.

Don't touch dimensionChains (180–196), DimensionRow.jsx, the drag/stretch/joint callbacks, or anything below line 1,580. Don't change fitWallToViewport — the fit still frames the wall, not the overhang.

No tests in this step. Run `npx vitest run` once at the end; 481 must still pass.

TODO.md, in "## Later / Maybe", add:
- [ ] **[elevation] Neighbour profiles from landed walls and unconnected walls** — SPEC-22 §3 only projects the walls joined at this wall's two ends.

At most five lines of summary. Commit "elevation-mvp: step 112 neighbour profiles and dimension clearance".
```

**Check after 112:**
- Two walls joined in a straight line with cabinets on the second one: in the first wall's elevation, those cabinets show as dashed empty rectangles past the wall's end, at the right heights and widths.
- The height dimensions on that side sit outside the dashed rectangles, not on top of them.
- A run that overhangs a wall end: the height column moves out past it instead of hiding behind it.
- A square corner shows no dashed rectangles.
- A crown that runs above the ceiling line: the top dimension row lifts clear of it.
- A plain wall with nothing overhanging: every row is exactly where it was.
- If the dashed profiles or the pushed-out rows land off-screen at the default zoom, say so and we'll widen the fit.

---
## Step 113 — Height dimensions on the right-hand edge

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-22.md §6, §9 test 192 and the change to test 11.
If `git status` shows uncommitted changes, stop and tell me. Step 112 must be in.

Files:
- src/elevation/model/dimensions.js (417): leftmost (250–254) and pickColumnRuns (288–317) only; new exports nearerEdge and a rightmost helper
- src/elevation/components/DimensionRow.jsx (328): props (37–50), outward (61–65), edgePoint (67–73) only
- src/elevation/components/ElevationCanvas.jsx (1,637): dimensionChains (180–196), the vertical levels in dimensionOffsets (426–441), and the two vertical DimensionRow elements (1,558–1,573)
- test: src/elevation/model/__tests__/dimensions.test.js (586): test 11 (325–348) and a new test 192 after it

pickColumnRuns gains a third argument `edge = 'left'`. Its three selected-run branches run only when a run is selected AND nearerEdge(selected.x + selected.width / 2, wallLength(wall)) === edge; otherwise it returns the default pair for that edge (leftmost for 'left', rightmost for 'right'). wallLength is already imported in dimensions.js. Don't change the branch bodies.

DimensionRow: new prop `wallLength = 0`; side 'right' gives outward { x: 1, y: 0 }, and a vertical edgePoint anchors at x = wallLength instead of 0. Nothing else in the file changes — axis, tickDirection, label distance, hit bands and rotation all follow outward already.

ElevationCanvas: dimensionChains.vertical becomes { left, right } via the verticalFor(edge) helper in SPEC §6 — a selected opening takes the column nearer to it, the other column stays on its runs. dimensionOffsets.vertical becomes { left, right }, each with its own layoutDimensionRow levels and its own clearance (clear.left / clear.right from step 112). Add two DimensionRow elements with side="right" and wallLength={wall.length}; the existing two read .left.

Don't open PropertiesPanel.jsx, RunGroup.jsx or the plan folder. Only test 11 and the new 192 change in dimensions.test.js.

Test 192 exactly as SPEC-22 §9, and test 11's first call becomes pickColumnRuns(wall, 'upper-right', 'right').
Expect 482 passing.

At most five lines of summary. Commit "elevation-mvp: step 113 right-hand height dimensions".
```

**Check after 113:**
- Nothing selected: the left column shows the cabinets nearest the left wall, the right column shows the ones nearest the right wall.
- Select a run in the right half: the right column switches to it, the left column doesn't move. Select one in the left half and the reverse happens.
- Select an opening: the column on its side shows the opening's stack, the other column keeps its cabinets.
- Both columns read bottom-to-top with their bottoms to the right, and both clear any overhang on their side.

---
## Step 114 — One cursor authority, elevation canvas

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-22.md §7, §8 (elevation, step 114), §9 test 193.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- NEW src/elevation/canvas/cursor.js exactly as SPEC §7 (copy the code; don't invent an API)
- NEW test src/elevation/canvas/__tests__/cursor.test.js (193 — the pure helpers only)
- src/elevation/components/ElevationCanvas.jsx (1,637): the container style at 1,376; a new pointerMode state beside the other useState calls (142–148); the space/blur handlers (304–318) and the pan pointer-move (319–336); stopPanning (213–226); the Escape branch of handleKeyDown (450–470); startStretch (981), finishStretch (1,061), startRunMove (1,120), finishRunMove (1,172), startJointDrag (1,219), finishJointDrag (1,343); and the cursor prop on three children (1,451–1,458 and the DimensionRow block 1,481–1,575)
- src/elevation/components/DimensionRow.jsx (328): setResizeCursor (87–90), dragProps (93–117), hitEvents (180–196)
- src/elevation/components/JointMarkers.jsx (175): setCursor (27–30) and its four call sites (87, 88, 100, 141, 145)
- src/elevation/components/OpeningShape.jsx (107): lines 58 and 61

No React context — react-konva's Stage doesn't bridge it. The controller goes down as a prop named `cursor`, and every consumer treats it as optional (`useCursorKeys(cursor)` with a null controller is a no-op), so nothing breaks if a component hasn't been migrated yet.

ElevationCanvas: `const [pointerMode, setPointerMode] = useState('idle')` mirrors the existing refs — don't replace spacePressedRef or panRef, just set the state alongside them (space down → 'pan-ready', space up/blur → 'idle', the first moved pan pointer-move → 'panning', stopPanning → 'pan-ready' when space is still down else 'idle'). `const { style: cursorStyle, controller: cursor } = useCanvasCursor(elevationBaseCursor(tool, pointerMode))`, and the container's style becomes `{ cursor: cursorStyle }`. Gesture starts hold, gesture ends and Escape release, per SPEC §7.

Children: delete the local cursor writers and use cursor.request(name, CURSORS.x) on enter / cursor.release(name) on leave, with a name that's unique within the component (the segment index, the joint id, the opening id). Never write to stage.container().style.cursor again in these files.

Don't touch RunGroup.jsx or PieceRect.jsx in this step (step 115), and don't open the plan folder (step 116).

Test 193 exactly as SPEC-22 §9 — pure functions only, no React rendering (there's no component test setup in this repo).
Expect 483 passing.

At most five lines of summary. Commit "elevation-mvp: step 114 canvas cursor authority".
```

**Check after 114:**
- Pick the draw tool: crosshair everywhere, including after hovering a dimension and leaving it — the crosshair used to disappear for good.
- Hold space: grab. Drag: grabbing. Let go: back to the tool's cursor.
- Drag a run by its dimension bar and let the pointer wander off the bar mid-drag: it stays `move` until you release.
- Hover a joint handle, then press Escape so the handle disappears under the pointer: the cursor goes back to normal instead of sticking.

---
## Step 115 — Cursors on runs, pieces and faces

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-22.md §7, §8 (elevation, step 115).
If `git status` shows uncommitted changes, stop and tell me. Step 114 must be in.

Files:
- src/elevation/components/RunGroup.jsx (413): setResizeCursor (127–130) and its call sites (155–161, 218–219, 231); a new `cursor` prop; a pointer cursor on the run body
- src/elevation/components/PieceRect.jsx (102): the props at 7–20 and the Rect's handlers at 30–40 — a new `cursor` prop and a pointer cursor
- src/elevation/components/ElevationCanvas.jsx (1,637): ONLY the two RunGroup usages (the live one 1,426–1,448 and the stretch preview 1,576–1,595) — pass cursor={cursor} to the live one and nothing to the preview

Use useCursorKeys(cursor) from ../canvas/cursor.js, same as step 114. Names: 'body' for the run rect, the piece id for a piece, 'left'/'right' for the stretch edges, 'badge' for the diagnostic. Diagnostic badge stays `help`, stretch edges stay `ew-resize`, the run body and pieces become `pointer` (they set nothing today, which is the "sometimes it doesn't change at all" complaint).

The preview RunGroup is not interactive — leave it without a cursor prop. Don't open FaceOutlines.jsx unless faces have their own hover handlers; if they do, they get `pointer` and the face path as the name. Don't touch anything else in ElevationCanvas.

No tests in this step. Run `npx vitest run` once at the end; 483 must still pass.

At most five lines of summary. Commit "elevation-mvp: step 115 run and piece cursors".
```

**Check after 115:**
- Hover a cabinet: pointer. Hover its edge with the select tool: ew-resize. Move between them repeatedly and it keeps up.
- Hover a piece inside a selected run: pointer.
- Hover the warning badge: help, and it goes back to pointer when you slide onto the run.
- Stretch a run and release with the pointer off the edge: back to pointer or default, never stuck on ew-resize.

---
## Step 116 — Plan canvas cursors

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-22.md §7, §8 (plan, step 116).
If `git status` shows uncommitted changes, stop and tell me. Step 114 must be in.

Files:
- src/elevation/plan/PlanCanvas.jsx (1,220): the container div (959–963); a new pointerMode state beside the other useState calls (162–170); the space/blur handlers (327–340) and the pan pointer-move/end (341–368); stopPanning (200–210); handlePanPointerDown (827–845); the move handle's two inline cursor writes (1,136, 1,139); and a cursor prop where the children are rendered — PlanWallShape 985, PlanOpening 996, PlanRunFootprint 1,011, WallEndpoints 1,114
- src/elevation/plan/PlanWallShape.jsx (340): the outer Group (120) — pointer on enter, release on leave
- src/elevation/plan/PlanRunFootprint.jsx (222): the outer Group's existing onMouseEnter/onMouseLeave (105–114) — keep the hovered state, add the pointer cursor
- src/elevation/plan/PlanOpening.jsx (168): lines 99–105
- src/canvas/components/WallEndpoints.jsx (187): lines 154–159

PlanCanvas mirrors ElevationCanvas step 114 exactly, with planBaseCursor(tool, pointerMode) — the plan container has no cursor style at all today, so the wall tool never showed a crosshair. The move handle's inline writes become hold/release around beginWallMove if it starts a drag, or a plain request/release pair if it doesn't; `move` either way.

WallEndpoints is also used by src/canvas/CanvasStage.jsx (the old designer). Its `cursor` prop must be optional and that file must not change — check with `grep -rn "WallEndpoints" src --include=*.jsx`.

Never write to stage.container().style.cursor in these files again; grep for `style.cursor` across src at the end and expect no hits outside node_modules.

No tests in this step. Run `npx vitest run` once at the end; 483 must still pass.

At most five lines of summary. Commit "elevation-mvp: step 116 plan canvas cursors".
```

**Check after 116:**
- Pick the wall tool in plan: crosshair. Finish a wall and it stays crosshair until you switch tools.
- Space or middle-drag: grab/grabbing, same as the elevation.
- Hover a wall, a cabinet footprint, an opening, an endpoint handle, the move handle: pointer, pointer, move-or-pointer, pointer, move — each one changes back the moment you leave.
- Switch between plan and elevation a few times: the cursor never carries over stuck.
