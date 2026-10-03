# Elevation Lab — Codex Prompts, Steps 34–38 (named elevations, dimension order, centerline callouts)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session.
Commit pending work first. Run in order — steps 36–38 depend on step 35's new field and step 34's simplified dimension chains, so don't skip ahead.
Codex cannot open the app (it's behind a login), so don't plan browser checks: rely on unit tests, `npm run build` and `npm run lint`.

---
## Step 34 — Selection while dragging, always-on overall dimension, casing-clearance row order

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-10.md §1, §2, §3 completely (source of truth; earlier SPEC files still apply). This step covers tests 1–6.
If `git status` shows uncommitted changes, stop and tell me.

1. §1 — components/LiveEntryInput.jsx (89 lines): change the focus/select effect (lines 28–31) to also depend on entry.value and entry.typed, and to return early when entry.typed !== null:
   useEffect(() => {
     if (entry.typed !== null) return;
     inputRef.current?.focus();
     inputRef.current?.select();
   }, [entry.kind, entry.label, entry.value, entry.typed]);
   No test for this (no component-test harness in this repo — every existing test is a pure-function test). Don't add one; don't touch useLiveEntry.js.

2. §3 — model/dimensions.js horizontalChains (lines 145–217): when runsForBand(wall, band) is empty, return outer as a full-length `{ start: 0, end: length, kind: 'wall' }` segment (guarded by `length > SEGMENT_EPSILON`) instead of `[]`, for both 'lower' and 'upper' bands — mirroring verticalChains' unconditional wall-height segment (lines 274–276). inner stays `[]`.

3. §2 — add belowRowOffsets to canvas/dimensionLayout.js (71 lines), exactly as SPEC-10 §2.2 gives it (constants 20/22/14, same as dimensionRowOffsets uses for horizontal). Don't change dimensionRowOffsets itself.

4. §2.3 — in components/ElevationCanvas.jsx, rewrite the dimensionOffsets useMemo (lines 306–331) to compute clearanceLevels via layoutDimensionRow(dimensionChains.clearances, {scale}).levels and call belowRowOffsets({clearances: clearanceLevels, pieces: lowerLevels, overall: lowerOuterLevels, openings: openingLevels}); return { lower: {inner: below.pieces, outer: below.overall}, upper: dimensionRowOffsets('horizontal', upperLevels), vertical: dimensionRowOffsets('vertical', verticalLevels), openings: below.openings, clearances: below.clearances, label: below.label }. Delete the old `dimensionChains.lower.outer.length > 0 ? … : 20` fallback — it's now unreachable since step 2 above makes lower.outer always non-empty for a real wall.

5. Reorder the four below-the-wall <DimensionRow> elements in the JSX (~lines 692–718) so clearances renders first, then lower.inner, then lower.outer, then openings — same props each already has, just reordered, reading offsetPx from the renamed fields above. Leave the upper.inner/upper.outer/vertical.inner/vertical.outer rows exactly where they are — this step only reorders the below-the-wall stack. The new `label` offset from belowRowOffsets isn't used yet (that's step 36); just make sure it's computed and returned.

6. Tests 1–6 from SPEC-10 §7. Update any existing test asserting the old below-wall pixel offsets or row order to the new stacking — say exactly which tests you changed and why in your summary. `npm test`, `npm run build` and `npm run lint` must pass.

Commit "elevation-mvp: step 34 selection fix, always-on overall dimension, casing-clearance row order".
```
---
## Step 35 — `elevationForced` field (shape only, no new behavior)

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-10.md §4.1. This is a pure shape addition — no new UI, no new derived behavior. The suite must stay exactly as green as it is today; nothing should change externally yet.

Add `elevationForced` (boolean, default false) to the wall shape, following the exact four touch points `numberOverride` already uses — grep confirms all four:

model/room.js:48                        (cloneRoom — add beside `numberOverride: wall.numberOverride ?? null,`)
store/elevationSlice.js:47              (createWall — add beside `numberOverride: values.numberOverride ?? null,`)
store/elevationSlice.js:369-374         (updateWall — add a boolean-only branch beside the numberOverride one)
store/persistence.js:192-201            (isWall — add `&& typeof wall.elevationForced === 'boolean'`)
store/persistence.js:~230               (normalizeDocument per-wall map — add beside `numberOverride: wall.numberOverride ?? null,`)
store/persistence.js:~427               (old-schema migration block — add `elevationForced: false,` beside `numberOverride: null,`)

Exact code for each site is in SPEC-10 §4.1. Don't touch anything else — no new exports, no UI, no topology.js changes (those are step 36).

Tests 14–15 from SPEC-10 §7 (persistence normalize/validate, createWall/updateWall defaulting and rejection of non-boolean values). `npm test`, `npm run build` and `npm run lint` must pass, with zero other test diffs.

Commit "elevation-mvp: step 35 elevationForced field".
```
---
## Step 36 — Elevation letters: derivation, checkbox, bottom label

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-10.md §4.2–§4.5 completely. Requires step 35's elevationForced field and step 34's dimensionOffsets.label. This step covers tests 7–10.

