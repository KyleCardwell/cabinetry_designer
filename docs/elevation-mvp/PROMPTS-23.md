# Elevation Lab — Codex Prompts, Steps 117–123 (part numbers)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, and commit pending work first, including these docs.

**Order:** 117, 118, 119 and 120 are independent of each other. 121 needs 119 and 120. 122 needs 119 and 121. 123 needs 118 and 119. The pass counts below assume 117 → 123 straight through.

**Codex can't open the app**, so don't plan browser checks. Kyle checks each step by hand.

**The gate is the same for every step:** while iterating, run only `npx vitest run <the named test file>`. Run `npm test && npm run lint` once, at the end. Don't run `npm run build`. Line numbers are as of `03c431d`.

**Three steps are expensive** — 118 (`elevationSlice.test.js`, 1,748 lines), 121 and 122 (`ElevationCanvas.jsx`, 1,744) and 123 (`PropertiesPanel.jsx`, 2,157). Run each at the start of a window, alone. Each of those prompts says which region to open; don't read the rest of the file.

---
## Step 117 — Persisted shape: part number fields

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-23.md §1, §8 tests 194–195.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- src/elevation/model/constants.js (102): DEFAULT_SETTINGS only — add `showPartNumbers: true` after `orthoWalls`
- src/elevation/store/persistence.js (667): five places only —
  - V2_DEFAULTED_SETTING_KEYS (79): add 'showPartNumbers'
  - a new isPartNumberOverrides helper beside isOptionalNumericObject (159)
  - isRoom (313–325): two new optional clauses
  - normalizeV3Document's room mapper (367–415): fill partNumberStart and partNumberOverrides
  - isSettings (423–434): one new optional clause
  - migrateV1Document's `const room = {` literal (545): add the two fields
- test: src/elevation/store/__tests__/persistence.test.js (666): add tests 194 and 195 at the end

No behavior anywhere else. Nothing reads these fields yet; step 119 does.

All three fields are OPTIONAL on read — `=== undefined` passes — so every document already in localStorage keeps validating. normalizeV3Document is what fills them in; migrateV1Document needs them itself because loadElevationDocument (610) returns a v1 migration without normalizing.

Exact clauses, helper and defaults are in SPEC-23 §1. Don't invent extra validation: a number is an integer greater than zero, and that's all.

Don't open elevationSlice.js (step 118), and don't touch toElevationDocument (617) — it spreads the room, so the new fields persist with no change.

Tests 194–195 exactly as SPEC-23 §8.
Expect 485 passing.

At most five lines of summary. Commit "elevation-mvp: step 117 part number persisted shape".
```

**Check after 117:** nothing visible. Reload the app and confirm your existing rooms still load.

---
## Step 118 — Store: part number start and overrides

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-23.md §1, §8 tests 196–197.
If `git status` shows uncommitted changes, stop and tell me. Step 117 must be in.

Files:
- src/elevation/store/elevationSlice.js (1,388): three places only —
  - createRoom (101–109): add `partNumberStart: 1` and `partNumberOverrides: {}`
  - two new reducers immediately after useAutoHeightsForRoom (329–336)
  - the exported action list (1313–1386): add setRoomPartNumberStart and setPartNumberOverride
- test: src/elevation/store/__tests__/elevationSlice.test.js (1,748): APPEND one new `describe` block at the end with tests 196 and 197

elevationSlice.test.js is 1,748 lines. Read its first 60 lines to pick up its imports and how it builds a store, then jump to the end and append. Do not read the middle of it — nothing there changes.

Both reducers are in SPEC-23 §1, copy them. Neither calls syncRoomAt: neither field affects geometry, and a sync on every keystroke in the number field would be a waste.

Don't open persistence.js, PropertiesPanel.jsx or any component — the UI is step 123.

Tests 196–197 exactly as SPEC-23 §8.
Expect 487 passing.

At most five lines of summary. Commit "elevation-mvp: step 118 part number store actions".
```

