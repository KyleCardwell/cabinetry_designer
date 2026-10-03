# Elevation Lab — SPEC-36.2 (face frame: wall end panels, box widths, the frame as a part)

Steps 226–233, after 36.1. The plan is in `CELLS-PLAN.md` (round 36.2). SPEC-36 and SPEC-36.1 still apply. Written against `9b1b664` (step 225). Baseline **697**.

The code blocks below are written against the repo but haven't been run. If a new test is off by a small amount, check the arithmetic in the worked examples before changing the code.

| Step | What | Files | Tests after |
|---|---|---|---|
| **226** | Model: a face frame run beside a wall end panel gets `_frame.wallPanels` (auto miter or butt, overridable). A mitered panel is covered by the frame region, so the box keeps that side. | `room.js`, `frames.js`, `frameEnds.test.js` (new) | 699 |
| **227** | Model: the plan miters the frame strip and the wall end panel into each other. The chain runs the stile over the panel. The elevation shows only the uncovered part of the panel. | `wallEndPanels.js`, `planPieces.js`, `dimensions.js`, `index.js`, `frameEnds.test.js` | 701 |
| **228** | Store and saves: a wall end panel's `frame` (`'miter'` / `'butt'`). | `constants.js`, `elevationSlice.js`, `persistence.js`, both store tests | 703 |
| **229** | Screen: the "Face frame" choice on a wall end panel. The elevation draws only the uncovered part of the panel. | `WallHeightProperties.jsx`, `WallEndPanelShapes.jsx` | 703 |
| **230** | Model: `boxInsets`, how much narrower each framed box is than its slot. | `frames.js`, `index.js`, `frameParts.test.js` (new) | 704 |
| **231** | Panel: width fields and the pieces list show the box width. Typing a box width sets the slot. | `PieceProperties.jsx`, `CabinetProperties.jsx`, `CellProperties.jsx`, `RunProperties.jsx`, `RunPiecesSection.jsx` | 704 |
| **232** | Model: stiles, rails and mullions derived from a frame's openings; vertical opening chains; one part number and badge per frame. | `frames.js`, `partNumbers.js`, `index.js`, `frameParts.test.js`, `partNumbers.test.js` | 707 |
| **233** | Screen: a "Face frame" section in the panel (part number, size, stile/rail list); the vertical opening chains in the elevation. | `FrameSection.jsx` (new), `PieceProperties.jsx`, `RunGroup.jsx` | 707 |

Next: **36.3** (the per-split rail/mullion toggle, the 3/4" bottom rail on hanging bases).

## §1 The rules (Kyle, 2026-09-28)

### Wall end panels under a face frame

- A **wall end panel** (SPEC-17) on a free wall end pulls the runs anchored there back by its width. Those runs get no end piece there (`ends[side]` is `none`, auto). Before this round a face frame run treated that side as free: the stile overhung the box by 3/4", so the box lost 3/4", and the frame didn't cover the panel.
- **Mitered (the default).** The frame covers the panel's edge, the same way it covers a run end panel (SPEC-36). The region grows over the panel, the box keeps that side (not free), and the stile is panel + 3/4". In plan the frame strip and the panel meet on a miter at the front corner, and on an island each side's frame miters into its own face of the same panel. In the elevation the covered part of the panel isn't drawn. The part below the frame (the toe space, since the panel runs to the floor) still shows.
- **Dies into the panel (butt).** The panel stands proud of the frame, and the frame butts against its face. The run's side is free (box 3/4" narrower, as before), and the whole panel shows in the elevation and plan.
- **Auto** decides per run: **mitered** when the panel is no deeper than the run's front (`frontDepth`) and no taller than the run's box top. Otherwise it **butts**. The panel's bottom doesn't count, because it always goes to the floor. So a flush island panel miters on both sides. A panel beside a base and an upper is taller than the base and deeper than the upper, so both butt. On a bar-height island, the lower side butts into the taller panel and the taller side miters.
- **Override:** `wall.endPanels[endpoint].frame` is `'miter'` or `'butt'`, one setting for the whole panel (both sides). Absent means auto. It only matters to face frame runs.
- `syncRoom` stores the result on each face frame run as `_frame.wallPanels = { left, right }`, each `{ width, top, join }` or null (only when at least one side has a panel). It's never saved: `toElevationDocument` already strips `_frame`.

### Box widths in the panel (bug)

- A face frame cabinet's piece is its **frame section** (the slot, sized like Euro). Its **box** is 3/4" narrower on each free side (SPEC-36). The elevation, plan and faces already use the box. The width field and the run's pieces list still showed the slot. Example: two auto bases in a 48" space between two taller runs showed 24", but the boxes are 23 1/4".
- The width field (root cabinet, cell, column) and the run's **Pieces** list now show the **box width**. The field is labelled "Box width" when the box is narrower than its slot, and the slot is shown under it ("Frame section 24"). Typing a box width stores slot = box + the insets. Locking stores the slot, as before.

### The frame as a part (planned 36.2)

- **One part number per frame region**, key `region.id` (`frame:<first cabinet id>`), kind `'frame'`, width = the region's width. It's numbered right after its run's pieces. Its badge sits on the region one level up (like a wall end panel's).
- **Members** are derived from the region and its openings, never stored. Cut the region like a guillotine:
  1. Full-height vertical bands clear of openings are **stiles**.
  2. Between each pair of stiles, full-width horizontal bands are **rails** (top, bottom and mid rails).
  3. Between each pair of rails, full-height vertical bands are **mullions**. Then rails again, and so on.
  - A seam stile is reveal + gap + reveal. A stile over a panel is panel + reveal. The bottom rail of an upper includes the drop.
  - If a cut finds nothing in either direction (a pinwheel), the members are **null** and the panel says so.
- **Grouped** for the panel: `{ kind, width, length, count }`, stiles first. A stile's or mullion's width is across and its length is its height. A rail's width is its height and its length is across.
- **Vertical opening chains** (rail | opening | rail …, bottom to top): one per **stack** of openings (openings whose widths overlap), left to right. A stack whose chain repeats one already given in that region is skipped. They're drawn the way split-column chains are (`CellChains`, axis `row`), at the stack's left edge, and not while dragging a preview.

### Worked examples (the tests)

**ISL: the island.** A 0"-thick free-standing wall I, (0,0)→(96,0), room style inset (14), with a wall end panel at `start` (width null → 3/4"). Front run F and back run K are both 30 1/2" bases at z 4, 24" deep, anchored at both ends, each with two auto cabinets (`Fa`, `Fb`, `Ka`, `Kb`) and end panels at both ends by default.
- After sync: F is x 0.75, width 95.25, `ends.left` none (auto). K is x 0, width 95.25, `ends.right` none (auto). Each run's front is 24 13/16, so the panel's depth each side is 24.8125 and its top is 34.5.
- F: the panel is flush and no taller, so `_frame.wallPanels = { left: { width: 0.75, top: 34.5, join: 'miter' }, right: null }`. K has the same on its right (on the back side the start is on the right).
- F's layout is `Fa` 0.75–48, `Fb` 48–95.25, and `F:right` 95.25–96. The region grows over the wall panel and F's right end panel: x 0, width 96, `wallPanels: [{ side: 'left', x: 0, width: 0.75 }]`.
- `Fa`'s box keeps its left side: 0.75–48 (47.25; it was 1.5–48, 46.5). Opening 1.5–47.25 (45.75), z 5.5, height 27.5.
- Chain: frame 0–1.5 | Fa 1.5–47.25 | frame 47.25–48.75 | Fb 48.75–94.5 | frame 94.5–96. The old `open` 0–0.75 is gone.
- Plan, frame strip: 0–96, back 24, front 24.8125, polygon (0, 24.8125) → (96, 24.8125) → (95.25, 24) → (0.75, 24). The wall end panel polygon: (0, −24.8125) → (0.75, −24) → (0.75, 24) → (0, 24.8125). Its inside edge (x 0.75) stops at the box fronts on both faces.
- Elevation, front: the frame covers z 4–34.5 of the panel, so only z 0–4 is drawn.

