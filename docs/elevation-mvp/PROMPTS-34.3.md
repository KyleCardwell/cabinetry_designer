# Elevation Lab — Codex Prompts, Steps 187–190 (round 34.3: follow anchors)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, and commit pending work first, including these docs.

**Every step in this round** (34.3 is done after 190; then round 35):

| Step | What | Tests after |
|---|---|---|
| 187 | Model: the follow anchor — leaders-first resolution, describe, prune, flip, end types, helpers | 636 |
| 188 | Joining to an anchored edge makes a follow (panel, stretch-snap, newly drawn runs) | 640 |
| 189 | Saves accept follow anchors | 641 |
| 190 | Store + UI: offset/free a follow, ⛓ glyph, panel, drag preview | 642 |

**Branch:** `elevation-grid-run-split`. **Baseline is 630 passing** at `822858d` (step 186). Confirm with `npm test` first; if it differs, shift every count below by the difference.

**Expected values were worked out on paper** (SPEC-34.3, top). If a new test fails by a small amount, compare the SPEC's arithmetic with the code before changing the code, and say which was wrong. If an EXISTING test outside the named files breaks, stop and tell me rather than editing it.

**Line numbers** are against `822858d` unless a prompt says otherwise.

---
## Step 187 — The follow anchor (model)

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-34.3.md §1 and §2.
If `git status` shows uncommitted changes, stop and tell me.

Pure model step. A run side can hold { to: 'follow', runId, side, offset }: it sits on another run's edge, one-way. syncRoom resolves runs leaders-first, prunes follows whose leader is gone or on the other wall side, and gives an auto followed end the joint end rule. describeAnchor, cloneRun and flipRunsForWall learn the new anchor. Nothing creates one yet (step 188), so the app behaves as before.

Files (only these; line numbers at 822858d):
- src/elevation/model/joints.js (182) — import wallSideOf from ./wallSides.js; append isFollowAnchor, followLeaders, followersOf, followCreatesCycle, followGlyphs, pruneFollows verbatim from SPEC §2; endIsCovered's joint line (109) and jointEndTypes' condition (127–136) per SPEC §2.
- src/elevation/model/room.js (1521) — joints.js import (14–21) adds followLeaders, isFollowAnchor, pruneFollows; cloneRun (66) copies follow anchors; resolveRunAnchorDatum gets the follow branch before the free return (246); describeAnchor gets the follow branch after the joint branch (262–272); new resolveWallSpans just above syncRoom (503); in syncRoom: 505 also runs pruneFollows, the horizontal pass (523–534) uses resolveWallSpans, the end-type pass lines 590 and 597 include follow anchors; flipFollow above flipRunsForWall and its anchors line (1487). All verbatim from SPEC §2. Edit room.js from the bottom up so these line numbers hold.
- src/elevation/model/index.js — joints.js block (79–86) adds followCreatesCycle, followersOf, followGlyphs, followLeaders, isFollowAnchor, pruneFollows.
- NEW src/elevation/model/__tests__/follow.test.js — verbatim (6 tests).

A wall with no follow anchors must resolve exactly as before: the first batch in resolveWallSpans is every run, resolved against the unresolved wall.

DO NOT touch joinEdges, joinTouchingEdges, stretchRun, moveRun, moveJoint, persistence, the store or any component. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/follow.test.js src/elevation/model/__tests__/joints.test.js src/elevation/model/__tests__/casingAnchors.test.js src/elevation/model/__tests__/wallSides.test.js`. At the end `npm test && npm run lint` once: 630 + 6 = 636. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 187 follow anchors in the model".
```

---
## Step 188 — Joining to an anchored edge makes a follow

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-34.3.md §1 and §3. Step 187 is in.
If `git status` shows uncommitted changes, stop and tell me.

joinEdges no longer refuses a target edge that already has a non-joint anchor: the source side follows it one-way (refused with 'follow-cycle' if the target already follows the source). joinTouchingEdges stops skipping anchored neighbours. stretchRun gets this for free — it already calls joinEdges on a butting snap.