**Check after 118:** nothing visible.

---
## Step 119 — The ordered part list and the numbers, model only

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-23.md §2, §8 tests 198–203.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- NEW src/elevation/model/partNumbers.js (pure, ~180 lines): PART_MOLDINGS, MOLDING_LABELS, moldingPartKey, wallEndPanelPartKey, partNumbers, wallMoldingBadges — exactly as SPEC §2
- NEW test src/elevation/model/__tests__/partNumbers.test.js (198–203)
- src/elevation/model/index.js (224): export all six

No component changes and no existing module changes in this step. Nothing calls these yet; steps 121–123 do.

Imports you need, all existing:
  CABINET_TYPE_IDS from './constants.js'
  wallLength from './geometry.js'
  resolveProfile from './profile.js'
  runMolding from './soffits.js'
  splitRun from './splitRun.js'
  wallNumbers from './topology.js'
  wallSideView, WALL_SIDES from './wallSides.js'
  wallEndPanels from './wallEndPanels.js'
  endCornerAnglesForRun, endMinWidthsForRun, pinTargetsForRun from './room.js'

Three things to get right and nothing else:

1. Wall order is `[...wallNumbers(room).entries()].sort((a, b) => a[1] - b[1])` mapped back to walls. Do NOT use room.wallOrder directly — wallNumbers already folds wall.numberOverride into that order, and test 201 is the proof.

2. Build each run's layout with the same three options horizontalChains uses (src/elevation/model/dimensions.js:205–209) against the SIDE VIEW, not the stored wall:
     splitRun(run, settings, {
       endMinWidths: endMinWidthsForRun(room, view, run, settings),
       endCornerAngles: endCornerAnglesForRun(room, view, run),
       pinTargets: pinTargetsForRun(run, view, wallLength(view), settings),
     })
   A piece is a part when piece.kind is 'cabinet', 'filler' or 'end_panel' AND piece.width > 1e-6.

3. Numbering is wallNumbers' two passes, copied: matched overrides claim their numbers into `taken` first, then everything else fills from the start number, skipping taken. SPEC §2.2 has the code.

Molding presence and the three badge rects come straight from what RunGroup.jsx already draws — the conditions are written out in SPEC §2.1 and §2.3. You do not need to open RunGroup.jsx; if you do, read only lines 66–108 and change nothing.

Don't open any component, ElevationCanvas.jsx, PropertiesPanel.jsx, or dimensions.js beyond the three-line options block above.

Tests 198–203 exactly as SPEC-23 §8. Copy makeWall and the run/base helpers from src/elevation/model/__tests__/wallExtent.test.js (lines 8–60) rather than importing from another test. Every fixture run is autoCount: false with fixed item widths, so syncAutoItems and horizontalResolution leave the layouts untouched — if a layout comes out different, the fixture is wrong, not the spec.
Expect 493 passing.

At most five lines of summary. Commit "elevation-mvp: step 119 part numbers model".
```

**Check after 119:** nothing visible. The suite is the check.

---
## Step 120 — Badge layout, pure

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-23.md §3, §8 test 204.
If `git status` shows uncommitted changes, stop and tell me.

Files:
- NEW src/elevation/canvas/partNumberLayout.js (~45 lines, pure, no React): the five constants and three functions exactly as SPEC §3 — copy the code, don't invent an API
- NEW test src/elevation/canvas/__tests__/partNumberLayout.test.js (204)

Nothing else changes. Nothing calls these yet; step 121 does.

The one subtlety: a badge that FITS inside its piece stays at level 0 and never enters the sweep, so it can't collide with a lifted one. Only lifted badges compete for levels, and the single left-to-right pass over `occupied` is the whole algorithm. maxLevels: 0 means every badge draws at level 0.

Don't open PieceRect.jsx, RunGroup.jsx or dimensionLayout.js — this is not layoutDimensionRow and does not share its shape.

Test 204 exactly as SPEC-23 §8; every expected number in it is stated, none derived.
Expect 494 passing.

At most five lines of summary. Commit "elevation-mvp: step 120 part badge layout".
```

