# Elevation Lab — SPEC-36.1 (face frame fixes: clearance, corners, plan view, end panels)

Steps 221–225, after round 36. The plan is in `CELLS-PLAN.md` (round 36.1). SPEC-36 still applies. Written against `f3b6033` (step 220). Baseline **692**.

| Step | What | Files | Tests after |
|---|---|---|---|
| **221** | Shape: `insetFrame.thickness` (13/16); `runFrame`; `syncRoom` derives `run._frame`, never saved. Inert. | `constants.js`, `styles.js`, `room.js`, `persistence.js`, `index.js`, `frameFixes.test.js` (new) | 694 |
| **222** | Model: face frame front depth (no bumper, no door); upper clearance to the frame's bottom rail; the corner stile minimum. | `corners.js`, `profile.js`, `room.js`, `frameFixes.test.js` | 696 |
| **223** | Model: plan pieces for a frame (no fillers, boxes at their true width, the frame strip mitered into its end panels); the mitered end panel gets its badge back. | `planPieces.js`, `partNumbers.js`, `frameFixes.test.js`, `partNumbers.test.js` | 697 |
| **224** | Plan view: draws mitered pieces and the frame strip. | `PlanRunFootprint.jsx` | 697 |
| **225** | Elevation: a frame's end panels show on hover, stay clickable and numbered. | `RunGroup.jsx`, `PieceRect.jsx` | 697 |

Next: **36.2** (one part number per frame, the stile/rail list, vertical opening dimensions) and **36.3** (the rail/mullion toggle, hanging bases).

## §1 The rules (Kyle, 2026-09-27)

