# Elevation Lab — Codex Prompts, Steps 150–152 (the blind corner panel)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, and commit pending work first, including these docs.

**Order:** 150 first. 151 needs 150. 152 needs 150.

**Baseline is 519 passing**, with SPEC-28's steps 143–149 all in. Confirm with `npm test` before step 150; if the number differs, shift every count below.

**Codex can't open the app**, so don't plan browser checks. Kyle checks each step by hand.

**The gate is the same for every step:** while iterating, run only `npx vitest run <the named test file>`, or `npx vitest run` once at the end for the step with no tests. Run `npm test && npm run lint` once, at the end. Don't run `npm run build`.

**The shape of this SPEC:** step 150 changes what a panel *is* and half of it is updating five existing tests, because SPEC-25 sized the panel from where the run landed rather than from what dies into the corner. 151 and 152 are drawing. Nothing here touches a layout — `splitRun`, `cornerReserveParts` and every dimension chain are untouched from first step to last.

---
## Step 150 — The panel rule

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-29.md §1, §2, §5 tests 230–231.
If `git status` shows uncommitted changes, stop and tell me.

A blind corner's panel stops being sized from where the run landed and starts being sized from what dies into the corner: the deepest neighbouring run that OVERLAPS THE BLIND RUN VERTICALLY, plus the end piece's layout width. Nothing dies in, no panel.

Files:
- src/elevation/model/blind.js (~145): three regions —
  - coveredRanges (52–70): factor its neighbour filter into a private helper
  - a new exported panelDepth beside it
  - blindEntries' panel block (95–110) and blindPartWidths (128–145)
- src/elevation/model/index.js (241): export panelDepth beside blindEntries
- test: src/elevation/model/__tests__/blind.test.js (~230)

panelDepth and the panel block are in SPEC-29 §1; copy them. The vertical-overlap test is the ONLY new filter — rules 1 to 3 are exactly what coveredRanges already applies, which is why they go in one shared helper. Do NOT use bandsCompatible; a base and an upper meet when they occupy the same vertical space, not when their bands match.

endPiece.width is the LAYOUT width splitRun gave the end piece, not run.endFiller[side].width. The panel flexes exactly as the filler flexes, and panel.x is cornerX on the left and cornerX - width on the right — the panel always touches the wall.

blindPartWidths becomes a precedence, not a covered/exposed branch: a panel wins, otherwise the ordered filler width (run.endFiller[side].width ?? settings.blindFillerWidth). Copy it from §2.

DO NOT touch cornerReserveParts, splitRun, or anything in src/elevation/plan/ or src/elevation/components/. Steps 151 and 152 draw this.

FIVE EXISTING TESTS CHANGE, all for the same reason — a blind on a wall with no corner no longer invents a panel out of the gap in front of the run. Each change is spelled out in SPEC-29 §5 (step 150): 208 (both panels become null), 209 (the missing-end case moves onto the corner fixture), 211 (L:left becomes 6), 220 and 225 (their exposed halves move onto the corner fixture and become 27.875). Make exactly those changes and no others. If a sixth test fails, the implementation is wrong — say so rather than editing it.

The cornerRoom / neighborBase / neighborUpper / tallBlind / lowUpperBlind fixtures are literal in §5; copy them. They reuse the corner test 220 already builds, so the neighbour anchors are known to work. Every number in tests 230 and 231 is stated — 24.875, 27.875, 12.875, 15.875, 7, 42, 6 — none of them needs deriving.

Tests 230–231 exactly as SPEC-29 §5.
Expect 521 passing.

At most five lines of summary. Commit "elevation-mvp: step 150 blind panel from the corner".
```

**Check after 150:** nothing visible yet — part widths only. On a blind at a real corner, the end piece's part width should now read as the neighbour's front depth plus the filler. On a blind with nothing dying in, it should read 6".

---
## Step 151 — Plan draws the panel

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-29.md §3, §5 test 232.
If `git status` shows uncommitted changes, stop and tell me. Step 150 must be in.

A filler piece whose side has a panel becomes a 'panel' face entry spanning the panel, at the face plane.

Files:
- src/elevation/model/planPieces.js (~150): planFaces and fillerReturns
- src/elevation/plan/PlanRunFootprint.jsx (~280): the face fill lookup only
- test: src/elevation/model/__tests__/planPieces.test.js (~250)

planRunPieces ALREADY calls blindEntries for its boxes. Build the side -> panel map from that same result; do not call it twice.

The panel entry keeps the end piece's id as its key, takes kind 'panel', and its span is panel.x to panel.x + panel.width — straight off the entry, NOT grown from the piece edge by fillerOrderedWidth. That anchoring is the whole point: it is what makes the panel overhang the blind box's outer edge and touch the wall.

fillerReturns emits nothing for a piece that became a panel.

Everything else from SPEC-28 §3 stands and must not move: a filler with no panel is still a 'filler' entry at its ordered width, an end panel is still an 'end_panel' entry from 0 to faceFront, boxes are unchanged.

In PlanRunFootprint, 'panel' uses KIND_COLORS.end_panel, the same as 'end_panel'. That is the ONLY change to that file — a panel is a face entry like any other.

Test 232 exactly as SPEC-29 §5; copy cornerRoom, neighborBase, neighborUpper and tallBlind from blind.test.js and resolve layout and faceLayouts the way the existing fixture in this file does.
Expect 522 passing.

At most five lines of summary. Commit "elevation-mvp: step 151 plan draws the blind panel".
```

**Check after 151:**
- In plan, a blind corner shows a violet board at the face plane running from the wall out to the filler's right edge, overhanging the blind box's outer edge.
- No amber filler is drawn at that end any more — the panel replaced it.
- There is no return on it.
- A blind with nothing dying into it still shows its 6" amber filler, unchanged.

---
## Step 152 — Elevation draws the panel

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-29.md §4.
If `git status` shows uncommitted changes, stop and tell me. Step 150 must be in.

Files:
- src/elevation/components/RunGroup.jsx (~430): one memo beside subLabels, and one Rect group before the drawnPieces map (290–303)

RunGroup ALREADY computes blindEntries for its sub-labels. Derive the panels from that same `blind` result; do not call it again.

The memo and the Rect are in SPEC-29 §4; copy them. wallRectToScreen and KIND_COLORS are already imported and used in this file.

Draw order: the Rects go BEFORE the drawnPieces map, so the run's own pieces draw on top of the panel.

DO NOT try to order the panel against the neighbour shadows. NeighborReturns renders in a LATER <Layer> than RunGroup in ElevationCanvas (1544 vs 1483), so the hatches already draw over this for free. Don't open ElevationCanvas.jsx or NeighborReturns.jsx.

The panel's z extent is the run's full height. Don't split it into only the bands where nothing covers it.

The `Panel 27 7/8"` sub-label on the end piece is unchanged, and so is everything else RunGroup draws — faces, badges, centerline markers, toe kick, countertop.

No tests in this step. Run `npx vitest run` once at the end; 522 must still pass.

At most five lines of summary. Commit "elevation-mvp: step 152 elevation draws the blind panel".
```

**Check after 152:**
- On the north/west corner: the north run's blind shows a violet panel from the west wall out to the filler, full run height, with the west run's hatched shadow drawn over its lower 30 1/2".
- Between the base's top and an upper's bottom, the panel is plainly visible — that is the band it exists for.
- Widen or narrow the other cabinets in the run: the panel's right edge moves with the filler, its left edge stays on the wall.
- A blind with nothing dying into it draws no panel at all.
