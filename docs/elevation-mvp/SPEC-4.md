# Elevation Lab — Spec 4: Dimensions (plan + elevation) and plan footprint selection

Extends SPEC.md, SPEC-2.md and SPEC-3.md (steps 1–14 are built). Source of truth for steps 15–17.
If something is ambiguous, pick the simplest option, leave a `// SPEC-QUESTION:` comment, and mention it in your summary. No storage changes.

## 1. Plan view: footprint selection fix
**Bug:** footprints render in `wall.runs` order. A base run added after an upper run is drawn on top of the upper run's footprint (the upper is only 12 7/8" deep, entirely inside the base's 24 7/8"), so the upper can't be clicked.
- **Render order:** all walls first; then every BASE and TALL footprint; then every UPPER footprint (uppers on top). Keep each upper's near-transparent fill so its whole interior is clickable. Bases stay clickable on their exposed front strip.
- **Click-through:** add a pure helper, `footprintsAtPoint(room, point, settings)` in `model/footprints.js`. It returns the run ids whose footprint contains `point` (point-in-polygon), topmost first (uppers before base/tall; later walls/runs before earlier).
  - On a footprint click: if the topmost id under the pointer is already selected, select the **next** one in that list (wrapping around). Otherwise select the topmost.
  - This lets the user click twice to reach a base run under an upper.

## 2. Plan view: wall dimension, handle and number on the exterior
All offsets below are measured from the wall's **back edge** (face + `thickness`), toward the exterior (`−n`). "px" means screen pixels (divide by `scale` in world units).
- **Dimension line:** parallel to the wall at `thickness + 18px` from the face. Its endpoints are the **face** endpoints projected onto that line, so the value is the finished-face length (`frame.length`), not the mitered back length.
  - Draw extension lines from 2px outside the back edge to 4px past the dimension line, and short 45° ticks (or small arrowheads) at both ends.
  - The label is centered on the line, on its outward side, rotated to stay readable (reuse the current rotation rule), formatted with `formatInches`. If the label doesn't fit between the ends (§4.2 rule), pop it out further outward with a short leader.
- Remove the interior length label. Keep the interior tick.
- **Move handle:** at the wall midpoint, offset `thickness + 38px` to the exterior. It still drags along the normal and behaves exactly as in SPEC-3 §4; only its position changes. The move preview's delta label follows the handle.
- **Wall number circle:** at `thickness + 38px` to the exterior, shifted 24px along the wall direction `d` from the midpoint, so it sits beside the handle.
- The dimension, handle and number must not intercept clicks meant for walls or footprints; only the handle listens.

## 3. Dimension chains (`src/elevation/model/dimensions.js`, pure)
A **segment** is `{ start, end, kind, runId?, pieceId? }` in wall-local inches. `kind` is one of:
- `'piece'` (cabinet, filler or end panel)
- `'corner-gap'`
- `'open'`
- `'run'`
- `'tall-span'`
- for vertical chains: `'toe-kick'`, `'box'`, `'countertop'`, `'clearance'`, `'molding'`, `'wall'`

Segments shorter than 1e-6 are dropped. Every chain is sorted and contiguous.

### 3.1 `horizontalChains(room, wall, band, settings)` → `{ inner: Segment[], outer: Segment[] }`
- `band === 'lower'`: BASE and TALL runs. `band === 'upper'`: UPPER runs. If the band has no runs, return `{inner: [], outer: []}`, and no rows are drawn for that band.
- `L = wallLength(wall)`. Sort the band's runs by x.
- **Inner** (a full-wall chain from 0 to L):
  - For each run, first the gap before it. The gap is a `'corner-gap'` when it starts at 0, the run is the first in the band, `run.anchors.left` is true, and `cornerAt(room, wall, 'left').type === 'inside'`. Otherwise it's `'open'`.
  - Then every piece from `splitRun(run, settings, {endMinWidths: endMinWidthsForRun(...)})`, as `'piece'` segments with `runId` and `pieceId`.
  - After the last run, the gap to L, with the same corner rule mirrored for the right side.
  - **Upper band only:** any part of an `'open'` gap covered by a TALL run's x-range becomes a `'tall-span'` segment instead, so the upper chain still reads correctly across a tall cabinet.
- **Outer** (a full-wall chain from 0 to L): one `'run'` segment per run, from `run.x` to `run.x + run.width`.
  - Exception: when the gap before the first run is a `'corner-gap'`, the run segment starts at 0. When the gap after the last run is a `'corner-gap'`, it ends at L.
  - The remaining gaps are `'open'` (or `'tall-span'` in the upper band, as above).

### 3.2 `verticalChains(room, wall, { lowerRun, upperRun }, settings)` → `{ inner, outer }`
- **`outer`:** `[{start: 0, end: wall.height, kind: 'wall'}]`.
- **`inner`** (from the floor up to `wall.height`, contiguous; skip anything ≤ 0 and never go backward):
  - `lowerRun` BASE → `'toe-kick'` [0, z], `'box'` [z, z+h], `'countertop'` [top, top + ct]. `ct` is the resolved countertop thickness (profile + wall + run overrides).
  - `lowerRun` TALL → `'toe-kick'` [0, z], `'box'` [z, z+h].
  - `upperRun` → the gap from the current top to `upperRun.z` (`'clearance'` if lowerRun is a BASE, otherwise `'open'`), then `'box'` [z, z+h].
  - **Molding:** if the highest box so far belongs to an upper or tall run in auto height mode, add `'molding'` [boxTop, boxTop + moldingStack].
  - Finally `'open'` up to `wall.height`. If the chain has already passed `wall.height`, stop at the last segment; the chain may exceed the wall.
  - With no runs: a single `'open'` segment [0, wall.height].
