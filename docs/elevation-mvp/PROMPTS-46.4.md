# Round 46.4 — Codex Prompts, Steps 420–423 (door details in the elevation DXF)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, **in the repo the step names**. The SPEC lives in the designer repo. From geometry it's `../cabinetry_designer/docs/elevation-mvp/SPEC-46.4.md`.

| Step | Repo | What | Tests after |
|---|---|---|---|
| 420 | cabinetry_designer_geometry | `doorDetails` on the payload; DOOR_DETAILS lines; two layers | 67 |
| 421 | cabinetry_designer_geometry | Style tags on DOOR_TAGS; README | 69 |
| 422 | cabinetry_designer | `elevationDoorDetails` | 1104 |
| 423 | cabinetry_designer | `doorDetails` on the payload; plan thickness pinned | 1106 |

The API doesn't change. 420 has to be in before you export with 423 in.

---

## Before step 420 (Kyle)

```bash
cd cabinetry_designer
git status                                   # on elevation-doors, 419 in; only the two docs below are new
git add docs/elevation-mvp/SPEC-46.4.md docs/elevation-mvp/PROMPTS-46.4.md
git commit -m "round 46.4 docs"

cd ../cabinetry_designer_geometry
git status                                   # clean on feature/drawing, 374 in
.venv/bin/python -m pytest                   # 63 passed
```

---

## Step 420 — geometry: door details on the payload and in the DXF

Run in **cabinetry_designer_geometry**.

```
Repo: cabinetry_designer_geometry, branch feature/drawing. SPEC: ../cabinetry_designer/docs/elevation-mvp/SPEC-46.4.md §1 and §2. Step 374 is in (63 tests).
If `git status` shows uncommitted changes, stop and tell me.

Each elevation can carry door details (frame openings / molding rectangles per part); draw them at their part's depth on a new DOOR_DETAILS layer, hidden segments dropped.
1. src/drawing/models.py: import model_validator from pydantic. NEW PayloadDoorDetail (extra="forbid") after PayloadMark, docstring from SPEC §2: partId: str = Field(min_length=1); openings: list[PayloadHole] = []; tag: str | None = Field(default=None, min_length=1). PayloadElevation gets, after marks, `doorDetails: list[PayloadDoorDetail] = []` with the comment "# Door details per part (SPEC-46.4); each names a part in this elevation." and a @model_validator(mode="after") that raises ValueError naming the unknown ids when a doorDetails partId isn't the id of one of self.parts.
2. src/dxf/writer.py: LAYER_DEFS gets, after MARKERS, the comment "# Door details and style tags in elevation (SPEC-46.4): lighter than faces." and `"DOOR_DETAILS": (7, "CONTINUOUS", 13),` and `"DOOR_TAGS":    (6, "CONTINUOUS", 18),`.
3. src/drawing/elevation_dxf.py:
   - private _opening_lines(openings) -> tuple: the 4 sides of each opening as ((x1, z1), (x2, z2)) pairs.
   - after `shapes` is built: by_id = {part.id: part for part in parts}; detail_shapes = one HlrShape per elevation.doorDetails entry WITH openings: id=f"{part.id}#door", polygon=rect_polygon(part.x, part.z, part.width, part.height), front=part.front, drop_hidden=True, lines=_opening_lines(detail.openings), opaque=False, outlined=False.
   - `lines = hidden_line_removal(shapes + detail_shapes)` (one call). After the parts' write loop, write each detail shape's visible lines (lines[shape.id][0]) to "DOOR_DETAILS". visible_regions still gets `shapes` only.
   - `tag` is accepted, not drawn (step 421).

Files (only these):
- src/drawing/models.py (182 lines)
- src/drawing/elevation_dxf.py (162)
- src/dxf/writer.py (171): two layer lines + comment
- tests/test_drawing_style.py (48): after line 39 (`"HIDDEN": 18, … "MARKERS": 25,`) add the line `        "DOOR_DETAILS": 13, "DOOR_TAGS": 18,`
- NEW tests/test_door_details.py: VERBATIM from SPEC §2 (4 tests)

What you need without opening it: HlrShape(id, polygon, front, is_box, covers_box_edges, drop_hidden, lines, opaque, outlined) and rect_polygon(x, z, width, height, holes=()) are in src/projection/hlr.py; hidden_line_removal returns {id: (visible, hidden)}; write_lines_to_layer(doc, layer, lines) is in src/dxf/writer.py.
DO NOT change hlr.py, bundle.py, dimensions.py, marks.py, the plan files, the fixtures or any other test. No new dependencies.

First change the tests and run `.venv/bin/python -m pytest tests/test_door_details.py tests/test_drawing_style.py`: the door-details tests and the layer test must fail. Iterate on those files. At the end `.venv/bin/python -m pytest` once: 63 + 4 = 67 passed.

At most three lines of summary. Commit "round 46.4: step 420 Door details in the elevation DXF".
```

---

## Step 421 — geometry: style tags

Run in **cabinetry_designer_geometry**.

