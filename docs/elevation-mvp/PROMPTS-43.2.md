# Round 43.2 — Codex Prompts, Steps 351–352 (vertical dimensions and counter height)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, **in the repo the step names**. The SPEC lives in the designer repo. From geometry it's `../cabinetry_designer/docs/elevation-mvp/SPEC-43.2.md`.

| Step | Repo | What | Tests after |
|---|---|---|---|
| 351 | cabinetry_designer_geometry | `orientation` on a dimension; vertical dimensions; title ignores them | 44 |
| 352 | cabinetry_designer | `elevationDimensions` adds both edges' vertical columns | 931 |

The API doesn't change. Branches as before: the designer on `feature/elevation-mvp`, geometry on `feature/drawing`. 351 has to be in before you export with 352 in, because geometry rejects unknown fields.

This is the first round written under rule 10 (contract, not code): the SPEC gives rules, contracts and tests, and Codex writes the implementation. The SPEC's test values were checked against a throwaway build. If a test fails, fix the code, not the number, unless the number contradicts a SPEC rule. In that case, stop and say so.

---

## Before step 351 (Kyle)

```bash
cd cabinetry_designer
git status                                   # on feature/elevation-mvp; only the three docs below changed
git add docs/elevation-mvp/SPEC-43.2.md docs/elevation-mvp/PROMPTS-43.2.md docs/DECISIONS.md
git commit -m "round 43.2 docs"
```

Geometry: `git status` clean on `feature/drawing`, and `.venv/bin/python -m pytest` → 42 passed.

---

## Step 351 — geometry: vertical dimensions

Run in **cabinetry_designer_geometry**.

```
Repo: cabinetry_designer_geometry, branch feature/drawing. SPEC: ../cabinetry_designer/docs/elevation-mvp/SPEC-43.2.md §1 and §2. Step 349 is in.
If `git status` shows uncommitted changes, stop and tell me.

A dimension record can be vertical. PayloadDimension gets orientation: Literal["horizontal", "vertical"] = "horizontal" (after row; Literal is already imported). For a vertical record, add_dimensions swaps each point's coordinates and passes angle=90 to add_linear_dim: base=(at, start), p1=(base, start), p2=(base, end). Horizontal records are drawn exactly as now. set_location for moved text doesn't change (textX/textZ are drawing coordinates either way). The title's `low` in elevation_dxf.py takes `at` and `textZ` from horizontal records only.

Files (only these):
- src/drawing/models.py (100 lines): the orientation field with its one-line comment, as SPEC §2
- src/drawing/dimensions.py (28): choose the points by orientation at one add_linear_dim call site (no duplicated loop); docstring says horizontal or vertical (SPEC-43.2)
- src/drawing/elevation_dxf.py (155): the `low = min([...])` list filters to orientation == "horizontal"; its comment cites SPEC-43, 43.1, 43.2
- tests/test_elevation_dimensions.py (125): append the SPEC §2 block at the end, VERBATIM (VERTICAL plus 2 tests)

bundle.py already writes payload.json with exclude_defaults=True, so a horizontal record without orientation still round-trips. DO NOT change writer.py, bundle.py, the fixtures or any other test. No new dependencies.

First append the tests and run `.venv/bin/python -m pytest tests/test_elevation_dimensions.py`: the 2 new ones must fail. Iterate on that file. At the end `.venv/bin/python -m pytest` once: 42 + 2 = 44 passed.

At most three lines of summary. Commit "round 43.2: step 351 Vertical dimensions".
```

---

## Step 352 — designer: both edges' vertical columns

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-43.2.md §1 and §3. Step 350 is in.
If `git status` shows uncommitted changes, stop and tell me.

elevationDimensions(room, wall, side, settings) keeps returning the horizontal records exactly as now, then adds vertical records: the left edge, then the right, each in column order inner, middle, outer, bottom to top. Each edge's chain is verticalChains(room, view, pickColumnRuns(view, null, edge), settings, edge) from ./dimensions.js (both exported; `view` is the resolveWall result the function already has), which returns { inner, middle, outer } lists of { start, end, kind }. Record: { row: `${edge}.${column}`, orientation: 'vertical', kind, start, end, base, at, text, textX?, textZ? }. base = extent.left / extent.right, outward = -1 left / +1 right, the first column's at = base + outward × spacing, the next = at + outward × (spacing + levels × step), the same spacing and levels as the rows. Skip an inner or middle column that is a single segment with the same start and end as the outer column's single segment.

Moved text: generalize placeLabels, don't copy it. Today the on-line text's side comes from `outward > 0`. Make it an input that defaults to that (horizontal callers unchanged): true on the left edge, false on the right. ezdxf puts vertical text on the line's -x side. Have it report the label's position along and across the line. The caller maps: horizontal textX = along and textZ = across; vertical textX = across and textZ = along. Update the function's doc comment (vertical columns, orientation, the skip rule).

Files (only these):
- src/elevation/model/elevationDimensions.js (113 lines): as above
- src/elevation/model/__tests__/elevationDimensions.test.js (81): add the `horizontal` helper after the `row` helper (line 14) and wrap the three elevationDimensions(...) calls on lines 19, 49 and 65 in it, exactly as SPEC §3 says. No other change.
- src/elevation/model/__tests__/drawingPayload.test.js (91): line 85 [24, 14, 9, 9] → [36, 30, 17, 17]
- NEW src/elevation/model/__tests__/verticalDimensions.test.js: VERBATIM from SPEC §3 (4 tests)

What you need without opening them: formatInches(n) gives e.g. '30 1/2"'. wallExtent(room, view, settings) returns { left, right, top, bottom }. verticalChains and pickColumnRuns are unchanged and already used by the canvas the same way.
DO NOT open or change dimensions.js, drawingPayload.js, wallExtent.js or any canvas/component file. DO NOT grep the repo.

First add and change the tests and run `npx vitest run src/elevation/model/__tests__/verticalDimensions.test.js src/elevation/model/__tests__/elevationDimensions.test.js src/elevation/model/__tests__/drawingPayload.test.js`: the 4 new tests and the payload-count test must fail, and the 3 existing elevationDimensions tests must pass. Iterate on those three files. At the end `npm test && npm run lint` once: 927 + 4 = 931, golden snapshot unchanged, lint 0 errors. Don't run `npm run build`.

At most three lines of summary. Commit "elevation-mvp: step 352 Vertical dimensions at both wall edges".
```

---

## Running it (Kyle, after 352)

`npm run build` once in the designer. Then start the API and designer as in round 42, and run the end-to-end check at the end of the SPEC: *Export DXF* on G1 (A and C) and G2 (A), then once at 1/4" = 1'-0".

If anything looks wrong, export the room, keep the zip (its `payload.json` shows what was sent), and bring it back. Running `git show --stat HEAD` after each step and passing it along helps me judge whether the prompt sent Codex exploring.
