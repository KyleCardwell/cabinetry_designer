# Elevation Lab — Codex Prompts, Steps 182–186 (round 34.2: panel doors, hinge side, plan from cells)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, and commit pending work first, including these docs.

**Every step in this round** (34.2 is done after 186; then round 35):

| Step | What | Tests after |
|---|---|---|
| 182 | Model: panel Doors (flush/cover), depth rule, covered-panel reveals, hinge stops | 622 |
| 183 | Faces: hinge side on single doors; pair-door and hinge warnings | 626 |
| 184 | Saves accept panel doors and door hinges | 627 |
| 185 | Store + UI: Doors select, derived depth, Hinge select, readable warnings | 628 |
| 186 | Plan view drawn from cells | 630 |

**Branch:** `elevation-grid-run-split`. **Baseline is 616 passing** at `2d6da93` (step 181). Confirm with `npm test` first; if it differs, shift every count below by the difference.

**Expected values were worked out on paper** (SPEC-34.2, top). If a new test fails by a small amount, compare the SPEC's arithmetic with the code before changing the code, and say which was wrong. If an EXISTING test outside the named files breaks, stop and tell me rather than editing it.

**Line numbers** are against `2d6da93` unless a prompt says otherwise.

---
## Step 182 — Panel doors, depth rule, covered reveals (model)

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-34.2.md §1 and §2.
If `git status` shows uncommitted changes, stop and tell me.

Pure model step. A panel can have doors: 'cover'; pieces carry it; new cellDepth, coveredSides, hingeStops; covered side panels don't capture; cabinetReveals gets a `covered` parameter and the 'rule:covered-panel' rule; setGridPanelDoors. Nothing calls the new pieces yet (faceLayouts is step 183), so the app behaves as before.

Files (only these; line numbers at 2d6da93):
- src/elevation/model/cells.js (241) — `doors` on the leaf piece (after the align line, ~93); cellCaptureSides (194–205) skips covered panels; append cellDepth, coveredSides, hingeStops verbatim from SPEC §2.
- src/elevation/model/splitRun.js (558) — itemExtras (17–23) copies `doors`.
- src/elevation/model/capture.js (47) — isPanelLike's side-panel line skips covered panels.
- src/elevation/model/styles.js (199) — REVEAL_SOURCE_LABELS (21–) gains 'rule:covered-panel'; cabinetReveals gets `covered` after `stacked` (127) and the covered block after captured-single (151–155), before manual.
- src/elevation/model/cellTree.js (426) — setGridPanelType (371–) keeps `doors` for side/top; append setGridPanelDoors verbatim.
- src/elevation/model/index.js — cells.js block adds cellDepth, coveredSides, hingeStops; cellTree.js block adds setGridPanelDoors.
- NEW src/elevation/model/__tests__/cellCover.test.js — verbatim (4 tests).
- src/elevation/model/__tests__/styles.test.js — test '55 covered panel rule' at the end of describe('styles'), verbatim.
- src/elevation/model/__tests__/splitRun.test.js — 'carries a panel's doors onto its piece' at the end of describe('SPEC-34.1 auto cell kinds'), verbatim.

DO NOT touch faceLayouts.js, faces.js, planPieces.js, persistence, the store or any component. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/cellCover.test.js src/elevation/model/__tests__/styles.test.js src/elevation/model/__tests__/splitRun.test.js src/elevation/model/__tests__/capture.test.js src/elevation/model/__tests__/cellKinds.test.js`. At the end `npm test && npm run lint` once: 616 + 6 = 622. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 182 panel doors, depth rule and covered reveals".
```

---
## Step 183 — Hinge side and face warnings

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-34.2.md §1 and §3. Step 182 is in.
If `git status` shows uncommitted changes, stop and tell me.

Single doors get a hinge side (stored on the face node, or derived from fillers/end panels/flush side panels, else away from a covered panel). faceLayouts applies the covered-panel reveal, skips it for a pair door (with a warning), and warns when a hinge is on a covered side.

Files (only these; line numbers at 2d6da93):
- src/elevation/model/faces.js (142) — isFaceNode's leaf branch (34) accepts `hinge` on a door; resolveFaces' single-leaf push (103) carries `hinge`; append overlapsHeight and applyHinges verbatim.
- src/elevation/model/faceTree.js (121) — setFaceType (41–45) drops `hinge` for non-door types; append setFaceHinge verbatim.
- src/elevation/model/faceLayouts.js (69) — imports; the loop body (51–66) per SPEC §3, verbatim.
- src/elevation/model/index.js — applyHinges in the faces.js block, setFaceHinge in the faceTree.js block.
- src/elevation/model/__tests__/faceLayouts.test.js — COVER, layoutOf and tests 53, 54 after test 52, verbatim.
- src/elevation/model/__tests__/faces.test.js — describe('applyHinges') at the end, verbatim; add applyHinges to the faces.js import.
- src/elevation/model/__tests__/faceTree.test.js — the hinge test at the end of describe('faceTree'), verbatim; add setFaceHinge (and setFaceType if missing) to its import.

Existing faceLayouts tests 49–52 and every planPieces test must pass unchanged (their doors have stops on both sides or none, so no hinge is derived there; plan ignores hinges).

