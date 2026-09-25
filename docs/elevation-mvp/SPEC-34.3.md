# Elevation Lab — SPEC-34.3 (follow anchors: one-way joins to an anchored edge)

Steps 187–190, a third short fix round before round 35. The earlier SPEC files still apply; this file is the
source of truth for what follows. The repo is at `822858d` (step 186) on `elevation-grid-run-split`, with
**630** tests passing.

Like 34.1 and 34.2, this round was **not** built before it was written; the expected values were worked out
against the code at `822858d`. If a new test fails by a small amount, check the SPEC's arithmetic against the
code before changing the code, and say which was wrong.

| Step | What | Files |
|---|---|---|
| **187** | Model: the `follow` anchor — resolved leaders-first in `syncRoom`, described, pruned, mirrored, given an automatic end type; helpers for followers, loops and glyphs. Nothing creates one yet. | `joints.js`, `room.js`, `index.js`, 1 new test file |
| **188** | Joining to an anchored edge makes a follow instead of refusing: panel, stretch-snap and newly drawn runs. | `room.js`, the same test file |
| **189** | Saves accept follow anchors. | `persistence.js`, its test |
| **190** | Store and UI: offset and free a followed side; link glyph; panel shows the follow; drag preview moves followers. | slice, slice test, `RunEndsSection.jsx`, `JointMarkers.jsx`, `RunGroup.jsx`, `ElevationCanvas.jsx` |

## The problem

A run side holds one anchor. A **joint** is a shared line that any number of run sides can sit on (that's why a
base and an upper can both join one tall), but the joint's position is free — it can't itself be tied to a
window. So on a window wall (tall · base under the window · tall) you can have the talls held off the casing, or
the base joined to the talls, not both. `joinEdges` refuses with `joint-target-anchored`, and snapping the base
to the talls leaves it unjoined, so it doesn't move when the window does and its ends aren't set for it.

## After this round you can

- Anchor each tall to the window (casing + clearance) as now.
- Snap the base's edges to the talls (stretch a side, or draw the base between them), or pick
  "Tall … · right edge" under Anchor → Run edges. Because the tall's edge is already anchored, the base **follows**
  it instead of forming a joint: one-way — the tall doesn't move when the base changes.
- Move the window, change its casing or the clearance, or change a tall's width: the talls move, and the base
  follows on both sides.
- See the followed end set for you like a joined end: no end where the leader covers it, an end panel where it
  doesn't (a shallower or shorter leader, or an offset gap).
- Give a followed side an offset (positive holds it back, negative carries it past), read
  "Follows Tall 13"–37" · flush" in the panel, and free it from the ⛓ glyph or by setting Anchor to Free.

## Not in this round

- Dragging a *free* leader that pushes a follower into a third run isn't refused; the follower shows the
  conflict error instead.
- A leader whose followed side grows through a pinned cabinet isn't followed until the next edit.
- Existing joints aren't converted; free edges still join two-way exactly as now.

---

## §1 Decisions

**The anchor.** `{ to: 'follow', runId, side, offset }` on a run side: that side sits on `runId`'s `side` edge,
plus `offset` (same sign rule as joints: positive holds the follower back, negative carries it past —
`jointEdgeX`). The leader must be a different run on the same wall and wall side. Same-side follows (left edge
on a left edge) are allowed by the model; nothing in the UI goes out of its way to make them.

**Resolution order.** `syncRoom`'s horizontal pass resolves runs in batches: the first batch is every run whose
leaders aren't waiting (for a wall with no follows, that's every run, against the unresolved wall — exactly as
now). Each later batch sees the earlier batches' resolved spans. A loop (A follows B follows A) is never ready;
its runs keep their stored `x`/`width`.

**Prune.** After `pruneJoints`, `pruneFollows` frees any follow whose leader is missing, is the run itself, or
is on the other wall side: anchor → `false`, that end loses `auto`.

**End types.** A followed side with `auto: true` gets the joint rule: `none` when the leader's facing edge is at
the same x and the leader is at least as deep and covers the follower's full height; otherwise `end_panel`.
The leader's own end is never changed (it isn't auto).

