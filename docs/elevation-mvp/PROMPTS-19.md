# Elevation Lab — Codex Prompts, Steps 96–100 (soffits)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, and commit pending work first (including these docs).

**Order:** 96 → 97 → 98 → 99 → 100, after SPEC-18 (steps 90–95).

**Codex can't open the app**, so don't plan browser checks. Kyle checks 99 and 100 by hand.

**The gate is the same for every step:** while iterating, run only `npx vitest run <the named test file>`. Run `npm test && npm run lint` once, at the end. Don't run `npm run build`. Line numbers are as of `96cba0a`, before SPEC-18; they will have drifted, so every site is also named by function.

**Vocabulary:** a *soffit* is a dropped ceiling on one side of a wall (`wall.soffits`), from its `bottom` up to the wall height. Its `molding` is what sits between it and the cabinets under it. SPEC-19 §0.

---
## Step 96 — `wall.soffits`, settings, selection, and the soffit module

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-19.md §0, §1, §3 (persistence and selection only), §6 tests 160–165.
If `git status` shows uncommitted changes, stop and tell me.

Shape and a pure module. No resolution changes yet.

Files:
- NEW src/elevation/model/soffits.js
- src/elevation/model/constants.js (100): DEFAULT_SETTINGS only
- src/elevation/model/index.js: one export block
- src/elevation/model/room.js: cloneRoom only
- src/elevation/model/landings.js: releaseWall only
- src/elevation/store/elevationSlice.js: createWall, the initial `selection` object (~112), clearTransientSelection (~214)
- src/elevation/store/persistence.js: V2_DEFAULTED_SETTING_KEYS (78), isRunAnchor, isWall
- tests: NEW src/elevation/model/__tests__/soffits.test.js; persistence.test.js and elevationSlice.test.js (append a describe at the end of each)

1. soffits.js exports exactly the names in SPEC §1, behaving as §1 describes. Imports: uuid; CABINET_TYPE_IDS, DEFAULT_SETTINGS; wallLength from './geometry.js'; landingsOn from './landings.js'; moldingStack from './profile.js'; roundTo; wallSideOf, wallViewForRun from './wallSides.js'. It must NOT import room.js or corners.js.
2. DEFAULT_SETTINGS: `defaultSoffitDepth: 14, defaultSoffitMolding: 'crown',`.
3. persistence: add both keys to V2_DEFAULTED_SETTING_KEYS; isRunAnchor accepts `{ to: 'soffit', soffitId: string, offset: null | finite }`; isWall accepts `soffits` undefined or an array of soffits valid per §3.
4. createWall: `soffits: values.soffits ?? [],`. cloneRoom copies soffits and each soffit's two anchors (false stays false).
5. selection: `soffitId: null` in the initial selection and in clearTransientSelection. setSelection is step 98.
6. releaseWall (landings.js): also clear soffit end anchors `{ to: 'wall', wallId }` → false, the same way as run anchors.
7. index.js: export SOFFIT_MOLDINGS, createSoffit, profileUnderSoffit, resolveSoffitSpan, runMolding, soffitAnchorDatum, soffitConflicts, soffitEndType, soffitMoldingDrop, soffitOverRun, soffitsOn, validateSoffitPlacement.

soffits.test.js: upper, makeWall (height 108, landings, soffits), makeRoom, wallById, alcove, SF, soffitWall and runById exactly as SPEC-19 §6. Tests 160–163 there; 164 in persistence.test.js; 165 in elevationSlice.test.js.
Expect 455 passing.

