# Elevation Lab — SPEC-14 (cabinet styles and reveal rules)

Steps 60–63. The earlier SPEC files still apply; this file is the source of truth for what follows. `FACES-PLAN.md` has the later rounds.

Repo state when this was written: `feature/elevation-mvp` at `4d5e96b`, working tree clean.

**The code is already written.** Every step applies a verified patch from `docs/elevation-mvp/patches-14/`. The patches were applied in order to a clean copy of `4d5e96b`, and after each one `npm test` passed; `npm run build` and `npm run lint` pass after step 63. The suite goes from 314 to 339 tests. If a patch doesn't apply, the tree has moved: stop and say so. Don't hand-merge.

**Scope:** style selection (European, Inset, Beaded inset) at the room, run and cabinet levels; reveals from the style, then the rules, then manual per-cabinet overrides; fillers and end panels on upper runs extend down to meet the doors. Inset faces are drawn at their true order sizes, but **the frame itself is not drawn yet** (round 15). There's no change to `splitRun`, run widths, dimensions or the plan view.

---

## §1 Data

All new fields are optional. A missing or null field inherits.

| Where | Field | Values |
|---|---|---|
| `room`, `run`, cabinet `item` | `style` | partial `{ cabinetStyleId?, beadWidth?, profiledEdge? }` |
| `run` | `top` | `'stone'` (default) or `'wood'`. Used on base runs. |
| `run` | `upperBottom` | `'overhang'` (default), `'flush'` or `'counter'`. Used on upper runs. |
| cabinet `item` | `reveals` | partial `{ top?, bottom?, left?, right?, horizontal?, vertical? }`: manual overrides |

- **`cabinetStyleId`** uses the estimator's `cabinet_styles` IDs: `13` European, `14` Inset face frame, `15` Beaded inset face frame.
- **`beadWidth`** only matters for style 15.
- **`profiledEdge`** means the doors have an applied molding or profile on the outside edge. It's a stand-in until the door editor exists. When the editor lands, `resolveStyle` should read the edge from the chosen door instead, and the rest of the code stays the same.
- **Profiled edges aren't inset-only.** The control shows for every style, European included. In round 14 it changes only inset reveals (§3); European reveals ignore it until European profile rules are defined.
- **Resolution:** `settings.defaultStyle` ← `room.style` ← `run.style` ← `item.style` (`resolveStyle`).

## §2 Settings (new keys in `DEFAULT_SETTINGS`)

```js
defaultStyle: { cabinetStyleId: 13, beadWidth: 0.25, profiledEdge: false },
insetFrame: { stile: 0.75, rail: 1.5, midRail: 1.5, mullion: 1.5, upperDrop: 0.75 },
profiledFit: { edge: 0.09375, pairEdge: 0.0625, pairGap: 0.125 },
woodTopReveal: 0.125,
capturedSingleReveal: 0.09375,
```

- `stile` is the share of a seam stile that sits over each box, and also the end stile's part over the box.
- `upperDrop` is how far an inset upper's bottom rail hangs below the box. The rail is 1 1/2", with 3/4" of it over the box.
- All five keys are defaulted on load for documents saved before them.

## §3 Reveal values

A reveal set now has nine keys. The six the user sees are `top`, `bottom`, `left`, `right`, `horizontal` and `vertical`. Three are internal:

- `pair`: the gap between the two doors of a pair
- `fit`: how far each face sits inside its slot, on all four sides
- `pairFit`: the left and right fit for a pair door

`resolveFaces` defaults the internal keys (`pair` → `vertical`, `fit` → 0, `pairFit` → `fit`), so every round 13 test is unchanged.

**European (13):** the existing `settings.faceReveals` by cabinet type, with `pair` = `vertical` = 1/8".

**Inset (14) and Beaded inset (15)**, with bead `b` (0 for style 14). Values are measured from the box edge to the frame opening, i.e. tight to the opening, which is how the shop orders:

