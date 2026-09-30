# Elevation Lab — Codex Prompts, Steps 250–259 (round 37: T-fillers)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session. Commit pending work first, including these docs (`CELLS-PLAN.md`, `SPEC-37.md`, this file).

| Step | What | Tests after |
|---|---|---|
| 250 | Shape: the setting and the overrides (inert) | 748 |
| 251 | Model: T-fillers at seams and run ends | 757 |
| 252 | Model: horizontal T-fillers between stacked boxes | 763 |
| 253 | Model: reveals beside a T-filler | 768 |
| 254 | Model: notes, part numbers and badges | 775 |
| 255 | Model: T-fillers in plan | 780 |
| 256 | Model: T-fillers on the dimension chains | 785 |
| 257 | Model: what a box has on each side, and selecting a T | 791 |
| 258 | Screen: draw T-fillers in elevation, and select them | 791 |
| 259 | Screen: T-filler controls | 791 |

**Branch:** `elevation-grid-run-split`. The baseline after step 249 is **741**. Confirm it with `npm test`; if it differs, shift the counts.

**Line numbers** are against the tree after the earlier steps of this round (step 250 against `db60a92`).

Apply the SPEC's code exactly. Each step's code is a diff against the tree at that step: `@@` lines give the position; new files are given whole.

---

## Step 250 — Shape: the setting and the overrides (inert)

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-37.md §2. Step 249 is in.
If `git status` shows uncommitted changes, stop and tell me.

Shape only, no behavior: settings.teeCover (0.75) and settings.teeThickness (0.8125); run.tFiller ('seams' | 'all' | absent); per-side tFiller on cabinet leaves; run.endFiller[side].tFiller. Persistence validates them, cloneNode copies them, mirrorNode swaps left/right, and three reducers write them: setRunTFiller, setItemTFiller, and setRunEndFiller accepting key 'tFiller'.

Copy the SPEC's code and tests VERBATIM. Don't rewrite them, and don't mock anything in the tests.

Files (only these):
- src/elevation/model/__tests__/grid.test.js (284) — only the hunks in the SPEC
- src/elevation/model/constants.js (129) — only the hunks in the SPEC
- src/elevation/model/grid.js (382) — only the hunks in the SPEC
- src/elevation/store/__tests__/elevationSlice.test.js (2472) — only the hunks in the SPEC
- src/elevation/store/__tests__/persistence.test.js (1093) — only the hunks in the SPEC
- src/elevation/store/elevationSlice.js (1766) — only the hunks in the SPEC
- src/elevation/store/persistence.js (653) — only the hunks in the SPEC

DO NOT touch the solver, cellPieces, any component, or any other model file. Nothing reads the new fields yet; that is steps 251 on. DO NOT grep the repo or open other files.

First add the tests and run them: the new ones must fail. Then change the code. While iterating, run only `npx vitest run src/elevation/store src/elevation/model/__tests__/grid.test.js`. At the end, run `npm test && npm run lint` once: 741 + 7 = 748. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 250 The setting and the overrides (inert)".
```

**Check after 250 (by hand):**

1. Nothing on screen changes. Open a saved room: it loads as before.

---

## Step 251 — Model: T-fillers at seams and run ends

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-37.md §3. Step 250 is in.
If `git status` shows uncommitted changes, stop and tell me.

Add model/tees.js with teeFillers(room, run, cells, settings) returning { tees, covers } for vertical seams between Euro boxes and for run-end fillers, and export it from model/index.js.

Copy the SPEC's code and tests VERBATIM. Don't rewrite them, and don't mock anything in the tests.

Files (only these):
- src/elevation/model/__tests__/tees.test.js — NEW, verbatim
- src/elevation/model/index.js (366) — only the hunks in the SPEC
- src/elevation/model/tees.js — NEW, verbatim

DO NOT touch faceLayouts, styles, dimensions, planPieces, partNumbers or any component. Horizontal Ts come in step 252; nothing consumes the result until step 253. DO NOT grep the repo or open other files.

First add the tests and run them: the new ones must fail. Then change the code. While iterating, run only `npx vitest run src/elevation/model/__tests__/tees.test.js`. At the end, run `npm test && npm run lint` once: 748 + 9 = 757. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 251 T-fillers at seams and run ends".
```

**Check after 251 (by hand):**

1. Nothing on screen changes yet.

---

## Step 252 — Model: horizontal T-fillers between stacked boxes

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-37.md §4. Step 251 is in.
If `git status` shows uncommitted changes, stop and tell me.

