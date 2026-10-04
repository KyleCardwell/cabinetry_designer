# Round 42 — SPEC: run bands in the elevation DXF

Steps 318–323. Two repos: `cabinetry_designer_geometry` (318–319), then `cabinetry_designer` (320–323). The API doesn't change.
Drawing rounds: 40 plumbing → 41 elevation parts + hidden lines → **42 run bands** → 42.1 wall things → 42.2 corner profiles → 43 elevation dimensions → 44 plan → 45 plan dimensions and labels.

**Done when:** *Export DXF* on G1 gives elevations that also draw each run's toe kick, countertop or wood top, top mold and crown, and the parts below a run, on `COUNTERTOPS` and `MOLDINGS`. A chip detail shows as a line across its end panel or filler. The canvas and the DXF draw the bands from one model function, and a band only runs past a run end that is free.

| Step | Repo | What | Tests after |
|---|---|---|---|
| **318** | geometry | `hlr.py`: detail lines inside a shape; shapes whose hidden edges are left out | 18 → **20** |
| **319** | geometry | Band kinds, `lines`, `profileId`; `COUNTERTOPS` and `MOLDINGS` layers | **23** |
| **320** | designer | `runBands`: RunGroup's band code moved into the model, behavior unchanged | 877 → **880** |
| **321** | designer | Band ends: past a free end by the band's projection, stopped at a wall or joined run; `bandDepths` setting | **883** |
| **322** | designer | `bandParts(room, wall, side, settings)`: bands as parts with depths | **886** |
| **323** | designer | Chip lines on part records; the payload carries the bands | **887** |

Codex writes the code. This SPEC gives contracts, rules and tests. The literal test values were read from the golden fixture with today's model and a reference build of these rules, and the geometry values were checked with shapely 2.1 and ezdxf. If a test fails, fix the code, not the number, unless the number contradicts a rule here. In that case stop and say so.

---

## §1 Decisions (Kyle, 2026-10-04)

- **42 is split.** 42 = run bands (toe kick, countertop / wood top, top mold, crown, parts below a run, chip lines). 42.1 = wall things (wall end panels, openings and casing, soffits, recesses, wing walls). 42.2 = neighbour-run profiles at corners. Until 42.2, the blind box extension into a corner (G1 elevation B) still draws solid.
- **Band ends.** Each band runs past a **free** end by its own projection, and a toe kick stops short of one by its setback. It stops at the run end when that end is **closed**: against a wall, against the side of the recess the run sits in, or joined to a run that carries the band on. Over a wall end panel, a top runs past the panel. A blind panel still takes every band to the wall. This changes the canvas too: today it always runs the countertop 1" past both ends and insets the toe kick 3" at both.
- **Band depths** (placeholders until profiles, as one setting `bandDepths`): toe kick **3"** back from the box front; countertop **3/4"** past the faces; top mold **1/4"** and crown **3"** past the faces. "The faces" is `frontDepth(run)`: the door face, or the frame face on a face frame run. The countertop end overhang uses the same 3/4", so a free end changes from 1" to 3/4".
- **Parts below a run** are flush with the boxes (`front` = box front), so a light rail or panel the doors cover is dashed behind them (the round 41 rule). A part the doors don't cover is drawn in full.
- **Toe kicks, top molds and crowns are never dashed.** Their hidden edges are left out, e.g. the top mold's top behind the crown.
- **Layers (Kyle):** countertops and wood tops on `COUNTERTOPS`. Toe kick, top mold, crown, light rail, light trough, bottom cap and corbels on `MOLDINGS`. A panel below a run is a `panel` on `PANELS`. A chip line goes on its part's layer.
- **Detail lines.** A part can carry `lines` (`[{x1, z1, x2, z2}]`), drawn inside it and hidden like its outline. Chip lines use them now. Profile step lines will use them later.
- **`profileId`** is optional on every part and geometry ignores it. The designer doesn't send it yet (no profiles exist), so a payload still round-trips exactly.
- **Known for now:** corbels draw as their band's outline (no corbel shape yet). Two flush parts with equal `front` that share an edge both draw it (e.g. a bottom cap under an upper's boxes). A part below a run that the doors overlap by their 1/8" bottom reveal shows that top edge dashed (G6's bottom cap). Say if you'd rather those weren't dashed.

---

## §2 The new part records

Same record as round 41 (`id, kind, runId, x, z, width, height, back, front, coversBoxEdges`), with new kinds:

| Kind | `id` | `back` | `front` | Layer |
|---|---|---|---|---|
| `toe_kick` | `${run.id}:toe_kick` | run back | box front − toe kick setback | MOLDINGS |
| `countertop` (stone or wood) | `${run.id}:countertop` | run back | faces + countertop overhang | COUNTERTOPS |
| `top_mold` | `${run.id}:top_mold` | run back | faces + top mold projection | MOLDINGS |
| `crown` | `${run.id}:crown` | run back | faces + crown projection | MOLDINGS |
| `light_rail`, `light_trough`, `bottom_cap`, `corbels` | the stored part's id | run back | box front | MOLDINGS |
| `panel` (below a run) | the stored part's id | run back | box front | PANELS |

Run back = `runBackOffset(run)`; box front = run back + `run.depth`; faces = `frontDepth(run, settings)`. Every band has `coversBoxEdges: false`.

Optional fields on any part, after `coversBoxEdges` (frames keep `holes` last before them): `lines: [{ x1, z1, x2, z2 }]` (only when non-empty) and `profileId` (not sent this round).

---

## §3 Step 318 — geometry: detail lines and never-dashed shapes

**`src/projection/hlr.py`** (69 lines). `HlrShape` gains two fields, last:

```python
    drop_hidden: bool = False   # hidden edges are left out, never dashed (SPEC-42)
    lines: tuple = ()           # detail lines inside the shape: ((x1, z1), (x2, z2)) pairs
```

In `hidden_line_removal`:
- `edges` = the polygon's boundary, and when `shape.lines` is non-empty, `unary_union([boundary, *(LineString(line) for line in shape.lines)])`. Everything after that is unchanged, so a detail line is visible, hidden or dashed exactly like the outline.
- When `shape.drop_hidden`, hidden is `[]` (skip the dashing step).

Update the module docstring's first line only if you like. Nothing else changes.

**Append to `tests/test_hlr.py`**, verbatim:

```python


def test_detail_lines_are_drawn_and_hidden_like_the_outline():
    chip = (((0, 0.125), (3, 0.125)),)
    visible, hidden = _run(HlrShape("panel", rect_polygon(0, 0, 3, 30), 24.875, lines=chip))["panel"]
    assert _length(visible) == pytest.approx(69)  # 66 of outline + the 3" chip line
    assert hidden == []
    visible, hidden = _run(
        HlrShape("panel", rect_polygon(0, 0, 3, 30), 24.875, lines=chip),
        HlrShape("door", rect_polygon(2, -1, 10, 30), 25.6875, covers_box_edges=True),
    )["panel"]
    assert _length(visible) == pytest.approx(38)
    assert _length(hidden) == pytest.approx(31)
    assert any(
        sorted([line.start.x, line.end.x]) == pytest.approx([2, 3])
        and [line.start.y, line.end.y] == pytest.approx([0.125, 0.125])
        for line in hidden
    )


def test_drop_hidden_leaves_hidden_edges_out_instead_of_dashing_them():
    crown = HlrShape("crown", rect_polygon(0, 91.5, 33, 4.5), 28.875)
    visible, hidden = _run(
        HlrShape("mold", rect_polygon(0, 90, 30.25, 3), 26.125, drop_hidden=True), crown,
    )["mold"]
    assert _length(visible) == pytest.approx(33.25)  # its bottom and its sides below the crown
    assert hidden == []
    dashed = HlrShape("mold", rect_polygon(0, 90, 30.25, 3), 26.125)
    assert _length(_run(dashed, crown)["mold"][1]) == pytest.approx(31.75)
```

**Count:** 18 + 2 = **20**.

---

## §4 Step 319 — geometry: band kinds, lines and layers

**`src/drawing/models.py`** (60 lines): add, before `PayloadPart`:

```python
class PayloadLine(BaseModel):
    model_config = ConfigDict(extra="forbid")

    x1: float
    z1: float
    x2: float
    z2: float
```

In `PayloadPart`, `kind` becomes:

```python
    kind: Literal[
        "cabinet", "face", "filler", "end_panel", "panel", "frame", "shelf",
        "toe_kick", "countertop", "top_mold", "crown",
        "light_rail", "light_trough", "bottom_cap", "corbels",
    ]
```

and after `holes`:

```python
    lines: list[PayloadLine] = []
    profileId: str | None = None
```

**`src/drawing/elevation_dxf.py`** (70 lines):
- `KIND_LAYERS` adds `toe_kick`, `top_mold`, `crown`, `light_rail`, `light_trough`, `bottom_cap`, `corbels` → `"MOLDINGS"` and `countertop` → `"COUNTERTOPS"`.
- Below it: `NEVER_DASHED = {"toe_kick", "top_mold", "crown"}` with the comment `# Kinds whose hidden edges are left out rather than dashed (SPEC-42).`
- Each `HlrShape` also gets `drop_hidden=part.kind in NEVER_DASHED` and `lines=tuple(((line.x1, line.z1), (line.x2, line.z2)) for line in part.lines)`.

**`src/dxf/writer.py`** (102 lines): in `LAYER_DEFS`, after `SHELVES`:

```python
    "COUNTERTOPS": (9, "CONTINUOUS"),
    "MOLDINGS":   (1, "CONTINUOUS"),
```

**NEW `tests/fixtures/g6_bands_payload.json`**: G6's upper run with doors flush above its bottom cap (chip lines on its filler and end panel), one of its boxes with two doors, its top mold and crown, and the base's toe kick and countertop. Verbatim:

```json
{
  "payloadVersion": 1,
  "units": "in",
  "room": { "id": "5190a91c-dade-43ce-befe-1bf15e1dc48c", "name": "G6 Stacked runs" },
  "elevations": [
    {
      "key": "e6ce8769-be99-492d-aca7-ef6355773749", "letter": "A", "wallId": "e6ce8769-be99-492d-aca7-ef6355773749",
      "side": "front", "title": "Elevation A", "wallLabel": "Wall 2", "length": 200, "height": 96,
      "parts": [
        {"id": "34113be7-b355-4f9a-bd22-f13c3c4060d8", "kind": "cabinet", "runId": "ea4373b3-87f2-4f39-a7cc-2c829c839832", "x": 2.75, "z": 54, "width": 32.5, "height": 36, "back": 0, "front": 12, "coversBoxEdges": false},
        {"id": "ea4373b3-87f2-4f39-a7cc-2c829c839832:left", "kind": "filler", "runId": "ea4373b3-87f2-4f39-a7cc-2c829c839832", "x": 0, "z": 54, "width": 2.75, "height": 36, "back": 12.0625, "front": 12.875, "coversBoxEdges": true, "lines": [{"x1": 0, "z1": 54.125, "x2": 2.75, "z2": 54.125}]},
        {"id": "ea4373b3-87f2-4f39-a7cc-2c829c839832:right", "kind": "end_panel", "runId": "ea4373b3-87f2-4f39-a7cc-2c829c839832", "x": 100.25, "z": 54, "width": 0.75, "height": 36, "back": 0, "front": 12.875, "coversBoxEdges": false, "lines": [{"x1": 100.25, "z1": 54.125, "x2": 101, "z2": 54.125}]},
        {"id": "34113be7-b355-4f9a-bd22-f13c3c4060d8:rleft", "kind": "face", "runId": "ea4373b3-87f2-4f39-a7cc-2c829c839832", "x": 2.8125, "z": 54.125, "width": 16.125, "height": 35.75, "back": 12.0625, "front": 12.875, "coversBoxEdges": true},
        {"id": "34113be7-b355-4f9a-bd22-f13c3c4060d8:rright", "kind": "face", "runId": "ea4373b3-87f2-4f39-a7cc-2c829c839832", "x": 19.0625, "z": 54.125, "width": 16.125, "height": 35.75, "back": 12.0625, "front": 12.875, "coversBoxEdges": true},
        {"id": "677ec7a5-d97a-4cfd-8843-f960e3334ea2:toe_kick", "kind": "toe_kick", "runId": "677ec7a5-d97a-4cfd-8843-f960e3334ea2", "x": 0, "z": 0, "width": 98, "height": 4, "back": 0, "front": 21, "coversBoxEdges": false},
        {"id": "677ec7a5-d97a-4cfd-8843-f960e3334ea2:countertop", "kind": "countertop", "runId": "677ec7a5-d97a-4cfd-8843-f960e3334ea2", "x": 0, "z": 34.5, "width": 101.75, "height": 1.5, "back": 0, "front": 25.625, "coversBoxEdges": false},
        {"id": "c77d332c-1c0f-46ec-80a7-269fd9db569b", "kind": "bottom_cap", "runId": "ea4373b3-87f2-4f39-a7cc-2c829c839832", "x": 0, "z": 52.5, "width": 101, "height": 1.5, "back": 0, "front": 12, "coversBoxEdges": false},
        {"id": "ea4373b3-87f2-4f39-a7cc-2c829c839832:top_mold", "kind": "top_mold", "runId": "ea4373b3-87f2-4f39-a7cc-2c829c839832", "x": 0, "z": 90, "width": 101.25, "height": 3, "back": 0, "front": 13.125, "coversBoxEdges": false},
        {"id": "ea4373b3-87f2-4f39-a7cc-2c829c839832:crown", "kind": "crown", "runId": "ea4373b3-87f2-4f39-a7cc-2c829c839832", "x": 0, "z": 91.5, "width": 104, "height": 4.5, "back": 0, "front": 15.875, "coversBoxEdges": false}
      ]
    }
  ]
}
```

**NEW `tests/test_elevation_bands.py`** (3 tests), verbatim:

```python
"""Bands, detail lines and the countertop/molding layers (SPEC-42)."""

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
PAYLOAD = json.loads((ROOT / "tests" / "fixtures" / "g6_bands_payload.json").read_text())


def _archive(payload):
    return zipfile.ZipFile(io.BytesIO(base64.b64decode(draw(payload)["zip_base64"])))


def _modelspace(payload):
    dxf = _archive(payload).read("elevation-A.dxf").decode("utf-8")
    return ezdxf.read(io.StringIO(dxf)).modelspace()


def _lines(msp, layer):
    return list(msp.query(f'LINE[layer=="{layer}"]'))


def _length(lines):
    return sum(line.dxf.start.distance(line.dxf.end) for line in lines)


def test_bands_draw_on_countertops_and_moldings():
    msp = _modelspace(PAYLOAD)
    assert len(_lines(msp, "COUNTERTOPS")) == 4
    assert _length(_lines(msp, "COUNTERTOPS")) == pytest.approx(206.5)
    assert len(_lines(msp, "MOLDINGS")) == 15  # toe kick 4, bottom cap 4, top mold 3, crown 4
    assert _length(_lines(msp, "MOLDINGS")) == pytest.approx(726.75)
    assert _lines(msp, "HIDDEN") == []  # the top mold behind the crown is left out, not dashed


def test_chip_lines_draw_on_their_parts_layer():
    msp = _modelspace(PAYLOAD)
    for layer, span in (("FILLERS", [0, 2.75]), ("PANELS", [100.25, 101])):
        chips = [
            line for line in _lines(msp, layer)
            if line.dxf.start.y == pytest.approx(54.125) and line.dxf.end.y == pytest.approx(54.125)
        ]
        assert len(chips) == 1
        assert sorted([chips[0].dxf.start.x, chips[0].dxf.end.x]) == pytest.approx(span)


def test_profile_ids_pass_through_and_bad_parts_are_rejected():
    payload = copy.deepcopy(PAYLOAD)
    payload["elevations"][0]["parts"][-1]["profileId"] = "crown-4-1-2"
    assert _length(_lines(_modelspace(payload), "MOLDINGS")) == pytest.approx(726.75)
    stored = json.loads(_archive(payload).read("payload.json"))
    assert stored["elevations"][0]["parts"][-1]["profileId"] == "crown-4-1-2"
    for patch in ({"kind": "trim"}, {"lines": [{"x1": 0, "z1": 0, "x2": 1, "z2": 0, "layer": "X"}]}):
        bad = copy.deepcopy(PAYLOAD)
        bad["elevations"][0]["parts"][0].update(patch)
        with pytest.raises(ValidationError):
            draw(bad)
```