| Key | Base / Tall | Upper |
|---|---|---|
| top | rail + b = 1 1/2 | 1 1/2 |
| bottom | rail + b = 1 1/2 | rail − upperDrop + b = 3/4 |
| left, right | stile + b = 3/4 | 3/4 |
| horizontal (between stacked) | midRail + 2b = 1 1/2 | same |
| vertical (between side by side) | mullion + 2b = 1 1/2 | same |
| pair gap | 0 (square) · 1/8 (profiled) | same |
| fit | 0 (square) · 3/32 (profiled) | same |
| pairFit | 0 (square) · 1/16 (profiled) | same |

So a square-edged face fills its opening, and a profiled one is:

- 3/16" smaller than its opening in height
- 3/16" smaller in width for a single door or drawer front
- 1/4" smaller overall for a pair: 1/16" left, 1/8" between, 1/16" right

**Inset section sizes are slot (opening) sizes**, and profiled faces sit 3/32" inside their slot. European sizes stay finished face sizes.

**Round 14 assumes a rail or mullion between every section.** The per-split "no rail" toggle is round 15. With that toggle, stacked faces would share an opening, with a gap of 0 (square) or 1/16" (profiled).

## §4 Rules (applied after the style, before manual overrides)

| Rule | When | Effect | Source label |
|---|---|---|---|
| Wood top | European, base, `run.top === 'wood'` | top = 1/8 | `rule: wood top` |
| Upper flush | upper, `run.upperBottom === 'flush'` | bottom = the tall bottom for the style (European 1/8; inset 1 1/2 + b) | `rule: flush bottom` |
| Upper on counter | upper, `run.upperBottom === 'counter'` | same as flush | `rule: on counter` |
| Captured single | European, one column of faces, captured on both sides | left = right = 3/32 | `rule: captured single` |

- **One column** means no `pair_door` and no side-by-side group anywhere in the tree (`isSingleColumn`). A pair keeps 1/16" because it has 1/8" between its doors.
- **Captured side** (`captureSides`): the neighbor in the same run is a filler or end panel. At a run edge with no end piece, it's a piece of another run on the wall that touches that edge (within `adjacentRunGap`), overlaps it vertically, and is a filler, an end panel, or a piece **deeper** than this cabinet. That covers an upper or base between two talls. A same-depth cabinet box doesn't count.
- **Manual overrides** win per key and show as `manual`. A blank input clears that key.

## §5 Fillers and end panels on upper runs

When `run.upperBottom` is `'overhang'` (the default), the run's fillers and end panels, both run ends and interior fillers, are drawn extending down past the box by `panelDrop`:

- European: the upper bottom overhang, 1/8"
- Inset: `upperDrop`, 3/4"

Their tops stay at the box top. When the bottom is flush or on the counter, they match the box. This is drawing only. The stored run and the dimension rows are unchanged.

## §6 Code map (what each patch holds)

