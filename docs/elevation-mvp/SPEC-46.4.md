# Round 46.4 — SPEC: door details in the elevation DXF

Steps 420–423. Geometry on `feature/drawing` (after step 374, 63 tests), then the designer on `elevation-doors` (after step 419, 1099 tests). The API doesn't change (its payload schema passes elevations through).
Doors & profiles rounds (DOORS-PROFILES-PLAN §10): 46 ✅ → 46.1 ✅ → 46.2 ✅ → 46.3 ✅ → **46.4 door details in the DXF** → 47+ profiles.

**Done when:**
- Each elevation DXF draws the same frame openings (5-piece) and molding rectangles (Slab AM) the canvas draws, on a new **DOOR_DETAILS** layer. Mid rails and mid stiles split them the same way. A part in front hides them like it hides an outline. Hidden detail lines are left out, never dashed.
- A room set to **Outlines only** exports no door details. A room with **Show style tags** on exports each part's style label (A, B, Std…) in the part's top-left corner on a new **DOOR_TAGS** layer.
- Plan DXF: each face is drawn at its own thickness. Step 385 already does this; step 423 adds a test to pin it.
- With no `doorDetails` in a payload, every DXF is what it is today.

| Step | Repo | What | Tests after |
|---|---|---|---|
| **420** | geometry | `doorDetails` on the payload; openings drawn on DOOR_DETAILS; two new layers | 63 → **67** |
| **421** | geometry | Style tags on DOOR_TAGS; README | **69** |
| **422** | designer | `elevationDoorDetails` | 1099 → **1104** |
| **423** | designer | The payload carries it; plan thickness pinned | **1106** |

420 must be in before you export with 423 in. Geometry rejects unknown payload keys, so an older geometry refuses `doorDetails`.

Codex writes the code (PROMPT-CONVENTIONS rule 10). No throwaway build was made for this SPEC. The designer values come from running the existing `runDoorDetails`, `elevationParts` and `planParts` read-only on the golden rooms. The geometry values were worked out by hand and checked by running the existing `hidden_line_removal` read-only on the same rectangles. If a test fails, fix the code, not the number, unless the number contradicts a rule here; then stop and say what you got.

---

## §1 Decisions (Claude's defaults, say if you want any changed)

- **Where the details ride.** A new list on each elevation, `doorDetails: [{ partId, openings?, tag? }]`, beside `parts`. It is not a new field on each part. The detail is drawn at its part's depth, so it hides the same way the part does, and the parts lists (and their tests) stay exactly as they are. `partId` must name a part in the same elevation; geometry rejects the payload otherwise.
- **Which parts.** Whatever `runDoorDetails` (SPEC-46.2) lists: faces (`door`, pair-door leaves, `drawer_front`, `false_front`, `panel` faces), back panel cells and blind panels. Their elevation part ids:
  - a face: `${pieceId}:${path}${half}` (`half` is `left`/`right` for a pair leaf, else empty), the id `elevationParts` already gives it. `runDoorDetails` keys a pair leaf `${pieceId}:${path}:${half}`, so the id is the key with that last `:` dropped.
  - a back panel cell or a blind panel: its `pieceId`. A blind panel with no end piece has no elevation part and is left out.
  All 94 door parts in the six golden rooms map to an existing part.
