# Elevation Lab — SPEC-38 (recesses and projections)

Steps 270–279, after 37.4. Written against `3ed8712` (step 269). Baseline **802**.

The code below wasn't run before this was written (Codex implements it). The expected numbers in the tests were worked out by hand from §1, and the tall-under-a-top numbers (z 4, height 74) were checked against today's soffit code. If a test fails, check its expected value against §1 before changing the code, and say so in the summary.

| Step | What | Tests after |
|---|---|---|
| **270** | Model: `recesses.js` (the shape, geometry, ends, warnings, plan shapes) and the plane-aware `frontDepth`. Nothing calls it yet. | 813 |
| **271** | Saves accept recesses, `run.recessId`, `opening.recessId` and recess anchors | 816 |
| **272** | Model: runs on a recess: plane in `syncRoom`, anchors, top as a soffit, conflicts by depth, warnings, flip | 822 |
| **273** | Model: drawing, stretching and moving snap to recess edges; a run drawn inside a recess sits on it | 825 |
| **274** | Model: recesses in the elevation's wall row and the plan's face rows | 827 |
| **275** | Store: `selection.recessId` (shape only) | 828 |
| **276** | Store: add, update, resize, delete recesses; set a run's plane; recess anchors; an opening's recess; the recess tool | 832 |
| **277** | Elevation: draw recesses, place one with the Recess tool, select, delete; doors placed in a recess sit in it | 832 |
| **278** | Properties: the recess panel; a run's "Sits on"; recess anchors; an opening's "Set in"; warning text | 832 |
| **279** | Plan: the notch, the bump-out and the projection; doors at the recess back; run depth measured from the recess back | 833 |

Next: **38.1** (recessed cabinets: frame lap, end panels to the face, casing; panel cutouts), then Kyle decides on merging `elevation-grid-run-split`. Combine and full grids move to round 39.

## After this round you can

- Pick **Recess** in the elevation toolbar and click the wall: a 36" wide, 12" deep, floor-to-ceiling recess appears. Type its width, depth, bottom (0 = floor), height or "up to the ceiling", and its position from either wall end, by edge or center, like a window.
- Turn it into a **projection** (a fireplace breast, a chase) with the Kind select.
- Draw cabinets inside a recess: they sit on its back, stop at its sides with fillers, and an upper or tall stops under its top like it's under a soffit. A base deeper than the recess sticks out past the wall face and gets end panels.
- Draw cabinets on the wall face beside a recess: they stop at its edge with an end panel. Beside a projection they stop at its side with a filler. A base can run across the front of a recess.
- Put a door in the back of a recess, or a door on the face with cabinets in the recess beside it. It's all one elevation.
- In plan: a floor recess is a notch in the wall (a deep one bumps the wall out behind it), a raised recess (a medicine cabinet's) is dashed, and a projection is solid wall in front of the face. Doors in a recess are drawn at its back, and a recessed run's depth dimension is measured from the recess back.
- Panel-only runs (a side panel drawn as its own run) reserve only their thickness, not a door's.

## Not in this round

- How a recessed cabinet finishes against the wall: the face frame lapping the recess edge, end panels flush to the wall face, casing (38.1).
- Panel cutouts and the medicine cabinet through a side panel (38.1).
- Selecting a recess in plan (select it in the elevation). Doors placed in plan don't land in a recess on their own (set "Set in" in the panel).
- The other face of the wall doesn't show a deep recess's bump-out in its own elevation, and the plan's face row behind the wall can overlap the bump-out drawing.
- Cabinets on a recess's side faces (draw real walls for that, as before). A run on the face that crosses a recess can't be made deeper behind the face yet.
- No new settings: the default size (36" × 12") lives in `recesses.js`.

---

## §1 Decisions (Kyle, 2026-10-01)

**One wall, one elevation.** A recess is a section of a wall face pushed back by a depth; a projection is the same section built out. Rooms are drawn with 4 1/2" walls, but a recess can be any depth (a 24" cabinet recess beside a fireplace). Everything stays on the host wall's elevation. Real walls are still the way to go when the sides of a niche need their own elevation.

**The shape** (`wall.recesses`, optional, one face each like soffits):

```js
recess = {
  id, label,                       // 'R1', 'P1'
  kind: 'recess' | 'projection',
  wallSide: 'front' | 'back',
  offsetFrom: 'left' | 'right', offsetAnchor: 'edge' | 'center', offset,   // like a window
  width,
  bottom,                          // 0 = the floor
  height: number | null,           // null = up to the ceiling (the wall height)
  depth,                           // > 0, back from the face (recess) or out from it (projection)
  molding: 'crown' | 'topMold' | 'none',   // what runs on it put under its top, as under a soffit
}
run.recessId?      // the run sits on that recess's back (or projection's face)
opening.recessId?  // a door or window set in the back of a front-face recess
anchor { to: 'recess', recessId, edge: 'left' | 'right', offset }   // a run end at a recess side or edge
```

**Planes.** A run sits on the wall face, or on one recess (`run.recessId`). `syncRoom` derives `run._plane` from it (never saved): the recess's x, width, bottom, top, depth, label, molding and `offset`, the plan offset of that plane from the wall face: **−depth for a recess, +depth for a projection**. `outset` stays measured from the run's own plane. Everything that measures a run's depth from the wall face uses `runBackOffset(run) = plane offset + outset`, so `frontDepth` can be negative: a 12" upper in a 24" recess has its front 11 1/8" behind the face.

**Corners at recesses.** A run end anchored to a recess makes a square corner:

| The run is… | at a recess | at a projection |
|---|---|---|
| on it (its back / its face) | **inside**: its side stops the run | **outside**: the run ends at its edge |
| on the wall face beside it | **outside** | **inside** |

An inside corner starts with a **filler** (with the corner filler minimum, 90°), unless the run's box stands out past the corner's wall: past the face for a recess (a 24" base in a 12" recess), past the projection's face beside a projection. Then it starts with an **end panel**, as an outside corner does.

**The top.** A recess that stops below the ceiling acts like a soffit for the runs on it: an auto upper or tall stops under it, with the recess's molding. Up to the ceiling, nothing changes.

**Conflicts.** Two runs on different planes only conflict where their plan depths overlap, so a base on the face can run across a recess with uppers inside it, or in front of a shallower recessed base. On the same plane nothing changes.

**Warnings** (run diagnostics):

- `recess-overflow`: a run on a recess goes past its sides, top or bottom.
- `projection-conflict`: a run on the wall face overlaps a projection in elevation without standing out past it.
- `anchor-recess-missing` (error): the anchored recess no longer exists.

**Drawing.** A run drawn inside a recess's rectangle (within the 3" corner snap) sits on it. A run edge drawn, stretched or moved within snap of a recess edge anchors to it. A door or window placed in the elevation inside a recess (`kind: 'recess'`, front face) is set in it.

**Dimensions.** The elevation's wall row and the plan's face rows show each recess at its width (kind `'recess'`). An opening inside a recess splits it: recess edge → opening → recess edge, so a door is located from the recess sides.

**Plan.** A floor recess knocks a notch out of the wall. One at least as deep as the wall bumps the wall out behind it, keeping the wall's thickness around it. A recess with its bottom above the floor leaves the wall solid and draws the notch dashed. A projection is solid wall in front of the face (dashed when raised). A door in a recess is drawn through what's left behind the recess back.

**Panel-only runs.** A run whose every cell is a `panel` reserves `outset + depth`: no bumper, no door (from ALCOVE-PLAN round 39).

---

## §2 Step 270 — Model: the recess module

**Files:** NEW `src/elevation/model/recesses.js`, NEW `src/elevation/model/__tests__/recesses.test.js`, `src/elevation/model/corners.js` (224), `src/elevation/model/index.js` (367), and one line each in `src/elevation/model/footprints.js` (134), `src/elevation/model/planPieces.js` (352), `src/elevation/model/neighborProfiles.js`.

Nothing sets `_plane` until step 272, so the readers switched here behave exactly as before.

### `src/elevation/model/corners.js`

1. Imports: add `import { gridLeaves } from './grid.js';` before the `./landings.js` import.
2. `frontDepth` (20–24) becomes, with `runBackOffset` above it:

```js
/** How far a run's back sits from the wall face: its plane (a recess back or projection face, SPEC-38) plus its outset. */
export function runBackOffset(run) {
  return (run._plane?.offset ?? 0) + (run.outset ?? 0);
}

/**
 * How far a run's front sits from the wall face: box + frame on a face frame run (SPEC-36.1), else box + bumper
 * + door. A run that's only panels reserves just the panel (SPEC-38). Negative when the run is deep in a recess.
 */
export function frontDepth(run, settings) {
  const back = runBackOffset(run);
  const leaves = run.grid ? gridLeaves(run.grid) : [];
  if (leaves.length > 0 && leaves.every((leaf) => leaf.kind === 'panel')) return back + run.depth;
  if (run._frame) return back + run.depth + run._frame.thickness;
  return back + run.depth + settings.bumperThickness + settings.doorThickness;
}
```

### The run's back, in three readers

Each adds `runBackOffset` to its existing `./corners.js` import:

- `footprints.js` `runFootprint` (9): `const outset = run.outset ?? 0;` → `const outset = runBackOffset(run);`
- `planPieces.js` `planRunPieces` (211): `const outset = run.outset ?? 0;` → `const outset = runBackOffset(run);` (its `faceFront` and `shift` then follow on their own).
- `neighborProfiles.js` (39): `[run.outset ?? 0, depth]` → `[runBackOffset(run), depth]`.

`RunGeometrySection.jsx` and `persistence.js` keep reading `run.outset`: they're about the stored value.

### `src/elevation/model/index.js`

Add `runBackOffset,` to the `./corners.js` export block (221–232, after `resolveHorizontal`), and append at the end:

```js
export {
  DEFAULT_RECESS,
  MIN_RECESS_WIDTH,
  RECESS_KINDS,
  RECESS_MOLDINGS,
  RECESS_PLACEMENT_MESSAGES,
  createRecess,
  openingPlanDepths,
  recessAnchorDatum,
  recessCorner,
  recessEdges,
  recessEndType,
  recessForSpan,
  recessGeometry,
  recessPlanShape,
  recessWarnings,
  recessesOn,
  resizeRecess,
  runPlane,
  uncoveredSpans,
  validateRecessPlacement,
  withRunPlane,
} from './recesses.js';
```

### NEW `src/elevation/model/recesses.js`

