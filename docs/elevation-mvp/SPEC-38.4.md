# Elevation Lab — SPEC-38.4 (a joined end that dies into a deeper run)

Step **286.1**, after 38.3 (step 286, `fcfae28`) and before the consolidation (round 39 keeps its step numbers, 287–299; every test count in it goes up by 3). Baseline **844**.

This code **was run** before it was written up: in a scratch copy of `fcfae28`, the full suite passed at **847** and lint was clean. The new test file fails on `fcfae28` (2 of 3 tests: the third guards behaviour that doesn't change) and passes with the change.

| Step | What | Tests after |
|---|---|---|
| **286.1** | A face frame run's None end that is joined to a deeper run, or that a mitered wall end panel covers, gets the right stile: 1 3/4" | 847 |

## §1 What's wrong, and the rule (Kyle, 2026-10-02)

Kyle's G2 (beaded inset): a 25" deep tall, with the base (24") and upper (12") joined to its right side. Both joined ends are None (the tall is deeper, so they die into its side). The upper's left stile reads **1"**; it should read **1 3/4"**. The base only got 1 3/4" because Kyle forced an end panel there, which adds a part that shouldn't exist.

Kyle: *the None end should match the face frame rail widths, because it doesn't have anything on its other side: just the 1 1/2" frame plus the 1/4" bead, so 1 3/4".*

Why it's 1" today: SPEC-38.3 §1b made every joined end "not free": a bead gap, then the frame covers 3/4" of the box (1/4 + 3/4 = 1"). That's right where two runs of the same depth meet (each frame brings 1", so the joint reads as a 2" seam stile). It's wrong where the run dies into a **deeper** run: nothing is beyond the stile there, so it's a full stile.

The same rule also fixes a 38.3 regression with **wall end panels**: a None end beside a mitered wall end panel was being treated as free, so the stile came out as panel + overhang + bead + 3/4 over the box (2 1/2" in a beaded run, 2 5/8" in SPEC-36.2's unbeaded island test). It should be the same as a run's own mitered end panel: 3/4 panel + bead + 3/4 over the box = 1 3/4" (1 1/2" unbeaded), plus any leftover.

Rules, for a face frame run's end of type **None** next to a cabinet:

| What's at the end | End gap | Stile (no leftover) |
|---|---|---|
| Nothing (not joined, no wall panel): free | overhang 3/4 + bead | 1 3/4 (as 38.3) |
| **Joined (joint or follow) to a deeper run** over the run's whole height, or to a leader's extended end panel that covers it | overhang 3/4 + bead | **1 3/4 (new)** |
| Joined to a run only as deep (or shallower, but then the auto end is an end panel) | bead | 1 (as 38.3; the two frames read as one 2" seam stile) |
| **Mitered wall end panel** | bead | **3/4 panel + bead + 3/4 = 1 3/4 (fixed)** |
| Wall end panel the frame dies into (butt) | overhang 3/4 + bead | 1 3/4 (as 38.3) |

Any stile leftover (SPEC-38.3 §2) still adds to these. "Deeper" uses the same edge depth `endIsCovered` already uses (SPEC-38.3 §4: the neighbour's edge cells' own depths), compared strictly (> run depth).

**Kyle's G2 after the fix** (with the base's left end set back to None): base boxes 34, 34, filler 15/16, openings 32 1/2 × 2, left stile 1 3/4; upper boxes 30 1/2 × 3, filler 1 3/4, openings 29 × 3, left stile 1 3/4.

## §2 The change

**Files:** `src/elevation/model/joints.js` (281), `src/elevation/model/room.js` (1792: the joints import ≈ 18–30, a new `withDieIns` above `withWallPanels` ≈ 635, and the tail of `syncRoom` ≈ 755–800), `src/elevation/model/splitRun.js` (632: `endGaps` ≈ 36–56 only), `src/elevation/model/__tests__/frameEnds.test.js` (expectations only), NEW `src/elevation/model/__tests__/faceFrameDieIn.test.js`.

`frames.js` doesn't change: once the gap holds the overhang, its 38.3 run-end logic already runs the frame out to the run's edge and keeps the box full width.

### `joints.js`

1. `endIsCovered` takes an option and compares strictly when asked:

```js
function endIsCovered(wall, run, side, { deeper = false } = {}) {
```

and in the `spans` filter, `&& edgeDepth(candidate, opposite) >= run.depth)` becomes

```js
      && (deeper
        ? edgeDepth(candidate, opposite) > run.depth + JOINT_EPSILON
        : edgeDepth(candidate, opposite) >= run.depth))
```

(The follow-anchor `extensionCoversEnd` shortcut at the top stays: a leader's extended end panel counts as deeper.)

2. A new export right after `jointEndTypes`:

```js
/**
 * Joined ends that die into a deeper neighbour (SPEC-38.4): per run, the joined or following sides
 * whose neighbour is deeper than the run over the run's whole height, or whose leader's extended end
 * panel covers the end.
 */
export function deeperJoinedSides(wall) {
  return new Map((wall.runs ?? []).flatMap((run) => {
    const sides = Object.fromEntries(['left', 'right'].map((side) => [
      side,
      (isJointAnchor(run.anchors?.[side]) || isFollowAnchor(run.anchors?.[side]))
        && endIsCovered(wall, run, side, { deeper: true }),
    ]));
    return sides.left || sides.right ? [[run.id, sides]] : [];
  }));
}
```

### `room.js`

1. Add `deeperJoinedSides,` to the `./joints.js` import list (just above `jointEndTypes,`).
2. A new function directly above `withWallPanels`'s doc comment:

```js
/**
 * A face frame run's joined ends that die into a deeper neighbour (SPEC-38.4): `_frame.dieIn` gives,
 * per side, an end of type None whose neighbour is deeper, so the frame's stile overhangs the box
 * there like a free end.
 */
function withDieIns(wall) {
  const deeper = deeperJoinedSides(wall);
  return {
    ...wall,
    runs: wall.runs.map((run) => {
      if (!run._frame) return run;
      const sides = deeper.get(run.id);
      const found = {
        left: Boolean(sides?.left) && run.ends.left.type === 'none',
        right: Boolean(sides?.right) && run.ends.right.type === 'none',
      };
      const { dieIn, ...frame } = run._frame;
      void dieIn;
      if (found.left || found.right) return { ...run, _frame: { ...frame, dieIn: found } };
      return dieIn === undefined ? run : { ...run, _frame: frame };
    }),
  };
}
```

3. In `syncRoom`, after the pass that sets the joint end types (the one calling `jointEndTypes(wall)`) and **before** the `syncAutoItems` pass, add the die-in pass and **move** the `withWallPanels` pass up from the end of the function (it only reads run anchors, z, height and depth, none of which `syncAutoItems` changes; `splitRun` needs the wall panel's join while sizing the boxes):

```js
  nextRoom = { ...nextRoom, walls: nextRoom.walls.map(withDieIns) };
  // SPEC-38.4: before the auto items, so splitRun knows a wall end panel's join.
  nextRoom = {
    ...nextRoom,
    walls: nextRoom.walls.map((wall) => withWallPanels(nextRoom, wall, settings)),
  };

  nextRoom = {
    ...nextRoom,
    walls: nextRoom.walls.map((wall) => ({
      ...wall,
      runs: wall.runs.map((run) => syncAutoItems(run, settings, {
        endMinWidths: endMinWidthsForRun(nextRoom, wall, run, settings),
      })),
    })),
  };

  return nextRoom;
}
```

(The old `withWallPanels` pass between the `syncAutoItems` pass and `return nextRoom;` is deleted.)

### `splitRun.js` — `endGaps`

The doc comment and the `free` test:

```js
/**
 * The gap at each real end of a face frame run (SPEC-38.3), beside a cabinet only: a beaded run's bead,
 * plus, at a free end, the stile's overhang. A None end is free unless a run of the same depth is joined
 * there or a wall end panel is mitered there; one that dies into a deeper run (`_frame.dieIn`) or into
 * a wall end panel (`join: 'butt'`) is free (SPEC-38.4). A pinned run's split points (`_pinSplit`)
 * aren't ends.
 */
```

```js
    const wallPanel = run._frame.wallPanels?.[side];
    const joined = JOINED.has(run.anchors?.[side]?.to);
    const free = run.ends[side].type === 'none' && (wallPanel
      ? wallPanel.join === 'butt'
      : !joined || run._frame.dieIn?.[side] === true);
    return bead + (free ? overhang : 0);
```

### `frameEnds.test.js` (SPEC-36.2's island; style 14, unbeaded)

Step 284 changed these to the regression's numbers. The 96" run has a mitered wall end panel on the left and an end panel on the right: 96 − 3/4 − 3/4 = 94 1/2 → 47 × 2, 1/2 over → 1/4 each end.

In "covers a flush wall end panel…":

```js
    expect([faces.get('Fa').box.x, faces.get('Fa').box.width]).toEqual([1, 47]);
    expect(faces.get('Fa').openings).toEqual([{ path: 'r', x: 1.75, z: 5.5, width: 45.5, height: 27.5 }]);
```

In "miters the frame strip and the panel, and runs the chain over the panel":

```js
    expect(plan.boxes.map(({ key, start, end }) => [key, start, end])).toEqual([['Fa', 1, 48], ['Fb', 48, 95]]);
```

```js
    expect(horizontalChains(room, wall, 'lower', S).inner).toEqual([
      { start: 0, end: 1.75, kind: 'frame', runId: 'F' },
      { start: 1.75, end: 47.25, kind: 'frame-opening', runId: 'F', pieceId: 'Fa' },
      { start: 47.25, end: 48.75, kind: 'frame', runId: 'F' },
      { start: 48.75, end: 94.25, kind: 'frame-opening', runId: 'F', pieceId: 'Fb' },
      { start: 94.25, end: 96, kind: 'frame', runId: 'F' },
    ]);
```

Nothing else in the suite changes.

### NEW `src/elevation/model/__tests__/faceFrameDieIn.test.js`

```js
import { describe, expect, it } from 'vitest';
import { cellPieces } from '../cells.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
import { frameRegions, regionOpenings } from '../frames.js';
import { gridFromItems } from '../grid.js';
import { resolveWall, syncRoom } from '../room.js';

const S = DEFAULT_SETTINGS;
const AUTO_NONE = { type: 'none', width: null, auto: true };
const PANEL = { type: 'end_panel', width: null };
const joint = { to: 'joint', jointId: 'J', offset: 0 };

function makeRun(id, type, x, width, ends, count, extra = {}) {
  const items = Array.from({ length: count }, (_, index) => ({ id: `${id}${index + 1}`, kind: 'cabinet', width: null }));
  const upper = type === CABINET_TYPE_IDS.UPPER;
  return {
    id, cabinetTypeId: type, x, width, z: upper ? 54.75 : 4,
    height: type === CABINET_TYPE_IDS.TALL ? 86 : upper ? 35.25 : 30.5,
    depth: type === CABINET_TYPE_IDS.TALL ? 25 : upper ? 12 : 24,
    ends: { left: ends[0], right: ends[1] }, autoCount: false, maxCabinetWidth: null,
    heightMode: 'manual', overrides: {}, anchors: { left: false, right: false },
    grid: gridFromItems(id, items), wallSide: 'front', ...extra,
  };
}

/** Kyle's G2 wall 1 (SPEC-38.4): a 25" tall, a 24" base and a 12" upper joined to its right side at 76 1/2. */
function g2({ tallDepth = 25, endPanels = { start: null, end: null }, upperRight = { type: 'filler', width: null } } = {}) {
  return syncRoom({
    id: 'room', name: 'Room', profile: { ...S.defaultProfile }, style: { cabinetStyleId: 15 }, wallOrder: ['A'],
    walls: [{
      id: 'A', name: '', numberOverride: null, elevationForced: false, x1: 0, y1: 0, x2: 172, y2: 0,
      height: 96, thickness: 4.5, flipped: false, connections: { start: null, end: null }, profile: {},
      openings: [], soffits: [], endPanels, landings: { start: null, end: null },
      joints: [{ id: 'J', x: 76.5, wallSide: 'front' }],
      runs: [
        makeRun('T', CABINET_TYPE_IDS.TALL, 50, 26.5, [PANEL, AUTO_NONE], 1,
          { depth: tallDepth, anchors: { left: false, right: joint } }),
        makeRun('B', CABINET_TYPE_IDS.BASE, 76.5, 70.5, [AUTO_NONE, PANEL], 2,
          { anchors: { left: joint, right: false } }),
        makeRun('U', CABINET_TYPE_IDS.UPPER, 76.5, 95.5, [AUTO_NONE, upperRight], 3,
          { anchors: { left: joint, right: true } }),
      ],
    }],
  }, S);
}

function frameOf(room, runId) {
  const wall = resolveWall(room, room.walls[0]);
  const run = wall.runs.find(({ id }) => id === runId);
  const layout = layoutRun(room, wall, run, S);
  const cells = cellPieces(run, layout);
  const [region] = frameRegions(room, run, cells, S).regions;
  const openings = regionOpenings(region, runFaceLayouts(room, wall, run, S, layout));
  return {
    leftEnd: run.ends.left.type,
    dieIn: run._frame.dieIn,
    boxes: cells.pieces.filter(({ kind }) => kind === 'cabinet').map(({ x, width }) => [x, width]),
    leftStile: openings[0].x - region.x,
    rightStile: region.x + region.width - openings.at(-1).x - openings.at(-1).width,
    openings: openings.map(({ width }) => width),
  };
}

describe('SPEC-38.4 a joined end that dies into a deeper run', () => {
  it('gives the base and the upper a 1 3/4 stile beside the deeper tall, with no end panel', () => {
    const room = g2();
    expect(frameOf(room, 'B')).toEqual({
      leftEnd: 'none', dieIn: { left: true, right: false },
      boxes: [[77.5, 34], [112, 34]], leftStile: 1.75, rightStile: 1.75, openings: [32.5, 32.5],
    });
    expect(frameOf(room, 'U')).toMatchObject({
      leftEnd: 'none', dieIn: { left: true, right: false }, leftStile: 1.75, openings: [29, 29, 29],
    });
  });

  it('keeps the bead-only gap where the neighbour is only as deep (1" stile plus the 3/8 leftover)', () => {
    const room = g2({ tallDepth: 24 });
    expect(frameOf(room, 'B')).toEqual({
      leftEnd: 'none', dieIn: undefined,
      boxes: [[77.125, 34], [111.625, 34]], leftStile: 1.375, rightStile: 2.125, openings: [32.5, 32.5],
    });
  });
});

describe('SPEC-38.4 a mitered wall end panel in a beaded run', () => {
  it('gives the end a bead gap only: 1 3/4 over the panel, plus half the 1" leftover', () => {
    const room = g2({ endPanels: { start: null, end: { width: null } }, upperRight: AUTO_NONE });
    const upper = room.walls[0].runs.find(({ id }) => id === 'U');
    expect(upper._frame.wallPanels.right).toEqual({ width: 0.75, top: 90, join: 'miter' });
    // 94 3/4 (to the panel) − 1 die-in gap − 1/4 bead − 1 seams = 92 1/2 → 30 1/2 × 3, 1/2 more each end.
    expect(frameOf(room, 'U')).toMatchObject({
      boxes: [[78, 30.5], [109, 30.5], [140, 30.5]], leftStile: 2.25, rightStile: 2.25, openings: [29, 29, 29],
    });
  });
});
```

Worked numbers:

- Base, die-in left (gap 1/4 + 3/4 = 1), end panel right (gap 1/4): 70 1/2 − 3/4 − 1 − 1/4 − 1/2 seam = 68 → 34 × 2, no leftover. Stiles 1 3/4 each side.
- Same base beside a 24" tall (not deeper): 70 1/2 − 3/4 − 1/4 − 1/4 − 1/2 = 68 3/4 → 34 × 2, 3/4 over → 3/8 each end. Left stile 1/4 + 3/8 + 3/4 = 1 3/8; right 3/4 panel + 1/4 + 3/8 + 3/4 = 2 1/8.
- Upper with a mitered wall end panel at the wall's end (the run stops at the panel, 94 3/4 wide): left gap 1 (die-in), right gap 1/4 (bead only), seams 1: 92 1/2 → 30 1/2 × 3, 1 over → 1/2 each end. Left stile 1 + 1/2 + 3/4 = 2 1/4; right 3/4 panel + 1/4 + 1/2 + 3/4 = 2 1/4.

**Count:** 844 + 3 = **847**.

## §3 What this does to round 39

- Every test count in SPEC-39 / PROMPTS-39 is **3 higher** (baseline 847; 287 → 854, …, 299 → 858).
- Line numbers: `room.js` gains 27 lines (1 in the joints import ≈ 23, 24 for `withDieIns` ≈ 636, and syncRoom's tail +7/−5 ≈ 805–825). `joints.js` gains 18 (`endIsCovered` +2, `deeperJoinedSides` +16 after `jointEndTypes`). `splitRun.js` gains about 5 in `endGaps`. Step 291/292 (C4a/C4b) must confirm each `room.js` range by its first and last names, as the round already says, and expect the shift.
- G2 (and any golden room with a joined None end beside a deeper run, or a mitered wall end panel in a face frame run) should be exported **after** 286.1.