(MOLDINGS: the bottom cap loses the 2.75" and 3/4" of its top edge that lie on the filler's and end panel's bottoms; the top mold keeps only its bottom and the 1 1/2" of each side below the crown.)

**`README.md`** (58 lines): add the new kinds to the Layers table (`countertop` → `COUNTERTOPS`; `toe_kick`, `top_mold`, `crown`, `light_rail`, `light_trough`, `bottom_cap`, `corbels` → `MOLDINGS`), and one sentence under it: "A part's `lines` are detail lines drawn inside it and hidden like its outline; toe kicks, top molds and crowns are never dashed (their hidden edges are left out); `profileId` is accepted and ignored until profiles exist (SPEC-42)."

**Count:** 20 + 3 = **23**. The round 40 and 41 tests still pass unchanged.

---

## §5 Step 320 — designer: `runBands` (RunGroup's band code, moved)

A pure move. Nothing the canvas draws changes.

**NEW `src/elevation/model/runBands.js`:**

```js
/**
 * The bands around a run (SPEC-42): its toe kick, its top (countertop, or top mold and crown), the
 * parts below it, and the chip lines on its end panels and fillers, in elevation coordinates. The
 * canvas and the DXF both draw from it. `wall` is the resolved wall face; `scene` is runScene's.
 */
export function runBands(room, wall, run, settings, scene) { … }
```

Returns `{ top, toeKick, countertop, topMold, crown, bottomParts, chipLines }`:

| Field | Value |
|---|---|
| `top` | `runTop(wall, run, profile)` with `profile = resolveProfile(settings, room, wall)` |
| `toeKick` | `{ x, z: 0, width, height }` or `null`. `height` = `run.overrides?.toeKickHeight ?? profile.toeKickHeight`. Null unless the run is a base or tall with no `run.stack?.below` **and** width > 0 |
| `countertop` | `{ x, z: boxTop, width, height: top.height }` when `top.kind` is `'stone'` or `'wood'`, else `null` |
| `topMold` | `{ x, z: boxTop, width, height: profile.topMoldHeight }` when `top.kind` is `'crown'` or `'topMold'`, else `null` |
| `crown` | `{ x, z: boxTop + profile.crownStackHeight − profile.crownHeight, width, height: profile.crownHeight }` when `top.kind === 'crown'`, else `null` |
| `bottomParts` | `runBottomParts(run)` mapped to `{ id, kind, doors, x: span.start, z: part.z, width: span.end − span.start, height: part.height }` |
| `chipLines` | when `scene.endBottom.chip > 0`: for each of `scene.drawnPieces` with kind `filler` or `end_panel`, not `extend?.down` and not in `scene.hiddenIds`: `{ pieceId: piece.id, x1: piece.x, x2: piece.x + piece.width, z: piece.z + chip }`; otherwise `[]` |

`boxTop = run.z + run.height`. The x spans are today's RunGroup rules, word for word: `panelStart`/`panelEnd` from `scene.panelBySide` (the blind panels); `bandStart(inset) = panelStart ?? run.x + inset`, `bandEnd(inset) = panelEnd ?? runEnd − inset`. Toe kick inset `Math.min(3, run.width / 2)`, countertop inset `−1`, top mold and crown inset `0`. `span = bottomPartSpan(run, scene.drawnPieces, { start: bandStart(0), end: bandEnd(0) }, scene.endBottom.chip > 0)`. Imports: `bottomPartSpan`, `runBottomParts` from `./bottoms.js`, `CABINET_TYPE_IDS` from `./constants.js`, `resolveProfile` from `./profile.js`, `runTop` from `./tops.js`. Export from `model/index.js` (one line at the end).

**`src/elevation/components/RunGroup.jsx`** (526 lines). It draws from `runBands`:
- Imports: drop `bottomPartSpan, runBottomParts` (bottoms.js), `resolveProfile`, `runTop` and `CABINET_TYPE_IDS` (keep `KIND_COLORS`); add `import { runBands } from '../model/runBands.js';`.
- Destructuring from `scene` drops `panelBySide` and `endBottom`.
- Replace everything from `const runEnd = run.x + run.width;` through the end of the `chipLines` declaration with:

```js
  const bands = useMemo(
    () => runBands(room, wall, run, settings, scene),
    [room, run, scene, settings, wall],
  );
  const toScreen = (rect) => rect && wallRectToScreen(rect, transform);
  const toeKick = toScreen(bands.toeKick);
  const countertop = toScreen(bands.countertop);
  const topMold = toScreen(bands.topMold);
  const crown = toScreen(bands.crown);
  const bottomParts = bands.bottomParts.map((part) => ({ ...part, rect: toScreen(part) }));
  const chipLines = bands.chipLines.map((line) => {
    const from = wallToScreen({ x: line.x1, z: line.z }, transform);
    const to = wallToScreen({ x: line.x2, z: line.z }, transform);
    return { key: `chip:${line.pieceId}`, points: [from.x, from.y, to.x, to.y] };
  });
```

- Delete the block from `const hasToeKick = …` through the `countertop` declaration (just above `const runRect = …`).
- In the JSX: `{hasToeKick && toeKickWidth > 0 && (` → `{toeKick && (`; `{(top.kind === 'stone' || top.kind === 'wood') && (` → `{countertop && (`; its fill reads `bands.top.kind === 'wood'`; `{(top.kind === 'crown' || top.kind === 'topMold') && (` → `{topMold && (`; `{top.kind === 'crown' && (` → `{crown && (`. The bottom part and chip line JSX is unchanged.

**NEW `src/elevation/model/__tests__/runBands.test.js`**, verbatim (step 321 replaces it):

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runBands } from '../runBands.js';
import { resolveWall, syncRoom } from '../room.js';
import { runScene } from '../runScene.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);

/** runBands for every run on one wall face, keyed by the first 8 characters of the run id. */
function bandsOf(room, wallIndex, side = 'front', using = settings) {
  const view = resolveWall(room, room.walls[wallIndex], side);
  return Object.fromEntries(view.runs.map((run) => [
    run.id.slice(0, 8),
    runBands(room, view, run, using, runScene(room, view, run, using)),
  ]));
}
const span = (rect) => rect && [rect.x, rect.width];

