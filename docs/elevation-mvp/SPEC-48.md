# Round 48 — SPEC: the profile editor (lines, arcs, typed coordinates, snapping, named points)

Steps 429–433, designer only, on branch `elevation-doors` (after step 428, 1124 tests). Geometry and the API don't change. No Supabase (plan P18).
DOORS-PROFILES-PLAN §2 (profile geometry), §5 (`/library/profiles/:id`), §10 row 48. Builds on SPEC-47 (`model/sectionProfiles.js`, the five profile reducers, the Profiles page).

**Done when:**
- Each profile card has **Edit shape**, which opens `/library/profiles/:profileId`. That's a full-width editor with a canvas on the left and a panel on the right.
- The canvas shows the profile y-up, so for door profiles the front face (y = 0) is at the top. It has a grid, the x = 0 and y = 0 axes, named points, zoom, pan and Fit.
- Points can be typed (x, y as fractions or decimals), renamed, added, deleted, dragged with snapping, and any point can be made the origin.
- New shapes are drawn with a **Line** tool. Any segment can become an arc set by radius, sweep and direction, and be split. A corner can be joined out. A loop can be deleted.
- Undo/redo while editing. **Save** writes through `updateSectionProfile`, so a shape change bumps the version (SPEC-47). Leaving with unsaved changes asks first.
- Attach points, drawn points and tags are **not** edited here. Attach and drawn points come in 48.1; tags stay in the Details dialog. Renaming or deleting a point keeps any attach/drawn references in step.

| Step | Repo | What | Tests after |
|---|---|---|---|
| **429** | designer | Model: point edits (ids, add, move, rename, delete, origin, snap, coordinate text) | 1124 → **1130** |
| **430** | designer | Model: loop and segment edits (add/delete loop, split, join, line ↔ arc, radius, sweep) | **1136** |
| **431** | designer | UI: editor route, page shell, draft + undo/redo + save, points panel | 1136 |
| **432** | designer | UI: the canvas (grid, axes, shape, points, zoom/pan/fit, selection) | 1136 |
| **433** | designer | UI: tools (drag with snap, Line tool, segment panel, Join, keys) | 1136 |

Codex writes the code (PROMPT-CONVENTIONS rule 10). No throwaway build was made for this SPEC. Every expected value in the tests was worked out by hand from the rules below. If a test fails, fix the code, not the number, unless the number contradicts a rule here; then stop and say what you got. Trig values that can't be stated exactly use `toBeCloseTo`.

---

## §1 Decisions (Claude's defaults, 2026-10-08 — Kyle can overrule)

- **One new model module, `src/elevation/model/profileEditing.js`.** Every edit is a pure function `(profile, …) → newProfile | null`. Rules for all of them:
  - Never mutate the input. Work on `structuredClone(profile)`.
  - Return `null` for an unknown point/loop id, a segment index out of range, a bad argument, or a result that fails `isSectionProfile` (SPEC-47). **So a draft built only from these edits is always a valid profile.** The editor never has an invalid state to explain on Save.
  - Every coordinate an edit **writes** (a new or moved point, an arc center it computes) is rounded to 6 decimals, and `-0` becomes `0`. Call this `round6`; it's internal. Coordinates an edit doesn't touch are left exactly as they were.
  - Edits only change `geometry`, plus `attach` and `drawnPoints` when a point is renamed or deleted. They never touch `id`, `name`, `tags`, `version` or `archived`.
- **Point names.** `isPointId(id)`: `/^[A-Za-z][A-Za-z0-9_]{0,23}$/`. A letter first, then letters, digits or `_`, 24 characters at most. New points are named `p1`, `p2`, …, the first free one (`nextPointId`). New loops are `L1`, `L2`, … (`nextLoopId`). Existing names that don't match (imported files) are left alone. Only renames and new points are checked.
- **Typed coordinates use the repo's `parseInches`** (`model/units.js`). It already takes `-13/16`, `1 1/2`, `.25` and simple arithmetic. Shown values use `formatProfileCoord(n)`:
  - an exact multiple of 1/64 (`|n·64 − round(n·64)| < 1e-9`) shows as a fraction: `formatInchesInput(n, 1/64)`;
  - anything else shows as a decimal: `String(Number(n.toFixed(4)))`, so `-0` shows `0`.
  - A coordinate input commits **only when its text changed**. Tabbing through a field showing `0.6768` must not move the point from 0.676777.
- **Arcs keep their sweep when an end moves (the "sweep rule").** An arc's sweep θ is measured as in SPEC-47's bounds: from the angle of `from` about `center` to the angle of `to`, counter-clockwise when `ccw`, clockwise otherwise, in degrees, in (0, 360). Given `from` F, `to` T, a sweep θ and a direction, the center is:
  - `M = (F + T) / 2`, `h = |T − F| / 2`, `u = (T − F) / |T − F|`, `n = (−u.y, u.x)` (u turned 90° counter-clockwise), `d = h / tan(θ / 2)`;
  - `center = M + n·d` when `ccw`, `M − n·d` when clockwise; then `round6`.
  - Above 180°, `tan` goes negative, so the center lands on the other side of the chord. No special case is needed.
  - `moveProfilePoint` applies this to every arc that starts or ends at the moved point, keeping each arc's old sweep and direction. `setSegmentArc` uses it with a typed sweep. `setArcRadius` uses it with the sweep that gives that radius.
  - A zero-length chord (F = T) → `null`.
- **Arcs are made by converting a line.** The Line tool only draws lines. A segment becomes an arc in the segment panel, which defaults to 90° clockwise. Then set its radius, sweep or direction. That covers coves, beads, ogees (two arcs after a split) and roundovers without a three-click arc tool.
- **Deleting points.** A point a segment uses can't be deleted (join it out first). Deleting a loop, or joining a corner out, also deletes the points that **only that loop used** and that aren't named in `attach` or `drawnPoints`. Reference points stay.
- **The canvas is y-up.** It shows the same orientation as the thumbnails. For door profiles, x runs in from the reference edge toward the door's center and y = 0 is the front face, so the face is at the top and the door body goes down (P10). The y = 0 axis is labelled *face (y = 0)*.
- **The draft lives in the page, not the store.** Edits push onto an undo history held in the component. **Save** dispatches `updateSectionProfile` once, so one save is one version bump at most. Name and tags always come from the stored profile, never the draft. "Unsaved" means `JSON.stringify([geometry, attach, drawnPoints])` differs from the stored profile's.
- **Full width.** The editor route sits outside `LibraryLayout`, so it gets the whole window below the app header. React Router v6 ranks `/library/profiles/:profileId` above the nested `/library` routes, so no other route changes.
- **Not in 48:** attach points and drawn points (48.1); opening the editor over the room from the door style tool (48.2); DXF import (49); drawing with profiles (50); a three-point arc tool, fillets, mirror and copy-paste of shapes (later, if wanted); blocking the browser's own back button on unsaved changes.

