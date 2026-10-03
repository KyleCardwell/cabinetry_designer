# Elevation Lab — SPEC-19 (soffits)

Steps 96–100. The earlier SPEC files still apply; this file is the source of truth for what follows. SPEC-18 (wing walls) must be done first: soffit ends anchor to wing-wall faces.

This is build-order item (4) of the wall configuration entry in `TODO.md`.

## After this SPEC you can

- Pick **Soffit** in the elevation toolbar, choose what goes under it (**Crown**, **Top mold** or **None**), and drag a box down from the ceiling. The box's bottom is the soffit's underside; its ends snap to wall ends and wing-wall faces.
- Have several soffits on each side of a wall. Overlapping soffits are refused.
- Watch uppers and talls that sit entirely under a soffit drop their box top to the soffit, less the crown or top mold you chose. That molding is what's drawn on top of them.
- Anchor an upper or tall beside a soffit to the soffit's side. Its end on that side defaults to a **filler** when cabinets carry on under the soffit there, and to an **end panel** when nothing does. You can change it with the existing End control.
- Get a warning when a cabinet's box pokes into a soffit it only partly sits under.
- Select a soffit to edit its underside height, depth, molding and end anchors (with signed offsets: negative runs past a wing wall, onto it), or delete it.
- See soffits as dashed outlines in plan.

## Not in this SPEC

- A soffit that wraps a corner. Draw one on each wall; they meet at the corner.
- Soffit dimensions in the elevation dimension chains.
- Selecting or drawing soffits in plan.
- Crown returning along a soffit's exposed end.

---

## §0 Shape

```js
wall.soffits = [Soffit]
Soffit = {
  id,
  wallSide,              // 'front' | 'back'
  x, width,              // resolved like a run's; stored so free ends keep their place
  bottom,                // underside height, inches from the floor
  depth,                 // out from the face
  molding,               // 'crown' | 'topMold' | 'none' — what sits between it and cabinets below
  anchors: {
    left:  false | { to: 'end', offset } | { to: 'wall', wallId, offset },
    right: same,
  },
}
```

