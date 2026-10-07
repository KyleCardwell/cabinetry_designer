# Elevation Lab — MVP Spec (v1)

Source of truth for the elevation / run-drawing prototype. Every Codex step prompt refers to this file.
If something here is ambiguous, pick the simplest option, leave a `// SPEC-QUESTION:` comment, and mention it in your summary. Do not invent extra features.

## 1. Goal
A standalone page, **Elevation Lab**, where a user can:
1. Create simple "scratch" walls (name, length, height). They are not tied to rooms yet.
2. Look at one wall in elevation (front view).
3. Drag a rectangle on the wall to create a **run** (a row of base, upper or tall cabinets).
4. Have the system split the run into cabinets, fillers and end panels automatically.
5. Click a run or a piece and edit dimensions. Other pieces re-flow automatically.

This is a UX test. Nothing is saved to Supabase or the API.

## 2. Out of scope (do NOT build)
- Face layouts, doors or drawers (cabinets are plain rectangles)
- Database, API or Supabase changes; the geometry engine; DXF output
- Changes to the existing floor-plan editor (`RoomEditor`, `src/canvas/*`, the existing slices), except the small hooks listed in §10
- Corners, openings, appliances, undo/redo, drag handles for resizing
- Anything in `../ff-job-schedule-v1`, `../cabinetry_designer_api` or `../cabinetry_designer_geometry`

## 3. Units and coordinates
- All numbers are **inches**, stored as JS numbers.
- Wall-local coordinates: `x` = distance from the wall's left end (0 … wall.length), and `z` = height above the floor (0 … wall.height). The elevation is viewed from inside the room, with x = 0 on the left.
- Konva's y axis points down, so screen y = `(wall.height - z) * scale + offsetY`. Keep this conversion in one helper.
- Display dimensions as fractions (`30 1/2"`, `2 1/16"`, `3/4"`). Inputs accept `30 1/2`, `30-1/2`, `30.5`, `3/4`, with or without `"`.

## 4. Settings (defaults, editable in the UI)
```js
export const DEFAULT_SETTINGS = {
  toeKickHeight: 4,          // toe kick / furniture base is built separately; it is NOT part of the cabinet box
  baseBoxHeight: 30.5,       // base cabinet BOX height (sits on top of the toe kick)
  baseDepth: 24,
  countertopThickness: 1.5,  // visual only (counter top at 4 + 30.5 + 1.5 = 36)
  upperBottomZ: 54,
  upperBoxHeight: 30,
  upperDepth: 12,
  tallBoxHeight: 84,         // tall box sits on the toe kick
  tallDepth: 24,
  roundTo: 0.5,              // cabinet widths are rounded DOWN to this step
  maxCabinetWidth: 36,
  minCabinetWidth: 9,        // warning only
  fillerMinWidth: 1.5,
  fillerWarnWidth: 6,        // warning only
  endPanelThickness: 0.75,
  defaultInteriorFillerWidth: 3,
  minRunWidth: 9,            // drags narrower than this are ignored
  snapHeightsToDefaults: true,
  defaultEnds: { left: 'filler', right: 'filler' },
};
```
Filler and end-panel dimensions are rounded to 1/16". Cabinet dimensions are rounded to `roundTo` (see §6).

## 5. Data model (stored JSON)
Store the user's **intent**, not the computed result. Piece positions are always derived by the splitter.