describe('SPEC-42 run bands', () => {
  it('gives each run the toe kick, top and moldings the canvas draws today (G1 elevation A)', () => {
    const bands = bandsOf(syncRoom(stored('G1 Euro kitchen'), settings), 0);
    expect(bands.b38f2f11).toEqual({
      top: { kind: 'crown', height: 6 },
      toeKick: { x: 3, z: 0, width: 24, height: 4 },
      countertop: null,
      topMold: { x: 0, z: 90, width: 30, height: 3 },
      crown: { x: 0, z: 91.5, width: 30, height: 4.5 },
      bottomParts: [],
      chipLines: [],
    });
    expect(bands.b822e8ac.toeKick).toEqual({ x: 33, z: 0, width: 107.125, height: 4 });
    expect(bands.b822e8ac.countertop).toEqual({ x: 29, z: 34.5, width: 115.125, height: 1.5 });
    expect([bands.b822e8ac.topMold, bands.b822e8ac.crown]).toEqual([null, null]);
    expect(bands['434f1164'].toeKick).toBeNull();
    expect(span(bands['434f1164'].topMold)).toEqual([108.5, 46.625]);
    expect(span(bands['434f1164'].crown)).toEqual([108.5, 46.625]);
  });

  it('lists the parts below a run; a run held between two others gets no bands (G6)', () => {
    const bands = bandsOf(syncRoom(stored('G6 Stacked runs'), settings), 1);
    expect(bands.ea4373b3.bottomParts).toEqual([{
      id: 'c77d332c-1c0f-46ec-80a7-269fd9db569b', kind: 'bottom_cap', doors: 'visible',
      x: 0, z: 52.5, width: 100.25, height: 1.5,
    }]);
    expect(bands.b1ec1b4a).toEqual({
      top: { kind: 'none', height: 0 },
      toeKick: null,
      countertop: null,
      topMold: null,
      crown: null,
      bottomParts: [],
      chipLines: [],
    });
    expect(bands['01a2a0e1'].top).toEqual({ kind: 'wood', height: 1.5 });
    expect(span(bands['01a2a0e1'].countertop)).toEqual([127.5, 73.5]);
  });

  it('puts a chip line on each end panel and filler when the doors stop flush above a part', () => {
    const copy = structuredClone(stored('G6 Stacked runs'));
    copy.walls[1].runs.find(({ id }) => id.startsWith('ea4373b3')).bottom[0].doors = 'flush';
    const bands = bandsOf(syncRoom(copy, settings), 1);
    expect(bands.ea4373b3.chipLines).toEqual([
      { pieceId: 'ea4373b3-87f2-4f39-a7cc-2c829c839832:left', x1: 0, x2: 2.75, z: 54.125 },
      { pieceId: 'ea4373b3-87f2-4f39-a7cc-2c829c839832:right', x1: 100.25, x2: 101, z: 54.125 },
    ]);
    // Flush doors: the part runs under the end panels.
    expect(span(bands.ea4373b3.bottomParts[0])).toEqual([0, 101]);
  });
});
```

**Count:** 877 + 3 = **880**. Golden snapshot unchanged.

---

## §6 Step 321 — designer: band ends and band depths

**`src/elevation/model/constants.js`** (131 lines): in `DEFAULT_SETTINGS`, right after `bottomPartHeights`:

```js
  bandDepths: { toeKickSetback: 3, countertopOverhang: 0.75, topMoldProjection: 0.25, crownProjection: 3 },
```

Don't touch `persistence.js`: the setting is always read through `bandDepths(settings)`, which fills in what's missing.

**`src/elevation/model/runBands.js`:**

```js
/** The shop's band depths (SPEC-42): settings.bandDepths over the defaults. */
export function bandDepths(settings) {
  return { ...DEFAULT_SETTINGS.bandDepths, ...settings?.bandDepths };
}
```

and a private helper that says how a band ends on one side. Write it as given:

```js
const EPSILON = 1e-6;

function hasToeKick(run) {
  return !run.stack?.below
    && (run.cabinetTypeId === CABINET_TYPE_IDS.BASE || run.cabinetTypeId === CABINET_TYPE_IDS.TALL);
}

/**
 * How a band ends on one side of a run (SPEC-42): 'panel' over a wall end panel, 'closed' against a
 * wall, the side of the recess the run sits in, or a joined run that carries the band on (as tall
 * for a top, with its own toe kick for a toe kick), otherwise 'free'. `band` is 'toeKick' or 'top'.
 */