- **Openings** are `runDoorDetails`' `openings` as is, in wall coordinates (inches, z up). They are sent only when the room draws details (`doorDrawing(room).details`). A slab part has none.
- **Tags** (`tag` = the resolved style's `label`) are sent only when the room shows style tags (`doorDrawing(room).tags`). That is the same per-room toggle as the canvas, off by default. An entry with neither openings nor a tag isn't sent.
- **Drawing (geometry).**
  - Each opening's four sides go through hidden-line removal as lines inside its part, at the part's `front`.
  - Nearer opaque parts hide them. The detail itself hides nothing.
  - Visible segments go on `DOOR_DETAILS`; hidden ones are dropped. Dashed panel lines behind a light rail or a section would only be clutter.
- **Tag (geometry).** TEXT on `DOOR_TAGS` in `FF_TEXT`, height = dimension text (3/32" paper × plot scale, 2 1/4" at 1/2" = 1'-0"), top-left aligned, inset half a text height from the part's left and top edges. It's left out when the part is narrower than 4 text heights or shorter than 2 (at 1/2" = 1'-0": under 9" wide or 4 1/2" tall), the same as the canvas leaving tags off small parts.
- **Layers.** `DOOR_DETAILS` (colour 7, continuous, 0.13 mm), lighter than `FACES` (0.25). `DOOR_TAGS` (colour 6, continuous, 0.18 mm), magenta like the canvas's violet tags. Both can be switched off in CAD.
- **Not in 46.4:** one DXF detail block per style (52.1, needs the cross-section); profiles' offset lines (50); arched rails (51); end elevations showing end panel faces (TODO); the resolver/stacking warnings in the DXF (canvas only).

---

## §2 Step 420 — geometry: `doorDetails` and the DOOR_DETAILS layer

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/drawing/models.py` | 182 | `PayloadDoorDetail`; `PayloadElevation.doorDetails` and its check |
| `src/drawing/elevation_dxf.py` | 162 | detail shapes through HLR, visible lines on DOOR_DETAILS |
| `src/dxf/writer.py` | 171 | two layers |
| `tests/test_drawing_style.py` | 48 | the layer test's dict gets the two layers |
| NEW `tests/test_door_details.py` | — | 4 tests, verbatim |

**Contract.**
- `models.py`:
  - Import `model_validator` from pydantic.
  - NEW `PayloadDoorDetail` (extra `"forbid"`), after `PayloadMark`. Docstring: *A part's frame openings (5-piece) or molding rectangles (Slab AM) (SPEC-46.4), drawn at its part's depth on DOOR_DETAILS; its style tag on DOOR_TAGS (none = no tag).* Fields:
    - `partId: str = Field(min_length=1)`;
    - `openings: list[PayloadHole] = []`;
    - `tag: str | None = Field(default=None, min_length=1)`.
  - `PayloadElevation`, after `marks`: `doorDetails: list[PayloadDoorDetail] = []` with the comment `# Door details per part (SPEC-46.4); each names a part in this elevation.` and a `@model_validator(mode="after")` method that raises `ValueError` naming the unknown ids when any `partId` isn't the `id` of one of `self.parts`.
- `writer.py` `LAYER_DEFS`, after `MARKERS`, with the comment `# Door details and style tags in elevation (SPEC-46.4): lighter than faces.`:
  - `"DOOR_DETAILS": (7, "CONTINUOUS", 13),`
  - `"DOOR_TAGS":    (6, "CONTINUOUS", 18),`
- `elevation_dxf.py`:
  - Private `_opening_lines(openings) -> tuple`: the four sides of each opening as `((x1, z1), (x2, z2))` pairs.
  - After `shapes` is built: `by_id = {part.id: part for part in parts}`. `detail_shapes` = one `HlrShape` per `elevation.doorDetails` entry with openings:
    - `id=f"{part.id}#door"`;
    - `polygon=rect_polygon(part.x, part.z, part.width, part.height)`;
    - `front=part.front`;
    - `drop_hidden=True`;
    - `lines=_opening_lines(detail.openings)`;
    - `opaque=False`;
    - `outlined=False`.
  - `lines = hidden_line_removal(shapes + detail_shapes)` (one call). After the parts' write loop, for each detail shape, write `lines[shape.id][0]` to `"DOOR_DETAILS"`.
  - `visible_regions` keeps getting `shapes` only.
  - `tag` is accepted and not drawn yet (421).

**Don't touch:** `hlr.py`, `bundle.py`, `dimensions.py`, `marks.py`, the plan files, the fixtures, other tests.

**`tests/test_drawing_style.py`:** in `test_each_layer_has_its_lineweight_and_they_show`, after line 39 (`"HIDDEN": 18, …, "MARKERS": 25,`) add the line `        "DOOR_DETAILS": 13, "DOOR_TAGS": 18,`.

**NEW `tests/test_door_details.py`**, verbatim:

```python
"""Door details and style tags in the elevation DXF (SPEC-46.4)."""

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
PAYLOAD = json.loads((ROOT / "tests" / "fixtures" / "g1_payload.json").read_text())

# Faces as the designer sends them (SPEC-46.4): G1's 24" base door, the left leaf of its tall, G3's top drawer.
DOOR = {"id": "door", "kind": "face", "x": 30.0625, "z": 4.125, "width": 23.875, "height": 30.125,
        "back": 24.0625, "front": 24.875, "coversBoxEdges": True}
LEAF = {"id": "leaf", "kind": "face", "x": 0.8125, "z": 4.125, "width": 14.125, "height": 85.75,
        "back": 25.0625, "front": 25.875, "coversBoxEdges": True}
DRAWER = {"id": "drawer", "kind": "face", "x": 1.5625, "z": 28.375, "width": 19.375, "height": 5.875,
          "back": 21.0625, "front": 21.875, "coversBoxEdges": True}
# A panel 1" in front of the door, across its top: z 26 to 36.
SHADE = {"id": "shade", "kind": "panel", "x": 30, "z": 26, "width": 30, "height": 10,
         "back": 24.875, "front": 25.875, "coversBoxEdges": False}


def _box(x, z, width, height):
    return {"x": x, "z": z, "width": width, "height": height}


DOOR_OPENING = _box(33.0625, 7.125, 17.875, 24.125)


def _payload(parts, details, plot_scale=None):
    payload = copy.deepcopy(PAYLOAD)
    payload["elevations"][0]["parts"] = copy.deepcopy(parts)
    payload["elevations"][0]["doorDetails"] = copy.deepcopy(details)
    if plot_scale is not None:
        payload["plotScale"] = plot_scale
    return payload


def _msp(payload):
    archive = zipfile.ZipFile(io.BytesIO(base64.b64decode(draw(payload)["zip_base64"])))
    return ezdxf.read(io.StringIO(archive.read("elevation-A.dxf").decode("utf-8"))).modelspace()


def _lines(msp, layer):
    return list(msp.query(f'LINE[layer=="{layer}"]'))


def _length(lines):
    return sum(line.dxf.start.distance(line.dxf.end) for line in lines)


def test_each_opening_draws_on_door_details_inside_its_face():
    msp = _msp(_payload([DOOR], [{"partId": "door", "openings": [DOOR_OPENING]}]))
    details = _lines(msp, "DOOR_DETAILS")
    assert len(details) == 4
    assert _length(details) == pytest.approx(84)
    xs = [x for line in details for x in (line.dxf.start.x, line.dxf.end.x)]
    zs = [z for line in details for z in (line.dxf.start.y, line.dxf.end.y)]
    assert (min(xs), min(zs), max(xs), max(zs)) == pytest.approx((33.0625, 7.125, 50.9375, 31.25))
    assert len(_lines(msp, "FACES")) == 4
    assert _length(_lines(msp, "FACES")) == pytest.approx(108)
    assert _lines(_msp(_payload([DOOR], [])), "DOOR_DETAILS") == []


def test_mid_rails_come_as_separate_openings():
    msp = _msp(_payload([LEAF], [{"partId": "leaf", "openings": [
        _box(3.8125, 7.125, 8.125, 37.5), _box(3.8125, 47.625, 8.125, 39.25),
    ]}]))
    assert len(_lines(msp, "DOOR_DETAILS")) == 8
    assert _length(_lines(msp, "DOOR_DETAILS")) == pytest.approx(186)


def test_a_nearer_part_hides_door_details_and_they_are_never_dashed():
    msp = _msp(_payload([DOOR, SHADE], [{"partId": "door", "openings": [DOOR_OPENING]}]))
    details = _lines(msp, "DOOR_DETAILS")
    assert len(details) == 3  # the bottom, and each side up to the panel; the top is behind it
    assert _length(details) == pytest.approx(55.625)
    hidden = _lines(msp, "HIDDEN")  # only the door's own outline behind the panel
    assert len(hidden) == 3
    assert _length(hidden) == pytest.approx(40.375)


def test_door_details_round_trip_and_must_name_a_part_in_their_elevation():
    payload = _payload([DOOR], [{"partId": "door", "openings": [DOOR_OPENING], "tag": "A"}])
    archive = zipfile.ZipFile(io.BytesIO(base64.b64decode(draw(payload)["zip_base64"])))
    assert json.loads(archive.read("payload.json")) == payload
    for detail in (
        {"partId": "nope", "openings": [DOOR_OPENING]},
        {"partId": "door", "openings": [_box(33, 7, 0, 24)]},
        {"partId": "door", "tag": ""},
        {"partId": "door", "color": "red"},
    ):
        with pytest.raises(ValidationError):
            draw(_payload([DOOR], [detail]))
```

What the numbers are:
- The base door's opening is 17 7/8 × 24 1/8, so its four sides total 84.
- The leaf's two openings (a 3" mid rail at 42") total 91 1/4 + 94 3/4 = 186.
- With the panel over z 26–36, the detail keeps its bottom (17 7/8) and each side from 7 1/8 up to 26 (18 7/8 twice): 55 5/8. The door's own outline behind it (top 23 7/8, sides 34 1/4 − 26 = 8 1/4 twice) is the only dashed part: 40 3/8.

**Count:** 63 + 4 = **67**.

---

## §3 Step 421 — geometry: style tags; README

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/drawing/elevation_dxf.py` | ~185 | `_add_tags` |
| `README.md` | 69 | layer table and a sentence |
| `tests/test_door_details.py` | ~110 | two tests appended, verbatim |

**Contract.**
- `elevation_dxf.py`: private `_add_tags(modelspace, details, by_id, plot_scale)`. For each detail with a `tag`:
  - `h = DIMSTYLE_PAPER["dimtxt"] * plot_scale`, `part = by_id[detail.partId]`;
  - skip when `part.width < 4 * h - 1e-9` or `part.height < 2 * h - 1e-9`;
  - else: `modelspace.add_text(detail.tag, height=h, dxfattribs={"layer": "DOOR_TAGS", "style": TEXT_STYLE}).set_placement((part.x + h / 2, part.z + part.height - h / 2), align=TextEntityAlignment.TOP_LEFT)`.
- Call it right after the DOOR_DETAILS lines are written. Imports: `DIMSTYLE_PAPER` from `src.dxf.writer` (add it to the existing import), `TextEntityAlignment` from `ezdxf.enums`. Same pattern as `marks.py`.
- `README.md`:
  - layer table: a row `| door details (openings, molding rectangles) | DOOR_DETAILS |` and a row `| style tags | DOOR_TAGS |`;
  - after the "A part's `lines` …" paragraph: *An elevation's `doorDetails` (SPEC-46.4) give a part's frame openings or molding rectangles, drawn at its depth on `DOOR_DETAILS` (hidden segments left out), and its style tag in its top-left corner on `DOOR_TAGS`.*

**Don't touch:** `models.py`, `writer.py`, `marks.py`, other tests.

**Append to `tests/test_door_details.py`**, verbatim (and add `from ezdxf.enums import TextEntityAlignment` after `import pytest`):

```python


def test_a_style_tag_sits_in_its_parts_top_left_corner():
    msp = _msp(_payload([DOOR], [{"partId": "door", "tag": "A"}]))
    [tag] = msp.query('TEXT[layer=="DOOR_TAGS"]')
    assert (tag.dxf.text, tag.dxf.style, tag.dxf.height) == ("A", "FF_TEXT", 2.25)
    align, point, _ = tag.get_placement()
    assert (align, tuple(point)[:2]) == (TextEntityAlignment.TOP_LEFT, (31.1875, 33.125))
    assert _lines(msp, "DOOR_DETAILS") == []


def test_tags_scale_with_the_drawing_and_skip_parts_too_small_for_them():
    details = [{"partId": "door", "tag": "A"}, {"partId": "drawer", "tag": "B"}]

    def tags(plot_scale=None):
        msp = _msp(_payload([DOOR, DRAWER], details, plot_scale))
        return [
            (text.dxf.text, text.dxf.height, tuple(text.get_placement()[1])[:2])
            for text in msp.query('TEXT[layer=="DOOR_TAGS"]')
        ]

    assert tags() == [("A", 2.25, (31.1875, 33.125)), ("B", 2.25, (2.6875, 33.125))]
    assert tags(48) == [("A", 4.5, (32.3125, 32.0))]
```

What the numbers are:
- At 1/2" = 1'-0" the tag is 2 1/4" high, inset 1 1/8": the door's corner (30 1/16, 34 1/4) puts it at (31 3/16, 33 1/8).
- The 5 7/8" drawer is taller than 4 1/2" and wider than 9", so it gets one.
- At 1/4" = 1'-0" the tag is 4 1/2" high and inset 2 1/4: the door's goes to (32 5/16, 32). The drawer is under 9" tall, so it gets none.

**Count:** 67 + 2 = **69**.

---

## §4 Step 422 — designer: `elevationDoorDetails`

**Files:**

| File | Lines | Change |
|---|---:|---|
| NEW `src/elevation/model/elevationDoorDetails.js` | — | `elevationDoorDetails` |
| NEW `src/elevation/model/__tests__/elevationDoorDetails.test.js` | — | 5 tests, verbatim |

**Contract.** Imports: `resolveWall` (`./room.js`), `doorDrawing` and `runDoorDetails` (`./doorDetails.js`). Nothing imports the new file until 423, so there's no cycle.

`elevationDoorDetails(room, wall, side, settings, partIds = null)` → `[{ partId, openings?, tag? }]`:
- `{ details, tags } = doorDrawing(room)`; when both are false → `[]`.
- `view = resolveWall(room, wall, side)`. For each run of `view.runs` in order, each part of `runDoorDetails(room, view, run, settings).parts` in order:
  - `partId`:
    - `kind === 'face'`: `` `${pieceId}:${path}${half}` `` where `half = part.key.slice(`${pieceId}:${path}`.length + 1)` (empty when the key has nothing after the path);
    - otherwise `pieceId`; skip the part when it's `null`.
  - Skip when `partIds` is given and doesn't have `partId`.
  - Entry `{ partId }`, then `openings` (each opening as `{ x, z, width, height }`) when `details` and the part has openings, then `tag: part.label` when `tags`. Skip an entry that got neither.
- Doc comment: *Each part's door detail on one wall face as geometry draws it (SPEC-46.4): openings when the room draws details, the style label when it shows tags; keyed by the part's id in `elevationParts`.*

**Don't touch:** `doorDetails.js`, `elevationParts.js`, `drawingPayload.js`, `index.js`, other tests.

**NEW `src/elevation/model/__tests__/elevationDoorDetails.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DOOR_STYLE } from '../doorStyles.js';
import { elevationDoorDetails } from '../elevationDoorDetails.js';
import { elevationParts } from '../elevationParts.js';
import { gridLeaves } from '../grid.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);