Extend tees.js with horizontal T-fillers between stacked boxes (run.tFiller 'all', or a cabinet's own top/bottom). A horizontal T butts into the vertical T beside it (stops at its cover) and never breaks it: leave step 251's vertical seam grouping as it is, so a vertical T stays one piece for the whole seam even where the splits either side don't line up.

Copy the SPEC's code and tests VERBATIM. Don't rewrite them, and don't mock anything in the tests.

Files (only these):
- src/elevation/model/__tests__/tees.test.js (179) — only the hunks in the SPEC
- src/elevation/model/tees.js (141) — only the hunks in the SPEC

DO NOT touch anything outside tees.js and its test file. DO NOT grep the repo or open other files.

First add the tests and run them: the new ones must fail. Then change the code. While iterating, run only `npx vitest run src/elevation/model/__tests__/tees.test.js`. At the end, run `npm test && npm run lint` once: 757 + 6 = 763. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 252 Horizontal T-fillers between stacked boxes".
```

**Check after 252 (by hand):**

1. Nothing on screen changes yet.

---

## Step 253 — Model: reveals beside a T-filler

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-37.md §5. Step 252 is in.
If `git status` shows uncommitted changes, stop and tell me.

Make the face reveals beside a T-filler follow REV-005/006: cabinetReveals gets a tCovers argument, faceLayouts passes teeFillers(...).covers in, and a covered edge counts as captured.

Copy the SPEC's code and tests VERBATIM. Don't rewrite them, and don't mock anything in the tests.

Files (only these):
- src/elevation/model/__tests__/tees.test.js (249) — only the hunks in the SPEC
- src/elevation/model/faceLayouts.js (97) — only the hunks in the SPEC
- src/elevation/model/styles.js (278) — only the hunks in the SPEC

DO NOT touch the style resolver, the solver, or the manual reveal override path: a manual reveal still wins. DO NOT grep the repo or open other files.

First add the tests and run them: the new ones must fail. Then change the code. While iterating, run only `npx vitest run src/elevation/model`. At the end, run `npm test && npm run lint` once: 763 + 5 = 768. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 253 Reveals beside a T-filler".
```

**Check after 253 (by hand):**

1. Turn on T-fillers for a Euro run (via the store for now; the screen controls come in step 259): doors beside a T have 13/16" between them (a pair) or 27/32" each side (a single).

---

## Step 254 — Model: notes, part numbers and badges

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-37.md §6. Step 253 is in.
If `git status` shows uncommitted changes, stop and tell me.

Add notes and rabbets to teeFillers' result, and list T-fillers in partNumbers: seam Ts as filler parts after the run's pieces, end Ts in their filler's place at the ordered width plus the cover, and one badge group per run.

Copy the SPEC's code and tests VERBATIM. Don't rewrite them, and don't mock anything in the tests.

Files (only these):
- src/elevation/model/__tests__/teeParts.test.js — NEW, verbatim
- src/elevation/model/__tests__/tees.test.js (303) — only the hunks in the SPEC
- src/elevation/model/index.js (367) — only the hunks in the SPEC
- src/elevation/model/partNumbers.js (282) — only the hunks in the SPEC
- src/elevation/model/tees.js (208) — only the hunks in the SPEC

DO NOT touch planPieces, dimensions, any component. The Properties panel shows these notes in step 259. DO NOT grep the repo or open other files.

First add the tests and run them: the new ones must fail. Then change the code. While iterating, run only `npx vitest run src/elevation/model`. At the end, run `npm test && npm run lint` once: 768 + 7 = 775. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 254 Notes, part numbers and badges".
```

**Check after 254 (by hand):**

1. Part numbers: a seam T has its own number after the run's pieces; an end T keeps its filler's number.

---

## Step 255 — Model: T-fillers in plan

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-37.md §7. Step 254 is in.
If `git status` shows uncommitted changes, stop and tell me.

In planRunPieces, draw seam T-fillers as a flat 13/16" thick from the box face (run.depth) plus a centred return running back from it, and extend an end filler's face to the T's width, also 13/16" from the box face with its return behind it. Horizontal Ts are not drawn in plan.

Copy the SPEC's code and tests VERBATIM. Don't rewrite them, and don't mock anything in the tests.

Files (only these):
- src/elevation/model/__tests__/teePlan.test.js — NEW, verbatim
- src/elevation/model/planPieces.js (295) — only the hunks in the SPEC

DO NOT touch PlanRunFootprint.jsx or any component: it already draws faces and returns generically. DO NOT grep the repo or open other files.

First add the tests and run them: the new ones must fail. Then change the code. While iterating, run only `npx vitest run src/elevation/model`. At the end, run `npm test && npm run lint` once: 775 + 5 = 780. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 255 T-fillers in plan".
```

**Check after 255 (by hand):**

1. Plan view of a Euro run with T-fillers: each seam shows an amber flat with a short return at its centre; an end T's flat reaches over the box and the return sits at the box's end.

---

## Step 256 — Model: T-fillers on the dimension chains

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-37.md §8. Step 255 is in.
If `git status` shows uncommitted changes, stop and tell me.

Show T-fillers on the dimension chains: runInnerSegments trims covered boxes and adds 't-filler' segments, and runBoxSegments splits the edge column around a horizontal T.

Copy the SPEC's code and tests VERBATIM. Don't rewrite them, and don't mock anything in the tests.

Files (only these):
- src/elevation/model/__tests__/teeChains.test.js — NEW, verbatim
- src/elevation/model/__tests__/teePlan.test.js (90) — only the hunks in the SPEC
- src/elevation/model/__tests__/tees.test.js (303) — only the hunks in the SPEC
- src/elevation/model/dimensions.js (645) — only the hunks in the SPEC

DO NOT touch DimensionRow.jsx (step 258), the frame-region branch of runBoxSegments, or the outer chains. DO NOT grep the repo or open other files.

First add the tests and run them: the new ones must fail. Then change the code. While iterating, run only `npx vitest run src/elevation/model`. At the end, run `npm test && npm run lint` once: 780 + 5 = 785. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 256 T-fillers on the dimension chains".
```

**Check after 256 (by hand):**

1. The horizontal chain reads box | T | box | T | box with the T's width (1 1/2" between tight boxes).

---

## Step 257 — Model: what a box has on each side, and selecting a T

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-37.md §9. Step 256 is in.
If `git status` shows uncommitted changes, stop and tell me.

Add teeSides to tees.js (and export it), make resolveSelectedPiece(run, layout, pieceId, tees = []) resolve seam T ids and return { piece, item, side, tee }, and apply the chip/return-up note whenever the T's bottom reaches the run bottom.

Copy the SPEC's code and tests VERBATIM. Don't rewrite them, and don't mock anything in the tests.

Files (only these):
- src/elevation/model/__tests__/teeSides.test.js — NEW, verbatim
- src/elevation/model/index.js (367) — only the hunks in the SPEC
- src/elevation/model/tees.js (236) — only the hunks in the SPEC
- src/elevation/properties/__tests__/helpers.test.js (265) — only the hunks in the SPEC
- src/elevation/properties/helpers.js (113) — only the hunks in the SPEC

DO NOT touch any component. The screen steps use these in 258 and 259. DO NOT grep the repo or open other files.

First add the tests and run them: the new ones must fail. Then change the code. While iterating, run only `npx vitest run src/elevation/model src/elevation/properties`. At the end, run `npm test && npm run lint` once: 785 + 6 = 791. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 257 What a box has on each side, and selecting a T".
```

**Check after 257 (by hand):**

1. Nothing on screen changes yet.

---

## Step 258 — Screen: draw T-fillers in elevation, and select them

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-37.md §10. Step 257 is in.
If `git status` shows uncommitted changes, stop and tell me.

Draw T-fillers in the elevation (RunGroup), let them be selected (PropertiesPanel passes tees to resolveSelectedPiece), and color 't-filler' dimension segments.

Copy the SPEC's code and tests VERBATIM. Don't rewrite them, and don't mock anything in the tests.

Files (only these):
- src/elevation/components/DimensionRow.jsx (351) — only the hunks in the SPEC
- src/elevation/components/PropertiesPanel.jsx (175) — only the hunks in the SPEC
- src/elevation/components/RunGroup.jsx (609) — only the hunks in the SPEC

DO NOT touch PieceRect, the canvas, the store, or the Properties sub-components: a selected seam T shows an empty panel until step 259. DO NOT grep the repo or open other files.

There are no component tests: make the change, then run `npm test && npm run lint && npm run build` once. The suite stays at 791.

At most five lines of summary. Commit "elevation-mvp: step 258 Draw T-fillers in elevation, and select them".
```

**Check after 258 (by hand):**

1. A Euro run with T-fillers shows each T as a filler-colored piece over the seam; clicking one keeps it selected (the panel is empty until step 259). T dimension segments are amber.

---

## Step 259 — Screen: T-filler controls

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-37.md §11. Step 258 is in.
If `git status` shows uncommitted changes, stop and tell me.

Add the screen controls: a run-level T-fillers select, a per-cabinet TFillerSection (one select per touching edge, writing both adjacent boxes through setItemTFiller), an end-filler T-filler select, and TeeProperties for a selected seam T.

Copy the SPEC's code and tests VERBATIM. Don't rewrite them, and don't mock anything in the tests.

Files (only these):
- src/elevation/components/properties/EndFields.jsx (130) — only the hunks in the SPEC
- src/elevation/components/properties/PieceProperties.jsx (176) — only the hunks in the SPEC
- src/elevation/components/properties/RunCabinetsSection.jsx (99) — only the hunks in the SPEC
- src/elevation/components/properties/TFillerSection.jsx — NEW, verbatim
- src/elevation/components/properties/TeeProperties.jsx — NEW, verbatim

DO NOT touch the store or model. Every action these controls dispatch already exists from step 250. DO NOT grep the repo or open other files.

There are no component tests: make the change, then run `npm test && npm run lint && npm run build` once. The suite stays at 791.

At most five lines of summary. Commit "elevation-mvp: step 259 T-filler controls".
```

**Check after 259 (by hand):**

1. Run → Cabinets → T-fillers: pick 'Between cabinets'; Ts appear at every seam. Two tall columns split at different heights: one T runs the full height between them. Pick 'Every edge' on a stacked run: horizontal Ts too, each butting into the full-height vertical T.
2. A stacked column whose upper cabinet is open (no faces): the horizontal T shows under it.
3. A cabinet's T-filler section: set one edge to 'No T-filler' and that seam goes plain, from both boxes' point of view.
4. An end filler: T-filler 'T-filler' makes it a T with the return off-centre; 'Plain filler' keeps the old look.
5. Select a T: part number, 'T-shape' (plus the chip note where the flat drops) and the flat's width and height.

---
