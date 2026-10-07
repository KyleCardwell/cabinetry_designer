# Round 46.1 — Codex Prompts, Steps 386–395 (slab with applied molding, door styles UI)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session. Every step is in **cabinetry_designer**, branch **elevation-doors**; geometry and the API don't change.

| Step | Repo | What | Tests after |
|---|---|---|---|
| 386 | cabinetry_designer | Slab AM design; `partSizes` and the stacking check handle it | 1018 |
| 387 | cabinetry_designer | `doorStyleEdits.js`: new style, labels, uses, reassign | 1022 |
| 388 | cabinetry_designer | Part edits, picker options, size rows | 1028 |
| 389 | cabinetry_designer | Store: add / edit / delete door styles | 1032 |
| 390 | cabinetry_designer | Store: picks, part styles, keep them on other edits | 1037 |
| 391 | cabinetry_designer | UI: room Door styles section, room pickers | 1037 |
| 392 | cabinetry_designer | UI: door style tool | 1037 |
| 393 | cabinetry_designer | UI: pickers on wall, run, cabinet | 1037 |
| 394 | cabinetry_designer | UI: face style + Stiles & rails block | 1037 |
| 395 | cabinetry_designer | UI: panel styles; flush-panel depth placeholder | 1037 |

Before step 386: commit `docs/elevation-mvp/SPEC-46.1.md` and this file so `git status` is clean.

---

## Step 386 — Slab AM design

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.1.md §1 and §2. Step 385 is in (1013 tests).
If `git status` shows uncommitted changes, stop and tell me.

Add the "slab with applied molding" door design (P17).
- src/elevation/model/doorStyles.js: in DOOR_DESIGNS, slab's slots become ['outside']; append { id: 'slab-applied', code: 'Slab AM', vendor: null, description: 'Slab with applied molding', construction: 'slab_applied', topRail: { shape: 'flat' }, bottomRail: { shape: 'flat' }, slots: ['outside', 'applied'] }.
- src/elevation/model/doorSizes.js partSizes: five_piece and slab_applied both run the existing rail/stile/mid/opening code, and the result's construction is the design's (five_piece results must stay exactly as they are). Any other construction → { construction: 'slab', slab: 'design' }. Under shortFace.slabBelow: five_piece → { construction: 'slab', slab: 'rule' } (unchanged); slab_applied → { construction: 'slab', slab: 'rule', molding: false }.
- frontStackWarnings: a part counts when sizes.construction is 'five_piece' or 'slab_applied' (mixed pairs compare too). Doc comment: molding rectangles count as panels (P17).

Files (only these):
- src/elevation/model/doorStyles.js
- src/elevation/model/doorSizes.js
- src/elevation/model/__tests__/doorStyles.test.js: in test 1 the expected list becomes the three rows given in SPEC §2 (nothing else changes)
- src/elevation/model/__tests__/doorSizes.test.js: delete lines 75–76 (the `{ ...SLAB, construction: 'slab_applied' }` assertion); nothing else changes
- NEW src/elevation/model/__tests__/slabApplied.test.js: the SPEC §2 file VERBATIM (5 tests)

DO NOT change doorStyleResolve.js or any other file. DO NOT grep the repo.

Write the new test file first; run `npx vitest run src/elevation/model/__tests__/slabApplied.test.js src/elevation/model/__tests__/doorSizes.test.js src/elevation/model/__tests__/doorStyles.test.js`. Iterate on those. At the end `npm test && npm run lint` once: 1013 + 5 = 1018, golden snapshot unchanged, lint 0 errors.

