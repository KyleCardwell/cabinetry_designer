# Elevation Lab — SPEC-31 (splitting RunProperties)

Step 155. The earlier SPEC files still apply; this file is the source of truth for what follows.
SPEC-30 must be done first (it is, at `7ca37b4`).

No behavior changes in this SPEC. It finishes the job SPEC-30 deliberately left: `RunProperties.jsx`
landed at 754 lines, almost twice the ~400 target in `TODO.md`. Cells will do most of their panel
work in or beside the run panel, so splitting it now makes every cell step cheaper — whether the
cell UI ends up in its own section or inside the run's.

## After this SPEC you can

- Open the run's geometry, ends, heights, cabinet count or pieces list without reading the other
  four.
- Add a cell section (or replace the pieces list with a cell tree) by touching one ~50-line file and
  one line in `RunProperties.jsx`.
- See `RunProperties.jsx` as what it now is: the run's type picker, its two shared handlers, and a
  list of sections.

## Not in this SPEC

- Any change to the other files under `components/properties/`, or to `PropertiesPanel.jsx`.
  `RunProperties` keeps its name, its default export, its props and its one importer
  (`PropertiesPanel.jsx:27`, used at `:145`).
- Splitting the ends section per side. It lands at roughly 355 lines, under target; a per-side card
  would mean rewriting the section's body instead of moving it.
- Memoizing anything, or wrapping `validateAndDispatch` in `useCallback`. Passing it down as a plain
  prop is exactly what happens today inside one component.
- Component tests. There are none in this repo and this is not the step to start.
- Reformatting, prop renames, hook reorders or dead-code removal in a moved block.

---

## §1 The shape

Unlike SPEC-30, the blocks here are not top-level declarations — they are slices of one function
body. Each new component is built from a **setup slice** (local consts that only its JSX uses) plus a
**JSX slice** (one `<section>`), both moved verbatim. That is possible because every local in
`RunProperties` is used by exactly one section, with one exception, `validateAndDispatch`, which is
passed down as a prop.

All new files go in `src/elevation/components/properties/`, flat, beside `RunProperties.jsx`, with a
default export — the same pattern as the files already there.

## §2 The map

Line ranges are inclusive and refer to `properties/RunProperties.jsx` at `7ca37b4` (754 lines).

| New file | Props | Module-level | Setup slice | JSX slice |
|---|---|---|---|---|
| `RunGeometrySection.jsx` | `{ wall, run, settings, actionBase, validateAndDispatch }` | — | 122–136 | 180–272 |
| `RunEndsSection.jsx` | `{ room, wall, run, settings, actionBase }` | 61–65 `CORNER_CLEARANCE_MODES`, 88–96 `cornerLabel` | 110–121 | 274–565 |
| `RunHeightsSection.jsx` | `{ room, wall, run, settings, actionBase, validateAndDispatch }` | 72–86 `RUN_OVERRIDE_FIELDS` | 104–109 | 567–646 |
| `RunCabinetsSection.jsx` | `{ run, actionBase }` | — | 101–103 | 648–711 |
| `RunPiecesSection.jsx` | `{ run, layout }` | — | — | 713–747 |

Every one of the five also gets `const dispatch = useDispatch();` as its first line, because every
JSX slice dispatches.

### What stays in `RunProperties.jsx`

- imports
- 67–70 `PLACEMENT_MESSAGES` (only `validateAndDispatch` and `changeType` use it)
- 98–100: signature, `dispatch`, `actionBase`
- 138–159: `validateAndDispatch`, `changeType`
- 161–178: the outer `<div>` and the Type section
- 749 `<RunFaceOptions … />` and 751 `<WarningsList … />`, unchanged
- the closing `</div>` / `);` / `}`

Lands at roughly 110 lines.

### The five call sites

Replace each JSX slice, in place and in the same order, with its component:

```jsx
      <RunGeometrySection
        wall={wall}
        run={run}
        settings={settings}
        actionBase={actionBase}
        validateAndDispatch={validateAndDispatch}
      />

      <RunEndsSection
        room={room}
        wall={wall}
        run={run}
        settings={settings}
        actionBase={actionBase}
      />

      <RunHeightsSection
        room={room}
        wall={wall}
        run={run}
        settings={settings}
        actionBase={actionBase}
        validateAndDispatch={validateAndDispatch}
      />

      <RunCabinetsSection run={run} actionBase={actionBase} />

      <RunPiecesSection run={run} layout={layout} />
```

Rendered order is unchanged: Type, Geometry, Ends & corners, Heights, Cabinets, Pieces, face options,
warnings.

## §3 Why each local lands where it does

Use sites are line numbers at `7ca37b4`, so this never has to be re-derived.

- **`finalCabinet`** 101 → 670–673, **`finalItem`** 102 → 687, **`cabinetCount`** 103 → 681:
  Cabinets only.
- **`profile`** 104 → 106–107, **`inheritedValues`** 105 → 604, **`overrideFields`** 109 → 599:
  Heights only. `RUN_OVERRIDE_FIELDS` 72 is read only at 109, so it travels too.
