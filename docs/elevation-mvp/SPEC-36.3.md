# Elevation Lab — SPEC-36.3 (face frame options, plan clearances)

Steps 238–243, after 36.2.1. The plan is in `CELLS-PLAN.md` (round 36.3). SPEC-36 through SPEC-36.2.1 still apply. Written against `e07dd7f` (step 237). Baseline **711**.

The model code below was checked in a scratch copy of the repo (its numbers are the ones in the tests), but Vitest couldn't run there. If a new test is off by a small amount, check the arithmetic before changing the code.

| Step | What | Files | Tests after |
|---|---|---|---|
| **238** | Shape, no behavior: a face group can carry `noRail: [seams]`; a run can carry `hanging: true`. Editing helper `setSeamNoRail` and seam upkeep in the split/count/remove helpers; `setRunFaceOptions` stores `hanging`. Inert. | `faces.js`, `faceTree.js`, `index.js`, `persistence.js`, `elevationSlice.js`, `noRailSeams.test.js` (new), two test files | 715 |
| **239** | Model: faces on either side of a no-rail seam share one frame opening (gap 0 square, 1/16 profiled); the frame loses those rails. | `constants.js`, `styles.js`, `faces.js`, `frames.js`, `noRail.test.js` (new) | 721 |
| **240** | Model: a hanging base's frame drops 3/4" below its box. | `styles.js`, `frames.js`, `profile.js`, `hanging.test.js` (new) | 724 |
| **241** | Screen: one "No rail between" tick per seam of a face group; the "Hanging" tick on a base run. | `FaceProperties.jsx`, `RunFaceOptions.jsx` | 724 |
| **242** | Model: plan clearances (islands, facing-run aisles). New pure file. | `clearances.js` (new), `clearances.test.js` (new) | 729 |
| **243** | Screen: the clearances drawn in plan view. | `PlanClearances.jsx` (new), `PlanCanvas.jsx` | 729 |

Next: **37** (T-fillers).

## §1 The rules

### No rail or mullion between (planned since 36.1; Kyle, 2026-09-28; per seam)

- **Each seam is its own choice.** The rail between two stacked faces, or the mullion between two side-by-side ones, can be turned off on its own: the bottom two drawers but not the top, two pairs in one stack, every seam, any combination. It's up to the designer.
- Stored as `noRail: [seam, …]` on the group node: sorted seam numbers, seam `i` being between sections `i` and `i + 1`, counted from the top of a stack or the left of a side-by-side split. Absent means every seam keeps its rail. A drawer stack preset turns none off.
- **A seam can only be turned off between two leaves.** A section that is itself split isn't one face.
- It only does anything on a **face frame** style (inset, beaded inset). A European cabinet ignores it and keeps the stored list.
- **Faces on either side of a turned-off seam share one opening in the frame**: nothing is cut between them, so the frame loses that rail, and the wall's vertical chain shows one opening for them. A row of neighbouring turned-off seams is one opening. The opening is named for its first face (the path of the top or left one).
- The gap between two faces across a turned-off seam is the new internal reveal `shared`: **0 for a square edge, 1/16" for a profiled edge** (`profiledFit.sharedGap`). A profiled face takes `fit` (3/32") on each of its edges that is *not* on a turned-off seam. Auto sections stay the same face size as each other: the fit a face doesn't take at a turned-off seam goes back into its slot. A fixed size is still the slot, as before.
- **Editing keeps seams with their sections.**
  - Splitting a section the same way as its group (more sections) leaves the new seams with their rails, except inside a shared opening (both seams beside the split face turned off), where the new seams are off too. Later seams move down with their sections.
  - Splitting a section the other way, or making it a drawer stack, removes the seams beside it.
  - A new section count keeps the seams that still exist. Removing a section joins the two seams beside it only if both were off. *Make equal* keeps them.
- **Worked examples (BW, SPEC-36.2):** an inset base at x 24, 48 wide, z 4, 30.5 tall, two auto cabinets. Cabinet `a`'s opening is x 25.5, z 5.5, 21 3/4 wide, 27 1/2 tall.
  - Three drawer fronts, every rail: each 8 1/6" (27 1/2 less two 1 1/2" rails, over 3).
  - All seams off (`[0, 1]`), square: each 9 1/6" (27 1/2 over 3, no gap). Profiled: each 9 1/16" (27 1/2 less 3/16" of fit less two 1/16" gaps, over 3), x 25.59375, width 21 9/16. The frame is 3 stiles and 4 rails (it was 6).
  - Only the bottom two off (`[1]`), square: each 8 2/3" (27 1/2 less one 1 1/2" rail, over 3), the top alone in its opening and the bottom two sharing one. The frame has one rail between them.
  - Four fronts in two pairs (`[0, 2]`): each 6 1/2" (27 1/2 less one 1 1/2" rail, over 4), two openings with a rail between.
  - Three side-by-side doors with the first mullion off (`[0]`): each 6 3/4" wide (21 3/4 less one 1 1/2" mullion, over 3).

### Hanging base (Kyle, 2026-09-28: an explicit run setting)

- A **base** run in a face frame style can be marked **hanging**: `run.hanging = true`. The frame's bottom rail then hangs below the box the way an upper's does: `insetFrame.upperDrop`, 3/4".
- **Auto height.** The box starts `drop` higher and is `drop` shorter, so its top, the counter and everything above stay where they were: z = toe kick + 3/4, height = base box − 3/4. The **toe kick value becomes the floor clearance to the bottom of the rail**, so the frame itself looks exactly like a normal base's (bottom rail at 4", faces at 5 1/2").
- **Manual height.** z and height are the box as typed, and the frame hangs 3/4" below z.
- The bottom reveal (box to opening) is the upper's: 3/4" (1" beaded), source `rule: hanging base`. Ends: end panels and fillers drop 3/4" below the box, as an upper's do. The frame region grows down by the drop.
- European, uppers and talls are unaffected. A stored flag on them does nothing.

### Plan clearances (Kyle, 2026-09-28; CELLS-PLAN round 36.3)

Always shown, no toggle, each at the **tightest point**, drawn as a dimension across the gap (from one edge to the other, at the middle of where they overlap). No maximum distance; a gap of 0 shows as 0.

- **What counts as a part.** Every **base and tall** run's plan footprint (its front includes the frame or door and bumper, as in plan already), every **wall end panel** (its plain rectangle, unmitered) and every **wall** with thickness. **Uppers never count.** A wall with no thickness has no shape: its bare edge is whatever the cabinets and panels leave at the wall line.
- **Groups.** Walls joined to each other by connections, or by a wing wall's landing, form a group.
- **Islands.** A group is an **island** when its whole footprint (cabinets included) lies inside another group's outline: the inside of a closed room, or the bounding box of an open group (a U). A peninsula that lands on a wall is part of that wall's group, so it isn't an island.
- **An island's outside edges.** The group plus its cabinets is one shape, so an L or a C is one outline. Its outside edges are each part's edges less whatever another part of the island covers just outside them; collinear stretches of the same face merge into one edge, short return ends included. Edges under 1" are dropped. Each edge gets one dimension, from its outermost part (cabinet front, end panel, or bare wall edge) to the **nearest facing edge across**: a cabinet front, an end panel, a wall face, or another edge of the same island. Inside a C the two facing arms' edges get one dimension straight across the pocket.
- **Facing-run aisles.** Wherever the front of a base or tall run has, as the nearest thing straight across, the front of another base or tall run, that gap gets a dimension. This covers galleys, U-kitchen legs and peninsulas. If the nearest thing across is a wall face, an end panel or a run's back, it isn't an aisle.
- **Each gap once.** Two dimensions that measure the same gap (same direction, same two lines, overlapping spans) are one: an island's dimension to a facing run, that run's aisle, and the same pocket measured from both sides.
- **Only parallel, facing edges** are measured, and an overlap under 1" doesn't count. Angled edges get no dimension for now.

---

## §2 Step 238 — shape (no behavior change)

### `src/elevation/model/faces.js` (179)

Before `isFaceNode` (its doc comment, 29) add:

```js
/** Whether `noRail` is a sorted list of seams (i = between children i and i + 1) that lie between two leaves. */
function isSeamList(node) {
  const { noRail, children } = node;
  return Array.isArray(noRail)
    && noRail.length > 0
    && noRail.every((seam, index) => Number.isInteger(seam)
      && seam >= 0
      && seam <= children.length - 2
      && (index === 0 || seam > noRail[index - 1])
      && Boolean(children[seam].type)
      && Boolean(children[seam + 1].type));
}

```

In `isFaceNode` (30–42): the leaf line `return node.children === undefined && node.direction === undefined` gains ` && node.noRail === undefined` (the next line, the hinge check, is unchanged), and the group's last line `    && node.children.every(isFaceNode);` becomes:

```js
    && node.children.every(isFaceNode)
    && (node.noRail === undefined || isSeamList(node));
```

Its doc comment gains: `* A group may carry noRail, a sorted list of seams with no rail or mullion (SPEC-36.3): seam i is between sections i and i + 1, and both must be leaves.`

### `src/elevation/model/faceTree.js` (135)

- After `replaceAt` (13–28) add:

