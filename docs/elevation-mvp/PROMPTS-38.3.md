# Elevation Lab — Codex Prompts, Steps 284–286 (round 38.3: face frame ends, joined end panels)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session. Commit pending work first, including these docs (`SPEC-38.3.md`, this file, the renumbered `SPEC-39.md` / `PROMPTS-39.md`, and the updated plan docs).

| Step | What | Tests after |
|---|---|---|
| 284 | Model: bead gap at every end of a beaded run; a free end's overhang goes in its gap; face frame runs round boxes to 1/2" and give the leftover to the end stiles | 840 |
| 285 | Model: the frame covers the end gaps and never narrows a box at a run end | 842 |
| 286 | A chosen end type sticks on a joined end; a back panel doesn't hide its neighbour's end; "Face frame stile" label | 844 |

**Branch:** `elevation-grid-run-split`. The baseline after step 283 is **835**. Confirm it with `npm test`; if it differs, shift the counts.

The SPEC's code wasn't run before these prompts were written. If a test fails, check its expected value against SPEC-38.3 §1 before changing the code, and say so in the summary.

---

## Step 284 — Model: end gaps and stile leftovers

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-38.3.md §1, §1b and §2. Step 283 is in.
If `git status` shows uncommitted changes, stop and tell me.

Beaded inset boxes get their bead in gaps, never in their side reveals: their left/right reveals become the 3/4" stile, and every real end of a beaded run gets a bead gap (style.beadWidth, carried as run._frame.bead) between the end and its outermost cabinet. A face frame run (run._frame set) with no flexible end rounds its auto boxes down to settings.roundTo and splits the leftover between its real ends' gaps (left floored to 1/16"). A free end (type none, not joined by a joint or follow anchor) also puts the stile's 3/4" overhang in its gap, so no box is narrowed there; a joined end gets only the bead. Pinned runs' split points (`_pinSplit`) aren't ends. Fillers keep taking the leftover where there is one; European runs don't change. The inside-corner filler minimum subtracts the stile and the bead (unchanged total).

Write the code as the SPEC gives it. Add faceFrameEnds.test.js VERBATIM.

Files:
- src/elevation/model/styles.js: styleReveals' left/right (≈ 117–118), runFrame (≈ 285–290)
- src/elevation/model/splitRun.js (584): endGaps after itemsWithGaps, layoutInputs, splitRunLegacy (the new branch, the last-auto condition, positioning), splitRun's two outer splitRunLegacy calls and leftMinimum/rightMinimum
- src/elevation/model/room.js: withFrame (622–632) and endMinWidthsForRun's frameReveal (≈ 219) only; read nothing else in room.js
- NEW src/elevation/model/__tests__/faceFrameEnds.test.js
- the existing tests that encoded the old beaded rules (SPEC §2 "Existing tests" names the likely ones)

Update an old expectation only to the SPEC-38.3 §1 rules, never the code back to the old numbers. If a frames.test.js region expectation can only pass after step 285, skip it with `// SPEC-38.3 step 285`. DO NOT touch frames.js (step 285), joints.js or the store. DO NOT grep the repo beyond the test files the failures name.

