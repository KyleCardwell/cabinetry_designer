# Elevation Lab — Codex Prompts, Steps 170–176 (cells round 34: blind per cell, kinds, depth, wrap)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, and commit pending work first, including these docs.

**Every step in this round** (round 34 is done after 176; round 35 is tops, bottoms, vertical joins and `run.outset`):

| Step | What | Tests after |
|---|---|---|
| 170 | Blind per cell in the model (`rehomeBlind`, `setGridCellBlind`, `cellBlindSides`, `resizeGridBlind`) | 582 |
| 171 | Cell kinds, depth/align, Wrap in panels, shelf parts (model) | 590 |
| 172 | Capture by panel cells; part numbers for panels and shelves | 592 |
| 173 | Saves accept the kinds, depth and align | 595 |
| 174 | Store reducers for cells (blind, kind, depth, shelves, wrap) | 600 |
| 175 | The cell panel: kind, depth, shelves, blind; Wrap buttons | 600 |
| 176 | Draw void, panel and shelves cells | 600 |

**Branch:** `elevation-grid-run-split`, as for rounds 32–33. Nothing merges back until round 38.

**Baseline is 578 passing** at `ce63915` (step 169). Confirm with `npm test` first; if it differs, shift every count below by the difference.

**Re-scoped from CELLS-PLAN** (SPEC-34 "Not in this round"): box gaps → round 36, `run.outset` → round 35, deviation lists → the reports work after 38.

**Codex can't open the app.** 170–174 change nothing on screen. 175 and 176 have hand checks after them.

**Every model and store step was run before this was written:** the code and tests pasted in SPEC-34 are the versions that passed at each step. Copy them; don't redesign them.

**Line numbers** are against `ce63915` unless a prompt says otherwise. Files edited in more than one step: `grid.js`, `cellTree.js`, `cells.js`, `index.js` (170, 171 — 171 matches by text), `persistence.js` (171 adds one line near the top, 173 edits the validators further down).

---
## Step 170 — Blind per cell (model)

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-34.md §1 and §2.
If `git status` shows uncommitted changes, stop and tell me.

Pure model step. Nothing new is called by the store or UI yet; the app must behave exactly as before.

Files (only these; line numbers at ce63915):
- src/elevation/model/grid.js (290) — add the helpers from SPEC §2 verbatim right before insertRootColumn (189): mapLeaves, withBlindSide, outerNode, edgeIds, and the exports rehomeBlind, cellBlindSides, setGridCellBlind, resizeGridBlind. replaceRootItems (232–243) returns rehomeBlind(grid, next) and no longer reads runBlind. Keep restoreBlind (gridFromItems uses it).
- src/elevation/model/cellTree.js (257) — import rehomeBlind from grid.js (drop runBlind, setGridBlind from the import); delete the local stripBlind (53–68) and rehomeBlind (70–75); copiedStyle (77–79) also copies `blind`; splitGridCell, removeGridCell, unsplitGridCell call rehomeBlind(grid, next) as SPEC §2 lists (the root-across and root-remove paths just return replaceRootItems / removeRootColumn, which re-home themselves).
- src/elevation/model/cells.js (176) — the leaf piece gains `...(cell.node.blind ? { blind: { ...cell.node.blind } } : {}),` after `auto`; blindCellWidths (156–176) uses piece.blind?.[entry.side] as the box width and skips cells without one.
- src/elevation/model/index.js (284) — grid.js block (248–264) adds cellBlindSides, rehomeBlind, resizeGridBlind, setGridCellBlind.
- NEW src/elevation/model/__tests__/cellBlind.test.js — verbatim from SPEC §2 (4 tests).
- src/elevation/model/__tests__/cells.test.js (117) — replace ONLY the test 'resolves blind cell widths' (92–103) with the one in SPEC §2.

The rule, so you don't have to reverse-engineer it: an edge leaf that was an edge leaf before keeps its own blind; a leaf newly on the edge keeps what it has (a split copies blind like style) as long as some old edge leaf is still there; if none is (a new outer column), every edge leaf takes the run's blind; leaves off the edge lose that side. For unsplit columns that is exactly round 33, so every existing grid.test.js, gridRuns.test.js, cellTree.test.js, blind.test.js and store test must pass UNCHANGED.

DO NOT open or grep any other file. SPEC-34 §2 has every line these need.

