# Elevation Lab — Codex Prompts, Steps 177–181 (cells round 34.1: kinds everywhere, panel types, add panel)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, and commit pending work first, including these docs.

**Every step in this round** (34.1 is done after 181; round 35 is tops, bottoms, vertical joins and `run.outset`):

| Step | What | Tests after |
|---|---|---|
| 177 | Solver: panel, void and shelves columns can be auto width; only side panels capture | 605 |
| 178 | Model: kind/depth on top-level cells, panel type, add panel | 611 |
| 179 | Saves accept top-level panel, void and shelves columns | 613 |
| 180 | Store: setCellKind at the top level, setPanelType, addPanel | 616 |
| 181 | Cell panel: one Kind / Panel type / Add panel section | 616 |

**Branch:** `elevation-grid-run-split`. Nothing merges back until round 38.

**Baseline is 600 passing** at `a25c393` (step 176). Confirm with `npm test` first; if it differs, shift every count below by the difference.

**Codex can't open the app.** 177–180 change little or nothing on screen. 181 has a hand check after it.

**This round's expected values were worked out on paper**, not by running the code (SPEC-34.1, top). If a new test fails by a small amount, compare the SPEC's arithmetic with the code before changing the code, and report which was wrong.

**Line numbers** are against `a25c393` unless a prompt says otherwise. Files edited in more than one step: none, except test files named in one step only.

---
## Step 177 — Solver and capture

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-34.1.md §1 and §2.
If `git status` shows uncommitted changes, stop and tell me.

A top-level panel, void or shelves column with no width shares leftover width like an auto cabinet; its piece carries its depth, align and shelves. Width warnings and auto count stay cabinet-only. Only a SIDE panel captures a cabinet (REV-005/006). Nothing in the store can make these columns yet, so the app must behave as before.

Files (only these; line numbers at a25c393):
- src/elevation/model/splitRun.js (541) — AUTO_KINDS, isAutoItem, itemExtras after line 8, then the edits SPEC §2 lists by line: layoutInputs (24–50, add nAutoCabinets), the rounding warning (122–130), computedItems (139), the warning loop (153), the item raw piece (220–231), positioning depth (241), positionedItemPiece (273–289), cabinetWidthWarnings (291–293), interiorLayout (318, 340), syncAutoItems (523, 527).
- src/elevation/model/capture.js (44) — import panelOrientation from './cells.js'; isPanelLike gains the side-panel line.
- src/elevation/model/cells.js (240) — cellCaptureSides (194–203) filters to side panels.
- src/elevation/model/__tests__/splitRun.test.js — describe('SPEC-34.1 auto cell kinds') at the end, verbatim (3 tests).
- src/elevation/model/__tests__/faceLayouts.test.js — test 52 at the end of describe('runFaceLayouts'), verbatim.
- src/elevation/model/__tests__/cellKinds.test.js — 'only side panels capture a cell' at the end of its describe, verbatim.

LEAVE ALONE: itemMinimum, runWidthRange, the pin logic in splitRun (pins stay cabinet-only), and the exported splitRun function's body. Every existing splitRun, capture, faceLayouts and gridRuns test must pass unchanged.

DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/splitRun.test.js src/elevation/model/__tests__/faceLayouts.test.js src/elevation/model/__tests__/cellKinds.test.js src/elevation/model/__tests__/capture.test.js`. At the end `npm test && npm run lint` once: 600 + 5 = 605. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 177 auto cell kinds and side-panel capture".
```

**After 177:** six files; splitRun.js about +30 / −10.

---
## Step 178 — Kind everywhere, panel type, add panel (model)

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-34.1.md §1 and §3. Step 177 is in.
If `git status` shows uncommitted changes, stop and tell me.

Pure model step. Kind, depth, align and shelves work on top-level cells too; leaving Panel resets the cell's track and drops depth/align; new panelTypes, setGridPanelType, addGridPanel. Nothing calls them yet.

