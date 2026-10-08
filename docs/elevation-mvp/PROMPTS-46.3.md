# Round 46.3 — Codex Prompts, Steps 413–416 (Library: door designs, team door style; doorThickness retired)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session. Every step is in **cabinetry_designer**, branch **elevation-doors**; geometry and the API don't change.

Before step 413, commit `docs/elevation-mvp/SPEC-46.3.md` and this file.

| Step | Repo | What | Tests after |
|---|---|---|---|
| 413 | cabinetry_designer | Shape: team style + designs in settings, load migration, doorThickness retired | 1087 |
| 414 | cabinetry_designer | Designs come from settings; library reducers | 1095 |
| 415 | cabinetry_designer | UI: Library nav, layout, Door designs page | 1095 |
| 416 | cabinetry_designer | UI: Team door style page, shared style fields, Settings link | 1095 |

---

## Step 413 — team style and designs in settings; doorThickness retired

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.3.md §1 and §2. Step 412 is in (1079 tests).
If `git status` shows uncommitted changes, stop and tell me.

A shape change with no behavior change: settings get teamDoorStyle (a full door style, id 'default') and doorDesigns (the design catalog); settings.doorThickness goes away.

- src/elevation/model/doorStyles.js (173 lines): teamDoorStyle(settings) → settings?.teamDoorStyle ?? DEFAULT_DOOR_STYLE (the object itself). Doc: the team default style from the Library (SPEC-46.3).
- src/elevation/model/constants.js (141 lines): import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from './doorStyles.js'; in DEFAULT_SETTINGS replace line 41 `doorThickness: 0.8125,` with `teamDoorStyle: DEFAULT_DOOR_STYLE,` and `doorDesigns: DOOR_DESIGNS,`.
- NEW src/elevation/model/doorDesigns.js (imports from './doorStyles.js'): DESIGN_SLOTS, SEEDED_DESIGN_IDS, isDoorDesign, isDoorDesignList exactly as SPEC §1/§2 (seven keys; code/vendor trimmed rules; slots equal DESIGN_SLOTS[construction]; list: unique ids, codes unique ignoring case, the three seeded ids present with their seeded construction and rail shapes; undefined is invalid). Reuse the hasKeys/isPlainObject pattern from doorStyles.js (copy them, or export them from doorStyles.js).
- src/elevation/store/slices/helpers.js copySettings (line 28): also teamDoorStyle: structuredClone(settings.teamDoorStyle ?? DEFAULT_DOOR_STYLE), doorDesigns: structuredClone(settings.doorDesigns ?? DOOR_DESIGNS).
- src/elevation/store/persistence.js (725 lines):
  - normalizeDocument (line 517), in the settings block after the V2 defaults: if teamDoorStyle === undefined → { ...structuredClone(DEFAULT_DOOR_STYLE), thickness } (thickness = settings.doorThickness when finite and > 0, else DEFAULT_DOOR_STYLE.thickness); if doorDesigns === undefined → structuredClone(DOOR_DESIGNS); then always delete settings.doorThickness.
  - isSettings (line 615): also isDoorStyle(settings.teamDoorStyle) && settings.teamDoorStyle.id === 'default' && isDoorDesignList(settings.doorDesigns) && findDoorDesign(settings.teamDoorStyle.designId, settings.doorDesigns) !== null.
- The settings.doorThickness reads → teamDoorStyle(settings).thickness (import teamDoorStyle from './doorStyles.js'):
  src/elevation/model/cells.js:318 (the default param)
  src/elevation/model/elevationParts.js:127
  src/elevation/model/planPieces.js:93
  src/elevation/model/corners.js:27
- src/elevation/components/SettingsPanel.jsx: delete line 24 `['doorThickness', 'Door thickness'],`.
Leave every `_doorThickness` alone (roomSync.js 111–116, persistence.js 678/683): that's the derived run field.

Test edits, exactly as SPEC §2 "Test edits" (nothing else in those files):
- src/elevation/model/__tests__/doorStyleResolve.test.js line 41
- src/elevation/model/__tests__/doorStyles.test.js lines 46 and 48
- src/elevation/model/__tests__/doorThickness.test.js lines 77 and 78
- src/elevation/model/__tests__/partStyleEdits.test.js line 82
- src/elevation/model/__tests__/teamDefaultPick.test.js line 22
- src/elevation/store/__tests__/sliceDoorStyles.test.js line 27
golden.json stays as it is.