```js
import { v4 as uuid } from 'uuid';
import { runBackOffset } from './corners.js';
import { clamp, wallLength } from './geometry.js';
import { verticalStart } from './overlap.js';
import { positionReadouts, startFromReadout, stretchedStart } from './positions.js';
import { roundTo } from './units.js';
import { wallSideOf } from './wallSides.js';

/** SPEC-38: a recess is cut back into a wall face; a projection is built out from it. */
export const RECESS_KINDS = ['recess', 'projection'];
/** What runs on a recess put under its top when it stops below the ceiling, as under a soffit. */
export const RECESS_MOLDINGS = ['crown', 'topMold', 'none'];
/** A new recess: 36" wide, 12" deep, floor to ceiling. */
export const DEFAULT_RECESS = { width: 36, depth: 12 };
export const MIN_RECESS_WIDTH = 1;
export const RECESS_PLACEMENT_MESSAGES = {
  'recess-too-small': 'A recess needs a width, a depth and some height.',
  'recess-out-of-bounds': 'A recess has to stay inside the wall.',
  'recess-overlap': "Recesses can't overlap.",
};

const EPSILON = 1e-6;

function kindOf(recess) {
  return recess.kind === 'projection' ? 'projection' : 'recess';
}

/** The recesses and projections on one face: a side view's own face, or a wall and a side. */
export function recessesOn(wallOrView, side = wallOrView.side ?? 'front') {
  const wall = wallOrView.sideSource ?? wallOrView;
  return (wall.recesses ?? []).filter((recess) => wallSideOf(recess) === side);
}

/**
 * Where a recess sits on its face: x, width, bottom, top (the wall height when it goes up to the ceiling),
 * depth, its plane as a plan offset from the face (−depth for a recess, +depth for a projection), and its
 * four position readouts.
 */
export function recessGeometry(recess, length, height) {
  const x = startFromReadout(
    recess.offsetFrom,
    recess.offsetAnchor ?? 'edge',
    recess.offset,
    recess.width,
    length,
  );
  const top = recess.height === null || recess.height === undefined
    ? height
    : recess.bottom + recess.height;
  return {
    x,
    width: recess.width,
    bottom: recess.bottom,
    top,
    depth: recess.depth,
    plane: kindOf(recess) === 'projection' ? recess.depth : -recess.depth,
    offsets: positionReadouts(x, recess.width, length),
  };
}

/** A new recess centered on x, measured from the left end, numbered R1, R2… (P1, P2… for projections). */
export function createRecess({ kind = 'recess', x }, { room, wall }) {
  const length = wallLength(wall);
  const width = Math.min(DEFAULT_RECESS.width, length);
  const left = clamp(roundTo(x - width / 2, 0.5), 0, length - width);
  const count = (room?.walls ?? []).reduce((total, candidate) => (
    total + (candidate.recesses ?? []).filter((recess) => kindOf(recess) === kind).length
  ), 0);
  return {
    id: uuid(),
    kind,
    label: `${kind === 'projection' ? 'P' : 'R'}${count + 1}`,
    wallSide: wall.side ?? 'front',
    offsetFrom: 'left',
    offsetAnchor: 'edge',
    offset: left,
    width,
    bottom: 0,
    height: null,
    depth: DEFAULT_RECESS.depth,
    molding: 'crown',
  };
}

/** Size, wall bounds, and no overlap with another recess on the same face (stacked ones are fine). */
export function validateRecessPlacement(view, recess) {
  const length = wallLength(view);
  const geometry = recessGeometry(recess, length, view.height);
  if (!(geometry.width >= MIN_RECESS_WIDTH) || !(geometry.depth > 0)
    || geometry.bottom < -EPSILON || !(geometry.top > geometry.bottom + EPSILON)) {
    return { ok: false, reason: 'recess-too-small' };
  }
  if (geometry.x < -EPSILON || geometry.x + geometry.width > length + EPSILON
    || geometry.top > view.height + EPSILON) {
    return { ok: false, reason: 'recess-out-of-bounds' };
  }
  const overlaps = recessesOn(view, wallSideOf(recess)).some((other) => {
    if (other.id === recess.id) return false;
    const rect = recessGeometry(other, length, view.height);
    const across = Math.min(geometry.x + geometry.width, rect.x + rect.width) - Math.max(geometry.x, rect.x);
    const up = Math.min(geometry.top, rect.top) - Math.max(geometry.bottom, rect.bottom);
    return across > EPSILON && up > EPSILON;
  });
  return overlaps
    ? { ok: false, reason: 'recess-overlap' }
    : { ok: true, reason: null };
}

/** A new width, growing 'left', 'right' or 'both'; the offset stays in the recess's own terms. */
export function resizeRecess(recess, width, grow, length) {
  if (!Number.isFinite(width) || width <= 0) return recess;
  const { x } = recessGeometry(recess, length, 0);
  const nextX = stretchedStart(x, recess.width, width, grow);
  return {
    ...recess,
    width,
    offset: positionReadouts(nextX, width, length)[recess.offsetFrom][recess.offsetAnchor ?? 'edge'],
  };
}

/** The plane a run sits on (SPEC-38): its recess, resolved, or null on the wall face. */
export function runPlane(wall, run) {
  if (!run.recessId) return null;
  const recess = recessesOn(wall, wallSideOf(run)).find((candidate) => candidate.id === run.recessId);
  if (!recess) return null;
  const geometry = recessGeometry(recess, wallLength(wall), wall.height);
  return {
    recessId: recess.id,
    kind: kindOf(recess),
    label: recess.label,
    x: geometry.x,
    width: geometry.width,
    bottom: geometry.bottom,
    top: geometry.top,
    depth: geometry.depth,
    offset: geometry.plane,
    molding: recess.molding ?? 'crown',
  };
}

/** A run with its derived `_plane` (never saved); the same run when there's nothing to change. */
export function withRunPlane(wall, run) {
  const plane = runPlane(wall, run);
  if (plane) return { ...run, _plane: plane };
  if (run._plane === undefined) return run;
  const { _plane, ...rest } = run;
  void _plane;
  return rest;
}

/**
 * The corner a run end anchored to a recess makes (SPEC-38 §1): 'inside' where the run meets the recess's
 * side (inside a recess, or beside a projection), 'outside' where it ends at its edge (beside a recess, or
 * on a projection's face). Always square. Null when the end isn't anchored to a recess on this face.
 */
export function recessCorner(wall, run, side) {
  const anchor = run.anchors?.[side];
  if (anchor?.to !== 'recess') return null;
  const recess = recessesOn(wall, wallSideOf(run)).find((candidate) => candidate.id === anchor.recessId);
  if (!recess) return null;
  const onPlane = run.recessId === recess.id;
  const inside = onPlane === (kindOf(recess) === 'recess');
  return { type: inside ? 'inside' : 'outside', angle: 90, recess };
}

/**
 * The end a recess anchor starts with: a filler at an inside corner, unless the run's box stands out past
 * the corner's wall (past the face for a recess, past the projection's face beside one); else an end panel.
 */
export function recessEndType(wall, run, side) {
  const corner = recessCorner(wall, run, side);
  if (corner?.type !== 'inside') return 'end_panel';
  const reach = kindOf(corner.recess) === 'recess' ? 0 : corner.recess.depth;
  const boxFront = runBackOffset(withRunPlane(wall, run)) + run.depth;
  return boxFront > reach + EPSILON ? 'end_panel' : 'filler';
}

/** Resolve a recess anchor to a wall-local x on a side view; null when the recess is gone. */
export function recessAnchorDatum(view, anchor, side) {
  const recess = recessesOn(view).find((candidate) => candidate.id === anchor.recessId);
  if (!recess) return null;
  const { x, width } = recessGeometry(recess, wallLength(view), view.height);
  const edge = anchor.edge === 'left' ? x : x + width;
  const offset = anchor.offset ?? 0;
  return side === 'left' ? edge + offset : edge - offset;
}

/** Every recess edge on a side view, for snapping: { value, recessId, edge }. */
export function recessEdges(view) {
  const length = wallLength(view);
  return recessesOn(view).flatMap((recess) => {
    const { x, width } = recessGeometry(recess, length, view.height);
    return [
      { value: x, recessId: recess.id, edge: 'left' },
      { value: x + width, recessId: recess.id, edge: 'right' },
    ];
  });
}

/** The first recess (of `kinds`) on a side view whose rectangle holds a span, within a tolerance. */
export function recessForSpan(view, span, tolerance = 0, kinds = RECESS_KINDS) {
  const length = wallLength(view);
  return recessesOn(view).find((recess) => {
    if (!kinds.includes(kindOf(recess))) return false;
    const rect = recessGeometry(recess, length, view.height);
    return span.left >= rect.x - tolerance - EPSILON
      && span.right <= rect.x + rect.width + tolerance + EPSILON
      && span.bottom >= rect.bottom - tolerance - EPSILON
      && span.top <= rect.top + tolerance + EPSILON;
  }) ?? null;
}

/** A synced run's recess warnings (SPEC-38 §1): past its recess, or into a projection from the face. */
export function recessWarnings(wall, run) {
  const warnings = [];
  const plane = run._plane;
  if (plane && (run.x < plane.x - EPSILON
    || run.x + run.width > plane.x + plane.width + EPSILON
    || verticalStart(run) < plane.bottom - EPSILON
    || run.z + run.height > plane.top + EPSILON)) {
    warnings.push({ code: 'recess-overflow', recessId: plane.recessId, label: plane.label });
  }
  const length = wallLength(wall);
  for (const recess of recessesOn(wall, wallSideOf(run))) {
    if (kindOf(recess) !== 'projection' || recess.id === run.recessId) continue;
    const rect = recessGeometry(recess, length, wall.height);
    const across = Math.min(run.x + run.width, rect.x + rect.width) - Math.max(run.x, rect.x);
    const up = Math.min(run.z + run.height, rect.top) - Math.max(verticalStart(run), rect.bottom);
    if (across > EPSILON && up > EPSILON && runBackOffset(run) < rect.depth - EPSILON) {
      warnings.push({ code: 'projection-conflict', recessId: recess.id, label: recess.label });
    }
  }
  return warnings;
}

/**
 * A recess or projection in plan (SPEC-38), in face coordinates [u along the face, v out from it]:
 * `knockout` (cut out of the wall), `fill` (wall added: a deep recess's bump-out, or a projection), `lines`
 * (its outline), `dashed` (raised off the floor: the wall is solid at the floor and only the outline shows),
 * `label` (a point). A recess at least as deep as the wall keeps the wall's thickness around it.
 */
export function recessPlanShape(recess, length, height, thickness) {
  const geometry = recessGeometry(recess, length, height);
  const a = geometry.x;
  const b = geometry.x + geometry.width;
  const d = geometry.depth;
  const dashed = geometry.bottom > EPSILON;
  if (kindOf(recess) === 'projection') {
    return {
      dashed,
      knockout: null,
      fill: dashed ? null : [[a, 0], [b, 0], [b, d], [a, d]],
      lines: [[[a, 0], [a, d]], [[a, d], [b, d]], [[b, d], [b, 0]]],
      label: [(a + b) / 2, d / 2],
    };
  }
  const deep = d >= thickness - EPSILON;
  const back = -(d + thickness);
  const outer = [a - thickness, b + thickness];
  return {
    dashed,
    knockout: dashed ? null : [[a, 0], [b, 0], [b, -d], [a, -d]],
    fill: deep && !dashed
      ? [[outer[0], -thickness], [outer[1], -thickness], [outer[1], back], [outer[0], back]]
      : null,
    lines: [
      [[a, 0], [a, -d]],
      [[a, -d], [b, -d]],
      [[b, -d], [b, 0]],
      ...(deep
        ? [
            [[outer[0], -thickness], [outer[0], back]],
            [[outer[0], back], [outer[1], back]],
            [[outer[1], back], [outer[1], -thickness]],
          ]
        : []),
    ],
    label: [(a + b) / 2, -d / 2],
  };
}

/**
 * How a door or window cuts the wall in plan (SPEC-38), as offsets from the front face: from `face` back to
 * `back`. Set in a front recess, it sits at the recess back and goes through what's left behind it.
 */
export function openingPlanDepths(wall, opening) {
  const recess = opening.recessId
    ? recessesOn(wall, 'front').find((candidate) => (
      candidate.id === opening.recessId && kindOf(candidate) === 'recess'
    ))
    : null;
  if (!recess) return { face: 0, back: -wall.thickness };
  const behind = recess.depth >= wall.thickness - EPSILON
    ? wall.thickness
    : wall.thickness - recess.depth;
  return { face: -recess.depth, back: -recess.depth - behind };
}

/** The parts of [start, end] that `ranges` ({ start, end }) don't cover, left to right. */
export function uncoveredSpans(start, end, ranges) {
  const spans = [];
  let cursor = start;
  for (const range of [...ranges].sort((one, two) => one.start - two.start)) {
    if (range.start > cursor + EPSILON) spans.push({ start: cursor, end: Math.min(end, range.start) });
    cursor = Math.max(cursor, range.end);
  }
  if (end > cursor + EPSILON) spans.push({ start: cursor, end });
  return spans;
}
```

### NEW `src/elevation/model/__tests__/recesses.test.js`