---

## §2 Step 429 — model: point edits

**Files:**

| File | Lines | Change |
|---|---:|---|
| NEW `src/elevation/model/profileEditing.js` | — | the exports below |
| NEW `src/elevation/model/__tests__/profileEditing.test.js` | — | 6 tests, verbatim |

**Contract.** Imports: `isSectionProfile` from `./sectionProfiles.js`; `formatInchesInput` from `./units.js`. One-line doc comment on each export naming SPEC-48. The §1 rules apply to every edit.

- `PROFILE_GRID_STEPS = [0.25, 0.125, 0.0625, 0.03125]` — the editor's grid choices (1/4", 1/8", 1/16", 1/32").
- `isPointId(id)` — §1.
- `nextPointId(profile)` → the first `p{n}` (n = 1, 2, …) not a key of `profile.geometry.points`. Reads only the points.
- `formatProfileCoord(n)` → §1.
- `addProfilePoint(profile, xy, id)` → the point is appended (last key) at `round6(xy)`. `null` when `isPointId(id)` is false, the id is taken, or `xy` isn't two finite numbers.
- `moveProfilePoint(profile, id, xy)` → the point moves to `round6(xy)`; every arc that starts or ends at it gets a new center by the sweep rule (keeping its old sweep and `ccw`). `null` for an unknown id, a non-finite coordinate, or an arc whose two ends would meet.
- `renameProfilePoint(profile, id, newId)` → the key is replaced **in the same position** in `points`, along with every `from`/`to` naming it, every `attach` value naming it and every entry in `drawnPoints.elevation` / `drawnPoints.plan`. Renaming to the same id returns an equal profile. `null` for an unknown id, an invalid new id, or a new id that's already taken.
- `deleteProfilePoint(profile, id)` → removes the point. Also drops every `attach` key whose value is that id and removes it from both `drawnPoints` lists (a `plan` list stays, even if it ends up empty). `null` when a segment uses the point or the id is unknown.
- `moveProfileOrigin(profile, id)` → translates every point and every arc center by minus that point's coordinates, so it becomes `[0, 0]`. `null` for an unknown id.
- `snapProfilePoint(profile, xy, { grid, reach, exclude = null })` → `{ xy, id }`:
  - Use the existing point nearest to `xy` within distance `reach` (inclusive), skipping `exclude`; on a tie, the first in `points` order. Then `{ xy: [its x, its y], id }`.
  - Otherwise `{ xy: [round6(Math.round(x / grid) · grid), round6(Math.round(y / grid) · grid)], id: null }`.
  - The UI passes `reach` = 8 px ÷ the current scale.