```js
/** A group with its no-rail seams replaced; an empty list removes the key. */
function withSeams(node, seams) {
  const { noRail, ...rest } = node;
  void noRail;
  return seams.length ? { ...rest, noRail: seams } : rest;
}

/** The group at `path` without the given seams: a child nested into it is no longer a leaf. */
function withoutSeams(face, path, dropped) {
  const group = path === null ? null : getFaceNode(face, path);
  if (!group?.noRail) return face;
  return replaceAt(face, path, (node) => withSeams(
    node,
    node.noRail.filter((seam) => !dropped.includes(seam)),
  ));
}

```

- `splitFace` (58–73): replace the lines from `const parentPath = parentFacePath(path);` to the end of the function with:

```js
  const parentPath = parentFacePath(path);
  const parent = parentPath === null ? null : getFaceNode(face, parentPath);
  const index = indexesOf(path).at(-1);
  if (parent && parent.direction === direction) {
    return replaceAt(face, parentPath, (node) => {
      // Seams after the split leaf move along; splitting inside a shared opening stays shared.
      const seams = node.noRail ?? [];
      const inside = seams.includes(index - 1) && seams.includes(index);
      const moved = seams.map((seam) => (seam < index ? seam : seam + n - 1));
      const added = inside ? Array.from({ length: n - 1 }, (_, offset) => index + offset) : [];
      return withSeams({
        ...node,
        children: [...node.children.slice(0, index), ...copies, ...node.children.slice(index + 1)],
      }, [...moved, ...added].sort((a, b) => a - b));
    });
  }
  const nested = replaceAt(face, path, (node) => ({ direction, size: node.size, children: copies }));
  return withoutSeams(nested, parentPath, [index - 1, index]);
}
```

  (The `const n` and `const copies` lines above it stay.)

- `makeDrawerStack` (76–86): replace the final `return replaceAt(…)` (81–85) with:

```js
  const stacked = replaceAt(face, path, (node) => ({
    direction: 'vertical',
    size: node.size,
    children,
  }));
  const index = indexesOf(path).at(-1);
  return withoutSeams(stacked, parentFacePath(path), [index - 1, index]);
```

- `setGroupCount` (89–100): replace `    return { ...node, children };` (98) with:

```js
    return withSeams({ ...node, children }, (node.noRail ?? []).filter((seam) => seam <= n - 2));
```

- `removeFace` (103–111): replace the line `    return children.length === 1 ? { ...children[0], size: node.size } : { ...node, children };` (109) with:

```js
    if (children.length === 1) return { ...children[0], size: node.size };
    // The seams beside the removed section join into one, kept only if both were cut.
    const seams = node.noRail ?? [];
    const joined = seams.includes(index - 1) && seams.includes(index) ? [index - 1] : [];
    const kept = seams
      .filter((seam) => seam < index - 1 || seam > index)
      .map((seam) => (seam > index ? seam - 1 : seam));
    return withSeams({ ...node, children }, [...kept, ...joined].sort((a, b) => a - b));
```

- Append at the end of the file:

```js
/**
 * Turns "no rail or mullion" on or off for one seam of a group (SPEC-36.3): seam i is between sections i
 * and i + 1, and both must be leaves. The faces on either side then share one frame opening.
 */
export function setSeamNoRail(face, path, seam, value) {
  const target = getFaceNode(face, path);
  if (!target?.children || !Number.isInteger(seam) || seam < 0 || seam > target.children.length - 2) return face;
  if (!target.children[seam].type || !target.children[seam + 1].type) return face;
  const seams = target.noRail ?? [];
  if (seams.includes(seam) === Boolean(value)) return face;
  const next = value ? [...seams, seam].sort((a, b) => a - b) : seams.filter((entry) => entry !== seam);
  return replaceAt(face, path, (node) => withSeams(node, next));
}
```

### `src/elevation/model/index.js`

The faceTree export block (23–36) adds `setSeamNoRail,` after `setGroupCount,`.

### `src/elevation/store/persistence.js` (652)

After the `run.upperBottom` line (233) add: `    && (run.hanging === undefined || run.hanging === true)`. (A stored face tree is checked by `isFaceNode`, which now knows `noRail`.)

### `src/elevation/store/elevationSlice.js` (1762)

`setRunFaceOptions` (1554–1564): right before `syncRoomAt(state, location.roomIndex);` add:

```js
      if (typeof action.payload.hanging === 'boolean') {
        if (action.payload.hanging) location.run.hanging = true;
        else delete location.run.hanging;
      }
```

### Tests

**New `src/elevation/model/__tests__/noRailSeams.test.js`** (3 tests):

```js
import { describe, expect, it } from 'vitest';
import { isFaceNode } from '../faces.js';
import {
  makeDrawerStack, removeFace, setGroupCount, setSeamNoRail, splitFace,
} from '../faceTree.js';

const drawer = { type: 'drawer_front', size: null };
const stack = (count, noRail) => ({
  direction: 'vertical', size: null, children: Array.from({ length: count }, () => drawer), ...(noRail ? { noRail } : {}),
});

describe('SPEC-36.3 no rail seams', () => {
  it('validates the seam list', () => {
    expect(isFaceNode(stack(3, [0, 1]))).toBe(true);
    expect(isFaceNode(stack(3, [1]))).toBe(true);
    expect(isFaceNode(stack(3, []))).toBe(false);
    expect(isFaceNode(stack(3, [1, 0]))).toBe(false);
    expect(isFaceNode(stack(3, [2]))).toBe(false);
    expect(isFaceNode(stack(3, [0.5]))).toBe(false);
    expect(isFaceNode(stack(3, true))).toBe(false);
    expect(isFaceNode({ type: 'door', size: null, noRail: [0] })).toBe(false);
    const nested = {
      direction: 'vertical',
      size: null,
      children: [drawer, drawer, { direction: 'horizontal', size: null, children: [drawer, drawer] }],
    };
    expect(isFaceNode({ ...nested, noRail: [0] })).toBe(true);
    expect(isFaceNode({ ...nested, noRail: [1] })).toBe(false);
  });

  it('turns one seam on and off, only between two leaves', () => {
    const plain = stack(3);
    const one = setSeamNoRail(plain, 'r', 1, true);
    expect(one.noRail).toEqual([1]);
    const both = setSeamNoRail(one, 'r', 0, true);
    expect(both.noRail).toEqual([0, 1]);
    expect(setSeamNoRail(both, 'r', 0, true)).toBe(both);
    expect(setSeamNoRail(both, 'r', 1, false).noRail).toEqual([0]);
    expect(setSeamNoRail(one, 'r', 1, false)).toEqual(plain);
    expect(setSeamNoRail(plain, 'r', 1, false)).toBe(plain);
    expect(setSeamNoRail(plain, 'r', 2, true)).toBe(plain);
    const nested = {
      direction: 'vertical',
      size: null,
      children: [drawer, drawer, { direction: 'horizontal', size: null, children: [drawer, drawer] }],
    };
    expect(setSeamNoRail(nested, 'r', 1, true)).toBe(nested);
    expect(setSeamNoRail(nested, 'r', 0, true).noRail).toEqual([0]);
  });

  it('moves the seams with their sections', () => {
    const cut = stack(4, [0, 2]);
    // Splitting a front the same way adds seams that keep a rail, and the later seams move down.
    expect(splitFace(cut, 'r.1', 'vertical', 2).noRail).toEqual([0, 3]);
    // Inside a shared opening the new seam stays shared.
    expect(splitFace(stack(3, [0, 1]), 'r.1', 'vertical', 2).noRail).toEqual([0, 1, 2]);
    // Nesting a front takes its seams away, and no others.
    expect(splitFace(cut, 'r.1', 'horizontal', 2).noRail).toEqual([2]);
    expect(makeDrawerStack(cut, 'r.2', 2).noRail).toEqual([0]);
    // A new count keeps the seams that still exist.
    expect(setGroupCount(cut, 'r', 3).noRail).toEqual([0]);
    expect(setGroupCount(cut, 'r', 6).noRail).toEqual([0, 2]);
    // Removing a front joins the seams beside it only if both were cut.
    expect(removeFace(stack(4, [0, 1]), 'r.1').noRail).toEqual([0]);
    expect(removeFace(stack(4, [0, 2]), 'r.1')).toEqual(stack(3, [1]));
    expect(removeFace(stack(4, [2]), 'r.0').noRail).toEqual([1]);
  });
});
```

**`src/elevation/store/__tests__/elevationSlice.test.js`:** in the same describe as test 47, right after it (1178–1186), add:

```js
  it('47b. setRunFaceOptions sets and clears hanging', () => {
    let state = elevationReducer(styleState(), setRunFaceOptions({ ...at, hanging: true }));
    expect(currentRun(state).hanging).toBe(true);
    state = elevationReducer(state, setRunFaceOptions({ ...at, top: 'wood' }));
    expect(currentRun(state).hanging).toBe(true);
    state = elevationReducer(state, setRunFaceOptions({ ...at, hanging: false }));
    expect('hanging' in currentRun(state)).toBe(false);
  });
```

**`src/elevation/store/__tests__/persistence.test.js`** (existing tests, no new test):
- The round-trip test (around 361): after `run.upperBottom = 'flush';` add `run.hanging = true;`, and in its `toMatchObject` for `loadedRun` add `hanging: true` next to `upperBottom: 'flush', top: 'wood'`.
- Test 44 (`rejects malformed styles…`): after the `run.upperBottom` check add
  `check(() => { run.hanging = 'yes'; }, () => { delete run.hanging; });` and
  `check(() => { item.face = { type: 'door', size: null, noRail: [0] }; }, () => { delete item.face; });`.

