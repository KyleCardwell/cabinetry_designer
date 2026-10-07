# Elevation Lab — SPEC-38.3 (face frame ends; joined end panels)

Steps 284–286, after 38.1 and before the consolidation (39 is renumbered to steps 287–299). Written against `3afa1ba` (step 283). Baseline **835**.

The code below wasn't run before this was written (Codex implements it). The expected numbers were worked out by hand from §1. If a test fails, check its expected value against §1 before changing the code, and say so in the summary.

| Step | What | Tests after |
|---|---|---|
| **284** | Model: beaded inset boxes get a bead gap at every run end, a free end's overhang moves into its gap, and face frame runs round boxes to 1/2" and give the leftover to the end stiles | 840 |
| **285** | Model: the frame covers those end gaps (beside an end panel, and at a plain or joined end) and never narrows a box at a run end | 842 |
| **286** | A chosen end type sticks on a joined run end; a back panel beside a joint doesn't hide its neighbour's end; "Filler" reads "Face frame stile" in a face frame run | 844 |

38.2 (recessed cabinet laps) stays parked. Round 38.3 runs before the golden rooms so their snapshot records the fixed behaviour; G2 needs re-exporting after it.

## §1 What's wrong, and the rules (Kyle, 2026-10-02)

Found drawing G2 and G1. In Kyle's G2 the upper's boxes came out 29 7/16, 29 7/16, 29 3/8 and its openings 26 15/16, 27 15/16, 27 5/8.

### 1. The bead belongs in a gap at every end of a beaded run

A face frame covers **3/4" of every box**. In a beaded inset run the bead lives in the gaps between boxes (1/2" between two boxes, a bead each side), which is why a seam stile is 2". Today that only happens between boxes. At a run end the box sits tight to whatever is there, and the bead is put into the box-to-opening reveal instead (1" on the left and right of every beaded box, cut back to 3/4" only at seams). So an end opening is 1/4" smaller than a middle one.

