# Round 43.3 — SPEC: cell chains and callouts

Steps 353–357. Geometry (353, 354), then designer (355–357). The API doesn't change.
Drawing rounds: 43.2 vertical dimensions and counter height → **43.3 cell chains and callouts** → 43.4 corner reach → 44 plan → 45 plan dimensions and labels → sheet layout.

**Done when:**
- Every split column's chain (a cell grid's tracks) is in the elevation DXF as DIMENSION entities inside the column, where the canvas draws it.
- Casing clearances between a door or window and the run beside it are DIMENSIONs inside the wall, at their own height.
- A pinned cabinet's callout is a DIMENSION from its datum to the point it holds, with extension lines from each end's own point.
- A cabinet pinned 0" off an opening's centre (G1's sink on the window) gets a centreline mark: a CENTER line labelled CL.
- The canvas doesn't change. The rows, columns and title from 43–43.2 don't move.

| Step | Repo | What | Tests after |
|---|---|---|---|
| **353** | geometry | `startBase` / `endBase` on a dimension; an extension line on its own dimension line is left out | 44 → **46** |
| **354** | geometry | `marks` on an elevation: a centreline mark on CENTERLINES with its label | **48** |
| **355** | designer | `elevationDimensions` adds cell chains | 931 → **933** |
| **356** | designer | `elevationDimensions` adds casing clearances and pin callouts | **935** |
| **357** | designer | `elevationMarks` and `marks` on every payload elevation | **938** |

Codex writes the code (PROMPT-CONVENTIONS rule 10). This SPEC gives the rules, the contracts and the tests, plus a few lines where an ezdxf call matters. The test values were checked against a throwaway build of these rules (designer 938, geometry 48). That build isn't in this SPEC. If a test fails, fix the code, not the number, unless the number contradicts a rule here. In that case, stop and say so.

---

## §1 Decisions (2026-10-06)

- **Cell chains, as the canvas draws them.** Every grid in `runScene(…).cells.grids` gets a chain, nested grids too: one record per track, bottom to top or left to right. A grid split down (`axis: 'row'`) gets a vertical chain up its left side. A grid split across (`axis: 'col'`) gets a horizontal chain along its bottom. The line is 1/4" (paper) inside that edge: 6" at 1:24, so G2's stacked column (x 51) is dimensioned at x 57. A gap between tracks gets ticks but no dimension, as on the canvas.
- **No extension lines inside the drawing.** Cell chains and clearances sit on what they measure, so `base` = `at`. Geometry leaves out an extension line whose base is on the dimension line (353). Without that, ezdxf writes zero-length lines.
- **Moved text stays inside.** Cell chain text that doesn't fit moves into the column: right of a vertical chain (level 1 is 2 5/8" past the line at 1:24), above a horizontal one (past the on-line text). Clearance and pin text moves up, past the on-line text. The fit test, the width estimate and the levels are 43.1's.
- **Clearances only to a run (Kyle).** A casing clearance whose far side is a bare wall end (`targetRunId` null) is left out: the wall row already dimensions it (G2's 2"). The rest go in at the height the canvas uses (`clearanceCallouts`'s `z`). The text is the length only. A too-tight clearance's "(required)" stays on the canvas (Claude's default, say if you want it in the DXF).
- **Pin callouts.** A pin with a distance (`value` > 0) is a dimension from the datum to the point the pin holds, on the canvas's line (`z`: 40" for a wall end, 6" over the sill for an opening). Each end has its own extension line:
  - **The datum's end** starts at the opening's middle (`datumZ`). A wall end has no point of its own, so it starts on the line, and is left out.
  - **The cabinet's end** starts at the cabinet's edge nearest the line: its top when the line is above it, its bottom when below. Inside the cabinet, it starts on the line and is left out.
  - **Text:** `CL 3"` for a centre pin, the distance alone for an edge pin. `CL`, not ℄: Arial Narrow likely has no ℄ glyph, and a viewer would show a box (Claude's default).
- **A 0" centre pin is a centreline mark (Kyle).** A CENTER line at the cabinet's centre from the lower of the cabinet's bottom and the callout line, up to the higher of the cabinet's top and the datum's point (the window's middle). G1: x 72 from 4" to 66". The label `CL` is centred over its top, a gap plus half a text height above (68 5/8" at 1:24). A 0" edge pin gets nothing: the cabinet's edge is on its datum and the dimension rows already show it.
- **The mark goes on a new layer `CENTERLINES`:** yellow (2), linetype `CENTER`, lineweight 0.18, like the dimensions. The label is a TEXT on `DIMENSIONS` in `FF_TEXT`, 3/32" × plot scale tall, middle-centre aligned. `$LTSCALE` (43.1) already sizes `CENTER` for paper: a 1" long dash, short dash and gaps at any scale.
- **The records.** A dimension record can carry `startBase` and `endBase`, where the extension line at `start` / `end` begins. Each defaults to `base`, so 43–43.2 records don't change. Pin records always carry both. An elevation gets `marks: [{ kind: 'centerline', x, bottom, top, text, textX, textZ }]`.
- **Order.** After 43.2's vertical columns: `cells` (run by run, grid by grid), then `clearances`, then `pins` (run by run). Row names are `cells`, `clearances` and `pins`, and kinds are `cell`, `clearance` and `pin`. Cell chains on a grid split down carry `orientation: 'vertical'`.
- **The title doesn't move.** All of these sit inside the drawing, above the floor, and the title's `low` already reads horizontal records only, so geometry's `low` doesn't change.
- **Not in 43.3:** corner reach on `cornerShapes` (43.4); the selected opening's vertical chain and the pin ◆ marker (canvas-only); end elevations.

