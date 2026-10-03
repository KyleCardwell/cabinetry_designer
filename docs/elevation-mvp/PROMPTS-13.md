# Elevation Lab — Codex Prompts, Steps 51–59 (cabinet face layouts, European)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, and commit pending work first.

**Order:** 51 → 52 → 53 → 54 → 55 → 56 → 57 → 58 → 59. Step 54 needs only 51.

Codex can't open the app (it's behind a login), so don't plan browser checks. Rely on unit tests, `npm run build` and `npm run lint`.

Every SPEC-13 fixture in steps 51–53 has already been run against the §3–§5 code, so if one fails, the code was copied wrong. Don't "fix" the expectation.

---
## Step 51 — Face model and settings

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-13.md §1–§3. This step covers tests 1–8.
If `git status` shows uncommitted changes, stop and tell me.

1. src/elevation/model/constants.js: add pairDoorAboveWidth and faceReveals to DEFAULT_SETTINGS after `openingSnap: 0.5,` (line 59), exactly as SPEC-13 §2.
2. Create src/elevation/model/faces.js exactly as SPEC-13 §3.
3. src/elevation/model/index.js: add a faces.js export block after the constants.js block (names listed at the end of §3).
4. Tests 1–8 in a new src/elevation/model/__tests__/faces.test.js.

Don't touch splitRun, persistence or any component. Nothing calls faces.js yet except its tests.
While iterating, run only `npx vitest run src/elevation/model/__tests__/faces.test.js`. Run `npm test && npm run build && npm run lint` once at the end.

At most five lines of summary. Commit "elevation-mvp: step 51 face model".
```
---
## Step 52 — Face tree edits

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-13.md §1 and §4. This step covers tests 9–17.
If `git status` shows uncommitted changes, stop and tell me.

1. Create src/elevation/model/faceTree.js exactly as SPEC-13 §4. Every function is pure: it returns a new tree, and returns the input itself when the edit doesn't apply.
2. src/elevation/model/index.js: export the ten names in a block right after the faces.js block.
3. Tests 9–17 in a new src/elevation/model/__tests__/faceTree.test.js. Deep-freeze the fixtures (a small recursive Object.freeze helper in the test file) so any mutation throws.

Don't open other files. While iterating, run only `npx vitest run src/elevation/model/__tests__/faceTree.test.js`. Run `npm test && npm run build && npm run lint` once at the end.

At most five lines of summary. Commit "elevation-mvp: step 52 face tree edits".
```
---
## Step 53 — Face presets

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-13.md §5. This step covers tests 18–20.
If `git status` shows uncommitted changes, stop and tell me.

1. Create src/elevation/model/facePresets.js exactly as SPEC-13 §5. Keep the list order; the tests assert it.
2. src/elevation/model/index.js: export FACE_PRESETS and presetsFor after the faceTree.js block.
3. Tests 18–20 in a new src/elevation/model/__tests__/facePresets.test.js. Test 20's values are literal. Don't derive them in the test.

Don't open ff-job-schedule; the values are already copied into the spec. While iterating, run only `npx vitest run src/elevation/model/__tests__/facePresets.test.js`. Run `npm test && npm run build && npm run lint` once at the end.

At most five lines of summary. Commit "elevation-mvp: step 53 face presets".
```
---
## Step 54 — Persistence accepts faces

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-13.md §6. This step covers tests 21–22.
If `git status` shows uncommitted changes, stop and tell me.

src/elevation/store/persistence.js (546 lines). Only two edits:
1. isItem (line 109): add the face clause from §6, and import isFaceNode from '../model/faces.js'.
2. V2_DEFAULTED_SETTING_KEYS (lines 71–86): append 'pairDoorAboveWidth' and 'faceReveals'.

Don't change isSettings, toElevationDocument, the migrations or the schema version. toElevationDocument already round-trips item fields.

Tests 21–22 in src/elevation/store/__tests__/persistence.test.js, next to the existing pins test at line 254, reusing its v1Document / migrateV1Document / storageWith setup. While iterating, run only `npx vitest run src/elevation/store/__tests__/persistence.test.js`. Run `npm test && npm run build && npm run lint` once at the end.

At most five lines of summary. Commit "elevation-mvp: step 54 persist cabinet faces".
```
---
## Step 55 — Store: setItemFace and facePath

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-13.md §7. This step covers tests 23–25. No UI yet.
If `git status` shows uncommitted changes, stop and tell me.

src/elevation/store/elevationSlice.js (912 lines):
1. Initial state (line ~89): add top-level `facePath: null` beside `selection`. NOT inside selection, because nine existing tests assert selection with toEqual.
2. Add the setItemFace and setFacePath reducers from §7 after removeItem (ends line ~814), and add both to the export list (line ~858).
3. Add `state.facePath = null;` in exactly three places: clearTransientSelection (line 155), setSelection (line 816), and inside removeItem's existing `if (state.selection.pieceId === …)` block.

setItemFace doesn't call syncRoomAt, because faces don't change the layout. Don't touch any other reducer.

Tests 23–25 in src/elevation/store/__tests__/elevationSlice.test.js, using the existing helpers at lines 46–143 (fixed, run, stateWithRun, currentRun). Pass `autoCount: false`, because with autoCount true the items are regenerated. Read only the helpers and the end of the file; add a new describe block at the end.
While iterating, run only `npx vitest run src/elevation/store/__tests__/elevationSlice.test.js`. Run `npm test && npm run build && npm run lint` once at the end.