At most three lines of summary. Commit "elevation-mvp: step 386 Slab with applied molding".
```

---

## Step 387 — `doorStyleEdits.js`: the style list

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.1.md §1 and §3. Step 386 is in.
If `git status` shows uncommitted changes, stop and tell me.

New pure module src/elevation/model/doorStyleEdits.js (imports DOOR_STYLE_KEYS from './doorStyles.js', gridLeaves from './grid.js'; never mutates its inputs):
- nextDoorStyleLabel(styles = []): first of A–Z not used as a label; when all 26 are used, first of '1', '2', … not used.
- newDoorStyle(styles, base, id): structuredClone(base) without `name`, with id and label nextDoorStyleLabel(styles).
- doorStyleUses(room, styleId): every place that picks styleId, in the exact order and shapes of SPEC §3 (room keys; per wall: wall keys, endPanels start/end; per run: run keys, ends left/right, then each gridLeaves leaf: cabinet keys then its face leaves in pre-order with paths 'r', 'r.0', 'r.0.1'…, or a panel leaf). Skip missing walls/runs/endPanels/ends/grid/face.
- reassignDoorStyle(room, fromId, toId): structuredClone(room) with every use set to toId, or its key deleted when toId is null. room.doorStyles untouched.

Files (only these):
- NEW src/elevation/model/doorStyleEdits.js
- NEW src/elevation/model/__tests__/doorStyleEdits.test.js: the SPEC §3 file VERBATIM (4 tests)

DO NOT change any other file. DO NOT grep the repo.

Write the test file first; run `npx vitest run src/elevation/model/__tests__/doorStyleEdits.test.js`. Iterate on that file. At the end `npm test && npm run lint` once: 1018 + 4 = 1022, lint 0 errors.

At most three lines of summary. Commit "elevation-mvp: step 387 Door style list edits".
```

---

## Step 388 — part edits, picker options, size rows

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.1.md §1 and §4. Step 387 is in.
If `git status` shows uncommitted changes, stop and tell me.

Pure helpers the UI steps use. Follow SPEC §4's contract exactly.
- src/elevation/model/faceTree.js (183 lines): export setFacePart(face, path, patch). Only a leaf with a type other than 'open' (else return face). For styleId and sizes that are own keys of patch: null/undefined deletes, anything else sets. Use the file's replaceAt. Same face back when nothing changes (styleId by ===, sizes by JSON.stringify).
- src/elevation/model/doorStyleEdits.js: add setPartSide(sizes, side, width), setPartNote(sizes, side, note), setPartMids(sizes, kind, mids) — each returns a new object or undefined when empty, drops emptied groups, and returns `sizes` itself for an unknown side or a width that isn't null and isn't > 0. Add pickOptions(room, settings, partType, levelsAbove) and partSizeRows(style, design, part) with the shapes, labels and texts in SPEC §4. New imports: formatInches ('./units.js'), resolveDoorStyle ('./doorStyleResolve.js'), partSizes ('./doorSizes.js'), findDoorDesign and DOOR_DESIGNS ('./doorStyles.js'). Check there's no import cycle (doorStyleResolve.js imports doorStyles.js and grid.js only).

Files (only these):
- src/elevation/model/faceTree.js
- src/elevation/model/doorStyleEdits.js
- NEW src/elevation/model/__tests__/partStyleEdits.test.js: the SPEC §4 file VERBATIM (6 tests)

DO NOT change faces.js, doorSizes.js, doorStyleResolve.js or any other file. DO NOT grep the repo.

Write the test file first; run `npx vitest run src/elevation/model/__tests__/partStyleEdits.test.js`. Iterate on that file. At the end `npm test && npm run lint` once: 1022 + 6 = 1028, lint 0 errors.