- **`pickColumnRuns(wall, selectedRunId)`** (same file) → `{ lowerRun, upperRun }`:
  - If the selected run is a BASE or TALL run, it's the `lowerRun`, and `upperRun` is the first UPPER run whose x-range overlaps it. (If the selected run is TALL, `upperRun` is null.)
  - If the selected run is an UPPER run, it's the `upperRun`, and `lowerRun` is the first BASE or TALL run overlapping it.
  - With nothing selected: the leftmost BASE or TALL run, and the leftmost UPPER run.

## 4. Elevation rendering
### 4.1 Layout
- **Horizontal rows:**
  - For the lower band, the inner row sits 20px below the floor line, and the outer row sits `20px + 22px + popoutLevels(inner) × 14px` below it.
  - For the upper band, the same, but above the wall's top edge.
- **Vertical rows:** left of the wall's left edge, with the inner row at 24px and the outer row at `24px + 26px + popoutLevels(inner) × 16px`.
- **Viewport padding:** reserve space in `fitWallToViewport`: `bottom 96`, `top 96` (only when the upper band has runs; otherwise keep the current top), `left 110`. Cap pop-out levels at 2 per row. Labels that still don't fit are hidden and shown as a hover tooltip on the segment.
- **Remove** the per-run `DimensionLine` above each run (RunGroup). Clicking an outer-row `'run'` segment selects that run instead. The in-cabinet width labels stay as they are.

### 4.2 Row layout helper (`src/elevation/canvas/dimensionLayout.js`, pure)
`layoutDimensionRow(segments, { scale, fontSize = 11, charWidth = 0.6 * fontSize, padding = 4, maxLevels = 2 })` → `{ labels: [{ index, text, mode: 'inline'|'popout'|'hidden', level, center, width }], levels }`
- `text = formatInches(end − start)`, `width = text.length × charWidth + 2 × padding` (px), `lengthPx = (end − start) × scale`.
- `mode = 'inline'` when `width <= lengthPx − 4`.
- Otherwise it's a pop-out: labels are sorted by center (px), and each one is placed on the lowest level (1…maxLevels) where it doesn't overlap another pop-out on that level (with a 4px gap). If none is free → `'hidden'`.
- `levels` = the highest level used (0 if every label is inline).
- **Vertical rows use the same helper,** since the math is identical along the vertical axis. Their labels are rotated −90°.

### 4.3 `DimensionRow.jsx` (generic component)
Props: `segments`, `orientation: 'horizontal'|'vertical'`, `side: 'below'|'above'|'left'`, `offsetPx`, `transform`, `onSegmentClick?`, `highlightRunId?`.
- It draws:
  - the dimension line
  - an extension line and tick at every boundary, running from the wall or cabinet edge to the row
  - inline labels centered just outside the line
  - pop-out labels at `offsetPx + 12px × level` further outward, with a thin leader to the segment midpoint
- **Colors by kind:** piece `#cbd5e1`; corner-gap `#f59e0b`; open and tall-span `#64748b`; run `#e2e8f0` (the selected run `#38bdf8`); vertical kinds `#cbd5e1`, except `'wall'` `#e2e8f0`.
- Only `'run'` segments listen for clicks.

## 5. Required tests (vitest)
Use Room R from SPEC-2 (A (0,0)→(120,0), B (120,0)→(120,96), connected, thickness 4.5), with defaults.

**Footprints**
1. Room R with an A base run (x 0, w 60, depth 24) and an A upper run (x 0, w 60) at point (30, 5) → `footprintsAtPoint` returns `[upper, base]`. At (30, 20) → `[base]`.

**Horizontal chains.** Setup: A base run anchored right (w 60) and B base run anchored left (w 48), after `syncRoom`.

2. A lower inner = open 0→35.125; pieces 1.5, 28.5, 28.5, 1.5; corner-gap 95.125→120.
3. A lower outer = open 0→35.125; run 35.125→120. Both chains are contiguous and sum to 120.
4. B lower inner starts with corner-gap 0→24.875. B lower outer starts with run 0→72.875 (24.875 + 48).
5. A upper band with no uppers → both chains are empty.
6. Upper band on A with an upper run x 0 w 30 and a tall run x 60 w 24 (no base) → the upper inner chain contains a tall-span 60→84 between open segments.

**Vertical chains**

7. A base run + an overlapping upper run, defaults, wall height 96 → inner kinds and lengths: toe-kick 4, box 30.5, countertop 1.5, clearance 18, box 36, molding 6 (no open at the end). Outer = wall 96.
8. The same with wall height 100 → ends with open 4.
9. A base run with a countertop override of 3, and the upper over it → countertop 3, clearance 18, upper box 34.5.
10. A tall run only (auto) → toe-kick 4, box 86, molding 6.
11. `pickColumnRuns`: selecting the upper picks the overlapping base; nothing selected picks the leftmost base and leftmost upper.

**Layout helper**

12. Segments [0,30] and [30,31.5] at scale 4, fontSize 11: '30' is inline; '1 1/2' pops out at level 1.
13. Three adjacent 1" segments at scale 4. Each label '1' is 14.6px wide, centered at 2, 6 and 10 px → modes/levels: popout L1, popout L2, hidden. `levels` = 2.
14. A long single segment → inline, levels 0.
