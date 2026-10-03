# Elevation Lab — Codex Prompts, Steps 238–243 (round 36.3: face frame options, plan clearances)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session. Commit pending work first, including these docs (`CELLS-PLAN.md`, `SPEC-36.3.md`, this file).

| Step | What | Tests after |
|---|---|---|
| 238 | Shape: `noRail` (a list of seams) on a face group, `hanging` on a run, `setSeamNoRail` and seam upkeep, persistence, `setRunFaceOptions` | 715 |
| 239 | Model: faces on either side of a no-rail seam share one frame opening; the frame loses those rails | 721 |
| 240 | Model: a hanging base's frame drops 3/4" below its box | 724 |
| 241 | Screen: one "No rail between" tick per seam of a face group; "Hanging" tick on a base run | 724 |
| 242 | Model: plan clearances (islands, facing-run aisles), new pure file | 729 |
| 243 | Screen: clearances drawn in plan view | 729 |

**Branch:** `elevation-grid-run-split`. The baseline after step 237 is **711**. Confirm it with `npm test`; if it differs, shift the counts.

**Line numbers** are against `e07dd7f` (step 237). Where earlier steps have moved things, find functions by name.

Copy code blocks exactly, including string values and numbers. The SPEC's numbers were checked in a scratch copy, but Vitest couldn't run there. If a new test fails by a small amount, compare the SPEC's arithmetic with the code before changing the code, and say which was wrong. If an EXISTING test outside the named files breaks, stop and tell me rather than editing it.

---
## Step 238 — Shape

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-36.3.md §1 and §2. Step 237 is in.
If `git status` shows uncommitted changes, stop and tell me.

Shape step, no behavior change. A face group may carry `noRail`: a sorted list of seams with no rail or mullion (seam i is between sections i and i + 1, and both must be leaves), so any combination of seams is allowed. A run may carry `hanging: true`. Nothing reads either yet.
- faces.js: isSeamList; isFaceNode validates noRail.
- faceTree.js: withSeams and withoutSeams; splitFace, makeDrawerStack, setGroupCount and removeFace keep the seams with their sections; new setSeamNoRail.
- persistence.js: run.hanging validation.
- elevationSlice.js: setRunFaceOptions stores or deletes `hanging`.

Files (only these):
- src/elevation/model/faces.js (179) — isSeamList before isFaceNode, and the two isFaceNode edits, verbatim.
- src/elevation/model/faceTree.js (135) — the SPEC edits verbatim: the two helpers, the splitFace / makeDrawerStack / setGroupCount / removeFace replacements, and setSeamNoRail at the end.
- src/elevation/model/index.js — setSeamNoRail in the faceTree export block (23–36).
- src/elevation/store/persistence.js (652) — the one line after run.upperBottom (233).
- src/elevation/store/elevationSlice.js (1762) — setRunFaceOptions (1554–1564) only, the hanging block before syncRoomAt.
- src/elevation/model/__tests__/noRailSeams.test.js — NEW, verbatim (3 tests).
- src/elevation/store/__tests__/elevationSlice.test.js — test 47b inside its existing describe (+1). The helpers are describe-scoped, so it must sit there.
- src/elevation/store/__tests__/persistence.test.js — the SPEC's edits to the existing tests, verbatim.

DO NOT touch any component, styles.js, frames.js or profile.js. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/noRailSeams.test.js src/elevation/model/__tests__/faces.test.js src/elevation/model/__tests__/faceTree.test.js src/elevation/store/__tests__/elevationSlice.test.js src/elevation/store/__tests__/persistence.test.js`. At the end, run `npm test && npm run lint` once: 711 + 4 = 715. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 238 noRail seams and hanging shape".
```

---
## Step 239 — Model: no rail between

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-36.3.md §1 and §3. Step 238 is in.
If `git status` shows uncommitted changes, stop and tell me.

Pure model step. On a face frame cabinet, the faces on either side of a seam listed in a group's `noRail` share one frame opening: they butt with a gap of 0 (square edge) or 1/16" (profiled edge), and the frame loses that rail or mullion. Any combination of seams works (the bottom two drawers only, two pairs in a stack, …). A European cabinet ignores the list.
- constants.js: profiledFit.sharedGap 0.0625.
- styles.js: styleReveals gets a `shared` key (profiled gap, else 0).
- faces.js: the new `place` verbatim.
- frames.js: the new faceOpenings verbatim.

Files (only these):
- src/elevation/model/constants.js (129) — line 87 only.
- src/elevation/model/styles.js (266) — the `shared:` line after pairFit (111) and the doc comment sentence.
- src/elevation/model/faces.js — replace `place` (82–133) with the SPEC block verbatim (`shared`, `placeLeaf`, `place`), and the doc comment line.
- src/elevation/model/frames.js (352) — the SPEC's faceOpenings, verbatim.
- src/elevation/model/__tests__/noRail.test.js — NEW, verbatim (6 tests).

DO NOT touch any component, the store, profile.js or persistence. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/noRail.test.js src/elevation/model/__tests__/faces.test.js src/elevation/model/__tests__/frameParts.test.js`. At the end, run `npm test && npm run lint` once: 715 + 6 = 721. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 239 no rail seams, shared frame openings".
```

---
## Step 240 — Model: hanging base

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-36.3.md §1 and §4. Step 239 is in.
If `git status` shows uncommitted changes, stop and tell me.