const C = { ...DEFAULT_DOOR_STYLE, id: 'ds-c', label: 'C', designId: 'slab-applied' };
const SL = { ...DEFAULT_DOOR_STYLE, id: 'ds-s', label: 'S', designId: 'slab' };

const TALL_CAB = '28072a7d-e691-40d1-a005-4d0ed1c9e825';
const BASE = 'b822e8ac-1a44-47ca-acec-ecb93caf7b8a';
const CAB_24 = 'cfc9c904-3a11-43ee-a48d-88bef061b5ae';
const CAB_36 = '0f652c26-5f80-4387-8a1b-1f35ada26b59';
const CAB_C = '0624c9d5-b951-4191-95f2-1562a6b32343';
const CAB_D = 'e3bfb331-0a5d-4cf2-aaba-929c53ca8c54';
const UP_1 = 'ae7626bb-d1e5-4396-8b5b-a8630bfed949';
const UP_2 = '2dc1a45e-c462-4c4a-99f3-65c8b6782a2a';
const G3_DRAWERS = '2648a74b-7f13-44c5-af7d-d1b88ae0d75c';
const G3_UPPER = 'bcdd4e78-0d52-40d0-9f5d-2901e590e98a';
const G3_BACK = '5f4db696-00e1-4303-9881-23a4d8ae7a64';

