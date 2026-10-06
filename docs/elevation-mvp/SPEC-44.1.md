# Round 44.1 — SPEC: solid walls, uppers that hide what's under them, room around every drawing

Steps 367–369. Geometry (367, 368), then designer (369). The API doesn't change.
Drawing rounds: 44 captured pair fix and plan DXF → **44.1 plan looks like the designer, padding** → 45 plan dimensions and labels → sheet layout.

**Done when:**
- In `plan.dxf` the walls are filled solid (grey, the SECTIONS layer's colour), as the designer's plan view shows them, instead of the ANSI31 hatch.
- Uppers are solid lines like everything else. Wherever a higher part sits over a lower one (an upper over a base, a box stacked over another box in a column, an upper run over a base run), the lower part's lines are cut where the higher part covers them. Nothing in a run is dashed. Soffits and raised recesses stay dashed.
- Every DXF (plan and elevations) has its extents, limits and opening view set to everything drawn, dimensions and titles included, plus 1/2" of paper all round (12" at 1/2" = 1'-0"). A viewer that frames or borders the drawing by its extents or limits now leaves room around the dimensions.

| Step | Repo | What | Tests after |
|---|---|---|---|
| **367** | geometry | `top` on a plan part; higher parts cut lower ones' lines; solid wall fill | 52 → **53** |
| **368** | geometry | `frame_drawing`: extents, limits and view with 1/2" paper padding, plan and elevations | **56** |
| **369** | designer | `planParts` sends each part's `top`; no run part is dashed | 950 → **951** |

Codex writes the code (PROMPT-CONVENTIONS rule 10). This SPEC gives the rules, the contracts and the tests. The test values were checked against a throwaway build of these rules (designer 951, lint 0 errors; geometry 56; golden snapshot unchanged). That build isn't in this SPEC. If a test fails, fix the code, not the number, unless the number contradicts a rule here. In that case, stop and say so.

---

## §1 Decisions (Kyle, 2026-10-06)

- **Solid walls (Kyle: "like they are in the designer").** The joined wall region is filled with a SOLID hatch on SECTIONS, colour BYLAYER (SECTIONS is ACI 8, grey). The outline on WALLS stays. The elevation's sections keep ANSI31.
- **Uppers solid; cut what's under them (Kyle).** Every plan part from a run, and every wall end panel, carries `top`: the height of its top. Geometry runs the plan parts that have a `top` through the same hidden-line removal as the elevations, with `top` as the "nearer" value: a part whose top is higher hides the lines of lower parts it covers. Hidden lines are **left out**, not dashed.
  - **Which top.** A part's own piece: the cell or piece whose id is the part's key (a box, an end panel, a filler), else the piece whose id is the key before its first `:` (a face `"<cabinet id>:<path>"`), else the run's top (`run.z + run.height`: frames, T-fillers, L lips, returns keyed by the run). So a box stacked over another in one column hides the lower box (G4's 64" box under its 90" box), and an upper hides the back of the base under it.
  - **Equal tops hide nothing**, so a run's boxes, faces, fillers and end panels draw whole beside each other, as now.
  - **Parts with no `top`** (casings, detail lines, soffits, raised recess lines) are drawn whole, over everything, as in round 44. Soffits and raised recesses stay dashed.
  - Floating shelves are solid now too, at their own top (Claude's default; say if they should stay dashed).
  - The canvas's plan view doesn't change (it still dashes uppers over a fill). Say if you want it to match.
- **Padding (Kyle: dimensions falling outside the border).** ezdxf leaves `$EXTMIN`/`$EXTMAX` unset and `$LIMMIN`/`$LIMMAX` at 0,0 to 420,297, so a viewer that draws a border from them draws it in the wrong place: dimensions left of or below the origin fall outside it. `frame_drawing(doc, plot_scale)` measures everything in modelspace (`ezdxf.bbox.extents`, which includes dimensions and text), adds `DRAWING_PADDING` = 1/2" paper × plot scale each side, and sets the modelspace layout's `extmin`/`extmax`/`limmin`/`limmax` (ezdxf copies them into the header when it writes) and the `*Active` view (centre and height) to that box. Both builders call it last.

---

## §2 Step 367 — geometry: tops and solid walls

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/drawing/models.py` | 145 | `PayloadPlanPart.top` |
| `src/drawing/elevation_dxf.py` | 158 | `_add_hatch(..., solid=False)` |
| `src/drawing/plan_dxf.py` | 79 | solid walls; parts with a top through hidden-line removal |
| `tests/test_plan.py` | 99 | lines 67–69: the hatch assertion |
| NEW `tests/test_plan_stacked.py` | — | 1 test, verbatim |

**Contract.**
- `PayloadPlanPart` gets, after `dashed`, `top: float | None = None` with the comment `# How high its top is (SPEC-44.1). A part with a top hides the lines of lower parts under it; None is drawn over all.`
- `_add_hatch(modelspace, layer, region, solid: bool = False)`: when `solid`, `hatch.set_solid_fill(color=256)` (BYLAYER) instead of the ANSI31 pattern. Its docstring says ANSI31, or solid when asked (SPEC-44.1). Elevation calls don't change.
- `build_plan_dxf`: `_add_hatch(modelspace, "SECTIONS", region, solid=True)`. Then the parts that aren't `wall`/`void` and have a `top`: `hidden_line_removal([HlrShape(id=str(index), polygon=Polygon(part.points), front=part.top, drop_hidden=True) …])`, and each part's visible lines (`result[id][0]`) via `write_lines_to_layer(doc, PLAN_LAYERS[part.kind], lines)`. The existing polyline loop then skips parts with a `top` as well as `wall`/`void`; parts without a `top` draw exactly as now. Use string ids from the part's index (part ids aren't guaranteed unique).