At most five lines of summary. Commit "elevation-mvp: step 96 soffit shape".
```

---
## Step 97 — Soffits cap cabinets and take anchors

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-19.md §2, §6 tests 166–170.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- src/elevation/model/room.js: syncRoom (new pass after computeWallOrder; vertical pass), roomDiagnostics (its resolveVertical and warnings), resolveRunAnchorDatum, describeAnchor, stretchRun
- src/elevation/model/runDefaults.js: createRun's anchors and ends blocks
- src/elevation/components/PropertiesPanel.jsx: ONE line, WARNING_LABELS (~123)
- test: src/elevation/model/__tests__/soffits.test.js

room.js:
- syncRoom: right after `nextRoom.wallOrder = computeWallOrder(...)`, a pass that sets each soffit to `{ ...soffit, ...resolveSoffitSpan(nextRoom, wallSideView(wall, wallSideOf(soffit)), soffit) }`.
- vertical pass: `resolveVertical(run, profileUnderSoffit(profile, wall, run), bases, wall)`.
- roomDiagnostics: the same profile swap in its resolveVertical call, and `...soffitConflicts(wall, run),` after casingClearanceWarnings.
- resolveRunAnchorDatum: a `{ to: 'soffit' }` branch before the `{ to: 'wall' }` branch (§2).
- describeAnchor: a `{ to: 'soffit' }` branch before the `{ to: 'wall' }` branch — `Against soffit · flush | <n> gap | <n> past` from the offset.
- stretchRun: append soffit candidates per §2 (each soffit's `x + width` anchors the left side and `x` the right side, only for an upper/tall whose top is above the soffit bottom). When the snapped anchor is a soffit anchor, the end type is soffitEndType(sideWall, proposed, side, anchor, settings) instead of the corner rule.

runDefaults.js: after the wall-end and wing-face checks, the soffit check per §2 (top is typeDefaults.z + height in auto mode, else topZ; bases never). Ends: a soffit anchor takes soffitEndType(wall, { id: null, wallSide: wall.side }, side, anchor, settings).

PropertiesPanel.jsx WARNING_LABELS: `'soffit-conflict': "Runs into a soffit — anchor it to the soffit's side or split it.",`

Tests 166–170 exactly as SPEC-19 §6.
Expect 460 passing.

At most five lines of summary. Commit "elevation-mvp: step 97 soffits cap cabinets".
```

---
## Step 98 — Store: add, edit, anchor, delete, select

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-19.md §3, §6 tests 171–173.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- src/elevation/store/elevationSlice.js: setSelection, setTool, setRunAnchor, four new reducers, the exports list
- test: src/elevation/store/__tests__/elevationSlice.test.js (append a describe at the end)

- addSoffit / updateSoffit / setSoffitAnchor / deleteSoffit exactly as §3. Validate with resolveSoffitSpan + validateSoffitPlacement on `{ ...wallSideView(resolveWall(room, wall), soffit.wallSide) }` (resolveWall gives `length`).
- setSelection: `const soffitId = openingId ? null : action.payload.soffitId ?? null; const runId = openingId || soffitId ? null : action.payload.runId ?? null;` — selection gets soffitId; with a soffitId, activeWallSide is that soffit's wallSide (look it up across the active room's walls).
- setTool: add 'soffit' to the allowed list.
- setRunAnchor: accept `{ to: 'soffit', soffitId: string, offset: null | finite }` (offset null stored as 0); end type from soffitEndType(location.wall, location.run, side, anchor, state.settings).

Tests 171–173 exactly as SPEC-19 §6.
Expect 463 passing.

At most five lines of summary. Commit "elevation-mvp: step 98 soffits in the store".
```

---
## Step 99 — Soffit tool, drawing and rendering in elevation

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-19.md §4 "Toolbar", "Drawing", "Rendering", "RunGroup".
If `git status` shows uncommitted changes, stop and tell me.

Files:
- src/elevation/components/ElevationToolbar.jsx (182)
- src/elevation/components/ElevationCanvas.jsx (1550): ONLY the two tool-change effects (~265–271), the keydown Delete branch (~483–520), dragBounds/dragPreview (~569–605), commitRunDraw (~650), handleMouseDown/Move/Up (~701–805), the <WallEndPanelShapes> render (~1396) and imports. Don't read the rest.
- NEW src/elevation/components/SoffitShapes.jsx
- src/elevation/components/RunGroup.jsx (411): the molding block (~70–86 and ~259–275)

ElevationToolbar: elevation tools ['select', 'draw', 'soffit', 'door', 'window'], label 'Soffit'. When tool === 'soffit', a Crown / Top mold / None segmented control bound to settings.defaultSoffitMolding via updateSettings.

ElevationCanvas:
- Tool effects: the run-draw cancel conditions also keep 'soffit'.
- handleMouseDown: also start when tool === 'soffit', with gesture/entry kind 'soffit-draw' and onCommit commitSoffitDraw. handleMouseMove / handleMouseUp: every `'run-draw'` test accepts 'soffit-draw' too, with the gesture kind matching the entry kind.
- commitSoffitDraw(width): bounds = runDrawBounds(...) as commitRunDraw does; soffit = createSoffit(bounds, { settings, room, wall }); resolve its span and validate on `wall`; on failure showMessage('Soffits can\'t overlap') for 'soffit-overlap' or 'A soffit needs room below the ceiling' otherwise; on success dispatch addSoffit({ wallId: wall.id, soffit }).
- dragPreview: for 'soffit-draw', skip createRun/tryPlaceRun and return { soffit: bounds }; render a dashed rect from bounds.bottomZ to wall.height over bounds.x..x+width instead of <DragPreview>.
- Delete/Backspace: a soffitId branch before the run branch dispatching deleteSoffit.
- Render <SoffitShapes room wall settings transform selectedSoffitId onSelect> in the listening Layer, before the runs; onSelect dispatches setSelection({ soffitId }). Only selectable with the select tool.

SoffitShapes.jsx: for soffitsOn(wall): a Rect from z bottom to wall.height (wallRectToScreen), fill '#475569' opacity 0.35, the same diagonal Hatch as NeighborReturns (move Hatch to its own small file and import it in both), a Text "Soffit · <bottom>", stroke '#60a5fa' 2px when selected.

RunGroup: `const molding = runMolding(wall, run);` top mold when showsMolding && molding !== 'none'; crown when showsMolding && molding === 'crown'.

No new tests (UI). Run `npm test && npm run lint`: 463 passing.

At most five lines of summary. Commit "elevation-mvp: step 99 soffit tool".
```

