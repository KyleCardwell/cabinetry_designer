# Elevation Lab — SPEC-37.2 (L-shaped end panels: drawn over the box, mitered in plan)

Steps 264–265, after 37.1. Written against `95fe0fe` (step 263). Baseline **800**.

The code below wasn't run before this was written (Codex implements it). If a test fails, check its expected value against §1 before changing the code.

| Step | What | Tests after |
|---|---|---|
| **264** | Model: the L is mitered in plan, flush with the T-fillers | 800 |
| **265** | Screen: end Ts and Ls draw over the box they cover | 800 |

Next: **38** (combine and full grids).

## §1 The rules (Kyle, 2026-09-30)

- **Elevation.** An L-shaped end panel is drawn at its full face, 1 1/2" (1 9/16" with a 13/16" panel), and its rectangle **covers the front edge of the box beside it**. Step 263 already widens it, but the run draws its pieces left to right, so the box beside a **left** end panel (or a left end T) was drawn on top of the 3/4" lip and hid it. End Ts and Ls are now drawn after the boxes, like the seam Ts.
- **Plan.** The L's side panel and lip are **mitered**, not two rectangles. It's the same miter as a face frame strip into its end panel (SPEC-36.1): a line from the panel's inside corner at the box face to its outside corner at the front.
- **Depth.** The lip is a T's thickness, `teeThickness` (13/16") from the box face, so the L's front is **flush with the T-fillers**, and the side panel stops at that front too (24 13/16" on a 24" box, 1/16" behind the doors). In 37.1 the lip ran to the door-face line (24 7/8"); that was there only because it was drawn as a separate rectangle.

**Worked example (the test):** a 24"-deep base at x 24, end panels (3/4") both ends, one 36" box, width 37.5. Panels 24–24.75 and 60.75–61.5, the box 24.75–60.75.

| Piece | Span | Back → front | Polygon |
|---|---|---|---|
| left panel `r:left` | 24–24.75 | 0 → 24.8125 | (24, 0) (24.75, 0) (24.75, 24) (24, 24.8125) |
| left lip `r:left:lip` | 24–25.5 | 24 → 24.8125 | (24, 24.8125) (25.5, 24.8125) (25.5, 24) (24.75, 24) |
| right panel `r:right` | 60.75–61.5 | 0 → 24.8125 | (60.75, 0) (61.5, 0) (61.5, 24.8125) (60.75, 24) |
| right lip `r:right:lip` | 60–61.5 | 24 → 24.8125 | (60, 24.8125) (61.5, 24.8125) (60.75, 24) (60, 24) |

With a 2" outset everything moves out 2" (the lip is 26 → 26.8125). A plain end panel (no L) is unchanged: one rectangle to the door-face line, no polygon.

---

## §2 Step 264 — Model: the L is mitered in plan

**Files:** `src/elevation/model/planPieces.js` (337), `src/elevation/model/__tests__/teeEnds.test.js` (184).

### `src/elevation/model/planPieces.js`

In `planRunPieces`, beside `endTees` add `const endElls = new Map(ells.map((ell) => [ell.pieceId, ell]));`.

In the `faces.map(...)` inside `teeFaces`, before the `endTees` lookup:

```js
      const ell = endElls.get(face.key);
      if (ell) {
        // An L-shaped end panel (SPEC-37.2): the panel runs to the T-fillers' front and miters into its lip.
        const polygon = ell.side === 'left'
          ? [[face.start, face.back], [face.end, face.back], [face.end, teeBack], [face.start, teeFront]]
          : [[face.start, face.back], [face.end, face.back], [face.end, teeFront], [face.start, teeBack]];
        return { ...face, front: teeFront, polygon };
      }
```

Replace the lip entries (the `...ells.map(...)` block and its comment) with:

```js
    // An L-shaped end panel's lip (SPEC-37.2): across the panel and the box edge it covers, a T's
    // thickness from the box face, mitered into the panel.
    ...ells.map((ell) => {
      const start = ell.x;
      const end = ell.x + ell.width;
      const polygon = ell.side === 'left'
        ? [[start, teeFront], [end, teeFront], [end, teeBack], [ell.lip.start, teeBack]]
        : [[start, teeFront], [end, teeFront], [ell.lip.end, teeBack], [start, teeBack]];
      return { key: `${ell.id}:lip`, kind: 'end_panel', start, end, back: teeBack, front: teeFront, polygon };
    }),
```

`shift` already moves polygons by the outset. Nothing else changes: `PlanRunFootprint.jsx` already draws a piece's `polygon` when it has one.

### `src/elevation/model/__tests__/teeEnds.test.js`

Replace the test `draws the lip in front of the box, out to the panel's front` (164–171) with:

```js
  it('miters the panel into its lip, flush with the T-fillers', () => {
    const { faces } = plan(pairRun());
    expect(byKey(faces, 'r:left')).toEqual({
      key: 'r:left', kind: 'end_panel', start: 24, end: 24.75, back: 0, front: 24.8125,
      polygon: [[24, 0], [24.75, 0], [24.75, 24], [24, 24.8125]],
    });
    expect(byKey(faces, 'r:left:lip')).toEqual({
      key: 'r:left:lip', kind: 'end_panel', start: 24, end: 25.5, back: 24, front: 24.8125,
      polygon: [[24, 24.8125], [25.5, 24.8125], [25.5, 24], [24.75, 24]],
    });
    expect(byKey(faces, 'r:right')).toEqual({
      key: 'r:right', kind: 'end_panel', start: 60.75, end: 61.5, back: 0, front: 24.8125,
      polygon: [[60.75, 0], [61.5, 0], [61.5, 24.8125], [60.75, 24]],
    });
    expect(byKey(faces, 'r:right:lip')).toEqual({
      key: 'r:right:lip', kind: 'end_panel', start: 60, end: 61.5, back: 24, front: 24.8125,
      polygon: [[60, 24.8125], [61.5, 24.8125], [60.75, 24], [60, 24]],
    });
    const plain = plan(panelRun({ tFiller: undefined })).faces;
    expect(plain.some((face) => face.key.endsWith(':lip'))).toBe(false);
    expect(byKey(plain, 'r:left')).toEqual({ key: 'r:left', kind: 'end_panel', start: 24, end: 24.75, back: 0, front: 24.875 });
    expect(byKey(plan(panelRun({ outset: 2 })).faces, 'r:left:lip')).toMatchObject({
      back: 26, front: 26.8125, polygon: [[24, 26.8125], [25.5, 26.8125], [25.5, 26], [24.75, 26]],
    });
  });
```

**Count:** unchanged, **800** (one test rewritten).

---

## §3 Step 265 — Screen: end Ts and Ls draw over the box they cover

**Files:** `src/elevation/components/RunGroup.jsx` (626).

In `drawnPieces` (158–178), the last line `return [...extendPieces(wall, run, base).pieces, ...seamTees];` becomes:

```js
    // A widened end T or L covers the box beside it, so it draws after the boxes (SPEC-37.2).
    const pieces = extendPieces(wall, run, base).pieces;
    return [
      ...pieces.filter((piece) => !endTees.has(piece.id)),
      ...pieces.filter((piece) => endTees.has(piece.id)),
      ...seamTees,
    ];
```

Nothing else changes: selection, hover and the drop already work off the piece ids.

**Count:** unchanged, **800**.

---

## §4 Assumptions to confirm

1. The L's lip and side panel are both a T's thickness deep at the front (13/16" from the box face), so the L sits flush with the T-fillers, 1/16" behind the doors, whatever the panel's thickness. The miter runs corner to corner, so with a 3/4" panel it's a hair off 45°.
2. A plain end panel (no L) still runs to the door-face line.
