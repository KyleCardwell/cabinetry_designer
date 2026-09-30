# Elevation Lab — Codex Prompt, Step 248 (round 36.3.2: the soffit on the vertical chain)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Commit pending work first, including these docs (`CELLS-PLAN.md`, `SPEC-36.3.2.md`, this file).

| Step | What | Tests after |
|---|---|---|
| 248 | Model: the chain stops at a soffit's bottom; the counter height row's colour | 739 |

**Branch:** `elevation-grid-run-split`. The baseline after step 247 is **736**. Confirm it with `npm test`; if it differs, shift the count.

**Line numbers** are against `01c2b71` (step 247).

Copy the code blocks exactly. Step 244 wrote its own soffit code instead of the SPEC's and swapped the SPEC's test for a mocked one, and that's how this bug got in.

---
## Step 248 — the soffit on the vertical chain

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-36.3.2.md. Step 247 is in.
If `git status` shows uncommitted changes, stop and tell me.

Bug: with a base and a soffit, the vertical chain runs to the ceiling instead of the soffit's bottom. Step 244's columnSoffit called soffitsOn(room, wall) (it takes (wall, side), so it never finds a soffit) and read soffit.z (the field is soffit.bottom). Also a rule change: with no soffit over the column's runs, use the lowest soffit on that side of the wall.

Copy the SPEC's code and test VERBATIM. Don't rewrite them, and don't mock anything in the new test: it has to build real rooms.

Files (only these):
- src/elevation/model/dimensions.js (624) — replace columnSoffit and soffitBreak (483–493) with the SPEC block; the two lines at the end of stackChain (516–517) and the two at the end of verticalChains (598–599) with the SPEC's three lines each. Nothing else.
- src/elevation/components/DimensionRow.jsx — the soffit and counter-height colours in KIND_COLORS (25–26). Nothing else.
- src/elevation/model/__tests__/soffitChain.test.js — NEW, verbatim (3 tests).

DO NOT touch counterHeight.test.js, the store, or any other file. DO NOT grep the repo or open other files.

First add the test file and run it: the soffit test must fail. Then make the code change. While iterating, run only `npx vitest run src/elevation/model/__tests__/soffitChain.test.js src/elevation/model/__tests__/dimensions.test.js src/elevation/model/__tests__/stacks.test.js src/elevation/model/__tests__/tops.test.js src/elevation/model/__tests__/frameParts.test.js`. At the end, run `npm test && npm run lint` once: 736 + 3 = 739. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 248 vertical chain stops at the soffit".
```

**Check after 248 (by hand):**

1. **Base and a soffit over it.** The chain at the wall's edge reads … countertop | open to the soffit's bottom | soffit to the ceiling.
2. **Base and a soffit elsewhere on the wall.** Same, to that soffit's bottom.
3. **Two soffits, one over the base.** The chain uses the one over the base, even if the other is lower.
4. **A soffit and no cabinets.** Floor to the soffit's bottom, then the soffit.
5. **No soffit.** Open to the ceiling, as before.
6. **Counter height.** The floor-to-counter dimension is light blue.
