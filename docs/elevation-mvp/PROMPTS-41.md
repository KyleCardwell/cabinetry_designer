# Round 41 — Codex Prompts, Steps 313–317 (elevation parts and hidden lines)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, **in the repo the step names**. The SPEC lives in the designer repo; from geometry it's `../cabinetry_designer/docs/elevation-mvp/SPEC-41.md`.

| Step | Repo | What | Tests after |
|---|---|---|---|
| 313 | cabinetry_designer_geometry | Rewrite hidden-line removal | 15 |
| 314 | cabinetry_designer_geometry | Payload parts + layers + parts in the elevation DXF | 18 |
| 315 | cabinetry_designer | `elevationParts`: boxes, fillers, panels, Ts, frames | 874 |
| 316 | cabinetry_designer | `elevationParts`: faces and shelves | 876 |
| 317 | cabinetry_designer | `toDrawingPayload` carries `parts` | 877 |

The API doesn't change this round. Geometry goes first: it accepts `parts` (default empty) before the designer sends them.

The SPEC's test values were read from the golden fixture with today's model, and the HLR values were checked against shapely. If a test fails, fix the code, not the number, unless the number contradicts a SPEC rule. In that case stop and say so.

---

## Before step 313 (Kyle)

**Designer** — commit the round docs:

```bash
cd cabinetry_designer
git status                                   # clean, on feature/elevation-mvp
git add docs/elevation-mvp/SPEC-41.md docs/elevation-mvp/PROMPTS-41.md
git commit -m "round 41 docs"
```

**Geometry** — branch from main:

```bash
cd ../cabinetry_designer_geometry
git status                                   # clean
git checkout main && git pull
git checkout -b elevation-parts
.venv/bin/python -m pytest                   # 13 passed
```

---

## Step 313 — geometry: hidden-line removal

Run in **cabinetry_designer_geometry**.

```
Repo: cabinetry_designer_geometry, branch elevation-parts. SPEC: ../cabinetry_designer/docs/elevation-mvp/SPEC-41.md §1 and §3.
If `git status` shows uncommitted changes, stop and tell me.

Replace the old box-based hidden-line removal with one for flat rectangles at a depth: HlrShape(id, polygon, front, is_box, covers_box_edges), rect_polygon(x, z, width, height, holes), hidden_line_removal(shapes) -> {id: (visible, hidden)}. Nearer = larger front; equal fronts never hide. Visible = outline minus every nearer polygon. Hidden = outline ∩ the union of nearer polygons, minus that union's boundary — except a box's edges behind a covers_box_edges shape are dropped, not hidden. SPEC §3 gives the exact rule; follow its note: no negative buffer.

Files (only these):
- src/projection/hlr.py (145 lines) — rewrite as SPEC §3; compute_hlr and _box_to_elevation_rect go
- src/models/geometry.py (58) — delete Point3D, BoundingBox3D and BoxPrimitive; keep Point2D and Line2D
- tests/test_hlr.py (59) — replace with the SPEC §3 tests VERBATIM

DO NOT touch src/drawing/, src/dxf/, src/cli.py, src/utils/ or the other tests. DO NOT add dependencies (shapely is installed). Nothing else imports the deleted models; check with `grep -rn "BoxPrimitive\|Point3D\|BoundingBox3D\|compute_hlr" src tests` (must print nothing at the end).

First replace the tests and run `.venv/bin/python -m pytest tests/test_hlr.py`: they must fail. Iterate on that file only. At the end run `.venv/bin/python -m pytest` once: 13 − 5 + 7 = 15 passed.

At most five lines of summary. Commit "round 41: step 313 Hidden-line removal for elevation parts".
```

---

## Step 314 — geometry: parts in the payload and the DXF

Run in **cabinetry_designer_geometry**.

