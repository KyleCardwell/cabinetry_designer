# Round 43 — Codex Prompts, Steps 342–347 (back panel miters, elevation dimensions)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, **in the repo the step names**. The SPEC lives in the designer repo. From geometry it's `../cabinetry_designer/docs/elevation-mvp/SPEC-43.md`.

| Step | Repo | What | Tests after |
|---|---|---|---|
| 342 | cabinetry_designer | `panelRun` on wall end panel sides, `panelRunMiters`, `miteredSpan` | 915 |
| 343 | cabinetry_designer | The miter in plan, on the end panel, in elevation depth and spans | 918 |
| 344 | cabinetry_designer | Back panel over the end panel (canvas, DXF, parts); the Joint field | 921 |
| 345 | cabinetry_designer_geometry | Dimensions in the DXF, `plotScale`, the FF dimstyle | 38 |
| 346 | cabinetry_designer | `plotScale` setting, Settings select, payload `plotScale` | 923 |
| 347 | cabinetry_designer | `elevationDimensions`, payload `dimensions` | 927 |

The API doesn't change: its payload schema passes unknown fields through. Branches as before: the designer on `feature/elevation-mvp`, geometry on `feature/drawing`. No new branches. 345 has to be in before you export a DXF with 346 or 347 in, because geometry rejects unknown fields.

The SPEC's test values come from the golden fixture with today's model and a reference build of these rules. If a test fails, fix the code, not the number, unless the number contradicts a SPEC rule. In that case, stop and say so.

---

## Before step 342 (Kyle)

```bash
cd cabinetry_designer
git status                                   # on feature/elevation-mvp; TODO.md has the new end-elevations item
git add TODO.md docs/elevation-mvp/SPEC-43.md docs/elevation-mvp/PROMPTS-43.md docs/DECISIONS.md
git commit -m "round 43 docs"
```

Geometry: `git status` clean on `feature/drawing`, and `.venv/bin/python -m pytest` → 32 passed.

---

## Step 342 — designer: `panelRun` on each wall end panel side

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-43.md §1 (Back panels) and §2. Step 341 is in.
If `git status` shows uncommitted changes, stop and tell me.

A shape step: nothing draws differently. Each side record from wallEndPanels() gains `panelRun: { runId, thickness, join }`, but only when a panel-only run (every grid leaf kind 'panel') is anchored to that end. join is the panel's stored `frame` override, else 'miter' when the run's outer panel face is the side's depth, else 'butt'. Two new exports use it: panelRunMiters(room, wall, run, settings) → { left, right } ({ width, thickness } or null) and miteredSpan(piece, run, miters) → { x, width }. Nothing calls them yet.

Files (only these):
- src/elevation/model/wallEndPanels.js (100 lines): the new imports, panelRunFace and panelRunJoin above panelSide, panelSide's body from `const runs` on, and panelRunMiters + miteredSpan at the end of the file. All VERBATIM from SPEC §2. Leave panelMiters, wallEndPanels, wallEndPanelPolygon, wallEndPanelSpans and wallEndPanelFramed as they are.
- NEW src/elevation/model/__tests__/panelJoins.test.js: VERBATIM from SPEC §2 (3 tests)

What you need without opening them: gridLeaves(node) (grid.js) returns a run grid's leaf nodes ({ id, kind, depth?, align? }). runBackOffset(run) (corners.js) is the run's back offset from the wall face. wallSideOf(run) (wallSides.js) is 'front' | 'back'.
DO NOT change any other file, test or snapshot. A side record without a panel-only run must stay exactly as it is (test 129 in wallSides.test.js uses toEqual on one). DO NOT grep the repo.

First add the test and run `npx vitest run src/elevation/model/__tests__/panelJoins.test.js`: it must fail. Iterate on that file. At the end `npm test && npm run lint` once: 912 + 3 = 915, golden snapshot unchanged. Don't run `npm run build`.

