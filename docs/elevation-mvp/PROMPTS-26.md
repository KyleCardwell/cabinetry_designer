# Elevation Lab — Codex Prompts, Steps 135–137 (phantom moldings, phantom dimension)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, and commit pending work first, including these docs.

**Order:** 135 first. 136 and 137 both need it, and are independent of each other.

**SPEC-27 is independent of this file.** Its steps touch plan view only; these three touch elevation only. Run them in either order, or interleaved.

**Codex can't open the app**, so don't plan browser checks. Kyle checks each step by hand.

**The gate is the same for every step:** while iterating, run only `npx vitest run <the named test file>`, or `npx vitest run` once at the end for the steps with no tests. Run `npm test && npm run lint` once, at the end. Don't run `npm run build`. Line numbers are as of `0607b09`.

**One step reads a big file** — 137 touches `ElevationCanvas.jsx` (1,761 lines, ~22k tokens to read whole). It writes little and has no test loop, so it should cost one read: its prompt names the five regions to open, and the rest of the file is never opened.

---
## Step 135 — Neighbour outlines carry their moldings, model only

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-26.md §1, §4 tests 189, 213, 214.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- src/elevation/model/neighborProfiles.js (67): three new imports and a `moldings` array on every entry it returns
- src/elevation/model/wallExtent.js (48): the neighborProfiles loop (42–45) also grows extent.top for the strips
- test: src/elevation/model/__tests__/wallExtent.test.js (173): edit test 189, add tests 213 and 214

No component changes in this step. Step 136 draws them.

New imports in neighborProfiles.js:
  CABINET_TYPE_IDS from './constants.js'
  resolveProfile from './profile.js'
  runMolding from './soffits.js'
Neither profile.js nor soffits.js imports neighborProfiles.js or wallExtent.js, so there is no cycle. Don't restructure anything to avoid one.

The three molding tests and their rects are in SPEC-26 §1. They are the same conditions RunGroup.jsx already draws by — if you want to confirm them, read RunGroup.jsx lines 86–130 only and change nothing there. Use the NEIGHBOUR's own profile, resolveProfile(settings, room, neighbor), and the neighbour's side view, wallSideView(neighbor, side), which the loop already has in scope.

Entries are in ['toeKick', 'topMold', 'crown'] order, and the array is [] for a run carrying none. moldings carries only the vertical band — z and height — because the drawing side reads x and width off the profile entry itself.

Test 189 (86–112) gains `moldings: [{ kind: 'toeKick', z: 0, height: 4 }]` on both expected entries and changes in no other way. Test 190's expectations are [] either way. Test 191 does not change.

Tests 213 and 214 exactly as SPEC-26 §4; every number in them is stated, none derived.
Expect 504 passing.

At most five lines of summary. Commit "elevation-mvp: step 135 neighbour profile moldings".
```

**Check after 135:** nothing visible. The suite is the check.

---
## Step 136 — Draw them, and drop the floating dimension

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-26.md §2.
If `git status` shows uncommitted changes, stop and tell me. Step 135 must be in.

Files:
- src/elevation/components/NeighborProfiles.jsx (56): whole file, back down to ~35 lines

Two changes:
1. DELETE the width dimension across the middle of each outline — the Line, the two tick Lines, the Text, the four constants (DIMENSION_FONT_SIZE, TICK_HALF_LENGTH, TEXT_BOX_WIDTH, MIN_DIMENSION_PX) and the formatInches import. Step 137 puts that number in the dimension stack below the floor instead, which is where it belongs.
2. After the outline Rect, one Rect per entry in profile.moldings, at
   wallRectToScreen({ x: profile.x, z: molding.z, width: profile.width, height: molding.height }, transform).
   The three fills, opacities and strokes are in SPEC-26 §2; copy them. strokeWidth 1, listening={false}.

The outline Rect itself does not change — solid, stroke "#64748b", strokeWidth 1.

The molding fills are RunGroup's own colours at lower opacity on purpose, so a neighbour still reads as behind this wall rather than as part of it.

Don't touch neighborProfiles.js (step 135), ElevationCanvas.jsx (step 137), NeighborReturns.jsx or RunGroup.jsx.

No tests in this step. Run `npx vitest run` once at the end; 504 must still pass.

At most five lines of summary. Commit "elevation-mvp: step 136 draw neighbour moldings".
```

**Check after 136:**
- A neighbouring base run reaching into the elevation shows its toe kick; an auto-height upper shows its top mold and crown.
- The outline no longer carries a dimension through its middle — that comes back at the bottom in step 137.
- A neighbour with crown is no longer clipped at the top of the drawing.

---
## Step 137 — The phantom width joins the stack, and rows stop stretching their leaders

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-26.md §3.
If `git status` shows uncommitted changes, stop and tell me. Step 135 must be in.

Files:
- src/elevation/canvas/dimensionLayout.js (~90): belowRowOffsets (17–29) gains a `neighbors` level between openings and label
- src/elevation/components/DimensionRow.jsx (336): KIND_COLORS (12–26) gains `neighbor`, and one new optional prop `edgeGapPx = 0` used in the boundaries map (125–146)
- src/elevation/components/ElevationCanvas.jsx (1,761): five regions only —
  - the import block (45–112): add neighborProfiles from '../model/neighborProfiles.js'
  - the dimensionChains memo (198–225): build and return the `neighbors` chain
  - baseTransform (405–419): bottom padding grows for the extra row, plus the new dependency
  - the dimensionOffsets memo (444–510): measure the neighbour levels, return `neighbors`, and return `clear`
  - the dimension Layer (1569–1695): the new DimensionRow after the openings row (1605–1614), and edgeGapPx on every existing DimensionRow

ElevationCanvas.jsx is 1,761 lines. Open only those five regions.

Everything — belowRowOffsets in full, the dedupe, the new row's props, the leader change — is written out in SPEC-26 §3. Copy it.

Two things to understand so neither goes sideways:

1. The neighbours chain is NOT contiguous. A left-hand phantom and a right-hand one leave a gap across the whole wall. DimensionRow already copes: it draws a leader and a tick per boundary value and a line per segment, with nothing between. Do not pad it with filler segments, and do not touch horizontalChains — this row is built straight from neighborProfiles and has nothing to do with this wall's runs.

2. The dedupe is load-bearing. A base and an upper on the same neighbouring wall project the same span at different heights, and that wants ONE dimension, not two stacked on each other.

edgeGapPx is three lines: the leader Line in the boundaries map starts at `edge + outward * edgeGapPx` instead of at `edge`. Nothing else moves — rowPoint, the ticks, the wall end marks, the segments and the labels all stay measured from offsetPx. dimensionOffsets already adds clear.below / clear.above / clear.left / clear.right to every offset; this step just also returns those four so each row can be told where its leaders should start. The result is a row that was pushed out to clear an overhang drawing the same size it would against a bare wall, instead of with stretched leaders running through the thing it moved out to clear.

Don't touch NeighborProfiles.jsx (step 136), model/dimensions.js, model/wallExtent.js or any model file.

No tests in this step. Run `npx vitest run` once at the end; 504 must still pass.

At most five lines of summary. Commit "elevation-mvp: step 137 neighbour dimension row and leader gap".
```

**Check after 137:**
- The width a neighbouring run reaches into the elevation is dimensioned below the floor, under the opening widths, above the elevation label.
- A wall with a phantom at each end shows two dimensions in that row with nothing between them.
- A neighbouring base and upper projecting the same amount give one dimension, not two.
- The vertical dimension columns on a wall with a phantom no longer run their leaders through it, and read the same size as on a wall without one.
- The elevation label has moved down a row; say if it now sits too low.