- A soffit runs from `bottom` up to the wall height (the ceiling).
- Anchor offsets are signed like everywhere else: positive holds the end back from the datum, negative carries it past.
- New run anchor: `{ to: 'soffit', soffitId, offset }`. The run's side stops at the soffit's side.
- New settings: `defaultSoffitDepth: 14`, `defaultSoffitMolding: 'crown'`. Both are added to `V2_DEFAULTED_SETTING_KEYS`, so an older stored document picks them up.
- `selection` gains `soffitId`.
- `createWall` writes `soffits: []`, and `cloneRoom` copies it (including each soffit's anchors).

## §1 `model/soffits.js` (new)

```js
SOFFIT_MOLDINGS = ['crown', 'topMold', 'none']
soffitsOn(wallOrView, side = view.side ?? 'front') → soffits on that side
resolveSoffitSpan(room, view, soffit) → { x, width }
soffitMoldingDrop(molding, profile) → number          // crown: moldingStack(profile); topMold: profile.topMoldHeight; none: 0
soffitOverRun(wall, run) → soffit | null
profileUnderSoffit(profile, wall, run) → profile
runMolding(wall, run) → 'crown' | 'topMold' | 'none'
soffitConflicts(wall, run) → [{ code: 'soffit-conflict', soffitId }]
soffitAnchorDatum(view, anchor, side) → number | null
soffitEndType(wall, run, side, anchor, settings) → 'filler' | 'end_panel'
createSoffit({ x, width, bottomZ }, { settings, room, wall }) → Soffit
validateSoffitPlacement(view, soffit) → { ok, reason }
```

- **`resolveSoffitSpan`.** Each anchored end resolves to a datum:
  - `{ to: 'end' }`: left end → `offset`; right end → `length − offset`.
  - `{ to: 'wall' }`: the landed wall's interval on that side (`landingsOn`); left end → `b + offset`; right end → `a − offset`.
  - A missing wall counts as unanchored.

  Both ends anchored → `x = left`, `width = right − left`. One end anchored → keep `width`. Neither → the stored `x` / `width`.
- **`soffitOverRun`.** For an upper or tall, the lowest soffit on the run's side that contains the run's whole `x` range (1e-6 tolerance), otherwise `null`. Base runs never get one.
- **`profileUnderSoffit`.** Returns `{ ...profile, boxTop: soffit.bottom − soffitMoldingDrop(soffit.molding, profile) }` when there is a soffit over the run, and `profile` unchanged otherwise. `resolveVertical` already uses `boxTop` from the profile, and a run's own `overrides.boxTop` still wins.
- **`runMolding`.** The soffit's molding when there is one over the run, else `'crown'`.
- **`soffitConflicts`.** One entry per soffit on the run's side that overlaps the run's `x` range by more than 1e-6 while `run.z + run.height > soffit.bottom`. An auto run fully under a soffit is capped, so it never conflicts. A run straddling a soffit edge, or a manual-height run that's too tall, does.
- **`soffitAnchorDatum`.** Left side → `soffit.x + soffit.width + offset`; right side → `soffit.x − offset`; `null` if the soffit is gone.
- **`soffitEndType`.** `'filler'` when another run on the same side lies entirely under that soffit with its edge within `adjacentRunGap` of the soffit side the run meets; otherwise `'end_panel'`.
- **`createSoffit`.**
  - `x` and `x + width` round to ½"; `bottom = roundTo(bottomZ, 0.5)`.
  - An end within `cornerSnapDistance` of the wall end anchors `{ to: 'end', offset: 0 }`; one within `cornerSnapDistance` of a facing wing-wall face anchors `{ to: 'wall', wallId, offset: 0 }`.
  - `depth` and `molding` come from the settings, `wallSide` from the view (`'front'` if none), and `id` is a new uuid.
- **`validateSoffitPlacement`.** Refused with `'out-of-bounds'` unless `width > 0`, `depth > 0` and `0 < bottom < wall.height`. Refused with `'soffit-overlap'` if another soffit on the same side overlaps by more than 1e-6. Otherwise `{ ok: true, reason: null }`.

## §2 Resolution

- **`syncRoom`.** A new pass right after `computeWallOrder` resolves every soffit's `x` / `width` with `resolveSoffitSpan(nextRoom, wallSideView(wall, wallSideOf(soffit)), soffit)`. It comes before runs, since runs can anchor to soffits.
- **Vertical pass.** Passes `profileUnderSoffit(profile, wall, run)` instead of `profile`. `roomDiagnostics` passes the same to its `resolveVertical`, and adds `...soffitConflicts(wall, run)` to the warnings. `'soffit-conflict'` gets a label in `WARNING_LABELS`: "Runs into a soffit — anchor it to the soffit's side or split it."
- **`resolveRunAnchorDatum`.** For `{ to: 'soffit' }`, returns `{ x: soffitAnchorDatum(...), type: 'soffit', soffitId }`, or the error `anchor-soffit-missing`.
- **`describeAnchor`.** For `{ to: 'soffit' }`: `Against soffit · <relation>`, where the relation is `flush`, `<n> gap` or `<n> past` from the offset (the same wording as joints).
- **`createRun`.** For an upper or tall, after the wall-end and wing-face checks, an edge within `cornerSnapDistance` of a soffit side it would reach anchors to that soffit. It reaches when its top is above `soffit.bottom`, using the type default top in auto mode and `topZ` otherwise. The left edge meets the soffit's right side, the right edge its left side. The end type there comes from `soffitEndType`.
- **`stretchRun`.** Snap candidates gain each soffit's two sides. They anchor `{ to: 'soffit', soffitId, offset: 0 }` only when the run is an upper or tall whose top is above the soffit's bottom; otherwise they are plain snaps. When a soffit anchor is taken, the end type comes from `soffitEndType`.
- **`releaseWall`** (SPEC-18) also clears soffit end anchors `{ to: 'wall', wallId }`, which become `false`.

## §3 Store

- **`addSoffit({ wallId, soffit })`.** Resolve its span on its side view, validate the resolved soffit, and if it's OK push it and select it (`selection.soffitId`). If not, ignore it; the canvas validates first and shows the reason.
- **`updateSoffit({ wallId, soffitId, changes })`.** Takes `bottom`, `depth`, `molding`, `x` and `width`. It applies them only if the result validates.
- **`setSoffitAnchor({ wallId, soffitId, side, anchor })`.** The anchor is `false`, `{ to: 'end', offset }` or `{ to: 'wall', wallId, offset }`, where `offset` is `null` or finite (`null` is stored as 0).
- **`deleteSoffit({ wallId, soffitId })`.** Removes it, sets every run anchor `{ to: 'soffit', soffitId }` to `false`, and clears the selection if the soffit was selected.
- **`setSelection`.**
  - Priority is `openingId`, then `soffitId`, then `runId`.
  - With a `soffitId`, `activeWallSide` becomes that soffit's `wallSide`.
  - `clearTransientSelection` and the initial state include `soffitId: null`.
- **`setTool`** accepts `'soffit'`.
- **`setRunAnchor`** accepts `{ to: 'soffit', soffitId: string, offset: null | finite }`, with the end type from `soffitEndType`.

Persistence:
- `isWall` accepts `soffits` when absent or an array of valid soffits: `id`, `wallSide`, the numbers finite, `molding` in `SOFFIT_MOLDINGS`, anchors as §0.
- `isRunAnchor` accepts the soffit anchor.

## §4 UI

**Toolbar.** Elevation tools become `['select', 'draw', 'soffit', 'door', 'window']`, and the Soffit button is labelled "Soffit". While the soffit tool is active, a three-button control (Crown / Top mold / None) sits next to it, bound to `settings.defaultSoffitMolding` through `updateSettings`. That is the "decide as you draw" choice.

**Drawing.** The soffit tool reuses the run-draw gesture with `kind: 'soffit-draw'`.
- `handleMouseDown`, `handleMouseMove` and `handleMouseUp` accept either kind wherever they now test `'run-draw'`, and the two `tool !== 'draw'` cancels also allow `'soffit'`.
- On commit, `commitSoffitDraw(width)` builds bounds with `runDrawBounds` and calls `createSoffit`. It validates on the side view: if refused, `showMessage` shows "Soffits can't overlap" or "A soffit needs room below the ceiling"; otherwise it dispatches `addSoffit`.
- The live preview is the soffit's rectangle from the drag's bottom to the wall height, dashed, instead of the run preview.

**Rendering.** New `components/SoffitShapes.jsx` draws each soffit on the active side:
- a rect from `bottom` to the wall height, grey and hatched like the returns, with "Soffit" and its bottom height;
- selectable with the select tool (`setSelection({ soffitId })`), and outlined in blue when selected.

It renders in the listening layer before the runs. Delete / Backspace with a soffit selected dispatches `deleteSoffit`.

**`RunGroup`.** Draws top mold unless `runMolding` is `'none'`, and crown only when it is `'crown'`.

**Properties.** New `SoffitProperties` when `selection.soffitId` is set, with:
- Bottom, Depth, and Molding (a select);
- Left and Right end: a select of Free / Wall end / each wing-wall face on this side, plus an Offset box when anchored;
- a Delete button.

The run anchor select gains an optgroup "Soffit sides" with one option per soffit on this side (`soffit:<id>`). The panel switch shows `SoffitProperties` before the wall panel when a soffit is selected.

**Plan.** Each soffit is a dashed rectangle on its side: `x` to `x + width` along the side frame, and `0` to `depth` out from the face. It is not selectable.

**Settings.** `SettingsPanel` gains "Soffit depth".

## §5 Deferred

Soffits around corners, soffit dimension rows, plan selection of soffits, crown returns on soffit ends, and soffits on the back side of a wall at a connected end (SPEC-17 §7).

---

## §6 Tests

Numbering continues from SPEC-18 (last was 159). Model tests go in a new file **`src/elevation/model/__tests__/soffits.test.js`**.

### Helpers and fixtures

`upper(id, overrides)` is an auto-height upper:

```js
{ id, cabinetTypeId: CABINET_TYPE_IDS.UPPER, x: 0, width: 30, z: 54, height: 36, depth: 12,
  ends: { left: { type: 'end_panel', width: null }, right: { type: 'end_panel', width: null } },
  autoCount: false, maxCabinetWidth: null, items: [{ id: `${id}-cabinet`, kind: 'cabinet', width: null }],
  heightMode: 'auto', overrides: {}, anchors: { left: false, right: false }, wallSide: 'front', ...overrides }
```

`makeWall` is SPEC-18's with `height: 108` and `soffits: []`. `makeRoom` and `wallById` are unchanged, and `alcove()` is SPEC-18's ALC (with this `makeWall`).

```js
const SF = (overrides = {}) => ({ id: 'SF', wallSide: 'front', x: 40, width: 60, bottom: 84, depth: 14,
  molding: 'crown', anchors: { left: false, right: false }, ...overrides });
const soffitWall = (runs = [], soffit = SF()) => makeRoom([makeWall('S', 0, 0, 144, 0, { soffits: [soffit], runs })]);
const runById = (room, id) => wallById(room, 'S').runs.find((run) => run.id === id);
```

With the default profile, an auto upper sits at `z 54` (counter 36 + clearance 18), and its box top is 90 (crown top 96 − 6). Under SF (bottom 84), the box top is 78 with crown, 81 with top mold and 84 with none.

### Step 96: shape and helpers (`soffits.test.js`, `persistence.test.js`, `elevationSlice.test.js`)

160. `resolveSoffitSpan`:
     - `soffitWall([], SF({ anchors: { left: { to: 'end', offset: 20 }, right: { to: 'end', offset: 20 } } }))` gives `{ x: 20, width: 104 }`.
     - On `alcove()`'s H front, `SF({ anchors: { left: { to: 'wall', wallId: 'W1', offset: 0 }, right: { to: 'wall', wallId: 'W2', offset: 0 } } })` gives `{ x: 69, width: 120 }`.
     - The same with the left offset `-4.5` gives `{ x: 64.5, width: 124.5 }`.
161. `createSoffit({ x: 69.5, width: 119, bottomZ: 96.2 }, { settings, room: alcove(), wall: wallSideView(H, 'front') })` with `id` replaced by `'x'` equals `{ id: 'x', wallSide: 'front', x: 69.5, width: 119, bottom: 96, depth: 14, molding: 'crown', anchors: { left: { to: 'wall', wallId: 'W1', offset: 0 }, right: { to: 'wall', wallId: 'W2', offset: 0 } } }`.
162. Against `soffitWall()`'s wall:
     - `SF({ id: 'SG', x: 90, width: 20 })` → `{ ok: false, reason: 'soffit-overlap' }`;
     - `x: 100` → `{ ok: true, reason: null }`;
     - `x: 110, bottom: 108` → `{ ok: false, reason: 'out-of-bounds' }`;
     - `x: 90, wallSide: 'back'` → `{ ok: true, reason: null }`.
163. With the default profile, `['crown', 'topMold', 'none'].map((m) => soffitMoldingDrop(m, profile))` is `[6, 3, 0]`.
164. `persistence.test.js`:
     - `tbtDocument()` with `walls[0].soffits = [SF()]` (without the helper's wrapper) passes; with `molding: 'cove'` it fails.
     - A run anchor `{ to: 'soffit', soffitId: 'SF', offset: 0 }` passes.
     - A document whose `settings` lack `defaultSoffitDepth` loads with it set to 14.
165. `elevationSlice.test.js`: `addWallSegment({ x1: 0, y1: 0, x2: 96, y2: 0 })` creates a wall with `soffits: []`; `createInitialElevationState().selection.soffitId` is `null`.

### Step 97: resolution (`soffits.test.js`)

166. For `molding` `'crown'`, `'topMold'`, `'none'`: `syncRoom(soffitWall([upper('U1', { x: 40, width: 60 })], SF({ molding })))` gives U1 `z 54` and heights `24`, `27`, `30`, and `runMolding(S, U1)` returns that molding.
167. `soffitWall([upper('U1', { x: 40, width: 60 }), upper('U2', { x: 100, width: 30 }), upper('U3', { x: 90, width: 30, wallSide: 'back' }), upper('U4', { x: 10, width: 40 })])`:
     - Synced heights are `[24, 36, 36, 36]`.
     - In `roomDiagnostics`, U1, U2 and U3 have no `soffit-conflict`, and U4 has exactly `[{ code: 'soffit-conflict', soffitId: 'SF' }]`.
     - `soffitWall([upper('M1', { x: 50, width: 30, heightMode: 'manual' })])` gives M1 the same single conflict.
168. `soffitWall([upper('A1', { x: 105, anchors: { left: { to: 'soffit', soffitId: 'SF', offset: 0 }, right: false } }), upper('A2', { anchors: { left: false, right: { to: 'soffit', soffitId: 'SF', offset: 0.5 } } })])`, synced: A1 `x 100`, A2 `x 9.5`. A2's right description is `'Against soffit · 1/2" gap'`.
169. `createRun({ x: 100.5, width: 30, bottomZ: 54, topZ: 90 }, { settings, room, wall: wallSideView(S, 'front') })`:
     - On synced `soffitWall()`: anchors `{ left: { to: 'soffit', soffitId: 'SF', offset: 0 }, right: false }`, `ends.left` `{ type: 'end_panel', width: null }`.
     - On synced `soffitWall([upper('U1', { x: 40, width: 60 })])`: `ends.left` `{ type: 'filler', width: null }`.
170. `soffitWall([upper('B1', { x: 110, width: 30 })])`, synced. `stretchRun(room, 'S', 'B1', 'left', 101)` gives B1 `x 100 w 40`, `anchors.left` `{ to: 'soffit', soffitId: 'SF', offset: 0 }`, `ends.left` `{ type: 'end_panel', width: null }`.

### Step 98: store (`elevationSlice.test.js`)

`stateWithRun()`'s `wall-1` is `(0,0)→(144,0)`, height 96. `SF` below is the plain literal from the helpers.

171. `addSoffit({ wallId: 'wall-1', soffit: SF })`: `wall-1.soffits` has length 1 and `selection.soffitId` is `'SF'`.
     - `addSoffit` with `{ ...SF, id: 'SG', x: 90, width: 20 }` is ignored (still length 1).
     - `addSoffit` with `{ ...SF, id: 'SB', x: 0, width: 20, wallSide: 'back' }`, then `setSelection({ soffitId: 'SB' })`, gives `activeWallSide 'back'`.
172. From 171 with only SF:
     - `updateSoffit({ wallId: 'wall-1', soffitId: 'SF', changes: { bottom: 80 } })` → bottom `80`; `{ bottom: 96 }` is ignored.
     - `setSoffitAnchor({ wallId: 'wall-1', soffitId: 'SF', side: 'left', anchor: { to: 'end', offset: 20 } })` → SF `x 20 w 60`.
     - With `run-1` changed to an upper anchored `left: { to: 'soffit', soffitId: 'SF', offset: 0 }` and SF selected, `deleteSoffit({ wallId: 'wall-1', soffitId: 'SF' })` leaves `soffits: []`, `run-1.anchors.left === false` and `selection.soffitId === null`.
173. With SF added and `run-1` an upper (`cabinetTypeId: CABINET_TYPE_IDS.UPPER, z: 54, height: 36, x: 110, width: 30`): `setRunAnchor({ wallId: 'wall-1', runId: 'run-1', side: 'left', anchor: { to: 'soffit', soffitId: 'SF', offset: 0 } })` sets the anchor and `ends.left` `{ type: 'end_panel', width: null }`. `setTool('soffit')` sets `tool 'soffit'`.

Steps 99 and 100 are UI, checked by hand.
