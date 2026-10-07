# Round 46 — Codex Prompts, Steps 379–385 (door styles in the model, no UI)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session. Every step is in **cabinetry_designer**; geometry and the API don't change.

| Step | Repo | What | Tests after |
|---|---|---|---|
| 379 | cabinetry_designer | `doorStyles.js`: designs, team default style, shape checks | 975 |
| 380 | cabinetry_designer | Persistence: styles and picks saved and validated | 980 |
| 381 | cabinetry_designer | `doorStyleResolve.js`: which style a part uses | 988 |
| 382 | cabinetry_designer | `doorSizes.js`: final stile/rail sizes, short-face rule | 995 |
| 383 | cabinetry_designer | Stacking check | 999 |
| 384 | cabinetry_designer | Run front plane = thickest face | 1008 |
| 385 | cabinetry_designer | Each face at its own thickness | 1013 |

All door rounds (46 onward) run on branch **elevation-doors**, cut from `feature/elevation-mvp` after step 378. It merges back only when the door work is done and works the way Kyle wants.

---

## Step 379 — `doorStyles.js`

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.md §1 and §2. Step 378 is in.
If `git status` shows uncommitted changes, stop and tell me.

New module src/elevation/model/doorStyles.js, no imports: door designs (two local seeds), the team default door style, and shape checks. Follow SPEC §2's contract exactly:
- export DOOR_CONSTRUCTIONS, RAIL_SHAPES, DOOR_PROFILE_SLOTS, PANEL_TYPES, DOOR_STYLE_KEYS, DEFAULT_DESIGN_ID, DOOR_DESIGNS (the two seeds, in order), DEFAULT_DOOR_STYLE (exactly the object in the SPEC's test 2).
- teamDoorStyle(settings): copy of DEFAULT_DOOR_STYLE with thickness = settings?.doorThickness ?? 0.8125 (interim until 46.3).
- findDoorDesign(designId, designs = DOOR_DESIGNS) → design or null.
- isStyleRef, isDoorStyle, isDoorStyleList, isPartSizes with the rules listed in the SPEC (strict keys, "exactly" means exactly those keys).

Naming: the model already uses `style` / `resolveStyle` / styles.js for the CABINET style (Euro/inset). Never use those names for door styles.

Files (only these):
- NEW src/elevation/model/doorStyles.js
- NEW src/elevation/model/__tests__/doorStyles.test.js: the SPEC §2 file VERBATIM (7 tests)

DO NOT change constants.js, styles.js, index.js or any other file. DO NOT grep the repo.

Write the test file first; run `npx vitest run src/elevation/model/__tests__/doorStyles.test.js` (fails: no module). Iterate on that file only. At the end `npm test && npm run lint` once: 968 + 7 = 975, golden snapshot unchanged, lint 0 errors. Don't run the build.

At most three lines of summary. Commit "elevation-mvp: step 379 Door styles model".
```

---

## Step 380 — persistence: styles and picks saved and validated

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.md §1 and §3. Step 379 is in.
If `git status` shows uncommitted changes, stop and tell me.

The saved document accepts and validates door styles and picks.
In src/elevation/store/persistence.js (695 lines) import DOOR_STYLE_KEYS, isDoorStyleList, isPartSizes, isStyleRef from '../model/doorStyles.js' and add two private helpers:
- hasStyleRefs(node): every key in DOOR_STYLE_KEYS passes isStyleRef(node[key]).
- isPartPick(entry): isStyleRef(entry.styleId) && (entry.sizes === undefined || isPartSizes(entry.sizes)).
Then:
- line 35 CELL_KIND_KEYS.panel: add 'styleId', 'sizes'.
- isEnd (110): && isPartPick(end) (any end type).
- isItem (137): && hasStyleRefs(item).
- isRun (238): && hasStyleRefs(run).
- isCellLeaf (295): for a panel leaf, && isPartPick(leaf).
- isEndPanels (371): each non-null entry && isPartPick(entry).
- isWall (442): && hasStyleRefs(wall).
- isRoom (475): && isDoorStyleList(room.doorStyles) && hasStyleRefs(room).
In src/elevation/model/faces.js (240 lines) isFaceNode's leaf branch (~line 49): also require isStyleRef(node.styleId) and (node.sizes === undefined || isPartSizes(node.sizes)); import both from './doorStyles.js'.

Files (only these):
- src/elevation/store/persistence.js
- src/elevation/model/faces.js
- NEW src/elevation/store/__tests__/doorStyleSaves.test.js: the SPEC §3 file VERBATIM (5 tests)

DO NOT change normalizeDocument / normalizeElevationDocument / toElevationDocument, the schema version, persistence.test.js, the store slices or any other file. DO NOT open persistence.test.js. DO NOT grep the repo.

Write the test file first and run `npx vitest run src/elevation/store/__tests__/doorStyleSaves.test.js`: tests 1–4 must fail (test 5 passes either way). Iterate on that file. At the end `npm test && npm run lint` once: 975 + 5 = 980, golden snapshot unchanged, lint 0 errors.

At most three lines of summary. Commit "elevation-mvp: step 380 Door styles saved".
```

---

## Step 381 — `doorStyleResolve.js`: which style a part uses

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.md §1 and §4. Step 380 is in.
If `git status` shows uncommitted changes, stop and tell me.

New module src/elevation/model/doorStyleResolve.js (imports from './doorStyles.js' only):
- facePartType(type): 'drawer_front' → 'drawer_front'; 'open' → null; door, pair_door, false_front, panel → 'door'.
- cabinetFaceLevels(room, wall, run, cabinet, face) → [{level:'face',node:face},{level:'cabinet',node:cabinet},{level:'run',node:run},{level:'wall',node:wall},{level:'room',node:room}] minus null/undefined nodes.
- panelLevels(room, wall, run, part) → same with {level:'part',node:part} first and no cabinet level.
- resolveDoorStyle(room, settings, partType, levels, designs = DOOR_DESIGNS) → { style, design, source, warnings }:
  styles = room?.doorStyles ?? []. Levels named 'face' or 'part' use key 'styleId' and are checked first. Then for each chain key in order (door: doorStyleId; drawer_front: drawerFrontStyleId, doorStyleId; panel: panelStyleId, doorStyleId), the other levels nearest first. First id found in styles wins: source { level, key }; the stored style object itself is returned. null/undefined inherit. An id not in styles pushes { code: 'door-style-missing', level, id } and the walk continues. Nothing found → teamDoorStyle(settings), source { level: 'team', key: null }.
  design = findDoorDesign(style.designId, designs); if null, findDoorDesign(DEFAULT_DESIGN_ID, designs) ?? DOOR_DESIGNS[0] plus warning { code: 'door-design-missing', id: style.designId } after the style warnings.

Files (only these):
- NEW src/elevation/model/doorStyleResolve.js
- NEW src/elevation/model/__tests__/doorStyleResolve.test.js: the SPEC §4 file VERBATIM (8 tests)

DO NOT change styles.js (resolveStyle is the cabinet style) or any other file. DO NOT grep the repo.

Write the test file first; run `npx vitest run src/elevation/model/__tests__/doorStyleResolve.test.js`. Iterate on that file. At the end `npm test && npm run lint` once: 980 + 8 = 988, lint 0 errors.

At most three lines of summary. Commit "elevation-mvp: step 381 Door style resolver".
```

---

## Step 382 — `doorSizes.js`: final stile and rail sizes

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.md §1 and §5. Step 381 is in.
If `git status` shows uncommitted changes, stop and tell me.

New module src/elevation/model/doorSizes.js, no imports: partSizes(style, design, part), part = { width, height, sizes? }.
- design.construction !== 'five_piece' → { construction: 'slab', slab: 'design' }; else height < style.shortFace.slabBelow - 1e-9 → { construction: 'slab', slab: 'rule' }.
- down(x) = Math.floor(x / step + 1e-9) * step (step, minPanel, minRail from style.shortFace).
- Rails: both typed in sizes.rails → kept ('part'). One typed → kept ('part'); the other = min(R.side, max(minRail, down(height - minPanel - typed))). None typed → each = min(R.side, max(minRail, down((height - minPanel) / 2))). A calculated rail's source is 'style' when it equals the style's width (1e-9), else 'rule'.
- Stiles: sizes.stiles?.left ?? style.stiles.left (and right); source 'part' when typed, else 'style'.
- midRails: (sizes.midRails ?? []).map(({at, width}) => ({ at, width: width ?? style.rails.top + style.mid.extra })); midStiles the same with style.stiles.left + style.mid.extra.
- opening = { width: width - left - right, height: height - top - bottom } (mids ignored).
- Return { construction: 'five_piece', slab: null, stiles, rails, midRails, midStiles, opening, sources: { top, bottom, left, right }, notes: sizes?.notes ?? {} }.

Files (only these):
- NEW src/elevation/model/doorSizes.js
- NEW src/elevation/model/__tests__/doorSizes.test.js: the SPEC §5 file VERBATIM (7 tests)

DO NOT change any other file; nothing calls partSizes yet. DO NOT grep the repo.

Write the test file first; run `npx vitest run src/elevation/model/__tests__/doorSizes.test.js`. Iterate on that file. At the end `npm test && npm run lint` once: 988 + 7 = 995, lint 0 errors. If a value in Kyle's table test fails, don't change the test: report what you got.

At most three lines of summary. Commit "elevation-mvp: step 382 Door stile and rail sizes".
```

---

## Step 383 — stacking check

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.md §1 and §6. Step 382 is in.
If `git status` shows uncommitted changes, stop and tell me.

In src/elevation/model/doorSizes.js export frontStackWarnings(parts), parts = [{ path, x, z, width, height, sizes }] with sizes from partSizes. For each a, then each b (input order, a !== b), both construction 'five_piece', push { code: 'front-panel-over-taller', path: a.path, below: b.path } when:
- min(a.x + a.width, b.x + b.width) - max(a.x, b.x) > 1e-6,
- a.z >= b.z + b.height - 1e-6,
- a.height <= b.height + 1e-6,
- a.sizes.opening.height > b.sizes.opening.height + 1e-6.
Doc comment: a shorter front above must never have a bigger panel than one below (SPEC-46); warns, never fixes.

Files (only these):
- src/elevation/model/doorSizes.js
- src/elevation/model/__tests__/doorSizes.test.js: add frontStackWarnings to its doorSizes.js import and append the SPEC §6 describe VERBATIM at the end (4 tests)

DO NOT change partSizes or any other file. DO NOT grep the repo.

Change the test first; run `npx vitest run src/elevation/model/__tests__/doorSizes.test.js`. Iterate on those two files. At the end `npm test && npm run lint` once: 995 + 4 = 999, lint 0 errors.

At most three lines of summary. Commit "elevation-mvp: step 383 Front stacking check".
```

---

## Step 384 — run front plane = thickest face

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.md §1 and §7. Step 383 is in.
If `git status` shows uncommitted changes, stop and tell me.

A Euro run's front plane follows its thickest face (derived run._doorThickness, never saved).
- src/elevation/model/doorStyleResolve.js: export runDoorThickness(room, wall, run, settings): the largest resolveDoorStyle(room, settings, facePartType(leaf.type), cabinetFaceLevels(room, wall, run, cabinet, leaf)).style.thickness over every non-open face leaf of every cabinet leaf in gridLeaves(run.grid) (import from './grid.js'; cabinet leaves have kind 'cabinet'). Face leaves: a node with `type` is a leaf, a group has `children`. A cabinet with no face counts as one { type: 'door' } leaf. No cabinets or no grid → teamDoorStyle(settings).thickness.
- src/elevation/model/roomSync.js (385 lines): private withDoorThickness(room, wall, run, settings) like withSeamGap/withFrame (lines 72–93): run._frame → no key; else t = runDoorThickness(...); |t - teamDoorStyle(settings).thickness| > 1e-9 → { ...run, _doorThickness: t } (same run if already equal), otherwise remove the key (same run if absent). In syncRoom's first runs pass (lines 162–165): withRunPlane(wall, withDoorThickness(nextRoom, wall, withFrame(nextRoom, withSeamGap(nextRoom, run, settings), settings), settings)).
- src/elevation/model/corners.js (235 lines): export runFaceThickness(run, settings) → run._doorThickness ?? settings.doorThickness (doc: the run's front plane thickness, its thickest face, SPEC-46 P11). frontDepth's last line (34) uses it instead of settings.doorThickness.
- src/elevation/model/cells.js (360 lines): cellDepth(piece, leaf, runDepth, settings, doorThickness = settings.doorThickness); line 322 uses doorThickness.
- src/elevation/model/planPieces.js (372 lines) line 241: cellDepth(piece, leafOf(piece), run.depth, settings, runFaceThickness(run, settings)); import runFaceThickness with frontDepth.
- src/elevation/store/persistence.js toElevationDocument (~line 651): strip _doorThickness with the other derived keys (and its void).

Files (only these):
- the six above
- NEW src/elevation/model/__tests__/doorThickness.test.js: the SPEC §7 file VERBATIM (9 tests)

DO NOT change the face lines in planPieces.js (line 93) or elevationParts.js (step 385), CellProperties.jsx, SettingsPanel.jsx, constants.js or any other test. DO NOT grep the repo.

Write the test file first; run `npx vitest run src/elevation/model/__tests__/doorThickness.test.js`: tests 2, 3, 4, 5 and 8 must fail; the others pass either way. Iterate on that file. At the end `npm test && npm run lint` once: 999 + 9 = 1008, golden snapshot UNCHANGED, lint 0 errors. If the golden snapshot changes, stop and tell me.

At most three lines of summary. Commit "elevation-mvp: step 384 Run front follows thickest face".
```

---

## Step 385 — each face at its own thickness

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.md §1 and §8. Step 384 is in.
If `git status` shows uncommitted changes, stop and tell me.

Faces draw at their own style's thickness: backs line up, fronts move (Euro); inset doors keep their face at the frame and go deeper.
- src/elevation/model/faceLayouts.js (106 lines) runFaceLayouts: after applyHinges (line 91), map hinged.faces: for a face whose facePartType(face.type) isn't null, resolve resolveDoorStyle(room, settings, partType, cabinetFaceLevels(room, wall, run, item, getFaceNode(<the cabinet's face tree, the local `face`>, f.path))). When |thickness - teamDoorStyle(settings).thickness| > 1e-9 the face gets `thickness`; otherwise leave the face object exactly as it is (no new key). Use a different name than `face` for the mapped face. Keep `wall` (already the run's side view).
- src/elevation/model/elevationParts.js (148 lines) lines 126–130: const thickness = face.thickness ?? settings.doorThickness; use it for both settings.doorThickness reads.
- src/elevation/model/planPieces.js (~372 lines) line 93: front: back + (face.thickness ?? settings.doorThickness).
- Imports in faceLayouts.js: getFaceNode from './faceTree.js'; cabinetFaceLevels, facePartType, resolveDoorStyle from './doorStyleResolve.js'; teamDoorStyle from './doorStyles.js'.

Files (only these):
- the three above
- src/elevation/model/__tests__/doorThickness.test.js: add resolveWall to the '../room.js' import, import runScene from '../runScene.js' and planRunPieces from '../planPieces.js', and append the SPEC §8 describe VERBATIM at the end (5 tests)

DO NOT change the box, frame, filler or panel lines in elevationParts.js or planPieces.js, cabinetFaces in faces.js, runScene.js or any other test. DO NOT grep the repo.

Change the test first; run `npx vitest run src/elevation/model/__tests__/doorThickness.test.js`: all 5 new tests must fail. Iterate on that file. At the end `npm test && npm run lint && npm run build` once: 1008 + 5 = 1013, golden snapshot UNCHANGED, lint 0 errors, build succeeds. If the G2 frame part's back/front isn't 24 / 24.8125, don't change the test: report it.

At most three lines of summary. Commit "elevation-mvp: step 385 Faces at their own thickness".
```

---

## Running it (Kyle, after 385)

Nothing visible changes: no UI picks a style yet. Open your rooms and export a DXF to confirm they're unchanged, and check Settings → Door thickness still moves the doors (it's the team default style's thickness until 46.3). Next: 46.1, the Door styles section and pickers.
