# Round 44.2 — SPEC: plan runs lay out as the elevation does

Step 370, designer only. Geometry and the API don't change.
Drawing rounds: 44.1 solid walls, stacked parts, padding → **44.2 plan layout fix** → 45 plan dimensions and labels → sheet layout.

**The bug (Kyle, 2026-10-06).** G1 wall 1's base run is a 17 3/4" cabinet, a 36" cabinet pinned to the window's centre, then two equal cabinets. The canvas and the elevation DXF draw that. `plan.dxf` drew 23, 36, 23, 23.

**Why.** `planParts` lays each run out with `layoutRun(room, wall, run, settings)` on the **stored** wall. `layoutRun` reads the pin targets with `pinTargetsForRun(run, wall, wall.length, settings)`, and a stored wall has no `length` (only a resolved view does: `resolveWall` adds it). With no length the window's centre can't be found, so the pin drops out and the run auto-splits. The plan canvas doesn't have the bug because `PlanRunFootprint` passes `frame.length` itself. Any run whose layout depends on the wall's length (a pin to an opening or a wall end) is affected.

**Done when:** `plan.dxf` lays every run out exactly as the elevation does. G1 wall 1's base is 24, 36, 25 1/2, 25 1/2 in the golden room (17 3/4, 36, 25 1/2, 25 1/2 in Kyle's edited copy), the 36" centred on the window.

| Step | Repo | What | Tests after |
|---|---|---|---|
| **370** | designer | `planParts` lays each run out on its resolved wall face | 951 → **952** |

The test values were checked against a throwaway build (952, lint 0 errors, golden snapshot unchanged; the fix also gives 17 3/4, 36, 25 1/2, 25 1/2 on Kyle's room). That build isn't in this SPEC. If a test fails, fix the code, not the number, unless the number contradicts a rule here. In that case, stop and say so.

---

## §1 Step 370 — designer

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/planParts.js` | 134 | the run loop uses `resolveWall` |
| `src/elevation/model/__tests__/planParts.test.js` | 117 | two imports, G1's count row, one `describe` appended |
| `src/elevation/model/__tests__/drawingPayload.test.js` | 113 | line 110: 77 → 76 |

**Contract.** In the run loop (`for (const wall of room.walls) { for (const run of wall.runs ?? []) …`), call the stored wall `stored`. Per run: `side = wallSideOf(run)`, `frame = wallSideFrame(room, stored, side)` as now, and `wall = resolveWall(room, stored, side)` (import from `./room.js`, no cycle). Everything after (`layoutRun`, `runFaceLayouts`, `planRunPieces`) takes that `wall`. Add a one-line comment: the face as the elevation resolves it, length and all, so pins and corner rules lay out the same (SPEC-44.2). Nothing else changes: the walls/openings/recesses/soffits/end panels loop, `tops`, `topOf`, kinds and order stay.

`resolveWall(room, wall, side)` is `{ ...wallSideView(wall, side), length }`. A run's own coordinates are the same in it (the golden snapshot already lays runs out on these views), so only runs that need the length change.

**What changes in the tests:**
- G1's golden base is the same pinned run. It was 25, 36, 25, 25 in plan (wrong); now 24, 36, 25 1/2, 25 1/2, as in the elevation. Its first box is 24" wide, so it gets a single door instead of a pair: G1 has one face fewer. The counts row becomes `[76, 68, 0, 70, { …, face: 35, … }]` and the payload's plan has 76 parts. No other room changes.

**Tests.**
- `planParts.test.js`: add `import { layoutRun } from '../faceLayouts.js';` after the `planParts` import, and change `import { syncRoom } from '../room.js';` to `import { resolveWall, syncRoom } from '../room.js';`. In the counts test, the G1 row becomes:

```js
      'G1 Euro kitchen': [76, 68, 0, 70, { wall: 3, void: 1, opening: 1, casing: 1, wall_end_panel: 2, cabinet: 19, end_panel: 3, face: 35, filler: 11 }],
```

  and append at the end of the file, verbatim:

```js

describe('SPEC-44.2 plan runs lay out as the elevation does', () => {
  it('keeps a pinned cabinet on its pin: G1 wall 1 base, 36" centred on the window', () => {
    const synced = syncRoom(stored('G1 Euro kitchen'), settings);
    const run = 'b822e8ac-1a44-47ca-acec-ecb93caf7b8a';
    const boxes = planParts(synced, settings).filter(({ runId, kind }) => runId === run && kind === 'cabinet');
    const spans = boxes.map(({ points }) => [points[0][1], points[1][1]]);
    expect(spans).toEqual([[-54, -30], [-30, 6], [6, 31.5], [31.5, 57]]);
    // The 36" box is centred on the window (jamb -36 to 12 in plan).
    expect((spans[1][0] + spans[1][1]) / 2).toBe(-12);
    const view = resolveWall(synced, synced.walls[0], 'front');
    const layout = layoutRun(synced, view, view.runs.find(({ id }) => id === run), settings);
    expect(layout.pieces.filter(({ kind }) => kind === 'cabinet').map(({ width }) => width))
      .toEqual(spans.map(([start, end]) => end - start));
  });
});
```

- `drawingPayload.test.js` line 110: `expect(plan.parts).toHaveLength(77);` → `expect(plan.parts).toHaveLength(76);`.

**Don't touch:** `faceLayouts.js` (`layoutRun` stays as it is: everything else already passes it a resolved view), `room.js`, `PlanRunFootprint.jsx`, geometry, other tests.

**Count:** 951 + 1 = **952**. Golden snapshot unchanged. Gate: `npm test && npm run lint && npm run build`.

---

## End-to-end check (Kyle)

Build the designer after 370. *Export DXF* on your edited G1: in `plan.dxf`, wall 1's base is 17 3/4", 36", 25 1/2", 25 1/2", the 36" centred on the window, the same as the elevation and the canvas.