```js
import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { frontDepth, runBackOffset } from '../corners.js';
import { gridFromItems } from '../grid.js';
import {
  createRecess,
  openingPlanDepths,
  recessAnchorDatum,
  recessCorner,
  recessEdges,
  recessEndType,
  recessForSpan,
  recessGeometry,
  recessPlanShape,
  recessWarnings,
  recessesOn,
  resizeRecess,
  uncoveredSpans,
  validateRecessPlacement,
  withRunPlane,
} from '../recesses.js';

const S = DEFAULT_SETTINGS;
/** 48" wide, 24" deep, floor to ceiling, 60" from the left: 60 to 108. */
const R = {
  id: 'R', kind: 'recess', label: 'R1', wallSide: 'front', offsetFrom: 'left', offsetAnchor: 'edge',
  offset: 60, width: 48, bottom: 0, height: null, depth: 24, molding: 'crown',
};
/** A medicine cabinet's: 150 to 166, 48" up, 26" tall, 3 1/2" deep. */
const M = { ...R, id: 'M', label: 'R2', offset: 150, width: 16, bottom: 48, height: 26, depth: 3.5 };
/** A projection 60" wide, 12" from the right of a 240" wall: 168 to 228, 18" out. */
const P = { ...R, id: 'P', kind: 'projection', label: 'P1', offsetFrom: 'right', offset: 12, width: 60, depth: 18 };

const wall = (recesses = [R, M, P], extra = {}) => ({
  id: 'H', x1: 0, y1: 0, x2: 240, y2: 0, height: 108, thickness: 4.5, flipped: false,
  runs: [], openings: [], recesses, ...extra,
});
const base = (extra = {}) => ({
  id: 'b', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 60, width: 48, z: 4, height: 30.5, depth: 24,
  anchors: { left: false, right: false }, ...extra,
});
const upper = (extra = {}) => base({ cabinetTypeId: CABINET_TYPE_IDS.UPPER, z: 54, height: 30, depth: 12, ...extra });
const at = (recessId, edge, offset = 0) => ({ to: 'recess', recessId, edge, offset });
const cell = (col, node) => ({ col, row: 0, colSpan: 1, rowSpan: 1, node });
const track = (id) => ({ id, size: null, sizeMode: 'auto' });

describe('SPEC-38 recesses', () => {
  it('resolves a recess like a window, and lists them by face', () => {
    expect(recessGeometry(R, 240, 108)).toEqual({
      x: 60, width: 48, bottom: 0, top: 108, depth: 24, plane: -24,
      offsets: { left: { edge: 60, center: 84 }, right: { edge: 132, center: 156 } },
    });
    expect(recessGeometry(M, 240, 108)).toMatchObject({ x: 150, top: 74, plane: -3.5 });
    expect(recessGeometry(P, 240, 108)).toMatchObject({ x: 168, top: 108, plane: 18 });
    expect(recessesOn(wall()).map(({ id }) => id)).toEqual(['R', 'M', 'P']);
    expect(recessesOn(wall(), 'back')).toEqual([]);
  });

  it('creates a 36" × 12" floor-to-ceiling recess centered on the click', () => {
    const empty = wall([]);
    expect(createRecess({ x: 100 }, { room: { walls: [empty] }, wall: empty })).toMatchObject({
      kind: 'recess', label: 'R1', wallSide: 'front', offsetFrom: 'left', offsetAnchor: 'edge',
      offset: 82, width: 36, bottom: 0, height: null, depth: 12, molding: 'crown',
    });
    expect(createRecess({ x: 230 }, { room: { walls: [empty] }, wall: empty }).offset).toBe(204);
    expect(createRecess({ x: 100 }, { room: { walls: [wall()] }, wall: empty }).label).toBe('R3');
    expect(createRecess({ kind: 'projection', x: 100 }, { room: { walls: [wall()] }, wall: empty }).label)
      .toBe('P2');
    expect(createRecess({ x: 100 }, { room: { walls: [empty] }, wall: { ...empty, side: 'back' } }).wallSide)
      .toBe('back');
  });

  it('validates size, bounds and overlap; stacked recesses are fine', () => {
    expect(validateRecessPlacement(wall(), R)).toEqual({ ok: true, reason: null });
    expect(validateRecessPlacement(wall(), { ...R, id: 'X', offset: 80, width: 20 }).reason).toBe('recess-overlap');
    expect(validateRecessPlacement(wall(), { ...M, id: 'M2', bottom: 80, height: 10 }).ok).toBe(true);
    expect(validateRecessPlacement(wall(), { ...R, offset: 220 }).reason).toBe('recess-out-of-bounds');
    expect(validateRecessPlacement(wall(), { ...M, height: 70 }).reason).toBe('recess-out-of-bounds');
    expect(validateRecessPlacement(wall(), { ...R, depth: 0 }).reason).toBe('recess-too-small');
    expect(validateRecessPlacement(wall(), { ...R, width: 0.5 }).reason).toBe('recess-too-small');
  });

  it('resizes toward a side or about its center, keeping its offset terms', () => {
    expect(resizeRecess(R, 60, 'both', 240)).toMatchObject({ width: 60, offset: 54 });
    expect(resizeRecess(R, 60, 'left', 240)).toMatchObject({ width: 60, offset: 48 });
    expect(resizeRecess(R, 60, 'right', 240)).toMatchObject({ width: 60, offset: 60 });
    expect(resizeRecess(P, 70, 'right', 240)).toMatchObject({ width: 70, offset: 2 });
  });

  it('puts a run on its recess plane, and measures from there', () => {
    const planed = withRunPlane(wall(), base({ recessId: 'R' }));
    expect(planed._plane).toEqual({
      recessId: 'R', kind: 'recess', label: 'R1', x: 60, width: 48, bottom: 0, top: 108, depth: 24,
      offset: -24, molding: 'crown',
    });
    const plain = base();
    expect(withRunPlane(wall(), plain)).toBe(plain);
    expect(withRunPlane(wall(), { ...planed, recessId: undefined })).not.toHaveProperty('_plane');
    expect(runBackOffset({ ...planed, outset: 2 })).toBe(-22);
    expect(withRunPlane(wall(), base({ recessId: 'P' }))._plane.offset).toBe(18);
  });

  it('starts recess ends as fillers inside, end panels outside or when the box stands out', () => {
    const inside = base({ recessId: 'R', anchors: { left: at('R', 'left'), right: at('R', 'right') } });
    expect(recessCorner(wall(), inside, 'left')).toMatchObject({ type: 'inside', angle: 90 });
    expect(recessEndType(wall(), inside, 'left')).toBe('filler');
    expect(recessEndType(wall(), { ...inside, depth: 30 }, 'right')).toBe('end_panel');

    const beside = base({ x: 0, width: 60, anchors: { left: false, right: at('R', 'left') } });
    expect(recessCorner(wall(), beside, 'right')).toMatchObject({ type: 'outside', angle: 90 });
    expect(recessEndType(wall(), beside, 'right')).toBe('end_panel');

    const byProjection = upper({ x: 108, width: 60, anchors: { left: false, right: at('P', 'left') } });
    expect(recessCorner(wall(), byProjection, 'right')).toMatchObject({ type: 'inside' });
    expect(recessEndType(wall(), byProjection, 'right')).toBe('filler');
    expect(recessEndType(wall(), { ...byProjection, depth: 24 }, 'right')).toBe('end_panel');

    const missing = base({ anchors: { left: at('Q', 'left'), right: false } });
    expect(recessCorner(wall(), missing, 'left')).toBeNull();
    expect(recessEndType(wall(), missing, 'left')).toBe('end_panel');
  });

  it('resolves recess anchors, lists edges, and finds the recess around a span', () => {
    expect(recessAnchorDatum(wall(), at('R', 'left'), 'left')).toBe(60);
    expect(recessAnchorDatum(wall(), at('R', 'right', 1.5), 'right')).toBe(106.5);
    expect(recessAnchorDatum(wall(), at('R', 'left', 1.5), 'right')).toBe(58.5);
    expect(recessAnchorDatum(wall(), at('Q', 'left'), 'left')).toBeNull();
    expect(recessEdges(wall())).toEqual([
      { value: 60, recessId: 'R', edge: 'left' },
      { value: 108, recessId: 'R', edge: 'right' },
      { value: 150, recessId: 'M', edge: 'left' },
      { value: 166, recessId: 'M', edge: 'right' },
      { value: 168, recessId: 'P', edge: 'left' },
      { value: 228, recessId: 'P', edge: 'right' },
    ]);
    expect(recessForSpan(wall(), { left: 61, right: 107, bottom: 0, top: 34.5 }, 3)?.id).toBe('R');
    expect(recessForSpan(wall(), { left: 40, right: 107, bottom: 0, top: 34.5 }, 3)).toBeNull();
    expect(recessForSpan(wall(), { left: 151, right: 165, bottom: 50, top: 70 })?.id).toBe('M');
    expect(recessForSpan(wall(), { left: 151, right: 165, bottom: 50, top: 70 }, 0, ['projection'])).toBeNull();
  });

  it('warns about runs past their recess and runs into a projection', () => {
    const over = withRunPlane(wall(), base({ recessId: 'R', x: 50, width: 60 }));
    expect(recessWarnings(wall(), over)).toEqual([{ code: 'recess-overflow', recessId: 'R', label: 'R1' }]);
    expect(recessWarnings(wall(), withRunPlane(wall(), base({ recessId: 'R' })))).toEqual([]);
    expect(recessWarnings(wall(), withRunPlane(wall(), base({ recessId: 'M', x: 150, width: 16 }))))
      .toEqual([{ code: 'recess-overflow', recessId: 'M', label: 'R2' }]);
    expect(recessWarnings(wall(), upper({ x: 170, width: 30 })))
      .toEqual([{ code: 'projection-conflict', recessId: 'P', label: 'P1' }]);
    expect(recessWarnings(wall(), upper({ x: 170, width: 30, outset: 18 }))).toEqual([]);
  });

  it('draws the notch, the bump-out, the dashed raised recess and the projection in plan', () => {
    expect(recessPlanShape(R, 240, 108, 4.5)).toEqual({
      dashed: false,
      knockout: [[60, 0], [108, 0], [108, -24], [60, -24]],
      fill: [[55.5, -4.5], [112.5, -4.5], [112.5, -28.5], [55.5, -28.5]],
      lines: [
        [[60, 0], [60, -24]], [[60, -24], [108, -24]], [[108, -24], [108, 0]],
        [[55.5, -4.5], [55.5, -28.5]], [[55.5, -28.5], [112.5, -28.5]], [[112.5, -28.5], [112.5, -4.5]],
      ],
      label: [84, -12],
    });
    expect(recessPlanShape({ ...R, depth: 2 }, 240, 108, 4.5)).toEqual({
      dashed: false,
      knockout: [[60, 0], [108, 0], [108, -2], [60, -2]],
      fill: null,
      lines: [[[60, 0], [60, -2]], [[60, -2], [108, -2]], [[108, -2], [108, 0]]],
      label: [84, -1],
    });
    expect(recessPlanShape(M, 240, 108, 4.5)).toEqual({
      dashed: true,
      knockout: null,
      fill: null,
      lines: [[[150, 0], [150, -3.5]], [[150, -3.5], [166, -3.5]], [[166, -3.5], [166, 0]]],
      label: [158, -1.75],
    });
    expect(recessPlanShape(P, 240, 108, 4.5)).toEqual({
      dashed: false,
      knockout: null,
      fill: [[168, 0], [228, 0], [228, 18], [168, 18]],
      lines: [[[168, 0], [168, 18]], [[168, 18], [228, 18]], [[228, 18], [228, 0]]],
      label: [198, 9],
    });
  });

  it('cuts a door through what is left behind a recess back, and splits spans around ranges', () => {
    expect(openingPlanDepths(wall(), { recessId: 'R' })).toEqual({ face: -24, back: -28.5 });
    expect(openingPlanDepths(wall([{ ...R, depth: 2 }]), { recessId: 'R' })).toEqual({ face: -2, back: -4.5 });
    expect(openingPlanDepths(wall(), {})).toEqual({ face: 0, back: -4.5 });
    expect(openingPlanDepths(wall(), { recessId: 'P' })).toEqual({ face: 0, back: -4.5 });
    expect(uncoveredSpans(0, 100, [{ start: 50, end: 60 }, { start: 10, end: 20 }])).toEqual([
      { start: 0, end: 10 }, { start: 20, end: 50 }, { start: 60, end: 100 },
    ]);
    expect(uncoveredSpans(60, 108, [{ start: 60, end: 108 }])).toEqual([]);
  });

  it('measures front depth from the plane; a panel-only run reserves just the panel', () => {
    expect(frontDepth({ depth: 24, _plane: { offset: -24 } }, S)).toBe(0.875);
    expect(runBackOffset({})).toBe(0);
    const panels = {
      id: 'g', cols: [track('c0')], rows: [track('r0')], cells: [cell(0, { id: 'p', kind: 'panel' })],
    };
    expect(frontDepth({ depth: 0.8125, grid: panels }, S)).toBe(0.8125);
    const mixed = {
      ...panels,
      cols: [track('c0'), track('c1')],
      cells: [cell(0, { id: 'p', kind: 'panel' }), cell(1, { id: 'c', kind: 'cabinet' })],
    };
    expect(frontDepth({ depth: 0.8125, grid: mixed }, S)).toBe(1.6875);
    expect(frontDepth({ depth: 24, grid: gridFromItems('e', []) }, S)).toBe(24.875);
  });
});
```

**Count:** 802 + 11 = **813**.

---

## §3 Step 271 — Saves

**Files:** `src/elevation/store/persistence.js` (668), NEW `src/elevation/store/__tests__/recessSaves.test.js`.

### `src/elevation/store/persistence.js`

1. Import, after the `../model/soffits.js` import (18): `import { RECESS_KINDS, RECESS_MOLDINGS } from '../model/recesses.js';`
2. `isRunAnchor` (172–190): add a branch before the closing `));`:

```js
    || (anchor.to === 'recess'
      && typeof anchor.recessId === 'string'
      && (anchor.edge === 'left' || anchor.edge === 'right')
      && (anchor.offset === null || isFiniteNumber(anchor.offset)))
```

3. `isRun` (232–259): after the `run.outset` line (252), add
   `&& (run.recessId === undefined || typeof run.recessId === 'string')`.
4. `isOpening` (343–361): before the closing `;`, add
   `&& (opening.recessId === undefined || typeof opening.recessId === 'string')`.
5. New `isRecess`, right after `isSoffit` (408–416):

```js
function isRecess(recess) {
  return Boolean(recess)
    && typeof recess.id === 'string'
    && RECESS_KINDS.includes(recess.kind)
    && typeof recess.label === 'string'
    && (recess.wallSide === 'front' || recess.wallSide === 'back')
    && (recess.offsetFrom === 'left' || recess.offsetFrom === 'right')
    && (recess.offsetAnchor === 'edge' || recess.offsetAnchor === 'center')
    && ['offset', 'width', 'bottom', 'depth'].every((key) => isFiniteNumber(recess[key]))
    && recess.width > 0
    && recess.depth > 0
    && recess.bottom >= 0
    && (recess.height === null || (isFiniteNumber(recess.height) && recess.height > 0))
    && RECESS_MOLDINGS.includes(recess.molding);
}
```

6. `isWall` (418–447): after the `wall.soffits` check (436–437), add

```js
    && (wall.recesses === undefined
      || (Array.isArray(wall.recesses) && wall.recesses.every(isRecess)))
```

7. `toElevationDocument` (616–638): the run destructure also drops `_plane`:
   `const { _pinWidths, _seamGap, _frame, _plane, ...persistedRun } = run;` plus `void _plane;`.

### NEW `src/elevation/store/__tests__/recessSaves.test.js`

```js
import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../../model/constants.js';
import { gridFromItems } from '../../model/grid.js';
import { isElevationDocument, toElevationDocument } from '../persistence.js';

const R = {
  id: 'R', kind: 'recess', label: 'R1', wallSide: 'front', offsetFrom: 'left', offsetAnchor: 'edge',
  offset: 60, width: 48, bottom: 0, height: null, depth: 24, molding: 'crown',
};
const DOOR = {
  id: 'D', kind: 'door', label: 'D1', measureMode: 'jamb', width: 24, height: 80, sillZ: 0,
  offset: 72, offsetFrom: 'left', offsetAnchor: 'edge', casing: null, recessId: 'R',
};

function document(runExtra = {}, wallExtra = {}) {
  const settings = structuredClone(DEFAULT_SETTINGS);
  return {
    schemaVersion: 4,
    settings,
    rooms: [{
      id: 'room-1',
      name: 'Room 1',
      profile: { ...settings.defaultProfile },
      wallOrder: ['wall-a'],
      walls: [{
        id: 'wall-a', name: '', numberOverride: null, elevationForced: false,
        x1: 0, y1: 0, x2: 240, y2: 0, height: 108, thickness: 4.5, flipped: false,
        connections: { start: null, end: null }, profile: {},
        openings: [DOOR],
        recesses: [R],
        runs: [{
          id: 'a', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 60, width: 48, z: 4, height: 30.5, depth: 24,
          ends: { left: { type: 'filler', width: null }, right: { type: 'filler', width: null } },
          autoCount: false, maxCabinetWidth: null, heightMode: 'manual', overrides: {},
          anchors: { left: { to: 'recess', recessId: 'R', edge: 'left', offset: 0 }, right: false },
          recessId: 'R',
          grid: gridFromItems('a', [{ id: 'a-cab', kind: 'cabinet', width: null }]),
          ...runExtra,
        }],
        ...wallExtra,
      }],
    }],
    activeRoomId: 'room-1',
    activeWallId: 'wall-a',
    view: 'elevation',
  };
}

describe('SPEC-38 saves', () => {
  it('accepts recesses, runs and openings set in them, and recess anchors', () => {
    expect(isElevationDocument(document())).toBe(true);
    expect(isElevationDocument(document({}, { recesses: [{ ...R, kind: 'projection', height: 84 }] })))
      .toBe(true);
  });

  it('rejects bad recesses, plane ids and recess anchors', () => {
    for (const bad of [
      { kind: 'niche' }, { depth: 0 }, { height: 0 }, { bottom: -1 }, { molding: 'cove' },
      { offsetAnchor: 'middle' }, { wallSide: 'top' },
    ]) {
      expect(isElevationDocument(document({}, { recesses: [{ ...R, ...bad }] }))).toBe(false);
    }
    expect(isElevationDocument(document({ recessId: 5 }))).toBe(false);
    expect(isElevationDocument(document({
      anchors: { left: { to: 'recess', recessId: 'R', edge: 'top', offset: 0 }, right: false },
    }))).toBe(false);
    expect(isElevationDocument(document({}, { openings: [{ ...DOOR, recessId: 3 }] }))).toBe(false);
  });

  it("doesn't save a run's derived plane", () => {
    const saved = toElevationDocument(document({ _plane: { recessId: 'R', offset: -24 } }));
    expect(saved.rooms[0].walls[0].runs[0]).not.toHaveProperty('_plane');
    expect(saved.rooms[0].walls[0].runs[0].recessId).toBe('R');
  });
});
```