**Reuse:** `HlrShape` and `hidden_line_removal` from `src.projection.hlr`; `write_lines_to_layer` from `src.dxf.writer`.

**Don't touch:** `hlr.py`, `writer.py`, `bundle.py`, `dimensions.py`, the fixtures, other tests.

**`tests/test_plan.py`**: in `test_walls_join_at_the_corner_and_the_window_cuts_them`, replace

```python
    assert [(hatch.dxf.layer, hatch.dxf.pattern_name, hatch.dxf.pattern_scale) for hatch in hatches] == [
        ("SECTIONS", "ANSI31", 8), ("SECTIONS", "ANSI31", 8),
    ]
```

with

```python
    # Solid, in the layer's colour (SPEC-44.1).
    assert [(hatch.dxf.layer, hatch.dxf.solid_fill, hatch.dxf.color) for hatch in hatches] == [
        ("SECTIONS", 1, 256), ("SECTIONS", 1, 256),
    ]
```

**NEW `tests/test_plan_stacked.py`**, verbatim:

```python
"""Plan parts that stack (SPEC-44.1)."""

import base64
import io
import json
import zipfile
from pathlib import Path

import ezdxf
import pytest

from src.drawing.bundle import draw

ROOT = Path(__file__).resolve().parent.parent
ELEVATIONS = json.loads((ROOT / "tests" / "fixtures" / "g1_payload.json").read_text())

# A 36" base, 24" deep, with a 12" deep upper over its back half.
STACKED = {"parts": [
    {"id": "base", "kind": "cabinet", "runId": "R1", "top": 34.5,
     "points": [[0, 0], [36, 0], [36, -24], [0, -24]]},
    {"id": "upper", "kind": "cabinet", "runId": "R2", "top": 90,
     "points": [[0, 0], [36, 0], [36, -12], [0, -12]]},
    {"id": "door", "kind": "casing", "points": [[40, 0], [80, 0], [80, -0.75], [40, -0.75]]},
]}


def _dxf(payload, name):
    archive = zipfile.ZipFile(io.BytesIO(base64.b64decode(draw(payload)["zip_base64"])))
    return ezdxf.read(io.StringIO(archive.read(name).decode("utf-8")))


def test_a_higher_part_cuts_the_lines_under_it_and_nothing_is_dashed():
    msp = _dxf({**ELEVATIONS, "plan": STACKED}, "plan.dxf").modelspace()
    lines = list(msp.query('LINE[layer=="CABINETS"]'))
    # The upper whole (96"), the base's front and the ends of its sides past the upper (36 + 12 + 12).
    assert sum(line.dxf.start.distance(line.dxf.end) for line in lines) == pytest.approx(156)
    assert {line.dxf.linetype for line in lines} == {"BYLAYER"}
    assert not list(msp.query('LWPOLYLINE[layer=="CABINETS"]'))
    # A part with no top is drawn whole, over everything, as before.
    assert len(list(msp.query('LWPOLYLINE[layer=="OPENINGS"]'))) == 1
```

