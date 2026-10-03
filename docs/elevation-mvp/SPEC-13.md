# Elevation Lab — SPEC-13 (cabinet face layouts, European)

Steps 51–59. The earlier SPEC files still apply; this file is the source of truth for what follows. `docs/elevation-mvp/FACES-PLAN.md` has the reasoning and the later rounds.

Repo state when this was written: `feature/elevation-mvp` at `4bd12c7` (step 50), working tree clean.

Current sizes of the files this round touches:

| File | Lines |
|---|---:|
| `components/PropertiesPanel.jsx` | 1,656 (only three small edits, in step 57) |
| `components/ElevationCanvas.jsx` | 906 |
| `store/elevationSlice.js` | 912 |
| `store/persistence.js` | 546 |
| `components/RunGroup.jsx` | 380 |
| `model/constants.js` | ~90 |
| `model/index.js` | 112 |

Everything else is a new file.

**Scope:** European style only. Reveals come from settings by cabinet type. There are no per-cabinet reveal overrides, rules or face frame yet (rounds 14 and 15). Nothing here changes `splitRun`, run widths, dimensions or the plan view.

---

## §1 The data

A cabinet item (`kind: 'cabinet'`) gets an optional `face`:

- `undefined` or `null` means **default**: one door, or a pair door when the piece is wider than `settings.pairDoorAboveWidth` (24"). The default follows the cabinet's width as the run changes.
- Otherwise `face` is a node:

```js
// leaf
{ type: 'drawer_front', size: 6 }        // size: inches along the parent's direction, or null = auto
// group
{ direction: 'vertical', size: null, children: [node, node, ...] }   // 2+ children
```

- **Direction:** `'vertical'` stacks children **top to bottom**; `'horizontal'` places them **left to right**. These match ff-job-schedule's `SPLIT_DIRECTIONS`.
- **Leaf types:** `door`, `pair_door`, `drawer_front`, `false_front`, `panel`, `open`. These match the estimator's `FACE_NAMES` values.
- **`size`:** the finished face size along the parent's direction: height for a child of a vertical group, width for a child of a horizontal group. The root's `size` is ignored and always `null`.
- **A group's fixed size** is its total span, including the gaps inside it.
- **Paths** address nodes: the root is `'r'`, its children are `'r.0'`, `'r.1'`, and so on, then `'r.0.2'`, etc. Paths are not stored. They are only used for selection and edits.

---

## §2 Settings (step 51)

In `model/constants.js`, add to `DEFAULT_SETTINGS`, after `openingSnap: 0.5,` (line 59):

```js
  pairDoorAboveWidth: 24,
  faceReveals: {
    [CABINET_TYPE_IDS.BASE]: {
      top: 0.25, bottom: 0.125, left: 0.0625, right: 0.0625, horizontal: 0.125, vertical: 0.125,
    },
    [CABINET_TYPE_IDS.UPPER]: {
      top: 0.125, bottom: -0.125, left: 0.0625, right: 0.0625, horizontal: 0.125, vertical: 0.125,
    },
    [CABINET_TYPE_IDS.TALL]: {
      top: 0.125, bottom: 0.125, left: 0.0625, right: 0.0625, horizontal: 0.125, vertical: 0.125,
    },
  },
```

- **Edge reveals** (`top`, `bottom`, `left`, `right`) are measured inward from the box edge; negative means overhang. The upper's −1/8" bottom hangs below the box.
- **`horizontal`** is the gap between stacked faces; **`vertical`** is the gap between side-by-side faces, including the two halves of a pair door.
- `CABINET_TYPE_IDS` is defined in the same file above `DEFAULT_SETTINGS`, so it's in scope.

---

## §3 `model/faces.js` (step 51, new)

```js
import { DEFAULT_SETTINGS } from './constants.js';

/** Leaf face types — the same values as ff-job-schedule FACE_NAMES. */
export const FACE_TYPES = ['door', 'pair_door', 'drawer_front', 'false_front', 'panel', 'open'];

export const FACE_TYPE_LABELS = {
  door: 'Door',
  pair_door: 'Pair door',
  drawer_front: 'Drawer front',
  false_front: 'False front',
  panel: 'Panel',
  open: 'Open',
};

/** 'vertical' stacks children top to bottom; 'horizontal' places them left to right. */
export const FACE_DIRECTIONS = ['vertical', 'horizontal'];

/** An auto section smaller than this (inches) produces a 'face-too-small' warning. */
export const MIN_FACE_SIZE = 1;

export const ROOT_FACE_PATH = 'r';

const ZERO_REVEALS = { top: 0, bottom: 0, left: 0, right: 0, horizontal: 0, vertical: 0 };

function isSize(size) {
  return size === null || (Number.isFinite(size) && size > 0);
}

/** Whether a value is a valid stored face node (recursively). */
export function isFaceNode(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
  if (!isSize(node.size)) return false;
  if (FACE_TYPES.includes(node.type)) {
    return node.children === undefined && node.direction === undefined;
  }
  return node.type === undefined
    && FACE_DIRECTIONS.includes(node.direction)
    && Array.isArray(node.children)
    && node.children.length >= 2
    && node.children.every(isFaceNode);
}

/** The face a cabinet shows before anyone edits it. */
export function defaultFace(width, settings) {
  const threshold = settings.pairDoorAboveWidth ?? DEFAULT_SETTINGS.pairDoorAboveWidth;
  return { type: width > threshold ? 'pair_door' : 'door', size: null };
}

/** The six reveal values for a cabinet type. */
export function faceRevealsFor(cabinetTypeId, settings) {
  return {
    ...ZERO_REVEALS,
    ...(settings.faceReveals?.[cabinetTypeId] ?? DEFAULT_SETTINGS.faceReveals[cabinetTypeId]),
  };
}

/** The rectangle the faces fill: the piece minus its edge reveals. */
export function faceArea(piece, reveals) {
  return {
    x: piece.x + reveals.left,
    z: piece.z + reveals.bottom,
    width: piece.width - reveals.left - reveals.right,
    height: piece.height - reveals.top - reveals.bottom,
  };
}

/**
 * Resolve a face tree into true face rectangles, in wall coordinates.
 * A pair_door leaf produces two rectangles with the same path (half 'left' / 'right').
 *
 * @returns {{faces: {path, type, half?, x, z, width, height}[], warnings: {code, path}[]}}
 */
export function resolveFaces(face, area, reveals) {
  const faces = [];
  const warnings = [];

  const place = (node, rect, path) => {
    if (node.type) {
      if (node.type === 'pair_door') {
        const half = (rect.width - reveals.vertical) / 2;
        faces.push({ path, type: node.type, half: 'left', x: rect.x, z: rect.z, width: half, height: rect.height });
        faces.push({
          path,
          type: node.type,
          half: 'right',
          x: rect.x + half + reveals.vertical,
          z: rect.z,
          width: half,
          height: rect.height,
        });
      } else {
        faces.push({ path, type: node.type, ...rect });
      }
      return;
    }

    const stacked = node.direction === 'vertical';
    const gap = stacked ? reveals.horizontal : reveals.vertical;
    const length = stacked ? rect.height : rect.width;
    const lastIndex = node.children.length - 1;
    const hasAuto = node.children.some((child) => child.size === null);
    const isAuto = (child, index) => child.size === null || (!hasAuto && index === lastIndex);
    const fixedTotal = node.children.reduce(
      (sum, child, index) => (isAuto(child, index) ? sum : sum + child.size),
      0,
    );
    const autoCount = node.children.filter(isAuto).length;
    const autoSize = (length - gap * lastIndex - fixedTotal) / autoCount;
    if (autoSize < MIN_FACE_SIZE) warnings.push({ code: 'face-too-small', path });

    let cursor = stacked ? rect.z + rect.height : rect.x;
    node.children.forEach((child, index) => {
      const size = isAuto(child, index) ? autoSize : child.size;
      const childRect = stacked
        ? { x: rect.x, z: cursor - size, width: rect.width, height: size }
        : { x: cursor, z: rect.z, width: size, height: rect.height };
      place(child, childRect, `${path}.${index}`);
      cursor = stacked ? cursor - size - gap : cursor + size + gap;
    });
  };

  place(face, area, ROOT_FACE_PATH);
  return { faces, warnings };
}

/** Resolved faces for one cabinet piece from splitRun. */
export function cabinetFaces(item, piece, cabinetTypeId, settings) {
  const reveals = faceRevealsFor(cabinetTypeId, settings);
  const face = item?.face ?? defaultFace(piece.width, settings);
  return resolveFaces(face, faceArea(piece, reveals), reveals);
}
```

Notes:

- **No rounding.** Every default value is a multiple of 1/16", so the fixtures come out exact. Rounding to shop sizes is a later decision.
- **The "last fixed child becomes auto" rule** means a group can never be over-specified. It can only be too tight, which the warning reports.
- **Export these from `model/index.js`** in a new block after the `constants.js` block: `FACE_DIRECTIONS`, `FACE_TYPE_LABELS`, `FACE_TYPES`, `MIN_FACE_SIZE`, `ROOT_FACE_PATH`, `cabinetFaces`, `defaultFace`, `faceArea`, `faceRevealsFor`, `isFaceNode`, `resolveFaces`.

---

## §4 `model/faceTree.js` (step 52, new)

These are pure edits. Each returns a **new** tree, never mutates its input, and returns the input unchanged (same reference) when the edit doesn't apply.

```js
import { FACE_DIRECTIONS, FACE_TYPES, ROOT_FACE_PATH } from './faces.js';

/** Most sections a single split or count can create. */
export const MAX_FACE_SPLIT = 8;

function indexesOf(path) {
  return path === ROOT_FACE_PATH ? [] : path.split('.').slice(1).map(Number);
}

export function parentFacePath(path) {
  if (path === ROOT_FACE_PATH) return null;
  return path.split('.').slice(0, -1).join('.');
}

export function getFaceNode(face, path) {
  let node = face;
  for (const index of indexesOf(path)) node = node?.children?.[index];
  return node ?? null;
}

function replaceAt(face, path, replacer) {
  const next = structuredClone(face);
  if (path === ROOT_FACE_PATH) return replacer(next);
  const parent = getFaceNode(next, parentFacePath(path));
  const index = indexesOf(path).at(-1);
  parent.children[index] = replacer(parent.children[index]);
  return next;
}

/** Pre-order rows for the panel outline: [{path, depth, node}]. */
export function faceOutline(face) {
  const rows = [];
  const walk = (node, path, depth) => {
    rows.push({ path, depth, node });
    node.children?.forEach((child, index) => walk(child, `${path}.${index}`, depth + 1));
  };
  walk(face, ROOT_FACE_PATH, 0);
  return rows;
}

export function setFaceType(face, path, type) {
  const target = getFaceNode(face, path);
  if (!target?.type || !FACE_TYPES.includes(type)) return face;
  return replaceAt(face, path, (node) => ({ ...node, type }));
}

export function setFaceSize(face, path, size) {
  if (path === ROOT_FACE_PATH || !getFaceNode(face, path)) return face;
  if (size !== null && !(Number.isFinite(size) && size > 0)) return face;
  return replaceAt(face, path, (node) => ({ ...node, size }));
}

/**
 * Split a leaf into `count` equal (auto) sections of its type.
 * Same direction as its parent: the new sections become siblings in the parent (flat).
 * Otherwise: the leaf becomes a group that keeps the leaf's size.
 */
export function splitFace(face, path, direction, count) {
  const target = getFaceNode(face, path);
  if (!target?.type || !FACE_DIRECTIONS.includes(direction) || !Number.isFinite(count)) return face;
  const n = Math.min(MAX_FACE_SPLIT, Math.max(2, Math.round(count)));
  const copies = Array.from({ length: n }, () => ({ type: target.type, size: null }));
  const parentPath = parentFacePath(path);
  const parent = parentPath === null ? null : getFaceNode(face, parentPath);
  if (parent && parent.direction === direction) {
    const index = indexesOf(path).at(-1);
    return replaceAt(face, parentPath, (node) => ({
      ...node,
      children: [...node.children.slice(0, index), ...copies, ...node.children.slice(index + 1)],
    }));
  }
  return replaceAt(face, path, (node) => ({ direction, size: node.size, children: copies }));
}

/** Change how many sections a group has. Added ones copy the last leaf's type; 1 collapses the group. */
export function setGroupCount(face, path, count) {
  const target = getFaceNode(face, path);
  if (!target?.children || !Number.isFinite(count)) return face;
  const n = Math.min(MAX_FACE_SPLIT, Math.max(1, Math.round(count)));
  if (n === 1) return replaceAt(face, path, (node) => ({ ...node.children[0], size: node.size }));
  return replaceAt(face, path, (node) => {
    const fillType = node.children.at(-1).type ?? 'door';
    const children = node.children.slice(0, n);
    while (children.length < n) children.push({ type: fillType, size: null });
    return { ...node, children };
  });
}

/** Remove a section. A group left with one child collapses into it, keeping the group's size. */
export function removeFace(face, path) {
  const parentPath = parentFacePath(path);
  if (parentPath === null || !getFaceNode(face, path)) return face;
  const index = indexesOf(path).at(-1);
  return replaceAt(face, parentPath, (node) => {
    const children = node.children.filter((_, childIndex) => childIndex !== index);
    return children.length === 1 ? { ...children[0], size: node.size } : { ...node, children };
  });
}

/** Make every child of a group auto (equal). */
export function equalizeGroup(face, path) {
  const target = getFaceNode(face, path);
  if (!target?.children) return face;
  return replaceAt(face, path, (node) => ({
    ...node,
    children: node.children.map((child) => ({ ...child, size: null })),
  }));
}
```

Export all ten names from `model/index.js` in a block right after the `faces.js` block.

---

## §5 `model/facePresets.js` (step 53, new)

The European presets. The 6" top drawer and the 30 1/4" lower section are the estimator's style-13 values (`STYLE_BASE_DRAWER_HEIGHT`, `STYLE_BOTTOM_HEIGHT` in ff-job-schedule `config/cabinetFacePresets.js`).

```js
import { CABINET_TYPE_IDS } from './constants.js';

const { BASE, UPPER, TALL } = CABINET_TYPE_IDS;
const leaf = (type, size = null) => ({ type, size });
const stack = (children, size = null) => ({ direction: 'vertical', size, children });

export const FACE_PRESETS = [
  { key: 'd', label: 'D', description: 'Door', cabinetTypeIds: [BASE, UPPER, TALL], face: leaf('door') },
  { key: 'pd', label: 'PD', description: 'Pair door', cabinetTypeIds: [BASE, UPPER, TALL], face: leaf('pair_door') },
  { key: '2d', label: '2D', description: '2-door stack', cabinetTypeIds: [BASE, UPPER, TALL], face: stack([leaf('door'), leaf('door')]) },
  { key: '2df', label: '2Df', description: '2-drawer stack', cabinetTypeIds: [BASE], face: stack([leaf('drawer_front'), leaf('drawer_front')]) },
  { key: '3df', label: '3Df', description: '3-drawer stack', cabinetTypeIds: [BASE], face: stack([leaf('drawer_front', 6), leaf('drawer_front'), leaf('drawer_front')]) },
  { key: '4df', label: '4Df', description: '4-drawer stack', cabinetTypeIds: [BASE], face: stack([leaf('drawer_front', 6), leaf('drawer_front', 6), leaf('drawer_front'), leaf('drawer_front')]) },
  { key: 'df_d', label: 'Df/D', description: 'Drawer front over door', cabinetTypeIds: [BASE], face: stack([leaf('drawer_front', 6), leaf('door')]) },
  { key: 'df_pd', label: 'Df/PD', description: 'Drawer front over pair door', cabinetTypeIds: [BASE], face: stack([leaf('drawer_front', 6), leaf('pair_door')]) },
  { key: 'fs', label: 'FS', description: '7" opening over pair door', cabinetTypeIds: [BASE], face: stack([leaf('open', 7), leaf('pair_door')]) },
  { key: 'd_4df', label: 'D/4Df', description: 'Door over 4-drawer stack', cabinetTypeIds: [TALL], face: stack([leaf('door'), stack([leaf('drawer_front', 6), leaf('drawer_front', 6), leaf('drawer_front'), leaf('drawer_front')], 30.25)]) },
  { key: 'pd_3df', label: 'PD/3Df', description: 'Pair door over 3-drawer stack', cabinetTypeIds: [TALL], face: stack([leaf('pair_door'), stack([leaf('drawer_front', 6), leaf('drawer_front'), leaf('drawer_front')], 30.25)]) },
];

/** Presets available for a run's cabinet type, in list order. */
export function presetsFor(cabinetTypeId) {
  return FACE_PRESETS.filter((preset) => preset.cabinetTypeIds.includes(cabinetTypeId));
}
```

- The estimator nests 4Df as `[2 × 6" pair group, 2 equal]`; here it's flat, `[6, 6, auto, auto]`, which resolves to the same sizes.
- `// SPEC-QUESTION` for Kyle, not the agent: are 6" and 30 1/4" finished face sizes in the estimator? They're used as face sizes here.
- Export `FACE_PRESETS` and `presetsFor` from `model/index.js` after the `faceTree.js` block.

---

## §6 Persistence (step 54)

In `store/persistence.js`:

1. **Validate faces.** `isItem` (line 109) gains one clause at the end:

   ```js
       && (item.face === undefined || item.face === null
         || (item.kind === 'cabinet' && isFaceNode(item.face)));
   ```

   Import `isFaceNode` from `'../model/faces.js'`. `faces.js` imports only `constants.js`, so there's no cycle. A malformed face makes the document invalid, exactly as a malformed pin does today.
2. **Default the new settings on load.** Add `'pairDoorAboveWidth'` and `'faceReveals'` to `V2_DEFAULTED_SETTING_KEYS` (lines 71–86), so documents saved before this round pick up the defaults.
3. **Nothing else changes.** `toElevationDocument` already spreads items through, so `face` round-trips. `isSettings` does not validate the new keys, on purpose; the settings UI for reveals is round 14.

---

## §7 Store (step 55)

In `store/elevationSlice.js`:

- **Initial state** (line ~89): add `facePath: null` beside `selection`. It's top-level, **not** inside `selection`. Nine existing tests assert `selection` with `toEqual`, and they must not change.
- **Two new reducers**, placed after `removeItem` (ends line ~814), and exported in the list at line ~858:

```js
    setItemFace(state, action) {
      const location = runLocation(state, action.payload);
      if (!location) return;
      const { itemIds = [], face = null } = action.payload;
      for (const item of location.run.items) {
        if (item.kind !== 'cabinet' || !itemIds.includes(item.id)) continue;
        item.face = face === null ? null : structuredClone(face);
      }
    },
    setFacePath(state, action) {
      state.facePath = action.payload ?? null;
    },
```

- **`setItemFace` doesn't call `syncRoomAt`**, because faces don't affect layout. It clones per item so two cabinets never share a node.
- **Reset `state.facePath = null`** in three places:
  - in `clearTransientSelection` (line 155), after the selection assignment
  - in `setSelection` (line 816), after the selection assignment
  - in `removeItem`, inside the existing `if (state.selection.pieceId === …)` block

  That covers selecting another piece, deleting, Esc and view or room changes.
- `persistence.toElevationDocument` doesn't include `facePath`. It's transient, and no change is needed there.

---

## §8 Drawing faces (step 56)

**New `components/FaceOutlines.jsx`:**

```jsx
import { Rect } from 'react-konva';
import { wallRectToScreen } from '../canvas/transform.js';

export default function FaceOutlines({ faces, transform, selectedPath = null, selectable = false, onSelectFace }) {
  return faces.map((face) => {
    const rect = wallRectToScreen(face, transform);
    const selected = selectedPath !== null
      && (face.path === selectedPath || face.path.startsWith(`${selectedPath}.`));
    return (
      <Rect
        key={`${face.path}:${face.half ?? ''}`}
        {...rect}
        stroke={selected ? '#7dd3fc' : '#e2e8f0'}
        strokeWidth={selected ? 2 : 1}
        dash={face.type === 'open' ? [4, 3] : undefined}
        fill={selectable ? 'rgba(0, 0, 0, 0.001)' : undefined}
        listening={selectable}
        onClick={selectable ? (event) => {
          event.cancelBubble = true;
          onSelectFace?.(face.path);
        } : undefined}
      />
    );
  });
}
```

(`selectedPath`, `selectable` and `onSelectFace` go unused until step 59; they're in the component now so step 59 only wires them up.)

**In `components/RunGroup.jsx`:**

- Compute the faces once per layout, after `result`:

```js
  const faceLayouts = useMemo(() => new Map(
    result.pieces
      .filter((piece) => piece.kind === 'cabinet' && piece.role === 'item')
      .map((piece) => [
        piece.id,
        cabinetFaces(
          run.items.find((candidate) => candidate.id === piece.id),
          piece,
          run.cabinetTypeId,
          settings,
        ),
      ]),
  ), [result, run, settings]);
```

- Render right after the `result.pieces.map(... <PieceRect .../>)` block (ends line ~280):

```jsx
      {[...faceLayouts].map(([pieceId, layout]) => (
        <FaceOutlines key={`faces:${pieceId}`} faces={layout.faces} transform={transform} />
      ))}
```

- Import `cabinetFaces` from `'../model/faces.js'` and `FaceOutlines` from `'./FaceOutlines.jsx'`.

The outlines are drawn over `PieceRect`, so the width label shows through the lines. That's accepted. Fillers and end panels get no faces. The preview ghost `RunGroup` shows faces too, which is fine.

---

## §9 Panel: presets and outline (step 57)

**New `components/properties/FaceProperties.jsx`**, with props `{ wall, run, piece, item, layout, settings }`. `layout` is the run's `splitRun` result; it's unused until step 58.

**Local values:**
- `facePath` from `useSelector((state) => state.elevation.facePath)`
- `stored = item.face ?? null`
- `face = stored ?? defaultFace(piece.width, settings)`
- `{ warnings } = cabinetFaces(item, piece, run.cabinetTypeId, settings)`

**`commit(nextFace)`** dispatches `setItemFace({ wallId: wall.id, runId: run.id, itemIds: [item.id], face: nextFace })`. Every edit goes through it. Editing a default face stores the materialized tree.

**What it renders, as one `<section>` titled "Faces":**

1. **Header row:** the text "Faces", plus "Default" in gray when `stored === null`, or a small "Reset" button when it isn't. Reset commits `null` and dispatches `setFacePath(null)`.
2. **Preset buttons** from `presetsFor(run.cabinetTypeId)`, styled like the existing small gray buttons. Show the label; the description is the `title`. Click commits `preset.face` and dispatches `setFacePath(null)`.
3. **The outline:** `faceOutline(face)` rows, each indented `depth * 12px`.
   - Clicking a row dispatches `setFacePath(path)`; the row whose `path === facePath` gets a blue left border.
   - **Leaf row:** a `<select>` of `FACE_TYPES` with `FACE_TYPE_LABELS`. On change, commit `setFaceType(face, path, value)`.
   - **Group row:** the text `Stack × n` (vertical) or `Side by side × n` (horizontal).
   - **Every row except the root:** an `InchInput` with `allowBlank` and `placeholder="auto"`, showing `node.size`. On commit, apply `setFaceSize(face, path, value)`; if that returns the same reference, return `false` so the input reverts.
4. **Warnings:** if `warnings.length > 0`, one amber line: "Sections don't fit. Reduce a fixed size."

**In `components/PropertiesPanel.jsx`**, thread `layout` through without reading the rest of the file:

- line ~1637, the `<PieceProperties` call: add `layout={layout}` (the undecorated `layout` from line ~1566, not `displayLayout`)
- line 1314, `PieceProperties({ wall, run, selectionContext, settings })`: add `layout` and pass it to `<CabinetProperties … layout={layout} />`
- line 1012, `CabinetProperties({ wall, run, piece, item, settings })`: add `layout`, and render `<FaceProperties wall={wall} run={run} piece={piece} item={item} layout={layout} settings={settings} />` as the last child of its outer `<div>`, after the section with the Split in 2 / Add / Remove buttons (ends line ~1257)
- import `FaceProperties` from `'./properties/FaceProperties.jsx'`

---

## §10 Panel: actions (step 58)

All of this goes in `FaceProperties.jsx` only. It's a block under the outline, shown when `facePath` resolves to a node (`getFaceNode(face, facePath)`):

- **Leaf selected:**
  - a number input "Sections" (min 2, max 8, default 2)
  - two buttons: "Stack", which commits `splitFace(face, facePath, 'vertical', n)`, and "Side by side", which commits `splitFace(face, facePath, 'horizontal', n)`
  - `facePath` stays as it is after a split
- **Group selected:**
  - a number input "Sections" showing `children.length` (min 1, max 8); on change, commit `setGroupCount(face, facePath, n)`
  - a "Make equal" button, which commits `equalizeGroup(face, facePath)`
- **Any selected node except the root:** a "Remove" button, which commits `removeFace(face, facePath)`, then dispatches `setFacePath(parentFacePath(facePath))`.
- **Always shown, below the block:** "Apply to same-width cabinets".
  - The target ids come from `layout.pieces`: pieces with `kind === 'cabinet'` and `role === 'item'` whose `Math.abs(p.width - piece.width) < 1e-6`.
  - Dispatch `setItemFace({ wallId, runId, itemIds, face: stored })`. This copies the default (`null`) too, which resets the others.
  - Disabled when there are no other matching cabinets.

---

## §11 Selecting a face on the canvas (step 59)

**`components/RunGroup.jsx`:**
- Add the props `selectedFacePath = null` and `onSelectFace`.
- Pass them to each `FaceOutlines`: `selectable={!preview && selectedPieceId === pieceId}`, `selectedPath={selectedPieceId === pieceId ? selectedFacePath : null}` and `onSelectFace={onSelectFace}`.

**`components/ElevationCanvas.jsx`:**
1. Line 91: also read `facePath` from `state.elevation`.
2. Beside `selectPiece` (line 574):

   ```js
     const selectFace = useCallback((path) => {
       if (tool !== 'select' || suppressClickRef.current) return;
       dispatch(setFacePath(path));
     }, [dispatch, tool]);
   ```

3. The main `<RunGroup` (line ~750) gets `selectedFacePath={selection.runId === run.id ? facePath : null}` and `onSelectFace={selectFace}`. The preview `<RunGroup` (line ~878) gets neither.
4. **Esc** (line 367): after the drag and stretch branches, `else if (facePath) dispatch(setFacePath(null));`, before the existing `else dispatch(setSelection({}));`. The first Esc leaves the face and the second leaves the cabinet.
5. Import `setFacePath` beside `setSelection`.

**Resulting behavior:**
- Clicking a cabinet selects it, as now.
- Once selected, its faces are clickable: clicking one selects that face in the panel outline, and a selected group highlights all its faces.
- Clicking another piece clears `facePath` (§7 resets it in `setSelection`).

---

## §12 Tests

**`model/__tests__/faces.test.js`** (new, step 51). This uses `DEFAULT_SETTINGS` and `CABINET_TYPE_IDS`. Base piece `B18 = {x: 0, z: 4, width: 18, height: 30.5}`, `B30` is the same with `width: 30`, and upper piece `U15 = {x: 0, z: 54, width: 15, height: 30}`.

1. **Default single door.** `cabinetFaces({id: 'a'}, B18, BASE, DEFAULT_SETTINGS)` → `faces` is `[{path: 'r', type: 'door', x: 0.0625, z: 4.125, width: 17.875, height: 30.125}]` and `warnings` is `[]`.
2. **Default pair door above 24".** `cabinetFaces({id: 'a', face: null}, B30, BASE, …)` → two faces, both `path: 'r'`, `type: 'pair_door'`, `z: 4.125`, `height: 30.125`, `width: 14.875`; `half: 'left'` at `x: 0.0625`, and `half: 'right'` at `x: 15.0625`. With `width: 24` → a single `door` with `width: 23.875`.
3. **3Df on B18.** Face `{direction: 'vertical', size: null, children: [{type: 'drawer_front', size: 6}, {type: 'drawer_front', size: null}, {type: 'drawer_front', size: null}]}`:
   - `r.0` → `z: 28.25, height: 6`
   - `r.1` → `z: 16.1875, height: 11.9375`
   - `r.2` → `z: 4.125, height: 11.9375`
   - all at `x: 0.0625, width: 17.875`
4. **Upper reveals.** `cabinetFaces({id: 'u'}, U15, UPPER, …)` → one door `{x: 0.0625, z: 53.875, width: 14.875, height: 30}`.
5. **Nested groups on B30.** Face `{direction: 'vertical', size: null, children: [{direction: 'horizontal', size: 6, children: [{type: 'drawer_front', size: null}, {type: 'drawer_front', size: null}]}, {type: 'pair_door', size: null}]}` → four faces:
   - `r.0.0` → `{x: 0.0625, z: 28.25, width: 14.875, height: 6}`
   - `r.0.1` → `{x: 15.0625, z: 28.25, width: 14.875, height: 6}`
   - `r.1` left half → `{x: 0.0625, z: 4.125, width: 14.875, height: 24}`
   - `r.1` right half → `{x: 15.0625, z: 4.125, width: 14.875, height: 24}`
6. **All fixed means the last one is auto.** Vertical `[drawer_front 6, drawer_front 6]` on B18 → `r.1` has `height: 24`.
7. **Too tight warns but still resolves.** Vertical `[drawer_front 20, drawer_front 10, drawer_front null]` on B18 → three faces and `warnings` equal to `[{code: 'face-too-small', path: 'r'}]`.
8. **`isFaceNode`:**
   - true for the tree in test 5
   - false for a group with one child
   - false for `{type: 'shelf', size: null}`
   - false for `{type: 'door', size: -2}`
   - false for `{type: 'door', size: null, children: []}`
   - false for `{type: 'door'}` (missing size)

**`model/__tests__/faceTree.test.js`** (new, step 52). Fixtures:
- `DOOR = {type: 'door', size: null}`
- `TWO = {direction: 'vertical', size: null, children: [{type: 'drawer_front', size: 6}, {type: 'door', size: null}]}`
- `BASE3 =` the 3Df tree from test 3

Deep-freeze every fixture before use.

9. **`splitFace(DOOR, 'r', 'vertical', 3)`** → `{direction: 'vertical', size: null, children: [DOOR, DOOR, DOOR]}` (equal by value).
10. **Same direction flattens.** `splitFace(TWO, 'r.1', 'vertical', 2)` → children `[{drawer_front, 6}, {door, null}, {door, null}]`.
11. **Other direction nests and keeps the size.** `splitFace(TWO, 'r.0', 'horizontal', 2)` → children `[{direction: 'horizontal', size: 6, children: [{drawer_front, null}, {drawer_front, null}]}, {door, null}]`.
12. **Count clamps.** `splitFace(DOOR, 'r', 'vertical', 1)` has 2 children, and `splitFace(DOOR, 'r', 'vertical', 20)` has 8. `splitFace(TWO, 'r', 'vertical', 2)` returns `TWO` itself (not a leaf).
13. **`setGroupCount(BASE3, 'r', n)`:**
    - `4` → sizes `[6, null, null, null]`, all `drawer_front`
    - `2` → `[6, null]`
    - `1` → `{type: 'drawer_front', size: null}`
14. **`removeFace`:**
    - `removeFace(TWO, 'r.1')` → `{type: 'drawer_front', size: null}`
    - `removeFace(result of test 11, 'r.0.1')` → equals `TWO`
    - `removeFace(TWO, 'r')` returns `TWO` itself
15. **`setFaceType` / `setFaceSize`:**
    - `setFaceType(TWO, 'r.1', 'pair_door')` sets `children[1].type`
    - `setFaceType(TWO, 'r', 'door')` and `setFaceType(TWO, 'r.1', 'shelf')` return `TWO` itself
    - `setFaceSize(TWO, 'r.1', 24)` sets `children[1].size` to 24
    - `setFaceSize(TWO, 'r.0', null)` sets it to null
    - `setFaceSize(TWO, 'r', 4)` and `setFaceSize(TWO, 'r.0', 0)` return `TWO` itself
16. **`equalizeGroup(BASE3, 'r')`** → all three sizes `null`.
17. **Outline and lookups:**
    - `faceOutline(result of test 11)` → paths `['r', 'r.0', 'r.0.0', 'r.0.1', 'r.1']`, depths `[0, 1, 2, 2, 1]`
    - `getFaceNode(that, 'r.0.1')` → `{type: 'drawer_front', size: null}`
    - `getFaceNode(TWO, 'r.5')` → `null`
    - `parentFacePath('r.0.1')` → `'r.0'`
    - `parentFacePath('r')` → `null`

**`model/__tests__/facePresets.test.js`** (new, step 53):

18. **`presetsFor` keys by type:**
    - `presetsFor(BASE)` → `['d', 'pd', '2d', '2df', '3df', '4df', 'df_d', 'df_pd', 'fs']`
    - `presetsFor(UPPER)` → `['d', 'pd', '2d']`
    - `presetsFor(TALL)` → `['d', 'pd', '2d', 'd_4df', 'pd_3df']`
    - `presetsFor(CABINET_TYPE_IDS.FILLER)` → `[]`
19. **Every preset's `face` passes `isFaceNode`.**
20. **`d_4df` on a tall** piece `{x: 0, z: 4, width: 24, height: 84}`, resolved with `resolveFaces(preset.face, faceArea(piece, r), r)` where `r = faceRevealsFor(TALL, DEFAULT_SETTINGS)`. The result is 5 faces, all at `x: 0.0625, width: 23.875`:

    | Path | z | height |
    |---|---:|---:|
    | `r.0` (door) | 34.5 | 53.375 |
    | `r.1.0` | 28.375 | 6 |
    | `r.1.1` | 22.25 | 6 |
    | `r.1.2` | 13.1875 | 8.9375 |
    | `r.1.3` | 4.125 | 8.9375 |

**`store/__tests__/persistence.test.js`** (step 54), modeled on the pins test at line 254:

21. **A valid face round-trips.** Start from `migrateV1Document(v1Document())` and set `items[0].face` to the tree from test 5:
    - `isElevationDocument(current)` → `true`
    - `loadElevationDocument()` → the item `toMatchObject({face: <that tree>})`
    - then `items[0].face = {type: 'shelf', size: null}` → `false`
    - then `items[0].face = null` → `true`
22. **Old documents get the new settings.** Delete `faceReveals` and `pairDoorAboveWidth` from `current.settings`, store it and load it:
    - `loaded.settings.pairDoorAboveWidth === 24`
    - `loaded.settings.faceReveals` equals `DEFAULT_SETTINGS.faceReveals`

**`store/__tests__/elevationSlice.test.js`** (step 55), using `stateWithRun(run({autoCount: false, items: [fixed('a', 18), fixed('b', 18), {id: 'f', kind: 'filler', width: 3}]}))` and `currentRun`:

23. **`setItemFace` sets cabinets only, with copies.** Dispatch `setItemFace({wallId: 'wall-1', runId: 'run-1', itemIds: ['a', 'b', 'f'], face: {type: 'pair_door', size: null}})`:
    - `a.face` and `b.face` equal that face
    - `a.face !== b.face`
    - `f.face` is `undefined`
24. **`null` resets.** Then dispatch `setItemFace({…, itemIds: ['a'], face: null})` → `a.face === null`, and `b.face` is unchanged.
25. **`facePath` is cleared by selection changes:**
    - `setFacePath('r.1')` → `facePath === 'r.1'`
    - then `setSelection({runId: 'run-1', pieceId: 'b'})` → `null`
    - `setFacePath('r.0')` then `clearSelection()` → `null`
    - `setFacePath('r.0')` then `removeItem({wallId: 'wall-1', runId: 'run-1', itemId: 'b'})`, with `b` selected first → `null`
    - `selection` itself still has exactly its four keys

Steps 56–59 add no tests; they're Konva and panel wiring over tested model code.

---

## §13 Step budget

| Step | Files | Lines read | Tests |
|---|---|---:|---|
| 51 face model | constants.js, index.js, new faces.js + test | ~450 | 1–8 |
| 52 tree edits | new faceTree.js + test, index.js | ~350 | 9–17 |
| 53 presets | new facePresets.js + test, index.js | ~250 | 18–20 |
| 54 persistence | persistence.js, persistence.test.js | ~910 | 21–22 |
| 55 store | elevationSlice.js, elevationSlice.test.js (helpers + end) | ~1,300 | 23–25 |
| 56 draw faces | new FaceOutlines.jsx, RunGroup.jsx | ~420 | none |
| 57 panel outline | new FaceProperties.jsx, 3 spots in PropertiesPanel | ~400 | none |
| 58 panel actions | FaceProperties.jsx | ~250 | none |
| 59 canvas select | RunGroup.jsx, FaceOutlines.jsx, ElevationCanvas.jsx (4 spots) | ~600 | none |

Order: 51 → 52 → 53 and 54 → 55 → 56 → 57 → 58 → 59. Step 54 needs only step 51, so it can run before 52 or 53. `PropertiesPanel.jsx` is edited in exactly three places, in step 57, and no step should read it end to end.
