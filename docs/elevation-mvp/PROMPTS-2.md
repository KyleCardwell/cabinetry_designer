# Elevation Lab — Codex Prompts, Steps 6–10 (rooms, floor plan, heights, corners)

**Before step 6:** the working tree has uncommitted edits (end panel width override in `splitRun.js`, `PropertiesPanel.jsx` and a test). Commit them first, e.g. "elevation-mvp: end panel width override". Also commit `docs/elevation-mvp/SPEC-2.md` and this file.

Run the steps in order. Paste everything inside each code block. After each step, check it in the browser, and optionally ask Claude to "review step N".

---
## Step 6 — v2 data model, migration, pure geometry helpers

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC.md, then docs/elevation-mvp/SPEC-2.md completely. SPEC-2 is the source of truth for this step and overrides SPEC.md where they differ.
If `git status` shows uncommitted changes, stop and tell me.

Task (step 6 of 10): data model v2 + pure helpers + migration. Keep the UI working with minimal changes. No new UI features yet.
1. Pure model modules in src/elevation/model/ (no React or Redux imports), with JSDoc on the exports:
   - constants.js: apply the SPEC-2 §2 settings changes (defaultProfile, bumperThickness, doorThickness, cornerFillerMinWidth, cornerSnapDistance, orthoWalls, planGrid; remove the moved height keys).
   - geometry.js: wallLength, wallFrame(room, wall), elevationToPlan(frame, x, offset), plus small vector helpers (SPEC-2 §1).
   - profile.js: resolveProfile, moldingStack, counterTop, resolveVertical (SPEC-2 §4).
   - corners.js: frontDepth, bandsCompatible, cornerAt, cornerReserve, resolveHorizontal (SPEC-2 §5).
   - footprints.js: runFootprint, polygon overlap, findCollisions (SPEC-2 §7).
   - room.js: syncRoom(room, settings), roomDiagnostics(room, settings), tryPlaceRun(room, wallId, run, settings), flipRunsForWall(wall) (SPEC-2 §1, §5, §6).
   - splitRun.js: add the optional third argument `opts.endMinWidths` (SPEC-2 §5). Existing 2-arg behavior must not change.
   - runDefaults.js: createRun(bounds, ctx) per SPEC-2 §6 (heightMode, overrides, anchors). defaultsForType should read heights from a resolved profile.
2. persistence.js: v2 document shape, the new storage key, and v1 → v2 migration exactly per SPEC-2 §3 (never delete the v1 key). Update the validators for the v2 shapes.
3. elevationSlice.js: move to the v2 state (rooms, activeRoomId, activeWallId, view).
   - Every reducer that changes a room, wall, run or settings must end with `room = syncRoom(room, settings)` for the affected room. For settings changes, sync all rooms.
   - Add room reducers: addRoom, renameRoom, deleteRoom, setActiveRoom, updateRoomProfile.
   - Add wall reducers: updateWall (name, height, thickness, profile overrides), flipWall.
   - Add run reducers: setRunHeightMode, setRunOverride (key, value|null), setRunAnchor (side, bool; anchoring an inside-corner side sets that end to a flex filler).
   - Add a view reducer: setView.
   - Wall geometry reducers (add/move/connect) come in step 8. For now, "Add wall" in the sidebar creates a disconnected horizontal wall below the existing ones, using the migration rule's placement and flipped fix.
4. Minimal UI adaptation so the app still runs:
   - Components read the active room's walls.
   - Anywhere the old code used `wall.length`, use a resolved wall (e.g. a memoized selector returning `{...wall, length}`).
   - Placement checks use tryPlaceRun.
   - The draw tool calls createRun with ctx.
   - The Settings panel shows the new settings.
   - Diagnostics come from roomDiagnostics.
5. Tests: add every test in SPEC-2 §9 (1–18, including 17a) under src/elevation/model/__tests__/ and src/elevation/store/__tests__/. Update existing tests only where the v2 shape requires it (e.g. settings keys, createRun signature). Don't weaken their expectations. If a SPEC-2 expectation looks wrong, stop and explain instead of changing it.
6. `npm test`, `npm run build` and `npm run lint` must pass.