- **`corners`** 110 → 276, 280, 318; **`reserveParts`** 114 → 518; **`blindEntryData`** 118 → 552:
  Ends only. `CORNER_CLEARANCE_MODES` 296–297 and `cornerLabel` 318 are Ends only.
- **`overhang`** 122 → 269–270; **`leftGrowLocked` / `rightGrowLocked` / `bothAnchored` /
  `preferredRunGrow` / `runGrowLocked`** 123–131 → 186–207; **`runGrow` state + effect** 132–135 →
  194–207; **`runPositions`** 136 → 237, 242: Geometry only.
- **`validateAndDispatch`** 138 → 203, 217, 243 (Geometry) and 621, 628 (Heights): the one shared
  local. Stays in `RunProperties`, passed to both.
- **`changeType`** 148 → 170: Type section, stays.
- **`PLACEMENT_MESSAGES`** 67 → 141, 155: stays.

### Hooks moving into children

`useState`/`useEffect` (132–135) move into `RunGeometrySection` and `useMemo` (118–121) into
`RunEndsSection`. Both children render unconditionally whenever `RunProperties` renders, so they mount
and unmount with it, and the grow state still resets on `run.id` through the same effect. Nothing
about when state is created or reset changes.

## §4 Imports

Same rule as SPEC-30 §5: don't partition the import block by hand. Each new file imports exactly what
its moved slices reference. All five sit in the same folder as `RunProperties.jsx`, so **the paths
are copied unchanged** — no level adjustment this time.

Known consumers, so none of this needs discovering:

| File | From `../../model/index.js` | From `../../store/elevationSlice.js` | Other |
|---|---|---|---|
| Geometry | `frontDepth`, `isJointAnchor`, `positionReadouts`, `startFromReadout`, `stretchedStart` | `resizeRun` | `Fragment`, `useEffect`, `useState`; `formatRunOverhang` (helpers); `InchInput`, `Field` + `ReadOnlyValue`, `StretchInput` |
| Ends | `blindEntries`, `cornerAt`, `cornerReserveParts`, `describeAnchor`, `formatInches`, `formatInchesInput`, `isJointAnchor`, `jointMembers`, `landingsOn`, `runShortLabel`, `soffitsOn` | `joinRunEdges`, `setRunAnchor`, `setRunCornerClearance`, `setRunJointOffset` | `useMemo`; `wallLabel` (topology); `InchInput`, `EndFields`, `Field` |
| Heights | `CABINET_TYPE_IDS`, `boxTopOf`, `formatInchesInput`, `profileUnderSoffit`, `resolveProfile` | `setRunHeightMode`, `setRunOverride`, `setRunType` | `InchInput`, `Field` + `ReadOnlyValue` |
| Cabinets | — | `addItemAfter`, `removeItem`, `setAutoCount`, `setMaxCabinetWidth` | `lastCabinetItem`, `lastRunItem` (helpers); `InchInput`, `Field` |
| Pieces | `KIND_LABELS`, `formatInches` | `setSelection` | — |

All five import `useDispatch` from `react-redux`.

`RunProperties.jsx` ends up needing only `useDispatch`, `prepareRunUpdate`, `setRunType`, `updateRun`,
`Field`, `RUN_TYPES`, `RunFaceOptions`, `WarningsList` and the five new sections — no React import at
all. ESLint's `no-unused-vars: error` and `no-undef: error` will catch anything the table misses.

## §5 Tests

None change and none are added. The suite is the regression net exactly as it stands: **522 tests,
all green, with no test file edited.** If the baseline differs before step 155, use that number.

### Manual checks

No test covers the panel, so Kyle clicks through the run panel afterwards. Select a run, then:

1. **Type** — change the run type; the heights section changes its override fields.
2. **Width** — stretch with each grow direction. Anchor one end: that direction locks. Anchor both:
   width turns read-only.
3. **Grow reset** — set grow to left on run A, select run B: B shows its own preferred direction.
4. **Position** — type a left-edge position; the run moves. Type one off the wall: "Run must stay
   inside the wall."
5. **Depth** — change it; front depth readout updates; push it past the wall to see the overhang note.
6. **Ends** — change an end type. Try each anchor: corner (clearance mode + custom value), an opening
   (clearance, casing/jamb toggle), a soffit (offset), another run's edge (joint offset). A blind end
   still shows its warning when exposed.
7. **Heights** — toggle auto/manual; blank overrides show the inherited placeholder; manual Z and
   height edit; "Reset heights to defaults" works.
8. **Cabinets** — toggle auto count, add and remove a cabinet, set a max cabinet width.
9. **Pieces** — clicking a piece selects it; face options and the warnings list still sit below.

**Done when:** `RunProperties.jsx` is roughly 110 lines, every file under `components/properties/` is
under 400, `npm test` and `npm run lint` are clean with no test file touched, and the nine checks
behave exactly as they did at `7ca37b4`.