**Count:** 711 + 3 + 1 = **715**.

---

## §3 Step 239 — model: no rail

### `src/elevation/model/constants.js` (129)

Line 87 becomes `  profiledFit: { edge: 0.09375, pairEdge: 0.0625, pairGap: 0.125, sharedGap: 0.0625 },`. (Saved settings merge over these defaults already, so nothing else changes.)

### `src/elevation/model/styles.js` (266)

In `styleReveals`, after `pairFit: profiled ? profiled.pairEdge : 0,` (111) add `    shared: profiled ? profiled.sharedGap : 0,`. Its doc comment (the `Full reveal values…` block above it) gains: `` `shared` is the gap between the faces of a group with no rail between (SPEC-36.3). ``. A European style doesn't set it, and that's how a European cabinet ignores the flag.

### `src/elevation/model/faces.js`

Replace `place` and its group half (82–133, from `const place = (node, rect, path) => {` to the closing `};` of `place`) with:

```js
  const shared = Number.isFinite(reveals.shared) ? reveals.shared : null;

  const placeLeaf = (node, rect, path, inset, opening) => {
    const leaf = {
      x: rect.x + inset.left,
      z: rect.z + inset.bottom,
      width: rect.width - (inset.left + inset.right),
      height: rect.height - (inset.top + inset.bottom),
    };
    const extra = opening ? { opening } : {};
    if (node.type === 'pair_door') {
      const half = (leaf.width - pairGap) / 2;
      faces.push({
        path, type: node.type, half: 'left', x: leaf.x, z: leaf.z, width: half, height: leaf.height, ...extra,
      });
      faces.push({
        path,
        type: node.type,
        half: 'right',
        x: leaf.x + half + pairGap,
        z: leaf.z,
        width: half,
        height: leaf.height,
        ...extra,
      });
    } else {
      faces.push({ path, type: node.type, ...leaf, ...extra, ...(node.hinge ? { hinge: node.hinge } : {}) });
    }
  };

  const place = (node, rect, path) => {
    if (node.type) {
      const side = node.type === 'pair_door' ? pairFit : fit;
      placeLeaf(node, rect, path, {
        left: side, right: side, top: fit, bottom: fit,
      });
      return;
    }

    const stacked = node.direction === 'vertical';
    // Seams with no rail or mullion (SPEC-36.3): seam i is between children i and i + 1.
    const cuts = shared !== null && node.noRail ? new Set(node.noRail) : new Set();
    const gap = stacked ? reveals.horizontal : reveals.vertical;
    const gapAfter = (index) => (cuts.has(index) ? shared : gap);
    const length = stacked ? rect.height : rect.width;
    const lastIndex = node.children.length - 1;
    const hasAuto = node.children.some((child) => child.size === null);
    const isAuto = (child, index) => child.size === null || (!hasAuto && index === lastIndex);
    const fixedTotal = node.children.reduce(
      (sum, child, index) => (isAuto(child, index) ? sum : sum + child.size),
      0,
    );
    const autoCount = node.children.filter(isAuto).length;
    // A face next to a cut seam takes no fit on that edge, so an auto slot grows by it and the faces stay equal.
    const uncutEdges = (index) => 2 - (cuts.has(index - 1) ? 1 : 0) - (cuts.has(index) ? 1 : 0);
    const gaps = cuts.size
      ? node.children.reduce((sum, _child, index) => (index < lastIndex ? sum + gapAfter(index) : sum), 0)
      : gap * lastIndex;
    const cutFit = cuts.size
      ? fit * node.children.reduce((sum, child, index) => (isAuto(child, index) ? sum + uncutEdges(index) : sum), 0)
      : 0;
    const autoSize = (length - gaps - fixedTotal - cutFit) / autoCount;
    if (autoSize < MIN_FACE_SIZE) warnings.push({ code: 'face-too-small', path });

    let cursor = stacked ? rect.z + rect.height : rect.x;
    node.children.forEach((child, index) => {
      const size = isAuto(child, index)
        ? autoSize + (cuts.size ? fit * uncutEdges(index) : 0)
        : child.size;
      const childRect = stacked
        ? { x: rect.x, z: cursor - size, width: rect.width, height: size }
        : { x: cursor, z: rect.z, width: size, height: rect.height };
      const childPath = `${path}.${index}`;
      if (child.type && (cuts.has(index - 1) || cuts.has(index))) {
        // The faces on either side of a cut seam are one opening in the frame, named for its first face.
        let first = index;
        while (cuts.has(first - 1)) first -= 1;
        const along = child.type === 'pair_door' && !stacked ? pairFit : fit;
        const lead = cuts.has(index - 1) ? 0 : along;
        const trail = cuts.has(index) ? 0 : along;
        const across = child.type === 'pair_door' && stacked ? pairFit : fit;
        placeLeaf(child, childRect, childPath, stacked
          ? {
            left: across, right: across, top: lead, bottom: trail,
          }
          : {
            left: lead, right: trail, top: across, bottom: across,
          }, `${path}.${first}`);
      } else {
        place(child, childRect, childPath);
      }
      cursor = stacked ? cursor - size - gapAfter(index) : cursor + size + gapAfter(index);
    });
  };
```

Its doc comment (69–73) gains: `* A face beside a turned-off seam carries `opening`: the path of the first face of its shared opening (SPEC-36.3).` Everything else in the file stays. Groups without `noRail`, and every European cabinet, take the same numbers as before: the old sums are used unchanged when a group has no turned-off seam.

### `src/elevation/model/frames.js` (352)

Replace `faceOpenings` (160–176, its doc comment stays) with:

```js
export function faceOpenings(face, area, reveals) {
  const { faces } = resolveFaces(face, area, { ...reveals, fit: 0, pairFit: 0 });
  const byPath = new Map();
  for (const rect of faces) {
    // The faces on either side of a no-rail seam are one opening (SPEC-36.3).
    const key = rect.opening ?? rect.path;
    const seen = byPath.get(key);
    if (!seen) {
      byPath.set(key, { path: key, x: rect.x, z: rect.z, width: rect.width, height: rect.height });
      continue;
    }
    const right = Math.max(seen.x + seen.width, rect.x + rect.width);
    const top = Math.max(seen.z + seen.height, rect.z + rect.height);
    seen.x = Math.min(seen.x, rect.x);
    seen.z = Math.min(seen.z, rect.z);
    seen.width = right - seen.x;
    seen.height = top - seen.z;
  }
  return [...byPath.values()];
}
```

Its doc comment becomes `/** Each face's opening in the frame: its slot before any fit, a pair door's halves as one, and the faces on either side of a no-rail seam as one. */`. Nothing else in `frames.js` changes: `frameMembers` and the vertical chains are derived from the openings, so they lose the rails by themselves.

### New `src/elevation/model/__tests__/noRail.test.js`

