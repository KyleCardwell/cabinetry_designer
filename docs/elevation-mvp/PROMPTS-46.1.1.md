# Round 46.1.1 — Codex Prompts, Steps 396–400 (Team default picks, sheet slab panels, panels at their style's thickness)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session. Every step is in **cabinetry_designer**, branch **elevation-doors**; geometry and the API don't change.

**Revised after step 396** (Kyle, 2026-10-07: door-matching vs sheet slab end panels). Steps 397–400 below replace the earlier 397–399; commit the updated `docs/elevation-mvp/SPEC-46.1.1.md`, this file and `TODO.md` before step 397.

| Step | Repo | What | Tests after |
|---|---|---|---|
| 396 ✅ | cabinetry_designer | "Team default" pick; "Same as doors" labels | 1040 |
| 397 | cabinetry_designer | "Sheet slab" pick; joined ends and panel cells default to it | 1043 |
| 398 | cabinetry_designer | Run end panels and wall end panels at their style's thickness | 1051 |
| 399 | cabinetry_designer | Panel cells: sheet slab unless they pick a style | 1054 |
| 400 | cabinetry_designer | UI: pickers pass their level and spot, Team default in delete, width placeholders | 1054 |

---

## Step 396 — "Team default" pick; "Same as doors" ✅ (committed)

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.1.1.md §1 and §2. Step 395 is in (1037 tests).
If `git status` shows uncommitted changes, stop and tell me.

- src/elevation/model/doorStyleResolve.js (102 lines): in resolveDoorStyle's pick(), an id of 'default' sets style = teamDoorStyle(settings) and source = { level, key } and returns true, before the room-list lookup.
- src/elevation/model/doorStyleEdits.js (172 lines): pickOptions(room, settings, partType, levelsAbove, node = null) exactly as SPEC §2:
  ownKey by partType (doorStyleId / drawerFrontStyleId / panelStyleId); levels = node ? [{ level: 'here', node: node without ownKey }, ...levelsAbove] : levelsAbove; resolve; prefix 'Same as doors' when partType !== 'door' and (source.level === 'team' || source.key === 'doorStyleId'), else 'Inherit'; options start with { id: 'default', text: `Team default (${row})` } from teamDoorStyle(settings) and findDoorDesign(DEFAULT_DESIGN_ID), then the room's styles as today. A row's thickness is settings.endPanelThickness when partType === 'panel' and the row's style id is 'default', else the style's thickness (give the private styleRow what it needs).
- src/elevation/store/slices/doorStyles.js (125 lines): private isChoice(room, id) = id === 'default' || a listed id. setDoorStylePick and setPartStyle use it for a non-null styleId; deleteDoorStyle's reassignTo may be null, 'default' or another listed id (still never styleId).

Files (only these):
- the three above
- src/elevation/model/__tests__/partStyleEdits.test.js: replace the whole `it('lists the room\'s styles and what a level inherits from the levels above it', …)` block with the two `it` blocks in SPEC §2, VERBATIM; nothing else in the file changes
- NEW src/elevation/model/__tests__/teamDefaultPick.test.js: the SPEC §2 file VERBATIM (2 tests)

DO NOT change DoorStylePicks.jsx, PartStyleFields.jsx, RoomDoorStylesPanel.jsx (step 399), persistence.js or any other file. DO NOT grep the repo.

Change the tests first; run `npx vitest run src/elevation/model/__tests__/teamDefaultPick.test.js src/elevation/model/__tests__/partStyleEdits.test.js`. Iterate on those. At the end `npm test && npm run lint` once: 1037 − 1 + 2 + 2 = 1040, golden snapshot unchanged, lint 0 errors.