**Check after 99:**
- In elevation pick Soffit, leave Crown, and drag a box from the ceiling down to about 84" between two wing walls. It snaps to both wing faces and draws hatched.
- Draw uppers under it: their boxes stop 6" below it, with crown on top. Pick Top mold before drawing the next soffit: uppers under that one stop 3" below with only top mold.
- Draw an upper beside the soffit, outside it, up to the soffit's side: it anchors to the soffit. Its end there is an end panel if nothing is under the soffit, a filler if there is.
- Stretch an upper so it straddles the soffit edge: it gets the soffit warning.
- Select a soffit and press Delete: it goes, and uppers under it grow back to full height.

---
## Step 100 — Soffit properties, anchor options, plan outlines, settings

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-19.md §4 "Properties", "Plan", "Settings".
If `git status` shows uncommitted changes, stop and tell me.

Files:
- src/elevation/components/PropertiesPanel.jsx: ONLY the default export's panel switch (~1755–1797), RunProperties' anchor select (~710–800), the imports, and a new SoffitProperties function. Don't read the rest.
- src/elevation/plan/PlanCanvas.jsx: ONLY the render block after the wall end panels (~991) and imports
- src/elevation/components/SettingsPanel.jsx (208): its numeric settings list

PropertiesPanel:
- SoffitProperties({ room, wall, soffit, settings }): Bottom and Depth (InchInput → updateSoffit), Molding (select over SOFFIT_MOLDINGS labelled Crown / Top mold / None → updateSoffit), Left end and Right end (select Free / Wall end / each landingsOn(room, wall) face labelled by wallLabel, plus an Offset InchInput with allowBlank when anchored → setSoffitAnchor), and a Delete button (deleteSoffit).
- Panel switch: after the opening branch, `soffit ? <SoffitProperties …/>` where soffit = soffitsOn(wall).find(id === selection.soffitId).
- RunProperties anchor select: an optgroup "Soffit sides" listing soffitsOn(wall) as `soffit:<id>` ("Soffit <x>–<x+width>"); anchorValue maps `{ to: 'soffit' }` to it; onChange maps back to `{ to: 'soffit', soffitId, offset: 0 }`.

PlanCanvas: for every wall and every soffit, a dashed closed Line (dash [6/scale, 4/scale], stroke '#94a3b8', listening false) through elevationToPlan(wallSideFrame(room, wall, soffit.wallSide), …) at (x,0), (x+width,0), (x+width,depth), (x,depth).

SettingsPanel: add ['defaultSoffitDepth', 'Soffit depth'] to its numeric list.

No new tests (UI). Run `npm test && npm run lint`: 463 passing.

At most five lines of summary. Commit "elevation-mvp: step 100 soffit properties and plan".
```

**Check after 100:**
- Select a soffit: its bottom, depth, molding and end anchors show. Change the left end's offset to −4 1/2": it runs onto the wing wall.
- An upper beside the soffit shows "Soffit 69–189" in its anchor list.
- Plan shows each soffit as a dashed outline off its wall face, 14" deep by default. Settings has Soffit depth.
