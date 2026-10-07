# Elevation Lab — SPEC-37 (T-fillers, FILL-011)

Steps 250–259, after 36.3.3. Written against `db60a92` (step 249). Baseline **741**.

Every step below was built in a scratch copy of the repo, and its code is pasted here exactly as it passed there. After each step the full suite and ESLint passed; after the last, `vite build` did too. **Revised after that run (Kyle, 2026-09-30):** step 252 no longer breaks a vertical T at a horizontal one. One condition came out of the vertical seam grouping, and three of step 252's tests were updated to expect a single full-height vertical T. That revision hasn't been re-run, so if one of those three tests fails, check the expected values before changing the code. Line numbers in a diff are against the tree after the earlier steps of this round.

| Step | What | Tests after |
|---|---|---|
| **250** | Shape: the setting and the overrides (inert) | 748 |
| **251** | Model: T-fillers at seams and run ends | 757 |
| **252** | Model: horizontal T-fillers between stacked boxes | 763 |
| **253** | Model: reveals beside a T-filler | 768 |
| **254** | Model: notes, part numbers and badges | 775 |
| **255** | Model: T-fillers in plan | 780 |
| **256** | Model: T-fillers on the dimension chains | 785 |
| **257** | Model: what a box has on each side, and selecting a T | 791 |
| **258** | Screen: draw T-fillers in elevation, and select them | 791 |
| **259** | Screen: T-filler controls | 791 |

Next: **38** (to be decided).

## §1 How a T-filler works (Kyle, 2026-09-30)

A T-filler is **a part, and is drawn**. It covers the edges of two Euro cabinets (vertical, or horizontal between stacked boxes), or one edge plus the filler at a run end.