```js
// Cabinet type IDs match ff-job-schedule `cabinet_types` (hardcoded for the MVP; keep them in ONE constants file)
export const CABINET_TYPE_IDS = { BASE: 1, UPPER: 2, TALL: 3, FILLER: 5, END_PANEL: 10 };

// Lab document (persisted to localStorage)
{
  schemaVersion: 1,
  settings: { ...DEFAULT_SETTINGS },
  walls: [Wall],
  activeWallId: string | null
}

// Wall
{ id: uuid, name: string, length: number, height: number, runs: [Run] }

// Run
{
  id: uuid,
  cabinetTypeId: 1 | 2 | 3,          // BASE | UPPER | TALL
  x: number, width: number,          // wall-local; x+width <= wall.length
  z: number, height: number,         // z = bottom of the cabinet BOX (base/tall: z = toeKickHeight)
  depth: number,
  ends: {
    left:  { type: 'filler' | 'end_panel' | 'none', width: number | null },   // width null = auto (filler only)
    right: { type: 'filler' | 'end_panel' | 'none', width: number | null }
  },
  autoCount: boolean,                 // true: cabinet count follows run width (see syncAutoItems)
  maxCabinetWidth: number | null,     // null = settings.maxCabinetWidth
  items: [Item]                       // ordered left → right, between the two ends
}

// Item
{ id: uuid, kind: 'cabinet' | 'filler', width: number | null }
// cabinet: width null = auto-sized, number = fixed ("locked")
// filler (interior): width is always a number (default settings.defaultInteriorFillerWidth)
```
The runtime state also holds `selection: { runId, pieceId | null }` and `tool: 'select' | 'draw'`. These are not persisted.

## 6. Splitter — `splitRun(run, settings) -> { pieces, warnings, errors }`
A pure function with no React or Redux. File: `src/elevation/model/splitRun.js`.

**Piece** output:
`{ id, kind: 'cabinet'|'filler'|'end_panel', role: 'item'|'end-left'|'end-right', cabinetTypeId, x, width, z, height, depth, auto: boolean }`
- End piece IDs are `${run.id}:left` and `${run.id}:right`. Item pieces use the item's ID.
- Kind → cabinetTypeId: cabinet → run.cabinetTypeId, filler → 5, end_panel → 10.
- All pieces share the run's z, height and depth, except end panels, whose depth is `settings.endPanelThickness`. That's informational only.

**Algorithm:**
1. For each end: `end_panel` → fixed width `endPanelThickness`. `filler` with a number width → fixed. `filler` with null width → **flex filler**. `none` → no piece.
2. `fixed` = the sum of fixed end widths + fixed cabinet widths + interior filler widths.
3. `available = run.width - fixed`. `nAuto` = the number of cabinet items with `width === null`. `flex` = the number of flex fillers.
4. If `available < 0` → error `{ code: 'over-constrained' }`. Set auto cabinets and flex fillers to width 0 and still return pieces.
5. **If `flex > 0`:**
   - `cabSpace = available - flex * fillerMinWidth`
   - `autoW = floorTo(cabSpace / nAuto, roundTo)`, or 0 if nAuto is 0
   - `leftover = available - nAuto * autoW`
   - each flex filler = `floorTo(leftover / flex, 1/16)`. The left flex filler takes any remainder, so the widths add up exactly.
   - If `cabSpace < 0` → error `over-constrained`.
6. **If `flex === 0`:**
   - `autoW = available / nAuto`, rounded to 1/16. The last auto cabinet takes any remainder.
   - If `autoW` is not a multiple of `roundTo` → warning `widths-not-rounded`.
   - If `nAuto === 0` and `available !== 0` → error `does-not-fill`. The pieces don't add up to the run width.
7. **Warnings:**
   - `wide-cabinet`: an auto cabinet is wider than the max width. Max width = `run.maxCabinetWidth ?? settings.maxCabinetWidth`.
   - `narrow-cabinet`: an auto cabinet is narrower than `minCabinetWidth`.
   - `wide-filler`: a flex filler is wider than `fillerWarnWidth`.

   Each warning is `{ code, pieceId, message }`.
8. Position the pieces left to right: left end, then items in order, then right end, starting at `run.x`.
9. Invariant when there are no errors: the sum of piece widths === `run.width` (within 1e-6).

**`syncAutoItems(run, settings) -> run`** (pure, same folder)
- If `!run.autoCount` → return the run unchanged.
- Compute `available` and `flex` as above, and `cabSpace` as in step 5 (or `available` when flex is 0).
- `autoSpace` = cabSpace (fixed cabinet widths were already subtracted in `available`).
- `target = max(1, ceil(autoSpace / maxWidth))` when autoSpace > 0, otherwise 0.
- Add or remove **auto** cabinet items at the END of `items` until the count of auto cabinets equals `target`. Never touch fixed cabinets or fillers.
- Call it whenever a run is created, or when its width, ends, max width or items change.
- **Any manual add, remove or split of cabinets sets `autoCount = false`.**