**ISL-T: bar-height back.** ISL with K's height 36 (top 40). The panel's top is 40. F butts (40 > 34.5): its region is x 0.75, width 95.25, with no `wallPanels`, and `Fa`'s box is 1.5–48. K miters. The front elevation shows the whole panel (0–40). The back elevation shows only 0–4. With `frame: 'miter'` on the panel, F miters anyway. With `frame: 'butt'`, plain ISL's F butts.

**BW: box widths.** An inset base at x 24, 48 wide, no end pieces, two auto cabinets `a`, `b` (24 each). `a`'s left and `b`'s right are free: insets a { 0.75, 0 }, b { 0, 0.75 }, so both boxes are 23 1/4. With a split column `s` (t over u) in place of `a`, the cells t and u and the column s all get { 0.75, 0 }.

**MEM-A: two doors** (SPEC-36 example A): region x 24–60, z 4, height 30.5; openings 25.5–41.25 and 42.75–58.5, z 5.5, height 27.5. That's 3 stiles 1 1/2 × 30 1/2 and 4 rails 1 1/2 × 15 3/4. One vertical chain at x 25.5: 1 1/2 | 27 1/2 | 1 1/2 (b's is the same, so skipped).

**MEM-D: drawer over two doors.** Region x 0, z 0, 30 × 30. Openings: drawer 1.5–28.5 × z 22.5–28.5, doors 1.5–14.25 and 15.75–28.5 × z 1.5–21.
- Stiles: 0–1.5 and 28.5–30, each 30 tall.
- Between them: rails at z 0–1.5, 21–22.5 and 28.5–30, each 27 long.
- Under the mid rail: one mullion 14.25–15.75, z 1.5–21 (19 1/2).
- Grouped: 2 × stile 1 1/2 × 30, 3 × rail 1 1/2 × 27, 1 × mullion 1 1/2 × 19 1/2.
- One stack (the drawer overlaps both doors): 1 1/2 | 19 1/2 | 1 1/2 | 6 | 1 1/2.

---

## §2 Step 226 — wall end panels in the frame (model)

### `src/elevation/model/room.js` (1696)

- The corners import (4–11) adds `frontDepth`. After the wallSides import block (62–68) add `import { wallEndPanels } from './wallEndPanels.js';`.
- Right after `withFrame` (581–592):

```js
/**
 * A face frame run beside a wall end panel (SPEC-36.2): `_frame.wallPanels` gives, per side, the
 * panel's width and top and how the frame meets it. Auto: mitered over the panel's edge unless the
 * panel stands in front of the frame or above the run's box, then it dies into it. The panel's
 * `frame` ('miter' or 'butt') overrides.
 */
function withWallPanels(room, wall, settings) {
  const panels = wallEndPanels(room, wall, settings);
  return {
    ...wall,
    runs: wall.runs.map((run) => {
      if (!run._frame) return run;
      const found = { left: null, right: null };
      for (const panel of panels) {
        const side = panel[wallSideOf(run)];
        if (!side.runIds.includes(run.id)) continue;
        const flush = side.depth <= frontDepth(run, settings) + PIN_EPSILON
          && panel.top <= run.z + run.height + PIN_EPSILON;
        found[side.side] = {
          width: panel.width,
          top: panel.top,
          join: wall.endPanels?.[panel.endpoint]?.frame ?? (flush ? 'miter' : 'butt'),
        };
      }
      const { wallPanels, ...frame } = run._frame;
      if (found.left || found.right) return { ...run, _frame: { ...frame, wallPanels: found } };
      return wallPanels === undefined ? run : { ...run, _frame: frame };
    }),
  };
}
```

- In `syncRoom`, just before `return nextRoom;` (718):

```js
  nextRoom = {
    ...nextRoom,
    walls: nextRoom.walls.map((wall) => withWallPanels(nextRoom, wall, settings)),
  };
```

(It runs last: it needs the final x, heights and ends. `withFrame` may keep a stale `wallPanels` until this pass replaces it. Nothing between the two reads it.)

### `src/elevation/model/frames.js` (160)

- `const panels = pieces.filter(isSidePanel);` (92) becomes:

```js
  // A wall end panel the frame is mitered over (SPEC-36.2) counts as a side panel at the run's edge.
  const wallPanels = ['left', 'right'].flatMap((edge) => {
    const panel = run._frame?.wallPanels?.[edge];
    if (panel?.join !== 'miter') return [];
    return [{
      id: `${run.id}:wall-${edge}`,
      kind: 'end_panel',
      edge,
      x: edge === 'left' ? run.x - panel.width : run.x + run.width,
      z: 0,
      width: panel.width,
      height: panel.top,
    }];
  });
  const panels = [...pieces.filter(isSidePanel), ...wallPanels];
```

- The panels loop (114–124) becomes:

```js
    const covered = [];
    for (const panel of panels) {
      if (!overlaps(panel.z, panel.z + panel.height, bounds.z, bounds.z + bounds.height)) continue;
      const before = Math.abs(panel.x + panel.width - bounds.x) <= EPSILON;
      if (!before && Math.abs(panel.x - bounds.x - bounds.width) > EPSILON) continue;
      if (before) region.x = panel.x;
      region.width += panel.width;
      covered.push(panel);
      if (panel.edge) (region.wallPanels ??= []).push({ side: panel.edge, x: panel.x, width: panel.width });
      else region.panelIds.push(panel.id);
    }
```

- `const covering = …` (134) becomes `const covering = [...group, ...covered];`.
- In the JSDoc above `frameRegions`, after "grown over a side or end panel at either side (the stile covers the panel's edge)" add ", or a wall end panel the frame is mitered over (SPEC-36.2, `region.wallPanels`)".

A region has `wallPanels` only when it covers one, so every existing `toEqual` on regions still holds.

### Tests: new `src/elevation/model/__tests__/frameEnds.test.js` (2)

