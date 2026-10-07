# Round 45 — SPEC: wall dimensions in the plan DXF

Steps 371–373. Geometry (371), then designer (372, 373). The API doesn't change: its schema passes unknown fields through.
Drawing rounds: 44.2 plan layout fix → **45 wall dimensions in plan** → 45.1 elevation markers and labels in plan → 45.2 run depths and clearances in plan → sheet layout.

**Done when:**
- `plan.dxf` dimensions every wall as the plan view does: the overall length, and inside it the row of doors, windows, recesses and wing walls along the front face (casing to casing), as real DIMENSION entities on `DIMENSIONS` in the `FF` style. Angled walls get aligned dimensions. Text always reads from the bottom or the right.
- A wing wall landing on a wall's back face gets its row on the room side, as on the canvas.
- Rows sit 3/8" (paper) past the wall, any recess bump-out, and (when the face behind has runs) those runs and their elevation marker, 3/8" apart, with moved text pushing the next row out, the same rules as the elevation rows.
- The plan title moves under the lowest dimension.

| Step | Repo | What | Tests after |
|---|---|---|---|
| **371** | geometry | `PayloadPlanDimension`, aligned dimensions in `plan.dxf`, title under them | 56 → **60** |
| **372** | designer | `planDimensions`: each wall's length and face rows (nothing calls it yet) | 952 → **957** |
| **373** | designer | `plan.dimensions` on the payload | **958** |