---

## §2 Step 353 — geometry: each end's own extension line

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/drawing/models.py` | 102 | `PayloadDimension.startBase`, `endBase` |
| `src/drawing/dimensions.py` | 39 | the points use them; an extension line on the dimension line is suppressed |
| `tests/test_elevation_dimensions.py` | 167 | append 2 tests (verbatim, below) |

**`models.py`.** `PayloadDimension` gains, after `textZ`:

```python
    # Where the extension line at start / end begins (SPEC-43.3); None = base.
    startBase: float | None = None
    endBase: float | None = None
```

**`dimensions.py`, `add_dimensions`.** Use `startBase` (else `base`) for `p1` and `endBase` (else `base`) for `p2`, in both orientations: horizontal `p1 = (start, startBase)`, vertical `p1 = (startBase, start)`, and the same for `p2` at `end`. Suppress an extension line whose base is within `EPSILON` of `at`. In ezdxf that's an override on the same `add_linear_dim` call:

```python
    override={"dimse1": 1 if <start's base is at> else 0, "dimse2": 1 if <end's base is at> else 0},
```

Keep the one call site. The docstring adds "each end's extension line from its own base, left out when it's on the line (SPEC-43.3)", wrapped to ≤ 110 characters.

Don't touch `elevation_dxf.py`, `bundle.py`, `writer.py`, the fixtures or the other tests.

**Tests.** Append to `tests/test_elevation_dimensions.py`, verbatim:

```python


# G1 elevation A's casing clearance to the tall, and a pin callout from the window's centre to the sink's
# centre 3" right of it, as the designer sends them (SPEC-43.3).
CALLOUTS = [
    {"row": "clearances", "kind": "clearance", "start": 30, "end": 45, "base": 64.5, "at": 64.5, "text": '15"'},
    {"row": "pins", "kind": "pin", "start": 72, "end": 75, "base": 48, "startBase": 66, "endBase": 34.5, "at": 48,
     "text": 'CL 3"', "textX": 73.5, "textZ": 54.375},
    {"row": "pins", "kind": "pin", "start": 0, "end": 60, "base": 40, "startBase": 40, "endBase": 34.5, "at": 40,
     "text": '60"'},
]


def _lines(doc, dimension):
    return sorted(
        (tuple(entity.dxf.start)[:2], tuple(entity.dxf.end)[:2])
        for entity in doc.blocks.get(dimension.dxf.geometry) if entity.dxftype() == "LINE"
    )


def test_an_extension_line_on_its_dimension_line_is_left_out():
    payload = _payload()
    payload["elevations"][0]["dimensions"] = copy.deepcopy(CALLOUTS)
    doc = _dxf(payload)
    clearance, pin, wall_pin = doc.modelspace().query("DIMENSION")
    assert [dimension.get_measurement() for dimension in (clearance, pin, wall_pin)] == [15, 3, 60]
    assert tuple(clearance.dxf.defpoint2)[:2] == (30, 64.5)
    assert _lines(doc, clearance) == [((30, 64.5), (45, 64.5))]
    assert _lines(doc, wall_pin) == [((0, 40), (60, 40)), ((60, 36), (60, 41.5))]