```js
import { describe, expect, it } from 'vitest';
import { cellPieces } from '../cells.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
import { frameRegions } from '../frames.js';
import { gridFromItems } from '../grid.js';
import { resolveWall, syncRoom } from '../room.js';
import { wallSideView } from '../wallSides.js';

const S = DEFAULT_SETTINGS;
const INSET = { cabinetStyleId: 14 };
const PANEL = { type: 'end_panel', width: null };

const islandRun = (id, wallSide, overrides = {}) => ({
  id, cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 0, width: 96, z: 4, height: 30.5, depth: 24,
  ends: { left: PANEL, right: PANEL }, autoCount: false, maxCabinetWidth: null,
  heightMode: 'manual', overrides: {}, anchors: { left: true, right: true }, wallSide,
  grid: gridFromItems(id, [{ id: `${id}a`, kind: 'cabinet', width: null }, { id: `${id}b`, kind: 'cabinet', width: null }]),
  ...overrides,
});

/** SPEC-36.2 ISL: a 96" island (a 0" wall), a 24" inset base each side, a wall end panel at its start. */
function island({ front = {}, back = {}, panel = { width: null }, style = INSET } = {}) {
  return syncRoom({
    id: 'room', name: 'Room', profile: { ...S.defaultProfile }, wallOrder: ['I'],
    ...(style ? { style } : {}),
    walls: [{
      id: 'I', name: '', numberOverride: null, elevationForced: false,
      x1: 0, y1: 0, x2: 96, y2: 0, height: 96, thickness: 0, flipped: false,
      connections: { start: null, end: null }, profile: {}, openings: [], joints: [],
      runs: [islandRun('F', 'front', front), islandRun('K', 'back', back)],
      endPanels: { start: panel, end: null }, landings: { start: null, end: null }, soffits: [],
    }],
  }, S);
}

const runOf = (room, id) => room.walls[0].runs.find((run) => run.id === id);

function frontFrames(room) {
  const wall = resolveWall(room, wallSideView(room.walls[0], 'front'));
  const run = runOf(room, 'F');
  const layout = layoutRun(room, wall, run, S);
  return {
    wall,
    run,
    layout,
    frames: frameRegions(room, run, cellPieces(run, layout), S),
    faces: runFaceLayouts(room, wall, run, S, layout),
  };
}

describe('SPEC-36.2 wall end panels in a face frame', () => {
  it('covers a flush wall end panel: the frame runs over it and the box keeps its side', () => {
    const room = island();
    expect(runOf(room, 'F')._frame).toEqual({
      thickness: 0.8125, drop: 0, wallPanels: { left: { width: 0.75, top: 34.5, join: 'miter' }, right: null },
    });
    expect(runOf(room, 'K')._frame.wallPanels).toEqual({
      left: null, right: { width: 0.75, top: 34.5, join: 'miter' },
    });
    expect('_frame' in runOf(island({ style: null }), 'F')).toBe(false);

    const { frames, faces } = frontFrames(room);
    expect(frames.regions).toEqual([{
      id: 'frame:Fa', x: 0, z: 4, width: 96, height: 30.5, cabinetIds: ['Fa', 'Fb'], fillerIds: [],
      panelIds: ['F:right'], wallPanels: [{ side: 'left', x: 0, width: 0.75 }],
    }]);
    expect(frames.freeSides.get('Fa')).toEqual({ left: false, right: false });
    expect([faces.get('Fa').box.x, faces.get('Fa').box.width]).toEqual([0.75, 47.25]);
    expect(faces.get('Fa').openings).toEqual([{ path: 'r', x: 1.5, z: 5.5, width: 45.75, height: 27.5 }]);
  });

  it('lets the frame die into a taller panel, or as the panel says', () => {
    const taller = island({ back: { height: 36 } });
    expect(runOf(taller, 'F')._frame.wallPanels.left).toEqual({ width: 0.75, top: 40, join: 'butt' });
    expect(runOf(taller, 'K')._frame.wallPanels.right).toEqual({ width: 0.75, top: 40, join: 'miter' });
    const { frames, faces } = frontFrames(taller);
    expect(frames.regions[0]).toMatchObject({ x: 0.75, width: 95.25 });
    expect('wallPanels' in frames.regions[0]).toBe(false);
    expect([faces.get('Fa').box.x, faces.get('Fa').box.width]).toEqual([1.5, 46.5]);

    expect(runOf(island({ panel: { width: null, frame: 'butt' } }), 'F')._frame.wallPanels.left.join)
      .toBe('butt');
    expect(runOf(island({ back: { height: 36 }, panel: { width: null, frame: 'miter' } }), 'F')
      ._frame.wallPanels.left.join).toBe('miter');
  });
});
```

Working (ISL, ISL-T in §1). The run pull-back (0.75) is SPEC-17's and doesn't change. `Fa`'s right side is a seam, so its reveal there is 3/4" and the opening ends at 48 − 0.75.

**Count:** 697 + 2 = **699**.

---

## §3 Step 227 — plan, chain and elevation (model)

### `src/elevation/model/wallEndPanels.js` (55)

- After the imports add `const EPSILON = 1e-6;` and:

```js
/** How far a mitered face frame cuts into the panel's inside corner, front and back (SPEC-36.2). */
function panelMiters(source, panel) {
  const depth = (face) => Math.max(0, ...source.runs
    .filter((run) => panel[face].runIds.includes(run.id)
      && run._frame?.wallPanels?.[panel[face].side]?.join === 'miter')
    .map((run) => run._frame.thickness));
  return { front: depth('front'), back: depth('back') };
}
```

- `wallEndPanelPolygon` (40–55) becomes:

```js
export function wallEndPanelPolygon(room, wall, panel) {
  const source = wall.sideSource ?? wall;
  const frame = wallFrame(room, wallSideView(source, 'front'));
  const point = (x, offset) => ({
    x: frame.leftPoint.x + frame.r.x * x + frame.n.x * offset,
    y: frame.leftPoint.y + frame.r.y * x + frame.n.y * offset,
  });
  const left = panel.front.x;
  const right = left + panel.width;
  const back = -(panel.thickness + panel.back.depth);
  const front = panel.front.depth;
  // A face frame mitered into the panel stops its inside edge at the box fronts (SPEC-36.2).
  const miter = panelMiters(source, panel);
  const inside = panel.front.side === 'left' ? right : left;
  const cut = (x, amount) => (x === inside ? amount : 0);
  return [
    point(left, back + cut(left, miter.back)),
    point(right, back + cut(right, miter.back)),
    point(right, front - cut(right, miter.front)),
    point(left, front - cut(left, miter.front)),
  ];
}
```

- Append:

```js
/**
 * The heights of a wall end panel left showing on one elevation (SPEC-36.2): all of it, floor to
 * top, less where a face frame run on this side is mitered over its edge.
 */
export function wallEndPanelSpans(wall, panel) {
  const side = panel[wall.side ?? 'front'];
  const covers = (wall.runs ?? [])
    .filter((run) => side.runIds.includes(run.id)
      && run._frame?.wallPanels?.[side.side]?.join === 'miter')
    .map((run) => [run.z - run._frame.drop, run.z + run.height])
    .sort((a, b) => a[0] - b[0]);
  const spans = [];
  let cursor = 0;
  for (const [bottom, top] of covers) {
    const end = Math.min(bottom, panel.top);
    if (end - cursor > EPSILON) spans.push({ z: cursor, height: end - cursor });
    cursor = Math.max(cursor, top);
  }
  if (panel.top - cursor > EPSILON) spans.push({ z: cursor, height: panel.top - cursor });
  return spans;
}
```

