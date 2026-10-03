# Elevation Lab — SPEC-30 (splitting the properties panel)

Steps 153–154. The earlier SPEC files still apply; this file is the source of truth for what
follows. SPEC-29 must be done first.

No behavior changes in this SPEC. Not one. Every line of moved code is moved verbatim, and the only
new text in the repo is the import block at the top of each new file. Rationale for doing it now is
in `docs/platform/AI-LAYER-PLAN.md` §5 Stage A.

`components/PropertiesPanel.jsx` is 2,238 lines and is the largest per-round cost in the project —
nearly every step touches it, and an agent re-reads it three or four times per step at roughly 27k
tokens a read. `TODO.md` logs it as a P1 at 1,642 lines; it has grown 596 lines since that entry was
written. Splitting it cuts the per-step read cost of everything that comes after more than any
prompt wording will.

## After this SPEC you can

- Edit one selection type by opening one file of a few hundred lines instead of a 2,238-line one.
- See `PropertiesPanel.jsx` as what it actually is: a 165-line selector that picks a section.
- Land Stage C and D's panel work (provenance sources, purpose pickers, notes fields) as cheap steps
  instead of expensive ones.

## Not in this SPEC

- Splitting `RunProperties` internally. It lands at roughly 710 lines, over the ~400 target in
  `TODO.md`. That is expected here and is its own round, and it gets much cheaper once it is a
  710-line file rather than a slice of a 2,238-line one.
- Any change to the six components already under `components/properties/`. They gain importers and
  nothing else.
- Component tests. There are none in this repo and this is not the step to start.
- Any reformatting, prop rename, hook reorder or dead-code removal in a moved block. If something
  looks wrong while moving it, say so in the summary and leave it.

---

## §1 The destination

`src/elevation/components/properties/` already exists and already holds six extracted components.
They are the pattern to copy — default export, imports reaching up one level:

```
CabinetStyleProperties.jsx   67
FaceProperties.jsx          298
PartNumberField.jsx          50
RunFaceOptions.jsx           60
StretchInput.jsx             61
StyleFields.jsx              76
```

There is no separate `properties/index.js` and this SPEC does not add one; `PropertiesPanel.jsx`
imports each section by path, as it already does for those six.

## §2 There is no fan-out

`PropertiesPanel.jsx` has exactly one export — `export default function PropertiesPanel` at line
2112 — and exactly one importer:

```
src/elevation/ElevationLab.jsx:6:import PropertiesPanel from './components/PropertiesPanel.jsx';
```

That import does not change. Every symbol in §3 is file-local today, so nothing outside this file
moves and no other call site exists anywhere in the repo. Nothing in this SPEC requires a grep.

## §3 The map

Line ranges are inclusive and refer to the file as it stands at `0da9412`. All destinations are
under `src/elevation/components/properties/`.

### Step 153 — shared pieces and the small sections

| Current lines | Symbol | Destination |
|---|---|---|
| 176–184 | `Field` | `Field.jsx` (default export) |
| 185–195 | `ReadOnlyValue` | `Field.jsx` (named export) |
| 105–110 | `RUN_TYPES` | `constants.js` (named export) |
| 111–117 | `END_TYPES` | `EndFields.jsx` (file-local) |
| 206–307 | `EndFields` | `EndFields.jsx` (default export) |
| 136–144 | `ERROR_MESSAGES` | `WarningsList.jsx` (file-local) |
| 145–150 | `WARNING_MESSAGES` | `WarningsList.jsx` (file-local) |
| 308–345 | `WarningsList` | `WarningsList.jsx` (default export) |
| 1267–1518 | `CabinetProperties` | `CabinetProperties.jsx` (default export) |
| 1519–1547 | `InteriorFillerProperties` | `PieceProperties.jsx` (file-local) |
| 1548–1565 | `EndProperties` | `PieceProperties.jsx` (file-local) |
| 1566–1616 | `PieceProperties` | `PieceProperties.jsx` (default export) |
| 1939–2111 | `SoffitProperties` | `SoffitProperties.jsx` (default export) |

`PropertiesPanel.jsx` ends step 153 at roughly 1,340 lines, still holding `OpeningProperties`,
`RunProperties`, `WallHeightProperties`, their constants and `cornerLabel`.

### Step 154 — the three large sections

Line numbers have shifted by then, so these are named by declaration. Each is a single top-level
`function` declaration and moves whole.

| Symbol | Approx. lines | Destination |
|---|---:|---|
| `OPENING_PLACEMENT_MESSAGES` | 7 | `OpeningProperties.jsx` (file-local) |
| `OpeningProperties` | 263 | `OpeningProperties.jsx` (default export) |
| `CORNER_CLEARANCE_MODES` | 6 | `RunProperties.jsx` (file-local) |
| `PLACEMENT_MESSAGES` | 5 | `RunProperties.jsx` (file-local) |
| `RUN_OVERRIDE_FIELDS` | 16 | `RunProperties.jsx` (file-local) |
| `cornerLabel` | 10 | `RunProperties.jsx` (file-local) |
| `RunProperties` | 658 | `RunProperties.jsx` (default export) |
| `WALL_OVERRIDE_FIELDS` | 9 | `WallHeightProperties.jsx` (file-local) |
| `WallHeightProperties` | 322 | `WallHeightProperties.jsx` (default export) |