Don't modify files outside src/elevation/ except where SPEC.md §10 already allows. Don't touch classic editor files.
Commit "elevation-mvp: step 6 v2 model + migration" and summarize (files, test count, SPEC-QUESTIONs, anything you had to adapt in the UI).
```
---
## Step 7 — Height profile UI + molding in elevation

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-2.md (source of truth), especially §4 and §8.

Task (step 7 of 10): height inputs and their display.
1. Sidebar:
   - A room picker (add, rename, delete with inline confirm, select).
   - A "Room heights" panel with InchInputs for every HeightProfile field. Label crownTop "Top of crown". Show the molding stack and counter height read-only.
2. Run properties panel:
   - An Auto/Manual height toggle.
   - Auto: resolved z and height shown read-only, plus type-specific override InchInputs with allowBlank (blank = inherit), as SPEC-2 §8 lists (base: toe kick, box height, countertop; tall: toe kick, box top; upper: clearance above counter, box top). Show the inherited value as the placeholder.
   - Manual: the existing z/height inputs.
   - "Reset heights to defaults" should switch the run to Auto and clear its overrides.
3. A wall "heights" section in the right panel, shown when no run is selected: wall profile overrides (at least Top of crown, toe kick, countertop), blank = inherit from room.
4. Elevation canvas:
   - Molding bands above auto upper and tall runs (top mold + crown, with the overlap per SPEC-2 §8), visual only.
   - A dashed "Top of crown" line with a label.
   - Warnings from roomDiagnostics shown as before, including mixed-counter-heights, no-room-for-box and crown-above-ceiling.
5. Changing any room or wall height input must update every auto run immediately (syncRoom already does this). Manual runs don't move.
6. Add tests for any new pure helpers. `npm test`, `npm run build` and `npm run lint` must pass.

Commit "elevation-mvp: step 7 height profile UI" and summarize, with 4–6 manual test steps.
```
---
## Step 8 — Floor plan view

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-2.md (source of truth), especially §1, §7 and §8 "Plan canvas" / "Wall properties".

