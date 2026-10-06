# Round 43.3 — Codex Prompts, Steps 353–357 (cell chains and callouts)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, **in the repo the step names**. The SPEC lives in the designer repo. From geometry it's `../cabinetry_designer/docs/elevation-mvp/SPEC-43.3.md`.

| Step | Repo | What | Tests after |
|---|---|---|---|
| 353 | cabinetry_designer_geometry | `startBase` / `endBase`; an extension line on its dimension line is left out | 46 |
| 354 | cabinetry_designer_geometry | `marks`: centreline marks on CENTERLINES | 48 |
| 355 | cabinetry_designer | cell chains | 933 |
| 356 | cabinetry_designer | casing clearances and pin callouts | 935 |
| 357 | cabinetry_designer | `elevationMarks` and `marks` in the payload | 938 |

The API doesn't change. Branches as before: the designer on `feature/elevation-mvp`, geometry on `feature/drawing`. 353 and 354 have to be in before you export with 356 or 357 in, because geometry rejects unknown fields.

---

## Before step 353 (Kyle)

Geometry has a leftover lock file from my session, `.git/stale-index.lock.claude`. It's harmless, but delete it:

```bash
cd cabinetry_designer_geometry
rm .git/stale-index.lock.claude
git status                                   # clean on feature/drawing
.venv/bin/python -m pytest                   # 44 passed
```

```bash
cd ../cabinetry_designer
git status                                   # on feature/elevation-mvp; only the three docs below changed
git add docs/elevation-mvp/SPEC-43.3.md docs/elevation-mvp/PROMPTS-43.3.md docs/DECISIONS.md
git commit -m "round 43.3 docs"
```

---

## Step 353 — geometry: each end's own extension line

Run in **cabinetry_designer_geometry**.

```
Repo: cabinetry_designer_geometry, branch feature/drawing. SPEC: ../cabinetry_designer/docs/elevation-mvp/SPEC-43.3.md §1 and §2. Step 351 is in.
If `git status` shows uncommitted changes, stop and tell me.

A dimension record can say where each extension line starts. PayloadDimension gets startBase: float | None = None and endBase: float | None = None after textZ, with the one-line comment from SPEC §2. In add_dimensions, p1 uses startBase (else base) and p2 uses endBase (else base), in both orientations (horizontal p1 = (start, startBase); vertical p1 = (startBase, start)). An extension line whose base is within EPSILON of `at` is suppressed: pass override={"dimse1": 0/1, "dimse2": 0/1} on the same add_linear_dim call. Keep one call site. Existing records (base never equal to at) draw exactly as now.

Files (only these):
- src/drawing/models.py (102 lines): the two fields
- src/drawing/dimensions.py (39): the bases, the override, one docstring line (each end's extension line from its own base, left out when it's on the line, SPEC-43.3), wrapped to ≤ 110 characters
- tests/test_elevation_dimensions.py (167): append the SPEC §2 block at the end, VERBATIM (CALLOUTS, _lines, 2 tests)

DO NOT change elevation_dxf.py, bundle.py, writer.py, the fixtures or any other test. No new dependencies.

First append the tests and run `.venv/bin/python -m pytest tests/test_elevation_dimensions.py`: the 2 new ones must fail. Iterate on that file. At the end `.venv/bin/python -m pytest` once: 44 + 2 = 46 passed.

At most three lines of summary. Commit "round 43.3: step 353 Extension lines from each end's own base".
```

---

## Step 354 — geometry: centreline marks

Run in **cabinetry_designer_geometry**.

```
Repo: cabinetry_designer_geometry, branch feature/drawing. SPEC: ../cabinetry_designer/docs/elevation-mvp/SPEC-43.3.md §1 and §3. Step 353 is in.
If `git status` shows uncommitted changes, stop and tell me.

An elevation can carry centreline marks. PayloadMark (extra="forbid"): kind: Literal["centerline"], x, bottom, top, text (min_length=1), textX, textZ. PayloadElevation gets marks: list[PayloadMark] = [] after dimensions. A new layer CENTERLINES: (2, "CENTER", 18) after DIMENSIONS in LAYER_DEFS (CENTER is already a linetype). New src/drawing/marks.py with add_marks(modelspace, marks, plot_scale): per mark a LINE (x, bottom) → (x, top) on CENTERLINES, and a TEXT on DIMENSIONS in TEXT_STYLE, height DIMSTYLE_PAPER["dimtxt"] * plot_scale, placed with .set_placement((textX, textZ), align=TextEntityAlignment.MIDDLE_CENTER) (from ezdxf.enums). build_elevation_dxf calls add_marks(modelspace, elevation.marks, plot_scale) right after add_dimensions. The title and `low` don't change.

Files (only these):
- src/drawing/models.py (~105 lines): PayloadMark with a docstring, PayloadElevation.marks
- src/dxf/writer.py (147): the CENTERLINES layer; its comment says centrelines are as light as dimensions (SPEC-43.3)
- NEW src/drawing/marks.py: add_marks with a module docstring (SPEC-43.3; the designer places them, geometry draws them)
- src/drawing/elevation_dxf.py (156): the import and the one call
- tests/test_drawing_style.py (48): line 39 `"HIDDEN": 18, "DIMENSIONS": 18, "TEXT": 18,` → `"HIDDEN": 18, "DIMENSIONS": 18, "CENTERLINES": 18, "TEXT": 18,`. No other change.
- NEW tests/test_elevation_marks.py: VERBATIM from SPEC §3 (2 tests)

bundle.py already writes payload.json with exclude_defaults=True, so payloads without marks round-trip unchanged. DO NOT change bundle.py, dimensions.py, the fixtures or any other test. No new dependencies.

First add the tests and the line-39 change and run `.venv/bin/python -m pytest tests/test_elevation_marks.py tests/test_drawing_style.py`: the 2 new tests and the layer test must fail. Iterate on those files. At the end `.venv/bin/python -m pytest` once: 46 + 2 = 48 passed.

At most three lines of summary. Commit "round 43.3: step 354 Centreline marks".
```

