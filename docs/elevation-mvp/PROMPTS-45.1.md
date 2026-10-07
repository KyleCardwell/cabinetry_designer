# Round 45.1 — Codex Prompts, Steps 374–376 (elevation markers and labels in the plan DXF)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, **in the repo the step names**. The SPEC lives in the designer repo. From geometry it's `../cabinetry_designer/docs/elevation-mvp/SPEC-45.1.md`.

| Step | Repo | What | Tests after |
|---|---|---|---|
| 374 | cabinetry_designer_geometry | `PayloadPlanMark`; markers and labels in `plan.dxf`; MARKERS layer | 63 |
| 375 | cabinetry_designer | `planMarks` | 962 |
| 376 | cabinetry_designer | `plan.marks` on the payload | 963 |

The API doesn't change. 374 has to be in before you export with 376 in. Round 45 (371–373) first.

---

## Before step 374 (Kyle)

```bash
cd cabinetry_designer_geometry
git status                                   # clean on feature/drawing, 371 in
.venv/bin/python -m pytest                   # 60 passed
```

---

## Step 374 — geometry: markers and labels

Run in **cabinetry_designer_geometry**.

```
Repo: cabinetry_designer_geometry, branch feature/drawing. SPEC: ../cabinetry_designer/docs/elevation-mvp/SPEC-45.1.md §1 and §2. Step 371 is in.
If `git status` shows uncommitted changes, stop and tell me.

plan.dxf draws elevation markers (circle, filled flag, letter) and text labels the designer places.
1. src/drawing/models.py: PayloadPlanMark (extra="forbid", above PayloadPlan), docstring and fields from SPEC §2: kind: Literal["elevation", "label"], at: tuple[float, float], text: str (min_length=1), direction: tuple[float, float] | None = None, rotation: float = 0 (each with its comment). PayloadPlan gets, after dimensions, `marks: list[PayloadPlanMark] = []` with its comment.
2. NEW src/drawing/plan_marks.py (module docstring from SPEC §2): MARKER_RADIUS = 0.25, MARKER_FLAG = 0.1875, MARKER_TEXT = 0.125 with their comment; mark_points(marks, plot_scale) -> list; add_plan_marks(modelspace, marks, plot_scale) -> None exactly as SPEC §1/§2: elevation → CIRCLE on MARKERS (radius MARKER_RADIUS * plot_scale), the flag triangle [(base.x - dy*half, base.y + dx*half), at + direction*(radius + flag), (base.x + dy*half, base.y - dx*half)] with base = at + direction*radius, half = 0.6*radius, direction default (0, 1), as a closed LWPOLYLINE plus a HATCH with set_solid_fill(color=256) and that path (both MARKERS), letter TEXT height MARKER_TEXT*plot_scale; label → TEXT height DIMSTYLE_PAPER["dimtxt"]*plot_scale, rotation mark.rotation. All text: modelspace.add_text(text, height=..., rotation=..., dxfattribs={"layer": "TEXT", "style": TEXT_STYLE}).set_placement(at, align=TextEntityAlignment.MIDDLE_CENTER).
3. src/drawing/plan_dxf.py: add_plan_marks(modelspace, plan.marks, plot_scale) right after add_plan_dimensions; the title's `low` also takes in mark_points(plan.marks, plot_scale).
4. src/dxf/writer.py: LAYER_DEFS gets, after TEXT, `"MARKERS": (7, "CONTINUOUS", 25),` with the comment "Elevation markers in plan (SPEC-45.1)."

Files (only these):
- src/drawing/models.py (165 lines)
- NEW src/drawing/plan_marks.py
- src/drawing/plan_dxf.py (109)
- src/dxf/writer.py (169): one layer line + comment
- tests/test_drawing_style.py (48): line 39 becomes `        "HIDDEN": 18, "DIMENSIONS": 18, "CENTERLINES": 18, "TEXT": 18, "MARKERS": 25,`
- NEW tests/test_plan_marks.py: VERBATIM from SPEC §2 (3 tests)

What you need without opening it: src/drawing/marks.py shows the add_text/set_placement pattern; DIMSTYLE_PAPER and TEXT_STYLE are in src/dxf/writer.py.
DO NOT change marks.py, dimensions.py, elevation_dxf.py, bundle.py, the fixtures or any other test. No new dependencies.

First change the tests and run `.venv/bin/python -m pytest tests/test_plan_marks.py tests/test_drawing_style.py`: the two drawing tests in test_plan_marks.py and the layer test must fail. Iterate on those files. At the end `.venv/bin/python -m pytest` once: 60 + 3 = 63 passed.

At most three lines of summary. Commit "round 45.1: step 374 Plan markers and labels".
```