def test_each_end_of_a_dimension_can_have_its_own_base_and_round_trips():
    payload = _payload()
    payload["elevations"][0]["dimensions"] = copy.deepcopy(CALLOUTS)
    doc = _dxf(payload)
    pin = list(doc.modelspace().query("DIMENSION"))[1]
    assert tuple(pin.dxf.defpoint2)[:2] == (72, 66)
    assert tuple(pin.dxf.defpoint3)[:2] == (75, 34.5)
    assert tuple(pin.dxf.defpoint)[:2] == (72, 48)
    assert _lines(doc, pin) == [((72, 48), (75, 48)), ((72, 64.5), (72, 46.5)), ((75, 36), (75, 49.5))]
    assert tuple(pin.dxf.text_midpoint)[:2] == (73.5, 54.375)
    archive = zipfile.ZipFile(io.BytesIO(base64.b64decode(draw(payload)["zip_base64"])))
    assert json.loads(archive.read("payload.json")) == payload
```

What they show:
- The clearance's block has only its dimension line: both extension lines are on it and are left out.
- The wall-end pin keeps one extension line, from the sink's top (34 1/2", drawn from 36": `dimexo` 1 1/2" off) to 1 1/2" past the line.
- The window pin's lines start at the window's middle (66") and the sink's top. The moved text is where the record says.
- `startBase`/`endBase` round-trip.

**Count:** 44 + 2 = **46**.

---

## §3 Step 354 — geometry: centreline marks

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/drawing/models.py` | ~105 | `PayloadMark`; `PayloadElevation.marks` |
| `src/dxf/writer.py` | 147 | the `CENTERLINES` layer |
| NEW `src/drawing/marks.py` | — | `add_marks` |
| `src/drawing/elevation_dxf.py` | 156 | call `add_marks` after `add_dimensions` |
| `tests/test_drawing_style.py` | 48 | line 39: the layer list gains `CENTERLINES` |
| NEW `tests/test_elevation_marks.py` | — | 2 tests, verbatim |

**`models.py`.** Above `PayloadElevation`, a `PayloadMark` with `extra="forbid"`: `kind: Literal["centerline"]`, then `x`, `bottom`, `top` (floats), `text: str = Field(min_length=1)`, `textX`, `textZ` (floats). Docstring: a centreline mark (SPEC-43.3), a centre line at `x` from `bottom` to `top`, its label's middle at `textX`/`textZ`. `PayloadElevation` gets `marks: list[PayloadMark] = []` after `dimensions`.

**`writer.py`.** In `LAYER_DEFS`, after `DIMENSIONS`: `"CENTERLINES": (2, "CENTER", 18),`. The comment above it: centrelines are as light as dimensions (SPEC-43.3). `CENTER` is already a linetype.

**NEW `src/drawing/marks.py`**: `add_marks(modelspace, marks, plot_scale) -> None`. For each mark, a LINE `(x, bottom)` → `(x, top)` on `CENTERLINES`, and a TEXT with the mark's text on `DIMENSIONS`, style `TEXT_STYLE`, height `DIMSTYLE_PAPER["dimtxt"] * plot_scale`, placed middle-centre at `(textX, textZ)`:

```python
from ezdxf.enums import TextEntityAlignment
...
modelspace.add_text(mark.text, height=..., dxfattribs={...}).set_placement(
    (mark.textX, mark.textZ), align=TextEntityAlignment.MIDDLE_CENTER,
)
```

Module docstring: centreline marks (SPEC-43.3). The designer places them; geometry draws them.

**`elevation_dxf.py`.** Import `add_marks` from `.marks` and call `add_marks(modelspace, elevation.marks, plot_scale)` right after `add_dimensions(...)`. Don't change `low` or the title.

**`tests/test_drawing_style.py` line 39:** `"HIDDEN": 18, "DIMENSIONS": 18, "TEXT": 18,` → `"HIDDEN": 18, "DIMENSIONS": 18, "CENTERLINES": 18, "TEXT": 18,`.

**NEW `tests/test_elevation_marks.py`**, verbatim:

