# Round 44.1 — Codex Prompts, Steps 367–369 (solid walls, stacked parts, padding)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, **in the repo the step names**. The SPEC lives in the designer repo. From geometry it's `../cabinetry_designer/docs/elevation-mvp/SPEC-44.1.md`.

| Step | Repo | What | Tests after |
|---|---|---|---|
| 367 | cabinetry_designer_geometry | `top` on plan parts; higher parts cut lower lines; solid walls | 53 |
| 368 | cabinetry_designer_geometry | `frame_drawing`: extents, limits, view + 1/2" paper padding | 56 |
| 369 | cabinetry_designer | `planParts` sends `top`; no run part dashed | 951 |

The API doesn't change. Branches as before. 367 has to be in before you export with 369 in, because geometry rejects unknown fields.

---

## Before step 367 (Kyle)

```bash
cd cabinetry_designer
git status                                   # on feature/elevation-mvp; only the docs below changed
git add docs/elevation-mvp/SPEC-44.1.md docs/elevation-mvp/PROMPTS-44.1.md docs/DECISIONS.md
git commit -m "round 44.1 docs"
cd ../cabinetry_designer_geometry
git status                                   # clean on feature/drawing
.venv/bin/python -m pytest                   # 52 passed
```

---

## Step 367 — geometry: tops and solid walls

Run in **cabinetry_designer_geometry**.

```
Repo: cabinetry_designer_geometry, branch feature/drawing. SPEC: ../cabinetry_designer/docs/elevation-mvp/SPEC-44.1.md §1 and §2. Step 363 is in.
If `git status` shows uncommitted changes, stop and tell me.

Plan walls fill solid, and a plan part can say how high its top is so higher parts cut the lines of lower ones.
1. src/drawing/models.py: PayloadPlanPart gets, after dashed, `top: float | None = None` with the one-line comment from SPEC §2.
2. src/drawing/elevation_dxf.py: _add_hatch(modelspace, layer, region, solid: bool = False). When solid, hatch.set_solid_fill(color=256) (BYLAYER) instead of the ANSI31 pattern; docstring says ANSI31, or solid when asked (SPEC-44.1). Its existing calls don't change.
3. src/drawing/plan_dxf.py: _add_hatch(modelspace, "SECTIONS", region, solid=True). Then the parts whose kind isn't wall/void and whose top is not None: hidden_line_removal([HlrShape(id=str(index), polygon=Polygon(part.points), front=part.top, drop_hidden=True) for index, part in enumerate(those)]), and for each part write_lines_to_layer(doc, PLAN_LAYERS[part.kind], result[str(index)][0]). The existing polyline loop also skips parts with a top. Parts without a top draw exactly as now.

Files (only these):
- src/drawing/models.py (145 lines)
- src/drawing/elevation_dxf.py (158)
- src/drawing/plan_dxf.py (79)
- tests/test_plan.py (99): lines 67–69, the hatch assertion, replaced with the 4 lines in SPEC §2. No other change.
- NEW tests/test_plan_stacked.py: VERBATIM from SPEC §2 (1 test)

What you need without opening it: src/projection/hlr.py's HlrShape(id, polygon, front, ..., drop_hidden=False, ...) and hidden_line_removal(shapes) → {id: (visible_lines, hidden_lines)}; a shape with a higher `front` hides the edges of lower ones it covers; drop_hidden=True leaves hidden edges out. write_lines_to_layer(doc, layer, lines) is in src/dxf/writer.py.
DO NOT change hlr.py, writer.py, bundle.py, dimensions.py, the fixtures or any other test. No new dependencies.

First change the tests and run `.venv/bin/python -m pytest tests/test_plan.py tests/test_plan_stacked.py`: the new test and the wall test must fail. Iterate on those files. At the end `.venv/bin/python -m pytest` once: 52 + 1 = 53 passed.

At most three lines of summary. Commit "round 44.1: step 367 Solid walls, higher plan parts cut lower lines".
```

---

## Step 368 — geometry: room around every drawing

Run in **cabinetry_designer_geometry**.