Files (only these; line numbers at a25c393):
- src/elevation/model/cellTree.js (351) — import insertRootColumn (1–2); PANEL_SIDES after WRAP_THROUGH; nestedLeaf (251–256) becomes cellLeaf without the depth check, used at 259, 273, 294; setGridCellKind (258–270) replaced; panelTypes, setGridPanelType, addGridPanel appended. All verbatim from SPEC §3.
- src/elevation/model/index.js — the cellTree.js block (272–288) adds addGridPanel, PANEL_SIDES, panelTypes, setGridPanelType.
- src/elevation/model/__tests__/cellKinds.test.js — ONLY lines 32, 33 and 46, as SPEC §3 says (round 34 assumed top-level cells couldn't change and former panels kept their depth).
- NEW src/elevation/model/__tests__/cellPanels.test.js — verbatim from SPEC §3 (6 tests).

DO NOT touch grid.js, cells.js, splitRun.js, the store or any component. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/cellPanels.test.js src/elevation/model/__tests__/cellKinds.test.js src/elevation/model/__tests__/cellTree.test.js`. At the end `npm test && npm run lint` once: 605 + 6 = 611. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 178 kinds everywhere, panel types and add panel".
```

**After 178:** four files, one new test; cellTree.js about +90.

---
## Step 179 — Saves accept top-level cell kinds

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-34.1.md §4. Steps 177–178 are in.
If `git status` shows uncommitted changes, stop and tell me.

A top-level panel, void or shelves column must save and load. This lands BEFORE the store can create one (180).

Files (only these; line numbers at a25c393):
- src/elevation/store/persistence.js (601) — isCellDepth pulled out of isCellLeaf (~239) and used there; isRootItem added above isRunGrid (261); isRunGrid (268) uses rootItems(grid).every(isRootItem). Verbatim from SPEC §4. Nothing else changes.
- src/elevation/store/__tests__/persistence.test.js — line 891: `node.kind = 'panel';` → `node.kind = 'shelf';`; describe('SPEC-34.1 top-level cell kinds') at the end, verbatim (2 tests).

DO NOT grep the repo or open other files. No other test file.

While iterating, run only `npx vitest run src/elevation/store/__tests__/persistence.test.js`. At the end `npm test && npm run lint` once: 611 + 2 = 613. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 179 saves accept top-level cell kinds".
```

**After 179:** two files; persistence.js about +20 / −3.

---
## Step 180 — Store

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-34.1.md §5. Steps 177–179 are in.
If `git status` shows uncommitted changes, stop and tell me.

setCellKind works on top-level cells (turning auto count off) and applies the default panel type; new setPanelType and addPanel reducers. No UI yet.

Files (only these; slice line numbers at a25c393 — it hasn't changed since; match by the text shown):
- src/elevation/store/elevationSlice.js (1597) — ONLY: add addGridPanel, setGridPanelType to the cellTree.js import; replace setCellKind (1335–1345); add setPanelType and addPanel right after wrapCell (1374); export both after `wrapCell,` (1581). All verbatim from SPEC §5.
- src/elevation/store/__tests__/elevationSlice.test.js (2144) — line 2106: `cellId: 'b', kind: 'panel'` → `cellId: 'b', kind: 'filler'`; import addPanel and setPanelType; describe('SPEC-34.1 panel reducers') at the end, verbatim (3 tests).

LEAVE ALONE every other reducer. Every existing store test must pass (apart from the one line above).

DO NOT grep the repo and DO NOT open other files. Don't read the slice or its test whole.

While iterating, run only `npx vitest run src/elevation/store/__tests__/elevationSlice.test.js`. At the end `npm test && npm run lint` once: 613 + 3 = 616. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 180 panel reducers".
```

**After 180:** two files; slice about +40, test about +55.

---
## Step 181 — One Kind / Panel type / Add panel section

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-34.1.md §6. Steps 177–180 are in.
If `git status` shows uncommitted changes, stop and tell me.

Every cell (top-level cabinets included) gets one section at the top of its panel: Kind, then Panel type (for a panel), then Add panel Left / Right / Above / Below. Top-level panel, open and shelves columns get the cell panel. The cell panel's sections are re-ordered.

Files (only these; line numbers at a25c393):
- NEW src/elevation/components/properties/CellKindSection.jsx — SPEC §6 (~90 lines).
- src/elevation/components/properties/CellProperties.jsx (239) — remove the kind select, orientation line and their constants (25–31, 54, 60–74); render CellKindSection first; the old Cell section's heading becomes "Size"; order: Kind, Size, Column (nested only), Depth, Shelves, Blind, Split, Wrap, Faces; CellSplitSection (223) gets nested={context.depth > 0} removable canSplit={isCabinet}.
- src/elevation/components/properties/CellSplitSection.jsx (88) — new prop removable = nested; Make equal and Unsplit only when nested; Remove cell when removable.
- src/elevation/components/properties/CabinetProperties.jsx (275) — import CellKindSection; render it right above CellSplitSection (237).
- src/elevation/components/properties/PieceProperties.jsx (127) — `if (piece.columnId)` → `if (piece.columnId || item.kind !== 'cabinet')`.

Imports: model names from '../../model/index.js' (panelTypes, panelOrientation), actions from '../../store/elevationSlice.js' (setCellKind, setPanelType, addPanel). Match the classes already used in CellProperties and CellSplitSection.

DO NOT touch RunGroup, PieceRect, ElevationCanvas, the model or the store. DO NOT grep the repo.

No new tests. At the end `npm test && npm run lint` once: still 616. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 181 kind, panel type and add panel section".
```

**Check after 181 (by hand):**

1. Rooms drawn before this round look and behave the same.
2. Select any top-level cabinet: **Kind** is at the top of its panel, with **Add panel** Left / Right / Above / Below under it.
3. Your case: wrap a cabinet (Sides through), delete the left side panel, select the cabinet, **Add panel → Left**. The panel is back, 3/4" wide, and the cabinet shows `rule: captured single` again (single-door width). Note it runs from the floor to the underside of the top panel (like "top through"), not full height; a full-height side panel next to the top panel means wrapping again. Say if that matters in practice.
4. Set a top-level cabinet's Kind to **Panel**: it becomes a 3/4" side panel and the run's auto count turns off. **Panel type → Back**: it widens to share the leftover space, depth 3/4", and its label says Back panel. Kind back to **Cabinet**: a normal auto cabinet, full depth.
5. In a stack, set a cell to **Panel**: it becomes a 3/4" top/bottom panel; Panel type offers Top / bottom and Back only.
6. **Add panel → Above** on a top-level cabinet: a 3/4" panel appears over it and the cabinet shrinks by 3/4". Add panel → Below on a cell in a stack: the panel joins that stack.
7. A top-level panel column: its panel shows Kind, Size (Width), Depth and **Remove cell**, with no Make equal / Unsplit. Remove cell (or Delete) removes it.
8. Reload: everything comes back.

**Then round 34.1 is done.** Tell me when 181 is in, plus anything that still feels clunky, and I'll write SPEC-35 and PROMPTS-35 (run tops and bottoms, REV-011, vertical joins, `run.outset`), with every step listed and every prompt written up front.