**Creating one.** `joinEdges` makes a follow whenever the target edge already has an anchor that isn't a joint
(opening, soffit, wall, corner — or another follow). It refuses with `follow-cycle` if the target already
follows the source (directly or through others). The source's other edge stays where it is (as with joints);
the source end gets `auto: true`; the target is untouched. `joinTouchingEdges` no longer skips anchored
neighbours, and `stretchRun` gets follows for free because it already calls `joinEdges` on a butting snap.

**Moving.** A followed side is an anchored side: no stretch handle, grow-locked in Run geometry, and
`moveRun` refuses the run with `anchored` as it does for any anchor.

---

## §2 Step 187 — the follow anchor (model)

### joints.js (182)
- Import `wallSideOf` from `./wallSides.js`.
- Append:

```js
/** Return whether an anchor makes a run side follow another run's edge (one-way). */
export function isFollowAnchor(anchor) {
  return Boolean(anchor) && anchor.to === 'follow'
    && typeof anchor.runId === 'string'
    && (anchor.side === 'left' || anchor.side === 'right');
}

/** Ids of the runs a run's sides follow. */
export function followLeaders(run) {
  return ['left', 'right']
    .map((side) => run.anchors?.[side])
    .filter(isFollowAnchor)
    .map((anchor) => anchor.runId);
}

/** Ids of every run that follows any of runIds, directly or through another follower. */
export function followersOf(wall, runIds) {
  const found = [];
  const queue = [...runIds];
  while (queue.length > 0) {
    const leaderId = queue.shift();
    for (const run of wall.runs ?? []) {
      if (found.includes(run.id) || runIds.includes(run.id)) continue;
      if (followLeaders(run).includes(leaderId)) {
        found.push(run.id);
        queue.push(run.id);
      }
    }
  }
  return found;
}

/** Whether making sourceRunId follow leaderRunId would close a loop. */
export function followCreatesCycle(wall, sourceRunId, leaderRunId) {
  return leaderRunId === sourceRunId || followersOf(wall, [sourceRunId]).includes(leaderRunId);
}

/** One link glyph per followed side, at the middle of its height overlap with the leader. */
export function followGlyphs(wall) {
  const runs = wall.runs ?? [];
  return runs.flatMap((run) => ['left', 'right'].flatMap((side) => {
    const anchor = run.anchors?.[side];
    if (!isFollowAnchor(anchor)) return [];
    const leader = runs.find((candidate) => candidate.id === anchor.runId);
    if (!leader) return [];
    const bottom = Math.max(run.z, leader.z);
    const top = Math.min(run.z + run.height, leader.z + leader.height);
    return [{
      runId: run.id,
      side,
      leaderRunId: leader.id,
      x: runEdgeX(run, side),
      z: top > bottom ? (bottom + top) / 2 : run.z + run.height / 2,
    }];
  }));
}

/** Free every followed side whose leader is missing, itself, or on the other wall side. */
export function pruneFollows(wall) {
  const runs = wall.runs ?? [];
  const sides = new Map(runs.map((run) => [run.id, wallSideOf(run)]));
  let changed = false;
  const next = runs.map((run) => {
    const dropped = ['left', 'right'].filter((side) => {
      const anchor = run.anchors?.[side];
      return isFollowAnchor(anchor)
        && (anchor.runId === run.id || sides.get(anchor.runId) !== wallSideOf(run));
    });
    if (dropped.length === 0) return run;
    changed = true;
    return {
      ...run,
      anchors: { ...run.anchors, ...Object.fromEntries(dropped.map((side) => [side, false])) },
      ends: {
        ...run.ends,
        ...Object.fromEntries(dropped.map((side) => [side, withoutAuto(run.ends[side])])),
      },
    };
  });
  return changed ? { ...wall, runs: next } : wall;
}
```

- `endIsCovered` (103–124), the filter's joint line (109) becomes:
  ```js
      && (isFollowAnchor(anchor)
        ? candidate.id === anchor.runId
        : candidate.anchors?.[opposite]?.jointId === anchor.jointId)
  ```
- `jointEndTypes` (127–136): the condition becomes
  `isJointAnchor(run.anchors?.[side]) || isFollowAnchor(run.anchors?.[side])`; its comment says
  "anchored to a joint or following a run".

(`runEdgeX`, `withoutAuto` and `JOINT_EPSILON` already exist in joints.js; function declarations are hoisted,
so `isFollowAnchor` can be appended after `endIsCovered`.)

