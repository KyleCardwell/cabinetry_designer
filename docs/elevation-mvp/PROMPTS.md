# Elevation Lab MVP — Codex Prompts

Run these one at a time, in order. After each step, check the page yourself and (optionally) ask Claude to review that step's commit before moving on.
Each prompt is self-contained: paste everything between the `---` lines.

Before step 1, the repo is on branch `package-updates`. Step 1 creates `feature/elevation-mvp` from it.

---
## Step 1 — Branch, test setup, pure model + tests

```
You are working in the `cabinetry_designer` repo (React 18 + Vite + Redux Toolkit + react-konva + Tailwind).
Read docs/elevation-mvp/SPEC.md completely before doing anything. It is the source of truth. Follow its "Out of scope" and "Allowed changes" sections strictly.

Task (step 1 of 5): pure model code and unit tests only. No UI.
1. Create and switch to branch `feature/elevation-mvp` from the current branch.
2. Add `vitest` as a devDependency and a `"test": "vitest run"` script in package.json. No other dependency changes.
3. Create these files in src/elevation/model/ exactly as described in SPEC §5–§7:
   - constants.js (CABINET_TYPE_IDS, DEFAULT_SETTINGS, kind labels/colors)
   - units.js (parseInches, formatInches, floorTo, roundTo; epsilon-safe)
   - splitRun.js (splitRun, syncAutoItems; pure, no React or Redux imports)
   - runDefaults.js (inferRunType, defaultsForType, createRun; `uuid` for ids)
   - overlap.js (runsConflict, validateRunPlacement)
   - index.js re-exporting the public functions
4. Write vitest tests in src/elevation/model/__tests__/ covering EVERY case in SPEC §11, plus any edge cases you find.
5. Run `npm test` and `npm run build`. Both must pass. If a SPEC §11 expectation seems wrong, do NOT change the test to match your code. Stop and explain.

Constraints: do not modify any existing file except package.json and package-lock.json. Plain JavaScript (the project is not TypeScript); add JSDoc types on exported functions.
When done: commit with the message "elevation-mvp: step 1 model + tests" and give a short summary (files, test count, any SPEC-QUESTIONs).
```
---
## Step 2 — Slice, persistence, route, sidebar

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC.md first (source of truth), especially §8–§10.

Task (step 2 of 5): state + page shell. No canvas drawing yet.
1. Create src/elevation/store/elevationSlice.js per SPEC §5 and §9:
   - state: schemaVersion, settings, walls, activeWallId, selection {runId, pieceId}, tool ('select' | 'draw'), message (transient toolbar text or null)
   - wall actions: addWall, updateWall (name/length/height), deleteWall, setActiveWall
   - run actions: addRun (already-built run), updateRun (partial patch), deleteRun, setRunEnd (side, {type, width}), setRunType (type change + optional reset to defaults), setAutoCount, setMaxCabinetWidth
   - item actions: setItemWidth (number or null), lockItem / unlockItem (lock takes the computed width as payload), splitItem, addItemAfter (kind), removeItem
   - UI actions: setSelection, clearSelection, setTool, setMessage, updateSettings
   Every reducer that changes a run must finish by running syncAutoItems on it (from src/elevation/model). Manual add/remove/split sets autoCount=false, as the spec says.
   Reducers must NOT do placement validation. Components validate with validateRunPlacement before dispatching.
2. Add localStorage persistence per SPEC §9: key `cd.elevationLab.v1`, debounced ~300ms, try/catch everywhere, fall back to one default wall. Implement it as a small store subscriber or listener in src/elevation/store/persistence.js, and load the initial state in the slice.
3. Register the reducer as `elevation` in src/store/index.js.
4. Add the `/elevation-lab` route in src/App.jsx, and header links "Projects" (/) and "Elevation Lab" (/elevation-lab) in src/components/layout/AppShell.jsx. Use react-router `NavLink` and keep the existing styling.
5. Build src/elevation/ElevationLab.jsx (page layout: left sidebar, center area, right panel) and src/elevation/components/:
   - WallList.jsx: add, select, rename, edit length/height (inch inputs), delete with an inline confirm
   - SettingsPanel.jsx: collapsible, every setting from SPEC §4
   - InchInput.jsx: a reusable input using parseInches/formatInches; commits on blur or Enter, reverts on invalid input, and allows blank when an `allowBlank` prop is set (commits null)
   - JsonToggle.jsx: shows the active wall's JSON
   The center area can be a placeholder that says "Canvas comes in step 3" and lists the active wall's runs as text.
6. Add reducer tests in src/elevation/store/__tests__/ (at least: addRun → items synced, splitItem → autoCount false, removeItem, lockItem, setRunEnd).
7. `npm test`, `npm run build` and `npm run lint` (fix only lint errors in files you created) must pass.

