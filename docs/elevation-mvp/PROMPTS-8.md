# Elevation Lab — Codex Prompts, Steps 26–31 (gestures, positions, pins, clearances)

Commit pending work first. Run in order.
Codex cannot open the app (it's behind a login), so don't plan browser checks: rely on unit tests, `npm run build` and `npm run lint`.

Steps 26 and 27 are independent of each other; 28 needs 27; 31 needs 29. Running them in order is the safe path.

---
## Step 26 — Two bug fixes and crown by total height

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-8.md completely (source of truth; earlier SPEC files still apply). This step covers SPEC-8 §1, §2, §3 and tests 1–5.
If `git status` shows uncommitted changes, stop and tell me.

1. §1 — replace stage-drag panning with pointer-event panning in BOTH components/ElevationCanvas.jsx and plan/PlanCanvas.jsx. Neither Stage stays draggable, no component calls stage.position() to undo its own drag, and the view updates live on pointermove instead of only on release. First, say in your summary what the actual root cause of the snap-back was — I want to know, even though the fix replaces the mechanism.
2. §2 — an opening is draggable only when it is selected, in components/OpeningShape.jsx and plan/PlanOpening.jsx, with the cursor change described there.
3. §3 — crown by total height:
   - model/constants.js: DEFAULT_PROFILE swaps crownOverlap for crownStackHeight: 6.
   - model/profile.js: moldingStack returns profile.crownStackHeight; add the derived crownOverlap(profile) helper and export it from model/index.js.
   - store/persistence.js: bump ELEVATION_SCHEMA_VERSION to 3 with key cd.elevationLab.v3, keep the v2 key and validator for rollback the way v1 is kept today, and add migrateV2Document per §3 covering settings.defaultProfile, every room.profile and every partial wall.profile.
   - components/RoomHeightsPanel.jsx: Top mold, Crown and Crown total inputs, with the read-only Overlap / Gap line.
4. Tests 1–5. `npm test`, `npm run build` and `npm run lint` must pass. All existing tests must keep passing; if one legitimately changes, say which and why.

Commit "elevation-mvp: step 26 pan fix, opening select-to-move, crown total".
```
---
## Step 27 — Live numeric entry

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-8.md §4.

1. New canvas/useLiveEntry.js with exactly the API in §4.1. Pure state logic, no Konva, no Redux — unit-test it directly: update() is ignored once typed, commit() prefers a parseable typed value and otherwise takes entry.value, clamping works, beginning a second entry cancels the first.
2. New components/LiveEntryInput.jsx per §4.2 — an absolutely positioned HTML input inside the canvas container, NOT a Konva node. Auto-focus, Enter commits, Esc cancels, follows the pointer and stays inside the container.
3. Wire two gestures in this step:
   - The plan wall perpendicular move handle: click, release, live entry, preview follows the entry value, commit dispatches moveWallPerpendicular. It is no longer a Konva drag.
   - Drawing a wall with Ortho on: after the first click, a live length entry drives WallDrawPreview; Enter or a click commits addWallSegment and the chain continues from the new point with a fresh entry. With Ortho off, wall drawing is unchanged.
4. While an entry is live: no panning, tool clicks inert, Escape cancels the entry rather than clearing the selection.
5. `npm test`, `npm run build` and `npm run lint` must pass.

Commit "elevation-mvp: step 27 live numeric entry".
```
---
## Step 28 — Wall length that propagates, and corner length arrows

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-8.md §5 and tests 6–10. Needs step 27.

1. plan/wallOps.js: replace setWallLength with the four-argument version in §5.1, returning {ok, reason, walls}. Use the s = Δ · dot(aOut, nB) relation and delegate to moveWallPerpendicular for a connected end; move the endpoint directly for a free end. Do not keep the old two-argument export.
2. store/elevationSlice.js: setWallLength takes growEnd (default 'right') and sets state.message on failure.
3. The wall properties panel: ‹ and › buttons beside the Length input choosing which end absorbs the change, preselecting the free end when exactly one end is free. Not sticky.
4. canvas/components/WallEndpoints.jsx (or a new sibling — your call, say which): with settings.orthoWalls on and the endpoint connected, replace the free handle with the two per-wall length arrows from §5.3. Clicking an arrow opens a live entry whose commit is setWallLength for that wall and that end. Unconnected endpoints, and every endpoint with Ortho off, keep the free drag. Alt forces the free drag.
5. Tests 6–10. `npm test`, `npm run build` and `npm run lint` must pass.

Commit "elevation-mvp: step 28 wall length propagation + corner arrows".
```
---
## Step 29 — Edge and center position readouts

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-8.md §6 and tests 11–14.

1. New model/positions.js with positionReadouts and startFromReadout per §6.1, exported from model/index.js.
2. model/openings.js: add offsetAnchor ('edge' | 'center', default 'edge') to the opening, have openingGeometry return the nested offsets shape from §6.2, and add setOffsetAnchor alongside setMeasureMode and setOffsetSide — all three must leave the resolved geometry identical. createOpening sets offsetAnchor: 'edge'.
3. Update every reader of the old flat offsets — OpeningShape, PlanOpening, openingChain, PropertiesPanel — and the SPEC-7 tests that assert the flat shape. Say in your summary which tests you changed.
4. store/persistence.js: isOpening accepts a missing offsetAnchor and normalizeV3Document defaults it to 'edge'.
5. store/elevationSlice.js: setOpeningOffsetAnchor, and moveOpening keeps working in whatever anchor is stored.
6. components/PropertiesPanel.jsx: the 2 × 2 grid of inch inputs for openings per §6.2 (typing in a cell makes that cell the stored one) and for runs per §6.3, with anchored sides read-only.
7. Tests 11–14. `npm test`, `npm run build` and `npm run lint` must pass.

Commit "elevation-mvp: step 29 edge and center position readouts".
```
---
## Step 30 — Cabinet center pins

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-8.md §7 in full — §7.2.1 is the two-pin case and it has three separate rules — plus tests 15–25.

1. model/splitRun.js: opts.pinTargets and the two-pass algorithm in §7.2, then the interior-segment absorber rule and pin-gap error from §7.2.1. With no pins the output must be byte-identical to today, and the absorber rule must NOT leak into runs without pins — test 25 is the guard, so run the whole existing suite before you touch anything else and keep it green. SPEC §11 test 7 stays [30 5/8, 30 5/8].
2. model/room.js: resolvePinTarget per §7.1, and a resolvePinnedSpan stage per §7.2.1 that grows the run at a FREE end only, running after the horizontal pass and before splitRun. A short middle segment can never be fixed by growth — clamp and warn, and say why in the message. Pass pinTargets into every splitRun call site (roomDiagnostics, dimensions.js, PlanRunFootprint, RunGroup — grep for splitRun and get them all).
3. store/persistence.js: validate the optional item pin and the optional item absorb flag; a pin referencing a missing opening loads fine and resolves to null.
4. store/elevationSlice.js: setItemPin({wallId, runId, itemId, pin}), setting run.autoCount = false. When the pin being added is the run's SECOND, write each pinned item's current resolved width (rounded to settings.roundTo) into item.width — this is a reducer action, not solver behavior, and removing a pin later does not unlock it. Also setItemAbsorb({...}). Deleting an opening clears pins that reference it.
5. components/PropertiesPanel.jsx: the Pin block from §7.3 with the read-only resolved-target and actual-center lines, the second-pin notice, and the Absorb odd amount toggle (disabled with an explanation where it has no effect, not hidden). components/RunGroup.jsx: the pin marker on a pinned cabinet, and the absorbed amount on the absorbing piece's label.
6. Tests 15–25. `npm test`, `npm run build` and `npm run lint` must pass.

Commit "elevation-mvp: step 30 cabinet center pins".
```
---
## Step 31 — Casing clearance anchors and the clearance dimension row

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-8.md §8 and tests 26–33. Needs step 29.

1. model/constants.js: casingClearance (0).
2. model/corners.js resolveHorizontal: generalize each side from "reserve from the wall end" to a datum per §8.1, keeping the corner behavior and the anchor-shrunk / anchor-too-narrow rules exactly as they are. Opening lookups stay in model/room.js — resolveHorizontal must not import openings.js.
3. model/room.js: resolve the opening datum per side, the anchor-opening-missing and anchor-opening-overlap errors, and the casing-clearance warning in roomDiagnostics per §8.2.
4. store/persistence.js: anchors accept false | true | the OpeningAnchor object. store/elevationSlice.js: setRunAnchor takes the object form, and deleting an opening clears anchors pointing at it, leaving the run's resolved x where it stood.
5. model/dimensions.js: openingClearances per §8.3, rendered by ElevationCanvas as a DimensionRow beneath the opening row, with violated segments amber and showing the required value in parentheses.
6. components/PropertiesPanel.jsx: the per-side anchor select from §8.4. components/SettingsPanel.jsx: casingClearance in the Openings group.
7. Tests 26–33. `npm test`, `npm run build` and `npm run lint` must pass.

Commit "elevation-mvp: step 31 casing clearance anchors".
```
