# Elevation Lab — Codex Prompts, Steps 138–142 (boxes and faces in plan)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, and commit pending work first, including these docs.

**Order:** 138 first. 139 needs 138. 140 needs 138. 141 needs 139. 142 needs 138.

**SPEC-26 is not a prerequisite.** Its three steps are elevation work — neighbour moldings and the neighbour dimension row — with no connection to anything here, and can run before, after or between these steps.

**Pass counts below assume SPEC-26 is NOT in**, so the baseline is 502. If you have already run its step 135, add 2 to every count here.

**Codex can't open the app**, so don't plan browser checks. Kyle checks each step by hand.

**The gate is the same for every step:** while iterating, run only `npx vitest run <the named test file>`, or `npx vitest run` once at the end for the steps with no tests. Run `npm test && npm run lint` once, at the end. Don't run `npm run build`.

**Two steps read big files** — 138 appends to `elevationSlice.test.js` (1,800+) and 142 touches `PropertiesPanel.jsx` (2,180+). Each writes little; both prompts name the region to open and the rest is never read.

**The shape of this SPEC:** nothing here changes a layout. `splitRun`, `resolveHorizontal`, `runFootprint`, `findCollisions` and every elevation component are untouched from first step to last. The filler's *visible* width is still whatever the flex rules give it — the elevation looks exactly the same afterwards, and that is the test that it went in right.

---
## Step 138 — Settings and the end filler's ordered width

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-27.md §1, §2, §7 tests 215–216.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- src/elevation/model/constants.js: DEFAULT_SETTINGS only — fillerReturnDepth: 2.5 and fillerReturnThickness: 0.75 after doorThickness
- src/elevation/store/persistence.js (~690): three places only —
  - V2_DEFAULTED_SETTING_KEYS (79–…): add both new keys
  - two new helpers, isEndFillerSide and isEndFiller, beside isBlind (196–206)
  - isRun (208–…): one new clause, `&& isEndFiller(run.endFiller)`
- src/elevation/store/elevationSlice.js (~1,420): a new setRunEndFiller reducer after setRunBlind, and the exported action list
- src/elevation/model/room.js (~1,495): cloneRun (54–75) copies endFiller (clone both sides), flipRunsForWall (1455–1485) swaps left/right — both exactly as blind is handled one line away
- tests: src/elevation/store/__tests__/persistence.test.js (add 215), src/elevation/store/__tests__/elevationSlice.test.js (APPEND a describe block with 216)

Both settings are numbers, so V2_NUMERIC_SETTING_KEYS picks them up on its own — don't add them there by hand.

endFiller is OPTIONAL and each side is null or an object whose width and returnDepth are each null or a positive number. The helpers are in SPEC-27 §2; copy them. `width` is the ORDERED width of the filler — the 6" you buy for a blind corner, of which 1 1/2" shows — and it must never touch the layout. Do not go near splitRun, endMinWidthsForRun or anything in room.js beyond those two line ranges.

The reducer is in SPEC-27 §2; copy it. It takes `key` ('width' or 'returnDepth') rather than a whole object so a field can be cleared without wiping the other, and it collapses a side back to null when both are cleared. No syncRoomAt — none of this is geometry.

elevationSlice.test.js is 1,800+ lines. Read its first 60 lines for imports and store setup, then jump to the end and append.

Nothing reads endFiller yet; steps 139, 140 and 142 do.

Tests 215–216 exactly as SPEC-27 §7.
Expect 504 passing.

At most five lines of summary. Commit "elevation-mvp: step 138 end filler shape and return settings".
```

**Check after 138:** nothing visible. Reload and confirm your rooms still load.

---
## Step 139 — Plan geometry, model only

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-27.md §3, §7 tests 217–219.
If `git status` shows uncommitted changes, stop and tell me. Step 138 must be in.

Files:
- NEW src/elevation/model/planPieces.js (pure, ~150 lines): planRunPieces and topFaces, exactly as SPEC §3
- NEW test src/elevation/model/__tests__/planPieces.test.js (217–219)
- src/elevation/model/index.js: export both

No component changes in this step. Step 141 draws it.

Imports you need, all existing:
  blindEntries from './blind.js'
  frontDepth from './corners.js'

planRunPieces takes the layout and the faceLayouts map as arguments — it never computes them itself. The caller has both.

Four things to get right and nothing else:

1. box.front is run.depth, NOT frontDepth. That single line is the whole point of this SPEC: plan used to draw the box out to the front of the doors. Faces sit in front of it at [run.depth + bumperThickness, frontDepth(run, settings)].

2. box.start/end is the run WIDENED by its blind boxes. This is where that lives; step 141 has the component read it from here rather than working it out itself.

3. divisions are cabinet-to-cabinet ONLY: adjacent pairs in layout.pieces where both are kind 'cabinet'. A filler or end panel between two cabinets produces NO division. That is what makes a blind read as one box with no special case — don't add one.

4. topFaces sorts highest z first and keeps a face only if nothing already kept overlaps it horizontally. Three stacked drawer fronts give one; a pair door gives two. Export it: test 219 calls it with literal rectangles.

An end filler's true span grows AWAY from the cabinets — left fillers grow left, right fillers grow right — anchored at the edge the cabinet is on. Interior fillers always span their piece. Returns go on every edge that meets a cabinet piece, so an interior filler between two cabinets gets two.

Don't open PlanRunFootprint.jsx (step 141), PlanCanvas.jsx, splitRun.js, footprints.js or any component.

Tests 217–219 exactly as SPEC-27 §7; every depth number in them is stated. Assert cabinet face entries by count and containment, not exact span — those come from the reveal rules, which have their own tests.
Expect 507 passing.

At most five lines of summary. Commit "elevation-mvp: step 139 plan box and face geometry".
```

