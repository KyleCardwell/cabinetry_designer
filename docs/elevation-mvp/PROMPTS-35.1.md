# Elevation Lab — Codex Prompts, Steps 202–203 (round 35.1: drawing into a stack gap, select-before-move, message toast)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, and commit pending work first, including these docs.

| Step | What | Tests after |
|---|---|---|
| 202 | Draw into the gap between two runs (snap + stack); run-dimension click selects before it moves | 669 |
| 203 | Messages in a toast under the toolbar, in words | 669 |

**Branch:** `elevation-grid-run-split`. **Run step 201 first.** Baseline is then **667**. Confirm with `npm test`; if it differs, shift the counts by the difference.

**Line numbers** are against `865c459` (step 200). Step 201 edits room.js, so find functions there by name.

If a new test fails by a small amount, compare the SPEC's arithmetic with the code before changing the code, and say which was wrong. If an EXISTING test outside the named files breaks, stop and tell me rather than editing it.

---
## Step 202 — Draw into a stack gap; select before move

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-35.1.md §1–§3. Step 201 is in.
If `git status` shows uncommitted changes, stop and tell me.

Two fixes.
1. With "snap heights to defaults" on, createRun puts a drawn run at its type's default height, so a run drawn between a base and an upper lands on the upper and fails with "conflict". Now, when that default box would hit a run it overlaps, createRun keeps the drawn height (manual), snapping its bottom to the nearest run top within cornerSnapDistance and its top to the nearest run bottom. New joinTouchingStack then stacks it on/under the runs it touches, and commitRunDraw calls it after joinTouchingEdges.
2. handleRunSegmentClick starts a move when selection.runId already matches, but selecting a cabinet sets runId too. It now also requires selection.pieceId to be empty.

Files (only these; line numbers at 865c459):
- src/elevation/model/runDefaults.js (153) — three imports; the gap block after `const heightMode` (82); geometry (127–133); `heightMode: inGap ? 'manual' : heightMode` in the run object. Verbatim from SPEC §3.
- src/elevation/model/room.js — stacks.js import adds STACK_EDGES, outerBottom, outerTop, stackLink; joinTouchingStack right after joinStack, verbatim. Nothing else.
- src/elevation/model/index.js — joinTouchingStack in the room.js block after joinStack.
- src/elevation/components/ElevationCanvas.jsx (1832) — joinTouchingStack in the room.js import (71–79); in commitRunDraw (763–) the block from `const joinedPlacement` (798) through the addRun else branch (811) replaced per SPEC; handleRunSegmentClick's condition (1281). Nothing else in this file.
- src/elevation/model/__tests__/stacks.test.js — the imports; describe('SPEC-35.1 drawing into a stack gap') at the end, verbatim (2 tests).

DO NOT touch stacks.js, overlap.js, the slice, RunGroup or DragPreview (the preview already calls createRun). DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/stacks.test.js src/elevation/model/__tests__/runDefaults.test.js src/elevation/model/__tests__/joints.test.js`. At the end `npm test && npm run lint` once: 667 + 2 = 669. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 202 draw into a stack gap, select before move".
```

---
## Step 203 — Message toast

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-35.1.md §4. Step 202 is in.
If `git status` shows uncommitted changes, stop and tell me.

Messages (state.elevation.message) come out of the crowded toolbar row and show as a toast floating under it, over the top of the canvas, with plain-English text for the error codes, a dismiss button and a 6-second timeout.

Files (only these):
- NEW src/elevation/components/MessageToast.jsx — verbatim from SPEC §4.
- src/elevation/ElevationLab.jsx (81) — import MessageToast; the canvas wrapper div (62) gets `relative` and renders <MessageToast /> first.
- src/elevation/components/ElevationToolbar.jsx (226) — remove `message,` from the selector (22) and the status div (221–223). Nothing else.

Match the classes already used in these files. DO NOT touch the slice or the canvases. DO NOT grep the repo or open other files.

No new tests. At the end `npm test && npm run lint` once: still 669. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 203 message toast".
```

**Check after 203 (by hand):**

1. Base run + upper run with a bottom cap. Draw a rectangle between the countertop and the cap, starting and ending within about 3" of them. The preview snaps to both lines. Let go: no conflict. The new run fills the gap, and Heights shows "Sits on Base …" and "Held under Upper …".
2. Change the base's box height: the new run refits.
3. Draw a normal upper on open wall: still lands at the default height.
4. Select a cabinet, then click its run's width dimension: the run is selected and nothing moves. Click it again: move starts.
5. Trigger an error (e.g. Sits on in a loop): it shows as a readable toast under the toolbar, and ✕ or 6 seconds clears it. The toolbar row no longer has the message text.
