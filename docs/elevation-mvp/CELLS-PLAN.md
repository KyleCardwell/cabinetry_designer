# Cells: plan (rounds 32–38)

This plan comes from the 2026-09-23 to 09-25 brainstorm on splitting runs vertically. Each round gets its own `SPEC-N.md` / `PROMPTS-N.md` when it's ready to run. It builds on `FACES-PLAN.md` and folds in the two amendments from `docs/platform/AI-LAYER-PLAN.md` §3 (size modes, auto sizes from siblings). Shop rules are cited by ID from `docs/rules/shop-rules.yaml`.

**Branch:** all of rounds 32–38 run on `elevation-grid-run-split`, off `feature/elevation-mvp` at `9d2d166`. Nothing merges back until round 38 is done and the whole thing has been tried; if it doesn't work the way Kyle wants, the branch is dropped and `feature/elevation-mvp` is untouched.

Repo state when this was written: `feature/elevation-mvp` at `57adeb7` (step 155). Nothing is saved to a database yet, so the shape can change freely until PLATFORM-PLAN Phase 2.

## The goal, and the limit

The everyday path doesn't change: drag a rectangle and it auto-splits into cabinets. Cells are the escape hatch for what that can't draw: a tall cabinet too tall for the sheet, a 72" over two 36"s, a stack of three with a shallow oven box in the middle, a desk with a pencil drawer, the rare pinwheel. Most runs never get split, and most splits never go more than two deep. If routine kitchens start needing hand-built cell layouts, that's a UI problem to fix, not a reason to add more model.

## Decisions

### A run is a grid of cells

- **One kind of group: the grid.** A grid has columns, rows and cells. A split is just a grid with one row or one column, so there's no separate split type.
- **A cell is a leaf (one part) or another grid.** Any cell can be split again, to any depth.
- **Cells can span tracks** (`colSpan`, `rowSpan`). Spans exist in the shape from round 32 but stay at 1 until round 38. That's what makes the pinwheel possible (the smallest layout that can't be made by cutting straight across), without making anything else harder.
- **The run's root grid replaces `run.items`.** Existing items become one row, one column per item.

```js
run.grid = { id, cols: [track], rows: [track], cells: [{ col, row, colSpan, rowSpan, node }] }
track    = { id, size: number | null, sizeMode: 'auto' | 'manual' | 'solved', gap?: number }
node     = grid | leaf
leaf     = { id, kind, typeId?, style?, reveals?, depth?, align?, face?, blind?, purpose?, notes? }
```

- **Size lives on tracks.** `size: null` means auto: it shares what's left with its auto siblings, the way auto items and face sections work now. `sizeMode` records who set a number: `manual` (typed) or `solved` (written by the future solver, AI-LAYER-PLAN Stage I). For a simple split a track is the cell's width or height, so this is the same thing as per-cell sizes.
- **Sizes are edited on tracks, from the dimension chain.** A spanning cell's width or height is read-only and shows the total.
- **Gaps between boxes are spacing, not parts.** `gap` on a track is empty space after it: 0 unless set. It's added when a layout needs it, most often under a wider frame stile or T-filler (FF-004, FILL-011), e.g. a 1/2" gap in a beaded inset run. A run can set a default gap for its seams, and each track can override it. A gap takes width (or height) in the solve like a fixed track, has no part number, and is drawn as a gap between the boxes, nothing more. In a face frame run the frame covers every seam, so what a Euro run does with an interior filler, a face frame run does with a gap under a wider stile, the same way an anchored end gets a wider stile instead of a filler.
- **Pins, `absorb` and `autoCount`** act on the root grid's columns. Auto count adds and removes auto columns at the end, each with one cell spanning every root row.

### Solving

- The root grid's **columns** are solved by `splitRun`: ends, flex fillers, pins, rounding, auto count. Nothing about that changes.
- Every other track list (the root rows and all nested grids) uses plain auto/fixed sharing, the same rule as face groups: if every track is fixed, the last one is treated as auto.
- Cell rectangles come from their spans. Boxes touch unless a track has a `gap`; the gaps between faces are reveals inside each box.
- **Neighbours are found from positions, not from the tree.** Capture, stacked-seam rules, frame regions and finished ends look at resolved rectangles, which works across nested grids and across runs.

### Cell kinds

| Kind | What it is | Part number |
|---|---|---|
| `cabinet` | A box with faces (`face` tree as today), a type, a style, reveals | yes |
| `filler` | An interior filler, a real part, as today. | yes |
| `panel` | A side, top/bottom or back panel. Which one comes from its thin dimension: thin in width = side, thin in height = top/bottom, thin in depth = back. | yes |
| `shelves` | Floating shelves: a count, auto-spaced, with an optional back panel behind them. Separate thin `panel` cells with `void`s between also work when positions matter. | yes, each shelf |
| `void` | Nothing there. Breaks the face frame. | no |