## 7. Other model helpers (`src/elevation/model/`)
- `units.js`: `parseInches(str) -> number|null`, `formatInches(n) -> string`, `floorTo(n, step)`, `roundTo(n, step)`. Use epsilon-safe math.
- `constants.js`: `CABINET_TYPE_IDS`, `DEFAULT_SETTINGS`, and labels and colors per kind.
- `runDefaults.js`:
  - `inferRunType(bottomZ, topZ)`: bottom < 24 and top > 60 → TALL; bottom < 24 → BASE; otherwise UPPER.
  - `defaultsForType(typeId, settings)`: base → `{z: toeKickHeight, height: baseBoxHeight, depth: baseDepth}`, tall → `{z: toeKickHeight, height: tallBoxHeight, depth: tallDepth}`, upper → `{z: upperBottomZ, height: upperBoxHeight, depth: upperDepth}`.
  - `createRun({x, width, bottomZ, topZ}, settings)`: rounds x and width to 0.5, infers the type, applies the default heights if `snapHeightsToDefaults` (otherwise keeps the drawn z and height, rounded to 0.5), sets `ends` from `defaultEnds` with width null, `autoCount: true`, `items: []`, then calls `syncAutoItems`.
- `overlap.js`: `runsConflict(a, b, settings)`. Two runs conflict if their x ranges overlap by more than 1e-6 AND their vertical ranges overlap. The vertical range is `[z, z + height]`, except base and tall runs use `[0, z + height]` so the toe kick counts. `validateRunPlacement(wall, run, settings)` returns `{ ok, reason }`, checking wall bounds and conflicts with the wall's other runs.

## 8. UI
Route: **`/elevation-lab`** (behind the existing login). New code lives in `src/elevation/`.

Layout: a left sidebar, the canvas in the center, and a properties panel on the right. Use Tailwind and a dark theme to match `RoomEditor`.

- **Left sidebar**
  - Wall list: add a wall (name, length, height; defaults "Wall 1", 144, 96), select, rename, edit length and height, delete (with a confirm button in the UI, not `window.confirm`).
  - Settings panel (collapsible): all of §4, with inch inputs.
  - "Show JSON" toggle, which renders the active wall's JSON in a `<pre>` for debugging.
