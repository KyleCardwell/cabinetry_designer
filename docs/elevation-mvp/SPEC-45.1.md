# Round 45.1 — SPEC: elevation markers and labels in the plan DXF

Steps 374–376. Geometry (374), then designer (375, 376). The API doesn't change.
Drawing rounds: 45 wall dimensions in plan → **45.1 elevation markers and labels in plan** → 45.2 run depths and clearances in plan → sheet layout.

**Done when:**
- `plan.dxf` has an elevation marker in front of every lettered wall face, as the plan view does: a circle with the letter, and a filled flag pointing at the wall. 1/4" radius on paper at any drawing scale.
- Every door and window has its label (`W1 · 48"`, as on the canvas) and every recess or projection its label (`R1 · 48" × 12"`), centred on it, **just outside the wall** (Kyle): past the wall's back face and any bump-out, between the wall and its dimension rows, so a label never lands on a cabinet.
- No wall numbers (Kyle).

| Step | Repo | What | Tests after |
|---|---|---|---|
| **374** | geometry | `PayloadPlanMark`; markers and labels in `plan.dxf`; `MARKERS` layer | 60 → **63** |
| **375** | designer | `planMarks` (nothing calls it yet) | 958 → **962** |
| **376** | designer | `plan.marks` on the payload | **963** |

Codex writes the code (PROMPT-CONVENTIONS rule 10). The test values were checked against a throwaway build of these rules (designer 963, lint 0 errors; geometry 63; golden snapshot unchanged). That build isn't in this SPEC. If a test fails, fix the code, not the number, unless the number contradicts a rule here. In that case, stop and say so.

---

## §1 Decisions (Kyle, 2026-10-06)

