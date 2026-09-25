# Elevation Lab — PROMPTS-28 (steps 143–149)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session.

Spec: `docs/elevation-mvp/SPEC-28.md`. Steps 143 and 144 must run in order. 145 and 146 must run in order and after 144. 147 and 148 must run in order and are independent of 143–146. 149 must run after 143.

Baseline: **510 tests passing**. Confirm with `npm test` before step 143; if the number differs, shift every "expect N passing" below by the difference.

---

## Step 143 — a fourth end type

Read `docs/elevation-mvp/SPEC-28.md` §1 and §8 (step 143). Implement §1 only.

`run.ends[side].type` gains `'blind'`. A blind end lays out and measures exactly as a filler does; the type exists so the UI and step 144 can tell them apart. **`splitRun`'s output for every existing document must be byte-for-byte what it is now.**

Files, source:

```
src/elevation/model/constants.js          105
src/elevation/store/persistence.js        722   (30, 76-82, 210-221, 449-461)
src/elevation/model/splitRun.js           535   (8-16, 190-213)
src/elevation/model/room.js              1512   (385-389, 1176-1180)
src/elevation/store/elevationSlice.js    1432   (904-914, 980-990, 1080-1093)
src/elevation/components/RunGroup.jsx     430   (130-138)
src/elevation/model/blind.js              142   (89-100)
```

Files, tests:

```
src/elevation/model/__tests__/blind.test.js          227   (fixtures at 71-87)
src/elevation/store/__tests__/persistence.test.js    770
src/elevation/store/__tests__/elevationSlice.test.js 1869
```

Complete fan-out of `run.ends[…].type` in source. These are every site; do not grep for more, and do not open a file outside the list above.

```
src/elevation/model/splitRun.js:9,10,15,192,197,199   → change per §1.3
src/elevation/model/room.js:386,387                   → change per §1.4
src/elevation/model/room.js:1177,1178,1179            → change per §1.4
src/elevation/store/elevationSlice.js:912             → change per §1.5
src/elevation/store/elevationSlice.js:985,986,987     → change per §1.5
src/elevation/store/persistence.js:117                → no change (reads END_TYPES)
src/elevation/components/RunGroup.jsx:134             → change per §1.6
src/elevation/components/PropertiesPanel.jsx:207,215,220,231,235,237  → LEAVE ALONE, step 149 rewrites this whole block
src/elevation/store/elevationSlice.js:982             → LEAVE ALONE, a wall-face anchor is never a corner
src/elevation/model/soffits.js:143-156                → LEAVE ALONE, soffitEndType only ever returns 'filler' or 'end_panel'
src/elevation/store/persistence.js:471                → LEAVE ALONE, settings.defaultEnds may now also accept 'blind'; nothing writes it
```

Notes:

- `blind.test.js`'s `leftRun` (71) and `rightRun` (80) are the only fixtures that need touching: the blind side's end becomes `{ type: 'blind', width: 3 }`. Tests 208–212 and 220 must then pass **unchanged**. If any of them still fails, the change in `splitRun` is wrong, not the test.
- `cloneRun` (`room.js` 57–60) and `flipRunsForWall` (`room.js` 1478) already copy `ends` whole. Do not touch them.
- Do not touch `model/faceLayouts.js`, `model/partNumbers.js`, `model/corners.js` or any plan file. A blind end's piece is still `kind: 'filler'`, so they see nothing new.

While iterating, run only the one test file you are editing. Run `npm test && npm run lint` once, at the end. Don't run `npm run build` — Kyle runs that by hand.

Expect 513 passing. Summary: at most five lines — what changed, what surprised you, what you left undone.

---

## Step 144 — a blind end's defaults

Read SPEC-28 §2 and §8 (step 144). Implement §2 only.

An end whose type is `'blind'` orders a 6" filler and has no return, without either number being stored on the run.

Files, source:

```
src/elevation/model/planPieces.js   127   (whole file)
src/elevation/model/blind.js        142   (128-142)
src/elevation/model/index.js        241   (149)
```

Files, tests:

```
src/elevation/model/__tests__/planPieces.test.js   185
src/elevation/model/__tests__/blind.test.js        227
```

Notes:

- `fillerOrderedWidth` and `fillerReturnDepth` are the only new exports. `fillerSpan` and `fillerReturns` call them instead of reading `run.endFiller` inline; `planRunPieces`'s returned shape does **not** change in this step.
- `fillerReturns` must emit nothing when the resolved return depth is `<= 0`.
- `blindPartWidths` already receives `settings`; do not change its signature.
- Do not touch `PlanRunFootprint.jsx`, `PropertiesPanel.jsx` or the store. Nothing in this step is user-visible except in plan.

Test loop and summary as in step 143. Expect 515 passing.

---

## Step 145 — plan boxes, not a slab

Read SPEC-28 §3 and §8 (step 145). Implement §3 only. Do not draw anything.

`planRunPieces` returns `{ span, boxes, faces, returns }`. `box` and `divisions` are gone; each cabinet gets its own box at its true width, and an end panel's face runs from the wall to the front of the doors.

Files, source:

```
src/elevation/model/planPieces.js   ~140 after step 144   (whole file)
src/elevation/model/index.js         241                  (149)
```

Files, tests:

```
src/elevation/model/__tests__/planPieces.test.js   ~230 after step 144
```

Notes:

- `planRunPieces` has exactly one caller in source, `src/elevation/plan/PlanRunFootprint.jsx:94`. **Do not open or edit it in this step** — step 146 rewrites it. The app is visibly broken between these two steps; that is expected.
- `blindEntries` is still what widens a blind cabinet's box. Keep the `extension > 1e-6` filter; a blind no wider than its cabinet leaves the box at the piece's own span.
- `topFaces` does not change.
- Test 219 does not change. Tests 217 and 218 change only where §8 says.

