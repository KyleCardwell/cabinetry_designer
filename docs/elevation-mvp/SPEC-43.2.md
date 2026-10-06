# Round 43.2 — SPEC: vertical dimensions and counter height

Steps 351–352. Geometry (351), then designer (352). The API doesn't change.
Drawing rounds: 43.1 drawing style, readable dimensions → **43.2 vertical dimensions and counter height** → 43.3 cell chains and callouts → 43.4 corner reach → 44 plan → 45 plan dimensions and labels → sheet layout.

**Done when:**
- Every elevation DXF has the canvas's vertical chains at both wall edges as real DIMENSION entities, chosen as the canvas chooses them with nothing selected. Nearest the drawing first: the stack (toe kick, box or frame rail | opening | rail, countertop, clearance, parts below, box, molding, open or soffit), then counter height (base runs only), then the wall height.
- Columns start 3/8" (paper) past the drawing and are 3/8" apart, plus room for moved text, as the rows are.
- Text that doesn't fit moves off the line by the same rules as the rows, outward from the drawing.
- A column that only repeats the wall height is left out.
- The canvas doesn't change. The horizontal rows and the title don't move.

| Step | Repo | What | Tests after |
|---|---|---|---|
| **351** | geometry | `orientation` on a dimension record; a vertical record draws up the wall; the title ignores vertical records | 42 → **44** |
| **352** | designer | `elevationDimensions` adds both edges' vertical columns | 927 → **931** |

Codex writes the code (PROMPT-CONVENTIONS rule 10). This SPEC gives the rules, the contracts and the tests, plus a few lines where an ezdxf call matters. The test values were checked against a throwaway build of these rules (designer 931, lint 0 errors; geometry 44). That build isn't in this SPEC. If a test fails, fix the code, not the number, unless the number contradicts a rule here. In that case, stop and say so.

---

## §1 Decisions (2026-10-06)