Files (only these): the source files above, the six test files, and
- NEW src/elevation/model/__tests__/doorDesigns.test.js: the SPEC §2 file VERBATIM (4 tests)
- NEW src/elevation/store/__tests__/teamLibrarySaves.test.js: the SPEC §2 file VERBATIM (4 tests)

DO NOT change roomSync.js, doorStyleResolve.js, doorStyleEdits.js, golden.json, the golden snapshot or other components. DO NOT grep the repo.

Write the two new test files first; run `npx vitest run src/elevation/model/__tests__/doorDesigns.test.js src/elevation/store/__tests__/teamLibrarySaves.test.js`. Then the source and the listed edits, running only the touched test files. At the end `npm test && npm run lint` once: 1079 + 8 = 1087, golden snapshot UNCHANGED, lint 0 errors. If an existing persistence test fails only because settings now hold teamDoorStyle/doorDesigns instead of doorThickness, don't edit it: report it.

At most three lines of summary. Commit "elevation-mvp: step 413 Team door style and designs in settings".
```

---

## Step 414 — designs come from settings; library reducers

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.3.md §1 and §3. Step 413 is in (1087 tests).
If `git status` shows uncommitted changes, stop and tell me.

- src/elevation/model/doorDesigns.js (from step 413): add
  - newDoorDesign(designs, base, id) → deep copy of base with id and code "<base.code> copy", then "… copy 2", "… copy 3"… (first not used in designs, ignoring case). Same idea as newDoorStyle in doorStyleEdits.js.
  - doorDesignUses(settings, rooms, designId) → [{ level: 'team' }] when teamDoorStyle(settings).designId matches, then { level: 'room', roomId, styleId, label } for each room's doorStyles in order.
- src/elevation/model/doorStyleResolve.js (118 lines) line 41: designs = settings?.doorDesigns ?? DOOR_DESIGNS. No call site changes.
- src/elevation/model/doorStyleEdits.js (188 lines) pickOptions (lines 133–157): designs = settings?.doorDesigns ?? DOOR_DESIGNS; team row uses findDoorDesign(team.designId, designs) ?? findDoorDesign(DEFAULT_DESIGN_ID, designs) (team = teamDoorStyle(settings)); room rows findDoorDesign(entry.designId, designs) ?? findDoorDesign(DEFAULT_DESIGN_ID, designs).
- NEW src/elevation/store/slices/doorDesigns.js: export const doorDesignReducers with addDoorDesign ({ reducer, prepare } like addDoorStyle, uuid id), updateDoorDesign, deleteDoorDesign, setTeamDoorStyle — rules exactly as SPEC §3 (slots set from DESIGN_SLOTS on save; validate with isDoorDesignList; seeded/unknown can't be deleted; a used design needs reassignTo = another listed id, moving the team style and every room style; team style forced id 'default', label 'Std', must be isDoorStyle with a listed design). A rejected action returns before writing anything. "Re-sync every room" = the loop in updateSettings (store/slices/ui.js line 77). Pattern: store/slices/doorStyles.js (use current() for reading).
- src/elevation/store/elevationSlice.js (183 lines): import doorDesignReducers, spread next to doorStyleReducers, export addDoorDesign, updateDoorDesign, deleteDoorDesign, setTeamDoorStyle with the other actions.

Files (only these): the five above, and
- NEW src/elevation/model/__tests__/doorDesignEdits.test.js: the SPEC §3 file VERBATIM (4 tests)
- NEW src/elevation/store/__tests__/sliceDoorDesigns.test.js: the SPEC §3 file VERBATIM (4 tests)

DO NOT change doorStyles.js, persistence.js, slices/doorStyles.js, the components or any existing test. DO NOT grep the repo.

Write the two test files first; run `npx vitest run src/elevation/model/__tests__/doorDesignEdits.test.js src/elevation/store/__tests__/sliceDoorDesigns.test.js`. Iterate on those. At the end `npm test && npm run lint` once: 1087 + 8 = 1095, golden snapshot unchanged, lint 0 errors. If `currentRun(thick)._doorThickness` in the slice test comes out other than 0.8125, don't change the test: report what you got.

At most three lines of summary. Commit "elevation-mvp: step 414 Door designs from settings, library reducers".
```

---

## Step 415 — UI: Library nav, layout, Door designs page

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.3.md §1 and §4. Step 414 is in (1095 tests).
If `git status` shows uncommitted changes, stop and tell me.