`PropertiesPanel.jsx` ends step 154 at roughly 165 lines: its imports, and the default export from
line 2112 to the end, unchanged.

## §4 Why each shared symbol lands where it does

Stated here so it never has to be re-derived. Use sites are line numbers in the file at `0da9412`.

- **`Field`** — over 100 sites in every section. Shared, so it gets its own file.
- **`ReadOnlyValue`** — 574, 699, 747, 774, 1103, 1106, 1432, 1436, 1966, 1971: five sections.
  Shared, and it belongs beside `Field` rather than in a file of its own.
- **`RUN_TYPES`** — 591, 684, 1271: `OpeningProperties`, `RunProperties`, `CabinetProperties`, which
  land in three different files. The only constant that is genuinely shared.
- **`EndFields`** — 824 and 1555: `RunProperties` and `EndProperties`, which land in different
  files, so it needs its own.
- **`END_TYPES`** — 223 only, inside `EndFields`. Travels with it.
- **`cornerLabel`** — 829 only, inside `RunProperties`. Not shared, despite sitting among the shared
  helpers in the current file.
- **`ERROR_MESSAGES`** 329 and **`WARNING_MESSAGES`** 337 — both only inside `WarningsList`.
- **`WarningsList`** — 1262 only, inside `RunProperties`. It could have been file-local there, but
  it is a self-contained 38-line component carrying two message maps and `RunProperties.jsx` is the
  one file that needs to stay as small as it can, so it gets its own.
- **`CORNER_CLEARANCE_MODES`** 807–808, **`PLACEMENT_MESSAGES`** 652/666, **`RUN_OVERRIDE_FIELDS`**
  620 — all only inside `RunProperties`.
- **`OPENING_PLACEMENT_MESSAGES`** 353/587 — only inside `OpeningProperties`.
- **`WALL_OVERRIDE_FIELDS`** 1916 — only inside `WallHeightProperties`.

## §5 Imports

Do not partition the current import block by hand. For each new file, add exactly the imports its
moved body references, drawn from the same sources with paths adjusted by one level:

| As `PropertiesPanel.jsx` writes it | As a file in `properties/` writes it |
|---|---|
| `'../model/index.js'` | `'../../model/index.js'` |
| `'../model/topology.js'` | `'../../model/topology.js'` |
| `'../model/room.js'` | `'../../model/room.js'` |
| `'../properties/helpers.js'` | `'../../properties/helpers.js'` |
| `'../store/elevationSlice.js'` | `'../../store/elevationSlice.js'` |
| `'./InchInput.jsx'` | `'../InchInput.jsx'` |
| `'./properties/X.jsx'` | `'./X.jsx'` |

Plus React hooks and `react-redux` per file as each body uses them.

`helpers.js` consumers, so this one needs no discovering: `formatRunWarning` 337 is in
`WarningsList`; `formatRunOverhang` 633, `lastCabinetItem` 612, `lastRunItem` 613 and
`prepareRunUpdate` 650/664 are in `RunProperties`; `resolveSelectedPiece` 2156 stays in
`PropertiesPanel`.

The four existing sub-component imports land as: `StretchInput` in `OpeningProperties`,
`RunProperties` and `WallHeightProperties` (447, 702, 1712); `RunFaceOptions` in `RunProperties`
(1260); `FaceProperties` in `CabinetProperties` (1514); `PartNumberField` in `PieceProperties`
(1571).

ESLint runs `no-unused-vars: error` and `no-undef: error` (`package.json` → `eslintConfig`), so a
leftover import fails lint and a missing one fails with the symbol named. Lean on that rather than
auditing imports by hand.

## §6 Tests

None change and none are added. There are no component tests in this repo — every existing test is
on the model and the store, and neither is touched. The suite is the regression net exactly as it
stands: **522 tests, all green, with no test file edited.**

If the baseline differs from 522 before step 153, the number below shifts with it; nothing else in
this SPEC depends on the count.

A test file appearing in `git diff` at the end of either step means the step went wrong. Say so
rather than adjusting the test.

### Manual checks

No test covers the panel, so both steps end with Kyle clicking through it. After step 153:

1. Select a cabinet inside a run — face properties and part number render; change a face type.
2. Select an interior filler, then an end piece — both render.
3. Select a soffit — anchors and molding render; change the molding.
4. Select a run with a layout warning — the warnings list still appears under it.
5. Select a run and change an end type — the end fields still drive it.

After step 154, all of the above plus:

6. Select a wall with no run — wall height fields render and edit.
7. Select a run — type, ends, overrides, corner clearance, face options render; change a run width.
8. Select an opening — the placement message appears on an invalid move.
9. Empty click — "Select a wall, run or opening to edit it."

**Done when:** `PropertiesPanel.jsx` is roughly 165 lines, every new file except `RunProperties.jsx`
is under 400, `npm test` and `npm run lint` are clean with no test file touched, and the nine checks
above behave exactly as they did at `0da9412`.
