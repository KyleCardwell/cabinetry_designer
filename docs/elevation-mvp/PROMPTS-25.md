# Elevation Lab — Codex Prompts, Steps 128–134 (blind corners)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, and commit pending work first, including these docs.

**Order:** 128 and 129 are independent of each other. 130 needs 129. 131, 132, 133 and 134 all need 130, and are independent of each other after that. The pass counts below assume 128 → 134 straight through, with SPEC-24 already in.

**Codex can't open the app**, so don't plan browser checks. Kyle checks each step by hand.

**The gate is the same for every step:** while iterating, run only `npx vitest run <the named test file>`, or `npx vitest run` once at the end for the steps with no tests. Run `npm test && npm run lint` once, at the end. Don't run `npm run build`. Line numbers are as of the SPEC-24 tip.

**Two steps read big files** — 129 (`elevationSlice.test.js`, 1,795 lines, appended to) and 134 (`PropertiesPanel.jsx`, 2,182). Each writes very little, so each should cost one read: both prompts name the region to open, and the rest of the file is never opened. Run 134 at the start of a window.

**The shape of this SPEC, so no step goes looking for more:** a blind changes no geometry. `splitRun`, `resolveHorizontal`, `cornerReserve`, `runFootprint`, `neighborProfiles`, `findCollisions` and every dimension chain are untouched from first step to last. A blind is one stored number plus a derived overlay read on top of the layout that already exists. If a step seems to need a layout change, the step is wrong.

---
## Step 128 — Persisted shape: run.blind

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-25.md §1 (persistence only), §7 test 206.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- src/elevation/store/persistence.js (684): two places only —
  - a new isBlind helper beside isRunAnchor (179–194)
  - isRun (196–206): one new clause, `&& isBlind(run.blind)`
- test: src/elevation/store/__tests__/persistence.test.js (714): add test 206 at the end

No behavior anywhere else. Nothing reads run.blind yet; step 130 does.

`blind` is OPTIONAL — `=== undefined` passes — so every document already in localStorage keeps validating. toElevationDocument (617) spreads the run, so blind persists with no change there; normalizeV3Document leaves an absent blind absent, and every reader treats absent and {} the same. Don't touch either.

isBlind is in SPEC-25 §1, copy it. Each side is undefined, null, or a finite number greater than zero — that's all the validation there is. blind[side] is a cabinet BOX WIDTH in inches, not an offset, so zero and negative are invalid rather than meaningful.

Don't open elevationSlice.js (step 129), room.js (step 129) or any component.

Test 206 exactly as SPEC-25 §7.
Expect 496 passing.

At most five lines of summary. Commit "elevation-mvp: step 128 blind persisted shape".
```

**Check after 128:** nothing visible. Reload the app and confirm your existing rooms still load.

---
## Step 129 — Store and run copying

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-25.md §1 (slice and room.js), §7 test 207.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- src/elevation/store/elevationSlice.js (1,408): two places only —
  - a new setRunBlind reducer immediately after setRunCornerClearance (1059–1071)
  - the exported action list (1382 area): add setRunBlind
- src/elevation/model/room.js (1,491): two places only —
  - cloneRun (54–75): copy blind the way cornerClearance is copied one line above
  - flipRunsForWall (1455–1485): swap blind.left/blind.right the way cornerClearance is swapped
- test: src/elevation/store/__tests__/elevationSlice.test.js (1,795): APPEND one new `describe` block at the end with test 207

elevationSlice.test.js is 1,795 lines. Read its first 60 lines to pick up its imports and how it builds a store, then jump to the end and append. Do not read the middle of it — nothing there changes.

room.js is 1,491 lines. Open ONLY lines 54–75 and 1455–1485. Nothing else in that file changes: blind affects no geometry, so syncRoom, resolveHorizontal, cornerReserve and horizontalResolution are all untouched.

The reducer is in SPEC-25 §1, copy it. It does NOT call syncRoomAt — blind changes no geometry, and a sync per keystroke in the width field would be waste. Note it normalizes to a full { left, right } object so later readers never have to guess at a half-filled one.

Don't open persistence.js (step 128), model/blind.js (step 130) or any component.

Test 207 exactly as SPEC-25 §7.
Expect 497 passing.

At most five lines of summary. Commit "elevation-mvp: step 129 blind store action".
```

**Check after 129:** nothing visible.

---
## Step 130 — The blind overlay, model only

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-25.md §2, §7 tests 208–211.
If `git status` shows uncommitted changes, stop and tell me. Step 129 must be in.

Files:
- NEW src/elevation/model/blind.js (pure, ~130 lines): blindEntries, blindPartWidths, coveredRanges, isBlindCovered — exactly as SPEC §2
- NEW test src/elevation/model/__tests__/blind.test.js (208–211)
- src/elevation/model/index.js (232): export all four