- **Which chains (DECISIONS: "vertical chains at both wall edges").** Each edge gets the chain the canvas draws with nothing selected: `verticalChains(room, view, pickColumnRuns(view, null, edge), settings, edge)`. That covers joined stacks (`stackChain`), face frame rail | opening | rail tracks, horizontal T-fillers, parts below a run, soffits and the counter-height row. A selected run or opening changes the canvas, never the DXF. The vertical chain at a selected opening stays canvas-only.
- **Columns, nearest the drawing first:** `inner` (the stack), `middle` (counter height: floor to the top of the counter, base runs only), `outer` (the wall height). Row names are `left.inner`, `left.middle`, `left.outer`, `right.inner`, `right.middle`, `right.outer`. All left-edge records come first, then the right edge, after the horizontal rows.
- **Where columns go.** Same as rows, turned 90°. The first dimension line is 3/8" (paper) past the drawing's extent (`wallExtent`'s `left` or `right`). Each next column is 3/8" further, plus 5/32" per level of moved text in the column before it. An empty column takes no space. Extension lines start at the extent's edge (`base`). At 1:24, G1 A's left columns are at −9 and −21 3/4, and its right ones at 177, 189 3/4 and 198 3/4 (the wall is 168").
- **Text reads from the right side** (aligned, rotated 90°). ezdxf puts "above the line" on the line's left (−x) side. So on the left edge the on-line text sits outside the line, as above the wall, and moved text starts past it: level 1 is 6 3/8" from the line at 1:24. On the right edge the on-line text sits between the line and the drawing, as below the wall, and moved text starts just past the line: level 1 is 2 5/8" from it. The fit test, the width estimate and the levels are 43.1's.
- **A column that only repeats the wall is left out (Claude's default; say if you want it back).** If an `inner` or `middle` column is one segment with the same start and end as the `outer` (wall) segment, it's skipped. That drops the lone 0–96" "open" column at a bare wall end, and an island's 36" counter height when the island wall is 36". The canvas still draws them.
- **Both edges always**, as on the canvas, even when one run spans the wall and the two inner columns match.
- **The record.** Vertical records carry `orientation: 'vertical'`. `start`/`end` are heights, `base` is the x where the extension lines start, `at` is the dimension line's x, and `textX`/`textZ` are still the moved text's middle in drawing x and z. Horizontal records don't carry `orientation`. Geometry defaults it to `horizontal` and leaves the default out of `payload.json`, so 43 and 43.1 payloads round-trip unchanged.
- **The title** moves under the lowest *horizontal* line or moved text only. A vertical record's `at` is an x, not a height.
- **Not in 43.2:** cell (split-column) chains, casing clearance and pin callouts (43.3); the reach of runs past a corner, and `wallExtent` on `cornerShapes` (43.4); end elevations.

---

## §2 Step 351 — geometry: vertical dimensions

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/drawing/models.py` | 100 | `PayloadDimension.orientation` |
| `src/drawing/dimensions.py` | 28 | a vertical record draws up the wall |
| `src/drawing/elevation_dxf.py` | 155 | the title's `low` uses horizontal records only |
| `tests/test_elevation_dimensions.py` | 125 | append 2 tests (verbatim, below) |

**`models.py`.** `PayloadDimension` gains, right after `row`:

```python
    # Vertical dimensions run up the wall (SPEC-43.2): start/end are heights, base/at are x.
    orientation: Literal["horizontal", "vertical"] = "horizontal"
```

`Literal` is already imported. Anything else is rejected (`extra="forbid"` already covers unknown fields).

**`dimensions.py`, `add_dimensions`.** Horizontal records are drawn exactly as now. For a vertical record, swap the two coordinates of every point and turn the dimension 90°. The ezdxf call is:

```python
modelspace.add_linear_dim(
    base=(dimension.at, dimension.start),
    p1=(dimension.base, dimension.start),
    p2=(dimension.base, dimension.end),
    angle=90,
    ...  # dimstyle, text, dxfattribs as now
)
```

`set_location((textX, textZ), leader=False, relative=False)` doesn't change: `textX`/`textZ` are drawing coordinates either way. Keep one call site with the points chosen by orientation, not two copies of the loop. The docstring says the dimensions are horizontal or vertical (SPEC-43.2).

**`elevation_dxf.py`.** `low = min([...])` takes `at` and `textZ` from records whose `orientation == "horizontal"` only. Its comment cites SPEC-43, 43.1 and 43.2.

Don't touch `writer.py`, `bundle.py`, the fixtures or the other tests. `bundle.py` already writes `payload.json` with `exclude_defaults=True`, which is what makes the round-trip work.

**Tests.** Append to `tests/test_elevation_dimensions.py`, verbatim:

```python


# G1 elevation A's left edge, as the designer sends it (SPEC-43.2): toe kick (its text moved), box, molding, wall.
VERTICAL = [
    {"row": "left.inner", "orientation": "vertical", "kind": "toe-kick", "start": 0, "end": 4, "base": 0, "at": -9,
     "text": '4"', "textX": -15.375, "textZ": 2},
    {"row": "left.inner", "orientation": "vertical", "kind": "box", "start": 4, "end": 90, "base": 0, "at": -9,
     "text": '86"'},
    {"row": "left.inner", "orientation": "vertical", "kind": "molding", "start": 90, "end": 96, "base": 0, "at": -9,
     "text": '6"'},
    {"row": "left.outer", "orientation": "vertical", "kind": "wall", "start": 0, "end": 96, "base": 0, "at": -21.75,
     "text": '96"'},
]


def test_a_vertical_record_dimensions_up_the_wall():
    payload = _payload()
    payload["elevations"][0]["dimensions"] = copy.deepcopy(VERTICAL)
    doc = _dxf(payload)
    toe, box, molding, wall = doc.modelspace().query("DIMENSION")
    assert {dimension.dxf.angle for dimension in (toe, box, molding, wall)} == {90}
    assert tuple(box.dxf.defpoint2)[:2] == (0, 4)
    assert tuple(box.dxf.defpoint3)[:2] == (0, 90)
    assert tuple(box.dxf.defpoint)[:2] == (-9, 4)
    assert [dimension.get_measurement() for dimension in (toe, box, molding, wall)] == [4, 86, 6, 96]
    assert tuple(wall.dxf.defpoint)[:2] == (-21.75, 0)
    assert tuple(toe.dxf.text_midpoint)[:2] == (-15.375, 2)
    assert toe.dxf.dimtype & 128 == 128
    texts = [entity for entity in doc.blocks.get(box.dxf.geometry) if entity.dxftype() == "MTEXT"]
    assert [(text.dxf.text, text.dxf.rotation) for text in texts] == [('86"', 90)]


def test_vertical_dimensions_dont_move_the_title_and_round_trip():
    payload = _payload()
    payload["elevations"][0]["dimensions"] = copy.deepcopy(VERTICAL)
    texts = {text.dxf.text: tuple(text.dxf.insert)[:2] for text in _dxf(payload).modelspace().query("TEXT")}
    assert texts == {"ELEVATION A": (0, -12), "Wall 1": (0, -18), "G1 Euro kitchen": (0, -23)}
    archive = zipfile.ZipFile(io.BytesIO(base64.b64decode(draw(payload)["zip_base64"])))
    assert json.loads(archive.read("payload.json")) == payload
    payload["elevations"][0]["dimensions"][0]["orientation"] = "diagonal"
    with pytest.raises(ValidationError):
        draw(payload)
```

What they show:
- A vertical record measures between `(base, start)` and `(base, end)`, with its line at x = `at`, turned 90°.
- The moved toe-kick text goes where the record says, with the user-location flag set.
- The on-line text is rotated 90°.
- With only vertical records the title stays where it is with no dimensions. Without the `low` change it would jump to x-values (−21.75 − 12).
- `orientation` round-trips, and an unknown value is rejected.

**Count:** 42 + 2 = **44**.

---

## §3 Step 352 — designer: both edges' vertical columns

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/elevationDimensions.js` | 113 | the vertical columns |
| `src/elevation/model/__tests__/elevationDimensions.test.js` | 81 | the 3 existing tests look at horizontal records only |
| `src/elevation/model/__tests__/drawingPayload.test.js` | 91 | line 85's counts |
| NEW `src/elevation/model/__tests__/verticalDimensions.test.js` | — | 4 tests, verbatim |

**Contract.** `elevationDimensions(room, wall, side, settings)` keeps its signature. It returns the horizontal records exactly as now, then the left edge's vertical records, then the right edge's. Within an edge the order is `inner`, `middle`, `outer`, bottom to top. One record per segment longer than `EPSILON`:

```js
{ row: 'left.inner', orientation: 'vertical', kind, start, end, base, at, text, textX?, textZ? }
```

`kind` is the segment's own kind (`toe-kick`, `box`, `frame`, `frame-opening`, `t-filler`, `countertop`, `clearance`, `bottom`, `molding`, `open`, `soffit`, `counter-height`, `wall`…). `text` is `formatInches(end - start)`.

**Reuse:**
- `verticalChains` and `pickColumnRuns` from `./dimensions.js` (both exported). Call `verticalChains(room, view, pickColumnRuns(view, null, edge), settings, edge)` with `view` = the `resolveWall(...)` the function already makes. It returns `{ inner, middle, outer }`, each a list of `{ start, end, kind }`.
- `wallExtent` (already called): `extent.left`, `extent.right`.
- `placeLabels`, generalized rather than copied. Today it decides the on-line text's side from `outward > 0`. Make that side its own input, for example a fifth parameter `textOutward` that defaults to `outward > 0`, so the horizontal call sites don't change. Pass `true` for the left edge and `false` for the right. It must also give the label's position along the line and across it (today it writes `textX`/`textZ` assuming horizontal). The caller maps them: horizontal `textX` = along and `textZ` = across; vertical `textX` = across and `textZ` = along.
- The spacing is the rows': `DIMENSION_ROW_SPACING × plotScale`. The next column's `at` = this `at` + outward × (spacing + levels × step), as `next[where]` does for rows. The first column's `at` = edge ± spacing. Outward is −1 on the left and +1 on the right.

**Skip rule.** Before placing an `inner` or `middle` column, skip it if it's a single segment whose `start` and `end` equal the `outer` column's single segment (within `EPSILON`). The `outer` column is never skipped unless it's empty (a 0-height wall).

Update the function's doc comment: horizontal rows, then vertical columns at both edges (SPEC-43.2), `orientation: 'vertical'` on those, and the skip rule in a line. Keep the file's existing style. No new exports.

**Don't touch:** `dimensions.js`, `drawingPayload.js` (it already calls `elevationDimensions` per elevation), `wallExtent.js`, any canvas file. The canvas keeps its own vertical chains and selection behaviour.

**Tests.**

`elevationDimensions.test.js`: the three existing tests keep their numbers but look at horizontal records only.
- After the `row` helper (line 14), add:

```js
/** The horizontal rows only (SPEC-43.2 adds vertical columns, tested in verticalDimensions.test.js). */
const horizontal = (dimensions) => dimensions.filter(({ orientation }) => orientation === undefined);
```

- Line 19: `expect(elevationDimensions(g1, g1.walls[0], 'front', settings).map(row))` → `expect(horizontal(elevationDimensions(g1, g1.walls[0], 'front', settings)).map(row))`.
- Line 49: `const dimensions = elevationDimensions(g1, g1.walls[1], 'front', { ...settings, plotScale: 48 });` → `const dimensions = horizontal(elevationDimensions(g1, g1.walls[1], 'front', { ...settings, plotScale: 48 }));`.
- Line 65: `expect(elevationDimensions(g1, g1.walls[3], 'back', settings).map(row).slice(5))` → `expect(horizontal(elevationDimensions(g1, g1.walls[3], 'back', settings)).map(row).slice(5))`.

`drawingPayload.test.js` line 85: `[24, 14, 9, 9]` → `[36, 30, 17, 17]`.

**NEW `src/elevation/model/__tests__/verticalDimensions.test.js`**, verbatim:

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
const vertical = (dimensions) => dimensions.filter(({ orientation }) => orientation === 'vertical');
const row = ({
  row: name, kind, start, end, base, at, text, textX, textZ,
}) => [name, kind, start, end, base, at, text, ...(textX === undefined ? [] : [textX, textZ])];

describe('SPEC-43.2 vertical elevation dimensions', () => {
  it('dimensions both wall edges as the canvas does with nothing selected, counter height between (G1 elevation A)', () => {
    const g1 = room('G1 Euro kitchen');
    const dimensions = vertical(elevationDimensions(g1, g1.walls[0], 'front', settings));
    expect(dimensions.map(row)).toEqual([
      ['left.inner', 'toe-kick', 0, 4, 0, -9, '4"', -15.375, 2],
      ['left.inner', 'box', 4, 90, 0, -9, '86"'],
      ['left.inner', 'molding', 90, 96, 0, -9, '6"'],
      ['left.outer', 'wall', 0, 96, 0, -21.75, '96"'],
      ['right.inner', 'toe-kick', 0, 4, 168, 177, '4"', 179.625, 2],
      ['right.inner', 'box', 4, 34.5, 168, 177, '30 1/2"'],
      ['right.inner', 'countertop', 34.5, 36, 168, 177, '1 1/2"', 179.625, 35.25],
      ['right.inner', 'clearance', 36, 54, 168, 177, '18"'],
      ['right.inner', 'box', 54, 90, 168, 177, '36"'],
      ['right.inner', 'molding', 90, 96, 168, 177, '6"'],
      ['right.middle', 'counter-height', 0, 36, 168, 189.75, '36"'],
      ['right.outer', 'wall', 0, 96, 168, 198.75, '96"'],
    ]);
  });

  it('stacks moved text in levels and moves the next column out for them (G2 elevation A, face frame)', () => {
    const g2 = room('G2 Face frame kitchen');
    expect(vertical(elevationDimensions(g2, g2.walls[0], 'front', settings))
      .filter(({ row: name }) => name.startsWith('left.')).map(row)).toEqual([
      ['left.inner', 'toe-kick', 0, 4, 0, -9, '4"', -15.375, 2],
      ['left.inner', 'frame', 4, 5.75, 0, -9, '1 3/4"', -19.125, 4.875],
      ['left.inner', 'frame-opening', 5.75, 67, 0, -9, '61 1/4"'],
      ['left.inner', 'frame', 67, 69, 0, -9, '2"', -15.375, 68],
      ['left.inner', 'frame-opening', 69, 88.25, 0, -9, '19 1/4"'],
      ['left.inner', 'frame', 88.25, 90, 0, -9, '1 3/4"', -15.375, 89.125],
      ['left.inner', 'molding', 90, 96, 0, -9, '6"'],
      ['left.outer', 'wall', 0, 96, 0, -25.5, '96"'],
    ]);
  });

  it('leaves out a column that only repeats the wall height (G1 island, a bare wall in G3)', () => {
    const g1 = room('G1 Euro kitchen');
    expect(vertical(elevationDimensions(g1, g1.walls[3], 'back', settings)).map(row)).toEqual([
      ['left.inner', 'toe-kick', 0, 4, 0, -9, '4"', -15.375, 2],
      ['left.inner', 'box', 4, 34.5, 0, -9, '30 1/2"'],
      ['left.inner', 'countertop', 34.5, 36, 0, -9, '1 1/2"', -15.375, 35.25],
      ['left.outer', 'wall', 0, 36, 0, -21.75, '36"'],
      ['right.inner', 'toe-kick', 0, 4, 91.5, 100.5, '4"', 103.125, 2],
      ['right.inner', 'box', 4, 34.5, 91.5, 100.5, '30 1/2"'],
      ['right.inner', 'countertop', 34.5, 36, 91.5, 100.5, '1 1/2"', 103.125, 35.25],
      ['right.outer', 'wall', 0, 36, 91.5, 113.25, '36"'],
    ]);
    const g3 = room('G3 Bath alcove');
    expect(vertical(elevationDimensions(g3, g3.walls[0], 'front', settings)).map(row)).toEqual([
      ['left.outer', 'wall', 0, 96, 0, -9, '96"'],
      ['right.outer', 'wall', 0, 96, 30, 39, '96"'],
    ]);
  });

  it('spaces columns by the plot scale (G1 elevation B at 1/4" = 1\'-0")', () => {
    const g1 = room('G1 Euro kitchen');
    const dimensions = vertical(elevationDimensions(g1, g1.walls[1], 'front', { ...settings, plotScale: 48 }));
    // 18" apart at 1:48, plus 7 1/2" for the one level of moved text in each inner column.
    expect([...new Set(dimensions.map(({ row: name, at }) => `${name} ${at}`))]).toEqual([
      'left.inner -18', 'left.middle -43.5', 'left.outer -61.5',
      'right.inner 138', 'right.middle 163.5', 'right.outer 181.5',
    ]);
    expect(dimensions.filter(({ textX }) => textX !== undefined).map(({ text, textX, textZ }) => [text, textX, textZ]))
      .toEqual([
        ['4"', -30.75, 2], ['1 1/2"', -30.75, 35.25], ['6"', -30.75, 93],
        ['4"', 143.25, 2], ['1 1/2"', 143.25, 35.25], ['6"', 143.25, 93],
      ]);
  });
});
```

What the numbers are, at 1:24 (text 2 1/4", gap 1 1/2", a level 3 3/4"):
- **What moves.** `4"` is estimated at 3 3/8" wide; plus a gap each side that's 6 3/8", more than the 4" toe kick, so it moves. So does the countertop's `1 1/2"`. `6"` (2 characters: 2 1/4" plus 3" of gaps) fits its 6" molding, so it stays.
- **Left edge.** The on-line text is outside the line, so moved text sits 6 3/8" past it (−15 3/8"). G2's `1 3/4"` frame text, centred at 4 7/8", overlaps the moved `4"` and goes a level further (−19 1/8"). The wall column moves out 9" + 3 3/4" per level: −21 3/4" on G1, −25 1/2" on G2.
- **Right edge.** The on-line text is inside, so moved text sits 2 5/8" past the line (179 5/8"). Counter height and wall follow at 189 3/4" and 198 3/4".
- **Skipped.** The island's counter height (0–36") is its wall height, so only the wall column shows. G3's bare wall has no inner columns.
- **At 1:48** everything doubles: columns 18" apart plus 7 1/2" per level. `6"` no longer fits (4 1/2" of text plus 6" of gaps), so the molding's text moves too.

