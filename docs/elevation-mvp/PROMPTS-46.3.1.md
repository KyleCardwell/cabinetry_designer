# Round 46.3.1 — Codex Prompts, Steps 417–419 (depth on any cabinet; missing door designs asked on open)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session. Every step is in **cabinetry_designer**, branch **elevation-doors**. Geometry and the API don't change.

Before step 417, commit `docs/elevation-mvp/SPEC-46.3.1.md` and this file.

| Step | Repo | What | Tests after |
|---|---|---|---|
| 417 | cabinetry_designer | UI: Depth / Line up in a shared section, shown for cabinets too | 1096 |
| 418 | cabinetry_designer | `missingDoorDesigns` + `moveMissingDoorDesign` | 1099 |
| 419 | cabinetry_designer | UI: missing-design notice above the canvas | 1099 |

---

## Before step 417 (Kyle)

```bash
cd cabinetry_designer
git status                                   # on elevation-doors; only the two docs below are new
npm test                                     # 1095 passed
git add docs/elevation-mvp/SPEC-46.3.1.md docs/elevation-mvp/PROMPTS-46.3.1.md
git commit -m "round 46.3.1 docs"
```

---

## Step 417 — Depth and Line up on every cabinet

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.3.1.md §1 and §2. Step 416 is in (1095 tests).
If `git status` shows uncommitted changes, stop and tell me.

A cabinet that was never split opens CabinetProperties, which has no Depth section; only CellProperties has it. Move the section into a shared component and show it in both. The reducer already works.

- Move by script (sed/Node read-modify-write, don't retype): cut src/elevation/components/properties/CellProperties.jsx (280 lines) lines 177–203 (`{item.kind !== 'void' && (` through its closing `)}`) into NEW src/elevation/components/properties/CellDepthSection.jsx:
  export default function CellDepthSection({ wall, run, piece, item, settings }); `if (item.kind === 'void') return null;` then return the <section> without the void wrapper; const dispatch = useDispatch(); const cellBase = { wallId: wall.id, runId: run.id, cellId: item.id }; copy SELECT_CLASS and HEADING_CLASS (CellProperties lines 29–30). Imports: useDispatch (react-redux); cellDepth, formatInchesInput ('../../model/index.js'); runFaceThickness ('../../model/corners.js'); setCellDepth ('../../store/elevationSlice.js'); InchInput ('../InchInput.jsx'); Field ('./Field.jsx').
- CellProperties.jsx: at the cut, <CellDepthSection wall={wall} run={run} piece={piece} item={item} settings={settings} />. Drop the imports only that section used: cellDepth, formatInchesInput, setCellDepth, and the runFaceThickness import line. Nothing else changes.
- src/elevation/components/properties/CabinetProperties.jsx (303 lines): import CellDepthSection; render <CellDepthSection wall={wall} run={run} piece={piece} item={item} settings={settings} /> on the line after <CellKindSection … /> (line 264).

Files (only these): the three above, and
- NEW src/elevation/store/__tests__/cabinetDepth.test.js: the SPEC §2 file VERBATIM (1 test; it already passes; it pins the reducer)

DO NOT change PieceProperties.jsx, CellKindSection.jsx, the store, the model or other components. DO NOT grep the repo.

Write the test file and run `npx vitest run src/elevation/store/__tests__/cabinetDepth.test.js`. At the end `npm test && npm run lint && npm run build` once: 1095 + 1 = 1096, golden snapshot unchanged, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 417 Depth on every cabinet".
```

---

## Step 418 — missing door designs: model and reducer

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.3.1.md §1 and §3. Step 417 is in (1096 tests).
If `git status` shows uncommitted changes, stop and tell me.

- src/elevation/model/doorDesigns.js (89 lines): export function missingDoorDesigns(room, designs) → [{ designId, styles: [{ styleId, label }] }]. A style is missing when no design in `designs` has its designId. Each designId once, ordered by its first style in room.doorStyles; styles in style order; [] when none or no doorStyles. Doc comment (SPEC-46.3.1).
- src/elevation/store/slices/doorDesigns.js (64 lines): add moveMissingDoorDesign(state, action), payload { roomId, designId, reassignTo }. Return before writing when: the room isn't found (roomIndexFor from './helpers.js', add to the import), designId IS in settings.doorDesigns, no style in that room names designId, or reassignTo isn't in settings.doorDesigns. Otherwise set designId = reassignTo on every style in that room naming designId, then syncRoomAt(state, index). Read with current() like the other reducers. Don't touch picks, other rooms or settings.
- src/elevation/store/elevationSlice.js (189 lines): export moveMissingDoorDesign with the other actions (next to setTeamDoorStyle, line 176).

Files (only these): the three above, and
- NEW src/elevation/store/__tests__/missingDoorDesigns.test.js: the SPEC §3 file VERBATIM (3 tests)

DO NOT change doorStyles.js, doorStyleResolve.js, persistence.js, slices/doorStyles.js, the existing reducers in slices/doorDesigns.js, components or other tests. DO NOT grep the repo.

Write the test file first; run `npx vitest run src/elevation/store/__tests__/missingDoorDesigns.test.js` (the model and reducer tests must fail, the load test already passes). Iterate on that file. At the end `npm test && npm run lint` once: 1096 + 3 = 1099, golden snapshot unchanged, lint 0 errors. If the load test fails, don't change persistence or the test: report what you got.

At most three lines of summary. Commit "elevation-mvp: step 418 Missing door designs model and reducer".
```

---

## Step 419 — the missing-design notice above the canvas

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-46.3.1.md §1 and §4. Step 418 is in (1099 tests).
If `git status` shows uncommitted changes, stop and tell me.

UI only, no new tests.
- NEW src/elevation/components/MissingDoorDesignsNotice.jsx: reads rooms, activeRoomId, settings from state.elevation; room = the active room; missing = missingDoorDesigns(room, settings.doorDesigns) (from '../model/doorDesigns.js'). Null when no room or nothing missing. Otherwise a block with classes `space-y-2 border-b border-amber-700 bg-amber-900/40 px-4 py-2 text-xs text-amber-100`, one `flex flex-wrap items-center gap-2` row per missing design:
  - text: Door design <code>{designId}</code> isn't in the Library any more. Style (one) / Styles (more) <strong>A, C</strong> use it and draw as the built-in 5-piece until moved.
  - "Move them to" select, aria-label `Move styles using ${designId} to`, an option per settings.doorDesigns entry: value id, text code plus ` · ${vendor}` when vendor isn't null; default the first; local state keyed by designId.
  - Move button → dispatch(moveMissingDoorDesign({ roomId: room.id, designId, reassignTo })) (from '../store/elevationSlice.js').
  - Classes: copy SELECT_CLASS / BUTTON_CLASS from src/elevation/components/RoomDoorStylesPanel.jsx lines 11–12; the select uses w-auto instead of w-full.
- src/elevation/ElevationLab.jsx (85 lines): import it; render <MissingDoorDesignsNotice /> right after <ElevationToolbar … /> and before <div className="relative min-h-0 flex-1"> (line 64).

Files (only these): the two above.

DO NOT change the model, the store, RoomDoorStylesPanel.jsx, src/library/* or other components. DO NOT grep the repo.

At the end `npm test && npm run lint && npm run build` once: still 1099 tests, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 419 Missing door design notice".
```

---

## Running it (Kyle, after 419)

Follow SPEC-46.3.1's end-to-end check:
- Depth and Line up on a plain cabinet.
- The missing-design notice. Edit a room style's `designId` to `"gone"` in localStorage (`cd.elevationLab.v4`), reload, then Move it to Slab.
