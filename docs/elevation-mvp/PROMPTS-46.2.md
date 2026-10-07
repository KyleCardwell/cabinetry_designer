# Round 46.2 — Codex Prompts, Steps 404–408 (door details on the canvas)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session. Every step is in **cabinetry_designer**, branch **elevation-doors**; geometry and the API don't change.

Before step 404, commit `docs/elevation-mvp/SPEC-46.2.md`, this file and the `TODO.md` additions.

| Step | Repo | What | Tests after |
|---|---|---|---|
| 404 | cabinetry_designer | `partDetail`: a part's frame openings | 1062 |
| 405 | cabinetry_designer | `runDoorDetails`: every face-on part in a run, labels, warnings | 1067 |
| 406 | cabinetry_designer | Room choices: Door details / style tags (helper, store, saves) | 1070 |
| 407 | cabinetry_designer | Canvas: `DoorDetails.jsx` layer in `RunGroup` | 1070 |
| 408 | cabinetry_designer | UI: room checkboxes; door warnings in face properties | 1070 |

---

## Step 404 — `partDetail`

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.2.md §1 and §2. Step 403 is in (1057 tests).
If `git status` shows uncommitted changes, stop and tell me.

NEW src/elevation/model/doorDetails.js, importing only partSizes from './doorSizes.js':
partDetail(style, design, rect, sizes) — rect { x, z, width, height } in wall coordinates (z up), sizes the part's stored sizes or undefined.
- r = partSizes(style, design, { width: rect.width, height: rect.height, sizes }).
- r.construction === 'slab' → { ...r, openings: [] }.
- Else O = { x: rect.x + r.stiles.left, z: rect.z + r.rails.bottom, width: r.opening.width, height: r.opening.height }.
  Rows = [O.z, O.z + O.height] minus the union of [rect.z + at − width/2, rect.z + at + width/2] over r.midRails, pieces longer than 1e-6, bottom to top.
  Columns = the same across [O.x, O.x + O.width] with r.midStiles measured from rect.x, left to right.
  openings = each row (bottom first) × each column (left first) as { x, z, width, height }.
  Return { construction: r.construction, openings, sizes: r }.
Doc comment: frame openings (5-piece) or molding rectangles (Slab AM) of one part, in wall coordinates (SPEC-46.2).

Files (only these):
- NEW src/elevation/model/doorDetails.js
- NEW src/elevation/model/__tests__/doorDetails.test.js: the SPEC §2 file VERBATIM (5 tests)

DO NOT change doorSizes.js or any other file. DO NOT grep the repo.

Write the test file first; run `npx vitest run src/elevation/model/__tests__/doorDetails.test.js`. Iterate on that file. At the end `npm test && npm run lint` once: 1057 + 5 = 1062, lint 0 errors.

