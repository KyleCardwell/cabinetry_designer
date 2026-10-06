# Round 43.4 — SPEC: corner reach and the extent on cornerShapes

Steps 358–361, all in the designer. Geometry and the API don't change.
Drawing rounds: 43.3 cell chains and callouts → **43.4 corner reach on cornerShapes** → 44 plan → 45 plan dimensions and labels → sheet layout.

**Done when:**
- A neighbour run's reach past a wall face's end is dimensioned from what `cornerShapes` draws (its profile's box and faces), on the canvas and in the DXF.
- `wallExtent` takes in every part `cornerShapes` draws, corner returns and profiles with their bands. The DXF's rows and columns clear a profile's countertop, and a return taller than a low wall.
- A run in a neighbour's recess gets no reach dimension. It isn't drawn there either (SPEC-42.2).
- `neighborProfiles.js` is gone. Nothing in `src` names it.

| Step | Repo | What | Tests after |
|---|---|---|---|
| **358** | designer | `profileReach`: each profile's box-and-faces span and its run's type (no behaviour change) | 938 → **940** |
| **359** | designer | Reach dimensions read `profileReach`; golden snapshot loses G5's two recess reaches | **941** |
| **360** | designer | `wallExtent` reads `cornerParts` | **943** |
| **361** | designer | Remove `neighborProfiles` and its tests | **941** |

Codex writes the code (PROMPT-CONVENTIONS rule 10). This SPEC gives the rules, the contracts and the tests. The test values were checked against a throwaway build of these rules (941 at the end, lint 0 errors). That build isn't in this SPEC. If a test fails, fix the code, not the number, unless the number contradicts a rule here. In that case, stop and say so.

---

## §1 Decisions (2026-10-06)

- **One source for neighbours.** Since 42.2 the canvas and the DXF *draw* neighbours from `cornerShapes`, but the reach dimensions (`dimensions.js`) and the extent (`wallExtent.js`) still read the old `neighborProfiles`. That still counts recess runs, and its spans miss the countertop and crown projection. Both now read `cornerShapes`, as DECISIONS planned for 43.4.
- **Reach is the cabinet, not its top (Claude's default; say if you want the top).** A reach dimension runs from the wall end to the far side of the profile's `profile` parts (box and faces), as today. Its toe kick, countertop, top mold and crown don't count. For every golden room except G5 the numbers are the same as today. G2 A's peninsula back run still reaches 172″ to 196″ (24″).
- **Band by cabinet type, as today.** Bases and talls go in the lower chains, uppers in the upper chains. `profileReach` carries the neighbour run's `cabinetTypeId` for this.
- **Recess runs aren't reached.** G5 walls 1 and 3 (index 0 and 2) lose the phantom 24″ reach (`neighbor` 30–54 and −24–0). The golden snapshot changes by exactly those four segments: the lower `inner` and `outer` of each face.
- **The extent is everything drawn.** `wallExtent` keeps the wall, this face's runs and soffits, and adds every part of `cornerParts(room, wall, side, settings)`, by `x`, `x + width`, `z` and `z + height`. Returns are clipped to the wall's length, so they only ever raise the top.
  - **G2 A:** the peninsula's countertop runs 3/4″ past its 196″ box, so the right edge is 196 3/4″. The right columns move out 3/4″: 205 3/4″, 222 1/4″ and 231 1/4″ at 1:24.
  - **G2 B (the 36″ peninsula's front face):** wall A's upper returns into its corner up to the crown at 96″. The top goes from 36″ to 96″, so the overall row above moves from 45″ to 105″ and clears the section instead of crossing it.
  - **G5 wall 3 (index 2):** its left edge goes from −24″ back to 0.
- **The canvas follows.** `ElevationCanvas` uses `wallExtent` and `horizontalChains` too. G2 B's view now frames the whole return, and G5's phantom reach dimensions go. Nothing else in the canvas changes.
- **`neighborProfiles` goes (361).** Its tests 189, 190 and 213 become one test on `profileReach` that keeps their cases: a straight joint each way, an upper, a run on the back face, and a run round a corner.
- **Not in 43.4:** this face's own bands past a free run end (a countertop 3/4″ or a crown 3″ past the run) still aren't in the extent; end elevations.

---

## §2 Step 358 — designer: `profileReach`

A shape step. Nothing calls it yet.

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/cornerParts.js` | 153 | export `profileReach` at the end |
| NEW `src/elevation/model/__tests__/cornerReach.test.js` | — | 2 tests, verbatim |

**Contract.** `profileReach(room, wall, side, settings)` → `[{ key, wallId, runId, cabinetTypeId, x, width }]`. There's one record per shape of `cornerShapes(room, wall, side, settings)` with `kind === 'profile'`, in that order.
- `key`, `wallId` and `runId` are the shape's.
- `x` / `width` span the shape's parts of kind `'profile'` (box and faces): `x` is the smallest `part.x`, and `x + width` the largest `part.x + part.width`. The toe kick and top parts don't count.
- `cabinetTypeId` is the run's own, found in `room.walls` by the shape's `wallId` and then `runId`; `null` if not found.

Doc comment: how far each neighbour run seen in profile past this face's ends reaches (SPEC-43.4): its box and faces, not its toe kick or top, with its cabinet type so a chain can take it in its band.

**Don't touch:** `cornerShapes`, `cornerParts`, `dimensions.js`, `wallExtent.js`, `neighborProfiles.js`, `model/index.js`, any canvas file, the existing tests.

**NEW `src/elevation/model/__tests__/cornerReach.test.js`**, verbatim:

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS } from '../constants.js';
import { profileReach } from '../cornerParts.js';
import { resolveWall, syncRoom } from '../room.js';
import { normalizeElevationDocument } from '../../store/persistence.js';

const document = normalizeElevationDocument(
  JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8')),
);
const { settings } = document;
const room = (name) => syncRoom(document.rooms.find((candidate) => candidate.name === name), settings);
const reachOf = (synced, wallIndex, side = 'front') => profileReach(synced, synced.walls[wallIndex], side, settings);

const PENINSULA = '64da569f-6c94-408d-809a-37c6e1f9755f';
const BACK_RUN = '2c8ab1e3-3bad-4a28-bb80-24ee4df20b81';

describe('SPEC-43.4 corner reach from cornerShapes', () => {
  it('gives each profile\'s box-and-faces span past the wall end, with its run\'s type (G2 elevation A)', () => {
    const g2 = room('G2 Face frame kitchen');
    expect(reachOf(g2, 0)).toEqual([{
      key: `${PENINSULA}:back:${BACK_RUN}:right`,
      wallId: PENINSULA,
      runId: BACK_RUN,
      cabinetTypeId: CABINET_TYPE_IDS.BASE,
      x: 172,
      width: 24,
    }]);
    // The same face resolved first gives the same reach.
    expect(profileReach(g2, resolveWall(g2, g2.walls[0], 'front'), 'front', settings)).toEqual(reachOf(g2, 0));
  });

  it('reaches no run in a neighbour\'s recess and no corner return (G5, G1)', () => {
    const g5 = room('G5 Recess room');
    expect([0, 1, 2].map((index) => reachOf(g5, index))).toEqual([[], [], []]);
    const g1 = room('G1 Euro kitchen');
    expect([0, 1, 2].map((index) => reachOf(g1, index))).toEqual([[], [], []]);
  });
});
```

What the numbers are: G2 A's profile is the peninsula's back-face panel run. Its box runs 172″ to 196″; its countertop (to 196 3/4″) doesn't count. G5's neighbours past wall ends are all recess runs, which `cornerShapes` never draws. G1's neighbours are all corner returns.

**Count:** 938 + 2 = **940**. Golden snapshot unchanged.

---

## §3 Step 359 — designer: reach dimensions from `profileReach`

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/dimensions.js` | 771 | line 10's import; `neighborSegments` (lines 85–98) |
| `src/elevation/model/__tests__/cornerReach.test.js` | 41 | one import; one `describe` appended, verbatim |
| `src/elevation/model/__tests__/__snapshots__/golden.test.js.snap` | — | updated with `-u`: G5's four reach segments go |

**`dimensions.js`.**
- Line 10, `import { neighborProfiles } from './neighborProfiles.js';`, becomes `import { profileReach } from './cornerParts.js';`. Leave it on line 10.
- `neighborSegments` reads `profileReach(room, wall, wall.side ?? 'front', settings)` instead of `neighborProfiles(room, wall, settings)`. The `inBand` filter on `cabinetTypeId` and the record it maps to (`start`, `end`, `kind: 'neighbor'`, `wallId`, `neighborRunId`) don't change. Add a one-line doc comment: a neighbour run's reach past this face's end, from what cornerShapes draws (SPEC-43.4).

There's no import cycle: `cornerParts.js` doesn't reach `dimensions.js`. Nothing else in `dimensions.js` changes. Lines 1–98 are all you need to open.

**Don't touch:** `cornerParts.js`, `wallExtent.js`, `neighborProfiles.js`, `model/index.js`, `elevationDimensions.js`, any canvas file. `dimensions.test.js` tests 228 and 229 keep their numbers: a straight joint reaches as before.

**Tests.** In `cornerReach.test.js`, add `import { horizontalChains } from '../dimensions.js';` right after the `cornerParts.js` import, and append at the end of the file, verbatim:

```js

describe('SPEC-43.4 reach dimensions from cornerShapes', () => {
  it('dimensions a profile\'s reach past the wall end, and never a recess run\'s (G2 A, G5)', () => {
    const g2 = room('G2 Face frame kitchen');
    const lower = horizontalChains(g2, resolveWall(g2, g2.walls[0], 'front'), 'lower', settings);
    const reach = { start: 172, end: 196, kind: 'neighbor', wallId: PENINSULA, neighborRunId: BACK_RUN };
    expect(lower.inner.at(-1)).toEqual(reach);
    expect(lower.outer.at(-1)).toEqual(reach);
    const g5 = room('G5 Recess room');
    for (const index of [0, 2]) {
      const chains = horizontalChains(g5, resolveWall(g5, g5.walls[index], 'front'), 'lower', settings);
      expect(chains).toEqual({ inner: [], outer: [{ start: 0, end: 30, kind: 'wall' }] });
    }
  });
});
```

**Golden snapshot.** Run `npx vitest run src/elevation/model/__tests__/golden.test.js` once without `-u`. The only diff must be G5 losing four `kind: 'neighbor'` segments (`neighborRunId` `e9abb5dc-…`). Those are the lower `inner` and `outer` of two front faces: 30–54 on one and −24–0 on the other. If that's the whole diff, run it again with `-u`. If anything else changed, stop and say so.

**Count:** 940 + 1 = **941**.

---

## §4 Step 360 — designer: the extent takes in what `cornerShapes` draws

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/wallExtent.js` | 43 | the neighbour loop reads `cornerParts` |
| `src/elevation/model/__tests__/cornerReach.test.js` | ~56 | two imports; one `describe` appended, verbatim |

**`wallExtent.js`.**
- `import { neighborProfiles } from './neighborProfiles.js';` → `import { cornerParts } from './cornerParts.js';` (sorted above `./geometry.js`).
- Replace the `for (const profileShape of neighborProfiles(…)) { … }` loop (lines 34–40) with a loop over `cornerParts(room, wall, wall.side ?? 'front', settings)`. Each part widens `left` / `right` by `x` and `x + width`, and `bottom` / `top` by `z` and `z + height`.
- The doc comment becomes: the bounds of everything drawn in one wall elevation, its neighbours' corner returns and profiles included, bands and all (SPEC-43.4).

**Don't touch:** `cornerParts.js`, `dimensions.js`, `elevationDimensions.js`, `neighborProfiles.js`, `ElevationCanvas.jsx` (it already calls `wallExtent`), the existing tests. `wallExtent.test.js` tests 191 and 214 keep their numbers.

**Tests.** In `cornerReach.test.js`, add `import { elevationDimensions } from '../elevationDimensions.js';` right after the `dimensions.js` import, and `import { wallExtent } from '../wallExtent.js';` right after the `room.js` import. Append at the end of the file, verbatim:

```js

describe('SPEC-43.4 the extent takes in everything cornerShapes draws', () => {
  it('reaches a profile\'s countertop and a return above a low wall; drops a recess run (G2, G5)', () => {
    const g2 = room('G2 Face frame kitchen');
    const extentOf = (synced, wallIndex, side) => wallExtent(
      synced, resolveWall(synced, synced.walls[wallIndex], side), settings,
    );
    // The peninsula's back run in profile: box to 196, countertop 3/4" past it.
    expect(extentOf(g2, 0, 'front')).toEqual({ left: 0, right: 196.75, top: 96, bottom: 0 });
    // Wall A's upper returns into the 36" peninsula's corner, up to its crown at 96".
    expect(extentOf(g2, 1, 'front')).toEqual({ left: 0, right: 78.5, top: 96, bottom: 0 });
    expect(extentOf(g2, 1, 'back')).toEqual({ left: 0, right: 78.5, top: 36, bottom: 0 });
    const g5 = room('G5 Recess room');
    expect(extentOf(g5, 2, 'front')).toEqual({ left: 0, right: 30, top: 96, bottom: 0 });
  });

  it('moves the DXF\'s rows and columns out with it (G2 A right edge, the peninsula\'s row above)', () => {
    const g2 = room('G2 Face frame kitchen');
    const right = elevationDimensions(g2, g2.walls[0], 'front', settings)
      .filter(({ row: name }) => name.startsWith('right.'));
    expect([...new Set(right.map(({ row: name, base, at }) => `${name} ${base} ${at}`))]).toEqual([
      'right.inner 196.75 205.75', 'right.middle 196.75 222.25', 'right.outer 196.75 231.25',
    ]);
    expect(elevationDimensions(g2, g2.walls[1], 'front', settings)
      .filter(({ row: name }) => name.startsWith('upper.'))
      .map(({ row: name, kind, start, end, base, at }) => [name, kind, start, end, base, at]))
      .toEqual([['upper.outer', 'wall', 0, 78.5, 96, 105]]);
  });
});
```

What the numbers are, at 1:24:
- **G2 A.** The right edge was 196″ (the box). It's now 196 3/4″ (the countertop), so the right columns are 9″ past it: 205 3/4″. The middle and outer columns follow, 16 1/2″ and 9″ further, after the moved text in the inner column.
- **G2 B.** The peninsula's front face was 36″ tall in the extent. Wall A's upper return reaches 96″, so the one row above (the wall's 78 1/2″) is at 105″ instead of 45″. The back face has no return above it and stays at 36″.
- **G5 wall 3.** The recess run 24″ past its left end no longer counts. Its left edge is 0.

**Count:** 941 + 2 = **943**. Golden snapshot unchanged (it doesn't hold extents).

---

## §5 Step 361 — designer: remove `neighborProfiles`

**Fan-out** after 359 and 360. These are the only references left:

```
src/elevation/model/neighborProfiles.js            (the file, 95 lines)
src/elevation/model/index.js:189                    export { neighborProfiles } from './neighborProfiles.js';
src/elevation/model/__tests__/wallExtent.test.js:3  import { neighborProfiles } from '../neighborProfiles.js';
src/elevation/model/__tests__/wallExtent.test.js    tests 189 (lines 86–116), 190 (118–145), 213 (178–202)
```

**Files:**

| File | Lines | Change |
|---|---:|---|
| `src/elevation/model/neighborProfiles.js` | 95 | `git rm` |
| `src/elevation/model/index.js` | 404 | delete line 189 |
| `src/elevation/model/__tests__/wallExtent.test.js` | 218 | import, describe title, 3 tests → 1 (verbatim) |

**`wallExtent.test.js`**, by script (rule 9), in this order so the line numbers hold:
1. Delete lines 178–203 (test 213 and the blank line after it).
2. Replace lines 86–146 (tests 189 and 190 and the blank line after them) with the block below, verbatim, followed by one blank line.
3. Line 3 `import { neighborProfiles } from '../neighborProfiles.js';` → `import { profileReach } from '../cornerParts.js';`.
4. Line 85 `describe('neighborProfiles and wallExtent', () => {` → `describe('profileReach and wallExtent', () => {`.

Tests 191 and 214 and the helpers (`makeWall`, `run`, `base`, `straightRoom`, `view`) stay as they are.

```js
  it('189. reaches neighbour runs across a straight joint, not ones behind it or round a corner (SPEC-43.4)', () => {
    const room = straightRoom({
      wallA: { runs: [base('A1', { x: 90 })] },
      wallB: { runs: [base('B1')] },
    });
    expect(profileReach(room, view(room, 'A'), 'front', DEFAULT_SETTINGS)).toEqual([{
      key: 'B:front:B1:right', wallId: 'B', runId: 'B1', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 120, width: 30,
    }]);
    expect(profileReach(room, view(room, 'B'), 'front', DEFAULT_SETTINGS)).toEqual([{
      key: 'A:front:A1:left', wallId: 'A', runId: 'A1', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: -30, width: 30,
    }]);

    const upperRoom = straightRoom({
      wallB: { runs: [run('U1', CABINET_TYPE_IDS.UPPER, 12, {
        x: 0, width: 30, z: 54, height: 36, heightMode: 'auto',
      })] },
    });
    expect(profileReach(upperRoom, view(upperRoom, 'A'), 'front', DEFAULT_SETTINGS)).toEqual([{
      key: 'B:front:U1:right', wallId: 'B', runId: 'U1', cabinetTypeId: CABINET_TYPE_IDS.UPPER, x: 120, width: 30,
    }]);

    const behindRoom = straightRoom({
      wallB: { runs: [run('B1', CABINET_TYPE_IDS.UPPER, 12, {
        wallSide: 'back', z: 54, height: 36, heightMode: 'manual',
      })] },
    });
    expect(profileReach(behindRoom, view(behindRoom, 'A'), 'front', DEFAULT_SETTINGS)).toEqual([]);

    const cornerRoom = syncRoom({
      id: 'S',
      name: 'Room S',
      profile: { ...DEFAULT_SETTINGS.defaultProfile },
      wallOrder: ['A', 'B'],
      walls: [
        makeWall('A', 0, 0, 120, 0, {
          connections: { start: null, end: { wallId: 'B', endpoint: 'start' } },
        }),
        makeWall('B', 120, 0, 120, 96, {
          connections: { start: { wallId: 'A', endpoint: 'end' }, end: null },
          runs: [base('B1')],
        }),
      ],
    }, DEFAULT_SETTINGS);
    expect(profileReach(cornerRoom, view(cornerRoom, 'A'), 'front', DEFAULT_SETTINGS)).toEqual([]);
  });
```

What it keeps from the old tests: the straight joint each way (−30 and 120, 30″ wide), an upper with its type (213 checked its moldings; those are `cornerShapes`' now, tested in 42.2), a run on the neighbour's back face, and a run round a corner that isn't anchored, which is neither a profile nor a return.

**Don't touch:** anything else. `wallExtent.test.js` ends with 3 tests (189, 191, 214).

**Count:** 943 − 3 + 1 = **941**. Golden snapshot unchanged. Gate: `npm test && npm run lint && npm run build` (the build checks that nothing imports the deleted file).

---

## End-to-end check (Kyle)

Geometry doesn't change. `npm run build` in the designer, then start the API and designer as in round 42.

**Canvas:**
- **G5, walls 1 and 3.** No dimension past the wall end for the recess runs on the other wall. Nothing is drawn there, so there's nothing to dimension.
- **G2 B (the peninsula's front).** The view frames wall A's upper return up to 96″. The overall dimension above sits over the return, not through it.
- Everywhere else the reach dimensions are where they were.

**Export DXF:**
- **G2 `elevation-A.dxf`.** The 24″ reach to the peninsula's back run is still under the right end (172″–196″). The right-hand columns start at 205 3/4″, clear of the peninsula's countertop, which runs to 196 3/4″.
- **G2 `elevation-B.dxf`.** The 78 1/2″ row above the peninsula is at 105″, above the hatched upper return. It was at 45″, through the section.
- **G1.** Nothing moves: its neighbours are all corner returns inside the walls' heights.

**Known for now:**
- This face's own bands past a free run end (a countertop 3/4″, a crown 3″) aren't in the extent yet. A column beside one sits 9″ past the run, not past the band.
- The reach is the cabinet, not its countertop or crown. Say if you'd rather it include them.
- End elevations are still a TODO.
