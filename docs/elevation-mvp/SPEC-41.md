# Round 41 — SPEC: elevation parts and hidden lines

Steps 313–317. Two repos: `cabinetry_designer_geometry` (313–314), then `cabinetry_designer` (315–317). The API doesn't change: its schema passes elevations through untouched.
Drawing rounds: 40 plumbing → **41 elevation parts + hidden lines** → 42 elevation extras → 43 elevation dimensions → 44 plan → 45 plan dimensions and labels.

**Done when:** *Export DXF* on G1 gives `elevation-A.dxf` … `elevation-D.dxf` that draw every box, door and drawer front, filler, end panel, panel, T/L filler, face frame and shelf on that wall face, each kind on its own layer. Hidden edges are removed, and a part hidden behind a *different* part is drawn dashed on `HIDDEN`.

| Step | Repo | What | Tests after |
|---|---|---|---|
| **313** | geometry | Rewrite `hlr.py`: rectangles (with holes) + depth → visible and hidden lines | 13 → **15** |
| **314** | geometry | Payload parts, new layers, elevation DXF draws parts through HLR | **18** |
| **315** | designer | `elevationParts(room, wall, side, settings)`: boxes, fillers, panels, Ts, frames | 870 → **874** |
| **316** | designer | `elevationParts` adds faces and shelves | **876** |
| **317** | designer | `toDrawingPayload` carries each elevation's `parts` | **877** |

Codex writes the code. This SPEC gives contracts, rules and tests. The literal test values were read from the golden fixture with today's model, and the HLR values were checked against shapely 2.1. If a test fails, fix the code, not the number, unless the number contradicts a rule here. In that case stop and say so.

---

## §1 Decisions (Kyle, 2026-10-04)

- **Hidden lines (Kyle):** dashed only where a part is hidden behind a *different* part, for example a blind box behind its panel, panels covered by doors, or end panels mitered behind a face frame. A box's own edges behind its doors, its face frame or a T/L filler are left out. Mechanism: every part carries `coversBoxEdges`. Box edges hidden by a part with `coversBoxEdges: true` are dropped. Every other hidden edge is dashed.
- **Layers (Kyle):** visible lines go on `CABINETS`, `FACES`, `FILLERS`, `PANELS`, `FRAMES`, `SHELVES`, and every hidden line goes on one dashed `HIDDEN` layer. The old placed-object layers are removed.
- **Geometry stays a renderer.** The designer sends each part's rectangle and its depth (`back`, `front`: inches out from the wall face, the plan view's own numbers). Geometry only decides what's in front of what. Nearer means a larger `front`. Two parts with equal `front` never hide each other (inset doors and their frame).
- **Depth comes from the plan view.** `planRunPieces` already knows every box, filler, end panel, T and frame depth. `elevationParts` reads them by key and doesn't re-derive them. Two small fallbacks cover parts the plan doesn't draw (§4).
- **Payload stays `payloadVersion: 1`.** Nothing is stored yet, so new fields arrive with defaults (`parts: []`, `holes: []`) and round-40 payloads stay valid. `payload.json` in the zip is dumped with `exclude_defaults=True`, so a payload round-trips exactly.
- **Out of this round (→ 42):** wall end panels, toe kicks, countertops, top mold/crown, below-run parts, chip lines, openings, soffits, recesses, and neighbour-run profiles at corners. Known gap until then: a blind box's extension past its filler (into the corner, e.g. G1 elevation B, 9 3/16"–24 7/8") draws as solid lines, because the return run that hides it isn't drawn yet. When 42 adds neighbour profiles as parts, that extension turns dashed with no change here.
- **Not in the DXF:** cell chains, pins, centerline markers, labels and part numbers (43/45), and `open` faces (no door: the box behind shows instead).

---

## §2 The part record

Each elevation in the payload gets `parts`:

```json
{
  "id": "28072a7d-e691-40d1-a005-4d0ed1c9e825:rleft",
  "kind": "face",
  "runId": "b38f2f11-5318-42f2-9d95-8b9b3d1b9087",
  "x": 0.8125, "z": 4.125, "width": 14.125, "height": 85.75,
  "back": 25.0625, "front": 25.875,
  "coversBoxEdges": true
}
```