Task (step 8 of 10): plan view with connected walls.
1. Toolbar: a Plan | Elevation toggle (setView). Plan tools: Select, Draw Wall, an Ortho toggle (settings.orthoWalls) and Zoom to fit. Elevation tools stay as they are.
2. src/elevation/plan/: PlanCanvas.jsx and subcomponents (react-konva, ResizeObserver sizing, wheel zoom around the cursor, drag to pan in Select mode), plus a pure planTransform.js with tests.
3. Wall reducers in elevationSlice, porting the *behavior* of the classic src/store/slices/wallSlice.js without importing it:
   - addWallSegment({x1,y1,x2,y2, connectStart, connectEnd})
   - moveWallEndpoint (propagates to the connected wall)
   - connectWalls, disconnectWallEndpoint
   - deleteWall (clears connections)
   - setWallLength (moves the endpoint that is not the frame's left end along d; the connected neighbor endpoint follows)
   All of them end with syncRoom.
   You may import snapToGrid / snapToEndpoint from src/canvas/SnapEngine.js (read-only import).
4. Draw Wall:
   - Click the start point, then click the end point. Snap to settings.planGrid. Apply ortho when enabled. Snap to existing endpoints within 6" and auto-connect.
   - Show a live preview with a length label. Esc cancels.
   - Chaining: after placing a wall, the next wall starts at its end point until Esc or a double-click.
5. Select:
   - Click a wall → select it (it becomes the active wall).
   - Drag endpoint handles on the selected wall (connections follow; ortho applies; dropping on another endpoint connects, dragging away from a connection disconnects).
   - Double-click a wall → set active and switch to Elevation.
   - Delete/Backspace deletes the selected wall (inline confirm if it has runs).
6. Rendering:
   - Each wall is its interior-face line plus a thickness band on the exterior side (use wallFrame's n), with a small tick showing the interior side and a length label.
   - Run footprints (runFootprint) for every run: base/tall filled, upper dashed outline, colors by type, collisions (findCollisions) outlined red. Clicking a footprint selects that wall and run.
7. Right panel in plan view:
   - Wall properties per SPEC-2 §8: name, length (setWallLength), height, thickness, a Flip button (flipWall), profile overrides.
   - If a run is selected, show the existing run properties.
8. The sidebar wall list still works (selecting sets the active wall). "Add wall" in plan view switches to the Draw Wall tool instead of creating a horizontal wall.
9. Tests for the new reducers (connection propagation, setWallLength with a connected neighbor, flipWall mirroring) and planTransform. `npm test`, `npm run build` and `npm run lint` must pass.

Don't modify classic editor files.
Commit "elevation-mvp: step 8 floor plan" and summarize, with manual test steps (draw an L-shaped room, open each wall).
```
---
## Step 9 — Corner behavior in the UI

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-2.md (source of truth), especially §5, §6 and §8 "Run properties" / "Elevation canvas".

Task (step 9 of 10): make corners visible and editable. (The model already exists from step 6. Fix it only if you find a bug, and add a test for the bug.)
1. Draw tool: runs created within settings.cornerSnapDistance of a wall end are anchored on that side (createRun already does this). Make sure the placement preview shows the *resolved* run, i.e. snapped to the corner reserve, before mouse up.
2. Run properties:
   - "Anchor left" / "Anchor right" checkboxes (setRunAnchor).
   - When a side is anchored: x (and width if both are anchored) is read-only, with a note like "anchored — corner reserve 24 7/8"".
   - Per-side corner info: "Open end", "Inside corner 90° · Wall B", "Outside corner (not supported yet)", "Straight joint".
   - A "Front depth" read-only line (depth + bumper + door).
3. Elevation canvas:
   - Neighbor return blocks for inside corners per SPEC-2 §8: hatched, labeled with the neighbor wall name, not selectable.
   - An anchor marker on anchored run ends.
   - Corner fillers (flex fillers on an anchored inside-corner end) get a slightly different fill so they're recognizable.
4. Plan canvas: collisions stay red. Add a hover tooltip on a red footprint: "Overlaps <wall> run — anchor both runs to the corner".
5. Double-check: changing a neighbor run's depth, type, anchor or deleting it immediately re-positions anchored runs on the adjacent wall (syncRoom). Flipping a wall keeps the cabinets physically in place.
6. `npm test`, `npm run build` and `npm run lint` must pass.

Commit "elevation-mvp: step 9 corners UI" and summarize, with a manual test script covering: an L-shaped room with base runs on both walls → both corner fillers start 24 7/8" off the adjacent wall; delete one run → the other run extends into the corner; change the neighbor to an upper → the base run extends while the upper run stays reserved.
```
---
## Step 10 — Polish and acceptance

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-2.md.

Task (step 10 of 10): cleanup only, no new features.
1. Run the manual acceptance checklist at the bottom of docs/elevation-mvp/PROMPTS-2.md mentally against the code, and fix any gaps you find.
2. Remove dead code left from the v1 model (unused settings keys, unused helpers). Make sure the dev-only sample button still works with v2 (anchor its sample runs appropriately).
3. Make sure the "Show JSON" toggle shows the active room (not just the wall).
4. Update docs/elevation-mvp/SPEC-2.md only by appending a "SPEC-QUESTIONS / Deviations" section listing anything you implemented differently, and why.
5. `npm test`, `npm run build` and `npm run lint` must pass.
Commit "elevation-mvp: step 10 polish" and summarize.
```
---

## Manual acceptance checklist (after step 10)
1. Old Lab data from steps 1–5 still loads and looks the same (Room 1, walls stacked in plan).
2. In Plan, draw an L: wall A 144" east, wall B 120" south, connected. Double-click A → its elevation opens with the left end at A's start.
3. Draw a base run on A from ~40" to the right end → it anchors right only, and with nothing on B yet it runs to 144 with a right filler. (A run started within 30" of the left end would anchor both sides.)
4. Open B and draw a base run starting near the corner → it anchors left and starts at 24 7/8. A's run now ends at 144 − 24 7/8 = 119 1/8, and both corner fillers are ≥ the corner filler minimum. Neighbor return blocks are visible in both elevations.
5. Plan shows both footprints meeting at the corner with no red.
6. Room heights: set Top of crown to 94 → uppers and talls shrink by 2"; the molding band sits just under the crown line.
7. Set an upper run's clearance to 20 → only that run moves up. Set a base run's countertop to 3 → the upper above it moves up 1 1/2".
8. Flip wall A → its cabinets stay physically in place (the plan footprint doesn't move) but the elevation is mirrored.
9. Reload → everything persists.