**Check after 139:** nothing visible. The suite is the check.

---
## Step 140 — The ordered filler width reaches the part list

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-27.md §4, §7 test 220.
If `git status` shows uncommitted changes, stop and tell me. Step 138 must be in.

Files:
- src/elevation/model/blind.js: blindPartWidths only — one new rule
- test: src/elevation/model/__tests__/blind.test.js: add test 220

Per side, in this order:
  1. exposed blind -> the corner-to-face panel width, exactly as today;
  2. covered blind with run.endFiller?.[side]?.width set -> that width;
  3. otherwise absent, and partNumbers falls back to piece.width.

An exposed blind IGNORES the typed width — the panel has to reach the corner whatever was ordered. Don't make it a max() of the two.

Change nothing else in blind.js: blindEntries, coveredRanges and isBlindCovered all stay as they are, and partNumbers.js is not touched — it already reads whatever blindPartWidths returns.

Test 220 exactly as SPEC-27 §7.
Expect 508 passing.

At most five lines of summary. Commit "elevation-mvp: step 140 ordered filler width in part widths".
```

**Check after 140:** nothing visible yet — part widths only.

---
## Step 141 — Plan draws boxes and faces apart

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-27.md §5.
If `git status` shows uncommitted changes, stop and tell me. Step 139 must be in.

Files:
- src/elevation/plan/PlanRunFootprint.jsx (~255): the drawing half of the file

What comes OUT: the blindEntries call, the separate blind <Line> polygon SPEC-25 §5 added, the runFootprint call, and the boundaryPieces expression. All of that lives in planRunPieces now. Rename footprintOutlineSegments' second parameter from `run` to `span` while you are there — it only ever reads .x and .width. What stays: the depth dimension, the collision tooltip, the hover and click handlers.

What goes IN: one call to runFaceLayouts(room, wall, run, settings, layout) beside the existing splitRun layout, one call to planRunPieces(room, wall, run, settings, layout, faceLayouts), and four groups of shapes built from what it returns — box, divisions, faces, returns. Their exact props are in SPEC-27 §5.

Depth ranges map through elevationToPlan(frame, x, offset) the way the existing code does: a rectangle is the four corners (start, back), (end, back), (end, front), (start, front).

Draw order: box polygon, then its outline segments, then divisions, then returns, then faces. The box polygon keeps the fill, the hitStrokeWidth and the click handlers — it is still the run's click target, so clicking the buried part of a blind selects its run.

footprintOutlineSegments takes { x: box.start, width: box.end - box.start } and run.depth, NOT frontDepth. runFootprint stays uncalled in this component; the model export is untouched and findCollisions keeps using the run at full front depth, which is why a blind still never collides.

depthDimension(run, depth, scale) keeps taking the run and the full installed front depth. The depth dimension is unchanged.

Upper runs keep their dashed outline; faces and returns on an upper inherit the same dash.

runFaceLayouts is the one new cost in this component, and PlanCanvas renders every run in the room. If it is visibly slow with a big room, say so rather than working around it.

Don't touch PlanCanvas.jsx, model/footprints.js, model/planPieces.js or any elevation component.

No tests in this step. Run `npx vitest run` once at the end; 508 must still pass.

At most five lines of summary. Commit "elevation-mvp: step 141 plan boxes and faces".
```

**Check after 141:**
- A base run in plan is a 24" box with a thin gap and a door in front of it, not one 24 7/8" slab.
- Doors are at their true widths with the reveals showing as gaps between them.
- A three-drawer stack shows one face, not three on top of each other; a pair door shows two.
- A filler is a thin face with a return lapping the box beside it; an interior filler has one on each side.
- A blind run is one unbroken box with faces in front of part of it, and no line where the visible cabinet ends.
- Two cabinets butting still show a line between their boxes.
- End panels draw at the face plane with no return, as agreed — if they should run the full box depth instead, that is the one `front`/`back` pair on the end-panel branch in `planPieces.js`.
- Collisions, the depth dimension and clicking to select all behave as before.

---
## Step 142 — Ordered width and return depth in the panel

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-27.md §6.
If `git status` shows uncommitted changes, stop and tell me. Step 138 must be in.

Files:
- src/elevation/components/PropertiesPanel.jsx (~2,190): two places only —
  - the import block (1–120): add setRunEndFiller to the store action imports
  - the per-side card of Corners & anchors, directly under the Blind box Field that SPEC-25 §6 added

PropertiesPanel.jsx is 2,190 lines. Open the import block and the Corners & anchors section (717–1000). Do not read the rest.

The two Fields and the helper line are in SPEC-27 §6; copy them. Both are allowBlank InchInputs: blank means "from the layout" for the width and "the setting" for the return depth. formatInchesInput and InchInput are already imported and used a few lines above.

Both dispatch setRunEndFiller with a `key` of 'width' or 'returnDepth', never a whole object — the reducer is built that way so clearing one field doesn't wipe the other.

These sit beside Blind box but are independent of it: a filler can be ordered oversize without the run being blind. Don't gate them on run.blind.

Don't touch the Blind box field, the corner clearance controls, PieceProperties or any other section.

No tests in this step. Run `npx vitest run` once at the end; 508 must still pass.

At most five lines of summary. Commit "elevation-mvp: step 142 end filler properties".
```

**Check after 142:**
- Type 6 into Filler width on a blind corner: plan shows a 6" filler reaching into the corner, the elevation still shows 1 1/2", and the part list carries 6".
- Type 4 into Filler return and the return in plan gets deeper; clear it and it goes back to 2 1/2".
- Both fields work on a run with no blind at all.
- Mirror the wall and both follow to the other side.