Pure model step. A base run with `hanging: true` in an inset room has a frame that drops 3/4" below its box: the box starts 3/4" higher and is 3/4" shorter (top and counter unchanged), the frame region keeps its bottom at the toe kick, and the bottom reveal is 3/4" (`rule:hanging`). Uppers, talls and European are unchanged.
- styles.js: `frameDrop(run, settings)`, `panelDrop`, `runFrame`, the `rule:hanging` reveal.
- frames.js: uses frameDrop; the `frame` const and the CABINET_TYPE_IDS import go.
- profile.js: the base branch uses `run._frame.drop`.

Files (only these):
- src/elevation/model/styles.js — line 6, REVEAL_SOURCE_LABELS, and the SPEC's new functions and reveal edits, verbatim.
- src/elevation/model/frames.js — imports (3, 6), delete line 65, replace the drop block (140–145), verbatim.
- src/elevation/model/profile.js (102) — the base branch (59–61), verbatim.
- src/elevation/model/__tests__/hanging.test.js — NEW, verbatim (3 tests).

DO NOT touch any component or the store. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/hanging.test.js src/elevation/model/__tests__/noRail.test.js src/elevation/model/__tests__/frameParts.test.js src/elevation/model/__tests__/faces.test.js`. At the end, run `npm test && npm run lint` once: 721 + 3 = 724. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 240 hanging base drop".
```

---
## Step 241 — Screen: the two ticks

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-36.3.md §5. Step 240 is in.
If `git status` shows uncommitted changes, stop and tell me.

- FaceProperties.jsx: a selected group shows one checkbox per seam between two leaves, "No rail between 1 and 2" ("No mullion…" for a side-by-side group), only in an inset style, each wired to setSeamNoRail. groupLabel is replaced.
- RunFaceOptions.jsx: a base run in an inset style shows "Hanging (bottom rail hangs below the box)", wired to setRunFaceOptions({ hanging }).

Files (only these):
- src/elevation/components/properties/FaceProperties.jsx (330) — the model import (3–23), groupLabel (32–41), and the per-seam checkbox block, verbatim.
- src/elevation/components/properties/RunFaceOptions.jsx (68) — the model import and the checkbox block after the Top label, verbatim.

DO NOT touch the model or the store. DO NOT grep the repo or open other files.

No new tests. At the end, run `npm test && npm run lint` once: still 724. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 241 no rail seam ticks and hanging tick".
```

---
## Step 242 — Model: plan clearances

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-36.3.md §1 and §6. Step 241 is in.
If `git status` shows uncommitted changes, stop and tell me.

New pure file. planClearances(room, settings) returns dimension lines in plan: an island's gap to each room wall or run it faces, and the aisle between two facing runs. Only parallel, facing, exposed edges are measured; uppers are ignored; angled edges get none; duplicates are removed.

Files (only these):
- src/elevation/model/clearances.js — NEW, the whole file verbatim.
- src/elevation/model/__tests__/clearances.test.js — NEW, verbatim (5 tests).

DO NOT edit any existing file, including index.js: the screen step imports clearances.js directly. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/clearances.test.js`. At the end, run `npm test && npm run lint` once: 724 + 5 = 729. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 242 plan clearances model".
```

---
## Step 243 — Screen: clearances in plan view

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-36.3.md §7. Step 242 is in.
If `git status` shows uncommitted changes, stop and tell me.

Draws planClearances on the plan: teal (#5eead4) dimension lines with end ticks and a rotated label, not listening, so nothing gets in the way of clicks.

Files (only these):
- src/elevation/plan/PlanClearances.jsx — NEW, verbatim.
- src/elevation/plan/PlanCanvas.jsx (1245) — the two imports (after 37 and after 78), the clearances memo after the collisionMessages memo (135), and the one JSX line before the soffits block (1064). Nothing else.

DO NOT touch the model or the store. DO NOT grep the repo or open other files.

No new tests. At the end, run `npm test && npm run lint` once: still 729. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 243 clearances in plan view".
```

**Check after 243 (by hand):**

1. **No rail between, any combination.** In an inset room, select a drawer stack of three.
   - Ticks appear for "No rail between 1 and 2" and "No rail between 2 and 3". Tick only the second: the bottom two fronts grow to 8 2/3", share one opening (no rail between them), and the top front keeps its rail. The frame and the wall chain show two openings.
   - Tick both: all three fronts are 9 1/6" (square edge) and share one opening. With a profiled edge the gaps are 1/16" and the fronts 9 1/16".
   - Make a stack of four and tick 1–2 and 3–4: two pairs, a rail between them.
   - Try a side-by-side split: the ticks say "No mullion…".
   - In a European room the ticks are hidden and nothing changes.
   - Split a front across, or turn it into a drawer stack: the seams beside it clear. Add sections or remove one: the ticks follow their sections.
2. **Hanging base.** On a base run in an inset room, tick "Hanging".
   - The box grows 3/4" higher and 3/4" shorter; the frame's bottom stays at 4"; the wall end panels drop with it.
   - The counter and any uppers don't move.
   - The tick is hidden on uppers, talls, and European runs. Untick it and everything returns.
3. **Island clearances.** In a closed room with an island, plan view shows four teal dimensions around the island (34 3/8" on one side, then 71 3/16", 72", 72"). The aisle between two facing runs shows once, not twice.
4. **Galley.** Two facing runs show one aisle dimension (70 3/8" on the standard fixture).
5. **Uppers and angles.** Uppers change none of the dimensions. An island with no run across from it shows only the wall it faces (59 3/16" on the standard fixture).
6. **L and C rooms.** The L's inside corner and the C's pocket show dimensions along their straight exposed edges only.
