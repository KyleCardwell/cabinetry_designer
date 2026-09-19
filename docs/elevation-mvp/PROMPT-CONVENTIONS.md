# Elevation Lab — Prompt conventions

How every `PROMPTS-N.md` in this folder is written, and what to do before running one.

Steps 32 and 33 produced the least code of the eight steps before them — 235 and 382 insertions against step 30's 1,050 — and cost the most agent usage by a wide margin. The tokens went into *reading and looping*, not writing. That is the failure this file exists to prevent. Everything below is aimed at one thing: **the agent should never have to discover what it could have been told.**

Each `PROMPTS-N.md` opens with:

> Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session.

---

## Why cost grows even when prompts don't

The repo is 18,800 lines of source plus 5,200 lines of tests across 24 test files. The four largest files are the ones most steps have to touch:

| File | Lines | Rough read cost |
|---|---:|---:|
| `components/PropertiesPanel.jsx` | 1,642 | ~20k tokens |
| `plan/PlanCanvas.jsx` | 1,068 | ~13k |
| `store/elevationSlice.js` | 887 | ~11k |
| `components/ElevationCanvas.jsx` | 793 | ~10k |
| `store/__tests__/elevationSlice.test.js` | 757 | ~9k |

An agent in an edit-test-fix loop reads each touched file three or four times. A step that touches PropertiesPanel and one canvas therefore starts at roughly 100k tokens of reading before it writes a line — and that figure grows every round, for the same prompt. Prompt length is not the variable. **Files touched × times re-read × file size** is the variable.

---

## Rules for writing a step prompt

**1. Name the files.** Every step opens with the exact list of files it will touch, source and tests, with line counts. No "grep and find the call sites."

**2. Paste the fan-out, don't ask for it.** If a step changes a widely-referenced symbol, run the commands below, paste the output into the prompt, and say what to do with each site. "Grep for X and decide each site deliberately" is an instruction to explore the four biggest files in the repo — that one line was most of step 32.

**3. Literal fixtures, never derivable ones.** Give coordinates, not conditions. SPEC-9 test 5 said *"Room O is the same with B rotated so `cornerAt(O, A, 'right').type === 'outside'`"* — which makes the agent reverse-engineer `wallFrame` → `chainOrientation` → `wallComponents` by trial and error, and a wrong guess fails eight tests with a message that doesn't say why. Write `B (120,0)→(120,−96)` instead. Same for expected widths, reserves and positions: state the number, never the formula that yields it.

**4. A shape change is its own step.** Adding a field to `selection`, `run.anchors` or an `Item`, or renaming anything load-bearing, lands as a standalone step that leaves the suite green and changes no behavior. The behavior that rides on it goes in the next step. A shape change plus new behavior in one step means every test failure is ambiguous, and ambiguity is what makes an agent re-read everything.

**5. Say what NOT to touch.** List the call sites that deliberately stay as they are and why, in the prompt, not just the spec. Otherwise the agent investigates each one to satisfy itself.

**6. Scope the test loop.** Spell it out:

> While iterating, run only `npx vitest run <the one test file>`. Run `npm test && npm run build && npm run lint` once, at the end.

The full gate after every fix attempt is three commands, 24 test files and a Vite build per cycle.

**7. Cap the summary.** "Say which you switched and which you left" asks for a 44-line inventory. Ask for at most five lines: what changed, what surprised you, what you left undone.

**8. Budget the step.** If the named file list exceeds ~2,500 lines, or the fan-out exceeds ~15 sites, split it. Two cheap steps beat one that loops.

---

## Commands to run before writing a prompt

Replace `SYMBOL` with what the step changes — `activeWallId`, `cornerReserve`, `splitRun`, `selection.`, and so on. All verified against this repo.

**How many sites, and is this one step or two?**

```bash
grep -rn "SYMBOL" src --include=*.js --include=*.jsx | wc -l
```

**Which files, ranked by how entangled they are** (source only — tests are counted separately below):

```bash
grep -rc "SYMBOL" src --include=*.js --include=*.jsx \
  | grep -v ":0$" | grep -v "__tests__" | sort -t: -k2 -rn
```

**Every site with line numbers — this is the block to paste into the prompt:**

```bash
grep -rn "SYMBOL" src --include=*.js --include=*.jsx | grep -v "__tests__"
```

**Which test files the change will break:**

```bash
grep -rl "SYMBOL" src --include=*.js | grep "__tests__"
```

**What the step will cost to read** — the single most useful number. Over ~2,500 total, split the step:

```bash
grep -rl "SYMBOL" src --include=*.js --include=*.jsx | xargs wc -l | sort -rn
```

**The files that make any step expensive**, for deciding whether a step is affordable at all:

```bash
find src \( -name "*.js" -o -name "*.jsx" \) | xargs wc -l | sort -rn | sed -n 2,9p
```

**After the fact — what the step actually cost in output**, to compare against how much usage it burned. A small diff with big usage means the agent was looping, not writing:

```bash
git show --stat --format="%h %s" HEAD | tail -3
```

---

## How a fan-out appears in a prompt

Not this:

> Grep for activeWallId and decide each site deliberately; say which you switched and which you left.

This:

> `activeWallId` has 44 references. Switch these 6 to `selection.wallId`:
>
> ```
> src/elevation/plan/PlanWallShape.jsx:31
> src/elevation/components/PropertiesPanel.jsx:1531,1540
> ...
> ```
>
> Leave every other reference alone — they are draw-time lookups (`ElevationCanvas`, `RoomPicker`, `WallList`) and the cursor must not change. Do not open files outside this list.

---

## Before you run a step

- One step per session, always. Chaining two means the second starts with the first still in context and re-sends it on every tool call.
- Commit first, so `git status` is clean and a bad run is one `git reset --hard` away.
- Read the step's file list. If it names PropertiesPanel plus a canvas, expect it to be expensive and consider running it alone at the start of a window.
- Afterwards, run the `git show --stat` command above. Insertions far below ~400 on a step that felt expensive means something in the prompt sent it exploring — say so, and the next round gets that instruction removed.

---

## Standing structural cost

`PropertiesPanel.jsx` at 1,642 lines is now the single largest tax on every round — nearly every step touches it, and it is re-read several times per step. Splitting it into per-selection sections (`RunSection`, `PieceSection`, `OpeningSection`, `WallSection`, `SettingsSection`) under `components/properties/` would cut the per-step read cost more than any prompt wording will. Logged in `TODO.md`.
