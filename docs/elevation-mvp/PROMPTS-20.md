# Elevation Lab — Codex Prompts, Steps 101–105 (soffit and plan polish)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, and commit pending work first (including these docs).

**Order:** 101 → 102 → 103 → 104 → 105, after SPEC-19 (steps 96–100). Steps 101 and 102 are model-only and independent of each other. Step 103 needs 102, step 104 needs 101, and step 105 needs 102.

**Codex can't open the app**, so don't plan browser checks. Kyle checks 103–105 by hand.

**The gate is the same for every step:** while iterating, run only `npx vitest run <the named test file>`. Run `npm test && npm run lint` once, at the end. Don't run `npm run build`. Line numbers are as of `855938f`.

---
## Step 101 — Soffits over part of a run; flush soffit ends

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-20.md §1, §2, §7 tests 167 (changed), 174–176.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- src/elevation/model/soffits.js (164): soffitOverRun, plus two new exports
- src/elevation/model/landings.js (329): one new export, landingProjection, next to landingsOn (~94)
- src/elevation/model/index.js: export landingProjection, soffitFlushSides, soffitSeams
- test: src/elevation/model/__tests__/soffits.test.js (edit test 167, append 174–176 at the end of the file)
- TODO.md: one bullet (below)

soffits.js:
- soffitOverRun: replace the containment filter with an overlap test — Math.min(runRight, soffit.x + soffit.width) − Math.max(run.x, soffit.x) > SPAN_EPSILON. Keep the lowest-bottom sort. Don't touch profileUnderSoffit, runMolding, soffitConflicts or soffitEndType.
- soffitFlushSides and soffitSeams exactly as SPEC §2. Import wallSideFrame from './wallSides.js' only if you need it; landingProjection does the geometry. Still no room.js / corners.js imports.

landings.js landingProjection(room, wallOrView, wallId): host/side as landingsOn derives them; find the wall with that id whose landings[endpoint] has wallId === host.id && side === side; landedEnd = that endpoint's (x, y), freeEnd = the other endpoint; n = wallSideFrame(room, host, side).n (import from './wallSides.js' — check it doesn't create a cycle; wallSides imports only geometry.js). Return Math.abs(dot(freeEnd − landedEnd, n)), or null.

TODO.md: under the "Steps 96–100 — soffits" entry add:
  - Follow-up: a cabinet deeper than a shallow soffit, notched around the soffit's front, instead of dropping under it (decide per run). Dragging soffit edges in elevation.

Test 167: heights [24, 36, 36, 24]; U4 no longer conflicts; M1 unchanged. Tests 174–176 exactly as SPEC-20 §7.
Expect 466 passing.

At most five lines of summary. Commit "elevation-mvp: step 101 partial soffit cover and flush ends".
```

---
## Step 102 — Letters for back sides, marker placement, drawer stacks

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-20.md §3, §4, §5, §7 tests 177–179.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- src/elevation/model/topology.js (283): wallHasCabinets (~215), elevationLetters (~220), elevationLabel (~240), new elevationKey
- NEW src/elevation/plan/elevationMarkers.js
- src/elevation/model/faceTree.js (108): new makeDrawerStack after splitFace
- src/elevation/model/index.js: export elevationKey, makeDrawerStack
- tests: src/elevation/model/__tests__/topology.test.js (append 177), NEW src/elevation/plan/__tests__/elevationMarkers.test.js (178), src/elevation/model/__tests__/faceTree.test.js (append 179; add makeDrawerStack to its '../faceTree.js' import)

topology.js: import wallSideOf from './wallSides.js'. wallHasCabinets(wall, side = 'front') counts runs with wallSideOf(run) === side. elevationLetters: existing front pass keyed by wall.id (unchanged behaviour except it now counts front runs only), then a back pass in the same wall order keyed `${id}:back`, lettered only when wallHasCabinets(wall, 'back'); one shared letter counter. elevationLabel(room, wallOrView) looks up elevationKey(wallOrView.id, wallOrView.side ?? 'front').
Existing callers stay as they are: PropertiesPanel's wallHasCabinets(wall) (front, correct for the forced checkbox) and ElevationCanvas's elevationLabel(room, wall) (it passes the side view). Don't open those files.

elevationMarkers.js: pure, no React. Imports frontDepth from '../model/corners.js', wallFrame from '../model/geometry.js', elevationKey and elevationLetters from '../model/topology.js', wallSideFrame and wallSideOf from '../model/wallSides.js'. Exports the four constants and elevationMarkers exactly as SPEC §4.

faceTree.js makeDrawerStack exactly as SPEC §5 (use replaceAt; a leaf at the root is replaced whole).

Tests 177–179 exactly as SPEC-20 §7.
Expect 469 passing.

At most five lines of summary. Commit "elevation-mvp: step 102 back-side letters, marker placement, drawer stacks".
```