function bandEnd(room, wall, run, side, band, settings) {
  const anchor = run.anchors?.[side];
  if (anchor === true) {
    return band === 'top' && wallEndPanelAt(room, wall, side, settings) ? 'panel' : 'closed';
  }
  if (anchor?.to === 'wall') return 'closed';
  if (anchor?.to === 'recess') return run._plane?.recessId === anchor.recessId ? 'closed' : 'free';
  if (!isJointAnchor(anchor)) return 'free';
  const boxTop = run.z + run.height;
  const carries = jointMembers(wall, anchor.jointId)
    .filter((member) => member.runId !== run.id && member.side !== side)
    .map((member) => wall.runs.find((candidate) => candidate.id === member.runId))
    .some((other) => other && (band === 'toeKick'
      ? hasToeKick(other)
      : other.z + other.height >= boxTop - EPSILON));
  return carries ? 'closed' : 'free';
}
```

New imports: `DEFAULT_SETTINGS` (constants.js, beside `CABINET_TYPE_IDS`), `isJointAnchor`, `jointMembers` from `./joints.js`, `wallEndPanelAt` from `./wallSides.js`.

The rectangles' x spans now follow these rules. `depths = bandDepths(settings)`. Each band has a **past** distance: toe kick `−Math.min(depths.toeKickSetback, run.width / 2)` (it stops short), countertop `depths.countertopOverhang`, top mold `depths.topMoldProjection`, crown `depths.crownProjection`. The toe kick uses `bandEnd(…, 'toeKick', …)`. The countertop, top mold and crown use `'top'`. For each side:

| End | Left edge | Right edge |
|---|---|---|
| blind panel on that side (`panelStart` / `panelEnd`, as today) | `panelStart` | `panelEnd` |
| `'panel'` (a top over a wall end panel) | `0 − past` | `wall.length + past` |
| `'closed'` | `run.x` | `run.x + run.width` |
| `'free'` | `run.x − past` | `run.x + run.width + past` |

Heights, z values, `top`, `bottomParts` and `chipLines` don't change. `bottomParts` keeps `span` from `{ start: panelStart ?? run.x, end: panelEnd ?? runEnd }` (the old `bandStart(0)` / `bandEnd(0)`). The toe kick is still null when its width is ≤ 0. Extend the JSDoc with: "At a free end a band runs past the run by its projection (a toe kick stops short by its setback); over a wall end panel a top runs past the panel; a blind panel takes every band to the wall."

`model/index.js`: the runBands line becomes `export { bandDepths, runBands } from './runBands.js';`.

**Replace `src/elevation/model/__tests__/runBands.test.js`** with, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bandDepths, runBands } from '../runBands.js';
import { resolveWall, syncRoom } from '../room.js';
import { runScene } from '../runScene.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);

/** runBands for every run on one wall face, keyed by the first 8 characters of the run id. */
function bandsOf(room, wallIndex, side = 'front', using = settings) {
  const view = resolveWall(room, room.walls[wallIndex], side);
  return Object.fromEntries(view.runs.map((run) => [
    run.id.slice(0, 8),
    runBands(room, view, run, using, runScene(room, view, run, using)),
  ]));
}
const span = (rect) => rect && [rect.x, rect.width];

describe('SPEC-42 run bands', () => {
  it('runs a band past a free end by its projection and stops it at a wall or a joined run (G1 elevation A)', () => {
    const bands = bandsOf(syncRoom(stored('G1 Euro kitchen'), settings), 0);
    // The tall: wall on the left; joined on the right to a lower base, so its top returns there.
    expect(bands.b38f2f11).toEqual({
      top: { kind: 'crown', height: 6 },
      toeKick: { x: 0, z: 0, width: 30, height: 4 },
      countertop: null,
      topMold: { x: 0, z: 90, width: 30.25, height: 3 },
      crown: { x: 0, z: 91.5, width: 33, height: 4.5 },
      bottomParts: [],
      chipLines: [],
    });
    // The base: joined to the taller tall on the left, wall on the right.
    expect(bands.b822e8ac.toeKick).toEqual({ x: 30, z: 0, width: 113.125, height: 4 });
    expect(bands.b822e8ac.countertop).toEqual({ x: 30, z: 34.5, width: 113.125, height: 1.5 });
    // The upper: free on the left (end panel), wall on the right.
    expect(span(bands['434f1164'].topMold)).toEqual([108.25, 46.875]);
    expect(span(bands['434f1164'].crown)).toEqual([105.5, 49.625]);
  });

  it('runs a top past a wall end panel; a toe kick stops at the run (G1 island, G2 peninsula)', () => {
    const g1 = syncRoom(stored('G1 Euro kitchen'), settings);
    for (const side of ['front', 'back']) {
      const [island] = Object.values(bandsOf(g1, 3, side));
      expect(span(island.toeKick)).toEqual([0.75, 90]);
      expect(span(island.countertop)).toEqual([-0.75, 93]);
    }
    const g2 = syncRoom(stored('G2 Face frame kitchen'), settings);
    expect(span(bandsOf(g2, 1)['4b49c071'].countertop))
      .toEqual([24.8125, 54.4375]);
    expect(span(bandsOf(g2, 1, 'back')['2c8ab1e3'].countertop)).toEqual([-0.75, 79.25]);
  });

  it('a side of the recess a run sits in closes its ends; a free end with a filler or end panel does not (G5, G6)', () => {
    const g5 = bandsOf(syncRoom(stored('G5 Recess room'), settings), 1);
    expect(span(g5['1549b66c'].countertop)).toEqual([42.25, 37.75]);
    expect(span(g5.e9abb5dc.countertop)).toEqual([140, 48]);
    expect(span(g5.e9abb5dc.toeKick)).toEqual([140, 48]);
    const g6 = bandsOf(syncRoom(stored('G6 Stacked runs'), settings), 1);
    expect(span(g6['677ec7a5'].toeKick)).toEqual([0, 98]);
    expect(span(g6['677ec7a5'].countertop)).toEqual([0, 101.75]);
    expect(span(g6['01a2a0e1'].countertop)).toEqual([127.75, 72.25]);
    expect(span(g6.ea4373b3.crown)).toEqual([0, 104]);
  });

  it('reads the shop\'s band depths from settings over the defaults', () => {
    expect(bandDepths(settings)).toEqual({
      toeKickSetback: 3, countertopOverhang: 0.75, topMoldProjection: 0.25, crownProjection: 3,
    });
    const wider = { ...settings, bandDepths: { countertopOverhang: 1 } };
    expect(bandDepths(wider).toeKickSetback).toBe(3);
    const g6 = bandsOf(syncRoom(stored('G6 Stacked runs'), wider), 1, 'front', wider);
    expect(span(g6['677ec7a5'].countertop)).toEqual([0, 102]);
  });

  it('lists the parts below a run; a run held between two others gets no bands (G6)', () => {
    const bands = bandsOf(syncRoom(stored('G6 Stacked runs'), settings), 1);
    expect(bands.ea4373b3.bottomParts).toEqual([{
      id: 'c77d332c-1c0f-46ec-80a7-269fd9db569b', kind: 'bottom_cap', doors: 'visible',
      x: 0, z: 52.5, width: 100.25, height: 1.5,
    }]);
    expect(bands.b1ec1b4a).toEqual({
      top: { kind: 'none', height: 0 },
      toeKick: null,
      countertop: null,
      topMold: null,
      crown: null,
      bottomParts: [],
      chipLines: [],
    });
    expect(bands['01a2a0e1'].top).toEqual({ kind: 'wood', height: 1.5 });
  });

  it('puts a chip line on each end panel and filler when the doors stop flush above a part', () => {
    const copy = structuredClone(stored('G6 Stacked runs'));
    copy.walls[1].runs.find(({ id }) => id.startsWith('ea4373b3')).bottom[0].doors = 'flush';
    const bands = bandsOf(syncRoom(copy, settings), 1);
    expect(bands.ea4373b3.chipLines).toEqual([
      { pieceId: 'ea4373b3-87f2-4f39-a7cc-2c829c839832:left', x1: 0, x2: 2.75, z: 54.125 },
      { pieceId: 'ea4373b3-87f2-4f39-a7cc-2c829c839832:right', x1: 100.25, x2: 101, z: 54.125 },
    ]);
    // Flush doors: the part runs under the end panels.
    expect(span(bands.ea4373b3.bottomParts[0])).toEqual([0, 101]);
  });
});
```