**Count:** 813 + 3 = **816**.

---

## §4 Step 272 — Model: runs on a recess

**Files:** `src/elevation/model/room.js` (1739), `src/elevation/model/soffits.js` (209), `src/elevation/model/overlap.js` (57), NEW `src/elevation/model/__tests__/recessRuns.test.js`.

### `src/elevation/model/room.js` (line numbers at `3ed8712`)

1. **Import**, after the `./openings.js` import (30):

```js
import {
  recessAnchorDatum,
  recessCorner,
  recessesOn,
  recessWarnings,
  withRunPlane,
} from './recesses.js';
```

2. **`endMinWidthsForRun` and `endCornerAnglesForRun`** (190–224): add the helper above them and route both through it. The rest of `endMinWidthsForRun` (the style, `frameReveal`, `teeCover`) is unchanged.

```js
/**
 * The corner a run side meets, and whether the side is anchored into it: a wall end, a wing wall, or the
 * side of a recess or projection (SPEC-38), which is always square.
 */
function runSideCorner(room, wall, run, side) {
  const recess = recessCorner(wall, run, side);
  if (recess) return { type: recess.type, angle: recess.angle, anchored: true };
  const anchor = run.anchors?.[side];
  return {
    ...cornerForRunSide(room, wall, run, side),
    anchored: anchor === true || anchor?.to === 'wall',
  };
}
```

   In `endMinWidthsForRun`, the final `return Object.fromEntries(...)` becomes

```js
  return Object.fromEntries(['left', 'right'].map((side) => {
    const corner = runSideCorner(room, wall, run, side);
    return [
      side,
      corner.anchored && corner.type === 'inside'
        ? Math.max(0, cornerFillerMin(settings, corner.angle) - frameReveal - teeCover(side))
        : settings.fillerMinWidth,
    ];
  }));
```

   and `endCornerAnglesForRun` becomes

```js
export function endCornerAnglesForRun(room, wall, run) {
  wall = wallViewForRun(wall, run);
  return Object.fromEntries(['left', 'right'].map((side) => {
    const corner = runSideCorner(room, wall, run, side);
    return [side, corner.anchored && corner.type === 'inside' ? corner.angle : undefined];
  }));
}
```

3. **`resolveRunAnchorDatum`** (247–295): after the soffit branch (262–267), add

```js
  if (anchor?.to === 'recess') {
    const x = recessAnchorDatum(wall, anchor, side);
    return x === null
      ? { error: { code: 'anchor-recess-missing', side } }
      : { x, type: 'recess', recessId: anchor.recessId };
  }
```

4. **`describeAnchor`** (297–363): right before `if (anchor?.to === 'wall') {` (341), add

```js
  if (anchor?.to === 'recess') {
    const recess = recessesOn(wall).find((candidate) => candidate.id === anchor.recessId);
    if (!recess) return 'Anchored recess is missing';
    const offset = anchor.offset ?? 0;
    const relation = offset > 0
      ? `${formatInches(offset)} gap`
      : offset < 0 ? `${formatInches(Math.abs(offset))} past` : 'flush';
    return `${recess.label} ${anchor.edge} side · ${relation}`;
  }
```

5. **`syncRoom`** (639): the first runs map (643–646) also derives the plane, before any vertical or horizontal pass:

```js
  nextRoom.walls = nextRoom.walls.map((wall) => ({
    ...wall,
    runs: wall.runs.map((run) => withRunPlane(
      wall,
      withFrame(nextRoom, withSeamGap(nextRoom, run, settings), settings),
    )),
  }));
```

6. **`roomDiagnostics`** (769–840): after `...soffitConflicts(wall, run),` (≈ 823) add `...recessWarnings(wall, run),`.

7. **`flipRunsForWall`** (1685–1734): `flipFollow` becomes `flipAnchor`, which also swaps a recess anchor's edge, and recesses mirror like openings:

```js
function flipAnchor(anchor) {
  if (isFollowAnchor(anchor)) return { ...anchor, side: anchor.side === 'left' ? 'right' : 'left' };
  if (anchor?.to === 'recess') return { ...anchor, edge: anchor.edge === 'left' ? 'right' : 'left' };
  return anchor;
}
```

   Its one use (1705) becomes `anchors: { left: flipAnchor(run.anchors.right), right: flipAnchor(run.anchors.left) },`, and after the `openings:` map (1729–1733) add

```js
    ...(wall.recesses
      ? {
          recesses: wall.recesses.map((recess) => ({
            ...recess,
            offsetFrom: recess.offsetFrom === 'left' ? 'right' : 'left',
          })),
        }
      : {}),
```

### `src/elevation/model/soffits.js`

`soffitOverRun` (51–61): a run on a recess that stops below the ceiling gets the recess top as a soffit.

```js
export function soffitOverRun(wall, run) {
  if (run.cabinetTypeId !== CABINET_TYPE_IDS.UPPER
    && run.cabinetTypeId !== CABINET_TYPE_IDS.TALL) return null;
  const runRight = run.x + run.width;
  // A recess top below the ceiling acts like a soffit for the runs on it (SPEC-38).
  const recessTop = run._plane && run._plane.top < wall.height - SPAN_EPSILON
    ? [{
        id: run._plane.recessId,
        x: run._plane.x,
        width: run._plane.width,
        bottom: run._plane.top,
        molding: run._plane.molding,
      }]
    : [];
  return [...soffitsOn(wall, wallSideOf(run)), ...recessTop]
    .filter((soffit) => (
      Math.min(runRight, soffit.x + soffit.width) - Math.max(run.x, soffit.x)
        > SPAN_EPSILON
    ))
    .sort((a, b) => a.bottom - b.bottom)[0] ?? null;
}
```

### `src/elevation/model/overlap.js`

Import `import { frontDepth, runBackOffset } from './corners.js';` and `runsConflict` becomes (its `settings` was unused; some callers pass none, hence the default):

```js
export function runsConflict(a, b, settings = DEFAULT_SETTINGS) {
  const horizontalOverlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const verticalOverlap = Math.min(a.z + a.height, b.z + b.height)
    - Math.max(verticalStart(a), verticalStart(b));
  if (!(horizontalOverlap > OVERLAP_EPSILON && verticalOverlap > 0)) return false;
  // Runs on different planes (SPEC-38) only conflict where their plan depths overlap.
  if ((a._plane?.recessId ?? null) === (b._plane?.recessId ?? null)) return true;
  const depthOverlap = Math.min(frontDepth(a, settings), frontDepth(b, settings))
    - Math.max(runBackOffset(a), runBackOffset(b));
  return depthOverlap > OVERLAP_EPSILON;
}
```

Keep its JSDoc, minus `void settings`.

### NEW `src/elevation/model/__tests__/recessRuns.test.js`

```js
import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { frontDepth } from '../corners.js';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
import { runFootprint } from '../footprints.js';
import { gridFromItems } from '../grid.js';
import { validateRunPlacement } from '../overlap.js';
import { planRunPieces } from '../planPieces.js';
import {
  describeAnchor,
  endCornerAnglesForRun,
  endMinWidthsForRun,
  flipRunsForWall,
  roomDiagnostics,
  syncRoom,
} from '../room.js';
import { wallSideFrame } from '../wallSides.js';

const S = DEFAULT_SETTINGS;
/** 60 to 108, 24" deep, its top at 84. */
const R = {
  id: 'R', kind: 'recess', label: 'R1', wallSide: 'front', offsetFrom: 'left', offsetAnchor: 'edge',
  offset: 60, width: 48, bottom: 0, height: 84, depth: 24, molding: 'crown',
};
const at = (recessId, edge, offset = 0) => ({ to: 'recess', recessId, edge, offset });

function makeRun(id, extra = {}) {
  return {
    id, cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 60, width: 48, z: 4, height: 30.5, depth: 24,
    ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
    autoCount: false, maxCabinetWidth: null, heightMode: 'manual', overrides: {},
    anchors: { left: false, right: false },
    grid: gridFromItems(id, [{ id: `${id}-c`, kind: 'cabinet', width: null }]),
    ...extra,
  };
}

function rawWall(runs, recesses = [R]) {
  return {
    id: 'A', name: '', numberOverride: null, elevationForced: false, x1: 0, y1: 0, x2: 240, y2: 0,
    height: 108, thickness: 4.5, flipped: false, connections: { start: null, end: null }, profile: {},
    openings: [], joints: [], runs, endPanels: { start: null, end: null },
    landings: { start: null, end: null }, soffits: [], recesses,
  };
}

const rawRoom = (runs, recesses) => ({
  id: 'room', name: 'Room', profile: { ...S.defaultProfile }, wallOrder: ['A'], walls: [rawWall(runs, recesses)],
});
const room = (runs, recesses) => syncRoom(rawRoom(runs, recesses), S);
const runOf = (synced, id) => synced.walls[0].runs.find((run) => run.id === id);

describe('SPEC-38 runs on a recess', () => {
  it('sits on the recess back in plan', () => {
    const synced = room([makeRun('B', { recessId: 'R' })]);
    const run = runOf(synced, 'B');
    expect(run._plane).toEqual({
      recessId: 'R', kind: 'recess', label: 'R1', x: 60, width: 48, bottom: 0, top: 84, depth: 24,
      offset: -24, molding: 'crown',
    });
    expect(frontDepth(run, S)).toBe(0.875);
    const wall = synced.walls[0];
    expect(runFootprint(wallSideFrame(synced, wall, 'front'), run, S)).toEqual([
      { x: 60, y: -24 }, { x: 108, y: -24 }, { x: 108, y: 0.875 }, { x: 60, y: 0.875 },
    ]);
    const layout = layoutRun(synced, wall, run, S);
    const pieces = planRunPieces(synced, wall, run, S, layout, runFaceLayouts(synced, wall, run, S, layout));
    expect(pieces.boxes).toEqual([{ key: 'B-c', start: 60, end: 108, back: -24, front: 0 }]);
    expect(runOf(room([makeRun('B')]), 'B')).not.toHaveProperty('_plane');
  });

  it('stops an auto tall under a recess top below the ceiling', () => {
    const tall = (recesses) => runOf(room([makeRun('T', {
      cabinetTypeId: CABINET_TYPE_IDS.TALL, heightMode: 'auto', height: 80, recessId: 'R',
    })], recesses), 'T');
    expect(tall()).toMatchObject({ z: 4, height: 74 });
    expect(tall([{ ...R, height: null }])).toMatchObject({ z: 4, height: 86 });
  });

  it('anchors to recess sides: square inside corners in it, outside corners beside it', () => {
    const synced = room([
      makeRun('B', { recessId: 'R', anchors: { left: at('R', 'left'), right: at('R', 'right', 1.5) } }),
      makeRun('F', { x: 0, width: 60, z: 54, cabinetTypeId: CABINET_TYPE_IDS.UPPER, anchors: { left: false, right: at('R', 'left') } }),
    ]);
    const wall = synced.walls[0];
    const inside = runOf(synced, 'B');
    expect(inside).toMatchObject({ x: 60, width: 46.5 });
    expect(endCornerAnglesForRun(synced, wall, inside)).toEqual({ left: 90, right: 90 });
    expect(endMinWidthsForRun(synced, wall, inside, S)).toEqual({ left: 1.5, right: 1.5 });
    expect(describeAnchor(synced, wall, inside, 'left', S)).toBe('R1 left side · flush');
    expect(describeAnchor(synced, wall, inside, 'right', S)).toBe('R1 right side · 1 1/2" gap');
    expect(endCornerAnglesForRun(synced, wall, runOf(synced, 'F'))).toEqual({ left: undefined, right: undefined });

    const missing = roomDiagnostics(rawRoom([makeRun('B', { anchors: { left: at('Q', 'left'), right: false } })]), S);
    expect(missing.B.errors).toContainEqual({ code: 'anchor-recess-missing', side: 'left' });
  });

  it('lets a run on the face cross a recess where their plan depths miss', () => {
    const placed = (depth) => {
      const synced = room([makeRun('F', { x: 0, width: 240 }), makeRun('B', { recessId: 'R', depth })]);
      return validateRunPlacement({ ...synced.walls[0], length: 240 }, runOf(synced, 'B'), S);
    };
    expect(placed(23)).toEqual({ ok: true, reason: null });
    expect(placed(24)).toEqual({ ok: false, reason: 'conflict' });
    const both = room([makeRun('F', { x: 0, width: 240 }), makeRun('G', { x: 10, width: 20 })]);
    expect(validateRunPlacement({ ...both.walls[0], length: 240 }, runOf(both, 'G'), S).reason).toBe('conflict');
  });

  it('warns about a run past its recess', () => {
    const diagnostics = roomDiagnostics(rawRoom([makeRun('B', { recessId: 'R', x: 50, width: 60 })]), S);
    expect(diagnostics.B.warnings).toContainEqual({ code: 'recess-overflow', recessId: 'R', label: 'R1' });
  });

  it('mirrors recesses and recess anchors when the wall flips', () => {
    const flipped = flipRunsForWall(rawWall([
      makeRun('B', { recessId: 'R', anchors: { left: false, right: at('R', 'right') } }),
    ]));
    expect(flipped.recesses[0]).toMatchObject({ offsetFrom: 'right', offset: 60 });
    expect(flipped.runs[0].anchors).toEqual({ left: at('R', 'left'), right: false });
    expect(flipped.runs[0].x).toBe(132);
  });
});
```