**NEW `src/elevation/model/__tests__/profileEditing.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newSectionProfile } from '../sectionProfiles.js';
import {
  PROFILE_GRID_STEPS, addProfilePoint, deleteProfilePoint, formatProfileCoord, isPointId, moveProfileOrigin,
  moveProfilePoint, nextPointId, renameProfilePoint, snapProfilePoint,
} from '../profileEditing.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const [COVE, BEAD, CROWN] = sample.profiles;
const SQUARE = newSectionProfile([], 'sp-sq');

describe('SPEC-48 editing profile points', () => {
  it('names new points and formats coordinates for typing', () => {
    expect(PROFILE_GRID_STEPS).toEqual([0.25, 0.125, 0.0625, 0.03125]);
    const gap = { ...SQUARE, geometry: { ...SQUARE.geometry, points: { p1: [0, 0], p3: [1, 0] } } };
    expect([nextPointId(COVE), nextPointId(SQUARE), nextPointId(gap)]).toEqual(['p1', 'p5', 'p2']);
    expect(['a', 'p12', 'face_edge', 'B2', '', '1a', 'a b', 'a-b', '_a', 'x'.repeat(24), 'x'.repeat(25)].map((id) => isPointId(id)))
      .toEqual([true, true, true, true, false, false, false, false, false, true, false]);
    expect([0, -0, 1.5, -0.8125, 0.015625, 2.25, 0.676777, -0.073223, 1 / 3].map((n) => formatProfileCoord(n)))
      .toEqual(['0', '0', '1 1/2', '-13/16', '1/64', '2 1/4', '0.6768', '-0.0732', '0.3333']);
  });

  it('adds a point, and deletes one only when no line or arc uses it', () => {
    const added = addProfilePoint(COVE, [1, 1], 'p1');
    expect(Object.entries(added.geometry.points).at(-1)).toEqual(['p1', [1, 1]]);
    expect(added.geometry.loops).toEqual(COVE.geometry.loops);
    expect(COVE.geometry.points.p1).toBeUndefined();
    expect([
      addProfilePoint(COVE, [1, 1], 'a'),
      addProfilePoint(COVE, [1, 1], '1x'),
      addProfilePoint(COVE, [Number.NaN, 1], 'p1'),
    ]).toEqual([null, null, null]);
    expect(deleteProfilePoint(added, 'p1')).toEqual(COVE);
    const referenced = {
      ...added,
      attach: { frame_edge: 'a', door_edge: 'p1' },
      drawnPoints: { elevation: ['b', 'p1'], plan: ['p1'] },
    };
    expect(deleteProfilePoint(referenced, 'p1'))
      .toEqual({ ...COVE, attach: { frame_edge: 'a' }, drawnPoints: { elevation: ['b'], plan: [] } });
    expect([deleteProfilePoint(COVE, 'a'), deleteProfilePoint(COVE, 'zz')]).toEqual([null, null]);
  });

  it('renames a point everywhere it is named', () => {
    const renamed = renameProfilePoint({ ...COVE, drawnPoints: { elevation: ['b', 'c'], plan: ['a'] } }, 'a', 'face');
    expect(Object.keys(renamed.geometry.points)).toEqual(['face', 'b', 'c', 'd', 'e']);
    expect(renamed.geometry.points.face).toEqual([0, 0]);
    const segs = renamed.geometry.loops[0].segs;
    expect([segs[0].from, segs[4].to]).toEqual(['face', 'face']);
    expect(renamed.attach).toEqual({ frame_edge: 'face' });
    expect(renamed.drawnPoints).toEqual({ elevation: ['b', 'c'], plan: ['face'] });
    const b1 = renameProfilePoint(COVE, 'b', 'b1');
    expect([b1.drawnPoints, b1.geometry.loops[0].segs[0].to, b1.geometry.loops[0].segs[1].from])
      .toEqual([{ elevation: ['b1', 'c'] }, 'b1', 'b1']);
    expect(renameProfilePoint(COVE, 'a', 'a')).toEqual(COVE);
    expect([renameProfilePoint(COVE, 'a', 'b'), renameProfilePoint(COVE, 'a', '1x'), renameProfilePoint(COVE, 'q', 'r')])
      .toEqual([null, null, null]);
  });

  it('moves a point; an arc that ends on it keeps its sweep and gets a new center', () => {
    expect(moveProfilePoint(CROWN, 'c3', [3.25, 4.5]))
      .toEqual({ ...CROWN, geometry: { ...CROWN.geometry, points: { ...CROWN.geometry.points, c3: [3.25, 4.5] } } });
    const cove = moveProfilePoint(COVE, 'c', [1, -0.5]);
    expect(cove.geometry.points.c).toEqual([1, -0.5]);
    expect(cove.geometry.loops[0].segs[1]).toEqual({ type: 'arc', from: 'b', to: 'c', center: [0.5, -0.5], ccw: false });
    const bead = moveProfilePoint(BEAD, 't', [1, 0]);
    expect(bead.geometry.loops[0].segs[0]).toEqual({ type: 'arc', from: 's', to: 't', center: [0.5, 0], ccw: false });
    expect([
      moveProfilePoint(COVE, 'c', [0.5, 0]),
      moveProfilePoint(COVE, 'q', [1, 1]),
      moveProfilePoint(COVE, 'c', [1, Number.POSITIVE_INFINITY]),
    ]).toEqual([null, null, null]);
    expect(COVE.geometry.points.c).toEqual([0.75, -0.25]);
  });

  it('moves the origin to a point', () => {
    expect(moveProfileOrigin(CROWN, 'c5').geometry.points)
      .toEqual({ c1: [-0.5, 0], c2: [-0.5, 4.5], c3: [2.5, 4.5], c4: [2.5, 3.75], c5: [0, 0] });
    const cove = moveProfileOrigin(COVE, 'e');
    expect(cove.geometry.points).toEqual({ a: [0, 0.8125], b: [0.5, 0.8125], c: [0.75, 0.5625], d: [0.75, 0], e: [0, 0] });
    expect(cove.geometry.loops[0].segs[1].center).toEqual([0.5, 0.5625]);
    expect([moveProfileOrigin(COVE, 'a'), moveProfileOrigin(COVE, 'q')]).toEqual([COVE, null]);
  });

  it('snaps to a nearby point, else to the grid', () => {
    expect([
      snapProfilePoint(COVE, [0.51, 0.01], { grid: 0.0625, reach: 0.05 }),
      snapProfilePoint(COVE, [0.3, -0.4], { grid: 0.0625, reach: 0.05 }),
      snapProfilePoint(COVE, [0.51, 0.01], { grid: 0.0625, reach: 0.05, exclude: 'b' }),
      snapProfilePoint(COVE, [0.51, 0.01], { grid: 0.0625, reach: 0.005 }),
      snapProfilePoint(COVE, [0.3, -0.4], { grid: 0.25, reach: 0.05 }),
    ]).toEqual([
      { xy: [0.5, 0], id: 'b' },
      { xy: [0.3125, -0.375], id: null },
      { xy: [0.5, 0], id: null },
      { xy: [0.5, 0], id: null },
      { xy: [0.25, -0.5], id: null },
    ]);
  });
});
```

How the arc numbers come out:
- **Cove**, c moved to (1, −0.5). The arc b → c was a 90° clockwise arc. F = (0.5, 0), T = (1, −0.5), M = (0.75, −0.25), h = 0.35355, n = (0.70711, 0.70711), d = h / tan 45° = h. Center = M − n·d = (0.75 − 0.25, −0.25 − 0.25) = **(0.5, −0.5)**. Radius 0.5 to both ends ✓.
- **Bead**, t moved to (1, 0). 180° clockwise, so d = h / tan 90° ≈ 3e-17. Center = M − n·d = (0.5, −3e-17) → `round6` → (0.5, −0) → **(0.5, 0)**. This is why `-0` must become `0`: Vitest's `toEqual` tells `-0` from `0`.
- **Origin at the cove's e** (0, −0.8125): every y gains 0.8125. c → (0.75, 0.5625), and the arc center (0.5, −0.25) → (0.5, 0.5625).

**Don't touch:** `sectionProfiles.js`, `units.js`, every other model file, the store, the components, existing tests.

**Count:** 1124 + 6 = **1130**. Golden snapshot unchanged.

---