What the cases show: G1's tall crown returns 3" past its joint with the lower base (33" wide). The island countertop runs 3/4" past both wall end panels (−3/4 to 92 1/4). G5's recess run is closed at both recess sides. G6's base runs 3/4" past its free end panel.

**Count:** 880 − 3 + 6 = **883**. Golden snapshot unchanged.

---

## §7 Step 322 — designer: `bandParts`

**NEW `src/elevation/model/bandParts.js`:**

```js
/**
 * The bands on one wall face as geometry draws them (SPEC-42): each run's toe kick, the parts below
 * it, then its countertop or its top mold and crown, with their depths from the wall face. Run by run
 * in view order. A part below a run is flush with the boxes; the toe kick sits back from them by its
 * setback; a top runs from the run's back to past its faces by its overhang or projection.
 */
export function bandParts(room, wall, side, settings) { … }
```

For `view = resolveWall(room, wall, side)` and each `run` of `view.runs`: `bands = runBands(room, view, run, settings, runScene(room, view, run, settings))`, `back = runBackOffset(run)`, `boxFront = back + run.depth`, `faces = frontDepth(run, settings)`, `depths = bandDepths(settings)`. Emit in this order, skipping a null rectangle or one with width or height ≤ 1e-6:

1. `${run.id}:toe_kick`, kind `toe_kick`, `front = boxFront − depths.toeKickSetback`;
2. each of `bands.bottomParts`: its `id`, kind = its `kind`, `front = boxFront`;
3. `${run.id}:countertop`, kind `countertop`, `front = faces + depths.countertopOverhang`;
4. `${run.id}:top_mold`, kind `top_mold`, `front = faces + depths.topMoldProjection`;
5. `${run.id}:crown`, kind `crown`, `front = faces + depths.crownProjection`.

Every record is `{ id, kind, runId: run.id, x, z, width, height, back, front, coversBoxEdges: false }`, with the rectangle from the band. Imports: `frontDepth`, `runBackOffset` from `./corners.js`, `bandDepths`, `runBands` from `./runBands.js`, `resolveWall` from `./room.js`, `runScene` from `./runScene.js`. Export from `model/index.js` (one line at the end).

**NEW `src/elevation/model/__tests__/bandParts.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bandParts } from '../bandParts.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const room = (name) => syncRoom(document.rooms.find((candidate) => candidate.name === name), settings);
const partsOf = (synced, wallIndex, side = 'front') => bandParts(synced, synced.walls[wallIndex], side, settings);
const row = ({ id, kind, x, z, width, height, back, front, coversBoxEdges }) => (
  [id, kind, x, z, width, height, back, front, coversBoxEdges]
);

const TALL = 'b38f2f11-5318-42f2-9d95-8b9b3d1b9087';
const BASE = 'b822e8ac-1a44-47ca-acec-ecb93caf7b8a';
const UPPER = '434f1164-3b6b-4a97-89e7-1c6438c4d95a';

describe('SPEC-42 band parts', () => {
  it('a toe kick sits back from the boxes; a top runs past the faces (G1 elevation A)', () => {
    const parts = partsOf(room('G1 Euro kitchen'), 0);
    expect(parts.map(row)).toEqual([
      [`${TALL}:toe_kick`, 'toe_kick', 0, 0, 30, 4, 0, 22, false],
      [`${TALL}:top_mold`, 'top_mold', 0, 90, 30.25, 3, 0, 26.125, false],
      [`${TALL}:crown`, 'crown', 0, 91.5, 33, 4.5, 0, 28.875, false],
      [`${BASE}:toe_kick`, 'toe_kick', 30, 0, 113.125, 4, 0, 21, false],
      [`${BASE}:countertop`, 'countertop', 30, 34.5, 113.125, 1.5, 0, 25.625, false],
      [`${UPPER}:top_mold`, 'top_mold', 108.25, 90, 46.875, 3, 0, 13.125, false],
      [`${UPPER}:crown`, 'crown', 105.5, 91.5, 49.625, 4.5, 0, 15.875, false],
    ]);
    expect(parts[0]).toEqual({
      id: `${TALL}:toe_kick`, kind: 'toe_kick', runId: TALL,
      x: 0, z: 0, width: 30, height: 4, back: 0, front: 22, coversBoxEdges: false,
    });
  });

  it('a face frame run\'s top runs past its frame; a recess run\'s bands sit back in the recess (G2, G5)', () => {
    const g2 = partsOf(room('G2 Face frame kitchen'), 0);
    const frameRun = 'a42e9a57-a98f-47f0-b6b4-9076b513db6e';
    expect(row(g2.find(({ id }) => id === `${frameRun}:crown`)))
      .toEqual([`${frameRun}:crown`, 'crown', 47, 91.5, 29.5, 4.5, 0, 28.8125, false]);
    const recessRun = 'e9abb5dc-e72c-44c9-ac96-d3279b7752d9';
    expect(partsOf(room('G5 Recess room'), 1).filter(({ runId }) => runId === recessRun).map(row)).toEqual([
      [`${recessRun}:toe_kick`, 'toe_kick', 140, 0, 48, 4, -24, -6, false],
      [`${recessRun}:countertop`, 'countertop', 140, 34.5, 48, 1.5, -24, -1.375, false],
    ]);
  });

  it('a part below a run is flush with its boxes; an outset run\'s bands move out with it (G6)', () => {
    const parts = partsOf(room('G6 Stacked runs'), 1);
    expect(parts.map(({ kind }) => kind)).toEqual([
      'toe_kick', 'countertop', 'bottom_cap', 'top_mold', 'crown', 'toe_kick', 'countertop',
    ]);
    expect(row(parts[2])).toEqual(['c77d332c-1c0f-46ec-80a7-269fd9db569b', 'bottom_cap', 0, 52.5, 100.25, 1.5, 0, 12, false]);
    const wood = '01a2a0e1-4bd1-434d-9c9b-66bc20ee7e54';
    expect(row(parts[6])).toEqual([`${wood}:countertop`, 'countertop', 127.75, 34.5, 72.25, 1.5, 8, 33.625, false]);
  });
});
```