**Check after 120:** nothing visible.

---
## Step 121 — Draw the part badges

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-23.md §4, §6 (the memo only).
If `git status` shows uncommitted changes, stop and tell me. Steps 119 and 120 must be in.

Files:
- NEW src/elevation/components/PartNumberBadges.jsx (~70 lines) exactly as SPEC §4
- src/elevation/components/RunGroup.jsx (414): the prop list (30–48), and one new element after the faceLayouts block (304–314)
- src/elevation/components/WallEndPanelShapes.jsx (27): whole file — a new optional partNumbers prop and one badge per panel at lift 1
- src/elevation/components/ElevationCanvas.jsx (1,744): three places only —
  - the import block (45–112): add partNumbers from '../model/partNumbers.js' and PartNumberBadges is NOT imported here
  - a new memo beside `diagnostics` (184–187)
  - the live RunGroup usage (1499–1520) and WallEndPanelShapes (1550–1555): pass partNumbers

ElevationCanvas.jsx is 1,744 lines. Open only those three regions.

The memo is four lines (SPEC §6). One walk of the room per render, shared by every run — a RunGroup must never call partNumbers itself.

PartNumberBadges takes the UNDROPPED pieces: RunGroup passes `result.pieces`, not `drawnPieces`. A style drop stretches fillers and panels downward, and dropped rects would step their badges out of line with the cabinets beside them. Everything in the component is listening={false}.

The stretch-preview RunGroup (1687–1699) gets no partNumbers prop — it isn't a real run.

Don't touch PieceRect.jsx, the dimension rows, MoldingBadges (step 122), the toolbar (step 122) or PropertiesPanel.jsx (step 123).

No tests in this step. Run `npx vitest run` once at the end; 494 must still pass.

At most five lines of summary. Commit "elevation-mvp: step 121 part number badges".
```

**Check after 121:**
- Every cabinet shows a numbered pill just above its width text, and the numbers run 1, 2, 3… left to right along the bottom of the first elevation, then along the top, then onto the next wall.
- Fillers and end panels show their number even though their width never fits on the face — the pill lifts above its neighbours with a thin leader down to the piece.
- Three narrow pieces in a row step up to three different heights instead of stacking on each other.
- Zoom out until a run is short: the badges stop lifting and sit in one line. Say if that happens too early.
- A wall with end panels: their badges sit one step higher than the run's own end fillers.
- The numbers don't move when you select things, and the preview while stretching a run has no badges.

---
## Step 122 — Molding badges and the toolbar toggle

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-23.md §5, §6.
If `git status` shows uncommitted changes, stop and tell me. Step 121 must be in.

Files:
- NEW src/elevation/components/MoldingBadges.jsx (~45 lines) exactly as SPEC §5
- src/elevation/components/ElevationCanvas.jsx (1,744): two places only — the import block (45–112), and the non-listening Layer (1537–1563), adding <MoldingBadges room={room} wall={wall} settings={settings} partNumbers={partNumbering} transform={transform} /> after <WallEndPanelShapes …>
- src/elevation/components/ElevationToolbar.jsx (214): one new button inside the `view === 'elevation'` fragment (138–199), after the Wall side group (165–180)
- TODO.md: two bullets (below)

ElevationCanvas.jsx is 1,744 lines. Open only those two regions — the partNumbering memo already exists from step 121.

MoldingBadges reads wallMoldingBadges(room, wall, settings, partNumbers.byKey) and draws one pill per entry, centred on its rect, with the text `${badge.label} ${badge.number}` — "TK 41", "TM 42", "CR 43". Reuse partBadgeWidth and PART_BADGE_HEIGHT/PART_BADGE_FONT_SIZE from ../canvas/partNumberLayout.js so it matches the part badges. No lift, no leader, no layout sweep: there are at most three per elevation and they sit on different strips. Renders nothing when partNumbers is null.

The toolbar button is the plan view's Ortho button (110–122) with `Part #` as its label, `aria-pressed={settings.showPartNumbers}`, dispatching updateSettings({ showPartNumbers: !settings.showPartNumbers }). updateSettings and settings are already in scope.