**Count:** 816 + 6 = **822**.

---

## §5 Step 273 — Model: drawing, stretching and moving snap to recesses

**Files:** `src/elevation/model/runDefaults.js` (≈ 180), `src/elevation/model/room.js` (≈ 1760 after 272), NEW `src/elevation/model/__tests__/recessDraw.test.js`.

### `src/elevation/model/runDefaults.js`

1. Import `import { recessEdges, recessEndType, recessForSpan } from './recesses.js';` (after the `./profile.js` import).
2. In `createRun`, right before `const anchors = …` (≈ 117), find the recess the drawn rectangle sits in:

```js
  // Drawn inside a recess (within the corner snap), the run sits on it (SPEC-38).
  const recess = wall
    ? recessForSpan(wall, {
      left: edges.left, right: edges.right, bottom: bottomZ, top: topZ,
    }, settings.cornerSnapDistance)
    : null;
```

3. In the `anchors` map, after the landing check (`if (landing) return …`), add

```js
    const recessEdge = wall && recessEdges(wall).find((edge) => (
      Math.abs(edges[side] - edge.value) <= settings.cornerSnapDistance
    ));
    if (recessEdge) {
      return [side, { to: 'recess', recessId: recessEdge.recessId, edge: recessEdge.edge, offset: 0 }];
    }
```

4. In the `ends` map, after the soffit branch's closing `}` and before `else if (anchors[side]) type = …`, add

```js
    else if (anchors[side]?.to === 'recess') {
      type = recessEndType(wall, {
        anchors,
        recessId: recess?.id,
        depth: typeDefaults.depth,
        wallSide: wall.side ?? 'front',
      }, side);
    }
```

5. The run object gets `...(recess ? { recessId: recess.id } : {}),` after `wallSide`.

### `src/elevation/model/room.js`

1. Add `recessEdges,` and `recessEndType,` to the `./recesses.js` import from step 272.
2. **`stretchRun`**: in `candidates`, after the `soffitsOn(sideWall).flatMap(…)` entry, add

```js
    ...recessEdges(sideWall).map((edge) => ({
      value: edge.value,
      anchor: { to: 'recess', recessId: edge.recessId, edge: edge.edge, offset: 0 },
    })),
```

   and in `if (anchorsAtSnap) {`, after the soffit branch, add a recess branch before the corner `else`:

```js
    if (anchorsAtSnap.to === 'soffit') {
      proposed.ends[side] = { … unchanged … };
    } else if (anchorsAtSnap.to === 'recess') {
      proposed.ends[side] = { type: recessEndType(sideWall, proposed, side), width: null };
    } else {
      … unchanged corner logic …
    }
```

3. **`moveRun`**: in the first `candidates` list (the unjoined run, ≈ 1463–1474), after the `landingsOn(…).flatMap(…)` entry, add
   `...recessEdges(wallViewForRun(sourceWall, sourceRun)).map((edge) => edge.value),`.
   The joined-run candidate list further down stays as it is.

### NEW `src/elevation/model/__tests__/recessDraw.test.js`

```js
import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { gridFromItems } from '../grid.js';
import { moveRun, resolveWall, stretchRun, syncRoom, tryPlaceRun } from '../room.js';
import { createRun } from '../runDefaults.js';

const S = DEFAULT_SETTINGS;
/** 60 to 108, 24" deep, floor to ceiling. */
const R = {
  id: 'R', kind: 'recess', label: 'R1', wallSide: 'front', offsetFrom: 'left', offsetAnchor: 'edge',
  offset: 60, width: 48, bottom: 0, height: null, depth: 24, molding: 'crown',
};
const at = (recessId, edge, offset = 0) => ({ to: 'recess', recessId, edge, offset });

function makeRun(id, extra = {}) {
  return {
    id, cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 0, width: 40, z: 4, height: 30.5, depth: 24,
    ends: { left: { type: 'filler', width: null }, right: { type: 'filler', width: null } },
    autoCount: false, maxCabinetWidth: null, heightMode: 'manual', overrides: {},
    anchors: { left: false, right: false },
    grid: gridFromItems(id, [{ id: `${id}-c`, kind: 'cabinet', width: null }]),
    ...extra,
  };
}

const room = (runs = []) => syncRoom({
  id: 'room', name: 'Room', profile: { ...S.defaultProfile }, wallOrder: ['A'],
  walls: [{
    id: 'A', name: '', numberOverride: null, elevationForced: false, x1: 0, y1: 0, x2: 240, y2: 0,
    height: 108, thickness: 4.5, flipped: false, connections: { start: null, end: null }, profile: {},
    openings: [], joints: [], runs, endPanels: { start: null, end: null },
    landings: { start: null, end: null }, soffits: [], recesses: [R],
  }],
}, S);

describe('SPEC-38 drawing at recesses', () => {
  it('puts a run drawn inside a recess on it, anchored to its sides with fillers', () => {
    const synced = room();
    const ctx = { settings: S, room: synced, wall: resolveWall(synced, synced.walls[0]) };
    const run = createRun({ x: 61, width: 46, bottomZ: 0, topZ: 34.5 }, ctx);
    expect(run).toMatchObject({
      recessId: 'R',
      anchors: { left: at('R', 'left'), right: at('R', 'right') },
      ends: { left: { type: 'filler', width: null }, right: { type: 'filler', width: null } },
    });
    const placed = tryPlaceRun(synced, 'A', run, S);
    expect(placed.ok).toBe(true);
    expect(placed.room.walls[0].runs[0]).toMatchObject({ x: 60, width: 48 });
  });

  it('ends a run drawn beside a recess at its edge with an end panel', () => {
    const synced = room();
    const ctx = { settings: S, room: synced, wall: resolveWall(synced, synced.walls[0]) };
    const run = createRun({ x: 0, width: 61, bottomZ: 0, topZ: 34.5 }, ctx);
    expect(run.recessId).toBeUndefined();
    expect(run.anchors.right).toEqual(at('R', 'left'));
    expect(run.ends.right).toEqual({ type: 'end_panel', width: null });
  });

  it('snaps stretched and moved run edges to recess edges', () => {
    const stretched = stretchRun(room([makeRun('F')]), 'A', 'F', 'right', 59, S);
    expect(stretched.ok).toBe(true);
    expect(stretched.room.walls[0].runs[0]).toMatchObject({
      x: 0, width: 60, anchors: { right: at('R', 'left') }, ends: { right: { type: 'end_panel', width: null } },
    });
    const moved = moveRun(room([makeRun('F', { width: 30 })]), 'A', 'F', 31, S);
    expect(moved).toMatchObject({ ok: true, x: 30, snap: { value: 60, edge: 'right' } });
  });
});
```

**Count:** 822 + 3 = **825**.

---

## §6 Step 274 — Model: recesses in the dimension rows

**Files:** `src/elevation/model/dimensions.js` (717), `src/elevation/model/wallFaceRow.js` (40), `src/elevation/model/__tests__/wallFaceRow.test.js` (≈ 90).

### `src/elevation/model/dimensions.js`

Import `import { recessGeometry, recessesOn, uncoveredSpans } from './recesses.js';`. `openingChain` (≈ 91–127): the openings become their own list, recesses are added split around the openings inside them, and the merge is unchanged:

```js
/**
 * The elevation's wall row (SPEC-37.4, SPEC-38): every door and window by its own reference edges (jamb or
 * casing, per its measure mode), every wing wall landing on this face at its thickness, and every recess on
 * this face at its width, split around the openings inside it, with the gaps between them and to the wall's
 * ends. Shown with or without cabinets; [] when there's nothing.
 */
export function openingChain(room, wall, settings) {
  const length = wallLength(wall);
  const openings = (wall.openings ?? []).map((opening) => {
    const geometry = openingGeometry(opening, length, settings);
    const reference = opening.measureMode === 'casing' && geometry.casing
      ? geometry.casing
      : geometry.jamb;
    const start = geometry.offsets.left[opening.measureMode].edge;
    return {
      start,
      end: start + reference.width,
      metadata: { kind: 'opening', openingId: opening.id, label: opening.label },
    };
  });
  const recesses = recessesOn(wall).flatMap((recess) => {
    const { x, width } = recessGeometry(recess, length, wall.height);
    const inside = openings.filter((range) => (
      range.start >= x - SEGMENT_EPSILON && range.end <= x + width + SEGMENT_EPSILON
    ));
    return uncoveredSpans(x, x + width, inside).map((span) => ({
      ...span,
      metadata: { kind: 'recess', recessId: recess.id, label: recess.label },
    }));
  });
  const ranges = [
    ...openings,
    ...recesses,
    ...landingsOn(room, wall).map(({ a, b, wallId }) => ({
      start: a,
      end: b,
      metadata: { kind: 'wall', wallId },
    })),
  ].sort((a, b) => a.start - b.start || a.end - b.end);
  // … the rest (from `if (ranges.length === 0) return [];`) is unchanged.
}
```

(`SEGMENT_EPSILON` is already defined in `dimensions.js`; `verticalOpeningChain` uses it.)

### `src/elevation/model/wallFaceRow.js`

Import `import { recessGeometry, recessesOn, uncoveredSpans } from './recesses.js';`. The openings are collected first, then each recess on this side is added split around them (kind `'recess'`):

```js
export function wallFaceSegments(room, wall, side, settings) {
  const view = wallSideView(wall, side);
  const { length } = wallSideFrame(room, wall, side);
  const spans = landingsOn(room, view).map(({ a, b }) => ({ a, b, kind: 'landing' }));
  const openings = [];
  if (side === 'front') {
    for (const opening of wall.openings ?? []) {
      const geometry = openingGeometry(opening, length, settings);
      const outside = geometry.casing ?? geometry.jamb;
      openings.push({ a: outside.x, b: outside.x + outside.width, kind: 'opening' });
    }
  }
  spans.push(...openings);
  // SPEC-38: each recess on this face at its width, split around the openings inside it.
  for (const recess of recessesOn(view)) {
    const { x, width } = recessGeometry(recess, length, wall.height);
    const inside = openings
      .filter((span) => span.a >= x - EPSILON && span.b <= x + width + EPSILON)
      .map((span) => ({ start: span.a, end: span.b }));
    for (const part of uncoveredSpans(x, x + width, inside)) {
      spans.push({ a: part.start, b: part.end, kind: 'recess' });
    }
  }
  // … the rest (from `if (spans.length === 0) return [];`) is unchanged.
}
```

Update its JSDoc: kinds are `'space' | 'landing' | 'opening' | 'recess'`.

### `src/elevation/model/__tests__/wallFaceRow.test.js`

No new imports (`openingChain`, `wallFaceSegments`, `makeWall`, `makeRoom`, `shown`, `host` and `S` are already there). Append:

```js
describe('SPEC-38 recesses in the wall rows', () => {
  /** 60 to 108, 24" deep, with a 24" door in its back: jamb 72 to 96, 3" casing 69 to 99. */
  const R = {
    id: 'R', kind: 'recess', label: 'R1', wallSide: 'front', offsetFrom: 'left', offsetAnchor: 'edge',
    offset: 60, width: 48, bottom: 0, height: null, depth: 24, molding: 'crown',
  };
  const DR = {
    id: 'DR', kind: 'door', label: 'D2', measureMode: 'jamb', width: 24, height: 80, sillZ: 0,
    offset: 72, offsetFrom: 'left', casing: { width: 3, thickness: 0.75 }, recessId: 'R',
  };
  const B = { ...R, id: 'B', label: 'R2', wallSide: 'back', offset: 20, width: 30, depth: 2 };

  it('splits a recess around the door in it in the elevation row', () => {
    const room = makeRoom([makeWall('H', 0, 0, 240, 0, { openings: [DR], recesses: [R] })]);
    expect(openingChain(room, host(room), S)).toEqual([
      { start: 0, end: 60, kind: 'gap' },
      { start: 60, end: 72, kind: 'recess', recessId: 'R', label: 'R1' },
      { start: 72, end: 96, kind: 'opening', openingId: 'DR', label: 'D2' },
      { start: 96, end: 108, kind: 'recess', recessId: 'R', label: 'R1' },
      { start: 108, end: 240, kind: 'gap' },
    ]);
    const bare = makeRoom([makeWall('H', 0, 0, 240, 0, { recesses: [R] })]);
    expect(openingChain(bare, host(bare), S)).toEqual([
      { start: 0, end: 60, kind: 'gap' },
      { start: 60, end: 108, kind: 'recess', recessId: 'R', label: 'R1' },
      { start: 108, end: 240, kind: 'gap' },
    ]);
  });

  it('shows recesses on each face in plan, the front one split around its door', () => {
    const room = makeRoom([makeWall('H', 0, 0, 240, 0, { openings: [DR], recesses: [R, B] })]);
    expect(shown(wallFaceSegments(room, host(room), 'front', S))).toEqual([
      ['space', 0, 60], ['recess', 60, 69], ['opening', 69, 99], ['recess', 99, 108], ['space', 108, 240],
    ]);
    expect(shown(wallFaceSegments(room, host(room), 'back', S))).toEqual([
      ['space', 0, 20], ['recess', 20, 50], ['space', 50, 240],
    ]);
  });
});
```