First add the new test file and run it: it must fail. Then change the code. While iterating, run only `npx vitest run src/elevation/model/__tests__/faceFrameEnds.test.js` and then the failing files the full run names. At the end, run `npm test && npm run lint` once: 835 + 5 = 840 (skipped tests don't count as failures). Don't run `npm run build`.

Summary: every existing test you changed or skipped, one line each with why; then at most three lines. Commit "elevation-mvp: step 284 Face frame end gaps and stile leftovers".
```

---

## Step 285 — Model: the frame covers the end gaps

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-38.3.md §1b, §1.3 and §3. Step 284 is in.
If `git status` shows uncommitted changes, stop and tell me.

frameRegions joins an end panel (or a mitered wall end panel) within the run's gap reach of the boxes, and grows over the gap; at a run end with no panel and nothing of the run between (a free or a joined end), the frame runs out to the run's edge. A box side at a run end is no longer free (its overhang is in the end gap now), so the box isn't narrowed; a free side inside the run keeps its inset. Openings then come from the boxes' 3/4" reveals.

Write the code as the SPEC gives it. Add faceFrameEndsRoom.test.js VERBATIM. Restore every test step 284 skipped, with expectations set to the §1 rules.

Files (only these):
- src/elevation/model/frames.js (355): frameRegions' panel loop (≈ 129–138), the plain-end block after it, and the freeSides loop (≈ 146–153)
- the free-side tests in frames.test.js / frameFixes.test.js whose free side is at a run end (expect it not free now, box at full width)
- NEW src/elevation/model/__tests__/faceFrameEndsRoom.test.js
- the test files with `SPEC-38.3 step 285` skips

DO NOT touch splitRun.js, styles.js, faceLayouts.js or partNumbers.js. DO NOT grep the repo or open other files.

First add the new test and run it: it must fail. Then change the code. While iterating, run only `npx vitest run src/elevation/model/__tests__/faceFrameEndsRoom.test.js src/elevation/model/__tests__/frames.test.js src/elevation/model/__tests__/frameFixes.test.js`. At the end, run `npm test && npm run lint` once: 840 + 2 = 842, nothing skipped. Don't run `npm run build`.

At most five lines of summary, plus one line per expectation you restored or changed. Commit "elevation-mvp: step 285 Frame covers the end gaps".
```

**Check after 285 (by hand):** in Kyle's G2, the upper's three openings read 27 1/2 each and its boxes 29 each; the joined base (corner filler right) boxes 31 1/2 and 31 1/2, filler 1 3/16, openings 30 and 30; the tall's 25; wall 2's base 26 1/2 and 26 1/2 with a 1 7/16 filler at the corner. Each mitered end panel's stile reads 1 3/4. Set a run's end to None with nothing joined: its end box is the same width as the rest and the end stile reads 1 3/4 (plus any leftover).

---

## Step 286 — Joined ends: a chosen type sticks; a back panel doesn't hide its neighbour's end

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-38.3.md §1.4, §3b and §4. Step 285 is in.
If `git status` shows uncommitted changes, stop and tell me.

Three fixes:
1. setRunEnd drops `auto` when it sets a type other than none, so syncRoom stops re-deriving a joined end the user chose (today choosing End panel on a joined end snaps back to None).
2. endIsCovered compares the neighbour's depth along the touching edge (its edge leaves' own depth, a void as 0, else the run's), not its run depth, so a back-panel-only run beside a cabinet run no longer hides the cabinets' end: it defaults to an end panel, and the back panel run's own end stays None.
3. EndFields shows the 'filler' option as "Face frame stile" when the run has a face frame (run._frame). Label only; the value stays 'filler'.

Write the code as the SPEC gives it. Add the helper and the two test files VERBATIM.

Files (only these):
- src/elevation/store/elevationSlice.js: setRunEnd only (≈ 1083–1100)
- src/elevation/model/joints.js: the grid.js import, edgeDepth above endIsCovered (105), the spans filter
- NEW src/elevation/model/__tests__/helpers/joinedRooms.js
- NEW src/elevation/model/__tests__/jointEnds.test.js
- NEW src/elevation/store/__tests__/runEndManual.test.js
- src/elevation/components/properties/EndFields.jsx: the option map (≈ 36–38) only

DO NOT touch jointEndTypes or joinEdges. DO NOT grep the repo or open other files.

First add the tests and run them: they must fail. Then change the code. While iterating, run only `npx vitest run src/elevation/model/__tests__/jointEnds.test.js src/elevation/store/__tests__/runEndManual.test.js src/elevation/model/__tests__/joints.test.js`. At the end, run `npm test && npm run lint && npm run build` once: 842 + 2 = 844.

At most five lines of summary. Commit "elevation-mvp: step 286 Joined ends keep a chosen type".
```

**Check after 286 (by hand):** in G1, join a back-panel-only run to a cabinet run: the cabinet run's joined end shows an end panel by default; set it to None and back to End panel, and it stays. In a beaded room the end select lists "Face frame stile"; in a European room it still says "Filler".

**Then:** Kyle exports `golden.json` (the rooms store only what was drawn, so anything drawn before 284 picks up the fixes when it loads; a quick look at G1 and G2 is enough) and starts round 39 (`PROMPTS-39.md`, step 287).