At most three lines of summary. Commit "elevation-mvp: step 404 Door detail openings".
```

---

## Step 405 — `runDoorDetails`

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.2.md §1 and §3. Step 404 is in (1062 tests).
If `git status` shows uncommitted changes, stop and tell me.

Add runDoorDetails(room, wall, run, settings, scene = runScene(room, wall, run, settings)) → { parts, warnings } to src/elevation/model/doorDetails.js, exactly as SPEC §3.
New imports: runScene ('./runScene.js'), panelOrientation ('./cells.js'), findLeaf ('./cellTree.js'), runItems ('./grid.js'), cabinetFaceLevels, facePartType, panelLevels, resolveDoorStyle ('./doorStyleResolve.js'), defaultFace ('./faces.js'), getFaceNode ('./faceTree.js'), frontStackWarnings ('./doorSizes.js'), wallViewForRun ('./wallSides.js'). Check there's no import cycle.
- levelsWall = wallViewForRun(wall, run) for every level list.
- Part: { key, kind, pieceId, path, styleId, label, construction, x, z, width, height, openings } — styleId/label from the resolved style; construction/openings from partDetail(style, design, rect, sizes).
- Order: (1) faces, kind 'face': each [pieceId, layout] of scene.faceLayouts, each layout.faces entry with facePartType(type) !== null; item = layout.box.columnId ? findLeaf(run.grid, pieceId) : runItems(run).find(c => c.id === pieceId); node = getFaceNode(item?.face ?? defaultFace(layout.box.width, settings), face.path); style from cabinetFaceLevels(room, levelsWall, run, item, node); sizes = node?.sizes; key `${pieceId}:${face.path}` plus `:${face.half}` for a pair leaf; path = face.path.
  (2) back panel cells, kind 'panelCell': scene.drawnPieces with kind 'panel' and panelOrientation(piece) === 'back'; leaf = findLeaf(run.grid, piece.id); style from panelLevels(room, levelsWall, run, leaf, { sheet: true }) with partType 'panel'; sizes = leaf?.sizes; key `panel:${piece.id}`; path null.
  (3) blind panels, kind 'blindPanel': scene.blind.entries with a panel; rect { x: panel.x, z: run.z, width: panel.width, height: run.height }; part = run.ends?.[entry.side] ?? null; panelLevels(room, levelsWall, run, part); sizes = part?.sizes; key `blind:${entry.side}`; pieceId entry.endPieceId; path null.
- warnings: every part's resolver warnings in part order as { ...warning, pieceId, key }; then per pieceId of scene.faceLayouts (map order) frontStackWarnings over that piece's face parts with construction !== 'slab' as { path, x, z, width, height, sizes } (sizes = partDetail's sizes), first of each path/below pair only, each { code, pieceId, path, below }.

Files (only these):
- src/elevation/model/doorDetails.js
- NEW src/elevation/model/__tests__/runDoorDetails.test.js: the SPEC §3 file VERBATIM (5 tests)

DO NOT change runScene.js, faceLayouts.js, doorSizes.js, doorStyleResolve.js or any other file. DO NOT grep the repo.

Write the test file first; run `npx vitest run src/elevation/model/__tests__/runDoorDetails.test.js`. Iterate on that file. At the end `npm test && npm run lint` once: 1062 + 5 = 1067, golden snapshot UNCHANGED, lint 0 errors. If the G3 back panel's rect in test 4 comes out different, don't change the test: report what you got.

At most three lines of summary. Commit "elevation-mvp: step 405 Door details for a run".
```

---

## Step 406 — the room's choices: Door details, style tags

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.2.md §1 and §4. Step 405 is in (1067 tests).
If `git status` shows uncommitted changes, stop and tell me.

- src/elevation/model/doorDetails.js: export doorDrawing(room) → { details: room?.doorDetails !== false, tags: room?.doorStyleTags === true } (doc: P8, Door details by default, style tags off by default, SPEC-46.2).
- src/elevation/store/slices/doorStyles.js (114 lines): reducer setRoomDoorDrawing({ roomId, doorDetails, doorStyleTags }): room = roomFor(state, roomId), return without one. Each key counts only when it's an own key of the payload and must then be a boolean, else return without changes. doorDetails: true deletes the key, false stores false. doorStyleTags: true stores true, false deletes. No sync.
- src/elevation/store/elevationSlice.js (182 lines): export setRoomDoorDrawing next to setDoorStylePick (line ~171).
- src/elevation/store/persistence.js isRoom (line 495): add (room.doorDetails === undefined || typeof room.doorDetails === 'boolean') && (room.doorStyleTags === undefined || typeof room.doorStyleTags === 'boolean').

Files (only these):
- the four above
- NEW src/elevation/store/__tests__/sliceDoorDrawing.test.js: the SPEC §4 file VERBATIM (3 tests)

DO NOT change toElevationDocument, the schema version, other reducers or the UI. DO NOT open persistence.test.js. DO NOT grep the repo.

Write the test file first; run `npx vitest run src/elevation/store/__tests__/sliceDoorDrawing.test.js`. Iterate on that file. At the end `npm test && npm run lint` once: 1067 + 3 = 1070, lint 0 errors.