### room.js (1521)
- The joints.js import (14–21) adds `followLeaders`, `isFollowAnchor`, `pruneFollows`.
- `cloneRun` (66): `anchor?.to === 'joint' || anchor?.to === 'follow' ? { ...anchor } : anchor,`
- `resolveRunAnchorDatum` (211–247): before the final `return { x: … type: 'free' }` (246):
  ```js
  if (isFollowAnchor(anchor)) {
    const leader = wall.runs.find((candidate) => candidate.id === anchor.runId);
    if (!leader) return { error: { code: 'anchor-run-missing', side } };
    const edge = anchor.side === 'left' ? leader.x : leader.x + leader.width;
    return { x: jointEdgeX({ x: edge }, side, anchor.offset), type: 'follow', runId: anchor.runId };
  }
  ```
- `describeAnchor` (251–): after the joint branch (262–272):
  ```js
  if (isFollowAnchor(anchor)) {
    const leader = wall.runs.find((candidate) => candidate.id === anchor.runId);
    const offset = anchor.offset ?? 0;
    const relation = offset > 0
      ? `${formatInches(offset)} gap`
      : offset < 0 ? `${formatInches(Math.abs(offset))} past` : 'flush';
    return `Follows ${leader ? runShortLabel(leader) : 'a missing run'} · ${relation}`;
  }
  ```
- New helper just above `syncRoom` (503):
  ```js
  /** Resolve every run's span, leaders before the runs that follow them. */
  function resolveWallSpans(room, wall, settings) {
    const resolved = new Map();
    let pending = wall.runs;
    while (pending.length > 0) {
      const waiting = new Set(pending.map((run) => run.id));
      const ready = pending.filter((run) => (
        followLeaders(run).every((leaderId) => !waiting.has(leaderId))
      ));
      if (ready.length === 0) break;
      const view = { ...wall, runs: wall.runs.map((run) => resolved.get(run.id) ?? run) };
      for (const run of ready) {
        const horizontal = horizontalResolution(room, view, run, settings);
        resolved.set(run.id, { ...run, x: horizontal.x, width: horizontal.width });
      }
      pending = pending.filter((run) => !resolved.has(run.id));
    }
    return wall.runs.map((run) => resolved.get(run.id) ?? run);
  }
  ```
- `syncRoom`:
  - 505: `nextRoom.walls = nextRoom.walls.map((wall) => pruneFollows(pruneJoints(wall)));`
  - the horizontal pass (523–534) becomes
    `walls: nextRoom.walls.map((wall) => ({ ...wall, runs: resolveWallSpans(nextRoom, wall, settings) })),`
  - the end-type pass: 590 becomes `if ((isJointAnchor(anchor) || isFollowAnchor(anchor)) && end.auto === true) {`;
    597 becomes `if (!isJointAnchor(anchor) && !isFollowAnchor(anchor) && end.auto === true) {`.
- `flipRunsForWall` (1473–): the anchors line (1487) becomes
  `anchors: { left: flipFollow(run.anchors.right), right: flipFollow(run.anchors.left) },` with, just above
  the function:
  ```js
  function flipFollow(anchor) {
    return isFollowAnchor(anchor)
      ? { ...anchor, side: anchor.side === 'left' ? 'right' : 'left' }
      : anchor;
  }
  ```

### index.js
The joints.js block (79–86) adds `followCreatesCycle`, `followersOf`, `followGlyphs`, `followLeaders`,
`isFollowAnchor`, `pruneFollows`.

### Tests — NEW `src/elevation/model/__tests__/follow.test.js` (6)