Files (only these; line numbers at 822858d, before step 187's edits shifted room.js — find joinEdges by name):
- src/elevation/model/room.js — joints.js import adds followCreatesCycle; joinEdges from `const targetAnchor` to its end replaced verbatim from SPEC §3 (everything above it unchanged), and its comment; joinTouchingEdges' second filter drops the anchor condition (the sort stays) and its comment.
- src/elevation/model/__tests__/follow.test.js — add joinEdges, joinTouchingEdges, stretchRun, tryPlaceRun to the room.js import; describe('SPEC-34.3 joining to an anchored edge') at the end, verbatim (4 tests).

Every existing joint test must pass unchanged: free edges and existing joints take the same path as before.

DO NOT touch stretchRun, moveRun, moveJoint, joints.js, persistence, the store or any component. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/follow.test.js src/elevation/model/__tests__/joints.test.js src/elevation/model/__tests__/stretchRun.test.js src/elevation/model/__tests__/wallSides.test.js src/elevation/model/__tests__/soffits.test.js`. At the end `npm test && npm run lint` once: 636 + 4 = 640. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 188 joining an anchored edge follows it".
```

---
## Step 189 — Saves

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-34.3.md §4. Steps 187–188 are in.
If `git status` shows uncommitted changes, stop and tell me.

Follow anchors must save and load.

Files (only these):
- src/elevation/store/persistence.js (616) — isRunAnchor (153–168) accepts the follow shape, verbatim from SPEC §4. Nothing else.
- src/elevation/store/__tests__/persistence.test.js — describe('SPEC-34.3 follow anchors') at the end, verbatim (1 test).

DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/store/__tests__/persistence.test.js`. At the end `npm test && npm run lint` once: 640 + 1 = 641. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 189 saves accept follow anchors".
```

---
## Step 190 — Store and UI

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-34.3.md §5. Steps 187–189 are in.
If `git status` shows uncommitted changes, stop and tell me.

The store lets a followed side be offset and freed. The panel shows a follow as the selected run edge with an Offset field; anchored run edges in the list say "· follow". A ⛓ glyph marks each followed side (hover outlines both runs, click frees it). The drag preview moves followers with their leader.

Files (only these; line numbers at 822858d):
- src/elevation/store/elevationSlice.js (1641) — isFollowAnchor in the joints.js import (31); setRunAnchor's joint check (998) also covers a previous follow; setRunJointOffset (1044) accepts 'follow'. Nothing else.
- src/elevation/store/__tests__/elevationSlice.test.js — add joinRunEdges to the slice import; describe('SPEC-34.3 follow reducers') right after describe('joined run reducers') (ends 1371), verbatim.
- src/elevation/components/properties/RunEndsSection.jsx (352) — followAnchor/linkAnchor (after 70); anchorValue (83–91); "· follow" on anchored run-edge options (187–200); the offset block (203–223) shows for linkAnchor.
- src/elevation/components/JointMarkers.jsx — follow glyphs from followGlyphs, reusing the joint glyph markup (SPEC §5); return joint and follow markers together.
- src/elevation/components/RunGroup.jsx (531) — import isFollowAnchor; renderAnchor (223) returns null for a follow side.
- src/elevation/components/ElevationCanvas.jsx (1831) — followersOf in the joints.js import (82); the stretch preview map (1753) includes followersOf(stretchPreview.wall, stretchPreview.runIds). Nothing else in this file.

Match the classes already used in these files. DO NOT touch the model or persistence. DO NOT grep the repo.

While iterating, run only `npx vitest run src/elevation/store/__tests__/elevationSlice.test.js`. At the end `npm test && npm run lint` once: 641 + 1 = 642. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 190 follow anchors in the panel and canvas".
```

**Check after 190 (by hand):**

1. Your window wall: anchor the left tall's right side to the window (casing, 2" clearance) and the right tall's left side to it too.
2. Base under the window: Anchor left → the left tall's "right edge · follow"; Anchor right → the right tall's "left edge · follow". Or draw the base between the talls, or drag its edges onto them — all three should end up the same. The panel reads "Follows Tall … · flush" and a ⛓ sits on each side.
3. Move the window (or change its clearance, or a tall's width): the talls move and the base follows on both sides. While dragging a tall's free edge, the base moves in the preview too.
4. The base's ends: no end where a full-depth tall covers it; an end panel where the tall is shallower, or once you give the side an offset.
5. Hover a ⛓: both runs outline. Click it: the base's side is free again and the tall doesn't move.
6. Select the left tall and set its Anchor right to the base's "left edge · follow": refused with `follow-cycle` (it would loop), and nothing moves.
7. Reload: it all comes back.

**Then round 34.3 is done.** Tell me when 190 is in and anything that still feels off, and I'll write SPEC-35 and PROMPTS-35 (run tops and bottoms, REV-011, vertical joins, `run.outset`).