While iterating, run only `npx vitest run src/elevation/model/__tests__/cellBlind.test.js src/elevation/model/__tests__/cells.test.js src/elevation/model/__tests__/cellTree.test.js src/elevation/model/__tests__/grid.test.js`. At the end `npm test && npm run lint` once: 578 + 4 = 582. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 170 blind per cell".
```

**After 170:** `git show --stat HEAD` — five files and one new test; grid.js about +90, cellTree.js about −35 net.

---
## Step 171 — Cell kinds, depth, align, wrap (model)

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-34.md §1 and §3. Step 170 is in.
If `git status` shows uncommitted changes, stop and tell me.

Pure model step: panel, void and shelves leaf kinds; depth and align on nested leaves; Wrap in panels; shelf parts, panel orientation, capture by panels. Nothing calls the new code yet.

Files (only these):
- src/elevation/model/grid.js — LEAF_KINDS (line 1) gains 'panel', 'void', 'shelves'; add BLINDLESS_KINDS below it; setNodeBlind returns a panel/void/shelves leaf unchanged; rehomeBlind's spread line skips them (SPEC §3, match by text).
- src/elevation/model/cellTree.js — the constants after CELL_DIRECTIONS and the helpers appended at the end, verbatim from SPEC §3: CELL_KINDS, MAX_SHELVES, WRAP_THROUGH, setGridCellKind, setGridCellDepth, setGridShelves, wrapGridCell (plus the private replaceLeaf, nestedLeaf, wrapGrid).
- src/elevation/model/cells.js — the leaf piece's depth/align/blind/shelves lines exactly as SPEC §3 shows (order matters for toEqual), the cell-too-deep warning, and the appended helpers verbatim: cellCaptureSides, panelOrientation, shelfParts, partPieces. cells.js still imports only isNestedGrid.
- src/elevation/model/constants.js (108) — floatingShelfThickness: 1.5 after stackedLowerTop (84); KIND_LABELS and KIND_COLORS entries for panel, void, shelves, shelf (SPEC §3).
- src/elevation/store/persistence.js — ONE line: 'floatingShelfThickness', after 'stackedLowerTop', (82) in V2_DEFAULTED_SETTING_KEYS. Nothing else in this file.
- src/elevation/model/index.js — add the new cellTree.js and cells.js exports (SPEC §3 lists them).
- NEW src/elevation/model/__tests__/cellKinds.test.js — verbatim from SPEC §3 (8 tests).

DO NOT touch faceLayouts.js, partNumbers.js, the store slice or any component (steps 172–176). DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/cellKinds.test.js src/elevation/model/__tests__/cellBlind.test.js src/elevation/model/__tests__/cells.test.js`. At the end `npm test && npm run lint` once: 582 + 8 = 590. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 171 cell kinds, depth and wrap".
```

**After 171:** seven files, one new test; cellTree.js about +120, cells.js about +65.

---
## Step 172 — Faces and part numbers see the kinds

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-34.md §4. Steps 170–171 are in.
If `git status` shows uncommitted changes, stop and tell me.

A cabinet cell beside a panel cell is captured (REV-005/006). Panels and each floating shelf get part numbers and badges; a void gets none. Nothing in the store can make these kinds yet, so the app looks the same.

Files (only these; line numbers at ce63915 — neither source file changed since):
- src/elevation/model/faceLayouts.js (67) — import cellCaptureSides beside cellPieces, stackedSides (2); replace the `captured` block (42–48) with SPEC §4's.
- src/elevation/model/partNumbers.js (238) — import partPieces (3); PART_KINDS (22) adds 'panel', 'shelf'; runParts (67) iterates partPieces(cells.pieces, settings); wallBadgeGroups (215–219) wraps its pieces in partPieces(…, settings).
- src/elevation/model/__tests__/faceLayouts.test.js — test 51 at the end of describe('runFaceLayouts'), verbatim from SPEC §4.
- src/elevation/model/__tests__/partNumbers.test.js — describe('SPEC-34 kind part numbers') at the end, verbatim from SPEC §4.

DO NOT grep the repo or open other files. Don't touch capture.js, cells.js, blind.js, room.js.

While iterating, run only `npx vitest run src/elevation/model/__tests__/faceLayouts.test.js src/elevation/model/__tests__/partNumbers.test.js`. At the end `npm test && npm run lint` once: 590 + 2 = 592. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 172 capture by panels and kind part numbers".
```

**After 172:** four files, about +10 source lines and +80 test lines.