```js
import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { followCreatesCycle, followersOf, followGlyphs } from '../joints.js';
import { describeAnchor, flipRunsForWall, syncRoom } from '../room.js';

const S = DEFAULT_SETTINGS;
const NONE = { type: 'none', width: null };
const AUTO = { type: 'none', width: null, auto: true };
const casing = () => ({ to: 'opening', openingId: 'window-1', edge: 'casing', clearance: 2 });
const follow = (runId, side, offset = 0) => ({ to: 'follow', runId, side, offset });

function makeRun(id, overrides = {}) {
  return {
    id, cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 0, width: 24, z: 4, height: 30.5, depth: 24,
    ends: { left: { ...NONE }, right: { ...NONE } },
    autoCount: false, maxCabinetWidth: null,
    items: [{ id: `${id}-cabinet`, kind: 'cabinet', width: null }],
    heightMode: 'manual', overrides: {}, anchors: { left: false, right: false },
    ...overrides,
  };
}

/** 120" wall; window jamb 42–78, casing 39–81. TA's right and TB's left sit 2" off the casing; B follows both. */
function makeRoom(baseOverrides = {}) {
  return {
    id: 'room', name: 'Room', profile: { ...S.defaultProfile }, wallOrder: ['A'],
    walls: [{
      id: 'A', name: '', numberOverride: null, x1: 0, y1: 0, x2: 120, y2: 0,
      height: 96, thickness: 4.5, flipped: false,
      connections: { start: null, end: null }, profile: {},
      openings: [{
        id: 'window-1', kind: 'window', label: 'W1', measureMode: 'jamb',
        width: 36, height: 48, sillZ: 36, offset: 42, offsetFrom: 'right',
        offsetAnchor: 'edge', casing: { width: 3, thickness: 0.75 },
      }],
      runs: [
        makeRun('B', {
          x: 0, width: 10,
          ends: { left: { ...AUTO }, right: { ...AUTO } },
          anchors: { left: follow('TA', 'right'), right: follow('TB', 'left') },
          ...baseOverrides,
        }),
        makeRun('TA', {
          cabinetTypeId: CABINET_TYPE_IDS.TALL, x: 13, height: 80,
          anchors: { left: false, right: casing() },
        }),
        makeRun('TB', {
          cabinetTypeId: CABINET_TYPE_IDS.TALL, x: 83, height: 80, depth: 12,
          anchors: { left: casing(), right: false },
        }),
      ],
    }],
  };
}

const runOf = (room, id) => room.walls[0].runs.find((run) => run.id === id);

describe('SPEC-34.3 follow anchors', () => {
  it('resolves a follower after its leaders and follows a moved window', () => {
    const synced = syncRoom(makeRoom(), S);
    expect(runOf(synced, 'TA')).toMatchObject({ x: 13, width: 24 });
    expect(runOf(synced, 'TB')).toMatchObject({ x: 83, width: 24 });
    expect(runOf(synced, 'B')).toMatchObject({ x: 37, width: 46 });
    expect(runOf(synced, 'B').ends).toEqual({
      left: { type: 'none', width: null, auto: true },
      right: { type: 'end_panel', width: null, auto: true },
    });

    const moved = makeRoom();
    moved.walls[0].openings[0].offset = 36;
    const resynced = syncRoom(moved, S);
    expect(runOf(resynced, 'TA')).toMatchObject({ x: 19, width: 24 });
    expect(runOf(resynced, 'TB')).toMatchObject({ x: 89, width: 24 });
    expect(runOf(resynced, 'B')).toMatchObject({ x: 43, width: 46 });
  });

  it('offsets a followed edge and describes it', () => {
    const synced = syncRoom(makeRoom({
      anchors: { left: follow('TA', 'right', 1), right: follow('TB', 'left') },
    }), S);
    const base = runOf(synced, 'B');
    expect(base).toMatchObject({ x: 38, width: 45 });
    expect(base.ends.left).toEqual({ type: 'end_panel', width: null, auto: true });
    expect(describeAnchor(synced, synced.walls[0], base, 'left', S))
      .toBe('Follows Tall 13"–37" · 1" gap');
    expect(describeAnchor(synced, synced.walls[0], base, 'right', S))
      .toBe('Follows Tall 83"–107" · flush');
  });

  it('frees a side whose leader is gone or on the other wall side', () => {
    const gone = makeRoom();
    gone.walls[0].runs = gone.walls[0].runs.filter((run) => run.id !== 'TA');
    const base = runOf(syncRoom(gone, S), 'B');
    expect(base.anchors.left).toBe(false);
    expect(base.ends.left).toEqual({ type: 'none', width: null });
    expect(base.anchors.right).toEqual(follow('TB', 'left'));

    const back = makeRoom();
    runOf(back, 'TB').wallSide = 'back';
    expect(runOf(syncRoom(back, S), 'B').anchors.right).toBe(false);
  });

  it('leaves a follow loop where it was stored', () => {
    const loop = makeRoom();
    loop.walls[0].runs = [
      makeRun('P', { x: 0, width: 20, anchors: { left: false, right: follow('Q', 'left') } }),
      makeRun('Q', { x: 30, width: 20, anchors: { left: follow('P', 'right'), right: false } }),
    ];
    const synced = syncRoom(loop, S);
    expect(runOf(synced, 'P')).toMatchObject({ x: 0, width: 20 });
    expect(runOf(synced, 'Q')).toMatchObject({ x: 30, width: 20 });

    const wall = syncRoom(makeRoom(), S).walls[0];
    expect(followCreatesCycle(wall, 'B', 'TA')).toBe(false);
    expect(followCreatesCycle(wall, 'TA', 'B')).toBe(true);
    expect(followCreatesCycle(wall, 'TA', 'TA')).toBe(true);
  });

  it('lists followers and link glyphs', () => {
    const wall = syncRoom(makeRoom(), S).walls[0];
    expect(followersOf(wall, ['TA'])).toEqual(['B']);
    expect(followersOf(wall, ['B'])).toEqual([]);
    expect(followGlyphs(wall)).toEqual([
      { runId: 'B', side: 'left', leaderRunId: 'TA', x: 37, z: 19.25 },
      { runId: 'B', side: 'right', leaderRunId: 'TB', x: 83, z: 19.25 },
    ]);
  });

  it('mirrors followed sides when the wall flips', () => {
    const room = makeRoom();
    room.walls[0] = flipRunsForWall(room.walls[0]);
    expect(runOf(room, 'B').anchors).toEqual({
      left: follow('TB', 'right'),
      right: follow('TA', 'left'),
    });
    const synced = syncRoom(room, S);
    expect(runOf(synced, 'TA')).toMatchObject({ x: 83, width: 24 });
    expect(runOf(synced, 'TB')).toMatchObject({ x: 13, width: 24 });
    expect(runOf(synced, 'B')).toMatchObject({ x: 37, width: 46 });
  });
});
```