DO NOT touch cells.js, styles.js, planPieces.js, persistence, the store or any component. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/faceLayouts.test.js src/elevation/model/__tests__/faces.test.js src/elevation/model/__tests__/faceTree.test.js src/elevation/model/__tests__/planPieces.test.js`. At the end `npm test && npm run lint` once: 622 + 4 = 626. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 183 hinge side and covered-panel faces".
```

---
## Step 184 — Saves

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-34.2.md §4. Steps 182–183 are in.
If `git status` shows uncommitted changes, stop and tell me.

Panel `doors` and door `hinge` must save and load. Hinges are already validated by isFaceNode (step 183); this step only lets panels carry `doors`.

Files (only these):
- src/elevation/store/persistence.js (612) — CELL_KIND_KEYS.panel (31) adds 'doors'; isCellLeaf requires a panel's doors to be undefined, 'cover' or 'flush'.
- src/elevation/store/__tests__/persistence.test.js — describe('SPEC-34.2 panel doors and hinges') at the end, verbatim (1 test).

DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/store/__tests__/persistence.test.js`. At the end `npm test && npm run lint` once: 626 + 1 = 627. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 184 saves accept panel doors and hinges".
```

---
## Step 185 — Store and UI

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-34.2.md §5. Steps 182–184 are in.
If `git status` shows uncommitted changes, stop and tell me.

A setPanelDoors reducer; a Doors select for side/top panels; the Depth box shows the derived depth as its placeholder; a Hinge select on single doors; readable face warnings.

Files (only these; line numbers at 2d6da93):
- src/elevation/store/elevationSlice.js (1629) — setGridPanelDoors in the cellTree.js import; setPanelDoors right after addPanel (1404–), verbatim; export it after `addPanel,` (1613). Nothing else.
- src/elevation/store/__tests__/elevationSlice.test.js — import setPanelDoors; the test at the end of describe('SPEC-34.1 panel reducers'), verbatim.
- src/elevation/components/properties/CellKindSection.jsx (87) — Doors select for side/top panels (SPEC §5).
- src/elevation/components/properties/CellProperties.jsx (224) — Depth placeholder (129) uses cellDepth.
- src/elevation/components/properties/FaceProperties.jsx (298) — Hinge select for a selected door; the warnings line (293–296) shows one message per distinct code (SPEC §5).

Match the classes already used in these files. DO NOT touch the model, persistence, RunGroup, ElevationCanvas or the plan. DO NOT grep the repo.

While iterating, run only `npx vitest run src/elevation/store/__tests__/elevationSlice.test.js`. At the end `npm test && npm run lint` once: 627 + 1 = 628. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 185 panel doors and hinge side in the panel".
```

**Check after 185 (by hand):**

1. A top-level side panel between two cabinets: Depth shows 24 7/8 greyed (on a 24" run). Doors → Cover: Depth shows 24; the cabinet on the covered side shows a −11/16 reveal with source `rule: covered panel`.
2. That cabinet (single door): select its face — Hinge shows `Auto (right)` (away from the covered panel, or toward a filler/end panel). Pick Left: the warning "This door is hinged on the side that covers a panel." appears.
3. Make it a pair door: the covered reveal goes back to normal and "A pair door can't cover a side panel…" appears.
4. An upper with a bottom panel (Add panel → Below, Doors → Cover): the doors drop over it (−7/8 bottom reveal).
5. Reload: everything comes back.

---
## Step 186 — Plan view from cells

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-34.2.md §6. Steps 182–185 are in.
If `git status` shows uncommitted changes, stop and tell me.

Plan view draws what's in each column: cabinet cells at their own depth and alignment (faces from the highest cabinet cell at each spot), side and back panels as strips at their depth band, shelves as a dashed outline, nothing for a void or a top/bottom panel. An ordinary cabinet run must come out exactly as now.

Files (only these; line numbers at 2d6da93):
- src/elevation/model/planPieces.js (174) — planRunPieces (137–174) and planFaces (70–108) work from cellPieces as SPEC §6 describes (band(), boxes, per-column faces, panel entries). fillerReturns keeps layout.pieces.
- src/elevation/plan/PlanRunFootprint.jsx (268) — footprintOutlineSegments (30–61) takes back and front; its caller (148–152) passes box.back, box.front; a `dashed` box has no fill and a dashed outline.
- src/elevation/model/__tests__/planPieces.test.js — import gridFromItems; describe('SPEC-34.2 plan from cells') at the end, verbatim (2 tests).

Every existing planPieces test must pass unchanged (an ordinary cabinet's band is 0–24 and its faces 24.0625–24.875, as now).

DO NOT touch the store, properties components, cells.js or faceLayouts.js. DO NOT grep the repo.

While iterating, run only `npx vitest run src/elevation/model/__tests__/planPieces.test.js`. At the end `npm test && npm run lint` once: 628 + 2 = 630. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 186 plan view from cells".
```

**Check after 186 (by hand):**

1. Ordinary runs look the same in plan.
2. Your full-height panel between two cabinets shows as a 3/4" strip out to the door face (or to the box face when covered).
3. A split column with an open cell and a shelves cell: no doors where it's open, a dashed outline for shelves.
4. A 21" oven box with backs in line shows 21" deep in plan, with its door line at 21 7/8.
5. A back panel shows as a thin strip at the wall.

**Then round 34.2 is done.** Tell me when 186 is in and anything that still feels off, and I'll write SPEC-35 and PROMPTS-35 (run tops and bottoms, REV-011, vertical joins, `run.outset`).