```python
"""Centreline marks in the elevation DXF (SPEC-43.3)."""

import base64
import copy
import io
import json
import zipfile
from pathlib import Path

import ezdxf
import pytest
from ezdxf.enums import TextEntityAlignment
from pydantic import ValidationError

from src.drawing.bundle import draw

ROOT = Path(__file__).resolve().parent.parent
PAYLOAD = json.loads((ROOT / "tests" / "fixtures" / "g1_payload.json").read_text())

# G1 elevation A: the sink pinned to the window's centre with no offset, as the designer sends it (SPEC-43.3).
MARK = {"kind": "centerline", "x": 72, "bottom": 4, "top": 66, "text": "CL", "textX": 72, "textZ": 68.625}


def _payload(plot_scale=None):
    payload = copy.deepcopy(PAYLOAD)
    payload["elevations"][0]["marks"] = [copy.deepcopy(MARK)]
    if plot_scale is not None:
        payload["plotScale"] = plot_scale
    return payload


def _dxf(payload, letter="A"):
    archive = zipfile.ZipFile(io.BytesIO(base64.b64decode(draw(payload)["zip_base64"])))
    return ezdxf.read(io.StringIO(archive.read(f"elevation-{letter}.dxf").decode("utf-8")))


def test_a_centerline_mark_is_a_center_line_with_its_label():
    doc = _dxf(_payload())
    modelspace = doc.modelspace()
    [line] = modelspace.query('LINE[layer=="CENTERLINES"]')
    assert (tuple(line.dxf.start)[:2], tuple(line.dxf.end)[:2]) == ((72, 4), (72, 66))
    assert doc.layers.get("CENTERLINES").dxf.linetype == "CENTER"
    [label] = [text for text in modelspace.query("TEXT") if text.dxf.text == "CL"]
    assert (label.dxf.layer, label.dxf.style, label.dxf.height) == ("DIMENSIONS", "FF_TEXT", 2.25)
    align, point, _ = label.get_placement()
    assert (align, tuple(point)[:2]) == (TextEntityAlignment.MIDDLE_CENTER, (72, 68.625))
    assert list(_dxf(_payload(), "B").modelspace().query('LINE[layer=="CENTERLINES"]')) == []


def test_marks_scale_with_the_drawing_round_trip_and_reject_an_unknown_kind():
    [label] = [text for text in _dxf(_payload(plot_scale=48)).modelspace().query("TEXT") if text.dxf.text == "CL"]
    assert label.dxf.height == 4.5
    payload = _payload()
    archive = zipfile.ZipFile(io.BytesIO(base64.b64decode(draw(payload)["zip_base64"])))
    assert json.loads(archive.read("payload.json")) == payload
    payload["elevations"][0]["marks"][0]["kind"] = "arrow"
    with pytest.raises(ValidationError):
        draw(payload)
```

What they show: the mark is one CENTER line on its own layer and a CL label 2 1/4" tall (3/32" at 1:24), centred where the record says. Elevation B has no mark. At 1:48 the label is 4 1/2". `marks` round-trips, and an unknown kind is rejected.

**Count:** 46 + 2 = **48**. `test_vertical_dimensions_dont_move_the_title_and_round_trip` doesn't change: its payload has no marks.

---

## §4 Step 355 — designer: cell chains

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/elevationDimensions.js` | 146 | the `cells` records |
| NEW `src/elevation/model/__tests__/cellChainDimensions.test.js` | — | 2 tests, verbatim |

**Contract.** `elevationDimensions(room, wall, side, settings)` keeps its signature and everything it returns now. After the vertical columns it adds the `cells` records. For each run in `view.runs`, `runScene(room, view, run, settings).cells.grids` gives:

```js
{ id, columnId, axis, depth, x, z, width, height, tracks: [{ id, start, end, manual }] }
```

`axis: 'row'` is split down. Its tracks are heights, listed top first. `axis: 'col'` is split across, and its tracks are x. Per grid, one record per track longer than `EPSILON`, sorted by `start`:

```js
{ row: 'cells', orientation?: 'vertical', kind: 'cell', start, end, base, at, text, textX?, textZ? }
```

- `orientation: 'vertical'` only on a `row` grid.
- `at` = `grid.x` (row) or `grid.z` (col) + `CELL_CHAIN_INSET × plotScale`, with a new non-exported constant `CELL_CHAIN_INSET = 0.25` (paper inches) and its comment. `base` = `at`.
- Moved text: `placeLabels(segments, at, +1, scale, textOutward)` with `textOutward` = `true` on a col grid and `false` on a row grid. Map along/across as 43.2 does: horizontal `textX` = along, `textZ` = across; vertical `textX` = across, `textZ` = along. The levels don't move anything else.

**Reuse:** `runScene` from `./runScene.js` (new import; no cycle). `placeLabels` and the mapping are already in the file. Build the vertical record the same way 43.2 does rather than adding a second shape. A small helper that turns `placed` into records, shared by the column loop and this one, is fine.

Update the function's doc comment with one line: then each split column's cell chain, 1/4" (paper) inside its left or bottom edge, with no extension lines (SPEC-43.3).

**Don't touch:** `dimensions.js`, `runScene.js`, `cells.js`, `drawingPayload.js`, `CellChains.jsx` or any canvas file, and the existing tests. The `horizontal` and `vertical` helpers in the existing tests don't see any of the new records in the rooms they test (G1 has no split columns).

**NEW `src/elevation/model/__tests__/cellChainDimensions.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { splitGridCell } from '../cellTree.js';
import { elevationDimensions } from '../elevationDimensions.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);
const room = (name) => syncRoom(stored(name), settings);
const cells = (dimensions) => dimensions.filter(({ row: name }) => name === 'cells');
const row = ({
  orientation, kind, start, end, base, at, text, textX, textZ,
}) => [orientation ?? 'horizontal', kind, start, end, base, at, text, ...(textX === undefined ? [] : [textX, textZ])];