Working:
- Window: offset 42 from the right of 120, jamb 36 → jamb 42–78; casing 3 → 39–81. TA's right = 39 − 2 = 37,
  width 24 kept → x 13. TB's left = 81 + 2 = 83 → 83–107. B: left 37, right 83 → width 46.
- B's left end: TA's right edge is at 37, TA is 24 deep (≥ 24) and covers z 4–84 ⊇ 4–34.5 → `none`. Right end:
  TB is 12 deep → not covered → `end_panel`.
- Moved (offset 36): jamb 48–84, casing 45–87 → TA's right 43 (x 19), TB's left 89, B 43–89.
- Offset 1: B's left = 37 + 1 = 38 → width 45; 38 ≠ 37 so the left end is `end_panel`.
- Gone: TA missing → B's left freed, its end loses `auto`.
- Glyph z: B spans 4–34.5, both talls 4–84 → overlap 4–34.5 → 19.25.
- Flip: the window is centred (42 from either end), so it stays at 42–78. TA's opening anchor moves to its left
  (x = 81 + 2 = 83), TB's to its right (right edge 37 → x 13); B's left follows TB's right (37), its right
  follows TA's left (83).
- The loop: P waits for Q and Q for P, so neither is ever ready; both keep their stored spans.

**Count:** 630 + 6 = **636**.

---

## §3 Step 188 — joining to an anchored edge makes a follow

### room.js
- The joints.js import adds `followCreatesCycle`.
- `joinEdges` (732–797): replace the comment and the body from `const targetAnchor` (753) to the end with:

```js
/** Join one run edge to another edge or its joint; an already-anchored target edge is followed one-way. */
```
```js
  const targetAnchor = targetRun.anchors?.[target.side];
  const follow = Boolean(targetAnchor) && !isJointAnchor(targetAnchor);
  if (follow && followCreatesCycle(sourceWall, source.runId, target.runId)) {
    return { ok: false, reason: 'follow-cycle', room };
  }

  const jointId = follow ? null : isJointAnchor(targetAnchor) ? targetAnchor.jointId : uuid();
  const otherSide = source.side === 'left' ? 'right' : 'left';
  if (!follow && sourceRun.anchors?.[otherSide]?.jointId === jointId) {
    return { ok: false, reason: 'joint-same-run', room };
  }
  const jointX = isJointAnchor(targetAnchor)
    ? sourceWall.joints.find((joint) => joint.id === jointId)?.x
    : runEdgeX(targetRun, target.side);
  if (!Number.isFinite(jointX)) {
    return { ok: false, reason: 'run-not-found', room };
  }

  const temporary = cloneRoom(resolvedRoom);
  const wall = temporary.walls.find((candidate) => candidate.id === wallId);
  const mutableSource = wall.runs.find((run) => run.id === source.runId);
  const mutableTarget = wall.runs.find((run) => run.id === target.runId);
  if (!follow && !isJointAnchor(targetAnchor)) {
    wall.joints ??= [];
    wall.joints.push({ id: jointId, x: jointX, wallSide: wallSideOf(sourceRun) });
    mutableTarget.anchors[target.side] = { to: 'joint', jointId, offset: 0 };
  }
  const otherEdge = runEdgeX(mutableSource, otherSide);
  mutableSource.x = source.side === 'left' ? jointX : otherEdge;
  mutableSource.width = source.side === 'left' ? otherEdge - jointX : jointX - otherEdge;
  mutableSource.anchors[source.side] = follow
    ? { to: 'follow', runId: target.runId, side: target.side, offset: 0 }
    : { to: 'joint', jointId, offset: 0 };
  mutableSource.ends[source.side] = { ...mutableSource.ends[source.side], auto: true };
  if (!follow) {
    mutableTarget.ends[target.side] = { ...mutableTarget.ends[target.side], auto: true };
  }

  const synced = syncRoom(temporary, settings);
  const resolvedWall = synced.walls.find((candidate) => candidate.id === wallId);
  const resolvedSource = resolvedWall.runs.find((run) => run.id === source.runId);
  const validation = validateRunPlacement(
    { ...resolvedWall, length: wallLength(resolvedWall) },
    resolvedSource,
    settings,
  );
  return validation.ok
    ? { ok: true, reason: null, room: synced, ...(follow ? { follow: true } : {}) }
    : { ok: false, reason: validation.reason, room };
}
```

  Everything above `const targetAnchor` (the side, same-run, run-found and wall-side checks) is unchanged.
  `joint-target-anchored` is no longer returned anywhere.
- `joinTouchingEdges` (800–842): the second filter (821–824) drops the anchor condition:
  ```js
      .filter(({ run: candidate }) => (
        Math.abs(runEdgeX(candidate, opposite) - edge) <= JOIN_EDGE_TOLERANCE
      ))
  ```
  The sort (825) stays: an existing joint is still preferred. Its comment becomes "Join or follow both touching
  sides of a newly placed run, preferring existing joints."
- `stretchRun` needs no change: its butting-snap branch (1209–1227) already calls `joinEdges`.

### Tests — `follow.test.js`: add `joinEdges, joinTouchingEdges, stretchRun, tryPlaceRun` to the room.js import; a describe at the end (4)

```js
describe('SPEC-34.3 joining to an anchored edge', () => {
  const free = () => makeRoom({
    x: 40, width: 40,
    ends: { left: { ...NONE }, right: { ...NONE } },
    anchors: { left: false, right: false },
  });

  it('follows an anchored edge instead of refusing the join', () => {
    const result = joinEdges(free(), 'A', { runId: 'B', side: 'left' }, { runId: 'TA', side: 'right' }, S);
    expect(result).toMatchObject({ ok: true, follow: true });
    const base = runOf(result.room, 'B');
    expect(base).toMatchObject({ x: 37, width: 43 });
    expect(base.anchors.left).toEqual(follow('TA', 'right'));
    expect(base.ends.left).toEqual({ type: 'none', width: null, auto: true });
    expect(runOf(result.room, 'TA').anchors.right).toEqual(casing());
    expect(result.room.walls[0].joints).toEqual([]);
  });

  it('refuses a follow that would loop', () => {
    const first = joinEdges(free(), 'A', { runId: 'B', side: 'left' }, { runId: 'TA', side: 'right' }, S);
    expect(joinEdges(first.room, 'A', { runId: 'TA', side: 'right' }, { runId: 'B', side: 'left' }, S))
      .toMatchObject({ ok: false, reason: 'follow-cycle' });
  });

  it('follows when a stretch snaps to an anchored edge', () => {
    const result = stretchRun(free(), 'A', 'B', 'left', 38, S);
    expect(result).toMatchObject({ ok: true, joined: { runId: 'TA', side: 'right' } });
    const base = runOf(result.room, 'B');
    expect(base).toMatchObject({ x: 37, width: 43 });
    expect(base.anchors.left).toEqual(follow('TA', 'right'));
  });

  it('follows both anchored neighbours of a newly drawn run', () => {
    const room = makeRoom();
    room.walls[0].runs = room.walls[0].runs.filter((run) => run.id !== 'B');
    const placed = tryPlaceRun(room, 'A', makeRun('B', { x: 37, width: 46 }), S);
    expect(placed.ok).toBe(true);
    const result = joinTouchingEdges(placed.room, 'A', 'B', S);
    expect(result.ok).toBe(true);
    expect(result.joined).toEqual([{ runId: 'TA', side: 'right' }, { runId: 'TB', side: 'left' }]);
    expect(runOf(result.room, 'B').anchors).toEqual({
      left: follow('TA', 'right'),
      right: follow('TB', 'left'),
    });
    result.room.walls[0].openings[0].offset = 36;
    expect(runOf(syncRoom(result.room, S), 'B')).toMatchObject({ x: 43, width: 46 });
  });
});
```