What the number is: the upper is drawn whole (36 + 12 + 36 + 12 = 96). Of the base, its back edge and the first 12" of each side are inside the upper and go; its front (36) and the last 12" of each side remain: 60. Total 156.

**Count:** 52 + 1 = **53**.

---

## §3 Step 368 — geometry: room around every drawing

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/dxf/writer.py` | 149 | `DRAWING_PADDING`, `frame_drawing` |
| `src/drawing/elevation_dxf.py` | ~163 | call it last |
| `src/drawing/plan_dxf.py` | ~88 | call it last |
| NEW `tests/test_drawing_frame.py` | — | 1 test × 3 cases, verbatim |

**Contract.**
- `writer.py`: `from ezdxf import bbox`; `DRAWING_PADDING = 0.5` with the comment `# Space left around everything drawn (SPEC-44.1), paper inches: 1/2" is 12" at 1/2" = 1'-0".`; `frame_drawing(doc, plot_scale) -> None`, docstring "Extents, limits and the opening view: everything drawn, dimensions and text included, plus the padding." It takes `bbox.extents(doc.modelspace())`; returns if `not extents.has_data`; pads x and y by `DRAWING_PADDING * plot_scale` each side; sets `doc.modelspace().dxf.extmin = (x0, y0, 0)`, `.extmax = (x1, y1, 0)`, `.limmin = (x0, y0)`, `.limmax = (x1, y1)` (comment: ezdxf copies these into $EXTMIN/$EXTMAX/$LIMMIN/$LIMMAX when it writes; setting the header directly is overwritten); then `doc.set_modelspace_vport(height=y1 - y0, center=((x0 + x1) / 2, (y0 + y1) / 2))`.
- `build_elevation_dxf` and `build_plan_dxf` call `frame_drawing(doc, plot_scale)` just before `return doc_to_bytes(doc)`.

**Don't touch:** anything else. Existing tests keep passing (none read the header).

**NEW `tests/test_drawing_frame.py`**, verbatim:

```python
"""The space around every drawing (SPEC-44.1)."""

import base64
import io
import json
import zipfile
from pathlib import Path

import ezdxf
import pytest
from ezdxf import bbox

from src.drawing.bundle import draw

ROOT = Path(__file__).resolve().parent.parent
ELEVATIONS = json.loads((ROOT / "tests" / "fixtures" / "g1_payload.json").read_text())
PLAN = {"parts": [
    {"id": "base", "kind": "cabinet", "top": 34.5, "points": [[0, 0], [36, 0], [36, -24], [0, -24]]},
]}


def _dxf(payload, name):
    archive = zipfile.ZipFile(io.BytesIO(base64.b64decode(draw(payload)["zip_base64"])))
    return ezdxf.read(io.StringIO(archive.read(name).decode("utf-8")))


@pytest.mark.parametrize("scale, name", [(24, "plan.dxf"), (48, "plan.dxf"), (24, "elevation-A.dxf")])
def test_extents_limits_and_view_leave_half_an_inch_of_paper_around_everything(scale, name):
    doc = _dxf({**ELEVATIONS, "plan": PLAN, "plotScale": scale}, name)
    drawn = bbox.extents(doc.modelspace())
    pad = 0.5 * scale
    low = (drawn.extmin.x - pad, drawn.extmin.y - pad)
    high = (drawn.extmax.x + pad, drawn.extmax.y + pad)
    assert tuple(doc.header["$EXTMIN"])[:2] == pytest.approx(low)
    assert tuple(doc.header["$EXTMAX"])[:2] == pytest.approx(high)
    assert tuple(doc.header["$LIMMIN"]) == pytest.approx(low)
    assert tuple(doc.header["$LIMMAX"]) == pytest.approx(high)
    view = doc.viewports.get("*Active")[0]
    assert tuple(view.dxf.center)[:2] == pytest.approx(((low[0] + high[0]) / 2, (low[1] + high[1]) / 2))
    assert view.dxf.height == pytest.approx(high[1] - low[1])
```