```
Repo: cabinetry_designer_geometry, branch elevation-parts. SPEC: ../cabinetry_designer/docs/elevation-mvp/SPEC-41.md §1, §2 and §4. Step 313 is in.
If `git status` shows uncommitted changes, stop and tell me.

Each payload elevation can carry `parts` (default []): rectangles with back/front depth, a kind and coversBoxEdges; frames add `holes`. The elevation DXF runs them through hidden_line_removal and writes each part's visible segments as LINEs on its kind's layer (cabinet→CABINETS, face→FACES, filler→FILLERS, end_panel/panel→PANELS, frame→FRAMES, shelf→SHELVES) and its hidden segments on HIDDEN (dashed). LAYER_DEFS is replaced with the SPEC's list. payload.json in the zip is dumped with exclude_defaults=True.

Files (only these):
- src/drawing/models.py (34 lines) — add PayloadHole, PayloadPart, and `parts: list[PayloadPart] = []` last on PayloadElevation (SPEC §4, extra="forbid" on each)
- src/drawing/bundle.py (28) — model_dump_json(indent=2, exclude_defaults=True); nothing else
- src/drawing/elevation_dxf.py (35) — KIND_LAYERS, shapes, hidden_line_removal, write_lines_to_layer; after the wall outline, before the text
- src/dxf/writer.py (104) — LAYER_DEFS VERBATIM from SPEC §4; nothing else in the file
- NEW tests/fixtures/g2_tall_payload.json — VERBATIM from SPEC §4
- NEW tests/test_elevation_parts.py — VERBATIM from SPEC §4 (3 tests)
- README.md (45) — the hlr.py architecture line and a Layers table (SPEC §4)

DO NOT change src/projection/hlr.py, src/cli.py, tests/test_draw.py, tests/test_hlr.py or tests/test_dxf_writer.py; all of them must still pass. No new dependencies.

First add the fixture and tests and run `.venv/bin/python -m pytest tests/test_elevation_parts.py`: they must fail. Iterate on that file only. At the end run `.venv/bin/python -m pytest` once: 15 + 3 = 18 passed.

At most five lines of summary. Commit "round 41: step 314 Elevation parts in the DXF".
```

**Check after 314 (Kyle):**

```bash
.venv/bin/python -m src draw < tests/fixtures/g2_tall_payload.json \
  | .venv/bin/python -c "import sys,json,base64;open('/tmp/g2.zip','wb').write(base64.b64decode(json.load(sys.stdin)['zip_base64']))"
open /tmp/g2.zip
```

Open `elevation-A.dxf`. You should see one tall face frame (26 1/2" × 86") with two openings and four inset doors, no box lines, and two dashed vertical lines just inside the frame's outer stiles (the mitered end panels). Then merge `elevation-parts` into geometry's `main` via a PR. The designer steps don't need it merged, but the end-to-end check after 317 does.

---

## Step 315 — designer: `elevationParts` (no faces yet)

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-41.md §1, §2 and §5. Step 312 is in.
If `git status` shows uncommitted changes, stop and tell me.