Working: `free()` has B at 40–80 with no anchors. Joining its left to TA's right (37) keeps its right edge at 80
→ 37–80, width 43. The stretch: 38 rounds to 38, the nearest candidate within 2" is TA's right edge (37), so the
edge snaps there and the butting-edge branch calls `joinEdges`, which now follows. The loop: after the first
join B follows TA, so TA following B is refused.

Existing joint tests keep passing: every one of them joins free edges or existing joints, and those paths are
unchanged.

**Count:** 636 + 4 = **640**.

---

## §4 Step 189 — saves

**`persistence.js`** (616): `isRunAnchor` (153–168) accepts a fifth shape, after the soffit one:

```js
    || (anchor.to === 'follow'
      && typeof anchor.runId === 'string'
      && (anchor.side === 'left' || anchor.side === 'right')
      && (anchor.offset === null || isFiniteNumber(anchor.offset)))
```

The normalizer (493–500) needs nothing: a follow whose leader is gone is freed by `syncRoom` on load.

**`persistence.test.js`** — a describe at the end:

```js
describe('SPEC-34.3 follow anchors', () => {
  it('saves a followed side and rejects bad ones', () => {
    const withAnchor = (anchor) => {
      const document = currentDocument();
      document.rooms[0].walls[0].runs[0].anchors.left = anchor;
      return document;
    };
    expect(isElevationDocument(withAnchor({ to: 'follow', runId: 'x', side: 'right', offset: 0 }))).toBe(true);
    expect(isElevationDocument(withAnchor({ to: 'follow', runId: 'x', side: 'left', offset: -1.5 }))).toBe(true);
    expect(isElevationDocument(withAnchor({ to: 'follow', runId: 'x', side: 'up', offset: 0 }))).toBe(false);
    expect(isElevationDocument(withAnchor({ to: 'follow', side: 'right', offset: 0 }))).toBe(false);
  });
});
```

**Count:** 640 + 1 = **641**.

---

## §5 Step 190 — store and UI

**`elevationSlice.js`** (1641):
- The joints.js import (31) adds `isFollowAnchor`.
- `setRunAnchor` (998): `const previous = location.run.anchors[side];` and the condition becomes
  `if ((isJointAnchor(previous) || isFollowAnchor(previous)) && !isJointAnchor(value)) {` — freeing a followed
  side drops its `auto`.
- `setRunJointOffset` (1044): `… || !anchor || (anchor.to !== 'joint' && anchor.to !== 'follow')) return;`

**`elevationSlice.test.js`** — add `joinRunEdges` to the slice import (`setRunAnchor` and `setRunJointOffset`
are already there); a describe after `describe('joined run reducers')` (ends 1371):