- **A face frame run** is one whose run-level style (room, then run) is inset or beaded inset. `syncRoom` stores `run._frame = { thickness, drop }` on it (like `_seamGap`); a European run has none, and `toElevationDocument` strips it.
  - `thickness` is `insetFrame.thickness`, 13/16".
  - `drop` is `insetFrame.upperDrop` (3/4") on an upper whose doors overhang, else 0.
- **Front depth.** A face frame run's front is its box depth + 13/16" of frame. It has no bumper, and the inset doors sit in the frame, so no door thickness. A 24" base is 24 13/16" deep in plan, in its depth dimension, and in the corner reserve it leaves a neighbouring run.
- **Upper clearance.** The clearance above the counter (18" default) runs to the bottom of the frame's bottom rail. On an auto-height face frame upper the box sits `drop` higher: z = counter + 18 + 3/4, and the box is 3/4" shorter.
- **Corner stile.** At an inside corner, the whole stile clears the return run's doors, measured from the return run's face to the edge of the openings. So a face frame run's corner filler minimum is the Euro minimum less the side reveal (3/4" inset, 1" beaded), never below 0. At 90° that's 3/4" inset and 1/2" beaded, and the stile comes out at 1 1/2", the same as the Euro filler. Wall-scribe ends and other flex fillers keep `fillerMinWidth`.
- **Plan view.** Fillers in a frame aren't drawn, and neither are their returns. Framed boxes are drawn at their box width (narrower at a free end). The faces are replaced by one frame strip per region: from the box fronts to the frame's front (13/16"), across the region. At an end panel or side panel the region covers, the strip and the panel meet on a miter: a line from the panel's inside corner at the box front to its outside corner at the frame's front.
- **Elevation end panels.** A frame's end panels (and covered side panels) are drawn only while the pointer is over them or they're selected. They stay clickable, and they keep their part number badge. Fillers in a frame stay hidden.

**Worked example (the tests):** an inset base on a 144" wall, x 24, width 40, z 4, height 30.5, depth 24. It has a left end panel (3/4"), a (18), b (auto) and a right filler (2); `_frame` is 13/16 thick. The layout is: panel 24–24.75, a 24.75–42.75, b 42.75–62, filler 62–64. The region is x 24–64.
- Plan boxes: a 24.75–42.75 and b 42.75–62, back 0, front 24.
- End panel: 24–24.75, back 0, front 24 13/16. Mitered: (24, 0) → (24.75, 0) → (24.75, 24) → (24, 24.8125).
- Frame strip: 24–64, back 24, front 24.8125. Mitered: (24, 24.8125) → (64, 24.8125) → (64, 24) → (24.75, 24).
- The filler isn't drawn and has no return.

---

## §2 Step 221 — shape

### `src/elevation/model/constants.js` (120)

`insetFrame` (79) becomes
`insetFrame: { stile: 0.75, rail: 1.5, midRail: 1.5, mullion: 1.5, upperDrop: 0.75, thickness: 0.8125 },`

(Saved settings without `thickness` still work: every reader merges `{ ...DEFAULT_SETTINGS.insetFrame, ...settings.insetFrame }`.)

### `src/elevation/model/styles.js` (255)

Append:

```js
/**
 * A face frame run's frame (SPEC-36.1): its thickness, and how far its bottom rail drops below an
 * upper's box when the doors overhang. Null for a European run. Uses the run-level style.
 */
export function runFrame(room, run, settings) {
  const style = resolveStyle(settings, room, run);
  if (!isInsetStyle(style)) return null;
  const frame = { ...DEFAULT_SETTINGS.insetFrame, ...settings.insetFrame };
  const overhangs = run.cabinetTypeId === UPPER && (run.upperBottom ?? 'overhang') === 'overhang';
  return { thickness: frame.thickness, drop: overhangs ? frame.upperDrop : 0 };
}
```

(`UPPER` is already destructured at the top of styles.js.)

### `src/elevation/model/room.js` (1680)

- The styles import (49) becomes `import { runFrame, runSeamGap } from './styles.js';`.
- After `withSeamGap` (569–576):

```js
/** A run with its derived frame (SPEC-36.1), stored only on a face frame run. */
function withFrame(room, run, settings) {
  const frame = runFrame(room, run, settings);
  if (frame) {
    return run._frame?.thickness === frame.thickness && run._frame?.drop === frame.drop
      ? run
      : { ...run, _frame: frame };
  }
  if (run._frame === undefined) return run;
  const { _frame, ...rest } = run;
  void _frame;
  return rest;
}
```

- In `syncRoom`, the runs map (590) becomes
  `runs: wall.runs.map((run) => withFrame(nextRoom, withSeamGap(nextRoom, run, settings), settings)),`

### `src/elevation/store/persistence.js` (648)

`toElevationDocument` (606–609):

```js
          const { _pinWidths, _seamGap, _frame, ...persistedRun } = run;
          void _pinWidths;
          void _seamGap;
          void _frame;
          return persistedRun;
```

### `src/elevation/model/index.js`

The styles block adds `runFrame`.

### Tests

**New `src/elevation/model/__tests__/frameFixes.test.js`** (2):

```js
import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { gridFromItems } from '../grid.js';
import { syncRoom } from '../room.js';
import { runFrame } from '../styles.js';
import { toElevationDocument } from '../../store/persistence.js';

const S = DEFAULT_SETTINGS;
const { BASE, UPPER } = CABINET_TYPE_IDS;
const NONE = { type: 'none', width: null };
const INSET = { cabinetStyleId: 14 };
const FRAME = { thickness: 0.8125, drop: 0 };

const makeRun = (overrides = {}) => ({
  id: 'r', cabinetTypeId: BASE, x: 24, width: 40, z: 4, height: 30.5, depth: 24,
  ends: { left: NONE, right: NONE }, autoCount: false, maxCabinetWidth: null,
  heightMode: 'manual', overrides: {}, anchors: { left: false, right: false },
  grid: gridFromItems('r', [{ id: 'a', kind: 'cabinet', width: null }]),
  ...overrides,
});

function roomWith(runs, style) {
  return {
    id: 'room', name: 'Room', profile: { ...S.defaultProfile }, wallOrder: ['w'],
    ...(style ? { style } : {}),
    walls: [{
      id: 'w', name: '', numberOverride: null, elevationForced: false,
      x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5, flipped: false,
      connections: { start: null, end: null }, profile: {}, openings: [], joints: [], runs,
      endPanels: { start: null, end: null }, landings: { start: null, end: null }, soffits: [],
    }],
  };
}

describe('SPEC-36.1 frame shape', () => {
  it('derives a face frame run\'s frame from the run-level style', () => {
    const base = makeRun();
    const upper = makeRun({ id: 'u', cabinetTypeId: UPPER, z: 54, height: 36, depth: 12 });
    expect(runFrame(roomWith([base]), base, S)).toBeNull();
    expect(runFrame(roomWith([base], INSET), base, S)).toEqual(FRAME);
    expect(runFrame(roomWith([upper], INSET), upper, S)).toEqual({ thickness: 0.8125, drop: 0.75 });
    expect(runFrame(roomWith([upper], INSET), { ...upper, upperBottom: 'flush' }, S)).toEqual(FRAME);
    expect(runFrame(roomWith([base]), { ...base, style: { cabinetStyleId: 15 } }, S)).toEqual(FRAME);

    expect(syncRoom(roomWith([base], INSET), S).walls[0].runs[0]._frame).toEqual(FRAME);
    expect('_frame' in syncRoom(roomWith([{ ...base, _frame: FRAME }]), S).walls[0].runs[0]).toBe(false);
  });

  it('never saves the derived frame', () => {
    const room = syncRoom(roomWith([makeRun()], INSET), S);
    const state = {
      schemaVersion: 4, settings: S, rooms: [room], activeRoomId: 'room', activeWallId: 'w', view: 'elevation',
    };
    expect('_frame' in toElevationDocument(state).rooms[0].walls[0].runs[0]).toBe(false);
  });
});
```

**Count:** 692 + 2 = **694**.

---

## §3 Step 222 — depth, clearance, corners

### `src/elevation/model/corners.js` (222)

`frontDepth` (20–22):

```js
/** How far a run's front sits from the wall: box + frame on a face frame run (SPEC-36.1), else box + bumper + door. */
export function frontDepth(run, settings) {
  const outset = run.outset ?? 0;
  if (run._frame) return outset + run.depth + run._frame.thickness;
  return outset + run.depth + settings.bumperThickness + settings.doorThickness;
}
```

Every caller (plan footprint, depth dimension, collisions, corner reserve, wall end panels, blind panel depth, neighbour profiles) picks it up. None of them change.

### `src/elevation/model/profile.js` (101)

In `resolveVertical`, the upper branch (84): `z = counterReference + q.upperClearance;` becomes

```js
    // The clearance runs to the bottom of a face frame's bottom rail, which drops below the box (SPEC-36.1).
    z = counterReference + q.upperClearance + (run._frame?.drop ?? 0);
```

### `src/elevation/model/room.js`

- The styles import becomes `import { isInsetStyle, resolveStyle, runFrame, runSeamGap, styleReveals } from './styles.js';`.
- `endMinWidthsForRun` (189–201):

```js
export function endMinWidthsForRun(room, wall, run, settings) {
  wall = wallViewForRun(wall, run);
  const style = resolveStyle(settings, room, run);
  // A face frame's whole stile clears the corner, box-to-opening included (SPEC-36.1).
  const frameReveal = isInsetStyle(style) ? styleReveals(style, run.cabinetTypeId, settings).left : 0;
  return Object.fromEntries(['left', 'right'].map((side) => {
    const corner = cornerForRunSide(room, wall, run, side);
    return [
      side,
      (run.anchors?.[side] === true || run.anchors?.[side]?.to === 'wall')
        && corner.type === 'inside'
        ? Math.max(0, cornerFillerMin(settings, corner.angle) - frameReveal)
        : settings.fillerMinWidth,
    ];
  }));
}
```

### Tests: `frameFixes.test.js`

Imports add `import { cornerReserve, frontDepth } from '../corners.js';`, `import { DEFAULT_PROFILE } from '../constants.js';` (join the existing constants import), `import { resolveVertical } from '../profile.js';` and `endMinWidthsForRun` to the room.js import. After `roomWith`, add:

```js
function cornerRoom(runsA, runsB, style) {
  const wall = (id, x1, y1, x2, y2, connections, runs) => ({
    id, name: `Wall ${id}`, x1, y1, x2, y2, height: 96, thickness: 4.5, flipped: false,
    connections, profile: {}, runs,
  });
  return {
    id: 'R', name: 'Room R', profile: { ...S.defaultProfile }, ...(style ? { style } : {}),
    walls: [
      wall('A', 0, 0, 120, 0, { start: null, end: { wallId: 'B', endpoint: 'start' } }, runsA),
      wall('B', 120, 0, 120, 96, { start: { wallId: 'A', endpoint: 'end' }, end: null }, runsB),
    ],
  };
}
```

A describe at the end (2):

```js
describe('SPEC-36.1 depth, clearance and corners', () => {
  it('puts a face frame run\'s front at box + 13/16, and reserves that at a corner', () => {
    expect(frontDepth({ depth: 24 }, S)).toBe(24.875);
    expect(frontDepth({ depth: 24, _frame: FRAME }, S)).toBe(24.8125);
    expect(frontDepth({ depth: 24, outset: 2, _frame: FRAME }, S)).toBe(26.8125);

    const tall = makeRun({ id: 'B-tall', cabinetTypeId: CABINET_TYPE_IDS.TALL, anchors: { left: true, right: false } });
    const base = makeRun({ id: 'A-base' });
    expect(cornerReserve(cornerRoom([base], [tall]), cornerRoom([base], [tall]).walls[0], 'right', base, S))
      .toBe(24.875);
    const framed = cornerRoom([base], [{ ...tall, _frame: FRAME }]);
    expect(cornerReserve(framed, framed.walls[0], 'right', base, S)).toBe(24.8125);
  });

  it('measures upper clearance to the frame, and shortens the corner filler by the side reveal', () => {
    const upper = { cabinetTypeId: UPPER, heightMode: 'auto', overrides: {}, x: 0, width: 30 };
    expect(resolveVertical(upper, DEFAULT_PROFILE)).toMatchObject({ z: 54, height: 36 });
    expect(resolveVertical({ ...upper, _frame: { thickness: 0.8125, drop: 0.75 } }, DEFAULT_PROFILE))
      .toMatchObject({ z: 54.75, height: 35.25 });

    const anchored = makeRun({ anchors: { left: false, right: true } });
    const minimum = (style) => {
      const room = cornerRoom([anchored], [], style);
      return endMinWidthsForRun(room, room.walls[0], anchored, S);
    };
    expect(minimum()).toEqual({ left: 1.5, right: 1.5 });
    expect(minimum(INSET)).toEqual({ left: 1.5, right: 0.75 });
    expect(minimum({ cabinetStyleId: 15 })).toEqual({ left: 1.5, right: 0.5 });
  });
});
```

Working:
- Euro: 24 + 1/16 + 13/16 = 24 7/8. Face frame: 24 + 13/16 = 24 13/16, and with a 2" outset 26 13/16. The corner reserve is the return run's front depth (here the tall on wall B, anchored into the corner).
- Default profile: the counter is 4 + 30.5 + 1.5 = 36, so an upper sits at 54; the box top is 96 − 6 = 90, so it's 36 tall. With a 3/4" drop: 54.75 and 35.25.
- The right end is anchored into the inside corner (90°): the Euro minimum is 1.5. Inset: 1.5 − 0.75 = 0.75. Beaded: 1.5 − (0.75 + 0.25) = 0.5. The free left end keeps `fillerMinWidth` (1.5).

**Count:** 694 + 2 = **696**.

---

## §4 Step 223 — plan pieces and badges

### `src/elevation/model/planPieces.js` (241)

- Add `import { frameRegions } from './frames.js';` after the `corners.js` import (4).
- `fillerReturns` (139–162) takes the frame's fillers: the signature becomes `fillerReturns(run, settings, layout, panels, faceBack, hidden = new Set())`, and its first check becomes `if (piece.kind !== 'filler' || hidden.has(piece.id)) return [];`.
- Before `planRunPieces` (164), add:

```js
/**
 * A face frame region in plan (SPEC-36.1): one strip from the box fronts to the frame's front, mitered
 * into the end or side panel it covers at either end; those panels get the matching miter.
 */
function frameStrips(frames, pieces, faces, back, front) {
  const strips = [];
  const mitered = new Map();
  for (const region of frames.regions) {
    const end = region.x + region.width;
    const panels = pieces.filter((piece) => region.panelIds.includes(piece.id));
    const left = panels.find((panel) => Math.abs(panel.x - region.x) <= WIDTH_EPSILON);
    const right = panels.find((panel) => Math.abs(panel.x + panel.width - end) <= WIDTH_EPSILON);
    strips.push({
      key: region.id,
      kind: 'frame',
      start: region.x,
      end,
      back,
      front,
      polygon: [
        [region.x, front],
        [end, front],
        [right ? right.x : end, back],
        [left ? left.x + left.width : region.x, back],
      ],
    });
    if (left) mitered.set(left.id, 'left');
    if (right) mitered.set(right.id, 'right');
  }
  const next = faces.map((range) => {
    const side = mitered.get(range.key);
    if (!side) return range;
    const polygon = side === 'left'
      ? [[range.start, range.back], [range.end, range.back], [range.end, back], [range.start, range.front]]
      : [[range.start, range.back], [range.end, range.back], [range.end, range.front], [range.start, back]];
    return { ...range, polygon };
  });
  return [...next, ...strips];
}
```

- In `planRunPieces` (164–241):
  - After `const cells = cellPieces(run, layout);` (169):

```js
  const frames = frameRegions(room, run, cells, settings);
  const framedIds = new Set(frames.regions.flatMap((region) => region.cabinetIds));
```

  - In `boxes`, the box range reads a framed cabinet's box from its face layout. Right after `const rightBlindWidth = …;` (205) add `const frameBox = framedIds.has(piece.id) ? faceLayouts.get(piece.id)?.box : null;`, and the `start`/`end` lines become:

```js
      start: blindBox?.start ?? (leftBlindWidth
        ? piece.x + piece.width - leftBlindWidth
        : frameBox?.x ?? piece.x),
      end: blindBox?.end ?? (rightBlindWidth
        ? piece.x + rightBlindWidth
        : frameBox ? frameBox.x + frameBox.width : piece.x + piece.width),
```

  - `planFaces` is called with the pieces a frame doesn't cover, and the strips added (216–225):

```js
  const faces = frameStrips(frames, cells.pieces, planFaces(
    run,
    settings,
    cells.pieces.filter((piece) => !framedIds.has(piece.id) && !frames.fillerIds.has(piece.id)),
    faceLayouts,
    panels,
    band,
    faceBack,
    faceFront,
  ), run.depth, faceFront);
  const returns = fillerReturns(run, settings, layout, panels, faceBack, frames.fillerIds);
```

  - `shift` (228–230) shifts a polygon too:

```js
  const shift = (piece) => (outset
    ? {
      ...piece,
      back: piece.back + outset,
      front: piece.front + outset,
      ...(piece.polygon ? { polygon: piece.polygon.map(([u, v]) => [u, v + outset]) } : {}),
    }
    : piece);
```

A European run has no regions: `frameStrips` returns its faces unchanged, and nothing else moves.

### `src/elevation/model/partNumbers.js` (250)

`wallBadgeGroups` (222–225): a frame's end panels keep their badge; only its fillers (which have no number) are left out:

```js
    const covered = new Set(frames.regions.flatMap((region) => region.fillerIds));
```

### Tests

**`frameFixes.test.js`**: imports add `import { layoutRun, runFaceLayouts } from '../faceLayouts.js';`, `import { planRunPieces } from '../planPieces.js';` and `resolveWall` to the room.js import. A describe at the end (1):

```js
describe('SPEC-36.1 plan pieces', () => {
  it('draws a frame strip mitered into its end panel, with no filler', () => {
    const run = makeRun({
      _frame: FRAME,
      ends: { left: { type: 'end_panel', width: null }, right: { type: 'filler', width: 2 } },
      grid: gridFromItems('r', [{ id: 'a', kind: 'cabinet', width: 18 }, { id: 'b', kind: 'cabinet', width: null }]),
    });
    const room = roomWith([run], INSET);
    const wall = resolveWall(room, room.walls[0]);
    const layout = layoutRun(room, wall, run, S);
    const plan = planRunPieces(room, wall, run, S, layout, runFaceLayouts(room, wall, run, S, layout));
    expect(plan.boxes.map(({ key, start, end, back, front }) => [key, start, end, back, front]))
      .toEqual([['a', 24.75, 42.75, 0, 24], ['b', 42.75, 62, 0, 24]]);
    expect(plan.faces).toEqual([
      {
        key: 'r:left', kind: 'end_panel', start: 24, end: 24.75, back: 0, front: 24.8125,
        polygon: [[24, 0], [24.75, 0], [24.75, 24], [24, 24.8125]],
      },
      {
        key: 'frame:a', kind: 'frame', start: 24, end: 64, back: 24, front: 24.8125,
        polygon: [[24, 24.8125], [64, 24.8125], [64, 24], [24.75, 24]],
      },
    ]);
    expect(plan.returns).toEqual([]);
    expect(plan.span).toEqual({ start: 24, end: 64 });
  });
});
```

(The §1 worked example. 40 − 0.75 − 18 − 2 = 19.25 for b. The end panel's side is covered and the filler is a member, so neither box has a free side. `resolveWall` keeps `_frame`.)

**`src/elevation/model/__tests__/partNumbers.test.js`**, the SPEC-36 test `'numbers no filler inside a face frame, and badges no covered end panel'`: its title becomes `'numbers no filler inside a face frame, and badges the mitered end panel'`, and its last expectation becomes `.toEqual(['A-base:left', 'a1', 'a2']);`. Nothing else changes.

**Count:** 696 + 1 = **697**.

---

## §5 Step 224 — plan view

### `src/elevation/plan/PlanRunFootprint.jsx` (273)

- `depthRangePoints` (63–70) draws a polygon when a piece has one:

```js
function depthRangePoints(frame, range) {
  if (range.polygon) return range.polygon.map(([u, v]) => elevationToPlan(frame, u, v));
  return [
    elevationToPlan(frame, range.start, range.back),
    elevationToPlan(frame, range.end, range.back),
    elevationToPlan(frame, range.end, range.front),
    elevationToPlan(frame, range.start, range.front),
  ];
}
```

- The faces map (183–198): `faceColor` gives the frame strip the run's color. It's already `color` for anything that isn't a filler or panel, so no change is needed there. Leave the map as it is.

Nothing else. The box outlines, returns and the depth dimension already read the plan pieces and `frontDepth`.

No new tests (component). **Count stays 697.**

---

## §6 Step 225 — elevation end panels

### `src/elevation/components/RunGroup.jsx` (602)

Replace `framedIds` and `hiddenIds` (79–84) with:

```js
  const framedIds = useMemo(
    () => new Set(frames.regions.flatMap((region) => region.cabinetIds)),
    [frames],
  );
  const hiddenIds = useMemo(
    () => new Set(frames.regions.flatMap((region) => region.fillerIds)),
    [frames],
  );
  const ghostIds = useMemo(
    () => new Set(frames.regions.flatMap((region) => region.panelIds)),
    [frames],
  );
```

and `<PieceRect …>` (437–450) gains `ghost={ghostIds.has(piece.id)}`. Nothing else.

### `src/elevation/components/PieceRect.jsx` (133)

- Props gain `ghost = false,` after `framed = false,`.
- `const showLabels = !framed;` becomes:

```js
  // A framed box never shows; a mitered end panel (ghost) shows while hovered or selected (SPEC-36.1).
  const quiet = framed || (ghost && !hovered && !selected);
  const showLabels = !quiet;
```

- In the `<Rect>`, `fill={framed` becomes `fill={quiet` and `stroke={framed && outline === '#1e293b'` becomes `stroke={quiet && outline === '#1e293b'`.

A ghost piece is always there to hover and click. While hovered or selected it draws as a normal end panel, with its label.

No new tests (components). **Count stays 697.**

**Done when (round):** `npm test` (697) and `npm run lint` clean.

## §7 Left for 36.2 and later

- **36.2:** one part number per frame, its stiles and rails listed under it (stiles full height, rails between; derived); vertical opening dimensions.
- **36.3:** the per-split rail/mullion toggle; the 3/4" bottom rail on hanging bases.
- `_frame` follows the run-level style. A European cell inside a face frame run (or the reverse) doesn't change the run's front depth or clearance.
- A face frame's non-corner flex filler (against a plain wall, a window, another run) keeps the 1 1/2" `fillerMinWidth`.
- `defaultsForType` (the height a newly drawn upper starts with) doesn't add the drop; `syncRoom` corrects an auto-height upper right away. A manual-height upper keeps its z.
- The plan view doesn't show the gaps under a frame as different from a box's front.
