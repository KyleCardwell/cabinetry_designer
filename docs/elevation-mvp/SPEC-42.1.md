# Round 42.1 — SPEC: band returns, face frame stiles, and the wall's own parts in the DXF

Steps 324–330. Designer (324–325), geometry (326–327), designer (328–330). The API doesn't change.
Drawing rounds: 42 run bands → **42.1 band returns + stiles + wall things** → 42.2 corner profiles → 43 elevation dimensions → 44 plan → 45 plan dimensions and labels.

**Done when:**
- Two runs side by side with the same band hand it on correctly: the deeper run's crown, top mold or countertop returns past the shared side, and the shallower one meets it there.
- Toe kicks stop 1" from an end panel and 1/4" from a cabinet side.
- Face frame end stiles stay standard (1 3/4" beaded, 1 1/2" inset), with the boxes taking the leftover.
- *Export DXF* also draws wall end panels, doors and windows with their casing, soffits, recesses, projections and wing walls.

| Step | Repo | What | Tests after |
|---|---|---|---|
| **324** | designer | Band ends against a touching run (deeper returns, shallower meets it); toe kick side setbacks | 887 → **889** |
| **325** | designer | Face frame runs: end stiles stay standard, the boxes take the leftover | **890** |
| **326** | geometry | HLR: outlines that hide nothing (`opaque`), shapes drawn only from their lines (`outlined`) | 23 → **25** |
| **327** | geometry | Wall-thing kinds, `opaque`, `openEdges`, optional `runId`; `OPENINGS` layer | **28** |
| **328** | designer | `wallParts`: wall end panels, doors and windows (casing + opening) | **893** |
| **329** | designer | `wallParts`: soffits, recesses, projections, wing walls | **895** |
| **330** | designer | The payload carries `wallParts` | **895** |

Codex writes the code. This SPEC gives contracts, rules and tests. The literal test values were read from the golden fixture with today's model and a reference build of these rules, and the geometry values were checked with shapely 2.1 and ezdxf. If a test fails, fix the code, not the number, unless the number contradicts a rule here. In that case stop and say so.

---

## §1 Decisions (Kyle, 2026-10-04)

- **Band returns between runs.** When two runs touch (one's edge on the other's, overlapping in height) and both carry the same band, the **deeper** run's band (larger `frontDepth`) returns past the shared side as at a free end. That's 1/4" for a top mold, 3/4" for a countertop, 3" for a crown. The **shallower** run's band ends where the deeper one's does. At equal depths the band runs straight through. "The same band" means:
  - for a top: the same height, and both countertops (stone/wood) or both moldings (a crown carries a top mold too);
  - for a toe kick: both runs have one.

  A top still dies into a taller run, and a lower neighbour still leaves the end free. Profiles that are designed to sit flush come later with profiles.
