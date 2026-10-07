# Elevation Lab — SPEC-37.3 (T-fillers numbered beside their seam)

Step 266, after 37.2. Written against `6868aa4` (step 265). Baseline **800**.

The code below wasn't run before this was written (Codex implements it). If a test fails, check its expected value against §1 before changing the code.

| Step | What | Tests after |
|---|---|---|
| **266** | Model: a seam T's part number comes right after the cabinets it splits off | 801 |

Next: **38** (combine and full grids).

## §1 The rule (Kyle, 2026-10-01)

SPEC-37 numbered every seam T after all of its run's pieces. Now a seam T is numbered **in order, next to the cabinets of the seam it splits**:

- **A vertical T** comes right after the **last** part of the boxes on its left. For a stacked column that's the whole column, so the T sits between the two columns.
- **A horizontal T** comes right after the **first** part of the boxes below it, so it sits between the lower and upper cabinet. A flat that runs across several columns goes after the lowest box of its leftmost column.
- Two Ts after the same part keep their T order (left to right, then bottom to top). A T whose boxes aren't parts falls back to the end of the run's pieces, as before.
- An end T and an L-shaped end panel keep their filler's or panel's number. Face frames are still numbered after the pieces.

**Worked examples (the tests):**
- End fillers with Ts, a 18, b 18: `r:left`, a, **`tee:a|b`**, b, `r:right` (it was r:left, a, b, r:right, T).
- One column split at 30" with a horizontal T: a2, **`tee:h:a1|a2`**, a1.
- Two columns split at 30", `'all'`: a2, `tee:h:a1|a2`, a1, `tee:a2|b2`, b2, `tee:h:b1|b2`, b1.
- Two columns split at 30" and 20", `'seams'`: a2, a1, `tee:a2|b2`, b2, b1.

---

## §2 Step 266 — Model: number a seam T beside its seam

**Files:** `src/elevation/model/partNumbers.js` (303), `src/elevation/model/__tests__/teeParts.test.js` (133).

### `src/elevation/model/partNumbers.js`

Add above `runParts`:

```js
/**
 * Where a seam T goes in its run's part list (SPEC-37.3): the key of the part it follows. A vertical T
 * follows the last part of the boxes on its left (a whole stacked column), a horizontal T the first
 * of the boxes below it, so it sits between the cabinets of its seam. Null if none of them is a part.
 */
function teeAnchor(tee, parts, pieces) {
  const before = tee.boxIds
    .map((id) => pieces.find((piece) => piece.id === id))
    .filter((piece) => piece && (tee.orientation === 'vertical'
      ? piece.x + piece.width / 2 < tee.x + tee.width / 2
      : piece.z + piece.height / 2 < tee.z + tee.height / 2));
  const indexes = before
    .map((piece) => parts.findIndex((part) => part.pieceId === piece.id))
    .filter((index) => index >= 0);
  if (indexes.length === 0) return null;
  return parts[tee.orientation === 'vertical' ? Math.max(...indexes) : Math.min(...indexes)].key;
}
```

In `runParts`, the returned array becomes three pieces. Keep the existing `partPieces(...).filter(...).map(...)` expression unchanged, but assign it to `const pieceParts = ...` instead of spreading it into the return. Build the seam T parts with their anchors (the part objects themselves are unchanged from today):

```js
    // A T-filler between boxes is a filler part of its own, numbered beside its seam (SPEC-37.3).
    const seamParts = tees.filter((tee) => !tee.end).map((tee) => ({
      anchor: teeAnchor(tee, pieceParts, cells.pieces),
      part: {
        key: tee.id,
        kind: 'filler',
        wallId: wall.id,
        side,
        runId: run.id,
        pieceId: tee.id,
        molding: null,
        width: tee.partWidth,
      },
    }));
    return [
      ...pieceParts.flatMap((part) => [
        part,
        ...seamParts.filter((entry) => entry.anchor === part.key).map((entry) => entry.part),
      ]),
      ...seamParts.filter((entry) => entry.anchor === null).map((entry) => entry.part),
      // One part per face frame, after its run's pieces (SPEC-36.2).
      ...frames.regions.map((region) => ({ ...unchanged })),
    ];
```

(`...unchanged` is the existing frame part object, as it is now.) Remove the old `// A T-filler between boxes is a filler part of its own, after its run's pieces (SPEC-37).` block. `wallBadgeGroups` doesn't change.

### `src/elevation/model/__tests__/teeParts.test.js`

1. In `numbers a seam T after its run's pieces, and an end T in its filler's place` (101–111): rename it `numbers a seam T between its cabinets, and an end T in its filler's place`, and change the expectations to:

```js
    expect(parts.map((part) => [part.number, part.key, part.kind, part.width])).toEqual([
      [1, 'r:left', 'filler', 3.75],
      [2, 'a', 'cabinet', 18],
      [3, 'tee:a|b', 'filler', 1.5],
      [4, 'b', 'cabinet', 18],
      [5, 'r:right', 'filler', 3.75],
    ]);
    expect(parts[2]).toMatchObject({ runId: 'r', pieceId: 'tee:a|b', wallId: 'wall-1' });
```

2. In `gives a horizontal T its flat height as its width, and leaves other runs alone` (119–125), the STACKED expectation becomes:

```js
    expect(parts(STACKED).map((part) => [part.key, part.width])).toEqual([
      ['a2', 18], ['tee:h:a1|a2', 1.5], ['a1', 18],
    ]);
```

3. Append, inside the `SPEC-37 T-fillers in the part list` describe block, after the badge test:

```js
  it('numbers each T between the cabinets of its seam in stacked columns (SPEC-37.3)', () => {
    const column = (id, top) => ({
      id,
      cols: [{ id: `${id}:c`, size: null, sizeMode: 'auto' }],
      rows: [{ id: `${id}:t`, size: top, sizeMode: 'manual' }, { id: `${id}:u`, size: null, sizeMode: 'auto' }],
      cells: [cell(0, 0, cab(`${id}1`)), cell(0, 1, cab(`${id}2`))],
    });
    const columns = (left, right, tFiller) => baseRun({
      z: 0, height: 60, tFiller,
      grid: {
        id: 'r:grid',
        cols: [{ id: 'a:col', size: 18, sizeMode: 'manual' }, { id: 'b:col', size: 18, sizeMode: 'manual' }],
        rows: [{ id: 'r:row', size: null, sizeMode: 'auto' }],
        cells: [cell(0, 0, column('a', left)), cell(1, 0, column('b', right))],
      },
    });
    const keys = (run) => partNumbers(roomWith(run), S).parts
      .filter((part) => part.kind !== 'molding')
      .map((part) => part.key);
    expect(keys(columns(30, 30, 'all'))).toEqual([
      'a2', 'tee:h:a1|a2', 'a1', 'tee:a2|b2', 'b2', 'tee:h:b1|b2', 'b1',
    ]);
    expect(keys(columns(30, 20, 'seams'))).toEqual(['a2', 'a1', 'tee:a2|b2', 'b2', 'b1']);
  });
```

**Count:** 800 + 1 = **801**.