1. §4.2 — add indexToLetters, wallHasCabinets, elevationLetters and elevationLabel to model/topology.js (240 lines), exactly as SPEC-10 §4.2 gives them, beside the existing wallNumbers/wallLabel. Export all four from model/index.js's topology.js re-export block (currently chainOrder, chainOrientation, computeWallOrder, normalizeWallName, nextWallId, wallComponents, wallLabel, wallNumbers, wallNumberWarnings).

2. §4.3 — in components/PropertiesPanel.jsx's WallHeightProperties (starts ~line 1342), add the "Include in elevations" checkbox after the Name/Number grid (~line 1408), shown only when !wallHasCabinets(wall), dispatching updateWall({wallId, changes: {elevationForced: event.target.checked}}). Import wallHasCabinets from model/topology.js beside the existing wallLabel import (line 30).

3. §4.4 — in components/ElevationCanvas.jsx, add the "Elevation X" <Text> after the four reordered <DimensionRow> elements from step 34, using dimensionOffsets.label and wallToScreen({x: wall.length / 2, z: 0}, transform) — exact JSX in SPEC-10 §4.4. Add Text to the react-konva import (line 12) and wallToScreen to the canvas/transform.js import; import elevationLabel from model/topology.js.

4. Leave wallLabel, wallNumbers, the plan wall-number circle, and WallList.jsx untouched — §4.5 says why.

5. Tests 7–10 from SPEC-10 §7. `npm test`, `npm run build` and `npm run lint` must pass.

Commit "elevation-mvp: step 36 elevation letters".
```
---
## Step 37 — Plan-view elevation marker

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-10.md §5 completely. Requires step 36's elevationLetters.

1. Create plan/PlanElevationMarker.jsx exactly as given in SPEC-10 §5.1 — a Group with a triangular flag Line, a Circle, and a centered Text, taking {point, exterior, scale, letter} props.

2. Wire it into plan/PlanWallShape.jsx (183 lines): compute `letter` and `elevationPoint` beside the existing numberPoint block (lines 26–32), per SPEC-10 §5.2 — same outward offset as the number marker (wall.thickness + 38/scale), but offset -24/scale along frame.d instead of +24/scale so the two markers never overlap. Render <PlanElevationMarker> after the existing number Circle/Text (end of file, ~line 182), only when `letter` is truthy. Import elevationLetters from ../model/topology.js beside the existing wallNumbers import (line 4).

3. Don't touch plan/PlanCanvas.jsx — PlanWallShape already receives room as a prop and can call elevationLetters(room) itself. Don't touch the existing wall-number circle or its offset math.

4. No new unit test — this is pure Konva rendering with no derivable pure output beyond elevationLetters, already tested in step 36. `npm run build` and `npm run lint` must pass; `npm test` must show no regressions.

Commit "elevation-mvp: step 37 plan elevation marker".
```
---
## Step 38 — Centerline callout

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-10.md §6 completely. This step covers tests 11–13.

1. §6.1 — add centerlineMarkers(run, pieces) to model/dimensions.js (360 lines), exactly as SPEC-10 §6.1 gives it, beside pickColumnRuns. Export it from model/index.js's dimensions.js re-export block (pickColumnRuns, verticalChains, verticalOpeningChain, …).

2. §6.2 — in components/RunGroup.jsx (327 lines), add a second flatMap/map block right after the existing pin-marker block (lines 278–303) that calls centerlineMarkers(run, result.pieces) and renders a dashed tick (Line) from the piece's own top to 12" above it, plus a Text label reading `℄ ${formatInches(marker.value)} ${fromLabel}` where fromLabel is "from left"/"from right"/"from opening" per marker.from. Add Line to the react-konva import (currently Group, Label, Rect, Tag, Text) and formatInches from ../model/units.js. Import centerlineMarkers from ../model/dimensions.js beside the existing splitRun import.

3. Leave the existing "◆" pin marker block untouched — it still renders for every pinned item regardless of anchor. Don't touch model/room.js's pin-resolution functions (resolvePinTarget, pinTargetsForRun, resolvePinnedSpan) — this step only reads item.pin fields those already produce.

4. Tests 11–13 from SPEC-10 §7 (centerlineMarkers with hand-built piece fixtures — no splitRun call needed in the test). `npm test`, `npm run build` and `npm run lint` must pass.

Commit "elevation-mvp: step 38 centerline callout".
```
