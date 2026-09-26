# Elevation Lab — Codex Prompts, Steps 191–200 (round 35: tops, parts below, stacked runs, outset)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, and commit pending work first, including these docs.

**Every step in this round** (35 is done after 200; then round 36, face frame on cells):

| Step | What | Tests after |
|---|---|---|
| 191 | Shape: any top, `run.bottom`, `run.stack`, `run.outset`, three settings; saves accept them | 644 |
| 192 | Model: `runTop`; REV-002 on any type, top cells only | 648 |
| 193 | Tops in chains, part numbers, neighbour profiles, extents | 650 |
| 194 | Tops on screen + the Top select on every run type | 651 |
| 195 | Model: parts below a run, REV-011, end panels drop to the doors | 654 |
| 196 | Parts below on screen + "Below the run" in the panel | 655 |
| 197 | Model: stacked runs (sits on / held under, one-way, fill between) | 660 |
| 198 | One vertical chain per stack; parts below in the ordinary chain | 662 |
| 199 | Stacks in the panel; no toe kick under a stacked run | 663 |
| 200 | Outset: plan, corners, panel | 665 |

**Branch:** `elevation-grid-run-split`. **Baseline is 642 passing** at `127d7bc` (step 190). Confirm with `npm test` first; if it differs, shift every count below by the difference.

**Expected values were worked out on paper** (SPEC-35, top); the values that describe today's behaviour were checked against the current code. If a new test fails by a small amount, compare the SPEC's arithmetic with the code before changing the code, and say which was wrong. If an EXISTING test outside the named files breaks, stop and tell me rather than editing it.

**Line numbers** are against `127d7bc` unless a prompt says otherwise. When an earlier step in this round has already edited a file, find the spot by name.

---
## Step 191 — Shape (inert)

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-35.md §1 and §2.
If `git status` shows uncommitted changes, stop and tell me.

Shape step only (PROMPT-CONVENTIONS rule 4): nothing reads the new fields yet and the app behaves exactly as before. run.top accepts 'crown' | 'topMold' | 'none' as well as 'stone' | 'wood'; runs may carry run.bottom (a list of parts below), run.stack ({ below, above } links) and run.outset; three new settings; saves accept all of it.

Files (only these; line numbers at 127d7bc):
- src/elevation/model/constants.js (117) — DEFAULT_SETTINGS: belowRunOverhang, belowRunFlushReveal, bottomPartHeights after standardDrawerBelow (87), verbatim from SPEC §2.
- src/elevation/model/styles.js (207) — line 19 only: RUN_TOP_OPTIONS gains 'crown', 'topMold', 'none'.
- NEW src/elevation/model/bottoms.js — verbatim from SPEC §2.
- src/elevation/model/index.js (315) — the bottoms.js export block after the faceLayouts export (56).
- src/elevation/model/room.js (1564) — cloneRun (59–88) deep-copies run.bottom and run.stack, verbatim, after the endFiller spread. Nothing else in room.js.
- src/elevation/store/persistence.js (620) — import isBottomPart; three keys in V2_DEFAULTED_SETTING_KEYS after 'standardDrawerBelow' (93); isStackLink and isRunStack above isRun (198); three conditions in isRun after the run.top line (214). Verbatim from SPEC §2.
- src/elevation/store/__tests__/persistence.test.js (974) — describe('SPEC-35 run shape') at the end, verbatim (2 tests).

DO NOT touch the slice, any component, or any other model file. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/store/__tests__/persistence.test.js`. At the end `npm test && npm run lint` once: 642 + 2 = 644. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 191 run top, bottom, stack and outset shape".
```

---
## Step 192 — runTop and REV-002 on any type

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-35.md §1 and §3. Step 191 is in.
If `git status` shows uncommitted changes, stop and tell me.

