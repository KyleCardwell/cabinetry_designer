# Round 50 — Codex Prompts, Steps 455–458 (profile lines on doors in the canvas and the DXF; fit checks)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session. Steps 455, 457 and 458 are in **cabinetry_designer**, branch **elevation-doors**. Step 456 is in **cabinetry_designer_geometry**, branch **feature/drawing**. The API doesn't change. No Supabase (plan P18). Round 49 (DXF import) is moved to later.

| Step | Repo | What | Tests after |
|---|---|---|---|
| 455 | cabinetry_designer | Model: `doorProfileOffsets`, `partProfileLines` | 1160 |
| 456 | cabinetry_designer_geometry | `profileLines` drawn on DOOR_DETAILS | 71 |
| 457 | cabinetry_designer | `runDoorDetails` lines + warnings; payload `profileLines` | 1162 |
| 458 | cabinetry_designer | UI: canvas lines; warning messages; too-deep note | 1162 |

Line numbers in each prompt are from **before** that step's edits. **456 must be in before you export a DXF with 457 in** (geometry rejects unknown payload keys).

---

## Before step 455 (Kyle)

The two docs are already in `cabinetry_designer/docs/elevation-mvp/`; commit them:

```bash
cd cabinetry_designer
git status                                   # on elevation-doors, 454 in; only the two docs below are new
git add docs/elevation-mvp/SPEC-50.md docs/elevation-mvp/PROMPTS-50.md
git commit -m "round 50 docs"
```

Step 456 runs in the geometry repo; Codex reads the SPEC from `../cabinetry_designer/docs/elevation-mvp/SPEC-50.md`.

---

## Step 455 — model: doorProfileOffsets, partProfileLines

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-50.md §1 and §2. Step 454 is in (1157 tests).
If `git status` shows uncommitted changes, stop and tell me.

New files only — nothing existing changes.

NEW src/elevation/model/doorProfileLines.js — exactly the SPEC §2 contract:
- imports: DOOR_PROFILE_SLOTS ('./doorStyles.js'); doorProfileSlotKind, sectionProfileBounds ('./sectionProfiles.js'). Local round6 like doorSection.js (-0 → 0); EPS = 1e-6. Every returned number goes through round6.
- doorProfileOffsets(style, design, profiles = []) → { slots, warnings }. No design → { slots: {}, warnings: [] }. For each slot in DOOR_PROFILE_SLOTS order that is in design.slots with a string pick: missing profile or kind !== doorProfileSlotKind(slot) → warnings.push({ code: 'door-profile-missing', slot }), next slot. Else b = sectionProfileBounds(profile); lines = x of each drawnPoints.elevation id that exists in geometry.points, round6, kept when x > EPS (outside, panel) or |x| > EPS (inside, applied), unique, ascending; slots[slot] = { profileId, name, lines, reachIn: max(0, b.maxX), reachOut: max(0, -b.minX) }; then if thickness is finite and some loop has closed === false and b.minY < -thickness - EPS → warnings.push({ code: 'door-profile-too-deep', slot }).
- partProfileLines(offsets, detail, rect) → { lines, warnings }. detail = partDetail's result. inset(r, d) = { x+d, z+d, width-2d, height-2d } round6. Add a rect only if width > EPS, height > EPS, inside rect (each edge within EPS) and not already in lines (same 4 numbers). Order: outside lines on rect; five_piece → per opening: inside, panel, applied lines; slab_applied → per opening: applied lines; anything else → outside only and warnings [].
- Warnings (five_piece / slab_applied): edgeIn = outside reachIn (or 0); frameOut = max(inside reachOut, applied reachOut) (missing = 0). Sides left, right, top, bottom from detail.sizes.stiles / detail.sizes.rails: edgeIn + frameOut > size + EPS → { code: 'door-profile-too-wide', side }. Then if frameOut > 0 and any of detail.sizes.midRails / midStiles has 2*frameOut > width + EPS → one { code: 'door-profile-too-wide', side: 'mid' }. Then inward = max reachIn of inside, panel, applied; if inward > 0 and any opening has 2*inward > min(width, height) + EPS → one { code: 'door-profile-panel-too-small' }.
- doc comments naming SPEC-50 (SPEC §2 gives the wording).

NEW src/elevation/model/__tests__/doorProfileLines.test.js: the SPEC §2 file VERBATIM (3 tests).

Files (only these two).

DO NOT change any existing file. DO NOT grep the repo.

Write the test file first; run `npx vitest run src/elevation/model/__tests__/doorProfileLines.test.js` — it must fail. Iterate on that file only. At the end `npm test && npm run lint` once: 1157 + 3 = 1160, golden snapshot unchanged, lint 0 errors. If a number still differs, report what you got instead of changing the test.

At most three lines of summary. Commit "elevation-mvp: step 455 Door profile offsets and part lines".
```

---

## Step 456 — geometry: profileLines on a door detail

```
Repo: cabinetry_designer_geometry, branch feature/drawing. SPEC: ../cabinetry_designer/docs/elevation-mvp/SPEC-50.md §1 and §3. Step 421 is in (69 tests).
If `git status` shows uncommitted changes, stop and tell me.

Exactly SPEC §3:
1. src/drawing/models.py (203 lines): PayloadDoorDetail (~97–106) gets `profileLines: list[PayloadHole] = []` after `openings`; docstring per SPEC §3.
2. src/drawing/elevation_dxf.py (214 lines): in detail_shapes (~162–173), `lines=_opening_lines([*detail.openings, *detail.profileLines])` and the filter `if detail.openings or detail.profileLines`; _opening_lines' docstring per SPEC §3. Nothing else.
3. tests/test_door_details.py (126 lines): append the SPEC §3 block VERBATIM (PROFILE_LINES + 2 tests).
4. README.md: run `grep -n "doorDetails" README.md` and add one line there saying a detail may also carry `profileLines` (rectangles from door profiles, SPEC-50), drawn on DOOR_DETAILS like openings.