| Step | Patch | Files |
|---|---|---|
| 60 | `step-60.patch` | model: `constants.js` (§2), `faces.js` (pair/fit, optional reveal values in `cabinetFaces`), new `styles.js`, `capture.js`, `faceLayouts.js` (`layoutRun`, `runFaceLayouts`), `index.js` exports, `units.js` (`formatInches(n, step)` / `formatInchesInput(n, step)` for 1/32" display). Tests 26–42 and 49–50: `styles`, `capture`, `faceFit`, `faceLayouts`, `units`. |
| 61 | `step-61.patch` | `persistence.js`: validate the §1 fields and default the §2 keys. `elevationSlice.js`: `setRoomStyle`, `setRunStyle`, `setRunFaceOptions`, `setItemStyle`, `setItemReveals`. None of them calls `syncRoomAt`, because none changes the layout. Tests 43–48. |
| 62 | `step-62.patch` | `RunGroup.jsx`: faces come from `runFaceLayouts`; fillers and end panels are drawn with `panelDrop`. |
| 63 | `step-63.patch` | New `properties/StyleFields.jsx`, `RoomStylePanel.jsx` (sidebar, under Room heights), `properties/RunFaceOptions.jsx` (in RunProperties, above Warnings), `properties/CabinetStyleProperties.jsx` (top of the Faces section: style plus the six reveals with value · source and a manual input). `InchInput` gets an optional `displayStep`. `FaceProperties` reads warnings from `runFaceLayouts`. |

`runFaceLayouts(room, wall, run, settings, layout?)` returns `Map(pieceId → { faces, warnings, style, reveals: { values, sources } })`. It lays out the wall's other runs itself for the cross-run neighbor check, so a stretch-preview `run` works too.

## §7 Deferred

- **Round 15:** drawing the inset frame (stiles and rails), box widths derived at run ends, the per-split rail/mullion toggle (shared openings), inset hanging bases (bottom 3/4").
- **Later:**
  - pencil drawers: always European, sit between the neighbors' frames, full top, no deck
  - floating and hanging cabinets inside a run
  - wood tops and floating shelves as objects (a clickable countertop replaces `run.top`)
  - the door editor (replaces `profiledEdge`)
  - end panels or T-fillers covering the cabinet front edges (captured reveals 13/16 and 27/32)
  - Cabinet Vision overlay values on reports
  - the style settings editor

---

## §8 Follow-ups (steps 64–65)

**Step 64: standard drawer heights follow the style.**

- New settings:
  - `standardDrawerHeights: { european: 5.875, faceFrame: 5 }`. The face frame value is a slot size.
  - `standardDrawerBelow: 6`
- `applyStandardDrawers(face, style, settings)` sets every fixed `drawer_front` or `false_front` smaller than 6" to the style's standard, anywhere in the tree (e.g., the top two in a 4Df, or the stack inside D/4Df). Other types, auto sections and group sizes are unchanged, so the tall 30 1/4" lower section stays for now.
- **When a style change switches a cabinet between European and face frame**, the reducers run it. That applies to `setRoomStyle`, `setRunStyle` and `setItemStyle`, and to every cabinet whose effective style crosses over, including cabinets reached through inheritance. Inset ↔ beaded inset doesn't trigger it. A value typed by hand stays until the next crossover.
- **Presets are applied through it too**, so a 3Df on a face frame cabinet starts at 5".
- Tests 51–54.

**Step 65: clicking empty canvas deselects again.**

- The select tool's pan-on-drag calls `preventDefault()` on `pointerdown` (since step 26). That suppresses the browser's mouse events, so Konva never fires `click` on the stage, and `handleStageClick` never ran for the select tool.
- The window `pointerup` handler now clears the selection when a select-tool left press on empty canvas ends without panning. A press that pans, a middle-button press, or a space+drag press doesn't clear it.
- UI only; there's no test.

## §9 Stretch direction for wall, run and opening widths (step 66)

Every width or length input now has **‹** before it and **›** and **↔** after it:

| Button | Meaning | Stays put |
|---|---|---|
| ‹ | stretch toward the left | the right end |
| › | stretch toward the right | the left end |
| ↔ | stretch both ways | the center |

- **`StretchInput`** (`components/properties/StretchInput.jsx`) is the shared control. Its field spans the full row.
- **Wall length:** `setWallLength` accepts `growEnd: 'both'`. It applies half the change at the left end, then the rest at the right end, so connected neighbors move the same way they do for one end. The default is still the free end, and the choice resets to it after each commit. The plan-view length gesture is unchanged.
- **Run width:** the new `x` comes from `stretchedStart(x, width, nextWidth, grow)`, and width and `x` go through the existing placement check together. An anchored end can't move, so its arrow and ↔ are disabled; runs anchored on both ends still show the read-only width. The default grows away from an anchored end, otherwise to the right.
- **Opening width:**
  - A new `resizeOpening` reducer, with the pure function in `openings.js`, re-expresses the offset in the opening's own terms (measured from the left or right end, edge or center, jamb or casing) without snapping.
  - It checks placement and leaves the opening unchanged with a message if it no longer fits.
  - The default grows away from the wall end the offset is measured from, so the offset you typed stays the same.
- Tests 55–59.