/** G4 with the lower cabinet of its stacked column split across in two (a nested grid of columns). */
function splitG4() {
  const copy = structuredClone(stored('G4 T-filler run'));
  let next = 0;
  copy.walls[0].runs[0].grid = splitGridCell(
    copy.walls[0].runs[0].grid, '0e8d791b-a3a5-4fe6-8b08-a1b8e954b8ba', 'across', 2, () => `split-${++next}`,
  );
  return syncRoom(copy, settings);
}

describe('SPEC-43.3 cell chains in the DXF', () => {
  it('dimensions a split column up its left side, 1/4" (paper) inside it (G2, G3, G4)', () => {
    const g2 = room('G2 Face frame kitchen');
    expect(cells(elevationDimensions(g2, g2.walls[0], 'front', settings)).map(row)).toEqual([
      ['vertical', 'cell', 4, 68, 57, 57, '64"'],
      ['vertical', 'cell', 68, 90, 57, 57, '22"'],
    ]);
    // The 3/4" top panel's text moves off the line, into the column.
    const g3 = room('G3 Bath alcove');
    expect(cells(elevationDimensions(g3, g3.walls[1], 'front', settings)).map(row)).toEqual([
      ['vertical', 'cell', 36, 77.25, 6.75, 6.75, '41 1/4"'],
      ['vertical', 'cell', 77.25, 78, 6.75, 6.75, '3/4"', 9.375, 77.625],
    ]);
    const g4 = room('G4 T-filler run');
    expect(cells(elevationDimensions(g4, g4.walls[0], 'front', settings)).map(row)).toEqual([
      ['vertical', 'cell', 4, 64, 54.75, 54.75, '60"'],
      ['vertical', 'cell', 64, 90, 54.75, 54.75, '26"'],
    ]);
    const g1 = room('G1 Euro kitchen');
    expect(cells(elevationDimensions(g1, g1.walls[0], 'front', settings))).toEqual([]);
  });

  it('dimensions a nested split across its bottom, and stacks text that doesn\'t fit (G4 split, 1:24 and 1:48)', () => {
    const g4 = splitG4();
    expect(cells(elevationDimensions(g4, g4.walls[0], 'front', settings)).map(row)).toEqual([
      ['vertical', 'cell', 4, 64, 54.75, 54.75, '60"'],
      ['vertical', 'cell', 64, 90, 54.75, 54.75, '26"'],
      ['horizontal', 'cell', 48.75, 66.25, 10, 10, '17 1/2"'],
      ['horizontal', 'cell', 66.25, 83.75, 10, 10, '17 1/2"'],
    ]);
    expect(cells(elevationDimensions(g4, g4.walls[0], 'front', { ...settings, plotScale: 48 })).map(row)).toEqual([
      ['vertical', 'cell', 4, 64, 60.75, 60.75, '60"'],
      ['vertical', 'cell', 64, 90, 60.75, 60.75, '26"'],
      ['horizontal', 'cell', 48.75, 66.25, 16, 16, '17 1/2"', 57.5, 28.75],
      ['horizontal', 'cell', 66.25, 83.75, 16, 16, '17 1/2"', 75, 36.25],
    ]);
  });
});
```

What the numbers are:
- **Where the chains go.** G2's stacked column starts at x 51, so its chain is at 57 (6" in at 1:24). G3's top-panel column starts at 3/4" (chain at 6 3/4"), and G4's at 48 3/4" (54 3/4").
- **G3's 3/4" panel.** `3/4"` doesn't fit 3/4". It moves right of the line by gap + half a text height (1 1/2 + 1 1/8 = 2 5/8): x 9 3/8, centred at 77 5/8.
- **The G4 split.** The lower cabinet (4"–64") split across gives a nested grid of two 17 1/2" columns, dimensioned along its bottom at 4 + 6 = 10. Grids come in the order `cells.grids` gives them (the parent first).
- **At 1:48.** The inset is 12", and `17 1/2"` (7 characters, 15 3/4" + 6" of gaps) no longer fits 17 1/2". The first label moves up past the on-line text (16 + 12 3/4 = 28 3/4). The second overlaps it and goes a level further (36 1/4).

**Count:** 931 + 2 = **933**. Golden snapshot unchanged. `drawingPayload.test.js` doesn't change: G1 has no split columns.

---

## §5 Step 356 — designer: casing clearances and pin callouts

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/elevationDimensions.js` | ~175 | the `clearances` and `pins` records; `placeLabels` takes a segment's own text |
| `src/elevation/model/__tests__/elevationDimensions.test.js` | 84 | lines 16–17: the `horizontal` helper keeps the rows below and above the wall only |
| `src/elevation/model/__tests__/drawingPayload.test.js` | 91 | line 85's counts |
| NEW `src/elevation/model/__tests__/calloutDimensions.test.js` | — | 2 tests, verbatim |

