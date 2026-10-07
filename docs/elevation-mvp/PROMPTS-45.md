# Round 45 — Codex Prompts, Steps 371–373 (wall dimensions in the plan DXF)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, **in the repo the step names**. The SPEC lives in the designer repo. From geometry it's `../cabinetry_designer/docs/elevation-mvp/SPEC-45.md`.

| Step | Repo | What | Tests after |
|---|---|---|---|
| 371 | cabinetry_designer_geometry | `PayloadPlanDimension`, aligned dimensions in `plan.dxf` | 60 |
| 372 | cabinetry_designer | `planDimensions`: wall lengths and face rows | 957 |
| 373 | cabinetry_designer | `plan.dimensions` on the payload | 958 |

The API doesn't change. Branches as before. 371 has to be in before you export with 373 in, because geometry rejects unknown fields.

Rounds 45.1 (markers and labels) and 45.2 (depths and clearances) follow; their SPECs and prompts are written too.

---

## Before step 371 (Kyle)

```bash
cd cabinetry_designer
git status                                   # on feature/elevation-mvp; only the docs below changed
git add docs/elevation-mvp/SPEC-45*.md docs/elevation-mvp/PROMPTS-45*.md docs/DECISIONS.md
git commit -m "round 45 docs"
cd ../cabinetry_designer_geometry
git status                                   # clean on feature/drawing
.venv/bin/python -m pytest                   # 56 passed
```

---

## Step 371 — geometry: aligned dimensions in plan

Run in **cabinetry_designer_geometry**.

```
Repo: cabinetry_designer_geometry, branch feature/drawing. SPEC: ../cabinetry_designer/docs/elevation-mvp/SPEC-45.md §1 and §2. Step 368 is in.
If `git status` shows uncommitted changes, stop and tell me.

plan.dxf draws the plan dimensions the designer sends, as aligned DIMENSION entities.
1. src/drawing/models.py: PayloadPlanDimension (extra="forbid", above PayloadPlan) with the docstring and fields in SPEC §2: row: str (min_length=1), kind: str (min_length=1), start: tuple[float, float], end: tuple[float, float], offset: float, text: str (min_length=1), textAt: tuple[float, float] | None = None (with its comment). PayloadPlan gets, after parts, `dimensions: list[PayloadPlanDimension] = []` with its comment.
2. src/drawing/dimensions.py: add_plan_dimensions(modelspace, dimensions) -> None after add_dimensions, docstring from SPEC §2. Per record: skip when start and end are within EPSILON; override = modelspace.add_aligned_dim(p1=start, p2=end, distance=offset, dimstyle=DIMSTYLE, text=text, override={"dimse1": on_line, "dimse2": on_line}, dxfattribs={"layer": "DIMENSIONS"}) where on_line = 1 if abs(offset) <= EPSILON else 0; if textAt: override.set_location(textAt, leader=False, relative=False); override.render(); override.dimension.dxf.text = "<>".
3. src/drawing/plan_dxf.py: add_dimstyle(doc, plot_scale) right after create_dxf_document(). New dimension_points(dimensions) -> list (docstring in SPEC §2): per record with a length over EPSILON, start, end, start and end each moved by offset along start→end's left normal (-dy, dx)/length, and textAt when set. After the parts are drawn: add_plan_dimensions(modelspace, plan.dimensions). The title's `low` = lowest y over the part points AND dimension_points(plan.dimensions); `left` stays the parts' lowest x.

Files (only these):
- src/drawing/models.py (147 lines)
- src/drawing/dimensions.py (48)
- src/drawing/plan_dxf.py (89)
- NEW tests/test_plan_dimensions.py: VERBATIM from SPEC §2 (4 tests)

What you need without opening it: add_dimstyle(doc, plot_scale) and DIMSTYLE are in src/dxf/writer.py; EPSILON is in src/projection/hlr.py (dimensions.py already imports it). ezdxf's add_aligned_dim puts the dimension line `distance` to the left of p1→p2 and stores it as a linear dimension at that angle.
DO NOT change elevation_dxf.py, add_dimensions, writer.py, bundle.py, marks.py, hlr.py, the fixtures or any other test. No new dependencies.

First add the test and run `.venv/bin/python -m pytest tests/test_plan_dimensions.py`: the first three tests must fail (the rejection test passes either way). Iterate on that file. At the end `.venv/bin/python -m pytest` once: 56 + 4 = 60 passed.

At most three lines of summary. Commit "round 45: step 371 Plan dimensions".
```

---

## Step 372 — designer: `planDimensions`

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-45.md §1 and §3. Step 370 is in.
If `git status` shows uncommitted changes, stop and tell me.