## §3 Step 430 — model: loop and segment edits

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/profileEditing.js` | (429) | the exports below |
| NEW `src/elevation/model/__tests__/profileLoops.test.js` | — | 6 tests, verbatim |

**Contract** (same §1 rules; `loopId` names a loop, `index` is a 0-based segment index in it):

- `nextLoopId(profile)` → the first free `L{n}` among the loop ids.
- `addProfileLoop(profile, pointIds, closed)` → appends `{ id: nextLoopId, closed, segs }`. `segs` are lines from each id to the next, plus, when `closed`, one from the last back to the first. Every rule (too few points, repeats in a row, unknown ids, an open loop ending where it starts) is left to `isSectionProfile`, which returns `null`.
- `deleteProfileLoop(profile, loopId)` → removes the loop and the points only it used (§1). `null` for an unknown id or the last loop.
- `splitProfileSegment(profile, loopId, index, id = nextPointId(profile))` → a new point (appended last) splits the segment in two, in place:
  - A line splits at its midpoint into two lines.
  - An arc splits at half its sweep, `center + r·(cos φ, sin φ)` with φ = angle of `from` ± θ/2 (+ for ccw, − for clockwise). It becomes two arcs with the same center and `ccw`.
  - `null` for a bad id, an index out of range, or a taken / invalid point id.
- `profilePointJoints(profile, pointId)` → the ids of the loops (in order) where the point is a **joint**: some segment ends at it and the next one starts at it. In a closed loop, last → first counts too. An open loop's two end points aren't joints.
- `removeProfileVertex(profile, loopId, pointId)` → the two segments meeting at the joint become one **line** from the first's `from` to the second's `to`, in the first one's place. When the joint is a closed loop's start (last → first), the new segment list is `[...segs.slice(1, -1), line(last.from, first.to)]`. The point is then deleted if nothing else uses or names it (§1). `null` when the point isn't a joint of that loop, or the result is invalid (a triangle can't lose a corner).
- `setSegmentArc(profile, loopId, index, { sweep, ccw })` → the segment becomes (or stays) an arc with that sweep (degrees, 0 < sweep < 360) and direction, center by the sweep rule. `null` when sweep is out of range or not finite, or `ccw` isn't boolean.
- `setSegmentLine(profile, loopId, index)` → the segment becomes `{ type: 'line', from, to }`. A line stays as it is.
- `setArcRadius(profile, loopId, index, radius)` → arcs only. `h` = half the chord.
  - `null` for a line, a non-finite radius, or `radius < h − 1e-9`.
  - Otherwise θ = 2·asin(min(1, h / radius)) in degrees. When the arc's current sweep is more than 180°, use 360 − θ instead.
  - Then the sweep rule, keeping `ccw`.
- `profileArcInfo(profile, loopId, index)` → `{ center, radius, sweep, ccw }` for an arc, each number `round6`; `null` for a line or a bad index. `radius` = distance from center to `from`; `sweep` as in §1.

**NEW `src/elevation/model/__tests__/profileLoops.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newSectionProfile } from '../sectionProfiles.js';
import {
  addProfileLoop, addProfilePoint, deleteProfileLoop, nextLoopId, profileArcInfo, profilePointJoints,
  removeProfileVertex, setArcRadius, setSegmentArc, setSegmentLine, splitProfileSegment,
} from '../profileEditing.js';

const sample = JSON.parse(readFileSync(new URL('./fixtures/sectionProfiles.json', import.meta.url), 'utf8'));
const [COVE, BEAD] = sample.profiles;
const SQUARE = newSectionProfile([], 'sp-sq');
const line = (from, to) => ({ type: 'line', from, to });
const segsOf = (profile, loop = 0) => profile.geometry.loops[loop].segs;

/** The 3/4" square plus three loose points for a second loop. */
function withLoosePoints() {
  let profile = addProfilePoint(SQUARE, [0.25, -0.25], 'p5');
  profile = addProfilePoint(profile, [0.5, -0.25], 'p6');
  return addProfilePoint(profile, [0.5, -0.5], 'p7');
}