At most three lines of summary. Commit "elevation-mvp: step 388 Part style edits".
```

---

## Step 389 — store: the room's door style list

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.1.md §1 and §5. Step 388 is in.
If `git status` shows uncommitted changes, stop and tell me.

New slice file src/elevation/store/slices/doorStyles.js exporting doorStyleReducers (follow store/slices/rooms.js — addRoom has the prepare pattern — and store/slices/styles.js). Helpers roomFor, roomIndexFor, syncRoomAt from './helpers.js'; current from '@reduxjs/toolkit'; uuid from 'uuid'; isDoorStyle, teamDoorStyle from '../../model/doorStyles.js'; newDoorStyle, doorStyleUses, reassignDoorStyle from '../../model/doorStyleEdits.js'. roomId is optional (active room).
- addDoorStyle: prepare(payload = {}) → { payload: { ...payload, id: payload.id ?? uuid() } }. Base = the room style with payload.baseId (return if not found) or, with no baseId, teamDoorStyle(state.settings). room.doorStyles = [...(room.doorStyles ?? []), newDoorStyle(styles, base, id)]. No sync.
- updateDoorStyle({ roomId, styleId, style }): next = { ...style, id: styleId }; only when the style exists, isDoorStyle(next) and no OTHER style has next.label. Replace in place, then syncRoomAt.
- deleteDoorStyle({ roomId, styleId, reassignTo }): return if not listed. uses = doorStyleUses(current(room), styleId). With uses, reassignTo must be null or another listed id (not styleId), else return; then state.rooms[index] = reassignDoorStyle(current(room), styleId, reassignTo). Remove the style from the new room's list; delete doorStyles when empty; syncRoomAt. (Never structuredClone an immer draft — always pass current(room).)
In src/elevation/store/elevationSlice.js (175 lines): import doorStyleReducers, spread it after ...styleReducers, export addDoorStyle, updateDoorStyle, deleteDoorStyle.

Files (only these):
- NEW src/elevation/store/slices/doorStyles.js
- src/elevation/store/elevationSlice.js
- NEW src/elevation/store/__tests__/sliceDoorStyles.test.js: the SPEC §5 file VERBATIM (4 tests)

DO NOT change the other slice files, persistence.js or model files. DO NOT grep the repo.

Write the test file first; run `npx vitest run src/elevation/store/__tests__/sliceDoorStyles.test.js`. Iterate on that file. At the end `npm test && npm run lint` once: 1028 + 4 = 1032, golden snapshot unchanged, lint 0 errors.

At most three lines of summary. Commit "elevation-mvp: step 389 Door style list in the store".
```

---

## Step 390 — store: picks, part styles, and keeping them

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.1.md §1 and §6. Step 389 is in.
If `git status` shows uncommitted changes, stop and tell me.

A style id is valid when it's in room.doorStyles.
- src/elevation/store/slices/doorStyles.js: add
  - setDoorStylePick({ roomId, level, wallId, runId, itemIds = [], key, styleId }): key in DOOR_STYLE_KEYS; styleId null (delete the key) or valid; level 'room' → room, 'wall' → wallLocation(state, payload).wall, 'run' → runLocation(state, payload).run, 'cabinet' → each kind 'cabinet' leaf of gridLeaves(run.grid) with id in itemIds; anything else or no target → return. Then syncRoomAt.
  - setPartStyle({ roomId, wallId, part, runId, side, endpoint, cellId, styleId?, sizes? }): target 'runEnd' → run.ends[side] (left/right); 'wallEndPanel' → wall.endPanels?.[endpoint] (start/end, non-null); 'panelCell' → findLeaf(run.grid, cellId) (from '../../model/cellTree.js') with kind 'panel' — mutate that draft node. Other part or no target → return. Validate everything first: if styleId is an own key it must be null (delete) or valid; if sizes is an own key it must be null (delete) or pass isPartSizes (store structuredClone). Any invalid → return with no change. Then syncRoomAt.
  Helpers wallLocation, runLocation from './helpers.js'; gridLeaves from '../../model/grid.js'; DOOR_STYLE_KEYS, isPartSizes from '../../model/doorStyles.js'.
- src/elevation/store/elevationSlice.js: export setDoorStylePick, setPartStyle.
- src/elevation/store/slices/styles.js (96 lines) setItemFace: add syncRoomAt(state, location.roomIndex) at the end (already imported).
- src/elevation/store/slices/walls.js setWallEndPanel (lines 182–198): when panel isn't null, the new entry also keeps the stored entry's styleId and sizes when set.
- src/elevation/model/cellTree.js setGridPanelType (lines 372–389): `next` also copies the leaf's styleId and sizes when present; the sameLeaf check compares them too.

Files (only these):
- the five above
- NEW src/elevation/store/__tests__/sliceDoorStylePicks.test.js: the SPEC §6 file VERBATIM (5 tests)

DO NOT change roomSync.js, setRunEnd, setGridCellKind, persistence.js or any other file. DO NOT grep the repo.

Write the test file first; run `npx vitest run src/elevation/store/__tests__/sliceDoorStylePicks.test.js`. Iterate on that file. At the end `npm test && npm run lint` once: 1032 + 5 = 1037, golden snapshot UNCHANGED, lint 0 errors. If an existing test breaks because setItemFace now syncs, don't change that test: stop and report it.