A new module that dimensions each wall in plan for the DXF; nothing calls it yet.
1. src/elevation/model/elevationDimensions.js line 45: `function placeLabels(` → `export function placeLabels(`. Nothing else in that file.
2. NEW src/elevation/model/planDimensions.js, exactly the contract in SPEC §3:
   - export PLAN_MARKER_RADIUS = 0.25, PLAN_MARKER_FLAG = 0.1875, PLAN_MARKER_CLEARANCE = 6 (with the one comment in SPEC §3).
   - private bumpOut(wall, side), deepestRun(wall, side, settings), markerReach(room, wall, side, settings, letters), rowRecords(row, segments, base, outward, at, scale) → { records, levels, step }, as SPEC §3 spells them out (`up(point) = [point.x + 0, 0 - point.y]`; readable start/end order; `sign` from the left normal; offset `sign * at + 0`; placeLabels(segments, at, +1, scale, sign > 0); textAt for moved labels).
   - export planDimensions(room, settings): per wall in room.walls order (skip length ≤ 1e-6): exterior rows 'front' (wallFaceSegments front) then 'wall' (one segment 0 → frame.length, kind 'wall') on the `front` base line; then the 'back' row (wallFaceSegments back) on the room side on `backBase`. Each side starts at = DIMENSION_ROW_SPACING * plotScale(settings); after each non-empty row at += spacing + levels * step.
   - Doc comment from SPEC §3.

Files (only these):
- src/elevation/model/elevationDimensions.js (202 lines): line 45 only
- NEW src/elevation/model/planDimensions.js
- NEW src/elevation/model/__tests__/planDimensions.test.js: VERBATIM from SPEC §3 (5 tests)

What you need without opening them:
- wallFrame(room, wall) → { length, n, r, d, leftPoint, ... } in canvas plan coordinates (y down); n points to the room (front face). wallSideFrame(room, wall, 'back') is the back face's frame (its leftPoint on the back face, its r reversed).
- wallFaceSegments(room, wall, side, settings) → [{ start, end, kind }] along that face, or [].
- frontDepth(run, settings) (corners.js): a run's front from its face. recessesOn(wall, side) (recesses.js). elevationLetters(room) → Map; elevationKey(wallId, side) (topology.js). wallSideOf(run) (wallSides.js). plotScale(settings) (drawingScale.js).
- placeLabels(segments, at, outward, scale, textOutward) → { placed: [{ segment, text, along?, across? }], levels, step }; DIMENSION_ROW_SPACING = 0.375.
DO NOT change wallFaceRow.js, PlanWallShape.jsx or any plan/ component, drawingPayload.js, index.js or any existing test. DO NOT grep the repo.

First add the test and run `npx vitest run src/elevation/model/__tests__/planDimensions.test.js`: all 5 must fail. Iterate on that file. At the end `npm test && npm run lint && npm run build` once: 952 + 5 = 957, golden snapshot unchanged, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 372 Plan dimensions: wall rows".
```

---

## Step 373 — designer: the dimensions on the payload

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-45.md §4. Step 372 is in.
If `git status` shows uncommitted changes, stop and tell me.

The drawing payload carries the plan dimensions.
1. src/elevation/model/drawingPayload.js: `import { planDimensions } from './planDimensions.js';` after the planParts import. `plan` becomes `{ parts: planParts(room, settings), dimensions: planDimensions(room, settings) }`. The doc comment's round list ends "…round 44 the room in plan; round 45 its dimensions."
2. src/elevation/model/__tests__/drawingPayload.test.js: `import { planDimensions } from '../planDimensions.js';` after the planParts import; in the SPEC-44 test `toEqual(['parts'])` → `toEqual(['parts', 'dimensions'])`; append the SPEC-45 test from SPEC §4 VERBATIM inside the describe, after the SPEC-44 test.

Files (only these):
- src/elevation/model/drawingPayload.js (63 lines)
- src/elevation/model/__tests__/drawingPayload.test.js (113)

DO NOT change ExportDxfButton.jsx, planDimensions.js, planParts.js or the API. DO NOT grep the repo.

Run `npx vitest run src/elevation/model/__tests__/drawingPayload.test.js` while iterating. At the end `npm test && npm run lint && npm run build` once: 957 + 1 = 958, golden snapshot unchanged, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 373 The plan dimensions on the payload".
```

---

## Running it (Kyle, after 373)

Start the API and designer as in round 42, geometry with 371 in. Run the SPEC's end-to-end check: *Export DXF* on G1, G2 and G5 and open `plan.dxf`. Send `git show` after 371 and 372 and I'll review the diffs.