At most five lines of summary. Commit "elevation-mvp: step 55 face store".
```
---
## Step 56 — Draw face outlines

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-13.md §8. No tests; this is Konva rendering over tested model code.
If `git status` shows uncommitted changes, stop and tell me.

1. Create src/elevation/components/FaceOutlines.jsx exactly as §8. It includes selectedPath, selectable and onSelectFace props that step 59 wires up; leave them in, unused.
2. src/elevation/components/RunGroup.jsx (380 lines): add the faceLayouts useMemo after `result` (line ~41), and render the FaceOutlines map right after the result.pieces → PieceRect map (ends line ~280). Import cabinetFaces from '../model/faces.js' and FaceOutlines.

Only cabinet pieces (kind 'cabinet', role 'item') get faces; fillers and end panels don't. Don't change PieceRect.jsx, ElevationCanvas.jsx, the dimension rows or splitRun.

`npm run build` and `npm run lint` must pass, and `npm test` must show no regressions.
At most five lines of summary. Commit "elevation-mvp: step 56 draw cabinet faces".
```
---
## Step 57 — Faces panel: presets, outline, type and size

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-13.md §9. No tests.
If `git status` shows uncommitted changes, stop and tell me.

1. Create src/elevation/components/properties/FaceProperties.jsx per §9 (new folder). Match the existing Tailwind classes used in PropertiesPanel's CabinetProperties buttons and selects (e.g. `rounded bg-gray-700 px-2.5 py-2 text-xs text-gray-100 hover:bg-gray-600` for buttons, and the select classes at PropertiesPanel line ~1137). Use InchInput from '../InchInput.jsx' with allowBlank.
2. src/elevation/components/PropertiesPanel.jsx (1,656 lines): DO NOT read the whole file. Make exactly three edits plus one import:
   - line ~1637 `<PieceProperties`: add `layout={layout}` (the plain `layout` from line ~1566, not displayLayout)
   - line 1314 PieceProperties: accept `layout`, pass it to `<CabinetProperties … layout={layout} />`
   - line 1012 CabinetProperties: accept `layout`; render `<FaceProperties wall={wall} run={run} piece={piece} item={item} layout={layout} settings={settings} />` as the last child of its outer <div>, after the section with the Split in 2 / Add / Remove buttons (ends line ~1257)
   - import FaceProperties from './properties/FaceProperties.jsx'

Every edit goes through commit(nextFace) → setItemFace with itemIds [item.id]. Editing a default face stores the materialized tree. The split, remove and count actions are step 58; don't add them yet.

`npm run build` and `npm run lint` must pass, and `npm test` must show no regressions.
At most five lines of summary. Commit "elevation-mvp: step 57 faces panel".
```
---
## Step 58 — Faces panel: split, count, remove, make equal, apply to same width

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-13.md §10. No tests; the actions are the tested faceTree functions.
If `git status` shows uncommitted changes, stop and tell me.

Edit only src/elevation/components/properties/FaceProperties.jsx:
1. Under the outline, when getFaceNode(face, facePath) is not null, show:
   - leaf: a Sections number input (2–8, default 2) plus Stack / Side by side buttons (splitFace)
   - group: a Sections input showing children.length (1–8, setGroupCount) plus Make equal (equalizeGroup)
   - not the root: Remove (removeFace, then setFacePath(parentFacePath(facePath)))
2. Always: "Apply to same-width cabinets". The target ids come from layout.pieces (cabinet items whose width matches piece.width within 1e-6); it dispatches setItemFace with face: stored (null included), and is disabled when no other cabinet matches.

Don't open PropertiesPanel.jsx; step 57 already passes layout. Don't add reducers.

`npm run build` and `npm run lint` must pass, and `npm test` must show no regressions.
At most five lines of summary. Commit "elevation-mvp: step 58 face actions".
```
---
## Step 59 — Click a face on the canvas

```
Repo: cabinetry_designer, branch feature/elevation-mvp. Read docs/elevation-mvp/SPEC-13.md §11. No tests.
If `git status` shows uncommitted changes, stop and tell me.

1. src/elevation/components/RunGroup.jsx: add the props selectedFacePath = null and onSelectFace, and pass selectable / selectedPath / onSelectFace to each FaceOutlines exactly as §11. Selectable only when !preview and that cabinet is the selected piece.
2. src/elevation/components/ElevationCanvas.jsx (906 lines). Only these spots:
   - line 91: also read facePath
   - add selectFace beside selectPiece (line 574)
   - the main <RunGroup (line ~750): selectedFacePath and onSelectFace. The preview <RunGroup (line ~878) gets neither.
   - Escape handler (line 367): add `else if (facePath) dispatch(setFacePath(null));` before the existing `else dispatch(setSelection({}));`
   - import setFacePath beside setSelection

FaceOutlines.jsx already has the click and highlight code from step 56; change it only if something doesn't work. Don't change PieceRect, the stretch handles, DimensionRow or the pan code.

`npm run build` and `npm run lint` must pass, and `npm test` must show no regressions.
At most five lines of summary. Commit "elevation-mvp: step 59 select faces on the canvas".
```
