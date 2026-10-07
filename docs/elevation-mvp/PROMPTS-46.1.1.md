# Round 46.1.1 — Codex Prompts, Steps 396–399 (Team default picks, panels at their style's thickness)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session. Every step is in **cabinetry_designer**, branch **elevation-doors**; geometry and the API don't change.

| Step | Repo | What | Tests after |
|---|---|---|---|
| 396 | cabinetry_designer | "Team default" pick; "Same as doors" labels | 1040 |
| 397 | cabinetry_designer | Run end panels and wall end panels at their style's thickness | 1047 |
| 398 | cabinetry_designer | Panel cells at their style's thickness | 1050 |
| 399 | cabinetry_designer | UI: pickers pass their level, Team default in delete, width placeholders | 1050 |

Before step 396: commit `docs/elevation-mvp/SPEC-46.1.1.md`, this file and the `TODO.md` entry so `git status` is clean.

---

## Step 396 — "Team default" pick; "Same as doors"

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

## Step 397 — run end panels and wall end panels at their style's thickness

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.1.1.md §1 and §3. Step 396 is in.
If `git status` shows uncommitted changes, stop and tell me.

End panels and wall end panels take their panel style's thickness (panel chain, then doors) unless a width is typed. Derived and never saved: run._endThickness = { left?, right? }, wall._endPanelThickness = { start?, end? }, only sides that differ from settings.endPanelThickness.
- NEW src/elevation/model/panelThickness.js (imports panelLevels, resolveDoorStyle from './doorStyleResolve.js'):
  panelThickness(room, wall, run, part, settings): the resolved panel style's thickness, or settings.endPanelThickness when the style id is 'default' (doc comment: interim team panel thickness until 46.3, SPEC-46.1.1);
  runEndThickness(room, wall, run, settings) → { left, right } with part run.ends?.[side] ?? null;
  wallPanelThickness(room, wall, settings) → { start, end }, null where wall.endPanels?.[endpoint] is null (run = null).
- src/elevation/model/roomSync.js (403 lines): withEndThickness(room, wall, run, settings) and withWallPanelThickness(room, wall, settings), following withDoorThickness (line 96): keep sides differing from settings.endPanelThickness by > 1e-9; none → remove the key (same object when absent); else set it (same object when equal by JSON.stringify). First pass in syncRoom (lines ~173–181) becomes: nextRoom.walls.map((wall) => ({ ...withWallPanelThickness(nextRoom, wall, settings), runs: wall.runs.map((run) => withRunPlane(wall, withEndThickness(nextRoom, wall, withDoorThickness(<as today>), settings))) })).
- Readers (typed width always first):
  - src/elevation/model/splitRun.js (622 lines): endWidth(end, settings, thickness) → end_panel: end.width ?? thickness ?? settings.endPanelThickness (lines 73–74). Line 90 passes run._endThickness?.left / ?.right; addEnd (line 269) and outerMinimum (line 347) pass run._endThickness?.[side].
  - src/elevation/model/runPins.js (145 lines): storedEndMinimum(end, settings, thickness) the same (lines 40–41); lines 125/127 pass run._endThickness?.left / ?.right.
  - src/elevation/model/extensions.js line 167: end_panel branch uses run._endThickness?.[side] ?? settings.endPanelThickness.
  - src/elevation/model/wallSides.js line 40 and src/elevation/model/wallEndPanels.js line 83: width ?? (wall.sideSource ?? wall)._endPanelThickness?.[endpoint] ?? settings.endPanelThickness (`source` in wallEndPanels).
- src/elevation/store/persistence.js toElevationDocument (~line 664): strip _endThickness from runs (with its void) and _endPanelThickness from walls.

Files (only these):
- the eight above
- NEW src/elevation/model/__tests__/panelThickness.test.js: the SPEC §3 file VERBATIM (7 tests)

DO NOT change splitRun.js line 319, cells.js, blind.js, frames.js, isElevationDocument, the store, the UI or any other test. DO NOT grep the repo.

Write the test file first; run `npx vitest run src/elevation/model/__tests__/panelThickness.test.js`: tests 2–7 must fail. Iterate on that file. At the end `npm test && npm run lint` once: 1040 + 7 = 1047, golden snapshot UNCHANGED, lint 0 errors. If the golden snapshot changes, stop and tell me. If G2's frame part or face values in test 5 come out different, don't change the test: report what you got.

At most three lines of summary. Commit "elevation-mvp: step 397 End panels at their style's thickness".
```

---

## Step 398 — panel cells at their style's thickness

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.1.1.md §1 and §4. Step 397 is in.
If `git status` shows uncommitted changes, stop and tell me.

In src/elevation/store/slices/cells.js (221 lines) import panelThickness from '../../model/panelThickness.js' and replace the four state.settings.endPanelThickness reads with panelThickness(location.room, location.wall, location.run, part, state.settings):
- setCellKind (line 115): part = findLeaf(grid, cellId) on the grid after setGridCellKind (a fresh panel, no style);
- wrapCell (156) and addPanel (178): part = null;
- setPanelType (167): part = findLeaf(before, cellId) (the existing leaf, so its own styleId counts).
findLeaf is in '../../model/cellTree.js'. The drafts are only read.

Files (only these):
- src/elevation/store/slices/cells.js
- NEW src/elevation/store/__tests__/slicePanelThickness.test.js: the SPEC §4 file VERBATIM (3 tests)

DO NOT change cellTree.js, other reducers or the model. DO NOT open sliceCells.test.js. DO NOT grep the repo.

Write the test file first; run `npx vitest run src/elevation/store/__tests__/slicePanelThickness.test.js`. Iterate on that file. At the end `npm test && npm run lint` once: 1047 + 3 = 1050, lint 0 errors.

At most three lines of summary. Commit "elevation-mvp: step 398 Panel cells at their style's thickness".
```

---

## Step 399 — UI: pickers pass their level; Team default in delete; width placeholders

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.1.1.md §1 and §5. Step 398 is in.
If `git status` shows uncommitted changes, stop and tell me.

UI only, no new tests.
- src/elevation/components/properties/DoorStylePicks.jsx: pass `node ?? {}` as pickOptions' fifth argument. Nothing else changes.
- src/elevation/components/RoomDoorStylesPanel.jsx (156 lines): the delete confirm's "Move them to" select becomes Inherit ('' → reassignTo null), Team default ('default'), then the other styles.
- src/elevation/components/properties/EndFields.jsx (188 lines), the end_panel width placeholder (line ~55): formatInchesInput(run._endThickness?.[side] ?? settings.endPanelThickness).
- src/elevation/components/properties/WallEndPanelFields.jsx (49 lines) line 28: formatInches(wall._endPanelThickness?.[endpoint] ?? settings.endPanelThickness).

Files (only these): the four above.

DO NOT change PartStyleFields.jsx, the store or the model. DO NOT grep the repo.

At the end `npm test && npm run lint && npm run build` once: still 1050 tests, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 399 Team default and panel thickness in the UI".
```

---

## Running it (Kyle, after 399)

Set Settings → End panel thickness to 13/16", then follow SPEC-46.1.1's end-to-end check: Drawer fronts / Panels read "Same as doors (…)"; Team default is in every picker; a 1" door style makes end panels 1" (boxes narrower); face frame end stiles grow by the panel's extra thickness; an island with end panels both ends shows odd box widths until you widen it.