At most three lines of summary. Commit "elevation-mvp: step 342 Back panel runs at wall end panels".
```

---

## Step 343 — designer: the miter in plan and on the end panel

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-43.md §1 (Back panels) and §3. Step 342 is in.
If `git status` shows uncommitted changes, stop and tell me.

A mitered back panel cuts the wall end panel's inside corner on its face by the panel's thickness. This applies in plan (wallEndPanelPolygon, via panelMiters), in elevation depth (wallParts: the end panel's front drops by it) and in what the canvas shows of the end panel (wallEndPanelSpans hides the run's height). In plan the back panel's own range runs over the end panel to the outside corner with a 45° polygon (miterPanels in planPieces). Also a fix: in an inset room a panel-only run has a `_frame`, and wallEndPanels.js treated it as a face frame. framedRun() stops that, in panelMiters and wallEndPanelSpans only.

Files (only these):
- src/elevation/model/wallEndPanels.js (~150 lines after 342): panelMiters replaced by the SPEC §3 block (panelMiters, framedRun, mitered), VERBATIM; wallEndPanelSpans' `covers` chain VERBATIM and its doc comment as the SPEC says. Leave wallEndPanelFramed alone (step 344).
- src/elevation/model/wallParts.js (90): the last line of the `const miter = Math.max(…)` call (line 37), as SPEC §3. Nothing else.
- src/elevation/model/planPieces.js (352): the wallEndPanels.js import, miterPanels above planRunPieces' doc comment (VERBATIM), and lines 266 and 275 wrapped as SPEC §3. Nothing else.
- NEW src/elevation/model/__tests__/panelMiters.test.js: VERBATIM from SPEC §3 (3 tests)

What you need without opening them: planRunPieces' `faces` entries are { key, kind, start, end, back, front, polygon? } in the run's face coordinates (start/end along the wall, back/front out from the wall face). PlanRunFootprint draws `polygon` when it's there. runScene(room, view, run, settings) returns { result, faceLayouts, … }.
DO NOT open or change runScene.js, elevationParts.js, parts.js, roomSync.js, splitRun.js, frames.js, PlanRunFootprint.jsx or any component. DO NOT grep the repo.

First add the test and run `npx vitest run src/elevation/model/__tests__/panelMiters.test.js`: it must fail. Iterate on that file, plus src/elevation/model/__tests__/wallParts.test.js and frameEnds.test.js, which must keep passing unchanged. At the end `npm test && npm run lint` once: 915 + 3 = 918, golden snapshot unchanged. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 343 Back panel miter in plan and on the end panel".
```

---

## Step 344 — designer: the back panel runs over the end panel; the Joint field

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-43.md §1 (Back panels) and §4. Step 343 is in.
If `git status` shows uncommitted changes, stop and tell me.

A panel piece at a mitered end is wider by the wall end panel's width (miteredSpan). runScene applies it to the drawn pieces, so the canvas, the picker and the DXF (elevationParts reads drawnPieces) all draw the back panel to the outside corner. The parts list orders it at that width. wallEndPanelFramed is also true beside a back panel run, so the properties panel offers the joint choice there. The field is relabelled "Joint".

Files (only these):
- src/elevation/model/runScene.js (85 lines): the wallEndPanels.js import; `const miters = panelRunMiters(room, wall, run, settings);` above line 66; line 68 as SPEC §4. Nothing else.
- src/elevation/model/parts.js (212): the import; `const miters = …` above line 88; lines 99–100 as SPEC §4. Nothing else.
- src/elevation/model/wallEndPanels.js: wallEndPanelFramed as SPEC §4, VERBATIM. Nothing else.
- src/elevation/components/properties/WallEndPanelFields.jsx (47): doc comment, label "Joint", aria-label `${label} panel joint`, option texts as SPEC §4. Same values and update call.
- NEW src/elevation/model/__tests__/panelMiterParts.test.js: VERBATIM from SPEC §4 (3 tests)

wallEndPanelFramed keeps its name. Its callers (WallHeightProperties.jsx:53, WallEndPanelProperties.jsx:41) don't change: DO NOT open them. DO NOT open or change elevationParts.js, RunGroup.jsx, PieceRect.jsx, pick.js, planPieces.js or any test file other than the new one. DO NOT grep the repo.