New pure model function elevationParts(room, wall, side, settings): every part on one wall face with its elevation rectangle and its depth from the wall face, read from the plan view. For each run of resolveWall(room, wall, side).runs: runScene + planRunPieces(room, view, run, settings, scene.result, scene.faceLayouts), then emit boxes (plan box start/end, piece z/height), then drawn fillers/end panels/panels/Ts (not in scene.hiddenIds; plan entry depth; mitered-into-frame panels take the frame's back as their front; the two no-entry fallbacks), then frames with holes. SPEC §5 has every rule. No faces or shelves this step (step 316).

Files (only these):
- NEW src/elevation/model/elevationParts.js — SPEC §5. Imports: resolveWall from ./room.js, runScene from ./runScene.js, planRunPieces from ./planPieces.js, frontDepth and runBackOffset from ./corners.js
- NEW src/elevation/model/__tests__/elevationParts.test.js — VERBATIM from SPEC §5 (4 tests)
- src/elevation/model/index.js (398 lines) — one line at the end: `export { elevationParts } from './elevationParts.js';`

What you need to know without opening them:
- runScene(room, wall, run, settings) (runScene.js, 85 lines) returns { result, cells, faceLayouts, frames, hiddenIds, ghostIds, panelPieceIds, ells, drawnPieces, … }. frames.regions[] have { id, x, z, width, height, cabinetIds, fillerIds, panelIds }. faceLayouts is a Map pieceId → { faces, box, openings, … }. ells[] have pieceId. drawnPieces have { id, kind, role, x, z, width, height }; horizontal Ts have role 'tee'.
- planRunPieces returns { boxes, faces, returns, span }. boxes/faces entries: { key, start, end, back, front, kind?, polygon? }, already shifted by the run's outset. Box keys are piece ids; filler/end panel/panel keys are piece ids; seam T keys are tee ids; frame keys are region ids.
You may read runScene.js. DO NOT open planPieces.js, frames.js, cells.js, corners.js or any component, and DO NOT change them. DO NOT grep the repo.

First add the test and run it: it must fail. While iterating, run only `npx vitest run src/elevation/model/__tests__/elevationParts.test.js`. At the end run `npm test && npm run lint` once: 870 + 4 = 874, golden snapshot unchanged. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 315 Elevation parts".
```

---

## Step 316 — designer: faces and shelves

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-41.md §2 and §6. Step 315 is in.
If `git status` shows uncommitted changes, stop and tell me.

elevationParts adds, after each run's frames: shelves (shelfParts of each shelves cell; a shelf runs from box.front − part.depth to box.front, the back panel from box.back to box.back + part.depth), then faces (every face of scene.faceLayouts except type 'open'; id `${pieceId}:${face.path}${face.half ?? ''}`; an inset door in a frame region is flush with the frame's plan front, back = front − doorThickness; otherwise back = box.front + bumperThickness, front = back + doorThickness; coversBoxEdges true).

Files (only these):
- src/elevation/model/elevationParts.js — SPEC §6; import shelfParts from ./cells.js; update the doc comment's order line
- src/elevation/model/__tests__/elevationParts.test.js — append the two SPEC §6 tests VERBATIM inside the describe

shelfParts(piece, settings) returns [{ id, kind: 'panel', x, z, width, height, depth }] for the back (when shelves.back) then [{ id, kind: 'shelf', …, depth }] per shelf. Face objects have { path, half?, type, x, z, width, height }. DO NOT open cells.js or faces.js. DO NOT change any other file or grep the repo.

First add the tests and run them: they must fail. Iterate with `npx vitest run src/elevation/model/__tests__/elevationParts.test.js`. At the end `npm test && npm run lint` once: 874 + 2 = 876, golden snapshot unchanged. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 316 Elevation faces and shelves".
```

---

## Step 317 — designer: the payload carries parts

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-41.md §7. Step 316 is in.
If `git status` shows uncommitted changes, stop and tell me.

Each elevation record from toDrawingPayload gets `parts: elevationParts(room, wall, side, settings)` as its last field. payloadVersion stays 1.

Files (only these):
- src/elevation/model/drawingPayload.js (44 lines) — import elevationParts from ./elevationParts.js; add parts; drop `void settings;`; update the doc comment
- src/elevation/model/__tests__/drawingPayload.test.js (49) — the import, the withoutParts helper, wrap the first G1 call, append the new test; all VERBATIM from SPEC §7

DO NOT touch elevationParts.js, ExportDxfButton.jsx, src/api/ or any other file. DO NOT grep the repo.

Run `npx vitest run src/elevation/model/__tests__/drawingPayload.test.js` while iterating. At the end run `npm test && npm run lint && npm run build` once: 876 + 1 = 877, golden snapshot unchanged.

At most five lines of summary. Commit "elevation-mvp: step 317 Payload carries elevation parts".
```

---

## Running it (Kyle, after 317)

Geometry `main` must have 313–314 merged (the API runs geometry from its folder, so the checked-out branch is what runs). Then start the API and designer as in round 40.

**End-to-end check:**

- **G1:** *Export DXF* → open `elevation-A.dxf`. Layers CABINETS, FACES, FILLERS and PANELS have lines, and HIDDEN is empty. You should see the tall's pair of doors inside its box with an end panel each side, the base's doors with box outlines showing at the reveals and the 2 1/8" filler at the right, and the upper's two doors with its end panel and filler.
- **G2 A:** three frames with their openings and inset doors, no box lines, and dashed lines just inside the tall and base frames' left stiles.
- **G4:** T-fillers over the seams, with no box lines under them.
- **G3 Wall 2:** the base fillers' edges behind the alcove side panels are dashed.

Expected for now: G1 B's blind box shows solid lines into the corner, until round 42 draws the return run in front of it.

If anything looks wrong, export the room, keep the zip (its `payload.json` shows exactly what was sent), and bring it back.
