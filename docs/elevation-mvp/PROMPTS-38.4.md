# Elevation Lab — Codex Prompt, Step 286.1 (round 38.4: a joined end that dies into a deeper run)

Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run it in a fresh session. Commit pending work first, including these docs (`SPEC-38.4.md`, this file).

| Step | What | Tests after |
|---|---|---|
| 286.1 | A None end joined to a deeper run, or covered by a mitered wall end panel, gets a 1 3/4" stile | 847 |

**Branch:** `elevation-grid-run-split`. The baseline after step 286 is **844**. Confirm it with `npm test`; if it differs, shift the counts.

The SPEC's code was run in a scratch copy of `fcfae28` before this was written: 847 passing, lint clean. If a test fails, the code was copied wrong; compare it with the SPEC before changing any expectation.

---

## Step 286.1 — A joined end that dies into a deeper run

```
Repo: cabinetry_designer, branch elevation-grid-run-split. SPEC: docs/elevation-mvp/SPEC-38.4.md. Step 286 is in.
If `git status` shows uncommitted changes, stop and tell me.

In a face frame run, a None end that dies into a deeper joined run (or a leader's extended end panel) is treated like a free end: the stile's 3/4" overhang goes in the end gap with the bead, so the stile reads 1 3/4" (today it reads 1"). A None end beside a mitered wall end panel gets only the bead gap, so its stile is panel + bead + 3/4 = 1 3/4" (today the overhang is wrongly added too). A joined end beside a run of the same depth keeps the bead-only gap (1" stile, as now).

How: joints.js gets a strict-depth option on endIsCovered and a new export deeperJoinedSides(wall); room.js gets withDieIns(wall), which stores `_frame.dieIn: { left, right }` on face frame runs, and syncRoom runs it and the withWallPanels pass (moved up from the end of syncRoom) just before the syncAutoItems pass; splitRun.js's endGaps reads `_frame.dieIn` and `_frame.wallPanels[side].join`.

Write the code as the SPEC gives it. Add faceFrameDieIn.test.js VERBATIM. Update the frameEnds.test.js expectations exactly as SPEC §2 gives them (step 284 had set them to the regression's numbers).

Files (only these):
- src/elevation/model/joints.js (281): endIsCovered (≈ 114–141) and a new export right after jointEndTypes (≈ 144–155)
- src/elevation/model/room.js (1792): the ./joints.js import list (≈ 18–30), a new withDieIns directly above withWallPanels' doc comment (≈ 635), and syncRoom's last three passes (≈ 755–800). Read nothing else in room.js.
- src/elevation/model/splitRun.js (632): endGaps (≈ 36–56) only
- src/elevation/model/__tests__/frameEnds.test.js: the three expectations SPEC §2 lists
- NEW src/elevation/model/__tests__/faceFrameDieIn.test.js

DO NOT touch frames.js (its SPEC-38.3 run-end logic already handles the new gaps), jointEndTypes, setRunEnd or any component. DO NOT grep the repo or open other files.

First add the new test file and run it: 2 of its 3 tests must fail (the "only as deep" test passes before and after). Then change the code. While iterating, run only `npx vitest run src/elevation/model/__tests__/faceFrameDieIn.test.js src/elevation/model/__tests__/frameEnds.test.js`. At the end, run `npm test && npm run lint` once: 844 + 3 = 847. Don't run `npm run build`.

At most five lines of summary. Commit "elevation-mvp: step 286.1 Joined ends die into deeper runs".
```

**Check after 286.1 (by hand):** in G2, set the base's left end back to **None** (it was forced to End panel). The base's and the upper's left stiles beside the tall read 1 3/4, with no end panel there; base openings 32 1/2 × 2 (boxes 34, filler 15/16), upper openings 29 × 3 (boxes 30 1/2, filler 1 3/4). Make the tall 24" deep: the base's left stile drops to 1" plus its share of the leftover (1 3/8). Put it back to 25".

**Then:** Kyle exports `golden.json` and starts round 39 (`PROMPTS-39.md`, step 287). Every test count in round 39 is 3 higher (baseline 847), and `room.js` is 27 lines longer (SPEC-38.4 §3).
