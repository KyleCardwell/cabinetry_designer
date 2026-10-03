# Elevation Lab — Codex Prompt, Step 249 (round 36.3.3: each end of the wall gets its own chain)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Commit pending work first, including these docs (`CELLS-PLAN.md`, `SPEC-36.3.3.md`, this file).

| Step | What | Tests after |
|---|---|---|
| 249 | Model: a chain takes only runs from its half of the wall, and the soffit nearest its edge | 741 |

**Branch:** `elevation-grid-run-split`. The baseline after step 248 is **739**. Confirm it with `npm test`; if it differs, shift the count.

**Line numbers** are against `f88ac14` (step 248).

Copy the code blocks exactly.

---
## Step 249 — each end's own chain

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-36.3.3.md. Step 248 is in.
If `git status` shows uncommitted changes, stop and tell me.

Bug: on a wall with an alcove at each end (a base under the left soffit, nothing under the right), the right vertical chain shows the left base and the left soffit.
- pickColumnPair: with nothing selected, each chain only takes runs reaching into its half of the wall.
- columnSoffit: with no soffit over the chain's runs, take the soffit nearest the chain's edge (lowest on a tie). soffitBreak gains an `edge` argument, passed from stackChain and verticalChains.

Copy the SPEC's code and test VERBATIM. Don't rewrite them, and don't mock anything in the new test.

Files (only these):
- src/elevation/model/dimensions.js (634) — the end of pickColumnPair (from `const edgeRun` at 432); columnSoffit and the first two lines of soffitBreak; the soffitBreak calls in stackChain (524) and verticalChains (607). Nothing else.
- src/elevation/model/__tests__/alcoves.test.js — NEW, verbatim (2 tests).

DO NOT touch any component, the store, or any other file. DO NOT grep the repo or open other files.

First add the test file and run it: both tests must fail. Then change the code. While iterating, run only `npx vitest run src/elevation/model/__tests__/alcoves.test.js src/elevation/model/__tests__/soffitChain.test.js src/elevation/model/__tests__/dimensions.test.js src/elevation/model/__tests__/stacks.test.js`. At the end, run `npm test && npm run lint` once: 739 + 2 = 741. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 249 each end of the wall gets its own chain".
```

**Check after 249 (by hand):**

1. **Your two alcoves.** Left chain: toe kick | box | countertop | open to the left soffit | soffit. Right chain: floor to the right soffit's bottom | soffit, with no cabinets and no counter height.
2. **Select the left base.** Nothing changes on the right chain.
3. **One run across the whole wall.** Both chains show it, as before.
4. **Runs at both ends.** Each chain shows its own end's runs, as before.
