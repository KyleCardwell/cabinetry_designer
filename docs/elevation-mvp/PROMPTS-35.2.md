# Elevation Lab — Codex Prompts, Steps 204–205 (round 35.2: end panels, fillers and the parts below a run)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session, and commit pending work first, including these docs.

| Step | What | Tests after |
|---|---|---|
| 204 | Model: chip detail, filler "return up", where a part below stops | 671 |
| 205 | On screen: part spans, chip lines, notes in the panel | 671 |

**Branch:** `elevation-grid-run-split`. **Run 201–203 first.** Baseline is then **669**. Confirm with `npm test`; if it differs, shift the counts.

**Line numbers** are against `5d6bd3a`, with the step-199 file sizes; find functions by name where earlier steps have moved things.

If a new test fails by a small amount, compare the SPEC's arithmetic with the code before changing the code, and say which was wrong. If an EXISTING test outside the named files breaks, stop and tell me rather than editing it.

---
## Step 204 — Model

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-35.2.md §1 and §2. Steps 201–203 are in.
If `git status` shows uncommitted changes, stop and tell me.

Pure model step. endPieceBottom(run, style, settings) → { drop, chip }: drop is today's panelDrop; chip is the flush reveal (1/8") when the doors stop flush above a part below (Euro only). endPieceNotes(kind, bottom) → "chip detail bottom 1/8"" and, for fillers that drop, "return up {drop}". bottomPartSpan(run, pieces, band, underEndPanels) → where a part below starts/ends: inside the run's end panels unless underEndPanels, always under fillers.

Files (only these):
- src/elevation/model/styles.js (216) — import formatInches from ./units.js; endPieceBottom and endPieceNotes right after panelDrop, verbatim. Nothing else.
- src/elevation/model/bottoms.js (75) — append bottomPartSpan, verbatim.
- src/elevation/model/index.js — bottomPartSpan in the bottoms block; endPieceBottom, endPieceNotes in the styles block.
- src/elevation/model/__tests__/bottoms.test.js — the imports; describe('SPEC-35.2 end panels and fillers over parts below') at the end, verbatim (2 tests).

DO NOT change panelDrop or belowRunReveal. DO NOT touch any component. DO NOT grep the repo or open other files.

While iterating, run only `npx vitest run src/elevation/model/__tests__/bottoms.test.js src/elevation/model/__tests__/styles.test.js`. At the end `npm test && npm run lint` once: 669 + 2 = 671. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 204 end pieces over parts below in the model".
```

---
## Step 205 — On screen

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-35.2.md §3. Step 204 is in.
If `git status` shows uncommitted changes, stop and tell me.

RunGroup takes the drop from endPieceBottom, draws parts below from bottomPartSpan (inside end panels unless the doors stop flush above the part; always under fillers), and draws a dashed chip line 1/8" up across end panels and fillers when there's a chip. The piece panel shows the notes ("chip detail bottom 1/8"", "return up 1/8"") for end pieces and interior fillers.

Files (only these; find the spots by name):
- src/elevation/components/RunGroup.jsx — imports (styles, bottoms, wallToScreen from ../canvas/transform.js); `const drop = panelDrop(…)` → endBottom; bottomParts → partSpan + bottomParts + chipLines; the chip Lines right after the drawnPieces.map block. Verbatim from SPEC §3. Nothing else.
- src/elevation/components/properties/PieceProperties.jsx (127) — imports; endNotes/notesLine after partNumberField; {notesLine} after {partNumberField} in the end-piece and interior-filler branches.

Match the classes already used in these files. DO NOT touch the model. DO NOT grep the repo or open other files.

No new tests. At the end `npm test && npm run lint` once: still 671. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 205 end pieces over parts below on screen".
```

**Check after 205 (by hand):** an upper with end panel left, filler right, and a 1 1/2" light rail below.

1. **Cover:** doors hang to the bottom of the rail. The end panel drops with them and the rail stops inside it. The filler's face drops too, the rail runs under it, and the filler notes "return up 1 5/8"".
2. **Visible:** doors at the usual −1/8". The end panel drops 1/8" and the rail stops inside it. The filler drops 1/8" ("return up 1/8"") and the rail runs under it.
3. **Flush:** doors stop 1/8" above the rail. The end panel and filler are box height, sit on the rail with a dashed chip line 1/8" up, and note "chip detail bottom 1/8"". The rail runs under both.
4. With no parts below: the upper's filler still notes "return up 1/8"".