| Field | Meaning |
|---|---|
| `id` | piece id; a face is `` `${pieceId}:${face.path}${face.half ?? ''}` `` (the plan's face key); a frame is its region id; a shelf part its `shelfParts` id |
| `kind` | `cabinet` · `face` · `filler` · `end_panel` · `panel` · `frame` · `shelf` |
| `runId` | the run it belongs to |
| `x`, `z`, `width`, `height` | the rectangle in elevation coordinates (x along the face from its left as seen, z up from the floor), inches |
| `back`, `front` | inches out from the wall face (a recess run is negative, an outset run is larger) |
| `coversBoxEdges` | `true` for faces, frames, fillers (incl. seam and end Ts) and L end panels; `false` otherwise |
| `holes` | **frames only**: the frame's openings, `[{x, z, width, height}]` |

Key order in each record is as listed (frames add `holes` last). Parts with `width` or `height` ≤ 1e-6 are skipped.

Layers: `cabinet`→`CABINETS`, `face`→`FACES`, `filler`→`FILLERS`, `end_panel` and `panel`→`PANELS`, `frame`→`FRAMES`, `shelf`→`SHELVES`.

---

## §3 Step 313 — geometry: hidden-line removal

**Rewrite `src/projection/hlr.py`** (145 lines → about 70). The old `compute_hlr(boxes)` goes.

```python
"""Hidden-line removal for elevations (SPEC-41): flat rectangles at a depth, nearer hides farther."""

EPSILON = 1e-6

@dataclass(frozen=True)
class HlrShape:
    id: str
    polygon: Polygon          # shapely; elevation x → x, z → y; may have holes
    front: float              # inches from the wall face; larger is nearer the viewer
    is_box: bool = False
    covers_box_edges: bool = False


def rect_polygon(x: float, z: float, width: float, height: float, holes=()) -> Polygon:
    """A rectangle, with each (x, z, width, height) in `holes` cut out of it."""


def hidden_line_removal(shapes: list[HlrShape]) -> dict[str, tuple[list[Line2D], list[Line2D]]]:
    """For each shape id: (visible, hidden) segments of its outline (exterior and hole rings)."""
```

The rule for each shape `S`:
1. `edges = S.polygon.boundary`.
2. `nearer` = the other shapes with `front > S.front + EPSILON`. If there are none, every edge is visible and nothing is hidden.
3. `visible = edges.difference(unary_union(nearer polygons))`. An edge lying exactly on a nearer shape's edge goes too: that shape draws the line.
4. `dashing` = the nearer polygons, minus those with `covers_box_edges` when `S.is_box`. If `dashing` is non-empty: `u = unary_union(dashing)`, `hidden = edges.intersection(u).difference(u.boundary)`. Otherwise hidden is empty. (Don't use a negative buffer. It shortens every hidden segment by EPSILON.)
5. Flatten each result (LineString / MultiLineString / GeometryCollection) into `Line2D` segments, one per consecutive coordinate pair. Drop segments shorter than EPSILON.

`Line2D`/`Point2D` stay in `src/models/geometry.py`, with `y` holding z. **Delete** `Point3D`, `BoundingBox3D` and `BoxPrimitive` from that file: after this, nothing imports them.

**Replace `tests/test_hlr.py`** (5 tests → 7), verbatim:

```python
"""Tests for hidden-line removal (SPEC-41)."""

import pytest

from src.projection.hlr import HlrShape, hidden_line_removal, rect_polygon


def _length(lines):
    return sum(((l.end.x - l.start.x) ** 2 + (l.end.y - l.start.y) ** 2) ** 0.5 for l in lines)


def _run(*shapes):
    return hidden_line_removal(list(shapes))


def test_a_lone_shape_is_all_visible():
    visible, hidden = _run(HlrShape("a", rect_polygon(0, 0, 24, 30), 24, is_box=True))["a"]
    assert len(visible) == 4
    assert _length(visible) == pytest.approx(108)
    assert hidden == []


def test_box_edges_behind_its_door_are_left_out():
    result = _run(
        HlrShape("box", rect_polygon(0, 0, 24, 30), 24, is_box=True),
        HlrShape("door", rect_polygon(1, -1, 22, 30), 24.875, covers_box_edges=True),
    )
    visible, hidden = result["box"]
    assert _length(visible) == pytest.approx(86)  # 108 less the 22" of bottom edge behind the door
    assert hidden == []
    assert _length(result["door"][0]) == pytest.approx(104)


def test_a_panel_behind_a_door_is_dashed():
    visible, hidden = _run(
        HlrShape("panel", rect_polygon(0, 0, 24, 30), 24),
        HlrShape("door", rect_polygon(1, -1, 22, 30), 24.875, covers_box_edges=True),
    )["panel"]
    assert _length(visible) == pytest.approx(86)
    assert len(hidden) == 1
    assert [hidden[0].start.y, hidden[0].end.y] == pytest.approx([0, 0])
    assert sorted([hidden[0].start.x, hidden[0].end.x]) == pytest.approx([1, 23])


def test_a_box_behind_a_part_that_does_not_cover_box_edges_is_dashed():
    visible, hidden = _run(
        HlrShape("box", rect_polygon(0, 0, 24, 30), 24, is_box=True),
        HlrShape("panel", rect_polygon(1, -1, 22, 30), 25),
    )["box"]
    assert _length(visible) == pytest.approx(86)
    assert _length(hidden) == pytest.approx(22)


def test_equal_fronts_hide_nothing():
    result = _run(
        HlrShape("a", rect_polygon(0, 0, 10, 10), 5),
        HlrShape("b", rect_polygon(5, 5, 10, 10), 5),
    )
    for name in ("a", "b"):
        visible, hidden = result[name]
        assert _length(visible) == pytest.approx(40)
        assert hidden == []


def test_a_frame_hides_box_edges_behind_its_members_but_not_what_shows_through_its_openings():
    result = _run(
        HlrShape("frame", rect_polygon(0, 0, 30, 30, [(5, 5, 20, 20)]), 1, covers_box_edges=True),
        HlrShape("box", rect_polygon(2, 2, 26, 26), 0, is_box=True),
        HlrShape("panel", rect_polygon(10, 10, 5, 5), 0),
        HlrShape("edge", rect_polygon(2, 10, 6, 5), 0),
    )
    assert len(result["frame"][0]) == 8
    assert _length(result["frame"][0]) == pytest.approx(200)
    assert result["box"] == ([], [])
    assert _length(result["panel"][0]) == pytest.approx(20)
    assert result["panel"][1] == []
    assert _length(result["edge"][0]) == pytest.approx(11)  # the part inside the opening
    assert _length(result["edge"][1]) == pytest.approx(11)  # the part behind the stile


def test_an_edge_on_a_nearer_parts_edge_is_drawn_once():
    visible, hidden = _run(
        HlrShape("box", rect_polygon(0, 0, 10, 10), 0, is_box=True),
        HlrShape("panel", rect_polygon(10, 0, 1, 10), 1),
    )["box"]
    assert len(visible) == 3
    assert _length(visible) == pytest.approx(30)
    assert hidden == []
```

**Count:** 13 − 5 + 7 = **15**.

---

## §4 Step 314 — geometry: parts in the payload and the DXF

**`src/drawing/models.py`** — add (each `ConfigDict(extra="forbid")`):

```python
class PayloadHole(BaseModel):
    x: float
    z: float
    width: float = Field(gt=0)
    height: float = Field(gt=0)


class PayloadPart(BaseModel):
    id: str = Field(min_length=1)
    kind: Literal["cabinet", "face", "filler", "end_panel", "panel", "frame", "shelf"]
    runId: str
    x: float
    z: float
    width: float = Field(gt=0)
    height: float = Field(gt=0)
    back: float
    front: float
    coversBoxEdges: bool
    holes: list[PayloadHole] = []
```

and `parts: list[PayloadPart] = []` as the last field of `PayloadElevation`.

**`src/drawing/bundle.py`:** `payload.json` is `model.model_dump_json(indent=2, exclude_defaults=True)`. Nothing else changes.

**`src/dxf/writer.py`:** `LAYER_DEFS` becomes exactly:

```python
LAYER_DEFS = {
    "WALLS":      (7, "CONTINUOUS"),
    "CABINETS":   (5, "CONTINUOUS"),
    "FACES":      (7, "CONTINUOUS"),
    "FILLERS":    (30, "CONTINUOUS"),
    "PANELS":     (6, "CONTINUOUS"),
    "FRAMES":     (3, "CONTINUOUS"),
    "SHELVES":    (4, "CONTINUOUS"),
    "HIDDEN":     (8, "DASHED"),
    "DIMENSIONS": (2, "CONTINUOUS"),
    "TEXT":       (7, "CONTINUOUS"),
}
```

Everything else in `writer.py` stays.

**`src/drawing/elevation_dxf.py`:** after the wall outline and before the text:
- `KIND_LAYERS = {"cabinet": "CABINETS", "face": "FACES", "filler": "FILLERS", "end_panel": "PANELS", "panel": "PANELS", "frame": "FRAMES", "shelf": "SHELVES"}`;
- one `HlrShape` per part: `rect_polygon(x, z, width, height, [(h.x, h.z, h.width, h.height) for h in holes])`, `front`, `is_box = kind == "cabinet"`, `covers_box_edges = coversBoxEdges`;
- `hidden_line_removal(shapes)`; then, in payload order, each part's visible segments become `LINE`s on its kind's layer and its hidden segments become `LINE`s on `HIDDEN`. Use `write_lines_to_layer` from the writer.

**NEW `tests/fixtures/g2_tall_payload.json`** — G2's tall face frame run (both boxes, the two mitered end panels, the frame, four inset doors), verbatim:

```json
{
  "payloadVersion": 1,
  "units": "in",
  "room": { "id": "df64d3e7-dda7-438b-98a1-19586637c2f1", "name": "G2 Face frame kitchen" },
  "elevations": [
    {
      "key": "e10e98d3-30bd-4ec1-8a67-81d3923598e1", "letter": "A", "wallId": "e10e98d3-30bd-4ec1-8a67-81d3923598e1",
      "side": "front", "title": "Elevation A", "wallLabel": "Wall 1", "length": 172, "height": 96,
      "parts": [
        { "id": "352bd8c0-79a1-4210-a428-cfe95038118f", "kind": "cabinet", "runId": "a42e9a57-a98f-47f0-b6b4-9076b513db6e", "x": 51, "z": 4, "width": 24.5, "height": 64, "back": 0, "front": 25, "coversBoxEdges": false },
        { "id": "3e5f512e-1e43-4f30-85c4-b74b1936fb7d", "kind": "cabinet", "runId": "a42e9a57-a98f-47f0-b6b4-9076b513db6e", "x": 51, "z": 68, "width": 24.5, "height": 22, "back": 0, "front": 25, "coversBoxEdges": false },
        { "id": "a42e9a57-a98f-47f0-b6b4-9076b513db6e:left", "kind": "end_panel", "runId": "a42e9a57-a98f-47f0-b6b4-9076b513db6e", "x": 50, "z": 4, "width": 0.75, "height": 86, "back": 0, "front": 25, "coversBoxEdges": false },
        { "id": "a42e9a57-a98f-47f0-b6b4-9076b513db6e:right", "kind": "end_panel", "runId": "a42e9a57-a98f-47f0-b6b4-9076b513db6e", "x": 75.75, "z": 4, "width": 0.75, "height": 86, "back": 0, "front": 25, "coversBoxEdges": false },
        { "id": "frame:352bd8c0-79a1-4210-a428-cfe95038118f", "kind": "frame", "runId": "a42e9a57-a98f-47f0-b6b4-9076b513db6e", "x": 50, "z": 4, "width": 26.5, "height": 86, "back": 25, "front": 25.8125, "coversBoxEdges": true,
          "holes": [ { "x": 51.75, "z": 5.75, "width": 23, "height": 61.25 }, { "x": 51.75, "z": 69, "width": 23, "height": 19.25 } ] },
        { "id": "352bd8c0-79a1-4210-a428-cfe95038118f:rleft", "kind": "face", "runId": "a42e9a57-a98f-47f0-b6b4-9076b513db6e", "x": 51.75, "z": 5.75, "width": 11.5, "height": 61.25, "back": 25, "front": 25.8125, "coversBoxEdges": true },
        { "id": "352bd8c0-79a1-4210-a428-cfe95038118f:rright", "kind": "face", "runId": "a42e9a57-a98f-47f0-b6b4-9076b513db6e", "x": 63.25, "z": 5.75, "width": 11.5, "height": 61.25, "back": 25, "front": 25.8125, "coversBoxEdges": true },
        { "id": "3e5f512e-1e43-4f30-85c4-b74b1936fb7d:rleft", "kind": "face", "runId": "a42e9a57-a98f-47f0-b6b4-9076b513db6e", "x": 51.75, "z": 69, "width": 11.5, "height": 19.25, "back": 25, "front": 25.8125, "coversBoxEdges": true },
        { "id": "3e5f512e-1e43-4f30-85c4-b74b1936fb7d:rright", "kind": "face", "runId": "a42e9a57-a98f-47f0-b6b4-9076b513db6e", "x": 63.25, "z": 69, "width": 11.5, "height": 19.25, "back": 25, "front": 25.8125, "coversBoxEdges": true }
      ]
    }
  ]
}
```

**NEW `tests/test_elevation_parts.py`** (3 tests), verbatim:

```python
"""Elevation parts through hidden-line removal onto layers (SPEC-41)."""

import base64
import copy
import io
import json
import zipfile
from pathlib import Path

import ezdxf
import pytest
from pydantic import ValidationError

from src.drawing.bundle import draw

ROOT = Path(__file__).resolve().parent.parent
PAYLOAD = json.loads((ROOT / "tests" / "fixtures" / "g2_tall_payload.json").read_text())


def _modelspace(payload):
    archive = zipfile.ZipFile(io.BytesIO(base64.b64decode(draw(payload)["zip_base64"])))
    return ezdxf.read(io.StringIO(archive.read("elevation-A.dxf").decode("utf-8"))).modelspace()


def _lines(msp, layer):
    return list(msp.query(f'LINE[layer=="{layer}"]'))


def _length(lines):
    return sum(line.dxf.start.distance(line.dxf.end) for line in lines)


def test_each_kind_draws_its_visible_lines_on_its_layer():
    msp = _modelspace(PAYLOAD)
    assert len(_lines(msp, "FRAMES")) == 12  # outside rectangle + two openings
    assert _length(_lines(msp, "FRAMES")) == pytest.approx(478)
    assert len(_lines(msp, "FACES")) == 16
    assert _length(_lines(msp, "FACES")) == pytest.approx(414)
    assert _lines(msp, "CABINETS") == []  # behind their frame: left out, not dashed
    assert _lines(msp, "PANELS") == []


def test_end_panels_mitered_behind_the_frame_are_dashed():
    msp = _modelspace(PAYLOAD)
    hidden = _lines(msp, "HIDDEN")
    assert len(hidden) == 2
    assert sorted(line.dxf.start.x for line in hidden) == pytest.approx([50.75, 75.75])
    assert [line.dxf.start.distance(line.dxf.end) for line in hidden] == pytest.approx([86, 86])
    assert msp.doc.layers.get("HIDDEN").dxf.linetype == "DASHED"


def test_rejects_unknown_part_kinds_and_empty_parts():
    for patch in ({"kind": "door"}, {"width": 0}):
        payload = copy.deepcopy(PAYLOAD)
        payload["elevations"][0]["parts"][0].update(patch)
        with pytest.raises(ValidationError):
            draw(payload)
```

(The two end panels' outer edges and tops/bottoms lie on the frame's outside edges, so only their inner edges are left. Those are behind the stiles and dashed.)

The round-40 tests in `test_draw.py` stay as they are and still pass (the G1 fixture has no parts; `exclude_defaults` keeps its round trip exact).

**`README.md`:** in Architecture, `projection/hlr.py` is now "hidden-line removal: nearer parts hide farther ones; hidden edges dashed on HIDDEN (SPEC-41)", and add a short Layers table (§2's kind → layer).

**Count:** 15 + 3 = **18**.

---

## §5 Step 315 — designer: `elevationParts` (boxes, fillers, panels, Ts, frames)

**NEW `src/elevation/model/elevationParts.js`:**

```js
/**
 * Every part on one wall face as geometry draws it (SPEC-41): its rectangle in elevation coordinates
 * and its depth from the wall face, read from the plan view so the two always agree. Run by run in
 * view order; within a run: boxes, then fillers/end panels/panels/Ts, then frames (step 316 adds
 * shelves, then faces).
 */
export function elevationParts(room, wall, side, settings) { … }
```

For `view = resolveWall(room, wall, side)` and each `run` of `view.runs`:

```js
const scene = runScene(room, view, run, settings);
const plan = planRunPieces(room, view, run, settings, scene.result, scene.faceLayouts);
```

Index `plan.boxes` and `plan.faces` by `key`. `outset = runBackOffset(run)`. Then emit, in this order:

1. **Boxes:** for each `plan.boxes` entry whose cell piece (`scene.cells.pieces`, same id) has `kind === 'cabinet'`, `x = box.start`, `width = box.end − box.start` (so a blind box shows its whole width and a framed box its narrowed width), `z`/`height` from the piece, `back`/`front` from the box, `kind: 'cabinet'`, `coversBoxEdges: false`. Shelves cells aren't boxes.
2. **Pieces:** for each of `scene.drawnPieces` with kind `filler`, `end_panel` or `panel` and not in `scene.hiddenIds` (fillers inside a face frame are part of its stile), with `entry` = its `plan.faces` entry by id:
   - `x`/`width`: from the drawn piece, except a blind end panel (`scene.panelPieceIds.has(id)` and an entry exists), which takes `entry.start`/`entry.end − entry.start`. `z`/`height` always come from the drawn piece (extensions and end drops applied).
   - depth: `entry.back`/`entry.front`. If the piece is mitered into a frame (some region's `panelIds` contains it), its `front` is that **frame's** `back` (its `plan.faces` entry by region id), so the frame hides it. With no entry: a T (`piece.role === 'tee'`, i.e. horizontal Ts) gets `back = outset + run.depth`, `front = back + settings.teeThickness`. Anything else (a top panel) gets `back = outset`, `front = frontDepth(run, settings)`.
   - `kind` = the piece's kind; `coversBoxEdges` = `kind === 'filler'` or the piece is an L end panel (`scene.ells.some((ell) => ell.pieceId === piece.id)`).
3. **Frames:** for each of `scene.frames.regions`: its rectangle, depth from its `plan.faces` entry, `kind: 'frame'`, `coversBoxEdges: true`, and `holes` = the `openings` of each cabinet in `region.cabinetIds` (from `scene.faceLayouts`), in that order, each reduced to `{ x, z, width, height }`.

Every record: `{ id, kind, runId: run.id, x, z, width, height, back, front, coversBoxEdges }` (+ `holes` for frames), skipping width or height ≤ 1e-6.

Imports: `resolveWall` from `./room.js`, `runScene` from `./runScene.js`, `planRunPieces` from `./planPieces.js`, `frontDepth`, `runBackOffset` from `./corners.js`. Export from `model/index.js` (one line at the end).

**NEW `src/elevation/model/__tests__/elevationParts.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { elevationParts } from '../elevationParts.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);
const room = (name) => syncRoom(stored(name), settings);
const partsOf = (synced, wallIndex, side = 'front') => elevationParts(synced, synced.walls[wallIndex], side, settings);
const notFaces = (parts) => parts.filter((part) => part.kind !== 'face' && part.kind !== 'shelf');
const row = ({ id, kind, x, z, width, height, back, front, coversBoxEdges }) => (
  [id, kind, x, z, width, height, back, front, coversBoxEdges]
);
const byId = (parts, id) => parts.find((part) => part.id === id);

const TALL = 'b38f2f11-5318-42f2-9d95-8b9b3d1b9087';
const BASE = 'b822e8ac-1a44-47ca-acec-ecb93caf7b8a';
const UPPER = '434f1164-3b6b-4a97-89e7-1c6438c4d95a';

describe('SPEC-41 elevation parts', () => {
  it('lists each run\'s boxes, then its fillers and panels, with their plan depths (G1 elevation A)', () => {
    const parts = notFaces(partsOf(room('G1 Euro kitchen'), 0));
    expect(parts.map(row)).toEqual([
      ['28072a7d-e691-40d1-a005-4d0ed1c9e825', 'cabinet', 0.75, 4, 28.5, 86, 0, 25, false],
      [`${TALL}:left`, 'end_panel', 0, 4, 0.75, 86, 0, 25.875, false],
      [`${TALL}:right`, 'end_panel', 29.25, 4, 0.75, 86, 0, 25.875, false],
      ['cfc9c904-3a11-43ee-a48d-88bef061b5ae', 'cabinet', 30, 4, 24, 30.5, 0, 24, false],
      ['0f652c26-5f80-4387-8a1b-1f35ada26b59', 'cabinet', 54, 4, 36, 30.5, 0, 24, false],
      ['0624c9d5-b951-4191-95f2-1562a6b32343', 'cabinet', 90, 4, 25.5, 30.5, 0, 24, false],
      ['e3bfb331-0a5d-4cf2-aaba-929c53ca8c54', 'cabinet', 115.5, 4, 25.5, 30.5, 0, 24, false],
      [`${BASE}:right`, 'filler', 141, 4, 2.125, 30.5, 24.0625, 24.875, true],
      ['ae7626bb-d1e5-4396-8b5b-a8630bfed949', 'cabinet', 109.25, 54, 22, 36, 0, 12, false],
      ['2dc1a45e-c462-4c4a-99f3-65c8b6782a2a', 'cabinet', 131.25, 54, 22, 36, 0, 12, false],
      [`${UPPER}:left`, 'end_panel', 108.5, 53.875, 0.75, 36.125, 0, 12.875, false],
      [`${UPPER}:right`, 'filler', 153.25, 53.875, 1.875, 36.125, 12.0625, 12.875, true],
    ]);
    expect(parts[0]).toEqual({
      id: '28072a7d-e691-40d1-a005-4d0ed1c9e825', kind: 'cabinet', runId: TALL,
      x: 0.75, z: 4, width: 28.5, height: 86, back: 0, front: 25, coversBoxEdges: false,
    });
  });

  it('draws a face frame with its openings as holes and puts its mitered end panels behind it (G2 elevation A)', () => {
    const parts = notFaces(partsOf(room('G2 Face frame kitchen'), 0));
    expect(parts.filter((part) => part.kind === 'frame')).toHaveLength(3);
    expect(byId(parts, 'frame:352bd8c0-79a1-4210-a428-cfe95038118f')).toEqual({
      id: 'frame:352bd8c0-79a1-4210-a428-cfe95038118f', kind: 'frame', runId: 'a42e9a57-a98f-47f0-b6b4-9076b513db6e',
      x: 50, z: 4, width: 26.5, height: 86, back: 25, front: 25.8125, coversBoxEdges: true,
      holes: [
        { x: 51.75, z: 5.75, width: 23, height: 61.25 },
        { x: 51.75, z: 69, width: 23, height: 19.25 },
      ],
    });
    // Mitered end panels sit behind the frame (front = the frame's back).
    expect(row(byId(parts, 'a42e9a57-a98f-47f0-b6b4-9076b513db6e:left')))
      .toEqual(['a42e9a57-a98f-47f0-b6b4-9076b513db6e:left', 'end_panel', 50, 4, 0.75, 86, 0, 25, false]);
    expect(row(byId(parts, '860a1197-d14f-4fc2-9499-2d44cd1d8fa3:left')))
      .toEqual(['860a1197-d14f-4fc2-9499-2d44cd1d8fa3:left', 'end_panel', 76.5, 4, 0.75, 30.5, 0, 24, false]);
    // A framed box is its narrowed box; a filler in the frame is stile, not a part.
    expect(row(byId(parts, 'b736ca24-6df8-41d5-88bc-416dbd85eab3')))
      .toEqual(['b736ca24-6df8-41d5-88bc-416dbd85eab3', 'cabinet', 77.5, 4, 34, 30.5, 0, 24, false]);
    expect(byId(parts, '860a1197-d14f-4fc2-9499-2d44cd1d8fa3:right')).toBeUndefined();
    expect(byId(parts, 'ab0981ca-8621-45ba-a924-dbe318646f67:right')).toBeUndefined();
  });

  it('T-fillers and L end panels cover box edges; a horizontal T is a T thickness off the box fronts (G4)', () => {
    const parts = notFaces(partsOf(room('G4 T-filler run'), 0));
    const run = '738c73a7-adda-40e0-bca9-a881403c1ffa';
    expect(parts.map(({ kind }) => kind)).toEqual([
      'cabinet', 'cabinet', 'cabinet', 'cabinet', 'end_panel', 'filler', 'filler', 'filler', 'filler',
    ]);
    expect(row(byId(parts, `${run}:left`))).toEqual([`${run}:left`, 'end_panel', 13, 4, 1.5, 86, 0, 24.8125, true]);
    expect(row(byId(parts, `${run}:right`))).toEqual([`${run}:right`, 'filler', 118, 4, 2, 86, 24, 24.8125, true]);
    const seam = 'tee:36718dec-9ae3-48e7-bce7-f3d95d207a1c|0e8d791b-a3a5-4fe6-8b08-a1b8e954b8ba';
    expect(row(byId(parts, seam))).toEqual([seam, 'filler', 48, 4, 1.5, 86, 24, 24.8125, true]);
    const flat = 'tee:h:87b307e7-2f67-48a7-a80e-a52d4249d55b|0e8d791b-a3a5-4fe6-8b08-a1b8e954b8ba';
    expect(row(byId(parts, flat))).toEqual([flat, 'filler', 49.5, 63.25, 33.5, 1.5, 24, 24.8125, true]);
  });

  it('a part the plan doesn\'t draw spans its run from the back to the run\'s front (G3 top panel)', () => {
    const parts = notFaces(partsOf(room('G3 Bath alcove'), 1));
    expect(row(byId(parts, 'fbe04e96-9442-4fcd-aafa-b8d49960a63d')))
      .toEqual(['fbe04e96-9442-4fcd-aafa-b8d49960a63d', 'panel', 0.75, 77.25, 70.5, 0.75, 0, 24, false]);
    expect(row(byId(parts, '5f4db696-00e1-4303-9881-23a4d8ae7a64')))
      .toEqual(['5f4db696-00e1-4303-9881-23a4d8ae7a64', 'panel', 0.75, 36, 70.5, 41.25, 0, 0.75, false]);
  });
});
```

**Count:** 870 + 4 = **874**. Golden snapshot unchanged (no existing function changes).

---

## §6 Step 316 — designer: faces and shelves

In `elevationParts`, after the frames of each run:

4. **Shelves:** for each cell piece with `kind === 'shelves'` (`scene.cells.pieces` order), `box` = its `plan.boxes` entry, and each part of `shelfParts(piece, settings)` (from `./cells.js`):
   - `kind: 'shelf'` → `back = box.front − part.depth`, `front = box.front`;
   - the back panel (`kind: 'panel'`) → `back = box.back`, `front = box.back + part.depth`;
   - rectangle and id from the part, `coversBoxEdges: false`.
5. **Faces:** for each `[pieceId, layout]` of `scene.faceLayouts`, each face of `layout.faces` except `type === 'open'`:
   - id `` `${pieceId}:${face.path}${face.half ?? ''}` ``, rectangle from the face, `kind: 'face'`, `coversBoxEdges: true`;
   - depth: if a frame region's `cabinetIds` contains `pieceId` (an inset door), `front` = that frame's plan `front` and `back = front − settings.doorThickness`. Otherwise, with `box` = the piece's `plan.boxes` entry, `back = box.front + settings.bumperThickness` and `front = back + settings.doorThickness`.

Update the doc comment's order line. Append to the test file, inside the `describe`:

```js
  it('faces: a door sits a bumper off its box; an inset door is flush with its frame', () => {
    const g1 = partsOf(room('G1 Euro kitchen'), 0);
    expect(g1).toHaveLength(23);
    expect(g1.filter((part) => part.kind === 'face')).toHaveLength(11);
    expect(g1.filter((part) => part.kind === 'face').slice(0, 2).map(row)).toEqual([
      ['28072a7d-e691-40d1-a005-4d0ed1c9e825:rleft', 'face', 0.8125, 4.125, 14.125, 85.75, 25.0625, 25.875, true],
      ['28072a7d-e691-40d1-a005-4d0ed1c9e825:rright', 'face', 15.0625, 4.125, 14.125, 85.75, 25.0625, 25.875, true],
    ]);
    const g2 = partsOf(room('G2 Face frame kitchen'), 0);
    expect(g2).toHaveLength(27);
    expect(row(byId(g2, '352bd8c0-79a1-4210-a428-cfe95038118f:rleft')))
      .toEqual(['352bd8c0-79a1-4210-a428-cfe95038118f:rleft', 'face', 51.75, 5.75, 11.5, 61.25, 25, 25.8125, true]);
  });

  it('shelves: the back panel at the back of its cell, each shelf in front of it', () => {
    const top = '87b307e7-2f67-48a7-a80e-a52d4249d55b';
    const copy = structuredClone(stored('G4 T-filler run'));
    copy.walls[0].runs[0].grid.cells[1].node.cells[0].node = { id: top, kind: 'shelves', shelves: { count: 1, back: true } };
    const synced = syncRoom(copy, settings);
    const parts = partsOf(synced, 0);
    expect(parts.filter((part) => part.id.startsWith(`${top}:`)).map(row)).toEqual([
      [`${top}:back`, 'panel', 48.75, 64, 35, 26, 0, 0.75, false],
      [`${top}:shelf-1`, 'shelf', 48.75, 76.25, 35, 1.5, 0.75, 24, false],
    ]);
    expect(byId(parts, top)).toBeUndefined();
  });
```

**Count:** 874 + 2 = **876**.

---

## §7 Step 317 — designer: the payload carries parts

**`src/elevation/model/drawingPayload.js`:** each elevation record gets `parts: elevationParts(room, wall, side, settings)` as its last field (`settings` is now used: drop `void settings;`). Update the doc comment: round 41 adds each face's parts. `DRAWING_PAYLOAD_VERSION` stays 1.

**`src/elevation/model/__tests__/drawingPayload.test.js`:**
- add `import { elevationParts } from '../elevationParts.js';`;
- add, above the `describe`:

```js
/** The round-40 fields only, so the first test keeps checking just those. */
const withoutParts = (payload) => ({
  ...payload,
  elevations: payload.elevations.map((elevation) => {
    const copy = { ...elevation };
    delete copy.parts;
    return copy;
  }),
});
```

- in the first test, wrap the G1 call: `expect(withoutParts(toDrawingPayload(room('G1 Euro kitchen'), settings))).toEqual({` (the expected object is unchanged);
- append inside the `describe`:

```js
  it('SPEC-41 carries each wall face\'s parts', () => {
    const synced = room('G1 Euro kitchen');
    const payload = toDrawingPayload(synced, settings);
    expect(payload.elevations.map((elevation) => elevation.parts.length)).toEqual([23, 22, 9, 9]);
    for (const elevation of payload.elevations) {
      const wall = synced.walls.find((candidate) => candidate.id === elevation.wallId);
      expect(elevation.parts).toEqual(elevationParts(synced, wall, elevation.side, settings));
    }
  });
```

**Count:** 876 + 1 = **877**. Gate: `npm test && npm run lint && npm run build`.

**End-to-end check (Kyle):** API and designer running as in round 40. *Export DXF* on G1: open `elevation-A.dxf`. You should see the tall's two doors with its box and end panels, the base's doors, boxes and right filler, and the upper's doors. Layers CABINETS, FACES, FILLERS, PANELS; HIDDEN empty (nothing in G1 A hides another part). On G2 A (face frame): frames with their openings, inset doors, no box lines, and the mitered end panels' inner edges dashed on HIDDEN. On G4: T-fillers over the seams with no box lines under them. On G3 Wall 2: the base fillers' edges behind the alcove side panels are dashed.