const box = (x, z, width, height) => ({ x, z, width, height });
const G1_A_IDS = [
  `${TALL_CAB}:rleft`, `${TALL_CAB}:rright`, `${CAB_24}:r`, `${CAB_36}:rleft`, `${CAB_36}:rright`,
  `${CAB_C}:rleft`, `${CAB_C}:rright`, `${CAB_D}:rleft`, `${CAB_D}:rright`, `${UP_1}:r`, `${UP_2}:r`,
];

/** A golden room with C (Slab AM) and S (slab) listed, `patch` on the room, after `edit`, synced. */
function room(name, patch = {}, edit = () => {}) {
  const copy = { ...structuredClone(stored(name)), ...patch, doorStyles: [C, SL] };
  edit(copy);
  return syncRoom(copy, settings);
}
const wallWith = (synced, runId) => synced.walls.find((wall) => wall.runs.some((run) => run.id === runId));
/** G1 elevation A: wall 1, front. */
const g1A = (synced, partIds) => elevationDoorDetails(synced, wallWith(synced, BASE), 'front', settings, partIds);

describe('SPEC-46.4 door details for one wall face', () => {
  it('gives every door its frame opening, keyed by its elevation part (G1 A)', () => {
    const synced = room('G1 Euro kitchen');
    const result = g1A(synced);
    expect(result.map(({ partId }) => partId)).toEqual(G1_A_IDS);
    expect(result.slice(0, 3)).toEqual([
      { partId: `${TALL_CAB}:rleft`, openings: [box(3.8125, 7.125, 8.125, 79.75)] },
      { partId: `${TALL_CAB}:rright`, openings: [box(18.0625, 7.125, 8.125, 79.75)] },
      { partId: `${CAB_24}:r`, openings: [box(33.0625, 7.125, 17.875, 24.125)] },
    ]);
    const ids = new Set(elevationParts(synced, wallWith(synced, BASE), 'front', settings).map(({ id }) => id));
    expect(result.every(({ partId }) => ids.has(partId))).toBe(true);
  });

  it('keys drawer fronts by their path and a back panel cell by its piece (G3)', () => {
    const synced = room('G3 Bath alcove');
    const result = elevationDoorDetails(synced, wallWith(synced, G3_UPPER), 'front', settings);
    expect(result).toHaveLength(9);
    expect(result[0]).toEqual({ partId: `${G3_DRAWERS}:r.0`, openings: [box(4.5625, 30.25, 13.375, 2.125)] });
    expect(result[8]).toEqual({ partId: G3_BACK, openings: [box(3.75, 39, 64.5, 35.25)] });
  });

  it('follows the room\'s Draw door details and Show style tags choices', () => {
    expect(g1A(room('G1 Euro kitchen', { doorDetails: false }))).toEqual([]);
    const tagged = g1A(room('G1 Euro kitchen', { doorStyleTags: true }));
    expect(tagged[2]).toEqual({ partId: `${CAB_24}:r`, openings: [box(33.0625, 7.125, 17.875, 24.125)], tag: 'Std' });
    const tagsOnly = g1A(room('G1 Euro kitchen', { doorDetails: false, doorStyleTags: true }));
    expect(tagsOnly.map(({ partId }) => partId)).toEqual(G1_A_IDS);
    expect(tagsOnly[2]).toEqual({ partId: `${CAB_24}:r`, tag: 'Std' });
  });

  it('sends Slab AM molding rectangles; a slab part only when tags are on', () => {
    const edit = (r) => {
      r.doorStyleId = 'ds-c';
      const base = r.walls.flatMap((wall) => wall.runs).find((run) => run.id === BASE);
      gridLeaves(base.grid).find((node) => node.id === CAB_36).face = { type: 'pair_door', size: null, styleId: 'ds-s' };
    };
    const result = g1A(room('G1 Euro kitchen', {}, edit));
    expect(result.map(({ partId }) => partId)).toEqual(G1_A_IDS.filter((id) => !id.startsWith(CAB_36)));
    expect(result.find(({ partId }) => partId === `${CAB_24}:r`))
      .toEqual({ partId: `${CAB_24}:r`, openings: [box(33.0625, 7.125, 17.875, 24.125)] });
    const tagged = g1A(room('G1 Euro kitchen', { doorStyleTags: true }, edit));
    expect(tagged.filter(({ partId }) => partId.startsWith(CAB_36))).toEqual([
      { partId: `${CAB_36}:rleft`, tag: 'S' },
      { partId: `${CAB_36}:rright`, tag: 'S' },
    ]);
    expect(tagged[0].tag).toBe('C');
  });

  it('leaves out parts the elevation doesn\'t draw', () => {
    const synced = room('G1 Euro kitchen');
    expect(g1A(synced, new Set([`${CAB_24}:r`, `${UP_2}:r`])).map(({ partId }) => partId))
      .toEqual([`${CAB_24}:r`, `${UP_2}:r`]);
    expect(g1A(synced, new Set())).toEqual([]);
  });
});
```

What the numbers are: the openings are what `runDoorDetails` gives today for these parts (SPEC-46.2's rules).
- G1's tall leaves are 14 1/8 × 85 3/4 with 3" stiles and rails.
- G3's 5 7/8" top drawer has 1 7/8" rails.
- G3's back panel cell takes the room's panel style (46.3), the team default 5-piece: 64 1/2 × 35 1/4 inside 3" stiles and rails.
- Slab AM's molding rectangle on the 24" base door is the same rectangle as the 5-piece opening.

**Count:** 1099 + 5 = **1104**. Golden snapshot unchanged.

---

## §5 Step 423 — designer: the payload carries the door details; plan thickness pinned

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/drawingPayload.js` | 70 | each elevation gets `doorDetails` |
| `src/elevation/model/__tests__/drawingPayload.test.js` | 129 | helper deletes `doorDetails`; two tests appended |