**Contract.** After the `cells` records, `elevationDimensions` adds `clearances` and then `pins`.

**Clearances.** `clearanceCallouts(room, view, settings)` (from `./dimensions.js`, exported) returns, in order:

```js
[{ openingId, label, side, start, end, targetRunId, required, violated, z }]
```

Skip any with `targetRunId === null` or no length (≤ `EPSILON`). Each other one becomes:

```js
{ row: 'clearances', kind: 'clearance', start, end, base: z, at: z, text, textX?, textZ? }
```

`text` is `formatInches(end - start)`. Moved text: `placeLabels([segment], z, +1, scale)` (default `textOutward`, so up past the on-line text). Each callout is placed alone.

**Pins.** For each run in `view.runs`, `centerlineMarkers(run, scene.result.pieces, view, view.length, settings)` (from `./dimensions.js`, exported; `scene` is that run's `runScene`, computed once per run with the cell chains) returns:

```js
[{ pieceId, x, datumX, z, value, pieceBottom, pieceTop, from, anchor, datumZ? }]
```

Skip any with `value` ≤ `EPSILON` (step 357 marks the centre ones). Each other one becomes:

```js
{ row: 'pins', kind: 'pin', start, end, base: z, startBase, endBase, at: z, text, textX?, textZ? }
```

- `start` = min(`x`, `datumX`), `end` = max.
- The datum's base is `datumZ ?? z`. The cabinet's base is `z` clamped to [`pieceBottom`, `pieceTop`].
- `startBase` is the base of whichever of the two is at `start`, and `endBase` the other.
- `text` = `` `CL ${formatInches(value)}` `` when `anchor === 'center'`, else `formatInches(value)`.
- Moved text as for clearances.

**`placeLabels`** uses `segment.text` when a segment has one, else `formatInches(end - start)` as now. Nothing else in it changes.

Update the function's doc comment: then casing clearances to a run and pin callouts inside the wall, at their own height (SPEC-43.3); a pin's extension lines start at its datum's and its cabinet's own points.

**Don't touch:** `dimensions.js`, `drawingPayload.js`, `ClearanceCallouts.jsx`, `RunGroup.jsx`, any canvas file.

**Tests.**

`elevationDimensions.test.js` lines 16–17 (the `horizontal` helper and its comment) become, verbatim:

```js
/** The rows below and above the wall only (SPEC-43.2 adds vertical columns, SPEC-43.3 cell chains and callouts). */
const ROWS = ['lower.inner', 'lower.outer', 'openings', 'upper.inner', 'upper.outer'];
const horizontal = (dimensions) => dimensions.filter(({ row: name }) => ROWS.includes(name));
```

`drawingPayload.test.js` line 85: `[36, 30, 17, 17]` → `[38, 30, 17, 17]`.

**NEW `src/elevation/model/__tests__/calloutDimensions.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { elevationDimensions } from '../elevationDimensions.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);
const room = (name) => syncRoom(stored(name), settings);
const SINK = '0f652c26-5f80-4387-8a1b-1f35ada26b59';
const of = (name) => (dimensions) => dimensions.filter(({ row }) => row === name);
const row = ({
  kind, start, end, base, startBase, endBase, at, text, textX, textZ,
}) => [
  kind, start, end, base, ...(startBase === undefined ? [] : [startBase, endBase]), at, text,
  ...(textX === undefined ? [] : [textX, textZ]),
];

/** G1 with the sink's pin changed (as drawn it's on the window's centre, 0" off). */
function pinned(pin) {
  const copy = structuredClone(stored('G1 Euro kitchen'));
  const track = copy.walls[0].runs.flatMap((run) => run.grid?.cols ?? []).find(({ id }) => id === `${SINK}:col`);
  track.pin = { ...track.pin, ...pin };
  return syncRoom(copy, settings);
}
const pins = (synced) => of('pins')(elevationDimensions(synced, synced.walls[0], 'front', settings)).map(row);

describe('SPEC-43.3 callouts in the DXF', () => {
  it('dimensions casing clearances to a run beside the opening, inside the wall at their own height', () => {
    const g1 = room('G1 Euro kitchen');
    expect(of('clearances')(elevationDimensions(g1, g1.walls[0], 'front', settings)).map(row)).toEqual([
      ['clearance', 30, 45, 64.5, 64.5, '15"'],
      ['clearance', 99, 108.5, 72, 72, '9 1/2"', 103.75, 78.375],
    ]);
    // G2's window is 2" from the wall end with no run there: the wall row already says so.
    const g2 = room('G2 Face frame kitchen');
    expect(of('clearances')(elevationDimensions(g2, g2.walls[0], 'front', settings)).map(row)).toEqual([
      ['clearance', 44, 50, 41.5, 41.5, '6"'],
    ]);
  });

  it('dimensions a pin from its datum to the point it holds, each end from its own point', () => {
    // From the window's middle (66") and the sink's top (34 1/2") to a line 6" over the sill.
    expect(pins(pinned({ value: 3 }))).toEqual([['pin', 72, 75, 48, 66, 34.5, 48, 'CL 3"', 73.5, 54.375]]);
    expect(pins(pinned({ value: -3 }))).toEqual([['pin', 69, 72, 48, 34.5, 66, 48, 'CL 3"', 70.5, 54.375]]);
    // From a wall end the datum has no point of its own, so that end has no extension line.
    expect(pins(pinned({ from: 'left', anchor: 'left', value: 60 })))
      .toEqual([['pin', 0, 60, 40, 40, 34.5, 40, '60"']]);
    expect(pins(pinned({ from: 'right', anchor: 'right', value: 60 })))
      .toEqual([['pin', 108, 168, 40, 34.5, 40, 40, '60"']]);
    // As drawn the sink is 0" off the window's centre: a centreline mark, not a dimension.
    expect(pins(room('G1 Euro kitchen'))).toEqual([]);
  });
});
```

What the numbers are, at 1:24:
- **Clearances.** G1 A's tall ends at 30" and the window's casing starts at 45". That's 15" at 64 1/2", the middle of where the two overlap. The casing ends at 99" and the upper starts at 108 1/2". That's 9 1/2" at 72"; `9 1/2"` (6 characters, 6 3/4" + 3") doesn't fit, so it moves up 6 3/8" (78 3/8").
- **G2.** The window's 2" to the bare wall end is left out. Its 6" to the run at 50" stays.
- **Pins.** The sink moved 3" right of the window's centre: datum 72 at the window's middle (66"), sink centre 75 at its top (34 1/2"), line 6" over the 42" sill (48"). `CL 3"` moves up to 54 3/8". At −3 the datum is on the right, so the bases swap. A left-edge pin 60" from the wall's left end has no datum point (base on the line, 40") and the sink's top as the other base. A right-edge pin is the mirror.