No component changes and no existing module changes in this step. Nothing calls these yet; steps 131–134 do.

Imports you need, all existing:
  anchoredToCorner, cornerForRunSide from './corners.js'
  wallLength from './geometry.js'
  endCornerAnglesForRun, endMinWidthsForRun, pinTargetsForRun from './room.js'
  splitRun from './splitRun.js'

Four things to get right and nothing else:

1. The blind cabinet is the OUTERMOST piece with kind 'cabinet' on that side of layout.pieces — the first for 'left', the last for 'right'. Not the first piece, which is usually a filler or an end panel. No cabinet piece on that side means no entry and no warning.

2. The box is anchored at the FACE and grows away from the room. Left: boxX = piece.x + piece.width - W. Right: boxX = piece.x and the box reaches piece.x + W. boxX may be negative or past the wall length; that is fine and means nothing has to clamp.

3. coveredRanges compares BOX ranges — [run.z, run.z + run.height] — not verticalStart. A toe kick is recessed and hides nothing. It does NOT filter on bandsCompatible: an upper that dies into a tall blind covers the part it reaches, which is exactly the test. A corner whose type is not 'inside' yields [], so a blind at an open end is always exposed.

4. isBlindCovered sorts by start, merges anything that touches or overlaps, and is true only if ONE merged range spans [z, top]. Empty input is false. Keep it a plain function over [start, end] pairs with no room in sight — test 210 calls it with literal arrays.

blindEntries returns { entries, warnings }, never a bare array. The panel is corner-to-face, computed from the PIECE, so it does not move when the blind width changes; it is forced to null with a 'blind-needs-end' warning when the run has no end piece on that side to widen.

Don't open any component, partNumbers.js (step 131), PlanRunFootprint.jsx or PropertiesPanel.jsx.

Tests 208–211 exactly as SPEC-25 §7. Copy makeWall and the run/base helpers from src/elevation/model/__tests__/partNumbers.test.js (lines 7–58) rather than importing from another test. Every fixture run is autoCount: false with fixed item widths and no anchors, and the wall has no connections, so syncRoom leaves the layouts exactly as written and no corner is 'inside' — if a layout comes out different, the fixture is wrong, not the spec.
Expect 501 passing.

At most five lines of summary. Commit "elevation-mvp: step 130 blind overlay model".
```

**Check after 130:** nothing visible. The suite is the check.

---
## Step 131 — Part widths follow the box

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-25.md §3, §7 test 212.
If `git status` shows uncommitted changes, stop and tell me. Step 130 must be in.

Files:
- src/elevation/model/partNumbers.js (190): runParts (49–70) only — one new import, one new line, one changed line
- test: src/elevation/model/__tests__/partNumbers.test.js: add test 212 at the end

Import blindPartWidths from './blind.js'. In runParts, after the splitRun layout:

  const widths = blindPartWidths(room, view, run, settings, layout);

and report `width: widths.get(piece.id) ?? piece.width`.

That is the whole change. Which parts exist, their order and their numbers are all unchanged — a blind cabinet is one part and its panel is one part, exactly as the filler it replaces was. Do not touch orderedParts, partNumbers, wallMoldingBadges or wallBadgeGroups.

Pass the layout into blindPartWidths — runParts already has it, and letting blind.js recompute one would double the splitRun cost of every part walk.

Test 212 exactly as SPEC-25 §7; it reuses the room from test 208, so lift that fixture into a shared helper or rebuild it inline, whichever is shorter. Don't change tests 198–205.
Expect 502 passing.

At most five lines of summary. Commit "elevation-mvp: step 131 blind part widths".
```

**Check after 131:** nothing visible yet — the numbers on screen don't change, only the widths the part list will carry.

---
## Step 132 — Elevation labels

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-25.md §4.
If `git status` shows uncommitted changes, stop and tell me. Step 130 must be in.

Files:
- src/elevation/components/PieceRect.jsx (111): a new optional `subLabel = null` prop, the width Text's height, the sub-label Text, and the narrow hover Label's text
- src/elevation/components/RunGroup.jsx (~415): one import, two memos beside faceLayouts (59–63), and `subLabel=` on the PieceRect in the drawnPieces map (290–303)

The hidden part of the box is NOT drawn. PieceRect draws the piece it is given, which is already the visible piece, and that stays exactly as it is — same rect, same fill, same width text. This step only adds a line of text under the width. Do not clip, extend or re-position any rect.

The four edits to PieceRect and both memos are written out in SPEC-25 §4; copy them. With subLabel null nothing moves and nothing new draws, which is every piece in a room with no blinds.