UI only, no new tests. Build exactly what SPEC §4 lists:
- src/App.jsx (60 lines): nested /library route (LibraryLayout; index → Navigate to "door-designs" replace; "door-designs" → DoorDesignsPage), before the "*" route.
- src/components/layout/AppShell.jsx (58 lines): a third NavLink "Library" to /library (no `end`), same classes as the other two.
- NEW src/library/LibraryLayout.jsx: aside sub-nav (Door designs) + main with <Outlet />, classes as SPEC §4.
- NEW src/library/DoorDesignsPage.jsx: heading + line, New design (dispatch addDoorDesign(), open the editor on action.payload.id), the table (Code with "built-in" tag for SEEDED_DESIGN_IDS, Vendor, Description, Construction, Rails, Used by from doorDesignUses with room names, Edit / Copy / Delete), the delete-with-move row for used designs (no browser confirm), the note under the table.
- NEW src/library/DoorDesignEditor.jsx: dialog following DoorStyleEditor.jsx's pattern (src/elevation/components/DoorStyleEditor.jsx lines 49–86 for focus/Escape/Tab trap and overlay; same INPUT/BUTTON classes). Fields, locks on seeded designs, the rail note, read-only slots line, Save rules and reasons exactly as SPEC §4; Save dispatches updateDoorDesign({ designId, design }).
Imports from the elevation code: actions from 'src/elevation/store/elevationSlice.js'; DESIGN_SLOTS, SEEDED_DESIGN_IDS, isDoorDesignList, doorDesignUses from 'src/elevation/model/doorDesigns.js'; DOOR_CONSTRUCTIONS, RAIL_SHAPES from 'src/elevation/model/doorStyles.js' (use relative paths).

Files (only these): the five above.

DO NOT change the model, the store, ElevationLab or other components. DO NOT grep the repo.

At the end `npm test && npm run lint && npm run build` once: still 1095 tests, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 415 Library nav and door designs page".
```

---

## Step 416 — UI: Team door style page, shared style fields, Settings link

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.3.md §1 and §5. Step 415 is in (1095 tests).
If `git status` shows uncommitted changes, stop and tell me.

UI only, no new tests.
- Move by script (sed/Node read-modify-write, don't retype) from src/elevation/components/DoorStyleEditor.jsx (237 lines): SizeField (lines 11–29) and the fields from the Design label through the Profiles section (lines 118–216), plus the derived consts (lines 36–40) and change/changeSize (lines 44–48), into NEW src/elevation/components/DoorStyleFields.jsx → export default function DoorStyleFields({ draft, setDraft, designs }); copy INPUT_CLASS and HEADING_CLASS. In it: design = findDoorDesign(draft.designId, designs); the Design select maps `designs`; the arch note "For arched designs (46.3)" → "Drawn flat until arched rails are added".
- DoorStyleEditor.jsx: keeps Label, Name, reason, buttons; renders <DoorStyleFields draft={draft} setDraft={setDraft} designs={settings.doorDesigns} /> with settings from useSelector((state) => state.elevation.settings); keeps a small change() for the label; drop unused imports.
- src/elevation/components/RoomDoorStylesPanel.jsx (176 lines) line 57: findDoorDesign(style.designId, settings.doorDesigns).
- NEW src/library/TeamDoorStylePage.jsx: as SPEC §5 (inner component keyed on JSON.stringify(settings.teamDoorStyle); heading and line; DoorStyleFields in max-w-xl; Save → setTeamDoorStyle({ style: draft }), disabled when !isDoorStyle(draft) (reason "Every size must be more than 0") or unchanged; Revert; Standard → structuredClone(DEFAULT_DOOR_STYLE) as the draft).
- src/library/LibraryLayout.jsx: second NavLink "Team door style" → "door-style".
- src/App.jsx: <Route path="door-style" element={<TeamDoorStylePage />} /> inside /library.
- src/elevation/components/SettingsPanel.jsx: right after the block rendering NUMBER_SETTINGS, a text-xs text-gray-500 line "Door thickness is on the team door style — " + react-router <Link to="/library/door-style" className="text-blue-400 hover:underline">Library</Link>.

Files (only these): the seven above.

DO NOT change the model, the store or other components. DO NOT grep the repo.

At the end `npm test && npm run lint && npm run build` once: still 1095 tests, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 416 Team door style page".
```

---

## Running it (Kyle, after 416)

Follow SPEC-46.3's end-to-end check: Library link → Door designs (rename 5PC to 110, add a 114 copy, delete it with a move), the 114 shows in a room's door style tool, Team door style at 1" thickens unstyled doors and seeds new room styles, the Settings panel links to the Library, and everything survives a reload.