First add the test and run `npx vitest run src/elevation/model/__tests__/panelMiterParts.test.js`: it must fail. Iterate on that file, plus src/elevation/model/__tests__/parts.test.js and runScene.test.js (unchanged, snapshot included). At the end `npm test && npm run lint` once: 918 + 3 = 921, golden and parts snapshots unchanged. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 344 Mitered back panels drawn and ordered".
```

---

## Step 345 — geometry: dimensions in the DXF

Run in **cabinetry_designer_geometry**.

```
Repo: cabinetry_designer_geometry, branch feature/drawing. SPEC: ../cabinetry_designer/docs/elevation-mvp/SPEC-43.md §1 (Elevation dimensions) and §5. Step 339 is in.
If `git status` shows uncommitted changes, stop and tell me.

The payload gains an optional top-level `plotScale` (None draws at 24) and `dimensions` on each elevation: { row, kind, start, end, base, at, text }. Each becomes an ezdxf linear DIMENSION on layer DIMENSIONS in a new dimstyle "FF". Its sizes are paper inches with DIMSCALE = the plot scale. The designer's text goes in the rendered block, and the entity's text is set back to "<>" after render(). The title, wall label and room name move under the lowest dimension line. Geometry computes no positions: everything comes from the record.

Files (only these):
- src/drawing/models.py (79 lines): PayloadDimension above PayloadElevation, `dimensions` on PayloadElevation, `plotScale` on DrawingPayload. VERBATIM from SPEC §5.
- src/dxf/writer.py (106): DIMSTYLE, DIMSTYLE_PAPER and add_dimstyle between create_dxf_document and write_lines_to_layer, VERBATIM. No other change (DIMENSIONS is already in LAYER_DEFS).
- NEW src/drawing/dimensions.py: VERBATIM from SPEC §5
- src/drawing/elevation_dxf.py (140): the imports, build_elevation_dxf's plot_scale parameter and add_dimstyle call, add_dimensions plus `low` before the title, and the three title positions. Nothing else.
- src/drawing/bundle.py (28): plot_scale from model.plotScale or DEFAULT_PLOT_SCALE, passed to build_elevation_dxf.
- NEW tests/test_elevation_dimensions.py: VERBATIM from SPEC §5 (6 tests)

ezdxf is 1.4.4 in .venv. add_linear_dim(base=, p1=, p2=, dimstyle=, text=, dxfattribs=) returns an override: call .render(), then set .dimension.dxf.text = "<>". DO NOT change hlr.py, any other test, the fixtures or the README. No new dependencies.

First add the test and run `.venv/bin/python -m pytest tests/test_elevation_dimensions.py`: it must fail. Iterate on that file and tests/test_draw.py, which must pass unchanged. At the end `.venv/bin/python -m pytest` once: 32 + 6 = 38 passed.