- **Markers (Kyle: yes).** Where the canvas puts them (`plan/elevationMarkers.js`), in paper units: on the face's side, at the middle of its runs (the face's middle when it has none), out from the face by the deepest run's front depth + 6" + (1/4" radius + 3/16" flag) × plot scale. A face with no runs (forced in) is also shifted along the wall, as drawn (`wallFrame(...).d`), by 1/2" × plot scale: + on the front, − on the back. The flag points back at the wall (`direction` = −n of the face's frame). Sizes live in `planDimensions.js` (`PLAN_MARKER_RADIUS`, `PLAN_MARKER_FLAG`, `PLAN_MARKER_CLEARANCE`, round 45) because the rows clear them; geometry's `plan_marks.py` has the same numbers.
- **Labels outside the wall (Kyle).** A door or window: its canvas text (`${label} · ${jamb width}`), centred on the jamb, at the opening's back (`openingPlanDepths(...).back`: the wall's back face, or behind a recess back) less 1/16" gap + half the 3/32" text height on paper. A recess: its canvas text (`${label} · ${width} × ${depth}`), centred on it, past the back of its bump-out (−(thickness + depth) when it's at least as deep as the wall, else −thickness), less the same gap; a projection past the wall's back face. A recess on the back face labels on the room side (the far side of the wall from its face), the same rule.
  - That's inside the first dimension row (3/8" out): 1/16" + 3/32" text + gap leaves the row's own text clear.
- **Readable labels.** The label's rotation is the face's direction (`frame.r`) in y-up degrees, turned 180° when it's past ±90, so it's in (−90, 90]: a wall running up reads from the right (90).
- **Payload.** `plan.marks`: `{ kind: 'elevation', at, text, direction }` or `{ kind: 'label', at, text, rotation }`, plan inches, y up, no −0. Order: every marker (walls in `room.walls` order, front then back), then per wall its openings, then its recesses (front face then back).
- **Geometry draws** (the designer placed them; geometry only draws the symbol at its paper size):
  - Elevation: a CIRCLE radius 1/4" × plot scale and the flag on a new layer **MARKERS** (ACI 7, continuous, lineweight 25): a closed triangle with its base on the circle toward `direction`, half-width 0.6 × radius, tip 3/16" × plot scale past the circle, filled solid (BYLAYER). The letter is TEXT on TEXT in FF_TEXT, 1/8" × plot scale high, middle-centred on `at`.
  - Label: TEXT on TEXT in FF_TEXT, 3/32" × plot scale high (`DIMSTYLE_PAPER["dimtxt"]`), middle-centred on `at`, turned by `rotation`.
  - The title also clears the markers (their `at` ± radius) and labels.

---

## §2 Step 374 — geometry: markers and labels

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/drawing/models.py` | 165 | `PayloadPlanMark`; `PayloadPlan.marks` |
| NEW `src/drawing/plan_marks.py` | — | `MARKER_*`, `mark_points`, `add_plan_marks` |
| `src/drawing/plan_dxf.py` | 109 | call it; the title clears it |
| `src/dxf/writer.py` | 169 | the `MARKERS` layer |
| `tests/test_drawing_style.py` | 48 | line 39: add `"MARKERS": 25` |
| NEW `tests/test_plan_marks.py` | — | 3 tests, verbatim |

**Models** (`extra="forbid"`, above `PayloadPlan`): `PayloadPlanMark`, docstring "An elevation marker or a label in plan (SPEC-45.1), plan inches with y up. Geometry draws the symbol at its paper size; the designer places it.": `kind: Literal["elevation", "label"]`; `at: tuple[float, float]`; `text: str` (min_length=1); `direction: tuple[float, float] | None = None` with the comment "An elevation marker's flag points this way, at the wall face it looks at (a unit vector)."; `rotation: float = 0` with the comment "A label's angle, degrees counter-clockwise." `PayloadPlan` gets, after `dimensions`, `marks: list[PayloadPlanMark] = []` with the comment "Elevation markers and door, window and recess labels (SPEC-45.1)."

**`plan_marks.py`**, module docstring "Elevation markers and labels in plan (SPEC-45.1). The designer places them; geometry draws them.":
- `MARKER_RADIUS = 0.25`, `MARKER_FLAG = 0.1875`, `MARKER_TEXT = 0.125`, comment: paper inches (SPEC-45.1); the designer's `planDimensions.js` uses the same numbers to place markers.
- `mark_points(marks, plot_scale) -> list`: for each mark `(x, y − reach)` and `(x, y + reach)`, reach = radius × plot scale for an elevation marker, 0 for a label.
- `add_plan_marks(modelspace, marks, plot_scale) -> None`, as §1. With `(dx, dy)` = `direction` (default `(0, 1)`), `half = 0.6 × radius`, `base = at + direction × radius`, the triangle is `[(base.x − dy × half, base.y + dx × half), at + direction × (radius + flag), (base.x + dy × half, base.y − dx × half)]`: an LWPOLYLINE (closed) and a HATCH with `set_solid_fill(color=256)` and that path, both on MARKERS. Text through `modelspace.add_text(text, height=…, rotation=…, dxfattribs={"layer": "TEXT", "style": TEXT_STYLE}).set_placement(at, align=TextEntityAlignment.MIDDLE_CENTER)`, as `marks.py` does it.

**`plan_dxf.py`**: `add_plan_marks(modelspace, plan.marks, plot_scale)` right after `add_plan_dimensions`; the title's `low` also takes in `mark_points(plan.marks, plot_scale)`.

**`writer.py`**: in `LAYER_DEFS`, after TEXT, `"MARKERS": (7, "CONTINUOUS", 25),` with the comment "Elevation markers in plan (SPEC-45.1)."

**`tests/test_drawing_style.py`** line 39 becomes `"HIDDEN": 18, "DIMENSIONS": 18, "CENTERLINES": 18, "TEXT": 18, "MARKERS": 25,`.

**Don't touch:** `marks.py`, `dimensions.py`, `elevation_dxf.py`, `bundle.py`, the fixtures, other tests. No new dependencies.

**NEW `tests/test_plan_marks.py`**, verbatim:

```python
"""Elevation markers and labels in plan (SPEC-45.1)."""

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
ELEVATIONS = json.loads((ROOT / "tests" / "fixtures" / "g1_payload.json").read_text())

PLAN = {
    "parts": [{"id": "A:wall", "kind": "wall", "points": [[0, 0], [120, 0], [120, -4.5], [0, -4.5]]}],
    "marks": [
        # Looking at wall A from the room: the flag points down, at the wall.
        {"kind": "elevation", "at": [60, 40], "text": "A", "direction": [0, -1]},
        {"kind": "label", "at": [60, -7.5], "text": "W1 · 48\""},
        {"kind": "label", "at": [-7.5, 30], "text": "D1 · 30\"", "rotation": 90},
    ],
}
PAYLOAD = {**ELEVATIONS, "plan": PLAN}


def _modelspace(payload):
    archive = zipfile.ZipFile(io.BytesIO(base64.b64decode(draw(payload)["zip_base64"])))
    return ezdxf.read(io.StringIO(archive.read("plan.dxf").decode("utf-8"))).modelspace()


def _round(point):
    return tuple(round(value, 4) + 0 for value in tuple(point)[:2])


def test_an_elevation_marker_is_a_circle_a_filled_flag_and_its_letter_at_paper_size():
    msp = _modelspace(PAYLOAD)
    [circle] = msp.query("CIRCLE")
    assert (circle.dxf.layer, _round(circle.dxf.center), circle.dxf.radius) == ("MARKERS", (60, 40), 6)
    [flag] = msp.query('LWPOLYLINE[layer=="MARKERS"]')
    assert flag.closed
    assert [_round(point) for point in flag.get_points("xy")] == [(63.6, 34), (60, 29.5), (56.4, 34)]
    [fill] = msp.query('HATCH[layer=="MARKERS"]')
    assert (fill.dxf.solid_fill, fill.dxf.color) == (1, 256)
    letter = [text for text in msp.query("TEXT") if text.dxf.text == "A"][0]
    assert (letter.dxf.layer, letter.dxf.style, letter.dxf.height, _round(letter.dxf.align_point)) == (
        "TEXT", "FF_TEXT", 3, (60, 40),
    )
    payload = copy.deepcopy(PAYLOAD)
    payload["plotScale"] = 48
    assert next(iter(_modelspace(payload).query("CIRCLE"))).dxf.radius == 12


def test_a_label_is_centred_text_at_dimension_size_turned_as_sent():
    labels = [
        (text.dxf.text, _round(text.dxf.align_point), text.dxf.height, text.dxf.rotation, text.dxf.halign, text.dxf.valign)
        for text in _modelspace(PAYLOAD).query('TEXT[layer=="TEXT"]')
        if "·" in text.dxf.text
    ]
    assert labels == [
        ('W1 · 48"', (60, -7.5), 2.25, 0, 1, 2),
        ('D1 · 30"', (-7.5, 30), 2.25, 90, 1, 2),
    ]


def test_rejects_an_unknown_mark_kind_or_no_text():
    for change in ({"kind": "number"}, {"text": ""}):
        payload = copy.deepcopy(PAYLOAD)
        payload["plan"]["marks"][0].update(change)
        with pytest.raises(ValidationError):
            draw(payload)
```

What the numbers are: at 1/2" = 1'-0" the circle is 6" radius (12" at 1/4"), the letter 3" high, label text 2 1/4". The flag points down from (60, 40): its base 6" down at y 34, 3.6" each side, its tip 4 1/2" further at y 29.5. ezdxf's middle-centre is `halign` 1, `valign` 2.

**Count:** 60 + 3 = **63**.

---

## §3 Step 375 — designer: `planMarks`

**Files:**

| File | Lines | Change |
|---|---:|---|
| NEW `src/elevation/model/planMarks.js` | — | `planMarks(room, settings)`, `PLAN_MARKER_SHIFT` |
| NEW `src/elevation/model/__tests__/planMarks.test.js` | — | 4 tests, verbatim |

**Contract.**
- `export const PLAN_MARKER_SHIFT = 0.5` (paper inches; the canvas's `MARKER_SHIFT`).
- `planMarks(room, settings)` → the marks of §1. Doc comment: elevation markers and door, window and recess labels for the plan DXF (SPEC-45.1), plan inches with y up; geometry draws the symbols.
- `up(point) = [point.x + 0, 0 - point.y]`; `scale = plotScale(settings)`; `letters = elevationLetters(room)`.
- **Markers.** For each wall in `room.walls` order and each side in `WALL_SIDES` with a letter (`letters.get(elevationKey(wall.id, side))`): `frame = wallSideFrame(room, wall, side)`; the side's runs (`wallSideOf(run) === side`); `deepest` = their largest `frontDepth`, else 0; `center` = (smallest `run.x` + largest `run.x + run.width`) / 2, or `frame.length / 2` with no runs; `offset = deepest + PLAN_MARKER_CLEARANCE + (PLAN_MARKER_RADIUS + PLAN_MARKER_FLAG) × scale`; `shift` = 0 with runs, else ±`PLAN_MARKER_SHIFT × scale` (+ front, − back); `point = elevationToPlan(frame, center, offset) + wallFrame(room, wall).d × shift`. Mark: `{ kind: 'elevation', at: up(point), text: letter, direction: up(−frame.n) }`. This is `elevationMarkers` in paper units; don't import it (it takes the canvas's pixel scale).
- **Labels**, after every marker, per wall in order, `past = (DIMENSION_TEXT_GAP + DIMENSION_TEXT_HEIGHT / 2) × scale`:
  - Each opening in `wall.openings ?? []`, `frame = wallFrame(room, wall)`, `{ jamb } = openingGeometry(opening, frame.length, settings)`, `{ back } = openingPlanDepths(wall, opening)`: `{ kind: 'label', at: up(elevationToPlan(frame, jamb.x + jamb.width / 2, back − past)), text: `${opening.label} · ${formatInches(jamb.width)}`, rotation: readable(frame.r) }`.
  - Then each side in `WALL_SIDES`, `sideFrame = wallSideFrame(room, wall, side)`, each recess in `recessesOn(wall, side)`, `geometry = recessGeometry(recess, sideFrame.length, wall.height)`: `deep` = not a projection and `geometry.depth ≥ wall.thickness − 1e-6`; `back = −wall.thickness − (deep ? geometry.depth : 0)`; `{ kind: 'label', at: up(elevationToPlan(sideFrame, geometry.x + geometry.width / 2, back − past)), text: `${recess.label} · ${formatInches(geometry.width)} × ${formatInches(geometry.depth)}`, rotation: readable(sideFrame.r) }`.
- `readable(r)` (private): `Math.atan2(−r.y, r.x)` in degrees; subtract 180 when it's over 90 (+1e-6), add 180 when it's −90 (+1e-6) or less; round to 1e-6, no −0.

**Reuse:** `PLAN_MARKER_RADIUS`, `PLAN_MARKER_FLAG`, `PLAN_MARKER_CLEARANCE` (`./planDimensions.js`), `DIMENSION_TEXT_GAP`, `DIMENSION_TEXT_HEIGHT` (`./elevationDimensions.js`), `frontDepth` (`./corners.js`), `plotScale`, `elevationToPlan`, `wallFrame`, `openingGeometry` (`./openings.js`), `openingPlanDepths`, `recessGeometry`, `recessesOn` (`./recesses.js`), `elevationKey`, `elevationLetters`, `formatInches` (`./units.js`), `WALL_SIDES`, `wallSideFrame`, `wallSideOf`. No import cycle (`planDimensions.js` doesn't import this).

**Don't touch:** `plan/elevationMarkers.js`, `PlanElevationMarker.jsx`, `PlanOpening.jsx`, `PlanRecess.jsx`, `planDimensions.js`, `drawingPayload.js`, `index.js`, existing tests.

**NEW `src/elevation/model/__tests__/planMarks.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { planMarks } from '../planMarks.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);
const marks = (room, use = settings) => planMarks(syncRoom(room, use), use);
const marker = (at, text, direction) => ({ kind: 'elevation', at, text, direction });

describe('SPEC-45.1 elevation markers and labels in plan', () => {
  it('puts each lettered face\'s marker 6" past its deepest run plus the symbol, flag at the wall (G1)', () => {
    expect(marks(stored('G1 Euro kitchen'))).toEqual([
      marker([-17.625, -6.4375], 'A', [-1, 0]),
      marker([6.4375, 42.625], 'B', [0, 1]),
      marker([55.25, 37.5], 'C', [0, -1]),
      marker([55.25, -33.25], 'D', [0, 1]),
      { kind: 'label', at: [-67.125, -12], text: 'W1 · 48"', rotation: 90 },
    ]);
  });

  it('labels doors and recesses just outside the wall and its bump-out (G2, G5)', () => {
    expect(marks(stored('G2 Face frame kitchen')).filter(({ kind }) => kind === 'label')).toEqual([
      { kind: 'label', at: [-63, 22.125], text: 'D1 · 36"', rotation: 0 },
    ]);
    expect(marks(stored('G5 Recess room')).filter(({ kind }) => kind === 'label')).toEqual([
      { kind: 'label', at: [-54, 34.125], text: 'R1 · 48" × 12"', rotation: 0 },
      { kind: 'label', at: [54, 46.125], text: 'R2 · 48" × 24"', rotation: 0 },
    ]);
  });

  it('sizes the symbol and the label gap for paper at the plot scale (G4 at 1/4" = 1\'-0")', () => {
    expect(marks(stored('G4 T-filler run'))).toEqual([marker([6.5, -18.875], 'A', [0, 1])]);
    expect(marks(stored('G4 T-filler run'), { ...settings, plotScale: 48 }))
      .toEqual([marker([6.5, -29.375], 'A', [0, 1])]);
  });

  it('centres the marker of a forced face with no runs on the wall, shifted 1/2" (paper) along it (G1 wall 3)', () => {
    const room = structuredClone(stored('G1 Euro kitchen'));
    room.walls.find(({ id }) => id === '8cf88b99-0a56-4ec4-96c2-ffdcaeef4051').elevationForced = true;
    expect(marks(room).filter(({ kind }) => kind === 'elevation').map(({ text, at }) => [text, at])).toEqual([
      ['A', [-17.625, -6.4375]],
      ['B', [6.4375, 42.625]],
      // 27" wall, no runs: 13 1/2" along, 6" + the symbol out, 12" further along the wall as drawn.
      ['C', [43.5, 58.5]],
      ['D', [55.25, 37.5]],
      ['E', [55.25, -33.25]],
    ]);
  });
});
```

What the numbers are: G1's tall is 25 7/8" deep, so marker A is 25 7/8 + 6 + 10 1/2 = 42 3/8" off wall 1 (x −60 → −17.625), centred on wall 1's runs. The window's label is 2 5/8" (1 1/2 + 1 1/8) past the wall's back face (x −64.5 → −67.125), at the window's middle (y −12), reading up (90). G5's R1 (12" deep) has its bump-out back at 15 + 4 1/2 + 12 = 31 1/2, so its label is at 34 1/8; R2 (24") at 46 1/8. At 1/4" = 1'-0" the symbol doubles, so G4's marker moves out 10 1/2" more. G1's wall 3 forced in: 13 1/2" along its 27", 6 + 10 1/2" off it, 12" along the wall as drawn (down in y-up); the letters after it shift on.

**Count:** 958 + 4 = **962**. Golden snapshot unchanged.

---

## §4 Step 376 — designer: the marks on the payload

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/drawingPayload.js` | 64 | the import and `plan.marks` |
| `src/elevation/model/__tests__/drawingPayload.test.js` | 121 | one import, one line changed, one test |

**`drawingPayload.js`**: `import { planMarks } from './planMarks.js';` after the `planDimensions` import. `plan` becomes `{ parts, dimensions, marks: planMarks(room, settings) }` (in that order; one key per line). The doc comment's list ends "…round 45 its dimensions; 45.1 its markers and labels."

**`drawingPayload.test.js`**:
- `import { planMarks } from '../planMarks.js';` after the `planDimensions` import;
- in the SPEC-44 test, `['parts', 'dimensions']` → `['parts', 'dimensions', 'marks']`;
- append inside the `describe`, after the SPEC-45 test, verbatim:

```js

  it('SPEC-45.1 carries the plan markers and labels', () => {
    const synced = room('G1 Euro kitchen');
    const { plan } = toDrawingPayload(synced, settings);
    expect(plan.marks).toHaveLength(5);
    expect(plan.marks).toEqual(planMarks(synced, settings));
  });
```

**Don't touch:** `ExportDxfButton.jsx`, `planMarks.js`, the API.

**Count:** 962 + 1 = **963**. Gate: `npm test && npm run lint && npm run build`.

---

## End-to-end check (Kyle)

Geometry with 374 in, the designer built after 376.

- **G1** — markers A–D in front of their runs, flags pointing at the walls, D past the island's back cabinets and inside its 91 1/2" (that row was moved out for it in 45). `W1 · 48"` just outside wall 1, reading up, between the wall and its window row.
- **G2** — `D1 · 36"` outside the wall, the 2" moved text still clear of it.
- **G5** — `R1 · 48" × 12"` and `R2 · 48" × 24"` just past their bump-outs.
- Change *Drawing scale* to 1/4" = 1'-0": the circles, letters and labels double, and the markers move out to fit.
- Layers: circles and flags on MARKERS, letters and labels on TEXT.

**Known for now:**
- No run depths or clearances yet (45.2).