At most three lines of summary. Commit "elevation-mvp: step 390 Door style picks in the store".
```

---

## Step 391 — UI: the room's Door styles section and room pickers

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.1.md §1 and §7. Step 390 is in (1037 tests).
If `git status` shows uncommitted changes, stop and tell me.

UI only, no new tests. Import door-style functions straight from their modules (model/doorStyles.js, doorStyleEdits.js); don't change model/index.js.
- NEW src/elevation/components/properties/DoorStylePicks.jsx: props { room, settings, levelsAbove, node, label, onChange, always = false }. Nothing when room.doorStyles is empty unless `always`. Three selects styled like components/properties/StyleFields.jsx (same SELECT_CLASS, label above): Doors ('door', doorStyleId), Drawer fronts ('drawer_front', drawerFrontStyleId), Panels ('panel', panelStyleId). Options from pickOptions(room, settings, partType, levelsAbove): value "" = inherit.text, then each option. Value node?.[key] ?? ''; a stored id not in the list shows as an extra option `Missing (${id})`. aria-labels `${label} doors style` / `${label} drawer fronts style` / `${label} panels style`. onChange(key, value || null).
- NEW src/elevation/components/RoomDoorStylesPanel.jsx following components/RoomStylePanel.jsx (same section/h3 classes; heading "Door styles"; rooms/activeRoomId/settings from the store; nothing without a room):
  - one row per style: label (bold), `design code · thickness` (findDoorDesign(designId)?.code ?? designId, formatInches), name if any, `n uses` / `unused` from doorStyleUses(room, id).length, and a Delete button;
  - Delete: unused → dispatch deleteDoorStyle({ roomId, styleId }); used → a confirm under the row: "Used n times. Move them to:" select ('' = Inherit, then the other styles), Delete → deleteDoorStyle({ roomId, styleId, reassignTo: value || null }), Cancel. Local state only;
  - New: a "Copy of" select ('' = Team default (Std), then the room's styles) and a New button → addDoorStyle({ roomId, baseId: value || undefined });
  - then <DoorStylePicks always room settings levelsAbove={[]} node={room} label="Room" onChange={(key, styleId) => dispatch(setDoorStylePick({ roomId: room.id, level: 'room', key, styleId }))} />;
  - with no styles, a grey line "No door styles yet — everything uses " + the team row (pickOptions(room, settings, 'door', []).inherit.text without the "Inherit (…)" wrapper).
  No Edit button yet (step 392).
- src/elevation/ElevationLab.jsx (83 lines): import it and render <RoomDoorStylesPanel /> right after <RoomStylePanel />.

Files (only these): the three above.

DO NOT change RoomStylePanel.jsx, PropertiesPanel.jsx, the store or the model. DO NOT grep the repo.

At the end `npm test && npm run lint && npm run build` once: still 1037 tests, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 391 Room door styles section".
```

---

## Step 392 — UI: the door style tool

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.1.md §1 and §8. Step 391 is in.
If `git status` shows uncommitted changes, stop and tell me.

