# Round 42.2 — SPEC: angled walls give, corner returns in section, neighbour profiles

Steps 331–338. Designer (331), geometry (332–333), designer (334–338). The API doesn't change.
Drawing rounds: 42 run bands → 42.1 band returns + stiles + wall things → **42.2 corner returns and profiles** → 43 elevation dimensions → 44 plan → 45 plan dimensions and labels.

**Done when:**
- In plan, typing a wall's length or dragging a wall beside an angled wall moves only their shared corner. The angled wall changes angle and length, and nothing past it moves. Square walls keep their angle as today.
- *Export DXF* draws each corner return in section, hatched on a new `SECTIONS` layer. A return is a run on the next wall or on a wing wall that's anchored into this face's corner, or a soffit that dies into it. Whatever a return covers is dashed, like the G1 B blind box.
- Runs on a connected wall that reach past this face's end are drawn from the side: box, faces, toe kick, top and moldings.
- The canvas draws returns and profiles from the same model function, so the canvas and the DXF agree.

| Step | Repo | What | Tests after |
|---|---|---|---|
| **331** | designer | Plan walls: an angled wall gives when its neighbour is typed or dragged | 895 → **900** |
| **332** | geometry | `visible_regions`: the part of a shape no nearer opaque shape covers | 28 → **29** |
| **333** | geometry | `section` (hatched, `SECTIONS`) and `profile` (`CABINETS`) kinds | **32** |
| **334** | designer | `runSide`: a run seen from its side, as depth pieces | **903** |
| **335** | designer | `cornerShapes` / `cornerParts`: corner, wing wall and soffit returns | **906** |
| **336** | designer | `cornerShapes`: profiles past the wall's ends | **908** |
| **337** | designer | The payload carries `cornerParts` | **908** |
| **338** | designer | Canvas: `NeighborReturns` and `NeighborProfiles` draw from `cornerShapes` | **908** |

Codex writes the code. This SPEC gives contracts, rules and tests. The literal test values come from the golden fixture with today's model and a reference build of these rules. The geometry values were checked with shapely 2.1 and ezdxf. If a test fails, fix the code, not the number, unless the number contradicts a rule here. In that case, stop and say so.

---

## §1 Decisions (Kyle, 2026-10-05)

- **An angled wall gives (Kyle).** A wall is *angled* when it's neither horizontal nor vertical in plan, and *square* otherwise. Kyle's case is a square room with one corner cut by a 45° wall. When one of the angled wall's neighbours changes (by typed length or by drag), only their shared corner moves, so the angled wall changes angle and length and the wall past it stays put. A square neighbour still keeps its angle, as today. A wall that's typed or dragged keeps its own angle, even if it's angled. No lock is needed.
  - **Typed length** (`setWallLength`): the wall's growing end moves along the wall. If the neighbour at that end is angled, only the shared corner moves. If it's square, it moves square as today (`moveWallPerpendicular`), and an angled wall past it gives.
  - **Drag** (`moveWallPerpendicular`): the dragged wall keeps its angle. A square neighbour slides along it as today. An angled neighbour's shared corner moves with the dragged wall.
  - A move that would collapse or reverse a wall is still refused (`neighbor-too-short`).