**Count:** 933 + 2 = **935**. Golden snapshot unchanged. The 43–43.2 tests keep their numbers.

---

## §6 Step 357 — designer: centreline marks in the payload

**Files:**

| File | Lines | Change |
|---|---:|---|
| NEW `src/elevation/model/elevationMarks.js` | — | `elevationMarks` |
| `src/elevation/model/drawingPayload.js` | 58 | `marks` on every elevation |
| `src/elevation/model/__tests__/drawingPayload.test.js` | 91 | `withoutParts` drops `marks`; one test appended |
| NEW `src/elevation/model/__tests__/elevationMarks.test.js` | — | 2 tests, verbatim |

**Contract.** `elevationMarks(room, wall, side, settings)` → `[{ kind: 'centerline', x, bottom, top, text: 'CL', textX, textZ }]`. For each run in `resolveWall(room, wall, side).runs`, the same `centerlineMarkers(...)` call as step 356, keeping those with `anchor === 'center'` and `value` ≤ `EPSILON`:
- `bottom` = min(`z`, `pieceBottom`), `top` = max(`datumZ ?? z`, `pieceTop`).
- `textX` = `x`, `textZ` = `top` + (`DIMENSION_TEXT_GAP` + `DIMENSION_TEXT_HEIGHT` / 2) × `plotScale(settings)`.

Import the two constants from `./elevationDimensions.js`, and `plotScale` from `./drawingScale.js`. Doc comment: a cabinet pinned 0" off its datum's centre (SPEC-43.3), a centre line from the cabinet's bottom (or the callout line) to the datum's point (or the cabinet's top), labelled CL over its top.

