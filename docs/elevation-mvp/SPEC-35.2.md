# Elevation Lab — SPEC-35.2 (end panels, fillers and the parts below a run)

Steps 204–205, after 35.1. SPEC-35 and SPEC-35.1 still apply. Written against `5d6bd3a` (step 200 + docs); steps
201–203 run first, so the baseline is **669**.

| Step | What | Files |
|---|---|---|
| **204** | Model: where end panels and fillers stop, the chip detail, "return up", and where a part below stops. | `styles.js`, `bottoms.js`, `index.js`, `bottoms.test.js` |
| **205** | On screen: parts stop inside end panels (or run under them), chip line drawn, notes in the panel. | `RunGroup.jsx`, `PieceProperties.jsx` |

## §1 The rule (Kyle, 2026-09-26)

Fillers sit out flush with the doors, so a filler's **face** always goes from the box top down to the bottom of
the doors. When the doors hang below the box, the filler's **return** is held up by that amount, so a part below
can run under it. End panels do the same, except that a part below stops inside them, unless the doors stop flush
above the part.

| Doors and the part | Door bottom reveal | End panel | Filler | The part |
|---|---|---|---|---|
| **Cover** | −(covered) − 1/8" | drops to the door bottom | face drops to the door bottom, return up by the same | stops inside end panels, runs under fillers |
| **Visible** | standard (−1/8" on an upper) | drops 1/8" | face drops 1/8", return up 1/8" | stops inside end panels, runs under fillers |
| **Flush** | +1/8" above the part | sits on the part, box height, **chip detail bottom 1/8"** | same as the end panel | runs under end panels and fillers |

The drops were already right after step 195 (`panelDrop`). What's new: the chip detail, the filler's "return up"
note, and where the part stops.

- **Chip detail:** a 1/8" chip (rabbet or kerf) along the bottom edge of an end panel or filler that sits on a
  part while the doors stop flush above it. The height doesn't change; the chip lines up with the doors' 1/8"
  bottom reveal. It's drawn as a line 1/8" up from the piece's bottom and noted "chip detail bottom 1/8"".
- **Return up:** any filler whose face drops below the box is noted "return up {drop}", even without a part
  below. On an upper with the usual overhang that's "return up 1/8"".
- Euro only, like REV-011. Face frame runs wait for round 36.

---

## §2 Step 204 — model

**`model/styles.js`** (216):
- Import `{ formatInches } from './units.js';`.
- After `panelDrop`:

```js
/**
 * The bottom of a run's end panels and fillers: how far their faces drop below the box to meet the
 * doors, and the chip detail when they sit on a part the doors stop flush above.
 */
export function endPieceBottom(run, style, settings) {
  const below = isInsetStyle(style) ? null : belowRunReveal(run, settings);
  return {
    drop: panelDrop(run, style, settings),
    chip: below !== null && below > 0 ? below : 0,
  };
}

/** Shop notes for an end panel or filler, from endPieceBottom. */
export function endPieceNotes(kind, bottom) {
  const notes = [];
  if (bottom.chip > 0) notes.push(`chip detail bottom ${formatInches(bottom.chip)}`);
  if (kind === 'filler' && bottom.drop > 0) notes.push(`return up ${formatInches(bottom.drop)}`);
  return notes;
}
```

**`model/bottoms.js`** (75) — append:

```js
/**
 * Where the parts below a run start and end along the wall: inside the run's end panels, unless the
 * doors stop flush above the parts (then they run under them). They always run under fillers.
 * `band` is the full span the parts would take ({ start, end }).
 */
export function bottomPartSpan(run, pieces, band, underEndPanels) {
  if (underEndPanels) return band;
  const left = pieces.find((piece) => piece.kind === 'end_panel' && piece.x <= run.x + 1e-6);
  const right = pieces.find((piece) => piece.kind === 'end_panel'
    && piece.x + piece.width >= run.x + run.width - 1e-6);
  return {
    start: left ? Math.max(band.start, left.x + left.width) : band.start,
    end: right ? Math.min(band.end, right.x) : band.end,
  };
}
```

**`model/index.js`**: the bottoms block adds `bottomPartSpan`; the styles block adds `endPieceBottom`,
`endPieceNotes`.

### Tests — `bottoms.test.js`: add `bottomPartSpan` to the bottoms import and `endPieceBottom`, `endPieceNotes`
to the styles import; a describe at the end (2)

```js
describe('SPEC-35.2 end panels and fillers over parts below', () => {
  const RAIL_AS = (doors) => ({ cabinetTypeId: UPPER, bottom: [{ ...RAIL, doors }] });

  it('drops to the door bottom, or sits on a flush part with a chip detail', () => {
    expect(endPieceBottom(RAIL_AS('cover'), EURO, S)).toEqual({ drop: 1.625, chip: 0 });
    expect(endPieceBottom(RAIL_AS('visible'), EURO, S)).toEqual({ drop: 0.125, chip: 0 });
    expect(endPieceBottom(RAIL_AS('flush'), EURO, S)).toEqual({ drop: 0, chip: 0.125 });
    expect(endPieceBottom({ cabinetTypeId: UPPER }, EURO, S)).toEqual({ drop: 0.125, chip: 0 });

    expect(endPieceNotes('filler', { drop: 1.625, chip: 0 })).toEqual(['return up 1 5/8"']);
    expect(endPieceNotes('end_panel', { drop: 1.625, chip: 0 })).toEqual([]);
    expect(endPieceNotes('end_panel', { drop: 0, chip: 0.125 })).toEqual(['chip detail bottom 1/8"']);
    expect(endPieceNotes('filler', { drop: 0, chip: 0.125 })).toEqual(['chip detail bottom 1/8"']);
  });

  it('stops parts inside end panels unless the doors stop flush above them', () => {
    const run = { x: 0, width: 60 };
    const pieces = [
      { kind: 'end_panel', x: 0, width: 0.75 },
      { kind: 'cabinet', x: 0.75, width: 55.75 },
      { kind: 'filler', x: 56.5, width: 3.5 },
    ];
    const band = { start: 0, end: 60 };
    expect(bottomPartSpan(run, pieces, band, false)).toEqual({ start: 0.75, end: 60 });
    expect(bottomPartSpan(run, pieces, band, true)).toEqual(band);
  });
});
```

Working: covered 1 1/2" rail → door reveal −1 5/8 → drop 1 5/8. Visible → the upper's usual overhang, 1/8.
Flush → door reveal +1/8 → no drop, chip 1/8. No parts → the usual overhang, 1/8. The part stops at the left end
panel's inside face (3/4) and runs under the filler on the right to the run end (60).

**Count:** 669 + 2 = **671**.

---

## §3 Step 205 — on screen

**`components/RunGroup.jsx`** (546 after step 199):
- The styles import (20) becomes `import { endPieceBottom, resolveStyle } from '../model/styles.js';` and the
  bottoms import (11) adds `bottomPartSpan`.
- `const drop = panelDrop(…)` (128) becomes:

```js
  const endBottom = endPieceBottom(run, resolveStyle(settings, room, run), settings);
  const { drop } = endBottom;
```

- `bottomParts` (163–166) becomes:

```js
  const partSpan = bottomPartSpan(
    run,
    drawnPieces,
    { start: bandX, end: bandX + bandWidth },
    endBottom.chip > 0,
  );
  const bottomParts = runBottomParts(run).map((part) => ({
    ...part,
    rect: wallRectToScreen({
      x: partSpan.start,
      z: part.z,
      width: partSpan.end - partSpan.start,
      height: part.height,
    }, transform),
  }));
  const chipLines = endBottom.chip > 0
    ? drawnPieces
      .filter((piece) => piece.kind === 'filler' || piece.kind === 'end_panel')
      .map((piece) => {
        const from = wallToScreen({ x: piece.x, z: piece.z + endBottom.chip }, transform);
        const to = wallToScreen({ x: piece.x + piece.width, z: piece.z + endBottom.chip }, transform);
        return { key: `chip:${piece.id}`, points: [from.x, from.y, to.x, to.y] };
      })
    : [];
```

  (`wallToScreen` comes from `'../canvas/transform.js'`, next to `wallRectToScreen`; add it to that import.)
- In the JSX, right after the `drawnPieces.map(…)` block (400–415):

```jsx
      {chipLines.map((line) => (
        <Line
          key={line.key}
          points={line.points}
          stroke="#e2e8f0"
          strokeWidth={1}
          dash={[3, 2]}
          listening={false}
        />
      ))}
```

**`components/properties/PieceProperties.jsx`** (127):
- Imports from `'../../model/index.js'` add `endPieceBottom`, `endPieceNotes`, `resolveStyle`.
- After `partNumberField` (65–73):

```jsx
  const endNotes = piece.kind === 'filler' || piece.kind === 'end_panel'
    ? endPieceNotes(piece.kind, endPieceBottom(run, resolveStyle(settings, room, run), settings))
    : [];
  const notesLine = endNotes.length > 0 ? (
    <p className="text-xs text-cyan-300">{endNotes.join(' · ')}</p>
  ) : null;
```

- Render `{notesLine}` right after `{partNumberField}` in the end-piece branch (75–82) and the interior-filler
  branch (84–96).

No new tests (components). **Count stays 671.**

**Done when (round):** `npm test` (671) and `npm run lint` clean.