At most three lines of summary. Commit "elevation-mvp: step 406 Room door details and style tag choices".
```

---

## Step 407 — canvas: the door details layer

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.2.md §1 and §5. Step 406 is in (1070 tests).
If `git status` shows uncommitted changes, stop and tell me.

UI only, no new tests.
- NEW src/elevation/components/DoorDetails.jsx, props { parts, warnings, transform, showDetails, showTags }, everything listening={false}, following FaceOutlines.jsx (wallRectToScreen from '../canvas/transform.js', a Fragment per part keyed by part.key):
  - showDetails: each opening as a Rect (wallRectToScreen(opening, transform)), stroke "#94a3b8", strokeWidth 1, no fill; skip one whose screen width or height is under 2px.
  - warned part (a warning with key === part.key, or code 'front-panel-over-taller' with pieceId === part.pieceId and path === part.path): a Rect over the part's own rect, stroke "#f59e0b", strokeWidth 1.5, dash [4, 2] — drawn even when showDetails is false.
  - showTags: Text part.label at the part's screen x + 3, y + 3, fontSize 9, fill "#c4b5fd", only when its screen rect is at least 14px wide and 12px tall.
- src/elevation/components/RunGroup.jsx (462 lines): import doorDrawing, runDoorDetails from '../model/doorDetails.js' and DoorDetails from './DoorDetails.jsx' (imports are lines 1–24). After `scene` (line ~51): const drawing = doorDrawing(room); const doorDetails = useMemo(() => runDoorDetails(room, wall, run, settings, scene), [room, run, scene, settings, wall]). Mount <DoorDetails parts={doorDetails.parts} warnings={doorDetails.warnings} transform={transform} showDetails={drawing.details} showTags={drawing.tags} /> after the shelves block (line ~322) and before the faceLayouts/FaceOutlines block (line ~334).

Files (only these): the two above.

DO NOT change FaceOutlines.jsx, PieceRect.jsx, ElevationCanvas.jsx, the plan canvas, the model or the store. DO NOT grep the repo.

At the end `npm test && npm run lint && npm run build` once: still 1070 tests, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 407 Door details on the canvas".
```

---

## Step 408 — UI: the room's checkboxes; door warnings in face properties

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.2.md §1 and §6. Step 407 is in (1070 tests).
If `git status` shows uncommitted changes, stop and tell me.

UI only, no new tests.
- src/elevation/components/RoomDoorStylesPanel.jsx (157 lines): first thing inside the section's space-y-3 div (line 24), two rows (`flex items-center gap-2 text-xs text-gray-300`, a plain checkbox input each):
  "Draw door details" — checked={doorDrawing(room).details}, onChange → dispatch(setRoomDoorDrawing({ roomId: room.id, doorDetails: event.target.checked })), aria-label "Draw door details";
  "Show style tags" — checked={doorDrawing(room).tags}, → doorStyleTags, aria-label "Show style tags".
  Shown whether or not the room has styles. Imports: doorDrawing from '../model/doorDetails.js', setRoomDoorDrawing from '../store/elevationSlice.js'.
- src/elevation/components/properties/FaceProperties.jsx (370 lines): import runDoorDetails from '../../model/doorDetails.js'. Line 66 becomes the face layout's warnings followed by runDoorDetails(room, wall, run, settings).warnings filtered to pieceId === piece.id and code !== 'door-style-missing'. WARNING_MESSAGES (line 37) adds:
  'front-panel-over-taller': 'A shorter front above has a bigger panel than the one below it — adjust its rails.'
  'door-design-missing': 'This face\'s door design is missing — drawn as 5-piece square.'

Files (only these): the two above.

DO NOT change DoorStylePicks.jsx, PartStyleFields.jsx, the store or the model. DO NOT grep the repo.

At the end `npm test && npm run lint && npm run build` once: still 1070 tests, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 408 Door details toggles and warnings".
```

---

## Running it (Kyle, after 408)

Follow SPEC-46.2's end-to-end check: 3" frame openings everywhere by default, Outlines only / style tags from Room → Door styles, Slab AM molding rectangles, mid rails/stiles splitting the opening, the amber stacking warning on a drawer stack, back panel cells and a blind panel with a 5-piece Panels style. Plan view and DXF unchanged.