---

## Step 355 — designer: cell chains

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-43.3.md §1 and §4. Step 352 is in.
If `git status` shows uncommitted changes, stop and tell me.

elevationDimensions(room, wall, side, settings) keeps returning everything it does now, then adds each split column's cell chain. For each run in view.runs, runScene(room, view, run, settings).cells.grids gives { id, columnId, axis, depth, x, z, width, height, tracks: [{ id, start, end, manual }] }. axis 'row' = split down (tracks are heights, listed top first); axis 'col' = split across (tracks are x). Per grid, one record per track longer than EPSILON, sorted by start: { row: 'cells', orientation?: 'vertical', kind: 'cell', start, end, base, at, text, textX?, textZ? }. orientation: 'vertical' only on a row grid. at = grid.x (row) or grid.z (col) + CELL_CHAIN_INSET × plotScale, with a new non-exported CELL_CHAIN_INSET = 0.25 (paper inches) and its comment; base = at. Moved text: placeLabels(segments, at, +1, scale, textOutward) with textOutward true for a col grid and false for a row grid, mapped as 43.2 does (horizontal textX = along, textZ = across; vertical textX = across, textZ = along). A small helper that turns placed labels into records, shared with the vertical-column loop, is fine. Add one line to the doc comment (cell chains 1/4" paper inside the column's left or bottom edge, no extension lines, SPEC-43.3).

Files (only these):
- src/elevation/model/elevationDimensions.js (146 lines): as above; import runScene from './runScene.js' (no cycle)
- NEW src/elevation/model/__tests__/cellChainDimensions.test.js: VERBATIM from SPEC §4 (2 tests)

What you need without opening them: runScene(room, wall, run, settings) returns { result, cells, … } and cells.grids is the shape above (nested grids included, parent first). splitGridCell is only used by the test.
DO NOT open or change dimensions.js, runScene.js, cells.js, drawingPayload.js, CellChains.jsx or any canvas/component file, or the existing tests. DO NOT grep the repo.

First add the test and run `npx vitest run src/elevation/model/__tests__/cellChainDimensions.test.js`: both must fail. Iterate on that file. At the end `npm test && npm run lint` once: 931 + 2 = 933, golden snapshot unchanged, lint 0 errors. Don't run `npm run build`.

