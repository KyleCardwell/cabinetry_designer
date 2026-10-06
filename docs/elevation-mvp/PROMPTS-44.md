# Round 44 — Codex Prompts, Steps 362–366 (captured pair doors, plan DXF)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, **in the repo the step names**. The SPEC lives in the designer repo. From geometry it's `../cabinetry_designer/docs/elevation-mvp/SPEC-44.md`.

| Step | Repo | What | Tests after |
|---|---|---|---|
| 362 | cabinetry_designer | `capturedFaces`; mixed captured cabinet: 3/32" sides, 1/16" pair gap | 943 |
| 363 | cabinetry_designer_geometry | `PayloadPlan`, `build_plan_dxf`, `plan.dxf` in the zip | 52 |
| 364 | cabinetry_designer | `planParts`: walls, openings, recesses, soffits, wall end panels | 946 |
| 365 | cabinetry_designer | `planParts`: every run's pieces | 949 |
| 366 | cabinetry_designer | `plan` on the payload | 950 |

The API doesn't change. Branches as before: the designer on `feature/elevation-mvp`, geometry on `feature/drawing`. 363 has to be in before you export with 366 in, because geometry rejects unknown fields.

---

## Before step 362 (Kyle)

```bash
cd cabinetry_designer
git status                                   # on feature/elevation-mvp; only the docs below changed
npm test                                     # 941 passed
git add docs/elevation-mvp/SPEC-44.md docs/elevation-mvp/PROMPTS-44.md docs/DECISIONS.md docs/rules/shop-rules.yaml
git commit -m "round 44 docs"
```

```bash
cd ../cabinetry_designer_geometry
git status                                   # clean on feature/drawing
.venv/bin/python -m pytest                   # 48 passed
```

---

## Step 362 — designer: captured pair doors keep their size

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-44.md §1 (Captured pair doors) and §2. Step 361 is in.
If `git status` shows uncommitted changes, stop and tell me.

A Euro cabinet captured both sides whose faces are one column with a pair door AND single-wide faces gets the captured-single side reveals, and its pair doors keep their size by closing the gap between them.