Plain text, deliberately, not a dimension line: the inner chain measures what you can see, and the blind width is a note on the part.

RunGroup already has `result` from splitRun — pass it into blindEntries as the layout argument rather than letting it compute a second one.

Don't touch FaceOutlines, PartNumberBadges, the centerline markers, the dimension rows, ElevationCanvas.jsx or PlanRunFootprint.jsx (step 133).

No tests in this step. Run `npx vitest run` once at the end; 502 must still pass.

At most five lines of summary. Commit "elevation-mvp: step 132 blind labels".
```

**Check after 132:**
- Set a base run's left corner blind to 42 with about 21" showing: the cabinet draws exactly as before, with `Blind 42"` under its width.
- The filler beside it reads `Panel 27"` (or whatever corner-to-face comes to) when nothing covers the blind.
- Put a run of cabinets on the neighbouring wall that covers the blind's full height and the panel label goes away — the filler is back to an ordinary filler.
- A narrow filler shows both numbers in its hover tooltip.
- Nothing else on the elevation moves. Say if any dimension changed.

---
## Step 133 — Plan: draw the whole footprint

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-25.md §5.
If `git status` shows uncommitted changes, stop and tell me. Step 130 must be in.

Files:
- src/elevation/plan/PlanRunFootprint.jsx (235): one import, one blindEntries call beside the existing splitRun layout (~78–83), and one new <Line> immediately BEFORE the existing footprint <Line> (~124–130)

The polygon, its span per side and its exact props are in SPEC-25 §5; copy them. Same fill and same outline as the run, so it reads as one cabinet reaching into the corner rather than a separate object. Drawn before the footprint so the run stays on top.

Do NOT change runFootprint, footprintOutlineSegments, depthDimension, the boundary piece lines or the collision test. The extension is drawn, not modelled — footprints are built from run.x and run.width, which a blind never changes, and that is deliberate: a blind is supposed to overlap the neighbouring run and must never be flagged as a collision.

PlanRunFootprint already computes `layout` from splitRun — pass it into blindEntries rather than computing a second one.

Don't touch PlanCanvas.jsx, model/footprints.js or any elevation component.

No tests in this step. Run `npx vitest run` once at the end; 502 must still pass.

At most five lines of summary. Commit "elevation-mvp: step 133 blind plan footprint".
```

**Check after 133:**
- In plan, a blind run draws its full box reaching into the corner and overlapping the neighbouring run, in the run's own colour.
- No red collision outline appears because of the overlap.
- The depth dimension and the piece boundary lines are where they were.
- Zoom in and out: the extension scales with the run.

---
## Step 134 — Turning it on

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-25.md §6.
If `git status` shows uncommitted changes, stop and tell me. Steps 129 and 130 must be in.

Files:
- src/elevation/components/PropertiesPanel.jsx (2,182): three places only —
  - the import block (1–120): add setRunBlind to the existing store action imports (80 area) and blindEntries to the existing '../model/index.js' import
  - inside the per-side card of the Corners & anchors section, AFTER the `) : null}` that closes the anchor-kind branches (~991) and before that card's closing </div>: the Blind box Field, its helper line, and the warning lines
  - a blindEntries memo for the selected run, near where reserveParts and corners are computed for that section

PropertiesPanel.jsx is 2,182 lines. Open the import block (1–120) and the Corners & anchors section (717–995). Do not read the rest — no other section changes.

The Field, the InchInput props, the helper line and the two warning messages are in SPEC-25 §6; copy them. It goes after the `) : null}` on purpose: the field is offered on every side whatever the anchor is, not only on the anchored ones. A blind past an open wall end is unusual but not wrong.

Blank clears it — `allowBlank` with `placeholder="none"`, and setRunBlind treats a null or non-positive width as cleared.

Warnings come from blindEntries(room, wall, run, settings).warnings filtered to this side. Compute the entries ONCE in a memo for the section, not once per side.

Don't add anything to PieceProperties, EndProperties, CabinetProperties or the Corner clearance controls — cornerClearance keeps meaning exactly what it means today, and a blind is independent of it.

No tests in this step. Run `npx vitest run` once at the end; 502 must still pass.

At most five lines of summary. Commit "elevation-mvp: step 134 blind properties".
```

**Check after 134:**
- Select a run, type 42 into Blind box on the corner side, and the cabinet picks up its `Blind 42"` label and its plan footprint in one go.
- Clear the field and everything goes back.
- Type a width no bigger than what shows and the amber line says so.
- Set a run with no filler on that end blind and exposed: the amber line asks for a filler, and no panel label appears.
- Mirror the wall: the blind follows to the other side.
- Duplicate or copy the run: the blind comes with it.