**Count:** 825 + 2 = **827**.

---

## §7 Step 275 — Store: `selection.recessId` (shape only)

**Files:** `src/elevation/store/elevationSlice.js` (1799), NEW `src/elevation/store/__tests__/recesses.test.js`.

Every selection object the slice builds gets `recessId`:

- `createInitialElevationState` (≈ 160–166): `recessId: null,` after `soffitId`.
- `clearTransientSelection` (≈ 288–296): `recessId: null,` after `soffitId`.
- `addSoffit` (≈ 703–709): `recessId: null,` after `soffitId`.
- `removeItem` (≈ 1352–1357) and `removeCell` (≈ 1385–1388): add `soffitId: null, recessId: null,` (removeItem has no `soffitId` today).
- `setSelection` (≈ 1635–1665): a recess is chosen after an opening and before a soffit, a run or an end panel:

```js
    setSelection(state, action) {
      const openingId = action.payload.openingId ?? null;
      const recessId = openingId ? null : action.payload.recessId ?? null;
      const soffitId = openingId || recessId ? null : action.payload.soffitId ?? null;
      const runId = openingId || recessId || soffitId ? null : action.payload.runId ?? null;
      const endPanel = openingId || recessId || soffitId || runId
        || !['start', 'end'].includes(action.payload.endPanel)
        ? null
        : action.payload.endPanel;
      state.selection = {
        runId,
        pieceId: runId ? action.payload.pieceId ?? null : null,
        openingId,
        soffitId,
        recessId,
        wallId: state.selection.wallId ?? null,
        ...(endPanel ? { endPanel } : {}),
      };
      if (runId) {
        … unchanged …
      } else if (recessId) {
        const selectedRecess = roomFor(state)?.walls
          .flatMap((wall) => wall.recesses ?? [])
          .find((recess) => recess.id === recessId);
        if (selectedRecess) state.activeWallSide = wallSideOf(selectedRecess);
      } else if (soffitId) {
        … unchanged …
      } else if (openingId) {
        … unchanged …
      }
      state.facePath = null;
    },
```

### NEW `src/elevation/store/__tests__/recesses.test.js`

This file grows in step 276; step 275 writes the state helper and the first test.

```js
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import elevationReducer, {
  clearSelection,
  createInitialElevationState,
  setSelection,
} from '../elevationSlice.js';

function stateWith(runs = [], wallExtra = {}) {
  return {
    schemaVersion: 4,
    settings: {
      ...DEFAULT_SETTINGS,
      defaultProfile: { ...DEFAULT_SETTINGS.defaultProfile },
      defaultEnds: { ...DEFAULT_SETTINGS.defaultEnds },
    },
    rooms: [{
      id: 'room-1',
      name: 'Room 1',
      profile: { ...DEFAULT_SETTINGS.defaultProfile },
      walls: [{
        id: 'wall-1', name: 'Wall 1', x1: 0, y1: 0, x2: 240, y2: 0, height: 108, thickness: 4.5,
        flipped: false, connections: { start: null, end: null }, profile: {}, runs, openings: [],
        ...wallExtra,
      }],
    }],
    activeRoomId: 'room-1',
    activeWallId: 'wall-1',
    activeWallSide: 'front',
    view: 'elevation',
    selection: {
      runId: null, pieceId: null, openingId: null, soffitId: null, recessId: null, wallId: 'wall-1',
    },
    tool: 'select',
    message: null,
  };
}

describe('SPEC-38 recesses in the store', () => {
  it('selects a recess and nothing else', () => {
    expect(createInitialElevationState(null).selection.recessId).toBeNull();
    let state = elevationReducer(stateWith(), setSelection({ runId: 'run-1', recessId: 'R' }));
    expect(state.selection).toMatchObject({ recessId: 'R', runId: null, openingId: null, soffitId: null });
    state = elevationReducer(state, setSelection({ openingId: 'D', recessId: 'R' }));
    expect(state.selection).toMatchObject({ openingId: 'D', recessId: null });
    state = elevationReducer(state, setSelection({ recessId: 'R' }));
    state = elevationReducer(state, clearSelection());
    expect(state.selection.recessId).toBeNull();
  });
});
```

**Count:** 827 + 1 = **828**.

---

## §8 Step 276 — Store: recess reducers

**Files:** `src/elevation/store/elevationSlice.js` (≈ 1810 after 275), `src/elevation/store/__tests__/recesses.test.js`.

### `src/elevation/store/elevationSlice.js`

1. **Import** after the `../model/openings.js` import:

```js
import {
  recessEndType,
  recessesOn,
  resizeRecess as resizeRecessPure,
  validateRecessPlacement,
} from '../model/recesses.js';
```

2. **Helpers**, after `soffitLocation` (≈ 214–225):

```js
const RECESS_KEYS = [
  'label', 'kind', 'width', 'bottom', 'height', 'depth', 'offset', 'offsetFrom', 'offsetAnchor', 'molding',
];

function recessLocation(state, payload) {
  const location = wallLocation(state, payload);
  if (!location) return null;
  const recessIndex = (location.wall.recesses ?? [])
    .findIndex((recess) => recess.id === payload.recessId);
  return recessIndex === -1
    ? null
    : { ...location, recessIndex, recess: location.wall.recesses[recessIndex] };
}

/** The side view a recess is validated in (SPEC-38). */
function recessView(room, wall, recess) {
  return wallSideView(resolveWall(room, wall), wallSideOf(recess));
}

/** Re-pick the ends a run has anchored to recesses (all, or one recess's) after where it sits changes. */
function refreshRecessEnds(wall, run, recessId = null) {
  for (const side of ['left', 'right']) {
    const anchor = run.anchors?.[side];
    if (anchor?.to !== 'recess' || (recessId && anchor.recessId !== recessId)) continue;
    run.ends[side] = { type: recessEndType(wallViewForRun(wall, run), run, side), width: null };
  }
}
```

3. **Reducers**, after `deleteSoffit` (≈ 750–765):

```js
    addRecess(state, action) {
      const location = wallLocation(state, action.payload);
      const { recess } = action.payload;
      if (!location || !recess?.id) return;
      const validation = validateRecessPlacement(recessView(location.room, location.wall, recess), recess);
      if (!validation.ok) {
        state.message = validation.reason;
        return;
      }
      location.wall.recesses ??= [];
      location.wall.recesses.push({ ...recess });
      state.selection = {
        runId: null,
        pieceId: null,
        openingId: null,
        soffitId: null,
        recessId: recess.id,
        wallId: state.selection.wallId ?? null,
      };
      state.activeWallSide = wallSideOf(recess);
      state.facePath = null;
      state.message = null;
      syncRoomAt(state, location.roomIndex);
    },
    updateRecess(state, action) {
      const location = recessLocation(state, action.payload);
      if (!location) return;
      const candidate = { ...location.recess };
      const changes = action.payload.changes ?? {};
      for (const key of RECESS_KEYS) {
        if (Object.prototype.hasOwnProperty.call(changes, key)) candidate[key] = changes[key];
      }
      // A kind change swaps an automatic label's letter and keeps its number: R2 ↔ P2.
      if (candidate.kind !== location.recess.kind
        && !Object.prototype.hasOwnProperty.call(changes, 'label')
        && /^[RP]\d+$/.test(candidate.label)) {
        candidate.label = `${candidate.kind === 'projection' ? 'P' : 'R'}${candidate.label.slice(1)}`;
      }
      const validation = validateRecessPlacement(
        recessView(location.room, location.wall, candidate),
        candidate,
      );
      if (!validation.ok) {
        state.message = validation.reason;
        return;
      }
      location.wall.recesses[location.recessIndex] = candidate;
      state.message = null;
      for (const run of location.wall.runs) refreshRecessEnds(location.wall, run, candidate.id);
      syncRoomAt(state, location.roomIndex);
    },
    resizeRecess(state, action) {
      const location = recessLocation(state, action.payload);
      const { width, grow = 'right' } = action.payload;
      if (!location || !Number.isFinite(width) || width <= 0) return;
      const length = wallFrame(location.room, location.wall).length;
      const candidate = resizeRecessPure(location.recess, width, grow, length);
      const validation = validateRecessPlacement(
        recessView(location.room, location.wall, candidate),
        candidate,
      );
      if (!validation.ok) {
        state.message = validation.reason;
        return;
      }
      location.wall.recesses[location.recessIndex] = candidate;
      state.message = null;
      syncRoomAt(state, location.roomIndex);
    },
    deleteRecess(state, action) {
      const location = recessLocation(state, action.payload);
      if (!location) return;
      const { id } = location.recess;
      location.wall.recesses.splice(location.recessIndex, 1);
      for (const run of location.wall.runs) {
        if (run.recessId === id) delete run.recessId;
        for (const side of ['left', 'right']) {
          if (run.anchors?.[side]?.to === 'recess' && run.anchors[side].recessId === id) {
            run.anchors[side] = false;
          }
        }
      }
      for (const opening of location.wall.openings ?? []) {
        if (opening.recessId === id) delete opening.recessId;
      }
      if (state.selection.recessId === id) clearTransientSelection(state);
      syncRoomAt(state, location.roomIndex);
    },
    setRunRecess(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const { recessId } = action.payload;
      if (recessId) {
        const exists = recessesOn(location.wall, wallSideOf(location.run))
          .some((recess) => recess.id === recessId);
        if (!exists) return;
        location.run.recessId = recessId;
      } else {
        delete location.run.recessId;
      }
      refreshRecessEnds(location.wall, location.run);
      syncRoomAt(state, location.roomIndex);
    },
```

4. **`setRunAnchor`** (≈ 985–1035): accept recess anchors.

```js
      const validRecessAnchor = Boolean(value)
        && typeof value === 'object'
        && value.to === 'recess'
        && typeof value.recessId === 'string'
        && (value.edge === 'left' || value.edge === 'right')
        && (value.offset === null || value.offset === undefined || Number.isFinite(value.offset));
```

   Add `&& !validRecessAnchor` to the `return` gate; `const anchor = validSoffitAnchor || validRecessAnchor ? { ...value, offset: value.offset ?? 0 } : value;`; add `|| validRecessAnchor` to the `{ ...anchor }` condition; and after the `if (validSoffitAnchor) { … }` block add

```js
      } else if (validRecessAnchor) {
        location.run.ends[side] = {
          type: recessEndType(wallViewForRun(location.wall, location.run), location.run, side),
          width: null,
        };
```

   (before `} else if (validWallAnchor) {`).

5. **`updateOpening`** (≈ 784–818): add `'recessId'` to the key list, and inside the loop, before the assignment:

```js
        if (key === 'recessId' && !changes[key]) {
          delete candidate.recessId;
          continue;
        }
```

6. **`setTool`**: add `'recess'` to the allowed list.
7. **Exports**: add `addRecess`, `updateRecess`, `resizeRecess`, `deleteRecess`, `setRunRecess` to the `export const { … } = elevationSlice.actions` list (beside `addSoffit` … `deleteSoffit`).

### `src/elevation/store/__tests__/recesses.test.js`

Change the constants import to `import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../../model/constants.js';`, add `import { gridFromItems } from '../../model/grid.js';`, extend the import from `../elevationSlice.js` with `addOpening, addRecess, deleteRecess, resizeRecess, setRunAnchor, setRunRecess, setTool, updateOpening, updateRecess`, and add these helpers right after the imports:

```js
const R = {
  id: 'R', kind: 'recess', label: 'R1', wallSide: 'front', offsetFrom: 'left', offsetAnchor: 'edge',
  offset: 60, width: 48, bottom: 0, height: null, depth: 24, molding: 'crown',
};

function makeRun(overrides = {}) {
  return {
    id: 'run-1', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 60, width: 48, z: 4, height: 30.5, depth: 24,
    ends: { left: { type: 'filler', width: null }, right: { type: 'filler', width: null } },
    autoCount: false, maxCabinetWidth: null, heightMode: 'manual', overrides: {},
    anchors: { left: false, right: false },
    grid: gridFromItems('run-1', [{ id: 'run-1-c', kind: 'cabinet', width: null }]),
    ...overrides,
  };
}
```

and `const wallOf = (state) => state.rooms[0].walls[0];` after `stateWith`. Then append inside the `describe`:

```js
  const DOOR = {
    id: 'door-1', kind: 'door', label: 'D1', measureMode: 'jamb', width: 24, height: 80, sillZ: 0,
    offset: 72, offsetFrom: 'left', offsetAnchor: 'edge', casing: { width: 3, thickness: 0.75 },
  };
  const base = { wallId: 'wall-1' };

  /** A base on R, its left end anchored to R's side, and a door set in R. */
  function furnished() {
    let state = elevationReducer(stateWith([makeRun()]), addRecess({ ...base, recess: R }));
    state = elevationReducer(state, setRunRecess({ ...base, runId: 'run-1', recessId: 'R' }));
    state = elevationReducer(state, setRunAnchor({
      ...base, runId: 'run-1', side: 'left', anchor: { to: 'recess', recessId: 'R', edge: 'left', offset: null },
    }));
    state = elevationReducer(state, addOpening({ ...base, opening: DOOR }));
    return elevationReducer(state, updateOpening({ ...base, openingId: 'door-1', changes: { recessId: 'R' } }));
  }

  it('adds a recess and selects it; rejects an overlapping one', () => {
    let state = elevationReducer(stateWith(), addRecess({ ...base, recess: R }));
    expect(wallOf(state).recesses).toEqual([R]);
    expect(state.selection.recessId).toBe('R');
    expect(state.activeWallSide).toBe('front');
    state = elevationReducer(state, addRecess({ ...base, recess: { ...R, id: 'X', offset: 80, width: 20 } }));
    expect(wallOf(state).recesses).toHaveLength(1);
    expect(state.message).toBe('recess-overlap');
    state = elevationReducer(state, addRecess({ ...base, recess: { ...R, id: 'B', wallSide: 'back', offset: 0, width: 20 } }));
    expect(wallOf(state).recesses).toHaveLength(2);
    expect(state.activeWallSide).toBe('back');
  });

  it('updates, relabels on a kind change, rejects bad sizes, and resizes', () => {
    let state = elevationReducer(stateWith(), addRecess({ ...base, recess: R }));
    state = elevationReducer(state, updateRecess({ ...base, recessId: 'R', changes: { depth: 12, height: 84 } }));
    expect(wallOf(state).recesses[0]).toMatchObject({ depth: 12, height: 84 });
    state = elevationReducer(state, updateRecess({ ...base, recessId: 'R', changes: { width: 300 } }));
    expect(wallOf(state).recesses[0].width).toBe(48);
    expect(state.message).toBe('recess-out-of-bounds');
    state = elevationReducer(state, updateRecess({ ...base, recessId: 'R', changes: { kind: 'projection' } }));
    expect(wallOf(state).recesses[0]).toMatchObject({ kind: 'projection', label: 'P1' });
    state = elevationReducer(state, resizeRecess({ ...base, recessId: 'R', width: 60, grow: 'both' }));
    expect(wallOf(state).recesses[0]).toMatchObject({ width: 60, offset: 54 });
  });

  it('sets a run on a recess, anchors it to a side, and sets a door in it', () => {
    let state = furnished();
    expect(wallOf(state).runs[0].recessId).toBe('R');
    expect(wallOf(state).runs[0].anchors.left).toEqual({ to: 'recess', recessId: 'R', edge: 'left', offset: 0 });
    expect(wallOf(state).runs[0].ends.left).toEqual({ type: 'filler', width: null });
    expect(wallOf(state).openings[0].recessId).toBe('R');

    state = elevationReducer(state, setRunRecess({ ...base, runId: 'run-1', recessId: null }));
    expect(wallOf(state).runs[0].recessId).toBeUndefined();
    expect(wallOf(state).runs[0].ends.left).toEqual({ type: 'end_panel', width: null });
    state = elevationReducer(state, setRunRecess({ ...base, runId: 'run-1', recessId: 'nope' }));
    expect(wallOf(state).runs[0].recessId).toBeUndefined();

    state = elevationReducer(state, updateOpening({ ...base, openingId: 'door-1', changes: { recessId: null } }));
    expect(wallOf(state).openings[0].recessId).toBeUndefined();
    expect(elevationReducer(state, setTool('recess')).tool).toBe('recess');
  });

  it('deletes a recess and lets go of everything that used it', () => {
    let state = elevationReducer(furnished(), setSelection({ recessId: 'R' }));
    state = elevationReducer(state, deleteRecess({ ...base, recessId: 'R' }));
    expect(wallOf(state).recesses).toEqual([]);
    expect(wallOf(state).runs[0].recessId).toBeUndefined();
    expect(wallOf(state).runs[0].anchors.left).toBe(false);
    expect(wallOf(state).openings[0].recessId).toBeUndefined();
    expect(state.selection.recessId).toBeNull();
  });
```

**Count:** 828 + 4 = **832**.

---

## §9 Step 277 — Elevation: draw, place, select, delete

**Files:** NEW `src/elevation/components/RecessShapes.jsx`, `src/elevation/components/ElevationCanvas.jsx` (1872), `src/elevation/components/ElevationToolbar.jsx` (222), `src/elevation/components/DimensionRow.jsx` (352).

### NEW `src/elevation/components/RecessShapes.jsx`

```jsx
import { Group, Rect, Text } from 'react-konva';
import { wallRectToScreen } from '../canvas/transform.js';
import { recessGeometry, recessesOn } from '../model/recesses.js';
import { formatInches } from '../model/units.js';

/**
 * Recesses and projections on the elevation (SPEC-38): a recess is a dashed outline over a darker fill (it's
 * behind the face), a projection a solid outline over a lighter one, each labeled with its depth.
 */
export default function RecessShapes({ wall, transform, selectedRecessId, onSelect }) {
  return recessesOn(wall).map((recess) => {
    const geometry = recessGeometry(recess, wall.length, wall.height);
    const rect = wallRectToScreen({
      x: geometry.x,
      z: geometry.bottom,
      width: geometry.width,
      height: geometry.top - geometry.bottom,
    }, transform);
    const selected = selectedRecessId === recess.id;
    const projection = recess.kind === 'projection';
    return (
      <Group
        key={recess.id}
        listening={Boolean(onSelect)}
        onClick={(event) => {
          event.cancelBubble = true;
          onSelect?.(recess.id);
        }}
      >
        <Rect
          {...rect}
          fill={projection ? 'rgba(148,163,184,0.16)' : 'rgba(2,6,23,0.55)'}
          stroke={selected ? '#60a5fa' : '#94a3b8'}
          strokeWidth={selected ? 2 : 1.25}
          dash={projection ? undefined : [6, 4]}
        />
        <Text
          x={rect.x + 4}
          y={rect.y + 4}
          width={Math.max(0, rect.width - 8)}
          text={`${recess.label} · ${formatInches(recess.depth)} ${projection ? 'out' : 'deep'}`}
          fontSize={10}
          fill="#cbd5e1"
          listening={false}
        />
      </Group>
    );
  });
}
```

### `src/elevation/components/ElevationCanvas.jsx` (line numbers at `3ed8712`)

1. **Imports:** after the `../model/openings.js` import (55–59):

```js
import {
  RECESS_PLACEMENT_MESSAGES,
  createRecess,
  recessForSpan,
  validateRecessPlacement,
} from '../model/recesses.js';
```

   add `addRecess,` and `deleteRecess,` to the `../store/elevationSlice.js` import (86–100), and `import RecessShapes from './RecessShapes.jsx';` beside the `SoffitShapes` import (118).

2. **Delete key** (the keydown handler, ≈ 586–612): before `if (currentSelection.soffitId) {`, add

```js
      if (currentSelection.recessId) {
        event.preventDefault();
        dispatch(deleteRecess({ wallId: currentWall.id, recessId: currentSelection.recessId }));
        return;
      }
```

3. **Select:** after `selectSoffit` (≈ 970–973):

```js
  const selectRecess = useCallback((recessId) => {
    if (tool !== 'select' || suppressClickRef.current) return;
    dispatch(setSelection({ recessId }));
  }, [dispatch, tool]);
```

4. **The Recess tool** (`handleStageClick`, ≈ 1032): after the `if (tool === 'select') { … }` block and before `if ((tool !== 'door' && tool !== 'window') …`, add

```js
    if (tool === 'recess') {
      if (!room || !wall || !transform) return;
      const pointer = stageRef.current?.getPointerPosition();
      if (!pointer) return;
      const rawPoint = screenToWall(pointer, transform);
      if (rawPoint.x < 0 || rawPoint.x > wall.length
        || rawPoint.z < 0 || rawPoint.z > wall.height) return;
      const recess = createRecess({ kind: 'recess', x: rawPoint.x }, { room, wall });
      const validation = validateRecessPlacement(wall, recess);
      if (!validation.ok) {
        showMessage(RECESS_PLACEMENT_MESSAGES[validation.reason] ?? validation.reason);
        return;
      }
      dispatch(addRecess({ wallId: wall.id, recess }));
      return;
    }
```

5. **Doors and windows placed inside a recess sit in it** (same function, ≈ 1060–1072): after `const opening = createOpening(…)`:

```js
    const jamb = openingGeometry(opening, wall.length, settings).jamb;
    const host = recessForSpan(wall, {
      left: jamb.x, right: jamb.x + jamb.width, bottom: jamb.z, top: jamb.z + jamb.height,
    }, 0, ['recess']);
    const placed = host ? { ...opening, recessId: host.id } : opening;
```

   and use `placed` instead of `opening` in `validateOpeningPlacement(…)`, `addOpening(…)` and `setSelection({ openingId: placed.id })`.

6. **Draw** (≈ 1550): first thing in the second `<Layer>`, before the openings map:

```jsx
            <RecessShapes
              wall={wall}
              transform={transform}
              selectedRecessId={selection.recessId}
              onSelect={tool === 'select' ? selectRecess : undefined}
            />
```

### `src/elevation/components/ElevationToolbar.jsx`

`toolNames` (39–41): the elevation list becomes `['select', 'draw', 'soffit', 'recess', 'door', 'window']`. The button already capitalizes the name ("Recess").

### `src/elevation/components/DimensionRow.jsx`

`KIND_COLORS` (≈ 20–30): add `recess: '#a5b4fc',`.

**Count:** unchanged, **832** (no component tests; `npm run build` is the check).

---

## §10 Step 278 — Properties

**Files:** NEW `src/elevation/components/properties/RecessProperties.jsx`, `src/elevation/components/PropertiesPanel.jsx` (180), `src/elevation/components/properties/RunGeometrySection.jsx` (≈ 150), `src/elevation/components/properties/RunEndsSection.jsx` (362), `src/elevation/components/properties/OpeningProperties.jsx` (288), `src/elevation/components/properties/WarningsList.jsx` (54).

### NEW `src/elevation/components/properties/RecessProperties.jsx`

```jsx
import { Fragment, useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import {
  RECESS_PLACEMENT_MESSAGES,
  recessGeometry,
  validateRecessPlacement,
} from '../../model/index.js';
import { deleteRecess, resizeRecess, updateRecess } from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import Field from './Field.jsx';
import StretchInput from './StretchInput.jsx';

const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const HEADING_CLASS = 'mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400';

/** A recess or projection (SPEC-38): kind, size, how high, how deep, and where, measured like a window. */
export default function RecessProperties({ wall, recess, placementMessage }) {
  const dispatch = useDispatch();
  const actionBase = { wallId: wall.id, recessId: recess.id };
  const geometry = recessGeometry(recess, wall.length, wall.height);
  const projection = recess.kind === 'projection';
  const toCeiling = recess.height === null;
  const update = (changes) => dispatch(updateRecess({ ...actionBase, changes }));
  // Grow away from the wall end the offset is measured from, so the typed offset holds.
  const preferredGrow = recess.offsetFrom === 'right' ? 'left' : 'right';
  const [grow, setGrow] = useState(preferredGrow);
  useEffect(() => {
    setGrow(preferredGrow);
  }, [preferredGrow, recess.id]);
  const validation = validateRecessPlacement(wall, recess);
  const reason = !validation.ok
    ? validation.reason
    : RECESS_PLACEMENT_MESSAGES[placementMessage] ? placementMessage : null;

  return (
    <div className="space-y-5">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            {projection ? 'Projection' : 'Recess'}
          </h3>
          <button
            type="button"
            onClick={() => dispatch(deleteRecess(actionBase))}
            className="rounded bg-red-900/70 px-2.5 py-1.5 text-xs text-red-100 hover:bg-red-800"
          >
            Delete
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Label">
            <input
              type="text"
              value={recess.label}
              onChange={(event) => update({ label: event.target.value })}
              aria-label="Recess label"
              className={SELECT_CLASS}
            />
          </Field>
          <Field label="Kind">
            <select
              value={recess.kind}
              onChange={(event) => update({ kind: event.target.value })}
              aria-label="Recess kind"
              className={SELECT_CLASS}
            >
              <option value="recess">Recess</option>
              <option value="projection">Projection</option>
            </select>
          </Field>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-gray-500">
          {projection
            ? 'Built out from the wall. Cabinets drawn on it sit on its face; beside it, its sides stop them.'
            : 'Cut back into the wall. Cabinets drawn inside it sit on its back and stop at its sides.'}
        </p>
      </section>

      <section>
        <h3 className={HEADING_CLASS}>Size</h3>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="col-span-2">
            <StretchInput
              label="Width"
              value={recess.width}
              grow={grow}
              onGrowChange={setGrow}
              onCommit={(width) => {
                dispatch(resizeRecess({ ...actionBase, width, grow }));
                setGrow(preferredGrow);
                return true;
              }}
              ariaLabel="Recess width"
            />
          </div>
          <Field label={projection ? 'Sticks out' : 'Depth'}>
            <InchInput
              value={recess.depth}
              onCommit={(depth) => depth > 0 && update({ depth })}
              aria-label="Recess depth"
            />
          </Field>
          <Field label="Bottom (0 = floor)">
            <InchInput
              value={recess.bottom}
              onCommit={(bottom) => bottom !== null && bottom >= 0 && update({ bottom })}
              aria-label="Recess bottom"
            />
          </Field>
          <label className="col-span-2 flex items-center justify-between rounded border border-gray-700 bg-gray-900/45 px-3 py-2 text-sm text-gray-300">
            Up to the ceiling
            <input
              type="checkbox"
              checked={toCeiling}
              onChange={(event) => update({
                height: event.target.checked ? null : Math.max(1, geometry.top - recess.bottom),
              })}
              className="rounded border-gray-600 bg-gray-900 text-blue-600 focus:ring-blue-500"
            />
          </label>
          {!toCeiling && (
            <>
              <Field label="Height">
                <InchInput
                  value={recess.height}
                  onCommit={(height) => height > 0 && update({ height })}
                  aria-label="Recess height"
                />
              </Field>
              <Field label="Under its top">
                <select
                  value={recess.molding}
                  onChange={(event) => update({ molding: event.target.value })}
                  aria-label="Recess top molding"
                  className={SELECT_CLASS}
                >
                  <option value="crown">Crown</option>
                  <option value="topMold">Top mold</option>
                  <option value="none">None</option>
                </select>
              </Field>
            </>
          )}
        </div>
      </section>

      <section>
        <h3 className={HEADING_CLASS}>Position</h3>
        <div className="grid grid-cols-[auto_1fr_1fr] items-end gap-2">
          <span />
          <span className="text-center text-xs text-gray-500">Edge</span>
          <span className="text-center text-xs text-gray-500">Center</span>
          {['left', 'right'].map((side) => (
            <Fragment key={side}>
              <span className="text-xs capitalize text-gray-400">{side} end</span>
              {['edge', 'center'].map((anchor) => {
                const active = recess.offsetFrom === side && (recess.offsetAnchor ?? 'edge') === anchor;
                return (
                  <div key={anchor} className={active ? 'rounded ring-1 ring-cyan-400' : ''}>
                    <InchInput
                      value={geometry.offsets[side][anchor]}
                      onCommit={(offset) => offset !== null && update({
                        offset,
                        offsetFrom: side,
                        offsetAnchor: anchor,
                      })}
                      aria-label={`Recess ${side} ${anchor} position`}
                    />
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </section>

      {reason && (
        <section>
          <p className="rounded border border-red-900/80 bg-red-950/45 px-2.5 py-2 text-xs text-red-300">
            {RECESS_PLACEMENT_MESSAGES[reason] ?? reason}
          </p>
        </section>
      )}
    </div>
  );
}
```