```js
import { describe, expect, it } from 'vitest';
import { cellPieces } from '../cells.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
import {
  frameMembers, frameRegions, frameVerticalChains, groupMembers, regionOpenings,
} from '../frames.js';
import { gridFromItems } from '../grid.js';
import { resolveWall } from '../room.js';

const S = DEFAULT_SETTINGS;
const NONE = { type: 'none', width: null };
const drawer = { type: 'drawer_front', size: null };
/** A stack of `count` drawer fronts; `seams` are the ones with no rail between them (seam i: fronts i and i + 1). */
const stack = (seams = [], count = 3) => ({
  direction: 'vertical',
  size: null,
  children: Array.from({ length: count }, () => drawer),
  ...(seams.length ? { noRail: seams } : {}),
});
const round = (value) => Math.round(value * 100000) / 100000;
const shown = (faces) => faces.map(({
  path, opening, x, z, width, height,
}) => [path, opening, round(x), round(z), round(width), round(height)]);
const counts = (region, openings) => {
  const total = { stile: 0, rail: 0 };
  for (const { kind, count } of groupMembers(frameMembers(region, openings))) total[kind] += count;
  return [['stile', total.stile], ['rail', total.rail]];
};

/** SPEC-36.3 BW: a base at x 24, 48 wide, z 4, 30.5 tall, two auto cabinets; `a` carries the face. */
function layouts(style, face) {
  const run = {
    id: 'r', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 24, width: 48, z: 4, height: 30.5, depth: 24,
    ends: { left: NONE, right: NONE }, autoCount: false, maxCabinetWidth: null,
    heightMode: 'manual', overrides: {}, anchors: { left: false, right: false },
    grid: gridFromItems('r', [{ id: 'a', kind: 'cabinet', width: null, face }, { id: 'b', kind: 'cabinet', width: null }]),
  };
  const wall = {
    id: 'wall-1', name: 'Wall 1', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5,
    flipped: false, connections: { start: null, end: null }, profile: {}, runs: [run], openings: [],
  };
  const room = {
    id: 'room-1', name: 'Room 1', profile: { ...S.defaultProfile }, walls: [wall], wallOrder: ['wall-1'],
    ...(style ? { style } : {}),
  };
  const resolved = resolveWall(room, room.walls[0]);
  const layout = layoutRun(room, resolved, run, S);
  const frames = frameRegions(room, run, cellPieces(run, layout), S);
  const faceLayouts = runFaceLayouts(room, resolved, run, S, layout);
  const region = frames.regions[0] ?? null;
  return {
    region,
    faces: faceLayouts.get('a').faces,
    openings: region ? regionOpenings(region, faceLayouts) : faceLayouts.get('a').openings,
  };
}

const INSET = { cabinetStyleId: 14 };

describe('SPEC-36.3 no rail between', () => {
  it('shares one opening across every seam of a square inset stack, with no gap', () => {
    expect(shown(layouts(INSET, stack()).faces)).toEqual([
      ['r.0', undefined, 25.5, 24.83333, 21.75, 8.16667],
      ['r.1', undefined, 25.5, 15.16667, 21.75, 8.16667],
      ['r.2', undefined, 25.5, 5.5, 21.75, 8.16667],
    ]);
    const { faces, openings } = layouts(INSET, stack([0, 1]));
    expect(shown(faces)).toEqual([
      ['r.0', 'r.0', 25.5, 23.83333, 21.75, 9.16667],
      ['r.1', 'r.0', 25.5, 14.66667, 21.75, 9.16667],
      ['r.2', 'r.0', 25.5, 5.5, 21.75, 9.16667],
    ]);
    expect(openings.map(({
      path, x, z, width, height,
    }) => [path, round(x), round(z), round(width), round(height)])).toEqual([
      ['r.0', 25.5, 5.5, 21.75, 27.5],
      ['r', 48.75, 5.5, 21.75, 27.5],
    ]);
  });

  it('fits a profiled opening once and leaves 1/16" between its faces', () => {
    const { faces } = layouts({ cabinetStyleId: 14, profiledEdge: true }, stack([0, 1]));
    expect(shown(faces)).toEqual([
      ['r.0', 'r.0', 25.59375, 23.84375, 21.5625, 9.0625],
      ['r.1', 'r.0', 25.59375, 14.71875, 21.5625, 9.0625],
      ['r.2', 'r.0', 25.59375, 5.59375, 21.5625, 9.0625],
    ]);
  });

  it('can cut any one seam: the bottom two fronts share, the top keeps its rail', () => {
    const { faces, region, openings } = layouts(INSET, stack([1]));
    expect(shown(faces)).toEqual([
      ['r.0', undefined, 25.5, 24.33333, 21.75, 8.66667],
      ['r.1', 'r.1', 25.5, 14.16667, 21.75, 8.66667],
      ['r.2', 'r.1', 25.5, 5.5, 21.75, 8.66667],
    ]);
    // Cabinet a: top, bottom and one rail between the top front and the pair; cabinet b: top and bottom.
    expect(counts(region, openings)).toEqual([['stile', 3], ['rail', 5]]);
    expect(frameVerticalChains(region, openings).map((chain) => chain.tracks.map(({ kind }) => kind))).toEqual([
      ['frame', 'frame-opening', 'frame', 'frame-opening', 'frame'],
      ['frame', 'frame-opening', 'frame'],
    ]);
  });

  it('can make two groups in one stack, each sharing an opening, with a rail between them', () => {
    const { faces, region, openings } = layouts(INSET, stack([0, 2], 4));
    expect(shown(faces)).toEqual([
      ['r.0', 'r.0', 25.5, 26.5, 21.75, 6.5],
      ['r.1', 'r.0', 25.5, 20, 21.75, 6.5],
      ['r.2', 'r.2', 25.5, 12, 21.75, 6.5],
      ['r.3', 'r.2', 25.5, 5.5, 21.75, 6.5],
    ]);
    expect(counts(region, openings)).toEqual([['stile', 3], ['rail', 5]]);
    expect(frameVerticalChains(region, openings).map((chain) => chain.tracks.length)).toEqual([5, 3]);
  });

  it('cuts a mullion between side-by-side doors the same way', () => {
    const door = { type: 'door', size: null };
    const sideBySide = { direction: 'horizontal', size: null, children: [door, door, door], noRail: [0] };
    const { faces, region, openings } = layouts(INSET, sideBySide);
    expect(shown(faces)).toEqual([
      ['r.0', 'r.0', 25.5, 5.5, 6.75, 27.5],
      ['r.1', 'r.0', 32.25, 5.5, 6.75, 27.5],
      ['r.2', undefined, 40.5, 5.5, 6.75, 27.5],
    ]);
    // Cabinet a's second and third doors keep a mullion between them (4 stiles in all); rails follow the openings.
    expect(counts(region, openings)).toEqual([['stile', 4], ['rail', 6]]);
  });

  it('is ignored by a European cabinet', () => {
    const plain = shown(layouts(null, stack()).faces);
    expect(shown(layouts(null, stack([0, 1])).faces)).toEqual(plain);
    expect(plain).toEqual([
      ['r.0', undefined, 24.0625, 24.29167, 23.875, 9.95833],
      ['r.1', undefined, 24.0625, 14.20833, 23.875, 9.95833],
      ['r.2', undefined, 24.0625, 4.125, 23.875, 9.95833],
    ]);
  });
});
```