---
## Step 173 — Saves accept kinds, depth and align

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-34.md §5. Steps 170–172 are in.
If `git status` shows uncommitted changes, stop and tell me.

A nested panel, void or shelves cell, and depth/align on nested cells, must save and load. This lands BEFORE the store can create them (174).

Files (only these):
- src/elevation/store/persistence.js (578 after step 171) — imports: MAX_SHELVES from '../model/cellTree.js', LEAF_KINDS added to the grid.js import (7); LEAF_KIND_SET and CELL_KIND_KEYS after ITEM_KINDS (26); replace isLeaf and isCellLeaf (~218–225) with SPEC §5's isLeaf, isShelves, isCellLeaf, verbatim; the isCellGrid comment loses "cabinet leaves". Nothing else changes — isRunGrid and isItem stay as they are (roots stay cabinet/filler).
- src/elevation/store/__tests__/persistence.test.js — describe('SPEC-34 cell kinds') at the end, verbatim from SPEC §5.

DO NOT grep the repo or open other files. No other test file.

While iterating, run only `npx vitest run src/elevation/store/__tests__/persistence.test.js`. At the end `npm test && npm run lint` once: 592 + 3 = 595. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 173 saves accept cell kinds".
```

**After 173:** two files; persistence.js about +30 / −4.

---
## Step 174 — Store reducers

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-34.md §6. Steps 170–173 are in.
If `git status` shows uncommitted changes, stop and tell me.

Five reducers (setCellBlind, setCellKind, setCellDepth, setCellShelves, wrapCell) and the run's blind field resizing only blind cells. No UI yet.

Files (only these; slice line numbers at ce63915 — it hasn't changed since; match by the text shown):
- src/elevation/store/elevationSlice.js (1526) — ONLY these sites:
  1. grid.js import (6–13): add resizeGridBlind, setGridCellBlind (keep setGridBlind — setRunEnd uses it at 929). cellTree.js import (14–21): add setGridCellDepth, setGridCellKind, setGridShelves, wrapGridCell.
  2. setRunBlind (1098): `run.grid = resizeGridBlind(run.grid, side, width);`
  3. The five reducers from SPEC §6, verbatim, right before setItemFace (1320).
  4. Actions list: after `setTrackSize,` (1510) add setCellBlind, setCellKind, setCellDepth, setCellShelves, wrapCell.
- src/elevation/store/__tests__/elevationSlice.test.js (2067) — import setCellBlind, setCellDepth, setCellKind, setCellShelves after `resizeRun,` and wrapCell after `useAutoHeightsForRoom,`; describe('SPEC-34 cell kind reducers') at the end, verbatim from SPEC §6.

LEAVE ALONE: setRunEnd, splitCell, removeCell, equalizeCells, unsplitCell, setTrackSize, setItemFace/Style/Reveals (they already skip non-cabinet leaves). Every existing store test must pass unchanged, including the SPEC-33 blind test and the setRunBlind tests.

DO NOT grep the repo and DO NOT open other files. Don't read the slice or its test whole.

While iterating, run only `npx vitest run src/elevation/store/__tests__/elevationSlice.test.js`. At the end `npm test && npm run lint` once: 595 + 5 = 600. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 174 cell kind reducers".
```

**After 174:** two files; slice about +70, test about +75.

---
## Step 175 — The cell panel

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-34.md §7. Steps 170–174 are in.
If `git status` shows uncommitted changes, stop and tell me.

The properties panel for a nested cell gets Kind, Depth / Line up, Shelves (count, back panel) and a per-cell Blind box; cabinets (root and nested) get a Wrap in panels section.

Files (only these; none changed since ce63915):
- NEW src/elevation/components/properties/CellWrapSection.jsx — SPEC §7 (~45 lines).
- src/elevation/components/properties/CellSplitSection.jsx (82) — new prop canSplit = true; when false hide the heading/count row and the Split across / Split down row; the nested row stays.
- src/elevation/components/properties/CellProperties.jsx (115) — SPEC §7: the new imports, the five consts after columnLocked (26), the Kind select at the top of the Cell section, then Depth, Shelves and Blind sections after Column; CellSplitSection gets canSplit={isCabinet}; CellWrapSection and FaceProperties only for cabinets.
- src/elevation/components/properties/CabinetProperties.jsx (273) — import CellWrapSection; render it right after the CellSplitSection (236).
- src/elevation/components/properties/PieceProperties.jsx (127) — partNumberField (65) is null for a 'void' or 'shelves' piece.