**`drawingPayload.js`.** Import `elevationMarks`. Each elevation gets `marks: elevationMarks(room, wall, side, settings),` right after `dimensions`. The doc comment's round list adds "43.3 its centreline marks".

**Don't touch:** `elevationDimensions.js`, `dimensions.js`, any canvas file.

**Tests.**

`drawingPayload.test.js`:
- after the `elevationDimensions.js` import add `import { elevationMarks } from '../elevationMarks.js';`;
- in `withoutParts`, after `delete copy.dimensions;` add `delete copy.marks;`;
- append inside the `describe`, after the SPEC-43 test, verbatim:

```js

  it('SPEC-43.3 carries each wall face\'s centreline marks', () => {
    const synced = room('G1 Euro kitchen');
    const payload = toDrawingPayload(synced, settings);
    expect(payload.elevations.map((elevation) => elevation.marks.length)).toEqual([1, 0, 0, 0]);
    for (const elevation of payload.elevations) {
      const wall = synced.walls.find((candidate) => candidate.id === elevation.wallId);
      expect(elevation.marks).toEqual(elevationMarks(synced, wall, elevation.side, settings));
    }
  });
```

**NEW `src/elevation/model/__tests__/elevationMarks.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { elevationMarks } from '../elevationMarks.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);
const SINK = '0f652c26-5f80-4387-8a1b-1f35ada26b59';

function pinned(pin) {
  const copy = structuredClone(stored('G1 Euro kitchen'));
  const track = copy.walls[0].runs.flatMap((run) => run.grid?.cols ?? []).find(({ id }) => id === `${SINK}:col`);
  track.pin = { ...track.pin, ...pin };
  return syncRoom(copy, settings);
}

describe('SPEC-43.3 centreline marks', () => {
  it('marks a cabinet centred on its datum with a centre line from the cabinet\'s bottom to the window\'s middle (G1 A)', () => {
    const g1 = syncRoom(stored('G1 Euro kitchen'), settings);
    expect(elevationMarks(g1, g1.walls[0], 'front', settings)).toEqual([
      { kind: 'centerline', x: 72, bottom: 4, top: 66, text: 'CL', textX: 72, textZ: 68.625 },
    ]);
    expect(elevationMarks(g1, g1.walls[0], 'front', { ...settings, plotScale: 48 })[0].textZ).toBe(71.25);
    expect(elevationMarks(g1, g1.walls[1], 'front', settings)).toEqual([]);
  });

  it('leaves a pin with a distance to the dimensions', () => {
    const g1 = pinned({ value: 3 });
    expect(elevationMarks(g1, g1.walls[0], 'front', settings)).toEqual([]);
  });
});
```

What the numbers are: the sink's centre is at 72", on the window's centre. The line runs from the sink's bottom (4") up to the window's middle (66"; the callout line at 48" is between). The label sits 1 1/2" + 1 1/8" over the top at 1:24 (68 5/8"), and 3" + 2 1/4" at 1:48 (71 1/4").

**Count:** 935 + 3 = **938**. Golden snapshot unchanged.

---

## End-to-end check (Kyle)

Geometry on `feature/drawing` with 353 and 354 in. `npm run build` in the designer, then start the API and designer as in round 42.

**Export DXF, G1, `elevation-A.dxf`:**
- **Clearances.** Between the tall and the window casing, a 15" dimension at 64 1/2" with no extension lines. Between the casing and the uppers, a 9 1/2" dimension at 72" with its text just above.
- **Sink.** A centre line (long and short dashes, yellow, layer CENTERLINES) up the sink's centre at 72" from 4" to the window's middle, with `CL` just over its top.
- **Nothing else moved.** The rows, the columns and the title are where they were in 43.2.
- Pin the sink 3" off the window's centre and export again: the centre line is gone, and a `CL 3"` dimension at 48" has extension lines down from the window's middle and up from the sink's top.

**G2 `elevation-A.dxf`.** The stacked column has a 64" / 22" chain at x 57", inside the column, with no extension lines. Only the 6" clearance shows by the window, not the 2" to the wall end.

**G3 `elevation-A.dxf`.** The top-panel column's 41 1/4" / 3/4" chain at 6 3/4", the `3/4"` text just right of the line.

**Drawing scale 1/4" = 1'-0".** Cell chains move to 12" inside their columns. Text that no longer fits moves off the line, into the column.

**Known for now:**
- Cell chains cross the doors and drawers inside a column, as on the canvas.
- A too-tight clearance doesn't say what it should be in the DXF.
- A wall-end pin's dimension runs through any cabinet between the wall end and the pinned one, at 40".
- Corner reach is 43.4.