**Count:** 53 + 3 = **56**.

---

## §4 Step 369 — designer: tops on plan parts

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/planParts.js` | 129 | `top` on run parts and wall end panels; drop run `dashed` |
| `src/elevation/model/__tests__/planParts.test.js` | 104 | replaced whole, verbatim |

**Contract.**
- Wall end panels get `top: panel.top` (after `points`).
- Per run: `tops` = a Map from piece id to `piece.z + piece.height` over `layout.pieces` and `cellPieces(run, layout).pieces` (`./cells.js`). `topOf(key)` = `tops.get(key) ?? tops.get(key.split(':')[0]) ?? run.z + run.height`. Every run part gets `top: topOf(range.key)` (after `runId`) and no `dashed`. A box is still `'shelf'` when `box.dashed`, else `'cabinet'`.
- The `CABINET_TYPE_IDS` import goes (nothing else uses it). Walls, voids, openings, casings, recesses and soffits don't change (no `top`; soffits and raised recesses keep `dashed`).
- Doc comment gains: each part from a run and each wall end panel carries its `top`, so geometry cuts the lines of what's under it (SPEC-44.1).

**Don't touch:** `planPieces.js`, `cells.js`, `drawingPayload.js` (its test checks `plan.parts` equals `planParts`, so it follows), any canvas file, other tests.

**`src/elevation/model/__tests__/planParts.test.js`**, the whole file replaced, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { planParts } from '../planParts.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);
const WALL_KINDS = ['wall', 'void', 'opening', 'casing', 'recess', 'soffit', 'wall_end_panel'];
const wallThings = (room) => planParts(syncRoom(room, settings), settings)
  .filter(({ kind }) => WALL_KINDS.includes(kind));

describe('SPEC-44 the room in plan: walls and what is in them', () => {
  it('outlines each wall, cuts and cases the window, skips a wall with no thickness (G1)', () => {
    const window = '93ab97a1-ce31-4283-8240-ead92a6ae665';
    const island = '84063fed-ab0d-4a1d-ae05-ffe67decad5e';
    expect(wallThings(stored('G1 Euro kitchen'))).toEqual([
      { id: 'cb33d774-f31e-41c1-bbe4-198cbf981619:wall', kind: 'wall', points: [[-60, -84], [-60, 84], [-64.5, 88.5], [-64.5, -84]] },
      { id: `${window}:void`, kind: 'void', points: [[-60, -36], [-60, 12], [-64.5, 12], [-64.5, -36]] },
      { id: `${window}:detail`, kind: 'opening', points: [[-62.25, -36], [-62.25, 12]], closed: false },
      { id: `${window}:casing`, kind: 'casing', points: [[-60, -39], [-60, 15], [-59.25, 15], [-59.25, -39]] },
      { id: '4afd9749-bbe8-4848-8a67-a1d063bdfce8:wall', kind: 'wall', points: [[-60, 84], [60, 84], [64.5, 88.5], [-64.5, 88.5]] },
      { id: '8cf88b99-0a56-4ec4-96c2-ffdcaeef4051:wall', kind: 'wall', points: [[60, 84], [60, 57], [64.5, 57], [64.5, 88.5]] },
      { id: `${island}:endPanel:start`, kind: 'wall_end_panel', points: [[10.25, -16.75], [9.5, -16.75], [9.5, 21], [10.25, 21]], top: 34.5 },
      { id: `${island}:endPanel:end`, kind: 'wall_end_panel', points: [[101, -16.75], [100.25, -16.75], [100.25, 21], [101, 21]], top: 34.5 },
    ]);
  });

  it('fills a deep recess behind the wall and knocks its notch out; raised, its outline is dashed (G5)', () => {
    const recess = '61c07d7e-ec8b-4306-9825-9f3decfb5fa1';
    const mine = (parts) => parts.filter(({ id }) => id.startsWith(recess));
    const fill = { id: `${recess}:fill`, kind: 'wall', points: [[-82.5, 19.5], [-25.5, 19.5], [-25.5, 31.5], [-82.5, 31.5]] };
    expect(mine(wallThings(stored('G5 Recess room')))).toEqual([
      fill,
      { id: `${recess}:knockout`, kind: 'void', points: [[-78, 15], [-30, 15], [-30, 27], [-78, 27]] },
    ]);
    const raised = structuredClone(stored('G5 Recess room'));
    raised.walls[1].recesses[0].bottom = 12;
    const line = (index, points) => ({ id: `${recess}:line-${index}`, kind: 'recess', points, closed: false, dashed: true });
    expect(mine(wallThings(raised))).toEqual([
      fill,
      line(0, [[-78, 15], [-78, 27]]),
      line(1, [[-78, 27], [-30, 27]]),
      line(2, [[-30, 27], [-30, 15]]),
    ]);
  });

  it('dashes a soffit (G3)', () => {
    expect(wallThings(stored('G3 Bath alcove')).filter(({ kind }) => kind === 'soffit')).toEqual([{
      id: '5ac8edd3-2c75-476d-bc64-f80ade3f5fba', kind: 'soffit', points: [[-102, 9], [-30, 9], [-30, -5], [-102, -5]], dashed: true,
    }]);
  });
});

describe('SPEC-44 the room in plan: runs', () => {
  it('draws a run\'s boxes, faces and end panels as the plan view does (G1 tall)', () => {
    const run = 'b38f2f11-5318-42f2-9d95-8b9b3d1b9087';
    const box = '28072a7d-e691-40d1-a005-4d0ed1c9e825';
    const parts = planParts(syncRoom(stored('G1 Euro kitchen'), settings), settings);
    expect(parts.filter(({ runId }) => runId === run)).toEqual([
      { id: box, kind: 'cabinet', points: [[-60, -83.25], [-60, -54.75], [-35, -54.75], [-35, -83.25]], runId: run, top: 90 },
      { id: `${run}:left`, kind: 'end_panel', points: [[-60, -84], [-60, -83.25], [-34.125, -83.25], [-34.125, -84]], runId: run, top: 90 },
      { id: `${box}:rleft`, kind: 'face', points: [[-34.9375, -83.1875], [-34.9375, -69.0625], [-34.125, -69.0625], [-34.125, -83.1875]], runId: run, top: 90 },
      { id: `${box}:rright`, kind: 'face', points: [[-34.9375, -68.9375], [-34.9375, -54.8125], [-34.125, -54.8125], [-34.125, -68.9375]], runId: run, top: 90 },
      { id: `${run}:right`, kind: 'end_panel', points: [[-60, -54.75], [-60, -54], [-34.125, -54], [-34.125, -54.75]], runId: run, top: 90 },
    ]);
  });

  it('gives every part of an upper run its top, dashing none (G1 wall 1 upper)', () => {
    const run = '434f1164-3b6b-4a97-89e7-1c6438c4d95a';
    const parts = planParts(syncRoom(stored('G1 Euro kitchen'), settings), settings)
      .filter(({ runId }) => runId === run);
    expect(parts.map(({ id, kind, top, dashed }) => [id.replace(run, 'run'), kind, top, dashed])).toEqual([
      ['ae7626bb-d1e5-4396-8b5b-a8630bfed949', 'cabinet', 90, undefined],
      ['2dc1a45e-c462-4c4a-99f3-65c8b6782a2a', 'cabinet', 90, undefined],
      ['run:left', 'end_panel', 90, undefined],
      ['ae7626bb-d1e5-4396-8b5b-a8630bfed949:r', 'face', 90, undefined],
      ['2dc1a45e-c462-4c4a-99f3-65c8b6782a2a:r', 'face', 90, undefined],
      ['run:right', 'filler', 90, undefined],
      ['run:right:left', 'filler', 90, undefined],
    ]);
    expect(parts.at(-1).points).toEqual([[-50.4375, 69.25], [-50.4375, 70], [-47.9375, 70], [-47.9375, 69.25]]);
  });

  it('gives each stacked box its own top, so the higher one hides the lower (G4)', () => {
    const run = '738c73a7-adda-40e0-bca9-a881403c1ffa';
    const parts = planParts(syncRoom(stored('G4 T-filler run'), settings), settings)
      .filter(({ runId, kind }) => runId === run && kind === 'cabinet');
    expect(parts.map(({ id, top }) => [id, top])).toEqual([
      ['36718dec-9ae3-48e7-bce7-f3d95d207a1c', 90],
      ['0e8d791b-a3a5-4fe6-8b08-a1b8e954b8ba', 64],
      ['87b307e7-2f67-48a7-a80e-a52d4249d55b', 90],
      ['6ae1c6d6-ec28-40d7-aee3-f3b0898ed2fb', 90],
    ]);
  });

  it('covers every golden room: frames, panels, T-fillers and stacks; only the soffit is dashed', () => {
    const counts = Object.fromEntries(document.rooms.map((room) => {
      const parts = planParts(syncRoom(room, settings), settings);
      const kinds = {};
      for (const { kind } of parts) kinds[kind] = (kinds[kind] ?? 0) + 1;
      return [room.name, [parts.length, parts.filter(({ runId }) => runId).length, parts.filter(({ dashed }) => dashed).length,
        parts.filter(({ top }) => top !== undefined).length, kinds]];
    }));
    expect(counts).toEqual({
      'G1 Euro kitchen': [77, 69, 0, 71, { wall: 3, void: 1, opening: 1, casing: 1, wall_end_panel: 2, cabinet: 19, end_panel: 3, face: 36, filler: 11 }],
      'G2 Face frame kitchen': [22, 17, 0, 18, { wall: 1, void: 1, opening: 1, casing: 1, wall_end_panel: 1, cabinet: 9, end_panel: 3, frame: 4, panel: 1 }],
      'G3 Bath alcove': [18, 14, 1, 14, { wall: 3, soffit: 1, cabinet: 3, filler: 4, face: 4, end_panel: 2, panel: 1 }],
      'G4 T-filler run': [20, 18, 0, 18, { wall: 2, cabinet: 4, end_panel: 2, face: 6, filler: 6 }],
      'G5 Recess room': [27, 20, 0, 20, { wall: 5, void: 2, cabinet: 6, filler: 6, face: 6, end_panel: 2 }],
      'G6 Stacked runs': [37, 34, 0, 34, { wall: 3, cabinet: 8, filler: 6, face: 16, end_panel: 3, panel: 1 }],
    });
  });
});
```

What changed in it: the two G1 wall end panels and every part of G1's tall carry `top` (34 1/2" and 90"); the upper test checks tops instead of dashes; a new test checks G4's stacked column (a 64" box under a 90" one); the counts test adds a column for parts with a top, and only G3's soffit is dashed.

**Count:** 950 + 1 = **951**. Golden snapshot unchanged. Gate: `npm test && npm run lint && npm run build`.

---

## End-to-end check (Kyle)

Geometry with 367–368 in, the designer built after 369.

- **G1 `plan.dxf`**: walls solid grey. Wall 1's and wall 2's uppers solid; the bases under them show only their front part, their side lines stopping at the upper's face. The tall and the island whole.
- **G4**: the stacked column shows one box outline (the 90" box hides the 64" one).
- **G3**: the soffit still dashed.
- **Every DXF** (open `elevation-A.dxf` on G1 and the plan): zoom extents leaves about 12" around the outermost dimension and the title. If your viewer's green border still cuts through dimensions, tell me which viewer it is and send a screenshot: it may be drawing something other than the extents or limits.

**Known for now:** the designer's plan canvas still dashes uppers. No dimensions or labels in plan yet (45).