```js
describe('SPEC-34.3 follow reducers', () => {
  function followState() {
    const state = stateWithRun();
    const wall = state.rooms[0].walls[0];
    wall.openings = [opening({
      id: 'window-1', kind: 'window', label: 'W1', height: 48, sillZ: 36, offset: 42,
    })];
    wall.runs = [
      run({
        id: 'TA', cabinetTypeId: CABINET_TYPE_IDS.TALL, x: 13, width: 24, height: 80,
        ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
        autoCount: false, items: [auto('TA-cabinet')],
        anchors: {
          left: false,
          right: { to: 'opening', openingId: 'window-1', edge: 'casing', clearance: 2 },
        },
      }),
      run({
        id: 'B', x: 37, width: 30,
        ends: { left: { type: 'none', width: null }, right: { type: 'none', width: null } },
        autoCount: false, items: [auto('B-cabinet')],
      }),
    ];
    return state;
  }
  const baseOf = (state) => state.rooms[0].walls[0].runs.find((entry) => entry.id === 'B');

  it('joins to an anchored edge as a follow, offsets it and frees it', () => {
    let state = elevationReducer(followState(), joinRunEdges({
      wallId: 'wall-1', runId: 'B', side: 'left', targetRunId: 'TA', targetSide: 'right',
    }));
    expect(state.message).toBeNull();
    expect(baseOf(state).anchors.left).toEqual({ to: 'follow', runId: 'TA', side: 'right', offset: 0 });
    expect(baseOf(state).ends.left).toEqual({ type: 'none', width: null, auto: true });

    state = elevationReducer(state, setRunJointOffset({
      wallId: 'wall-1', runId: 'B', side: 'left', offset: 1,
    }));
    expect(baseOf(state)).toMatchObject({ x: 38, width: 30 });

    state = elevationReducer(state, setRunAnchor({
      wallId: 'wall-1', runId: 'B', side: 'left', anchor: false,
    }));
    expect(baseOf(state).anchors.left).toBe(false);
    expect(baseOf(state).ends.left).toEqual({ type: 'end_panel', width: null });
  });
});
```

Working: the `opening()` helper measures 42 from the left (jamb 42–78, casing 39–81), so TA's right is 37.
B is 37–67; joining keeps it there. Offset 1 with only the left side anchored slides B to 38–68 (width kept),
and the gap makes its left end `end_panel` (auto). Freeing drops `auto`, keeping `end_panel`.

**`RunEndsSection.jsx`** (352):
- Import `isFollowAnchor` from `'../../model/index.js'`.
- After `jointAnchor` (70): `const followAnchor = isFollowAnchor(anchor) ? anchor : null;` and
  `const linkAnchor = jointAnchor ?? followAnchor;`
- `anchorValue` (83–91): before the `otherJointMember` branch,
  ``: followAnchor ? `joint:${followAnchor.runId}:${followAnchor.side}` ``.
- The "Run edges" options (187–200): append `' · follow'` to the label when the candidate side has an anchor
  that isn't a joint (`candidate.anchors?.[targetSide] && !isJointAnchor(candidate.anchors[targetSide])`).
- The offset block (203–223) shows for `linkAnchor` (value `linkAnchor.offset`); nothing else in it changes —
  `setRunJointOffset` now accepts follows, and `anchorDescription` already reads "Follows …".

**`JointMarkers.jsx`** (~175): render the joints as now, plus one glyph per `followGlyphs(wall)` entry
(import it from `'../model/joints.js'`), returning `[...jointMarkers, ...followMarkers]`. Each follow glyph
reuses the joint glyph's markup (the ⛓ `Text`, the hit `Rect`, the hover `Label`) at `{ x: glyph.x, z: glyph.z }`,
with `glyphId = \`follow:${glyph.runId}:${glyph.side}\``; hovering outlines the follower and the leader (as the
joint hover does); the tooltip is `Follows the ${leaderType} — click to free the ${followerType}` (types from
`runShortLabel(run).split(' ')[0]`); click → `onUnjoin(glyph.runId, glyph.side)`. No drag handle.

**`RunGroup.jsx`** (531): import `isFollowAnchor`; `renderAnchor` (223) also returns null for a follow side (the
⛓ glyph marks it). The stretch handle stays hidden for it (274 already hides anchored sides).

**`ElevationCanvas.jsx`** (1831): add `followersOf` to the joints.js import (82); the stretch preview (1753)
maps over `[...stretchPreview.runIds, ...followersOf(stretchPreview.wall, stretchPreview.runIds)]`, so
followers move with a dragged leader or joint.

**Count:** 641 + 1 = **642**.

**Done when (round):** `npm test` (642) and `npm run lint` clean; walls without follows behave exactly as now.

## Open after this round

1. Refusing a leader drag that would push a follower into a third run (today the follower shows the error).
2. Carried from 34.2: top/bottom panels in plan; floating shelf thickness; reveal under a flush top panel.
