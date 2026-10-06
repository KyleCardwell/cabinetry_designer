# Round 43.4 — Codex Prompts, Steps 358–361 (corner reach on cornerShapes)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, all in **cabinetry_designer**.

| Step | Repo | What | Tests after |
|---|---|---|---|
| 358 | cabinetry_designer | `profileReach` (no behaviour change) | 940 |
| 359 | cabinetry_designer | reach dimensions from `profileReach`; golden snapshot `-u` (G5 only) | 941 |
| 360 | cabinetry_designer | `wallExtent` from `cornerParts` | 943 |
| 361 | cabinetry_designer | remove `neighborProfiles` | 941 |

Geometry and the API don't change. The designer stays on `feature/elevation-mvp`.

---

## Before step 358 (Kyle)

```bash
cd cabinetry_designer
git status                                   # on feature/elevation-mvp; only the three docs below changed
npm test                                     # 938 passed
git add docs/elevation-mvp/SPEC-43.4.md docs/elevation-mvp/PROMPTS-43.4.md docs/DECISIONS.md
git commit -m "round 43.4 docs"
```

---

## Step 358 — `profileReach`

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-43.4.md §1 and §2. Step 357 is in.
If `git status` shows uncommitted changes, stop and tell me.

A shape step: add one export, nothing calls it yet. At the end of src/elevation/model/cornerParts.js, export profileReach(room, wall, side, settings) → [{ key, wallId, runId, cabinetTypeId, x, width }], one record per shape of cornerShapes(room, wall, side, settings) whose kind is 'profile', in that order. key, wallId and runId are the shape's. x and width span the shape's parts of kind 'profile' (box and faces): x = smallest part.x, x + width = largest part.x + part.width; its toe kick and top parts don't count. cabinetTypeId is the run's own, found in room.walls by the shape's wallId then runId (null if not found). Doc comment: how far each neighbour run seen in profile past this face's ends reaches (SPEC-43.4), its box and faces, not its toe kick or top, with its cabinet type so a chain can take it in its band.

Files (only these):
- src/elevation/model/cornerParts.js (153 lines): the export at the end
- NEW src/elevation/model/__tests__/cornerReach.test.js: VERBATIM from SPEC §2 (2 tests)

DO NOT change cornerShapes or cornerParts, dimensions.js, wallExtent.js, neighborProfiles.js, model/index.js, any canvas/component file, or any existing test. DO NOT grep the repo.

First add the test and run `npx vitest run src/elevation/model/__tests__/cornerReach.test.js`: both must fail. Iterate on that file. At the end `npm test && npm run lint` once: 938 + 2 = 940, golden snapshot unchanged, lint 0 errors. Don't run `npm run build`.

At most three lines of summary. Commit "elevation-mvp: step 358 profileReach".
```

---

## Step 359 — reach dimensions from `profileReach`

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-43.4.md §1 and §3. Step 358 is in.
If `git status` shows uncommitted changes, stop and tell me.

The reach dimensions past a wall end read cornerShapes instead of neighborProfiles. In src/elevation/model/dimensions.js: line 10 `import { neighborProfiles } from './neighborProfiles.js';` becomes `import { profileReach } from './cornerParts.js';` (keep it on line 10; no cycle). neighborSegments (lines 85–98) calls profileReach(room, wall, wall.side ?? 'front', settings) instead of neighborProfiles(room, wall, settings); the inBand filter on cabinetTypeId and the mapped record ({ start, end, kind: 'neighbor', wallId, neighborRunId }) stay exactly as they are. Add a one-line doc comment above it: a neighbour run's reach past this face's end, from what cornerShapes draws (SPEC-43.4). Open only lines 1–98 of dimensions.js; nothing else in it changes.

Files (only these):
- src/elevation/model/dimensions.js (771 lines): line 10 and lines 85–98
- src/elevation/model/__tests__/cornerReach.test.js (41): add `import { horizontalChains } from '../dimensions.js';` right after the cornerParts import; append the SPEC §3 describe at the end, VERBATIM
- src/elevation/model/__tests__/__snapshots__/golden.test.js.snap: via -u only, see below

Golden snapshot: run `npx vitest run src/elevation/model/__tests__/golden.test.js` once WITHOUT -u. The only diff must be G5 losing four kind 'neighbor' segments (neighborRunId e9abb5dc-…): the lower inner and outer of two front faces, 30–54 and −24–0. If that's all, run it again with -u. If anything else differs, stop and tell me.

DO NOT change cornerParts.js, wallExtent.js, neighborProfiles.js, model/index.js, elevationDimensions.js, any canvas/component file, or dimensions.test.js (its tests 228 and 229 keep their numbers). DO NOT grep the repo.

First add the test and run `npx vitest run src/elevation/model/__tests__/cornerReach.test.js`: the new test must fail and the 2 from step 358 pass. Iterate on that file. At the end `npm test && npm run lint` once: 940 + 1 = 941, lint 0 errors. Don't run `npm run build`.

At most three lines of summary, including what the snapshot diff was. Commit "elevation-mvp: step 359 Reach dimensions from cornerShapes".
```

