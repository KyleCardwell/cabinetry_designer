# Round 44 — SPEC: captured pair doors keep their size, and the plan DXF

Steps 362–366. Designer (362), geometry (363), designer (364–366). The API doesn't change: its schema passes unknown fields through.
Drawing rounds: 43.4 corner reach on cornerShapes → **44 captured pair fix + plan DXF** → 45 plan dimensions and labels → sheet layout.

**Done when:**
- A European cabinet captured both sides (end panels, fillers, flush side panels or T-fillers) whose faces are one column holding a pair door *and* single-wide faces (drawers, a door, a false front) gets the captured-single side reveals (3/32", or 27/32" behind T-fillers) on the whole cabinet. The pair doors keep the size they'd have at the pair rule's 1/16" sides (14 7/8" on a 30" box); they move toward each other and their gap closes from 1/8" to 1/16". On the canvas, in plan, in the DXF and in the parts list, since they all read `runFaceLayouts`.
- Every exported zip carries `plan.dxf` (first, after `payload.json`): the walls joined at the corners, openings and recess notches cut out, outlined and hatched; casings and window lines; soffits and raised recesses dashed; every run's boxes, faces, fillers and returns, end panels, frames, T/L fillers and wall end panels, as the plan view draws them; uppers dashed.
- Dimensions, wall numbers, elevation markers, labels and clearances in plan are **not** in 44 (they're 45).

| Step | Repo | What | Tests after |
|---|---|---|---|
| **362** | designer | `capturedFaces`; a mixed captured cabinet gets 3/32" sides and a 1/16" pair gap | 941 → **943** |
| **363** | geometry | `PayloadPlan`, `build_plan_dxf`, `plan.dxf` in the zip | 48 → **52** |
| **364** | designer | `planParts`: walls, openings, recesses, soffits, wall end panels (nothing calls it yet) | **946** |
| **365** | designer | `planParts` adds every run's pieces | **949** |
| **366** | designer | `plan` on the payload | **950** |

Codex writes the code (PROMPT-CONVENTIONS rule 10). This SPEC gives the rules, the contracts and the tests. The test values were checked against a throwaway build of these rules (designer 950, lint 0 errors, build OK; geometry 52; the golden snapshot doesn't change in any step). That build isn't in this SPEC. If a test fails, fix the code, not the number, unless the number contradicts a rule here. In that case, stop and say so.

---

## §1 Decisions (Kyle, 2026-10-06)

### Captured pair doors (REV-005 / REV-006)

- **Today.** The captured-single rule (3/32" sides) only fires when *no* face in the cabinet is a pair door (`isSingleColumn`). A tall with a pair door over three drawers between end panels gets the plain 1/16" sides everywhere, so its drawers miss REV-006.
- **Now (Kyle).** In a standard 30" box with end panels or fillers both sides, all single-wide faces get the 3/32" rule. The pair doors stay 14 7/8" each (their size under REV-005's 1/16" sides and 1/8" gap). They don't shrink; they move toward each other so their outside reveals match the single-wide faces, and the gap between them goes from 1/8" to 1/16".
- **Which cabinets.** `capturedFaces(face)` reads the face tree as a column: a leaf, or vertical groups all the way down.
  - `'single'`: no pair door. The rule fires as today.
  - `'mixed'`: at least one pair door and at least one other leaf. The rule fires, and the pair gap shrinks.
  - `null`: a pair door alone (REV-005, 1/16" sides as today), or any horizontal (side-by-side) group anywhere in the tree (as today, Claude's default; say if doors side by side over drawers should get it too).
- **How the gap shrinks.** When the rule fires on a mixed cabinet, before it sets the sides, `values.pair` drops by how much each side grows: `pair − (3/32 − left) − (3/32 − right)`, with `left`/`right` as they were just before. With the default 1/16" sides that's 1/8 − 1/32 − 1/32 = 1/16. `resolveFaces` already places a pair as `(width − pair) / 2` each, so the doors come out 14 7/8".
- **T-fillers.** A T adds 3/4" to each side after the rule (27/32" for the single-wide faces, as REV-006 says). The pair still gets 1/16" between, so each door is 14 7/8" − 3/4".
- **Manual side reveals** still win, as always. The pair gap stays what the rule made it.
- `pair` isn't one of the six reveal keys, so the reveal fields don't show it. The **Vertical** field still says 1/8" (it's the gap between side-by-side sections). The sources on Left/Right say "rule: captured single".
- `isSingleColumn` stays exported (index.js, styles test 34). `styles.js` stops calling it.
- No golden room has a mixed captured cabinet, so the snapshot doesn't change.

### The plan DXF

- **One `plan.dxf` per room**, first in the zip after `payload.json`, then the elevations. `files` lists it first. A payload with no `plan` draws no `plan.dxf`, so every existing fixture and test is unchanged.
- **The designer sends outlines; geometry draws them.** `payload.plan = { parts: [...] }`, each part `{ id, kind, points: [[x, y], …], runId?, closed?, dashed? }` in plan inches with **y up**: the designer flips the plan's y (`[x, -y]`) so the DXF reads like the canvas. `closed` is sent only when false (an open line), `dashed` only when true, `runId` only on run parts, so `payload.json` round-trips with `exclude_defaults`. No −0: write the flip so a 0 stays 0 (for example `[x + 0, 0 - y]`); `toEqual` tells −0 from 0.
- **What's drawn: what the plan canvas draws**, minus its labels, dimensions, markers and clearances (45):
  - **Walls (Kyle: outline + ANSI31).** Every wall's outline (`wallOutline`, mitred corners) is a `wall` part; a deep recess's bump-out (`recessPlanShape(...).fill`) is a `wall` part too. A door or window (through the wall, at its jamb width) and a recess's notch (`knockout`) are `void` parts. Geometry joins the walls and cuts the voids out, outlines the result on **WALLS** and hatches it ANSI31 on **SECTIONS** (scale 8, 1" apart, like the elevation sections). Corners join with no seam. A wall with no thickness (an island's backs butted) sends no `wall` part.
  - **Joining.** Geometry buffers each wall by +0.001" (mitre joins), unions them, buffers −0.001", then subtracts the voids, so an angled corner whose two mitre points differ by floating-point noise still joins.
  - **Openings.** The detail line (a window's at the middle of the wall, a door's at the face) as an open line, and the casing rectangle, on **OPENINGS**. The jamb lines aren't sent: they're the wall outline's edges.
  - **Recesses and projections raised off the floor**: their own three outline lines, dashed, on **WALLS** (on the floor they're the wall outline already).
  - **Soffits**: dashed rectangles on **WALLS**.
  - **Runs**, from `planRunPieces` exactly as `PlanRunFootprint` draws them: boxes on **CABINETS**, faces on **FACES**, fillers, filler returns and seam T-fillers on **FILLERS**, end panels, panels and L lips on **PANELS**, face frame strips on **FRAMES**, floating shelves on **SHELVES** (dashed). Polygons (miters, L ends, frame strips) as they are.
  - **Uppers dashed (Kyle)**: every part of an upper run carries `dashed`. Bases and talls are solid.
  - **Wall end panels** (`wallEndPanelPolygon`) on **PANELS**, id `wallEndPanelPartKey(wall.id, endpoint)` as in the parts list.
  - Dashed parts get linetype `DASHED` on the entity; the layer keeps its own. `$LTSCALE` = plot scale ÷ 2 as in the elevations.
- **Title**: `PLAN` (4" high) at the drawing's lowest-left point less 12", the room name (3") 6" under it, on TEXT in FF_TEXT. Replaced by the title block at sheet layout.
- **Not in 44:** dimensions, wall numbers, elevation markers, opening/recess labels and clearances (45); countertops and toe kicks in plan; door swings; the canvas's dashed overhang past a wall end (drawn solid); hidden lines between plan parts (an upper over a base is just dashed over it).

---

## §2 Step 362 — designer: captured pair doors keep their size

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/styles.js` | 300 | export `capturedFaces`; the captured rule in `cabinetReveals` |
| NEW `src/elevation/model/__tests__/capturedFaces.test.js` | — | 2 tests, verbatim |

**Contract.**
- `capturedFaces(face)` → `'single' | 'mixed' | null`, exported, placed just above `cabinetReveals`. Collect the leaves of the column: a leaf is itself; a `direction: 'vertical'` group is its children's leaves; anything else (a horizontal group) makes the answer `null`. No pair door → `'single'`; some pair doors and some other leaves → `'mixed'`; only pair doors → `null`. Doc comment: how a captured Euro cabinet's faces read (SPEC-44).
- In `cabinetReveals`, the condition `euro && captured.left && captured.right && isSingleColumn(face)` becomes: `euro`, captured both sides, and `capturedFaces(face)` not null. When it's `'mixed'`, first lower `values.pair` by `(reveal − values.left) + (reveal − values.right)`, then apply left and right as today. Nothing else in the function changes, and its order of rules stays.

**Don't touch:** `isSingleColumn` (keep it and its export), `faces.js` (`resolveFaces` already places a pair at `(width − pair) / 2`), `faceLayouts.js`, `index.js`, `styles.test.js`, any canvas file.

**NEW `src/elevation/model/__tests__/capturedFaces.test.js`**, verbatim:

```js
import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { runFaceLayouts } from '../faceLayouts.js';
import { resolveWall } from '../room.js';
import { cabinetReveals, capturedFaces } from '../styles.js';

const { BASE, TALL } = CABINET_TYPE_IDS;
const S = DEFAULT_SETTINGS;
const EURO = { cabinetStyleId: 13, beadWidth: 0.25, profiledEdge: false };
const BOTH = { left: true, right: true };
const DOOR = { type: 'door', size: null };
const PAIR = { type: 'pair_door', size: null };
const DRAWER = { type: 'drawer_front', size: null };
const stack = (...children) => ({ direction: 'vertical', size: null, children });
const PD_3DF = stack(PAIR, { ...stack({ ...DRAWER, size: 5.875 }, DRAWER, DRAWER), size: 30.25 });
const SIDE_BY_SIDE = stack({ direction: 'horizontal', size: null, children: [DOOR, DOOR] }, DRAWER);

describe('SPEC-44 a captured cabinet with a pair door and single-wide faces', () => {
  it('gives the whole cabinet 3/32" sides and takes the difference out of the pair\'s gap', () => {
    expect([DOOR, PAIR, stack(DRAWER, DRAWER), PD_3DF, SIDE_BY_SIDE].map(capturedFaces))
      .toEqual(['single', null, 'single', 'mixed', null]);
    const mixed = cabinetReveals({ style: EURO, cabinetTypeId: TALL, face: PD_3DF, captured: BOTH, settings: S });
    expect([mixed.values.left, mixed.values.right, mixed.values.vertical, mixed.values.pair])
      .toEqual([0.09375, 0.09375, 0.125, 0.0625]);
    expect([mixed.sources.left, mixed.sources.right]).toEqual(['rule:captured-single', 'rule:captured-single']);
    // T-fillers both sides (REV-005/006): 27/32" sides, the pair still 1/16" apart.
    const tees = cabinetReveals({
      style: EURO, cabinetTypeId: TALL, face: PD_3DF, captured: BOTH,
      tCovers: { left: 0.75, right: 0.75, top: 0, bottom: 0 }, settings: S,
    });
    expect([tees.values.left, tees.values.right, tees.values.pair]).toEqual([0.84375, 0.84375, 0.0625]);
    // Captured one side only, a pair alone, or doors side by side: nothing changes.
    const oneSide = cabinetReveals({ style: EURO, cabinetTypeId: TALL, face: PD_3DF, captured: { left: true, right: false }, settings: S });
    expect([oneSide.values.left, oneSide.values.pair]).toEqual([0.0625, 0.125]);
    const pair = cabinetReveals({ style: EURO, cabinetTypeId: BASE, face: PAIR, captured: BOTH, settings: S });
    expect([pair.values.left, pair.values.pair]).toEqual([0.0625, 0.125]);
    const side = cabinetReveals({ style: EURO, cabinetTypeId: BASE, face: SIDE_BY_SIDE, captured: BOTH, settings: S });
    expect([side.values.left, side.values.pair, side.sources.left]).toEqual([0.0625, 0.125, 'style']);
  });

  it('keeps each pair door 14 7/8" on a 30" tall between end panels; they close to 1/16" apart', () => {
    const run = {
      id: 'run-1', cabinetTypeId: TALL, x: 24, width: 31.5, z: 4, height: 90, depth: 24,
      ends: { left: { type: 'end_panel', width: null }, right: { type: 'end_panel', width: null } },
      autoCount: false, maxCabinetWidth: null, items: [{ id: 'a', kind: 'cabinet', width: 30, face: PD_3DF }],
      heightMode: 'manual', overrides: {}, anchors: { left: false, right: false },
    };
    const wall = {
      id: 'wall-1', name: 'Wall 1', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5,
      flipped: false, connections: { start: null, end: null }, profile: {}, runs: [run], openings: [],
    };
    const room = {
      id: 'room-1', name: 'Room 1', profile: { ...S.defaultProfile }, walls: [wall], wallOrder: ['wall-1'],
    };
    const { faces } = runFaceLayouts(room, resolveWall(room, room.walls[0]), run, S).get('a');
    expect(faces.map(({ path, half, x, width }) => [path, half ?? null, x, width])).toEqual([
      ['r.0', 'left', 24.84375, 14.875],
      ['r.0', 'right', 39.78125, 14.875],
      ['r.1.0', null, 24.84375, 29.8125],
      ['r.1.1', null, 24.84375, 29.8125],
      ['r.1.2', null, 24.84375, 29.8125],
    ]);
  });
});
```

What the numbers are: the box is 30" (31 1/2" run less two 3/4" end panels), x 24 3/4". 3/32" sides put the faces at 24 27/32"; the drawers are 30 − 3/16 = 29 13/16". Each pair door is (29 13/16 − 1/16) ÷ 2 = 14 7/8"; the right one starts at 24 27/32 + 14 7/8 + 1/16 = 39 25/32".

**Count:** 941 + 2 = **943**. Golden snapshot unchanged.

---

## §3 Step 363 — geometry: the plan DXF

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/drawing/models.py` | 121 | `PayloadPlanPart`, `PayloadPlan`, `DrawingPayload.plan` |
| NEW `src/drawing/plan_dxf.py` | — | `build_plan_dxf` |
| `src/drawing/bundle.py` | 30 | `plan.dxf` first when there's a plan |
| NEW `tests/test_plan.py` | — | 4 tests, verbatim |

**Models** (above `DrawingPayload`, both `extra="forbid"`):
- `PayloadPlanPart`, docstring "One outline in plan (SPEC-44), in plan inches with y up. Walls are joined and voids cut out of them.": `id: str` (min_length=1); `kind: Literal["wall", "void", "opening", "casing", "recess", "soffit", "cabinet", "face", "filler", "end_panel", "panel", "frame", "shelf", "wall_end_panel"]`; `runId: str | None = None`; `points: list[tuple[float, float]] = Field(min_length=2)`; `closed: bool = True`; `dashed: bool = False`.
- `PayloadPlan`: `parts: list[PayloadPlanPart] = []`.
- `DrawingPayload` gets, last, `plan: PayloadPlan | None = None` with the comment "The room in plan (SPEC-44). None draws no plan.dxf, so a payload without it round-trips."

**`plan_dxf.py`**, module docstring "Render a room's plan as a DXF (SPEC-44).":
- `PLAN_LAYERS`: opening, casing → OPENINGS; recess, soffit → WALLS; cabinet → CABINETS; face → FACES; filler → FILLERS; end_panel, panel, wall_end_panel → PANELS; frame → FRAMES; shelf → SHELVES. (`wall` and `void` aren't drawn as parts.)
- `SNAP = 1e-3`, with a comment: walls are joined 0.001" fat so mitre points that differ by noise still meet.
- `wall_region(plan)`: the `wall` parts as shapely Polygons, each `.buffer(SNAP, join_style="mitre")`, `unary_union`, `.buffer(-SNAP, join_style="mitre")`, minus the `unary_union` of the `void` parts (when there are any).
- `build_plan_dxf(plan, room, plot_scale=DEFAULT_PLOT_SCALE) -> bytes`: `create_dxf_document()`, `$LTSCALE` = plot_scale / 2. For each polygon of the region (`_polygons` from `.elevation_dxf`), its exterior and every interior ring as a closed LWPOLYLINE on WALLS (the ring's coords less the repeated last point). Then `_add_hatch(modelspace, "SECTIONS", region)` (also from `.elevation_dxf`; import both, don't move them). Then every other part, in payload order: `add_lwpolyline(points, close=part.closed, dxfattribs={"layer": PLAN_LAYERS[kind]})`, adding `"linetype": "DASHED"` when `dashed`. Then, if there are any points at all, the two TEXT entities on TEXT in TEXT_STYLE: `PLAN` height 4 at (min x, min y − 12) and the room name height 3 at (min x, min y − 18), over every point of every part. `doc_to_bytes(doc)`.
- `bundle.draw`: when `model.plan is not None`, `("plan.dxf", build_plan_dxf(model.plan, model.room, plot_scale))` goes before the elevations in the files list (so in the zip and in `files`).

**Don't touch:** `elevation_dxf.py`, `dimensions.py`, `marks.py`, `writer.py`, `hlr.py`, the fixtures, any existing test. No new dependencies (shapely and ezdxf are there).

**NEW `tests/test_plan.py`**, verbatim:

```python
"""The plan DXF (SPEC-44)."""

import base64
import copy
import io
import json
import zipfile
from pathlib import Path

import ezdxf
import pytest
from pydantic import ValidationError
from shapely.geometry import Polygon

from src.drawing.bundle import draw

ROOT = Path(__file__).resolve().parent.parent
ELEVATIONS = json.loads((ROOT / "tests" / "fixtures" / "g1_payload.json").read_text())

# Two walls meeting at a mitred corner, a window through the first, a base and an upper in front of it.
PLAN = {"parts": [
    {"id": "A:wall", "kind": "wall", "points": [[0, 0], [120, 0], [124.5, 4.5], [0, 4.5]]},
    {"id": "B:wall", "kind": "wall", "points": [[120, 0], [120, -60], [124.5, -60], [124.5, 4.5]]},
    {"id": "W:void", "kind": "void", "points": [[36, 0], [72, 0], [72, 4.5], [36, 4.5]]},
    {"id": "W:detail", "kind": "opening", "points": [[36, 2.25], [72, 2.25]], "closed": False},
    {"id": "W:casing", "kind": "casing", "points": [[33, 0], [75, 0], [75, -0.75], [33, -0.75]]},
    {"id": "box", "kind": "cabinet", "runId": "R1", "points": [[0, 0], [24, 0], [24, -24], [0, -24]]},
    {"id": "box:r", "kind": "face", "runId": "R1",
     "points": [[0.0625, -24.0625], [23.9375, -24.0625], [23.9375, -24.875], [0.0625, -24.875]]},
    {"id": "up", "kind": "cabinet", "runId": "R2", "dashed": True,
     "points": [[84, 0], [120, 0], [120, -12], [84, -12]]},
]}
PAYLOAD = {**ELEVATIONS, "plan": PLAN}


def _archive(payload):
    return zipfile.ZipFile(io.BytesIO(base64.b64decode(draw(payload)["zip_base64"])))


def _modelspace(payload):
    return ezdxf.read(io.StringIO(_archive(payload).read("plan.dxf").decode("utf-8"))).modelspace()


def _polylines(msp, layer):
    return list(msp.query(f'LWPOLYLINE[layer=="{layer}"]'))


def _area(polyline):
    return Polygon([point[:2] for point in polyline.get_points("xy")]).area


def test_plan_dxf_comes_first_only_when_the_payload_has_a_plan():
    result = draw(PAYLOAD)
    elevations = ["elevation-A.dxf", "elevation-B.dxf", "elevation-C.dxf", "elevation-D.dxf"]
    assert result["files"] == ["plan.dxf", *elevations]
    assert _archive(PAYLOAD).namelist() == ["payload.json", "plan.dxf", *elevations]
    assert json.loads(_archive(PAYLOAD).read("payload.json")) == PAYLOAD
    assert draw(ELEVATIONS)["files"] == elevations


def test_walls_join_at_the_corner_and_the_window_cuts_them():
    msp = _modelspace(PAYLOAD)
    walls = _polylines(msp, "WALLS")
    assert all(polyline.closed for polyline in walls)
    assert sorted(round(_area(polyline), 4) for polyline in walls) == [162, 506.25]
    hatches = list(msp.query("HATCH"))
    assert [(hatch.dxf.layer, hatch.dxf.pattern_name, hatch.dxf.pattern_scale) for hatch in hatches] == [
        ("SECTIONS", "ANSI31", 8), ("SECTIONS", "ANSI31", 8),
    ]
    assert sorted(round(Polygon([v[:2] for v in hatch.paths.paths[0].vertices]).area, 4) for hatch in hatches) == [
        162, 506.25,
    ]


def test_each_part_is_an_outline_on_its_layer_uppers_dashed():
    msp = _modelspace(PAYLOAD)
    shapes = [
        (polyline.dxf.layer, polyline.closed, polyline.dxf.linetype, [tuple(p) for p in polyline.get_points("xy")])
        for polyline in msp.query("LWPOLYLINE")
        if polyline.dxf.layer != "WALLS"
    ]
    assert shapes == [
        ("OPENINGS", False, "BYLAYER", [(36, 2.25), (72, 2.25)]),
        ("OPENINGS", True, "BYLAYER", [(33, 0), (75, 0), (75, -0.75), (33, -0.75)]),
        ("CABINETS", True, "BYLAYER", [(0, 0), (24, 0), (24, -24), (0, -24)]),
        ("FACES", True, "BYLAYER", [(0.0625, -24.0625), (23.9375, -24.0625), (23.9375, -24.875), (0.0625, -24.875)]),
        ("CABINETS", True, "DASHED", [(84, 0), (120, 0), (120, -12), (84, -12)]),
    ]
    assert [(t.dxf.text, tuple(t.dxf.insert)[:2], t.dxf.height) for t in msp.query("TEXT")] == [
        ("PLAN", (0, -72), 4), ("G1 Euro kitchen", (0, -78), 3),
    ]


def test_rejects_an_unknown_plan_kind_or_a_single_point():
    for change in ({"kind": "stair"}, {"points": [[0, 0]]}):
        payload = copy.deepcopy(PAYLOAD)
        payload["plan"]["parts"][5].update(change)
        with pytest.raises(ValidationError):
            draw(payload)
```

What the numbers are: wall A is 4 1/2" × 120" to the mitre, wall B 60" down to it; joined they're 830 1/4 sq in. The window cuts 162 out of A, right through it, leaving 162 to its left and 506 1/4 to its right (with B). The title sits 12" and 18" under the lowest point (−60, wall B's end). The G1 payload's room name is "G1 Euro kitchen".

**Count:** 48 + 4 = **52**.

---

## §4 Step 364 — designer: `planParts`, the walls and what's in them

A new module nothing calls yet.

**Files:**

| File | Lines | Change |
|---|---:|---|
| NEW `src/elevation/model/planParts.js` | — | `planParts(room, settings)` |
| NEW `src/elevation/model/__tests__/planParts.test.js` | — | 3 tests, verbatim |

**Contract.** `planParts(room, settings)` → a list of plan parts `{ id, kind, points, closed?, dashed?, runId? }` (§1). Points are `[x, -y]` of the plan point (no −0). For each wall in `room.walls` order:
1. `{ id: `${wall.id}:wall`, kind: 'wall', points: wallOutline(room, wall) }` when `wall.thickness > 1e-9`.
2. Each recess in `wall.recesses ?? []`: `frame = wallSideFrame(room, wall, recess.wallSide)`, `shape = recessPlanShape(recess, frame.length, wall.height, wall.thickness)`, points through `elevationToPlan(frame, u, v)`:
   - `shape.fill` → `` `${recess.id}:fill` ``, kind `'wall'`;
   - `shape.knockout` → `` `${recess.id}:knockout` ``, kind `'void'`;
   - when `shape.dashed`, its first three `shape.lines` → `` `${recess.id}:line-${index}` ``, kind `'recess'`, `closed: false`, `dashed: true`.
3. Each opening in `wall.openings ?? []`, with `frame = wallFrame(room, wall)`, `{ jamb, casing } = openingGeometry(opening, frame.length, settings)`, `depths = openingPlanDepths(wall, opening)`:
   - `` `${opening.id}:void` ``, kind `'void'`: jamb.x → jamb.x + jamb.width, `depths.face` → `depths.back` (face-left, face-right, back-right, back-left);
   - `` `${opening.id}:detail` ``, kind `'opening'`, `closed: false`: jamb.x → jamb.x + jamb.width at `(face + back) / 2` for a window, `face` for a door;
   - when `casing`: `` `${opening.id}:casing` ``, kind `'casing'`: casing.x → casing.x + casing.width, `depths.face` → `depths.face + casing.thickness`.
4. Each soffit in `wall.soffits ?? []`: `soffit.id`, kind `'soffit'`, `dashed: true`, the rectangle `soffit.x` → `soffit.x + soffit.width`, 0 → `soffit.depth` in `wallSideFrame(room, wall, soffit.wallSide)`.
5. Each of `wallEndPanels(room, wall, settings)`: `wallEndPanelPartKey(wall.id, panel.endpoint)` (from `./parts.js`), kind `'wall_end_panel'`, `wallEndPanelPolygon(room, wall, panel)`.

Rectangles go (u0, v0), (u1, v0), (u1, v1), (u0, v1), as `PlanOpening.jsx` and `PlanScene.jsx` build them. Doc comment: the room in plan for the DXF (SPEC-44), outlines in plan inches with y up, what the plan view draws less its labels and dimensions.

**Reuse:** `wallOutline` (`./wallOutline.js`), `recessPlanShape` and `openingPlanDepths` (`./recesses.js`), `openingGeometry` (`./openings.js`), `wallEndPanels` and `wallEndPanelPolygon` (`./wallEndPanels.js`), `wallEndPanelPartKey` (`./parts.js`), `wallFrame` and `elevationToPlan` (`./geometry.js`), `wallSideFrame` (`./wallSides.js`). No import cycle.

**Don't touch:** any of those files, `planPieces.js`, `drawingPayload.js`, `index.js`, the plan components, the existing tests.

**NEW `src/elevation/model/__tests__/planParts.test.js`**, verbatim:

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
      { id: `${island}:endPanel:start`, kind: 'wall_end_panel', points: [[10.25, -16.75], [9.5, -16.75], [9.5, 21], [10.25, 21]] },
      { id: `${island}:endPanel:end`, kind: 'wall_end_panel', points: [[101, -16.75], [100.25, -16.75], [100.25, 21], [101, 21]] },
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
```

What the numbers are: G1 wall 1 runs (−60, 84) → (−60, −84) in plan, so (−60, −84) → (−60, 84) with y up; its back is 4 1/2" out, mitred at wall 2 (−64 1/2, 88 1/2). The window is 48" wide, its casing 3" each side and 3/4" thick. The island is 0" thick, so it has no wall part, only its two 3/4" wall end panels. G5's R1 is 48" × 12" deep in a 4 1/2" wall: the notch is 12" deep, the fill 12" behind the wall's back, 4 1/2" past each side. Raised 12", it keeps the fill and its notch becomes dashed lines. G3's soffit is 72" × 14".

**Count:** 943 + 3 = **946**. Golden snapshot unchanged.

---

## §5 Step 365 — designer: every run in plan

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/planParts.js` | ~70 | the run parts, after every wall's parts |
| `src/elevation/model/__tests__/planParts.test.js` | 56 | one `describe` appended, verbatim |

**Contract.** After the walls loop, for each wall in `room.walls` order and each run in `wall.runs ?? []` order, as `PlanRunFootprint` does it (the raw wall, not a resolved view):
- `frame = wallSideFrame(room, wall, wallSideOf(run))`, `layout = layoutRun(room, wall, run, settings)`, `{ boxes, faces, returns } = planRunPieces(room, wall, run, settings, layout, runFaceLayouts(room, wall, run, settings, layout))`.
- Each range's points: `range.polygon` (`[u, v]` pairs) when it has one, else (start, back), (end, back), (end, front), (start, front); through `elevationToPlan(frame, u, v)` and flipped.
- `id` = the range's `key`; `runId` = `run.id`.
- Kinds: a box → `'shelf'` when `box.dashed`, else `'cabinet'`; a face range → its own `kind` (`face`, `filler`, `end_panel`, `panel`, `frame`); a return → `'filler'`.
- `dashed: true` on every part of a run whose `cabinetTypeId` is `CABINET_TYPE_IDS.UPPER`, and on a shelf box.
- Order: the run's boxes, then faces, then returns.

**Reuse:** `layoutRun`, `runFaceLayouts` (`./faceLayouts.js`), `planRunPieces` (`./planPieces.js`), `wallSideOf` (`./wallSides.js`), `CABINET_TYPE_IDS` (`./constants.js`).

**Don't touch:** `planPieces.js`, `faceLayouts.js`, `PlanRunFootprint.jsx`, `drawingPayload.js`, `index.js`, the existing tests (the three §4 tests filter by wall kinds and keep passing).

**Tests.** Append at the end of `planParts.test.js`, verbatim:

```js

describe('SPEC-44 the room in plan: runs', () => {
  it('draws a run\'s boxes, faces and end panels as the plan view does (G1 tall)', () => {
    const run = 'b38f2f11-5318-42f2-9d95-8b9b3d1b9087';
    const box = '28072a7d-e691-40d1-a005-4d0ed1c9e825';
    const parts = planParts(syncRoom(stored('G1 Euro kitchen'), settings), settings);
    expect(parts.filter(({ runId }) => runId === run)).toEqual([
      { id: box, kind: 'cabinet', points: [[-60, -83.25], [-60, -54.75], [-35, -54.75], [-35, -83.25]], runId: run },
      { id: `${run}:left`, kind: 'end_panel', points: [[-60, -84], [-60, -83.25], [-34.125, -83.25], [-34.125, -84]], runId: run },
      { id: `${box}:rleft`, kind: 'face', points: [[-34.9375, -83.1875], [-34.9375, -69.0625], [-34.125, -69.0625], [-34.125, -83.1875]], runId: run },
      { id: `${box}:rright`, kind: 'face', points: [[-34.9375, -68.9375], [-34.9375, -54.8125], [-34.125, -54.8125], [-34.125, -68.9375]], runId: run },
      { id: `${run}:right`, kind: 'end_panel', points: [[-60, -54.75], [-60, -54], [-34.125, -54], [-34.125, -54.75]], runId: run },
    ]);
  });

  it('dashes an upper run, filler return and all (G1 wall 1 upper)', () => {
    const run = '434f1164-3b6b-4a97-89e7-1c6438c4d95a';
    const parts = planParts(syncRoom(stored('G1 Euro kitchen'), settings), settings)
      .filter(({ runId }) => runId === run);
    expect(parts.map(({ id, kind, dashed }) => [id.replace(run, 'run'), kind, dashed])).toEqual([
      ['ae7626bb-d1e5-4396-8b5b-a8630bfed949', 'cabinet', true],
      ['2dc1a45e-c462-4c4a-99f3-65c8b6782a2a', 'cabinet', true],
      ['run:left', 'end_panel', true],
      ['ae7626bb-d1e5-4396-8b5b-a8630bfed949:r', 'face', true],
      ['2dc1a45e-c462-4c4a-99f3-65c8b6782a2a:r', 'face', true],
      ['run:right', 'filler', true],
      ['run:right:left', 'filler', true],
    ]);
    expect(parts.at(-1).points).toEqual([[-50.4375, 69.25], [-50.4375, 70], [-47.9375, 70], [-47.9375, 69.25]]);
  });

  it('covers every golden room: frames, panels, T-fillers and stacks', () => {
    const counts = Object.fromEntries(document.rooms.map((room) => {
      const parts = planParts(syncRoom(room, settings), settings);
      const kinds = {};
      for (const { kind } of parts) kinds[kind] = (kinds[kind] ?? 0) + 1;
      return [room.name, [parts.length, parts.filter(({ runId }) => runId).length, parts.filter(({ dashed }) => dashed).length, kinds]];
    }));
    expect(counts).toEqual({
      'G1 Euro kitchen': [77, 69, 20, { wall: 3, void: 1, opening: 1, casing: 1, wall_end_panel: 2, cabinet: 19, end_panel: 3, face: 36, filler: 11 }],
      'G2 Face frame kitchen': [22, 17, 4, { wall: 1, void: 1, opening: 1, casing: 1, wall_end_panel: 1, cabinet: 9, end_panel: 3, frame: 4, panel: 1 }],
      'G3 Bath alcove': [18, 14, 4, { wall: 3, soffit: 1, cabinet: 3, filler: 4, face: 4, end_panel: 2, panel: 1 }],
      'G4 T-filler run': [20, 18, 0, { wall: 2, cabinet: 4, end_panel: 2, face: 6, filler: 6 }],
      'G5 Recess room': [27, 20, 0, { wall: 5, void: 2, cabinet: 6, filler: 6, face: 6, end_panel: 2 }],
      'G6 Stacked runs': [37, 34, 13, { wall: 3, cabinet: 8, filler: 6, face: 16, end_panel: 3, panel: 1 }],
    });
  });
});
```

What the numbers are: G1's tall is one 28 1/2" box between end panels, 25" deep (with the 1/16" bumper and 13/16" door the faces and end panels reach 25 7/8"); its pair door is captured but alone, so 1/16" sides (REV-005). Wall 1's upper is two 22" boxes 12" deep, an end panel left and a filler with a 3/4" × 2 1/2" return right. The counts are each golden room's whole plan.

**Count:** 946 + 3 = **949**. Golden snapshot unchanged.

---

## §6 Step 366 — designer: the plan on the payload

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/drawingPayload.js` | 61 | the import and `plan` |
| `src/elevation/model/__tests__/drawingPayload.test.js` | 103 | one import, one line in `withoutParts`, one test |

**`drawingPayload.js`**: `import { planParts } from './planParts.js';` after the `elevationMarks` import. The returned object gets, last (after `plotScale`), `plan: { parts: planParts(room, settings) }`. The doc comment's round list adds "round 44 the room in plan".

**`drawingPayload.test.js`**:
- `import { planParts } from '../planParts.js';` after the `elevationMarks` import;
- in `withoutParts`, right after `...payload,`, the line `  plan: undefined,` (`toEqual` ignores an undefined key, so the first test keeps checking the round-40 fields);
- append inside the `describe`, after the SPEC-43.3 test, verbatim:

```js

  it('SPEC-44 carries the room in plan', () => {
    const synced = room('G1 Euro kitchen');
    const { plan } = toDrawingPayload(synced, settings);
    expect(Object.keys(plan)).toEqual(['parts']);
    expect(plan.parts).toHaveLength(77);
    expect(plan.parts).toEqual(planParts(synced, settings));
  });
```

**Don't touch:** `ExportDxfButton.jsx` (it sends whatever `toDrawingPayload` returns), `planParts.js`, the API.

**Count:** 949 + 1 = **950**. Gate: `npm test && npm run lint && npm run build`.

---

## End-to-end check (Kyle)

Geometry with 363 in, the designer built after 366, API and designer running as in round 42.

**Pair doors (362):**
- Draw a 31 1/2" tall run with end panels both ends (one 30" box) and give it the **PD/3Df** preset. The three drawers and the pair doors all show 3/32" at the sides (Left/Right: "rule: captured single"). Each pair door is 14 7/8", 1/16" apart.
- Change it to a plain **PD**: 1/16" sides, 1/8" between, the doors 14 7/8" (as before). A plain door or drawer stack: 3/32" (as before).

**Export DXF:**
- **G1** — the zip lists `plan.dxf` first. The three walls are one hatched outline with no seam at the corners, the window cut through wall 1 with its casing on the room side and a line down the middle of the wall. The island has no wall, just its two end panels. Wall 1's upper and wall 2's uppers are dashed over the bases; the tall, bases and island are solid. Fillers have their returns.
- **G2** — the door cut through wall 1, the face frame strips mitred into the end panels, the peninsula's back panel.
- **G5** — both recesses notched into the wall with their bump-outs behind it, hatched as one.
- **G3** — the soffit dashed over the vanity.
- Turn layers off in CAD to check they're on WALLS / SECTIONS / CABINETS / FACES / FILLERS / PANELS / FRAMES / OPENINGS.

**Known for now:**
- No dimensions, labels, wall numbers or elevation markers in plan yet (45).
- No countertops, toe kicks or door swings in plan.
- A run's part past a wall end is solid in the DXF (the canvas dashes it).
- Side-by-side doors over drawers between end panels keep 1/16" sides; say if they should take the 3/32" rule too.