- **Flat.** It covers `teeCover` (3/4") of each box's front edge, so it is **1 1/2" between tight boxes**, wider by the gap between spaced ones, and at a run end **the visible width of the filler plus 3/4" over the box** (wider than 1 1/2" to make up the filler dimension).
- **Thickness.** A T is hardwood, **13/16" thick from the face of the cabinet box** it is applied to (`settings.teeThickness`), not from the door face. Where the cabinet beside or above a T has no face (an open cell, say) the T is what you see; elevation always draws it.
- **Return.** In plan the T has the same return as a normal filler: **3/4" thick** (`fillerReturnThickness`) and **2 1/2" deep** (`fillerReturnDepth`), running back from the flat into the box. Between boxes it is **centred** on the flat. At a run end it is **off-centre**: it starts where the box ends (the return sits against the filler side, 3/4" from the box-side edge of the flat), and the rest of the flat is the bigger side.
- **Dimensioned like a face frame.** The horizontal chain shows the T's width, and the box or face opening beside it.
- **Part.** It has its own part number (an end T keeps its filler's), is noted `T-shape` (FILL-004), and each box it covers gets the rabbet note `FF to rabbet {sides} for T-filler` (FILL-007), for horizontal Ts too.
- **Euro only.** On an inset or face frame cabinet a T is not supported (FILL-011).

### Where a T is on

| Setting | Effect |
|---|---|
| `run.tFiller = 'seams'` | a vertical T at every seam between Euro boxes, and at each end filler |
| `run.tFiller = 'all'` | the same, plus a horizontal T between stacked boxes |
| a cabinet's `tFiller.{left,right,top,bottom}` | true or false for that edge; beats the run. A seam asks the left box first (or the upper), then the right (or lower). |
| `run.endFiller[side].tFiller` | true or false for one end; beats the run |

A vertical seam is **one T for its whole length**, even where the cabinets on the two sides are different heights and their splits don't line up: two tall columns of four cabinets each have one T between them, not one per cabinet (Kyle, 2026-09-30). A horizontal T **butts into** the vertical T beside it, like a rail into a stile, whether or not the splits either side line up; it never breaks the vertical one. A horizontal flat runs across columns only where no vertical T is between them. A vertical T stops only where the seam itself stops (a box is missing or spaced too far) or a cabinet's own side turns it off.

### Derived, not stored

`teeFillers(room, run, cells, settings)` computes the Ts from the cells; it never changes the layout width. The solver doesn't know about them. The fillers a run end already has are the widths; a T only widens their drawn flat and dimensions. Face reveals beside a T follow REV-005/006 (13/16" for a pair, 27/32" for a single door).

### Worked examples (the tests)

- Two tight 24" boxes, `run.tFiller = 'seams'`: a 1 1/2" flat at x 23 1/4–24 3/4", the return 3/4" thick centred in it.
- A 1/2" gap: the flat is 2" wide.
- Two columns split at 30" on the left and 20" on the right, 60" tall: one T, 60" tall, between them. With `'all'` it is still one 60" T, and the horizontal Ts at 30" (left) and 20" (right) butt into it.
- Two columns both split at 30", `'all'`: one 60" vertical T; a horizontal T each side of it, 17 1/4" long.
- A horizontal T under an open cabinet (no faces): the T is what you see there; elevation draws it the same.
- Plan, a box face at 24": the flat runs from 24" to 24 13/16", its return from 21 1/2" to 24".
- A 3" filler at the left end: the T is 3 3/4" wide, its return starting at the box's edge.
- A pair of doors between T-fillers: 13/16" between each door and the next; a single door between two Ts: 27/32" each side.


---

## §2 Step 250 — Shape: the setting and the overrides (inert)

Adds `settings.teeCover` (3/4") and `settings.teeThickness` (13/16", the hardwood flat's thickness from the box face), `run.tFiller` (`'seams'` or `'all'`, absent = off), a per-side `tFiller` on cabinet leaves (`{left,right,top,bottom: true|false}`, absent = follow the run), and `run.endFiller[side].tFiller` (true, false, absent = follow the run). Persistence validates all of them, `cloneNode` copies them, `mirrorNode` swaps left and right when a wall is flipped, and three reducers write them. **Nothing reads them yet, so no behavior changes** (PROMPT-CONVENTIONS rule 4).

**Files:** `src/elevation/model/__tests__/grid.test.js`, `src/elevation/model/constants.js`, `src/elevation/model/grid.js`, `src/elevation/store/__tests__/elevationSlice.test.js`, `src/elevation/store/__tests__/persistence.test.js`, `src/elevation/store/elevationSlice.js`, `src/elevation/store/persistence.js`.

#### Source

### `src/elevation/model/constants.js`

```diff
@@ -41,6 +41,8 @@ export const DEFAULT_SETTINGS = {
   doorThickness: 0.8125,
   fillerReturnDepth: 2.5,
   fillerReturnThickness: 0.75,
+  teeCover: 0.75,
+  teeThickness: 0.8125,
   blindFillerWidth: 6,
   cornerFillerMinWidth: 1.5,
   cornerSnapDistance: 3,
```

### `src/elevation/model/grid.js`

```diff
@@ -76,18 +76,30 @@ function cloneTrack(track) {
 
 function cloneNode(node) {
   if (isNestedGrid(node)) return cloneGrid(node);
-  return node.blind ? { ...node, blind: { ...node.blind } } : { ...node };
+  return {
+    ...node,
+    ...(node.blind ? { blind: { ...node.blind } } : {}),
+    ...(node.tFiller ? { tFiller: { ...node.tFiller } } : {}),
+  };
 }
 
 function mirrorNode(node) {
   if (isNestedGrid(node)) return mirrorGrid(node);
-  if (!node.blind) return { ...node };
+  const copy = { ...node };
+  if (node.tFiller) {
+    const { left, right, ...rest } = node.tFiller;
+    copy.tFiller = {
+      ...rest,
+      ...(right !== undefined ? { left: right } : {}),
+      ...(left !== undefined ? { right: left } : {}),
+    };
+  }
+  if (!node.blind) return copy;
   const { left, right } = node.blind;
   const blind = {
     ...(right !== undefined ? { left: right } : {}),
     ...(left !== undefined ? { right: left } : {}),
   };
-  const copy = { ...node };
   if (Object.keys(blind).length) copy.blind = blind;
   else delete copy.blind;
   return copy;
```

### `src/elevation/store/elevationSlice.js`

```diff
@@ -1157,16 +1157,21 @@ const elevationSlice = createSlice({
       const location = runLocation(state, action.payload);
       const { side, key, value } = action.payload;
       if (!location || (side !== 'left' && side !== 'right')) return;
-      if (key !== 'width' && key !== 'returnDepth') return;
+      if (key !== 'width' && key !== 'returnDepth' && key !== 'tFiller') return;
       const run = location.run;
       run.endFiller = { left: null, right: null, ...(run.endFiller ?? {}) };
       const current = run.endFiller[side] ?? { width: null, returnDepth: null };
       const minimum = key === 'width' ? 0 : -1;
-      const next = {
-        ...current,
-        [key]: Number.isFinite(value) && value > minimum ? value : null,
-      };
-      run.endFiller[side] = next.width === null && next.returnDepth === null ? null : next;
+      const next = { ...current };
+      if (key === 'tFiller') {
+        if (typeof value === 'boolean') next.tFiller = value;
+        else delete next.tFiller;
+      } else {
+        next[key] = Number.isFinite(value) && value > minimum ? value : null;
+      }
+      run.endFiller[side] = next.width === null && next.returnDepth === null && next.tFiller === undefined
+        ? null
+        : next;
     },
     setAutoCount(state, action) {
       const location = runLocation(state, action.payload);
@@ -1196,6 +1201,31 @@ const elevationSlice = createSlice({
       }
       syncRoomAt(state, location.roomIndex);
     },
+    setRunTFiller(state, action) {
+      const location = runLocation(state, action.payload);
+      if (!location) return;
+      const { value = null } = action.payload;
+      if (value !== null && value !== 'seams' && value !== 'all') return;
+      if (value === null) delete location.run.tFiller;
+      else location.run.tFiller = value;
+    },
+    setItemTFiller(state, action) {
+      const location = runLocation(state, action.payload);
+      if (!location) return;
+      const leaves = new Map(gridLeaves(location.run.grid)
+        .filter((leaf) => leaf.kind === 'cabinet')
+        .map((leaf) => [leaf.id, leaf]));
+      for (const { itemId, side, value } of action.payload.edits ?? []) {
+        const leaf = leaves.get(itemId);
+        if (!leaf || !['left', 'right', 'top', 'bottom'].includes(side)) continue;
+        if (value !== true && value !== false && value !== null) continue;
+        const next = { ...(leaf.tFiller ?? {}) };
+        if (value === null) delete next[side];
+        else next[side] = value;
+        if (Object.keys(next).length === 0) delete leaf.tFiller;
+        else leaf.tFiller = next;
+      }
+    },
     setItemWidth(state, action) {
       const location = runLocation(state, action.payload);
       if (!location) return;
@@ -1723,6 +1753,8 @@ export const {
   setAutoCount,
   setMaxCabinetWidth,
   setRunSeamGap,
+  setRunTFiller,
+  setItemTFiller,
   setItemWidth,
   setItemPin,
   setItemAbsorb,
```

### `src/elevation/store/persistence.js`

```diff
@@ -63,6 +63,8 @@ const V2_NUMERIC_SETTING_KEYS = Object.keys(DEFAULT_SETTINGS).filter(
 const V2_DEFAULTED_SETTING_KEYS = [
   'fillerReturnDepth',
   'fillerReturnThickness',
+  'teeCover',
+  'teeThickness',
   'blindFillerWidth',
   'defaultSoffitDepth',
   'defaultSoffitMolding',
@@ -121,6 +123,15 @@ function isItemPin(pin) {
     && isFiniteNumber(pin.value);
 }
 
+const T_FILLER_SIDES = ['left', 'right', 'top', 'bottom'];
+
+/** A cabinet's own T-filler choice per side (SPEC-37): true covers, false doesn't, absent inherits. */
+function isTFillerSides(value) {
+  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
+    && Object.keys(value).length > 0
+    && Object.entries(value).every(([key, entry]) => T_FILLER_SIDES.includes(key) && typeof entry === 'boolean');
+}
+
 function isItem(item) {
   return Boolean(item)
     && typeof item.id === 'string'
@@ -135,7 +146,8 @@ function isItem(item) {
     && (item.style === undefined || item.style === null
       || (item.kind === 'cabinet' && isStyle(item.style)))
     && (item.reveals === undefined || item.reveals === null
-      || (item.kind === 'cabinet' && isOptionalNumericObject(item.reveals, REVEAL_KEYS)));
+      || (item.kind === 'cabinet' && isOptionalNumericObject(item.reveals, REVEAL_KEYS)))
+    && (item.tFiller === undefined || (item.kind === 'cabinet' && isTFillerSides(item.tFiller)));
 }
 
 function isOptionalNumericObject(value, allowedKeys) {
@@ -178,6 +190,7 @@ function isRunAnchor(anchor) {
   ));
 }
 
+const T_FILLER_RUN_VALUES = ['seams', 'all'];
 const END_FILLER_MINIMUMS = { width: 0, returnDepth: -1 };
 
 function isEndFillerSide(side) {
@@ -190,6 +203,7 @@ function isEndFillerSide(side) {
       || side[key] === null
       || (isFiniteNumber(side[key]) && side[key] > END_FILLER_MINIMUMS[key])
     ))
+    && (side.tFiller === undefined || side.tFiller === null || typeof side.tFiller === 'boolean')
   );
 }
 
@@ -237,6 +251,7 @@ function isRun(run) {
     && isRunStack(run.stack)
     && (run.outset === undefined || (isFiniteNumber(run.outset) && run.outset >= 0))
     && (run.seamGap === undefined || (isFiniteNumber(run.seamGap) && run.seamGap >= 0))
+    && (run.tFiller === undefined || T_FILLER_RUN_VALUES.includes(run.tFiller))
     && isEndFiller(run.endFiller)
     && run.items === undefined
     && run.blind === undefined
```

#### Tests

### `src/elevation/model/__tests__/grid.test.js`

```diff
@@ -282,3 +282,27 @@ describe('grid shape', () => {
     }, isLeaf)).toBe(true);
   });
 });
+
+describe('SPEC-37 T-filler overrides in a grid', () => {
+  const grid = gridFromItems('r', [
+    { id: 'a', kind: 'cabinet', width: null, tFiller: { left: true, top: false } },
+    { id: 'b', kind: 'cabinet', width: null },
+  ]);
+
+  it('keeps the overrides through the item helpers', () => {
+    expect(rootItems(grid)[0].tFiller).toEqual({ left: true, top: false });
+    expect(replaceRootItems(grid, rootItems(grid))).toEqual(grid);
+    expect(updateRootItem(grid, 'b', { tFiller: { right: true } }).cells[1].node.tFiller).toEqual({ right: true });
+  });
+
+  it('mirrors left and right, leaves top and bottom, and copies on clone', () => {
+    const mirrored = mirrorGrid(grid);
+    expect(mirrored.cells.map((cell) => [cell.node.id, cell.node.tFiller])).toEqual([
+      ['a', { right: true, top: false }],
+      ['b', undefined],
+    ]);
+    const copy = cloneGrid(grid);
+    expect(copy.cells[0].node.tFiller).toEqual({ left: true, top: false });
+    expect(copy.cells[0].node.tFiller).not.toBe(grid.cells[0].node.tFiller);
+  });
+});
```

### `src/elevation/store/__tests__/elevationSlice.test.js`

```diff
@@ -64,6 +64,8 @@ import elevationReducer, {
   setRunFaceOptions,
   setRunBottom,
   setRunSeamGap,
+  setRunTFiller,
+  setItemTFiller,
   setRunStyle,
   setActiveWall,
   setActiveWallSide,
@@ -2470,3 +2472,63 @@ describe('SPEC-36.2.1 wall end panel selection', () => {
     expect('endPanel' in state.selection).toBe(false);
   });
 });
+
+describe('SPEC-37 T-filler shape actions', () => {
+  const setup = () => {
+    const state = stateWithRun(run({ items: [auto('a'), auto('b')] }));
+    return { state, base: { roomId: state.rooms[0].id, wallId: 'wall-1', runId: 'run-1' } };
+  };
+  const currentRun = (state) => state.rooms[0].walls[0].runs[0];
+  const leaf = (state, id) => gridLeaves(currentRun(state).grid).find((candidate) => candidate.id === id);
+
+  it('sets and clears the run setting, and rejects other values', () => {
+    let { state, base } = setup();
+    state = elevationReducer(state, setRunTFiller({ ...base, value: 'seams' }));
+    expect(currentRun(state).tFiller).toBe('seams');
+    state = elevationReducer(state, setRunTFiller({ ...base, value: 'all' }));
+    expect(currentRun(state).tFiller).toBe('all');
+    state = elevationReducer(state, setRunTFiller({ ...base, value: 'vertical' }));
+    expect(currentRun(state).tFiller).toBe('all');
+    state = elevationReducer(state, setRunTFiller({ ...base, value: null }));
+    expect('tFiller' in currentRun(state)).toBe(false);
+  });
+
+  it('sets, clears and ignores per-side overrides on cabinets', () => {
+    let { state, base } = setup();
+    state = elevationReducer(state, setItemTFiller({
+      ...base,
+      edits: [
+        { itemId: 'a', side: 'right', value: true },
+        { itemId: 'b', side: 'left', value: true },
+        { itemId: 'b', side: 'top', value: false },
+      ],
+    }));
+    expect(leaf(state, 'a').tFiller).toEqual({ right: true });
+    expect(leaf(state, 'b').tFiller).toEqual({ left: true, top: false });
+    state = elevationReducer(state, setItemTFiller({
+      ...base,
+      edits: [
+        { itemId: 'a', side: 'right', value: null },
+        { itemId: 'b', side: 'top', value: null },
+        { itemId: 'b', side: 'middle', value: true },
+        { itemId: 'b', side: 'bottom', value: 'yes' },
+        { itemId: 'zz', side: 'left', value: true },
+      ],
+    }));
+    expect('tFiller' in leaf(state, 'a')).toBe(false);
+    expect(leaf(state, 'b').tFiller).toEqual({ left: true });
+  });
+
+  it('sets and clears an end filler\'s T-filler choice beside its other details', () => {
+    let { state, base } = setup();
+    state = elevationReducer(state, setRunEndFiller({ ...base, side: 'left', key: 'tFiller', value: true }));
+    expect(currentRun(state).endFiller.left).toEqual({ width: null, returnDepth: null, tFiller: true });
+    state = elevationReducer(state, setRunEndFiller({ ...base, side: 'left', key: 'width', value: 3 }));
+    expect(currentRun(state).endFiller.left).toEqual({ width: 3, returnDepth: null, tFiller: true });
+    state = elevationReducer(state, setRunEndFiller({ ...base, side: 'left', key: 'tFiller', value: false }));
+    expect(currentRun(state).endFiller.left.tFiller).toBe(false);
+    state = elevationReducer(state, setRunEndFiller({ ...base, side: 'left', key: 'tFiller', value: null }));
+    state = elevationReducer(state, setRunEndFiller({ ...base, side: 'left', key: 'width', value: null }));
+    expect(currentRun(state).endFiller).toEqual({ left: null, right: null });
+  });
+});
```

### `src/elevation/store/__tests__/persistence.test.js`

```diff
@@ -1091,3 +1091,49 @@ describe('SPEC-36.2 wall end panel frame join', () => {
     expect(isElevationDocument(withFrame('lap'))).toBe(false);
   });
 });
+
+describe('SPEC-37 T-filler persistence', () => {
+  const firstRun = (document) => document.rooms[0].walls[0].runs[0];
+
+  it('defaults the cover and thickness and validates the run setting', () => {
+    expect(DEFAULT_SETTINGS.teeCover).toBe(0.75);
+    expect(DEFAULT_SETTINGS.teeThickness).toBe(0.8125);
+    const older = tbtDocument();
+    delete older.settings.teeCover;
+    delete older.settings.teeThickness;
+    const normalized = normalizeElevationDocument(older);
+    expect(normalized.settings.teeCover).toBe(0.75);
+    expect(normalized.settings.teeThickness).toBe(0.8125);
+    expect(isElevationDocument(normalized)).toBe(true);
+
+    for (const value of ['seams', 'all']) {
+      const valid = tbtDocument();
+      firstRun(valid).tFiller = value;
+      expect(isElevationDocument(valid)).toBe(true);
+    }
+    for (const value of ['vertical', true, null]) {
+      const invalid = tbtDocument();
+      firstRun(invalid).tFiller = value;
+      expect(isElevationDocument(invalid)).toBe(false);
+    }
+  });
+
+  it('validates a cabinet\'s sides and an end filler\'s flag', () => {
+    for (const tFiller of [{ left: true }, { left: true, top: false }, { bottom: false }]) {
+      const valid = tbtDocument();
+      firstRun(valid).grid.cells[0].node.tFiller = tFiller;
+      expect(isElevationDocument(valid)).toBe(true);
+    }
+    for (const tFiller of [{}, { middle: true }, { left: 'yes' }, { left: null }, true]) {
+      const invalid = tbtDocument();
+      firstRun(invalid).grid.cells[0].node.tFiller = tFiller;
+      expect(isElevationDocument(invalid)).toBe(false);
+    }
+
+    const flagged = tbtDocument();
+    firstRun(flagged).endFiller = { left: { tFiller: true }, right: { width: 3, tFiller: false } };
+    expect(isElevationDocument(flagged)).toBe(true);
+    firstRun(flagged).endFiller = { left: { tFiller: 'yes' } };
+    expect(isElevationDocument(flagged)).toBe(false);
+  });
+});
```

**Count:** 741 + 7 = **748**.

**Done when:** `npm test` (748) and `npm run lint` clean.

---

## §3 Step 251 — Model: T-fillers at seams and run ends

New `model/tees.js` exports `teeFillers(room, run, cells, settings)` → `{ tees, covers }`, derived from the cells and never stored. It finds vertical seams between Euro boxes (gap within `gapReach`), makes each seam line **one T for its whole length even where the cabinets on the two sides are different heights and the splits don't line up** (Kyle), and, at a run end whose type is `filler`, stands in for the filler: its visible width plus `teeCover` over the box. `covers` is a Map from box id to the inches covered on each side, which steps 253–256 use. A T exists only where `run.tFiller`, a cabinet's own side, or the end filler's own choice asks for it, and only between Euro boxes.

**Files:** `src/elevation/model/__tests__/tees.test.js` (new), `src/elevation/model/index.js`, `src/elevation/model/tees.js` (new).

#### Source

### `src/elevation/model/index.js`

```diff
@@ -364,3 +364,4 @@ export {
   isExtendTarget,
 } from './extensions.js';
 export { boxInsets, faceOpenings, frameBadgeAnchor, frameEdgeTracks, frameMembers, frameRegions, frameVerticalChains, groupMembers, regionOpenings, sideOf } from './frames.js';
+export { teeFillers } from './tees.js';
```

### NEW `src/elevation/model/tees.js`

```js
import { gapReach } from './cells.js';
import { findLeaf } from './cellTree.js';
import { runItems } from './grid.js';
import { endPieceBottom, isInsetStyle, resolveStyle } from './styles.js';

const EPSILON = 1e-6;

function near(a, b) {
  return Math.abs(a - b) <= EPSILON;
}

function overlap(start, end, otherStart, otherEnd) {
  return Math.min(end, otherEnd) - Math.max(start, otherStart);
}

function leafOf(run, piece) {
  return piece.columnId
    ? findLeaf(run.grid, piece.id)
    : runItems(run).find((item) => item.id === piece.id);
}

/** Every side of a box a T-filler covers: { left, right, top, bottom }, in inches. */
function noCovers() {
  return { left: 0, right: 0, top: 0, bottom: 0 };
}

/**
 * The T-fillers of a run (SPEC-37, FILL-011), derived and never stored. A T covers the front edges
 * of the two Euro boxes either side of a seam, `settings.teeCover` (3/4") of each, so its flat is
 * 1 1/2" between tight boxes and wider by the gap between spaced ones. At a run end it stands in for
 * a filler: the flat is the filler's visible width plus the cover over the box. Each is
 * `{ id, orientation: 'vertical' | 'horizontal', end: 'left' | 'right' | null, pieceId, x, z, width,
 * height, drop, boxIds, ret: { start, end } }`: the flat in wall coordinates, how far the flat drops
 * below the box (the fillers' own drop), and where the return sits along the flat's width, which is
 * centred between boxes and 3/4" off the box side at an end.
 *
 * @returns {{tees: object[], covers: Map<string, {left: number, right: number, top: number, bottom: number}>}}
 */
export function teeFillers(room, run, cells, settings) {
  const tees = [];
  const covers = new Map();
  const cover = settings.teeCover;
  const returnThickness = settings.fillerReturnThickness;
  const runStyle = resolveStyle(settings, room, run);
  if (isInsetStyle(runStyle)) return { tees, covers };
  const { drop } = endPieceBottom(run, runStyle, settings);
  const reach = gapReach(cells.gaps ?? []);
  const boxes = cells.pieces.filter((piece) => piece.kind === 'cabinet' && piece.role === 'item')
    .filter((piece) => !isInsetStyle(resolveStyle(settings, room, run, leafOf(run, piece))));
  const addCover = (id, side, amount) => {
    const current = covers.get(id) ?? noCovers();
    covers.set(id, { ...current, [side]: Math.max(current[side], amount) });
  };
  const dropped = (z, height) => (near(z, run.z) && drop > 0
    ? { z: z - drop, height: height + drop, drop }
    : { z, height, drop: 0 });

  // Seams between two boxes side by side.
  const contacts = [];
  for (const a of boxes) {
    for (const b of boxes) {
      const gap = b.x - a.x - a.width;
      const low = Math.max(a.z, b.z);
      const high = Math.min(a.z + a.height, b.z + b.height);
      if (a === b || gap < -EPSILON || gap > reach + EPSILON || high - low <= EPSILON) continue;
      const on = leafOf(run, a)?.tFiller?.right ?? leafOf(run, b)?.tFiller?.left ?? Boolean(run.tFiller);
      if (on) contacts.push({ a, b, gap: Math.max(0, gap), low, high });
    }
  }
  const lines = new Map();
  for (const contact of contacts) {
    const key = `${Math.round((contact.a.x + contact.a.width) * 1e4)}:${Math.round(contact.b.x * 1e4)}`;
    lines.set(key, [...(lines.get(key) ?? []), contact]);
  }
  for (const line of lines.values()) {
    line.sort((p, q) => p.low - q.low);
    const runs = [];
    for (const contact of line) {
      const last = runs[runs.length - 1];
      const before = last?.[last.length - 1];
      const continues = before
        && contact.low - before.high >= -EPSILON && contact.low - before.high <= reach + EPSILON;
      if (continues) last.push(contact);
      else runs.push([contact]);
    }
    for (const joined of runs) {
      const first = joined[0];
      const x = first.a.x + first.a.width - cover;
      const flat = dropped(first.low, Math.max(...joined.map((contact) => contact.high)) - first.low);
      const width = first.gap + 2 * cover;
      const start = x + (width - returnThickness) / 2;
      tees.push({
        id: `tee:${first.a.id}|${first.b.id}`,
        orientation: 'vertical',
        end: null,
        pieceId: null,
        x,
        z: flat.z,
        width,
        height: flat.height,
        drop: flat.drop,
        boxIds: [...new Set(joined.flatMap((contact) => [contact.a.id, contact.b.id]))],
        ret: { start, end: start + returnThickness },
      });
      for (const contact of joined) {
        addCover(contact.a.id, 'right', cover);
        addCover(contact.b.id, 'left', cover);
      }
    }
  }

  // A filler at either end of the run.
  for (const side of ['left', 'right']) {
    const piece = cells.pieces.find((candidate) => candidate.role === `end-${side}` && candidate.kind === 'filler');
    if (!piece || run.ends[side].type !== 'filler') continue;
    if (!(run.endFiller?.[side]?.tFiller ?? Boolean(run.tFiller))) continue;
    const edge = side === 'left' ? piece.x + piece.width : piece.x;
    const beside = boxes.filter((box) => near(side === 'left' ? box.x : box.x + box.width, edge)
      && overlap(box.z, box.z + box.height, piece.z, piece.z + piece.height) > EPSILON);
    if (beside.length === 0) continue;
    const flat = dropped(piece.z, piece.height);
    const thickness = Math.min(returnThickness, piece.width);
    tees.push({
      id: piece.id,
      orientation: 'vertical',
      end: side,
      pieceId: piece.id,
      x: side === 'left' ? piece.x : piece.x - cover,
      z: flat.z,
      width: piece.width + cover,
      height: flat.height,
      drop: flat.drop,
      boxIds: beside.map((box) => box.id),
      ret: side === 'left' ? { start: edge - thickness, end: edge } : { start: edge, end: edge + thickness },
    });
    for (const box of beside) addCover(box.id, side, cover);
  }

  tees.sort((p, q) => p.x - q.x || p.z - q.z);
  return { tees, covers };
}
```

#### Tests

### NEW `src/elevation/model/__tests__/tees.test.js`

```js
import { describe, expect, it } from 'vitest';
import { cellPieces } from '../cells.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { layoutRun } from '../faceLayouts.js';
import { gridFromItems } from '../grid.js';
import { resolveWall } from '../room.js';
import { teeFillers } from '../tees.js';

const S = DEFAULT_SETTINGS;
const NONE = { type: 'none', width: null };
const cell = (col, row, node) => ({ col, row, colSpan: 1, rowSpan: 1, node });
const cab = (id, width = null, extra = {}) => ({ id, kind: 'cabinet', width, ...extra });

function roomWith(run, style) {
  const wall = {
    id: 'wall-1', name: 'Wall 1', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5,
    flipped: false, connections: { start: null, end: null }, profile: {}, runs: [run], openings: [],
  };
  return {
    id: 'room-1', name: 'Room 1', profile: { ...S.defaultProfile }, walls: [wall], wallOrder: ['wall-1'],
    ...(style ? { style } : {}),
  };
}

const baseRun = (overrides = {}) => ({
  id: 'r', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 24, width: 36, z: 4, height: 30.5, depth: 24,
  ends: { left: NONE, right: NONE }, autoCount: false, maxCabinetWidth: null,
  heightMode: 'manual', overrides: {}, anchors: { left: false, right: false },
  tFiller: 'seams',
  grid: gridFromItems('r', [cab('a', 18), cab('b', 18)]),
  ...overrides,
});

function teesOf(run, style) {
  const room = roomWith(run, style);
  const wall = resolveWall(room, room.walls[0]);
  const layout = layoutRun(room, wall, run, S);
  return teeFillers(room, run, cellPieces(run, layout), S);
}

/** Two columns, each split into stacked cells: sizes are the top cell's height (null = the rest). */
function stackedRun(left, right, overrides = {}) {
  const column = (id, top, extra) => ({
    id,
    cols: [{ id: `${id}:c`, size: null, sizeMode: 'auto' }],
    rows: [
      { id: `${id}:t`, size: top, sizeMode: top === null ? 'auto' : 'manual' },
      { id: `${id}:u`, size: null, sizeMode: 'auto' },
    ],
    cells: [cell(0, 0, cab(`${id}1`, null, extra)), cell(0, 1, cab(`${id}2`))],
  });
  return baseRun({
    z: 0, height: 60,
    grid: {
      id: 'r:grid',
      cols: [{ id: 'a:col', size: 18, sizeMode: 'manual' }, { id: 'b:col', size: 18, sizeMode: 'manual' }],
      rows: [{ id: 'r:row', size: null, sizeMode: 'auto' }],
      cells: [cell(0, 0, column('a', left)), cell(1, 0, column('b', right))],
    },
    ...overrides,
  });
}

describe('SPEC-37 T-fillers at seams', () => {
  it('covers a tight seam with a 1 1/2" flat, the return centred', () => {
    const { tees, covers } = teesOf(baseRun());
    expect(tees).toEqual([{
      id: 'tee:a|b', orientation: 'vertical', end: null, pieceId: null,
      x: 41.25, z: 4, width: 1.5, height: 30.5, drop: 0, boxIds: ['a', 'b'],
      ret: { start: 41.625, end: 42.375 },
    }]);
    expect(covers.get('a')).toEqual({ left: 0, right: 0.75, top: 0, bottom: 0 });
    expect(covers.get('b')).toEqual({ left: 0.75, right: 0, top: 0, bottom: 0 });
  });

  it('widens the flat by the gap between spaced boxes', () => {
    const { tees } = teesOf(baseRun({ seamGap: 0.5, _seamGap: 0.5 }));
    expect(tees).toHaveLength(1);
    expect(tees[0]).toMatchObject({ x: 41.25, width: 2, ret: { start: 41.875, end: 42.625 } });
  });

  it('needs the run setting or a cabinet\'s own side, and only on Euro', () => {
    expect(teesOf(baseRun({ tFiller: undefined })).tees).toEqual([]);
    const own = baseRun({
      tFiller: undefined,
      grid: gridFromItems('r', [cab('a', 18, { tFiller: { right: true } }), cab('b', 18)]),
    });
    expect(teesOf(own).tees.map((tee) => tee.id)).toEqual(['tee:a|b']);
    const off = baseRun({
      grid: gridFromItems('r', [cab('a', 18), cab('b', 18, { tFiller: { left: false } })]),
    });
    expect(teesOf(off).tees).toEqual([]);
    const first = baseRun({
      grid: gridFromItems('r', [cab('a', 18, { tFiller: { right: true } }), cab('b', 18, { tFiller: { left: false } })]),
    });
    expect(teesOf(first).tees).toHaveLength(1);
    expect(teesOf(baseRun(), { cabinetStyleId: 14 }).tees).toEqual([]);
    expect(teesOf(baseRun({ style: { cabinetStyleId: 15 } })).tees).toEqual([]);
  });

  it('runs the full length of a seam where the splits line up', () => {
    const { tees, covers } = teesOf(stackedRun(30, 30));
    expect(tees).toEqual([{
      id: 'tee:a2|b2', orientation: 'vertical', end: null, pieceId: null,
      x: 41.25, z: 0, width: 1.5, height: 60, drop: 0, boxIds: ['a2', 'b2', 'a1', 'b1'],
      ret: { start: 41.625, end: 42.375 },
    }]);
    expect(covers.get('a1').right).toBe(0.75);
    expect(covers.get('b2').left).toBe(0.75);
  });

  it('is one T for the whole seam where the splits don\'t line up', () => {
    // Two tall columns of different-height cabinets still have one T between them.
    const { tees, covers } = teesOf(stackedRun(30, 20));
    expect(tees.map((tee) => [tee.id, tee.z, tee.height])).toEqual([['tee:a2|b2', 0, 60]]);
    expect([...tees[0].boxIds].sort()).toEqual(['a1', 'a2', 'b1', 'b2']);
    expect(covers.get('a1').right).toBe(0.75);
    expect(covers.get('b1').left).toBe(0.75);
  });

  it('drops with the run on an upper whose doors overhang', () => {
    const upper = baseRun({ cabinetTypeId: CABINET_TYPE_IDS.UPPER, z: 54, height: 30, depth: 12 });
    expect(teesOf(upper).tees[0]).toMatchObject({ z: 53.875, height: 30.125, drop: 0.125 });
  });
});

describe('SPEC-37 T-fillers at run ends', () => {
  const endRun = (overrides = {}) => baseRun({
    width: 42,
    ends: { left: { type: 'filler', width: 3 }, right: { type: 'filler', width: 3 } },
    ...overrides,
  });

  it('stands in for a filler: its visible width plus the cover, the return off-centre', () => {
    const { tees, covers } = teesOf(endRun());
    expect(tees.map((tee) => [tee.id, tee.end, tee.x, tee.width, tee.ret])).toEqual([
      ['r:left', 'left', 24, 3.75, { start: 26.25, end: 27 }],
      ['tee:a|b', null, 44.25, 1.5, { start: 44.625, end: 45.375 }],
      ['r:right', 'right', 62.25, 3.75, { start: 63, end: 63.75 }],
    ]);
    expect(tees[0]).toMatchObject({ pieceId: 'r:left', z: 4, height: 30.5, boxIds: ['a'] });
    expect(covers.get('a')).toEqual({ left: 0.75, right: 0.75, top: 0, bottom: 0 });
    expect(covers.get('b')).toEqual({ left: 0.75, right: 0.75, top: 0, bottom: 0 });
  });

  it('takes its own choice over the run setting, and skips blind ends and other end types', () => {
    const only = endRun({ tFiller: undefined, endFiller: { left: { tFiller: true }, right: null } });
    expect(teesOf(only).tees.map((tee) => tee.id)).toEqual(['r:left']);
    const off = endRun({ endFiller: { left: { tFiller: false }, right: null } });
    expect(teesOf(off).tees.map((tee) => tee.id)).toEqual(['tee:a|b', 'r:right']);
    const panel = endRun({ ends: { left: { type: 'end_panel', width: null }, right: NONE }, width: 36.75 });
    expect(teesOf(panel).tees.map((tee) => tee.id)).toEqual(['tee:a|b']);
  });

  it('covers every box along the filler when a column is split', () => {
    const run = stackedRun(30, 30, {
      width: 39,
      ends: { left: { type: 'filler', width: 3 }, right: NONE },
      grid: {
        id: 'r:grid',
        cols: [{ id: 'a:col', size: 18, sizeMode: 'manual' }, { id: 'b:col', size: 18, sizeMode: 'manual' }],
        rows: [{ id: 'r:row', size: null, sizeMode: 'auto' }],
        cells: [
          cell(0, 0, {
            id: 'a',
            cols: [{ id: 'a:c', size: null, sizeMode: 'auto' }],
            rows: [{ id: 'a:t', size: 30, sizeMode: 'manual' }, { id: 'a:u', size: null, sizeMode: 'auto' }],
            cells: [cell(0, 0, cab('a1')), cell(0, 1, cab('a2'))],
          }),
          cell(1, 0, cab('b')),
        ],
      },
    });
    const { tees } = teesOf(run);
    const left = tees.find((tee) => tee.end === 'left');
    expect(left).toMatchObject({ z: 0, height: 60 });
    expect(left.boxIds.sort()).toEqual(['a1', 'a2']);
  });
});
```

**Count:** 748 + 9 = **757**.

**Done when:** `npm test` (757) and `npm run lint` clean.

---

## §4 Step 252 — Model: horizontal T-fillers between stacked boxes

Extends `tees.js` with horizontal Ts between boxes stacked in a column. A horizontal T exists on `run.tFiller === 'all'` or from a cabinet's own top/bottom. It **butts into** the vertical T beside it (stops at that T's cover) and never breaks it: the vertical T from step 251 stays one piece for the whole seam, whether or not the splits either side line up (Kyle: "1 T-filler between the 4 cabinets"). One flat runs across columns when no vertical T meets it.

**Files:** `src/elevation/model/__tests__/tees.test.js`, `src/elevation/model/tees.js`.

#### Source

### `src/elevation/model/tees.js`

```diff
@@ -27,8 +27,10 @@ function noCovers() {
 /**
  * The T-fillers of a run (SPEC-37, FILL-011), derived and never stored. A T covers the front edges
  * of the two Euro boxes either side of a seam, `settings.teeCover` (3/4") of each, so its flat is
- * 1 1/2" between tight boxes and wider by the gap between spaced ones. At a run end it stands in for
- * a filler: the flat is the filler's visible width plus the cover over the box. Each is
+ * 1 1/2" between tight boxes and wider by the gap between spaced ones. A vertical T runs the whole
+ * length of its seam, however the boxes either side are split; a horizontal T between boxes one
+ * above the other butts into it and never breaks it. At a run end a T stands in for a
+ * filler: the flat is the filler's visible width plus the cover over the box. Each is
  * `{ id, orientation: 'vertical' | 'horizontal', end: 'left' | 'right' | null, pieceId, x, z, width,
  * height, drop, boxIds, ret: { start, end } }`: the flat in wall coordinates, how far the flat drops
  * below the box (the fillers' own drop), and where the return sits along the flat's width, which is
@@ -55,6 +57,12 @@ export function teeFillers(room, run, cells, settings) {
     ? { z: z - drop, height: height + drop, drop }
     : { z, height, drop: 0 });
 
+  const leaf = (piece) => leafOf(run, piece);
+  // A seam's own choice comes from the box left of it (or above it), then the one right (or below).
+  const verticalOn = (a, b) => leaf(a)?.tFiller?.right ?? leaf(b)?.tFiller?.left ?? Boolean(run.tFiller);
+  const horizontalOn = (upper, lower) => leaf(upper)?.tFiller?.bottom
+    ?? leaf(lower)?.tFiller?.top ?? run.tFiller === 'all';
+
   // Seams between two boxes side by side.
   const contacts = [];
   for (const a of boxes) {
@@ -63,8 +71,7 @@ export function teeFillers(room, run, cells, settings) {
       const low = Math.max(a.z, b.z);
       const high = Math.min(a.z + a.height, b.z + b.height);
       if (a === b || gap < -EPSILON || gap > reach + EPSILON || high - low <= EPSILON) continue;
-      const on = leafOf(run, a)?.tFiller?.right ?? leafOf(run, b)?.tFiller?.left ?? Boolean(run.tFiller);
-      if (on) contacts.push({ a, b, gap: Math.max(0, gap), low, high });
+      if (verticalOn(a, b)) contacts.push({ a, b, gap: Math.max(0, gap), low, high });
     }
   }
   const lines = new Map();
@@ -136,6 +143,66 @@ export function teeFillers(room, run, cells, settings) {
     for (const box of beside) addCover(box.id, side, cover);
   }
 
+  // Seams between two boxes one above the other. A flat stops at the T it meets (the cover).
+  const covered = (piece, side) => covers.get(piece.id)?.[side] ?? 0;
+  const stacks = [];
+  for (const upper of boxes) {
+    for (const lower of boxes) {
+      const gap = upper.z - lower.z - lower.height;
+      const left = Math.max(upper.x + covered(upper, 'left'), lower.x + covered(lower, 'left'));
+      const right = Math.min(
+        upper.x + upper.width - covered(upper, 'right'),
+        lower.x + lower.width - covered(lower, 'right'),
+      );
+      if (upper === lower || gap < -EPSILON || gap > reach + EPSILON || right - left <= EPSILON) continue;
+      if (horizontalOn(upper, lower)) stacks.push({ upper, lower, gap: Math.max(0, gap), left, right });
+    }
+  }
+  const seams = new Map();
+  for (const stack of stacks) {
+    const key = `${Math.round((stack.lower.z + stack.lower.height) * 1e4)}:${Math.round(stack.upper.z * 1e4)}`;
+    seams.set(key, [...(seams.get(key) ?? []), stack]);
+  }
+  for (const seam of seams.values()) {
+    seam.sort((p, q) => p.left - q.left);
+    const chains = [];
+    for (const stack of seam) {
+      const last = chains[chains.length - 1];
+      const before = last?.[last.length - 1];
+      const continues = before
+        && stack.left - before.right >= -EPSILON && stack.left - before.right <= reach + EPSILON
+        && stack.upper !== before.upper && stack.lower !== before.lower
+        && near(before.upper.x + before.upper.width, before.lower.x + before.lower.width)
+        && near(stack.upper.x, stack.lower.x)
+        && !verticalOn(before.upper, stack.upper) && !verticalOn(before.lower, stack.lower);
+      if (continues) last.push(stack);
+      else chains.push([stack]);
+    }
+    for (const joined of chains) {
+      const first = joined[0];
+      const z = first.lower.z + first.lower.height - cover;
+      const height = first.gap + 2 * cover;
+      const start = z + (height - returnThickness) / 2;
+      tees.push({
+        id: `tee:h:${first.upper.id}|${first.lower.id}`,
+        orientation: 'horizontal',
+        end: null,
+        pieceId: null,
+        x: first.left,
+        z,
+        width: joined[joined.length - 1].right - first.left,
+        height,
+        drop: 0,
+        boxIds: [...new Set(joined.flatMap((stack) => [stack.upper.id, stack.lower.id]))],
+        ret: { start, end: start + returnThickness },
+      });
+      for (const stack of joined) {
+        addCover(stack.upper.id, 'bottom', cover);
+        addCover(stack.lower.id, 'top', cover);
+      }
+    }
+  }
+
   tees.sort((p, q) => p.x - q.x || p.z - q.z);
   return { tees, covers };
 }
```

#### Tests

### `src/elevation/model/__tests__/tees.test.js`

```diff
@@ -177,3 +177,73 @@ describe('SPEC-37 T-fillers at run ends', () => {
     expect(left.boxIds.sort()).toEqual(['a1', 'a2']);
   });
 });
+
+describe('SPEC-37 T-fillers between stacked boxes', () => {
+  const summary = (tees) => tees.map((tee) => [tee.id, tee.x, tee.z, tee.width, tee.height]);
+
+  it('takes the run setting "all", butts into the vertical T, and leaves that T whole', () => {
+    const { tees, covers } = teesOf(stackedRun(30, 30, { tFiller: 'all' }));
+    expect(summary(tees)).toEqual([
+      ['tee:h:a1|a2', 24, 29.25, 17.25, 1.5],
+      ['tee:a2|b2', 41.25, 0, 1.5, 60],
+      ['tee:h:b1|b2', 42.75, 29.25, 17.25, 1.5],
+    ]);
+    expect(tees[0].ret).toEqual({ start: 29.625, end: 30.375 });
+    expect(tees[0].boxIds).toEqual(['a1', 'a2']);
+    expect(covers.get('a1')).toEqual({ left: 0, right: 0.75, top: 0, bottom: 0.75 });
+    expect(covers.get('a2')).toEqual({ left: 0, right: 0.75, top: 0.75, bottom: 0 });
+  });
+
+  it('leaves a horizontal seam alone on "seams"', () => {
+    expect(summary(teesOf(stackedRun(30, 30)).tees)).toEqual([['tee:a2|b2', 41.25, 0, 1.5, 60]]);
+  });
+
+  it('takes one cabinet\'s own bottom, which butts into the vertical T', () => {
+    const run = stackedRun(30, 30, {});
+    run.grid.cells[0].node.cells[0].node.tFiller = { bottom: true };
+    expect(summary(teesOf(run).tees)).toEqual([
+      ['tee:h:a1|a2', 24, 29.25, 17.25, 1.5],
+      ['tee:a2|b2', 41.25, 0, 1.5, 60],
+    ]);
+  });
+
+  it('runs one flat across columns when no vertical T meets it', () => {
+    const run = stackedRun(30, 30, { tFiller: undefined });
+    run.grid.cells[0].node.cells[0].node.tFiller = { bottom: true };
+    run.grid.cells[1].node.cells[0].node.tFiller = { bottom: true };
+    const { tees, covers } = teesOf(run);
+    expect(summary(tees)).toEqual([['tee:h:a1|a2', 24, 29.25, 36, 1.5]]);
+    expect(tees[0].boxIds).toEqual(['a1', 'a2', 'b1', 'b2']);
+    expect(covers.get('b2')).toEqual({ left: 0, right: 0, top: 0.75, bottom: 0 });
+  });
+
+  it('keeps one vertical T where the splits don\'t line up, each horizontal butting into it', () => {
+    const run = stackedRun(30, 20, { tFiller: 'all' });
+    const { tees } = teesOf(run);
+    expect(tees.filter((tee) => tee.orientation === 'vertical').map((tee) => [tee.id, tee.z, tee.height])).toEqual([
+      ['tee:a2|b2', 0, 60],
+    ]);
+    expect(tees.filter((tee) => tee.orientation === 'horizontal').map((tee) => [tee.id, tee.x, tee.z, tee.width])).toEqual([
+      ['tee:h:a1|a2', 24, 29.25, 17.25],
+      ['tee:h:b1|b2', 42.75, 39.25, 17.25],
+    ]);
+  });
+
+  it('widens the flat by the gap between spaced boxes', () => {
+    const run = baseRun({
+      tFiller: undefined, width: 18, z: 0, height: 60,
+      grid: {
+        id: 'r:grid',
+        cols: [{ id: 'a:col', size: null, sizeMode: 'auto' }],
+        rows: [{ id: 'r:row', size: null, sizeMode: 'auto' }],
+        cells: [cell(0, 0, {
+          id: 'a',
+          cols: [{ id: 'a:c', size: null, sizeMode: 'auto' }],
+          rows: [{ id: 'a:t', size: 30, gap: 0.5, sizeMode: 'manual' }, { id: 'a:u', size: null, sizeMode: 'auto' }],
+          cells: [cell(0, 0, cab('a1', null, { tFiller: { bottom: true } })), cell(0, 1, cab('a2'))],
+        })],
+      },
+    });
+    const { tees } = teesOf(run);
+    expect(summary(tees)).toEqual([['tee:h:a1|a2', 24, 28.75, 18, 2]]);
+    expect(tees[0].ret).toEqual({ start: 29.375, end: 30.125 });
+  });
+});
```

**Count:** 757 + 6 = **763**.

**Done when:** `npm test` (763) and `npm run lint` clean.

---

## §5 Step 253 — Model: reveals beside a T-filler

`cabinetReveals` takes the T covers: a Euro face beside a T has its reveal at that edge set to the cover plus the usual one, which gives REV-005's 13/16" for a pair and REV-006's 27/32" for a single door. Top/bottom beside a horizontal T is the cover plus half the horizontal reveal. A manual reveal override still wins. `faceLayouts.js` passes the covers in and treats a covered edge as captured.

**Files:** `src/elevation/model/__tests__/tees.test.js`, `src/elevation/model/faceLayouts.js`, `src/elevation/model/styles.js`.

#### Source

### `src/elevation/model/faceLayouts.js`

```diff
@@ -7,6 +7,7 @@ import { faceOpenings, frameRegions } from './frames.js';
 import { runItems } from './grid.js';
 import { endCornerAnglesForRun, endMinWidthsForRun, pinTargetsForRun } from './room.js';
 import { splitRun } from './splitRun.js';
+import { teeFillers } from './tees.js';
 import { cabinetReveals, resolveStyle } from './styles.js';
 import { wallViewForRun } from './wallSides.js';
 
@@ -32,6 +33,7 @@ export function runFaceLayouts(room, wall, run, settings, layout = layoutRun(roo
   const result = new Map();
   const cells = cellPieces(run, layout);
   const frames = frameRegions(room, run, cells, settings);
+  const { covers: teeCovers } = teeFillers(room, run, cells, settings);
   const overhang = { ...DEFAULT_SETTINGS.insetFrame, ...settings.insetFrame }.stile;
   for (const piece of cells.pieces) {
     if (piece.kind !== 'cabinet' || piece.role !== 'item') continue;
@@ -43,7 +45,7 @@ export function runFaceLayouts(room, wall, run, settings, layout = layoutRun(roo
       : piece;
     const columnCaptured = captureSides(layout.pieces, column.id, otherPieces, tolerance);
     const byPanels = cellCaptureSides(cells.pieces, piece.id);
-    const captured = piece.columnId
+    const capturedByBox = piece.columnId
       ? {
         left: byPanels.left
           || (columnCaptured.left && Math.abs(piece.x - column.x) <= 1e-6),
@@ -51,6 +53,12 @@ export function runFaceLayouts(room, wall, run, settings, layout = layoutRun(roo
           && Math.abs(piece.x + piece.width - column.x - column.width) <= 1e-6),
       }
       : columnCaptured;
+    // Boxes either side of a T-filler are captured between fillers too (REV-005/006).
+    const tCovers = teeCovers.get(piece.id) ?? null;
+    const captured = {
+      left: capturedByBox.left || tCovers?.left > 0,
+      right: capturedByBox.right || tCovers?.right > 0,
+    };
     const free = frames.freeSides.get(piece.id) ?? { left: false, right: false };
     const box = {
       ...piece,
@@ -74,6 +82,7 @@ export function runFaceLayouts(room, wall, run, settings, layout = layoutRun(roo
       seams: frames.seamSides.get(piece.id),
       stacked: stackedSides(cells.pieces, piece.id, gapReach(cells.gaps)),
       covered: pairCovers ? { ...covered, left: 0, right: 0 } : covered,
+      tCovers,
       runEdges,
       manual: item?.reveals ?? null,
       settings,
```

### `src/elevation/model/styles.js`

```diff
@@ -32,6 +32,7 @@ export const REVEAL_SOURCE_LABELS = {
   'rule:captured-single': 'rule: captured single',
   'rule:bead-seam': 'rule: bead seam',
   'rule:covered-panel': 'rule: covered panel',
+  'rule:t-filler': 'rule: T-filler',
 };
 
 const STYLE_KEYS = ['cabinetStyleId', 'beadWidth', 'profiledEdge'];
@@ -145,6 +146,7 @@ export function cabinetReveals({
   seams = { left: false, right: false },
   stacked = { top: false, bottom: false },
   covered = { top: 0, bottom: 0, left: 0, right: 0 },
+  tCovers = null,
   runEdges = { top: true, bottom: true },
   manual = null,
   settings,
@@ -191,6 +193,16 @@ export function cabinetReveals({
       if (covered?.[key] > 0) apply(key, standard[key] - covered[key], 'rule:covered-panel');
     }
   }
+  // A T-filler covers the front edge (REV-005/006): the face sits that much farther in, and between
+  // stacked boxes each face takes half the usual gap beside the flat.
+  if (euro && tCovers) {
+    for (const key of ['left', 'right']) {
+      if (tCovers[key] > 0) apply(key, values[key] + tCovers[key], 'rule:t-filler');
+    }
+    for (const key of ['top', 'bottom']) {
+      if (tCovers[key] > 0) apply(key, tCovers[key] + values.horizontal / 2, 'rule:t-filler');
+    }
+  }
   for (const key of REVEAL_KEYS) {
     if (Number.isFinite(manual?.[key])) apply(key, manual[key], 'manual');
   }
```

#### Tests

### `src/elevation/model/__tests__/tees.test.js`

```diff
@@ -1,7 +1,7 @@
 import { describe, expect, it } from 'vitest';
 import { cellPieces } from '../cells.js';
 import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
-import { layoutRun } from '../faceLayouts.js';
+import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
 import { gridFromItems } from '../grid.js';
 import { resolveWall } from '../room.js';
 import { teeFillers } from '../tees.js';
@@ -247,3 +247,57 @@ describe('SPEC-37 T-fillers between stacked boxes', () => {
     expect(tees[0].ret).toEqual({ start: 29.375, end: 30.125 });
   });
 });
+
+describe('SPEC-37 T-fillers and the faces beside them', () => {
+  function facesOf(run) {
+    const room = roomWith(run);
+    const wall = resolveWall(room, room.walls[0]);
+    return runFaceLayouts(room, wall, run, S, layoutRun(room, wall, run, S));
+  }
+
+  it('sets the reveal at a covered edge to the cover plus the usual one (REV-005)', () => {
+    const faces = facesOf(baseRun());
+    const a = faces.get('a');
+    expect(a.reveals.values).toMatchObject({ left: 0.0625, right: 0.8125 });
+    expect(a.reveals.sources.right).toBe('rule:t-filler');
+    expect(a.reveals.sources.left).toBe('style');
+    expect(a.faces).toEqual([{ path: 'r', type: 'door', x: 24.0625, z: 4.125, width: 17.125, height: 30.125 }]);
+    expect(faces.get('b').faces[0]).toMatchObject({ x: 42.8125, width: 17.125 });
+  });
+
+  it('gives a single door between two T-fillers 27/32 each side (REV-006)', () => {
+    const run = baseRun({ width: 36, grid: gridFromItems('r', [cab('a', 12), cab('b', 12), cab('c', 12)]) });
+    const b = facesOf(run).get('b');
+    expect(b.reveals.values).toMatchObject({ left: 0.84375, right: 0.84375 });
+    expect(b.faces[0]).toMatchObject({ x: 36.84375, width: 10.3125 });
+  });
+
+  it('gives a pair of doors between end T-fillers 13/16 each side (REV-005)', () => {
+    const run = baseRun({
+      width: 42, tFiller: 'seams',
+      ends: { left: { type: 'filler', width: 3 }, right: { type: 'filler', width: 3 } },
+      grid: gridFromItems('r', [cab('a', 36)]),
+    });
+    const a = facesOf(run).get('a');
+    expect(a.reveals.values).toMatchObject({ left: 0.8125, right: 0.8125 });
+    expect(a.faces.map((face) => [face.half, face.x, face.width])).toEqual([
+      ['left', 27.8125, 17.125], ['right', 45.0625, 17.125],
+    ]);
+  });
+
+  it('puts 13/16 between stacked boxes either side of a horizontal T', () => {
+    const faces = facesOf(stackedRun(30, 30, { tFiller: 'all' }));
+    expect(faces.get('a1').reveals.values.bottom).toBe(0.8125);
+    expect(faces.get('a2').reveals.values.top).toBe(0.8125);
+    expect(faces.get('a1').reveals.sources.bottom).toBe('rule:t-filler');
+  });
+
+  it('leaves a manual reveal in charge, and runs without T-fillers alone', () => {
+    const run = baseRun({
+      grid: gridFromItems('r', [cab('a', 18, { reveals: { right: 0.5 } }), cab('b', 18)]),
+    });
+    expect(facesOf(run).get('a').reveals.values.right).toBe(0.5);
+    const plain = facesOf(baseRun({ tFiller: undefined })).get('a');
+    expect(plain.reveals.values).toMatchObject({ left: 0.0625, right: 0.0625 });
+  });
+});
```

**Count:** 763 + 5 = **768**.

**Done when:** `npm test` (768) and `npm run lint` clean.

---

## §6 Step 254 — Model: notes, part numbers and badges

`tees.js` also returns `notes` (tee id → `['T-shape', …chip/return-up notes where the flat drops]`) and `rabbets` (box id → `FF to rabbet …`, FILL-007). `partNumbers` lists each seam T as a filler part after its run's pieces, gives an end T the width ordered for its filler plus the cover, gives a horizontal T its flat height as its width, and adds a badge group so the number shows one level up.

**Files:** `src/elevation/model/__tests__/teeParts.test.js` (new), `src/elevation/model/__tests__/tees.test.js`, `src/elevation/model/index.js`, `src/elevation/model/partNumbers.js`, `src/elevation/model/tees.js`.

#### Source

### `src/elevation/model/index.js`

```diff
@@ -364,4 +364,4 @@ export {
   isExtendTarget,
 } from './extensions.js';
 export { boxInsets, faceOpenings, frameBadgeAnchor, frameEdgeTracks, frameMembers, frameRegions, frameVerticalChains, groupMembers, regionOpenings, sideOf } from './frames.js';
-export { teeFillers } from './tees.js';
+export { rabbetNote, teeFillers } from './tees.js';
```

### `src/elevation/model/partNumbers.js`

```diff
@@ -11,6 +11,7 @@ import {
   pinTargetsForRun,
 } from './room.js';
 import { splitRun } from './splitRun.js';
+import { teeFillers } from './tees.js';
 import { runTop } from './tops.js';
 import { wallNumbers } from './topology.js';
 import { wallEndPanels } from './wallEndPanels.js';
@@ -68,6 +69,8 @@ function runParts(room, wall, side, settings) {
       .map((entry) => entry.endPieceId));
     const frames = frameRegions(room, run, cells, settings);
     const inFrame = frames.fillerIds;
+    const { tees } = teeFillers(room, run, cells, settings);
+    const teeWidths = new Map(tees.filter((tee) => tee.end).map((tee) => [tee.id, tee.partWidth]));
     return [
       ...partPieces(cells.pieces, settings)
         .filter((piece) => PART_KINDS.has(piece.kind) && piece.width > 1e-6
@@ -80,8 +83,19 @@ function runParts(room, wall, side, settings) {
           runId: run.id,
           pieceId: piece.id,
           molding: null,
-          width: cellWidths.get(piece.id) ?? widths.get(piece.id) ?? piece.width,
+          width: teeWidths.get(piece.id) ?? cellWidths.get(piece.id) ?? widths.get(piece.id) ?? piece.width,
         })),
+      // A T-filler between boxes is a filler part of its own, after its run's pieces (SPEC-37).
+      ...tees.filter((tee) => !tee.end).map((tee) => ({
+        key: tee.id,
+        kind: 'filler',
+        wallId: wall.id,
+        side,
+        runId: run.id,
+        pieceId: tee.id,
+        molding: null,
+        width: tee.partWidth,
+      })),
       // One part per face frame, after its run's pieces (SPEC-36.2).
       ...frames.regions.map((region) => ({
         key: region.id,
@@ -236,6 +250,7 @@ export function wallBadgeGroups(room, wall, settings) {
     const cells = cellPieces(run, layout);
     const frames = frameRegions(room, run, cells, settings);
     const covered = new Set(frames.regions.flatMap((region) => region.fillerIds));
+    const seamTees = teeFillers(room, run, cells, settings).tees.filter((tee) => !tee.end);
     let layouts = null;
     const faceLayouts = () => (layouts ??= runFaceLayouts(room, wall, run, settings, layout));
     return [
@@ -244,6 +259,12 @@ export function wallBadgeGroups(room, wall, settings) {
         lift: 0,
         pieces: partPieces(cells.pieces, settings).filter((piece) => !covered.has(piece.id)),
       },
+      // A T-filler between boxes badges one level up, clear of the boxes' own (SPEC-37).
+      {
+        key: `tees:${run.id}`,
+        lift: 1,
+        pieces: seamTees.map(({ id, x, z, width, height }) => ({ id, x, z, width, height })),
+      },
       // Each frame's badge sits two levels up, over the stile nearest its centre (SPEC-36.2.1).
       ...frames.regions.map((region) => {
         const openings = regionOpenings(region, faceLayouts());
```

### `src/elevation/model/tees.js`

```diff
@@ -1,7 +1,7 @@
 import { gapReach } from './cells.js';
 import { findLeaf } from './cellTree.js';
 import { runItems } from './grid.js';
-import { endPieceBottom, isInsetStyle, resolveStyle } from './styles.js';
+import { endPieceBottom, endPieceNotes, isInsetStyle, resolveStyle } from './styles.js';
 
 const EPSILON = 1e-6;
 
@@ -24,6 +24,17 @@ function noCovers() {
   return { left: 0, right: 0, top: 0, bottom: 0 };
 }
 
+/** The shop note for a box a T-filler covers (FILL-007): which sides to rabbet. */
+export function rabbetNote(covers) {
+  const sides = ['left', 'right'].filter((side) => covers[side] > 0);
+  const edges = ['top', 'bottom'].filter((side) => covers[side] > 0);
+  const parts = [
+    ...(sides.length === 2 ? ['sides'] : sides.map((side) => `${side} side`)),
+    ...(edges.length === 2 ? ['top and bottom'] : edges),
+  ];
+  return `FF to rabbet ${parts.join(' and ')} for T-filler`;
+}
+
 /**
  * The T-fillers of a run (SPEC-37, FILL-011), derived and never stored. A T covers the front edges
  * of the two Euro boxes either side of a seam, `settings.teeCover` (3/4") of each, so its flat is
@@ -36,15 +47,21 @@ function noCovers() {
  * below the box (the fillers' own drop), and where the return sits along the flat's width, which is
  * centred between boxes and 3/4" off the box side at an end.
  *
- * @returns {{tees: object[], covers: Map<string, {left: number, right: number, top: number, bottom: number}>}}
+ * Also `partWidth` on each (what the shop orders across the flat: the width of a vertical T, the height
+ * of a horizontal one; at an end, any width ordered for the filler plus the cover), `notes` (by T id:
+ * "T-shape" and the filler notes) and `rabbets` (by box id: the FILL-007 note).
+ *
+ * @returns {{tees: object[], covers: Map<string, {left: number, right: number, top: number, bottom: number}>, notes: Map<string, string[]>, rabbets: Map<string, string>}}
  */
 export function teeFillers(room, run, cells, settings) {
   const tees = [];
   const covers = new Map();
+  const notes = new Map();
+  const rabbets = new Map();
   const cover = settings.teeCover;
   const returnThickness = settings.fillerReturnThickness;
   const runStyle = resolveStyle(settings, room, run);
-  if (isInsetStyle(runStyle)) return { tees, covers };
+  if (isInsetStyle(runStyle)) return { tees, covers, notes, rabbets };
   const { drop } = endPieceBottom(run, runStyle, settings);
   const reach = gapReach(cells.gaps ?? []);
   const boxes = cells.pieces.filter((piece) => piece.kind === 'cabinet' && piece.role === 'item')
@@ -106,6 +123,7 @@ export function teeFillers(room, run, cells, settings) {
         width,
         height: flat.height,
         drop: flat.drop,
+        partWidth: width,
         boxIds: [...new Set(joined.flatMap((contact) => [contact.a.id, contact.b.id]))],
         ret: { start, end: start + returnThickness },
       });
@@ -137,6 +155,7 @@ export function teeFillers(room, run, cells, settings) {
       width: piece.width + cover,
       height: flat.height,
       drop: flat.drop,
+      partWidth: (run.endFiller?.[side]?.width > 0 ? run.endFiller[side].width : piece.width) + cover,
       boxIds: beside.map((box) => box.id),
       ret: side === 'left' ? { start: edge - thickness, end: edge } : { start: edge, end: edge + thickness },
     });
@@ -193,6 +212,7 @@ export function teeFillers(room, run, cells, settings) {
         width: joined[joined.length - 1].right - first.left,
         height,
         drop: 0,
+        partWidth: height,
         boxIds: [...new Set(joined.flatMap((stack) => [stack.upper.id, stack.lower.id]))],
         ret: { start, end: start + returnThickness },
       });
@@ -204,5 +224,13 @@ export function teeFillers(room, run, cells, settings) {
   }
 
   tees.sort((p, q) => p.x - q.x || p.z - q.z);
-  return { tees, covers };
+  const bottom = endPieceBottom(run, runStyle, settings);
+  for (const tee of tees) {
+    notes.set(tee.id, [
+      'T-shape',
+      ...(tee.orientation === 'vertical' && tee.drop > 0 ? endPieceNotes('filler', bottom) : []),
+    ]);
+  }
+  for (const [id, sides] of covers) rabbets.set(id, rabbetNote(sides));
+  return { tees, covers, notes, rabbets };
 }
```

#### Tests

### NEW `src/elevation/model/__tests__/teeParts.test.js`

```js
import { describe, expect, it } from 'vitest';
import { cellPieces } from '../cells.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { layoutRun } from '../faceLayouts.js';
import { gridFromItems } from '../grid.js';
import { partNumbers, wallBadgeGroups } from '../partNumbers.js';
import { resolveWall } from '../room.js';
import { rabbetNote, teeFillers } from '../tees.js';

const S = DEFAULT_SETTINGS;
const NONE = { type: 'none', width: null };
const cab = (id, width = null, extra = {}) => ({ id, kind: 'cabinet', width, ...extra });
const cell = (col, row, node) => ({ col, row, colSpan: 1, rowSpan: 1, node });

function roomWith(run) {
  const wall = {
    id: 'wall-1', name: 'Wall 1', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5,
    flipped: false, connections: { start: null, end: null }, profile: {}, runs: [run], openings: [],
    joints: [], endPanels: { start: null, end: null }, landings: { start: null, end: null }, soffits: [],
  };
  return { id: 'room-1', name: 'Room 1', profile: { ...S.defaultProfile }, walls: [wall], wallOrder: ['wall-1'] };
}

const baseRun = (overrides = {}) => ({
  id: 'r', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 24, width: 36, z: 4, height: 30.5, depth: 24,
  ends: { left: NONE, right: NONE }, autoCount: false, maxCabinetWidth: null,
  heightMode: 'manual', overrides: {}, anchors: { left: false, right: false },
  tFiller: 'seams',
  grid: gridFromItems('r', [cab('a', 18), cab('b', 18)]),
  ...overrides,
});

const endRun = (overrides = {}) => baseRun({
  width: 42,
  ends: { left: { type: 'filler', width: 3 }, right: { type: 'filler', width: 3 } },
  ...overrides,
});

const STACKED = baseRun({
  z: 0, height: 60, width: 18,
  grid: {
    id: 'r:grid',
    cols: [{ id: 'a:col', size: null, sizeMode: 'auto' }],
    rows: [{ id: 'r:row', size: null, sizeMode: 'auto' }],
    cells: [cell(0, 0, {
      id: 'a',
      cols: [{ id: 'a:c', size: null, sizeMode: 'auto' }],
      rows: [{ id: 'a:t', size: 30, sizeMode: 'manual' }, { id: 'a:u', size: null, sizeMode: 'auto' }],
      cells: [cell(0, 0, cab('a1', null, { tFiller: { bottom: true } })), cell(0, 1, cab('a2'))],
    })],
  },
});

function context(run) {
  const room = roomWith(run);
  const wall = resolveWall(room, room.walls[0]);
  const layout = layoutRun(room, wall, run, S);
  return { room, wall, result: teeFillers(room, run, cellPieces(run, layout), S) };
}

describe('SPEC-37 rabbet notes (FILL-007)', () => {
  it('names the sides a T-filler covers', () => {
    const covers = (left, right, top, bottom) => ({ left, right, top, bottom });
    expect(rabbetNote(covers(0.75, 0.75, 0, 0))).toBe('FF to rabbet sides for T-filler');
    expect(rabbetNote(covers(0, 0.75, 0, 0))).toBe('FF to rabbet right side for T-filler');
    expect(rabbetNote(covers(0.75, 0, 0, 0))).toBe('FF to rabbet left side for T-filler');
    expect(rabbetNote(covers(0, 0, 0.75, 0.75))).toBe('FF to rabbet top and bottom for T-filler');
    expect(rabbetNote(covers(0.75, 0, 0.75, 0))).toBe('FF to rabbet left side and top for T-filler');
    expect(rabbetNote(covers(0.75, 0.75, 0, 0.75))).toBe('FF to rabbet sides and bottom for T-filler');
  });

  it('notes every covered box, end and seam, vertical and horizontal', () => {
    const { rabbets } = context(endRun()).result;
    expect([...rabbets]).toEqual([
      ['a', 'FF to rabbet sides for T-filler'],
      ['b', 'FF to rabbet sides for T-filler'],
    ]);
    expect([...context(baseRun()).result.rabbets]).toEqual([
      ['a', 'FF to rabbet right side for T-filler'],
      ['b', 'FF to rabbet left side for T-filler'],
    ]);
    expect([...context(STACKED).result.rabbets]).toEqual([
      ['a1', 'FF to rabbet bottom for T-filler'],
      ['a2', 'FF to rabbet top for T-filler'],
    ]);
  });
});

describe('SPEC-37 T-shape and filler notes', () => {
  it('notes each T as a T-shape, with the filler notes where the flat drops', () => {
    const { notes } = context(endRun()).result;
    expect([...notes]).toEqual([
      ['r:left', ['T-shape']], ['tee:a|b', ['T-shape']], ['r:right', ['T-shape']],
    ]);
    const upper = baseRun({ cabinetTypeId: CABINET_TYPE_IDS.UPPER, z: 54, height: 30, depth: 12 });
    expect([...context(upper).result.notes]).toEqual([['tee:a|b', ['T-shape', 'return up 1/8"']]]);
  });
});

describe('SPEC-37 T-fillers in the part list', () => {
  it('numbers a seam T after its run\'s pieces, and an end T in its filler\'s place', () => {
    const parts = partNumbers(roomWith(endRun()), S).parts.filter((part) => part.kind !== 'molding');
    expect(parts.map((part) => [part.number, part.key, part.kind, part.width])).toEqual([
      [1, 'r:left', 'filler', 3.75],
      [2, 'a', 'cabinet', 18],
      [3, 'b', 'cabinet', 18],
      [4, 'r:right', 'filler', 3.75],
      [5, 'tee:a|b', 'filler', 1.5],
    ]);
    expect(parts[4]).toMatchObject({ runId: 'r', pieceId: 'tee:a|b', wallId: 'wall-1' });
  });

  it('orders an end T at the width ordered for the filler, plus the cover', () => {
    const run = endRun({ endFiller: { left: { width: 6, returnDepth: null }, right: null } });
    const { parts } = partNumbers(roomWith(run), S);
    expect(parts.find((part) => part.key === 'r:left').width).toBe(6.75);
  });

  it('gives a horizontal T its flat height as its width, and leaves other runs alone', () => {
    const parts = (run) => partNumbers(roomWith(run), S).parts.filter((part) => part.kind !== 'molding');
    expect(parts(baseRun({ tFiller: undefined })).map((part) => part.key)).toEqual(['a', 'b']);
    expect(parts(STACKED).map((part) => [part.key, part.width])).toEqual([
      ['a2', 18], ['a1', 18], ['tee:h:a1|a2', 1.5],
    ]);
  });

  it('badges a seam T one level up, and not an end T', () => {
    const room = roomWith(endRun());
    const groups = wallBadgeGroups(room, resolveWall(room, room.walls[0]), S);
    expect(groups.map((group) => [group.key, group.lift])).toEqual([['run:r', 0], ['tees:r', 1]]);
    expect(groups[1].pieces).toEqual([{ id: 'tee:a|b', x: 44.25, z: 4, width: 1.5, height: 30.5 }]);
  });
});
```

### `src/elevation/model/__tests__/tees.test.js`

```diff
@@ -66,7 +66,7 @@ describe('SPEC-37 T-fillers at seams', () => {
     const { tees, covers } = teesOf(baseRun());
     expect(tees).toEqual([{
       id: 'tee:a|b', orientation: 'vertical', end: null, pieceId: null,
-      x: 41.25, z: 4, width: 1.5, height: 30.5, drop: 0, boxIds: ['a', 'b'],
+      x: 41.25, z: 4, width: 1.5, height: 30.5, drop: 0, partWidth: 1.5, boxIds: ['a', 'b'],
       ret: { start: 41.625, end: 42.375 },
     }]);
     expect(covers.get('a')).toEqual({ left: 0, right: 0.75, top: 0, bottom: 0 });
@@ -102,7 +102,7 @@ describe('SPEC-37 T-fillers at seams', () => {
     const { tees, covers } = teesOf(stackedRun(30, 30));
     expect(tees).toEqual([{
       id: 'tee:a2|b2', orientation: 'vertical', end: null, pieceId: null,
-      x: 41.25, z: 0, width: 1.5, height: 60, drop: 0, boxIds: ['a2', 'b2', 'a1', 'b1'],
+      x: 41.25, z: 0, width: 1.5, height: 60, drop: 0, partWidth: 1.5, boxIds: ['a2', 'b2', 'a1', 'b1'],
       ret: { start: 41.625, end: 42.375 },
     }]);
     expect(covers.get('a1').right).toBe(0.75);
```

**Count:** 768 + 7 = **775**.

**Done when:** `npm test` (775) and `npm run lint` clean.

---

## §7 Step 255 — Model: T-fillers in plan

`planRunPieces` draws a seam T as a hardwood flat `teeThickness` (13/16") thick from the box face (not the door face), with a 3/4" x 2 1/2" return centred on it running back into the box. An end T extends the filler's face over the box, also 13/16" from the box face, and its return stays where the box ends (Kyle: "the return starts where the box ends"). Horizontal Ts are not drawn in plan.

**Files:** `src/elevation/model/__tests__/teePlan.test.js` (new), `src/elevation/model/planPieces.js`.

#### Source

### `src/elevation/model/planPieces.js`

```diff
@@ -4,6 +4,7 @@ import { findLeaf } from './cellTree.js';
 import { frontDepth } from './corners.js';
 import { frameRegions } from './frames.js';
 import { runItems } from './grid.js';
+import { teeFillers } from './tees.js';
 
 const WIDTH_EPSILON = 1e-6;
 
@@ -273,7 +274,44 @@ export function planRunPieces(room, wall, run, settings, layout, faceLayouts) {
     faceFront,
   ), run.depth, faceFront);
   const returns = fillerReturns(run, settings, layout, panels, faceBack, frames.fillerIds);
-  const pieces = [...boxes, ...faces, ...returns];
+  // T-fillers (SPEC-37): a hardwood flat `teeThickness` (13/16") thick from the box face, with the
+  // filler's 3/4" return behind it into the box. An end T's flat reaches over its box on the
+  // filler's own face; a T between boxes is a flat and a return centred on the seam. Horizontal Ts
+  // don't show in plan.
+  const { tees } = teeFillers(room, run, cells, settings);
+  const teeBack = run.depth;
+  const teeFront = run.depth + settings.teeThickness;
+  const endTees = new Map(tees.filter((tee) => tee.end).map((tee) => [tee.id, tee]));
+  const seamTees = tees.filter((tee) => tee.orientation === 'vertical' && !tee.end);
+  const teeFaces = [
+    ...faces.map((face) => {
+      const tee = endTees.get(face.key);
+      if (!tee) return face;
+      const flat = { ...face, back: teeBack, front: teeFront };
+      return tee.end === 'left'
+        ? { ...flat, end: Math.max(face.end, tee.x + tee.width) }
+        : { ...flat, start: Math.min(face.start, tee.x) };
+    }),
+    ...seamTees.map((tee) => ({
+      key: tee.id, kind: 'filler', start: tee.x, end: tee.x + tee.width, back: teeBack, front: teeFront,
+    })),
+  ];
+  const teeReturns = settings.fillerReturnDepth > 0
+    ? seamTees.map((tee) => ({
+      key: `${tee.id}:return`,
+      start: tee.ret.start,
+      end: tee.ret.end,
+      back: teeBack - settings.fillerReturnDepth,
+      front: teeBack,
+    }))
+    : [];
+  const endReturns = returns.map((piece) => {
+    const tee = [...endTees.keys()].find((id) => piece.key.startsWith(`${id}:`));
+    return tee
+      ? { ...piece, back: teeBack - (piece.front - piece.back), front: teeBack }
+      : piece;
+  });
+  const pieces = [...boxes, ...teeFaces, ...endReturns, ...teeReturns];
   const shift = (piece) => (outset
     ? {
       ...piece,
@@ -289,7 +327,7 @@ export function planRunPieces(room, wall, run, settings, layout, faceLayouts) {
       end: Math.max(...pieces.map((piece) => piece.end)),
     },
     boxes: boxes.map(shift),
-    faces: faces.map(shift),
-    returns: returns.map(shift),
+    faces: teeFaces.map(shift),
+    returns: [...endReturns, ...teeReturns].map(shift),
   };
 }
```

#### Tests

### NEW `src/elevation/model/__tests__/teePlan.test.js`

```js
import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
import { gridFromItems } from '../grid.js';
import { planRunPieces } from '../planPieces.js';
import { resolveWall } from '../room.js';

const S = DEFAULT_SETTINGS;
const NONE = { type: 'none', width: null };
const cab = (id, width = null) => ({ id, kind: 'cabinet', width });

function roomWith(run) {
  const wall = {
    id: 'wall-1', name: 'Wall 1', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5,
    flipped: false, connections: { start: null, end: null }, profile: {}, runs: [run], openings: [],
  };
  return { id: 'room-1', name: 'Room 1', profile: { ...S.defaultProfile }, walls: [wall], wallOrder: ['wall-1'] };
}

const baseRun = (overrides = {}) => ({
  id: 'r', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 24, width: 36, z: 4, height: 30.5, depth: 24,
  ends: { left: NONE, right: NONE }, autoCount: false, maxCabinetWidth: null,
  heightMode: 'manual', overrides: {}, anchors: { left: false, right: false },
  tFiller: 'seams',
  grid: gridFromItems('r', [cab('a', 18), cab('b', 18)]),
  ...overrides,
});

function planOf(run) {
  const room = roomWith(run);
  const wall = resolveWall(room, room.walls[0]);
  const layout = layoutRun(room, wall, run, S);
  return planRunPieces(room, wall, run, S, layout, runFaceLayouts(room, wall, run, S, layout));
}

describe('SPEC-37 T-fillers in plan', () => {
  it('draws a seam T as a flat with a centred return', () => {
    const { faces, returns } = planOf(baseRun());
    expect(faces).toEqual([
      { key: 'a:r', kind: 'face', start: 24.0625, end: 41.1875, back: 24.0625, front: 24.875 },
      { key: 'b:r', kind: 'face', start: 42.8125, end: 59.9375, back: 24.0625, front: 24.875 },
      // Hardwood, 13/16" thick from the box face (24"); the return is 3/4" x 2 1/2" behind it.
      { key: 'tee:a|b', kind: 'filler', start: 41.25, end: 42.75, back: 24, front: 24.8125 },
    ]);
    expect(returns).toEqual([
      { key: 'tee:a|b:return', start: 41.625, end: 42.375, back: 21.5, front: 24 },
    ]);
  });

  it('widens the flat over spaced boxes', () => {
    const { faces, returns } = planOf(baseRun({ seamGap: 0.5, _seamGap: 0.5 }));
    expect(faces.find((face) => face.key === 'tee:a|b')).toMatchObject({ start: 41.25, end: 43.25 });
    expect(returns[0]).toMatchObject({ start: 41.875, end: 42.625 });
  });

  it('draws an end T over its box, with the filler\'s own return off-centre', () => {
    const run = baseRun({
      width: 42, tFiller: undefined,
      ends: { left: { type: 'filler', width: 3 }, right: { type: 'filler', width: 3 } },
      endFiller: { left: { tFiller: true }, right: { tFiller: true } },
    });
    const { faces, returns } = planOf(run);
    expect(faces.filter((face) => face.key.startsWith('r:'))).toEqual([
      { key: 'r:left', kind: 'filler', start: 24, end: 27.75, back: 24, front: 24.8125 },
      { key: 'r:right', kind: 'filler', start: 62.25, end: 66, back: 24, front: 24.8125 },
    ]);
    expect(returns).toEqual([
      { key: 'r:left:right', start: 26.25, end: 27, back: 21.5, front: 24 },
      { key: 'r:right:left', start: 63, end: 63.75, back: 21.5, front: 24 },
    ]);
  });

  it('keeps an ordered filler width, and adds the cover toward the box', () => {
    const run = baseRun({
      width: 39, tFiller: undefined,
      ends: { left: { type: 'filler', width: 3 }, right: NONE },
      endFiller: { left: { width: 6, returnDepth: 4, tFiller: true }, right: null },
    });
    const { faces, returns } = planOf(run);
    expect(faces.find((face) => face.key === 'r:left')).toMatchObject({ start: 21, end: 27.75 });
    expect(returns).toEqual([{ key: 'r:left:right', start: 26.25, end: 27, back: 20, front: 24 }]);
  });

  it('draws nothing more without T-fillers, and pushes T-fillers out by the outset', () => {
    expect(planOf(baseRun({ tFiller: undefined })).faces.map((face) => face.key)).toEqual(['a:r', 'b:r']);
    const { faces, returns } = planOf(baseRun({ outset: 2 }));
    expect(faces.find((face) => face.key === 'tee:a|b')).toMatchObject({ back: 26, front: 26.8125 });
    expect(returns[0]).toMatchObject({ back: 23.5, front: 26 });
  });
});
```

**Count:** 775 + 5 = **780**.

**Done when:** `npm test` (780) and `npm run lint` clean.

---

## §8 Step 256 — Model: T-fillers on the dimension chains

`runInnerSegments` trims each box's segment by the T's cover and adds a `'t-filler'` segment per T (an end T replaces its filler's segment). `runBoxSegments` splits the edge column's box as box | T | box. Runs without Ts are unchanged. Dimensioned like a face frame: the T's width, and the opening between.

**Files:** `src/elevation/model/__tests__/teeChains.test.js` (new), `src/elevation/model/__tests__/teePlan.test.js`, `src/elevation/model/__tests__/tees.test.js`, `src/elevation/model/dimensions.js`.

#### Source

### `src/elevation/model/dimensions.js`

```diff
@@ -20,6 +20,7 @@ import {
 import { soffitsOn } from './soffits.js';
 import { splitRun } from './splitRun.js';
 import { stackOf } from './stacks.js';
+import { teeFillers } from './tees.js';
 import { isCountertop, runTop } from './tops.js';
 
 const SEGMENT_EPSILON = 1e-6;
@@ -202,23 +203,24 @@ function regionSegments(region, pieces, faceLayouts, runId) {
 
 /**
  * A run's segments on the inner chain: its pieces, a gap between boxes as its own segment, and each
- * face frame region as stile and opening segments in place of the pieces it covers (SPEC-36).
+ * face frame region as stile and opening segments in place of the pieces it covers (SPEC-36). A
+ * T-filler is its own `t-filler` segment, and the boxes it covers show what's left of them (SPEC-37).
  */
 function runInnerSegments(room, wall, run, settings, layout) {
   const cells = cellPieces(run, layout);
   const { regions } = frameRegions(room, run, cells, settings);
+  const { tees, covers } = teeFillers(room, run, cells, settings);
   const faceLayouts = regions.length > 0 ? runFaceLayouts(room, wall, run, settings, layout) : null;
   const regionOf = (piece) => regions.find((region) => piece.x >= region.x - SEGMENT_EPSILON
     && piece.x + piece.width <= region.x + region.width + SEGMENT_EPSILON);
-  const segments = [];
-  let cursor = null;
-  const add = (start, end, kind, metadata) => {
-    if (cursor !== null && start - cursor > SEGMENT_EPSILON) {
-      appendSegment(segments, cursor, start, 'gap', { runId: run.id });
-    }
-    appendSegment(segments, start, end, kind, metadata);
-    cursor = end;
-  };
+  const endTees = new Map(tees.filter((tee) => tee.end).map((tee) => [tee.id, tee]));
+  // What a T covers along a piece's left and right edges, from the boxes that reach those edges.
+  const coverAt = (piece, side) => Math.max(0, ...cells.pieces
+    .filter((box) => (box.id === piece.id || box.columnId === piece.id) && covers.has(box.id))
+    .filter((box) => Math.abs((side === 'left' ? box.x : box.x + box.width)
+      - (side === 'left' ? piece.x : piece.x + piece.width)) <= SEGMENT_EPSILON)
+    .map((box) => covers.get(box.id)[side]));
+  const entries = [];
   const drawn = new Set();
   for (const piece of layout.pieces) {
     const region = regionOf(piece);
@@ -226,16 +228,47 @@ function runInnerSegments(room, wall, run, settings, layout) {
       if (drawn.has(region.id)) continue;
       drawn.add(region.id);
       for (const { start, end, kind, ...metadata } of regionSegments(region, cells.pieces, faceLayouts, run.id)) {
-        add(start, end, kind, metadata);
+        entries.push({ start, end, kind, metadata });
       }
       continue;
     }
-    add(piece.x, piece.x + piece.width, 'piece', {
-      runId: run.id,
-      pieceId: piece.id,
-      ...(runItems(run).find((item) => item.id === piece.id)?.pin ? { pinned: true } : {}),
+    const tee = endTees.get(piece.id);
+    if (tee) {
+      entries.push({
+        start: tee.x, end: tee.x + tee.width, kind: 't-filler', metadata: { runId: run.id, pieceId: tee.id },
+      });
+      continue;
+    }
+    entries.push({
+      start: piece.x + coverAt(piece, 'left'),
+      end: piece.x + piece.width - coverAt(piece, 'right'),
+      kind: 'piece',
+      metadata: {
+        runId: run.id,
+        pieceId: piece.id,
+        ...(runItems(run).find((item) => item.id === piece.id)?.pin ? { pinned: true } : {}),
+      },
     });
   }
+  const seams = new Map(tees
+    .filter((tee) => tee.orientation === 'vertical' && !tee.end)
+    .map((tee) => [`${tee.x}:${tee.width}`, tee]));
+  for (const tee of seams.values()) {
+    entries.push({
+      start: tee.x, end: tee.x + tee.width, kind: 't-filler', metadata: { runId: run.id, pieceId: tee.id },
+    });
+  }
+  entries.sort((a, b) => a.start - b.start);
+
+  const segments = [];
+  let cursor = null;
+  for (const { start, end, kind, metadata } of entries) {
+    if (cursor !== null && start - cursor > SEGMENT_EPSILON) {
+      appendSegment(segments, cursor, start, 'gap', { runId: run.id });
+    }
+    appendSegment(segments, start, end, kind, metadata);
+    cursor = end;
+  }
   return segments;
 }
 
@@ -452,6 +485,32 @@ export function pickColumnRuns(wall, selectedRunId, edge = 'left') {
   return stack.length > 1 ? { ...column, stack } : column;
 }
 
+/**
+ * A run's box on the vertical chain split around the horizontal T-fillers in the column at the
+ * chain's edge (SPEC-37): box | T | box, bottom to top. The box alone when there are none.
+ */
+function teeBoxSegments(run, cells, tees, edge) {
+  const boxes = cells.pieces.filter((piece) => piece.kind === 'cabinet' && piece.role === 'item');
+  const outermost = edge === 'right'
+    ? Math.max(...boxes.map((piece) => piece.x + piece.width))
+    : Math.min(...boxes.map((piece) => piece.x));
+  const edgeIds = new Set(boxes
+    .filter((piece) => Math.abs((edge === 'right' ? piece.x + piece.width : piece.x) - outermost) <= SEGMENT_EPSILON)
+    .map((piece) => piece.id));
+  const segments = [];
+  let cursor = run.z;
+  const flats = tees
+    .filter((tee) => tee.orientation === 'horizontal' && tee.boxIds.some((id) => edgeIds.has(id)))
+    .sort((a, b) => a.z - b.z);
+  for (const tee of flats) {
+    appendSegment(segments, cursor, tee.z, 'box');
+    appendSegment(segments, tee.z, tee.z + tee.height, 't-filler');
+    cursor = tee.z + tee.height;
+  }
+  appendSegment(segments, cursor, run.z + run.height, 'box');
+  return segments;
+}
+
 /**
  * A run's box on the vertical chain (SPEC-36.2.1). On a face frame run, the frame region nearest
  * the chain's edge is dimensioned rail | opening | rail up its outermost stack of openings, from the
@@ -461,8 +520,9 @@ export function pickColumnRuns(wall, selectedRunId, edge = 'left') {
 function runBoxSegments(room, wall, run, settings, edge) {
   const box = [{ start: run.z, end: run.z + run.height, kind: 'box' }];
   const layout = layoutRun(room, wall, run, settings);
-  const { regions } = frameRegions(room, run, cellPieces(run, layout), settings);
-  if (regions.length === 0) return box;
+  const cells = cellPieces(run, layout);
+  const { regions } = frameRegions(room, run, cells, settings);
+  if (regions.length === 0) return teeBoxSegments(run, cells, teeFillers(room, run, cells, settings).tees, edge);
   const region = regions.reduce((best, candidate) => (edge === 'right'
     ? (candidate.x + candidate.width > best.x + best.width + SEGMENT_EPSILON ? candidate : best)
     : (candidate.x < best.x - SEGMENT_EPSILON ? candidate : best)));
```

#### Tests

### NEW `src/elevation/model/__tests__/teeChains.test.js`

```js
import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { horizontalChains, verticalChains } from '../dimensions.js';
import { gridFromItems } from '../grid.js';
import { resolveWall } from '../room.js';

const S = DEFAULT_SETTINGS;
const NONE = { type: 'none', width: null };
const cab = (id, width = null, extra = {}) => ({ id, kind: 'cabinet', width, ...extra });
const cell = (col, row, node) => ({ col, row, colSpan: 1, rowSpan: 1, node });

function roomWith(run) {
  const wall = {
    id: 'wall-1', name: 'Wall 1', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5,
    flipped: false, connections: { start: null, end: null }, profile: {}, runs: [run], openings: [],
    joints: [], endPanels: { start: null, end: null }, landings: { start: null, end: null }, soffits: [],
  };
  return { id: 'room-1', name: 'Room 1', profile: { ...S.defaultProfile }, walls: [wall], wallOrder: ['wall-1'] };
}

const baseRun = (overrides = {}) => ({
  id: 'r', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 24, width: 36, z: 4, height: 30.5, depth: 24,
  ends: { left: NONE, right: NONE }, autoCount: false, maxCabinetWidth: null,
  heightMode: 'manual', overrides: {}, anchors: { left: false, right: false },
  tFiller: 'seams',
  grid: gridFromItems('r', [cab('a', 18), cab('b', 18)]),
  ...overrides,
});

const column = (id, top) => ({
  id,
  cols: [{ id: `${id}:c`, size: null, sizeMode: 'auto' }],
  rows: [{ id: `${id}:t`, size: top, sizeMode: 'manual' }, { id: `${id}:u`, size: null, sizeMode: 'auto' }],
  cells: [cell(0, 0, cab(`${id}1`)), cell(0, 1, cab(`${id}2`))],
});

const stackedRun = (overrides = {}) => baseRun({
  z: 0, height: 60, tFiller: 'all',
  grid: {
    id: 'r:grid',
    cols: [{ id: 'a:col', size: 18, sizeMode: 'manual' }, { id: 'b:col', size: 18, sizeMode: 'manual' }],
    rows: [{ id: 'r:row', size: null, sizeMode: 'auto' }],
    cells: [cell(0, 0, column('a', 30)), cell(1, 0, column('b', 30))],
  },
  ...overrides,
});

const inner = (run) => {
  const room = roomWith(run);
  return horizontalChains(room, resolveWall(room, room.walls[0]), 'lower', S).inner
    .filter(({ kind }) => kind !== 'open');
};
const up = (run, edge) => {
  const room = roomWith(run);
  const wall = resolveWall(room, room.walls[0]);
  return verticalChains(room, wall, { lowerRun: room.walls[0].runs[0], upperRun: null }, S, edge).inner;
};

describe('SPEC-37 T-fillers on the horizontal chain', () => {
  it('shows a seam T as its own segment, and the boxes less what it covers', () => {
    expect(inner(baseRun()).map(({ start, end, kind, pieceId }) => [start, end, kind, pieceId])).toEqual([
      [24, 41.25, 'piece', 'a'],
      [41.25, 42.75, 't-filler', 'tee:a|b'],
      [42.75, 60, 'piece', 'b'],
    ]);
  });

  it('counts the gap between spaced boxes in the T', () => {
    expect(inner(baseRun({ width: 36.5, seamGap: 0.5 })).map(({ start, end, kind }) => [start, end, kind])).toEqual([
      [24, 41.25, 'piece'], [41.25, 43.25, 't-filler'], [43.25, 60.5, 'piece'],
    ]);
  });

  it('shows an end T for its filler, with the flat reaching over the box', () => {
    const run = baseRun({
      width: 42,
      ends: { left: { type: 'filler', width: 3 }, right: { type: 'filler', width: 3 } },
    });
    expect(inner(run).map(({ start, end, kind, pieceId }) => [start, end, kind, pieceId])).toEqual([
      [24, 27.75, 't-filler', 'r:left'],
      [27.75, 44.25, 'piece', 'a'],
      [44.25, 45.75, 't-filler', 'tee:a|b'],
      [45.75, 62.25, 'piece', 'b'],
      [62.25, 66, 't-filler', 'r:right'],
    ]);
  });

  it('leaves a column of stacked boxes, and runs without T-fillers, as they were', () => {
    expect(inner(baseRun({ tFiller: undefined })).map(({ start, end, kind }) => [start, end, kind])).toEqual([
      [24, 42, 'piece'], [42, 60, 'piece'],
    ]);
    expect(inner(stackedRun({ tFiller: 'seams' })).map(({ start, end, kind, pieceId }) => [start, end, kind, pieceId])).toEqual([
      [24, 41.25, 'piece', 'a'], [41.25, 42.75, 't-filler', 'tee:a2|b2'], [42.75, 60, 'piece', 'b'],
    ]);
  });
});

describe('SPEC-37 T-fillers on the vertical chain', () => {
  it('splits the box around a horizontal T in the column at the chain\'s edge', () => {
    const summary = (chain) => chain.filter(({ kind }) => ['box', 't-filler'].includes(kind))
      .map(({ start, end, kind }) => [start, end, kind]);
    for (const edge of ['left', 'right']) {
      expect(summary(up(stackedRun(), edge))).toEqual([[0, 29.25, 'box'], [29.25, 30.75, 't-filler'], [30.75, 60, 'box']]);
    }
    expect(summary(up(stackedRun({ tFiller: 'seams' }), 'left'))).toEqual([[0, 60, 'box']]);
    expect(summary(up(baseRun(), 'left'))).toEqual([[4, 34.5, 'box']]);
  });
});
```

### `src/elevation/model/__tests__/teePlan.test.js`

```diff
@@ -48,7 +48,7 @@ describe('SPEC-37 T-fillers in plan', () => {
   });
 
   it('widens the flat over spaced boxes', () => {
-    const { faces, returns } = planOf(baseRun({ seamGap: 0.5, _seamGap: 0.5 }));
+    const { faces, returns } = planOf(baseRun({ width: 36.5, seamGap: 0.5 }));
     expect(faces.find((face) => face.key === 'tee:a|b')).toMatchObject({ start: 41.25, end: 43.25 });
     expect(returns[0]).toMatchObject({ start: 41.875, end: 42.625 });
   });
```

### `src/elevation/model/__tests__/tees.test.js`

```diff
@@ -74,7 +74,7 @@ describe('SPEC-37 T-fillers at seams', () => {
   });
 
   it('widens the flat by the gap between spaced boxes', () => {
-    const { tees } = teesOf(baseRun({ seamGap: 0.5, _seamGap: 0.5 }));
+    const { tees } = teesOf(baseRun({ width: 36.5, seamGap: 0.5 }));
     expect(tees).toHaveLength(1);
     expect(tees[0]).toMatchObject({ x: 41.25, width: 2, ret: { start: 41.875, end: 42.625 } });
   });
```

**Count:** 780 + 5 = **785**.

**Done when:** `npm test` (785) and `npm run lint` clean.

---

## §9 Step 257 — Model: what a box has on each side, and selecting a T

`teeSides(room, run, cells, settings, boxId)` returns, for a Euro box, `{ left, right, top, bottom: { neighbor, own, on } }` (the neighbouring box id, this box's own choice, whether a T is there now), or null. `resolveSelectedPiece` takes the tees and resolves a seam T id to `{ piece, item: null, side: null, tee }`. The chip/return-up note now applies when the flat drops to the run bottom.

**Files:** `src/elevation/model/__tests__/teeSides.test.js` (new), `src/elevation/model/index.js`, `src/elevation/model/tees.js`, `src/elevation/properties/__tests__/helpers.test.js`, `src/elevation/properties/helpers.js`.

#### Source

### `src/elevation/model/index.js`

```diff
@@ -364,4 +364,4 @@ export {
   isExtendTarget,
 } from './extensions.js';
 export { boxInsets, faceOpenings, frameBadgeAnchor, frameEdgeTracks, frameMembers, frameRegions, frameVerticalChains, groupMembers, regionOpenings, sideOf } from './frames.js';
-export { rabbetNote, teeFillers } from './tees.js';
+export { rabbetNote, teeFillers, teeSides } from './tees.js';
```

### `src/elevation/model/tees.js`

```diff
@@ -228,9 +228,41 @@ export function teeFillers(room, run, cells, settings) {
   for (const tee of tees) {
     notes.set(tee.id, [
       'T-shape',
-      ...(tee.orientation === 'vertical' && tee.drop > 0 ? endPieceNotes('filler', bottom) : []),
+      ...(tee.orientation === 'vertical' && near(tee.z + tee.drop, run.z) ? endPieceNotes('filler', bottom) : []),
     ]);
   }
   for (const [id, sides] of covers) rabbets.set(id, rabbetNote(sides));
   return { tees, covers, notes, rabbets };
 }
+
+/**
+ * What a box has on each side for the properties panel (SPEC-37): the box touching that side (or
+ * null), the cabinet's own T-filler choice there (true, false, or null to follow the run), and
+ * whether a T-filler is on that side now. Null for anything but a Euro cabinet.
+ */
+export function teeSides(room, run, cells, settings, boxId) {
+  const box = cells.pieces.find((piece) => piece.id === boxId && piece.kind === 'cabinet' && piece.role === 'item');
+  if (!box || isInsetStyle(resolveStyle(settings, room, run, leafOf(run, box)))) return null;
+  const { covers } = teeFillers(room, run, cells, settings);
+  const reach = gapReach(cells.gaps ?? []);
+  const others = cells.pieces.filter((piece) => piece !== box && piece.kind === 'cabinet' && piece.role === 'item');
+  const within = (gap) => gap >= -EPSILON && gap <= reach + EPSILON;
+  const rows = (other) => overlap(box.z, box.z + box.height, other.z, other.z + other.height);
+  const columns = (other) => overlap(box.x, box.x + box.width, other.x, other.x + other.width);
+  const nearest = (candidates, size) => candidates.reduce(
+    (best, other) => (!best || size(other) > size(best) + EPSILON ? other : best),
+    null,
+  )?.id ?? null;
+  const neighbors = {
+    left: nearest(others.filter((other) => rows(other) > EPSILON && within(box.x - other.x - other.width)), rows),
+    right: nearest(others.filter((other) => rows(other) > EPSILON && within(other.x - box.x - box.width)), rows),
+    top: nearest(others.filter((other) => columns(other) > EPSILON && within(other.z - box.z - box.height)), columns),
+    bottom: nearest(others.filter((other) => columns(other) > EPSILON && within(box.z - other.z - other.height)), columns),
+  };
+  const own = leafOf(run, box)?.tFiller ?? {};
+  return Object.fromEntries(['left', 'right', 'top', 'bottom'].map((side) => [side, {
+    neighbor: neighbors[side],
+    own: own[side] ?? null,
+    on: (covers.get(box.id)?.[side] ?? 0) > 0,
+  }]));
+}
```

### `src/elevation/properties/helpers.js`

```diff
@@ -63,13 +63,17 @@ export function prepareRunUpdate(room, wallId, run, settings, changes) {
  * @param {object} run
  * @param {{pieces: object[]}} layout
  * @param {string|null} pieceId
- * @returns {{piece: object, item: object|null, side: 'left'|'right'|null}|null}
+ * @param {object[]} [tees] the run's T-fillers (SPEC-37); a seam T is selected by its id
+ * @returns {{piece: object, item: object|null, side: 'left'|'right'|null, tee: object|null}|null}
  */
-export function resolveSelectedPiece(run, layout, pieceId) {
+export function resolveSelectedPiece(run, layout, pieceId, tees = []) {
   if (!pieceId) return null;
-  const piece = layout.pieces.find((candidate) => candidate.id === pieceId);
+  const tee = tees.find((candidate) => candidate.id === pieceId) ?? null;
+  const piece = layout.pieces.find((candidate) => candidate.id === pieceId)
+    ?? (tee ? { id: tee.id, kind: 'filler', role: 'tee', x: tee.x, z: tee.z, width: tee.width, height: tee.height } : null);
   if (!piece) return null;
 
+  if (piece.role === 'tee') return { piece, item: null, side: null, tee };
   if (piece.role === 'item') {
     return {
       piece,
@@ -77,6 +81,7 @@ export function resolveSelectedPiece(run, layout, pieceId) {
         ?? (piece.columnId ? findLeaf(run.grid, piece.id) : null)
         ?? null,
       side: null,
+      tee,
     };
   }
 
@@ -84,6 +89,7 @@ export function resolveSelectedPiece(run, layout, pieceId) {
     piece,
     item: null,
     side: piece.role === 'end-left' ? 'left' : 'right',
+    tee,
   };
 }
 
```

#### Tests

### NEW `src/elevation/model/__tests__/teeSides.test.js`

```js
import { describe, expect, it } from 'vitest';
import { cellPieces } from '../cells.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { layoutRun } from '../faceLayouts.js';
import { gridFromItems } from '../grid.js';
import { resolveWall } from '../room.js';
import { teeFillers, teeSides } from '../tees.js';

const S = DEFAULT_SETTINGS;
const NONE = { type: 'none', width: null };
const cab = (id, width = null, extra = {}) => ({ id, kind: 'cabinet', width, ...extra });
const cell = (col, row, node) => ({ col, row, colSpan: 1, rowSpan: 1, node });

function roomWith(run, style) {
  const wall = {
    id: 'wall-1', name: 'Wall 1', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5,
    flipped: false, connections: { start: null, end: null }, profile: {}, runs: [run], openings: [],
  };
  return {
    id: 'room-1', name: 'Room 1', profile: { ...S.defaultProfile }, walls: [wall], wallOrder: ['wall-1'],
    ...(style ? { style } : {}),
  };
}

const baseRun = (overrides = {}) => ({
  id: 'r', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 24, width: 36, z: 4, height: 30.5, depth: 24,
  ends: { left: NONE, right: NONE }, autoCount: false, maxCabinetWidth: null,
  heightMode: 'manual', overrides: {}, anchors: { left: false, right: false },
  tFiller: 'seams',
  grid: gridFromItems('r', [cab('a', 18), cab('b', 18)]),
  ...overrides,
});

function contextOf(run, style) {
  const room = roomWith(run, style);
  const wall = resolveWall(room, room.walls[0]);
  const cells = cellPieces(run, layoutRun(room, wall, run, S));
  return { room, cells };
}

const sidesOf = (run, id, style) => {
  const { room, cells } = contextOf(run, style);
  return teeSides(room, run, cells, S, id);
};

describe('SPEC-37 what a box has on each side', () => {
  it('names the neighbour, the box\'s own choice and whether a T is there', () => {
    expect(sidesOf(baseRun(), 'a')).toEqual({
      left: { neighbor: null, own: null, on: false },
      right: { neighbor: 'b', own: null, on: true },
      top: { neighbor: null, own: null, on: false },
      bottom: { neighbor: null, own: null, on: false },
    });
    const off = baseRun({ grid: gridFromItems('r', [cab('a', 18, { tFiller: { right: false } }), cab('b', 18)]) });
    expect(sidesOf(off, 'a').right).toEqual({ neighbor: 'b', own: false, on: false });
    expect(sidesOf(off, 'b').left).toEqual({ neighbor: 'a', own: null, on: false });
    expect(sidesOf(baseRun({ tFiller: undefined }), 'a').right).toEqual({ neighbor: 'b', own: null, on: false });
  });

  it('finds the box above and below in a stack, and the widest neighbour beside a split', () => {
    const column = (id, top) => ({
      id,
      cols: [{ id: `${id}:c`, size: null, sizeMode: 'auto' }],
      rows: [{ id: `${id}:t`, size: top, sizeMode: top === null ? 'auto' : 'manual' }, { id: `${id}:u`, size: null, sizeMode: 'auto' }],
      cells: [cell(0, 0, cab(`${id}1`)), cell(0, 1, cab(`${id}2`))],
    });
    const run = baseRun({
      z: 0, height: 60, tFiller: 'all',
      grid: {
        id: 'r:grid',
        cols: [{ id: 'a:col', size: 18, sizeMode: 'manual' }, { id: 'b:col', size: 18, sizeMode: 'manual' }],
        rows: [{ id: 'r:row', size: null, sizeMode: 'auto' }],
        cells: [cell(0, 0, column('a', 30)), cell(1, 0, column('b', 20))],
      },
    });
    expect(sidesOf(run, 'a1')).toEqual({
      left: { neighbor: null, own: null, on: false },
      right: { neighbor: 'b1', own: null, on: true },
      top: { neighbor: null, own: null, on: false },
      bottom: { neighbor: 'a2', own: null, on: true },
    });
    expect(sidesOf(run, 'b2').top).toEqual({ neighbor: 'b1', own: null, on: true });
  });

  it('is null for a face frame cabinet, a missing id and anything that isn\'t a cabinet', () => {
    expect(sidesOf(baseRun(), 'a', { cabinetStyleId: 14 })).toBeNull();
    expect(sidesOf(baseRun(), 'zz')).toBeNull();
    const withFiller = baseRun({
      width: 39, ends: { left: { type: 'filler', width: 3 }, right: NONE },
    });
    expect(sidesOf(withFiller, 'r:left')).toBeNull();
  });
});

describe('SPEC-37 shop notes where a T drops or sits on a part', () => {
  const below = (doors) => baseRun({ bottom: [{ id: 'rail', kind: 'light_rail', height: 1.5, doors }] });
  const notesOf = (run) => {
    const { room, cells } = contextOf(run);
    const { tees, notes } = teeFillers(room, run, cells, S);
    return { tee: tees[0], notes: notes.get(tees[0].id) };
  };

  it('notes where the return is held up, or a chip detail on a flush part', () => {
    const covered = notesOf(below('cover'));
    expect(covered.notes).toEqual(['T-shape', 'return up 1 5/8"']);
    expect(covered.tee).toMatchObject({ z: 2.375, height: 32.125, drop: 1.625 });
    expect(notesOf(below('flush')).notes).toEqual(['T-shape', 'chip detail bottom 1/8"']);
    expect(notesOf(baseRun()).notes).toEqual(['T-shape']);
  });
});
```

### `src/elevation/properties/__tests__/helpers.test.js`

```diff
@@ -263,3 +263,24 @@ describe('properties helpers', () => {
     expect(lastCabinetItem(run())).toBeNull();
   });
 });
+
+describe('SPEC-37 selecting a T-filler', () => {
+  const layout = { pieces: [{ id: 'r:left', role: 'end-left', kind: 'filler', x: 0, z: 4, width: 3, height: 30.5 }] };
+  const seam = { id: 'tee:a|b', orientation: 'vertical', end: null, x: 41.25, z: 4, width: 1.5, height: 30.5 };
+  const end = { id: 'r:left', orientation: 'vertical', end: 'left', x: 0, z: 4, width: 3.75, height: 30.5 };
+
+  it('finds a seam T by its id, as a filler with no item', () => {
+    expect(resolveSelectedPiece(run(), layout, 'tee:a|b', [seam, end])).toEqual({
+      piece: { id: 'tee:a|b', kind: 'filler', role: 'tee', x: 41.25, z: 4, width: 1.5, height: 30.5 },
+      item: null,
+      side: null,
+      tee: seam,
+    });
+    expect(resolveSelectedPiece(run(), layout, 'tee:a|b', [])).toBeNull();
+  });
+
+  it('keeps an end filler an end piece, and carries its T', () => {
+    expect(resolveSelectedPiece(run(), layout, 'r:left', [seam, end])).toMatchObject({ side: 'left', tee: end });
+    expect(resolveSelectedPiece(run(), layout, 'r:left')).toMatchObject({ side: 'left', tee: null });
+  });
+});
```

**Count:** 785 + 6 = **791**.

**Done when:** `npm test` (791) and `npm run lint` clean.

---

## §10 Step 258 — Screen: draw T-fillers in elevation, and select them

`RunGroup` draws the tees: an end T replaces its filler piece's x/width, a seam or horizontal T is added as a `kind: 'filler', role: 'tee'` piece through the same `PieceRect`. `PropertiesPanel` passes the tees to `resolveSelectedPiece` so selecting one doesn't clear the selection. `DimensionRow` colors `'t-filler'` segments amber.

**Files:** `src/elevation/components/DimensionRow.jsx`, `src/elevation/components/PropertiesPanel.jsx`, `src/elevation/components/RunGroup.jsx`.

#### Source

### `src/elevation/components/DimensionRow.jsx`

```diff
@@ -19,6 +19,7 @@ const KIND_COLORS = {
   opening: '#e2e8f0',
   'toe-kick': '#cbd5e1',
   box: '#cbd5e1',
+  't-filler': '#fbbf24',
   countertop: '#cbd5e1',
   clearance: '#cbd5e1',
   molding: '#cbd5e1',
```

### `src/elevation/components/PropertiesPanel.jsx`

```diff
@@ -10,6 +10,7 @@ import {
   pinTargetsForRun,
   soffitsOn,
   splitRun,
+  teeFillers,
   wallEndPanels,
 } from '../model/index.js';
 import {
@@ -80,11 +81,15 @@ export default function PropertiesPanel() {
   const displayLayout = layout && diagnostics[run?.id]
     ? { ...layout, ...diagnostics[run.id] }
     : layout;
+  const tees = useMemo(
+    () => (run && cells ? teeFillers(room, run, cells, settings).tees : []),
+    [room, run, cells, settings],
+  );
   const selectionContext = useMemo(
     () => (run && cells
-      ? resolveSelectedPiece(run, cells, selection.pieceId)
+      ? resolveSelectedPiece(run, cells, selection.pieceId, tees)
       : null),
-    [run, cells, selection.pieceId],
+    [run, cells, selection.pieceId, tees],
   );
 
   const showMessage = useCallback((message) => {
```

### `src/elevation/components/RunGroup.jsx`

```diff
@@ -19,6 +19,7 @@ import { frameRegions } from '../model/frames.js';
 import { runItems } from '../model/grid.js';
 import { isFollowAnchor, isJointAnchor } from '../model/joints.js';
 import { endPieceBottom, resolveStyle } from '../model/styles.js';
+import { teeFillers } from '../model/tees.js';
 import { centerlineMarkers } from '../model/dimensions.js';
 import { extendPieces } from '../model/extensions.js';
 import { splitRun } from '../model/splitRun.js';
@@ -150,15 +151,28 @@ function RunGroup({
     () => cells.pieces.flatMap((piece) => shelfParts(piece, settings)),
     [cells, settings],
   );
-  const drawnPieces = useMemo(() => extendPieces(wall, run, cells.pieces.map((piece) => {
-    const dropped = drop > 0
-      && (piece.kind === 'filler' || piece.kind === 'end_panel')
-      ? { ...piece, z: piece.z - drop, height: piece.height + drop }
-      : piece;
-    return panelPieceIds.has(piece.id)
-      ? { ...dropped, kind: 'end_panel' }
-      : dropped;
-  })).pieces, [cells, drop, panelPieceIds, run, wall]);
+  const tees = useMemo(
+    () => teeFillers(room, run, cells, settings).tees,
+    [cells, room, run, settings],
+  );
+  const drawnPieces = useMemo(() => {
+    const endTees = new Map(tees.filter((tee) => tee.end).map((tee) => [tee.pieceId, tee]));
+    const seamTees = tees.filter((tee) => !tee.end).map((tee) => ({
+      id: tee.id, kind: 'filler', role: 'tee', x: tee.x, z: tee.z, width: tee.width, height: tee.height,
+    }));
+    const base = cells.pieces.map((piece) => {
+      const tee = endTees.get(piece.id);
+      const shaped = tee ? { ...piece, x: tee.x, width: tee.width } : piece;
+      const dropped = drop > 0
+        && (shaped.kind === 'filler' || shaped.kind === 'end_panel')
+        ? { ...shaped, z: shaped.z - drop, height: shaped.height + drop }
+        : shaped;
+      return panelPieceIds.has(piece.id)
+        ? { ...dropped, kind: 'end_panel' }
+        : dropped;
+    });
+    return [...extendPieces(wall, run, base).pieces, ...seamTees];
+  }, [cells, drop, panelPieceIds, run, tees, wall]);
   const profile = useMemo(
     () => resolveProfile(settings, room, wall),
     [room, settings, wall],
```

**Count:** unchanged, **791** (no component tests exist; `npm run lint` and `npm run build` are the check).

**Done when:** `npm test` (791), `npm run lint` and `npm run build` clean.

---

## §11 Step 259 — Screen: T-filler controls

The run gets a **T-fillers (Euro)** select (None / Between cabinets / Every edge) in the Cabinets section. A Euro cabinet gets a **T-filler** section with one select per edge that touches another Euro box (Follow run (on/off) / T-filler / No T-filler), writing the choice to both boxes. An end filler gets a **T-filler** select (Follow run / T-filler / Plain filler). Selecting a T shows `TeeProperties`: part number, notes, flat width and height, thickness (13/16") and return (3/4" x 2 1/2").

**Files:** `src/elevation/components/properties/EndFields.jsx`, `src/elevation/components/properties/PieceProperties.jsx`, `src/elevation/components/properties/RunCabinetsSection.jsx`, `src/elevation/components/properties/TFillerSection.jsx` (new), `src/elevation/components/properties/TeeProperties.jsx` (new).

#### Source

### `src/elevation/components/properties/EndFields.jsx`

```diff
@@ -118,6 +118,26 @@ export default function EndFields({
               aria-label={`${side} end filler return depth`}
             />
           </Field>
+          {endType === 'filler' && (
+            <Field label="T-filler">
+              <select
+                value={run.endFiller?.[side]?.tFiller === true ? 'yes'
+                  : run.endFiller?.[side]?.tFiller === false ? 'no' : 'follow'}
+                onChange={(event) => dispatch(setRunEndFiller({
+                  ...actionBase,
+                  side,
+                  key: 'tFiller',
+                  value: { follow: null, yes: true, no: false }[event.target.value],
+                }))}
+                aria-label={`${side} end filler T-filler`}
+                className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
+              >
+                <option value="follow">Follow run</option>
+                <option value="yes">T-filler</option>
+                <option value="no">Plain filler</option>
+              </select>
+            </Field>
+          )}
           <p className="mt-1.5 text-xs text-gray-500">
             {endType === 'blind'
               ? 'Box width of the cabinet at this end. The extra runs into the corner. The filler is ordered 6" with no return; the elevation still shows what fits.'
```

### `src/elevation/components/properties/PieceProperties.jsx`

```diff
@@ -1,7 +1,7 @@
 import { useMemo } from 'react';
 import { useDispatch } from 'react-redux';
 import {
-  boxInsets, endPieceBottom, endPieceNotes, frameRegions, partNumbers, resolveStyle, wallSideOf,
+  boxInsets, endPieceBottom, endPieceNotes, frameRegions, partNumbers, resolveStyle, teeFillers, wallSideOf,
 } from '../../model/index.js';
 import { removeItem, setCellExtend, setItemWidth } from '../../store/elevationSlice.js';
 import InchInput from '../InchInput.jsx';
@@ -12,6 +12,8 @@ import ExtendFields from './ExtendFields.jsx';
 import FrameSection from './FrameSection.jsx';
 import Field from './Field.jsx';
 import PartNumberField from './PartNumberField.jsx';
+import TeeProperties from './TeeProperties.jsx';
+import TFillerSection from './TFillerSection.jsx';
 
 function InteriorFillerProperties({ wallId, run, piece, item, extendRuns }) {
   const dispatch = useDispatch();
@@ -73,7 +75,9 @@ function EndProperties({ wallId, run, side, settings, extendRuns }) {
 export default function PieceProperties({
   room, wall, run, layout, cells, selectionContext, settings,
 }) {
-  const { piece, item, side } = selectionContext;
+  const {
+    piece, item, side, tee,
+  } = selectionContext;
   const numbers = useMemo(() => partNumbers(room, settings), [room, settings]);
   const frames = useMemo(() => frameRegions(room, run, layout, settings), [room, run, layout, settings]);
   const insets = useMemo(() => boxInsets(frames, layout, settings), [frames, layout, settings]);
@@ -99,6 +103,10 @@ export default function PieceProperties({
       duplicate={numbers.warnings.some((warning) => warning.keys.includes(partKey))}
     />
   );
+  const teeNotes = tee ? teeFillers(room, run, cells, settings).notes.get(tee.id) ?? [] : [];
+  const tSection = (
+    <TFillerSection room={room} wall={wall} run={run} cells={cells} settings={settings} piece={piece} />
+  );
   const endNotes = (piece.kind === 'filler' || piece.kind === 'end_panel')
     && !piece.extend?.down
     ? endPieceNotes(piece.kind, endPieceBottom(run, resolveStyle(settings, room, run), settings))
@@ -108,6 +116,9 @@ export default function PieceProperties({
   ) : null;
   const extendRuns = wall.runs.filter((other) => other.id !== run.id && wallSideOf(other) === wallSideOf(run));
 
+  if (tee && !side) {
+    return <TeeProperties tee={tee} notes={teeNotes} partNumberField={partNumberField} settings={settings} />;
+  }
   if (side) {
     return (
       <>
@@ -153,6 +164,7 @@ export default function PieceProperties({
           settings={settings}
           insets={insets}
         />
+        {tSection}
         {frameSection}
       </>
     );
@@ -170,6 +182,7 @@ export default function PieceProperties({
         settings={settings}
         inset={insets.get(piece.id)}
       />
+      {tSection}
       {frameSection}
     </>
   );
```

### `src/elevation/components/properties/RunCabinetsSection.jsx`

```diff
@@ -10,6 +10,7 @@ import {
   setAutoCount,
   setMaxCabinetWidth,
   setRunSeamGap,
+  setRunTFiller,
 } from '../../store/elevationSlice.js';
 import InchInput from '../InchInput.jsx';
 import Field from './Field.jsx';
@@ -39,6 +40,24 @@ export default function RunCabinetsSection({ run, actionBase }) {
           />
         </label>
 
+        <div className="mt-2">
+          <Field label="T-fillers (Euro)">
+            <select
+              value={run.tFiller ?? 'none'}
+              onChange={(event) => dispatch(setRunTFiller({
+                ...actionBase,
+                value: event.target.value === 'none' ? null : event.target.value,
+              }))}
+              aria-label="Run T-fillers"
+              className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
+            >
+              <option value="none">None</option>
+              <option value="seams">Between cabinets</option>
+              <option value="all">Every edge</option>
+            </select>
+          </Field>
+        </div>
+
         <div className="mt-2 flex items-center justify-between rounded border border-gray-700 bg-gray-900/45 p-2">
           <span className="text-xs text-gray-400">Cabinet count</span>
           <div className="flex items-center gap-2">
```

### NEW `src/elevation/components/properties/TFillerSection.jsx`

```jsx
import { useDispatch } from 'react-redux';
import { teeSides } from '../../model/index.js';
import { setItemTFiller } from '../../store/elevationSlice.js';
import Field from './Field.jsx';

const SIDES = ['left', 'right', 'top', 'bottom'];
const OPPOSITE = {
  left: 'right', right: 'left', top: 'bottom', bottom: 'top',
};
const TO_VALUE = { follow: null, yes: true, no: false };

const toChoice = (value) => (value === true ? 'yes' : value === false ? 'no' : 'follow');

// One select per edge that touches another Euro box. Writing it sets the
// same choice on both boxes so the seam answers the same from either side.
export default function TFillerSection({
  room, wall, run, cells, settings, piece,
}) {
  const dispatch = useDispatch();
  const sides = teeSides(room, run, cells, settings, piece.id);
  if (!sides) return null;
  const touching = SIDES.filter((side) => sides[side].neighbor);
  if (touching.length === 0) return null;

  return (
    <section>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
        T-filler
      </h3>
      <div className="space-y-2">
        {touching.map((side) => (
          <Field key={side} label={`${side[0].toUpperCase()}${side.slice(1)} edge`}>
            <select
              value={toChoice(sides[side].own)}
              onChange={(event) => {
                const value = TO_VALUE[event.target.value];
                dispatch(setItemTFiller({
                  wallId: wall.id,
                  runId: run.id,
                  edits: [
                    { itemId: piece.id, side, value },
                    { itemId: sides[side].neighbor, side: OPPOSITE[side], value },
                  ],
                }));
              }}
              aria-label={`${side} edge T-filler`}
              className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
            >
              <option value="follow">{`Follow run (${sides[side].on ? 'on' : 'off'})`}</option>
              <option value="yes">T-filler</option>
              <option value="no">No T-filler</option>
            </select>
          </Field>
        ))}
      </div>
    </section>
  );
}
```

### NEW `src/elevation/components/properties/TeeProperties.jsx`

```jsx
import { formatInches } from '../../model/index.js';

export default function TeeProperties({
  tee, notes, partNumberField, settings,
}) {
  return (
    <>
      {partNumberField}
      {notes.length > 0 && (
        <p className="text-xs text-cyan-300">{notes.join(' · ')}</p>
      )}
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          {tee.orientation === 'vertical' ? 'Vertical' : 'Horizontal'} T-filler
        </h3>
        <div className="grid grid-cols-2 gap-2 rounded border border-gray-700 bg-gray-900/45 p-3 text-xs">
          <div>
            <p className="text-gray-500">Flat width</p>
            <p className="mt-1 text-gray-200">{formatInches(tee.partWidth)}</p>
          </div>
          <div>
            <p className="text-gray-500">Height</p>
            <p className="mt-1 text-gray-200">{formatInches(tee.height)}</p>
          </div>
          <div>
            <p className="text-gray-500">Thickness</p>
            <p className="mt-1 text-gray-200">{formatInches(settings.teeThickness)}</p>
          </div>
          <div>
            <p className="text-gray-500">Return</p>
            <p className="mt-1 text-gray-200">
              {formatInches(settings.fillerReturnThickness)} × {formatInches(settings.fillerReturnDepth)}
            </p>
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Change it from the cabinet on either side.
        </p>
      </section>
    </>
  );
}
```

**Count:** unchanged, **791** (no component tests exist; `npm run lint` and `npm run build` are the check).

**Done when:** `npm test` (791), `npm run lint` and `npm run build` clean.

---

## §12 Check by hand

See the end of PROMPTS-37.md.

## §13 Assumptions to confirm

1. `run.tFiller` has two values, `seams` and `all`; horizontal Ts come only from `all` or a cabinet's own top/bottom.
2. **End return:** the return starts where the box ends, and the flat is the visible filler width plus 3/4" over the box. If the return should instead sit 3/4" from the *wall-side* edge, only `ret` in `tees.js` changes.
3. A T only between **Euro** boxes. Inset or mixed seams get no T.
4. A seam T's return (3/4" x 2 1/2") comes from the `fillerReturnThickness` and `fillerReturnDepth` settings; there is no per-T override. The flat is 13/16" from the box face (plan), so it ends 1/16" behind the door fronts, which start a bumper thickness out.
5. A horizontal T's reveal is the cover plus half the horizontal reveal.
6. A vertical T is one piece along the whole seam, however the cabinets on each side are split (Kyle). Horizontal Ts butt into it and never break it, like rails into a stile; it stops only where the seam stops or a cabinet's own side turns it off.
7. Interior `filler` items are not converted to Ts.
8. Horizontal Ts are not drawn in plan.
9. Both ends of a run follow the run setting unless an end's own choice is set.

## §14 Left for later

- Face frame (and inset) versions of a T; FILL-011 says Euro only.
- A per-T return depth and an off-centre return between boxes.
- Cut-list output of the T's flat and return as separate parts.