**Contract.**
- `drawingPayload.js`:
  - `import { elevationDoorDetails } from './elevationDoorDetails.js';` after the `elevationMarks` import.
  - In the elevations map, build the parts array once (`const parts = [ …the four spreads… ]`), then return the same object with `parts` and, after `marks`, `doorDetails: elevationDoorDetails(room, wall, side, settings, new Set(parts.map(({ id }) => id)))`.
  - The doc comment's round list ends: *…45.1 its markers and labels; 46.4 each face's door details.*
- `drawingPayload.test.js`:
  - imports: `elevationDoorDetails` (`../elevationDoorDetails.js`) after the `elevationMarks` import, `DEFAULT_DOOR_STYLE` (`../doorStyles.js`) and `gridLeaves` (`../grid.js`);
  - in `withoutParts`, add `delete copy.doorDetails;` after `delete copy.marks;`;
  - append the two tests below inside the describe, after the SPEC-45.1 test.

**Don't touch:** `ExportDxfButton.jsx`, `elevationDoorDetails.js`, `planParts.js`, the API.

**Append to `drawingPayload.test.js`** (inside the `describe`), verbatim:

```js

  it('SPEC-46.4 carries each wall face\'s door details', () => {
    const synced = room('G1 Euro kitchen');
    const payload = toDrawingPayload(synced, settings);
    expect(payload.elevations.map((elevation) => elevation.doorDetails.length)).toEqual([11, 12, 6, 6]);
    for (const elevation of payload.elevations) {
      const wall = synced.walls.find((candidate) => candidate.id === elevation.wallId);
      const ids = new Set(elevation.parts.map(({ id }) => id));
      expect(elevation.doorDetails).toEqual(elevationDoorDetails(synced, wall, elevation.side, settings, ids));
    }
  });

  it('SPEC-46.4 draws each face in plan at its own thickness; the filler follows the thickest (G1)', () => {
    const BASE = 'b822e8ac-1a44-47ca-acec-ecb93caf7b8a';
    const CAB_24 = 'cfc9c904-3a11-43ee-a48d-88bef061b5ae';
    const CAB_36 = '0f652c26-5f80-4387-8a1b-1f35ada26b59';
    const copy = structuredClone(document.rooms.find((candidate) => candidate.name === 'G1 Euro kitchen'));
    copy.doorStyles = [{ ...DEFAULT_DOOR_STYLE, id: 'ds-thick', label: 'A', thickness: 1 }];
    const base = copy.walls.flatMap((wall) => wall.runs).find((run) => run.id === BASE);
    gridLeaves(base.grid).find((node) => node.id === CAB_24).doorStyleId = 'ds-thick';
    const { parts } = toDrawingPayload(syncRoom(copy, settings), settings).plan;
    const points = (id) => parts.find((part) => part.id === id).points;
    expect(points(`${CAB_24}:r`))
      .toEqual([[-35.9375, -53.9375], [-35.9375, -30.0625], [-34.9375, -30.0625], [-34.9375, -53.9375]]);
    expect(points(`${CAB_36}:rleft`))
      .toEqual([[-35.9375, -29.9375], [-35.9375, -12.0625], [-35.125, -12.0625], [-35.125, -29.9375]]);
    expect(points(`${BASE}:right`))
      .toEqual([[-35.9375, 57], [-35.9375, 59.125], [-34.9375, 59.125], [-34.9375, 57]]);
  });
```