At most three lines of summary. Commit "elevation-mvp: step 396 Team default door style pick".
```

---

## Step 397 — "Sheet slab" pick; the default at a join and inside a run

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.1.1.md §1 and §3. Step 396 is in (1040 tests).
If `git status` shows uncommitted changes, stop and tell me.

Sheet slab end panels (cut from sheet material, 3/4") as a reserved panel pick 'sheet', and the default for "the spot" (a joined run end, a panel cell). Follow SPEC §3 exactly:
- src/elevation/model/doorStyles.js: export SHEET_PANEL_THICKNESS = 0.75 (doc: interim until materials) and sheetPanelStyle() → { ...DEFAULT_DOOR_STYLE, id: 'sheet', label: 'Sheet', name: 'Sheet slab', designId: 'slab', thickness: SHEET_PANEL_THICKNESS } (fresh object). isDoorStyleList also refuses the id 'sheet'.
- src/elevation/model/doorStyleResolve.js: in pick(), id 'sheet' with partType === 'panel' sets style = sheetPanelStyle(), source = { level, key }, returns true; for any other partType it's treated as a missing style (door-style-missing warning, walk goes on). panelLevels(room, wall, run, part, { sheet = false } = {}): when sheet, insert { level: 'spot', node: { panelStyleId: 'sheet' } } right after the part level.
- src/elevation/model/doorStyleEdits.js pickOptions: for partType 'panel', options are Team default, then { id: 'sheet', text: `Sheet slab (${formatInches(SHEET_PANEL_THICKNESS)})` }, then the room's styles. Inherit text is `Sheet slab here (${formatInches(SHEET_PANEL_THICKNESS)})` when source.level === 'spot'; otherwise unchanged rules (a sheet style reached by a pick above reads `Inherit (Sheet · Slab · 3/4")`).
- src/elevation/store/slices/doorStyles.js: 'sheet' is valid for setDoorStylePick only when key === 'panelStyleId', and for every setPartStyle part; never a deleteDoorStyle reassign target.

Files (only these):
- the four above
- src/elevation/model/__tests__/partStyleEdits.test.js: in the 'shows drawer fronts and panels following the doors…' test, the last expectation's options become the line given in SPEC §3; nothing else changes
- NEW src/elevation/model/__tests__/sheetPanel.test.js: the SPEC §3 file VERBATIM (3 tests)

DO NOT change persistence.js, the UI or any other file. DO NOT grep the repo.

Change the tests first; run `npx vitest run src/elevation/model/__tests__/sheetPanel.test.js src/elevation/model/__tests__/partStyleEdits.test.js`. Iterate on those. At the end `npm test && npm run lint` once: 1040 + 3 = 1043, golden snapshot unchanged, lint 0 errors.

At most three lines of summary. Commit "elevation-mvp: step 397 Sheet slab panels".
```

---

## Step 398 — run end panels and wall end panels at their style's thickness

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.1.1.md §1 and §4. Step 397 is in.
If `git status` shows uncommitted changes, stop and tell me.

End panels and wall end panels take their panel style's thickness unless a width is typed; a joined run end defaults to sheet slab (3/4"). Derived and never saved: run._endThickness = { left?, right? }, wall._endPanelThickness = { start?, end? }, only sides that differ from settings.endPanelThickness.
- NEW src/elevation/model/panelThickness.js (imports panelLevels, resolveDoorStyle from './doorStyleResolve.js'; isJointAnchor, isFollowAnchor from './joints.js' — check there's no import cycle):
  isJoinedEnd(run, side) → isJointAnchor(run.anchors?.[side]) || isFollowAnchor(run.anchors?.[side]);
  panelThickness(room, wall, run, part, settings, { sheet = false } = {}): the style resolved with panelLevels(room, wall, run, part, { sheet }); settings.endPanelThickness when its id is 'default', else its thickness (doc: interim team panel thickness until 46.3, SPEC-46.1.1);
  runEndThickness(room, wall, run, settings) → { left, right }, part run.ends?.[side] ?? null, { sheet: isJoinedEnd(run, side) };
  wallPanelThickness(room, wall, settings) → { start, end }, null where wall.endPanels?.[endpoint] is null (run = null, never sheet).
- src/elevation/model/roomSync.js (403 lines): withEndThickness(room, wall, run, settings) and withWallPanelThickness(room, wall, settings), following withDoorThickness (line 96): keep sides differing from settings.endPanelThickness by > 1e-9; none → remove the key (same object when absent); else set it (same object when equal by JSON.stringify). First pass in syncRoom (lines ~173–181) becomes: nextRoom.walls.map((wall) => ({ ...withWallPanelThickness(nextRoom, wall, settings), runs: wall.runs.map((run) => withRunPlane(wall, withEndThickness(nextRoom, wall, withDoorThickness(<as today>), settings))) })).
- Readers (typed width always first):
  - src/elevation/model/splitRun.js (622 lines): endWidth(end, settings, thickness) → end_panel: end.width ?? thickness ?? settings.endPanelThickness (lines 73–74). Line 90 passes run._endThickness?.left / ?.right; addEnd (line 269) and outerMinimum (line 347) pass run._endThickness?.[side].
  - src/elevation/model/runPins.js (145 lines): storedEndMinimum(end, settings, thickness) the same (lines 40–41); lines 125/127 pass run._endThickness?.left / ?.right.
  - src/elevation/model/extensions.js line 167: end_panel branch uses run._endThickness?.[side] ?? settings.endPanelThickness.
  - src/elevation/model/wallSides.js line 40 and src/elevation/model/wallEndPanels.js line 83: width ?? (wall.sideSource ?? wall)._endPanelThickness?.[endpoint] ?? settings.endPanelThickness (`source` in wallEndPanels).
- src/elevation/store/persistence.js toElevationDocument (~line 664): strip _endThickness from runs (with its void) and _endPanelThickness from walls.

Files (only these):
- the eight above
- NEW src/elevation/model/__tests__/panelThickness.test.js: the SPEC §4 file VERBATIM (8 tests)

DO NOT change splitRun.js line 319, cells.js, blind.js, frames.js, isElevationDocument, the store, the UI or any other test. DO NOT grep the repo.

Write the test file first; run `npx vitest run src/elevation/model/__tests__/panelThickness.test.js`: tests 2–8 must fail (test 1 passes once isJoinedEnd exists). Iterate on that file. At the end `npm test && npm run lint` once: 1043 + 8 = 1051, golden snapshot UNCHANGED, lint 0 errors. If the golden snapshot changes, stop and tell me. If G2's frame part or face values in test 6 come out different, don't change the test: report what you got.

At most three lines of summary. Commit "elevation-mvp: step 398 End panels at their style's thickness".
```

---

## Step 399 — panel cells: sheet slab unless they pick a style

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.1.1.md §1 and §5. Step 398 is in.
If `git status` shows uncommitted changes, stop and tell me.

In src/elevation/store/slices/cells.js (221 lines) import panelThickness from '../../model/panelThickness.js' and replace the four state.settings.endPanelThickness reads with panelThickness(location.room, location.wall, location.run, part, state.settings, { sheet: true }):
- setCellKind (line 115): part = findLeaf(grid, cellId) on the grid after setGridCellKind (a fresh panel, no style);
- wrapCell (156) and addPanel (178): part = null;
- setPanelType (167): part = findLeaf(before, cellId) (the existing leaf, so its own styleId counts).
findLeaf is in '../../model/cellTree.js'. The drafts are only read.

Files (only these):
- src/elevation/store/slices/cells.js
- NEW src/elevation/store/__tests__/slicePanelThickness.test.js: the SPEC §5 file VERBATIM (3 tests)

DO NOT change cellTree.js, other reducers or the model. DO NOT open sliceCells.test.js. DO NOT grep the repo.

Write the test file first; run `npx vitest run src/elevation/store/__tests__/slicePanelThickness.test.js`. Iterate on that file. At the end `npm test && npm run lint` once: 1051 + 3 = 1054, lint 0 errors.

At most three lines of summary. Commit "elevation-mvp: step 399 Panel cells sheet slab by default".
```

---

## Step 400 — UI: pickers pass their level and spot; Team default in delete; width placeholders

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.1.1.md §1 and §6. Step 399 is in.
If `git status` shows uncommitted changes, stop and tell me.

UI only, no new tests.
- src/elevation/components/properties/DoorStylePicks.jsx: pass `node ?? {}` as pickOptions' fifth argument. Nothing else changes.
- src/elevation/components/RoomDoorStylesPanel.jsx (156 lines): the delete confirm's "Move them to" select becomes Inherit ('' → reassignTo null), Team default ('default'), then the other styles.
- src/elevation/components/properties/EndFields.jsx (188 lines): PartStyleFields levels become panelLevels(room, wall, run, run.ends[side], { sheet: isJoinedEnd(run, side) }) (isJoinedEnd from '../../model/panelThickness.js'); the end_panel width placeholder (line ~55) is formatInchesInput(run._endThickness?.[side] ?? settings.endPanelThickness).
- src/elevation/components/properties/CellKindSection.jsx: the panel cell's panelLevels call passes { sheet: true }.
- src/elevation/components/properties/WallEndPanelFields.jsx (49 lines) line 28: formatInches(wall._endPanelThickness?.[endpoint] ?? settings.endPanelThickness).

Files (only these): the five above.

DO NOT change PartStyleFields.jsx, the store or the model. DO NOT grep the repo.

At the end `npm test && npm run lint && npm run build` once: still 1054 tests, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 400 Door style pickers: team default, sheet slab, panel widths".
```

---

## Running it (Kyle, after 400)

Set Settings → End panel thickness to 13/16", then follow SPEC-46.1.1's end-to-end check: Drawer fronts / Panels read "Same as doors (…)"; Team default in every picker and Sheet slab on panel pickers; a 1" door style makes free end panels and wall end panels 1" (boxes narrower); joined end panels and panel cells stay 3/4" sheet slab unless you pick a style on them; face frame end stiles grow with the panel; type a tall bottom rail on an alcove panel that bases die into.