---

## Step 360 — `wallExtent` from `cornerParts`

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-43.4.md §1 and §4. Step 359 is in.
If `git status` shows uncommitted changes, stop and tell me.

wallExtent takes in everything cornerShapes draws. In src/elevation/model/wallExtent.js: `import { neighborProfiles } from './neighborProfiles.js';` → `import { cornerParts } from './cornerParts.js';` (sorted above './geometry.js'). Replace the `for (const profileShape of neighborProfiles(…)) { … }` loop (lines 34–40) with a loop over cornerParts(room, wall, wall.side ?? 'front', settings): each part widens left/right by x and x + width, and bottom/top by z and z + height. The doc comment becomes: the bounds of everything drawn in one wall elevation, its neighbours' corner returns and profiles included, bands and all (SPEC-43.4).

Files (only these):
- src/elevation/model/wallExtent.js (43 lines)
- src/elevation/model/__tests__/cornerReach.test.js (~56): add `import { elevationDimensions } from '../elevationDimensions.js';` right after the dimensions.js import and `import { wallExtent } from '../wallExtent.js';` right after the room.js import; append the SPEC §4 describe at the end, VERBATIM (2 tests)

What you need without opening them: cornerParts(room, wall, side, settings) returns the flat list of { id, kind, x, z, width, height, back, front, … } parts of cornerShapes. ElevationCanvas.jsx and elevationDimensions.js already call wallExtent and pick this up.
DO NOT change cornerParts.js, dimensions.js, elevationDimensions.js, neighborProfiles.js, ElevationCanvas.jsx or any canvas/component file, or any existing test (wallExtent.test.js tests 191 and 214 keep their numbers). DO NOT grep the repo.

First add the tests and run `npx vitest run src/elevation/model/__tests__/cornerReach.test.js`: the 2 new tests must fail and the other 3 pass. Iterate on that file. At the end `npm test && npm run lint` once: 941 + 2 = 943, golden snapshot unchanged, lint 0 errors. Don't run `npm run build`.

At most three lines of summary. Commit "elevation-mvp: step 360 The extent takes in what cornerShapes draws".
```

---

## Step 361 — remove `neighborProfiles`

```
Repo: cabinetry_designer, branch feature/elevation-mvp. SPEC: docs/elevation-mvp/SPEC-43.4.md §5. Step 360 is in.
If `git status` shows uncommitted changes, stop and tell me.

neighborProfiles has no callers left. These are all its references:
  src/elevation/model/neighborProfiles.js            (the file)
  src/elevation/model/index.js:189                    export { neighborProfiles } from './neighborProfiles.js';
  src/elevation/model/__tests__/wallExtent.test.js:3  import { neighborProfiles } from '../neighborProfiles.js';
  src/elevation/model/__tests__/wallExtent.test.js    tests 189 (lines 86–116), 190 (118–145), 213 (178–202)

1. `git rm src/elevation/model/neighborProfiles.js`.
2. Delete line 189 of src/elevation/model/index.js. Nothing else in index.js.
3. src/elevation/model/__tests__/wallExtent.test.js (218 lines), by script, in this order:
   a. delete lines 178–203 (test 213 and the blank line after it);
   b. replace lines 86–146 (tests 189 and 190 and the blank line after them) with the SPEC §5 test block, VERBATIM, then one blank line;
   c. line 3 → `import { profileReach } from '../cornerParts.js';`;
   d. line 85 `describe('neighborProfiles and wallExtent', () => {` → `describe('profileReach and wallExtent', () => {`.
   Tests 191 and 214 and the helpers stay exactly as they are; the file ends with 3 tests.

Files (only these): the three above. DO NOT open or change anything else. DO NOT grep the repo except one final `grep -rn neighborProfiles src`, which must print nothing.

Run `npx vitest run src/elevation/model/__tests__/wallExtent.test.js`: 3 pass. At the end `npm test && npm run lint && npm run build` once: 943 − 3 + 1 = 941, golden snapshot unchanged, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 361 Remove neighborProfiles".
```

---

## Running it (Kyle, after 361)

Start the API and designer as in round 42 (361 already built). Check the canvas on G5 (walls 1 and 3) and G2 B, then *Export DXF* on G2 and look at `elevation-A.dxf` and `elevation-B.dxf`, as in the SPEC's end-to-end check.

If anything looks wrong, export the room, keep the zip (its `payload.json` shows what was sent), and bring it back. After 359 send me the snapshot diff summary Codex reports, and after 360 send `git show` so I can review the diff. `git show --stat HEAD` after each step helps me judge whether a prompt sent Codex exploring.