At most five lines of summary. Commit "round 43: step 345 Elevation dimensions in the DXF".
```

---

## Step 346 — designer: the drawing scale

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-43.md §1 (Plot scale) and §6. Step 344 is in.
If `git status` shows uncommitted changes, stop and tell me.

A new setting, plotScale (drawing inches per paper inch), defaults to 24 (1/2" = 1'-0"). Documents saved before it get 24 on load. Settings has a "Drawing scale" select (12, 16, 24, 32, 48), and the drawing payload carries top-level `plotScale`. Nothing draws differently on the canvas.

Files (only these):
- src/elevation/model/constants.js (139 lines): `plotScale: 24,` with its comment, after the bandDepths block (line 107), as SPEC §6
- NEW src/elevation/model/drawingScale.js: VERBATIM from SPEC §6
- src/elevation/store/persistence.js (694): `'plotScale',` after `'bottomPartHeights',` in V2_DEFAULTED_SETTING_KEYS (line 102). Nothing else.
- src/elevation/components/SettingsPanel.jsx (209): the PLOT_SCALES import and the Drawing scale <label> before the "Default height profile" block (line 97), VERBATIM
- src/elevation/model/drawingPayload.js (54): the drawingScale.js import, `plotScale: plotScale(settings),` after `elevations,`, and the doc comment's last sentence as SPEC §6
- NEW src/elevation/model/__tests__/drawingScale.test.js: VERBATIM (1 test)
- src/elevation/store/__tests__/persistence.test.js (1142): append the SPEC §6 describe at the end of the file, VERBATIM (1 test). Don't read the rest of the file: currentDocument, storageWith, ELEVATION_STORAGE_KEY and loadElevationDocument are already defined and imported there.
- src/elevation/model/__tests__/drawingPayload.test.js (78): `plotScale: 24,` after `units: 'in',` (line 32)

DO NOT change ui.js (updateSettings already merges any key), index.js, or any other file. DO NOT grep the repo.

First add the tests and the test edit, and run `npx vitest run src/elevation/model/__tests__/drawingScale.test.js src/elevation/store/__tests__/persistence.test.js src/elevation/model/__tests__/drawingPayload.test.js`: the new and changed ones must fail. Iterate on those three files. At the end `npm test && npm run lint` once: 921 + 2 = 923, golden snapshot unchanged. Don't run `npm run build`.

At most three lines of summary. Commit "elevation-mvp: step 346 Drawing scale setting".
```

---

## Step 347 — designer: the dimensions in the payload

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-43.md §1 (Elevation dimensions) and §7. Step 346 is in.
If `git status` shows uncommitted changes, stop and tell me.

elevationDimensions(room, wall, side, settings) turns the canvas's horizontal chains (horizontalChains lower/upper inner/outer, openingChain) into one record per segment: { row, kind, start, end, base, at, text }. Rows go below or above, nearest first. Each row's line is 3/8" × plotScale further out from wallExtent's bottom or top, and empty rows are skipped. The text is formatInches(end − start). Each payload elevation carries them as `dimensions`. The canvas doesn't change.

Files (only these):
- NEW src/elevation/model/elevationDimensions.js: VERBATIM from SPEC §7
- src/elevation/model/drawingPayload.js (~56 lines after 346): the elevationDimensions.js import and `dimensions: elevationDimensions(room, wall, side, settings),` after `parts: [ … ],`
- NEW src/elevation/model/__tests__/elevationDimensions.test.js: VERBATIM from SPEC §7 (3 tests)
- src/elevation/model/__tests__/drawingPayload.test.js (~79): the import, `delete copy.dimensions;` in withoutParts, and the new test appended inside the describe, VERBATIM

What you need without opening them: horizontalChains(room, view, band, settings) → { inner, outer }, arrays of { start, end, kind, … }. openingChain(room, view, settings) → the same kind of array, [] when the wall has nothing in its row. wallExtent(room, view, settings) → { left, right, top, bottom }. resolveWall(room, wall, side) gives the view. formatInches(n) gives e.g. '28 1/2"'.
DO NOT open or change dimensions.js, wallExtent.js, ElevationCanvas.jsx, ElevationDimensions.jsx, DimensionRow.jsx or canvas/dimensionLayout.js. DO NOT grep the repo.

First add the tests and run `npx vitest run src/elevation/model/__tests__/elevationDimensions.test.js src/elevation/model/__tests__/drawingPayload.test.js`: the new ones must fail. Iterate on those two files. At the end `npm test && npm run lint` once: 923 + 4 = 927, golden snapshot unchanged. Don't run `npm run build`.

At most three lines of summary. Commit "elevation-mvp: step 347 Elevation dimensions in the payload".
```

---

## Running it (Kyle, after 347)

`npm run build` once in the designer. Then start the API and designer as in round 42, and run the end-to-end check at the end of the SPEC. Check the back panel miter on a copy of G2 (back run depth 3/4"), then *Export DXF* on G1.

If anything looks wrong, export the room, keep the zip (its `payload.json` shows what was sent), and bring it back.
