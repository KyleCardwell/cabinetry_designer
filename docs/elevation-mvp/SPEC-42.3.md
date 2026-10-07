# Round 42.3 — SPEC: bands meet corner returns, denser section hatch

Steps 339–341. Geometry (339), then designer (340–341). The API doesn't change.
Drawing rounds: 42 run bands → 42.1 band returns + stiles + wall things → 42.2 corner returns and profiles → **42.3 bands meet corner returns** → 43 elevation dimensions → 44 plan → 45 plan dimensions and labels.

**Done when:**
- A run anchored into an inside corner (or to a wing wall) whose return carries the same band treats the return as the deeper run. The return's countertop, top mold and crown cover the corner, so this run's own band stops where the return's band front is. The toe kick runs past the run's end until it meets the return's toe kick (3" back from both faces).
- The `SECTIONS` hatch in the DXF is 1" apart in the drawing instead of 3".
- The canvas and the DXF both pick up the new band ends from `runBands`. Nothing else changes.

| Step | Repo | What | Tests after |
|---|---|---|---|
| **339** | geometry | `HATCH_SCALE` 24 → 8 (ANSI31 lines 1" apart) | 32 → **32** |
| **340** | designer | Move `bandDepths` and `hasToeKick` into `bandDepths.js` (no behaviour change) | 908 → **908** |
| **341** | designer | `cornerBandEdge`: a band at a corner meets the return's band | **912** |

Codex writes the code. This SPEC gives contracts, rules and tests. The literal test values come from the golden fixture with today's model and a reference build of these rules. If a test fails, fix the code, not the number, unless the number contradicts a rule here. In that case, stop and say so.

---

## §1 Decisions (Kyle, 2026-10-05)

- **The return wall is the deeper run (Kyle).** This is round 42.1's band-returns rule carried around an inside corner. A run's end is *at a corner* when it's anchored into an inside corner (`anchors[side] === true` with a return there) or anchored to a wing wall (`anchors[side] = { to: 'wall', wallId }`). If a run on the other wall returns into that corner (a `return` shape from `cornerShapes`) with the same band, this run's band ends where the return's band does:
  - **countertop / wood top, top mold, crown:** the same band kind with the same bottom height (`z`). This run's band stops at the return's band front. In G1 elevation B that's 25 5/8" for the countertop (24 7/8" before), 13 1/8" for the upper's top mold and 15 7/8" for its crown (12 7/8" before). In plan it's one L-shaped top. Seen from B, B's top runs into the corner until it meets the return's front edge.
  - **toe kick:** the return has one. This run's toe kick runs past its end until it meets the return's toe kick, which is 3" back from the return's face. In G1 elevation B that's 21" (it stopped at the run's end, 24 7/8").
- **Band by band.** Each band is matched on its own. A return with a top mold but no crown takes this run's top mold to the return's and leaves its crown as before. A return with no countertop (or one at another height) leaves the countertop as before, and the toe kick still meets the return's.
- **No match leaves today's ends.** With no matching return band, `bandEdge` (rounds 42 and 42.1) decides as today. A run's end at a corner already sits at the corner reserve, which is the return's front, so a top that dies into a taller return already stops at its face. A blind panel still takes every band to the wall, and that check comes first.
- **Section hatch (Kyle):** ANSI31 at scale 8, so the lines are 1" apart in the drawing (1/24" on paper at 1/2" = 1'-0"). It was scale 24 (3" apart), which left the 7/8" door strip of a return with almost no lines. The canvas hatch doesn't change.
- **One function, both outputs.** `runBands` already feeds the canvas (`RunGroup`), `elevationParts` and `bandParts` (the DXF), so the new ends show in both with no other change. The corner lookup reads `cornerShapes` (round 42.2), so it can't disagree with the returns that are drawn.
- **Import cycle.** `cornerShapes` → `runSide` → `runBands` (for `bandDepths` and `hasToeKick`), and now `runBands` → `cornerShapes`. Step 340 moves those two helpers into their own file, so `runSide` no longer imports `runBands` and there's no cycle. `runBands.js` re-exports both, so every other importer is unchanged.

---

## §2 Step 339 — geometry: denser section hatch

**`src/drawing/elevation_dxf.py`** (140 lines): the two lines above `NEVER_DASHED` become:

```python
# ANSI31 lines are 1/8" apart at scale 1; 8 puts them 1" apart in the drawing (1/24" on paper at 1/2" = 1'-0").
HATCH_SCALE = 8
```

**`tests/test_elevation_corners.py`** (81 lines), line 51: `("SECTIONS", "ANSI31", 24), ("SECTIONS", "ANSI31", 24),` → `("SECTIONS", "ANSI31", 8), ("SECTIONS", "ANSI31", 8),`. The hatch areas don't change.

Nothing else changes. **Count:** stays **32**.

---

## §3 Step 340 — designer: `bandDepths.js`

A pure move. No behaviour change.

**NEW `src/elevation/model/bandDepths.js`**, as given:

```js
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from './constants.js';

/** The shop's band depths (SPEC-42): settings.bandDepths over the defaults. */
export function bandDepths(settings) {
  return { ...DEFAULT_SETTINGS.bandDepths, ...settings?.bandDepths };
}

/** Whether a run has a toe kick of its own: a base or tall that isn't sitting on another run. */
export function hasToeKick(run) {
  return !run.stack?.below
    && (run.cabinetTypeId === CABINET_TYPE_IDS.BASE || run.cabinetTypeId === CABINET_TYPE_IDS.TALL);
}
```

**`src/elevation/model/runBands.js`** (158 lines):
- Delete the `bandDepths` function with its doc comment (lines 8–11) and the `hasToeKick` function (lines 15–18).
- Imports: delete `import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from './constants.js';` (nothing else in the file uses them). After the `bottoms.js` import add `import { bandDepths, hasToeKick } from './bandDepths.js';`.
- After the imports, before `const EPSILON = 1e-6;`, add `export { bandDepths, hasToeKick } from './bandDepths.js';` with a blank line on each side.

**`src/elevation/model/runSide.js`** (42 lines): `import { bandDepths, hasToeKick } from './runBands.js';` → `import { bandDepths, hasToeKick } from './bandDepths.js';`.

`index.js`, `bandParts.js`, the tests and everything else still import `bandDepths` from `runBands.js`, and that keeps working through the re-export.

**Count:** stays **908**. Golden snapshot unchanged.

---

## §4 Step 341 — designer: a band at a corner meets the return's

**NEW `src/elevation/model/cornerBands.js`**, as given:

```js
import { cornerShapes } from './cornerParts.js';

const EPSILON = 1e-6;
const PART_KINDS = {
  toeKick: 'toe_kick', countertop: 'countertop', topMold: 'top_mold', crown: 'crown',
};

/** The key prefix of the returns at one end of a run: its inside corner, or the wing wall it's anchored to. */
function returnPrefix(run, side) {
  const anchor = run.anchors?.[side];
  if (anchor === true) return `${side}:`;
  if (anchor?.to === 'wall') return `landing:${anchor.wallId}:${side}:`;
  return null;
}

/**
 * Where a band meets a corner return's band at one end of a run (SPEC-42.3), or null. A run whose end
 * is anchored into an inside corner (or to a wing wall) treats the return as the deeper run: when a
 * return carries the same band at the same height (a toe kick, or a countertop, top mold or crown with
 * the same bottom), this run's band ends where the return's does. `getShapes` gives cornerShapes for
 * the run's wall face (lazyCornerShapes).
 */
export function cornerBandEdge(getShapes, run, side, band, z) {
  const prefix = returnPrefix(run, side);
  if (!prefix) return null;
  const kind = PART_KINDS[band];
  const parts = getShapes()
    .filter((shape) => shape.kind === 'return' && shape.key.startsWith(prefix))
    .flatMap((shape) => shape.parts)
    .filter((part) => part.kind === kind && Math.abs(part.z - z) <= EPSILON);
  if (parts.length === 0) return null;
  return side === 'left'
    ? Math.max(...parts.map((part) => part.x + part.width))
    : Math.min(...parts.map((part) => part.x));
}

/** cornerShapes for a resolved wall face, computed on first use. */
export function lazyCornerShapes(room, wall, settings) {
  let shapes = null;
  return () => {
    shapes ??= cornerShapes(room, wall, wall.side ?? 'front', settings);
    return shapes;
  };
}
```

Notes:
- The prefixes are `cornerShapes`' own return keys: `left:…` / `right:…` at a corner, `landing:${wallId}:${side}:…` at a wing wall (SPEC-42.2 §6). Soffit returns (`soffit:…`) never match.
- `lazyCornerShapes` computes `cornerShapes` only when a run end is anchored, and only once per `runBands` call.

**`src/elevation/model/runBands.js`**:
- Imports: after the `bandDepths.js` import add `import { cornerBandEdge, lazyCornerShapes } from './cornerBands.js';`.
- In `runBands`, replace the `band` helper (its doc comment and the two `const x` / `const right` lines) with:

```js
  const shapes = lazyCornerShapes(room, wall, settings);
  /**
   * A band's rectangle from its two ends: a blind panel takes it to the wall; at a corner it meets the
   * return's band (SPEC-42.3); otherwise bandEdge.
   */
  const band = (kind, z, height) => {
    const x = panelStart
      ?? cornerBandEdge(shapes, run, 'left', kind, z)
      ?? bandEdge(room, wall, run, 'left', kind, settings);
    const right = panelEnd
      ?? cornerBandEdge(shapes, run, 'right', kind, z)
      ?? bandEdge(room, wall, run, 'right', kind, settings);
    return { x, z, width: right - x, height };
  };
```

  Nothing else in `runBands` changes. `bandEdge` stays as it is.

**Tests that change.**

`src/elevation/model/__tests__/runBands.test.js` (141 lines):
- Test 1, replace lines 37–42 with:

```js
    // The base: joined to the taller tall on the left; in the right corner it meets wall B's base return (SPEC-42.3).
    expect(bands.b822e8ac.toeKick).toEqual({ x: 29, z: 0, width: 118, height: 4 });
    expect(bands.b822e8ac.countertop).toEqual({ x: 30, z: 34.5, width: 112.375, height: 1.5 });
    // The upper: free on the left (end panel); in the right corner it meets wall B's upper return.
    expect(span(bands['434f1164'].topMold)).toEqual([108.25, 46.625]);
    expect(span(bands['434f1164'].crown)).toEqual([105.5, 46.625]);
```

- Test 2, replace lines 53–54 with:

```js
    // SPEC-42.3: its left end meets wall A's base return; its right runs past the wall end panel.
    expect(span(bandsOf(g2, 1)['4b49c071'].countertop))
      .toEqual([25.5625, 53.6875]);
```

- The last test, replace lines 132–136 with:

```js
    // The tall (deeper) stops 1" short of its right end panel; the base's toe kick runs on to meet it,
    // and on into the right corner to meet wall B's return (SPEC-42.3).
    expect(span(a.b38f2f11.toeKick)).toEqual([0, 29]);
    expect(span(a.b822e8ac.toeKick)).toEqual([29, 118]);
    // G1 B: the left end meets wall A's return at 21" (SPEC-42.3); the right is a free filler end, 1/4" short.
    expect(span(bandsOf(g1, 1)['4b64d096'].toeKick)).toEqual([21, 98.75]);
```

  and line 139: `toEqual([75.5, 71.6875])` → `toEqual([75.5, 75.5])`.

`src/elevation/model/__tests__/bandParts.test.js` (60 lines), test 1, four rows:

```js
      [`${BASE}:toe_kick`, 'toe_kick', 29, 0, 118, 4, 0, 21, false],
      [`${BASE}:countertop`, 'countertop', 30, 34.5, 112.375, 1.5, 0, 25.625, false],
      [`${UPPER}:top_mold`, 'top_mold', 108.25, 90, 46.625, 3, 0, 13.125, false],
      [`${UPPER}:crown`, 'crown', 105.5, 91.5, 46.625, 4.5, 0, 15.875, false],
```

(were widths 114.125, 113.125, 46.875 and 49.625).

**NEW `src/elevation/model/__tests__/cornerBands.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runBands } from '../runBands.js';
import { resolveWall, syncRoom } from '../room.js';
import { runScene } from '../runScene.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const stored = (name) => document.rooms.find((candidate) => candidate.name === name);

/** runBands for every run on one wall face of a synced room, keyed by the first 8 characters of the run id. */
function bandsOf(room, wallIndex, side = 'front') {
  const view = resolveWall(room, room.walls[wallIndex], side);
  return Object.fromEntries(view.runs.map((run) => [
    run.id.slice(0, 8),
    runBands(room, view, run, settings, runScene(room, view, run, settings)),
  ]));
}
/** A band as [start, end]. */
const ends = (rect) => rect && [rect.x, rect.x + rect.width];

describe('SPEC-42.3 bands meet a corner return\'s bands', () => {
  it('a countertop, top mold and crown stop at the return\'s; a toe kick runs on to meet the return\'s (G1 elevation B)', () => {
    const b = bandsOf(syncRoom(stored('G1 Euro kitchen'), settings), 1);
    // The blind base: wall A's base return has a 25 5/8" countertop and a toe kick 21" out.
    expect(ends(b['4b64d096'].countertop)).toEqual([25.625, 120.75]);
    expect(ends(b['4b64d096'].toeKick)).toEqual([21, 119.75]);
    // The upper: wall A's upper return's top mold is 13 1/8" out, its crown 15 7/8".
    expect(ends(b['4a087225'].topMold)).toEqual([13.125, 120.25]);
    expect(ends(b['4a087225'].crown)).toEqual([15.875, 123]);
  });

  it('works at a right-hand corner and on a face frame run (G1 elevation A, G2)', () => {
    const a = bandsOf(syncRoom(stored('G1 Euro kitchen'), settings), 0);
    expect(ends(a.b822e8ac.countertop)).toEqual([30, 142.375]);
    expect(ends(a.b822e8ac.toeKick)).toEqual([29, 147]);
    expect(ends(a['434f1164'].topMold)).toEqual([108.25, 154.875]);
    expect(ends(a['434f1164'].crown)).toEqual([105.5, 152.125]);
    const g2 = syncRoom(stored('G2 Face frame kitchen'), settings);
    const g2a = bandsOf(g2, 0);
    expect(ends(g2a['860a1197'].countertop)).toEqual([76.5, 146.4375]);
    expect(ends(g2a['860a1197'].toeKick)).toEqual([75.5, 151]);
    // The upper's right corner has no return (the peninsula has no upper): it still stops at the wall.
    expect(ends(g2a.ab0981ca.crown)).toEqual([79.5, 172]);
    const g2b = bandsOf(g2, 1);
    expect(ends(g2b['4b49c071'].countertop)).toEqual([25.5625, 79.25]);
    expect(ends(g2b['4b49c071'].toeKick)).toEqual([21, 77.75]);
  });

  it('matches band by band: a return without that band, or with it at another height, leaves the end as before (G1)', () => {
    const copy = structuredClone(stored('G1 Euro kitchen'));
    copy.walls[0].runs.find(({ id }) => id.startsWith('434f1164')).top = 'topMold';
    copy.walls[0].runs.find(({ id }) => id.startsWith('b822e8ac')).top = 'none';
    const b = bandsOf(syncRoom(copy, settings), 1);
    // The upper return now has a top mold but no crown.
    expect(ends(b['4a087225'].topMold)).toEqual([13.125, 120.25]);
    expect(ends(b['4a087225'].crown)).toEqual([12.875, 123]);
    // The base return has no countertop, but still a toe kick.
    expect(ends(b['4b64d096'].countertop)).toEqual([24.875, 120.75]);
    expect(ends(b['4b64d096'].toeKick)).toEqual([21, 119.75]);
  });

  it('meets a wing wall\'s return the same way (G3)', () => {
    const copy = structuredClone(stored('G3 Bath alcove'));
    const base = structuredClone(copy.walls[1].runs[0]);
    copy.walls[2].runs = [{ ...base, id: 'wing-base', x: 0, width: 24, wallSide: 'front', anchors: { left: true } }];
    const host = bandsOf(syncRoom(copy, settings), 1);
    // The host base is anchored to the wing wall on its right; the wing wall's base returns there.
    expect(ends(host['02c88254'].countertop)).toEqual([0, 49.375]);
    expect(ends(host['02c88254'].toeKick)).toEqual([0, 54]);
    // The host upper has no return beside it.
    expect(ends(host.bcdd4e78.crown)).toEqual([0, 72]);
  });
});
```

What the cases show: G1 B's blind base countertop starts at 25 5/8" (it started at 24 7/8", so it overlapped the return's countertop by 3/4"). Its toe kick starts at 21", under the return's faces. G1 A's right corner and G2 both corners are the same thing seen from the other wall. The third case turns off the return's crown and countertop, and those ends fall back to the run's edge. In the fourth, a base on G3's wing wall returns onto the host's near side. The host base's countertop stops 3/4" short of its end, at the return's 22 5/8" countertop, and its toe kick runs 3 7/8" on to the return's 18" toe kick.

**Count:** 908 + 4 = **912**. Golden snapshot unchanged. `drawingPayload.test.js` part counts don't change, since bands only change width.

---

## End-to-end check (Kyle)

Geometry on `feature/drawing` with 339 in. Start the API and designer as in round 42.

**Canvas (after 341):**
- **G1 elevation B:** the blind base's countertop starts where the return's countertop ends, with no overlap, and its toe kick runs left under the return's doors to meet the return's toe kick. The upper's top mold and crown start at the return's.
- **G1 elevation A, right corner:** the same, mirrored. The base's toe kick runs about 3 7/8" past its filler.
- **G2 A and G2 wall 2:** the same on the face frame runs.

**Export DXF:**
- The same ends on `COUNTERTOPS` and `MOLDINGS`. At each corner the return's countertop outline and this wall's countertop share one vertical line.
- `SECTIONS` hatching is 1" apart, and the 7/8" door strip of a return gets a line or two.

**Known for now:** a return at a corner that isn't 90° still meets as a rectangle cut at the face, as in 42.2. Flush profiles come later with profiles.