In src/elevation/model/styles.js:
1. Export capturedFaces(face) → 'single' | 'mixed' | null, just above cabinetReveals, with a doc comment (how a captured Euro cabinet's faces read, SPEC-44). Collect the column's leaves: a leaf (node.type) is itself; a group with direction 'vertical' is its children's leaves; any other group (horizontal) makes the answer null. No pair_door leaf → 'single'; some pair_door leaves and some other leaves → 'mixed'; only pair_door leaves → null.
2. In cabinetReveals, the condition `euro && captured.left && captured.right && isSingleColumn(face)` becomes euro, captured both sides and capturedFaces(face) not null. When it is 'mixed', BEFORE the two apply calls, lower values.pair by (reveal − values.left) + (reveal − values.right). Then apply left and right exactly as now. Nothing else in the function changes or moves.

Files (only these):
- src/elevation/model/styles.js (300 lines): the export and the rule
- NEW src/elevation/model/__tests__/capturedFaces.test.js: VERBATIM from SPEC §2 (2 tests)

What you need without opening them: resolveFaces in faces.js already places a pair_door as two halves (width − reveals.pair) / 2 apart by reveals.pair; runFaceLayouts in faceLayouts.js passes cabinetReveals' values straight to it.
DO NOT remove or change isSingleColumn (index.js and styles.test.js use it). DO NOT change faces.js, faceLayouts.js, index.js, styles.test.js, any canvas/component file or any other test. DO NOT grep the repo.

First add the test and run `npx vitest run src/elevation/model/__tests__/capturedFaces.test.js`: both must fail. Iterate on that file. At the end `npm test && npm run lint` once: 941 + 2 = 943, golden snapshot unchanged, lint 0 errors. Don't run `npm run build`.

At most three lines of summary. Commit "elevation-mvp: step 362 Captured pair doors keep their size".
```

---

## Step 363 — geometry: the plan DXF

Run in **cabinetry_designer_geometry**.

```
Repo: cabinetry_designer_geometry, branch feature/drawing. SPEC: ../cabinetry_designer/docs/elevation-mvp/SPEC-44.md §1 (The plan DXF) and §3. Step 354 is in.
If `git status` shows uncommitted changes, stop and tell me.

A payload can carry the room in plan; geometry draws it as plan.dxf.

1. src/drawing/models.py: above DrawingPayload, PayloadPlanPart (extra="forbid", docstring "One outline in plan (SPEC-44), in plan inches with y up. Walls are joined and voids cut out of them."): id: str (min_length=1); kind: Literal["wall", "void", "opening", "casing", "recess", "soffit", "cabinet", "face", "filler", "end_panel", "panel", "frame", "shelf", "wall_end_panel"]; runId: str | None = None; points: list[tuple[float, float]] = Field(min_length=2); closed: bool = True; dashed: bool = False. Then PayloadPlan (extra="forbid"): parts: list[PayloadPlanPart] = []. DrawingPayload gets, last, plan: PayloadPlan | None = None with the comment "The room in plan (SPEC-44). None draws no plan.dxf, so a payload without it round-trips."
2. NEW src/drawing/plan_dxf.py (docstring "Render a room's plan as a DXF (SPEC-44)."):
   - PLAN_LAYERS: opening, casing → OPENINGS; recess, soffit → WALLS; cabinet → CABINETS; face → FACES; filler → FILLERS; end_panel, panel, wall_end_panel → PANELS; frame → FRAMES; shelf → SHELVES.
   - SNAP = 1e-3 with a comment (walls joined 0.001" fat so mitre points that differ by noise still meet).
   - wall_region(plan): Polygon of each "wall" part's points, each .buffer(SNAP, join_style="mitre"), unary_union, .buffer(-SNAP, join_style="mitre"), then .difference(unary_union of the "void" parts' Polygons) when there are any.
   - build_plan_dxf(plan, room, plot_scale=DEFAULT_PLOT_SCALE) -> bytes: create_dxf_document(); doc.header["$LTSCALE"] = plot_scale / 2. For each polygon in _polygons(region): its exterior and each interior ring as add_lwpolyline(list(ring.coords)[:-1], close=True) on WALLS. Then _add_hatch(modelspace, "SECTIONS", region). Import _polygons and _add_hatch from .elevation_dxf; don't move them. Then every part whose kind isn't wall/void, in payload order: add_lwpolyline(part.points, close=part.closed, dxfattribs={"layer": PLAN_LAYERS[part.kind]}) plus "linetype": "DASHED" when part.dashed. Then, if any part has points: TEXT on layer TEXT, style TEXT_STYLE: "PLAN" height 4 at (min x, min y − 12) and room.name height 3 at (min x, min y − 18), min over every point of every part. Return doc_to_bytes(doc).
3. src/drawing/bundle.py: when model.plan is not None, ("plan.dxf", build_plan_dxf(model.plan, model.room, plot_scale)) goes first, before the elevations, in the list that fills the zip and `files`.

Files (only these):
- src/drawing/models.py (121 lines)
- NEW src/drawing/plan_dxf.py
- src/drawing/bundle.py (30)
- NEW tests/test_plan.py: VERBATIM from SPEC §3 (4 tests)

bundle.py already writes payload.json with exclude_defaults=True, so the plan round-trips (the designer sends closed only when false, dashed only when true).
DO NOT change elevation_dxf.py, dimensions.py, marks.py, writer.py, hlr.py, the fixtures or any existing test. No new dependencies.

First add the test and run `.venv/bin/python -m pytest tests/test_plan.py`: all 4 must fail. Iterate on that file. At the end `.venv/bin/python -m pytest` once: 48 + 4 = 52 passed.

At most three lines of summary. Commit "round 44: step 363 Plan DXF".
```

---

## Step 364 — designer: `planParts`, the walls and what's in them

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-44.md §1 (The plan DXF) and §4. Step 362 is in.
If `git status` shows uncommitted changes, stop and tell me.

A new module that nothing calls yet. NEW src/elevation/model/planParts.js exports planParts(room, settings) → [{ id, kind, points, closed?, dashed?, runId? }], with the doc comment from SPEC §4. Points are plan points flipped to y up: [x, -y], written so a 0 never becomes −0 (e.g. [x + 0, 0 - y]). Send closed only as false (open lines) and dashed only as true. Follow SPEC §4's contract exactly, in its order, per wall in room.walls order:
1. `${wall.id}:wall`, kind 'wall', wallOutline(room, wall), only when wall.thickness > 1e-9.
2. Per recess: frame = wallSideFrame(room, wall, recess.wallSide); shape = recessPlanShape(recess, frame.length, wall.height, wall.thickness); [u, v] → elevationToPlan(frame, u, v). shape.fill → `${recess.id}:fill` kind 'wall'; shape.knockout → `${recess.id}:knockout` kind 'void'; if shape.dashed, its first three shape.lines → `${recess.id}:line-${index}` kind 'recess', closed false, dashed true.
3. Per opening, frame = wallFrame(room, wall), { jamb, casing } = openingGeometry(opening, frame.length, settings), depths = openingPlanDepths(wall, opening): `${opening.id}:void` kind 'void' (jamb.x..jamb.x + jamb.width × depths.face..depths.back); `${opening.id}:detail` kind 'opening', closed false, the jamb span at (face + back) / 2 for a window, face for a door; if casing, `${opening.id}:casing` kind 'casing' (casing.x..casing.x + casing.width × depths.face..depths.face + casing.thickness).
4. Per soffit: soffit.id, kind 'soffit', dashed true, soffit.x..soffit.x + soffit.width × 0..soffit.depth in wallSideFrame(room, wall, soffit.wallSide).
5. Per wallEndPanels(room, wall, settings): wallEndPanelPartKey(wall.id, panel.endpoint), kind 'wall_end_panel', wallEndPanelPolygon(room, wall, panel).
Rectangles go (u0, v0), (u1, v0), (u1, v1), (u0, v1).

Files (only these):
- NEW src/elevation/model/planParts.js
- NEW src/elevation/model/__tests__/planParts.test.js: VERBATIM from SPEC §4 (3 tests)

Imports, all existing and cycle-free: wallOutline (./wallOutline.js), recessPlanShape and openingPlanDepths (./recesses.js), openingGeometry (./openings.js), wallEndPanels and wallEndPanelPolygon (./wallEndPanels.js), wallEndPanelPartKey (./parts.js), wallFrame and elevationToPlan (./geometry.js), wallSideFrame (./wallSides.js). PlanOpening.jsx, PlanRecess.jsx and PlanScene.jsx show how the canvas draws the same things; open them only if the contract is unclear.
DO NOT change any of those files, planPieces.js, drawingPayload.js, index.js, any canvas/component file or any existing test. DO NOT grep the repo.

First add the test and run `npx vitest run src/elevation/model/__tests__/planParts.test.js`: all 3 must fail. Iterate on that file. At the end `npm test && npm run lint` once: 943 + 3 = 946, golden snapshot unchanged, lint 0 errors. Don't run `npm run build`.

At most three lines of summary. Commit "elevation-mvp: step 364 Plan parts: walls and what's in them".
```

---

## Step 365 — designer: every run in plan

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-44.md §1 (The plan DXF) and §5. Step 364 is in.
If `git status` shows uncommitted changes, stop and tell me.

planParts adds every run's pieces after all the walls' parts. For each wall in room.walls order and each run in (wall.runs ?? []) order, as PlanRunFootprint does it (the raw wall, not resolveWall): frame = wallSideFrame(room, wall, wallSideOf(run)); layout = layoutRun(room, wall, run, settings); { boxes, faces, returns } = planRunPieces(room, wall, run, settings, layout, runFaceLayouts(room, wall, run, settings, layout)). Each range: range.polygon ([u, v] pairs) if it has one, else (start, back), (end, back), (end, front), (start, front); through elevationToPlan(frame, u, v) and flipped as in step 364. id = range.key, runId = run.id. Kinds: box → 'shelf' if box.dashed else 'cabinet'; face range → its own kind; return → 'filler'. dashed: true on every part of an upper run (cabinetTypeId === CABINET_TYPE_IDS.UPPER) and on a shelf box. Order per run: boxes, faces, returns.

Files (only these):
- src/elevation/model/planParts.js (~70 lines)
- src/elevation/model/__tests__/planParts.test.js (56): append the SPEC §5 describe at the end, VERBATIM (3 tests)

Imports: layoutRun and runFaceLayouts (./faceLayouts.js), planRunPieces (./planPieces.js), wallSideOf (./wallSides.js), CABINET_TYPE_IDS (./constants.js). planRunPieces returns { span, boxes, faces, returns }, each range { key, start, end, back, front, kind?, polygon?, dashed? }.
DO NOT change planPieces.js, faceLayouts.js, PlanRunFootprint.jsx, drawingPayload.js, index.js or any existing test. DO NOT grep the repo.

First add the tests and run `npx vitest run src/elevation/model/__tests__/planParts.test.js`: the 3 new tests must fail and the 3 from step 364 pass. Iterate on that file. At the end `npm test && npm run lint` once: 946 + 3 = 949, golden snapshot unchanged, lint 0 errors. Don't run `npm run build`.

At most three lines of summary. Commit "elevation-mvp: step 365 Plan parts: runs".
```

---

## Step 366 — designer: the plan on the payload

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-44.md §6. Step 365 is in.
If `git status` shows uncommitted changes, stop and tell me.

toDrawingPayload sends the room in plan. In src/elevation/model/drawingPayload.js: import { planParts } from './planParts.js' after the elevationMarks import; the returned object gets, last (after plotScale), plan: { parts: planParts(room, settings) }; the doc comment's round list adds "round 44 the room in plan".

Files (only these):
- src/elevation/model/drawingPayload.js (61 lines)
- src/elevation/model/__tests__/drawingPayload.test.js (103): import { planParts } from '../planParts.js' after the elevationMarks import; in withoutParts, right after `...payload,`, add the line `  plan: undefined,`; append the SPEC §6 test inside the describe after the SPEC-43.3 test, VERBATIM. No other change.

DO NOT change planParts.js, ExportDxfButton.jsx, any other file or test. DO NOT grep the repo.

First change the test and run `npx vitest run src/elevation/model/__tests__/drawingPayload.test.js`: the new test must fail and the other 5 pass. Iterate on that file. At the end `npm test && npm run lint && npm run build` once: 949 + 1 = 950, golden snapshot unchanged, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 366 The plan on the payload".
```

---

## Running it (Kyle, after 366)

Start the API and designer as in round 42 (366 already built), geometry on `feature/drawing` with 363 in. Run the SPEC's end-to-end check: the PD/3Df tall between end panels, then *Export DXF* on G1, G2, G3 and G5 and open `plan.dxf`.

If anything looks wrong, export the room, keep the zip (its `payload.json` shows what was sent), and bring it back. `git show --stat HEAD` after each step helps me judge whether a prompt sent Codex exploring. After 363 and 365, send me `git show` too and I'll review the diff.