---
## Step 103 — Plan: thin soffit dashes, markers off the deepest run, bigger dimension text

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-20.md §4 (last paragraph), §6 "Plan".
If `git status` shows uncommitted changes, stop and tell me.

Files:
- src/elevation/plan/constants.js: add PLAN_DIM_FONT_SIZE = 13
- src/elevation/plan/PlanCanvas.jsx (1208): ONLY the soffit Line (~1035–1051), a new marker block right after it, and imports. Don't read the rest.
- src/elevation/plan/PlanWallShape.jsx (350): lines ~1–80 (constants, offsets, marker point), ~93 (layoutDimensionRow), ~340–347 (marker render)
- src/elevation/plan/PlanRunFootprint.jsx (212): depth label block (~80–100, ~168–183)
- src/elevation/plan/PlanOpening.jsx (168): ~162 fontSize only
- src/elevation/plan/PlanElevationMarker.jsx (45): RADIUS / FLAG_LENGTH → imported MARKER_RADIUS / MARKER_FLAG_LENGTH

PlanCanvas:
- soffit Line: add strokeWidth={1 / scale}.
- after the soffit block: {elevationMarkers(room, settings, scale).map((marker) => <PlanElevationMarker key={marker.key} point={marker.point} direction={marker.direction} scale={scale} letter={marker.letter} />)}.

PlanWallShape: delete ELEVATION_MARKER_DEPTH, `interior`, `letter`, `elevationPoint`, the marker render, and the elevationLetters / PlanElevationMarker imports. Font: `const fontSize = PLAN_DIM_FONT_SIZE / scale;` and `fontSize: PLAN_DIM_FONT_SIZE` in both layoutDimensionRow calls. Offsets per SPEC §6: dimensionOffset 22, extensionEndOffset 26, landing rows +20, labelDistance 10 and 14 per level (both the wall row and the landing rows), numberOffset 46. The useMemo in PlanCanvas at ~190 uses `38 / scale` for the selected-wall toolbar position — leave it.

PlanRunFootprint: remove showsDepth; depth label always rendered, fits / set-out exactly as SPEC §6, font PLAN_DIM_FONT_SIZE.

PlanOpening: fontSize={PLAN_DIM_FONT_SIZE / scale}.

No new tests (UI). Run `npm test && npm run lint`: 469 passing.

At most five lines of summary. Commit "elevation-mvp: step 103 plan markers and dimension text".
```

**Check after 103:**
- A soffit in plan is a thin dashed outline at every zoom.
- A room with 24" bases: the elevation marker sits about 6" past the base fronts. Zoom all the way in and out, and it never overlaps the wall or the runs.
- Put an upper on the back of a wall. The back gets the next letter, and its marker is on the back side, shifted along the wall away from the wall-number bubble. Open that side in elevation, and the title reads its letter.
- Zoom out on a room with 12" uppers. Each depth number moves out past the run front with a short leader instead of disappearing. Zoom to fit on a big room, and they're all still there.
- Dimension text is visibly larger, and the wall-length row sits a little farther out.

---
## Step 104 — Elevation: plain wing walls and soffits, no seam when flush

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-20.md §6 "Elevation".
If `git status` shows uncommitted changes, stop and tell me.

Files:
- src/elevation/components/SoffitShapes.jsx (whole file, ~50)
- src/elevation/components/NeighborReturns.jsx (whole file, ~105)
Do not open ElevationCanvas.jsx — both components already receive room, wall and transform.

SoffitShapes: drop Hatch; flush = soffitFlushSides(room, wall, soffit); Rect keeps the hit area (fill 'rgba(0,0,0,0)', strokeEnabled={false}); edges as Lines in screen space from the rect (top, bottom, and left/right unless flush); stroke per SPEC. Keep the Text.

NeighborReturns: give entries a `kind` ('return' | 'landing'). Returns render exactly as today (fill, Hatch, stroke). Landings render no fill and no Hatch, only four edges built in wall coordinates and converted with wallToScreen from '../canvas/transform.js'; seams = soffitSeams(room, wall); a vertical edge at x === seam.x (1e-6) of a seam with seam.wallId === that landing's wallId runs z 0 → seam.bottom instead of 0 → landedWall.height. Keep the label Text.

No new tests (UI). Run `npm test && npm run lint`: 469 passing.

At most five lines of summary. Commit "elevation-mvp: step 104 plain wing walls and soffits".
```