Don't touch RunGroup.jsx, PartNumberBadges.jsx, SoffitShapes.jsx or PropertiesPanel.jsx.

TODO.md, in "## Later / Maybe", add:
- [ ] **[elevation] One crown / top mold / furniture base profile per room** — SPEC-23 numbers one part per molding kind per room; a profile library would number each profile instead.
- [ ] **[elevation] Soffit molding as its own numbered part** — SPEC-23 §2.1 only counts molding a run carries.

No tests in this step. Run `npx vitest run` once at the end; 494 must still pass.

At most five lines of summary. Commit "elevation-mvp: step 122 molding badges and part number toggle".
```

**Check after 122:**
- One TK badge on the toe kick, one TM on the top mold, one CR on the crown — per elevation, on the leftmost run that carries each, not one per run.
- The same crown number appears on every wall that has crown.
- A wall with a topMold soffit over the uppers shows TM and no CR.
- A wall of manual-height runs shows only TK.
- Part # in the toolbar turns every badge — parts, wall end panels and moldings — off and on, and survives a reload.

---
## Step 123 — Editing the start number and the overrides

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-23.md §7.
If `git status` shows uncommitted changes, stop and tell me. Steps 118 and 119 must be in.

Files:
- NEW src/elevation/components/RoomPartNumbersPanel.jsx (~60 lines) exactly as SPEC §7
- NEW src/elevation/components/properties/PartNumberField.jsx (~45 lines) exactly as SPEC §7
- src/elevation/ElevationLab.jsx (79): one line in the sidebar (42–49) — <RoomPartNumbersPanel /> after <RoomHeightsPanel />, plus its import
- src/elevation/components/PropertiesPanel.jsx (2,157): two places only —
  - PieceProperties (1508–1536): a new `room` prop, a partNumbers memo, and <PartNumberField …/> above whichever editor it returns
  - the PieceProperties call in the panel body (2138–2145): pass room={room}

PropertiesPanel.jsx is 2,157 lines. Open the import block (1–60), PieceProperties (1508–1536), and the panel body from 2120 to the end. Do not read the rest — EndProperties, InteriorFillerProperties and CabinetProperties are all unchanged, and the field is rendered once by PieceProperties so it appears for every kind of piece.

PartNumberField is the wall Number field in WallHeightProperties (1584–1608) one level down: same input, same placeholder-shows-the-auto-number behaviour, same amber border on a duplicate. Read those 26 lines and mirror them. partKey is selectionContext.piece.id — a run piece's key IS its piece id, no mapping needed.

Both new components call partNumbers(room, settings) inside a useMemo. Import it from '../model/partNumbers.js' in the new component and from '../model/index.js' in PropertiesPanel, which already imports from the barrel.

Don't add a field to EndProperties, InteriorFillerProperties or CabinetProperties. Don't touch RoomHeightsPanel.jsx or any canvas file.

No tests in this step. Run `npx vitest run` once at the end; 494 must still pass.

At most five lines of summary. Commit "elevation-mvp: step 123 part number properties".
```

**Check after 123:**
- Set a room's start to 101 and every badge shifts, the first part on the first wall taking 101.
- Select a cabinet and type a number: that badge turns amber-ringed and holds it, and every other number in the room closes up around it without reusing it.
- Clear the field and the number goes back to its place in the run.
- Give two parts the same number and the panel says so in amber, on both the part and the room section.
- Select a filler or an end panel: the same field is there.
- Add a cabinet before a numbered one and watch the rest renumber; the overridden one stays put.