What the numbers are:
- G1's four elevations have 11, 12, 6 and 6 door parts, every one mapping to a part.
- In plan, the 24" cabinet's face goes from the same back line (x −35 15/16) out 1" to −34 15/16; the 36" cabinet's stays 13/16" (to −35 1/8); the right filler comes out to the thickest face.
- The plan test passes before this step (step 385 built it). It pins it.

**Count:** 1104 + 2 = **1106**. Gate: `npm test && npm run lint && npm run build`. Golden snapshot unchanged.

---

## End-to-end check (Kyle)

Geometry with 421 in, the designer built after 423. Export G1, G3 and one of your own rooms.

- **G1 elevation A:** every door shows its 3" frame opening on DOOR_DETAILS, lighter than the face outlines. The tall's leaves show one long opening each. Turn the DOOR_DETAILS layer off: back to outlines only.
- **G3:** the drawer stack's short-face rails (the top drawer's narrower), and the back panel cell's frame.
- **Mid rail:** add one to a tall door (Stiles & rails): two openings in the DXF too.
- **Slab AM / Slab:** a room whose style is Slab AM shows the molding rectangles; a Slab style shows outlines only.
- **Room → Door styles:**
  - uncheck **Draw door details** and export: no DOOR_DETAILS lines.
  - check **Show style tags**: each part's label sits in its top-left corner on DOOR_TAGS; small drawer fronts at 1/4" = 1'-0" have none.
- **Plan:** a face given a thicker style is drawn thicker. The plan DXF already did this since 385.

**Known for now:**
- Detail lines hidden behind something are dropped, not dashed. Say if you'd rather see them dashed.
- No per-style DXF detail block yet (52.1, after the cross-section); profiles square; arches later.
- End panels and wall end panels are edge-on in elevations, so their details wait for end elevations (TODO).