At most three lines of summary. Commit "elevation-mvp: step 355 Cell chains in the DXF".
```

---

## Step 356 — designer: casing clearances and pin callouts

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-43.3.md §1 and §5. Step 355 is in.
If `git status` shows uncommitted changes, stop and tell me.

After the cells records, elevationDimensions adds clearances, then pins.

Clearances: clearanceCallouts(room, view, settings) from ./dimensions.js (exported) returns [{ openingId, label, side, start, end, targetRunId, required, violated, z }]. Skip targetRunId === null and lengths ≤ EPSILON. Record: { row: 'clearances', kind: 'clearance', start, end, base: z, at: z, text: formatInches(end - start), textX?, textZ? }. Moved text: placeLabels([segment], z, +1, scale) (default textOutward), each callout alone.

Pins: per run in view.runs, centerlineMarkers(run, scene.result.pieces, view, view.length, settings) from ./dimensions.js (exported; scene = that run's runScene, computed once per run and shared with the cell chains) returns [{ pieceId, x, datumX, z, value, pieceBottom, pieceTop, from, anchor, datumZ? }]. Skip value ≤ EPSILON. Record: { row: 'pins', kind: 'pin', start, end, base: z, startBase, endBase, at: z, text, textX?, textZ? }. start = min(x, datumX), end = max. The datum's base is datumZ ?? z; the cabinet's base is z clamped to [pieceBottom, pieceTop]; startBase is the base of whichever is at start, endBase the other. text = `CL ${formatInches(value)}` when anchor === 'center', else formatInches(value). Moved text as for clearances.

placeLabels uses segment.text when a segment has one, else formatInches(end - start) as now. Nothing else in it changes. Update the function's doc comment (clearances to a run and pin callouts inside the wall at their own height; a pin's extension lines from its datum's and its cabinet's own points; SPEC-43.3).

Files (only these):
- src/elevation/model/elevationDimensions.js (~175 lines): as above
- src/elevation/model/__tests__/elevationDimensions.test.js (84): replace lines 16–17 (the `horizontal` helper and its comment) with the 3 lines in SPEC §5, VERBATIM. No other change.
- src/elevation/model/__tests__/drawingPayload.test.js (91): line 85 [36, 30, 17, 17] → [38, 30, 17, 17]
- NEW src/elevation/model/__tests__/calloutDimensions.test.js: VERBATIM from SPEC §5 (2 tests)

DO NOT open or change dimensions.js, drawingPayload.js, ClearanceCallouts.jsx, RunGroup.jsx or any canvas/component file. DO NOT grep the repo.

First add and change the tests and run `npx vitest run src/elevation/model/__tests__/calloutDimensions.test.js src/elevation/model/__tests__/elevationDimensions.test.js src/elevation/model/__tests__/drawingPayload.test.js`: the 2 new tests and the payload-count test must fail, and the 3 elevationDimensions tests must pass. Iterate on those files. At the end `npm test && npm run lint` once: 933 + 2 = 935, golden snapshot unchanged, lint 0 errors. Don't run `npm run build`.

At most three lines of summary. Commit "elevation-mvp: step 356 Casing clearances and pin callouts in the DXF".
```

---

## Step 357 — designer: centreline marks in the payload

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-43.3.md §1 and §6. Step 356 is in.
If `git status` shows uncommitted changes, stop and tell me.

New src/elevation/model/elevationMarks.js exports elevationMarks(room, wall, side, settings) → [{ kind: 'centerline', x, bottom, top, text: 'CL', textX, textZ }]. With view = resolveWall(room, wall, side), for each run in view.runs, centerlineMarkers(run, runScene(room, view, run, settings).result.pieces, view, view.length, settings) from ./dimensions.js, keeping anchor === 'center' and value ≤ EPSILON (1e-6). bottom = min(z, pieceBottom), top = max(datumZ ?? z, pieceTop), textX = x, textZ = top + (DIMENSION_TEXT_GAP + DIMENSION_TEXT_HEIGHT / 2) × plotScale(settings). Import the two constants from ./elevationDimensions.js and plotScale from ./drawingScale.js. Doc comment as SPEC §6. toDrawingPayload adds marks: elevationMarks(room, wall, side, settings) right after dimensions on each elevation; its doc comment's round list adds "43.3 its centreline marks".

Files (only these):
- NEW src/elevation/model/elevationMarks.js
- src/elevation/model/drawingPayload.js (58 lines): the import and the field
- src/elevation/model/__tests__/drawingPayload.test.js (91): import elevationMarks after the elevationDimensions import; `delete copy.marks;` after `delete copy.dimensions;` in withoutParts; append the SPEC §6 test inside the describe, VERBATIM. No other change.
- NEW src/elevation/model/__tests__/elevationMarks.test.js: VERBATIM from SPEC §6 (2 tests)

What you need without opening them: centerlineMarkers returns [{ pieceId, x, datumX, z, value, pieceBottom, pieceTop, from, anchor, datumZ? }]; runScene(room, wall, run, settings).result.pieces are the run's laid-out pieces.
DO NOT open or change elevationDimensions.js (beyond importing from it), dimensions.js or any canvas/component file. DO NOT grep the repo.

First add and change the tests and run `npx vitest run src/elevation/model/__tests__/elevationMarks.test.js src/elevation/model/__tests__/drawingPayload.test.js`: the 2 new marks tests and the new payload test must fail. Iterate on those two files. At the end `npm test && npm run lint` once: 935 + 3 = 938, golden snapshot unchanged, lint 0 errors. Don't run `npm run build`.

At most three lines of summary. Commit "elevation-mvp: step 357 Centreline marks in the payload".
```

---

## Running it (Kyle, after 357)

`npm run build` once in the designer. Then start the API and designer as in round 42, and run the end-to-end check at the end of the SPEC: *Export DXF* on G1 (A, then with the sink pinned 3" off), G2 (A) and G3 (A), then once at 1/4" = 1'-0".

If anything looks wrong, export the room, keep the zip (its `payload.json` shows what was sent), and bring it back. Running `git show --stat HEAD` after each step and passing it along helps me judge whether the prompt sent Codex exploring. After 353 and 356, send me `git show` too and I'll review the diff.