Imports: components take model names from '../../model/index.js' (cellBlindSides, formatInchesInput, MAX_SHELVES, panelOrientation are exported there since 170/171) and actions from '../../store/elevationSlice.js'. Match the markup and Tailwind classes already in CellProperties / EndFields (section headings, Field, InchInput with allowBlank + placeholder, the select class from EndFields).

DO NOT touch RunGroup, PieceRect (step 176), ElevationCanvas, the model or the store. DO NOT grep the repo. Open Field.jsx or InchInput.jsx only if a prop name is in doubt.

No new tests. At the end `npm test && npm run lint` once: still 600. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 175 cell panel for kinds, depth, shelves and blind".
```

**Check after 175 (by hand)** — cells still draw as solid blue boxes until 176; use the panel and the part badges:

1. Nothing split: every room looks and behaves as before. A root cabinet's panel now has **Wrap in panels** under Split.
2. Split a cabinet down 2, select the lower cell: the panel shows **Kind**, **Depth** (placeholder = the run's depth) and **Line up**.
3. Set Kind to **Floating shelves**: Shelves count 2, Back panel off; faces and the split buttons disappear, Make equal / Unsplit / Remove stay. Tick Back panel, set Count 3: the part badges show a back and three shelves.
4. Kind **Open (nothing)**: no part number field, no Depth section; its badge disappears.
5. Kind **Panel**, Depth 3/4, Line up Backs: the grey line says **Back panel**. Depth 30 on a 24" run: refused.
6. Blind corner run (left end Blind corner, blind box set): split the blind cabinet down 2. Both cells show **Blind box (left)**. Clear the lower one: only the upper keeps "Blind …". Change the run's blind box width: only the upper changes.
7. Select a cabinet under 24" wide (single door), **Sides through** with Bottom panel ticked: the cabinet sits inside four panel cells, and selecting it shows `rule: captured single` on its left and right reveals.
8. Reload: everything comes back.

**After:** five files, one new (~45 lines); CellProperties about +140.

---
## Step 176 — Draw the kinds

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-34.md §8. Steps 170–175 are in.
If `git status` shows uncommitted changes, stop and tell me.

A void draws as a dashed outline labelled "Open"; a panel cell is filled like an end panel and labelled Side / Top / Back panel; a shelves cell is an outline with its shelves (and a faint back) drawn inside, labelled "3 shelves + back".

Files (only these; line numbers at ce63915 — neither changed since):
- src/elevation/components/RunGroup.jsx (504) — import panelOrientation, shelfParts beside blindCellWidths, cellPieces (11); PANEL_LABELS above the component; the cell label loop at the top of subLabels (71); the `shelves` memo before drawnPieces (117); the shelf-part Rects right before the `{[...faceLayouts].map(` block (387). All in SPEC §8.
- src/elevation/components/PieceRect.jsx (125) — `hollow` after fixedCabinet (33); the main Rect's fill, dash and stroke (50–56) per SPEC §8.

DO NOT touch ElevationCanvas, CellChains, FaceOutlines, the model, the store or any properties component. DO NOT grep the repo.

No new tests. At the end `npm test && npm run lint` once: still 600. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 176 draw panel, void and shelves cells".
```

**Check after 176 (by hand):**

1. Rooms without the new kinds draw exactly as before.
2. The desk: a base run with end panels at both ends, one column split down into a 4" top cell (the pencil drawer) and the rest **Open**: the open cell is dashed and says "Open", the drawer cell keeps its faces with standard reveals.
3. Split the open cell down again and make the lower part a **Panel** with depth 3/4, backs in line: it's filled purple and says "Back panel".
4. A **Floating shelves** cell with 3 shelves and a back: three solid bars evenly spaced, a faint back behind, label "3 shelves + back"; clicking the cell (between shelves) selects it.
5. A wrapped cabinet: four purple panel cells around it, labelled Side / Top panel.
6. The oven stack: drawer base / 21" box with backs in line / doors — nothing looks different yet (depth isn't drawn), but the middle cell's panel shows Depth 21 and Backs, and it survives a reload.

**After:** two files, about +35 lines.

**Then round 34 is done.** Tell me when 176 is in, plus the floating-shelf thickness your shop uses and what reveal a cabinet under a top panel should get (SPEC-34 Open 1–2), and I'll write SPEC-35 and PROMPTS-35 (run tops and bottoms, REV-011, vertical joins, `run.outset`), with every step listed and every prompt written up front.