### `src/elevation/components/PropertiesPanel.jsx`

- Add `recessesOn,` to the `../model/index.js` import (8–15) and `import RecessProperties from './properties/RecessProperties.jsx';` beside `OpeningProperties`.
- After `soffit` (58–60):

```js
  const recess = wall
    ? recessesOn(wall).find((candidate) => candidate.id === selection.recessId) ?? null
    : null;
```

- After the opening effect (119–121):

```js
  useEffect(() => {
    if (selection.recessId && !recess) dispatch(clearSelection());
  }, [dispatch, recess, selection.recessId]);
```

- In the JSX, right after the `opening ? (…)` branch: `) : recess ? ( <RecessProperties wall={wall} recess={recess} placementMessage={message} />`.

### `src/elevation/components/properties/RunGeometrySection.jsx`

Import `recessesOn` from `../../model/index.js` and `setRunRecess` from the slice. After the Outset `Field` (≈ 86–96), still inside the 2-column grid:

```jsx
          {(recessesOn(wall).length > 0 || run.recessId) && (
            <div className="col-span-2">
              <Field label="Sits on">
                <select
                  value={run.recessId ?? ''}
                  onChange={(event) => dispatch(setRunRecess({
                    ...actionBase,
                    recessId: event.target.value || null,
                  }))}
                  aria-label="Run plane"
                  className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Wall face</option>
                  {recessesOn(wall).map((recess) => (
                    <option key={recess.id} value={recess.id}>
                      {`${recess.label} ${recess.kind === 'projection' ? 'face' : 'back'}`}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
```

The Outset field's note stays: outset is measured from the plane the run sits on.

### `src/elevation/components/properties/RunEndsSection.jsx`

1. Add `recessesOn,` to the model import (3–16).
2. After `const soffitAnchor = …` (69): `const recessAnchor = anchor?.to === 'recess' ? anchor : null;`
3. `anchorValue` (86–96): after the soffit case add
   `: recessAnchor ? \`recess:${recessAnchor.recessId}:${recessAnchor.edge}\``.
4. `onChange` (114–161): before the `soffit:` branch add

```js
                      if (value.startsWith('recess:')) {
                        const [, recessId, edge] = value.split(':');
                        dispatch(setRunAnchor({
                          ...actionBase,
                          side,
                          anchor: { to: 'recess', recessId, edge, offset: 0 },
                        }));
                        return;
                      }
```

5. Options: after the "Soffit sides" optgroup (188–194):

```jsx
                    <optgroup label="Recess sides">
                      {recessesOn(wall).flatMap((recess) => ['left', 'right'].map((edge) => (
                        <option key={`${recess.id}:${edge}`} value={`recess:${recess.id}:${edge}`}>
                          {`${recess.label} ${edge} side`}
                        </option>
                      )))}
                    </optgroup>
```

6. The offset block (279–300): its condition becomes `) : (soffitAnchor || recessAnchor) ? (`, and inside it use `const offsetAnchor = soffitAnchor ?? recessAnchor;` (inline: `(soffitAnchor ?? recessAnchor).offset` for the value, `anchor: { ...(soffitAnchor ?? recessAnchor), offset: value ?? 0 }` on commit), with aria-label `` `${side} ${recessAnchor ? 'recess' : 'soffit'} anchor offset` ``.

### `src/elevation/components/properties/OpeningProperties.jsx`

Import `recessesOn` from `../../model/index.js`. After `const update = …` (39):
`const recesses = recessesOn(wall, 'front').filter((recess) => recess.kind === 'recess');`
In the first section's grid, after the Kind field:

```jsx
          {(recesses.length > 0 || opening.recessId) && (
            <div className="col-span-2">
              <Field label="Set in">
                <select
                  value={opening.recessId ?? ''}
                  onChange={(event) => update({ recessId: event.target.value || null })}
                  aria-label="Opening recess"
                  className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Wall face</option>
                  {recesses.map((recess) => (
                    <option key={recess.id} value={recess.id}>{`${recess.label} back`}</option>
                  ))}
                </select>
              </Field>
            </div>
          )}
```

### `src/elevation/components/properties/WarningsList.jsx`

`ERROR_MESSAGES` gets `'anchor-recess-missing': 'The anchored recess no longer exists.',`; `WARNING_MESSAGES` gets

```js
  'recess-overflow': 'Runs past its recess. Keep it inside, or set it on the wall face.',
  'projection-conflict': 'Runs into a projection. Set it on the projection, or out past its face.',
```

**Count:** unchanged, **832**.

---

## §11 Step 279 — Plan

**Files:** NEW `src/elevation/plan/PlanRecess.jsx`, `src/elevation/plan/PlanCanvas.jsx` (1268), `src/elevation/plan/PlanOpening.jsx` (163), `src/elevation/plan/PlanRunFootprint.jsx` (279), `src/elevation/model/openings.js` (314), `src/elevation/model/__tests__/recesses.test.js`.

### NEW `src/elevation/plan/PlanRecess.jsx`

```jsx
import { Group, Line, Text } from 'react-konva';
import { elevationToPlan } from '../model/geometry.js';
import { recessGeometry, recessPlanShape } from '../model/recesses.js';
import { formatInches } from '../model/units.js';
import { PLAN_BACKGROUND_COLOR, PLAN_DIM_FONT_SIZE } from './constants.js';
import { readableRotation } from './textRotation.js';

function toPoints(frame, points) {
  return points.flatMap(([u, v]) => {
    const point = elevationToPlan(frame, u, v);
    return [point.x, point.y];
  });
}

/**
 * A recess or projection in plan (SPEC-38): wall added (a deep recess's bump-out, a projection), the notch
 * knocked out of the wall, and its outline, dashed when it's raised off the floor. Not clickable.
 */
export default function PlanRecess({ wall, frame, recess, scale, selected }) {
  const shape = recessPlanShape(recess, frame.length, wall.height, wall.thickness);
  const geometry = recessGeometry(recess, frame.length, wall.height);
  // The knockout's face edge sits a pixel into the room so it also hides the wall's face line.
  const knockout = shape.knockout?.map(([u, v]) => [u, v === 0 ? 1 / scale : v]) ?? null;
  const stroke = selected ? '#60a5fa' : '#d1d5db';
  const strokeWidth = (selected ? 2 : 1) / scale;
  const dash = shape.dashed ? [5 / scale, 3 / scale] : undefined;
  const label = elevationToPlan(frame, shape.label[0], shape.label[1]);
  return (
    <Group listening={false}>
      {shape.fill && (
        <Line points={toPoints(frame, shape.fill)} closed fill="#6b7280" opacity={0.85} />
      )}
      {knockout && (
        <Line points={toPoints(frame, knockout)} closed fill={PLAN_BACKGROUND_COLOR} />
      )}
      {shape.lines.map((line, index) => (
        <Line
          key={index}
          points={toPoints(frame, line)}
          stroke={stroke}
          strokeWidth={strokeWidth}
          dash={dash}
        />
      ))}
      <Text
        x={label.x}
        y={label.y}
        width={120 / scale}
        offsetX={60 / scale}
        offsetY={PLAN_DIM_FONT_SIZE / 2 / scale}
        align="center"
        rotation={readableRotation(Math.atan2(frame.r.y, frame.r.x) * 180 / Math.PI)}
        text={`${recess.label} · ${formatInches(geometry.width)} × ${formatInches(geometry.depth)}`}
        fontSize={PLAN_DIM_FONT_SIZE / scale}
        fill="#e2e8f0"
      />
    </Group>
  );
}
```

### `src/elevation/plan/PlanCanvas.jsx`

1. `import PlanRecess from './PlanRecess.jsx';` beside `PlanOpening` (83).
2. Line 119: `wallItselfSelected` also requires `&& !selection.recessId`.
3. Right after the `walls.map(… <PlanWallShape …/>)` block (1029–1041), before the openings:

```jsx
            {walls.flatMap((wall) => (wall.recesses ?? []).map((recess) => (
              <PlanRecess
                key={`${wall.id}:${recess.id}`}
                wall={wall}
                frame={wallSideFrame(room, wall, recess.wallSide)}
                recess={recess}
                scale={scale}
                selected={selection.recessId === recess.id}
              />
            )))}
```

### `src/elevation/plan/PlanOpening.jsx`

Import `openingPlanDepths` from `../model/recesses.js`. After `const { jamb, casing } = geometry;` add `const depths = openingPlanDepths(wall, opening);` and use it for every depth (the wall's face was `0`, its back `-wall.thickness`):

```js
  const voidPolygon = [
    elevationToPlan(frame, jamb.x, depths.face),
    elevationToPlan(frame, jamb.x + jamb.width, depths.face),
    elevationToPlan(frame, jamb.x + jamb.width, depths.back),
    elevationToPlan(frame, jamb.x, depths.back),
  ];
  const jambLines = [jamb.x, jamb.x + jamb.width].map((x) => [
    elevationToPlan(frame, x, depths.face),
    elevationToPlan(frame, x, depths.back),
  ]);
  const detailOffset = opening.kind === 'window' ? (depths.face + depths.back) / 2 : depths.face;
  // … detailLine unchanged …
  const casingPolygon = casing ? [
    elevationToPlan(frame, casing.x, depths.face),
    elevationToPlan(frame, casing.x + casing.width, depths.face),
    elevationToPlan(frame, casing.x + casing.width, depths.face + casing.thickness),
    elevationToPlan(frame, casing.x, depths.face + casing.thickness),
  ] : null;
  const labelOffset = depths.face + (casing?.thickness ?? 0) + 12 / scale;
```

### `src/elevation/model/openings.js`

Import `import { openingPlanDepths } from './recesses.js';`. In `openingsAtPoint` (288–314), after `const geometry = …`:

```js
      const depths = openingPlanDepths(wall, opening);
      const inVoid = contains(wallX, geometry.jamb.x, geometry.jamb.x + geometry.jamb.width)
        && contains(wallOffset, depths.back, depths.face);
      const inCasing = Boolean(
        geometry.casing
        && contains(wallX, geometry.casing.x, geometry.casing.x + geometry.casing.width)
        && contains(wallOffset, depths.face, depths.face + geometry.casing.thickness),
      );
```

### `src/elevation/plan/PlanRunFootprint.jsx`

A run's depth dimension is measured from the plane it sits on (a recess back), not the wall face:

```js
  // From the plane the run sits on (SPEC-38): the wall face, or a recess back.
  const planeBack = run._plane?.offset ?? 0;
  const depth = frontDepth(run, settings) - planeBack;
  …
  const dimensionBack = elevationToPlan(frame, dim.x, planeBack);
  const dimensionFront = elevationToPlan(frame, dim.x, planeBack + depth);
  const depthLabelLocation = elevationToPlan(frame, dim.label.x, planeBack + dim.label.offset);
```

and the leader (225–230) uses `planeBack + dim.leader.offset` for both points.

### `src/elevation/model/__tests__/recesses.test.js`

Add `import { openingsAtPoint } from '../openings.js';` and append inside the `describe`:

```js
  it('hits a door in a recess at its back in plan, not in the recess air', () => {
    const door = {
      id: 'DR', kind: 'door', label: 'D2', measureMode: 'jamb', width: 24, height: 80, sillZ: 0,
      offset: 72, offsetFrom: 'left', offsetAnchor: 'edge', casing: null, recessId: 'R',
    };
    const host = {
      ...wall([R]), name: '', numberOverride: null, elevationForced: false,
      connections: { start: null, end: null }, profile: {}, openings: [door],
    };
    const room = { id: 'room', name: 'Room', profile: { ...S.defaultProfile }, wallOrder: ['H'], walls: [host] };
    expect(openingsAtPoint(room, { x: 84, y: -26 }, S)).toEqual(['DR']);
    expect(openingsAtPoint(room, { x: 84, y: -2 }, S)).toEqual([]);
  });
```

(The wall runs (0,0)→(240,0) and its face is toward +y, as in `outset.test.js`, so y = −26 is 2" behind the 24" recess back.)

**Count:** 832 + 1 = **833**.

---

## §12 Next: 38.1 (recessed cabinets and cutouts)

Kyle's answers, 2026-10-01, for the spec:

- **How a cabinet in a recess finishes** (a run setting): the face frame laps past the recess edge on all sides (1/4" to 3/4", depending on the cabinets between); on Euro runs an end panel flush with the cabinet face, as deep as the cabinet to the wall face, which can also sit in that 1/4"–3/4" overlap (more for a wider panel); a base deeper than the recess with end panels at its sides; casing around the recess, on 3 or 4 sides, by the shop or by the finish carpenter (drawn, but a part only when it's ours).
- **Panel cutouts:** the hole is the box plus a clearance each side: 0 when the box fits in the hole, −3/4" when the box interior is flush with the hole and the panel covers the box edges. Doors in the hole get 1/16" on all four sides for now.
- A base on the face that crosses a recess may later go deeper behind the face while its front stays in line with the other bases.