**Count:** 927 + 4 = **931**. Golden snapshot unchanged. Payload record counts for G1 go from [24, 14, 9, 9] to [36, 30, 17, 17].

---

## End-to-end check (Kyle)

Geometry on `feature/drawing` with 351 in. `npm run build` in the designer, then start the API and designer as in round 42.

**Export DXF, G1, `elevation-A.dxf`:**
- **Left of the wall.** A column at −9": 4" toe kick, 86" tall, 6" crown, reading bottom to top. The `4"` sits beside its own ticks, further out. The 96" wall column is at −21 3/4".
- **Right of the wall.** 4" / 30 1/2" / 1 1/2" / 18" / 36" / 6" at 177", with the `4"` and `1 1/2"` just past the line. Then a 36" counter height at 189 3/4" and the 96" wall at 198 3/4".
- **Nothing else moved.** Rows below and above are where they were in 43.1, and the title is still under the window row.
- **CAD.** The vertical dimensions stretch and re-measure like the horizontal ones. Dragged text stays put.

**G1 `elevation-C.dxf` (island).** Toe kick, box and countertop at each end, then the 36" wall height. No separate counter-height column.

**G2 `elevation-A.dxf`.** Each edge shows the frame's rail | opening | rail up the outermost column. The bottom `1 3/4"` rail text goes a level further out than the toe kick's.

**Drawing scale 1/4" = 1'-0".** Columns 18" apart, and the 6" crown text moves off its line too.

**Known for now:**
- When one run spans the whole wall, both edges show the same inner column. That's the canvas's rule too.
- A selected run or opening doesn't change the DXF; the canvas's opening chain isn't exported.
- Cell chains, callouts and corner reach are 43.3 and 43.4.