Do not touch src/canvas/*, RoomEditor, or the existing slices.
Commit "elevation-mvp: step 2 state + page shell" and summarize.
```
---
## Step 3 — Elevation canvas (render only)

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC.md (source of truth), especially §3 and §8 "Canvas".

Task (step 3 of 5): render the active wall and its runs. No drawing or selection yet.
1. Create src/elevation/components/ElevationCanvas.jsx (react-konva) plus small subcomponents as needed (e.g. WallFrame, RunGroup, PieceRect, DimensionLine).
   - Size the Stage from its container with a ResizeObserver (do NOT copy the window.innerWidth math in src/canvas/CanvasStage.jsx).
   - Put all coordinate conversion in one module, src/elevation/canvas/transform.js: fit the wall to the viewport with padding, flip y (z up), and convert both ways (wall ↔ screen).
   - Draw the wall outline, floor line and a light 12" grid.
   - For each run, render `splitRun(run, settings).pieces` (memoized per run and settings): colored rectangles by kind, the formatted width centered in each piece (hide the text if the piece is too narrow; show it on hover via a Konva Text/Label), and a lock marker on fixed cabinets.
   - Draw the base/tall toe kick strip and the base countertop band per SPEC §8 (visual only, not listening for events).
   - Draw a run overall-width dimension line above each run.
   - Outline pieces with warnings in amber and pieces in an errored run in red.
2. Add a toolbar component (src/elevation/components/ElevationToolbar.jsx) with Select/Draw buttons (wired to setTool; drawing itself comes in step 4), a "Zoom to fit" button, and the transient message area.
3. Replace the step-2 placeholder with the canvas.
4. For manual testing, add a dev-only "Add sample runs" button in the sidebar (render it only when `import.meta.env.DEV`). It adds, on the active wall, a base run x=0 w=120, an upper run x=0 w=96, and a tall run at the right end if there's room, all built with createRun.
5. `npm test`, `npm run build` and `npm run lint` must pass.

Commit "elevation-mvp: step 3 canvas render" and summarize, including how to view it.
```
---
## Step 4 — Draw tool + selection + delete

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC.md (source of truth), especially §7 and §8 "Draw tool" / "Select tool".

Task (step 4 of 5): interaction.
1. Draw tool: mouse down, drag, mouse up on the canvas creates a run.
   - Convert pointer positions with src/elevation/canvas/transform.js, clamp to the wall, and snap to 0.5".
   - While dragging, show a preview rectangle plus a live width label (formatInches).
   - On mouse up: ignore it if the width is under settings.minRunWidth. Otherwise build the run with createRun({x, width, bottomZ, topZ}, settings), check validateRunPlacement against the active wall, then dispatch addRun or show the failure reason via setMessage (auto-clear after ~3s).
   - On success, switch the tool to 'select' and select the new run.
   - Esc cancels a drag in progress.
2. Select tool:
   - Clicking a piece → setSelection({runId, pieceId}).
   - Clicking the run area that isn't a piece (e.g. the dimension line or a run hit-area behind the pieces) → setSelection({runId, pieceId: null}).
   - Clicking empty canvas → clearSelection.
   - Highlight the selected run (outline) and selected piece (thicker stroke).
3. Keyboard:
   - Esc clears the selection (or cancels a drag).
   - Delete/Backspace, when focus is not in an input, select or textarea: if the selected piece is an item (cabinet or interior filler) → removeItem; if only a run is selected → deleteRun; end pieces → do nothing.
   - Register the listeners once and clean them up on unmount.
4. The canvas must not crash when the active wall is deleted or changed while something is selected. Clear the selection on wall change.
5. Add unit tests for any new pure helpers (e.g. drag-rect → run input). `npm test`, `npm run build` and `npm run lint` must pass.

Commit "elevation-mvp: step 4 draw + select" and summarize.
```
---
## Step 5 — Properties panel

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC.md (source of truth), especially §8 "Properties panel".

Task (step 5 of 5): the right-hand properties panel, src/elevation/components/PropertiesPanel.jsx (split into RunProperties, PieceProperties and WarningsList as you see fit).
1. Nothing selected: show a short hint ("Draw a run, or click a run or cabinet").
2. Run selected:
   - Type select with a "Reset heights to defaults" button.
   - x / width / z / height / depth InchInputs. Before dispatching updateRun, build the patched run, check validateRunPlacement against the other runs on the wall, and on failure revert and setMessage(reason).
   - Left and right end editors: type select; a width InchInput with allowBlank (blank = auto), shown only for fillers.
   - Auto count toggle; a cabinet count with − / + buttons (they call removeItem on the last cabinet / addItemAfter the last item with kind 'cabinet', so autoCount becomes false); a max cabinet width InchInput with allowBlank.
   - Pieces list (kind, formatted width, lock state); clicking a row selects that piece.
   - Warnings and errors for this run (from splitRun).
3. Cabinet piece selected:
   - A width InchInput (commit → setItemWidth).
   - A Lock/Unlock toggle (lock → lockItem with the piece's current computed width; unlock → setItemWidth null).
   - Buttons: Split in 2, Add cabinet right, Add filler right, Remove.
   - Show the parent run's type and height as read-only.
4. Interior filler selected: a width InchInput and Remove.
5. End piece selected: end type select and a width InchInput (allowBlank; fillers only).
6. After any edit, the canvas must update immediately (it already renders from state), and the selection must stay valid. If the selected piece no longer exists (e.g. an auto item removed by sync), fall back to selecting the run.
7. Add component-free unit tests for any new helpers. `npm test`, `npm run build` and `npm run lint` must pass.
8. Update docs/elevation-mvp/SPEC.md only if you add a SPEC-QUESTION section at the bottom listing open questions. Don't rewrite the spec.

Commit "elevation-mvp: step 5 properties panel" and summarize, with a short manual test script (5–8 steps) I can follow in the browser.
```
---

## Manual acceptance check (after step 5)
1. Open /elevation-lab, add a 144" wall, choose Draw, and drag a low rectangle across ~120" → a base run appears at 30 1/2" tall on a 4" toe kick, split into cabinets ≤ 36" with fillers ≥ 1 1/2".
2. Drag a rectangle higher up → an upper run appears at 54".
3. Try drawing a tall run overlapping the base run → it's rejected with a message.
4. Click a cabinet, type 36 and lock it → the others re-flow; the fillers stay ≥ 1 1/2".
5. Change the right end to End Panel → a 3/4" panel appears and the widths re-flow.
6. Reload the page → everything is still there (localStorage).
