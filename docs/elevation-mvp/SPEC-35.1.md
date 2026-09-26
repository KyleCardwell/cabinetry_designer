# Elevation Lab — SPEC-35.1 (drawing into a stack gap, select-before-move, message toast)

Steps 202–203, a short fix round after round 35. SPEC-35 still applies. The repo is at `865c459` (step 200) when
this was written; step 201 runs first, so the baseline is **667**.

| Step | What | Files |
|---|---|---|
| **202** | Drawing a run in the gap between two runs draws it there (not at its type's default height) and stacks it on both. Clicking a run's dimension while one of its cabinets is selected selects the run instead of starting a move. | `runDefaults.js`, `room.js`, `index.js`, `ElevationCanvas.jsx`, `stacks.test.js` |
| **203** | Messages move out of the toolbar into a toast under it, in words instead of codes. | NEW `MessageToast.jsx`, `ElevationLab.jsx`, `ElevationToolbar.jsx` |

## §1 Why drawing between the upper and the base says "conflict"

With "snap heights to defaults" on, `createRun` ignores the height you drew. A rectangle that starts at 36" is
typed as an upper and given the upper's default box, 54–90". That sits right on top of the upper that's already
there, so placing it fails with `conflict`. Starting it lower makes it a base at 4–34 1/2", which hits the base.

**Fix.** If the default box would hit a run it overlaps side to side, the run is drawn where you drew it, with a
manual height. Its bottom snaps to the nearest top of a run (countertop, crown…, else the box top) within 3"
(`cornerSnapDistance`), and its top snaps to the nearest bottom of a run (its cap, light rail…, else the box
bottom). Once it's placed, a new `joinTouchingStack` stacks it on the run whose top it touches and under the run
whose bottom it touches. The drag preview uses `createRun` too, so it shows the snapped box before you let go.
Drawing on open wall is unchanged.

## §2 Why clicking the run dimension started a move

`handleRunSegmentClick` starts a move when `selection.runId` is already that run. Selecting a cabinet also sets
`selection.runId`, so the first click on the run's dimension counted as the second one. It now also needs
`selection.pieceId` to be empty. The first click selects the run and the second starts the move.

---

## §3 Step 202

**`model/runDefaults.js`** (153):
- Imports add `import { runsConflict } from './overlap.js';`, `import { outerBottom, outerTop } from './stacks.js';`
  and `import { wallSideOf } from './wallSides.js';`.
- After `const heightMode = …` (82):

```js
  // A default box that hits a run it overlaps means the run was drawn into a gap: keep the
  // drawn height, snapped to the top of the run below and the bottom of the run above.
  const overlapping = (wall?.runs ?? []).filter((run) => (
    wallSideOf(run) === (wall.side ?? 'front')
    && Math.min(run.x + run.width, edges.right) - Math.max(run.x, edges.left) > 1e-6
  ));
  const inGap = heightMode === 'auto' && overlapping.some((run) => runsConflict(
    run,
    { ...typeDefaults, cabinetTypeId, x: edges.left, width: runWidth },
  ));
  const snapTo = (value, lines) => lines.reduce((best, line) => (
    Math.abs(line - value) <= settings.cornerSnapDistance
      && (best === null || Math.abs(line - value) < Math.abs(best - value))
      ? line
      : best
  ), null);
  const gapBottom = snapTo(bottomZ, overlapping.map((run) => outerTop(wall, run, profile)))
    ?? roundTo(bottomZ, 0.5);
  const gapTop = snapTo(topZ, overlapping.map(outerBottom)) ?? roundTo(topZ, 0.5);
```

- `geometry` (127–133) becomes:

```js
  const geometry = inGap
    ? { z: gapBottom, height: gapTop - gapBottom, depth: typeDefaults.depth }
    : heightMode === 'auto'
      ? typeDefaults
      : {
          z: roundTo(bottomZ, 0.5),
          height: roundTo(topZ - bottomZ, 0.5),
          depth: typeDefaults.depth,
        };
```

- In the run object (136–150), `heightMode,` becomes `heightMode: inGap ? 'manual' : heightMode,`.

**`model/room.js`** (1609):
- The stacks.js import (38) adds `STACK_EDGES`, `outerBottom`, `outerTop`, `stackLink`.
- Right after `joinStack` (761–793):

```js
/** Stack a newly drawn run on the run whose top it touches and under the run whose bottom it touches. */
export function joinTouchingStack(room, wallId, runId, settings) {
  let current = syncRoom(room, settings);
  const joined = [];
  for (const edge of STACK_EDGES) {
    const wall = current.walls.find((candidate) => candidate.id === wallId);
    const run = wall?.runs.find((candidate) => candidate.id === runId);
    if (!run) return { ok: false, reason: 'run-not-found', room, joined };
    if (stackLink(run, edge)) continue;
    const profile = resolveProfile(settings, current, wall);
    const line = edge === 'below' ? outerBottom(run) : outerTop(wall, run, profile);
    const leader = wall.runs.find((candidate) => candidate.id !== runId
      && wallSideOf(candidate) === wallSideOf(run)
      && Math.min(candidate.x + candidate.width, run.x + run.width)
        - Math.max(candidate.x, run.x) > PIN_EPSILON
      && Math.abs((edge === 'below' ? outerTop(wall, candidate, profile) : outerBottom(candidate))
        - line) <= JOIN_EDGE_TOLERANCE);
    if (!leader) continue;
    const result = joinStack(current, wallId, runId, edge, leader.id, settings);
    if (result.ok) {
      current = result.room;
      joined.push({ edge, runId: leader.id });
    }
  }
  return { ok: true, reason: null, room: current, joined };
}
```

**`model/index.js`**: `joinTouchingStack` in the room.js block, after `joinStack`.

**`components/ElevationCanvas.jsx`** (1832):
- The room.js import (71–79) adds `joinTouchingStack`.
- `commitRunDraw` (763–): the block from `const joinedPlacement = …` (798) to the `addRun` else branch (811)
  becomes:

```js
    const joinedPlacement = joinTouchingEdges(placement.room, wall.id, run.id, settings);
    const stackedPlacement = joinTouchingStack(joinedPlacement.room, wall.id, run.id, settings);
    if (joinedPlacement.joined.length > 0 || stackedPlacement.joined.length > 0) {
      const resolvedWall = stackedPlacement.room.walls.find(
        (candidate) => candidate.id === wall.id,
      );
      dispatch(replaceWallLayout({
        wallId: wall.id,
        runs: resolvedWall.runs,
        joints: resolvedWall.joints,
      }));
    } else {
      dispatch(addRun({ wallId: wall.id, run }));
    }
```

- `handleRunSegmentClick` (1279–1286): the condition (1281) becomes
  `if (selectionRef.current?.runId !== segment.runId || selectionRef.current?.pieceId) {`.

### Tests — `stacks.test.js`: add `import { createRun } from '../runDefaults.js';` and add `joinTouchingStack`,
`tryPlaceRun` to the room.js import; a describe at the end (2)

```js
describe('SPEC-35.1 drawing into a stack gap', () => {
  it('draws into the gap between a countertop and a cap and stacks on both', () => {
    const room = syncRoom(rawRoom([base(), upper()]), S);
    const run = createRun({ x: 0, width: 60, bottomZ: 37, topZ: 51 }, { settings: S, room, wall: room.walls[0] });
    expect(run).toMatchObject({ cabinetTypeId: UPPER, heightMode: 'manual', z: 36, height: 16.5 });
    const placed = tryPlaceRun(room, 'A', run, S);
    expect(placed.ok).toBe(true);
    const result = joinTouchingStack(placed.room, 'A', run.id, S);
    expect(result.joined).toEqual([{ edge: 'below', runId: 'B' }, { edge: 'above', runId: 'U' }]);
    expect(runOf(result.room, run.id).stack).toEqual({ below: link('B'), above: link('U') });
    expect(runOf(result.room, run.id)).toMatchObject({ z: 36, height: 16.5 });
  });

  it('leaves open-wall drawing alone and doesn\'t snap or stack from too far away', () => {
    const open = syncRoom(rawRoom([base()]), S);
    expect(createRun({ x: 70, width: 30, bottomZ: 50, topZ: 80 }, { settings: S, room: open, wall: open.walls[0] }))
      .toMatchObject({ cabinetTypeId: UPPER, heightMode: 'auto', z: 54, height: 36 });

    const room = syncRoom(rawRoom([base(), upper()]), S);
    const loose = createRun({ x: 0, width: 60, bottomZ: 41, topZ: 47 }, { settings: S, room, wall: room.walls[0] });
    expect(loose).toMatchObject({ heightMode: 'manual', z: 41, height: 6 });
    const placed = tryPlaceRun(room, 'A', loose, S);
    expect(joinTouchingStack(placed.room, 'A', loose.id, S).joined).toEqual([]);
  });
});
```

Working: B tops out at 36 (box 34 1/2 + stone 1 1/2). U is 54–90 with a 1 1/2" cap, so its bottom is 52 1/2. The
drawn rectangle 37–51 is an upper, and its default box (54–90) hits U, so it's in the gap. 37 is 1 from 36 and
51 is 1 1/2 from 52 1/2, both within 3, so the box is 36–52 1/2 = 16 1/2. It touches both lines, so it stacks
on B and under U and stays where it is. The open-wall upper at x 70–100 overlaps nothing, so it keeps the auto
54/36. The loose rectangle 41–47 is 5 and 5 1/2 away from those lines, so it isn't snapped and doesn't stack.

**Count:** 667 + 2 = **669**.

---

## §4 Step 203 — message toast

**NEW `components/MessageToast.jsx`:**

```jsx
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setMessage } from '../store/elevationSlice.js';

const MESSAGE_TEXT = {
  conflict: 'That overlaps another run.',
  'out-of-bounds': 'That goes outside the wall.',
  'stack-cycle': "Can't stack those: it would loop back on itself.",
  'stack-no-overlap': "Those runs don't overlap side to side, so one can't sit on the other.",
  'stack-wall-side': 'Those runs are on different sides of the wall.',
  'follow-cycle': "Can't follow that edge: it would loop back on itself.",
  'joint-same-run': "A run can't join both of its own edges to one joint.",
  'run-not-found': "That run isn't there any more.",
};

/** The current message, under the toolbar, until it's dismissed or times out. */
export default function MessageToast() {
  const dispatch = useDispatch();
  const message = useSelector((state) => state.elevation.message);

  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => dispatch(setMessage(null)), 6000);
    return () => clearTimeout(timer);
  }, [dispatch, message]);

  if (!message) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-4">
      <div
        role="status"
        className="pointer-events-auto flex max-w-xl items-start gap-3 rounded-md border border-amber-500/60 bg-gray-900/95 px-4 py-2.5 text-sm text-amber-200 shadow-lg"
      >
        <span>{MESSAGE_TEXT[message] ?? message}</span>
        <button
          type="button"
          onClick={() => dispatch(setMessage(null))}
          aria-label="Dismiss message"
          className="text-amber-300/80 hover:text-amber-100"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
```

**`ElevationLab.jsx`** (81): import it; the canvas wrapper (62) becomes `<div className="relative min-h-0 flex-1">`,
with `<MessageToast />` as its first child, so it floats over the top of the canvas (plan or elevation) just
under the toolbar.

**`components/ElevationToolbar.jsx`** (226): remove `message,` from the selector (22) and the status `div` at the end
(221–223).

No tests: nothing in the suite renders the toolbar or the lab. **Count stays 669.**

**Done when (round):** `npm test` (669) and `npm run lint` clean.

## Waiting on Kyle

Parts below a run: what "visible" and "flush" do to end panels and fillers, and the 1/8" chip detail. That goes
in the next round once the rule is confirmed.