(`wall` is one side's view, as `WallEndPanelShapes` gets it. A European run never has `_frame`, so its panel is one full span, the same as before.)

### `src/elevation/model/planPieces.js` (292)

In `frameStrips` (169–200):
- `const panels = pieces.filter((piece) => region.panelIds.includes(piece.id));` (174) becomes

```js
    const panels = [
      ...pieces.filter((piece) => region.panelIds.includes(piece.id)),
      ...(region.wallPanels ?? []),
    ];
```

- The two `mitered.set` lines (191–192) become `if (left?.id) mitered.set(left.id, 'left');` and `if (right?.id) mitered.set(right.id, 'right');`. A wall end panel has no id here: it isn't one of the run's plan pieces, and `wallEndPanelPolygon` draws its miter.
- The JSDoc's "into the end or side panel it covers" becomes "into the end, side or wall end panel it covers".

### `src/elevation/model/dimensions.js` (559)

In `horizontalChains`, the inner `runs.forEach` (305–320) becomes:

```js
  runs.forEach((run, index) => {
    const layout = splitRun(run, settings, {
      endMinWidths: endMinWidthsForRun(room, wall, run, settings),
      endCornerAngles: endCornerAnglesForRun(room, wall, run),
      pinTargets: pinTargetsForRun(run, wall, length, settings),
    });
    // A frame over a wall end panel starts before the run (SPEC-36.2).
    const segments = runInnerSegments(room, wall, run, settings, layout);
    appendGap(
      inner,
      cursor,
      Math.min(run.x, segments[0]?.start ?? run.x),
      index === 0 && leftCornerGap ? 'corner-gap' : 'open',
      tallRanges,
    );
    inner.push(...segments);
    cursor = Math.max(run.x + run.width, segments[segments.length - 1]?.end ?? run.x + run.width);
  });
```

The outer chain is unchanged.

### `src/elevation/model/index.js`

`export { wallEndPanelPolygon, wallEndPanels } from './wallEndPanels.js';` (176) adds `wallEndPanelSpans`.

### Tests: `frameEnds.test.js`

Imports add `import { horizontalChains } from '../dimensions.js';`, `import { planRunPieces } from '../planPieces.js';` and `import { wallEndPanelPolygon, wallEndPanelSpans, wallEndPanels } from '../wallEndPanels.js';`. A describe at the end (2):

```js
describe('SPEC-36.2 a mitered wall end panel in plan, chain and elevation', () => {
  it('miters the frame strip and the panel, and runs the chain over the panel', () => {
    const room = island();
    const { wall, run, layout, faces } = frontFrames(room);
    const plan = planRunPieces(room, wall, run, S, layout, faces);
    expect(plan.boxes.map(({ key, start, end }) => [key, start, end])).toEqual([['Fa', 0.75, 48], ['Fb', 48, 95.25]]);
    expect(plan.faces.find(({ kind }) => kind === 'frame')).toEqual({
      key: 'frame:Fa', kind: 'frame', start: 0, end: 96, back: 24, front: 24.8125,
      polygon: [[0, 24.8125], [96, 24.8125], [95.25, 24], [0.75, 24]],
    });
    const [panel] = wallEndPanels(room, room.walls[0], S);
    expect(wallEndPanelPolygon(room, room.walls[0], panel)).toEqual([
      { x: 0, y: -24.8125 }, { x: 0.75, y: -24 }, { x: 0.75, y: 24 }, { x: 0, y: 24.8125 },
    ]);
    expect(horizontalChains(room, wall, 'lower', S).inner).toEqual([
      { start: 0, end: 1.5, kind: 'frame', runId: 'F' },
      { start: 1.5, end: 47.25, kind: 'frame-opening', runId: 'F', pieceId: 'Fa' },
      { start: 47.25, end: 48.75, kind: 'frame', runId: 'F' },
      { start: 48.75, end: 94.5, kind: 'frame-opening', runId: 'F', pieceId: 'Fb' },
      { start: 94.5, end: 96, kind: 'frame', runId: 'F' },
    ]);
  });

  it('shows only the part of the panel the frame doesn\'t cover', () => {
    const room = island();
    const [panel] = wallEndPanels(room, room.walls[0], S);
    expect(wallEndPanelSpans(wallSideView(room.walls[0], 'front'), panel)).toEqual([{ z: 0, height: 4 }]);

    const taller = island({ back: { height: 36 } });
    const [tall] = wallEndPanels(taller, taller.walls[0], S);
    expect(wallEndPanelSpans(wallSideView(taller.walls[0], 'front'), tall)).toEqual([{ z: 0, height: 40 }]);
    expect(wallEndPanelSpans(wallSideView(taller.walls[0], 'back'), tall)).toEqual([{ z: 0, height: 4 }]);
  });
});
```

Working (ISL in §1):
- The boxes come from the face layouts. The strip's back is the box front (24) and its front is 24 + 13/16. Its left end is mitered to the wall panel: from (0.75, 24) out to (0, 24.8125). Its right end is mitered to `F:right`, the same as 36.1.
- The panel polygon's back face is at −(0 + 24.8125). Both runs miter, so the inside corner (x 0.75) comes in 13/16 on each face, to −24 and 24.
- Chain: `runInnerSegments` starts at the region (0), so the gap before it is from 0 to min(0.75, 0), which is nothing. The first stile is 0 to the opening at 1.5.

**Count:** 699 + 2 = **701**.

---

## §4 Step 228 — store and saves

### `src/elevation/model/constants.js` (127)

After `DEFAULT_SETTINGS` closes (98), add:

```js
/** How a face frame meets a wall end panel when set by hand (SPEC-36.2). Absent means auto. */
export const FRAME_JOINS = ['miter', 'butt'];
```

### `src/elevation/store/elevationSlice.js` (1754)

- The constants import (4) becomes `import { DEFAULT_SETTINGS, FRAME_JOINS } from '../model/constants.js';`.
- `setWallEndPanel` (554–567):

```js
    setWallEndPanel(state, action) {
      const location = wallLocation(state, action.payload);
      const { endpoint, panel } = action.payload;
      const validPanel = panel === null || (
        panel
        && typeof panel === 'object'
        && !Array.isArray(panel)
        && (panel.width === null || (Number.isFinite(panel.width) && panel.width >= 0))
        && (panel.frame === undefined || panel.frame === null || FRAME_JOINS.includes(panel.frame))
      );
      if (!location || !['start', 'end'].includes(endpoint) || !validPanel) return;
      location.wall.endPanels ??= { start: null, end: null };
      location.wall.endPanels[endpoint] = panel
        ? { width: panel.width ?? null, ...(panel.frame ? { frame: panel.frame } : {}) }
        : null;
      syncRoomAt(state, location.roomIndex);
    },
```

(`frame: null` clears the override. Callers always send the width with it.)

### `src/elevation/store/persistence.js` (649)

- The constants import (1–5) adds `FRAME_JOINS`.
- `isEndPanels` (346–360): after the width condition (the `|| (isFiniteNumber(endPanels[endpoint].width) && endPanels[endpoint].width >= 0))` line) add

```js
        && (endPanels[endpoint].frame === undefined || FRAME_JOINS.includes(endPanels[endpoint].frame))
```

### Tests

**`src/elevation/store/__tests__/elevationSlice.test.js`**, a describe at the end (1):

```js
describe('SPEC-36.2 wall end panel frame join', () => {
  it('stores, clears and validates a wall end panel\'s frame join', () => {
    let state = elevationReducer(stateWithRun(), setWallEndPanel({
      wallId: 'wall-1', endpoint: 'start', panel: { width: null, frame: 'butt' },
    }));
    expect(state.rooms[0].walls[0].endPanels.start).toEqual({ width: null, frame: 'butt' });

    state = elevationReducer(state, setWallEndPanel({
      wallId: 'wall-1', endpoint: 'start', panel: { width: 1, frame: null },
    }));
    expect(state.rooms[0].walls[0].endPanels.start).toEqual({ width: 1 });

    const invalid = elevationReducer(state, setWallEndPanel({
      wallId: 'wall-1', endpoint: 'start', panel: { width: 1, frame: 'glue' },
    }));
    expect(invalid).toBe(state);
  });
});
```

**`src/elevation/store/__tests__/persistence.test.js`**, a describe at the end (1):

```js
describe('SPEC-36.2 wall end panel frame join', () => {
  it('saves a frame join and rejects an unknown one', () => {
    const valid = tbtDocument();
    valid.rooms[0].walls[0].endPanels = { start: { width: null, frame: 'miter' }, end: null };
    expect(isElevationDocument(valid)).toBe(true);

    const invalid = tbtDocument();
    invalid.rooms[0].walls[0].endPanels = { start: { width: null, frame: 'glue' }, end: null };
    expect(isElevationDocument(invalid)).toBe(false);
  });
});
```

**Count:** 701 + 2 = **703**.

---

## §5 Step 229 — wall end panel on screen

### `src/elevation/components/properties/WallHeightProperties.jsx` (356)

In the "Wall end panels" section, the `{panel && ( … )}` block (306–321) becomes:

```jsx
                {panel && (
                  <div className="mt-2 space-y-2">
                    <Field label="Width">
                      <InchInput
                        value={panel.width}
                        allowBlank
                        placeholder={formatInches(settings.endPanelThickness)}
                        onCommit={(width) => dispatch(setWallEndPanel({
                          wallId: wall.id,
                          endpoint,
                          panel: { width, frame: panel.frame ?? null },
                        }))}
                        aria-label={`${label} panel width`}
                      />
                    </Field>
                    <Field label="Face frame">
                      <select
                        value={panel.frame ?? 'auto'}
                        onChange={(event) => dispatch(setWallEndPanel({
                          wallId: wall.id,
                          endpoint,
                          panel: {
                            width: panel.width,
                            frame: event.target.value === 'auto' ? null : event.target.value,
                          },
                        }))}
                        aria-label={`${label} panel face frame`}
                        className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
                      >
                        <option value="auto">Auto</option>
                        <option value="miter">Frame covers the panel edge</option>
                        <option value="butt">Frame dies into the panel</option>
                      </select>
                    </Field>
                    <p className="text-xs text-gray-500">
                      Face frame runs only. Auto covers the edge unless the panel is deeper or taller than the run.
                    </p>
                  </div>
                )}
```

### `src/elevation/components/WallEndPanelShapes.jsx` (34)

The whole file:

```jsx
import { Group, Rect } from 'react-konva';
import { wallRectToScreen } from '../canvas/transform.js';
import { KIND_COLORS } from '../model/constants.js';
import { wallEndPanelSpans, wallEndPanels } from '../model/wallEndPanels.js';

export default function WallEndPanelShapes({
  room,
  wall,
  settings,
  transform,
}) {
  return wallEndPanels(room, wall, settings).map((panel) => {
    const side = panel[wall.side];
    // A face frame mitered over the panel covers part of it (SPEC-36.2); draw what's left.
    return (
      <Group key={panel.endpoint} listening={false}>
        {wallEndPanelSpans(wall, panel).map((span) => (
          <Rect
            key={span.z}
            {...wallRectToScreen({ x: side.x, z: span.z, width: panel.width, height: span.height }, transform)}
            fill={KIND_COLORS.end_panel}
            opacity={0.55}
            stroke={KIND_COLORS.end_panel}
            strokeWidth={1}
            listening={false}
          />
        ))}
      </Group>
    );
  });
}
```

The frame outline already reaches over the panel, because the region grew in step 226. The plan view already draws `wallEndPanelPolygon`.

No new tests (components). **Count stays 703.**

---

## §6 Step 230 — box insets (model)

### `src/elevation/model/frames.js`

Append:

```js
/**
 * How much narrower than its slot each framed box is, per side (SPEC-36.2): the stile's overhang on
 * a free side, else 0. Keyed by cabinet cell id, and by column id for a split column (from the cells
 * along its outside edges). Boxes outside a frame aren't in the map.
 */
export function boxInsets(frames, cells, settings) {
  const overhang = { ...DEFAULT_SETTINGS.insetFrame, ...settings.insetFrame }.stile;
  const insets = new Map();
  for (const [id, free] of frames.freeSides) {
    insets.set(id, { left: free.left ? overhang : 0, right: free.right ? overhang : 0 });
  }
  const columns = new Map();
  for (const piece of cells.pieces) {
    if (piece.columnId) columns.set(piece.columnId, [...(columns.get(piece.columnId) ?? []), piece]);
  }
  for (const [columnId, pieces] of columns) {
    const left = Math.min(...pieces.map((piece) => piece.x));
    const right = Math.max(...pieces.map((piece) => piece.x + piece.width));
    const free = (side, edge) => pieces.some((piece) => (insets.get(piece.id)?.[side] ?? 0) > 0
      && Math.abs((side === 'left' ? piece.x : piece.x + piece.width) - edge) <= EPSILON);
    const inset = { left: free('left', left) ? overhang : 0, right: free('right', right) ? overhang : 0 };
    if (inset.left > 0 || inset.right > 0) insets.set(columnId, inset);
  }
  return insets;
}
```

### `src/elevation/model/index.js`

`export { faceOpenings, frameRegions, sideOf } from './frames.js';` (365) becomes
`export { boxInsets, faceOpenings, frameRegions, sideOf } from './frames.js';`

### Tests: new `src/elevation/model/__tests__/frameParts.test.js` (1)

```js
import { describe, expect, it } from 'vitest';
import { cellPieces } from '../cells.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { layoutRun } from '../faceLayouts.js';
import { boxInsets, frameRegions } from '../frames.js';
import { gridFromItems } from '../grid.js';
import { resolveWall } from '../room.js';

const S = DEFAULT_SETTINGS;
const INSET = { cabinetStyleId: 14 };
const NONE = { type: 'none', width: null };
const cell = (col, row, node) => ({ col, row, colSpan: 1, rowSpan: 1, node });

function roomWith(run, style) {
  const wall = {
    id: 'wall-1', name: 'Wall 1', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5,
    flipped: false, connections: { start: null, end: null }, profile: {}, runs: [run], openings: [],
  };
  return {
    id: 'room-1', name: 'Room 1', profile: { ...S.defaultProfile }, walls: [wall], wallOrder: ['wall-1'],
    ...(style ? { style } : {}),
  };
}

/** SPEC-36.2 BW: an inset base in a 48" space, no end pieces, two auto cabinets. */
const baseRun = (overrides = {}) => ({
  id: 'r', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 24, width: 48, z: 4, height: 30.5, depth: 24,
  ends: { left: NONE, right: NONE }, autoCount: false, maxCabinetWidth: null,
  heightMode: 'manual', overrides: {}, anchors: { left: false, right: false },
  grid: gridFromItems('r', [{ id: 'a', kind: 'cabinet', width: null }, { id: 'b', kind: 'cabinet', width: null }]),
  ...overrides,
});

function framed(run, style = INSET) {
  const room = roomWith(run, style);
  const wall = resolveWall(room, room.walls[0]);
  const cells = cellPieces(run, layoutRun(room, wall, run, S));
  return { room, wall, cells, frames: frameRegions(room, run, cells, S) };
}

describe('SPEC-36.2 box widths', () => {
  it('makes a framed box its slot less the stile overhang at each free side', () => {
    const { cells, frames } = framed(baseRun());
    expect(cells.pieces.map(({ id, width }) => [id, width])).toEqual([['a', 24], ['b', 24]]);
    const insets = boxInsets(frames, cells, S);
    expect(insets.get('a')).toEqual({ left: 0.75, right: 0 });
    expect(insets.get('b')).toEqual({ left: 0, right: 0.75 });
    expect(boxInsets(framed(baseRun(), null).frames, cells, S).size).toBe(0);

    const split = framed(baseRun({
      grid: {
        id: 'r:grid',
        cols: [{ id: 's:col', size: null, sizeMode: 'auto' }, { id: 'b:col', size: null, sizeMode: 'auto' }],
        rows: [{ id: 'r:row', size: null, sizeMode: 'auto' }],
        cells: [
          cell(0, 0, {
            id: 's',
            cols: [{ id: 's:c', size: null, sizeMode: 'auto' }],
            rows: [{ id: 's:t', size: null, sizeMode: 'auto' }, { id: 's:u', size: null, sizeMode: 'auto' }],
            cells: [cell(0, 0, { id: 't', kind: 'cabinet' }), cell(0, 1, { id: 'u', kind: 'cabinet' })],
          }),
          cell(1, 0, { id: 'b', kind: 'cabinet' }),
        ],
      },
    }));
    const stacked = boxInsets(split.frames, split.cells, S);
    expect(['t', 'u', 's', 'b'].map((id) => stacked.get(id))).toEqual([
      { left: 0.75, right: 0 }, { left: 0.75, right: 0 }, { left: 0.75, right: 0 }, { left: 0, right: 0.75 },
    ]);
  });
});
```

(BW in §1. In the split grid, t and u stack in column s, 24 wide at x 24, and both are free on the left.)

**Count:** 703 + 1 = **704**.

---

## §7 Step 231 — box widths in the panel

### `src/elevation/components/properties/PieceProperties.jsx` (157)

- The model import (3–5) adds `boxInsets, frameRegions`.
- After `const numbers = useMemo(…);` (76):

```js
  const frames = useMemo(() => frameRegions(room, run, cells, settings), [cells, room, run, settings]);
  const insets = useMemo(() => boxInsets(frames, cells, settings), [cells, frames, settings]);
```

- `<CellProperties …>` (131–139) gains `insets={insets}`. `<CabinetProperties …>` (146–154) gains `inset={insets.get(piece.id)}`.

### `src/elevation/components/properties/CabinetProperties.jsx` (294)

- Above the component: `const NO_INSET = { left: 0, right: 0 };`.
- Props (22) become `wall, run, piece, item, layout, cells, settings, inset = NO_INSET,`.
- After `const actualCenter = …;` (28):

```js
  // A face frame box is narrower than its frame section at a free side (SPEC-36.2).
  const trim = inset.left + inset.right;
  const boxWidth = piece.width - trim;
```

- The Width field (68–74) becomes:

```jsx
        <Field label={trim > 0 ? 'Box width' : 'Width'}>
          <InchInput
            value={boxWidth}
            onCommit={(width) => dispatch(setItemWidth({ ...actionBase, width: width + trim }))}
            aria-label="Cabinet width"
          />
        </Field>
        {trim > 0 && (
          <p className="mt-1 text-xs text-gray-500">Frame section {formatInches(piece.width)}</p>
        )}
```

The Lock button still stores `piece.width` (the slot).

### `src/elevation/components/properties/CellProperties.jsx` (256)

- Above the component: `const NO_INSET = { left: 0, right: 0 };`.
- Props (31) become `wall, run, piece, item, layout, cells, settings, insets = new Map(),`.
- `const size = axis === 'row' ? piece.height : piece.width;` (39) becomes:

```js
  // Widths show the box, narrower than the slot at a free face frame side (SPEC-36.2).
  const cellInset = insets.get(piece.id) ?? NO_INSET;
  const trim = cellInset.left + cellInset.right;
  const columnInset = insets.get(piece.columnId) ?? NO_INSET;
  const columnTrim = columnInset.left + columnInset.right;
  const slot = axis === 'row' ? piece.height : piece.width;
  const size = axis === 'row' ? slot : slot - trim;
```

- The size InchInput's `size: value,` (68) becomes `size: axis === 'row' ? value : value + trim,`.
- The read-only other dimension (75) becomes `value={axis === 'row' ? piece.width - trim : piece.height}`.
- The lock button's `size: locked ? null : size,` becomes `size: locked ? null : slot,`.
- The Column width field (110–117): `value={column.width - columnTrim}` and `width: width + columnTrim,`. Its lock button still stores `column.width`.

### `src/elevation/components/properties/RunProperties.jsx` (105)

- Add `import { useMemo } from 'react';` at the top and `import { boxInsets, cellPieces, frameRegions } from '../../model/index.js';` after the helpers import.
- After `const actionBase = …;` (25):

```js
  const insets = useMemo(() => {
    const cells = cellPieces(run, layout);
    return boxInsets(frameRegions(room, run, cells, settings), cells, settings);
  }, [layout, room, run, settings]);
```

- `<RunPiecesSection run={run} layout={layout} />` (96) becomes `<RunPiecesSection run={run} layout={layout} insets={insets} />`.

### `src/elevation/components/properties/RunPiecesSection.jsx` (49)

- Props (9) become `{ run, layout, insets = new Map() }`.
- `{formatInches(piece.width)}` (34) becomes
  `{formatInches(piece.width - (insets.get(piece.id)?.left ?? 0) - (insets.get(piece.id)?.right ?? 0))}`.

No new tests (components). **Count stays 704.**

---

## §8 Step 232 — the frame as a part (model)

### `src/elevation/model/frames.js`

Append:

```js
/** Every opening in a frame region, from its cabinets' face layouts (SPEC-36.2). */
export function regionOpenings(region, faceLayouts) {
  return region.cabinetIds.flatMap((id) => faceLayouts.get(id)?.openings ?? []);
}

function mergeSpans(spans) {
  const merged = [];
  for (const [start, end] of [...spans].sort((a, b) => a[0] - b[0])) {
    const last = merged[merged.length - 1];
    if (last && start < last[1] - EPSILON) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

function fills(opening, rect) {
  return Math.abs(opening.x - rect.x) <= EPSILON && Math.abs(opening.z - rect.z) <= EPSILON
    && Math.abs(opening.width - rect.width) <= EPSILON && Math.abs(opening.height - rect.height) <= EPSILON;
}

/**
 * A frame's stiles, rails and mullions (SPEC-36.2), cut from the region around its openings: the
 * full-height stiles first, then the rails between each pair of stiles, then any mullion between
 * those rails, and so on. Each is { kind, x, z, width, height }. Null when the openings can't be
 * cut apart that way (a pinwheel).
 */
export function frameMembers(region, openings) {
  const members = [];
  const cut = (rect, inside, vertical, depth, stuck) => {
    if (inside.length === 0 || (inside.length === 1 && fills(inside[0], rect))) return true;
    if (stuck > 1) return false;
    const low = vertical ? rect.x : rect.z;
    const high = low + (vertical ? rect.width : rect.height);
    const bays = mergeSpans(inside.map((opening) => (vertical
      ? [opening.x, opening.x + opening.width]
      : [opening.z, opening.z + opening.height])));
    const solids = [];
    let cursor = low;
    for (const [start, end] of bays) {
      if (start - cursor > EPSILON) solids.push([cursor, start]);
      cursor = Math.max(cursor, end);
    }
    if (high - cursor > EPSILON) solids.push([cursor, high]);
    for (const [start, end] of solids) {
      members.push(vertical
        ? { kind: depth === 0 ? 'stile' : 'mullion', x: start, z: rect.z, width: end - start, height: rect.height }
        : { kind: 'rail', x: rect.x, z: start, width: rect.width, height: end - start });
    }
    return bays.every(([start, end]) => {
      const bay = vertical
        ? { x: start, z: rect.z, width: end - start, height: rect.height }
        : { x: rect.x, z: start, width: rect.width, height: end - start };
      const within = inside.filter((opening) => (vertical
        ? opening.x >= start - EPSILON && opening.x + opening.width <= end + EPSILON
        : opening.z >= start - EPSILON && opening.z + opening.height <= end + EPSILON));
      return cut(bay, within, !vertical, depth + 1, solids.length === 0 ? stuck + 1 : 0);
    });
  };
  return cut(region, openings, true, 0, 0) ? members : null;
}

const MEMBER_ORDER = ['stile', 'rail', 'mullion'];

/**
 * Frame members counted by kind and size (SPEC-36.2): { kind, width, length, count }, stiles first.
 * A rail's width is its height and its length runs across; a stile's or mullion's length is its height.
 */
export function groupMembers(members) {
  const groups = new Map();
  for (const member of members) {
    const across = member.kind === 'rail' ? member.height : member.width;
    const length = member.kind === 'rail' ? member.width : member.height;
    const key = `${member.kind}:${Math.round(across * 10000)}:${Math.round(length * 10000)}`;
    const group = groups.get(key);
    if (group) group.count += 1;
    else groups.set(key, { kind: member.kind, width: across, length, count: 1 });
  }
  return [...groups.values()].sort((a, b) => MEMBER_ORDER.indexOf(a.kind) - MEMBER_ORDER.indexOf(b.kind));
}

/**
 * A frame region's vertical opening chains (SPEC-36.2): rail | opening | rail … from the region's
 * bottom to its top, one for each stack of openings (openings whose widths overlap), left to right,
 * leaving out a stack whose chain repeats one already given. Shaped like a cell grid on a row axis,
 * so CellChains draws it.
 */
export function frameVerticalChains(region, openings) {
  const stacks = [];
  for (const opening of [...openings].sort((a, b) => a.x - b.x)) {
    const last = stacks[stacks.length - 1];
    if (last && opening.x < last.end - EPSILON) {
      last.end = Math.max(last.end, opening.x + opening.width);
      last.openings.push(opening);
    } else {
      stacks.push({ start: opening.x, end: opening.x + opening.width, openings: [opening] });
    }
  }
  const top = region.z + region.height;
  const seen = new Set();
  return stacks.flatMap((stack, index) => {
    const tracks = [];
    let cursor = region.z;
    for (const [start, end] of mergeSpans(stack.openings.map((opening) => [opening.z, opening.z + opening.height]))) {
      if (start - cursor > EPSILON) tracks.push({ kind: 'frame', start: cursor, end: start });
      tracks.push({ kind: 'frame-opening', start, end });
      cursor = end;
    }
    if (top - cursor > EPSILON) tracks.push({ kind: 'frame', start: cursor, end: top });
    const signature = tracks
      .map((track) => `${track.kind}:${Math.round((track.end - track.start) * 10000)}`)
      .join('|');
    if (seen.has(signature)) return [];
    seen.add(signature);
    const id = `${region.id}:v${index}`;
    return [{
      id,
      axis: 'row',
      x: stack.start,
      z: region.z,
      width: stack.end - stack.start,
      height: region.height,
      tracks: tracks.map((track, trackIndex) => ({ ...track, id: `${id}:${trackIndex}`, manual: false })),
    }];
  });
}
```

### `src/elevation/model/partNumbers.js` (247)

- `runParts`: `const inFrame = frameRegions(room, run, cells, settings).fillerIds;` (68) becomes
  `const frames = frameRegions(room, run, cells, settings);` followed by `const inFrame = frames.fillerIds;`. The `return partPieces(…)….map(…);` (69–81) becomes `return [` that chain `,` then:

```js
      // One part per face frame, after its run's pieces (SPEC-36.2).
      ...frames.regions.map((region) => ({
        key: region.id,
        kind: 'frame',
        wallId: wall.id,
        side,
        runId: run.id,
        pieceId: null,
        molding: null,
        width: region.width,
      })),
    ];
```

  In full, the end of `runParts`' callback reads:

```js
    const frames = frameRegions(room, run, cells, settings);
    const inFrame = frames.fillerIds;
    return [
      ...partPieces(cells.pieces, settings)
        .filter((piece) => PART_KINDS.has(piece.kind) && piece.width > 1e-6
          && (!inFrame.has(piece.id) || blindPanels.has(piece.id)))
        .map((piece) => ({
          key: piece.id,
          kind: piece.kind,
          wallId: wall.id,
          side,
          runId: run.id,
          pieceId: piece.id,
          molding: null,
          width: cellWidths.get(piece.id) ?? widths.get(piece.id) ?? piece.width,
        })),
      // One part per face frame, after its run's pieces (SPEC-36.2).
      ...frames.regions.map((region) => ({
        key: region.id,
        kind: 'frame',
        wallId: wall.id,
        side,
        runId: run.id,
        pieceId: null,
        molding: null,
        width: region.width,
      })),
    ];
```

- `wallBadgeGroups` (214–229): `wall.runs.map((run) => {` becomes `wall.runs.flatMap((run) => {`, and its `return { key: \`run:${run.id}\`, … };` becomes:

```js
    return [
      {
        key: `run:${run.id}`,
        lift: 0,
        pieces: partPieces(cells.pieces, settings).filter((piece) => !covered.has(piece.id)),
      },
      // Each frame's badge sits on the frame, a level up (SPEC-36.2).
      ...frames.regions.map((region) => ({
        key: region.id,
        lift: 1,
        pieces: [{ id: region.id, x: region.x, z: region.z, width: region.width, height: region.height }],
      })),
    ];
```

  The `.filter((group) => group.pieces.length > 0)` stays.

### `src/elevation/model/index.js`

The frames export becomes
`export { boxInsets, faceOpenings, frameMembers, frameRegions, frameVerticalChains, groupMembers, regionOpenings, sideOf } from './frames.js';`

### Tests

**`frameParts.test.js`**: the frames import becomes `import { boxInsets, frameMembers, frameRegions, frameVerticalChains, groupMembers } from '../frames.js';`, and add `import { partNumbers, wallBadgeGroups } from '../partNumbers.js';`. At the end (3):

```js
const OPENINGS_A = [
  { path: 'r', x: 25.5, z: 5.5, width: 15.75, height: 27.5 },
  { path: 'r', x: 42.75, z: 5.5, width: 15.75, height: 27.5 },
];
const REGION_A = { id: 'frame:a', x: 24, z: 4, width: 36, height: 30.5 };
const REGION_D = { id: 'frame:d', x: 0, z: 0, width: 30, height: 30 };
const OPENINGS_D = [
  { path: 'r.0', x: 1.5, z: 22.5, width: 27, height: 6 },
  { path: 'r.1.0', x: 1.5, z: 1.5, width: 12.75, height: 19.5 },
  { path: 'r.1.1', x: 15.75, z: 1.5, width: 12.75, height: 19.5 },
];

describe('SPEC-36.2 the frame as a part', () => {
  it('cuts stiles full height, rails between them, and mullions between the rails', () => {
    expect(groupMembers(frameMembers(REGION_A, OPENINGS_A))).toEqual([
      { kind: 'stile', width: 1.5, length: 30.5, count: 3 },
      { kind: 'rail', width: 1.5, length: 15.75, count: 4 },
    ]);
    const members = frameMembers(REGION_D, OPENINGS_D);
    expect(members).toEqual([
      { kind: 'stile', x: 0, z: 0, width: 1.5, height: 30 },
      { kind: 'stile', x: 28.5, z: 0, width: 1.5, height: 30 },
      { kind: 'rail', x: 1.5, z: 0, width: 27, height: 1.5 },
      { kind: 'rail', x: 1.5, z: 21, width: 27, height: 1.5 },
      { kind: 'rail', x: 1.5, z: 28.5, width: 27, height: 1.5 },
      { kind: 'mullion', x: 14.25, z: 1.5, width: 1.5, height: 19.5 },
    ]);
    expect(groupMembers(members)).toEqual([
      { kind: 'stile', width: 1.5, length: 30, count: 2 },
      { kind: 'rail', width: 1.5, length: 27, count: 3 },
      { kind: 'mullion', width: 1.5, length: 19.5, count: 1 },
    ]);
    expect(frameMembers({ x: 0, z: 0, width: 3, height: 3 }, [
      { x: 0, z: 0, width: 2, height: 1 }, { x: 2, z: 0, width: 1, height: 2 },
      { x: 1, z: 2, width: 2, height: 1 }, { x: 0, z: 1, width: 1, height: 2 },
    ])).toBeNull();
  });

  it('chains each different stack of openings bottom to top', () => {
    expect(frameVerticalChains(REGION_A, OPENINGS_A)).toEqual([{
      id: 'frame:a:v0', axis: 'row', x: 25.5, z: 4, width: 15.75, height: 30.5,
      tracks: [
        { id: 'frame:a:v0:0', kind: 'frame', start: 4, end: 5.5, manual: false },
        { id: 'frame:a:v0:1', kind: 'frame-opening', start: 5.5, end: 33, manual: false },
        { id: 'frame:a:v0:2', kind: 'frame', start: 33, end: 34.5, manual: false },
      ],
    }]);
    expect(frameVerticalChains(REGION_D, OPENINGS_D)[0].tracks.map(({ kind, start, end }) => [kind, start, end]))
      .toEqual([
        ['frame', 0, 1.5], ['frame-opening', 1.5, 21], ['frame', 21, 22.5],
        ['frame-opening', 22.5, 28.5], ['frame', 28.5, 30],
      ]);
  });

  it('numbers each frame once after its run\'s pieces, and badges it', () => {
    const room = roomWith(baseRun(), INSET);
    const parts = partNumbers(room, S).parts.filter((part) => part.runId === 'r');
    expect(parts.map(({ key, kind }) => [key, kind])).toEqual([['a', 'cabinet'], ['b', 'cabinet'], ['frame:a', 'frame']]);
    expect(parts[2]).toMatchObject({ width: 48, pieceId: null });
    expect(wallBadgeGroups(room, resolveWall(room, room.walls[0]), S)
      .map(({ key, lift, pieces }) => [key, lift, pieces.map(({ id }) => id)])).toEqual([
      ['run:r', 0, ['a', 'b']],
      ['frame:a', 1, ['frame:a']],
    ]);
    expect(partNumbers(roomWith(baseRun()), S).parts.some(({ kind }) => kind === 'frame')).toBe(false);
  });
});
```

Working (MEM-A, MEM-D in §1):
- MEM-A: the stiles are 24–25.5, 41.25–42.75 and 58.5–60, each 30.5 tall. Each bay's rails are 4–5.5 and 33–34.5 (5.5 + 27.5 = 33), 15.75 long.
- MEM-D: the pinwheel's four openings overlap across the whole square both ways, so neither cut finds a member, and the result is null.
- Part numbers: BW's region covers a and b, x 24, width 48.

**`src/elevation/model/__tests__/partNumbers.test.js`**, the SPEC-36 test `'numbers no filler inside a face frame, and badges the mitered end panel'`: its last expectation becomes
`expect(keys(roomOf({ cabinetStyleId: 14 }))).toEqual(['A-base:left', 'a1', 'a2', 'frame:a1']);`. Nothing else changes.

**Count:** 704 + 3 = **707**.

---

## §9 Step 233 — the frame on screen

### New `src/elevation/components/properties/FrameSection.jsx`

```jsx
import { useMemo } from 'react';
import {
  formatInches, frameMembers, groupMembers, regionOpenings, runFaceLayouts,
} from '../../model/index.js';
import PartNumberField from './PartNumberField.jsx';

const MEMBER_LABELS = { stile: 'Stile', rail: 'Rail', mullion: 'Mullion' };

/** The face frame a cabinet sits in (SPEC-36.2): its part number, size and derived stiles and rails. */
export default function FrameSection({
  room, wall, run, layout, region, numbers, settings,
}) {
  const members = useMemo(() => {
    const faceLayouts = runFaceLayouts(room, wall, run, settings, layout);
    return frameMembers(region, regionOpenings(region, faceLayouts));
  }, [layout, region, room, run, settings, wall]);
  const groups = members ? groupMembers(members) : [];

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Face frame</h3>
      <PartNumberField
        roomId={room.id}
        partKey={region.id}
        autoNumber={numbers.byKey.get(region.id)}
        override={room.partNumberOverrides?.[region.id]}
        duplicate={numbers.warnings.some((warning) => warning.keys.includes(region.id))}
      />
      <p className="text-xs text-gray-300">
        {formatInches(region.width)} × {formatInches(region.height)}
      </p>
      {members === null ? (
        <p className="text-xs text-amber-300">These openings can&apos;t be cut into stiles and rails.</p>
      ) : (
        <ul className="space-y-1 rounded border border-gray-700 bg-gray-900/45 p-2 text-xs text-gray-300">
          {groups.map((group) => (
            <li key={`${group.kind}:${group.width}:${group.length}`} className="flex justify-between gap-2">
              <span>{group.count} × {MEMBER_LABELS[group.kind]}</span>
              <span className="tabular-nums">
                {formatInches(group.width)} × {formatInches(group.length)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-gray-500">Stiles run full height; rails fit between them. Derived, not saved.</p>
    </section>
  );
}
```

### `src/elevation/components/properties/PieceProperties.jsx`

- Add `import FrameSection from './FrameSection.jsx';` after the ExtendFields import.
- After the `insets` memo (step 231):

```js
  const region = frames.regions.find((candidate) => candidate.cabinetIds.includes(piece.id)) ?? null;
  const frameSection = region ? (
    <FrameSection
      room={room}
      wall={wall}
      run={run}
      layout={layout}
      region={region}
      numbers={numbers}
      settings={settings}
    />
  ) : null;
```

- `{frameSection}` goes right after `<CellProperties … />` in the cell branch and right after `<CabinetProperties … />` in the last branch. It renders nothing outside a frame.

### `src/elevation/components/RunGroup.jsx` (609)

- The frames import (18) becomes `import { frameRegions, frameVerticalChains, regionOpenings } from '../model/frames.js';`.
- After the `ghostIds` memo (87–90):

```js
  const frameChains = useMemo(
    () => frames.regions.flatMap((region) => frameVerticalChains(region, regionOpenings(region, faceLayouts))),
    [faceLayouts, frames],
  );
```

- Right after `<CellChains … />` (504–509):

```jsx
      {!preview && (
        <CellChains
          grids={frameChains}
          transform={transform}
          editable={false}
          onEditTrack={() => {}}
        />
      )}
```

No new tests (components). **Count stays 707.**

**Done when (round):** `npm test` (707) and `npm run lint` clean.

## §10 Left for 36.3 and later

- **36.3:** the per-split rail/mullion toggle and the 3/4" bottom rail on hanging bases.
- **Run end panels** (not wall end panels) stay covered by the frame whenever they overlap it, even when extended up or down (SPEC-35.3). The auto miter/butt rule and an override for run ends are left for later.
- The frame's part key is `frame:<first cabinet id>`. If the first cabinet is removed or replaced, a hand-set frame number is orphaned (the same as any removed piece's).
- The stile/rail list isn't in a report yet. The estimator can read `frameMembers` when that's built.
- A region that isn't a rectangle (`frame-not-rectangle`) is cut as if the missing corner were solid frame.
- Vertical opening chains are drawn inside the openings, at each stack's left edge. They can overlap a split column's own chain.
- A wall end panel's depth and height still come from the runs anchored at it (SPEC-17). A panel set deeper or taller by hand is later work; the `frame` override covers it until then.