Codex writes the code (PROMPT-CONVENTIONS rule 10). This SPEC gives the rules, the contracts and the tests. The test values were checked against a throwaway build of these rules (designer 958, lint 0 errors; geometry 60; the golden snapshot doesn't change in any step). That build isn't in this SPEC. If a test fails, fix the code, not the number, unless the number contradicts a rule here. In that case, stop and say so.

---

## §1 Decisions (Kyle, 2026-10-06)

- **Round 45 is three small rounds (Kyle: "smaller is better").** 45 the walls' dimensions; 45.1 elevation markers and door/window/recess labels; 45.2 run depths and clearances. **No wall numbers** in the DXF (Kyle).
- **What the canvas draws, with paper spacing.** `PlanWallShape` draws, per wall, the overall length outside the wall and, between the wall and the length, a row along the front face (`wallFaceSegments(..., 'front')`: wing wall landings, doors and windows outside casing to outside casing, recesses, the spaces between). A back face with landings gets its row on the room side. The DXF draws the same rows, but the canvas's pixel offsets become paper inches like the elevation rows (SPEC-43): the first row 3/8" (paper) past the wall's edge, rows 3/8" apart, plus a text level for each level of moved text.
- **Where the wall's edge is.** Measured from the front face line:
  - Outside (the exterior, −n): the wall's thickness plus the larger of (a) the deepest recess bump-out on the front face (a recess at least as deep as the wall, its depth; as the canvas's `bumpOut`) and (b) when the **back** face has a letter, how far its runs and its marker reach: the deepest back run's front depth (`frontDepth`) + 6" + (2 × 1/4" + 3/16") × plot scale (the marker circle's diameter plus its flag, 45.1). So an island's length clears the runs on its back and that face's marker (G1's island: 12 7/8 + 6 + 16 1/2 = 35 3/8").
  - Room side (+n), for the back row only: the same with the sides swapped (back face bump-outs; the front face's letter, runs and marker). From the back face line, that's where the canvas puts it.
  - (Claude's default: the canvas runs the length through an island's back runs; the DXF clears them so the dimension never crosses cabinets.)
- **Aligned dimensions.** Each record is `{ row, kind, start: [x, y], end: [x, y], offset, text, textAt? }` in plan inches, **y up** (the plan parts' coordinates). Extension lines start at `start` and `end` (geometry's `dimexo` leaves the 1/16" gap); the dimension line is `offset` to the **left** of start→end (negative: right), as ezdxf's `add_aligned_dim` takes it. `offset: 0` puts the line on the measured points with no extension lines (45.2 uses that).
- **Readable.** The designer orders each record so start→end runs left to right, or straight up when it's vertical (|dx| ≤ 1e-6 and dy > 0), and signs `offset` to match. ezdxf turns the text with the line, so this is what keeps it upright. Text sits above the line (`dimtad`), i.e. on start→end's left.
- **Text that doesn't fit** moves outward, centred on its segment, by `placeLabels` (now exported from `elevationDimensions.js`, unchanged): same width estimate, gap and levels as the elevations. `textAt` is its middle in plan coordinates.
- **Row names and kinds.** `row`: `'front'` (the front face row), `'wall'` (overall), `'back'` (the back face row). `kind`: the segment's kind (`space`, `opening`, `landing`, `recess`) or `'wall'`.
- **Order.** Per wall in `room.walls` order: exterior rows (front, then wall), then the back row. A wall with no length sends nothing.
- **Geometry** draws each record with `add_aligned_dim`, layer `DIMENSIONS`, dimstyle `FF` (added to `plan.dxf` with the plot scale), text as sent, `<>` kept on the entity so CAD can re-measure, `textAt` placed with no leader. Same as `add_dimensions` for elevations.
- **Title.** `PLAN` and the room name go 12" and 18" under the lowest point of any part, dimension end, dimension line end or moved text. Its left edge stays at the parts' leftmost point.
- **Payload.** `plan.dimensions` defaults to `[]`, so a payload without it round-trips and every existing test stays green.

---

## §2 Step 371 — geometry: aligned dimensions in plan

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/drawing/models.py` | 147 | `PayloadPlanDimension`; `PayloadPlan.dimensions` |
| `src/drawing/dimensions.py` | 48 | `add_plan_dimensions` |
| `src/drawing/plan_dxf.py` | 89 | dimstyle, the dimensions, the title under them |
| NEW `tests/test_plan_dimensions.py` | — | 4 tests, verbatim |

**Models** (`extra="forbid"`, placed above `PayloadPlan`):
- `PayloadPlanDimension`, docstring "One aligned dimension in plan (SPEC-45), plan inches with y up: measured from start to end, extension lines from those points, the dimension line `offset` to the left of start→end (negative: right).": `row: str` (min_length=1); `kind: str` (min_length=1); `start: tuple[float, float]`; `end: tuple[float, float]`; `offset: float`; `text: str` (min_length=1); `textAt: tuple[float, float] | None = None` with the comment "Where the text's middle goes when it doesn't fit between the ticks; None = on the line."
- `PayloadPlan` gets, after `parts`, `dimensions: list[PayloadPlanDimension] = []` with the comment "Wall lengths and the rows along each face (SPEC-45); depths and clearances in 45.2."

**`dimensions.py`**: `add_plan_dimensions(modelspace, dimensions) -> None`, docstring "Aligned dimensions in plan (SPEC-45), in the FF style. At offset 0 the dimension line is the measured line, with no extension lines." For each record: skip it when start and end are within `EPSILON`; `modelspace.add_aligned_dim(p1=start, p2=end, distance=offset, dimstyle=DIMSTYLE, text=text, override={"dimse1": on_line, "dimse2": on_line}, dxfattribs={"layer": "DIMENSIONS"})` where `on_line` is 1 when `abs(offset) <= EPSILON`, else 0; when `textAt` is set, `override.set_location(textAt, leader=False, relative=False)`; `override.render()`; `override.dimension.dxf.text = "<>"`. Follow `add_dimensions` just above it.

**`plan_dxf.py`**:
- `add_dimstyle(doc, plot_scale)` right after `create_dxf_document()` (as `build_elevation_dxf` does).
- `dimension_points(dimensions) -> list`, docstring "Every point a plan dimension reaches (SPEC-45): its ends, its dimension line's ends and moved text." Per record with a length over `EPSILON`: start, end, start and end each moved by `offset` along start→end's left normal `(-dy, dx) / length`, and `textAt` when set.
- After the parts are drawn, `add_plan_dimensions(modelspace, plan.dimensions)`.
- The title's `low` is the lowest y over the part points **and** `dimension_points(plan.dimensions)`. `left` stays the parts' lowest x. The title still needs at least one part point to be drawn.

**Don't touch:** `elevation_dxf.py`, `add_dimensions`, `writer.py`, `bundle.py`, `marks.py`, `hlr.py`, the fixtures, any existing test. No new dependencies.

**NEW `tests/test_plan_dimensions.py`**, verbatim:

```python
"""Plan dimensions (SPEC-45)."""

import base64
import copy
import io
import json
import zipfile
from pathlib import Path

import ezdxf
import pytest
from ezdxf.entities import DimStyleOverride
from pydantic import ValidationError

from src.drawing.bundle import draw

ROOT = Path(__file__).resolve().parent.parent
ELEVATIONS = json.loads((ROOT / "tests" / "fixtures" / "g1_payload.json").read_text())

# A 120" wall along x with a 4 1/2" thickness below it, a 60" wall going down from its right end.
PLAN = {
    "parts": [
        {"id": "A:wall", "kind": "wall", "points": [[0, 0], [120, 0], [124.5, -4.5], [0, -4.5]]},
        {"id": "B:wall", "kind": "wall", "points": [[120, 0], [120, -60], [124.5, -60], [124.5, -4.5]]},
    ],
    "dimensions": [
        # Wall A's length, 9" below its back face: to the right of start→end.
        {"row": "wall", "kind": "wall", "start": [0, -4.5], "end": [120, -4.5], "offset": -9, "text": '120"'},
        # Wall B's length, read from the right: start at the bottom, 9" past its back face.
        {"row": "wall", "kind": "wall", "start": [124.5, -60], "end": [124.5, 0], "offset": -9, "text": '60"'},
        # On its own line, no extension lines; the text moved off it.
        {"row": "depth", "kind": "depth", "start": [30, -24], "end": [30, 0], "offset": 0, "text": '24"',
         "textAt": [36, -12]},
    ],
}
PAYLOAD = {**ELEVATIONS, "plan": PLAN}


def _dxf(payload):
    archive = zipfile.ZipFile(io.BytesIO(base64.b64decode(draw(payload)["zip_base64"])))
    return ezdxf.read(io.StringIO(archive.read("plan.dxf").decode("utf-8")))


def _round(point):
    return tuple(round(value, 4) + 0 for value in tuple(point)[:2])


def test_each_record_is_an_aligned_dimension_on_dimensions():
    doc = _dxf(PAYLOAD)
    dimensions = list(doc.modelspace().query("DIMENSION"))
    # Aligned: a linear dimension at the angle of start→end.
    assert [(d.dxf.layer, d.dxf.dimstyle, d.dxf.angle) for d in dimensions] == [
        ("DIMENSIONS", "FF", 0), ("DIMENSIONS", "FF", 90), ("DIMENSIONS", "FF", 90),
    ]
    assert [d.get_measurement() for d in dimensions] == pytest.approx([120, 60, 24])
    assert [(_round(d.dxf.defpoint2), _round(d.dxf.defpoint3), _round(d.dxf.defpoint)) for d in dimensions] == [
        ((0, -4.5), (120, -4.5), (0, -13.5)),
        ((124.5, -60), (124.5, 0), (133.5, -60)),
        ((30, -24), (30, 0), (30, -24)),
    ]
    assert {d.dxf.text for d in dimensions} == {"<>"}
    shown = [[e.dxf.text for e in doc.blocks.get(d.dxf.geometry) if e.dxftype() == "MTEXT"] for d in dimensions]
    assert shown == [['120"'], ['60"'], ['24"']]
    assert doc.dimstyles.get("FF").dxf.dimscale == 24


def test_on_the_line_no_extension_lines_and_moved_text_where_sent():
    doc = _dxf(PAYLOAD)
    dimensions = list(doc.modelspace().query("DIMENSION"))
    flags = [(DimStyleOverride(d).get("dimse1"), DimStyleOverride(d).get("dimse2")) for d in dimensions]
    assert flags == [(0, 0), (0, 0), (1, 1)]
    moved = [e for e in doc.blocks.get(dimensions[2].dxf.geometry) if e.dxftype() == "MTEXT"][0]
    assert _round(moved.dxf.insert) == (36, -12)


def test_the_title_goes_under_the_lowest_dimension_and_a_plan_without_them_is_unchanged():
    texts = [(t.dxf.text, _round(t.dxf.insert)) for t in _dxf(PAYLOAD).modelspace().query("TEXT")]
    assert texts == [("PLAN", (0, -72)), ("G1 Euro kitchen", (0, -78))]
    low = copy.deepcopy(PAYLOAD)
    low["plan"]["dimensions"][1]["start"] = [124.5, -70]
    texts = [(t.dxf.text, _round(t.dxf.insert)) for t in _dxf(low).modelspace().query("TEXT")]
    assert texts == [("PLAN", (0, -82)), ("G1 Euro kitchen", (0, -88))]
    bare = copy.deepcopy(PAYLOAD)
    del bare["plan"]["dimensions"]
    assert not list(_dxf(bare).modelspace().query("DIMENSION"))


def test_rejects_a_dimension_with_no_text_or_a_three_number_point():
    for change in ({"text": ""}, {"start": [0, 0, 0]}):
        payload = copy.deepcopy(PAYLOAD)
        payload["plan"]["dimensions"][0].update(change)
        with pytest.raises(ValidationError):
            draw(payload)
```

What the numbers are: wall A's length line is 9" to the right of (0, −4.5)→(120, −4.5), so at y −13.5. Wall B's runs up from (124.5, −60); its line is 9" to the right, at x 133.5. ezdxf stores an aligned dimension as a linear one at the angle of start→end (0, 90, 90). The lowest point is wall B's end (−60): the title sits at −72 and −78; moving that dimension's start to −70 moves it to −82 and −88. The rejection test passes before the change too (an unknown `dimensions` field is already refused); it guards the shape.

**Count:** 56 + 4 = **60**.

---

## §3 Step 372 — designer: `planDimensions`, each wall's length and face rows

A new module nothing calls yet, and one export added.

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/elevationDimensions.js` | 202 | line 45: `function placeLabels(` → `export function placeLabels(` (nothing else) |
| NEW `src/elevation/model/planDimensions.js` | — | `planDimensions(room, settings)`, three marker constants |
| NEW `src/elevation/model/__tests__/planDimensions.test.js` | — | 5 tests, verbatim |

**Contract.**
- Exported constants (paper inches unless said; 45.1's markers use them, so the rows can clear them): `PLAN_MARKER_RADIUS = 0.25`, `PLAN_MARKER_FLAG = 0.1875`, `PLAN_MARKER_CLEARANCE = 6` (drawing inches, the canvas's `MARKER_CLEARANCE`). One comment: the elevation marker's circle and flag on paper; geometry draws them the same size (SPEC-45.1).
- `planDimensions(room, settings)` → the records of §1. Doc comment: the plan's dimensions for the DXF (SPEC-45), aligned, plan inches with y up, readable from the bottom or the right.
- `scale = plotScale(settings)`, `spacing = DIMENSION_ROW_SPACING × scale`, `letters = elevationLetters(room)`.
- Private helpers:
  - `bumpOut(wall, side)`: the largest `recess.depth` over `recessesOn(wall, side)` that aren't projections and are at least `wall.thickness − 1e-6` deep, else 0 (the canvas's `bumpOut` in `PlanWallShape.jsx`).
  - `deepestRun(wall, side, settings)`: the largest `frontDepth(run, settings)` over the wall's runs on that side (`wallSideOf(run)`), else 0.
  - `markerReach(room, wall, side, settings, letters)`: 0 when `letters` has no `elevationKey(wall.id, side)`, else `deepestRun + PLAN_MARKER_CLEARANCE + (2 × PLAN_MARKER_RADIUS + PLAN_MARKER_FLAG) × scale`.
  - `rowRecords(row, segments, base, outward, at, scale)` → `{ records, levels, step }`. `base(u)` is the plan point (canvas coordinates, y down) on the row's base line at `u` along it; `outward` is the canvas unit vector the row moves out along; `at` is how far out the dimension line is.
    - `up(point) = [point.x + 0, 0 - point.y]` (no −0).
    - `a = up(base(first segment start))`, `b = up(base(last segment end))`. `forward` = `b.x − a.x > 1e-6`, or |b.x − a.x| ≤ 1e-6 and `b.y > a.y`. (dx, dy) = b − a when forward, else a − b.
    - `sign` = +1 when start→end's left normal (−dy, dx) points the same way as `outward` in y-up terms (`-dy * outward.x + dx * -outward.y > 0`), else −1.
    - `placeLabels(segments, at, +1, scale, sign > 0)`; each placed label becomes `{ row, kind: segment.kind, start, end, offset: sign × at + 0, text, textAt? }` with start/end = `up(base(segment.start))`/`up(base(segment.end))`, swapped when not forward. A moved label (`along` defined) gets `textAt = up(base(along) + outward × across)`.
- Per wall in `room.walls` order, `frame = wallFrame(room, wall)`; skip when `frame.length ≤ 1e-6`.
  - `exterior = −frame.n`, `outside = wall.thickness + max(bumpOut(wall, 'front'), markerReach(..., 'back', ...))`, `front(u) = frame.leftPoint + frame.r × u + exterior × outside`.
  - `backFrame = wallSideFrame(room, wall, 'back')`, `inside = wall.thickness + max(bumpOut(wall, 'back'), markerReach(..., 'front', ...))`, `backBase(u) = backFrame.leftPoint + backFrame.r × u + frame.n × inside`.
  - Outward `exterior`: `'front'` with `wallFaceSegments(room, wall, 'front', settings)` on `front`, then `'wall'` with `[{ start: 0, end: frame.length, kind: 'wall' }]` on `front`. Outward `frame.n`: `'back'` with `wallFaceSegments(room, wall, 'back', settings)` on `backBase`.
  - Each side starts `at = spacing`. Each row drops segments ≤ 1e-6 long and is skipped when none are left; after a row, `at += spacing + levels × step` (as `elevationDimensions` does).

**Reuse:** `placeLabels`, `DIMENSION_ROW_SPACING` (`./elevationDimensions.js`), `plotScale` (`./drawingScale.js`), `frontDepth` (`./corners.js`), `wallFrame` (`./geometry.js`), `recessesOn` (`./recesses.js`), `elevationKey`, `elevationLetters` (`./topology.js`), `wallFaceSegments` (`./wallFaceRow.js`), `wallSideFrame`, `wallSideOf` (`./wallSides.js`). No import cycle.

**Don't touch:** anything else in `elevationDimensions.js`, `wallFaceRow.js`, `PlanWallShape.jsx` and the plan canvas, `drawingPayload.js`, `index.js`, existing tests.

**NEW `src/elevation/model/__tests__/planDimensions.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { planDimensions } from '../planDimensions.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);
const dimensions = (room) => planDimensions(syncRoom(room, settings), settings);
const WALL_ROWS = ['front', 'back', 'wall'];
const wallRows = (room) => dimensions(room).filter(({ row }) => WALL_ROWS.includes(row));
const wall = (start, end, offset, text) => ({ row: 'wall', kind: 'wall', start, end, offset, text });

describe('SPEC-45 plan dimensions: each wall\'s length and the rows along its faces', () => {
  it('dimensions the window row, then the length, 3/8" (paper) apart outside each wall (G1)', () => {
    expect(wallRows(stored('G1 Euro kitchen'))).toEqual([
      { row: 'front', kind: 'space', start: [-64.5, -84], end: [-64.5, -39], offset: 9, text: '45"' },
      { row: 'front', kind: 'opening', start: [-64.5, -39], end: [-64.5, 15], offset: 9, text: '54"' },
      { row: 'front', kind: 'space', start: [-64.5, 15], end: [-64.5, 84], offset: 9, text: '69"' },
      wall([-64.5, -84], [-64.5, 84], 18, '168"'),
      wall([-60, 88.5], [60, 88.5], 9, '120"'),
      wall([64.5, 57], [64.5, 84], -9, '27"'),
      // The island has no thickness: its length goes past the runs on its back face (12 7/8" deep) and
      // that face's marker (6" + 1/2" + 3/16" + 1/4" paper = 22 1/2").
      wall([9.5, -39.25], [101, -39.25], -9, '91 1/2"'),
    ]);
  });

  it('moves text that doesn\'t fit off the line and the next row out past it (G2, G3)', () => {
    expect(wallRows(stored('G2 Face frame kitchen'))).toEqual([
      { row: 'front', kind: 'space', start: [-86, 19.5], end: [-84, 19.5], offset: 9, text: '2"', textAt: [-85, 34.875] },
      { row: 'front', kind: 'opening', start: [-84, 19.5], end: [-42, 19.5], offset: 9, text: '42"' },
      { row: 'front', kind: 'space', start: [-42, 19.5], end: [86, 19.5], offset: 9, text: '128"' },
      wall([-86, 19.5], [86, 19.5], 21.75, '172"'),
      wall([132.5, -63.5], [132.5, 15], -9, '78 1/2"'),
    ]);
    expect(dimensions(stored('G3 Bath alcove')).filter(({ row }) => row === 'front')).toEqual([
      { row: 'front', kind: 'space', start: [-102, 13.5], end: [-30, 13.5], offset: 9, text: '72"' },
      { row: 'front', kind: 'landing', start: [-30, 13.5], end: [-25.5, 13.5], offset: 9, text: '4 1/2"', textAt: [-27.75, 28.875] },
      { row: 'front', kind: 'space', start: [-25.5, 13.5], end: [66, 13.5], offset: 9, text: '91 1/2"' },
    ]);
  });

  it('starts the rows past the deepest recess bump-out (G5)', () => {
    const rows = wallRows(stored('G5 Recess room'));
    expect(rows.map(({ row, kind, start, end, offset }) => [row, kind, start[0], end[0], start[1], offset])).toEqual([
      ['wall', 'wall', -114.5, -114.5, -15, 9],
      ['front', 'space', -110, -78, 43.5, 9],
      ['front', 'recess', -78, -30, 43.5, 9],
      ['front', 'space', -30, 30, 43.5, 9],
      ['front', 'recess', 30, 78, 43.5, 9],
      ['front', 'space', 78, 90, 43.5, 9],
      ['wall', 'wall', -110, 90, 43.5, 18],
      ['wall', 'wall', 94.5, 94.5, -15, -9],
    ]);
  });

  it('dimensions a wing wall on a back face on the room side, past the front runs and their marker (G3, wing moved behind)', () => {
    const room = structuredClone(stored('G3 Bath alcove'));
    Object.assign(room.walls[2], { x1: -30, y1: -13.5, x2: -30, y2: -43.5 });
    room.walls[2].landings.start = { ...room.walls[2].landings.start, side: 'back' };
    expect(dimensions(room).filter(({ row }) => row === 'back')).toEqual([
      { row: 'back', kind: 'space', start: [-6, -37.5], end: [66, -37.5], offset: -9, text: '72"' },
      { row: 'back', kind: 'landing', start: [-10.5, -37.5], end: [-6, -37.5], offset: -9, text: '4 1/2"', textAt: [-8.25, -49.125] },
      { row: 'back', kind: 'space', start: [-102, -37.5], end: [-10.5, -37.5], offset: -9, text: '91 1/2"' },
    ]);
  });

  it('always reads left to right or bottom to top, the line 3/8" out at 1/2" = 1\'-0" (every room, an angled wall)', () => {
    const angled = structuredClone(stored('G4 T-filler run'));
    angled.walls[1].x2 = 30;
    for (const room of [...document.rooms, angled]) {
      for (const { row, start, end, offset } of dimensions(room)) {
        const dx = end[0] - start[0];
        expect(dx > 1e-6 || (Math.abs(dx) <= 1e-6 && end[1] > start[1])).toBe(true);
        if (WALL_ROWS.includes(row)) expect(Math.abs(offset)).toBeGreaterThanOrEqual(9);
      }
    }
    const [, sloped] = dimensions(angled).filter(({ row }) => row === 'wall');
    expect([sloped.text, sloped.offset]).toEqual(['54 1/16"', -9]);
    expect(sloped.start[0]).toBeCloseTo(33.7442, 4);
    expect(sloped.end[1]).toBeCloseTo(20.0038, 4);
  });
});
```

What the numbers are: at 1/2" = 1'-0" rows are 9" apart and moved text adds 3 3/4" (3/32" text + 1/16" gap, paper). G1 wall 1's front face is x −60, 4 1/2" thick, so its rows start at −64.5: the window row 9" out (its casing 45" to 99" along the wall, 54" wide), the length 18" out. Wall 2's and wall 3's lengths are 9" out; wall 3 reads bottom to top on its right, so its offset is −9. G2's 2" space doesn't fit its text: it moves out to 9 + 3 3/4 + 1 1/2 + 1 1/8 = 15 3/8" (y 34.875), and the length goes to 9 + 9 + 3 3/4 = 21 3/4". G5's R2 is 24" deep, so its rows start 4 1/2 + 24 = 28 1/2" behind the face (y 43.5). In the moved-wing G3 (wing at x −6, landing on wall 2's back face) the back row sits on the room side past wall 2's deepest front run (24") and marker A: 4 1/2 + 24 + 6 + 16 1/2 = 51" from the back face (y 13.5), so y −37.5, the line 9" further.

**Count:** 952 + 5 = **957**. Golden snapshot unchanged.

---

## §4 Step 373 — designer: the dimensions on the payload

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/drawingPayload.js` | 63 | the import and `plan.dimensions` |
| `src/elevation/model/__tests__/drawingPayload.test.js` | 113 | one import, one line changed, one test |

**`drawingPayload.js`**: `import { planDimensions } from './planDimensions.js';` after the `planParts` import. `plan` becomes `{ parts: planParts(room, settings), dimensions: planDimensions(room, settings) }` (keys in that order). The doc comment's round list ends "…round 44 the room in plan; round 45 its dimensions."

**`drawingPayload.test.js`**:
- `import { planDimensions } from '../planDimensions.js';` after the `planParts` import;
- in the SPEC-44 test, `expect(Object.keys(plan)).toEqual(['parts']);` → `expect(Object.keys(plan)).toEqual(['parts', 'dimensions']);`;
- append inside the `describe`, after the SPEC-44 test, verbatim:

```js

  it('SPEC-45 carries the plan dimensions', () => {
    const synced = room('G1 Euro kitchen');
    const { plan } = toDrawingPayload(synced, settings);
    expect(plan.dimensions).toHaveLength(7);
    expect(plan.dimensions).toEqual(planDimensions(synced, settings));
  });
```

**Don't touch:** `ExportDxfButton.jsx`, `planDimensions.js`, `planParts.js`, the API.

**Count:** 957 + 1 = **958**. Gate: `npm test && npm run lint && npm run build`.

---

## End-to-end check (Kyle)

Geometry with 371 in, the designer built after 373, API and designer running as in round 42. *Export DXF* and open `plan.dxf`.

- **G1** — wall 1: the window row (45", 54", 69") outside the wall and 168" outside that; walls 2 and 3 their lengths; the island's 91 1/2" well clear of its back cabinets (and of where marker D goes in 45.1). Text reads from the bottom or the right. The title under the lowest dimension.
- **G2** — the 2" beside the door moved out, the 172" pushed out past it.
- **G5** — the recess row and the length outside R2's bump-out.
- Click a dimension in CAD: it's on `DIMENSIONS`, style `FF`, and re-measures if you stretch it.
- Try an angled wall in your own room: its length is an aligned dimension along the wall.

**Known for now:**
- No elevation markers or labels yet (45.1), no run depths or clearances (45.2).
- No wall numbers in the DXF (Kyle).
- On the canvas an island's length still runs through its back cabinets; only the DXF clears them.