- **Toe kick setbacks.** 3" back from the run's face (unchanged). At a free side: 1" from an end panel's face, else 1/4" back from the cabinet's side (a filler or bare end counts as the cabinet side). Where a deeper run's toe kick returns, the shallower run's toe kick runs on past its own end to meet that return. New settings in `bandDepths`: `toeKickEndPanelSetback: 1`, `toeKickSideSetback: 0.25`.
- **Face frame end stiles stay standard.** Rounding to `roundTo` (the room's cabinet rounding) is still the ideal, and a filler or filler stile still flexes so the boxes round. When nothing can flex, the end stiles keep their standard width and the boxes take the leftover. That works out to equal widths to the 1/16", with the last box taking any odd sixteenth, the same rule European runs use. Such a run gets the existing "widths not rounded" warning. Your G2 tall at 32 7/8" gets 1 3/4" stiles beaded and 1 1/2" inset. Its box goes from 29 1/2" to 29 7/8", since each stile gives back 3/16". Want two different boxes? Type one width and let the other take the rest. The real 1 9/16" (13/16" end panel matching the doors) waits for panel thickness options.
- **Layers (Kyle):** wall end panels on `PANELS`. Door and window openings and their casing on a new `OPENINGS` layer. Soffits, recesses, projections and wing walls on `WALLS`.
- **Recess edges are real corners (Kyle):** solid, and dashed only where a cabinet in front covers them (a face run crossing the recess).
- **Outlines hide nothing.** Openings, casing, soffits, recesses, projections and wing walls are outlines (`opaque: false`). They can be hidden by a cabinet in front, but never hide what's behind them, such as the cabinets inside a recess. Wall end panels are real parts and hide like any part. A wall end panel a face frame is mitered over sits just behind the frame, as round 41 did for run end panels.
- **Open edges.** An outline can leave sides open (`openEdges`). A soffit as deep as the wing wall it runs into leaves that side open. A wing wall draws its top and bottom, and its sides as lines that stop under such a soffit, as the canvas does.
- **Wall-thing parts have no `runId`.** Geometry makes `runId` optional.
- **Still for later (42.2):** neighbour-run profiles and returns at corners, wing walls' cabinets in section, and soffits from other walls that die into this one.

---

## §2 Step 324 — designer: band ends against a touching run, toe kick setbacks

**`src/elevation/model/constants.js`** (132 lines): `bandDepths` becomes

```js
  bandDepths: {
    toeKickSetback: 3,
    toeKickEndPanelSetback: 1,
    toeKickSideSetback: 0.25,
    countertopOverhang: 0.75,
    topMoldProjection: 0.25,
    crownProjection: 3,
  },
```

**`src/elevation/model/runBands.js`** (134 lines). Band ends are now worked out per band (`'toeKick'`, `'countertop'`, `'topMold'`, `'crown'`) by one helper:
- Delete `bandEnd` and the `isJointAnchor, jointMembers` import.
- Add `import { frontDepth } from './corners.js';` and import `isCountertop` beside `runTop`.
- Put these helpers after `hasToeKick`, as given:

```js
const TOP_PAST = { countertop: 'countertopOverhang', topMold: 'topMoldProjection', crown: 'crownProjection' };

/**
 * How far a band runs past a free end of a run (SPEC-42.1): a top by its overhang or projection; a
 * toe kick stops short (negative), 1" from an end panel's face, else 1/4" from the cabinet's side.
 */
function bandPast(run, side, band, settings) {
  const depths = bandDepths(settings);
  if (band !== 'toeKick') return depths[TOP_PAST[band]];
  const setback = run.ends?.[side]?.type === 'end_panel'
    ? depths.toeKickEndPanelSetback
    : depths.toeKickSideSetback;
  return -Math.min(setback, run.width / 2);
}

/** Where a band ends at a free end of a run. */
function freeEdge(run, side, band, settings) {
  return side === 'left'
    ? run.x - bandPast(run, side, band, settings)
    : run.x + run.width + bandPast(run, side, band, settings);
}

/** Whether a run carries a band of this kind on: the same top family, or a toe kick of its own. */
function carries(room, wall, run, band, settings) {
  if (band === 'toeKick') return hasToeKick(run);
  const { kind } = runTop(wall, run, resolveProfile(settings, room, wall));
  if (band === 'countertop') return isCountertop(kind);
  if (band === 'topMold') return kind === 'topMold' || kind === 'crown';
  return kind === 'crown';
}

/** The runs on the same face whose opposite edge meets this side of a run, overlapping it in height. */
function touching(wall, run, side) {
  const edge = side === 'left' ? run.x : run.x + run.width;
  return wall.runs.filter((other) => other.id !== run.id
    && Math.abs((side === 'left' ? other.x + other.width : other.x) - edge) <= EPSILON
    && Math.min(run.z + run.height, other.z + other.height) - Math.max(run.z, other.z) > EPSILON);
}

/**
 * Where a band ends on one side of a run (SPEC-42, 42.1). `band` is 'toeKick', 'countertop', 'topMold'
 * or 'crown'. Against a run that carries the band on (a top at the same height, or a toe kick): the
 * deeper run's band returns as at a free end, and the shallower one's meets it there; at equal depths it
 * runs straight through. A top dies into a taller run. Otherwise: over a wall end panel a top runs past
 * the panel; it stops at a wall or at the side of the recess the run sits in; anything else is free.
 */
function bandEdge(room, wall, run, side, band, settings) {
  const edge = side === 'left' ? run.x : run.x + run.width;
  const opposite = side === 'left' ? 'right' : 'left';
  const neighbors = touching(wall, run, side);
  const boxTop = run.z + run.height;
  if (band !== 'toeKick'
    && neighbors.some((other) => other.z + other.height > boxTop + EPSILON)) return edge;
  const carriers = neighbors.filter((other) => (band === 'toeKick'
    || Math.abs(other.z + other.height - boxTop) <= EPSILON)
    && carries(room, wall, other, band, settings));
  if (carriers.length > 0) {
    const depth = frontDepth(run, settings);
    const deepest = carriers.reduce((best, other) => (
      frontDepth(other, settings) > frontDepth(best, settings) ? other : best));
    const theirs = frontDepth(deepest, settings);
    if (depth > theirs + EPSILON) return freeEdge(run, side, band, settings);
    if (depth < theirs - EPSILON) return freeEdge(deepest, opposite, band, settings);
    return edge;
  }
  const anchor = run.anchors?.[side];
  if (anchor === true) {
    if (band === 'toeKick' || !wallEndPanelAt(room, wall, side, settings)) return edge;
    const past = bandPast(run, side, band, settings);
    return side === 'left' ? -past : wall.length + past;
  }
  if (anchor?.to === 'wall') return edge;
  if (anchor?.to === 'recess' && run._plane?.recessId === anchor.recessId) return edge;
  return freeEdge(run, side, band, settings);
}
```

- In `runBands`, replace `bandStart`, `bandFinish` and the `depths` const with one closure, and build every band rectangle with it:

```js
  /** A band's rectangle from its two ends; a blind panel takes it to the wall. */
  const band = (kind, z, height) => {
    const x = panelStart ?? bandEdge(room, wall, run, 'left', kind, settings);
    const right = panelEnd ?? bandEdge(room, wall, run, 'right', kind, settings);
    return { x, z, width: right - x, height };
  };
```

  `topMold = band('topMold', boxTop, profile.topMoldHeight)`, `crown = band('crown', boxTop + profile.crownStackHeight − profile.crownHeight, profile.crownHeight)`, `countertop = band('countertop', boxTop, top.height)` (when `isCountertop(top.kind)`). The toe kick is `band('toeKick', 0, toeKickHeight)`, kept only when `hasToeKick(run)` and its width is > 0. The conditions on `top.kind`, `bottomParts`, `chipLines` and the return value don't change.
- The JSDoc's last two sentences become "Each end follows bandEdge (SPEC-42.1); a blind panel takes every band to the wall."

`bandParts.js` and `RunGroup.jsx` don't change: they read `runBands`. The canvas picks this up.

**Tests.** In **`src/elevation/model/__tests__/runBands.test.js`** (109 lines), make these value changes:

| Where | Was | Now |
|---|---|---|
| first test, `bands.b38f2f11` | `toeKick: { x: 0, z: 0, width: 30, height: 4 }` | `toeKick: { x: 0, z: 0, width: 29, height: 4 }` |
| first test | `bands.b822e8ac.toeKick).toEqual({ x: 30, z: 0, width: 113.125, height: 4 })` | `…toEqual({ x: 29, z: 0, width: 114.125, height: 4 })` |
| recess test | `g5['1549b66c'].countertop)).toEqual([42.25, 37.75])` | `…toEqual([43, 37])` |
| recess test | `g6['677ec7a5'].toeKick)).toEqual([0, 98])` | `…toEqual([0, 100])` |
| band depths test | `toeKickSetback: 3, countertopOverhang: 0.75, topMoldProjection: 0.25, crownProjection: 3,` | the six keys in the constants order above, one per line |

Then append inside the `describe`, verbatim:

```js

  it('SPEC-42.1 the deeper of two touching runs returns its band; the shallower meets it there', () => {
    // G2: the 25" tall and the 12" upper share a crown height, so the tall's crown and top mold return
    // past its right side and the upper's start where they stop.
    const g2 = bandsOf(syncRoom(stored('G2 Face frame kitchen'), settings), 0);
    expect(span(g2.a42e9a57.crown)).toEqual([47, 32.5]);
    expect(span(g2.ab0981ca.crown)).toEqual([79.5, 92.5]);
    expect(span(g2.a42e9a57.topMold)).toEqual([49.75, 27]);
    expect(span(g2.ab0981ca.topMold)).toEqual([76.75, 95.25]);
    // G5: the face run is deeper than the recess run it touches; the countertop returns into the recess.
    const g5 = bandsOf(syncRoom(stored('G5 Recess room'), settings), 1);
    expect(span(g5['98b55b5e'].countertop)).toEqual([0, 43]);
    expect(span(g5['1549b66c'].countertop)).toEqual([43, 37]);
  });

  it('SPEC-42.1 a toe kick stops 1" from an end panel and 1/4" from a cabinet side; a shallower toe kick runs on to the deeper one', () => {
    const g1 = syncRoom(stored('G1 Euro kitchen'), settings);
    const a = bandsOf(g1, 0);
    // The tall (deeper) stops 1" short of its right end panel; the base's toe kick runs on to meet it.
    expect(span(a.b38f2f11.toeKick)).toEqual([0, 29]);
    expect(span(a.b822e8ac.toeKick)).toEqual([29, 114.125]);
    // G1 B: a free filler end, 1/4" short.
    expect(span(bandsOf(g1, 1)['4b64d096'].toeKick)).toEqual([24.875, 94.875]);
    const g2 = bandsOf(syncRoom(stored('G2 Face frame kitchen'), settings), 0);
    expect(span(g2.a42e9a57.toeKick)).toEqual([51, 24.5]);
    expect(span(g2['860a1197'].toeKick)).toEqual([75.5, 71.6875]);
  });
```

In **`src/elevation/model/__tests__/bandParts.test.js`** (60 lines):

| Was | Now |
|---|---|
| ``[`${TALL}:toe_kick`, 'toe_kick', 0, 0, 30, 4, 0, 22, false],`` | ``[`${TALL}:toe_kick`, 'toe_kick', 0, 0, 29, 4, 0, 22, false],`` |
| ``[`${BASE}:toe_kick`, 'toe_kick', 30, 0, 113.125, 4, 0, 21, false],`` | ``[`${BASE}:toe_kick`, 'toe_kick', 29, 0, 114.125, 4, 0, 21, false],`` |
| `x: 0, z: 0, width: 30, height: 4, back: 0, front: 22, coversBoxEdges: false,` | `x: 0, z: 0, width: 29, height: 4, back: 0, front: 22, coversBoxEdges: false,` |
| ``.toEqual([`${frameRun}:crown`, 'crown', 47, 91.5, 29.5, 4.5, 0, 28.8125, false]);`` | ``.toEqual([`${frameRun}:crown`, 'crown', 47, 91.5, 32.5, 4.5, 0, 28.8125, false]);`` |

**Count:** 887 + 2 = **889**. Golden snapshot unchanged.

---

## §3 Step 325 — designer: face frame end stiles stay standard

**`src/elevation/model/splitRun.js`** (638 lines), in `splitRunLegacy`:
1. Delete the whole `} else if (nAuto > 0 && run._frame) { … }` branch (the SPEC-38.3 comment, `floorTo(available / nAuto, settings.roundTo)`, and the `stileExtra` split). A face frame run with nothing flexible now falls through to the next branch, `} else if (nAuto > 0) {`, like a European run: `roundTo(available / nAuto, FILLER_STEP)` plus the `widths-not-rounded` warning.
2. Delete `const stileExtra = { left: 0, right: 0 };`.
3. In `computedItems`: `if (flex === 0 && !run._frame && !hasAvailableError && autoIndex === lastAutoIndex)` → `if (flex === 0 && !hasAvailableError && autoIndex === lastAutoIndex)` (the last box takes any odd sixteenth).
4. `const leftGap = endGaps.left + stileExtra.left;` → `const leftGap = endGaps.left;`, and the same for the right.

Nothing else changes. The `flex > 0` branch (fillers and filler stiles flex, boxes round to `roundTo`) stays exactly as it is. The two comments in `frames.js` that mention "any stile leftover" can stay. They're harmless now that the leftover is always 0.

**Test updates**, each a plain replacement:

`src/elevation/model/__tests__/faceFrameEnds.test.js` (65 lines):

```js
    // Joined left: a bead gap each end; the boxes take the rest (SPEC-42.1), 29 1/4 each.
    expect(shown(splitRun(run(90, ['none', 'end_panel'], 3, JOINED_LEFT), S))).toEqual([
      ['cabinet', 0.25, 29.25], ['cabinet', 30, 29.25], ['cabinet', 59.75, 29.25], ['end_panel', 89.25, 0.75],
    ]);
```
(replacing the "Joined left: bead + half the leftover each end." comment and its `expect`), and

```js
  it('SPEC-42.1 keeps the stiles standard: the boxes take the leftover, the last one the odd sixteenth', () => {
    expect(shown(splitRun(run(65.1875, ['none', 'end_panel'], 2, JOINED_LEFT), S))).toEqual([
      ['cabinet', 0.25, 31.75], ['cabinet', 32.5, 31.6875], ['end_panel', 64.4375, 0.75],
    ]);
```
(replacing the `it('floors the left half of an odd leftover to a sixteenth'` header and its `expect`), and

```js
  it('gives an unbeaded inset run no bead gap and a free end its overhang; the boxes take the rest', () => {
    const plain = run(60, ['none', 'end_panel'], 2, { _seamGap: 0, _frame: { ...BEADED, bead: 0 } });
    expect(shown(splitRun(plain, S))).toEqual([
      ['cabinet', 0.75, 29.25], ['cabinet', 30, 29.25], ['end_panel', 59.25, 0.75],
    ]);
```
(replacing the `it('gives an unbeaded inset run no bead gap, a free end its overhang, and the stile leftover'` header, its `plain` and its `expect`).

`src/elevation/model/__tests__/faceFrameDieIn.test.js` (96 lines):

```js
  it('keeps the bead-only gap where the neighbour is only as deep (a 1" stile; the boxes take the rest)', () => {
    const room = g2({ tallDepth: 24 });
    expect(frameOf(room, 'B')).toEqual({
      leftEnd: 'none', dieIn: undefined,
      boxes: [[76.75, 34.375], [111.625, 34.375]], leftStile: 1, rightStile: 1.75, openings: [32.875, 32.875],
    });
```
(replacing the `'… (1" stile plus the 3/8 leftover)'` header and its `expect`), and in the mitered wall end panel test the header becomes `it('gives the end a bead gap only: 1 3/4 over the panel; the boxes take the rest', () => {` with its comment and `expect` replaced by:

```js
    // 94 3/4 (to the panel) − 1 die-in gap − 1/4 bead − 1 seams = 92 1/2 → 30 13/16, 30 13/16 and the
    // last 30 7/8 (SPEC-42.1: the stiles stay 1 3/4, the last box takes the odd sixteenth).
    expect(frameOf(room, 'U')).toMatchObject({
      boxes: [[77.5, 30.8125], [108.8125, 30.8125], [140.125, 30.875]],
      leftStile: 1.75,
      rightStile: 1.75,
      openings: [29.3125, 29.3125, 29.375],
    });
```

`src/elevation/model/__tests__/faceFrameEndsRoom.test.js` (57 lines):

```js
    // 60 − 1 1/2 panels − 1/2 seam − 1/2 bead gaps = 57 1/2 → two 28 3/4 boxes (SPEC-42.1).
    expect(frameOf('B')).toEqual({ region: [100, 60], openings: [27.25, 27.25] });
```

`src/elevation/model/__tests__/frameEnds.test.js` (136 lines):

| Was | Now |
|---|---|
| `….box.width]).toEqual([1, 47]);` | `….box.width]).toEqual([0.75, 47.25]);` |
| `openings).toEqual([{ path: 'r', x: 1.75, z: 5.5, width: 45.5, height: 27.5 }]);` | `openings).toEqual([{ path: 'r', x: 1.5, z: 5.5, width: 45.75, height: 27.5 }]);` |
| `….box.width]).toEqual([1.875, 46.5]);` | `….box.width]).toEqual([1.5, 46.875]);` |
| `.toEqual([['Fa', 1, 48], ['Fb', 48, 95]]);` | `.toEqual([['Fa', 0.75, 48], ['Fb', 48, 95.25]]);` |
| the chain: `{ start: 0, end: 1.75, kind: 'frame', … }`, `{ start: 1.75, end: 47.25, … 'Fa' }`, `{ start: 48.75, end: 94.25, … 'Fb' }`, `{ start: 94.25, end: 96, … }` | `end: 1.5`; `start: 1.5`; `end: 94.5`; `start: 94.5` |

`src/elevation/model/__tests__/frameFixes.test.js` (130 lines): `.toEqual([['a', 24.875, 42.875, 0, 24], ['b', 42.875, 61.875, 0, 24]]);` → `.toEqual([['a', 24.75, 42.75, 0, 24], ['b', 42.75, 62, 0, 24]]);`

**NEW `src/elevation/model/__tests__/faceFrameStiles.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveWall, syncRoom } from '../room.js';
import { runScene } from '../runScene.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const TALL = 'a42e9a57-a98f-47f0-b6b4-9076b513db6e';

/** Kyle's G2 tall at 32 7/8" (one column, end panels both sides) in a cabinet style. */
function tall(cabinetStyleId) {
  const copy = structuredClone(document.rooms.find(({ name }) => name === 'G2 Face frame kitchen'));
  copy.style = { ...copy.style, cabinetStyleId };
  const stored = copy.walls[0].runs.find(({ id }) => id === TALL);
  stored.x = 76.5 - 32.875;
  stored.width = 32.875;
  const room = syncRoom(copy, settings);
  const view = resolveWall(room, room.walls[0]);
  const scene = runScene(room, view, view.runs.find(({ id }) => id === TALL), settings);
  const [region] = scene.frames.regions;
  const { box, openings } = scene.faceLayouts.get(region.cabinetIds[0]);
  return {
    box: box.width,
    leftStile: openings[0].x - region.x,
    rightStile: region.x + region.width - openings[0].x - openings[0].width,
  };
}

describe('SPEC-42.1 face frame end stiles stay standard', () => {
  it('gives the box the leftover instead of widening the stiles (G2 tall at 32 7/8)', () => {
    expect(tall(15)).toEqual({ box: 30.875, leftStile: 1.75, rightStile: 1.75 });
    expect(tall(14)).toEqual({ box: 31.375, leftStile: 1.5, rightStile: 1.5 });
  });
});
```

(Before the change it gives 30 1/2 with 1 15/16 stiles, and 31 with 1 11/16.)

**Golden snapshot:** exactly one change is expected. In G2, the back face's panel-only run (`2c8ab1e3…`) now fills its space: its panel goes 0 3/4 → 78 1/2 (77 3/4 wide), where it was 0 7/8 → 78 3/8 (77 1/2). This shows up in the parts list width, the wall row, the layout piece and the plan face/span. Check the diff shows only that, then update it with `npx vitest run src/elevation/model/__tests__/golden.test.js -u`. If anything else in the snapshot changes, stop and say so.

**Count:** 889 + 1 = **890**.

---

## §4 Step 326 — geometry: outlines that hide nothing, shapes drawn from their lines

**`src/projection/hlr.py`** (73 lines). `HlrShape` gains two fields, last:

```python
    opaque: bool = True         # hides what's behind it; an outline (recess, opening, soffit) doesn't (SPEC-42.1)
    outlined: bool = True       # draws the polygon's boundary; False draws only `lines` (SPEC-42.1)
```

In `hidden_line_removal`, for each shape:
- What it draws is its polygon's boundary (only when `outlined`) plus a `LineString` per entry of `lines`. Take the single geometry as is, or `unary_union` them when there are several. When there's nothing to draw, its result is `([], [])`.
- `nearer` only counts shapes that are `opaque`: `[other for other in shapes if other.opaque and other.front > shape.front + EPSILON]`.

Everything else stays (visible, dashing, drop_hidden, the box rule).

**Append to `tests/test_hlr.py`** (117 lines), verbatim:

```python


def test_an_outline_that_is_not_opaque_hides_nothing():
    result = _run(
        HlrShape("recess", rect_polygon(60, 0, 48, 96), 0, opaque=False),
        HlrShape("inside", rect_polygon(80, 4, 20, 30.5), -12, is_box=True),
        HlrShape("face", rect_polygon(40, 4, 30, 30.5), 24, is_box=True),
    )
    assert _length(result["inside"][0]) == pytest.approx(101)  # all of it, though the recess outline is nearer
    assert result["inside"][1] == []
    visible, hidden = result["recess"]
    assert _length(hidden) == pytest.approx(30.5)  # its left edge behind the face cabinet, dashed
    assert _length(visible) == pytest.approx(288 - 30.5)


def test_a_shape_without_its_outline_draws_only_its_lines():
    wing = HlrShape(
        "wing", rect_polygon(72, 0, 4.5, 96), 30, outlined=False,
        lines=(((72, 0), (76.5, 0)), ((72, 0), (72, 84))),
    )
    visible, hidden = _run(wing)["wing"]
    assert _length(visible) == pytest.approx(88.5)
    assert hidden == []
    assert _run(HlrShape("bare", rect_polygon(0, 0, 1, 1), 0, outlined=False))["bare"] == ([], [])
```

**Count:** 23 + 2 = **25**.

---

## §5 Step 327 — geometry: wall-thing kinds, `opaque`, `openEdges`

**`src/drawing/models.py`** (75 lines), `PayloadPart`:
- `kind` adds a line `"wall_end_panel", "opening", "casing", "soffit", "recess", "projection", "wing_wall",` after the `"light_rail", …` line.
- `runId: str` → `runId: str | None = None`.
- After `profileId`: `opaque: bool = True` and `openEdges: list[Literal["left", "right", "top", "bottom"]] = []`.

**`src/drawing/elevation_dxf.py`** (83 lines):
- `KIND_LAYERS` adds `"wall_end_panel": "PANELS"`, `"opening"` and `"casing"` → `"OPENINGS"`, and `"soffit"`, `"recess"`, `"projection"`, `"wing_wall"` → `"WALLS"`.
- A helper above `build_elevation_dxf`, as given:

```python
def _edge_lines(part) -> tuple:
    """A part's own lines, plus its rectangle's sides when some are left open (SPEC-42.1)."""
    lines = tuple(((line.x1, line.z1), (line.x2, line.z2)) for line in part.lines)
    if not part.openEdges:
        return lines
    left, right, bottom, top = part.x, part.x + part.width, part.z, part.z + part.height
    sides = {
        "bottom": ((left, bottom), (right, bottom)),
        "right": ((right, bottom), (right, top)),
        "top": ((left, top), (right, top)),
        "left": ((left, bottom), (left, top)),
    }
    return tuple(side for name, side in sides.items() if name not in part.openEdges) + lines
```

- Each `HlrShape` gets `lines=_edge_lines(part)`, `opaque=part.opaque`, `outlined=not part.openEdges`.

**`src/dxf/writer.py`** (104 lines): after `MOLDINGS` in `LAYER_DEFS`, `"OPENINGS":   (40, "CONTINUOUS"),`.

**NEW `tests/fixtures/walls_payload.json`**, verbatim. It has a face cabinet crossing a recess edge, a cabinet inside the recess, a wall end panel, a door with casing, a soffit open on its right, and a wing wall whose right side stops at 84:

```json
{
  "payloadVersion": 1,
  "units": "in",
  "room": { "id": "spec-42-1", "name": "Wall things" },
  "elevations": [
    {
      "key": "wall-1", "letter": "A", "wallId": "wall-1",
      "side": "front", "title": "Elevation A", "wallLabel": "Wall 1", "length": 120, "height": 96,
      "parts": [
        {"id": "box-face", "kind": "cabinet", "runId": "run-face", "x": 40, "z": 4, "width": 30, "height": 30.5, "back": 0, "front": 24, "coversBoxEdges": false},
        {"id": "box-recess", "kind": "cabinet", "runId": "run-recess", "x": 80, "z": 4, "width": 20, "height": 30.5, "back": -12, "front": 12, "coversBoxEdges": false},
        {"id": "wall-1:endPanel:end", "kind": "wall_end_panel", "x": 119.25, "z": 0, "width": 0.75, "height": 34.5, "back": -12.875, "front": 24.875, "coversBoxEdges": false},
        {"id": "D1:casing", "kind": "casing", "x": 2, "z": 0, "width": 36, "height": 83, "back": 0, "front": 0.75, "coversBoxEdges": false, "opaque": false},
        {"id": "D1", "kind": "opening", "x": 5, "z": 0, "width": 30, "height": 80, "back": -4.5, "front": 0, "coversBoxEdges": false, "opaque": false},
        {"id": "S1", "kind": "soffit", "x": 0, "z": 84, "width": 60, "height": 12, "back": 0, "front": 14, "coversBoxEdges": false, "opaque": false, "openEdges": ["right"]},
        {"id": "R1", "kind": "recess", "x": 60, "z": 0, "width": 48, "height": 96, "back": -12, "front": 0, "coversBoxEdges": false, "opaque": false},
        {"id": "W2", "kind": "wing_wall", "x": 112, "z": 0, "width": 4.5, "height": 96, "back": 0, "front": 30, "coversBoxEdges": false, "opaque": false, "openEdges": ["left", "right"],
          "lines": [{"x1": 112, "z1": 0, "x2": 112, "z2": 96}, {"x1": 116.5, "z1": 0, "x2": 116.5, "z2": 84}]}
      ]
    }
  ]
}
```

**NEW `tests/test_elevation_walls.py`** (3 tests), verbatim:

```python
"""Wall end panels, openings, soffits, recesses and wing walls (SPEC-42.1)."""

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
PAYLOAD = json.loads((ROOT / "tests" / "fixtures" / "walls_payload.json").read_text())


def _archive(payload):
    return zipfile.ZipFile(io.BytesIO(base64.b64decode(draw(payload)["zip_base64"])))


def _modelspace(payload):
    dxf = _archive(payload).read("elevation-A.dxf").decode("utf-8")
    return ezdxf.read(io.StringIO(dxf)).modelspace()


def _lines(msp, layer):
    return list(msp.query(f'LINE[layer=="{layer}"]'))


def _length(lines):
    return sum(line.dxf.start.distance(line.dxf.end) for line in lines)


def test_wall_things_draw_on_panels_openings_and_walls():
    msp = _modelspace(PAYLOAD)
    assert _length(_lines(msp, "PANELS")) == pytest.approx(70.5)  # the wall end panel
    assert len(_lines(msp, "OPENINGS")) == 8  # casing and opening, both whole
    assert _length(_lines(msp, "OPENINGS")) == pytest.approx(458)
    assert len(_lines(msp, "WALLS")) == 12  # recess 5, soffit 3, wing wall 4
    assert _length(_lines(msp, "WALLS")) == pytest.approx(578.5)


def test_outlines_hide_nothing_but_are_hidden_behind_cabinets():
    msp = _modelspace(PAYLOAD)
    # Both boxes draw whole: the one in the recess isn't hidden by the recess outline in front of it.
    assert _length(_lines(msp, "CABINETS")) == pytest.approx(222)
    hidden = _lines(msp, "HIDDEN")
    assert len(hidden) == 1  # the recess's left edge behind the face cabinet
    assert [hidden[0].dxf.start.x, hidden[0].dxf.end.x] == pytest.approx([60, 60])
    assert sorted([hidden[0].dxf.start.y, hidden[0].dxf.end.y]) == pytest.approx([4, 34.5])


def test_open_edges_round_trip_and_bad_values_are_rejected():
    stored = json.loads(_archive(PAYLOAD).read("payload.json"))
    assert stored == PAYLOAD  # runId left out, opaque and openEdges kept
    for patch in ({"openEdges": ["front"]}, {"opaque": "maybe"}, {"kind": "window"}):
        bad = copy.deepcopy(PAYLOAD)
        bad["elevations"][0]["parts"][5].update(patch)
        with pytest.raises(ValidationError):
            draw(bad)
```

**`README.md`** (62 lines): Layers table rows `wall_end_panel` → `PANELS` (add to the `end_panel`, `panel` row), `opening`, `casing` → `OPENINGS`, and `soffit`, `recess`, `projection`, `wing_wall` → `WALLS`. Add one sentence: "Openings, casing, soffits, recesses, projections and wing walls are outlines (`opaque: false`): they can be hidden but hide nothing; `openEdges` leaves sides of a part's rectangle undrawn (SPEC-42.1)."

**Count:** 25 + 3 = **28**. Everything from rounds 40–42 still passes.

---

## §6 Step 328 — designer: `wallParts`, wall end panels and openings

**NEW `src/elevation/model/wallParts.js`.** Write it as given:

```js
import { openingGeometry } from './openings.js';
import { openingPlanDepths } from './recesses.js';
import { resolveWall } from './room.js';
import { runScene } from './runScene.js';
import { wallEndPanelPartKey } from './parts.js';
import { wallEndPanels } from './wallEndPanels.js';

const EPSILON = 1e-6;

/**
 * The wall's own things on one face as geometry draws them (SPEC-42.1): wall end panels, then each door
 * or window (its casing, then its opening), then soffits, recesses and projections, then wing walls.
 * Only wall end panels hide what's behind them; the rest are outlines (`opaque: false`). None has a run.
 */
export function wallParts(room, wall, side, settings) {
  const view = resolveWall(room, wall, side);
  const source = view.sideSource ?? view;
  const parts = [];
  const emit = (part) => {
    if (part.width > EPSILON && part.height > EPSILON) parts.push(part);
  };
  const outline = (id, kind, rect, back, front, extra = {}) => emit({
    id, kind, x: rect.x, z: rect.z, width: rect.width, height: rect.height, back, front,
    coversBoxEdges: false, opaque: false, ...extra,
  });

  for (const panel of wallEndPanels(room, view, settings)) {
    const mine = panel[side];
    const theirs = panel[side === 'front' ? 'back' : 'front'];
    // A face frame mitered over the panel's edge sits in front of it (SPEC-36.2, as in round 41).
    const miter = Math.max(0, ...view.runs
      .filter((run) => run._frame && mine.runIds.includes(run.id)
        && runScene(room, view, run, settings).frames.regions
          .some((region) => (region.wallPanels ?? []).some((covered) => covered.side === mine.side)))
      .map((run) => run._frame.thickness));
    emit({
      id: wallEndPanelPartKey(source.id, panel.endpoint),
      kind: 'wall_end_panel',
      x: mine.x,
      z: 0,
      width: panel.width,
      height: panel.top,
      back: -(panel.thickness + theirs.depth),
      front: mine.depth - miter,
      coversBoxEdges: false,
    });
  }

  for (const opening of view.openings ?? []) {
    const geometry = openingGeometry(opening, view.length, settings);
    const face = side === 'front' ? openingPlanDepths(source, opening).face : 0;
    if (geometry.casing) {
      outline(`${opening.id}:casing`, 'casing', geometry.casing, face, face + (opening.casing?.thickness ?? 0));
    }
    outline(opening.id, 'opening', geometry.jamb, face - source.thickness, face);
  }

  return parts;
}
```

Notes:
- `wallEndPanels(room, view, settings)` takes the resolved face (it reads `sideSource`). `panel.front` and `panel.back` are the two wall faces' sides `{ side, x, depth, top, runIds }`.
- A back face's openings come mirrored already (`resolveWall`). On the back face an opening sits at that face (0). On the front face it sits at its plane (`openingPlanDepths(...).face`: 0, or −depth in a recess back).

Export from `model/index.js` (one line at the end): `export { wallParts } from './wallParts.js';`.

**NEW `src/elevation/model/__tests__/wallParts.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { wallParts } from '../wallParts.js';
import { syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);
const room = (name) => syncRoom(stored(name), settings);
const partsOf = (synced, wallIndex, side = 'front') => wallParts(synced, synced.walls[wallIndex], side, settings);
const row = ({ id, kind, x, z, width, height, back, front }) => [id, kind, x, z, width, height, back, front];

const ISLAND = '84063fed-ab0d-4a1d-ae05-ffe67decad5e';
const PENINSULA = '64da569f-6c94-408d-809a-37c6e1f9755f';

describe('SPEC-42.1 wall parts', () => {
  it('draws an island\'s wall end panels through the wall, as deep as the runs on this side', () => {
    const g1 = room('G1 Euro kitchen');
    expect(partsOf(g1, 3).map(row)).toEqual([
      [`${ISLAND}:endPanel:start`, 'wall_end_panel', 90.75, 0, 0.75, 34.5, -12.875, 24.875],
      [`${ISLAND}:endPanel:end`, 'wall_end_panel', 0, 0, 0.75, 34.5, -12.875, 24.875],
    ]);
    expect(partsOf(g1, 3, 'back').map(row)).toEqual([
      [`${ISLAND}:endPanel:start`, 'wall_end_panel', 0, 0, 0.75, 34.5, -24.875, 12.875],
      [`${ISLAND}:endPanel:end`, 'wall_end_panel', 90.75, 0, 0.75, 34.5, -24.875, 12.875],
    ]);
    expect(partsOf(g1, 3)[0]).toEqual({
      id: `${ISLAND}:endPanel:start`, kind: 'wall_end_panel',
      x: 90.75, z: 0, width: 0.75, height: 34.5, back: -12.875, front: 24.875, coversBoxEdges: false,
    });
  });

  it('puts a wall end panel a face frame is mitered over behind the frame (G2 peninsula)', () => {
    const g2 = room('G2 Face frame kitchen');
    expect(row(partsOf(g2, 1)[0]))
      .toEqual([`${PENINSULA}:endPanel:end`, 'wall_end_panel', 77.75, 0, 0.75, 34.5, -24, 24]);
    // The back face's run is only a back panel: no frame, so nothing is mitered over it.
    expect(row(partsOf(g2, 1, 'back')[0]))
      .toEqual([`${PENINSULA}:endPanel:end`, 'wall_end_panel', 0, 0, 0.75, 34.5, -24.8125, 24]);
  });

  it('draws a door or window as its casing and its opening, outlines that hide nothing', () => {
    const window = '93ab97a1-ce31-4283-8240-ead92a6ae665';
    expect(partsOf(room('G1 Euro kitchen'), 0)).toEqual([
      {
        id: `${window}:casing`, kind: 'casing', x: 45, z: 39, width: 54, height: 54,
        back: 0, front: 0.75, coversBoxEdges: false, opaque: false,
      },
      {
        id: window, kind: 'opening', x: 48, z: 42, width: 48, height: 48,
        back: -4.5, front: 0, coversBoxEdges: false, opaque: false,
      },
    ]);
    const door = '6c5010bf-ce59-494b-8c69-b37f33af3e70';
    expect(partsOf(room('G2 Face frame kitchen'), 0).map(row)).toEqual([
      [`${door}:casing`, 'casing', 2, 0, 42, 83, 0, 0.75],
      [door, 'opening', 5, 0, 36, 80, -4.5, 0],
    ]);
  });
});
```

**Count:** 890 + 3 = **893**. Golden snapshot unchanged.

---

## §7 Step 329 — designer: soffits, recesses, projections, wing walls

In `wallParts`, after the openings loop and before `return parts;`, add, as given:

```js
  for (const soffit of soffitsOn(view)) {
    const flush = soffitFlushSides(room, view, soffit);
    const openEdges = ['left', 'right'].filter((edge) => flush[edge]);
    outline(soffit.id, 'soffit', {
      x: soffit.x, z: soffit.bottom, width: soffit.width, height: view.height - soffit.bottom,
    }, 0, soffit.depth, openEdges.length > 0 ? { openEdges } : {});
  }

  for (const recess of recessesOn(view)) {
    const geometry = recessGeometry(recess, view.length, view.height);
    const rect = { x: geometry.x, z: geometry.bottom, width: geometry.width, height: geometry.top - geometry.bottom };
    if (geometry.plane < 0) outline(recess.id, 'recess', rect, geometry.plane, 0);
    else outline(recess.id, 'projection', rect, 0, geometry.plane);
  }

  const seams = soffitSeams(room, view);
  for (const { wallId, a, b } of landingsOn(room, view)) {
    const landed = room.walls.find((candidate) => candidate.id === wallId);
    if (!landed) continue;
    // A soffit as deep as the wing wall runs over it: the wing wall's sides stop at its bottom.
    const sideTop = (x) => seams.find((seam) => seam.wallId === wallId && Math.abs(seam.x - x) <= EPSILON)
      ?.bottom ?? landed.height;
    outline(wallId, 'wing_wall', { x: a, z: 0, width: b - a, height: landed.height },
      0, landingProjection(room, view, wallId) ?? 0, {
        openEdges: ['left', 'right'],
        lines: [a, b].map((x) => ({ x1: x, z1: 0, x2: x, z2: sideTop(x) })),
      });
  }
```

New imports: `landingProjection`, `landingsOn` from `./landings.js`, `recessGeometry`, `recessesOn` (beside `openingPlanDepths`) from `./recesses.js`, and `soffitFlushSides`, `soffitSeams`, `soffitsOn` from `./soffits.js`. These are the same calls `SoffitShapes`, `RecessShapes` and `NeighborReturns` already make, so canvas and DXF agree.

**Append to `wallParts.test.js`** inside the `describe`, verbatim:

```js

  it('outlines a soffit and a wing wall; a soffit as deep as the wing wall runs over it (G3)', () => {
    const soffit = '5ac8edd3-2c75-476d-bc64-f80ade3f5fba';
    const wing = '5ab00c5d-9ea6-4d32-9586-d266db26a4d2';
    expect(partsOf(room('G3 Bath alcove'), 1)).toEqual([
      {
        id: soffit, kind: 'soffit', x: 0, z: 84, width: 72, height: 12,
        back: 0, front: 14, coversBoxEdges: false, opaque: false,
      },
      {
        id: wing, kind: 'wing_wall', x: 72, z: 0, width: 4.5, height: 96,
        back: 0, front: 30, coversBoxEdges: false, opaque: false,
        openEdges: ['left', 'right'],
        lines: [{ x1: 72, z1: 0, x2: 72, z2: 96 }, { x1: 76.5, z1: 0, x2: 76.5, z2: 96 }],
      },
    ]);
    const flush = structuredClone(stored('G3 Bath alcove'));
    flush.walls[1].soffits[0].depth = 30;
    const [deep, wall] = partsOf(syncRoom(flush, settings), 1);
    expect(deep.openEdges).toEqual(['right']);
    expect(wall.lines).toEqual([{ x1: 72, z1: 0, x2: 72, z2: 84 }, { x1: 76.5, z1: 0, x2: 76.5, z2: 96 }]);
  });

  it('outlines a recess at the wall face and a projection out from it (G5)', () => {
    const r1 = '61c07d7e-ec8b-4306-9825-9f3decfb5fa1';
    const r2 = '56ed5f83-a17f-4d5b-9bcf-b72501cecc4d';
    expect(partsOf(room('G5 Recess room'), 1).map(row)).toEqual([
      [r1, 'recess', 32, 0, 48, 96, -12, 0],
      [r2, 'recess', 140, 0, 48, 96, -24, 0],
    ]);
    const built = structuredClone(stored('G5 Recess room'));
    Object.assign(built.walls[1].recesses[0], { kind: 'projection', bottom: 6, height: 60 });
    expect(row(partsOf(syncRoom(built, settings), 1)[0])).toEqual([r1, 'projection', 32, 6, 48, 60, 0, 12]);
  });
```

**Count:** 893 + 2 = **895**.

---

## §8 Step 330 — designer: the payload carries the wall's parts

**`src/elevation/model/drawingPayload.js`** (50 lines): `parts` becomes `[...elevationParts(…), ...bandParts(…), ...wallParts(room, wall, side, settings)]` (import `wallParts` from `./wallParts.js`). In the doc comment, "round 41 adds each face's parts; round 42 its bands." becomes "round 41 adds each face's parts; round 42 its bands; 42.1 the wall's own parts." `DRAWING_PAYLOAD_VERSION` stays 1.

**`src/elevation/model/__tests__/drawingPayload.test.js`** (74 lines):
- add `import { wallParts } from '../wallParts.js';` after the `elevationParts` import;
- in the last test: the title becomes `'SPEC-42.1 carries each wall face\'s parts, then its bands, then the wall\'s own parts'`, the counts `[30, 26, 11, 11]` become `[32, 26, 13, 13]`, and `...wallParts(synced, wall, elevation.side, settings),` goes after the `bandParts` line in the expected array.

**Count:** stays **895**. Gate: `npm test && npm run lint && npm run build`.

**End-to-end check (Kyle):** geometry on `feature/drawing` with 326–327 in; API and designer as in round 42. *Export DXF*:
- **G1 A:** the window's casing and opening on OPENINGS. The tall's toe kick stops 1" short of its right end panel, and the base's toe kick runs on to meet it.
- **G1 C/D (island):** both wall end panels on PANELS, with the countertop running 3/4" past them.
- **G2 A:** the door's casing and opening. The tall's crown returns 3" past its right side over the upper, and the upper's crown starts there. On the canvas, after 325, the tall's stiles are standard.
- **G2 B:** the peninsula's wall end panel dashed where the frame covers it.
- **G3:** the soffit and the wing wall on WALLS.
- **G5:** both recesses on WALLS, with R1's left edge dashed behind the face run's cabinet. The face run's countertop returns 3/4" into R1, and the recess run's starts there.