- **Corner returns are sections (Kyle).** A return is cut where it meets this face, outlined and hatched (ANSI31) on a new `SECTIONS` layer. There are three kinds:
  - a run on the next wall anchored into this face's inside corner;
  - a run on a wing wall anchored into the host face beside it (the wing wall's cabinets in section);
  - a soffit on another wall that dies into the corner or wing wall (SPEC-38.1).

  These are the canvas's returns today. Only the visible part of a section is hatched. A return's box and faces hide what's behind them, which is how the G1 B blind box's end comes out dashed. Its toe kick, countertop, top mold and crown are outlines (`opaque: false`), so where they overlap this wall's own bands nothing gets dashed.
- **True side shape (Kyle).** A neighbour run is drawn as its side: box, faces (doors + bumper, or the frame), toe kick set back 3", countertop 3/4" past the faces, top mold 1/4" and crown 3" past the faces (the round 42 `bandDepths`). Where the crown overlaps the top mold, the top mold stops under the crown. Real profiles replace this shape later.
- **Profiles.** A run on a connected wall that reaches past this face's end is drawn from the side, as the canvas does today. Its box and faces are `profile` parts on `CABINETS`. Its bands keep their band kinds and layers. A run sitting in the neighbour's recess is behind that wall's face, so it's never seen past this face's end. Today the canvas shows those runs, which is wrong.
- **Depths.** Every return and profile part carries `back` and `front` from this face, like every other part. For a return these come from the neighbour run's plan footprint along this face's normal, and its x is cut at this face (depth ÷ sin of the corner angle, as the canvas does). A soffit return's `front` is the soffit's length along its own wall, a placeholder until plan round 44.
- **Layers (Kyle):** `section` → `SECTIONS` (colour 8). `profile` → `CABINETS`. A return's or profile's bands → `MOLDINGS` / `COUNTERTOPS` as in round 42. Hatch spacing: ANSI31 at scale 24, so lines are 1/8" apart on paper at 1/2" = 1'-0".
- **Still the old function:** `neighborProfiles.js` keeps feeding the canvas's reach dimensions and extent (`dimensions.js`, `wallExtent.js`). It still includes recess runs, and its spans don't include the crown or countertop projection. Round 43 (elevation dimensions) moves those onto `cornerShapes`.

---

## §2 Step 331 — designer: an angled wall gives

**`src/elevation/plan/wallOps.js`** (247 lines):

1. Above `cloneWalls`: `const ORTHO_EPSILON = 1e-6;`
2. Above `moveWallPerpendicular`, add, as given:

```js
/** Whether a wall is drawn at an angle: neither horizontal nor vertical in plan (SPEC-42.2). */
export function isAngledWall(wall) {
  return Math.abs(wall.x2 - wall.x1) > ORTHO_EPSILON && Math.abs(wall.y2 - wall.y1) > ORTHO_EPSILON;
}

/** Whether each wall still has some length and still points the way it did. */
function wallsHold(before, after, wallIds) {
  return [...wallIds].every((wallId) => {
    const old = wallById(before, wallId);
    const moved = wallById(after, wallId);
    const oldDirection = subtract({ x: old.x2, y: old.y2 }, { x: old.x1, y: old.y1 });
    const newDirection = subtract({ x: moved.x2, y: moved.y2 }, { x: moved.x1, y: moved.y1 });
    return magnitude(newDirection) >= 1 && dot(oldDirection, newDirection) > 0;
  });
}
```

3. `moveWallPerpendicular`:
   - The JSDoc's first line becomes: "Move a wall along its interior normal. The wall keeps its angle. A square neighbour keeps its angle too and slides along the moved wall; an angled neighbour gives (SPEC-42.2): only the shared corner moves, so it changes angle and length. `keepAngle` lists walls that keep their angle even if angled."
   - Signature: `export function moveWallPerpendicular(room, wallId, delta, { keepAngle = [] } = {})`.
   - In the endpoint loop, before today's `if (connection && sourceNeighbor && movedNeighbor) {`, add a branch and make today's one an `else if`:

```js
    if (connection && sourceNeighbor && movedNeighbor
      && isAngledWall(sourceNeighbor) && !keepAngle.includes(sourceNeighbor.id)) {
      setEndpoint(movedNeighbor, connection.endpoint, point);
      affectedWallIds.add(sourceNeighbor.id);
    } else if (connection && sourceNeighbor && movedNeighbor) {
```

   (`point` is still `add(oldPoint, shift)` there.)
   - Replace the whole `for (const affectedWallId of affectedWallIds) { … }` check with:

```js
  if (!wallsHold(room.walls, next, affectedWallIds)) {
    return { ok: false, reason: 'neighbor-too-short', walls: room.walls };
  }
```

4. `setWallLength`:
   - JSDoc: "while preserving connected angles." becomes "A square neighbour moves square; an angled neighbour gives, so only the shared corner moves (SPEC-42.2)."
   - Right after the `if (!neighbor) { … }` block, add:

```js
  if (isAngledWall(neighbor)) {
    // An angled neighbour gives (SPEC-42.2): only the shared corner moves.
    const corner = add(endpointPoint(sourceWall, endpoint), scale(aOut, delta));
    const next = moveConnectedEndpoint(room.walls, wallId, endpoint, corner);
    return wallsHold(room.walls, next, [wallId, neighbor.id])
      ? { ok: true, reason: null, walls: next }
      : { ok: false, reason: 'neighbor-too-short', walls: room.walls };
  }
```

   - The last line becomes `return moveWallPerpendicular(room, neighbor.id, delta * projection, { keepAngle: [wallId] });`. A typed angled wall keeps its angle while its square neighbour moves.

Nothing else changes. The slice (`store/slices/walls.js`) and `usePlanWallEdits.js` call these as before. The option defaults, so their calls don't change.

**Tests.**

`src/elevation/plan/__tests__/wallOps.test.js` (199 lines), test 9:
- title → `'9. keeps the requested length at a 60-degree corner; the angled neighbor gives'`;
- replace its last two expects (`expect(afterB).toMatchObject({ x1: 132, y1: 0 });` and the `cross(…)).toBeCloseTo(0, 6)` line) with:

```js
    // SPEC-42.2: the angled neighbour gives; only the shared corner moves.
    expect(afterB).toMatchObject({ x1: 132, y1: 0, x2: beforeB.x2, y2: beforeB.y2 });
    expect(cross(beforeDirection, afterDirection)).not.toBeCloseTo(0, 6);
```

`src/elevation/plan/__tests__/wallMove.test.js` (141 lines), test 14:
- title → `'14. bends a 135-degree neighbor; a parallel one stays on its line'`;
- replace its three expects on `wallB.x1`, `wallB.y1` and `cross(…)` with:

```js
    // SPEC-42.2: an angled neighbour gives; its corner moves with A and its far end stays.
    expect(wallB).toMatchObject({ x1: 120, y1: 5, x2: oldB.x2, y2: oldB.y2 });
    expect(cross(oldDirection, newDirection)).not.toBeCloseTo(0, 6);
```

  (the `parallel` half of the test stays as is).

**NEW `src/elevation/plan/__tests__/angledWalls.test.js`**, verbatim:

```js
import { describe, expect, it } from 'vitest';
import {
  connectWallEndpoints,
  isAngledWall,
  moveWallPerpendicular,
  setWallLength,
} from '../wallOps.js';

function wall(id, x1, y1, x2, y2) {
  return { id, x1, y1, x2, y2, connections: { start: null, end: null } };
}

/** Kyle's room: a 120" square with its R/B corner cut by a 45° wall C (24" each way). */
function chamfered() {
  let walls = [
    wall('T', 0, 0, 120, 0),
    wall('R', 120, 0, 120, 96),
    wall('C', 120, 96, 96, 120),
    wall('B', 96, 120, 0, 120),
    wall('L', 0, 120, 0, 0),
  ];
  for (const [a, b] of [['T', 'R'], ['R', 'C'], ['C', 'B'], ['B', 'L'], ['L', 'T']]) {
    walls = connectWallEndpoints(walls, a, 'end', b, 'start');
  }
  return { walls };
}

/** Each wall as [id, x1, y1, x2, y2], to 4 places. */
const ends = (result) => result.walls.map(({ id, x1, y1, x2, y2 }) => (
  [id, ...[x1, y1, x2, y2].map((value) => Math.round(value * 1e4) / 1e4)]
));

describe('SPEC-42.2 an angled wall gives', () => {
  it('knows an angled wall from a square one', () => {
    expect(chamfered().walls.map(isAngledWall)).toEqual([false, false, true, false, false]);
  });

  it('a typed length next to an angled wall moves only the shared corner', () => {
    // R grows 12" toward C: C changes angle, B keeps its 96".
    expect(ends(setWallLength(chamfered(), 'R', 108, 'right'))).toEqual([
      ['T', 0, 0, 120, 0], ['R', 120, 0, 120, 108], ['C', 120, 108, 96, 120], ['B', 96, 120, 0, 120], ['L', 0, 120, 0, 0],
    ]);
    // B grows 12" toward C.
    expect(ends(setWallLength(chamfered(), 'B', 108, 'left'))).toEqual([
      ['T', 0, 0, 120, 0], ['R', 120, 0, 120, 96], ['C', 120, 96, 108, 120], ['B', 108, 120, 0, 120], ['L', 0, 120, 0, 0],
    ]);
  });

  it('a square neighbour still moves square; the angled wall past it gives', () => {
    // T grows 12" to the right: R moves out square, C changes angle, B keeps its 96".
    expect(ends(setWallLength(chamfered(), 'T', 132, 'right'))).toEqual([
      ['T', 0, 0, 132, 0], ['R', 132, 0, 132, 96], ['C', 132, 96, 96, 120], ['B', 96, 120, 0, 120], ['L', 0, 120, 0, 0],
    ]);
  });

  it('a typed angled wall keeps its angle; its square neighbours slide', () => {
    const result = setWallLength(chamfered(), 'C', 40, 'left');
    const [T, R, C] = result.walls;
    expect(result.ok).toBe(true);
    expect(T.x2).toBeCloseTo(124.284271, 5);
    expect([R.x1, R.x2, R.y2]).toEqual([T.x2, T.x2, C.y1]);
    expect(C.y1).toBeCloseTo(91.715729, 5);
    expect([C.x2, C.y2]).toEqual([96, 120]);
    expect(Math.hypot(C.x2 - C.x1, C.y2 - C.y1)).toBeCloseTo(40, 6);
  });

  it('dragging a wall bends an angled neighbour; dragging the angled wall keeps its angle', () => {
    // R dragged 12" in: T shortens, C changes angle, B keeps its 96".
    expect(ends(moveWallPerpendicular(chamfered(), 'R', 12))).toEqual([
      ['T', 0, 0, 108, 0], ['R', 108, 0, 108, 96], ['C', 108, 96, 96, 120], ['B', 96, 120, 0, 120], ['L', 0, 120, 0, 0],
    ]);
    // C dragged 6" in: R and B slide along their own lines; C stays at 45°.
    expect(ends(moveWallPerpendicular(chamfered(), 'C', 6))).toEqual([
      ['T', 0, 0, 120, 0], ['R', 120, 0, 120, 87.5147], ['C', 120, 87.5147, 87.5147, 120],
      ['B', 87.5147, 120, 0, 120], ['L', 0, 120, 0, 0],
    ]);
  });
});
```

**Count:** 895 + 5 = **900**. Golden snapshot unchanged.

---

## §3 Step 332 — geometry: `visible_regions`

**`src/projection/hlr.py`** (78 lines). Add above `hidden_line_removal`, as given:

```python
def visible_regions(shapes: list[HlrShape], ids: set[str]) -> dict[str, object]:
    """For each shape whose id is in `ids`: the part of its polygon no nearer opaque shape covers (SPEC-42.2)."""
    regions = {}
    for shape in shapes:
        if shape.id not in ids:
            continue
        nearer = [other.polygon for other in shapes if other.opaque and other.front > shape.front + EPSILON]
        regions[shape.id] = shape.polygon.difference(unary_union(nearer)) if nearer else shape.polygon
    return regions
```

Nothing else changes.

**`tests/test_hlr.py`** (141 lines): the import line becomes `from src.projection.hlr import HlrShape, hidden_line_removal, rect_polygon, visible_regions`, and append, verbatim:

```python


def test_visible_regions_leave_out_what_nearer_opaque_shapes_cover():
    shapes = [
        HlrShape("section", rect_polygon(0, 4, 24.875, 30.5), 138),
        HlrShape("box", rect_polygon(9.1875, 4, 48, 30.5), 24, is_box=True),
        HlrShape("post", rect_polygon(20, 0, 10, 40), 200),
        HlrShape("glass", rect_polygon(0, 0, 60, 50), 300, opaque=False),
    ]
    regions = visible_regions(shapes, {"section", "box"})
    assert set(regions) == {"section", "box"}
    assert regions["section"].area == pytest.approx(20 * 30.5)  # the post covers 20 to 24 7/8
    assert regions["box"].area == pytest.approx(27.1875 * 30.5)  # the section and the post cover it to 30
    assert visible_regions(shapes[:1], {"section"})["section"].area == pytest.approx(24.875 * 30.5)
```

**Count:** 28 + 1 = **29**.

---

## §4 Step 333 — geometry: `section` and `profile` kinds, hatching

**`src/drawing/models.py`** (78 lines): in `PayloadPart.kind`, after the `"wall_end_panel", …, "wing_wall",` line add a line `"section", "profile",`. Nothing else.

**`src/dxf/writer.py`** (105 lines): in `LAYER_DEFS`, after `OPENINGS`: `"SECTIONS":   (8, "CONTINUOUS"),`.

**`src/drawing/elevation_dxf.py`** (107 lines):
- Imports: `from shapely.geometry import Polygon` first (with a blank line after it), and `visible_regions` added to the `src.projection.hlr` import.
- `KIND_LAYERS` adds `"section": "SECTIONS"` and `"profile": "CABINETS"`.
- Below `KIND_LAYERS`, as given:

```python
# Kinds drawn hatched where they show (SPEC-42.2): a neighbour cut where it meets this wall face.
HATCHED = {"section"}
# ANSI31 lines are 1/8" apart at scale 1; 24 puts them 1/8" apart on paper at 1/2" = 1'-0".
HATCH_SCALE = 24
```

- Above `build_elevation_dxf`, as given:

```python
def _polygons(region) -> list:
    """The non-empty polygons in a shapely region (a Polygon, MultiPolygon or GeometryCollection)."""
    if isinstance(region, Polygon):
        return [] if region.is_empty else [region]
    return [part for geom in getattr(region, "geoms", []) for part in _polygons(geom)]


def _add_hatch(modelspace, layer, region) -> None:
    """One ANSI31 hatch per polygon of a region, holes included (SPEC-42.2)."""
    for polygon in _polygons(region):
        if polygon.area <= EPSILON:
            continue
        hatch = modelspace.add_hatch(dxfattribs={"layer": layer})
        hatch.set_pattern_fill("ANSI31", scale=HATCH_SCALE)
        hatch.paths.add_polyline_path(list(polygon.exterior.coords)[:-1], is_closed=True, flags=1)
        for ring in polygon.interiors:
            hatch.paths.add_polyline_path(list(ring.coords)[:-1], is_closed=True, flags=16)
```

- In `build_elevation_dxf`, right after the loop that writes each part's visible and hidden lines:

```python
    regions = visible_regions(shapes, {part.id for part in parts if part.kind in HATCHED})
    for part in parts:
        if part.id in regions:
            _add_hatch(modelspace, KIND_LAYERS[part.kind], regions[part.id])
```

**NEW `tests/fixtures/corners_payload.json`**, verbatim. It shows G1 elevation B in miniature: the blind box running into the corner behind wall A's base return (box and faces in section, its countertop an outline), this wall's countertop, and a neighbour run's profile past the right end:

```json
{
  "payloadVersion": 1,
  "units": "in",
  "room": { "id": "spec-42-2", "name": "Corner returns" },
  "elevations": [
    {
      "key": "wall-b", "letter": "B", "wallId": "wall-b",
      "side": "front", "title": "Elevation B", "wallLabel": "Wall 2", "length": 120, "height": 96,
      "parts": [
        {"id": "blind", "kind": "cabinet", "runId": "run-b", "x": 9.1875, "z": 4, "width": 48, "height": 30.5, "back": 0, "front": 24, "coversBoxEdges": false},
        {"id": "run-b:countertop", "kind": "countertop", "runId": "run-b", "x": 24.875, "z": 34.5, "width": 95.125, "height": 1.5, "back": 0, "front": 25.625, "coversBoxEdges": false},
        {"id": "left:wall-a:run-a:box", "kind": "section", "runId": "run-a", "x": 0, "z": 4, "width": 24, "height": 30.5, "back": 24.875, "front": 138, "coversBoxEdges": false},
        {"id": "left:wall-a:run-a:faces", "kind": "section", "runId": "run-a", "x": 24, "z": 4, "width": 0.875, "height": 30.5, "back": 24.875, "front": 138, "coversBoxEdges": false},
        {"id": "left:wall-a:run-a:countertop", "kind": "countertop", "runId": "run-a", "x": 0, "z": 34.5, "width": 25.625, "height": 1.5, "back": 24.875, "front": 138, "coversBoxEdges": false, "opaque": false},
        {"id": "wall-c:back:run-c:right:toe_kick", "kind": "toe_kick", "runId": "run-c", "x": 120, "z": 0, "width": 21, "height": 4, "back": 0, "front": 77.75, "coversBoxEdges": false},
        {"id": "wall-c:back:run-c:right:box", "kind": "profile", "runId": "run-c", "x": 120, "z": 4, "width": 24, "height": 30.5, "back": 0, "front": 77.75, "coversBoxEdges": false}
      ]
    }
  ]
}
```

**NEW `tests/test_elevation_corners.py`** (3 tests), verbatim:

```python
"""Corner returns in section and neighbour profiles (SPEC-42.2)."""

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
PAYLOAD = json.loads((ROOT / "tests" / "fixtures" / "corners_payload.json").read_text())


def _archive(payload):
    return zipfile.ZipFile(io.BytesIO(base64.b64decode(draw(payload)["zip_base64"])))


def _modelspace(payload):
    dxf = _archive(payload).read("elevation-B.dxf").decode("utf-8")
    return ezdxf.read(io.StringIO(dxf)).modelspace()


def _lines(msp, layer):
    return list(msp.query(f'LINE[layer=="{layer}"]'))


def _length(lines):
    return sum(line.dxf.start.distance(line.dxf.end) for line in lines)


def _hatch_areas(msp):
    return [
        Polygon([vertex[:2] for vertex in hatch.paths.paths[0].vertices]).area
        for hatch in msp.query('HATCH[layer=="SECTIONS"]')
    ]


def test_sections_are_outlined_and_hatched_on_sections():
    msp = _modelspace(PAYLOAD)
    assert len(_lines(msp, "SECTIONS")) == 8
    assert _length(_lines(msp, "SECTIONS")) == pytest.approx(171.75)
    hatches = list(msp.query("HATCH"))
    assert [(hatch.dxf.layer, hatch.dxf.pattern_name, hatch.dxf.pattern_scale) for hatch in hatches] == [
        ("SECTIONS", "ANSI31", 24), ("SECTIONS", "ANSI31", 24),
    ]
    assert _hatch_areas(msp) == pytest.approx([732, 26.6875])


def test_a_section_hides_the_blind_box_behind_it_and_its_bands_hide_nothing():
    msp = _modelspace(PAYLOAD)
    hidden = _lines(msp, "HIDDEN")
    assert len(hidden) == 1  # the blind box's end, in the corner behind the return
    assert [hidden[0].dxf.start.x, hidden[0].dxf.end.x] == pytest.approx([9.1875, 9.1875])
    assert sorted([hidden[0].dxf.start.y, hidden[0].dxf.end.y]) == pytest.approx([4, 34.5])
    # Both countertops whole: the return's countertop is an outline (opaque: false).
    assert _length(_lines(msp, "COUNTERTOPS")) == pytest.approx(247.5)
    # The blind box's visible edges plus the profile's 24 x 30 1/2 box past the wall end.
    assert _length(_lines(msp, "CABINETS")) == pytest.approx(62.8125 + 109)
    assert _length(_lines(msp, "MOLDINGS")) == pytest.approx(50)


def test_only_the_visible_part_of_a_section_is_hatched_and_kinds_are_checked():
    covered = copy.deepcopy(PAYLOAD)
    covered["elevations"][0]["parts"].append({
        "id": "post", "kind": "panel", "x": 20, "z": 0, "width": 10, "height": 40,
        "back": 0, "front": 200, "coversBoxEdges": False,
    })
    assert _hatch_areas(_modelspace(covered)) == pytest.approx([20 * 30.5])  # the faces are covered
    stored = json.loads(_archive(PAYLOAD).read("payload.json"))
    assert stored == PAYLOAD
    bad = copy.deepcopy(PAYLOAD)
    bad["elevations"][0]["parts"][2]["kind"] = "return"
    with pytest.raises(ValidationError):
        draw(bad)
```

(The blind box shows 62 13/16" of edge. Its top lies on the countertop's bottom edge, as in round 42, and its end and the two 15 11/16" stretches of top and bottom sit inside the section. Only the end is dashed, because the other two lie on the section's outline.)

**`README.md`** (66 lines): Layers table rows `section` → `SECTIONS` and `profile` → `CABINETS` (add `profile` to the `cabinet` row). Add one sentence after the SPEC-42.1 one: "A `section` is a neighbour cut where it meets this wall face: outlined and hatched (ANSI31) where it shows; a `profile` is a neighbour seen from the side (SPEC-42.2)."

**Count:** 29 + 3 = **32**. Everything from rounds 40–42.1 still passes.

---

## §5 Step 334 — designer: `runSide`

**`src/elevation/model/runBands.js`** (158 lines): `function hasToeKick(run)` → `export function hasToeKick(run)`. Nothing else.

**NEW `src/elevation/model/runSide.js`**, as given:

```js
import { frontDepth, runBackOffset } from './corners.js';
import { resolveProfile } from './profile.js';
import { bandDepths, hasToeKick } from './runBands.js';
import { isCountertop, runTop } from './tops.js';

const EPSILON = 1e-6;

/**
 * A run seen from its side (SPEC-42.2): its toe kick, box, faces, then its countertop or its top mold and
 * crown, each as { piece, z, height, back, front } with back and front measured from the run's wall face
 * (the plan view's numbers). The placeholder shape until profiles: the toe kick sits back from the box by
 * its setback, the faces stand off the box (doors and bumper, or the frame), a top runs past the faces by
 * its overhang or projection, and the top mold stops under the crown. `wall` is the run's resolved face.
 */
export function runSide(room, wall, run, settings) {
  const profile = resolveProfile(settings, room, wall);
  const depths = bandDepths(settings);
  const top = runTop(wall, run, profile);
  const back = runBackOffset(run);
  const boxFront = back + run.depth;
  const faces = frontDepth(run, settings);
  const boxTop = run.z + run.height;
  const crownZ = boxTop + profile.crownStackHeight - profile.crownHeight;
  const toeKickHeight = run.overrides?.toeKickHeight ?? profile.toeKickHeight;
  const pieces = [];
  const add = (piece, z, height, from, to) => {
    if (height > EPSILON && to - from > EPSILON) pieces.push({ piece, z, height, back: from, front: to });
  };

  if (hasToeKick(run)) add('toe_kick', 0, toeKickHeight, back, boxFront - depths.toeKickSetback);
  add('box', run.z, run.height, back, boxFront);
  add('faces', run.z, run.height, boxFront, faces);
  if (isCountertop(top.kind)) add('countertop', boxTop, top.height, back, faces + depths.countertopOverhang);
  if (top.kind === 'crown' || top.kind === 'topMold') {
    const height = top.kind === 'crown'
      ? Math.min(profile.topMoldHeight, crownZ - boxTop)
      : profile.topMoldHeight;
    add('top_mold', boxTop, height, back, faces + depths.topMoldProjection);
  }
  if (top.kind === 'crown') add('crown', crownZ, profile.crownHeight, back, faces + depths.crownProjection);
  return pieces;
}
```

`model/index.js` (402 lines), one line at the end: `export { runSide } from './runSide.js';`.

**NEW `src/elevation/model/__tests__/runSide.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runSide } from '../runSide.js';
import { resolveWall, syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;

/** runSide of the run whose id starts with `prefix`, on one wall face of a golden room, as rows. */
function sideOf(name, wallIndex, prefix, side = 'front') {
  const room = syncRoom(document.rooms.find((candidate) => candidate.name === name), settings);
  const view = resolveWall(room, room.walls[wallIndex], side);
  const run = view.runs.find(({ id }) => id.startsWith(prefix));
  return runSide(room, view, run, settings).map(({ piece, z, height, back, front }) => [piece, z, height, back, front]);
}

describe('SPEC-42.2 a run seen from its side', () => {
  it('gives the toe kick, box, faces and top with their depths from the wall face (G1 elevation A)', () => {
    // The tall: crown over a top mold that stops under it.
    expect(sideOf('G1 Euro kitchen', 0, 'b38f2f11')).toEqual([
      ['toe_kick', 0, 4, 0, 22],
      ['box', 4, 86, 0, 25],
      ['faces', 4, 86, 25, 25.875],
      ['top_mold', 90, 1.5, 0, 26.125],
      ['crown', 91.5, 4.5, 0, 28.875],
    ]);
    expect(sideOf('G1 Euro kitchen', 0, 'b822e8ac')).toEqual([
      ['toe_kick', 0, 4, 0, 21],
      ['box', 4, 30.5, 0, 24],
      ['faces', 4, 30.5, 24, 24.875],
      ['countertop', 34.5, 1.5, 0, 25.625],
    ]);
    // An upper has no toe kick.
    expect(sideOf('G1 Euro kitchen', 0, '434f1164').map(([piece]) => piece))
      .toEqual(['box', 'faces', 'top_mold', 'crown']);
  });

  it('a face frame stands 13/16 off the box; a panel-only run has no faces (G2)', () => {
    expect(sideOf('G2 Face frame kitchen', 0, 'a42e9a57')[2]).toEqual(['faces', 4, 86, 25, 25.8125]);
    expect(sideOf('G2 Face frame kitchen', 1, '2c8ab1e3', 'back')).toEqual([
      ['toe_kick', 0, 4, 0, 21],
      ['box', 4, 30.5, 0, 24],
      ['countertop', 34.5, 1.5, 0, 24.75],
    ]);
  });

  it('moves out with an outset run and back into a recess; a run with no top is only its box (G5, G6)', () => {
    expect(sideOf('G6 Stacked runs', 1, '01a2a0e1')).toEqual([
      ['toe_kick', 0, 4, 8, 29],
      ['box', 4, 30.5, 8, 32],
      ['faces', 4, 30.5, 32, 32.875],
      ['countertop', 34.5, 1.5, 8, 33.625],
    ]);
    expect(sideOf('G5 Recess room', 1, 'e9abb5dc')[1]).toEqual(['box', 4, 30.5, -24, -3]);
    expect(sideOf('G6 Stacked runs', 1, 'b1ec1b4a')).toEqual([['box', 36, 16.5, 0, 12]]);
  });
});
```

**Count:** 900 + 3 = **903**. Golden snapshot unchanged.

---

## §6 Step 335 — designer: `cornerShapes` and `cornerParts`, returns

**NEW `src/elevation/model/cornerParts.js`**, as given. Step 336 adds the profiles where this one has `return shapes;`.

```js
import { anchoredToCorner, cornerAt, spanCorner } from './corners.js';
import { dot, elevationToPlan, subtract } from './geometry.js';
import { landingsOn } from './landings.js';
import { resolveWall } from './room.js';
import { runSide } from './runSide.js';
import { soffitReturns } from './soffits.js';
import { wallSideFrame, wallSideView } from './wallSides.js';

const EPSILON = 1e-6;
const BODY = new Set(['box', 'faces']);

/**
 * What a wall face sees of its neighbours (SPEC-42.2), as shapes of drawing parts:
 * - returns: the runs on the next wall (or on a wing wall) anchored into this face's inside corner, and the
 *   soffits that die into it, cut where they meet this face. Their box and faces are `section` parts.
 * - profiles: runs on a connected wall that reach past this face's ends, seen from the side. Their box and
 *   faces are `profile` parts.
 * A run's toe kick, countertop, top mold and crown keep their band kinds. Each shape is
 * { key, kind: 'return' | 'profile', wallId, runId?, soffitId?, parts }; parts carry their depths from this face.
 */
export function cornerShapes(room, wall, side, settings) {
  const view = resolveWall(room, wall, side);
  const source = view.sideSource ?? view;
  const frame = wallSideFrame(room, source, view.side);
  const length = view.length;
  const depthOf = (point) => dot(subtract(point, frame.leftPoint), frame.n);
  const shapes = [];

  /** A neighbour run's pieces, cut at this face: `xOf(offset)` maps a depth on its wall to x here. */
  const cut = (key, neighbor, neighborView, neighborFrame, run, xOf) => {
    const ends = [run.x, run.x + run.width];
    const parts = runSide(room, neighborView, run, settings).flatMap((piece) => {
      const xs = [xOf(piece.back), xOf(piece.front)].map((x) => Math.min(length, Math.max(0, x)));
      const depths = ends.flatMap((x) => [piece.back, piece.front]
        .map((offset) => depthOf(elevationToPlan(neighborFrame, x, offset))));
      const x = Math.min(...xs);
      const width = Math.max(...xs) - x;
      if (width <= EPSILON) return [];
      return [{
        id: `${key}:${piece.piece}`,
        kind: BODY.has(piece.piece) ? 'section' : piece.piece,
        runId: run.id,
        x, z: piece.z, width, height: piece.height,
        back: Math.min(...depths), front: Math.max(...depths),
        coversBoxEdges: false,
        ...(BODY.has(piece.piece) ? {} : { opaque: false }),
      }];
    });
    if (parts.length > 0) shapes.push({ key, kind: 'return', wallId: neighbor.id, runId: run.id, parts });
  };

  for (const end of ['left', 'right']) {
    const corner = cornerAt(room, view, end);
    if (corner.type !== 'inside') continue;
    const neighbor = room.walls.find((candidate) => candidate.id === corner.neighborWallId);
    const sine = Math.sin(corner.angle * Math.PI / 180);
    if (!neighbor || Math.abs(sine) < 1e-9) continue;
    const neighborView = wallSideView(neighbor, corner.neighborWallSide);
    const neighborFrame = wallSideFrame(room, neighbor, corner.neighborWallSide);
    for (const run of neighborView.runs) {
      if (!anchoredToCorner(run.anchors?.[corner.neighborSide], corner) || run.height <= 0) continue;
      cut(`${end}:${neighbor.id}:${run.id}`, neighbor, neighborView, neighborFrame, run,
        (offset) => (end === 'left' ? offset / sine : length - offset / sine));
    }
  }

  for (const { wallId, a, b } of landingsOn(room, view)) {
    const landed = room.walls.find((candidate) => candidate.id === wallId);
    if (!landed) continue;
    for (const end of ['left', 'right']) {
      const corner = spanCorner(room, view, { wallSide: view.side, anchors: { [end]: { to: 'wall', wallId } } }, end);
      const sine = Math.sin(corner.angle * Math.PI / 180);
      if (corner.type !== 'inside' || Math.abs(sine) < 1e-9) continue;
      const landedView = wallSideView(landed, corner.neighborWallSide);
      const landedFrame = wallSideFrame(room, landed, corner.neighborWallSide);
      for (const run of landedView.runs) {
        if (run.anchors?.[corner.neighborSide] !== true || run.height <= 0) continue;
        cut(`landing:${wallId}:${end}:${run.id}`, landed, landedView, landedFrame, run,
          (offset) => (end === 'left' ? b + offset / sine : a - offset / sine));
      }
    }
  }

  for (const entry of soffitReturns(room, view)) {
    const soffit = room.walls.find((candidate) => candidate.id === entry.wallId)
      ?.soffits?.find((candidate) => candidate.id === entry.soffitId);
    shapes.push({
      key: `soffit:${entry.key}`,
      kind: 'return',
      wallId: entry.wallId,
      soffitId: entry.soffitId,
      parts: [{
        id: `soffit:${entry.key}`, kind: 'section',
        x: entry.x, z: entry.bottom, width: entry.width, height: entry.top - entry.bottom,
        back: 0, front: soffit?.width ?? entry.width,
        coversBoxEdges: false,
      }],
    });
  }

  return shapes;
}

/** The parts of cornerShapes, in order: what the payload carries for this face's neighbours (SPEC-42.2). */
export function cornerParts(room, wall, side, settings) {
  return cornerShapes(room, wall, side, settings).flatMap((shape) => shape.parts);
}
```

Notes:
- The corner and landing loops are the same tests `NeighborReturns.jsx` makes today: `anchoredToCorner` at a connected inside corner, `anchors[side] === true` on a wing wall. The x mapping is the canvas's `depth / sine`, measured from the corner (left), back from the wall end (right), or from the wing wall's face (`a`, `b`).
- The `faces` piece is missing on a panel-only run, because `runSide` leaves out pieces with no depth.

`model/index.js`, one line at the end: `export { cornerParts, cornerShapes } from './cornerParts.js';`.

**NEW `src/elevation/model/__tests__/cornerParts.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cornerParts, cornerShapes } from '../cornerParts.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);
const room = (name) => syncRoom(stored(name), settings);
const partsOf = (synced, wallIndex, side = 'front') => cornerParts(synced, synced.walls[wallIndex], side, settings);
const shapesOf = (synced, wallIndex, side = 'front') => cornerShapes(synced, synced.walls[wallIndex], side, settings);
/** A part as [last id segment, kind, x, z, width, height, back, front, opaque]. */
const row = (part) => [
  part.id.split(':').pop(), part.kind, part.x, part.z, part.width, part.height, part.back, part.front,
  part.opaque ?? true,
];

const G1_A = 'cb33d774-f31e-41c1-bbe4-198cbf981619';
const G3_HOST = '6d7021c6-5293-4d11-ae7f-47086e301920';
const G3_WING = '5ab00c5d-9ea6-4d32-9586-d266db26a4d2';

describe('SPEC-42.2 corner returns', () => {
  it('cuts the next wall\'s runs where they meet this face: box and faces hatched, bands outlined (G1 elevation B)', () => {
    const shapes = shapesOf(room('G1 Euro kitchen'), 1);
    expect(shapes.map(({ key, kind, wallId }) => [key, kind, wallId])).toEqual([
      [`left:${G1_A}:b822e8ac-1a44-47ca-acec-ecb93caf7b8a`, 'return', G1_A],
      [`left:${G1_A}:434f1164-3b6b-4a97-89e7-1c6438c4d95a`, 'return', G1_A],
    ]);
    expect(shapes[0].parts.map(row)).toEqual([
      ['toe_kick', 'toe_kick', 0, 0, 21, 4, 24.875, 138, false],
      ['box', 'section', 0, 4, 24, 30.5, 24.875, 138, true],
      ['faces', 'section', 24, 4, 0.875, 30.5, 24.875, 138, true],
      ['countertop', 'countertop', 0, 34.5, 25.625, 1.5, 24.875, 138, false],
    ]);
    expect(shapes[1].parts.map(row)).toEqual([
      ['box', 'section', 0, 54, 12, 36, 12.875, 59.5, true],
      ['faces', 'section', 12, 54, 0.875, 36, 12.875, 59.5, true],
      ['top_mold', 'top_mold', 0, 90, 13.125, 1.5, 12.875, 59.5, false],
      ['crown', 'crown', 0, 91.5, 15.875, 4.5, 12.875, 59.5, false],
    ]);
    expect(shapes[0].parts[1]).toEqual({
      id: `left:${G1_A}:b822e8ac-1a44-47ca-acec-ecb93caf7b8a:box`, kind: 'section',
      runId: 'b822e8ac-1a44-47ca-acec-ecb93caf7b8a',
      x: 0, z: 4, width: 24, height: 30.5, back: 24.875, front: 138, coversBoxEdges: false,
    });
  });

  it('a right-hand corner measures back from the wall end; a soffit that dies in is one section (G3)', () => {
    const shapes = shapesOf(room('G3 Bath alcove'), 0);
    expect(shapes.map(({ kind, wallId, soffitId }) => [kind, wallId, soffitId])).toEqual([
      ['return', G3_HOST, undefined],
      ['return', G3_HOST, undefined],
      ['return', G3_HOST, '5ac8edd3-2c75-476d-bc64-f80ade3f5fba'],
    ]);
    expect(partsOf(room('G3 Bath alcove'), 0).map(row)).toEqual([
      ['toe_kick', 'toe_kick', 12, 0, 18, 4, 0, 72, false],
      ['box', 'section', 9, 4, 21, 30.5, 0, 72, true],
      ['faces', 'section', 8.125, 4, 0.875, 30.5, 0, 72, true],
      ['countertop', 'countertop', 7.375, 34.5, 22.625, 1.5, 0, 72, false],
      ['box', 'section', 6, 36, 24, 42, 0, 72, true],
      ['top_mold', 'top_mold', 5.75, 78, 24.25, 1.5, 0, 72, false],
      ['crown', 'crown', 3, 79.5, 27, 4.5, 0, 72, false],
      ['5ac8edd3-2c75-476d-bc64-f80ade3f5fba', 'section', 16, 84, 14, 12, 0, 72, true],
    ]);
    expect(shapes[2].parts[0].id).toBe(`soffit:right:${G3_HOST}:5ac8edd3-2c75-476d-bc64-f80ade3f5fba`);
  });

  it('cuts a wing wall\'s run anchored into the host face, from the wing wall\'s side (G3)', () => {
    const copy = structuredClone(stored('G3 Bath alcove'));
    const base = structuredClone(copy.walls[1].runs[0]);
    copy.walls[2].runs = [{ ...base, id: 'wing-base', x: 0, width: 24, wallSide: 'back', anchors: { right: true } }];
    const shapes = shapesOf(syncRoom(copy, settings), 1);
    expect(shapes.map(({ key }) => key)).toEqual([`landing:${G3_WING}:left:wing-base`]);
    expect(shapes[0].parts.map(row)).toEqual([
      ['toe_kick', 'toe_kick', 76.5, 0, 18, 4, 0, 24, false],
      ['box', 'section', 76.5, 4, 21, 30.5, 0, 24, true],
      ['faces', 'section', 97.5, 4, 0.875, 30.5, 0, 24, true],
      ['countertop', 'countertop', 76.5, 34.5, 22.625, 1.5, 0, 24, false],
    ]);
  });
});
```

What the cases show: in G1 B, wall A's base and upper return into the left corner from 24 7/8" and 12 7/8" out (they stop at the front of B's blind box and B's upper). G3 wall 1 (30" long) gets wall 2's base, its panel-run upper (no faces) and the soffit. The third case puts a base on the wing wall's back face, anchored into the host. It returns on the host's far side of the wing wall (x from 76.5).

**Count:** 903 + 3 = **906**. Golden snapshot unchanged.

---

## §7 Step 336 — designer: profiles past the wall's ends

In **`src/elevation/model/cornerParts.js`**:
- Imports: add `planPointToWallX` to the geometry import (`dot, elevationToPlan, planPointToWallX, subtract`), and `WALL_SIDES` to the wallSides import (`WALL_SIDES, wallSideFrame, wallSideView`).
- Replace `  return shapes;` (the last line of `cornerShapes`) with, as given:

```js
  const profiles = [];
  const handled = new Set();
  for (const endpoint of ['start', 'end']) {
    const neighbor = room.walls.find((candidate) => candidate.id === source.connections?.[endpoint]?.wallId);
    if (!neighbor || handled.has(neighbor.id)) continue;
    handled.add(neighbor.id);
    for (const neighborSide of WALL_SIDES) {
      const neighborView = wallSideView(neighbor, neighborSide);
      const neighborFrame = wallSideFrame(room, neighbor, neighborSide);
      // A run in the neighbour's recess sits behind its face: this face never sees it.
      for (const run of neighborView.runs.filter((candidate) => !candidate.recessId)) {
        const pieces = runSide(room, neighborView, run, settings);
        const project = (piece) => [run.x, run.x + run.width].flatMap((x) => [piece.back, piece.front]
          .map((offset) => elevationToPlan(neighborFrame, x, offset)));
        const body = pieces.filter((piece) => BODY.has(piece.piece)).flatMap(project);
        if (body.length === 0 || Math.max(...body.map(depthOf)) <= EPSILON) continue;
        const bodyStart = Math.min(...body.map((point) => planPointToWallX(frame, point)));
        for (const past of ['left', 'right']) {
          const key = `${neighbor.id}:${neighborSide}:${run.id}:${past}`;
          const parts = pieces.flatMap((piece) => {
            const points = project(piece);
            const xs = points.map((point) => planPointToWallX(frame, point));
            const start = past === 'left' ? Math.min(...xs) : Math.max(Math.min(...xs), length);
            const finish = past === 'left' ? Math.min(Math.max(...xs), 0) : Math.max(...xs);
            if (finish - start <= EPSILON) return [];
            const depths = points.map(depthOf);
            return [{
              id: `${key}:${piece.piece}`,
              kind: BODY.has(piece.piece) ? 'profile' : piece.piece,
              runId: run.id,
              x: start, z: piece.z, width: finish - start, height: piece.height,
              back: Math.min(...depths), front: Math.max(...depths),
              coversBoxEdges: false,
            }];
          });
          if (parts.length === 0) continue;
          profiles.push({
            at: past === 'left' ? bodyStart : Math.max(bodyStart, length),
            z: run.z,
            shape: { key, kind: 'profile', wallId: neighbor.id, runId: run.id, parts },
          });
        }
      }
    }
  }
  profiles.sort((a, b) => a.at - b.at || a.z - b.z);
  return [...shapes, ...profiles.map(({ shape }) => shape)];
```

This is `neighborProfiles`' loop (the same neighbours, the same "in front of this face" test, the same clipping to beyond each end, sorted by where the run starts, then by height) with three changes. Each piece of the side shape is projected and clipped on its own. Recess runs are skipped. Profile parts keep `opaque` (they hide what's behind them). Don't change `neighborProfiles.js`.

**NEW `src/elevation/model/__tests__/cornerProfiles.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cornerShapes } from '../cornerParts.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const room = (name) => syncRoom(document.rooms.find((candidate) => candidate.name === name), settings);
const shapesOf = (synced, wallIndex) => cornerShapes(synced, synced.walls[wallIndex], 'front', settings);
const row = (part) => [part.id.split(':').pop(), part.kind, part.x, part.z, part.width, part.height, part.back, part.front];

const PENINSULA = '64da569f-6c94-408d-809a-37c6e1f9755f';
const BACK_RUN = '2c8ab1e3-3bad-4a28-bb80-24ee4df20b81';

describe('SPEC-42.2 neighbour profiles', () => {
  it('draws a run that reaches past this face\'s end from its side, after the returns (G2 elevation A)', () => {
    const shapes = shapesOf(room('G2 Face frame kitchen'), 0);
    expect(shapes.map(({ kind }) => kind)).toEqual(['return', 'profile']);
    expect(shapes[1]).toMatchObject({ key: `${PENINSULA}:back:${BACK_RUN}:right`, wallId: PENINSULA, runId: BACK_RUN });
    expect(shapes[1].parts.map(row)).toEqual([
      ['toe_kick', 'toe_kick', 172, 0, 21, 4, 0, 77.75],
      ['box', 'profile', 172, 4, 24, 30.5, 0, 77.75],
      ['countertop', 'countertop', 172, 34.5, 24.75, 1.5, 0, 77.75],
    ]);
    expect(shapes[1].parts.every((part) => !('opaque' in part))).toBe(true);
  });

  it('never sees a run in the neighbour\'s recess; a neighbour inside the wall\'s length is only a return (G5, G1)', () => {
    expect(shapesOf(room('G5 Recess room'), 0).map(({ kind }) => kind)).toEqual(['return']);
    expect(shapesOf(room('G5 Recess room'), 2)).toEqual([]);
    expect(shapesOf(room('G1 Euro kitchen'), 0).map(({ kind }) => kind)).toEqual(['return', 'return']);
  });
});
```

(G2 A's profile is the peninsula's back-face panel run: past A's right end, a 24" box, a toe kick to 21", and a countertop 3/4" past the panel. G5's walls 1 and 3 used to show its recess runs past their ends. They no longer do.)

**Count:** 906 + 2 = **908**. Golden snapshot unchanged.

---

## §8 Step 337 — designer: the payload carries the neighbours

**`src/elevation/model/drawingPayload.js`** (52 lines): `import { cornerParts } from './cornerParts.js';` after the `wallParts` import. Parts become `[...elevationParts(…), ...bandParts(…), ...wallParts(…), ...cornerParts(room, wall, side, settings)]`. In the doc comment, "42.1 the wall's own parts." becomes "42.1 the wall's own parts; 42.2 its neighbours (corner returns and profiles)." `DRAWING_PAYLOAD_VERSION` stays 1.

**`src/elevation/model/__tests__/drawingPayload.test.js`** (76 lines):
- add `import { cornerParts } from '../cornerParts.js';` after the `wallParts` import;
- the last test: title → `'SPEC-42.2 carries each wall face\'s parts, its bands, the wall\'s own parts, then its neighbours'`, counts `[32, 26, 13, 13]` → `[40, 34, 13, 13]`, and `...cornerParts(synced, wall, elevation.side, settings),` after the `wallParts` line in the expected array.

**Count:** stays **908**. Golden snapshot unchanged.

---

## §9 Step 338 — designer: the canvas draws from `cornerShapes`

**Replace `src/elevation/components/NeighborReturns.jsx`** (166 lines) with, as given:

```jsx
import {
  Group,
  Line,
  Rect,
  Text,
} from 'react-konva';
import { wallRectToScreen, wallToScreen } from '../canvas/transform.js';
import { cornerShapes } from '../model/cornerParts.js';
import { landingsOn } from '../model/landings.js';
import { soffitSeams } from '../model/soffits.js';
import { wallLabel } from '../model/topology.js';
import Hatch from './Hatch.jsx';

/**
 * What this face sees of its neighbours at its corners and wing walls (SPEC-42.2): each return from
 * cornerShapes (sections hatched, their bands outlined) with its wall's label, and each wing wall's outline.
 */
export default function NeighborReturns({ room, wall, settings, transform }) {
  const seams = soffitSeams(room, wall);
  const returns = cornerShapes(room, wall, wall.side ?? 'front', settings)
    .filter((shape) => shape.kind === 'return')
    .map((shape) => {
      const neighbor = room.walls.find((candidate) => candidate.id === shape.wallId);
      const name = neighbor ? wallLabel(room, neighbor) : '';
      const label = shape.soffitId ? `${name} soffit`.trim() : name;
      const parts = shape.parts.map((part) => ({ ...part, rect: wallRectToScreen(part, transform) }));
      const labelPart = parts.find((part) => part.kind === 'section') ?? parts[0];
      return { key: shape.key, label, parts, labelRect: labelPart.rect };
    });

  const landings = landingsOn(room, wall).flatMap(({ wallId, a, b }) => {
    const landedWall = room.walls.find((candidate) => candidate.id === wallId);
    if (!landedWall) return [];
    const verticalEdge = (x) => {
      const seam = seams.find((candidate) => (
        candidate.wallId === wallId && Math.abs(candidate.x - x) <= 1e-6
      ));
      return [{ x, z: 0 }, { x, z: seam?.bottom ?? landedWall.height }];
    };
    return [{
      key: `landing:${wallId}:${a}:${b}`,
      label: wallLabel(room, landedWall),
      rect: wallRectToScreen({ x: a, z: 0, width: b - a, height: landedWall.height }, transform),
      edges: [
        [{ x: a, z: 0 }, { x: b, z: 0 }],
        [{ x: a, z: landedWall.height }, { x: b, z: landedWall.height }],
        verticalEdge(a),
        verticalEdge(b),
      ],
    }];
  });

  return (
    <>
      {returns.map((entry) => (
        <Group key={entry.key} listening={false}>
          {entry.parts.map((part) => (part.kind === 'section' ? (
            <Group key={part.id} listening={false}>
              <Rect
                {...part.rect}
                fill="#475569"
                opacity={0.26}
                stroke="#94a3b8"
                strokeWidth={1.5}
                listening={false}
              />
              <Hatch rect={part.rect} />
            </Group>
          ) : (
            <Rect
              key={part.id}
              {...part.rect}
              stroke="#94a3b8"
              strokeWidth={1}
              listening={false}
            />
          )))}
          <Text
            {...entry.labelRect}
            text={entry.label}
            align="center"
            verticalAlign="middle"
            fontSize={10}
            fill="#e2e8f0"
            listening={false}
          />
        </Group>
      ))}
      {landings.map((entry) => (
        <Group key={entry.key} listening={false}>
          {entry.edges.map(([start, end]) => {
            const screenStart = wallToScreen(start, transform);
            const screenEnd = wallToScreen(end, transform);
            return (
              <Line
                key={`${start.x}:${start.z}:${end.x}:${end.z}`}
                points={[screenStart.x, screenStart.y, screenEnd.x, screenEnd.y]}
                stroke="#94a3b8"
                strokeWidth={1.5}
                listening={false}
              />
            );
          })}
          <Text
            {...entry.rect}
            text={entry.label}
            align="center"
            verticalAlign="middle"
            fontSize={10}
            fill="#e2e8f0"
            listening={false}
          />
        </Group>
      ))}
    </>
  );
}
```

**Replace `src/elevation/components/NeighborProfiles.jsx`** (31 lines) with, as given:

```jsx
import { Group, Rect } from 'react-konva';
import { wallRectToScreen } from '../canvas/transform.js';
import { cornerShapes } from '../model/cornerParts.js';

const PART_STYLES = {
  profile: { stroke: '#64748b' },
  toe_kick: { fill: '#111827', opacity: 1, stroke: '#334155' },
  countertop: { fill: '#9ca3af', opacity: 0.55, stroke: '#cbd5e1' },
  top_mold: { fill: '#94a3b8', opacity: 0.55, stroke: '#cbd5e1' },
  crown: { fill: '#e2e8f0', opacity: 0.5, stroke: '#f8fafc' },
};

/** Runs on a connected wall that reach past this face's ends, seen from the side (SPEC-42.2). */
export default function NeighborProfiles({ room, wall, settings, transform }) {
  return cornerShapes(room, wall, wall.side ?? 'front', settings)
    .filter((shape) => shape.kind === 'profile')
    .map((shape) => (
      <Group key={shape.key} listening={false}>
        {shape.parts.map((part) => (
          <Rect
            key={part.id}
            {...wallRectToScreen(part, transform)}
            {...PART_STYLES[part.kind]}
            strokeWidth={1}
            listening={false}
          />
        ))}
      </Group>
    ));
}
```

`ElevationCanvas.jsx` already renders both with `room`, `wall`, `settings` and `transform`, so it doesn't change. No new tests: the shapes are covered in steps 335–336.

**Count:** stays **908**. Gate: `npm test && npm run lint && npm run build`.

**What you'll see:** each return now shows its true side. The box and the 7/8" door strip are hatched, the toe kick notch is under it, and the countertop or crown is outlined past the faces, where before there was one hatched rectangle. The label sits in the box. Profiles past a wall end show the toe kick notch, faces and top the same way. G5's recess runs no longer show past walls 1 and 3.

---

## End-to-end check (Kyle)

Geometry on `feature/drawing` with 332–333 in. Start the API and designer as in round 42.

**Plan (after 331):** draw a square room and cut one corner with an angled wall, or open your 5-wall room.
- Type a new length on a side wall next to the angled wall, growing toward it. The angled wall changes angle, and the wall on its other side keeps its length.
- Lengthen the opposite square wall. The side wall moves out square, and the angled wall changes angle.
- Type the angled wall's own length. It stays at its angle, and the two side walls change length.
- Drag a side wall: the angled wall bends. Drag the angled wall: it keeps its angle.

**Export DXF:**
- **G1 B:** wall A's base and upper in section at the left corner, hatched on SECTIONS, with the countertop, top mold and crown outlined over them. The blind box's end is dashed behind the base return. This was the last "expected for now" item from 42.1.
- **G1 A:** wall B's base and upper in section at the right corner.
- **G2 A:** the peninsula's base in section at the right, and its back-face panel run in profile past the right end (toe kick notch, countertop 3/4" past).
- **G2 B:** wall A's base and upper in section at the left.
- HIDDEN shows nothing new except the G1 B blind box's end.

**Known for now:** returns at a corner that isn't 90° are still rectangles cut at the face, as on the canvas. A soffit return's depth is a placeholder (it only matters for what it hides). The canvas's reach dimensions and extent still use `neighborProfiles` (round 43).