- **Every end of a beaded inset run gets a bead gap (the style's `beadWidth`, 1/4" by default)** between the end and its outermost box, whatever is at the end: an end panel, a neighbour run's end panel (a joined end), an inside corner (between the filler and the box), or a plain end.
- **Beaded boxes' left and right reveals are the stile, 3/4"** (no bead). Top and bottom are unchanged (rails still carry the bead). The `rule:bead-seam` rule then changes nothing; leave it.
- Only beside a cabinet: an outermost cell that's a panel, void or shelves gets no bead gap.
- The corner rule stays as it is (the return run's face to the faces = the Euro filler width): the filler minimum at an inside corner subtracts the stile *and* the bead gap, i.e. the same 1" as today.
- A mitered end panel's stile is still 1 3/4": 3/4 panel + 1/4 gap + 3/4 over the box.

### 1b. A free end's overhang is part of the end, not the box (and a joined end isn't free)

Today a cabinet side with nothing beside it inside its frame is "free" (SPEC-36.2): its slot is the frame section and the box is 3/4" narrower inside it, because the stile overhangs it. Two problems in Kyle's G2 (2026-10-02, after setting the base's corner end to a filler): the boxes still differ, because

- **a joined end counts as free.** The base is joined to the tall, whose own end panel sits between them, but the frame only looks at its own run, so it shrinks the base's first box by 3/4" and that opening comes out 3/4" smaller (29 1/2 vs 30 1/4 today).
- **the overhang comes out of one box.** Even at a truly free end, taking the 3/4" from the end box makes its opening 3/4" smaller than the rest.

Rules:

- **A joined end (a joint or follow anchor) is never free.** It's like an end panel: bead gap, then the frame covers 3/4" of the box, and the frame stops at the run's edge.
- **A free end (end type None, not joined) puts the stile's 3/4" overhang in the end gap**, with the bead and the leftover. The box isn't narrowed. Every box and opening matches; the end stile is overhang + bead + leftover + 3/4" over the box (1 3/4" with no leftover, as today's free stile).
- So in a face frame run the frame never narrows a box at a run end. A box side that's free *inside* a run (beside a void or a panel cell) keeps today's inset.

### 2. Face frame runs: the end stiles take the leftover

Today a run with nothing flexible at either end (end panels, joints) splits its auto boxes to the nearest 1/16" and the last box takes the remainder, so boxes and openings differ by 1/16". In a face frame run a stile can be any width, so:

- **A face frame run (any inset style) with no flexible end rounds its auto boxes down to `settings.roundTo` (1/2"), and the leftover goes to its end stiles**: half to each real end (floored to 1/16" on the left, the rest on the right). Every box is the same and every opening is the same.
- A run with a flexible end (a filler, a blind) is unchanged: the filler already takes the leftover, and boxes already round to 1/2".
- European runs are unchanged.
- In a pinned run the split points at the pins aren't run ends: no bead gap and no leftover there (each outer segment gives its leftover to its own real end).

**Kyle's G2, after the fix:**

| Run | Boxes | End gaps (bead + leftover) | Openings |
|---|---|---|---|
| Upper, 90", joined left / end panel right, 3 boxes | 29, 29, 29 | 5/8 left, 5/8 right | 27 1/2 × 3 |
| Base, 65 3/16", joined left / corner filler right (as now saved), 2 boxes | 31 1/2, 31 1/2 (filler 1 3/16) | 1/4, 1/4 | 30 × 2 |
| Tall, 28 1/2", end panels both | 26 1/2 | 1/4, 1/4 | 25 |
| Wall 2 base, 59 3/16", corner filler left / end panel right, 2 boxes | 28, 28 (filler 1 7/16) | 1/4, 1/4 | 26 1/2 × 2 |

### 3. The frame covers the end gaps

The frame region today joins an end panel only when it touches a box. With a gap between them it must still cover it (`frames.js`): a panel within the run's gap reach of the boxes joins the frame, and the frame grows over the gap. At an end with no panel, the frame runs out to the run's edge, over the bead and leftover, so the stile there is 3/4" + the end gap.

### 3b. "Filler" reads "Face frame stile" in a face frame run

The end type's value stays `'filler'` (it's the same flexible end and the same piece); the select shows "Face frame stile" when the run has a face frame. Its width is still the filler piece's; the stile Kyle sees is that plus the bead gap and the 3/4" over the box.

### 4. A joined end can't be set to an end panel (G1)

Two runs joined to each other, the left one only a back panel (a 3/4" panel cell aligned to the back), the right one cabinets. The right run's left end needs an end panel, but choosing it reverts to None.

- **Cause 1:** `setRunEnd` keeps the end's `auto: true` (it spreads the old end), and `syncRoom` re-derives every auto joined end, so the choice is thrown away. **A chosen end type is manual:** `setRunEnd` drops `auto`. (Joining again makes ends auto again, as now.)
- **Cause 2:** a joined end is "covered" (so auto picks None) when the neighbour is at least as deep. It compares the neighbour's *run* depth, so a run whose edge cell is a 3/4" back panel still "covers" a 24" base. **The neighbour's depth at that edge is its edge cells' depth**: for each leaf on its touching edge, the leaf's own `depth` (else the run's), a void counting 0; the deepest one is compared. So the base's end now defaults to an end panel next to a back panel run.

---

## §2 Step 284 — Model: end gaps and stile leftovers

**Files:** `src/elevation/model/styles.js` (≈ 300), `src/elevation/model/splitRun.js` (584), `src/elevation/model/room.js` (1791: `withFrame` 622–632, `endMinWidthsForRun` 214–234), NEW `src/elevation/model/__tests__/faceFrameEnds.test.js`, and the existing tests that encoded the old beaded rules.

### `styles.js`

1. `styleReveals` (≈ 104–126): `left: frame.stile + bead,` / `right: frame.stile + bead,` become `left: frame.stile,` / `right: frame.stile,`. Comment above: `// SPEC-38.3: the bead is in the gaps beside a beaded box, never in its side reveals.`
2. `runFrame` (≈ 285–290) also returns the bead:

```js
export function runFrame(room, run, settings) {
  const style = resolveStyle(settings, room, run);
  if (!isInsetStyle(style)) return null;
  const frame = { ...DEFAULT_SETTINGS.insetFrame, ...settings.insetFrame };
  const bead = style.cabinetStyleId === CABINET_STYLE_IDS.BEADED_INSET ? style.beadWidth : 0;
  return { thickness: frame.thickness, drop: frameDrop(run, settings), bead };
}
```

### `room.js`

- `withFrame` (622–632): the "unchanged" check also compares `run._frame?.bead === frame.bead`.
- `endMinWidthsForRun` (214–234): `const frameReveal = inset ? styleReveals(style, run.cabinetTypeId, settings).left : 0;` becomes
  `const frameReveal = inset ? styleReveals(style, run.cabinetTypeId, settings).left + (run._frame?.bead ?? 0) : 0;`
  (the corner filler minimum stays 1" smaller than Euro's, as before).

### `splitRun.js`

1. New helper after `itemsWithGaps`:

```js
const JOINED = new Set(['joint', 'follow']);

/**
 * The gap at each real end of a face frame run (SPEC-38.3), beside a cabinet only: a beaded run's bead,
 * plus, at a free end (None, not joined), the stile's overhang. A pinned run's split points (`_pinSplit`)
 * aren't ends.
 */
function endGaps(run, items, settings) {
  if (!run._frame) return { left: 0, right: 0 };
  const bead = run._frame.bead ?? 0;
  const overhang = { ...DEFAULT_SETTINGS.insetFrame, ...settings.insetFrame }.stile;
  const at = (side) => {
    if (run._pinSplit?.[side]) return 0;
    const item = side === 'left' ? items[0] : items[items.length - 1];
    if (item?.kind !== 'cabinet') return 0;
    const free = run.ends[side].type === 'none' && !JOINED.has(run.anchors?.[side]?.to);
    return bead + (free ? overhang : 0);
  };
  return { left: at('left'), right: at('right') };
}
```

2. `splitRun.js` imports `DEFAULT_SETTINGS` beside `CABINET_TYPE_IDS` from `./constants.js`. `layoutInputs`: `const gaps = endGaps(run, items, settings);` and `fixedEnds` adds `gaps.left + gaps.right`; return `endGaps: gaps` too. (So `runWidthRange` and `syncAutoItems` count them.)
3. `splitRunLegacy`:
   - Destructure `endGaps` from `layoutInputs`, and `const stileExtra = { left: 0, right: 0 };`.
   - Before the existing `} else if (nAuto > 0) {` branch, add:

```js
  } else if (nAuto > 0 && run._frame) {
    // SPEC-38.3: a face frame run with nothing flexible rounds its boxes down and gives the leftover
    // to its end stiles, half to each real end, so every box and every opening is the same.
    autoWidth = floorTo(available / nAuto, settings.roundTo);
    const leftover = available - nAuto * autoWidth;
    const realLeft = !run._pinSplit?.left;
    const realRight = !run._pinSplit?.right;
    if (realLeft && realRight) {
      stileExtra.left = floorTo(leftover / 2, FILLER_STEP);
      stileExtra.right = leftover - stileExtra.left;
    } else if (realLeft) {
      stileExtra.left = leftover;
    } else {
      stileExtra.right = leftover;
    }
```

   - The last-auto remainder (`if (flex === 0 && !hasAvailableError && autoIndex === lastAutoIndex)`) also requires `!run._frame`.
   - Positioning: after `addEnd('left', run.ends.left);` add the left gap to the end piece's gap, and after the items add the right gap to the last item's:

```js
  const leftGap = endGaps.left + stileExtra.left;
  const rightGap = endGaps.right + stileExtra.right;
  addEnd('left', run.ends.left);
  if (gapsAfter.length > 0) gapsAfter[gapsAfter.length - 1] += leftGap;
  for (const item of computedItems) { … unchanged … }
  if (computedItems.length > 0) gapsAfter[gapsAfter.length - 1] += rightGap;
  addEnd('right', run.ends.right);

  let x = run.x + (run.ends.left.type === 'none' ? leftGap : 0);
```

   (A `'none'` end adds no piece, so the first box starts `leftGap` in from the run's edge.)
4. `splitRun` (pinned): the two outer `splitRunLegacy` calls pass `_pinSplit: { right: true }` (left segment) and `_pinSplit: { left: true }` (right segment) in their run objects; `leftMinimum` / `rightMinimum` add `endGaps(run, items, settings).left` / `.right`. `interiorLayout` is unchanged.

### NEW `src/elevation/model/__tests__/faceFrameEnds.test.js`

```js
import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { gridFromItems } from '../grid.js';
import { splitRun } from '../splitRun.js';

const S = DEFAULT_SETTINGS;
const BEADED = { thickness: 0.8125, drop: 0, bead: 0.25 };

function run(width, ends, count, extra = {}) {
  const items = Array.from({ length: count }, (_, index) => ({ id: `c${index + 1}`, kind: 'cabinet', width: null }));
  return {
    id: 'R', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 0, width, z: 4, height: 30.5, depth: 24,
    ends: { left: { type: ends[0], width: null }, right: { type: ends[1], width: null } },
    autoCount: false, maxCabinetWidth: null, heightMode: 'manual', overrides: {},
    anchors: { left: false, right: false }, grid: gridFromItems('R', items),
    _seamGap: 0.5, _frame: BEADED, ...extra,
  };
}
const JOINED_LEFT = { anchors: { left: { to: 'joint', jointId: 'J', offset: 0 }, right: false } };
const shown = ({ pieces }) => pieces.map(({ kind, x, width }) => [kind, x, width]);

describe('SPEC-38.3 face frame ends', () => {
  it('gives a beaded run equal boxes and a bead gap each end; a free end adds the overhang to its gap', () => {
    // Joined left: bead + half the leftover each end.
    expect(shown(splitRun(run(90, ['none', 'end_panel'], 3, JOINED_LEFT), S))).toEqual([
      ['cabinet', 0.625, 29], ['cabinet', 30.125, 29], ['cabinet', 59.625, 29], ['end_panel', 89.25, 0.75],
    ]);
    // Free left (None, not joined): bead + 3/4 overhang, no leftover. The box isn't narrowed.
    expect(shown(splitRun(run(90, ['none', 'end_panel'], 3), S))).toEqual([
      ['cabinet', 1, 29], ['cabinet', 30.5, 29], ['cabinet', 60, 29], ['end_panel', 89.25, 0.75],
    ]);
  });

  it('floors the left half of an odd leftover to a sixteenth', () => {
    expect(shown(splitRun(run(65.1875, ['none', 'end_panel'], 2, JOINED_LEFT), S))).toEqual([
      ['cabinet', 0.4375, 31.5], ['cabinet', 32.4375, 31.5], ['end_panel', 64.4375, 0.75],
    ]);
  });

  it('keeps a corner filler taking the leftover, with a bead gap before and after the boxes', () => {
    const wall2 = splitRun(run(59.1875, ['filler', 'end_panel'], 2), S, { endMinWidths: { left: 0.75, right: 1.5 } });
    expect(shown(wall2)).toEqual([
      ['filler', 0, 1.4375], ['cabinet', 1.6875, 28], ['cabinet', 30.1875, 28], ['end_panel', 58.4375, 0.75],
    ]);
    // Kyle's G2 base: joined to the tall on the left, corner filler on the right.
    const base = splitRun(run(65.1875, ['none', 'filler'], 2, JOINED_LEFT), S, { endMinWidths: { left: 0, right: 0.5 } });
    expect(shown(base)).toEqual([
      ['cabinet', 0.25, 31.5], ['cabinet', 32.25, 31.5], ['filler', 64, 1.1875],
    ]);
  });

  it('gives an unbeaded inset run no bead gap, a free end its overhang, and the stile leftover', () => {
    const plain = run(60, ['none', 'end_panel'], 2, { _seamGap: 0, _frame: { ...BEADED, bead: 0 } });
    expect(shown(splitRun(plain, S))).toEqual([
      ['cabinet', 1, 29], ['cabinet', 30, 29], ['end_panel', 59.25, 0.75],
    ]);
  });

  it('leaves a European run as it was: sixteenths, the last box takes the remainder', () => {
    const euro = run(65.1875, ['none', 'end_panel'], 2, { _seamGap: undefined, _frame: undefined });
    expect(shown(splitRun(euro, S))).toEqual([
      ['cabinet', 0, 32.25], ['cabinet', 32.25, 32.1875], ['end_panel', 64.4375, 0.75],
    ]);
  });
});
```

Worked numbers:

- Joined 90": 90 − 3/4 panel − 1/2 bead gaps − 1 seams = 87 3/4 → 29 each, 3/4 left over → 3/8 each end (gaps 5/8).
- Free 90": the left gap is 1/4 + 3/4 = 1, so 90 − 3/4 − 1 1/4 − 1 = 87 → 29 each, nothing left over.
- Kyle's base: 65 3/16 − 1/2 bead gaps − 1/2 seam = 64 3/16; less the 1/2 filler minimum, /2 → 31 1/2 each; the filler takes 1 3/16 at 1/4 + 31 1/2 + 1/2 + 31 1/2 + 1/4 = 64.
- Unbeaded 60": the free left gap is 3/4; 60 − 3/4 − 3/4 = 58 1/2 → 29 each, 1/2 over → 1/4 each end (gaps 1 and 1/4).
- European: 65 3/16 − 3/4 = 64 7/16; /2 = 32.21875 → 32 1/4 to the sixteenth; the last box takes 32 3/16.

### Existing tests

Expect these to fail because they encode the old beaded rules (1" side reveals, boxes tight to the ends, 1/16" remainders in inset runs, `_frame` without `bead`): `styles.test.js` ("30 beaded, profiled upper"), `frames.test.js` ("covers an end panel and a filler, and the seam gap widens the stile"), `frameFixes.test.js` ("measures upper clearance to the frame, and shortens the corner filler…"), and possibly `gaps.test.js`, `hanging.test.js`, `tees.test.js`, `persistence.test.js` (beaded fixtures). Update each expectation to the §1 rules, never the code to the old numbers, and list every test you changed in the summary with one line on why. `frames.test.js`'s frame-region expectations may only pass after step 285; if so, mark them `it.skip` with a `// SPEC-38.3 step 285` comment and step 285 restores them.

**Count:** 835 + 5 = **840**.

---

## §3 Step 285 — Model: the frame covers the end gaps

**Files:** `src/elevation/model/frames.js` (355), NEW `src/elevation/model/__tests__/faceFrameEndsRoom.test.js`, and any test 284 skipped. Tests of free sides (`frames.test.js`, `frameFixes.test.js`, SPEC-36.2's) whose free side is at a run end now expect it not free and the box at full width; update them to §1b.

### `frameRegions` (≈ 64–150)

1. **Panels across a gap.** The panel loop (≈ 129–138) becomes:

```js
    for (const panel of panels) {
      if (!overlaps(panel.z, panel.z + panel.height, bounds.z, bounds.z + bounds.height)) continue;
      // SPEC-38.3: a panel within the run's gap reach (the bead gap, plus any stile leftover) joins too.
      const gapBefore = bounds.x - (panel.x + panel.width);
      const gapAfter = panel.x - (bounds.x + bounds.width);
      const before = gapBefore >= -EPSILON && gapBefore <= reach + EPSILON;
      const after = gapAfter >= -EPSILON && gapAfter <= reach + EPSILON;
      if (!before && !after) continue;
      if (before) region.x = panel.x;
      region.width += panel.width + Math.max(0, before ? gapBefore : gapAfter);
      covered.push(panel);
      if (panel.edge) (region.wallPanels ??= []).push({ side: panel.edge, x: panel.x, width: panel.width });
      else region.panelIds.push(panel.id);
    }
```

2. **Plain ends.** Right after that loop:

```js
    // SPEC-38.3: at a run end with no panel, the frame runs out to the run's edge, over the bead gap
    // and any stile leftover, when nothing of the run sits between.
    const runRight = run.x + run.width;
    const leftClear = !covered.some((panel) => panel.x < bounds.x)
      && !pieces.some((piece) => piece.x >= run.x - EPSILON && piece.x + piece.width <= bounds.x + EPSILON);
    if (leftClear && bounds.x - run.x > EPSILON) {
      region.width += region.x - run.x;
      region.x = run.x;
    }
    const rightClear = !covered.some((panel) => panel.x > bounds.x)
      && !pieces.some((piece) => piece.x >= bounds.x + bounds.width - EPSILON
        && piece.x + piece.width <= runRight + EPSILON);
    if (rightClear && runRight - (region.x + region.width) > EPSILON) {
      region.width = runRight - region.x;
    }
```

3. **A box side at a run end isn't free** (§1b). In the box loop at the end of each group, a side is free only if nothing covers it *and* it isn't the run's end (the end gap now holds the overhang, so the box keeps its full width):

```js
    const atRunEnd = {
      left: (box) => leftClear && Math.abs(box.x - bounds.x) <= EPSILON,
      right: (box) => rightClear && Math.abs(box.x + box.width - bounds.x - bounds.width) <= EPSILON,
    };
    for (const box of boxes) {
      const beside = (side) => covering.some((other) => other !== box && sideOf(box, other, reach) === side);
      const besideCabinet = (side) => boxes.some((other) => other !== box && sideOf(box, other, reach) === side);
      // SPEC-38.3: a run end's overhang is in its end gap, so the box there isn't narrowed.
      freeSides.set(box.id, {
        left: !beside('left') && !atRunEnd.left(box),
        right: !beside('right') && !atRunEnd.right(box),
      });
      seamSides.set(box.id, { left: besideCabinet('left'), right: besideCabinet('right') });
    }
```

   (`leftClear` / `rightClear` and `bounds` are the ones from item 2, so declare them where the box loop can see them.) A free side inside a run (beside a void, a panel cell or shelves) still has nothing of the run's edge beyond it clear, so it keeps today's inset. A joined end is a run end like any other: no panel there, so the frame runs out to the run's edge and the box isn't inset.

`regionOpenings`, members and badges then follow from the region and the boxes' (now 3/4") reveals.

### NEW `src/elevation/model/__tests__/faceFrameEndsRoom.test.js`

```js
import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { cellPieces } from '../cells.js';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
import { frameRegions, regionOpenings } from '../frames.js';
import { gridFromItems } from '../grid.js';
import { resolveWall, syncRoom } from '../room.js';

const S = DEFAULT_SETTINGS;

function makeRun(id, type, x, width, ends, count, extra = {}) {
  const items = Array.from({ length: count }, (_, index) => ({ id: `${id}${index + 1}`, kind: 'cabinet', width: null }));
  return {
    id, cabinetTypeId: type, x, width, z: type === CABINET_TYPE_IDS.UPPER ? 54 : 4,
    height: type === CABINET_TYPE_IDS.UPPER ? 36 : 30.5, depth: type === CABINET_TYPE_IDS.UPPER ? 12 : 24,
    ends: { left: { type: ends[0], width: null }, right: { type: ends[1], width: null } },
    autoCount: false, maxCabinetWidth: null, heightMode: 'manual', overrides: {},
    anchors: { left: false, right: false }, grid: gridFromItems(id, items), ...extra,
  };
}

const room = syncRoom({
  id: 'room', name: 'Room', profile: { ...S.defaultProfile }, style: { cabinetStyleId: 15 }, wallOrder: ['A'],
  walls: [{
    id: 'A', name: '', numberOverride: null, elevationForced: false, x1: 0, y1: 0, x2: 200, y2: 0,
    height: 96, thickness: 4.5, flipped: false, connections: { start: null, end: null }, profile: {},
    openings: [], joints: [], endPanels: { start: null, end: null }, landings: { start: null, end: null },
    soffits: [],
    runs: [
      makeRun('U', CABINET_TYPE_IDS.UPPER, 0, 90, ['none', 'end_panel'], 3),
      makeRun('B', CABINET_TYPE_IDS.BASE, 100, 60, ['end_panel', 'end_panel'], 2),
    ],
  }],
}, S);

function frameOf(runId) {
  const wall = resolveWall(room, room.walls[0]);
  const run = wall.runs.find(({ id }) => id === runId);
  const layout = layoutRun(room, wall, run, S);
  const [region] = frameRegions(room, run, cellPieces(run, layout), S).regions;
  return {
    region: [region.x, region.width],
    openings: regionOpenings(region, runFaceLayouts(room, wall, run, S, layout)).map(({ width }) => width),
  };
}

describe('SPEC-38.3 the frame covers the end gaps', () => {
  it('runs out to a free end (overhang in the gap, box not narrowed) and over an end panel past its bead gap', () => {
    // Free left gap 1/4 + 3/4: boxes 29 at 1, 30 1/2, 60; openings 29 − 3/4 − 3/4.
    expect(frameOf('U')).toEqual({ region: [0, 90], openings: [27.5, 27.5, 27.5] });
  });

  it('covers end panels at both ends with equal openings', () => {
    // 60 − 1 1/2 panels − 1/2 seam − 1/2 bead gaps = 57 1/2 → two 28 1/2 boxes, 1/4 leftover each end.
    expect(frameOf('B')).toEqual({ region: [100, 60], openings: [27, 27] });
  });
});
```

Restore any test step 284 skipped, with its expectations set to the §1 rules.

**Count:** 840 + 2 = **842**.

---

## §4 Step 286 — Joined ends: a chosen type sticks; a back panel doesn't hide its neighbour's end

**Files:** `src/elevation/store/elevationSlice.js` (`setRunEnd`, ≈ 1083–1100), `src/elevation/model/joints.js` (`endIsCovered`, 105–133), NEW `src/elevation/model/__tests__/helpers/joinedRooms.js` (a fixture, not a test file: importing one test file from another would register its tests twice), NEW `src/elevation/model/__tests__/jointEnds.test.js`, NEW `src/elevation/store/__tests__/runEndManual.test.js`, `src/elevation/components/properties/EndFields.jsx` (the option label only).

### `setRunEnd`

The non-`none` branch drops `auto` (a chosen end is manual):

```js
      const { auto, ...current } = location.run.ends[side] ?? {};
      void auto;
      location.run.ends[side] = end.type === 'none'
        ? { type: end.type, width: end.width }
        : { ...current, type: end.type, width: end.width };
```

### `joints.js` — `endIsCovered`

Import `edgeLeaves` from `./grid.js`. Add above `endIsCovered`:

```js
/** How deep a run is along one edge (SPEC-38.3): its edge cells' own depths (a void is 0), else the run's. */
function edgeDepth(run, side) {
  if (!run.grid) return run.depth;
  return Math.max(0, ...edgeLeaves(run.grid, side).map((leaf) => (
    leaf.kind === 'void' ? 0 : leaf.depth ?? run.depth
  )));
}
```

and in the `spans` filter, `&& candidate.depth >= run.depth)` becomes `&& edgeDepth(candidate, opposite) >= run.depth)`.

### `EndFields.jsx` — "Face frame stile" (Kyle, 2026-10-02)

In a face frame run the filler end is really the end stile, which can be any width, so the option reads that way. Only the label changes (the value stays `'filler'`):

```jsx
          {END_TYPES.map(([value, label]) => (
            <option key={value} value={value}>
              {value === 'filler' && run._frame ? 'Face frame stile' : label}
            </option>
          ))}
```

### NEW `src/elevation/model/__tests__/helpers/joinedRooms.js`

```js
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../../constants.js';
import { gridFromItems } from '../../grid.js';

const S = DEFAULT_SETTINGS;
export const AUTO_NONE = { type: 'none', width: null, auto: true };
const joint = { to: 'joint', jointId: 'J', offset: 0 };

/** L: a 60" run that's only a 3/4" back panel; R: a 60" run of cabinets; joined at 60. */
export function joinedRooms(wallId = 'A') {
  const base = {
    cabinetTypeId: CABINET_TYPE_IDS.BASE, z: 4, height: 30.5, depth: 24, autoCount: false,
    maxCabinetWidth: null, heightMode: 'manual', overrides: {},
  };
  return {
    id: 'room', name: 'Room', profile: { ...S.defaultProfile }, wallOrder: [wallId],
    walls: [{
      id: wallId, name: '', numberOverride: null, elevationForced: false, x1: 0, y1: 0, x2: 240, y2: 0,
      height: 96, thickness: 4.5, flipped: false, connections: { start: null, end: null }, profile: {},
      openings: [], endPanels: { start: null, end: null }, landings: { start: null, end: null }, soffits: [],
      joints: [{ id: 'J', x: 60, wallSide: 'front' }],
      runs: [
        {
          ...base, id: 'L', x: 0, width: 60,
          ends: { left: { type: 'none', width: null }, right: AUTO_NONE },
          anchors: { left: false, right: joint },
          grid: {
            id: 'L:grid', cols: [{ id: 'lc', size: null, sizeMode: 'auto' }],
            rows: [{ id: 'L:row', size: null, sizeMode: 'auto' }],
            cells: [{ col: 0, row: 0, colSpan: 1, rowSpan: 1, node: { id: 'p', kind: 'panel', depth: 0.75, align: 'back' } }],
          },
        },
        {
          ...base, id: 'R', x: 60, width: 60,
          ends: { left: AUTO_NONE, right: { type: 'end_panel', width: null } },
          anchors: { left: joint, right: false },
          grid: gridFromItems('R', [{ id: 'r1', kind: 'cabinet', width: null }]),
        },
      ],
    }],
  };
}
```

### NEW `src/elevation/model/__tests__/jointEnds.test.js`

```js
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { syncRoom } from '../room.js';
import { AUTO_NONE, joinedRooms } from './helpers/joinedRooms.js';

const S = DEFAULT_SETTINGS;

describe('SPEC-38.3 joined ends beside a back panel', () => {
  it('gives the cabinets an end panel; the back panel run still dies into them', () => {
    const runs = syncRoom(joinedRooms(), S).walls[0].runs;
    expect(runs.find(({ id }) => id === 'R').ends.left).toEqual({ type: 'end_panel', width: null, auto: true });
    expect(runs.find(({ id }) => id === 'L').ends.right).toEqual(AUTO_NONE);
  });
});
```

### NEW `src/elevation/store/__tests__/runEndManual.test.js`

```js
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { joinedRooms } from '../../model/__tests__/helpers/joinedRooms.js';
import elevationReducer, { setRunEnd } from '../elevationSlice.js';

function state() {
  return {
    schemaVersion: 4,
    settings: {
      ...DEFAULT_SETTINGS,
      defaultProfile: { ...DEFAULT_SETTINGS.defaultProfile },
      defaultEnds: { ...DEFAULT_SETTINGS.defaultEnds },
    },
    rooms: [joinedRooms('wall-1')],
    activeRoomId: 'room',
    activeWallId: 'wall-1',
    activeWallSide: 'front',
    view: 'elevation',
    selection: { runId: null, pieceId: null, openingId: null, soffitId: null, recessId: null, wallId: 'wall-1' },
    tool: 'select',
    message: null,
  };
}

describe('SPEC-38.3 a chosen end sticks on a joined run', () => {
  it('keeps a filler chosen for a joined end through the sync', () => {
    const next = elevationReducer(state(), setRunEnd({
      wallId: 'wall-1', runId: 'R', side: 'left', end: { type: 'filler', width: null },
    }));
    expect(next.rooms[0].walls[0].runs.find(({ id }) => id === 'R').ends.left)
      .toEqual({ type: 'filler', width: null });
  });
});
```

**Count:** 842 + 2 = **844**.
