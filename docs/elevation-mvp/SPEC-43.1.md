# Round 43.1 — SPEC: drawing style, readable dimensions

Steps 348–350. Geometry (348, 349), then designer (350). The API doesn't change.
Drawing rounds: 43 back panel miters + horizontal elevation dimensions → **43.1 drawing style, readable dimensions** → 43.2 vertical dimensions → 43.3 cell chains and callouts → 43.4 corner reach → 44 plan → 45 plan dimensions and labels → sheet layout.

**Done when:**
- Every label and dimension in the DXF is in Arial Narrow (one text style, `FF_TEXT`).
- Dimension text is 3/32" on paper instead of 1/8" (2 1/4" in the drawing at 1/2" = 1'-0").
- Each layer has a lineweight and they display. Hidden-line dashes are a readable length on paper at any drawing scale.
- A dimension whose text doesn't fit between its ticks has its text moved off the line, centred on its segment, into the first level where it clears its neighbours. The next row moves out to make room. Nothing overlaps on G1–G6.

| Step | Repo | What | Tests after |
|---|---|---|---|
| **348** | geometry | `FF_TEXT` (Arial Narrow), 3/32" dimension text, lineweights, `$LTSCALE` | 38 → **41** |
| **349** | geometry | `textX` / `textZ` on a dimension: its text where the designer put it | **42** |
| **350** | designer | `elevationDimensions` moves text that doesn't fit and spaces rows for it | 927 → **927** |

Codex writes the code. This SPEC gives the code where it's short, and the tests. The literal values come from the golden fixture with today's model and a reference build of these steps (designer 927, lint clean; geometry 42). If a test fails, fix the code, not the number, unless the number contradicts a rule here. In that case, stop and say so.

---

## §1 Decisions (Kyle, 2026-10-06)

- **Arial Narrow (Kyle).** One text style, `FF_TEXT`, font file `arialn.ttf`, with the family name `Arial Narrow` in its extended font data, so AutoCAD and most viewers find it by name or by file. The dimension style uses it (`dimtxsty`) and so do the title, wall label and room name. A DXF names its font but doesn't contain it: a computer without Arial Narrow (it comes with Windows and with Microsoft Office on a Mac) shows a substitute. The PDFs from sheet layout will embed it.
- **Smaller dimension text (Kyle: "too big").** 3/32" on paper, down from 1/8". Ticks, extension and gap sizes stay 1/16". The title text doesn't change: it gets redone with labels and the title block (45 / sheet layout).
- **Lineweights** (1/100 mm, per layer):
  - **Walls 0.50.** The heaviest, because they're the outline of everything.
  - **Cabinets and countertops 0.35.** The boxes and tops read next.
  - **Faces, fillers, panels, frames, moldings, openings and sections 0.25.** Medium.
  - **Shelves, hidden lines, dimensions and text 0.18.** The lightest.

  `$LWDISPLAY` is on so they show on screen. These are shop defaults in geometry. Per-team drawing standards come later with team options.
- **Dashes sized for paper.** `DASHED` is 1/2" dash, 1/4" gap at `$LTSCALE` 1, which is nearly solid when printed at 1:24. `$LTSCALE` = plot scale ÷ 2 makes it a 1/4" dash and 1/8" gap on paper at any scale.
- **Text that doesn't fit moves off the line (Kyle: "some overlap").** The designer decides, as it decides everything about positions. A label fits when its estimated width plus a 1/16" (paper) gap each side fits between the ticks. The width estimate is characters × 0.5 × text height, on the generous side for Arial Narrow. A label that doesn't fit is centred on its segment and moved outward to the first level where it clears every moved label already there, by a gap. Levels are a text height plus a gap apart (5/32" on paper).
  - **Below the wall:** the on-line text sits above the line, toward the drawing, so level 1 is just under the line.
  - **Above the wall:** the on-line text is on the outer side, so level 1 starts past it.

  No leader line: the moved text sits right beside its own ticks, like the canvas's pop-outs.
- **Rows make room.** The next row out is 3/8" past this one, plus 5/32" per level of moved text. At 1:24, G1 A's rows go from −9, −18, −27 to −9, −21 3/4, −30 3/4, because the first row has one level of moved text. Above, they go from 105, 114 to 105, 117 3/4.
- **The record** gains `textX`, `textZ` (drawing inches, the text's middle), only on a moved label. Geometry uses ezdxf's `set_location(…, leader=False)` (the user-located text flag, so CAD keeps it there) and moves the title under the lowest moved text as well as the lowest line.
- **Two numbers live in both repos.** The designer's `DIMENSION_TEXT_HEIGHT` (3/32) and `DIMENSION_TEXT_GAP` (1/16) are geometry's `dimtxt` and `dimgap`. When either changes, change both. If a team sets drawing standards later, they ride in the payload instead.

---

## §2 Step 348 — geometry: Arial Narrow, smaller text, lineweights, dashes

**`src/dxf/writer.py`** (133 lines):

1. Replace `LAYER_DEFS` and the comment above it with, as given:

```python
# Standard layer definitions: (color_index, linetype, lineweight)
# AutoCAD Color Index: 7=white, 1=red, 2=yellow, 3=green, 4=cyan, 5=blue, 6=magenta
# Lineweights are in 1/100 mm (SPEC-43.1): walls heaviest, boxes and tops next, faces and parts medium,
# hidden lines, dimensions and text lightest.
LAYER_DEFS = {
    "WALLS":      (7, "CONTINUOUS", 50),
    "CABINETS":   (5, "CONTINUOUS", 35),
    "FACES":      (7, "CONTINUOUS", 25),
    "FILLERS":    (30, "CONTINUOUS", 25),
    "PANELS":     (6, "CONTINUOUS", 25),
    "FRAMES":     (3, "CONTINUOUS", 25),
    "SHELVES":    (4, "CONTINUOUS", 18),
    "COUNTERTOPS": (9, "CONTINUOUS", 35),
    "MOLDINGS":   (1, "CONTINUOUS", 25),
    "OPENINGS":   (40, "CONTINUOUS", 25),
    "SECTIONS":   (8, "CONTINUOUS", 25),
    "HIDDEN":     (8, "DASHED", 18),
    "DIMENSIONS": (2, "CONTINUOUS", 18),
    "TEXT":       (7, "CONTINUOUS", 18),
}

# Every label and dimension uses one text style (SPEC-43.1). The DXF names the font; the viewer supplies it.
TEXT_STYLE = "FF_TEXT"
TEXT_FONT = "arialn.ttf"
TEXT_FAMILY = "Arial Narrow"
```

2. In `create_dxf_document`, replace from `# Create layers` to `return doc` with:

```python
    doc.header["$LWDISPLAY"] = 1    # show lineweights

    # Create layers
    for layer_name, (color, linetype, lineweight) in LAYER_DEFS.items():
        doc.layers.add(layer_name, color=color, linetype=linetype, lineweight=lineweight)

    style = doc.styles.new(TEXT_STYLE, dxfattribs={"font": TEXT_FONT})
    style.set_extended_font_data(family=TEXT_FAMILY, italic=False, bold=False)

    return doc
```

3. `DIMSTYLE_PAPER`: `"dimtxt": 0.125,    # 1/8" text` → `"dimtxt": 0.09375,  # 3/32" text (SPEC-43.1)`.
4. `add_dimstyle`: after `style.dxf.dimscale = plot_scale` add `style.dxf.dimtxsty = TEXT_STYLE`. Its docstring's first line becomes `"""The FF dimension style (SPEC-43, 43.1): fractional inches to 1/16", ticks, text above the line, in` and the next line starts `FF_TEXT. The inch mark comes with …` (rewrap to ≤ 110 characters a line).

**`src/drawing/elevation_dxf.py`** (149 lines):
- The writer import gets `TEXT_STYLE` first: `from src.dxf.writer import TEXT_STYLE, add_dimstyle, create_dxf_document, doc_to_bytes, write_lines_to_layer`.
- After `add_dimstyle(doc, plot_scale)` (line 86):

```python
    # Dashes 1/4" and gaps 1/8" on paper at any plot scale (SPEC-43.1): DASHED is 1/2" + 1/4" at LTSCALE 1.
    doc.header["$LTSCALE"] = plot_scale / 2
```

- Line 146, the title text's `dxfattribs` → `{"layer": "TEXT", "style": TEXT_STYLE, "insert": position, "height": height}`.

**`tests/test_elevation_dimensions.py`** (106 lines), in `test_the_style_is_paper_sizes_times_the_plot_scale`: line 76 `0.125, 0.0625, …` → `0.09375, 0.0625, 0.0625, 0.0625, 0.0625,`, and line 83 `assert heights == [6]` → `assert heights == [4.5]`.

**NEW `tests/test_drawing_style.py`**, verbatim:

```python
"""The drawing style (SPEC-43.1): one text style in Arial Narrow, lineweights per layer, dashes sized for paper."""

import base64
import copy
import io
import json
import zipfile
from pathlib import Path

import ezdxf

from src.drawing.bundle import draw
from src.dxf.writer import create_dxf_document

ROOT = Path(__file__).resolve().parent.parent
PAYLOAD = json.loads((ROOT / "tests" / "fixtures" / "g1_payload.json").read_text())


def _dxf(payload, letter="A"):
    archive = zipfile.ZipFile(io.BytesIO(base64.b64decode(draw(payload)["zip_base64"])))
    return ezdxf.read(io.StringIO(archive.read(f"elevation-{letter}.dxf").decode("utf-8")))


def test_one_text_style_in_arial_narrow_for_labels_and_dimensions():
    doc = _dxf(PAYLOAD)
    style = doc.styles.get("FF_TEXT")
    assert style.dxf.font == "arialn.ttf"
    assert style.get_extended_font_data() == ("Arial Narrow", False, False)
    assert {text.dxf.style for text in doc.modelspace().query("TEXT")} == {"FF_TEXT"}
    assert doc.dimstyles.get("FF").dxf.dimtxsty == "FF_TEXT"


def test_each_layer_has_its_lineweight_and_they_show():
    doc = create_dxf_document()
    weights = {layer.dxf.name: layer.dxf.lineweight for layer in doc.layers if layer.dxf.name not in ("0", "Defpoints")}
    assert weights == {
        "WALLS": 50, "CABINETS": 35, "FACES": 25, "FILLERS": 25, "PANELS": 25, "FRAMES": 25,
        "SHELVES": 18, "COUNTERTOPS": 35, "MOLDINGS": 25, "OPENINGS": 25, "SECTIONS": 25,
        "HIDDEN": 18, "DIMENSIONS": 18, "TEXT": 18,
    }
    assert doc.header["$LWDISPLAY"] == 1


def test_dashes_are_sized_for_paper_at_the_plot_scale():
    assert _dxf(PAYLOAD).header["$LTSCALE"] == 12
    payload = copy.deepcopy(PAYLOAD)
    payload["plotScale"] = 48
    assert _dxf(payload).header["$LTSCALE"] == 24
```

(`Defpoints` is the layer ezdxf adds for dimension definition points.)

**Count:** 38 + 3 = **41**.

---

## §3 Step 349 — geometry: moved dimension text

**`src/drawing/models.py`** (97 lines), `PayloadDimension`: after `text: str = Field(min_length=1)` add

```python
    # Where the text's middle goes when it doesn't fit between the ticks (SPEC-43.1); None = on the line.
    textX: float | None = None
    textZ: float | None = None
```

**`src/drawing/dimensions.py`** (25 lines):
- The docstring of `add_dimensions` becomes `"""Horizontal linear dimensions in the FF style. The block shows the designer's text, at `textX`/`textZ` when it's given; the entity keeps `<>` so CAD re-measures it if the drawing is edited."""` (two lines, as now).
- Between the `add_linear_dim(…)` call and `override.render()`:

```python
        if dimension.textX is not None and dimension.textZ is not None:
            # Text that doesn't fit, moved where the designer put it (SPEC-43.1), with no leader.
            override.set_location((dimension.textX, dimension.textZ), leader=False, relative=False)
```

**`src/drawing/elevation_dxf.py`**: the `low = min([…])` line and its comment become:

```python
    # The title sits under the lowest dimension line or moved text (SPEC-43, 43.1); with none, where it always has.
    low = min([
        0.0,
        *(dimension.at for dimension in elevation.dimensions),
        *(dimension.textZ for dimension in elevation.dimensions if dimension.textZ is not None),
    ])
```

**`tests/test_elevation_dimensions.py`** (~106 lines after 348): append at the end, verbatim:

```python


def test_text_that_doesnt_fit_goes_where_the_designer_put_it():
    payload = _payload()
    payload["elevations"][0]["dimensions"] = [
        {"row": "lower.inner", "kind": "piece", "start": 0, "end": 0.75, "base": 0, "at": -9,
         "text": '3/4"', "textX": 0.375, "textZ": -12.375},
        {"row": "lower.inner", "kind": "piece", "start": 0.75, "end": 29.25, "base": 0, "at": -9, "text": '28 1/2"'},
    ]
    doc = _dxf(payload)
    moved, inline = list(doc.modelspace().query("DIMENSION"))
    assert tuple(moved.dxf.text_midpoint)[:2] == (0.375, -12.375)
    assert moved.dxf.dimtype & 128 == 128
    texts = [entity for entity in doc.blocks.get(moved.dxf.geometry) if entity.dxftype() == "MTEXT"]
    assert [(text.dxf.text, tuple(text.dxf.insert)[:2]) for text in texts] == [('3/4"', (0.375, -12.375))]
    assert [entity.dxftype() for entity in doc.blocks.get(moved.dxf.geometry)].count("LINE") == 3
    assert inline.dxf.dimtype & 128 == 0
    assert json.loads(zipfile.ZipFile(io.BytesIO(base64.b64decode(draw(payload)["zip_base64"]))).read("payload.json")) == payload
```

What it shows: the moved text's middle is where the record says, with the user-location flag (128) set so CAD keeps it there. The block has the dimension line and two extension lines and no leader. A dimension without `textX` is as before, and the payload round-trips.

**Count:** 41 + 1 = **42**. `test_the_title_moves_under_the_lowest_dimension_line` doesn't change: its records have no moved text.

---

## §4 Step 350 — designer: move text that doesn't fit

**`src/elevation/model/elevationDimensions.js`** (61 lines): replace the whole file with, as given:

```js
import { horizontalChains, openingChain } from './dimensions.js';
import { plotScale } from './drawingScale.js';
import { resolveWall } from './room.js';
import { formatInches } from './units.js';
import { wallExtent } from './wallExtent.js';

/** Paper inches from the drawing to its first dimension row, and between rows (SPEC-43). */
export const DIMENSION_ROW_SPACING = 0.375;

/**
 * Paper inches (SPEC-43.1): the dimension text height and the gap around it. Geometry's FF dimstyle
 * uses the same two numbers (dimtxt, dimgap).
 */
export const DIMENSION_TEXT_HEIGHT = 0.09375;
export const DIMENSION_TEXT_GAP = 0.0625;

/** Arial Narrow's widest-case average character width as a share of the text height (SPEC-43.1). */
const CHARACTER_WIDTH = 0.5;

const EPSILON = 1e-6;

/** The rows the DXF dimensions, nearest the drawing first on each side (the canvas's order, SPEC-43). */
const ROWS = [
  ['lower.inner', 'below'],
  ['lower.outer', 'below'],
  ['openings', 'below'],
  ['upper.inner', 'above'],
  ['upper.outer', 'above'],
];

/**
 * Where each label in a row goes (SPEC-43.1), in drawing inches. A label that fits between its ticks
 * (its estimated width plus a gap each side) stays on the line. One that doesn't moves outward, centred
 * on its segment, into the first level where it clears every label already there; levels are a text
 * height plus a gap apart. Below the wall, level 1 sits just under the line (the on-line text is above
 * it); above the wall, level 1 sits past the on-line text.
 */
function placeLabels(segments, at, outward, scale) {
  const height = DIMENSION_TEXT_HEIGHT * scale;
  const gap = DIMENSION_TEXT_GAP * scale;
  const step = height + gap;
  const first = (outward > 0 ? step : 0) + gap + height / 2;
  const levels = [];
  const placed = segments.map((segment) => {
    const text = formatInches(segment.end - segment.start);
    const width = text.length * CHARACTER_WIDTH * height;
    return { segment, text, width, fits: width + 2 * gap <= segment.end - segment.start + EPSILON };
  });
  for (const label of placed) {
    if (label.fits) continue;
    const center = (label.segment.start + label.segment.end) / 2;
    const left = center - label.width / 2;
    const right = center + label.width / 2;
    let level = levels.findIndex((taken) => taken.every((other) => (
      right + gap <= other.left + EPSILON || left >= other.right + gap - EPSILON
    )));
    if (level === -1) {
      levels.push([]);
      level = levels.length - 1;
    }
    levels[level].push({ left, right });
    label.textX = center;
    label.textZ = at + outward * (first + level * step);
  }
  return { placed, levels: levels.length, step };
}

/**
 * One wall face's horizontal dimensions as geometry draws them (SPEC-43): the canvas's chains (run
 * pieces and run overall below and above, the wall row of openings below), one record per segment.
 * Rows start 3/8" (paper) past everything drawn and stack 3/8" apart, plus room for any labels moved
 * off the line (SPEC-43.1); an empty row takes no space. `base` is where the extension lines start (the
 * drawing's bottom or top), `at` the dimension line, `textX`/`textZ` a moved label's middle.
 */
export function elevationDimensions(room, wall, side, settings) {
  const view = resolveWall(room, wall, side);
  const lower = horizontalChains(room, view, 'lower', settings);
  const upper = horizontalChains(room, view, 'upper', settings);
  const chains = {
    'lower.inner': lower.inner,
    'lower.outer': lower.outer,
    openings: openingChain(room, view, settings),
    'upper.inner': upper.inner,
    'upper.outer': upper.outer,
  };
  const extent = wallExtent(room, view, settings);
  const scale = plotScale(settings);
  const spacing = DIMENSION_ROW_SPACING * scale;
  const next = { below: extent.bottom - spacing, above: extent.top + spacing };
  const dimensions = [];
  for (const [row, where] of ROWS) {
    const segments = chains[row].filter((segment) => segment.end - segment.start > EPSILON);
    if (segments.length === 0) continue;
    const outward = where === 'below' ? -1 : 1;
    const base = where === 'below' ? extent.bottom : extent.top;
    const at = next[where];
    const { placed, levels, step } = placeLabels(segments, at, outward, scale);
    for (const { segment, text, textX, textZ } of placed) {
      dimensions.push({
        row,
        kind: segment.kind,
        start: segment.start,
        end: segment.end,
        base,
        at,
        text,
        ...(textX === undefined ? {} : { textX, textZ }),
      });
    }
    next[where] = at + outward * (spacing + levels * step);
  }
  return dimensions;
}
```

**`src/elevation/model/__tests__/elevationDimensions.test.js`** (73 lines): replace the whole file with, verbatim:

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
const room = (name) => syncRoom(document.rooms.find((candidate) => candidate.name === name), settings);
const row = ({
  row: name, kind, start, end, base, at, text, textX, textZ,
}) => [name, kind, start, end, base, at, text, ...(textX === undefined ? [] : [textX, textZ])];

describe('SPEC-43 elevation dimensions', () => {
  it('dimensions every segment of the canvas\'s chains; text that doesn\'t fit moves off the line (G1 elevation A)', () => {
    const g1 = room('G1 Euro kitchen');
    expect(elevationDimensions(g1, g1.walls[0], 'front', settings).map(row)).toEqual([
      ['lower.inner', 'piece', 0, 0.75, 0, -9, '3/4"', 0.375, -11.625],
      ['lower.inner', 'piece', 0.75, 29.25, 0, -9, '28 1/2"'],
      ['lower.inner', 'piece', 29.25, 30, 0, -9, '3/4"', 29.625, -11.625],
      ['lower.inner', 'piece', 30, 54, 0, -9, '24"'],
      ['lower.inner', 'piece', 54, 90, 0, -9, '36"'],
      ['lower.inner', 'piece', 90, 115.5, 0, -9, '25 1/2"'],
      ['lower.inner', 'piece', 115.5, 141, 0, -9, '25 1/2"'],
      ['lower.inner', 'piece', 141, 143.125, 0, -9, '2 1/8"', 142.0625, -11.625],
      ['lower.inner', 'corner-gap', 143.125, 168, 0, -9, '24 7/8"'],
      ['lower.outer', 'run', 0, 30, 0, -21.75, '30"'],
      ['lower.outer', 'run', 30, 168, 0, -21.75, '138"'],
      ['openings', 'gap', 0, 48, 0, -30.75, '48"'],
      ['openings', 'opening', 48, 96, 0, -30.75, '48"'],
      ['openings', 'gap', 96, 168, 0, -30.75, '72"'],
      ['upper.inner', 'tall-span', 0, 30, 96, 105, '30"'],
      ['upper.inner', 'open', 30, 108.5, 96, 105, '78 1/2"'],
      ['upper.inner', 'piece', 108.5, 109.25, 96, 105, '3/4"', 108.875, 111.375],
      ['upper.inner', 'piece', 109.25, 131.25, 96, 105, '22"'],
      ['upper.inner', 'piece', 131.25, 153.25, 96, 105, '22"'],
      ['upper.inner', 'piece', 153.25, 155.125, 96, 105, '1 7/8"', 154.1875, 111.375],
      ['upper.inner', 'corner-gap', 155.125, 168, 96, 105, '12 7/8"'],
      ['upper.outer', 'tall-span', 0, 30, 96, 117.75, '30"'],
      ['upper.outer', 'open', 30, 108.5, 96, 117.75, '78 1/2"'],
      ['upper.outer', 'run', 108.5, 168, 96, 117.75, '59 1/2"'],
    ]);
  });

  it('stacks moved text in levels so neighbours clear, and spaces by the plot scale (G1 elevation B at 1/4" = 1\'-0")', () => {
    const g1 = room('G1 Euro kitchen');
    const dimensions = elevationDimensions(g1, g1.walls[1], 'front', { ...settings, plotScale: 48 });
    // No openings: the wall row takes no space. At 1:48 rows are 18" apart, plus 7 1/2" per level of moved text.
    expect([...new Set(dimensions.map(({ row: name, at }) => `${name} ${at}`))]).toEqual([
      'lower.inner -18', 'lower.outer -43.5', 'upper.inner 114', 'upper.outer 147',
    ]);
    // Above the wall the 12 7/8" and the 1 13/16" beside it would overlap: the second goes a level further out.
    expect(dimensions.filter(({ row: name, textX }) => name === 'upper.inner' && textX !== undefined).map(row)).toEqual([
      ['upper.inner', 'corner-gap', 0, 12.875, 96, 114, '12 7/8"', 6.4375, 126.75],
      ['upper.inner', 'piece', 12.875, 14.6875, 96, 114, '1 13/16"', 13.78125, 134.25],
      ['upper.inner', 'piece', 118.1875, 120, 96, 114, '1 13/16"', 119.09375, 126.75],
    ]);
    expect(dimensions).toHaveLength(14);
  });

  it('dimensions the wall above when there are no uppers, and recesses in the wall row (G1 island, G5)', () => {
    const g1 = room('G1 Euro kitchen');
    expect(elevationDimensions(g1, g1.walls[3], 'back', settings).map(row).slice(5)).toEqual([
      ['lower.outer', 'open', 0, 0.75, 0, -21.75, '3/4"', 0.375, -24.375],
      ['lower.outer', 'run', 0.75, 90.75, 0, -21.75, '90"'],
      ['lower.outer', 'open', 90.75, 91.5, 0, -21.75, '3/4"', 91.125, -24.375],
      ['upper.outer', 'wall', 0, 91.5, 36, 45, '91 1/2"'],
    ]);
    const g5 = room('G5 Recess room');
    expect(elevationDimensions(g5, g5.walls[1], 'front', settings)
      .filter(({ row: name }) => name === 'openings').map(row)).toEqual([
      ['openings', 'gap', 0, 32, 0, -30.75, '32"'],
      ['openings', 'recess', 32, 80, 0, -30.75, '48"'],
      ['openings', 'gap', 80, 140, 0, -30.75, '60"'],
      ['openings', 'recess', 140, 188, 0, -30.75, '48"'],
      ['openings', 'gap', 188, 200, 0, -30.75, '12"'],
    ]);
  });
});
```

What the numbers are, at 1:24:
- **Text and gap.** Text is 2 1/4" tall and the gap is 1 1/2", so a level is 3 3/4".
- **What moves.** A 3/4" segment's `3/4"` is estimated 4 1/2" wide, so it can't fit. `24 7/8"` (7 characters, 7 7/8") fits easily in its 24 7/8".
- **Below the wall.** Moved text sits 2 5/8" under its line (−11 5/8"). The next row is at −9 − 9 − 3 3/4 = −21 3/4.
- **Above the wall.** Moved text sits past the on-line text, 6 3/8" over the line (111 3/8"). The next row is at 117 3/4.

`drawingPayload.test.js` doesn't change: the record counts are the same ([24, 14, 9, 9]), and its other test compares against `elevationDimensions` itself.

**Count:** stays **927**. Golden snapshot unchanged.

---

## End-to-end check (Kyle)

Geometry on `feature/drawing` with 348–349 in. `npm run build` in the designer, then start the API and designer as in round 42.

**Export DXF, G1, `elevation-A.dxf`:**
- **Text.** Every label and dimension is Arial Narrow. Dimension text is 2 1/4" tall in the drawing.
- **Rows.** The 3/4" end panels' and the 2 1/8" filler's text sit just under the first row's line, centred on their own ticks, and nothing overlaps. The runs row is at −21 3/4" and the window row at −30 3/4". Above the uppers, the 3/4" and 1 7/8" text sit above the on-line text.
- **Lineweights.** Turn on lineweight display if your viewer has it off: walls heaviest, then cabinets and countertops, then the rest. Hidden lines dash visibly.
- **Moving text in CAD.** Text you drag stays put. Stretching a dimension re-measures it.
- **G2, `elevation-A.dxf`.** The frame stiles (1 3/4", 2") and the 5" wall gap move off their lines. The two 1 3/4" stiles at the tall/base joint go on two levels.
- **Drawing scale 1/4" = 1'-0".** Everything doubles in the drawing: rows 18" apart, text 4 1/2".

**Known for now:**
- The width estimate is generous, so some labels that would just fit get moved anyway.
- Moved text has no leader. With many tiny segments side by side (rare) the levels can stack three or four deep.
- Titles keep their old sizes until labels and the title block.