**Count:** 883 + 3 = **886**. Golden snapshot unchanged.

---

## §8 Step 323 — designer: chip lines on parts, bands in the payload

**`src/elevation/model/elevationParts.js`** (144 lines): in each run, after `outset`, `const { chipLines } = runBands(room, view, run, settings, scene);` (import `runBands` from `./runBands.js`). In the fillers/end panels/panels loop, find `chip = chipLines.find((line) => line.pieceId === piece.id)`. When there is one, the record gets, last, `lines: [{ x1: chip.x1, z1: chip.z, x2: chip.x2, z2: chip.z }]`. Records without a chip get no `lines` key. Add to the doc comment: "An end panel or filler with a chip detail carries it as a detail line (SPEC-42)."

**`src/elevation/model/drawingPayload.js`** (44 lines): `parts: [...elevationParts(room, wall, side, settings), ...bandParts(room, wall, side, settings)]` (import `bandParts` from `./bandParts.js`). Doc comment: "round 41 adds each face's parts; round 42 its bands." `DRAWING_PAYLOAD_VERSION` stays 1.

**`src/elevation/model/__tests__/elevationParts.test.js`** (118 lines): append inside the `describe`, verbatim:

```js

  it('a chip line rides on each end panel and filler when the doors stop flush above a part (SPEC-42)', () => {
    const copy = structuredClone(stored('G6 Stacked runs'));
    copy.walls[1].runs.find(({ id }) => id.startsWith('ea4373b3')).bottom[0].doors = 'flush';
    const parts = partsOf(syncRoom(copy, settings), 1);
    const upper = 'ea4373b3-87f2-4f39-a7cc-2c829c839832';
    expect(byId(parts, `${upper}:left`).lines).toEqual([{ x1: 0, z1: 54.125, x2: 2.75, z2: 54.125 }]);
    expect(byId(parts, `${upper}:right`).lines).toEqual([{ x1: 100.25, z1: 54.125, x2: 101, z2: 54.125 }]);
    expect(partsOf(room('G6 Stacked runs'), 1).some((part) => 'lines' in part)).toBe(false);
  });
```

**`src/elevation/model/__tests__/drawingPayload.test.js`** (70 lines):
- add `import { bandParts } from '../bandParts.js';` above the `elevationParts` import;
- replace the whole `it('SPEC-41 carries each wall face\'s parts', …)` test with, verbatim:

```js
  it('SPEC-42 carries each wall face\'s parts, then its bands', () => {
    const synced = room('G1 Euro kitchen');
    const payload = toDrawingPayload(synced, settings);
    expect(payload.elevations.map((elevation) => elevation.parts.length)).toEqual([30, 26, 11, 11]);
    for (const elevation of payload.elevations) {
      const wall = synced.walls.find((candidate) => candidate.id === elevation.wallId);
      expect(elevation.parts).toEqual([
        ...elevationParts(synced, wall, elevation.side, settings),
        ...bandParts(synced, wall, elevation.side, settings),
      ]);
    }
  });
```

**Count:** 886 + 1 = **887**. Gate: `npm test && npm run lint && npm run build`.

**End-to-end check (Kyle):** API and designer running as in round 41, geometry on `feature/drawing` with 318–319 in. *Export DXF* on G1, `elevation-A.dxf`: new layers COUNTERTOPS and MOLDINGS. The tall's crown runs 3" past its right side above the base. The upper's crown runs 3" past its left end panel. The base's countertop and toe kick run from the tall to the corner (where wall B's base takes over) with no overhang at either end. The toe kick has a line at the tall/base joint. HIDDEN stays empty. `elevation-C.dxf` (island): the countertop runs 3/4" past both ends. G6: the bottom cap under the upper, with its top edge dashed where the doors' 1/8" overhang covers it, and the wood top 3/4" past its left end panel. On the canvas (after 321) the bands match the DXF.