Pure model step. New tops.js answers "what top does this run carry": run.top if set, otherwise today's default (none when held under another run, stone on a base, the soffit's molding or crown on an auto upper/tall, else none), with its height. cabinetReveals takes runEdges ({ top, bottom }: is this cabinet's top/bottom the run's?) and applies REV-002 (wood top, 1/8") on any run type, only where runEdges.top. runFaceLayouts computes runEdges per piece. Nothing on screen uses runTop yet (steps 193–194).

Files (only these; line numbers at 127d7bc):
- NEW src/elevation/model/tops.js — verbatim from SPEC §3.
- src/elevation/model/index.js — export TOP_LABELS, defaultRunTop, isCountertop, runTop from tops.js, after the bottoms block.
- src/elevation/model/styles.js (207) — line 4 becomes `const { UPPER, TALL } = CABINET_TYPE_IDS;`; cabinetReveals (122–168) gains the runEdges parameter (default { top: true, bottom: true }) and the wood rule (141–143) becomes the SPEC's. Nothing else.
- src/elevation/model/faceLayouts.js (80) — runEdges computed before cabinetReveals (55) and passed to it.
- NEW src/elevation/model/__tests__/tops.test.js — verbatim, the first describe only (4 tests).

Existing wood-top tests call cabinetReveals without runEdges; the default keeps them passing.

DO NOT touch dimensions, partNumbers, neighborProfiles, wallExtent, RunGroup, soffits.js or profile.js. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/tops.test.js src/elevation/model/__tests__/styles.test.js src/elevation/model/__tests__/faceLayouts.test.js`. At the end `npm test && npm run lint` once: 644 + 4 = 648. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 192 run tops in the model".
```

---
## Step 193 — Tops in chains, part numbers, profiles and extents

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-35.md §4. Steps 191–192 are in.
If `git status` shows uncommitted changes, stop and tell me.

Four model files decided "countertop on a base, crown/top mold on an auto upper or tall" by type. They now ask runTop. With run.top unset every result is the same as today — every existing test must pass unchanged.

Files (only these; line numbers at 127d7bc):
- src/elevation/model/dimensions.js (467) — import resolveProfile only from profile.js (9) and isCountertop, runTop from tops.js; delete profileForRun (370–377); in verticalChains the countertop block (408–416) and the molding block (430–440) become the SPEC's. Nothing else.
- src/elevation/model/partNumbers.js (238) — drop the runMolding import (11) and MOLDING_TYPES (24); import runTop; carriesMolding (44–52) after the toeKick branch per SPEC.
- src/elevation/model/neighborProfiles.js (98) — drop the runMolding import (10); import runTop; lines 55–58 become one `top` line; the conditions at 67 and 70 per SPEC.
- src/elevation/model/wallExtent.js (51) — replace with the SPEC's file.
- src/elevation/model/__tests__/tops.test.js — add the two imports; describe('SPEC-35 tops in chains and part numbers') at the end, verbatim (2 tests).

DO NOT touch RunGroup, the slice, soffits.js, profile.js or tops.js. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/tops.test.js src/elevation/model/__tests__/dimensions.test.js src/elevation/model/__tests__/partNumbers.test.js src/elevation/model/__tests__/wallExtent.test.js`. At the end `npm test && npm run lint` once: 648 + 2 = 650. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 193 tops in chains, part numbers and profiles".
```

---
## Step 194 — Tops on screen

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-35.md §5. Steps 191–193 are in.
If `git status` shows uncommitted changes, stop and tell me.

RunGroup draws the countertop / top mold / crown from runTop instead of from the run type (a wood top is drawn a little warmer). The panel's Top select shows on every run type, with a "Default · <today's top>" choice that clears run.top. setRunFaceOptions re-syncs the room.

Files (only these; line numbers at 127d7bc):
- src/elevation/components/RunGroup.jsx (533) — runTop import replaces runMolding (23); lines 146–151 become `const top = runTop(wall, run, profile);`; delete isBase (177); countertop height (192); the three JSX conditions (330, 341, 351) and the countertop fill. All per SPEC §5. Nothing else in this file.
- src/elevation/components/properties/RunFaceOptions.jsx (60) — replace with the SPEC's file.
- src/elevation/store/elevationSlice.js (1643) — setRunFaceOptions (1456–1465) adds syncRoomAt after its loop. Nothing else.
- src/elevation/store/__tests__/elevationSlice.test.js — describe('SPEC-35 run top reducer') right after describe('styles and reveals') (ends 1196), verbatim.

Match the classes already used in these files. DO NOT touch the model. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/store/__tests__/elevationSlice.test.js`. At the end `npm test && npm run lint` once: 650 + 1 = 651. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 194 run tops drawn and in the panel".
```

---
## Step 195 — Parts below a run and REV-011

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-35.md §1 and §6. Steps 191–194 are in.
If `git status` shows uncommitted changes, stop and tell me.

Pure model step. run.bottom lists parts below the box, top to bottom (light rail, trough, panel, cap, corbels), each with a height and doors: cover | flush | visible. REV-011 sets the bottom reveal of Euro cabinets at the run's bottom: covered parts (counted from the top down) → −covered − 1/8; else a flush top part → 1/8; else standard. panelDrop drops Euro end panels and fillers to the doors. The upper's existing Bottom option stays; REV-011 overrides it when parts exist.

Files (only these; line numbers at 127d7bc):
- src/elevation/model/bottoms.js — append runBottomParts, runBottomHeight, belowRunReveal, verbatim from SPEC §6.
- src/elevation/model/index.js — the bottoms block adds belowRunReveal, runBottomHeight, runBottomParts.
- src/elevation/model/styles.js — import belowRunReveal; REVEAL_SOURCE_LABELS (21–30) adds 'rule:below-run'; the REV-011 lines right after the upper-bottom rule (144–147); panelDrop (203–207) replaced. All verbatim.
- NEW src/elevation/model/__tests__/bottoms.test.js — verbatim (3 tests).

faceLayouts.js already passes runEdges (step 192); don't change it.

DO NOT touch RunGroup, dimensions, the slice or any component. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/bottoms.test.js src/elevation/model/__tests__/styles.test.js src/elevation/model/__tests__/faceLayouts.test.js`. At the end `npm test && npm run lint` once: 651 + 3 = 654. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 195 parts below a run and REV-011".
```

---
## Step 196 — Parts below on screen

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-35.md §7. Steps 191–195 are in.
If `git status` shows uncommitted changes, stop and tell me.

RunGroup draws each part below the run as a band under the box (corbels dashed). A new "Below the run" panel section lists the parts top to bottom — height, doors (cover isn't offered for a cap or corbels), move up/down, remove — and an "Add a part below…" select. One reducer, setRunBottom, replaces the whole list after validating it.

Files (only these):
- src/elevation/components/RunGroup.jsx — import runBottomParts; bottomParts after the crown rect (find `const crown` by name); their Rects right after the crown JSX. Verbatim from SPEC §7. Nothing else.
- NEW src/elevation/components/properties/RunBottomSection.jsx — verbatim.
- src/elevation/components/properties/RunProperties.jsx (102) — import it; render it right after <RunFaceOptions … /> (97).
- src/elevation/store/elevationSlice.js — import isBottomPart from ../model/bottoms.js; setRunBottom after setRunFaceOptions; export it after `setRunFaceOptions,` in the actions list.
- src/elevation/store/__tests__/elevationSlice.test.js — add setRunBottom to the slice import; describe('SPEC-35 parts below reducer') right after describe('SPEC-35 run top reducer'), verbatim.

Match the classes already used in these files. DO NOT touch the model. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/store/__tests__/elevationSlice.test.js`. At the end `npm test && npm run lint` once: 654 + 1 = 655. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 196 parts below a run in the panel and canvas".
```

---
## Step 197 — Stacked runs (model)

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-35.md §1 and §8. Steps 191–196 are in.
If `git status` shows uncommitted changes, stop and tell me.

Pure model step. run.stack.below = { runId, offset }: this run's lowest point sits on that run's top part (countertop, crown…) plus the gap. run.stack.above: its highest point sits under that run's lowest part below, minus the gap. Both → it fills between; one only → a manual run keeps its height, an auto run keeps its other edge. One-way, like 34.3's follow anchors: syncRoom resolves stacks leaders-first after the auto-height pass; a loop keeps its stored heights; links to missing / self / other-side runs are pruned. joinStack makes a link (refusing stack-no-overlap, stack-cycle, or a placement error). A stacked run starts at its own z for overlap checks.

Files (only these; line numbers at 127d7bc):
- NEW src/elevation/model/stacks.js — verbatim from SPEC §8.
- src/elevation/model/room.js — import pruneStacks, resolveStacks, stackCreatesCycle from ./stacks.js; syncRoom line 542 adds pruneStacks; the vertical pass's `return { ...wall, runs };` (609) becomes `return resolveStacks({ ...wall, runs }, profile);`; joinStack right after tryPlaceRun (734–748), verbatim. Edit from the bottom up so the line numbers hold. Nothing else.
- src/elevation/model/overlap.js (56) — verticalStart (6–11) per SPEC.
- src/elevation/model/index.js — the stacks.js export block; joinStack in the room.js block after joinEdges.
- NEW src/elevation/model/__tests__/stacks.test.js — verbatim, the first describe only (5 tests).

A wall with no stack links must resolve exactly as before: resolveStacks returns the wall untouched when no run has a link.

DO NOT touch joints.js, joinEdges, stretchRun, moveRun, dimensions, persistence, the store or any component. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/stacks.test.js src/elevation/model/__tests__/follow.test.js src/elevation/model/__tests__/joints.test.js src/elevation/model/__tests__/dimensions.test.js`. At the end `npm test && npm run lint` once: 655 + 5 = 660. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 197 stacked runs in the model".
```

---
## Step 198 — One vertical chain per stack

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-35.md §9. Steps 191–197 are in.
If `git status` shows uncommitted changes, stop and tell me.

pickColumnRuns returns the joined stack (as `stack`) when the column's run is stacked with others, and verticalChains then draws one chain up it: toe kick | box | countertop | box | cap | box | crown. The ordinary base/upper chain shows an upper's parts below as 'bottom' segments inside the clearance. ElevationCanvas already passes pickColumnRuns straight into verticalChains, so it doesn't change.

Files (only these; line numbers at 127d7bc, before step 193's edits shifted dimensions.js — find functions by name):
- src/elevation/model/dimensions.js — imports runBottomParts and stackOf; the current pickColumnRuns renamed to an unexported pickColumnPair with the new exported pickColumnRuns below it; stackChain above verticalChains; verticalChains' signature and first line; the upperRun block. All verbatim from SPEC §9.
- src/elevation/model/index.js — stackChain in the dimensions block.
- src/elevation/model/__tests__/stacks.test.js — add the dimensions import; describe('SPEC-35 stack chain') at the end, verbatim (2 tests).

Every existing pickColumnRuns and verticalChains test must pass unchanged.

DO NOT touch ElevationCanvas, stacks.js, tops.js or any component. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/stacks.test.js src/elevation/model/__tests__/dimensions.test.js`. At the end `npm test && npm run lint` once: 660 + 2 = 662. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 198 one vertical chain per stack".
```

---
## Step 199 — Stacks in the panel

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-35.md §10. Steps 191–198 are in.
If `git status` shows uncommitted changes, stop and tell me.

The Heights section gets "Sits on" and "Held under" selects (runs on the same wall side that overlap this one), a Gap field and a description ("Sits on Base 0"–60" · flush") for each link. A stacked run's Z is read-only, and its Height too when both sides are linked. Three reducers: joinRunStack (joinStack; its refusal goes to state.message), setRunStackOffset, freeRunStack. RunGroup draws no toe kick under a run that sits on another.

Files (only these; line numbers at 127d7bc):
- src/elevation/store/elevationSlice.js — joinStack in the room.js import (48–58); joinRunStack, setRunStackOffset, freeRunStack right after setRunJointOffset (1040–1049), verbatim; exported after `setRunJointOffset,` in the actions list. Nothing else.
- src/elevation/store/__tests__/elevationSlice.test.js — add the three to the slice import; describe('SPEC-35 stack reducers') right after describe('SPEC-34.3 follow reducers'), verbatim.
- src/elevation/components/properties/RunHeightsSection.jsx (131) — imports; links/stacked/filled after overrideFields (47); the manual Z and Height fields read-only per SPEC (100–115); the stack block before the Reset button (118), verbatim.
- src/elevation/components/RunGroup.jsx — hasToeKick per SPEC (find it by name). Nothing else.

Match the classes already used in these files. DO NOT touch the model. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/store/__tests__/elevationSlice.test.js`. At the end `npm test && npm run lint` once: 662 + 1 = 663. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 199 stacked runs in the panel".
```

---
## Step 200 — Outset

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-35.md §1 and §11. Steps 191–199 are in.
If `git status` shows uncommitted changes, stop and tell me.

run.outset is the distance from the wall to the back of the run (default 0). frontDepth includes it, so corner reserves, blind panels, neighbour returns, wall end panels and plan markers see the real front with no other change. The plan footprint's back, the plan boxes / faces / returns, and the neighbour profile's back move out by it. The Geometry section gets an Outset field next to Depth.

Files (only these; line numbers at 127d7bc):
- src/elevation/model/corners.js (222) — frontDepth (19–22) per SPEC.
- src/elevation/model/footprints.js (133) — runFootprint (7–15): the two back points at `run.outset ?? 0`.
- src/elevation/model/planPieces.js (237) — planRunPieces (165–): outset, faceFront (167), frontLine (177), and the shift on the returned boxes/faces/returns (228–236), per SPEC.
- src/elevation/model/neighborProfiles.js — line 39 per SPEC (line numbers as at 127d7bc; step 193 didn't move it).
- src/elevation/components/properties/RunGeometrySection.jsx (139) — the Outset field after Depth (79–85), verbatim.
- NEW src/elevation/model/__tests__/outset.test.js — verbatim (2 tests).

DO NOT touch the other frontDepth callers (blind.js, wallEndPanels.js, NeighborReturns.jsx, PlanRunFootprint.jsx, elevationMarkers.js) — they pick the outset up through frontDepth. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/outset.test.js src/elevation/model/__tests__/planPieces.test.js src/elevation/model/__tests__/footprints.test.js src/elevation/model/__tests__/blind.test.js src/elevation/model/__tests__/roomsCorners.test.js`. At the end `npm test && npm run lint` once: 663 + 2 = 665. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 200 run outset".
```

---

**Check after 200 (by hand):**

1. Nothing set: an existing room looks and dimensions exactly as before (countertops on bases, crown on auto uppers and talls, nothing on manual ones).
2. Top: set a base to Crown, a tall to Shop-built wood top, an upper to None. Each draws its new top; the wood-topped cabinets get a 1/8" top reveal (panel shows "rule: wood top"); the crown shows up as a part number on a base-only wall. Set one back to Default.
3. Below the run: on an upper, add a light rail (covered). The doors drop to −1 5/8" ("rule: part below") and the end panels follow them down. Switch it to flush (1/8") and visible (standard). Add a bottom cap under it: Cover isn't offered for the cap. Reorder and remove.
4. The budgeted room: base run; upper run with a bottom cap; draw a run between them (upper type, manual height). Heights → Sits on: the base; Held under: the upper. It fills from the countertop to the cap; Z and Height go read-only; the description reads "Sits on Base … · flush". Put one 3/4" back panel between end panels in it.
5. Change the base's box height, then the upper's clearance: the middle run refits both times. Give it a 1" gap below.
6. The left vertical chain reads toe kick | box | countertop | box | cap | box | crown for that stack.
7. Try Sits on for the base with the middle run as its leader: refused with `stack-cycle`. Stack a tall on a base: allowed, and no toe kick under the tall.
8. Outset: set a run's outset to 2". Plan shows it 2" off the wall; the Front depth read-out grows by 2"; a run in the corner next to it reserves 2" more.
9. Reload: it all comes back.

**Then round 35 is done.** Tell me when 200 is in and anything that still feels off, and I'll write SPEC-36 and PROMPTS-36 (face frame on cells: gaps between boxes, frame regions, stiles and rails from reveals, opening dimensions).