Working (the BW opening is 21.75 × 27.5):
- Every rail: (27.5 − 2 × 1.5) / 3 = 8 1/6, tops at 5.5 + 2 × (8 1/6 + 1.5) = 24 5/6.
- All off, square: 27.5 / 3 = 9 1/6, tops at 5.5 + 2 × 9 1/6 = 23 5/6.
- All off, profiled: the faces sit 3/32 in from the opening at its two ends (x 25.59375, width 21 9/16, z 5.59375, 27 5/16 tall); with two 1/16" gaps each is (27.3125 − 0.125) / 3 = 9 1/16, z 5.59375 + 9.0625 + 0.0625 = 14.71875.
- Bottom two only (`[1]`): (27.5 − 1.5) / 3 = 8 2/3; the top face is at 5.5 + 27.5 − 8 2/3 = 24 1/3, the next 1 1/2 below it (22 5/6, so z 14 1/6), the last against it (z 5.5). The frame: cabinet `a` has a top, a bottom and one rail between the top face and the pair (3), cabinet `b` two, so 5 rails, and 3 stiles as before.
- Two pairs (`[0, 2]`): (27.5 − 1.5) / 4 = 6 1/2. The tops are at 33 (z 26.5) and 26.5 (z 20, no gap to the pair's second face), then 1 1/2 down at 18.5 (z 12), and z 5.5. Rails: top, middle and bottom for `a`, two for `b`: 5 again.
- Side by side, first mullion off: (21.75 − 1.5) / 3 = 6 3/4, at x 25.5, 32.25 and (past the 1 1/2" mullion) 40.5. Stiles: the frame's two ends, the seam between the cabinets, and the mullion left between doors 2 and 3: 4. Rails: 2 for each of the three openings: 6.
- European: the reveals are the base ones (top 1/4, bottom 1/8), so 30.5 − 3/8 less two 1/8" gaps, over 3.

**Count:** 715 + 6 = **721**.

---

## §4 Step 240 — model: hanging base

### `src/elevation/model/styles.js`

- Line 6 becomes `const { BASE, UPPER, TALL } = CABINET_TYPE_IDS;`.
- Add to `REVEAL_SOURCE_LABELS` (26): `  'rule:hanging': 'rule: hanging base',` right before `'rule:below-run'`.
- After `isInsetStyle` (68–70) add:

```js
/**
 * How far a face frame run's bottom rail hangs below its box (SPEC-36.3): the upper drop on an upper
 * whose doors overhang, and on a base marked hanging. Zero for everything else.
 */
export function frameDrop(run, settings) {
  const { upperDrop } = { ...DEFAULT_SETTINGS.insetFrame, ...settings.insetFrame };
  if (run.cabinetTypeId === UPPER) return (run.upperBottom ?? 'overhang') === 'overhang' ? upperDrop : 0;
  return run.cabinetTypeId === BASE && run.hanging === true ? upperDrop : 0;
}
```

- In `cabinetReveals`, right before `const below = euro && …` (154):

```js
  // A hanging base's bottom reveal is an upper's: the frame's rail hangs below the box (SPEC-36.3).
  if (!euro && cabinetTypeId !== UPPER && runEdges.bottom && frameDrop(run, settings) > 0) {
    apply('bottom', styleReveals(style, UPPER, settings).bottom, 'rule:hanging');
  }
```

- Replace `panelDrop` (216–225) with:

```js
export function panelDrop(run, style, settings) {
  if (isInsetStyle(style)) return frameDrop(run, settings);
  const below = belowRunReveal(run, settings);
  if (below !== null) return Math.max(0, -below);
  if (run.cabinetTypeId !== UPPER || (run.upperBottom ?? 'overhang') !== 'overhang') return 0;
  return Math.max(0, -faceRevealsFor(UPPER, settings).bottom);
}
```

- Replace `runFrame` (258–266) with:

```js
export function runFrame(room, run, settings) {
  const style = resolveStyle(settings, room, run);
  if (!isInsetStyle(style)) return null;
  const frame = { ...DEFAULT_SETTINGS.insetFrame, ...settings.insetFrame };
  return { thickness: frame.thickness, drop: frameDrop(run, settings) };
}
```

Every inset upper gets the same values as before; a European run gets what it did.

### `src/elevation/model/frames.js`

- The constants import (3) becomes `import { DEFAULT_SETTINGS } from './constants.js';` and the styles import (6) becomes `import { frameDrop, isInsetStyle, resolveStyle } from './styles.js';`.
- Delete the `const frame = { ...DEFAULT_SETTINGS.insetFrame, ...settings.insetFrame };` line at the top of `frameRegions` (65).
- Replace the upper-drop block (140–145) with:

```js
    const drop = frameDrop(run, settings);
    if (drop > 0 && Math.abs(bounds.z - run.z) <= EPSILON) {
      region.z -= drop;
      region.height += drop;
    }
```

### `src/elevation/model/profile.js` (102)

Replace the base branch (59–61) with:

```js
  if (run.cabinetTypeId === CABINET_TYPE_IDS.BASE) {
    // A hanging base's frame drops below its box (SPEC-36.3): the box starts that much higher and is
    // that much shorter, so its top, and the counter, stay where they were.
    const drop = run._frame?.drop ?? 0;
    z = q.toeKickHeight + drop;
    height = q.baseBoxHeight - drop;
  } else if (run.cabinetTypeId === CABINET_TYPE_IDS.TALL) {
```

(`run._frame` is set before the heights are resolved, as it is for uppers; only a hanging inset base has a drop.)

### New `src/elevation/model/__tests__/hanging.test.js`

```js
import { describe, expect, it } from 'vitest';
import { cellPieces } from '../cells.js';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import { layoutRun, runFaceLayouts } from '../faceLayouts.js';
import { frameRegions } from '../frames.js';
import { gridFromItems } from '../grid.js';
import { resolveWall, syncRoom } from '../room.js';
import { panelDrop } from '../styles.js';

const S = DEFAULT_SETTINGS;
const NONE = { type: 'none', width: null };

/** SPEC-36.3: a 48" run at x 24, auto height, two auto cabinets, on a 144" wall. */
function build(style, overrides = {}, type = CABINET_TYPE_IDS.BASE) {
  const run = {
    id: 'r', cabinetTypeId: type, x: 24, width: 48, z: 4, height: 30.5, depth: 24,
    ends: { left: NONE, right: NONE }, autoCount: false, maxCabinetWidth: null,
    heightMode: 'auto', overrides: {}, anchors: { left: false, right: false },
    grid: gridFromItems('r', [{ id: 'a', kind: 'cabinet', width: null }, { id: 'b', kind: 'cabinet', width: null }]),
    ...overrides,
  };
  const wall = {
    id: 'wall-1', name: 'Wall 1', x1: 0, y1: 0, x2: 144, y2: 0, height: 96, thickness: 4.5,
    flipped: false, connections: { start: null, end: null }, profile: {}, runs: [run], openings: [],
    joints: [], endPanels: { start: null, end: null }, landings: { start: null, end: null }, soffits: [],
  };
  const room = syncRoom({
    id: 'room-1', name: 'Room 1', profile: { ...S.defaultProfile }, walls: [wall], wallOrder: ['wall-1'],
    ...(style ? { style } : {}),
  }, S);
  const synced = room.walls[0].runs[0];
  const resolved = resolveWall(room, room.walls[0]);
  const layout = layoutRun(room, resolved, synced, S);
  const region = frameRegions(room, synced, cellPieces(synced, layout), S).regions[0] ?? null;
  const faces = runFaceLayouts(room, resolved, synced, S, layout).get('a');
  return {
    run: synced,
    region,
    reveals: faces.reveals,
    face: faces.faces[0],
    drop: panelDrop(synced, { cabinetStyleId: style ? style.cabinetStyleId : 13 }, S),
  };
}

const INSET = { cabinetStyleId: 14 };

describe('SPEC-36.3 hanging base', () => {
  it('raises the box by the drop and shortens it, leaving the frame where a base\'s is', () => {
    const plain = build(INSET);
    expect([plain.run.z, plain.run.height, plain.run._frame.drop]).toEqual([4, 30.5, 0]);
    expect([plain.region.z, plain.region.height]).toEqual([4, 30.5]);

    const hanging = build(INSET, { hanging: true });
    expect([hanging.run.z, hanging.run.height]).toEqual([4.75, 29.75]);
    expect(hanging.run._frame).toEqual({ thickness: 0.8125, drop: 0.75 });
    expect([hanging.region.z, hanging.region.height]).toEqual([4, 30.5]);
    expect([hanging.face.z, hanging.face.height]).toEqual([5.5, 27.5]);
  });

  it('gives the box an upper\'s bottom reveal, beaded too, and drops the end pieces', () => {
    const hanging = build(INSET, { hanging: true });
    expect(hanging.reveals.values).toMatchObject({ top: 1.5, bottom: 0.75 });
    expect(hanging.reveals.sources.bottom).toBe('rule:hanging');
    expect(hanging.drop).toBe(0.75);

    const beaded = build({ cabinetStyleId: 15 }, { hanging: true });
    expect(beaded.reveals.values).toMatchObject({ top: 1.75, bottom: 1 });
    expect([beaded.region.z, beaded.region.height]).toEqual([4, 30.5]);
    expect([beaded.face.z, beaded.face.height]).toEqual([5.75, 27]);
  });

  it('leaves European runs, uppers and talls as they were', () => {
    const euro = build(null, { hanging: true });
    expect([euro.run.z, euro.run.height, euro.run._frame]).toEqual([4, 30.5, undefined]);
    expect(euro.reveals.values.bottom).toBe(0.125);
    expect(euro.reveals.sources.bottom).toBe('style');
    expect(euro.drop).toBe(0);

    const upper = build(INSET, {}, CABINET_TYPE_IDS.UPPER);
    expect([upper.run.z, upper.run.height, upper.run._frame.drop]).toEqual([54.75, 35.25, 0.75]);
    expect([upper.region.z, upper.region.height]).toEqual([54, 36]);
    expect(upper.reveals.values.bottom).toBe(0.75);
    expect(upper.reveals.sources.bottom).toBe('style');

    const tall = build(INSET, { hanging: true }, CABINET_TYPE_IDS.TALL);
    expect([tall.run.z, tall.run.height, tall.run._frame.drop]).toEqual([4, 86, 0]);
  });
});
```

Working: the plain base is the default profile's toe kick 4 + box 30.5; the frame is 1 1/2 rails, so its faces run 5.5 to 33. Hanging: z 4 + 3/4 = 4.75, height 30.5 − 3/4 = 29.75, top still 34.5; the region starts at 4.75 − 3/4 = 4 and is 30.5 high (box + drop). The reveal is the upper's 1 1/2 rail less 3/4 drop, plus the 1/4 bead on beaded. The inset upper is box top 90 less (counter 36 + 18 + 3/4) = 35.25.

**Count:** 721 + 3 = **724**.

---

## §5 Step 241 — screen: the two ticks

### `src/elevation/components/properties/FaceProperties.jsx` (330)

- The model import (3–23) adds `isInsetStyle,` (after `getFaceNode,`) and `setSeamNoRail,` (after `setGroupCount,`).
- Replace `groupLabel` (32–41) with:

```js
function groupLabel(node) {
  const cuts = node.noRail?.length ?? 0;
  const rail = cuts ? ` · no ${node.direction === 'vertical' ? 'rail' : 'mullion'} at ${cuts}` : '';
  if (
    node.direction === 'vertical'
    && node.children.every((child) => child.type === 'drawer_front')
  ) {
    return `Drawer stack × ${node.children.length}${rail}`;
  }
  const name = node.direction === 'horizontal' ? 'Side by side' : 'Stack';
  return `${name} × ${node.children.length}${rail}`;
}
```

- In the selected-group branch (the `) : (` after the leaf's `<div className="flex items-center gap-2">…</div>`, about 283–302), wrap the existing `<div className="flex items-center gap-2">…</div>` (Sections, Make equal) in a fragment and add one tick per seam after it. A seam is offered only when the sections on both sides are leaves, and only in an inset style:

```jsx
          ) : (
            <>
              <div className="flex items-center gap-2">
                {/* the existing Sections input and Make equal button, unchanged */}
              </div>
              {faceLayout && isInsetStyle(faceLayout.style) && selected.children.slice(0, -1).map((child, seam) => {
                if (!child.type || !selected.children[seam + 1].type) return null;
                const word = selected.direction === 'vertical' ? 'rail' : 'mullion';
                const label = `No ${word} between ${seam + 1} and ${seam + 2}`;
                return (
                  <label key={label} className="flex items-center gap-2 text-xs text-gray-300">
                    <input
                      type="checkbox"
                      checked={selected.noRail?.includes(seam) === true}
                      onChange={(event) => commitIfChanged(
                        setSeamNoRail(face, facePath, seam, event.target.checked),
                      )}
                      aria-label={label}
                    />
                    {label}
                  </label>
                );
              })}
            </>
          )}
```

Sections are counted from 1, from the top of a stack or the left of a split.

### `src/elevation/components/properties/RunFaceOptions.jsx` (68)

- The model import adds `isInsetStyle,` (after `defaultRunTop,`).
- After the Top `<label>` (before the `{run.cabinetTypeId === CABINET_TYPE_IDS.UPPER && (` block):

```jsx
      {run.cabinetTypeId === CABINET_TYPE_IDS.BASE && isInsetStyle(resolveStyle(settings, room, run)) && (
        <label className="flex items-center gap-2 text-xs text-gray-300">
          <input
            type="checkbox"
            checked={run.hanging === true}
            onChange={(event) => dispatch(setRunFaceOptions({ ...at, hanging: event.target.checked }))}
            aria-label="Hanging base"
          />
          Hanging (bottom rail hangs below the box)
        </label>
      )}
```

No new tests (components). **Count stays 724.**

---

## §6 Step 242 — model: plan clearances

One new pure file, `src/elevation/model/clearances.js`, with its test. Nothing existing changes (PlanCanvas imports it directly, so `index.js` is untouched).

### New `src/elevation/model/clearances.js`

```js
import { CABINET_TYPE_IDS } from './constants.js';
import { wallFrame } from './geometry.js';
import { runFootprint } from './footprints.js';
import { wallComponents } from './topology.js';
import { wallEndPanels } from './wallEndPanels.js';
import { wallOutline } from './wallOutline.js';
import { wallSideFrame, wallSideOf, wallSideView } from './wallSides.js';

const EPSILON = 1e-6;
const PROBE = 1e-3;
const SAME = 1e-3;

/** An edge or an overlap shorter than this (inches) is left out of the clearances. */
export const CLEARANCE_MIN_EDGE = 1;

const clean = (value) => Math.round(value * 10000) / 10000 + 0;
const dot = (a, b) => a.x * b.x + a.y * b.y;

function area(points) {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}

/** A polygon's edges with outward normals. `front` marks a run's front edge. */
function edgesOf(part) {
  const sign = area(part.points) >= 0 ? 1 : -1;
  return part.points.map((a, index) => {
    const b = part.points[(index + 1) % part.points.length];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    return {
      partId: part.id,
      a,
      b,
      length,
      n: { x: (sign * (b.y - a.y)) / length, y: (-sign * (b.x - a.x)) / length },
      front: part.kind === 'run' && part.frontIndex === index,
    };
  });
}

/** An edge as a line: normal `n`, offset `c` along it, and its extent along `d`. */
function lineOf(edge) {
  const d = { x: -edge.n.y, y: edge.n.x };
  const one = dot(d, edge.a);
  const two = dot(d, edge.b);
  return {
    n: edge.n,
    c: dot(edge.n, edge.a),
    d,
    start: Math.min(one, two),
    end: Math.max(one, two),
    front: edge.front,
  };
}

/**
 * Every base and tall run, wall end panel and wall as a convex plan polygon (SPEC-36.3):
 * { id, wallId, kind: 'run' | 'panel' | 'wall', points, frontIndex? }. Uppers never count, and a wall
 * with no thickness has no polygon.
 */
export function clearanceParts(room, settings) {
  const parts = [];
  for (const wall of room.walls) {
    const outline = wallOutline(room, wall);
    if (Math.abs(area(outline)) > EPSILON) {
      parts.push({ id: `${wall.id}:wall`, wallId: wall.id, kind: 'wall', points: outline });
    }
    for (const run of wall.runs) {
      if (run.cabinetTypeId === CABINET_TYPE_IDS.UPPER) continue;
      parts.push({
        id: run.id,
        wallId: wall.id,
        kind: 'run',
        frontIndex: 2,
        points: runFootprint(wallSideFrame(room, wall, wallSideOf(run)), run, settings),
      });
    }
    const frame = wallFrame(room, wallSideView(wall.sideSource ?? wall, 'front'));
    const point = (x, offset) => ({
      x: frame.leftPoint.x + frame.r.x * x + frame.n.x * offset,
      y: frame.leftPoint.y + frame.r.y * x + frame.n.y * offset,
    });
    for (const panel of wallEndPanels(room, wall, settings)) {
      const back = -(panel.thickness + panel.back.depth);
      const left = panel.front.x;
      const right = left + panel.width;
      parts.push({
        id: `${wall.id}:${panel.endpoint}:panel`,
        wallId: wall.id,
        kind: 'panel',
        points: [point(left, back), point(right, back), point(right, panel.front.depth), point(left, panel.front.depth)],
      });
    }
  }
  return parts;
}

/** The stretch of segment a→b inside a convex polygon, as [t0, t1] along it, or null. */
function clipSegment(a, b, points) {
  const sign = area(points) >= 0 ? 1 : -1;
  const d = { x: b.x - a.x, y: b.y - a.y };
  let t0 = 0;
  let t1 = 1;
  for (let index = 0; index < points.length; index += 1) {
    const p = points[index];
    const q = points[(index + 1) % points.length];
    const length = Math.hypot(q.x - p.x, q.y - p.y);
    const n = { x: (sign * (q.y - p.y)) / length, y: (-sign * (q.x - p.x)) / length };
    const distance = dot(n, { x: a.x - p.x, y: a.y - p.y });
    const slope = dot(n, d);
    if (Math.abs(slope) < 1e-12) {
      if (distance > EPSILON) return null;
    } else {
      const bound = (EPSILON - distance) / slope;
      if (slope > 0) t1 = Math.min(t1, bound);
      else t0 = Math.max(t0, bound);
    }
    if (t0 > t1) return null;
  }
  return [t0, t1];
}

function mergeIntervals(intervals, tolerance = EPSILON) {
  const merged = [];
  for (const [start, end] of [...intervals].sort((x, y) => x[0] - y[0])) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1] + tolerance) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/**
 * The outside edges of a group of parts (SPEC-36.3): each polygon edge less whatever another part
 * covers just outside it, with collinear stretches of one normal merged into one edge. Edges under
 * CLEARANCE_MIN_EDGE are dropped. Each is { n, c, d, start, end } (see lineOf).
 */
export function exposedEdges(parts) {
  const groups = new Map();
  for (const part of parts) {
    for (const edge of edgesOf(part)) {
      const probe = {
        a: { x: edge.a.x + edge.n.x * PROBE, y: edge.a.y + edge.n.y * PROBE },
        b: { x: edge.b.x + edge.n.x * PROBE, y: edge.b.y + edge.n.y * PROBE },
      };
      const covered = parts
        .filter((other) => other.id !== part.id)
        .map((other) => clipSegment(probe.a, probe.b, other.points))
        .filter(Boolean);
      const open = [];
      let cursor = 0;
      for (const [start, end] of mergeIntervals(covered)) {
        if (start > cursor) open.push([cursor, start]);
        cursor = Math.max(cursor, end);
      }
      if (cursor < 1) open.push([cursor, 1]);

      const line = lineOf(edge);
      const direction = dot(line.d, { x: edge.b.x - edge.a.x, y: edge.b.y - edge.a.y });
      const origin = dot(line.d, edge.a);
      const key = `${line.n.x.toFixed(4)}:${line.n.y.toFixed(4)}:${(Math.round(line.c / SAME) * SAME).toFixed(3)}`;
      for (const [start, end] of open) {
        if ((end - start) * edge.length < EPSILON) continue;
        const one = origin + direction * start;
        const two = origin + direction * end;
        const group = groups.get(key) ?? { line, spans: [] };
        group.spans.push([Math.min(one, two), Math.max(one, two)]);
        groups.set(key, group);
      }
    }
  }
  return [...groups.values()].flatMap(({ line, spans }) => mergeIntervals(spans, SAME)
    .filter(([start, end]) => end - start >= CLEARANCE_MIN_EDGE)
    .map(([start, end]) => ({
      n: { x: clean(line.n.x), y: clean(line.n.y) },
      c: clean(line.c),
      d: { x: clean(line.d.x), y: clean(line.d.y) },
      start: clean(start),
      end: clean(end),
    })));
}

/** The nearest edge facing `edge` from across, as { distance, start, end, front }, or null. */
function nearestAcross(edge, obstacles) {
  let best = null;
  for (const obstacle of obstacles) {
    if (dot(edge.n, obstacle.n) > -1 + EPSILON) continue;
    const distance = -obstacle.c - edge.c;
    if (distance < -EPSILON) continue;
    // A facing edge's own along-axis points the other way.
    const start = Math.max(edge.start, -obstacle.end);
    const end = Math.min(edge.end, -obstacle.start);
    if (end - start < CLEARANCE_MIN_EDGE) continue;
    const gap = Math.max(0, distance);
    const nearer = !best
      || gap < best.distance - SAME
      || (Math.abs(gap - best.distance) <= SAME && end - start > best.end - best.start);
    if (nearer) best = { distance: gap, start, end, front: Boolean(obstacle.front) };
  }
  return best;
}

function dimensionOf(edge, across, kind) {
  const point = (along, offset) => ({
    x: edge.d.x * along + edge.n.x * offset,
    y: edge.d.y * along + edge.n.y * offset,
  });
  const middle = (across.start + across.end) / 2;
  const from = point(middle, edge.c);
  const to = point(middle, edge.c + across.distance);
  // The same gap measured from either side has the same axis, lines and span.
  const flip = edge.n.x < -EPSILON || (Math.abs(edge.n.x) <= EPSILON && edge.n.y < 0) ? -1 : 1;
  const axis = { x: edge.n.x * flip, y: edge.n.y * flip };
  const along = { x: -axis.y, y: axis.x };
  const sorted = (a, b) => [Math.min(a, b), Math.max(a, b)];
  return {
    kind,
    from: { x: clean(from.x), y: clean(from.y) },
    to: { x: clean(to.x), y: clean(to.y) },
    length: clean(across.distance),
    axis,
    lines: sorted(dot(axis, from), dot(axis, to)),
    span: sorted(dot(along, point(across.start, edge.c)), dot(along, point(across.end, edge.c))),
  };
}

function sameGap(a, b) {
  return dot(a.axis, b.axis) > 1 - EPSILON
    && Math.abs(a.lines[0] - b.lines[0]) <= SAME && Math.abs(a.lines[1] - b.lines[1]) <= SAME
    && Math.min(a.span[1], b.span[1]) - Math.max(a.span[0], b.span[0]) > EPSILON;
}

/**
 * The clearances among plan parts (SPEC-36.3). `islands` lists the wall ids of each island group.
 * Each is { kind: 'island' | 'aisle', from, to, length }, at the tightest point, each gap once: an
 * island's outside edge to the nearest thing straight across (a cabinet front, an end panel, a wall
 * face, or the island's own facing edge), or one run's front to the front of the run facing it.
 * Only parallel, facing edges count.
 */
export function partClearances(parts, islands) {
  const found = [];
  for (const ids of islands) {
    const own = parts.filter((part) => ids.includes(part.wallId));
    const edges = exposedEdges(own);
    const ownIds = new Set(own.map((part) => part.id));
    const others = parts.filter((part) => !ownIds.has(part.id)).flatMap(edgesOf).map(lineOf);
    for (const edge of edges) {
      const across = nearestAcross(edge, [...others, ...edges.filter((other) => other !== edge)]);
      if (across) found.push(dimensionOf(edge, across, 'island'));
    }
  }
  for (const part of parts) {
    for (const front of edgesOf(part).filter((edge) => edge.front)) {
      const others = parts.filter((other) => other.id !== part.id).flatMap(edgesOf).map(lineOf);
      const across = nearestAcross(lineOf(front), others);
      if (across?.front) found.push(dimensionOf(lineOf(front), across, 'aisle'));
    }
  }
  const kept = [];
  for (const dimension of found) {
    if (!kept.some((other) => sameGap(other, dimension))) kept.push(dimension);
  }
  return kept.map(({
    kind, from, to, length,
  }) => ({
    kind, from, to, length,
  }));
}

function wallGroups(room) {
  const parent = new Map(room.walls.map((wall) => [wall.id, wall.id]));
  const root = (id) => (parent.get(id) === id ? id : root(parent.get(id)));
  for (const wall of room.walls) {
    for (const endpoint of ['start', 'end']) {
      const other = wall.connections?.[endpoint]?.wallId ?? wall.landings?.[endpoint]?.wallId;
      if (other && parent.has(other)) parent.set(root(wall.id), root(other));
    }
  }
  const groups = new Map();
  for (const wall of room.walls) {
    const key = root(wall.id);
    groups.set(key, [...(groups.get(key) ?? []), wall.id]);
  }
  return [...groups.values()];
}

function insidePolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[previous];
    const b = polygon[index];
    if ((a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Whether `points` lie inside the walls `ids`: inside a closed room's outline, or an open group's bounding box. */
function within(room, parts, ids, points) {
  const cycle = wallComponents(room).find((component) => component.kind === 'cycle'
    && component.walls.every((entry) => ids.includes(entry.wallId)));
  if (cycle) {
    const byId = new Map(room.walls.map((wall) => [wall.id, wall]));
    const outline = cycle.walls.map((entry) => {
      const wall = byId.get(entry.wallId);
      return entry.from === 'start' ? { x: wall.x1, y: wall.y1 } : { x: wall.x2, y: wall.y2 };
    });
    return points.every((point) => insidePolygon(point, outline));
  }
  const corners = parts.filter((part) => ids.includes(part.wallId)).flatMap((part) => part.points);
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  return points.every((point) => point.x >= Math.min(...xs) - EPSILON && point.x <= Math.max(...xs) + EPSILON
    && point.y >= Math.min(...ys) - EPSILON && point.y <= Math.max(...ys) + EPSILON);
}

/**
 * Island groups (SPEC-36.3): walls joined only to each other (connections, or a wing wall's landing)
 * whose footprint, cabinets included, lies inside another group's outline. Each is a list of wall ids.
 */
export function islandGroups(room, parts) {
  const groups = wallGroups(room);
  return groups.filter((ids) => {
    const points = parts.filter((part) => ids.includes(part.wallId)).flatMap((part) => part.points);
    return points.length > 0 && groups.some((other) => other !== ids && within(room, parts, other, points));
  });
}

/** Plan clearances for a room (SPEC-36.3): islands' outside edges and facing-run aisles. */
export function planClearances(room, settings) {
  if (!room?.walls?.length) return [];
  const parts = clearanceParts(room, settings);
  return partClearances(parts, islandGroups(room, parts));
}
```

How it reads:
- Each edge of each part has an outward normal `n`. `lineOf` gives it an offset `c = n·point` and an extent along `d` (a quarter turn from `n`). Two edges **face** each other when their normals are opposite; the gap is `−c₂ − c₁`, and both extents are compared along the first edge's `d` (the second's runs the other way, hence the `−end` / `−start`).
- `exposedEdges` moves each edge a thousandth of an inch outward and asks which other parts of the island cover that shifted segment. What isn't covered is open. A run's back edge on a zero-thickness wall, and the two runs' back edges on an island's wall line, cancel each other, which is why a two-sided island comes out as four edges.
- Aisles only use a run's own front edge (`frontIndex` 2 in `runFootprint`'s order) and only accept another run's front as the nearest thing across.

### New `src/elevation/model/__tests__/clearances.test.js`

```js
import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../constants.js';
import {
  clearanceParts, exposedEdges, islandGroups, partClearances, planClearances,
} from '../clearances.js';
import { gridFromItems } from '../grid.js';
import { syncRoom } from '../room.js';

const S = DEFAULT_SETTINGS;
const INSET = { cabinetStyleId: 14 };
const PANEL = { type: 'end_panel', width: null };
const NONE = { type: 'none', width: null };
const ENDS = { left: NONE, right: NONE };

const run = (id, wallSide, overrides = {}) => ({
  id, cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 0, width: 96, z: 4, height: 30.5, depth: 24,
  ends: { left: PANEL, right: PANEL }, autoCount: false, maxCabinetWidth: null,
  heightMode: 'manual', overrides: {}, anchors: { left: true, right: true }, wallSide,
  grid: gridFromItems(id, [{ id: `${id}a`, kind: 'cabinet', width: null }, { id: `${id}b`, kind: 'cabinet', width: null }]),
  ...overrides,
});

const wall = (id, x1, y1, x2, y2, extra = {}) => ({
  id, name: '', numberOverride: null, elevationForced: false, x1, y1, x2, y2, height: 96, thickness: 0,
  flipped: false, connections: { start: null, end: null }, profile: {}, openings: [], joints: [], runs: [],
  endPanels: { start: null, end: null }, landings: { start: null, end: null }, soffits: [], ...extra,
});

const link = (wallId, endpoint) => ({ wallId, endpoint });

const build = (walls) => syncRoom({
  id: 'room', name: 'Room', profile: { ...S.defaultProfile }, wallOrder: walls.map(({ id }) => id),
  style: INSET, walls,
}, S);

/** A closed 240 × 180 room of 4 1/2" walls, counterclockwise from the origin. */
const box = () => [
  wall('W1', 0, 0, 240, 0, { thickness: 4.5, connections: { start: link('W4', 'end'), end: link('W2', 'start') } }),
  wall('W2', 240, 0, 240, 180, { thickness: 4.5, connections: { start: link('W1', 'end'), end: link('W3', 'start') } }),
  wall('W3', 240, 180, 0, 180, { thickness: 4.5, connections: { start: link('W2', 'end'), end: link('W4', 'start') } }),
  wall('W4', 0, 180, 0, 0, { thickness: 4.5, connections: { start: link('W3', 'end'), end: link('W1', 'start') } }),
];

/** A 96" island (a 0" wall) at y 96 with a base run each side and wall end panels at both ends. */
const island = (runs = [run('F', 'front'), run('K', 'back')]) => wall('I', 72, 96, 168, 96, {
  runs, endPanels: { start: { width: null }, end: { width: null } },
});

/** A 96" run on the north wall, facing south, anchored to nothing. */
const northRun = () => run('N', 'front', { x: 72, width: 96, anchors: { left: false, right: false }, ends: ENDS });

const rows = (dimensions) => dimensions.map(({
  kind, from, to, length,
}) => [kind, from.x, from.y, to.x, to.y, length]);

const rect = (id, wallId, x0, y0, x1, y1) => ({
  id, wallId, kind: 'panel', points: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }],
});

describe('SPEC-36.3 plan clearances', () => {
  it('finds the outside edges of an L, one straight edge each', () => {
    const edges = exposedEdges([rect('a', 'I', 0, 0, 96, 24), rect('b', 'I', 0, 24, 24, 72)]);
    expect(edges.map(({
      n, c, start, end,
    }) => [n.x, n.y, c, start, end])).toEqual([
      [0, -1, 0, 0, 96],
      [1, 0, 96, 0, 24],
      [0, 1, 24, -96, -24],
      [-1, 0, 0, -72, 0],
      [1, 0, 24, 24, 72],
      [0, 1, 72, -24, 0],
    ]);
  });

  it('measures a C island to the room and once across its pocket', () => {
    const roomWalls = [
      rect('n', 'R', -10, 300, 400, 310), rect('s', 'R', -10, -310, 400, -300),
      rect('w', 'R', -310, -310, -300, 310), rect('e', 'R', 400, -310, 410, 310),
    ];
    const c = [rect('spine', 'I', 0, 0, 24, 96), rect('top', 'I', 24, 72, 72, 96), rect('bot', 'I', 24, 0, 72, 24)];
    expect(rows(partClearances([...c, ...roomWalls], [['I']]))).toEqual([
      ['island', 36, 0, 36, -300, 300],
      ['island', 24, 48, 400, 48, 376],
      ['island', 36, 96, 36, 300, 204],
      ['island', 0, 48, -300, 48, 300],
      ['island', 48, 72, 48, 24, 48],
      ['island', 72, 12, 400, 12, 328],
      ['island', 72, 84, 400, 84, 328],
    ]);
  });

  it('dimensions an island from its cabinets and end panels, and its aisle once', () => {
    const withRun = box();
    withRun[2].runs = [northRun()];
    expect(rows(planClearances(build([...withRun, island()]), S))).toEqual([
      ['island', 120, 120.8125, 120, 155.1875, 34.375],
      ['island', 120, 71.1875, 120, 0, 71.1875],
      ['island', 72, 96, 0, 96, 72],
      ['island', 168, 96, 240, 96, 72],
    ]);
    // With no run across, the front measures to the wall face. An upper on the island doesn't count.
    const upper = run('U', 'front', { cabinetTypeId: CABINET_TYPE_IDS.UPPER, depth: 12 });
    expect(rows(planClearances(build([...box(), island([run('F', 'front'), run('K', 'back'), upper])]), S))).toEqual([
      ['island', 120, 120.8125, 120, 180, 59.1875],
      ['island', 120, 71.1875, 120, 0, 71.1875],
      ['island', 72, 96, 0, 96, 72],
      ['island', 168, 96, 240, 96, 72],
    ]);
  });

  it('dimensions the aisle between two facing runs, and nothing for a lone wall', () => {
    const galley = [
      wall('W1', 0, 0, 240, 0, { thickness: 4.5, runs: [run('A', 'front', { x: 0, width: 120, anchors: { left: false, right: false }, ends: ENDS })] }),
      wall('W3', 240, 120, 0, 120, { thickness: 4.5, runs: [run('B', 'front', { x: 60, width: 120, anchors: { left: false, right: false }, ends: ENDS })] }),
    ];
    expect(rows(planClearances(build(galley), S))).toEqual([['aisle', 90, 24.8125, 90, 95.1875, 70.375]]);
    expect(planClearances(build([island()]), S)).toEqual([]);
  });

  it('finds islands inside a closed room or an open U, and not a peninsula', () => {
    const closed = build([...box(), island()]);
    expect(islandGroups(closed, clearanceParts(closed, S))).toEqual([['I']]);

    const open = build([
      wall('U1', 0, 0, 240, 0, { thickness: 4.5, connections: { start: null, end: link('U2', 'start') } }),
      wall('U2', 240, 0, 240, 180, { thickness: 4.5, connections: { start: link('U1', 'end'), end: link('U3', 'start') } }),
      wall('U3', 240, 180, 0, 180, { thickness: 4.5, connections: { start: link('U2', 'end'), end: null } }),
      island(),
    ]);
    expect(islandGroups(open, clearanceParts(open, S))).toEqual([['I']]);
    expect(rows(planClearances(open, S))).toEqual([
      ['island', 120, 120.8125, 120, 180, 59.1875],
      ['island', 120, 71.1875, 120, 0, 71.1875],
      ['island', 168, 96, 240, 96, 72],
    ]);

    const peninsula = build([
      ...box(),
      wall('P', 120, 180, 120, 120, {
        landings: { start: { wallId: 'W3', side: 'front', to: 'near', ref: 'left', offset: 0 }, end: null },
      }),
    ]);
    expect(islandGroups(peninsula, clearanceParts(peninsula, S))).toEqual([]);
  });
});
```

Working (INSET, 24" bases): a run's front is 24 13/16" deep in plan (24 + the 13/16" frame, no bumper).
- **Island in the room:** the island's wall is y 96. `F` (front, north) reaches y 96 + 24.8125 = 120.8125 and `K` (back, south) reaches 96 − 24.8125 = 71.1875. The north wall's run `N` (x 72–168, against the wall face at y 180) has its front at 180 − 24.8125 = 155.1875, so the aisle is 155.1875 − 120.8125 = 34.375. The end panels stand at x 72 and 168, so the ends measure 72 to the wall faces at x 0 and 240. The south face of the room is at y 0: 71.1875.
- **Galley:** `A` (y 0 to 24.8125) and `B` (y 120 down to 95.1875) overlap for x 60–120, so the dimension is at x 90, 95.1875 − 24.8125 = 70.375.
- **L:** the 96 × 24 bar and the 24 × 48 leg give six edges, listed counterclockwise from the bottom.
- **C:** the arms' facing edges (y 24 and y 72) are 48 apart, once. The rows follow the parts' order (bottom, spine's inner face, top, west, pocket, the two arm ends).

**Count:** 724 + 5 = **729**.

---

## §7 Step 243 — screen: clearances in plan view

### New `src/elevation/plan/PlanClearances.jsx`

```jsx
import { Group, Line, Rect, Text } from 'react-konva';
import { formatInches } from '../model/units.js';
import { PLAN_BACKGROUND_COLOR, PLAN_DIM_FONT_SIZE } from './constants.js';
import { readableRotation } from './textRotation.js';

const COLOR = '#5eead4';
const TICK_HALF = 4;

/** Plan clearances (SPEC-36.3): a dimension line across each gap, with ticks and a label. */
export default function PlanClearances({ dimensions, scale }) {
  const fontSize = PLAN_DIM_FONT_SIZE / scale;
  return (
    <Group listening={false}>
      {dimensions.map(({
        kind, from, to, length,
      }) => {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const span = Math.hypot(dx, dy);
        const unit = span > 0 ? { x: dx / span, y: dy / span } : { x: 1, y: 0 };
        const tick = { x: (-unit.y * TICK_HALF) / scale, y: (unit.x * TICK_HALF) / scale };
        const text = formatInches(length);
        const width = (text.length * 0.6 * PLAN_DIM_FONT_SIZE + 8) / scale;
        const height = (PLAN_DIM_FONT_SIZE + 4) / scale;
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        return (
          <Group key={`${kind}:${from.x}:${from.y}:${to.x}:${to.y}`}>
            <Line points={[from.x, from.y, to.x, to.y]} stroke={COLOR} strokeWidth={1 / scale} />
            {[['from', from], ['to', to]].map(([end, point]) => (
              <Line
                key={end}
                points={[point.x - tick.x, point.y - tick.y, point.x + tick.x, point.y + tick.y]}
                stroke={COLOR}
                strokeWidth={1 / scale}
              />
            ))}
            <Group x={(from.x + to.x) / 2} y={(from.y + to.y) / 2} rotation={readableRotation(angle)}>
              <Rect
                x={-width / 2}
                y={-height / 2}
                width={width}
                height={height}
                fill={PLAN_BACKGROUND_COLOR}
                opacity={0.85}
              />
              <Text
                x={-width / 2}
                y={-height / 2}
                width={width}
                height={height}
                align="center"
                verticalAlign="middle"
                text={text}
                fontSize={fontSize}
                fill={COLOR}
              />
            </Group>
          </Group>
        );
      })}
    </Group>
  );
}
```

### `src/elevation/plan/PlanCanvas.jsx` (1245)

- Imports: after the `LiveEntryInput` import (37) add `import { planClearances } from '../model/clearances.js';`. After the `PlanAlignmentGuides` import (78) add `import PlanClearances from './PlanClearances.jsx';`.
- After the `collisionMessages` memo (ends at 135, `}, [room, settings]);`) add:

```js
  const clearances = useMemo(
    () => (room ? planClearances(room, settings) : []),
    [room, settings],
  );
```

- In the Layer, between the wall end panels block (ends `)))}` at 1062) and `{walls.flatMap((wall) => (wall.soffits ?? []).map(…` (1064):

```jsx
            <PlanClearances dimensions={clearances} scale={scale} />
```

Nothing else in the file changes. The clearances follow the drawing, not the wall-move preview.

No new tests (components). **Count stays 729.**

**Done when (round):** `npm test` (729) and `npm run lint` clean.

## §8 Check by hand

See the end of PROMPTS-36.3.

## §9 Left for later

- **Clearances aren't selectable, editable or hideable.** No setting for the 1" minimum.
- **Angled edges get no clearance.** Only parallel, facing edges are measured, so an island wall drawn off-square gets none.
- **Islands are defined by containment**, per the plan. Two free-standing walls whose footprints lie in each other's bounding box would both count. A group inside an open U counts even when the U's mouth is nowhere near it.
- **Uppers are ignored everywhere**, including an island's own uppers.
- **A wall end panel's mitered corner isn't drawn** in the clearance parts: they use its plain rectangle.
- **The frame's 13/16" is included** in a face frame run's front, as everywhere in plan. Clearances to a European run's front include its bumper and door.
- **Hanging:** only bases; a tall or an upper's own drop stays as it is. A hanging base in a European room does nothing, and the stored flag comes back if the room goes inset.
- **The rail/mullion choice is per seam between two leaves.** A seam beside a section that is itself split can't be turned off (only its leaves' own seams can), so a nested layout can't share an opening across the nesting.
- **Reports:** the frame's stiles/rails list already follows the toggle. Nothing else in a report reads `noRail` or `hanging` yet.