**Check after 104:**
- Wing walls and soffits in elevation are outlines with no hatch. Cabinet returns from a neighbouring wall still have theirs.
- Put an alcove between two 30"-long wing walls and draw a soffit between them. Set its depth to 30. The vertical line between each wing wall and the soffit disappears above the soffit's bottom. At depth 14 it comes back.
- A soffit is still selectable by clicking anywhere inside it.
- An upper that's only half under a soffit drops its whole box to fit, with no warning.

---
## Step 105 — Properties: wing-wall clearance, soffit width, drawer stack button

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-20.md §6 "Properties".
If `git status` shows uncommitted changes, stop and tell me.

Files:
- src/elevation/components/PropertiesPanel.jsx (2104): ONLY RunProperties' per-side anchor block (~720–975), SoffitProperties (~1834–1978) and imports. ReadOnlyValue (~178) already exists. Don't read the rest.
- src/elevation/components/properties/FaceProperties.jsx (253)

RunProperties:
- The detail chain `jointAnchor ? … : openingAnchor ? … : wallEndAnchor ? … : null` becomes `… : soffitAnchor ? <offset block> : (wallEndAnchor || wallAnchor) ? <existing clearance block> : null`. In the clearance block, the field label is 'Clearance' for a wall anchor (keep 'Corner clearance' / 'End offset' for anchor === true). Show the "Positive holds the run back; negative carries it past." hint for a wall anchor whatever the mode.
- Soffit offset block: Field 'Offset' → InchInput value={soffitAnchor.offset} allowBlank placeholder "0" → setRunAnchor({ ...actionBase, side, anchor: { ...soffitAnchor, offset: value ?? 0 } }); the same hint; anchorDescription in text-cyan-300.

SoffitProperties: at the top of the Soffit section, Left and Width per SPEC §6. Left: both anchors false → InchInput value={soffit.x} → updateSoffit({ changes: { x } }); else ReadOnlyValue formatInches(soffit.x). Width: both anchors set → ReadOnlyValue; else InchInput value={soffit.width} → updateSoffit({ changes: { width } }).

FaceProperties:
- Replace the Stack / Side by side text buttons with two icon buttons (28×28, BUTTON_CLASS spacing, inline 16px SVG, stroke currentColor, strokeWidth 1.5, no fill): side by side = a vertical bar at x=8 with chevrons pointing left at x≈3 and right at x≈13; stack = the same rotated 90° (horizontal bar, chevrons up and down). title and aria-label "Split side by side" / "Split into a stack".
- Add a text button "Drawer stack" after them: commitIfChanged(makeDrawerStack(face, facePath, Number(splitCount))).
- groupLabel: a vertical group whose children are all leaves with type 'drawer_front' reads `Drawer stack × ${n}`.

No new tests (UI). Run `npm test && npm run lint`: 469 passing.

At most five lines of summary. Commit "elevation-mvp: step 105 anchor clearances, soffit width, drawer stacks".
```

**Check after 105:**
- Anchor a base to a wing wall. A Clearance control appears. Pick Custom and type −1/2", and the run slides 1/2" onto the wing wall. The description agrees.
- Anchor an upper to a soffit side, type 1/2" in its Offset, and it pulls back 1/2".
- Select a soffit with a free end. Change Width and it resizes from the anchored end. With both ends free, change Left and it moves. With both ends anchored, both show read-only.
- On a tall cabinet with a single door face, select the door, set Sections to 2 and click the stack arrow. Select the bottom door, set Sections to 4 and click Drawer stack. The outline shows "Drawer stack × 4" nested under the stack, with its own size box, which is the stack height.
- The split buttons are arrow icons with tooltips.