UI only, no new tests.
- NEW src/elevation/components/DoorStyleEditor.jsx: props { room, styleId, onClose }. Local `draft` = structuredClone of the stored style when it opens. Modal: overlay `fixed inset-0 z-50 flex items-center justify-center bg-black/60`, panel `w-[36rem] max-h-[90vh] overflow-y-auto rounded border border-gray-700 bg-gray-800 p-5`, title `Door style ${draft.label}`. Escape and Cancel close without saving. Inputs styled like components/properties/StyleFields.jsx; sizes with InchInput (displayStep 1/16; onCommit returns false for values that aren't > 0, except mid extra and slab below which allow 0). Fields, exactly as SPEC §8:
  Label (required), Name (blank removes `name`), Design (select over DOOR_DESIGNS, `${code} — ${description}`), Thickness;
  widths block titled by the design's construction: five_piece "Stiles & rails" (Left stile, Right stile, Top rail, Bottom rail); slab_applied "Molding inset" (Left, Right, Top, Bottom); slab: Stiles & rails labels DISABLED with "Not used by a slab — kept if you switch back";
  Mid rail/stile extra (enabled for five_piece and slab_applied); Panel type (PANEL_TYPES as Flat / Raised) + thickness (five_piece only); Arch rise (disabled unless the design's top or bottom rail shape isn't 'flat'; note "For arched designs (46.3)"); Short faces: Min panel, Min rail/inset, Slab below, Round to (disabled on slab); Profiles: read-only "All square — the profile library comes later."
  Save is enabled only when isDoorStyle(draft) and no other style in room.doorStyles has draft.label, else disabled with a short red reason ("Label already used" / "Every size must be more than 0"); it dispatches updateDoorStyle({ roomId: room.id, styleId, style: draft }) and closes. Switching design never clears fields.
- src/elevation/components/RoomDoorStylesPanel.jsx: local editingId; an Edit button per row sets it; New becomes `const action = addDoorStyle({ roomId: room.id, baseId }); dispatch(action); setEditingId(action.payload.id);`; render <DoorStyleEditor room={room} styleId={editingId} onClose={() => setEditingId(null)} /> while editingId is in room.doorStyles.

Files (only these): the two above.

DO NOT change the store, the model or other components. DO NOT grep the repo.

At the end `npm test && npm run lint && npm run build` once: still 1037 tests, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 392 Door style tool".
```

---

## Step 393 — UI: pickers on a wall, a run and a cabinet

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.1.md §1 and §9. Step 392 is in.
If `git status` shows uncommitted changes, stop and tell me.

UI only, no new tests. Use components/properties/DoorStylePicks.jsx (from step 391) and dispatch setDoorStylePick, with the node / levelsAbove / label / payload in SPEC §9's table:
- src/elevation/components/properties/WallHeightProperties.jsx (357 lines): a "Door styles" <section> at the end (same h3 classes as the file's other sections), rendered only when room.doorStyles?.length. node = room.walls.find((w) => w.id === wall.id); levelsAbove [{ level: 'room', node: room }]; label "Wall"; payload { level: 'wall', wallId: wall.id, key, styleId }. This component has no settings prop: read it with useSelector((state) => state.elevation.settings).
- src/elevation/components/properties/RunProperties.jsx (109 lines): a "Door styles" <section> right after <RunFaceOptions … />, rendered only when room.doorStyles?.length. node = run; levelsAbove [{ level: 'wall', node: wall }, { level: 'room', node: room }]; label "Run"; payload { level: 'run', ...actionBase, key, styleId }.
- src/elevation/components/properties/CabinetStyleProperties.jsx (73 lines): right after <StyleFields … />. node = item; levelsAbove [run, wall, room] as { level, node }; label "Cabinet"; payload { level: 'cabinet', wallId: wall.id, runId: run.id, itemIds: [item.id], key, styleId }.

Files (only these): the three above.

DO NOT change DoorStylePicks.jsx, the store, the model or any other component. DO NOT grep the repo.

At the end `npm test && npm run lint && npm run build` once: still 1037 tests, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 393 Door style pickers on wall, run and cabinet".
```

---

## Step 394 — UI: a face's style and Stiles & rails

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.1.md §1 and §10. Step 393 is in.
If `git status` shows uncommitted changes, stop and tell me.

UI only, no new tests.
- NEW src/elevation/components/properties/PartStyleFields.jsx: props { room, settings, partType, levels, part, width, height, label, onChange }, exactly as SPEC §10: nothing when partType is null; style picker (only when room.doorStyles?.length) from pickOptions(room, settings, partType, levels.slice(1)), change → onChange({ styleId: value || null }); { style, design, warnings } = resolveDoorStyle(room, settings, partType, levels); rows = partSizeRows(style, design, { width, height, sizes: part?.sizes }); heading `${rows.title} · ${style.label}`; a slab shows only rows.note; one line per row (InchInput with value = typed, allowBlank, displayStep 1/16, placeholder formatInchesInput(value), aria-label `${label} ${row.label}`; null or > 0 → onChange({ sizes: setPartSide(part?.sizes, side, v) ?? null }), else return false), a grey "short face" tag when source is 'rule', and a small note text input (keyed by the stored note; on blur, when changed, onChange({ sizes: setPartNote(part?.sizes, side, text.trim()) ?? null })); mid rails (always) and mid stiles (only when width > 0): rows with at (> 0) and width (blank = style, placeholder the final width) and a remove button, plus "Add mid rail" (at = Math.round(height / 2 * 16) / 16) / "Add mid stile" (from width) — edits rebuild part?.sizes?.[kind] ?? [] (never rows.midRails) and call onChange({ sizes: setPartMids(part?.sizes, kind, list) ?? null }); last line `Panel W × H` (five_piece) or `Molding W × H` (slab_applied) with formatInches; an amber line for a door-style-missing warning.
  Imports straight from model/doorStyleEdits.js, model/doorStyleResolve.js and model/units.js (or model/index.js for formatInches/formatInchesInput).
- src/elevation/components/properties/FaceProperties.jsx (354 lines): inside the `selected && (…)` box, first thing, when selected.type && selected.type !== 'open' && resolvedFace:
  <PartStyleFields room={room} settings={settings} partType={facePartType(selected.type)} levels={cabinetFaceLevels(room, wall, run, item, selected)} part={selected} width={resolvedFace.width} height={resolvedFace.height} label={`Face ${facePath}`} onChange={(patch) => commitIfChanged(setFacePart(face, facePath, patch))} />
  Imports: facePartType, cabinetFaceLevels from '../../model/doorStyleResolve.js'; setFacePart from '../../model/faceTree.js'.

Files (only these): the two above.

DO NOT change the rest of FaceProperties, the store or the model. DO NOT grep the repo.

At the end `npm test && npm run lint && npm run build` once: still 1037 tests, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 394 Face style and stiles & rails".
```

---

## Step 395 — UI: panel styles; flush-panel depth placeholder

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.1.md §1 and §11. Step 394 is in.
If `git status` shows uncommitted changes, stop and tell me.

UI only, no new tests. Use components/properties/PartStyleFields.jsx (step 394) with partType "panel" and levels panelLevels(room, wall, run, part) from '../../model/doorStyleResolve.js'; onChange(patch) dispatches setPartStyle({ ...where, ...patch }). Per SPEC §11's table:
- src/elevation/components/properties/RunEndsSection.jsx (382 lines): pass room={room} and wall={wall} to <EndFields> (line ~107). Nothing else changes there.
- src/elevation/components/properties/EndFields.jsx (172 lines): accept room and wall; when the end type is 'end_panel' or 'blind', render PartStyleFields with part = run.ends[side], levels panelLevels(room, wall, run, run.ends[side]), width = frontDepth(run, settings) (model/index.js), height = run.height, label `${Left|Right} end panel`, where = { ...actionBase, part: 'runEnd', side }.
- src/elevation/components/properties/WallEndPanelProperties.jsx (53 lines): under <WallEndPanelFields>, part = stored, levels panelLevels(room, wall, null, stored), width = side.depth, height = panel.top, label "Wall end panel", where = { wallId: wall.id, part: 'wallEndPanel', endpoint: panel.endpoint }.
- src/elevation/components/properties/CellKindSection.jsx (123 lines): when item.kind === 'panel', read room (as FaceProperties does) and settings with useSelector; size by panelOrientation(piece): side → piece.depth × piece.height, top → piece.width × piece.depth, back → piece.width × piece.height; levels panelLevels(room, wall, run, item); label "Panel"; where = { wallId: wall.id, runId: run.id, part: 'panelCell', cellId: item.id }.
- src/elevation/components/properties/CellProperties.jsx (279 lines) line 184: placeholder uses cellDepth(piece, item, run.depth, settings, runFaceThickness(run, settings)), runFaceThickness imported from '../../model/corners.js'.

Files (only these): the five above.

DO NOT change end-type logic, ExtendFields, the store or the model. DO NOT grep the repo.

At the end `npm test && npm run lint && npm run build` once: still 1037 tests, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 395 Panel styles".
```

---

## Running it (Kyle, after 395)

Follow SPEC-46.1's end-to-end check: rooms without styles unchanged; add style A at 1" and pick it for the room (Euro fronts move out 3/16"); add a Slab AM style (Molding inset); delete a used style (asks where to move its uses); pickers on wall/run/cabinet show what they inherit; a 7" drawer front shows 2 7/16" rails marked "short face"; end panels, wall end panels and panel cells show the same block. Nothing new draws on the canvas until 46.2.