Test loop and summary as in step 143. Expect 517 passing.

---

## Step 146 — draw the boxes

Read SPEC-28 §4. Implement §4 only. No tests.

Files, source:

```
src/elevation/plan/PlanRunFootprint.jsx   276
```

Notes:

- One closed polygon per entry in `boxes`, each with its own `footprintOutlineSegments` call. Keep the existing fills, stroke weights, dashes and the `hitStrokeWidth={8 / scale}`.
- Faces become `listening` so a filler or an end panel is clickable; returns stay `listening={false}`; outline lines stay `listening={false}`.
- Face fill by kind: `face` → the run colour, `filler` → `KIND_COLORS.filler`, `end_panel` → `KIND_COLORS.end_panel`, each keeping the `8c` / `59` opacity suffix the run already uses.
- `boxPoints`, `centerX`, `topY` and the `divisions` block all go. The collision tooltip anchors at the centre of `span` at the run's back edge.
- Drop `KIND_COLORS.cabinet` from the import only if nothing else in the file uses it.
- Touch nothing else in `src/elevation/plan/`. `runFootprint`, `depthDimension` and the collision props are unchanged.

Run `npm test && npm run lint` once, at the end. Summary at most five lines.

---

## Step 147 — a phantom's width joins its band

Read SPEC-28 §5 and §8 (step 147). Implement §5 only. Do not touch `ElevationCanvas.jsx` or `dimensionLayout.js` — that is step 148, and until it runs the phantom is dimensioned twice. That is expected.

Files, source:

```
src/elevation/model/neighborProfiles.js   97    (76-92)
src/elevation/model/dimensions.js        430    (150-240)
```

Files, tests:

```
src/elevation/model/__tests__/wallExtent.test.js   215   (tests 189, 213)
src/elevation/model/__tests__/dimensions.test.js   616
```

Complete fan-out of `neighborProfiles` in source — adding a field to its entries affects none of them:

```
src/elevation/model/wallExtent.js:42-45                 → no change
src/elevation/components/NeighborProfiles.jsx           → no change
src/elevation/components/ElevationCanvas.jsx:66,217     → step 148
```

Notes:

- A neighbour segment carries `wallId` and `neighborRunId` and **never** `runId`. The overall row's click and drag handlers key off `runId`, and that run is on another wall.
- Per side, per band, only the phantom that reaches furthest is kept, clamped to the runs' own range so both chains stay contiguous. There is no dedup step — the furthest one wins.
- `rangeStart` and `rangeEnd` keep their current definitions. They are the runs' range; the phantoms clamp to them and extend the chain past them.
- Two other test files call `horizontalChains`: `landings.test.js:379` (test 151) and `wallSides.test.js:310` (test 113). Their rooms should produce no phantoms, so both should pass untouched. If one of them gains a leading or trailing `kind: 'neighbor'` segment, add it to the expectation and say so in the summary — do not change `dimensions.js` to suppress it.
- `dimensions.test.js` tests 2, 3, 4 and 13 use inside-corner and single-wall rooms, which produce no phantoms (`wallExtent.test.js` test 190 asserts exactly that for an inside corner). They must pass unchanged.

Test loop and summary as in step 143. Expect 519 passing.

---

## Step 148 — drop the phantom row

Read SPEC-28 §6. Implement §6 only.

Files, source:

```
src/elevation/canvas/dimensionLayout.js      91    (18-31)
src/elevation/components/ElevationCanvas.jsx 1805  (66, 217-233, 427, 432, 476, 502, 529, 1253-1260, 1642-1650)
```

Files, tests:

```
src/elevation/canvas/__tests__/dimensionLayout.test.js   103   (tests SPEC-10 1, 2, 3)
```

Notes:

- Every line to remove is listed in §6 with its number. This is a deletion step plus one guard line in `handleRunSegmentClick`; do not refactor anything else in `ElevationCanvas.jsx`, and do not open `DimensionRow.jsx` — `KIND_COLORS.neighbor` stays.
- `NeighborProfiles.jsx` keeps drawing the outlines and keeps its own `neighborProfiles` import. Do not touch it.
- The three expected objects in `dimensionLayout.test.js` are given literally in §8 (step 148).

Test loop and summary as in step 143. Expect 519 passing.

---

## Step 149 — one card per end

Read SPEC-28 §7. Implement §7 only. No tests.

Files, source:

```
src/elevation/components/PropertiesPanel.jsx   2231   (111-115, 205-247, 726-1046, 1147-1164)
```

This is the most expensive file in the repo — run this step alone, at the start of a window.

Notes:

- Delete the standalone **Ends** section (the `<section>` at 1147 through its closing tag) and the `EndEditor` function (205–247) with it. Rename the **Corners & anchors** heading (726–728) to **Ends & corners**.
- The type select and the type-dependent fields go at the **top** of each side card, before the corner label. The anchor select, the clearance fields, `anchorDescription` and the blind warnings stay exactly where they are, below.
- The `Blind box`, `Filler width` and `Filler return` fields at 1000–1032 are replaced by the table in §7 — same actions, new labels, new placeholders, shown only for the types that have them.
- `setRunEnd`, `setRunBlind` and `setRunEndFiller` are all already imported (79–80, and `setRunEnd` is used at 611 via `changeEnd`). `changeEnd` (611) becomes unused once the Ends section is gone — remove it.
- Keep every `aria-label` exactly as §7 spells it; the existing ones are `${side} blind box width`, `${side} end filler ordered width` and `${side} end filler return depth`, unchanged.
- Do not touch `components/properties/*`, `properties/helpers.js` or any other panel section.

Run `npm test && npm run lint` once, at the end — 519 passing, unchanged. Summary at most five lines.