- **Which panel runs through is decided by split order**, the way the box is built. Side panels full height with a top panel between: split across into [panel, middle, panel], then split the middle down. Top panel full width with sides under it: split down first. A "Wrap in panels" action with a *sides through / top through* toggle builds either in one click.
- **An open box with a frame around it is a `cabinet` with an `open` face, not a `void`.**
- **Accessories** (corbels on a cell, hooks, anything in front of a back panel other than shelves) are deferred. Nothing splits a cell front to back.

### Type is a preset

- `typeId` on a cell picks which row of defaults it starts from: reveals, depth, deck. It inherits the run's `cabinetTypeId`. A base with a full top and a 1/8" top reveal is the same box as a tall.
- **Notes come from deviations.** REV-001 and REV-003 note "anything different from standard", only the sides that differ, in T B L R order. So every cabinet cell carries a derived list of `{ key, standard, actual, source }` against its type standard. A value the app derived (a stacked seam, a covered light rail) is still noted. `source` says how it was set, for the AI review. The deviation is what the shop reads.

### Depth and outset

- **Run:** `depth` as today, plus `outset`, the distance off the wall.
- **Cell:** `depth` no deeper than the run's (blank = the run's), and `align: 'face' | 'back'`.
  - Faces aligned: a shallower box's back sits forward of the wall.
  - Backs aligned: the front is recessed. The oven box: 21" deep, backs in line with its neighbours, and the oven's thick face fills the front.
  - A back panel: a `panel` cell 3/4" deep, backs aligned.
- **Deeper than the run means a separate run.** Fillers and end panels always follow the run's depth.

### Stacked seams are reveals

There's no seam object. The frame member or face gap at a seam is the sum of the two boxes' reveals (plus any box gap), and reveals stay editable per cabinet (blank = inherit, a value forces it).

- **Face frame (REV-009):** shared rail, 3/4" bottom reveal on the upper box and 3/4" top reveal on the lower. The lower box has a full top, the upper box's deck sits at 0 (the exception to BOX-003), and one 1 1/2" rail covers both. Separate rails: each box keeps 1 1/2".
- **Euro (REV-010):** 0" on the upper box's bottom, 1/8" on the lower box's top. A default: which box takes the 0 can flip, and either can go negative, to hold a line through the room.
- Both show in the panel with the source `rule: stacked seam`, like the captured-single rule.

### Blind corners

- `blind` moves from the run to the cell. Any cell in the outermost column on that side can be blind, one or several.
- The run's end is still one piece, full run height: the 6" flat filler or the full-width panel that already exists (SPEC-28/29). A run has one end type per side.

### Face frame regions

The inset frame drawing (FACES-PLAN round 15) was never built. It should now be built on cells, in round 36.

- The frame belongs to the run and covers **each rectangle of face frame cabinet cells**: the whole grid, one row or one column.
- It **breaks at** voids, panels, Euro cells (pencil drawers are always Euro) and run boundaries. At a panel inside the run, the outside stile overhangs the box and covers the panel's edge, the same as at a run-end panel (FF-002, 1 9/16").
- Stiles and rails over seams are the neighbouring reveals added together, plus any gap between the boxes (FF-004).
- A region that isn't a rectangle gets a warning. It's not expected to happen.

### T-fillers (FILL-011)

- **Euro only.** It's the Euro version of a frame stile: the flat covers 3/4" of each box, so the resolver reuses the stile logic, and the covered-edge reveals are REV-005/006's 13/16" and 27/32".
- **A run setting** (at every seam), **overridable per cabinet side**, including top and bottom between stacked boxes.
- It's a filler part with its own number, noted "T-shape" (FILL-004), and each box it covers gets the rabbet note (FILL-007).

### Runs are separated by parts that overhang them

**Cells are separated by box seams; runs are separated by tops, caps and anything else that overhangs the boxes.** A full-width panel above or below a run is a run top or bottom; a panel inside the run is a cell.