```
Repo: cabinetry_designer_geometry, branch feature/drawing. SPEC: ../cabinetry_designer/docs/elevation-mvp/SPEC-46.4.md §1 and §3. Step 420 is in (67 tests).
If `git status` shows uncommitted changes, stop and tell me.

A door detail's `tag` (the style label) is drawn in its part's top-left corner on DOOR_TAGS.
1. src/drawing/elevation_dxf.py: private _add_tags(modelspace, details, by_id, plot_scale). For each detail with a tag: h = DIMSTYLE_PAPER["dimtxt"] * plot_scale; part = by_id[detail.partId]; skip when part.width < 4 * h - 1e-9 or part.height < 2 * h - 1e-9; otherwise
   modelspace.add_text(detail.tag, height=h, dxfattribs={"layer": "DOOR_TAGS", "style": TEXT_STYLE}).set_placement((part.x + h / 2, part.z + part.height - h / 2), align=TextEntityAlignment.TOP_LEFT)
   Call it right after the DOOR_DETAILS lines are written. Add DIMSTYLE_PAPER to the existing src.dxf.writer import; import TextEntityAlignment from ezdxf.enums (same pattern as src/drawing/marks.py).
2. README.md (69 lines): layer table rows `| door details (openings, molding rectangles) | DOOR_DETAILS |` and `| style tags | DOOR_TAGS |`; after the "A part's `lines` …" paragraph add the sentence from SPEC §3.

Files (only these):
- src/drawing/elevation_dxf.py (~185 lines)
- README.md (69)
- tests/test_door_details.py (~110): add `from ezdxf.enums import TextEntityAlignment` after `import pytest`, and append the two tests from SPEC §3 VERBATIM

DO NOT change models.py, writer.py, marks.py or any other test. No new dependencies.

First add the tests and run `.venv/bin/python -m pytest tests/test_door_details.py`: the two new tests must fail. Iterate on that file. At the end `.venv/bin/python -m pytest` once: 67 + 2 = 69 passed.

At most three lines of summary. Commit "round 46.4: step 421 Style tags in the elevation DXF".
```

---

## Step 422 — designer: `elevationDoorDetails`

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.4.md §1 and §4. Step 419 is in (1099 tests).
If `git status` shows uncommitted changes, stop and tell me.

A new module listing each wall face's door details for the DXF payload; nothing calls it yet.
NEW src/elevation/model/elevationDoorDetails.js, exactly the contract in SPEC §4:
- export elevationDoorDetails(room, wall, side, settings, partIds = null) → [{ partId, openings?, tag? }].
- { details, tags } = doorDrawing(room); both false → [].
- view = resolveWall(room, wall, side); for each run of view.runs, each part of runDoorDetails(room, view, run, settings).parts, in order.
- partId: face → `${pieceId}:${path}${half}` with half = part.key.slice(`${pieceId}:${path}`.length + 1) ('' when nothing follows the path); any other kind → pieceId, skipped when null. Skip when partIds is given and lacks partId.
- Entry { partId }, then openings (each { x, z, width, height }) when details and the part has openings, then tag: part.label when tags. Skip an entry with neither.
- Doc comment from SPEC §4.

Files (only these):
- NEW src/elevation/model/elevationDoorDetails.js
- NEW src/elevation/model/__tests__/elevationDoorDetails.test.js: VERBATIM from SPEC §4 (5 tests)

What you need without opening them: resolveWall(room, wall, side) is in ./room.js. doorDrawing(room) → { details, tags } and runDoorDetails(room, wall, run, settings, scene?) → { parts: [{ key, kind: 'face' | 'panelCell' | 'blindPanel', pieceId, path, styleId, label, construction, x, z, width, height, openings }], warnings } are in ./doorDetails.js. A pair-door leaf's key is `${pieceId}:${path}:${half}`, any other face's `${pieceId}:${path}`.
DO NOT change doorDetails.js, elevationParts.js, drawingPayload.js, index.js or any existing test. DO NOT grep the repo.

First add the test and run `npx vitest run src/elevation/model/__tests__/elevationDoorDetails.test.js`: all 5 must fail. Iterate on that file. At the end `npm test && npm run lint` once: 1099 + 5 = 1104, golden snapshot unchanged, lint 0 errors.

At most three lines of summary. Commit "elevation-mvp: step 422 Elevation door details".
```

---

## Step 423 — designer: door details on the payload

Run in **cabinetry_designer**.

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.4.md §5. Step 422 is in (1104 tests).
If `git status` shows uncommitted changes, stop and tell me.

Each elevation in the drawing payload carries its door details.
1. src/elevation/model/drawingPayload.js: `import { elevationDoorDetails } from './elevationDoorDetails.js';` after the elevationMarks import. In the elevations map build the parts array once (const parts = [...the four spreads, same order...]) and return the same object with `parts` and, after `marks`, `doorDetails: elevationDoorDetails(room, wall, side, settings, new Set(parts.map(({ id }) => id)))`. The doc comment's round list ends "…45.1 its markers and labels; 46.4 each face's door details."
2. src/elevation/model/__tests__/drawingPayload.test.js: import elevationDoorDetails ('../elevationDoorDetails.js') after the elevationMarks import, DEFAULT_DOOR_STYLE ('../doorStyles.js') and gridLeaves ('../grid.js'); in withoutParts add `delete copy.doorDetails;` after `delete copy.marks;`; append the two tests from SPEC §5 VERBATIM inside the describe, after the SPEC-45.1 test. (The plan test already passes; it pins step 385.)

Files (only these):
- src/elevation/model/drawingPayload.js (70 lines)
- src/elevation/model/__tests__/drawingPayload.test.js (129)

DO NOT change ExportDxfButton.jsx, elevationDoorDetails.js, planParts.js or the API. DO NOT grep the repo.

Run `npx vitest run src/elevation/model/__tests__/drawingPayload.test.js` while iterating. At the end `npm test && npm run lint && npm run build` once: 1104 + 2 = 1106, golden snapshot unchanged, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 423 Door details on the payload".
```

---

## Running it (Kyle, after 423)

Geometry with 421 in, the designer built after 423. Run the SPEC's end-to-end check on G1, G3 and one of your rooms, once with **Show style tags** on and once at 1/4" = 1'-0". Send `git show` after 420 and I'll review the diff.