```
Repo: cabinetry_designer_geometry, branch feature/drawing. SPEC: ../cabinetry_designer/docs/elevation-mvp/SPEC-44.1.md §1 and §3. Step 367 is in.
If `git status` shows uncommitted changes, stop and tell me.

Every DXF's extents, limits and opening view cover everything drawn plus 1/2" of paper. In src/dxf/writer.py: `from ezdxf import bbox`; DRAWING_PADDING = 0.5 with the comment from SPEC §3; frame_drawing(doc, plot_scale) -> None with the docstring from SPEC §3: extents = bbox.extents(doc.modelspace()); return if not extents.has_data; pad = DRAWING_PADDING * plot_scale on every side; set doc.modelspace().dxf.extmin = (x0, y0, 0), .extmax = (x1, y1, 0), .limmin = (x0, y0), .limmax = (x1, y1) (with a comment: ezdxf copies these into $EXTMIN/$EXTMAX/$LIMMIN/$LIMMAX when it writes; setting the header directly gets overwritten); then doc.set_modelspace_vport(height=y1 - y0, center=((x0 + x1) / 2, (y0 + y1) / 2)). build_elevation_dxf and build_plan_dxf call frame_drawing(doc, plot_scale) right before `return doc_to_bytes(doc)`.

Files (only these):
- src/dxf/writer.py (149 lines)
- src/drawing/elevation_dxf.py (~163): the import and the one call
- src/drawing/plan_dxf.py (~88): the import and the one call
- NEW tests/test_drawing_frame.py: VERBATIM from SPEC §3 (1 test, 3 cases)

DO NOT change models.py, bundle.py, hlr.py, the fixtures or any other test. No new dependencies.

First add the test and run `.venv/bin/python -m pytest tests/test_drawing_frame.py`: all 3 cases must fail. Iterate on that file. At the end `.venv/bin/python -m pytest` once: 53 + 3 = 56 passed.

At most three lines of summary. Commit "round 44.1: step 368 Room around every drawing".
```

---

## Step 369 — designer: tops on plan parts

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-44.1.md §1 and §4. Step 366 is in.
If `git status` shows uncommitted changes, stop and tell me.

planParts tells geometry how high each run part and wall end panel is, and stops dashing uppers. In src/elevation/model/planParts.js:
- Wall end panels get `top: panel.top` after points.
- Per run, after planRunPieces: tops = new Map over [...layout.pieces, ...cellPieces(run, layout).pieces] of piece.id → piece.z + piece.height (cellPieces from './cells.js'); topOf(key) = tops.get(key) ?? tops.get(key.split(':')[0]) ?? run.z + run.height. Every run part gets `top: topOf(range.key)` after runId, and no `dashed`. A box is still 'shelf' when box.dashed, else 'cabinet'.
- Remove the CABINET_TYPE_IDS import (now unused). Nothing else changes: walls, voids, openings, casings, recesses, soffits keep their shape; soffits and raised recesses keep dashed.
- Add to the doc comment: each part from a run and each wall end panel carries its top, so geometry cuts the lines of what's under it (SPEC-44.1).

Files (only these):
- src/elevation/model/planParts.js (129 lines)
- src/elevation/model/__tests__/planParts.test.js (104): replace the WHOLE file with the SPEC §4 file, VERBATIM (7 tests)

What you need without opening it: cellPieces(run, layout) returns { pieces, ... }, each piece { id, kind, x, z, width, height, ... } in wall coordinates.
DO NOT change planPieces.js, cells.js, drawingPayload.js, any canvas/component file or any other test. DO NOT grep the repo.

First replace the test file and run `npx vitest run src/elevation/model/__tests__/planParts.test.js`: the 3 wall tests' first one and the 4 run tests must fail; the G5 and G3 tests pass. Iterate on that file. At the end `npm test && npm run lint && npm run build` once: 950 + 1 = 951, golden snapshot unchanged, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 369 Tops on plan parts".
```

---

## Running it (Kyle, after 369)

Start the API and designer as in round 42, geometry with 367–368 in. Run the SPEC's end-to-end check: *Export DXF* on G1, G3 and G4, open `plan.dxf` and `elevation-A.dxf`.

If the green border in your viewer still cuts through dimensions, tell me which viewer it is (a screenshot helps): it may be drawing something other than the extents or limits. Send `git show` after 367 and I'll review the diff.