- **Toolbar** (above the canvas): Select / Draw Run tools, zoom to fit.
- **Canvas** (react-konva):
  - Size it from its container with a `ResizeObserver`. Don't use the `window.innerWidth` math from `CanvasStage`. Auto-fit the wall with padding.
  - Draw the wall outline, the floor line, and a light 12" grid.
  - For base and tall runs, draw the toe kick as a darker recessed strip (z 0 → toeKickHeight, inset 3" from each run end visually; not selectable). For base runs, draw the countertop as a band from the box top to `+countertopThickness`, extended 1" past each run end, visual only.
  - Draw each piece as a rectangle with a distinct color per kind, its width label centered, and a lock icon or asterisk on fixed cabinets.
  - Show the run's overall width as a dimension line above it.
  - Highlight the selected run and selected piece. Mark pieces that have warnings or errors in amber or red.
- **Draw tool:** mouse down, drag, mouse up creates a run (`createRun`). Show a preview rectangle with a live width label while dragging. Ignore drags narrower than `minRunWidth`. If `validateRunPlacement` fails, don't create the run; show a short inline message in the toolbar for about 3s. After creating, switch to Select and select the new run.
- **Select tool:** clicking a piece selects that piece and its run; clicking empty space inside the run's outline selects the run; clicking empty space clears. Esc clears. Delete/Backspace (not while typing in an input) removes the selected cabinet or interior filler item, or the whole run if only the run is selected.
- **Properties panel**
  - **Run selected:**
    - Type (Base/Upper/Tall), with a "Reset heights to defaults" button.
    - x, width, z, height and depth, as inch inputs that commit on blur or Enter and are validated with `validateRunPlacement`. Revert on failure and show a message.
    - Left and right end: type select, plus a width input for fillers (blank = auto).
    - Auto count toggle, with a cabinet count and +/- buttons (the buttons set `autoCount = false`), and a max cabinet width override (blank = setting).
    - A pieces list showing kind, width and a lock state; clicking a row selects that piece.
    - The warnings and errors list.
  - **Cabinet piece selected:**
    - A width input. Typing a value fixes the width.
    - A Lock/Unlock toggle. Locking fixes the width at its current computed value; unlocking sets it back to null.
    - Buttons: "Split in 2" (replaces the item with two auto cabinets), "Add cabinet right", "Add filler right", "Remove". All of these set `autoCount = false`.
  - **Interior filler selected:** a width input and Remove.
  - **End piece selected:** end type select and a width input (fillers only; blank = auto).
- All edits go through Redux actions. Each action updates the run and then calls `syncAutoItems`. The canvas renders `splitRun` output. Memoize it per run.

## 9. State and persistence
- Add a new slice `src/elevation/store/elevationSlice.js`, registered as `elevation` in `src/store/index.js`.
- Persist `{schemaVersion, settings, walls, activeWallId}` to localStorage key `cd.elevationLab.v1`, debounced to about 300ms. Wrap every read and write in try/catch. If the stored data is missing, invalid or from another schemaVersion, start fresh with one default wall.
- Generate IDs with `uuid` (already a dependency).

## 10. Allowed changes to existing files
- `src/App.jsx`: add the `/elevation-lab` route.
- `src/components/layout/AppShell.jsx`: add header links "Projects" (`/`) and "Elevation Lab" (`/elevation-lab`).
- `src/store/index.js`: register the reducer.
- `package.json` / lockfile: add `vitest` as a dev dependency and a `"test": "vitest run"` script.

Nothing else outside `src/elevation/` and `docs/elevation-mvp/`.

## 11. Required unit-test cases (vitest, `src/elevation/model/__tests__/`)
Use the §4 defaults unless noted. Widths are listed left to right.
1. Run 120, ends filler/filler, 4 auto cabinets → `[2, 29, 29, 29, 29, 2]`, no warnings.
2. `syncAutoItems` on run 120, filler/filler, empty items → 4 auto cabinets.
3. Run 96, ends end_panel/filler, after sync → 3 cabinets → `[0.75, 31, 31, 31, 2.25]`; x positions `[0, 0.75, 31.75, 62.75, 93.75]`.
4. Run 120, filler/filler, items `[auto, 36 fixed, auto]`, autoCount false → autos 40.5 each, fillers 1.5, plus a `wide-cabinet` warning on both autos.
5. Same as 4 but with autoCount true → sync adds one auto at the end → `[1.5, 27, 36, 27, 27, 1.5]`.
6. Run 60, ends filler(3 fixed)/filler(3 fixed), 2 autos → `[3, 27, 27, 3]`, no warnings.
7. Run 61, ends none/none, 2 autos → `[30.5, 30.5]`. Run 61.25, none/none, 2 autos → `[30.625, 30.625]` + `widths-not-rounded`.
8. Run 30, filler/filler, items `[36 fixed]` → error `over-constrained`.
9. Run 100 1/8, filler/filler, after sync → cabinets 32 each, fillers `2 1/16` each.
10. Sum invariant: for runs of widths 30–240 in 1/8" steps with filler/filler ends and autoCount true, the sum of widths equals the run width, every auto cabinet ≤ 36, and every filler ≥ 1.5.
11. `parseInches` / `formatInches` round trips: `"30 1/2"`, `"30-1/2"`, `"30.5"`, `"3/4"`, `'2 1/16"'`, and invalid input → null.
12. `inferRunType` and `createRun`: drawing bottom 2 / top 30 → BASE with z 4 and height 30.5; bottom 50 / top 80 → UPPER with z 54; bottom 1 / top 90 → TALL with z 4 and height 84.
13. `runsConflict`: base vs upper at the same x → no conflict; base vs tall overlapping in x → conflict; base vs base touching edges → no conflict.