Files (only these four).

DO NOT change the HLR, the DXF writer, layers, tags or any other test. Apart from the one README grep, DO NOT grep the repo.

Run `python -m pytest tests/test_door_details.py` while iterating; at the end the full `python -m pytest` once: 69 + 2 = 71 passed. If a line count differs but the length is right, report it instead of changing the test.

At most three lines of summary. Commit "round 50: step 456 Profile lines in the elevation DXF".
```

---

## Step 457 — designer: lines and profile warnings on each part; profileLines in the payload

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-50.md §1 and §4. Step 455 is in (1160 tests).
If `git status` shows uncommitted changes, stop and tell me.

Exactly SPEC §4:
1. src/elevation/model/doorDetails.js (120 lines): import { doorProfileOffsets, partProfileLines } from './doorProfileLines.js'. In runDoorDetails (line 54) before addPart: `const profiles = settings?.sectionProfiles ?? [];` and `const offsetsByStyle = new Map();`. In addPart after `const detail = …` (line 62): offsets = cached doorProfileOffsets(style, design, profiles) per style object; fit = partProfileLines(offsets, detail, rect); the pushed part gets `lines: fit.lines` right after `openings`; warnings pushed in this order, each spread with pieceId and key: resolved.warnings, offsets.warnings, fit.warnings. Update runDoorDetails' doc per SPEC §4. partDetail and the rest stay.
2. src/elevation/model/elevationDoorDetails.js (33 lines): after the entry.openings block, `if (details && part.lines.length) entry.profileLines = part.lines.map(({ x, z, width, height }) => ({ x, z, width, height }));`; push condition `entry.openings || entry.profileLines || tags`; doc per SPEC §4.
3. src/elevation/model/__tests__/runDoorDetails.test.js (125 lines): add `lines: [],` after `openings: [box(33.0625, 7.125, 17.875, 24.125)],` (first test, ~line 61) and after `openings: [box(3.75, 39, 64.5, 35.25)],` (back panel test, ~line 108). Then append the SPEC §4 runDoorDetails block VERBATIM (1 test).
4. src/elevation/model/__tests__/elevationDoorDetails.test.js (102 lines): append the SPEC §4 elevationDoorDetails block VERBATIM (1 test).

Files (only these four).

DO NOT change partDetail, doorSizes.js, doorStyleResolve.js, drawingPayload.js, the golden fixture or snapshot, or any other test. DO NOT grep the repo.

While iterating run only `npx vitest run src/elevation/model/__tests__/runDoorDetails.test.js src/elevation/model/__tests__/elevationDoorDetails.test.js`. At the end `npm test && npm run lint` once: 1160 + 2 = 1162, golden snapshot unchanged, lint 0 errors. If a number still differs, report what you got instead of changing the test.

At most three lines of summary. Commit "elevation-mvp: step 457 Door profile lines in run details and the payload".
```

---

## Step 458 — UI: canvas lines; warning messages; too-deep note

```
Repo: cabinetry_designer, branch elevation-doors. SPEC: docs/elevation-mvp/SPEC-50.md §1 and §5. Step 457 is in (1162 tests).
If `git status` shows uncommitted changes, stop and tell me.

UI only, no new tests. Exactly SPEC §5:
1. src/elevation/components/DoorDetails.jsx (49 lines): right after the `showDetails && part.openings.map(…)` block (lines 13–26), add `showDetails && part.lines.map(…)` the same way (wallRectToScreen, skip under 2 px), key `line-${index}`, stroke "#64748b", strokeWidth 0.75, fillEnabled false, listening false.
2. src/elevation/components/properties/FaceProperties.jsx (378 lines): add the four SPEC §5 messages to WARNING_MESSAGES (lines 38–44): 'door-profile-missing', 'door-profile-too-deep', 'door-profile-too-wide', 'door-profile-panel-too-small'. Nothing else.
3. src/elevation/components/DoorSectionView.jsx (109 lines): import doorProfileOffsets from '../model/doorProfileLines.js'; next to `const section = …` add `const deep = doorProfileOffsets(style, design, profiles).warnings.filter(({ code }) => code === 'door-profile-too-deep').map(({ slot }) => SLOT_LABELS[slot]);`; after the skipped note, when deep.length: <p className="text-xs text-amber-300">Cuts deeper than the door is thick: {deep.join(', ')}.</p>

Files (only these three).

DO NOT change the model, RunGroup.jsx, the store or the DXF. DO NOT grep the repo.

At the end `npm test && npm run lint && npm run build` once: still 1162 tests, lint 0 errors, build succeeds.

At most three lines of summary. Commit "elevation-mvp: step 458 Door profile lines on the canvas and fit warnings".
```

---

## Running it (Kyle, after 458)

Restart geometry (456) before exporting. Then follow SPEC-50's end-to-end check: make the round-over and step profiles **with drawn points ticked**, pick them on Team door style, and look at the room canvas (lines 1/4" in from each door edge and 1/4" out from each frame opening), a short drawer front, a slab front, a Slab AM style, the fit warnings (3/4" thickness, a 3/8" stile override, a big raised panel on a short drawer, a pick whose kind you changed), and the elevation DXF's DOOR_DETAILS layer. Send `git show` after 455 if you want the model reviewed.