- **`run.top`** is `none` or a top, independent of cabinet type: a base run can take crown, a tall or upper can take a wood top. A type only sets the default a new run starts with. REV-002 (1/8" below a wood top) follows the top on any run type.
- **`run.bottom`** is `none` (the default) or a list, top to bottom, of `light_rail`, `light_trough`, `panel`, `bottom_cap`, `corbels`. Each part has a height and a `doors` setting: `cover`, `flush` or `visible`. The room's design decides which, not a rule. REV-011 derives the bottom reveal from it: covered = minus the part's height plus the usual overhang (−7/8" over a 3/4" panel, −1 5/8" over a 1 1/2" light rail); flush = 1/8"; visible = standard. Always overridable. A bottom cap and corbels are never covered.

### Vertical joins

- **Runs join above and below** the way they join side to side now (`anchors` with a `jointId` and an `offset`). The offset is the gap.
- A run joined above and below **fills the gap**, just as a run anchored at both ends fills the wall. Resizing either run adjusts the other.
- This replaces a separate "float" type, and any number of runs can stack.
- **Worked example** (a room from a recent budget):
  1. a base run with a countertop
  2. a middle run joined to the countertop below and to the upper's cap above: end panels at both ends (ordinary run ends) and one `panel` cell between them, 3/4" deep, backs aligned
  3. an upper run with a `bottom_cap`

### Dimensions

- **Each chain sits next to the level it measures.**
  - The overall width chain below the run measures the root columns.
  - A split column gets its own vertical chain drawn on that column, inside the run.
  - A nested split gets a short local chain next to it.
  - Only the run's overall height goes out at the wall.
- **A joined stack gets one vertical chain** across its runs: box | top | box | cap | box. This also removes the overlapping dimensions and selection problem that stacking two unjoined runs by hand causes today.
- Face frame runs dimension openings (rail | opening | rail), vertically as well as across.

### Part numbers

Every leaf gets its own number except `void`. Gaps aren't cells, so they never get one. The order is by resolved rectangle: left edge, then bottom edge. The shop has no preferred order as long as every cabinet has a number.

### Plan view

The topmost cells are drawn. Lower cells with different seams can be dashed later.

### Editing actions

| Action | Round |
|---|---|
| Split a cell into N, across or down. The same direction as a one-row/one-column parent adds tracks; otherwise it nests. | 33 |
| Remove a cell, make equal, undo a split | 33 |
| Wrap in panels (sides through / top through) | 34 |
| Split into rows × columns | 38 |
| Combine adjacent cells into one spanning cell (flattening first if they sit in different grids) | 38 |
| Combine two runs / split a run in two; copy a run; copy styles from another run | later |

## Rounds

| Round | What | Delivers |
|---|---|---|
| **32 — Grid shape** | `run.grid` replaces `run.items`; tracks with `sizeMode` and an optional `gap` (inert until 34); migration; `splitRun` solves root columns; pins, absorb, auto count, ends and blind (moved to the cell) keep working. Its own shape step, green and inert (PROMPT-CONVENTIONS rule 4). Every existing layout resolves exactly as before. | nothing visible |
| **33 — Vertical split** | Split, remove and equalize cells; draw and select cells; cell part numbers; REV-009/010 with sources; vertical chains per split column; editing track sizes on chains. | the too-tall cabinet, 72" over two 36"s, the oven stack (depth in 34) |
| **34 — Kinds and depth** | `panel`, `void`, `shelves` with back; gaps between boxes (drawn, solved, run default and per-track override); `depth`, `align`, `run.outset`; Wrap in panels; deviation lists for notes. | the desk, back panels, floating shelves |
| **35 — Tops, bottoms, vertical joins** | `run.top` decoupled from type; the `run.bottom` list and REV-011; joins above and below with fill; one chain per joined stack. | the budgeted room |
| **36 — Face frame on cells** | FACES-PLAN round 15 rebuilt on cells: frame regions, breaks, stiles and rails from reveals plus gaps (FF-004), opening dimensions. | inset and beaded inset runs |
| **37 — T-fillers** | FILL-011: run setting, per-side overrides, stile logic, rabbet notes. | Euro T-filler runs |
| **38 — Combine and full grids** | Rows × columns splits, combine, flatten, spans in the solver, chains and neighbours. | the pinwheel |

Then AI-LAYER-PLAN Stages C–E (provenance, intent, the resolved snapshot). `purpose` and `notes` attach to cells.

## Deferred

- Automatic splits by material height. The split point depends on the material and sheet size, which aren't hooked up. For now splits are manual; later, a warning when a cell is taller than the selected material allows.
- Accessories (corbels on a cell, hooks) and anything else in front of a back panel.
- Interior sections: fixed shelves, partitions, section notes (README "Interior"). A section is a vertical slice of one cell's interior; a cell is a separate box. On a face frame a mid rail and a shared rail look the same, so "split cell" and "split face" must stay clearly separate actions.
- Moving faces onto the grid shape. A one-row grid behaves exactly like today's face split, so it's mechanical if it's ever wanted.
- Dashed lower cells in plan.

## Open

1. **Where chains go when neighbouring stacks have different heights.** On each column (above) or nearest the wall? Settle it in round 33 with a real layout on screen.
2. **REV-011 "visible"** is assumed to mean the standard reveal. Confirm on the first real room that has one.