describe('SPEC-48 editing profile loops and segments', () => {
  it('adds a loop of lines through points, closed or open', () => {
    const base = withLoosePoints();
    expect(nextLoopId(base)).toBe('L2');
    const closed = addProfileLoop(base, ['p5', 'p6', 'p7'], true);
    expect(closed.geometry.loops[1])
      .toEqual({ id: 'L2', closed: true, segs: [line('p5', 'p6'), line('p6', 'p7'), line('p7', 'p5')] });
    expect(nextLoopId(closed)).toBe('L3');
    expect(addProfileLoop(base, ['p5', 'p6'], false).geometry.loops[1])
      .toEqual({ id: 'L2', closed: false, segs: [line('p5', 'p6')] });
    expect([
      addProfileLoop(base, ['p5', 'p6'], true),
      addProfileLoop(base, ['p5'], false),
      addProfileLoop(base, ['p5', 'p5', 'p6'], false),
      addProfileLoop(base, ['p5', 'p6', 'p5'], false),
      addProfileLoop(base, ['p5', 'zz'], false),
    ]).toEqual([null, null, null, null, null]);
  });

  it('deletes a loop and the points only it used', () => {
    const closed = addProfileLoop(withLoosePoints(), ['p5', 'p6', 'p7'], true);
    expect(deleteProfileLoop(closed, 'L2')).toEqual(SQUARE);
    const drawn = { ...closed, drawnPoints: { elevation: ['p5'] } };
    expect(Object.keys(deleteProfileLoop(drawn, 'L2').geometry.points)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    expect([deleteProfileLoop(SQUARE, 'L1'), deleteProfileLoop(closed, 'L9')]).toEqual([null, null]);
  });

  it('splits a line at its middle and an arc at its half sweep', () => {
    const split = splitProfileSegment(SQUARE, 'L1', 0);
    expect(split.geometry.points.p5).toEqual([0.375, 0]);
    expect(segsOf(split))
      .toEqual([line('p1', 'p5'), line('p5', 'p2'), line('p2', 'p3'), line('p3', 'p4'), line('p4', 'p1')]);
    expect(splitProfileSegment(SQUARE, 'L1', 2, 'mid').geometry.points.mid).toEqual([0.375, -0.75]);
    const cove = splitProfileSegment(COVE, 'L1', 1);
    expect(cove.geometry.points.p1).toEqual([0.676777, -0.073223]);
    expect(segsOf(cove).slice(1, 3)).toEqual([
      { type: 'arc', from: 'b', to: 'p1', center: [0.5, -0.25], ccw: false },
      { type: 'arc', from: 'p1', to: 'c', center: [0.5, -0.25], ccw: false },
    ]);
    expect([
      splitProfileSegment(SQUARE, 'L1', 4),
      splitProfileSegment(SQUARE, 'L9', 0),
      splitProfileSegment(SQUARE, 'L1', 0, 'p1'),
    ]).toEqual([null, null, null]);
  });

  it('removes a corner by joining its two segments into one line', () => {
    const split = splitProfileSegment(SQUARE, 'L1', 0);
    expect(removeProfileVertex(split, 'L1', 'p5')).toEqual(SQUARE);
    const triangle = removeProfileVertex(SQUARE, 'L1', 'p2');
    expect(segsOf(triangle)).toEqual([line('p1', 'p3'), line('p3', 'p4'), line('p4', 'p1')]);
    const noStart = removeProfileVertex(SQUARE, 'L1', 'p1');
    expect(segsOf(noStart)).toEqual([line('p2', 'p3'), line('p3', 'p4'), line('p4', 'p2')]);
    expect(Object.keys(noStart.geometry.points)).toEqual(['p2', 'p3', 'p4']);
    const open = addProfileLoop(withLoosePoints(), ['p5', 'p6', 'p7'], false);
    expect([
      profilePointJoints(SQUARE, 'p1'),
      profilePointJoints(open, 'p6'),
      profilePointJoints(open, 'p5'),
      profilePointJoints(SQUARE, 'zz'),
    ]).toEqual([['L1'], ['L2'], [], []]);
    expect(segsOf(removeProfileVertex(open, 'L2', 'p6'), 1)).toEqual([line('p5', 'p7')]);
    expect([
      removeProfileVertex(triangle, 'L1', 'p3'),
      removeProfileVertex(open, 'L2', 'p5'),
      removeProfileVertex(SQUARE, 'L9', 'p1'),
    ]).toEqual([null, null, null]);
  });

  it('turns a line into an arc by sweep and direction, and back', () => {
    const up = setSegmentArc(SQUARE, 'L1', 0, { sweep: 180, ccw: false });
    expect(segsOf(up)[0]).toEqual({ type: 'arc', from: 'p1', to: 'p2', center: [0.375, 0], ccw: false });
    const down = setSegmentArc(SQUARE, 'L1', 0, { sweep: 90, ccw: true });
    expect(segsOf(down)[0]).toEqual({ type: 'arc', from: 'p1', to: 'p2', center: [0.375, 0.375], ccw: true });
    expect(setSegmentLine(down, 'L1', 0)).toEqual(SQUARE);
    expect(setSegmentLine(SQUARE, 'L1', 0)).toEqual(SQUARE);
    expect([
      setSegmentArc(SQUARE, 'L1', 0, { sweep: 0, ccw: false }),
      setSegmentArc(SQUARE, 'L1', 0, { sweep: 360, ccw: false }),
      setSegmentArc(SQUARE, 'L1', 0, { sweep: 90, ccw: 'yes' }),
      setSegmentArc(SQUARE, 'L1', 7, { sweep: 90, ccw: false }),
    ]).toEqual([null, null, null, null]);
    expect(profileArcInfo(COVE, 'L1', 1)).toEqual({ center: [0.5, -0.25], radius: 0.25, sweep: 90, ccw: false });
    expect(profileArcInfo(COVE, 'L1', 0)).toBeNull();
  });

  it('sets an arc radius, keeping its direction and whether it is more than a half circle', () => {
    const cove = setArcRadius(COVE, 'L1', 1, 0.5);
    const arc = segsOf(cove)[1];
    expect([arc.center, arc.ccw]).toEqual([[0.294281, -0.455719], false]);
    const info = profileArcInfo(cove, 'L1', 1);
    expect(info.radius).toBeCloseTo(0.5, 5);
    expect(info.sweep).toBeCloseTo(41.409622, 4);
    expect(setArcRadius(BEAD, 'L1', 0, 0.25)).toEqual(BEAD);
    expect([setArcRadius(COVE, 'L1', 1, 0.1), setArcRadius(COVE, 'L1', 0, 0.5), setArcRadius(COVE, 'L1', 1, -1)])
      .toEqual([null, null, null]);
  });
});
```

How the numbers come out:
- **Cove split.** b is at 90° about (0.5, −0.25) and the arc runs 90° clockwise, so φ = 45°. p1 = (0.5 + 0.25 cos 45°, −0.25 + 0.25 sin 45°) = (0.6767767, −0.0732233) → (0.676777, −0.073223).
- **Square, segment 0** (p1 (0, 0) → p2 (0.75, 0)): u = (1, 0), n = (0, 1), M = (0.375, 0), h = 0.375.
  - 180° clockwise: d ≈ 0, center (0.375, 0) after `round6` / `-0` → 0. The arc bulges up.
  - 90° ccw: d = 0.375, center = M + n·d = (0.375, 0.375). The arc dips into the square.
- **Cove radius 0.5.** h = |c − b| / 2 = 0.1767767, θ = 2·asin(0.3535534) = 41.409622°. The arc is clockwise, so center = M − n·d with M = (0.625, −0.125), n = (0.7071068, 0.7071068), d = √(0.25 − 0.03125) = 0.4677072, n·d = (0.3307189, 0.3307189). Center (0.2942811, −0.4557189) → (0.294281, −0.455719). Distance to b = √(0.2057189² + 0.4557189²) = 0.5 ✓.
- **Bead radius 0.25** equals h, so θ = 180° and the center stays (0.25, 0): unchanged.

**Don't touch:** the 429 tests, every other model file, the store, the components.

**Count:** 1130 + 6 = **1136**.

---

## §4 Step 431 — UI: editor route, page shell, draft, points panel

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/App.jsx` | 70 | import `ProfileEditorPage`; `<Route path="/library/profiles/:profileId" element={<ProfileEditorPage />} />` right before the `/library` route |
| `src/library/ProfilesPage.jsx` | 226 | **Edit shape** link on each card; note text |
| `src/library/ProfileDetailsDialog.jsx` | 112 | one read-only line's text |
| NEW `src/library/profileEditor/useProfileDraft.js` | — | draft + undo/redo hook |
| NEW `src/library/profileEditor/CoordInput.jsx` | — | coordinate text input |
| NEW `src/library/profileEditor/PointsPanel.jsx` | — | points table |
| NEW `src/library/profileEditor/ProfileEditorPage.jsx` | — | the page |

**Contract.**
- **ProfilesPage:** on each card, right after **Details**, `<Link to={`/library/profiles/${profile.id}`} className={BUTTON_CLASS}>Edit shape</Link>` (`Link` from `react-router-dom`). In the bottom note, replace *Shapes are drawn in the profile editor (next round).* with *Edit shape opens the profile editor.* Nothing else changes.
- **ProfileDetailsDialog:** the line *The shape, attach points and drawn points are edited in the profile editor (next round).* becomes *The shape is edited with Edit shape; attach and drawn points come next round.*
- **`useProfileDraft(saved)`** (`saved` = the stored profile or `undefined`):
  - Built with `useReducer` over `{ draft, past, future }`.
  - Returns `{ draft, apply(next), undo(), redo(), canUndo, canRedo, dirty }`.
  - `apply(next)` pushes the current draft onto `past` (capped at 100, dropping the oldest), clears `future`, and sets `draft = next`.
  - `dirty` = `JSON.stringify([draft.geometry, draft.attach, draft.drawnPoints])` differs from the same of `saved`.
  - The first draft is `structuredClone(saved)`. When `saved.id` changes, the hook resets (draft = clone, empty history).
  - The page never calls `apply` with `null`. It checks first (below).
- **`CoordInput({ value, onCommit, className = '', ...inputProps })`**, following `src/elevation/components/InchInput.jsx` (62 lines):
  - It shows `formatProfileCoord(value)`.
  - On blur or Enter it commits **only when the text differs from what it last showed**, parsing with `parseInches`. When the parse fails or `onCommit` returns `false`, it reverts.
  - Escape reverts and blurs. Same input classes as InchInput, `font-mono text-xs` added, `py-1`.
- **`PointsPanel({ profile, selectedPointId, onSelectPoint, onApply })`**. `onApply(next, failText)` is the page's apply (below) and returns whether it applied.
  - Heading *Points* (`text-sm font-medium text-gray-200`).
  - A table with columns **Name | x | y | (actions)**. One row per point in `points` order. The selected row is `bg-blue-900/40`. Clicking a row (not an input) calls `onSelectPoint(id)`.
  - **Name**: a text input (same classes, `w-20`), committed on blur/Enter when changed, via `renameProfilePoint`. Fail text: *Point names start with a letter, use letters, numbers or _, up to 24 characters, and must be unique.* If the selected point was renamed, select the new name.
  - **x / y**: `CoordInput`, committing `moveProfilePoint(profile, id, [newX, y])` (or `[x, newY]`). Fail text: *That move would make an arc impossible.*
  - **Actions**, small text buttons (`text-xs text-gray-400 hover:text-white`):
    - **Origin** → `moveProfileOrigin`.
    - **Delete** → `deleteProfilePoint`. Disabled when any segment uses the point, with `title="Used by a line or arc — join it out first"`.
  - Under the table, an **Add point** row:
    - two `CoordInput`-style plain text inputs (placeholders *x*, *y*) and an **Add** button;
    - Add parses both with `parseInches` and calls `addProfilePoint(profile, [x, y], nextPointId(profile))`;
    - when a parse fails, fail text *Enter x and y in inches, e.g. 1 1/2 or -13/16.*;
    - on success, clear both inputs and select the new point.
  - Every number on screen is `formatProfileCoord`.
- **`ProfileEditorPage`**:
  - `profileId` from `useParams`. `saved` = the matching entry of `state.elevation.settings.sectionProfiles`.
  - Unknown id: *Profile not found.* plus a link *Back to profiles* (`/library/profiles`), in a padded box.
  - Root: `flex h-full min-h-0 flex-col`. AppShell's `<main>` is `flex-1 overflow-hidden` inside `h-screen`.
  - **Header** (`flex items-center gap-3 border-b border-gray-700 bg-gray-800/60 px-4 py-2`):
    - Back control. When not dirty, a `Link` *← Profiles*. When dirty, a button: the first click turns it into a red *Discard changes?* (`text-red-300`); a second click navigates to `/library/profiles` (`useNavigate`). Any edit clears it back.
    - The name (`font-medium text-gray-100`), `v{saved.version}`, an *archived* pill when archived, and *Unsaved* (`text-xs text-amber-300`) when dirty.
    - A spacer, then **Undo**, **Redo** (disabled per hook) and **Save** (blue: `rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500 disabled:opacity-50`, disabled when not dirty).
    - Save dispatches `updateSectionProfile({ profileId: saved.id, profile: { ...saved, geometry: draft.geometry, attach: draft.attach, drawnPoints: draft.drawnPoints } })`. The undo history stays.
  - **Message line** under the header, only when set: `px-4 py-1 text-sm text-red-300`, `role="status"`.
  - **Body:** `flex min-h-0 flex-1`.
    - Left: canvas area (`relative min-h-0 flex-1 bg-gray-900`). For now it holds `<ProfileThumbnail profile={draft} className="h-full w-full p-8 text-gray-200" />`; step 432 replaces it.
    - Right: `w-96 shrink-0 overflow-y-auto border-l border-gray-700 p-4 space-y-5`, with:
      - `PointsPanel`;
      - a *Loops* list: one `text-xs text-gray-400` line per loop, `{id} · {closed ? 'closed' : 'open'} · {n} segments`;
      - the note (`text-xs text-gray-500`) *x runs in from the edge; y = 0 is the front face, negative into the door. Attach and drawn points come next round.*
  - **apply(next, failText = 'That change would make the shape invalid.')**:
    - `next === null` → set the message and return `false`;
    - else `draft.apply(next)`, clear the message and any discard prompt, return `true`.
  - **Selection** state: `{ kind: 'point', id } | { kind: 'segment', loopId, index } | null`. Points panel rows set `{ kind: 'point', id }`. Clear the selection when its point or loop no longer exists after undo/redo.
  - **Keys** (a `keydown` listener on `window`, ignored when the event target is an `input`, `select` or `textarea`): Ctrl/Cmd+Z undo; Ctrl/Cmd+Shift+Z or Ctrl+Y redo. Each calls `preventDefault`.
- Imports use relative paths: `../../elevation/model/profileEditing.js`, `../../elevation/model/sectionProfiles.js`, `../../elevation/model/units.js`, `../../elevation/store/elevationSlice.js`, `../ProfileThumbnail.jsx`.

**Don't touch:** the model, the store, LibraryLayout, the other library pages, ElevationLab. UI only, no new tests.

Gate: `npm test && npm run lint && npm run build`; 1136 tests.

---

## §5 Step 432 — UI: the canvas

**Files:**

| File | Lines | Change |
|---|---:|---|
| NEW `src/library/profileEditor/profileView.js` | — | view math (plain functions, no React) |
| NEW `src/library/profileEditor/ProfileCanvas.jsx` | — | the canvas |
| `src/library/profileEditor/ProfileEditorPage.jsx` | (431) | swap the thumbnail for the canvas; grid state |

**Contract.**
- **`profileView.js`**:
  - `fitView(profile, width, height)` → `{ cx, cy, scale }`:
    - start from `sectionProfileBounds`, widened to include (0, 0);
    - `w = max(maxX − minX, 0.25)`, `h = max(maxY − minY, 0.25)`;
    - `scale = clamp(min(width / (w·1.3), height / (h·1.3)), 20, 4000)` (px per inch);
    - center = the middle of the widened bounds.
  - `toScreen(view, size, [x, y])` → `[(x − cx)·scale + W/2, H/2 − (y − cy)·scale]`.
  - `toModel(view, size, [sx, sy])` → the inverse.
  - `zoomAt(view, size, [sx, sy], factor)` → a new view scaled by `factor` (clamped 20–4000), with the model point under `[sx, sy]` staying put.
  - `segmentScreenPath(profile, seg, view, size)` → `M x y L x y` for a line, or `M x y A r r 0 large sweep x y` for an arc. Here r = radius·scale, large = sweep > 180° ? 1 : 0, and sweep flag = `ccw ? 0 : 1` (y flipped, as in `sectionProfileSvgPath`).
  - `loopScreenPath(profile, loop, view, size)` → one `M` then each segment's `L`/`A`, plus ` Z` when closed.
  - The canvas uses screen coordinates directly (no `viewBox`), so stroke widths and labels stay constant at any zoom.
- **`ProfileCanvas({ profile, grid, selection, onSelect, fitSignal })`**:
  - A `div` (`relative h-full w-full select-none`) holding an absolutely filling `<svg>`. Size comes from a `ResizeObserver`.
  - View state: fit once when the size is first known and whenever `fitSignal` changes.
  - **Grid:**
    - minor lines at every multiple of `grid` across the visible range, drawn only when `grid·scale ≥ 8` (`stroke #1f2937`);
    - inch lines when `scale ≥ 8` (`#374151`);
    - the axes x = 0 and y = 0 (`#6b7280`, 1.5 px);
    - labels (10 px, `#6b7280`): *face (y = 0)* just above the y = 0 axis at the left edge, *x = 0* beside the x = 0 axis at the top.
  - **Shape:** per loop, the filled path (closed loops only: `fill="currentColor" fillOpacity={0.08} fillRule="evenodd"`, no stroke, `text-gray-200`). Then per segment:
    - a visible path (`stroke #e5e7eb`, 1.5; the selected segment `#60a5fa`, 2.5, `fill="none"`);
    - a hit path on top (`stroke="transparent" strokeWidth={12} fill="none" pointerEvents="stroke"`).
  - **Points:**
    - `circle` r 4 (`fill #111827`, `stroke #e5e7eb`; selected: `fill #3b82f6`);
    - a transparent hit circle r 8;
    - the id label at (+7, −7) (11 px, `#9ca3af`).
  - **Interaction:**
    - click a point → `onSelect({ kind: 'point', id })`; click a segment → `onSelect({ kind: 'segment', loopId, index })`; click empty → `onSelect(null)`;
    - a left drag on empty space (over 3 px) pans and doesn't change the selection; a middle-button drag always pans (use pointer capture);
    - the wheel zooms about the cursor: factor 1.15 per event, in when `deltaY < 0`. Attach the listener with `addEventListener('wheel', …, { passive: false })` in an effect, and `preventDefault`.
  - **Readout** (bottom-left, `pointer-events-none absolute bottom-2 left-2 rounded bg-gray-800/80 px-2 py-1 font-mono text-xs text-gray-300`): `x {formatProfileCoord} · y {formatProfileCoord}` of the cursor in model units, rounded to 1/64 for display (`Math.round(v·64)/64`); empty when the cursor is outside.
- **ProfileEditorPage:**
  - The canvas area becomes a small toolbar plus the canvas. The toolbar is `absolute left-2 top-2 z-10 flex gap-2`, holding:
    - **Fit** (bumps `fitSignal`);
    - a **Grid** select: `PROFILE_GRID_STEPS` shown with `formatInches`, default 1/16" (`grid` state in the page).
  - The panel's points table highlights the selected point. A selected segment shows `Segment {index + 1} of {n} · {loopId} · {from} → {to}` (`text-xs text-gray-300`) above the points table. Step 433 replaces that line with the segment panel.
  - Key **F** (outside inputs) = Fit.

**Don't touch:** the model, the store, PointsPanel (except reading `selectedPointId`, already a prop), other pages. UI only, no new tests.

Gate: `npm test && npm run lint && npm run build`; 1136 tests.

---

## §6 Step 433 — UI: tools, segment panel, Join, keys

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/library/profileEditor/ProfileCanvas.jsx` | (432) | drag, Line tool, snap marker |
| NEW `src/library/profileEditor/SegmentPanel.jsx` | — | the segment panel |
| `src/library/profileEditor/PointsPanel.jsx` | (431) | **Join** action |
| `src/library/profileEditor/ProfileEditorPage.jsx` | (432) | tool state, buttons, keys, wiring |

**Contract.**
- **New canvas props:** `tool` (`'select' | 'line'`), `onApply(next, failText)`, `onMessage(text)`.
- **Select tool, dragging a point:**
  - Pointer-down on a point remembers the draft at that moment (`start`). Past 3 px of movement it becomes a drag.
  - Each move: `snap = snapProfilePoint(start, model, { grid, reach: 8 / scale, exclude: id })`, `preview = moveProfilePoint(start, id, snap.xy) ?? lastPreview`. The canvas draws `preview` instead of `profile` while dragging.
  - Pointer-up applies the last preview once (one undo step) when it differs from `start`. A click without a drag just selects.
  - When `snap.id` is set, draw a ring (r 9, `stroke #4ade80`, no fill) on that point.
- **Line tool:**
  - Picks are `{ id: string | null, xy }`.
  - **Hover:** a small cross (`#4ade80`) at the snapped position (`snapProfilePoint(profile, model, { grid, reach: 8 / scale })`), plus a dashed preview line (`strokeDasharray="4 3"`, `#4ade80`) from the last pick.
  - **Click:**
    - When there are ≥ 3 picks and the click is within 8 px of the **first** pick, finish **closed**.
    - Otherwise snap. A pick at the same `xy` as the last one is ignored. If the snap found no point, reuse an earlier **new** pick at exactly the same `xy` (same id slot); otherwise add a new pick.
    - Draw the picks so far: dots, and solid `#4ade80` lines between them.
  - **Enter or double-click** finishes **open** (needs ≥ 2 picks). **Escape** cancels the picks.
  - **Finish:**
    - starting from the draft, give each new pick an id with `nextPointId` and `addProfilePoint` in order (the same id for repeated new picks), then call `addProfileLoop(…, ids, closed)`;
    - apply the result as one step, with fail text *A closed shape needs at least 3 points, an open line at least 2.*;
    - clear the picks either way and stay in the Line tool.
  - Points and segments aren't selectable in the Line tool. Left-drag still pans only past 3 px; a click under 3 px is a pick.
- **Toolbar** (page): **Select (V)** and **Line (L)** toggle buttons before Fit. The active one is `bg-blue-600 text-white`.
- **Keys** (page; outside inputs):
  - **V** / **L** switch tools (Line clears the selection).
  - **Escape**: in Line with picks → cancel the picks (the canvas handles it; give it the key via a `cancelSignal` prop or a ref, your choice). Otherwise → Select tool and clear the selection.
  - **Enter**: finish an open line.
  - **Delete** / **Backspace** with a point selected → `deleteProfilePoint`, fail text *That point is used by a line or arc — join it out first.* On success, clear the selection.
- **`SegmentPanel({ profile, loopId, index, onApply, onSelect })`** replaces 432's segment line, at the top of the right panel:
  - Header *Segment {index + 1} of {n} · {loopId} · {from} → {to}* (`text-sm text-gray-200`).
  - **Line | Arc** toggle (active `bg-blue-600 text-white`):
    - Arc → `setSegmentArc(profile, loopId, index, { sweep: 90, ccw: false })`;
    - Line → `setSegmentLine`.
  - When it's an arc (`info = profileArcInfo(...)`):
    - **Radius**: a `CoordInput` → `setArcRadius`; fail text *The radius can't be less than half the distance between the ends.*
    - **Sweep°**: a text input showing `info.sweep` to 2 decimals, committed on blur/Enter when changed → `setSegmentArc(…, { sweep: Number(text), ccw: info.ccw })`; fail text *Sweep must be more than 0 and less than 360.*
    - **Direction**: *Clockwise* / *Counter-clockwise* buttons → `setSegmentArc(…, { sweep: info.sweep, ccw })`.
    - A read-only line *Center {x}, {y}* (`formatProfileCoord`).
  - **Split** → `splitProfileSegment(profile, loopId, index)`; on success, select the new point (`nextPointId` of the profile before the split).
  - **Delete loop** → two clicks (*Delete loop* → *Confirm delete loop*) → `deleteProfileLoop`; fail text *A profile needs at least one loop.* On success, clear the selection.
  - Small buttons, same classes as the Profiles page's `BUTTON_CLASS`.
- **PointsPanel:** a **Join** action between Origin and Delete, enabled when `profilePointJoints(profile, id)` isn't empty. It calls `removeProfileVertex(profile, joints[0], id)`, with `title="Remove this corner: join its two segments into one line"` and fail text *Joining here would leave a loop with too few segments.* On success, clear the selection when the point is gone.
- **Note** line in the panel gains: *Line tool: click points, click the first point to close, Enter to finish open. Select a segment to make it an arc.*

**Don't touch:** the model, the store, profileView.js (add a helper there only if needed, without changing existing ones), other pages. UI only, no new tests.

Gate: `npm test && npm run lint && npm run build`; 1136 tests.

---

## End-to-end check (Kyle)

- **Library → Profiles → New profile** (or any card) → **Edit shape**. The square shows with its top edge on the *face (y = 0)* axis and points p1–p4 labelled. Wheel zoom stays under the cursor; dragging empty space pans; **Fit** (or F) brings it back.
- **Typed coordinates:** set p3's y to `-13/16` and p4's y to `-13/16` → the square becomes 3/4" × 13/16". Rename p1 to `face`.
- **Arc:** click the top edge (face → p2) → **Arc** → it bulges as a 90° arc. Set **Radius** `1/2`, flip **Direction**, then back to **Line**.
- **Cove:** split the right edge (p2 → p3), make the upper half an arc and set its radius. Drag the split point; the arc follows and keeps its sweep. Hold it near the grid or another point and watch it snap (green ring on points).
- **Line tool (L):** draw a triangle inside the square, clicking the first point to close. Undo (Ctrl+Z) removes the whole triangle in one step; Redo puts it back. Select one of its segments → **Delete loop**.
- **Join** a split point back out. **Origin** on a corner moves everything so that corner is 0, 0.
- **← Profiles** with unsaved changes asks *Discard changes?* first. **Save** → back on the Profiles page the thumbnail shows the new shape and the card reads `v2`. Saving again without a shape change doesn't bump it.
- Import SPEC-47's sample file and open the **Cove 1/4**: the arc and its five points show; its attach point `frame_edge → a` survives renaming `a` (check the Details dialog after Save).

**Known for now:**
- Attach points and drawn points can't be set in the editor yet (48.1). Renaming or deleting a point keeps existing ones in step.
- No three-point arc tool, fillet, mirror or copy/paste of shapes; ask if any of these would help.
- The browser's own Back button doesn't warn about unsaved changes; the editor's **← Profiles** does.