---

## Step 375 — designer: `planMarks`

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-45.1.md §1 and §3. Step 373 is in.
If `git status` shows uncommitted changes, stop and tell me.

A new module placing elevation markers and door/window/recess labels for the plan DXF; nothing calls it yet.
NEW src/elevation/model/planMarks.js, exactly the contract in SPEC §3:
- export PLAN_MARKER_SHIFT = 0.5.
- export planMarks(room, settings): first every elevation marker (walls in room.walls order, WALL_SIDES order, only faces with a letter), then per wall its openings' labels, then its recesses' labels (WALL_SIDES order). Positions, text and rotation as SPEC §3; everything through up(point) = [point.x + 0, 0 - point.y].
- private readable(r) as SPEC §3.
- Doc comment from SPEC §3.

Files (only these):
- NEW src/elevation/model/planMarks.js
- NEW src/elevation/model/__tests__/planMarks.test.js: VERBATIM from SPEC §3 (4 tests)

What you need without opening them:
- PLAN_MARKER_RADIUS, PLAN_MARKER_FLAG, PLAN_MARKER_CLEARANCE are exported by ./planDimensions.js. DIMENSION_TEXT_GAP (0.0625) and DIMENSION_TEXT_HEIGHT (0.09375) by ./elevationDimensions.js.
- wallSideFrame(room, wall, side) → { length, n, r, leftPoint, ... } (canvas plan coordinates, y down; n points away from that face). wallFrame(room, wall).d is the wall's drawn direction. elevationToPlan(frame, u, v) = leftPoint + r*u + n*v (geometry.js).
- openingGeometry(opening, length, settings) → { jamb: { x, width, ... }, casing } (openings.js). openingPlanDepths(wall, opening) → { face, back } (recesses.js; back is negative, behind the face). recessGeometry(recess, length, height) → { x, width, depth, ... }; recessesOn(wall, side) (recesses.js).
- elevationLetters(room) → Map key → letter; elevationKey(wallId, side) (topology.js). frontDepth(run, settings) (corners.js). formatInches (units.js). WALL_SIDES, wallSideOf (wallSides.js). plotScale (drawingScale.js).
DO NOT change plan/elevationMarkers.js, PlanElevationMarker.jsx, PlanOpening.jsx, PlanRecess.jsx, planDimensions.js, drawingPayload.js, index.js or any existing test. DO NOT grep the repo.

First add the test and run `npx vitest run src/elevation/model/__tests__/planMarks.test.js`: all 4 must fail. Iterate on that file. At the end `npm test && npm run lint && npm run build` once: 958 + 4 = 962, golden snapshot unchanged, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 375 Plan markers and labels".
```

---

## Step 376 — designer: the marks on the payload

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-45.1.md §4. Step 375 is in.
If `git status` shows uncommitted changes, stop and tell me.

The drawing payload carries the plan markers and labels.
1. src/elevation/model/drawingPayload.js: `import { planMarks } from './planMarks.js';` after the planDimensions import. `plan` becomes { parts, dimensions, marks: planMarks(room, settings) }, one key per line, in that order. The doc comment's round list ends "…round 45 its dimensions; 45.1 its markers and labels."
2. src/elevation/model/__tests__/drawingPayload.test.js: `import { planMarks } from '../planMarks.js';` after the planDimensions import; in the SPEC-44 test `['parts', 'dimensions']` → `['parts', 'dimensions', 'marks']`; append the SPEC-45.1 test from SPEC §4 VERBATIM inside the describe, after the SPEC-45 test.

Files (only these):
- src/elevation/model/drawingPayload.js (64 lines)
- src/elevation/model/__tests__/drawingPayload.test.js (121)

DO NOT change ExportDxfButton.jsx, planMarks.js or the API. DO NOT grep the repo.

Run `npx vitest run src/elevation/model/__tests__/drawingPayload.test.js` while iterating. At the end `npm test && npm run lint && npm run build` once: 962 + 1 = 963, golden snapshot unchanged, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 376 The plan marks on the payload".
```

---

## Running it (Kyle, after 376)

Geometry with 374 in, the designer built after 376. Run the SPEC's end-to-end check on G1, G2 and G5, and once at 1/4" = 1'-0". Send `git show` after 374 and 375 and I'll review the diffs.
